import { FONTS, type Draft, type KitSnapshot, type Scene, sceneAt } from "@/lib/video";

export type Asset = HTMLImageElement | HTMLVideoElement;
export type Assets = Map<string, Asset>;

const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

function fonts(kit: KitSnapshot | null) {
  return {
    heading: FONTS[kit?.headingFont ?? "System sans"],
    body: FONTS[kit?.bodyFont ?? "System sans"],
  };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { size: number; font: string; weight: number; color: string; maxWidth: number; align?: CanvasTextAlign },
): number {
  if (!text) return y;
  ctx.font = `${opts.weight} ${opts.size}px ${opts.font}`;
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "top";
  const lines = wrap(ctx, text, opts.maxWidth);
  const lineHeight = opts.size * 1.2;
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function drawCover(ctx: CanvasRenderingContext2D, asset: Asset, x: number, y: number, w: number, h: number, zoom = 1, panX = 0, panY = 0) {
  const sw = asset instanceof HTMLVideoElement ? asset.videoWidth : asset.naturalWidth;
  const sh = asset instanceof HTMLVideoElement ? asset.videoHeight : asset.naturalHeight;
  if (!sw || !sh) return;
  const scale = Math.max(w / sw, h / sh) * zoom;
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(asset, x + (w - dw) / 2 + panX * (dw - w) * 0.5, y + (h - dh) / 2 + panY * (dh - h) * 0.5, dw, dh);
  ctx.restore();
}

function drawContain(ctx: CanvasRenderingContext2D, asset: Asset, cx: number, cy: number, maxW: number, maxH: number) {
  const sw = asset instanceof HTMLVideoElement ? asset.videoWidth : asset.naturalWidth || 300;
  const sh = asset instanceof HTMLVideoElement ? asset.videoHeight : asset.naturalHeight || 150;
  const scale = Math.min(maxW / sw, maxH / sh);
  ctx.drawImage(asset, cx - (sw * scale) / 2, cy - (sh * scale) / 2, sw * scale, sh * scale);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws one frame of a scene, `t` seconds into it, at the canvas's size. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, t: number, kit: KitSnapshot | null, assets: Assets) {
  const { width: w, height: h } = ctx.canvas;
  const unit = Math.min(w, h) / 1080;
  const f = fonts(kit);
  const c = scene.colors;
  const inT = ease(t / 0.8);
  const outT = scene.duration - t < 0.4 ? ease((0.4 - (scene.duration - t)) / 0.4) : 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, w, h);
  const asset = scene.mediaId ? assets.get(scene.mediaId) : undefined;
  const progress = t / Math.max(scene.duration, 0.5);
  const maxText = w * 0.8;

  ctx.globalAlpha = 1 - outT;
  switch (scene.kind) {
    case "media": {
      if (asset) drawCover(ctx, asset, 0, 0, w, h, 1.05 + progress * 0.15, (progress - 0.5) * 0.6, 0);
      if (scene.heading || scene.body) {
        const grad = ctx.createLinearGradient(0, h * 0.55, 0, h);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.6)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, h * 0.55, w, h * 0.45);
        ctx.globalAlpha = inT * (1 - outT);
        const y = drawText(ctx, scene.heading, w / 2, h * 0.72 + (1 - inT) * 30 * unit, { size: 72 * unit, font: f.heading, weight: 700, color: "#ffffff", maxWidth: maxText });
        drawText(ctx, scene.body, w / 2, y + 12 * unit, { size: 40 * unit, font: f.body, weight: 400, color: "#ffffff", maxWidth: maxText });
      }
      break;
    }
    case "ui": {
      const pw = w * 0.7;
      const ph = h * 0.5;
      const px = (w - pw) / 2;
      const py = h * 0.36 + (1 - inT) * 60 * unit;
      ctx.globalAlpha = inT * (1 - outT);
      drawText(ctx, scene.heading, w / 2, h * 0.1, { size: 64 * unit, font: f.heading, weight: 700, color: c.foreground, maxWidth: maxText });
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 40 * unit;
      roundRect(ctx, px, py, pw, ph, 24 * unit);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();
      if (asset) {
        ctx.save();
        roundRect(ctx, px, py, pw, ph, 24 * unit);
        ctx.clip();
        drawCover(ctx, asset, px, py, pw, ph);
        ctx.restore();
      } else {
        ctx.fillStyle = c.accent;
        roundRect(ctx, px + 32 * unit, py + 32 * unit, pw * 0.3, 28 * unit, 8 * unit);
        ctx.fill();
        ctx.fillStyle = "#e5e7eb";
        for (let i = 0; i < 4; i++) {
          roundRect(ctx, px + 32 * unit, py + (96 + i * 56) * unit, pw * (0.8 - i * 0.12), 24 * unit, 8 * unit);
          ctx.fill();
        }
      }
      // A pointer moves to the button and clicks.
      const bx = px + pw * 0.72;
      const by = py + ph * 0.78;
      ctx.fillStyle = c.accent;
      roundRect(ctx, bx - 90 * unit, by - 26 * unit, 180 * unit, 52 * unit, 26 * unit);
      ctx.fill();
      drawText(ctx, scene.body, bx, by - 14 * unit, { size: 24 * unit, font: f.body, weight: 600, color: "#ffffff", maxWidth: 170 * unit });
      const move = ease((t - 0.6) / 1.2);
      const cx = px + pw * 0.3 + (bx - px - pw * 0.3) * move;
      const cy = py + ph * 0.3 + (by - py - ph * 0.3) * move;
      if (t > 1.8 && t < 2.3) {
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 4 * unit;
        ctx.beginPath();
        ctx.arc(bx, by, (t - 1.8) * 160 * unit, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 26 * unit, cy + 30 * unit);
      ctx.lineTo(cx + 10 * unit, cy + 30 * unit);
      ctx.lineTo(cx, cy + 42 * unit);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "logo": {
      const s = 0.6 + 0.4 * ease(t / 1.2);
      ctx.globalAlpha = ease(t / 0.9) * (1 - outT);
      ctx.save();
      ctx.translate(w / 2, h * 0.45);
      ctx.scale(s, s);
      if (asset) drawContain(ctx, asset, 0, 0, w * 0.4, h * 0.3);
      else {
        ctx.fillStyle = c.accent;
        ctx.beginPath();
        ctx.arc(0, 0, 110 * unit, 0, Math.PI * 2);
        ctx.fill();
        drawText(ctx, (scene.heading || "•").slice(0, 1).toUpperCase(), 0, -60 * unit, { size: 120 * unit, font: f.heading, weight: 800, color: c.background, maxWidth: 200 * unit });
      }
      ctx.restore();
      ctx.globalAlpha = ease((t - 0.6) / 0.8) * (1 - outT);
      drawText(ctx, asset ? scene.body : scene.heading, w / 2, h * 0.68, { size: 56 * unit, font: f.heading, weight: 700, color: c.foreground, maxWidth: maxText });
      break;
    }
    case "title": {
      ctx.globalAlpha = inT * (1 - outT);
      const y = drawText(ctx, scene.heading, w / 2, h * 0.33 + (1 - inT) * 40 * unit, { size: 96 * unit, font: f.heading, weight: 800, color: c.foreground, maxWidth: maxText });
      if (scene.body) {
        ctx.globalAlpha = ease((t - 0.5) / 0.6) * (1 - outT);
        ctx.font = `600 ${40 * unit}px ${f.body}`;
        const bw = Math.min(ctx.measureText(scene.body).width + 96 * unit, maxText);
        ctx.fillStyle = c.accent;
        roundRect(ctx, w / 2 - bw / 2, y + 48 * unit, bw, 88 * unit, 44 * unit);
        ctx.fill();
        drawText(ctx, scene.body, w / 2, y + 70 * unit, { size: 40 * unit, font: f.body, weight: 600, color: c.background, maxWidth: bw - 40 * unit });
      }
      break;
    }
    default: {
      // Text animation: words rise in one after another.
      ctx.font = `800 ${88 * unit}px ${f.heading}`;
      const lines = wrap(ctx, scene.heading, maxText);
      const lh = 88 * unit * 1.2;
      let y = h / 2 - (lines.length * lh) / 2 - (scene.body ? 40 * unit : 0);
      let wordIndex = 0;
      for (const line of lines) {
        const words = line.split(" ");
        const total = ctx.measureText(line).width;
        let x = w / 2 - total / 2;
        for (const word of words) {
          const a = ease((t - wordIndex * 0.12) / 0.5);
          ctx.globalAlpha = a * (1 - outT);
          ctx.fillStyle = wordIndex % 4 === 3 ? c.accent : c.foreground;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(word, x, y + (1 - a) * 30 * unit);
          x += ctx.measureText(`${word} `).width;
          wordIndex++;
        }
        y += lh;
      }
      ctx.globalAlpha = ease((t - 0.8) / 0.6) * (1 - outT);
      drawText(ctx, scene.body, w / 2, y + 24 * unit, { size: 44 * unit, font: f.body, weight: 400, color: c.foreground, maxWidth: maxText });
    }
  }
  ctx.globalAlpha = 1;
}

/** Draws the frame at `time` seconds into the whole video. */
export function drawFrame(ctx: CanvasRenderingContext2D, draft: Draft, time: number, kit: KitSnapshot | null, assets: Assets) {
  const at = sceneAt(draft.scenes, time);
  if (!at) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }
  drawScene(ctx, draft.scenes[at.index]!, at.local, kit, assets);
}

/** Loads every image and clip a draft shows. */
export async function loadAssets(draft: Draft, kit: KitSnapshot | null, urlFor: (id: string) => string, known?: Assets): Promise<Assets> {
  const assets: Assets = new Map(known);
  const wanted = new Map<string, "image" | "video">();
  for (const s of draft.scenes) if (s.mediaId) wanted.set(s.mediaId, s.mediaType === "video" ? "video" : "image");
  for (const a of kit?.assets ?? []) if (!wanted.has(a.id)) wanted.set(a.id, "image");
  await Promise.all(
    [...wanted].map(async ([id, type]) => {
      if (assets.has(id)) return;
      try {
        if (type === "video") {
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.preload = "auto";
          video.src = urlFor(id);
          await new Promise<void>((resolve) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => resolve();
          });
          assets.set(id, video);
        } else {
          const img = new Image();
          img.src = urlFor(id);
          await img.decode();
          assets.set(id, img);
        }
      } catch {
        // A file that can't load is left out of the frame.
      }
    }),
  );
  return assets;
}

/** Seeks each clip to where its scene is at `time`; resolves once the frames are ready. */
export async function seekClips(draft: Draft, time: number, assets: Assets) {
  const at = sceneAt(draft.scenes, time);
  if (!at) return;
  const scene = draft.scenes[at.index]!;
  if (scene.mediaType !== "video" || !scene.mediaId) return;
  const video = assets.get(scene.mediaId);
  if (!(video instanceof HTMLVideoElement) || !video.duration) return;
  const target = Math.min(scene.footageStart + at.local * scene.footageSpeed, video.duration - 0.05);
  if (Math.abs(video.currentTime - target) < 0.01) return;
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = target;
  });
}
