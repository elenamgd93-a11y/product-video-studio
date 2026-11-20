import { createFileRoute } from "@tanstack/react-router";
import { asMember } from "@/server/http";
import * as studio from "@/server/studio";

/** Publishes the current draft to the share link, optionally setting who may open it. */
export const Route = createFileRoute("/api/videos/$id/publish")({
  server: {
    handlers: {
      POST: ({ request, params }: { request: Request; params: { id: string } }) =>
        asMember(request, async (member) => {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          return studio.publish(member, studio.publishInput.parse({ ...body, id: params.id }));
        }),
    },
  },
});
