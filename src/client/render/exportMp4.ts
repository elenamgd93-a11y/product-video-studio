import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { exportSize, sceneStart, totalDuration, type Aspect, type Draft, type KitSnapshot } from "@/lib/video";
import { drawFrame, loadAssets, seekClips } from "./draw";

const SAMPLE_RATE = 48000;

/** Mixes the voiceovers and music into one track. Null when the video is silent. */
async function mixAudio(draft: Draft, duration: number, fileUrl: (id: string) => string): Promise<AudioBuffer | null> {
  const parts: { id: string; start: number; gain: number; loop: boolean }[] = [];
  draft.scenes.forEach((scene, i) => {
    if (scene.voiceoverId) parts.push({ id: scene.voiceoverId, start: sceneStart(draft.scenes, i), gain: 1, loop: false });
  });
  if (draft.music) parts.push({ id: draft.music.mediaId, start: 0, gain: draft.music.volume, loop: true });
  if (parts.length === 0) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  for (const part of parts) {
    try {
      const data = await (await fetch(fileUrl(part.id))).arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = part.loop;
      const gain = ctx.createGain();
      gain.gain.value = part.gain;
      source.connect(gain).connect(ctx.destination);
      source.start(part.start);
    } catch {
      // Audio that can't be decoded is left out.
    }
  }
  return ctx.startRendering();
}

/** Renders the draft frame by frame into an H.264 MP4. */
export async function renderMp4(options: {
  draft: Draft;
  kit: KitSnapshot | null;
  aspect: Aspect;
  resolution: "1080p" | "4k";
  fps: 24 | 30 | 60;
  fileUrl: (id: string) => string;
  onProgress: (fraction: number) => void;
}): Promise<Blob> {
  if (typeof VideoEncoder === "undefined") throw new Error("This browser can't export video. Try a recent Chrome or Edge.");
  const { width, height } = exportSize(options.aspect, options.resolution);
  const codec = options.resolution === "4k" ? "avc1.640033" : "avc1.640028";
  const videoConfig = { codec, width, height, bitrate: options.resolution === "4k" ? 30_000_000 : 8_000_000, framerate: options.fps };
  const supported = await VideoEncoder.isConfigSupported(videoConfig);
  if (!supported.supported) throw new Error("This browser can't encode H.264 at this size.");
  const duration = totalDuration(options.draft);
  const audio = await mixAudio(options.draft, duration, options.fileUrl);
  const audioOk =
    audio && typeof AudioEncoder !== "undefined"
      ? (await AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128000 })).supported
      : false;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: options.fps },
    ...(audioOk ? { audio: { codec: "opus" as const, sampleRate: SAMPLE_RATE, numberOfChannels: 2 } } : {}),
    fastStart: "in-memory",
  });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failure = e as Error),
  });
  encoder.configure(videoConfig);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const assets = await loadAssets(options.draft, options.kit, options.fileUrl);
  const frames = Math.max(1, Math.round(duration * options.fps));
  for (let i = 0; i < frames; i++) {
    if (failure) throw failure;
    const t = i / options.fps;
    await seekClips(options.draft, t, assets);
    drawFrame(ctx, options.draft, t, options.kit, assets);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1_000_000) / options.fps), duration: Math.round(1_000_000 / options.fps) });
    encoder.encode(frame, { keyFrame: i % (options.fps * 2) === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    if (i % 10 === 0) options.onProgress(i / frames);
  }
  await encoder.flush();
  encoder.close();

  if (audioOk && audio) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => (failure = e as Error),
    });
    audioEncoder.configure({ codec: "opus", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128000 });
    const block = SAMPLE_RATE / 50;
    const left = audio.getChannelData(0);
    const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left;
    for (let start = 0; start < audio.length; start += block) {
      const n = Math.min(block, audio.length - start);
      const data = new Float32Array(n * 2);
      data.set(left.subarray(start, start + n), 0);
      data.set(right.subarray(start, start + n), n);
      const chunk = new AudioData({
        format: "f32-planar",
        sampleRate: SAMPLE_RATE,
        numberOfFrames: n,
        numberOfChannels: 2,
        timestamp: Math.round((start / SAMPLE_RATE) * 1_000_000),
        data,
      });
      audioEncoder.encode(chunk);
      chunk.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }
  if (failure) throw failure;
  muxer.finalize();
  options.onProgress(1);
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

/** A still of the draft at `time`, as PNG: the share link's preview image. */
export async function renderStill(options: {
  draft: Draft;
  kit: KitSnapshot | null;
  aspect: Aspect;
  time: number;
  fileUrl: (id: string) => string;
}): Promise<Blob> {
  const { width, height } = exportSize(options.aspect, "1080p");
  const canvas = new OffscreenCanvas(Math.round(width / 1.5), Math.round(height / 1.5));
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const assets = await loadAssets(options.draft, options.kit, options.fileUrl);
  await seekClips(options.draft, options.time, assets);
  drawFrame(ctx, options.draft, options.time, options.kit, assets);
  return canvas.convertToBlob({ type: "image/png" });
}
