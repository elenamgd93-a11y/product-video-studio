import { createFileRoute } from "@tanstack/react-router";
import { asMember } from "@/server/http";
import { kitExists } from "@/server/kits";
import { AUDIO_TYPES, IMAGE_TYPES, LIBRARY_TYPES, storeFile } from "@/server/storage";
import { Forbidden, NotFound } from "@/server/users";
import { requireVideo } from "@/server/videos";

const MAX_BYTES = 95 * 1024 * 1024;

/** Uploads one file: to the member's media library, a brand kit, or a video (music, preview image). */
export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) =>
        asMember(request, async (member) => {
          const form = await request.formData();
          const file = form.get("file");
          const purpose = String(form.get("purpose") ?? "library");
          if (!(file instanceof File)) throw new Forbidden("Choose a file to upload.");
          if (file.size > MAX_BYTES) throw new Forbidden("Files can be at most 95 MB.");
          const type = file.type.toLowerCase();
          if (purpose === "kit") {
            const kitId = String(form.get("kitId") ?? "");
            if (!IMAGE_TYPES.includes(type)) throw new Forbidden("Brand assets must be PNG, JPG or SVG.");
            if (!(await kitExists(member, kitId))) throw new NotFound("No brand kit with that id");
            const kind = String(form.get("assetKind") ?? "other");
            const assetKind = ["logo", "background", "product", "other"].includes(kind) ? kind : "other";
            const row = await storeFile(member, { body: file.stream(), contentType: type, size: file.size, name: file.name }, { purpose, kitId, assetKind });
            return { id: row.id, name: row.name, contentType: row.contentType, kind: assetKind };
          }
          if (purpose === "music" || purpose === "preview") {
            const video = await requireVideo(member, String(form.get("videoId") ?? ""));
            if (purpose === "music" && !AUDIO_TYPES.includes(type)) throw new Forbidden("Music must be an audio file.");
            if (purpose === "preview" && !IMAGE_TYPES.includes(type)) throw new Forbidden("The preview must be PNG, JPG or SVG.");
            const row = await storeFile(member, { body: file.stream(), contentType: type, size: file.size, name: file.name }, { purpose, videoId: video.id });
            return { id: row.id, name: row.name, contentType: row.contentType };
          }
          if (purpose !== "library") throw new Forbidden("Unknown upload purpose.");
          if (!LIBRARY_TYPES.includes(type)) throw new Forbidden("Upload an image or a video clip.");
          const row = await storeFile(member, { body: file.stream(), contentType: type, size: file.size, name: file.name }, { purpose });
          return { id: row.id, name: row.name, contentType: row.contentType };
        }),
    },
  },
});
