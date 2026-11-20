import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Layers, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { NameDialog } from "@/client/components/NameDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Label } from "@/client/components/ui/label";
import { Switch } from "@/client/components/ui/switch";
import { errorText } from "@/client/lib/upload";
import { SCENE_KIND_LABELS } from "@/lib/video";
import { deleteSavedScene, getSavedScenes, renameSavedScene, setAdminOnly } from "@/serverFunctions/library";

export const Route = createFileRoute("/scenes")({
  loader: () => getSavedScenes(),
  head: () => ({ meta: [{ title: "Saved scenes" }] }),
  component: SavedScenes,
});

function SavedScenes() {
  const { scenes, settings, admin } = Route.useLoaderData();
  const router = useRouter();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AppShell>
      <PageHeader title="Saved scenes" />
      {admin ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="admin-only">Only admins can save new scenes</Label>
            <Switch
              id="admin-only"
              data-testid="admin-only-switch"
              checked={settings.adminOnlySavedScenes}
              onCheckedChange={async (value) => {
                try {
                  await setAdminOnly({ data: { value } });
                  await router.invalidate();
                } catch (e) {
                  toast.error(errorText(e));
                }
              }}
            />
          </CardContent>
        </Card>
      ) : settings.adminOnlySavedScenes ? (
        <p className="text-sm text-muted-foreground" data-testid="admin-only-note">
          Only admins can save new scenes in this workspace.
        </p>
      ) : null}
      {scenes.length === 0 ? (
        <EmptyState icon={Layers} title="No saved scenes yet" description="Save a scene from a video's design panel and it will appear here." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map(({ id, name, scene }) => (
            <li key={id} data-testid="saved-scene" className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex aspect-video items-center justify-center p-4 text-center font-semibold" style={{ background: scene.colors.background, color: scene.colors.foreground }}>
                <span className="line-clamp-2">{scene.heading}</span>
              </div>
              <div className="flex items-center gap-1 p-2 pl-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" data-testid="saved-scene-name">
                    {name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {SCENE_KIND_LABELS[scene.kind]} · {scene.duration}s
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Rename ${name}`} data-testid="rename-saved-scene" onClick={() => setRenaming({ id, name })}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} data-testid="delete-saved-scene" onClick={() => setDeleting({ id, name })}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {renaming ? (
        <NameDialog
          title="Rename scene"
          initial={renaming.name}
          submitLabel="Rename"
          onClose={() => setRenaming(null)}
          onSubmit={async (name) => {
            try {
              await renameSavedScene({ data: { id: renaming.id, name } });
              setRenaming(null);
              await router.invalidate();
            } catch (e) {
              toast.error(errorText(e));
            }
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setPending(true);
            try {
              await deleteSavedScene({ data: { id: deleting.id } });
              setDeleting(null);
              await router.invalidate();
            } catch (e) {
              toast.error(errorText(e));
            } finally {
              setPending(false);
            }
          }}
        >
          Videos that already use it keep their copy.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
