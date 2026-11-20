import { createFileRoute } from "@tanstack/react-router";
import { asMember } from "@/server/http";
import * as videos from "@/server/videos";

type Args = { request: Request; params: { id: string } };

/** One video the caller can see: read it, rename or move it, or delete it. */
export const Route = createFileRoute("/api/videos/$id/")({
  server: {
    handlers: {
      GET: ({ request, params }: Args) =>
        asMember(request, async (member) => videos.videoView(await videos.requireVideo(member, params.id))),
      PATCH: ({ request, params }: Args) =>
        asMember(request, async (member) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (body.draft !== undefined) {
            await videos.saveDraft(member, videos.saveDraftInput.parse({ id: params.id, draft: body.draft }));
            delete body.draft;
          }
          return videos.updateVideo(member, videos.updateVideoInput.parse({ ...body, id: params.id }));
        }),
      DELETE: ({ request, params }: Args) => asMember(request, (member) => videos.deleteVideo(member, params.id)),
    },
  },
});
