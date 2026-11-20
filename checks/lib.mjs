// Shared pieces for the suites: a local fake of the AI provider behind the
// Gateway binding, and small media files made in memory.
import zlib from "node:zlib";

const FAKE_GATEWAY = `
const draft = {
  title: "Order Ahead Launch",
  scenes: [
    { kind: "text", heading: "Skip the morning line", body: "", script: "Mornings are busy. Your coffee shouldn't wait.", duration: 3, tone: "light", media: null },
    { kind: "ui", heading: "Order in two taps", body: "Place order", script: "Pick your drink, tap once, and it's on the way.", duration: 4, tone: "light", media: null },
    { kind: "logo", heading: "Northwind Coffee", body: "Fresh every morning", script: "Northwind Coffee.", duration: 3, tone: "dark", media: null },
    { kind: "title", heading: "Order ahead", body: "Get the app", script: "Order ahead today.", duration: 5, tone: "accent", media: null },
  ],
};
function chat(content) {
  return Response.json({ id: "fake", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }] });
}
function wav() {
  const rate = 8000, n = rate / 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 3000), true);
  return buf;
}
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/v1/models")) return Response.json({ object: "list", data: [] });
  if (url.pathname.endsWith("/v1/audio/speech")) return new Response(wav(), { headers: { "content-type": "audio/mpeg" } });
  if (url.pathname.endsWith("/v1/chat/completions")) {
    const body = await request.json();
    const system = body.messages[0].content, user = body.messages[1].content;
    if (system.startsWith("You write")) return chat(draft);
    const scenes = JSON.parse(user.match(/Scenes: (\\[.*\\])/)[1]).map((s) => ({ ...s, tone: "light", media: null }));
    if (user.includes("wasn't right")) {
      scenes[0].heading = "Your morning, sorted";
      return chat({ title: "Order Ahead Launch", reply: "Warmed up the opening line.", scenes });
    }
    scenes[scenes.length - 1].heading = "Order ahead today";
    return chat({ title: "Order Ahead Launch", reply: "The closing scene now says Order ahead today.", scenes });
  }
  return Response.json({ code: "not_found" }, { status: 404 });
} };`;

/** startRuntime options that put the fake AI provider behind the Gateway binding. */
export const withFakeAi = {
  bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "fake-ai-gateway" } },
  workers: [
    {
      config: {
        name: "fake-ai-gateway",
        compatibilityDate: "2026-06-01",
        manifest: { mainModule: "fake.mjs", modules: { "fake.mjs": { type: "esm", contents: Buffer.from(FAKE_GATEWAY) } } },
      },
    },
  ],
};

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A solid-colour PNG with a lighter stripe, `size` pixels square. */
export function png(size = 64, [r, g, b] = [59, 47, 47]) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const stripe = Math.abs(x - y) < size / 8;
      row.push(stripe ? 230 : r, stripe ? 200 : g, stripe ? 150 : b);
    }
    rows.push(...row);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.from(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** One second of a quiet tone as WAV. */
export function wav() {
  const rate = 8000, n = rate, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / 10) * 2000), 44 + i * 2);
  return buf;
}

export async function json(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON, got ${response.status}: ${text.slice(0, 300)}`);
  }
}

export function step(name) {
  console.log(`- ${name}`);
}
