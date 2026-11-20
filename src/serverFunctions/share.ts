import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { sharedVideo } from "@/server/studio";
import { toMember } from "@/server/users";

/** A share link's page data. Public: the viewer may be anyone, so it checks the share setting itself. */
export const getShared = createServerFn()
  .validator((data: unknown) => z.object({ id: z.string().max(64) }).strict().parse(data))
  .handler(async ({ data }) => {
    const request = getRequest();
    const user = await getEveryAppUser(request, env);
    const shared = await sharedVideo(user ? toMember(user) : null, data.id);
    if (!shared) return null;
    const origin = new URL(request.url).origin;
    return {
      ...shared,
      previewUrl: shared.previewMediaId ? `${origin}/s/${shared.id}/files/${shared.previewMediaId}` : null,
      url: `${origin}/s/${shared.id}`,
    };
  });
