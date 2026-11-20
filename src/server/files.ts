import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { media, savedScenes, versions } from "@/db/schema";
import type { Member } from "./users";
import { visibleVideo } from "./videos";

/**
 * A member reads a file they uploaded, a brand kit asset, a file made for a
 * video they can see, or a file used by a video they can see (`videoId`) or
 * by one of the workspace's saved scenes.
 */
export async function readableFile(member: Member, fileId: string, videoId: string | null) {
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, fileId), eq(media.orgId, member.orgId)));
  if (!row) return null;
  if (row.ownerId === member.id || row.purpose === "kit") return row;
  if (row.videoId && (await visibleVideo(member, row.videoId))) return row;
  if (videoId) {
    const video = await visibleVideo(member, videoId);
    if (video && (video.draft.includes(fileId) || (video.published ?? "").includes(fileId))) return row;
    if (video) {
      const [version] = await db
        .select({ id: versions.id })
        .from(versions)
        .where(and(eq(versions.videoId, video.id), like(versions.draft, `%${fileId}%`)))
        .limit(1);
      if (version) return row;
    }
  }
  const [saved] = await db
    .select({ id: savedScenes.id })
    .from(savedScenes)
    .where(and(eq(savedScenes.orgId, member.orgId), like(savedScenes.scene, `%${fileId}%`)))
    .limit(1);
  return saved ? row : null;
}
