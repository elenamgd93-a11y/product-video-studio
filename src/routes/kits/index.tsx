import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Palette, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { NameDialog } from "@/client/components/NameDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { errorText } from "@/client/lib/upload";
import { createKit, getKits } from "@/serverFunctions/library";

export const Route = createFileRoute("/kits/")({
  loader: () => getKits(),
  head: () => ({ meta: [{ title: "Brand kits" }] }),
  component: Kits,
});

function Kits() {
  const kits = Route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  return (
    <AppShell>
      <PageHeader
        title="Brand kits"
        actions={
          <Button data-testid="new-kit" onClick={() => setCreating(true)}>
            <Plus /> New kit
          </Button>
        }
      />
      {kits.length === 0 ? (
        <EmptyState icon={Palette} title="No brand kits yet" description="Create one to give videos your colours, fonts, logo and voice." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kits.map((kit) => (
            <li key={kit.id} data-testid="kit-card">
              <Link
                to="/kits/$kitId"
                params={{ kitId: kit.id }}
                className="block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-ring"
              >
                <div className="flex h-28 items-center justify-center bg-muted p-4">
                  {kit.logoId ? (
                    <img src={`/files/${kit.logoId}`} alt={`${kit.name} logo`} className="max-h-full max-w-full object-contain" data-testid="kit-logo" />
                  ) : (
                    <Palette className="size-8 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="truncate font-medium" data-testid="kit-name">
                    {kit.name}
                  </span>
                  <span className="flex shrink-0 -space-x-1">
                    {kit.colors.slice(0, 5).map((c, i) => (
                      <span key={i} className="size-4 rounded-full border border-border" style={{ background: c.hex }} />
                    ))}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <NameDialog
          title="New brand kit"
          submitLabel="Create kit"
          onClose={() => setCreating(false)}
          onSubmit={async (name) => {
            try {
              const { id } = await createKit({ data: { name } });
              await navigate({ to: "/kits/$kitId", params: { kitId: id } });
            } catch (e) {
              toast.error(errorText(e));
            }
          }}
        />
      ) : null}
    </AppShell>
  );
}
