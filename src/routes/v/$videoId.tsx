import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Copy, Download, GripVertical, Music, Plus, Save, Send, ThumbsDown, ThumbsUp, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { CopyButton } from "@/client/components/CopyButton";
import { NameDialog } from "@/client/components/NameDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Player } from "@/client/components/Player";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { Textarea } from "@/client/components/ui/textarea";
import { renderMp4, renderStill } from "@/client/render/exportMp4";
import { errorText, uploadFile } from "@/client/lib/upload";
import {
  MAX_FILES,
  SCENE_KINDS,
  SCENE_KIND_LABELS,
  VOICES,
  exportFileName,
  fileIds,
  libraryScene,
  newSceneId,
  sceneStart,
  totalDuration,
  type Draft,
  type Scene,
  type SceneKind,
} from "@/lib/video";
import {
  findExport,
  getEditor,
  getVersion,
  insertSavedScene,
  makeVoiceover,
  publishVideo,
  rateMessage,
  renameVideo,
  restoreVersion,
  saveDraft,
  sendChat,
  updateShare,
} from "@/serverFunctions/editor";
import { saveScene } from "@/serverFunctions/library";

export const Route = createFileRoute("/v/$videoId")({
  loader: ({ params }) => getEditor({ data: { videoId: params.videoId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.video.title ?? "Video" }] }),
  component: Editor,
});

type EditorData = Awaited<ReturnType<typeof getEditor>>;

function Editor() {
  const data = Route.useLoaderData();
  const { video } = data;
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(video.draft);
  const [revision, setRevision] = useState(video.revision);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [selected, setSelected] = useState(0);
  const [seek, setSeek] = useState<{ time: number } | null>(null);
  const [preview, setPreview] = useState<{ number: number; draft: Draft } | null>(null);
  const [title, setTitle] = useState(video.title);
  const pendingSave = useRef<number | null>(null);
  const loadedRevision = useRef(video.revision);

  // A reload (after chat, restore or voiceover) brings a new draft from the server.
  useEffect(() => {
    if (video.revision !== loadedRevision.current) {
      loadedRevision.current = video.revision;
      setDraft(video.draft);
      setRevision(video.revision);
      setTitle(video.title);
      setSelected((i) => Math.min(i, Math.max(video.draft.scenes.length - 1, 0)));
    }
  }, [video]);

  const fileUrl = useCallback((id: string) => `/files/${id}?video=${video.id}`, [video.id]);

  /** A manual edit: shown at once, saved shortly after. It makes no version. */
  function change(next: Draft) {
    if (fileIds(next).size > MAX_FILES) {
      toast.error(`A video can use at most ${MAX_FILES} files. Remove one to add another.`);
      return;
    }
    setDraft(next);
    setSaveState("saving");
    if (pendingSave.current) window.clearTimeout(pendingSave.current);
    pendingSave.current = window.setTimeout(async () => {
      pendingSave.current = null;
      try {
        const saved = await saveDraft({ data: { id: video.id, draft: next } });
        loadedRevision.current = saved.revision;
        setRevision(saved.revision);
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        toast.error(errorText(e));
      }
    }, 500);
  }

  async function reload() {
    await router.invalidate();
  }

  const scenes = draft.scenes;
  const scene = scenes[selected];
  const updateScene = (patch: Partial<Scene>) => change({ ...draft, scenes: scenes.map((s, i) => (i === selected ? { ...s, ...patch } : s)) });
  const showing = preview?.draft ?? draft;
  const changedSincePublish = video.publishedRevision != null && video.publishedRevision !== revision;

  return (
    <AppShell wide>
      <PageHeader
        backLink={
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden /> Videos
          </Link>
        }
        title={
          <Input
            aria-label="Title"
            data-testid="video-title-input"
            className="h-auto border-transparent px-1 text-2xl font-semibold shadow-none md:text-2xl"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={async () => {
              if (title === video.title) return;
              try {
                await renameVideo({ data: { id: video.id, title } });
                await reload();
              } catch (e) {
                toast.error(errorText(e));
              }
            }}
          />
        }
        description={
          <span className="flex flex-wrap gap-x-3">
            <span>{video.aspect}</span>
            <span>{totalDuration(draft).toFixed(1)}s</span>
            <span data-testid="video-kit">{video.kit ? `Kit: ${video.kit.name}` : "No brand kit"}</span>
            <span data-testid="save-status">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}</span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {preview ? (
            <Alert data-testid="preview-banner">
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span className="mr-auto">Previewing V{preview.number}</span>
                <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
                  Back to draft
                </Button>
                <Button
                  size="sm"
                  data-testid="preview-restore"
                  onClick={async () => {
                    await restoreVersion({ data: { videoId: video.id, number: preview.number } });
                    setPreview(null);
                    await reload();
                    toast.success(`Restored V${preview.number}`);
                  }}
                >
                  Restore V{preview.number}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <Player draft={showing} kit={video.kit} aspect={video.aspect} fileUrl={fileUrl} seekTo={seek} />
          {preview ? (
            <Timeline scenes={preview.draft.scenes} selected={-1} readOnly onSelect={() => undefined} onReorder={() => undefined} />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h2 className="mr-auto font-semibold">Scenes</h2>
                <AddScene data={data} draft={draft} selected={selected} onAdd={(next, at) => { change(next); setSelected(at); }} />
              </div>
              <Timeline
                scenes={scenes}
                selected={selected}
                onSelect={(i) => {
                  setSelected(i);
                  setSeek({ time: sceneStart(scenes, i) + Math.min(1.5, scenes[i]!.duration / 2) });
                }}
                onReorder={(from, to) => {
                  const next = [...scenes];
                  const [moved] = next.splice(from, 1);
                  next.splice(to, 0, moved!);
                  change({ ...draft, scenes: next });
                  setSelected(to);
                }}
              />
              {scene ? (
                <ScenePanel
                  key={scene.id}
                  data={data}
                  scene={scene}
                  fileUrl={fileUrl}
                  onChange={updateScene}
                  onDuplicate={() => {
                    const next = [...scenes];
                    next.splice(selected + 1, 0, { ...scene, id: newSceneId() });
                    change({ ...draft, scenes: next });
                    setSelected(selected + 1);
                  }}
                  onDelete={() => {
                    change({ ...draft, scenes: scenes.filter((_, i) => i !== selected) });
                    setSelected(Math.max(0, selected - 1));
                  }}
                  onVoiceover={async () => {
                    if (pendingSave.current) {
                      toast.error("Wait for the draft to save, then try again.");
                      return;
                    }
                    const result = await makeVoiceover({ data: { videoId: video.id, sceneId: scene.id } });
                    loadedRevision.current = result.revision;
                    setRevision(result.revision);
                    setDraft((d) => ({
                      ...d,
                      scenes: d.scenes.map((s) => (s.id === scene.id ? { ...s, voiceoverId: result.voiceoverId, voiceoverScript: result.script } : s)),
                    }));
                  }}
                />
              ) : null}
              <MusicPanel draft={draft} videoId={video.id} onChange={change} />
            </>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <ChatPanel
            data={data}
            selectedScene={preview ? null : (scene ?? null)}
            onPreview={async (number) => setPreview(await getVersion({ data: { videoId: video.id, number } }))}
            onRestore={async (number) => {
              await restoreVersion({ data: { videoId: video.id, number } });
              setPreview(null);
              await reload();
              toast.success(`Restored V${number}`);
            }}
            beforeSend={() => !pendingSave.current}
            onChanged={reload}
          />
          <SharePanel data={data} changed={changedSincePublish} onChanged={reload} />
          <ExportPanel data={data} draft={draft} revision={revision} title={title} fileUrl={fileUrl} saving={saveState !== "saved"} onChanged={reload} />
        </div>
      </div>
    </AppShell>
  );
}

function Timeline({
  scenes,
  selected,
  readOnly = false,
  onSelect,
  onReorder,
}: {
  scenes: Scene[];
  selected: number;
  readOnly?: boolean;
  onSelect: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const dragging = useRef<number | null>(null);
  if (scenes.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No scenes. Add one to start.</p>;
  }
  return (
    <ol className="flex gap-2 overflow-x-auto pb-2" data-testid="timeline">
      {scenes.map((s, i) => (
        <li
          key={s.id}
          data-testid="scene-item"
          data-selected={i === selected || undefined}
          draggable={!readOnly}
          onDragStart={(e) => {
            dragging.current = i;
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            if (!readOnly) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging.current != null && dragging.current !== i) onReorder(dragging.current, i);
            dragging.current = null;
          }}
          style={{ flexGrow: s.duration, flexBasis: `${Math.max(s.duration * 1.6, 7)}rem` }}
          className="min-w-28 shrink-0"
        >
          <button
            type="button"
            onClick={() => onSelect(i)}
            className={`flex h-full w-full flex-col gap-1 rounded-lg border p-2 text-left transition-colors ${
              i === selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-ring"
            }`}
          >
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {readOnly ? null : <GripVertical className="size-3" aria-hidden />}
              {i + 1} · {SCENE_KIND_LABELS[s.kind]}
            </span>
            <span className="h-2 rounded-full" style={{ background: s.colors.background, boxShadow: `inset 0 0 0 1px ${s.colors.accent}` }} />
            <span className="line-clamp-2 text-sm font-medium" data-testid="scene-heading-label">
              {s.heading || s.body || "Untitled scene"}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums" data-testid="scene-duration-label">
              {s.duration}s
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function AddScene({ data, draft, selected, onAdd }: { data: EditorData; draft: Draft; selected: number; onAdd: (draft: Draft, at: number) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(0);
  const [library, setLibrary] = useState(data.library);
  const fileInput = useRef<HTMLInputElement>(null);
  const kit = data.video.kit;

  function insert(scene: Scene) {
    const scenes = [...draft.scenes];
    scenes.splice(position, 0, scene);
    onAdd({ ...draft, scenes }, position);
    setOpen(false);
  }
  function mediaScene(m: { id: string; contentType: string }) {
    return { ...libraryScene("media", kit), mediaId: m.id, mediaType: m.contentType.startsWith("video/") ? ("video" as const) : ("image" as const) };
  }

  return (
    <>
      <Button
        size="sm"
        data-testid="add-scene"
        onClick={() => {
          setPosition(Math.min(selected + 1, draft.scenes.length));
          setOpen(true);
        }}
      >
        <Plus /> Add scene
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a scene</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Label htmlFor="scene-position">Position</Label>
            <NativeSelect id="scene-position" data-testid="add-position" value={String(position)} onChange={(e) => setPosition(Number(e.target.value))}>
              {Array.from({ length: draft.scenes.length + 1 }, (_, i) => (
                <NativeSelectOption key={i} value={String(i)}>
                  {i === 0 ? "At the start" : i === draft.scenes.length ? "At the end" : `After scene ${i}`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Tabs defaultValue="builtin">
            <TabsList>
              <TabsTrigger value="builtin">Scene library</TabsTrigger>
              <TabsTrigger value="saved" data-testid="add-tab-saved">
                Saved
              </TabsTrigger>
              <TabsTrigger value="media" data-testid="add-tab-media">
                Media
              </TabsTrigger>
            </TabsList>
            <TabsContent value="builtin" className="grid gap-2 pt-2 sm:grid-cols-2">
              {SCENE_KINDS.filter((k) => k !== "media").map((kind) => (
                <Button key={kind} variant="outline" data-testid={`add-kind-${kind}`} onClick={() => insert(libraryScene(kind as SceneKind, kit))}>
                  {SCENE_KIND_LABELS[kind]}
                </Button>
              ))}
            </TabsContent>
            <TabsContent value="saved" className="grid gap-2 pt-2">
              {data.saved.length === 0 ? <p className="text-sm text-muted-foreground">No saved scenes yet.</p> : null}
              {data.saved.map((s) => (
                <Button
                  key={s.id}
                  variant="outline"
                  className="justify-start"
                  data-testid="add-saved"
                  onClick={async () => insert(await insertSavedScene({ data: { id: s.id } }))}
                >
                  {s.name}
                </Button>
              ))}
            </TabsContent>
            <TabsContent value="media" className="grid gap-2 pt-2">
              {library.map((m) => (
                <Button key={m.id} variant="outline" className="justify-start" data-testid="add-media" onClick={() => insert(mediaScene(m))}>
                  {m.name}
                </Button>
              ))}
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                <Upload /> Upload image or clip
              </Button>
              <input
                ref={fileInput}
                type="file"
                hidden
                data-testid="add-upload"
                accept="image/png,image/jpeg,image/svg+xml,image/webp,video/mp4,video/webm,video/quicktime"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const row = await uploadFile(file, { purpose: "library" });
                    setLibrary([...library, row]);
                    insert(mediaScene(row));
                  } catch (err) {
                    toast.error(errorText(err));
                  }
                }}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScenePanel({
  data,
  scene,
  fileUrl,
  onChange,
  onDuplicate,
  onDelete,
  onVoiceover,
}: {
  data: EditorData;
  scene: Scene;
  fileUrl: (id: string) => string;
  onChange: (patch: Partial<Scene>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onVoiceover: () => Promise<void>;
}) {
  const [voicing, setVoicing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [library, setLibrary] = useState(data.library);
  const fileInput = useRef<HTMLInputElement>(null);
  const images = [
    ...(data.video.kit?.assets ?? []).map((a) => ({ id: a.id, name: `${a.name} (kit)`, contentType: a.contentType })),
    ...library,
  ];
  const voiceCurrent = scene.voiceoverId && scene.voiceoverScript === scene.script;

  return (
    <Card data-testid="scene-panel">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle className="mr-auto">Design</CardTitle>
        <Button size="sm" variant="outline" data-testid="duplicate-scene" onClick={onDuplicate}>
          <Copy /> Duplicate
        </Button>
        <Button size="sm" variant="outline" data-testid="save-scene" onClick={() => setSaving(true)}>
          <Save /> Save to library
        </Button>
        <Button size="sm" variant="outline" data-testid="delete-scene" onClick={onDelete}>
          <Trash2 /> Delete
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Kind" id="scene-kind">
          <NativeSelect id="scene-kind" className="w-full" value={scene.kind} onChange={(e) => onChange({ kind: e.target.value as SceneKind })}>
            {SCENE_KINDS.map((k) => (
              <NativeSelectOption key={k} value={k}>
                {SCENE_KIND_LABELS[k]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Labeled>
        <Labeled label="Duration (seconds)" id="scene-duration">
          <Input
            id="scene-duration"
            data-testid="scene-duration"
            type="number"
            min={0.5}
            max={300}
            step={0.5}
            value={scene.duration}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 0.5 && v <= 300) onChange({ duration: v });
            }}
          />
        </Labeled>
        <Labeled label="Heading" id="scene-heading">
          <Input id="scene-heading" data-testid="scene-heading" value={scene.heading} maxLength={300} onChange={(e) => onChange({ heading: e.target.value })} />
        </Labeled>
        <Labeled label="Supporting text" id="scene-body">
          <Input id="scene-body" data-testid="scene-body" value={scene.body} maxLength={1000} onChange={(e) => onChange({ body: e.target.value })} />
        </Labeled>
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          {(["background", "foreground", "accent"] as const).map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <input
                type="color"
                data-testid={`scene-color-${role}`}
                value={scene.colors[role]}
                onChange={(e) => onChange({ colors: { ...scene.colors, [role]: e.target.value } })}
                className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent"
              />
              {role === "background" ? "Background" : role === "foreground" ? "Text" : "Accent"}
            </label>
          ))}
          {data.video.kit?.colors.length ? (
            <span className="flex items-center gap-1" aria-label="Kit colours">
              {data.video.kit.colors.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  title={`${c.name || c.hex}: use as accent`}
                  className="size-6 rounded-full border border-border"
                  style={{ background: c.hex }}
                  onClick={() => onChange({ colors: { ...scene.colors, accent: c.hex } })}
                />
              ))}
            </span>
          ) : null}
        </div>
        <Labeled label="Image or clip" id="scene-media">
          <div className="flex gap-2">
            <NativeSelect
              id="scene-media"
              data-testid="scene-media"
              className="w-full"
              value={scene.mediaId ?? ""}
              onChange={(e) => {
                const m = images.find((x) => x.id === e.target.value);
                onChange({ mediaId: m?.id ?? null, mediaType: m ? (m.contentType.startsWith("video/") ? "video" : "image") : null });
              }}
            >
              <NativeSelectOption value="">None</NativeSelectOption>
              {scene.mediaId && !images.some((m) => m.id === scene.mediaId) ? <NativeSelectOption value={scene.mediaId}>Current file</NativeSelectOption> : null}
              {images.map((m) => (
                <NativeSelectOption key={m.id} value={m.id}>
                  {m.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button variant="outline" size="icon" aria-label="Upload image or clip" onClick={() => fileInput.current?.click()}>
              <Upload />
            </Button>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/svg+xml,image/webp,video/mp4,video/webm,video/quicktime"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const row = await uploadFile(file, { purpose: "library" });
                  setLibrary([...library, row]);
                  onChange({ mediaId: row.id, mediaType: row.contentType.startsWith("video/") ? "video" : "image" });
                } catch (err) {
                  toast.error(errorText(err));
                }
              }}
            />
          </div>
        </Labeled>
        {scene.mediaType === "video" ? (
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="Footage start (s)" id="footage-start">
              <Input id="footage-start" type="number" min={0} step={0.5} value={scene.footageStart} onChange={(e) => onChange({ footageStart: Math.max(0, Number(e.target.value)) })} />
            </Labeled>
            <Labeled label="Speed" id="footage-speed">
              <NativeSelect id="footage-speed" className="w-full" value={String(scene.footageSpeed)} onChange={(e) => onChange({ footageSpeed: Number(e.target.value) })}>
                {[0.5, 1, 1.5, 2, 4].map((v) => (
                  <NativeSelectOption key={v} value={String(v)}>
                    {v}×
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Labeled>
          </div>
        ) : (
          <div />
        )}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="scene-script">Voiceover script</Label>
          <Textarea id="scene-script" data-testid="scene-script" rows={2} maxLength={2000} value={scene.script} onChange={(e) => onChange({ script: e.target.value })} />
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect aria-label="Voice" data-testid="scene-voice" value={scene.voice} onChange={(e) => onChange({ voice: e.target.value as Scene["voice"] })}>
              {VOICES.map((v) => (
                <NativeSelectOption key={v} value={v}>
                  {v[0]!.toUpperCase() + v.slice(1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              size="sm"
              variant="outline"
              data-testid="synth-voice"
              pending={voicing}
              disabled={!scene.script.trim() || !data.ai.ready}
              onClick={async () => {
                setVoicing(true);
                try {
                  await onVoiceover();
                } catch (e) {
                  toast.error(errorText(e));
                } finally {
                  setVoicing(false);
                }
              }}
            >
              {scene.voiceoverId ? "Redo voiceover" : "Make voiceover"}
            </Button>
            {voiceCurrent ? (
              <>
                <span className="text-sm text-muted-foreground" data-testid="voiceover-ready">
                  Voiceover ready
                </span>
                <audio controls preload="none" src={fileUrl(scene.voiceoverId!)} className="h-8" />
              </>
            ) : scene.voiceoverId ? (
              <span className="text-sm text-muted-foreground">The script changed since this voiceover was made.</span>
            ) : null}
          </div>
        </div>
      </CardContent>
      {saving ? (
        <NameDialog
          title="Save scene to library"
          initial={scene.heading.slice(0, 80)}
          submitLabel="Save scene"
          onClose={() => setSaving(false)}
          onSubmit={async (name) => {
            try {
              await saveScene({ data: { videoId: data.video.id, sceneId: scene.id, name } });
              toast.success("Scene saved");
              setSaving(false);
            } catch (e) {
              toast.error(errorText(e));
            }
          }}
        />
      ) : null}
    </Card>
  );
}

function Labeled({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function MusicPanel({ draft, videoId, onChange }: { draft: Draft; videoId: string; onChange: (d: Draft) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Music className="size-4 text-muted-foreground" aria-hidden />
        {draft.music ? (
          <>
            <span className="min-w-0 flex-1 truncate text-sm" data-testid="music-name">
              {draft.music.name}
            </span>
            <label className="flex items-center gap-2 text-sm">
              Volume
              <input
                type="range"
                data-testid="music-volume"
                min={0}
                max={100}
                value={Math.round(draft.music.volume * 100)}
                onChange={(e) => onChange({ ...draft, music: { ...draft.music!, volume: Number(e.target.value) / 100 } })}
                className="accent-primary"
              />
              <span className="w-10 tabular-nums">{Math.round(draft.music.volume * 100)}%</span>
            </label>
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...draft, music: null })}>
              Remove
            </Button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-muted-foreground">No background music</span>
            <Button size="sm" variant="outline" pending={uploading} onClick={() => fileInput.current?.click()}>
              <Upload /> Upload music
            </Button>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          hidden
          data-testid="music-upload"
          accept="audio/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploading(true);
            try {
              const row = await uploadFile(file, { purpose: "music", videoId });
              onChange({ ...draft, music: { mediaId: row.id, name: row.name, volume: 0.4 } });
            } catch (err) {
              toast.error(errorText(err));
            } finally {
              setUploading(false);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

function ChatPanel({
  data,
  selectedScene,
  onPreview,
  onRestore,
  beforeSend,
  onChanged,
}: {
  data: EditorData;
  selectedScene: Scene | null;
  onPreview: (n: number) => Promise<void>;
  onRestore: (n: number) => Promise<void>;
  beforeSend: () => boolean;
  onChanged: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [aboutScene, setAboutScene] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const ai = data.ai.ready;

  async function run(work: () => Promise<unknown>) {
    if (!beforeSend()) {
      toast.error("Wait for the draft to save, then try again.");
      return;
    }
    setPending(true);
    try {
      await work();
      await onChanged();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card data-testid="chat">
      <CardHeader>
        <CardTitle>Ask for changes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="max-h-96 space-y-2 overflow-y-auto">
          {data.chat.map((m) => (
            <li
              key={m.id}
              data-testid={m.role === "assistant" ? "assistant-message" : "user-message"}
              className={`rounded-lg p-2 text-sm ${m.role === "assistant" ? "bg-muted" : "border border-border"}`}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
              {m.versionNumber != null ? (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Badge variant="secondary" data-testid="version-badge">
                    V{m.versionNumber}
                  </Badge>
                  <Button size="xs" variant="ghost" data-testid={`version-preview-${m.versionNumber}`} onClick={() => onPreview(m.versionNumber!)}>
                    Preview
                  </Button>
                  <Button size="xs" variant="ghost" data-testid={`version-restore-${m.versionNumber}`} onClick={() => onRestore(m.versionNumber!)}>
                    Restore
                  </Button>
                  <span className="ml-auto flex gap-1">
                    <Button
                      size="icon-xs"
                      variant={m.rating === "up" ? "secondary" : "ghost"}
                      aria-label="Good result"
                      aria-pressed={m.rating === "up"}
                      data-testid="rate-up"
                      onClick={() => run(() => rateMessage({ data: { messageId: m.id, rating: "up" } }))}
                    >
                      <ThumbsUp />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant={m.rating === "down" ? "secondary" : "ghost"}
                      aria-label="Bad result"
                      aria-pressed={m.rating === "down"}
                      data-testid="rate-down"
                      onClick={() => {
                        setFeedbackFor(m.id);
                        setFeedback("");
                      }}
                    >
                      <ThumbsDown />
                    </Button>
                  </span>
                </div>
              ) : null}
              {feedbackFor === m.id ? (
                <div className="mt-2 space-y-2">
                  <Label htmlFor={`feedback-${m.id}`}>What could be better?</Label>
                  <Textarea id={`feedback-${m.id}`} data-testid="feedback-input" rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="feedback-send"
                      onClick={() => {
                        setFeedbackFor(null);
                        void run(() => rateMessage({ data: { messageId: m.id, rating: "down", feedback } }));
                      }}
                    >
                      Send
                    </Button>
                    <Button
                      size="sm"
                      data-testid="feedback-retry"
                      disabled={!ai}
                      onClick={() => {
                        setFeedbackFor(null);
                        void run(() => rateMessage({ data: { messageId: m.id, rating: "down", feedback, retry: true } }));
                      }}
                    >
                      Try again
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        {ai ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const message = text.trim();
              if (!message) return;
              void run(async () => {
                await sendChat({ data: { videoId: data.video.id, text: message, sceneId: aboutScene ? (selectedScene?.id ?? null) : null } });
                setText("");
              });
            }}
          >
            <Textarea
              aria-label="Ask for a change"
              data-testid="chat-input"
              rows={2}
              value={text}
              placeholder="Make the second scene shorter and punchier"
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex items-center gap-2">
              {selectedScene ? (
                <label className="mr-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox data-testid="chat-scene-toggle" checked={aboutScene} onCheckedChange={(v) => setAboutScene(v === true)} />
                  <span className="truncate">About “{selectedScene.heading || "this scene"}”</span>
                </label>
              ) : (
                <span className="mr-auto" />
              )}
              <Button type="submit" size="sm" data-testid="chat-send" pending={pending} disabled={!text.trim()}>
                <Send /> Send
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="chat-off">
            Chat edits need an OpenAI key in the Gateway.
          </p>
        )}
        {pending ? <p className="text-sm text-muted-foreground">Working on it…</p> : null}
      </CardContent>
    </Card>
  );
}

function SharePanel({ data, changed, onChanged }: { data: EditorData; changed: boolean; onChanged: () => Promise<void> }) {
  const { video, published } = data;
  const [pending, setPending] = useState(false);
  const [frame, setFrame] = useState(String(video.previewTime ?? 0));
  const imageInput = useRef<HTMLInputElement>(null);
  const shareUrl = useMemo(() => (typeof window === "undefined" ? `/s/${video.id}` : `${window.location.origin}/s/${video.id}`), [video.id]);
  const fileUrl = (id: string) => `/files/${id}?video=${video.id}`;

  async function run(work: () => Promise<unknown>) {
    setPending(true);
    try {
      await work();
      await onChanged();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card data-testid="share">
      <CardHeader>
        <CardTitle>Share</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="share-mode" className="mr-auto">
            Who can open the link
          </Label>
          <NativeSelect
            id="share-mode"
            data-testid="share-mode"
            value={video.shareMode}
            onChange={(e) => run(() => updateShare({ data: { id: video.id, shareMode: e.target.value as "public" | "private" } }))}
          >
            <NativeSelectOption value="private">Members who can see the video</NativeSelectOption>
            <NativeSelectOption value="public">Anyone with the link</NativeSelectOption>
          </NativeSelect>
        </div>
        {published ? (
          <div className="flex items-center gap-2 rounded-lg border border-border p-2">
            <a href={shareUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-primary underline-offset-4 hover:underline" data-testid="share-link">
              {shareUrl}
            </a>
            <CopyButton value={shareUrl} successMessage="Link copied" />
          </div>
        ) : null}
        {changed ? (
          <Alert data-testid="publish-changes">
            <AlertDescription>The draft has changed since it was published.</AlertDescription>
          </Alert>
        ) : null}
        <Button
          className="w-full"
          data-testid="publish"
          pending={pending}
          disabled={!!published && !changed}
          onClick={() => run(() => publishVideo({ data: { id: video.id } }))}
        >
          {!published ? "Publish" : changed ? "Publish changes" : "Published"}
        </Button>
        {published ? (
          <div className="space-y-2">
            <Label htmlFor="preview-time">Link preview image</Label>
            {video.previewMediaId ? (
              <img src={fileUrl(video.previewMediaId)} alt="Link preview" data-testid="preview-image" className="w-full rounded-md border border-border" />
            ) : null}
            <div className="flex items-center gap-2">
              <Input id="preview-time" data-testid="preview-time" type="number" min={0} step={0.5} className="w-24" value={frame} onChange={(e) => setFrame(e.target.value)} />
              <span className="text-sm text-muted-foreground">s</span>
              <Button
                size="sm"
                variant="outline"
                data-testid="preview-frame"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const time = Math.min(Math.max(Number(frame) || 0, 0), totalDuration(published.draft));
                    const blob = await renderStill({ draft: published.draft, kit: published.kit, aspect: published.aspect, time, fileUrl });
                    const row = await uploadFile(new File([blob], "preview.png", { type: "image/png" }), { purpose: "preview", videoId: video.id });
                    await updateShare({ data: { id: video.id, previewMediaId: row.id, previewTime: time } });
                  })
                }
              >
                Use this frame
              </Button>
              <Button size="sm" variant="ghost" onClick={() => imageInput.current?.click()} disabled={pending}>
                <Upload /> Upload
              </Button>
              <input
                ref={imageInput}
                type="file"
                hidden
                data-testid="preview-upload"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  void run(async () => {
                    const row = await uploadFile(file, { purpose: "preview", videoId: video.id });
                    await updateShare({ data: { id: video.id, previewMediaId: row.id, previewTime: null } });
                  });
                }}
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExportPanel({
  data,
  draft,
  revision,
  title,
  fileUrl,
  saving,
  onChanged,
}: {
  data: EditorData;
  draft: Draft;
  revision: number;
  title: string;
  fileUrl: (id: string) => string;
  saving: boolean;
  onChanged: () => Promise<void>;
}) {
  const { video } = data;
  const [resolution, setResolution] = useState<"1080p" | "4k">("1080p");
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [progress, setProgress] = useState<number | null>(null);

  function download(mediaId: string) {
    const a = document.createElement("a");
    a.href = `/files/${mediaId}?video=${video.id}&download=${encodeURIComponent(exportFileName(title))}`;
    a.download = exportFileName(title);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function start() {
    setProgress(0);
    try {
      const found = await findExport({ data: { videoId: video.id, resolution, fps } });
      if (found.existing && found.revision === revision) {
        toast.success("No changes since the last export with these settings: downloading it again");
        download(found.existing.mediaId);
        return;
      }
      const blob = await renderMp4({ draft, kit: video.kit, aspect: video.aspect, resolution, fps, fileUrl, onProgress: setProgress });
      const response = await fetch(`/api/videos/${video.id}/exports?resolution=${resolution}&fps=${fps}&revision=${revision}`, {
        method: "POST",
        headers: { "content-type": "video/mp4" },
        body: blob,
      });
      const body = (await response.json()) as { mediaId?: string; error?: string };
      if (!response.ok || !body.mediaId) throw new Error(body.error ?? "The export couldn't be stored.");
      download(body.mediaId);
      await onChanged();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setProgress(null);
    }
  }

  return (
    <Card data-testid="export">
      <CardHeader>
        <CardTitle>Export MP4</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <NativeSelect aria-label="Resolution" data-testid="export-resolution" value={resolution} onChange={(e) => setResolution(e.target.value as "1080p" | "4k")}>
            <NativeSelectOption value="1080p">1080p</NativeSelectOption>
            <NativeSelectOption value="4k">4K</NativeSelectOption>
          </NativeSelect>
          <NativeSelect aria-label="Frame rate" data-testid="export-fps" value={String(fps)} onChange={(e) => setFps(Number(e.target.value) as 24 | 30 | 60)}>
            <NativeSelectOption value="24">24 fps</NativeSelectOption>
            <NativeSelectOption value="30">30 fps</NativeSelectOption>
            <NativeSelectOption value="60">60 fps</NativeSelectOption>
          </NativeSelect>
          <Button className="ml-auto" data-testid="export-start" pending={progress !== null} disabled={saving || draft.scenes.length === 0} onClick={start}>
            <Download /> Export
          </Button>
        </div>
        {progress !== null ? (
          <p className="text-sm text-muted-foreground" data-testid="export-progress">
            Rendering… {Math.round(progress * 100)}%
          </p>
        ) : null}
        {data.exports.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {data.exports.map((x) => (
              <li key={x.id} data-testid="export-row" className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {x.resolution === "4k" ? "4K" : x.resolution} · {x.fps} fps
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(`${x.createdAt.replace(" ", "T")}Z`).toLocaleString()} · {(x.size / 1_000_000).toFixed(1)} MB
                  </span>
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  data-testid="export-restore"
                  onClick={() => {
                    setResolution(x.resolution as "1080p" | "4k");
                    setFps(x.fps as 24 | 30 | 60);
                  }}
                >
                  Use settings
                </Button>
                <Button size="icon-xs" variant="ghost" aria-label="Download" data-testid="export-download" onClick={() => download(x.mediaId)}>
                  <Download />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
