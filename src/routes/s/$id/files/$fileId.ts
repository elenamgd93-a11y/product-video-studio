import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { routeMember, UUID } from "@/server/http";
import { serveFile } from "@/server/storage";
import { sharedFileIds, sharedVideo } from "@/server/studio";

/** Public: a file the published video uses, for whoever may open its share link. */
export const Route = createFileRoute("/s/$id/files/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string; fileId: string } }) => {
        const notFound = new Response("Not found", { status: 404 });
        if (!UUID.test(params.fileId)) return notFound;
        const shared = await sharedVideo(await routeMember(request), params.id);
        if (!shared || !sharedFileIds(shared).has(params.fileId)) return notFound;
        const [row] = await db.select().from(media).where(eq(media.id, params.fileId));
        if (!row) return notFound;
        return serveFile(row);
      },
    },
  },
});
