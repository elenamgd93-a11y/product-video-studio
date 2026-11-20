import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import type { Member } from "./users";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
export const LIBRARY_TYPES = [...IMAGE_TYPES, "image/webp", "video/mp4", "video/webm", "video/quicktime"];
export const AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/aac", "audio/mp4", "audio/webm"];

export type Purpose = "library" | "kit" | "voiceover" | "music" | "preview" | "export";

export async function storeFile(
  member: Member,
  file: { body: ArrayBuffer | ReadableStream; contentType: string; size: number; name: string },
  place: { purpose: Purpose; kitId?: string | null; videoId?: string | null; assetKind?: string | null },
) {
  const id = crypto.randomUUID();
  await env.files.put(id, file.body, { httpMetadata: { contentType: file.contentType } });
  const [row] = await db
    .insert(media)
    .values({
      id,
      orgId: member.orgId,
      ownerId: member.id,
      purpose: place.purpose,
      kitId: place.kitId ?? null,
      videoId: place.videoId ?? null,
      assetKind: place.assetKind ?? null,
      name: file.name.slice(0, 200),
      contentType: file.contentType,
      size: file.size,
    })
    .returning();
  return row!;
}

export async function deleteFiles(ids: string[]) {
  if (ids.length === 0) return;
  await env.files.delete(ids);
}

export async function listLibrary(member: Member) {
  return db
    .select({ id: media.id, name: media.name, contentType: media.contentType })
    .from(media)
    .where(and(eq(media.orgId, member.orgId), eq(media.ownerId, member.id), eq(media.purpose, "library")))
    .orderBy(media.createdAt);
}

/** Streams a stored file. SVGs can't run script: they are served under a CSP that allows none. */
export async function serveFile(row: { id: string; contentType: string; name: string }, download?: string | null) {
  const object = await env.files.get(row.id);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "content-type": row.contentType,
    "x-content-type-options": "nosniff",
    "cache-control": "private, max-age=3600",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  });
  if (download) headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(download)}`);
  return new Response(object.body, { headers });
}
