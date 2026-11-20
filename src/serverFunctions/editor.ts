import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aiStatus } from "@/server/ai";
import { getSettings } from "@/server/users";
import * as kits from "@/server/kits";
import { listLibrary } from "@/server/storage";
import * as studio from "@/server/studio";
import * as videos from "@/server/videos";
import { memberMiddleware } from "./member";

const videoRef = (data: unknown) => z.object({ videoId: z.string() }).strict().parse(data);
const versionRef = (data: unknown) =>
  z.object({ videoId: z.string(), number: z.number().int().min(1) }).strict().parse(data);

export const getEditor = createServerFn()
  .middleware([memberMiddleware])
  .validator(videoRef)
  .handler(async ({ data, context: { member } }) => {
    const row = await videos.requireVideo(member, data.videoId);
    const video = videos.videoView(row);
    const published = row.published ? (JSON.parse(row.published) as studio.Published) : null;
    const [versionList, chat, library, saved, exportList, ai, settings, kitList] = await Promise.all([
      videos.listVersions(member, data.videoId),
      studio.listMessages(member, data.videoId),
      listLibrary(member),
      studio.listSavedScenes(member),
      studio.listExports(member, data.videoId),
      aiStatus(),
      getSettings(member.orgId),
      kits.listKits(member),
    ]);
    return {
      video,
      published,
      versions: versionList,
      chat,
      library,
      saved,
      exports: exportList,
      ai,
      canSaveScenes: !settings.adminOnlySavedScenes || member.admin,
      kitCount: kitList.length,
    };
  });

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => videos.saveDraftInput.parse(data))
  .handler(({ data, context }) => videos.saveDraft(context.member, data));

export const renameVideo = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => z.object({ id: z.string(), title: videos.titleInput }).strict().parse(data))
  .handler(async ({ data, context }) => {
    await videos.updateVideo(context.member, data);
    return { ok: true };
  });

export const getVersion = createServerFn()
  .middleware([memberMiddleware])
  .validator(versionRef)
  .handler(({ data, context }) => videos.getVersion(context.member, data));

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(versionRef)
  .handler(({ data, context }) => videos.restoreVersion(context.member, data));

export const sendChat = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => studio.chatInput.parse(data))
  .handler(({ data, context }) => studio.chat(context.member, data));

export const rateMessage = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => studio.rateInput.parse(data))
  .handler(({ data, context }) => studio.rate(context.member, data));

export const makeVoiceover = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => z.object({ videoId: z.string(), sceneId: z.string() }).strict().parse(data))
  .handler(({ data, context }) => studio.voiceover(context.member, data));

export const insertSavedScene = createServerFn()
  .middleware([memberMiddleware])
  .validator((data: unknown) => z.object({ id: z.string() }).strict().parse(data))
  .handler(({ data, context }) => studio.savedSceneCopy(context.member, data.id));

export const publishVideo = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => studio.publishInput.parse(data))
  .handler(({ data, context }) => studio.publish(context.member, data));

export const updateShare = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => studio.shareSettingsInput.parse(data))
  .handler(({ data, context }) => studio.updateShare(context.member, data));

export const findExport = createServerFn()
  .middleware([memberMiddleware])
  .validator((data: unknown) => studio.exportSettingsInput.parse(data))
  .handler(({ data, context }) => studio.reusableExport(context.member, data));
