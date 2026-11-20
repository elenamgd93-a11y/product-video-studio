import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "product-video-studio",
  name: "Product Video Studio",
  description: "Make branded product videos from a prompt, edit them scene by scene, then share a link or export MP4.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    // Kits, videos, versions, chat, saved scenes and exports.
    d1: ["DB"],
    // Uploads, logos, voiceovers, music, preview images and exported MP4s.
    r2: ["files"],
  },
  // Share links: the page, the files its video plays, and the scripts the page loads.
  public: [
    { path: "/s/:id", methods: ["GET"] },
    { path: "/s/:id/files/:fileId", methods: ["GET"] },
  ],
  publicAssets: ["/assets/**", "/icon.svg"],
  providers: [
    {
      id: "openai",
      why: "Drafts and revises videos from a description and synthesises voiceovers.",
      docs: "https://platform.openai.com/api-keys",
    },
  ],
  ai: {
    models: ["gpt-5-nano", "gpt-5-mini", "gpt-5", "gpt-4o-mini-tts"],
  },
  features: {
    ai: {
      name: "AI drafts and voiceovers",
      why: "Drafts videos from a description, edits them by chat and reads scripts aloud.",
      providers: ["openai"],
    },
  },
});
