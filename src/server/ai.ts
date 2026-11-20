import { env } from "cloudflare:workers";
import { aiBaseUrl, createGatewayFetch, gatewayRefusal, refusalFromError } from "@every-app/sdk/server";
import { z } from "zod";
import {
  SCENE_KINDS,
  fitDurations,
  libraryScene,
  newSceneId,
  sceneColors,
  type Aspect,
  type Draft,
  type KitSnapshot,
  type Quality,
  type Scene,
} from "@/lib/video";

/** The OpenAI model behind each quality tier. */
export const MODELS: Record<Quality, string> = {
  light: "gpt-5-nano",
  medium: "gpt-5-mini",
  high: "gpt-5",
};
export const SPEECH_MODEL = "gpt-4o-mini-tts";

const PROVIDER = "openai";

function gatewayFetch() {
  return createGatewayFetch({ env });
}

export class AiOff extends Error {
  status = 503;
}

/**
 * Whether the Gateway holds the OpenAI key. It asks for the model list, which
 * the Gateway answers without calling a model: a missing key is refused first.
 */
export async function aiStatus(): Promise<{ ready: boolean; setup: string | null }> {
  try {
    const response = await gatewayFetch()(`${aiBaseUrl(PROVIDER)}/models`, { method: "GET" });
    const refusal = await gatewayRefusal(response);
    if (!refusal || refusal.code === "ai_route_not_allowed") return { ready: true, setup: null };
    return { ready: false, setup: refusal.setup ?? refusal.message ?? null };
  } catch (error) {
    const refusal = refusalFromError(error);
    return { ready: false, setup: refusal?.setup ?? refusal?.message ?? null };
  }
}

async function call(path: string, body: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await gatewayFetch()(`${aiBaseUrl(PROVIDER)}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const refusal = refusalFromError(error);
    if (refusal) throw new AiOff("AI isn't set up for this workspace.");
    throw error;
  }
  const refusal = await gatewayRefusal(response);
  if (refusal) {
    if (refusal.code.endsWith("not_configured") || refusal.code === "provider_not_allowed") {
      throw new AiOff("AI isn't set up for this workspace.");
    }
    throw new Error(refusal.message || "The AI request was refused.");
  }
  if (!response.ok) throw new Error(`The AI service answered ${response.status}. Try again.`);
  return response;
}

async function chatJson(quality: Quality, system: string, user: string): Promise<unknown> {
  const response = await call("/chat/completions", {
    model: MODELS[quality],
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The AI answer couldn't be read. Try again.");
  }
}

const aiScene = z.object({
  id: z.string().optional(),
  kind: z.enum(SCENE_KINDS).catch("text"),
  heading: z.string().catch(""),
  body: z.string().catch(""),
  script: z.string().catch(""),
  duration: z.number().catch(4),
  tone: z.enum(["light", "dark", "accent"]).catch("light"),
  media: z.number().int().nullable().optional().catch(null),
});
const aiDraft = z.object({
  title: z.string().catch("Untitled video"),
  reply: z.string().optional().catch(undefined),
  scenes: z.array(aiScene).min(1),
});

const SCENE_GUIDE = `Each scene has: kind (one of ${SCENE_KINDS.join(", ")}: text = animated text, ui = a product screen moment, logo = logo reveal, media = an attached image or clip with pan and zoom, title = closing title with a call to action), heading (on-screen text, at most 8 words), body (optional supporting line, at most 12 words), script (what the voiceover says during the scene, natural spoken English), duration in seconds, tone (light, dark or accent background), and media (the index of an attached file to show, or null).`;

function kitBrief(kit: KitSnapshot | null): string {
  if (!kit) return "No brand kit.";
  return [
    `Brand: ${kit.name}.`,
    kit.voice ? `Voice and tone: ${kit.voice}` : "",
    kit.colors.length ? `Colours: ${kit.colors.map((c) => `${c.name} ${c.hex} (${c.role})`).join(", ")}.` : "",
    kit.assets.some((a) => a.kind === "logo") ? "A logo is available for logo scenes." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function colorsFor(tone: "light" | "dark" | "accent", kit: KitSnapshot | null): Scene["colors"] {
  const base = sceneColors(kit);
  if (tone === "dark") return { background: base.foreground, foreground: base.background, accent: base.accent };
  if (tone === "accent") return { background: base.accent, foreground: base.background, accent: base.foreground };
  return base;
}

function toScene(
  raw: z.infer<typeof aiScene>,
  kit: KitSnapshot | null,
  attachments: { id: string; contentType: string }[],
  existing?: Scene,
): Scene {
  const base = existing ?? libraryScene(raw.kind, kit);
  const attached = raw.media != null ? attachments[raw.media] : undefined;
  return {
    ...base,
    id: existing?.id ?? newSceneId(),
    kind: raw.kind,
    heading: raw.heading.slice(0, 300),
    body: raw.body.slice(0, 1000),
    script: raw.script.slice(0, 2000),
    duration: Math.min(Math.max(raw.duration, 0.5), 300),
    colors: existing ? existing.colors : colorsFor(raw.tone, kit),
    mediaId: attached ? attached.id : base.mediaId,
    mediaType: attached ? (attached.contentType.startsWith("video/") ? "video" : "image") : base.mediaType,
    voiceoverId: existing && existing.voiceoverScript === raw.script ? existing.voiceoverId : null,
    voiceoverScript: existing && existing.voiceoverScript === raw.script ? existing.voiceoverScript : null,
  };
}

export async function generateDraft(input: {
  prompt: string;
  kit: KitSnapshot | null;
  lengthSeconds: number;
  aspect: Aspect;
  quality: Quality;
  attachments: { id: string; name: string; contentType: string }[];
}): Promise<{ title: string; draft: Draft }> {
  const system = `You write short product videos as a list of scenes. Answer with JSON: {"title": string, "scenes": Scene[]}. ${SCENE_GUIDE} The durations must add up to ${input.lengthSeconds} seconds. Use between 3 and 12 scenes for a short video and more for a long one. End with a title scene.`;
  const user = [
    `What the video is about: ${input.prompt}`,
    `Aspect ratio: ${input.aspect}. Length: ${input.lengthSeconds} seconds.`,
    kitBrief(input.kit),
    input.attachments.length
      ? `Attached files: ${input.attachments.map((a, i) => `${i}: ${a.name} (${a.contentType})`).join("; ")}`
      : "No attached files.",
  ].join("\n");
  const parsed = aiDraft.safeParse(await chatJson(input.quality, system, user));
  if (!parsed.success) throw new Error("The AI answer had no scenes. Try again.");
  const scenes = fitDurations(
    parsed.data.scenes.map((s) => toScene(s, input.kit, input.attachments)),
    input.lengthSeconds,
  );
  return { title: parsed.data.title.slice(0, 120) || "Untitled video", draft: { scenes, music: null } };
}

export async function editDraft(input: {
  draft: Draft;
  title: string;
  request: string;
  scene: Scene | null;
  kit: KitSnapshot | null;
  quality: Quality;
}): Promise<{ title: string; reply: string; draft: Draft }> {
  const current = input.draft.scenes.map((s) => ({
    id: s.id,
    kind: s.kind,
    heading: s.heading,
    body: s.body,
    script: s.script,
    duration: s.duration,
  }));
  const system = `You revise a product video made of scenes. Answer with JSON: {"title": string, "reply": string, "scenes": Scene[]}. ${SCENE_GUIDE} Keep each unchanged scene's id; give new scenes no id. Return every scene, in order. "reply" tells the person in one or two sentences what you changed. Keep the total length near ${Math.round(current.reduce((s, x) => s + x.duration, 0))} seconds unless asked otherwise, and never over 300 seconds.`;
  const user = [
    `Title: ${input.title}`,
    kitBrief(input.kit),
    `Scenes: ${JSON.stringify(current)}`,
    input.scene ? `The request is about scene ${input.scene.id} ("${input.scene.heading}").` : "",
    `Request: ${input.request}`,
  ]
    .filter(Boolean)
    .join("\n");
  const parsed = aiDraft.safeParse(await chatJson(input.quality, system, user));
  if (!parsed.success) throw new Error("The AI answer had no scenes. Try again.");
  const byId = new Map(input.draft.scenes.map((s) => [s.id, s]));
  const scenes = parsed.data.scenes.map((s) => toScene(s, input.kit, [], s.id ? byId.get(s.id) : undefined));
  const total = scenes.reduce((sum, s) => sum + s.duration, 0);
  return {
    title: parsed.data.title.slice(0, 120) || input.title,
    reply: parsed.data.reply?.slice(0, 1000) || "Done.",
    draft: { scenes: total > 300 ? fitDurations(scenes, 300) : scenes, music: input.draft.music },
  };
}

/** Speech for one scene's script, as MP3. */
export async function synthesize(script: string, voice: string): Promise<ArrayBuffer> {
  const response = await call("/audio/speech", {
    model: SPEECH_MODEL,
    voice,
    input: script,
    response_format: "mp3",
  });
  return response.arrayBuffer();
}
