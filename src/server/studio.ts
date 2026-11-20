import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { exportsTable, media, messages, savedScenes, versions, videos } from "@/db/schema";
import {
  ASPECTS,
  LENGTH_PRESETS,
  MAX_LENGTH_SECONDS,
  QUALITIES,
  fileIds,
  newSceneId,
  nextVersionNumber,
  pronounce,
  sceneSchema,
  type Aspect,
  type Draft,
  type Quality,
} from "@/lib/video";
import { editDraft, generateDraft, synthesize } from "./ai";
import { getKit } from "./kits";
import { storeFile } from "./storage";
import { getSettings, Forbidden, NotFound, type Member } from "./users";
import { insertVideo, parseDraft, parseKit, requireVideo, videoView } from "./videos";

export const generateInput = z
  .object({
    prompt: z.string().trim().min(1, "Describe the video").max(4000),
    kitId: z.string().nullable(),
    quality: z.enum(QUALITIES),
    lengthSeconds: z.number().int().min(5).max(MAX_LENGTH_SECONDS),
    aspect: z.enum(ASPECTS),
    mediaIds: z.array(z.string()).max(20),
    projectId: z.string().nullable().optional(),
  })
  .strict();
export const chatInput = z
  .object({ videoId: z.string(), text: z.string().trim().min(1).max(2000), sceneId: z.string().nullable() })
  .strict();
export const rateInput = z
  .object({
    messageId: z.string(),
    rating: z.enum(["up", "down"]),
    feedback: z.string().trim().max(2000).optional(),
    retry: z.boolean().optional(),
  })
  .strict();

export { LENGTH_PRESETS };

async function addVersion(videoId: string, draft: Draft) {
  const existing = await db.select({ number: versions.number }).from(versions).where(eq(versions.videoId, videoId));
  const number = nextVersionNumber(existing.map((v) => v.number));
  await db.insert(versions).values({ id: crypto.randomUUID(), videoId, number, draft: JSON.stringify(draft) });
  return number;
}

/** Snapshots the kit into a new video, asks the agent for a draft and saves it as V1. */
export async function generateVideo(member: Member, input: z.infer<typeof generateInput>) {
  const kit = input.kitId ? await getKit(member, input.kitId) : null;
  const attachments = input.mediaIds.length
    ? await db
        .select({ id: media.id, name: media.name, contentType: media.contentType })
        .from(media)
        .where(
          and(
            eq(media.orgId, member.orgId),
            eq(media.ownerId, member.id),
            eq(media.purpose, "library"),
            inArray(media.id, input.mediaIds),
          ),
        )
    : [];
  const result = await generateDraft({
    prompt: input.prompt,
    kit,
    lengthSeconds: input.lengthSeconds,
    aspect: input.aspect as Aspect,
    quality: input.quality,
    attachments,
  });
  const id = await insertVideo(member, {
    title: result.title,
    prompt: input.prompt,
    aspect: input.aspect as Aspect,
    quality: input.quality,
    lengthSeconds: input.lengthSeconds,
    kit,
    draft: result.draft,
    projectId: input.projectId,
  });
  const number = await addVersion(id, result.draft);
  await db.batch([
    db.insert(messages).values({ id: crypto.randomUUID(), videoId: id, userId: member.id, role: "user", body: input.prompt }),
    db.insert(messages).values({
      id: crypto.randomUUID(),
      videoId: id,
      userId: member.id,
      role: "assistant",
      body: `First draft: ${result.draft.scenes.length} scenes.`,
      versionNumber: number,
    }),
  ]);
  return { id };
}

export async function listMessages(member: Member, videoId: string) {
  await requireVideo(member, videoId);
  return db
    .select({
      id: messages.id,
      role: messages.role,
      body: messages.body,
      sceneId: messages.sceneId,
      versionNumber: messages.versionNumber,
      rating: messages.rating,
      feedback: messages.feedback,
    })
    .from(messages)
    .where(eq(messages.videoId, videoId))
    .orderBy(messages.createdAt, sql`rowid`);
}

async function applyEdit(member: Member, videoId: string, request: string, sceneId: string | null) {
  const video = await requireVideo(member, videoId);
  const draft = parseDraft(video.draft);
  const result = await editDraft({
    draft,
    title: video.title,
    request,
    scene: draft.scenes.find((s) => s.id === sceneId) ?? null,
    kit: parseKit(video.kit),
    quality: video.quality as Quality,
  });
  // Files only move between scenes the agent kept; it can't name new ones.
  const known = fileIds(draft);
  for (const scene of result.draft.scenes) {
    if (scene.mediaId && !known.has(scene.mediaId) && !parseKit(video.kit)?.assets.some((a) => a.id === scene.mediaId)) {
      scene.mediaId = null;
      scene.mediaType = null;
    }
  }
  const number = await addVersion(videoId, result.draft);
  await db.batch([
    db
      .update(videos)
      .set({
        draft: JSON.stringify(result.draft),
        title: result.title,
        revision: sql`${videos.revision} + 1`,
        lengthSeconds: Math.round(result.draft.scenes.reduce((s, x) => s + x.duration, 0)),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(videos.id, videoId)),
    db.insert(messages).values({
      id: crypto.randomUUID(),
      videoId,
      userId: member.id,
      role: "assistant",
      body: result.reply,
      versionNumber: number,
    }),
  ]);
  return { versionNumber: number };
}

export async function chat(member: Member, input: z.infer<typeof chatInput>) {
  await requireVideo(member, input.videoId);
  await db.insert(messages).values({
    id: crypto.randomUUID(),
    videoId: input.videoId,
    userId: member.id,
    role: "user",
    body: input.text,
    sceneId: input.sceneId,
  });
  return applyEdit(member, input.videoId, input.text, input.sceneId);
}

/** Rates a generation; a down rating with `retry` asks the agent for another pass with the feedback. */
export async function rate(member: Member, input: z.infer<typeof rateInput>) {
  const [message] = await db.select().from(messages).where(eq(messages.id, input.messageId));
  if (!message || message.role !== "assistant" || message.versionNumber == null) throw new NotFound("No such message");
  await requireVideo(member, message.videoId);
  await db
    .update(messages)
    .set({ rating: input.rating, feedback: input.rating === "down" ? (input.feedback ?? null) : null })
    .where(eq(messages.id, message.id));
  if (input.rating === "down" && input.retry) {
    const request = `The last change wasn't right.${input.feedback ? ` What could be better: ${input.feedback}` : ""} Try again.`;
    await db.insert(messages).values({
      id: crypto.randomUUID(),
      videoId: message.videoId,
      userId: member.id,
      role: "user",
      body: input.feedback || "Try again",
    });
    return applyEdit(member, message.videoId, request, null);
  }
  return { versionNumber: null };
}

/** Synthesises one scene's voiceover from its script, stores it and puts it on the scene. */
export async function voiceover(member: Member, input: { videoId: string; sceneId: string }) {
  const video = await requireVideo(member, input.videoId);
  const draft = parseDraft(video.draft);
  const scene = draft.scenes.find((s) => s.id === input.sceneId);
  if (!scene) throw new NotFound("No scene with that id");
  if (!scene.script.trim()) throw new Forbidden("Write a voiceover script first.");
  if (!scene.voiceoverId && fileIds(draft).size >= 128) {
    throw new Forbidden("A video can use at most 128 files. Remove one to add another.");
  }
  const audio = await synthesize(pronounce(scene.script, parseKit(video.kit)), scene.voice);
  const row = await storeFile(
    member,
    { body: audio, contentType: "audio/mpeg", size: audio.byteLength, name: `voiceover-${scene.id}.mp3` },
    { purpose: "voiceover", videoId: video.id },
  );
  // Read again just before writing, so edits saved meanwhile stay.
  const fresh = await requireVideo(member, input.videoId);
  const latest = parseDraft(fresh.draft);
  const target = latest.scenes.find((s) => s.id === input.sceneId);
  if (!target) throw new NotFound("No scene with that id");
  target.voiceoverId = row.id;
  target.voiceoverScript = scene.script;
  const [updated] = await db
    .update(videos)
    .set({ draft: JSON.stringify(latest), revision: sql`${videos.revision} + 1`, updatedAt: new Date().toISOString() })
    .where(eq(videos.id, video.id))
    .returning({ revision: videos.revision });
  return { voiceoverId: row.id, script: scene.script, revision: updated!.revision };
}

// Publishing and share links.

export const publishInput = z.object({ id: z.string(), shareMode: z.enum(["public", "private"]).optional() }).strict();
export const shareSettingsInput = z
  .object({
    id: z.string(),
    shareMode: z.enum(["public", "private"]).optional(),
    previewTime: z.number().min(0).max(MAX_LENGTH_SECONDS).nullable().optional(),
    previewMediaId: z.string().nullable().optional(),
  })
  .strict();

/** Freezes the current draft as what the share link plays. */
export async function publish(member: Member, input: z.infer<typeof publishInput>) {
  const video = await requireVideo(member, input.id);
  const snapshot = {
    title: video.title,
    aspect: video.aspect,
    draft: parseDraft(video.draft),
    kit: parseKit(video.kit),
    publishedAt: new Date().toISOString(),
  };
  await db
    .update(videos)
    .set({
      published: JSON.stringify(snapshot),
      publishedRevision: video.revision,
      ...(input.shareMode ? { shareMode: input.shareMode } : {}),
    })
    .where(eq(videos.id, video.id));
  return videoView((await requireVideo(member, input.id)));
}

export async function updateShare(member: Member, input: z.infer<typeof shareSettingsInput>) {
  const video = await requireVideo(member, input.id);
  if (input.previewMediaId) {
    const [row] = await db
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.id, input.previewMediaId), eq(media.videoId, video.id), eq(media.purpose, "preview")));
    if (!row) throw new NotFound("No such preview image");
  }
  await db
    .update(videos)
    .set({
      ...(input.shareMode ? { shareMode: input.shareMode } : {}),
      ...(input.previewTime !== undefined ? { previewTime: input.previewTime } : {}),
      ...(input.previewMediaId !== undefined ? { previewMediaId: input.previewMediaId } : {}),
    })
    .where(eq(videos.id, video.id));
  return videoView(await requireVideo(member, input.id));
}

export type Published = {
  title: string;
  aspect: Aspect;
  draft: Draft;
  kit: ReturnType<typeof parseKit>;
  publishedAt: string;
};

/**
 * What a share link shows: the published snapshot, to anyone when the video is
 * public, else only to members who can see the video. Null is "not found".
 */
export async function sharedVideo(viewer: Member | null, id: string) {
  const [row] = await db.select().from(videos).where(eq(videos.id, id));
  if (!row || !row.published) return null;
  if (row.shareMode !== "public") {
    if (!viewer) return null;
    const visible = await requireVideo(viewer, id).catch(() => null);
    if (!visible) return null;
  }
  const published = JSON.parse(row.published) as Published;
  return { id: row.id, previewMediaId: row.previewMediaId, ...published };
}

/** The ids a share link may serve: files the published snapshot uses, and the preview image. */
export function sharedFileIds(shared: NonNullable<Awaited<ReturnType<typeof sharedVideo>>>): Set<string> {
  const ids = fileIds(shared.draft);
  for (const asset of shared.kit?.assets ?? []) ids.add(asset.id);
  if (shared.previewMediaId) ids.add(shared.previewMediaId);
  return ids;
}

// Saved scenes.

export const saveSceneInput = z
  .object({ videoId: z.string(), sceneId: z.string(), name: z.string().trim().min(1, "Name is required").max(80) })
  .strict();
export const renameSceneInput = z.object({ id: z.string(), name: z.string().trim().min(1).max(80) }).strict();

export async function saveScene(member: Member, input: z.infer<typeof saveSceneInput>) {
  const settings = await getSettings(member.orgId);
  if (settings.adminOnlySavedScenes && !member.admin) {
    throw new Forbidden("Only admins can save scenes in this workspace.");
  }
  const video = await requireVideo(member, input.videoId);
  const scene = parseDraft(video.draft).scenes.find((s) => s.id === input.sceneId);
  if (!scene) throw new NotFound("No scene with that id");
  const [row] = await db
    .insert(savedScenes)
    .values({ id: crypto.randomUUID(), orgId: member.orgId, name: input.name, scene: JSON.stringify(scene), createdBy: member.id })
    .returning({ id: savedScenes.id, name: savedScenes.name });
  return row!;
}

export async function listSavedScenes(member: Member) {
  const rows = await db
    .select()
    .from(savedScenes)
    .where(eq(savedScenes.orgId, member.orgId))
    .orderBy(desc(savedScenes.createdAt));
  return rows.flatMap((row) => {
    const scene = sceneSchema.safeParse(JSON.parse(row.scene));
    return scene.success ? [{ id: row.id, name: row.name, scene: scene.data }] : [];
  });
}

export async function renameSavedScene(member: Member, input: z.infer<typeof renameSceneInput>) {
  const [row] = await db
    .update(savedScenes)
    .set({ name: input.name })
    .where(and(eq(savedScenes.id, input.id), eq(savedScenes.orgId, member.orgId)))
    .returning({ id: savedScenes.id });
  if (!row) throw new NotFound("No saved scene with that id");
  return row;
}

export async function deleteSavedScene(member: Member, id: string) {
  const [row] = await db
    .delete(savedScenes)
    .where(and(eq(savedScenes.id, id), eq(savedScenes.orgId, member.orgId)))
    .returning({ id: savedScenes.id });
  if (!row) throw new NotFound("No saved scene with that id");
  return row;
}

/** A saved scene as a new scene with its own id, ready to insert. */
export async function savedSceneCopy(member: Member, id: string) {
  const [row] = await db
    .select()
    .from(savedScenes)
    .where(and(eq(savedScenes.id, id), eq(savedScenes.orgId, member.orgId)));
  if (!row) throw new NotFound("No saved scene with that id");
  return { ...sceneSchema.parse(JSON.parse(row.scene)), id: newSceneId() };
}

// Exports.

export const exportSettingsInput = z
  .object({ videoId: z.string(), resolution: z.enum(["1080p", "4k"]), fps: z.union([z.literal(24), z.literal(30), z.literal(60)]) })
  .strict();

export async function listExports(member: Member, videoId: string) {
  await requireVideo(member, videoId);
  return db
    .select({
      id: exportsTable.id,
      mediaId: exportsTable.mediaId,
      resolution: exportsTable.resolution,
      fps: exportsTable.fps,
      revision: exportsTable.revision,
      createdAt: exportsTable.createdAt,
      size: media.size,
    })
    .from(exportsTable)
    .innerJoin(media, eq(media.id, exportsTable.mediaId))
    .where(eq(exportsTable.videoId, videoId))
    .orderBy(desc(exportsTable.createdAt), desc(sql`${exportsTable}.rowid`));
}

/** A stored export of the current draft with the same settings, if there is one. */
export async function reusableExport(member: Member, input: z.infer<typeof exportSettingsInput>) {
  const video = await requireVideo(member, input.videoId);
  const [row] = await db
    .select({ id: exportsTable.id, mediaId: exportsTable.mediaId })
    .from(exportsTable)
    .where(
      and(
        eq(exportsTable.videoId, video.id),
        eq(exportsTable.revision, video.revision),
        eq(exportsTable.resolution, input.resolution),
        eq(exportsTable.fps, input.fps),
      ),
    )
    .limit(1);
  return { revision: video.revision, existing: row ?? null };
}

export async function recordExport(
  member: Member,
  input: { videoId: string; resolution: "1080p" | "4k"; fps: number; revision: number },
  file: { body: ReadableStream | ArrayBuffer; size: number },
) {
  const video = await requireVideo(member, input.videoId);
  const row = await storeFile(
    member,
    { body: file.body, contentType: "video/mp4", size: file.size, name: `${video.title || "video"}.mp4` },
    { purpose: "export", videoId: video.id },
  );
  const id = crypto.randomUUID();
  await db.insert(exportsTable).values({
    id,
    videoId: video.id,
    mediaId: row.id,
    resolution: input.resolution,
    fps: input.fps,
    revision: input.revision,
    createdBy: member.id,
  });
  return { id, mediaId: row.id };
}
