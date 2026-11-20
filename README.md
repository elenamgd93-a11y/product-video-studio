# Product Video Studio

Make branded product videos: describe one and an AI agent drafts it as scenes, then refine it by chat or on a timeline, share a link and export MP4.

Inspired by https://arcade.software

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Keep shared brand kits with colours, fonts, logos and assets, voice and tone, and pronunciations.
- Describe a video, pick a kit, quality, length and aspect ratio, and get a scene-by-scene draft.
- Edit scenes on a timeline with a live player: add, reorder, resize, duplicate, delete, restyle, voiceovers, captions and music.
- Ask for changes in chat; each AI change is a numbered version you can preview, restore and rate.
- Save scenes to a workspace library and insert them into any video; admins can restrict saving to admins.
- Publish a public or members-only share link with a chosen preview image.
- Export MP4 at 1080p or 4K and 24, 30 or 60 fps, with an export history.
- Find videos by title, organise them into shared or personal projects, and rename, duplicate or delete them.

Left out: accounts and sign-in, which your Gateway handles; the screen-capture browser extension; credits, plans and billing; interactive demos; posting to social networks; connected apps and plugins; building kits from a website; templates and memory; AI-generated footage and music; enterprise administration.

## Setup

Install and run locally:

```sh
pnpm install
pnpm dev
```

Test: `pnpm test` runs the unit tests; `checks/` holds the browser and request suites run against a packaged release.

Deploy to your Gateway with `pnpm run deploy`, or install a release with `pnpm everyapp install <repository url>`. The deploy creates the D1 database and the R2 bucket; R2 must be enabled on the Cloudflare account once.

Optional: AI drafts, chat edits and voiceovers use OpenAI through the Gateway. Add the key with `pnpm everyapp provider add openai` ([get a key](https://platform.openai.com/api-keys)). Without it, blank videos, manual editing, sharing and export all work. There are no other secrets or settings.

## Limitations

- Export renders in the browser with WebCodecs: it needs a recent Chrome or Edge, and the tab must stay open until the download starts. Audio is included when the browser can encode Opus.
- One export or upload can be at most about 95 MB, so long 4K exports may not store.
- Fonts are a fixed list of system families, so a video can look slightly different on another computer.
- The quality tiers use gpt-5-nano, gpt-5-mini and gpt-5; voiceovers use gpt-4o-mini-tts. Real AI calls and a real deployment were not part of the local checks, which use a local stand-in for the AI provider.
