import { createFileRoute } from "@tanstack/react-router";
import { readableFile } from "@/server/files";
import { asMember, UUID } from "@/server/http";
import { serveFile } from "@/server/storage";

/** A stored file for a member who may read it; `?video=` names the video that uses it. */
export const Route = createFileRoute("/files/$fileId")({
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: { fileId: string } }) =>
        asMember(request, async (member) => {
          const url = new URL(request.url);
          const notFound = new Response("Not found", { status: 404 });
          if (!UUID.test(params.fileId)) return notFound;
          const row = await readableFile(member, params.fileId, url.searchParams.get("video"));
          if (!row) return notFound;
          return serveFile(row, url.searchParams.get("download"));
        }),
    },
  },
});
