import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`);

/** Members as the Gateway names them, created the first time each one opens the app. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

/** Workspace-wide switches, one row per organization. */
export const workspaceSettings = sqliteTable("workspace_settings", {
  orgId: text("org_id").primaryKey(),
  adminOnlySavedScenes: integer("admin_only_saved_scenes", { mode: "boolean" })
    .notNull()
    .default(false),
});

/** Brand kits are shared: every member of the organization reads and edits them. */
export const brandKits = sqliteTable(
  "brand_kits",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    // JSON: colours, fonts, voice and pronunciations (src/lib/kit.ts).
    content: text("content").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("brand_kits_org").on(t.orgId)],
);

/**
 * Uploaded files in R2. A row with a kitId is a brand kit asset (any member
 * reads it); otherwise it belongs to its owner's media library, or to a video
 * (music, voiceover, preview image, export) and is read through that video.
 */
export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ownerId: text("owner_id").notNull(),
    kitId: text("kit_id"),
    videoId: text("video_id"),
    // library | kit | voiceover | music | preview | export
    purpose: text("purpose").notNull(),
    // logo | background | product | other, for kit assets
    assetKind: text("asset_kind"),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("media_owner").on(t.orgId, t.ownerId, t.purpose),
    index("media_kit").on(t.kitId),
  ],
);

/** A shared project: every member sees its videos. A personal one: its owner only. */
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    shared: integer("shared", { mode: "boolean" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("projects_org").on(t.orgId)],
);

export const videos = sqliteTable(
  "videos",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id"),
    title: text("title").notNull(),
    prompt: text("prompt").notNull().default(""),
    aspect: text("aspect").notNull(),
    quality: text("quality").notNull(),
    lengthSeconds: integer("length_seconds").notNull(),
    // JSON: the brand kit as it was when the video was made.
    kit: text("kit"),
    // JSON: the editable draft (scenes, music).
    draft: text("draft").notNull(),
    // Bumped on every change to the draft.
    revision: integer("revision").notNull().default(1),
    // JSON: what the share link plays, with its title and the revision it froze.
    published: text("published"),
    publishedRevision: integer("published_revision"),
    shareMode: text("share_mode").notNull().default("private"),
    previewMediaId: text("preview_media_id"),
    previewTime: real("preview_time"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("videos_org").on(t.orgId, t.updatedAt)],
);

/** Each AI draft or change: the whole scene list, numbered from 1. */
export const versions = sqliteTable(
  "versions",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull(),
    number: integer("number").notNull(),
    draft: text("draft").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("versions_video").on(t.videoId, t.number)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull(),
    userId: text("user_id").notNull(),
    // user | assistant
    role: text("role").notNull(),
    body: text("body").notNull(),
    sceneId: text("scene_id"),
    versionNumber: integer("version_number"),
    // up | down
    rating: text("rating"),
    feedback: text("feedback"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_video").on(t.videoId, t.createdAt)],
);

export const savedScenes = sqliteTable(
  "saved_scenes",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    scene: text("scene").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("saved_scenes_org").on(t.orgId)],
);

export const exportsTable = sqliteTable(
  "exports",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull(),
    mediaId: text("media_id").notNull(),
    resolution: text("resolution").notNull(),
    fps: integer("fps").notNull(),
    revision: integer("revision").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("exports_video").on(t.videoId, t.createdAt)],
);
