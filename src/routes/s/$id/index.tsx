import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback } from "react";
import { PageHeader } from "@/client/components/PageHeader";
import { Player } from "@/client/components/Player";
import { getShared } from "@/serverFunctions/share";

/** A share link: the last published version, for whoever the share setting lets in. */
export const Route = createFileRoute("/s/$id/")({
  loader: async ({ params }) => {
    const shared = await getShared({ data: { id: params.id } });
    if (!shared) throw notFound();
    return shared;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: loaderData.title },
          { property: "og:title", content: loaderData.title },
          { property: "og:type", content: "video.other" },
          { property: "og:url", content: loaderData.url },
          ...(loaderData.previewUrl
            ? [
                { property: "og:image", content: loaderData.previewUrl },
                { name: "twitter:card", content: "summary_large_image" },
              ]
            : []),
        ]
      : [],
  }),
  notFoundComponent: () => (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
    </main>
  ),
  component: SharedVideo,
});

function SharedVideo() {
  const shared = Route.useLoaderData();
  const fileUrl = useCallback((fileId: string) => `/s/${shared.id}/files/${fileId}`, [shared.id]);
  return (
    <div className="h-dvh overflow-y-auto">
      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10" data-testid="shared-video">
        <PageHeader title={shared.title} />
        <Player draft={shared.draft} kit={shared.kit} aspect={shared.aspect} fileUrl={fileUrl} />
      </main>
    </div>
  );
}
