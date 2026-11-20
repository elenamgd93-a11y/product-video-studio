import { createFileRoute } from "@tanstack/react-router";
import { asMember } from "@/server/http";
import * as videos from "@/server/videos";

/** The videos the caller can see, and a new blank video. For scripts with a personal access token. */
export const Route = createFileRoute("/api/videos/")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) =>
        asMember(request, async (member) => {
          const url = new URL(request.url);
          return {
            videos: await videos.listVideos(member, {
              search: url.searchParams.get("search") ?? undefined,
              projectId: url.searchParams.get("project") ?? undefined,
            }),
          };
        }),
      POST: ({ request }: { request: Request }) =>
        asMember(request, async (member) => {
          const created = await videos.createBlank(member, videos.createBlankInput.parse(await request.json()));
          return Response.json(created, { status: 201 });
        }),
    },
  },
});
