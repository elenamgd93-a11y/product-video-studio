import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as kits from "@/server/kits";
import * as projects from "@/server/projects";
import { listLibrary } from "@/server/storage";
import { getSettings, setAdminOnlySavedScenes } from "@/server/users";
import * as videos from "@/server/videos";
import * as studio from "@/server/studio";
import { aiStatus } from "@/server/ai";
import { memberMiddleware } from "./member";

const id = (data: unknown) => z.object({ id: z.string() }).strict().parse(data);

export const getHome = createServerFn()
  .middleware([memberMiddleware])
  .validator((data: unknown) => videos.listVideosInput.parse(data ?? {}))
  .handler(async ({ data, context: { member } }) => {
    const [list, projectList, kitList, library, ai] = await Promise.all([
      videos.listVideos(member, data),
      projects.listProjects(member),
      kits.listKits(member),
      listLibrary(member),
      aiStatus(),
    ]);
    return { videos: list, projects: projectList, kits: kitList, library, ai, me: member.id };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => projects.createProjectInput.parse(data))
  .handler(({ data, context }) => projects.createProject(context.member, data));

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(id)
  .handler(({ data, context }) => projects.deleteProject(context.member, data.id));

export const createBlankVideo = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => videos.createBlankInput.parse(data))
  .handler(({ data, context }) => videos.createBlank(context.member, data));

export const generateVideo = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => studio.generateInput.parse(data))
  .handler(({ data, context }) => studio.generateVideo(context.member, data));

export const updateVideo = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => videos.updateVideoInput.parse(data))
  .handler(async ({ data, context }) => {
    await videos.updateVideo(context.member, data);
    return { ok: true };
  });

export const duplicateVideo = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(id)
  .handler(({ data, context }) => videos.duplicateVideo(context.member, data.id));

export const deleteVideo = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(id)
  .handler(({ data, context }) => videos.deleteVideo(context.member, data.id));

// Brand kits.

export const getKits = createServerFn()
  .middleware([memberMiddleware])
  .handler(({ context }) => kits.listKits(context.member));

export const getKit = createServerFn()
  .middleware([memberMiddleware])
  .validator(id)
  .handler(({ data, context }) => kits.getKit(context.member, data.id));

export const createKit = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => kits.createKitInput.parse(data))
  .handler(({ data, context }) => kits.createKit(context.member, data));

export const updateKit = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => kits.updateKitInput.parse(data))
  .handler(({ data, context }) => kits.updateKit(context.member, data));

export const deleteKit = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(id)
  .handler(({ data, context }) => kits.deleteKit(context.member, data.id));

export const setAssetKind = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) =>
    z.object({ id: z.string(), kind: z.enum(["logo", "background", "product", "other"]) }).strict().parse(data),
  )
  .handler(({ data, context }) => kits.setAssetKind(context.member, data));

export const removeAsset = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(id)
  .handler(({ data, context }) => kits.removeAsset(context.member, data.id));

// Saved scenes.

export const getSavedScenes = createServerFn()
  .middleware([memberMiddleware])
  .handler(async ({ context: { member } }) => ({
    scenes: await studio.listSavedScenes(member),
    settings: await getSettings(member.orgId),
    admin: member.admin,
  }));

export const saveScene = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => studio.saveSceneInput.parse(data))
  .handler(({ data, context }) => studio.saveScene(context.member, data));

export const renameSavedScene = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => studio.renameSceneInput.parse(data))
  .handler(({ data, context }) => studio.renameSavedScene(context.member, data));

export const deleteSavedScene = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(id)
  .handler(({ data, context }) => studio.deleteSavedScene(context.member, data.id));

export const setAdminOnly = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => z.object({ value: z.boolean() }).strict().parse(data))
  .handler(({ data, context }) => setAdminOnlySavedScenes(context.member, data.value));
