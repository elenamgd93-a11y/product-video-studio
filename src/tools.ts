// What AI clients may do here, through the Gateway at /mcp.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { listKits } from "@/server/kits";
import { rememberMember, toMember } from "@/server/users";
import { listVideos } from "@/server/videos";

export const tools = defineTools({
  list_videos: {
    description: "List the videos the user can see, newest first, optionally filtered by a word in the title.",
    risk: "read",
    input: z.object({ search: z.string().max(120).optional() }).strict(),
    handler: async (input, { user }) => {
      const member = toMember(user);
      await rememberMember(member);
      return (await listVideos(member, input)).map(({ id, title, duration, sceneCount, published, projectName }) => ({
        id,
        title,
        seconds: duration,
        scenes: sceneCount,
        published,
        project: projectName,
      }));
    },
  },
  list_brand_kits: {
    description: "List the workspace's brand kits with their colours.",
    risk: "read",
    input: z.object({}).strict(),
    handler: async (_input, { user }) =>
      (await listKits(toMember(user))).map(({ id, name, colors }) => ({ id, name, colors })),
  },
});
