import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { asMember } from "@/server/http";
import * as studio from "@/server/studio";
import { Forbidden } from "@/server/users";

const query = z.object({
  resolution: z.enum(["1080p", "4k"]),
  fps: z.coerce.number().pipe(z.union([z.literal(24), z.literal(30), z.literal(60)])),
  revision: z.coerce.number().int().min(1),
});

/** Stores an MP4 the browser rendered from the draft, and lists past exports. */
export const Route = createFileRoute("/api/videos/$id/exports")({
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: { id: string } }) =>
        asMember(request, async (member) => ({ exports: await studio.listExports(member, params.id) })),
      POST: ({ request, params }: { request: Request; params: { id: string } }) =>
        asMember(request, async (member) => {
          const url = new URL(request.url);
          const settings = query.parse(Object.fromEntries(url.searchParams));
          if (request.headers.get("content-type") !== "video/mp4") throw new Forbidden("Send the MP4 as video/mp4.");
          const body = await request.arrayBuffer();
          if (body.byteLength === 0) throw new Forbidden("The export is empty.");
          const saved = await studio.recordExport(member, { videoId: params.id, ...settings }, { body, size: body.byteLength });
          return Response.json(saved, { status: 201 });
        }),
    },
  },
});
