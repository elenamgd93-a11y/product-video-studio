import { and, desc, eq, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { exportsTable, media, messages, projects, savedScenes, versions, videos } from "@/db/schema";
import {
  ASPECTS,
  MAX_FILES,
  MAX_LENGTH_SECONDS,
  QUALITIES,
  blankDraft,
  draftSchema,
  fileIds,
  kitSnapshotSchema,
  type Aspect,
  type Draft,
  type KitSnapshot,
} from "@/lib/video";
import { deleteFiles } from "./storage";
import { visibleProject } from "./projects";
import { getKit } from "./kits";
import { Forbidden, NotFound, type Member } from "./users";

export const titleInput = z.string().trim().max(120);
export const videoIdInput = z.object({ id: z.string() }).strict();
export const createBlankInput = z
  .object({
    title: titleInput.optional(),
    kitId: z.string().nullable().optional(),
    aspect: z.enum(ASPECTS).optional(),
    projectId: z.string().nullable().optional(),
  })
  .strict();
export const updateVideoInput = z
  .object({ id: z.string(), title: titleInput.optional(), projectId: z.string().nullable().optional() })
  .strict();
export const saveDraftInput = z.object({ id: z.string(), draft: draftSchema }).strict();
export const listVideosInput = z
  .object({ search: z.string().max(120).optional(), projectId: z.string().optional() })
  .strict();

type VideoRow = typeof videos.$inferSelect;

/** Who sees a video: anyone in a shared project; the owner of a personal project; else its creator. */
function visibleTo(member: Member): SQL {
  return and(
    eq(videos.orgId, member.orgId),
    or(
      eq(projects.shared, true),
      and(sql`${projects.id} is not null`, eq(projects.ownerId, member.id)),
      and(isNull(projects.id), eq(videos.ownerId, member.id)),
    ),
  )!;
}

export async function visibleVideo(member: Member, id: string): Promise<VideoRow | null> {
  const [row] = await db
    .select({ video: videos })
    .from(videos)
    .leftJoin(projects, eq(projects.id, videos.projectId))
    .where(and(eq(videos.id, id), visibleTo(member)));
  return row?.video ?? null;
}

export async function requireVideo(member: Member, id: string): Promise<VideoRow> {
  const video = await visibleVideo(member, id);
  if (!video) throw new NotFound("No video with that id");
  return video;
}

export async function listVideos(member: Member, input: z.infer<typeof listVideosInput>) {
  const filters: SQL[] = [visibleTo(member)];
  const search = input.search?.trim();
  if (search) filters.push(like(videos.title, `%${search.replace(/[%_\\]/g, "\\$&")}%`));
  if (input.projectId) filters.push(eq(videos.projectId, input.projectId));
  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      aspect: videos.aspect,
      lengthSeconds: videos.lengthSeconds,
      draft: videos.draft,
      updatedAt: videos.updatedAt,
      projectId: videos.projectId,
      projectName: projects.name,
      ownerId: videos.ownerId,
      published: sql<number>`${videos.publishedRevision} is not null`,
    })
    .from(videos)
    .leftJoin(projects, eq(projects.id, videos.projectId))
    .where(and(...filters))
    .orderBy(desc(videos.updatedAt))
    .limit(100);
  return rows.map(({ draft, ...row }) => {
    const parsed = parseDraft(draft);
    const first = parsed.scenes[0];
    return {
      ...row,
      published: !!row.published,
      sceneCount: parsed.scenes.length,
      duration: parsed.scenes.reduce((s, x) => s + x.duration, 0),
      cover: first ? { background: first.colors.background, foreground: first.colors.foreground, heading: first.heading } : null,
    };
  });
}

export function parseDraft(text: string): Draft {
  const parsed = draftSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : { scenes: [], music: null };
}

export function parseKit(text: string | null): KitSnapshot | null {
  if (!text) return null;
  const parsed = kitSnapshotSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

export function videoView(video: VideoRow) {
  return {
    id: video.id,
    title: video.title,
    prompt: video.prompt,
    aspect: video.aspect as Aspect,
    quality: video.quality,
    lengthSeconds: video.lengthSeconds,
    projectId: video.projectId,
    kit: parseKit(video.kit),
    draft: parseDraft(video.draft),
    revision: video.revision,
    publishedRevision: video.publishedRevision,
    shareMode: video.shareMode as "public" | "private",
    previewMediaId: video.previewMediaId,
    previewTime: video.previewTime,
    ownerId: video.ownerId,
  };
}

/** A project a video may move into: a shared one, or a personal one when mover, owner and creator are one person. */
async function checkTarget(member: Member, projectId: string | null | undefined, creatorId: string) {
  if (!projectId) return null;
  const project = await visibleProject(member, projectId);
  if (!project) throw new NotFound("No project with that id");
  if (!project.shared && creatorId !== member.id) {
    throw new Forbidden("Only the video's creator can move it into a personal project.");
  }
  return project.id;
}

export async function insertVideo(
  member: Member,
  values: {
    title: string;
    prompt?: string;
    aspect: Aspect;
    quality?: string;
    lengthSeconds: number;
    kit: KitSnapshot | null;
    draft: Draft;
    projectId?: string | null;
  },
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const projectId = await checkTarget(member, values.projectId, member.id);
  await db.insert(videos).values({
    id,
    orgId: member.orgId,
    ownerId: member.id,
    projectId,
    title: values.title,
    prompt: values.prompt ?? "",
    aspect: values.aspect,
    quality: values.quality ?? "medium",
    lengthSeconds: values.lengthSeconds,
    kit: values.kit ? JSON.stringify(values.kit) : null,
    draft: JSON.stringify(values.draft),
    updatedAt: now,
  });
  return id;
}

export async function createBlank(member: Member, input: z.infer<typeof createBlankInput>) {
  const kit = input.kitId ? await getKit(member, input.kitId) : null;
  const draft = blankDraft(kit);
  const id = await insertVideo(member, {
    title: input.title?.trim() || "Untitled video",
    aspect: input.aspect ?? "16:9",
    lengthSeconds: draft.scenes.reduce((s, x) => s + x.duration, 0),
    kit,
    draft,
    projectId: input.projectId,
  });
  return { id };
}

export async function updateVideo(member: Member, input: z.infer<typeof updateVideoInput>) {
  const video = await requireVideo(member, input.id);
  const change: Partial<VideoRow> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) change.title = input.title;
  if (input.projectId !== undefined) change.projectId = await checkTarget(member, input.projectId, video.ownerId);
  await db.update(videos).set(change).where(eq(videos.id, video.id));
  return videoView((await visibleVideo(member, video.id)) ?? { ...video, ...change });
}

/** Copies the scenes and kit into a new video; versions, chat and exports stay with the original. */
export async function duplicateVideo(member: Member, id: string) {
  const video = await requireVideo(member, id);
  const project = video.projectId ? await visibleProject(member, video.projectId) : null;
  const newId = await insertVideo(member, {
    title: `${video.title} (copy)`.slice(0, 120),
    prompt: video.prompt,
    aspect: video.aspect as Aspect,
    quality: video.quality,
    lengthSeconds: video.lengthSeconds,
    kit: parseKit(video.kit),
    draft: parseDraft(video.draft),
    projectId: project && (project.shared || project.ownerId === member.id) ? project.id : null,
  });
  return { id: newId };
}

export async function deleteVideo(member: Member, id: string) {
  const video = await requireVideo(member, id);
  const owned = await db.select({ id: media.id }).from(media).where(eq(media.videoId, video.id));
  await db.batch([
    db.delete(versions).where(eq(versions.videoId, video.id)),
    db.delete(messages).where(eq(messages.videoId, video.id)),
    db.delete(exportsTable).where(eq(exportsTable.videoId, video.id)),
    db.delete(media).where(eq(media.videoId, video.id)),
    db.delete(videos).where(eq(videos.id, video.id)),
  ]);
  await deleteFiles(owned.map((m) => m.id));
  return { id: video.id };
}

/**
 * A file the member may put into a draft: one already in the video, their own
 * upload, a brand kit asset, a file made for this video, or one a saved scene uses.
 */
export async function checkNewFiles(member: Member, video: VideoRow, draft: Draft) {
  const ids = fileIds(draft);
  if (ids.size > MAX_FILES) {
    throw new Forbidden(`A video can use at most ${MAX_FILES} files. Remove one to add another.`);
  }
  const known = new Set([...fileIds(parseDraft(video.draft))]);
  const kit = parseKit(video.kit);
  for (const asset of kit?.assets ?? []) known.add(asset.id);
  const fresh = [...ids].filter((id) => !known.has(id));
  if (fresh.length === 0) return;
  const rows = await db
    .select({ id: media.id, ownerId: media.ownerId, purpose: media.purpose, videoId: media.videoId })
    .from(media)
    .where(and(eq(media.orgId, member.orgId), inArray(media.id, fresh)));
  const scenes = await db
    .select({ scene: savedScenes.scene })
    .from(savedScenes)
    .where(eq(savedScenes.orgId, member.orgId));
  const versionDrafts = await db.select({ draft: versions.draft }).from(versions).where(eq(versions.videoId, video.id));
  const shared = scenes.map((s) => s.scene).concat(versionDrafts.map((v) => v.draft)).join("\n");
  for (const id of fresh) {
    const row = rows.find((r) => r.id === id);
    const ok =
      row &&
      (row.ownerId === member.id || row.purpose === "kit" || row.videoId === video.id || shared.includes(id));
    if (!ok) throw new NotFound("A file in this draft isn't available to you");
  }
}

/** Saves a manual edit. It changes the draft only: no version is made. */
export async function saveDraft(member: Member, input: z.infer<typeof saveDraftInput>) {
  const video = await requireVideo(member, input.id);
  await checkNewFiles(member, video, input.draft);
  const total = input.draft.scenes.reduce((s, x) => s + x.duration, 0);
  if (total > MAX_LENGTH_SECONDS + 0.01) throw new Forbidden("A video can be at most 5 minutes long.");
  const [row] = await db
    .update(videos)
    .set({
      draft: JSON.stringify(input.draft),
      revision: sql`${videos.revision} + 1`,
      lengthSeconds: Math.round(total),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(videos.id, video.id))
    .returning({ revision: videos.revision });
  return { revision: row!.revision };
}

export async function listVersions(member: Member, videoId: string) {
  await requireVideo(member, videoId);
  return db
    .select({ id: versions.id, number: versions.number, createdAt: versions.createdAt })
    .from(versions)
    .where(eq(versions.videoId, videoId))
    .orderBy(versions.number);
}

export async function getVersion(member: Member, input: { videoId: string; number: number }) {
  await requireVideo(member, input.videoId);
  const [row] = await db
    .select()
    .from(versions)
    .where(and(eq(versions.videoId, input.videoId), eq(versions.number, input.number)));
  if (!row) throw new NotFound("No such version");
  return { number: row.number, draft: parseDraft(row.draft) };
}

/** Makes a version the current draft again. */
export async function restoreVersion(member: Member, input: { videoId: string; number: number }) {
  const version = await getVersion(member, input);
  await db
    .update(videos)
    .set({
      draft: JSON.stringify(version.draft),
      revision: sql`${videos.revision} + 1`,
      lengthSeconds: Math.round(version.draft.scenes.reduce((s, x) => s + x.duration, 0)),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(videos.id, input.videoId));
  return { number: version.number };
}
