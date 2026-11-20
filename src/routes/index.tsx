import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Film, FolderPlus, MoreHorizontal, Paperclip, Search, Sparkles, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { NameDialog } from "@/client/components/NameDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Switch } from "@/client/components/ui/switch";
import { Textarea } from "@/client/components/ui/textarea";
import { errorText, uploadFile } from "@/client/lib/upload";
import { LENGTH_PRESETS, MAX_LENGTH_SECONDS, lengthLabel, type Aspect, type Quality } from "@/lib/video";
import {
  createBlankVideo,
  createProject,
  deleteVideo,
  duplicateVideo,
  generateVideo,
  getHome,
  updateVideo,
} from "@/serverFunctions/library";

const search = z.object({ q: z.string().optional(), project: z.string().optional() });

export const Route = createFileRoute("/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getHome({ data: { search: deps.q, projectId: deps.project } }),
  head: () => ({ meta: [{ title: "Product Video Studio" }] }),
  component: Home,
});

type HomeData = Awaited<ReturnType<typeof getHome>>;

function Home() {
  const data = Route.useLoaderData();
  const { q, project } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [newProject, setNewProject] = useState(false);
  const [shared, setShared] = useState(true);
  const router = useRouter();

  return (
    <AppShell>
      <PageHeader title="Videos" />
      <Composer data={data} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">Recent</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="video-search"
              aria-label="Search by title"
              placeholder="Search by title"
              className="w-56 pl-8"
              defaultValue={q ?? ""}
              onChange={(e) => void navigate({ search: (s) => ({ ...s, q: e.target.value || undefined }), replace: true })}
            />
          </div>
          <NativeSelect
            aria-label="Project"
            data-testid="project-filter"
            value={project ?? ""}
            onChange={(e) => void navigate({ search: (s) => ({ ...s, project: e.target.value || undefined }) })}
          >
            <NativeSelectOption value="">All projects</NativeSelectOption>
            {data.projects.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
                {p.shared ? "" : " (personal)"}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button variant="outline" data-testid="new-project" onClick={() => setNewProject(true)}>
            <FolderPlus /> New project
          </Button>
        </div>
        {data.videos.length === 0 ? (
          <EmptyState
            kind={q || project ? "filtered" : "no-data"}
            icon={Film}
            title={q || project ? "No videos match" : "No videos yet"}
            description={q || project ? undefined : "Describe one above and it will appear here."}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.videos.map((video) => (
              <VideoCard key={video.id} video={video} projects={data.projects} me={data.me} />
            ))}
          </ul>
        )}
      </section>

      {newProject ? (
        <NameDialog
          title="New project"
          submitLabel="Create project"
          onClose={() => setNewProject(false)}
          onSubmit={async (name) => {
            try {
              await createProject({ data: { name, shared } });
              setNewProject(false);
              await router.invalidate();
            } catch (e) {
              toast.error(errorText(e));
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="project-shared">Shared with every member</Label>
            <Switch id="project-shared" data-testid="project-shared" checked={shared} onCheckedChange={setShared} />
          </div>
        </NameDialog>
      ) : null}
    </AppShell>
  );
}

function Composer({ data }: { data: HomeData }) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [kitId, setKitId] = useState(data.kits[0]?.id ?? "");
  const [quality, setQuality] = useState<Quality>("medium");
  const [length, setLength] = useState<string>("30");
  const [custom, setCustom] = useState("90");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [attached, setAttached] = useState<{ id: string; name: string }[]>([]);
  const [library, setLibrary] = useState(data.library);
  const [pending, setPending] = useState<"ai" | "blank" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const seconds = length === "custom" ? Math.round(Number(custom)) : Number(length);
  const lengthOk = seconds >= 5 && seconds <= MAX_LENGTH_SECONDS;
  const projectId = Route.useSearch().project ?? null;

  async function create() {
    setPending("ai");
    setError(null);
    try {
      const { id } = await generateVideo({
        data: { prompt, kitId: kitId || null, quality, lengthSeconds: seconds, aspect, mediaIds: attached.map((a) => a.id), projectId },
      });
      await navigate({ to: "/v/$videoId", params: { videoId: id } });
    } catch (e) {
      setError(errorText(e));
      setPending(null);
    }
  }

  return (
    <Card data-testid="composer">
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="prompt">What should the video show?</Label>
          <Textarea
            id="prompt"
            data-testid="composer-description"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A 30-second walkthrough of our new scheduling feature for busy clinic managers"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Brand kit" id="kit">
            <NativeSelect id="kit" data-testid="composer-kit" value={kitId} onChange={(e) => setKitId(e.target.value)} className="w-full">
              <NativeSelectOption value="">None</NativeSelectOption>
              {data.kits.map((k) => (
                <NativeSelectOption key={k.id} value={k.id}>
                  {k.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Quality" id="quality">
            <NativeSelect id="quality" data-testid="composer-quality" value={quality} onChange={(e) => setQuality(e.target.value as Quality)} className="w-full">
              <NativeSelectOption value="light">Light</NativeSelectOption>
              <NativeSelectOption value="medium">Medium</NativeSelectOption>
              <NativeSelectOption value="high">High</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label="Length" id="length">
            <NativeSelect id="length" data-testid="composer-length" value={length} onChange={(e) => setLength(e.target.value)} className="w-full">
              {LENGTH_PRESETS.map((s) => (
                <NativeSelectOption key={s} value={String(s)}>
                  {lengthLabel(s)}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value="custom">Custom</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label="Aspect ratio" id="aspect">
            <NativeSelect id="aspect" data-testid="composer-aspect" value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} className="w-full">
              <NativeSelectOption value="16:9">16:9 landscape</NativeSelectOption>
              <NativeSelectOption value="1:1">1:1 square</NativeSelectOption>
              <NativeSelectOption value="9:16">9:16 vertical</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
        {length === "custom" ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="custom-length">Seconds</Label>
            <Input
              id="custom-length"
              data-testid="composer-custom-length"
              type="number"
              min={5}
              max={MAX_LENGTH_SECONDS}
              className="w-28"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-invalid={!lengthOk}
            />
            <span className="text-sm text-muted-foreground">up to 300</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {attached.map((a) => (
            <Badge key={a.id} variant="secondary" data-testid="attachment">
              {a.name}
              <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAttached(attached.filter((x) => x.id !== a.id))}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" data-testid="attach" />}>
              <Paperclip /> Attach media
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                <Upload /> Upload a file
              </DropdownMenuItem>
              {library.length ? <DropdownMenuSeparator /> : null}
              {library
                .filter((m) => !attached.some((a) => a.id === m.id))
                .map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => setAttached([...attached, { id: m.id, name: m.name }])}>
                    {m.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInput}
            type="file"
            hidden
            data-testid="attach-upload"
            accept="image/png,image/jpeg,image/svg+xml,image/webp,video/mp4,video/webm,video/quicktime"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const row = await uploadFile(file, { purpose: "library" });
                setLibrary([...library, row]);
                setAttached([...attached, { id: row.id, name: row.name }]);
              } catch (err) {
                toast.error(errorText(err));
              }
            }}
          />
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              data-testid="create-blank"
              pending={pending === "blank"}
              disabled={pending !== null}
              onClick={async () => {
                setPending("blank");
                try {
                  const { id } = await createBlankVideo({ data: { kitId: kitId || null, aspect, projectId } });
                  await navigate({ to: "/v/$videoId", params: { videoId: id } });
                } catch (e) {
                  setError(errorText(e));
                  setPending(null);
                }
              }}
            >
              Blank video
            </Button>
            <Button
              data-testid="create-video"
              pending={pending === "ai"}
              disabled={!prompt.trim() || !data.ai.ready || !lengthOk || pending !== null}
              onClick={create}
            >
              <Sparkles /> Create video
            </Button>
          </div>
        </div>
        {!data.ai.ready ? (
          <Alert data-testid="ai-off">
            <AlertDescription>
              AI drafts are off: an admin needs to add an OpenAI key in the Gateway.
            </AlertDescription>
          </Alert>
        ) : null}
        {pending === "ai" ? <p className="text-sm text-muted-foreground">Writing the scenes…</p> : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function VideoCard({ video, projects, me }: { video: HomeData["videos"][number]; projects: HomeData["projects"]; me: string }) {
  const router = useRouter();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"rename" | "move" | "delete" | null>(null);
  const [target, setTarget] = useState(video.projectId ?? "");
  const [pending, setPending] = useState(false);
  const movable = projects.filter((p) => p.shared || (p.ownerId === me && video.ownerId === me));

  async function run(work: () => Promise<unknown>) {
    setPending(true);
    try {
      await work();
      setDialog(null);
      await router.invalidate();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <li data-testid="video-card" className="group relative overflow-hidden rounded-xl border border-border bg-card">
      <Link to="/v/$videoId" params={{ videoId: video.id }} className="block">
        <div
          className="flex aspect-video items-center justify-center p-4 text-center text-lg font-semibold"
          style={video.cover ? { background: video.cover.background, color: video.cover.foreground } : undefined}
        >
          <span className="line-clamp-2">{video.cover?.heading}</span>
        </div>
        <div className="space-y-1 p-3 pr-10">
          <p data-testid="video-title" className="truncate font-medium">
            {video.title || "Untitled video"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {lengthLabel(Math.round(video.duration))} · {video.aspect}
            {video.projectName ? ` · ${video.projectName}` : ""}
            {video.published ? " · Published" : ""}
          </p>
        </div>
      </Link>
      <div className="absolute right-2 bottom-3">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Options for ${video.title}`} data-testid="video-options" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDialog("rename")}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                run(async () => {
                  const { id } = await duplicateVideo({ data: { id: video.id } });
                  await navigate({ to: "/v/$videoId", params: { videoId: id } });
                })
              }
            >
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog("move")}>Move to project</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {dialog === "rename" ? (
        <NameDialog
          title="Rename video"
          label="Title"
          initial={video.title}
          submitLabel="Rename"
          onClose={() => setDialog(null)}
          onSubmit={(title) => run(() => updateVideo({ data: { id: video.id, title } }))}
        />
      ) : null}
      {dialog === "move" ? (
        <ConfirmDialog
          title="Move to project"
          confirmLabel="Move"
          pending={pending}
          onClose={() => setDialog(null)}
          onConfirm={() => run(() => updateVideo({ data: { id: video.id, projectId: target || null } }))}
        >
          <NativeSelect aria-label="Project" data-testid="move-target" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-2 w-full">
            <NativeSelectOption value="">No project (only its creator sees it)</NativeSelectOption>
            {movable.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
                {p.shared ? "" : " (personal)"}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </ConfirmDialog>
      ) : null}
      {dialog === "delete" ? (
        <ConfirmDialog
          title={`Delete "${video.title}"?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDialog(null)}
          onConfirm={() => run(() => deleteVideo({ data: { id: video.id } }))}
        >
          Its versions, share link and exports go too.
        </ConfirmDialog>
      ) : null}
    </li>
  );
}
