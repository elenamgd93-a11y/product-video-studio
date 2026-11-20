import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { errorText, uploadFile } from "@/client/lib/upload";
import { ASSET_KINDS, COLOR_ROLES, FONT_NAMES, FONTS, type KitContent } from "@/lib/video";
import { deleteKit, getKit, removeAsset, setAssetKind, updateKit } from "@/serverFunctions/library";

export const Route = createFileRoute("/kits/$kitId")({
  loader: ({ params }) => getKit({ data: { id: params.kitId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.name ?? "Brand kit" }] }),
  component: KitEditor,
});

function KitEditor() {
  const kit = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [name, setName] = useState(kit.name);
  const [content, setContent] = useState<KitContent>({
    colors: kit.colors,
    headingFont: kit.headingFont,
    bodyFont: kit.bodyFont,
    voice: kit.voice,
    pronunciations: kit.pronunciations,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<"ask" | "pending" | null>(null);
  const [uploadKind, setUploadKind] = useState<(typeof ASSET_KINDS)[number]>("logo");
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (change: Partial<KitContent>) => setContent((c) => ({ ...c, ...change }));

  async function save() {
    setSaving(true);
    try {
      await updateKit({
        data: { id: kit.id, name, content: { ...content, pronunciations: content.pronunciations.filter((p) => p.term.trim() && p.spoken.trim()) } },
      });
      toast.success("Kit saved");
      await router.invalidate();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        backLink={
          <Link to="/kits" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden /> Brand kits
          </Link>
        }
        title={kit.name}
        actions={
          <>
            <Button variant="outline" data-testid="delete-kit" onClick={() => setDeleting("ask")}>
              <Trash2 /> Delete
            </Button>
            <Button data-testid="save-kit" pending={saving} disabled={!name.trim()} onClick={save}>
              Save
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-2">
          <Label htmlFor="kit-name">Name</Label>
          <Input id="kit-name" data-testid="kit-name-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Colours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {content.colors.map((color, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2" data-testid="color-row">
              <input
                type="color"
                aria-label={`Colour ${i + 1}`}
                value={/^#[0-9a-fA-F]{6}$/.test(color.hex) ? color.hex : "#000000"}
                onChange={(e) => set({ colors: content.colors.map((c, j) => (j === i ? { ...c, hex: e.target.value } : c)) })}
                className="h-9 w-10 cursor-pointer rounded-md border border-border bg-transparent"
              />
              <Input
                aria-label={`Hex ${i + 1}`}
                data-testid="color-hex"
                className="w-28 font-mono"
                value={color.hex}
                onChange={(e) => set({ colors: content.colors.map((c, j) => (j === i ? { ...c, hex: e.target.value } : c)) })}
              />
              <Input
                aria-label={`Colour name ${i + 1}`}
                data-testid="color-name"
                className="w-40"
                value={color.name}
                placeholder="Name"
                onChange={(e) => set({ colors: content.colors.map((c, j) => (j === i ? { ...c, name: e.target.value } : c)) })}
              />
              <NativeSelect
                aria-label={`Role ${i + 1}`}
                data-testid="color-role"
                value={color.role}
                onChange={(e) =>
                  set({ colors: content.colors.map((c, j) => (j === i ? { ...c, role: e.target.value as (typeof COLOR_ROLES)[number] } : c)) })
                }
              >
                {COLOR_ROLES.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {r[0]!.toUpperCase() + r.slice(1)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove colour ${i + 1}`} onClick={() => set({ colors: content.colors.filter((_, j) => j !== i) })}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" data-testid="add-color" onClick={() => set({ colors: [...content.colors, { name: "", hex: "#888888", role: "other" }] })}>
            <Plus /> Add colour
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fonts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {(["headingFont", "bodyFont"] as const).map((field) => (
            <div key={field} className="grid gap-1.5">
              <Label htmlFor={field}>{field === "headingFont" ? "Headings" : "Body"}</Label>
              <NativeSelect id={field} data-testid={field} value={content[field]} onChange={(e) => set({ [field]: e.target.value } as Partial<KitContent>)} className="w-full">
                {FONT_NAMES.map((f) => (
                  <NativeSelectOption key={f} value={f}>
                    {f}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-lg" style={{ fontFamily: FONTS[content[field]] }}>
                The quick brown fox
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logos and assets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {kit.assets.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {kit.assets.map((asset) => (
                <li key={asset.id} data-testid="kit-asset" className="flex items-center gap-3 rounded-lg border border-border p-2">
                  <img src={`/files/${asset.id}`} alt={asset.name} className="size-12 rounded bg-muted object-contain" />
                  <span className="min-w-0 flex-1 truncate text-sm">{asset.name}</span>
                  <NativeSelect
                    size="sm"
                    aria-label={`Type of ${asset.name}`}
                    value={asset.kind}
                    onChange={async (e) => {
                      await setAssetKind({ data: { id: asset.id, kind: e.target.value as (typeof ASSET_KINDS)[number] } });
                      await router.invalidate();
                    }}
                  >
                    {ASSET_KINDS.map((k) => (
                      <NativeSelectOption key={k} value={k}>
                        {k[0]!.toUpperCase() + k.slice(1)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${asset.name}`}
                    onClick={async () => {
                      await removeAsset({ data: { id: asset.id } });
                      await router.invalidate();
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect aria-label="Asset type" data-testid="asset-kind" value={uploadKind} onChange={(e) => setUploadKind(e.target.value as (typeof ASSET_KINDS)[number])}>
              {ASSET_KINDS.map((k) => (
                <NativeSelectOption key={k} value={k}>
                  {k[0]!.toUpperCase() + k.slice(1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload /> Upload PNG, JPG or SVG
            </Button>
            <input
              ref={fileInput}
              type="file"
              hidden
              data-testid="asset-upload"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  await uploadFile(file, { purpose: "kit", kitId: kit.id, assetKind: uploadKind });
                  await router.invalidate();
                } catch (err) {
                  toast.error(errorText(err));
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voice and tone</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Voice and tone"
            data-testid="kit-voice"
            rows={4}
            value={content.voice}
            maxLength={4000}
            placeholder="Warm, direct and a little playful. Short sentences. No jargon."
            onChange={(e) => set({ voice: e.target.value })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pronunciations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {content.pronunciations.map((p, i) => (
            <div key={i} className="flex items-center gap-2" data-testid="pronunciation-row">
              <Input
                aria-label={`Term ${i + 1}`}
                data-testid="pronunciation-term"
                placeholder="Term"
                value={p.term}
                onChange={(e) => set({ pronunciations: content.pronunciations.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)) })}
              />
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
              <Input
                aria-label={`Spoken as ${i + 1}`}
                data-testid="pronunciation-spoken"
                placeholder="Spoken as"
                value={p.spoken}
                onChange={(e) => set({ pronunciations: content.pronunciations.map((x, j) => (j === i ? { ...x, spoken: e.target.value } : x)) })}
              />
              <Button variant="ghost" size="icon-sm" aria-label={`Remove pronunciation ${i + 1}`} onClick={() => set({ pronunciations: content.pronunciations.filter((_, j) => j !== i) })}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" data-testid="add-pronunciation" onClick={() => set({ pronunciations: [...content.pronunciations, { term: "", spoken: "" }] })}>
            <Plus /> Add pronunciation
          </Button>
        </CardContent>
      </Card>

      {deleting ? (
        <ConfirmDialog
          title={`Delete "${kit.name}"?`}
          confirmLabel="Delete kit"
          destructive
          pending={deleting === "pending"}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setDeleting("pending");
            try {
              await deleteKit({ data: { id: kit.id } });
              await navigate({ to: "/kits" });
            } catch (e) {
              toast.error(errorText(e));
              setDeleting(null);
            }
          }}
        >
          Videos already made with it keep their copy.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
