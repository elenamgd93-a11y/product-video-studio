import { z } from "zod";

export const ASPECTS = ["16:9", "1:1", "9:16"] as const;
export type Aspect = (typeof ASPECTS)[number];
export const QUALITIES = ["light", "medium", "high"] as const;
export type Quality = (typeof QUALITIES)[number];
export const SCENE_KINDS = ["text", "ui", "logo", "media", "title"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];
export const VOICES = ["alloy", "ash", "coral", "echo", "sage", "shimmer"] as const;
export const LENGTH_PRESETS = [15, 30, 60, 120, 180] as const;
export const MAX_LENGTH_SECONDS = 300;
export const MAX_FILES = 128;
export const ASSET_KINDS = ["logo", "background", "product", "other"] as const;
export const COLOR_ROLES = ["primary", "background", "accent", "other"] as const;

export const SCENE_KIND_LABELS: Record<SceneKind, string> = {
  text: "Text animation",
  ui: "UI moment",
  logo: "Logo reveal",
  media: "Media",
  title: "Title and call to action",
};

/** Families every browser has, so a video looks the same wherever it plays. */
export const FONTS = {
  "System sans": "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  Serif: "Georgia, 'Times New Roman', serif",
  Monospace: "ui-monospace, Menlo, Consolas, monospace",
  Rounded: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
  Humanist: "Optima, Candara, 'Segoe UI', sans-serif",
  Slab: "Rockwell, 'Roboto Slab', Georgia, serif",
} as const;
export type FontName = keyof typeof FONTS;
export const FONT_NAMES = Object.keys(FONTS) as FontName[];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1a2b3c");

export const kitContentSchema = z.object({
  colors: z
    .array(z.object({ name: z.string().trim().max(60), hex, role: z.enum(COLOR_ROLES) }))
    .max(24),
  headingFont: z.enum(FONT_NAMES as [FontName, ...FontName[]]),
  bodyFont: z.enum(FONT_NAMES as [FontName, ...FontName[]]),
  voice: z.string().max(4000),
  pronunciations: z
    .array(z.object({ term: z.string().trim().min(1).max(80), spoken: z.string().trim().min(1).max(120) }))
    .max(100),
});
export type KitContent = z.infer<typeof kitContentSchema>;

export const kitAssetSchema = z.object({
  id: z.string(),
  kind: z.enum(ASSET_KINDS),
  name: z.string(),
  contentType: z.string(),
});
export const kitSnapshotSchema = kitContentSchema.extend({
  id: z.string(),
  name: z.string(),
  assets: z.array(kitAssetSchema),
});
export type KitSnapshot = z.infer<typeof kitSnapshotSchema>;

export const DEFAULT_KIT_CONTENT: KitContent = {
  colors: [
    { name: "Ink", hex: "#1f2937", role: "primary" },
    { name: "Paper", hex: "#f8fafc", role: "background" },
    { name: "Signal", hex: "#2563eb", role: "accent" },
  ],
  headingFont: "System sans",
  bodyFont: "System sans",
  voice: "",
  pronunciations: [],
};

export const sceneSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(SCENE_KINDS),
  duration: z.number().min(0.5).max(MAX_LENGTH_SECONDS),
  heading: z.string().max(300),
  body: z.string().max(1000),
  colors: z.object({ background: hex, foreground: hex, accent: hex }),
  mediaId: z.string().max(64).nullable(),
  mediaType: z.enum(["image", "video"]).nullable(),
  footageStart: z.number().min(0).max(36000),
  footageSpeed: z.number().min(0.25).max(4),
  script: z.string().max(2000),
  voice: z.enum(VOICES),
  voiceoverId: z.string().max(64).nullable(),
  voiceoverScript: z.string().max(2000).nullable(),
});
export type Scene = z.infer<typeof sceneSchema>;

export const draftSchema = z.object({
  scenes: z.array(sceneSchema).max(200),
  music: z.object({ mediaId: z.string().max(64), name: z.string().max(200), volume: z.number().min(0).max(1) }).nullable(),
});
export type Draft = z.infer<typeof draftSchema>;

export function totalDuration(draft: Pick<Draft, "scenes">): number {
  return draft.scenes.reduce((sum, scene) => sum + scene.duration, 0);
}

/** Every distinct stored file the video uses: footage, images, voiceovers and music. */
export function fileIds(draft: Draft): Set<string> {
  const ids = new Set<string>();
  for (const scene of draft.scenes) {
    if (scene.mediaId) ids.add(scene.mediaId);
    if (scene.voiceoverId) ids.add(scene.voiceoverId);
  }
  if (draft.music) ids.add(draft.music.mediaId);
  return ids;
}

export function tooManyFiles(draft: Draft): boolean {
  return fileIds(draft).size > MAX_FILES;
}

/** Scales durations so they add up to `total`, in half seconds, the last scene taking the rest. */
export function fitDurations<T extends { duration: number }>(scenes: T[], total: number): T[] {
  if (scenes.length === 0) return scenes;
  const sum = scenes.reduce((s, x) => s + Math.max(x.duration, 0.5), 0);
  const fitted = scenes.map((scene) => ({
    ...scene,
    duration: Math.max(0.5, Math.round(((Math.max(scene.duration, 0.5) / sum) * total) * 2) / 2),
  }));
  const rest = total - fitted.slice(0, -1).reduce((s, x) => s + x.duration, 0);
  if (rest >= 0.5) fitted[fitted.length - 1]!.duration = Math.round(rest * 100) / 100;
  return fitted;
}

/** The scene playing at `time` seconds and how far into it. */
export function sceneAt(scenes: Scene[], time: number): { index: number; local: number } | null {
  let start = 0;
  for (let index = 0; index < scenes.length; index++) {
    const duration = scenes[index]!.duration;
    if (time < start + duration || index === scenes.length - 1) {
      return { index, local: Math.min(Math.max(time - start, 0), duration) };
    }
    start += duration;
  }
  return null;
}

export function sceneStart(scenes: Scene[], index: number): number {
  return scenes.slice(0, index).reduce((s, x) => s + x.duration, 0);
}

export function nextVersionNumber(existing: number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

export function exportFileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  return `${clean || "video"}.mp4`;
}

export function lengthLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function kitColor(kit: Pick<KitContent, "colors"> | null, role: "primary" | "background" | "accent", fallback: string): string {
  return kit?.colors.find((c) => c.role === role)?.hex ?? fallback;
}

export function sceneColors(kit: Pick<KitContent, "colors"> | null): Scene["colors"] {
  return {
    background: kitColor(kit, "background", "#f8fafc"),
    foreground: kitColor(kit, "primary", "#1f2937"),
    accent: kitColor(kit, "accent", "#2563eb"),
  };
}

export function newSceneId(): string {
  return crypto.randomUUID().slice(0, 12);
}

/** A scene from the built-in library, coloured from the video's kit. */
export function libraryScene(kind: SceneKind, kit: KitSnapshot | null, variant?: { heading?: string; body?: string }): Scene {
  const defaults: Record<SceneKind, { heading: string; body: string; duration: number }> = {
    text: { heading: "Say it in one line", body: "", duration: 4 },
    ui: { heading: "Here is how it works", body: "One click and it's done", duration: 5 },
    logo: { heading: kit?.name ?? "Your brand", body: "", duration: 3 },
    media: { heading: "", body: "", duration: 5 },
    title: { heading: "Try it today", body: "Get started", duration: 4 },
  };
  const d = defaults[kind];
  return {
    id: newSceneId(),
    kind,
    duration: d.duration,
    heading: variant?.heading ?? d.heading,
    body: variant?.body ?? d.body,
    colors: sceneColors(kit),
    mediaId: kind === "logo" ? (kit?.assets.find((a) => a.kind === "logo")?.id ?? null) : null,
    mediaType: kind === "logo" && kit?.assets.some((a) => a.kind === "logo") ? "image" : null,
    footageStart: 0,
    footageSpeed: 1,
    script: "",
    voice: "alloy",
    voiceoverId: null,
    voiceoverScript: null,
  };
}

export function blankDraft(kit: KitSnapshot | null): Draft {
  return { scenes: [libraryScene("title", kit, { heading: "Untitled video", body: "" })], music: null };
}

/** Applies the kit's pronunciation entries to a voiceover script. */
export function pronounce(script: string, kit: Pick<KitContent, "pronunciations"> | null): string {
  let out = script;
  for (const { term, spoken } of kit?.pronunciations ?? []) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), spoken);
  }
  return out;
}

export const ASPECT_SIZE: Record<Aspect, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

/** Output size for an export: the short side is 1080 or 2160. */
export function exportSize(aspect: Aspect, resolution: "1080p" | "4k"): { width: number; height: number } {
  const base = ASPECT_SIZE[aspect];
  const scale = resolution === "4k" ? 2 : 1;
  return { width: base.width * scale, height: base.height * scale };
}
