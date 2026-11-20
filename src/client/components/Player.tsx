import { Captions, CaptionsOff, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/client/components/ui/button";
import { drawFrame, loadAssets, seekClips, type Assets } from "@/client/render/draw";
import { ASPECT_SIZE, sceneAt, sceneStart, totalDuration, type Aspect, type Draft, type KitSnapshot } from "@/lib/video";

/** Plays a draft in the browser: the scenes on a canvas, voiceovers, music and captions. */
export function Player({
  draft,
  kit,
  aspect,
  fileUrl,
  seekTo,
  onTime,
}: {
  draft: Draft;
  kit: KitSnapshot | null;
  aspect: Aspect;
  fileUrl: (id: string) => string;
  /** Jump here when it changes, in seconds. */
  seekTo?: { time: number } | null;
  onTime?: (time: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const assets = useRef<Assets>(new Map());
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [ready, setReady] = useState(0);
  const voice = useRef<HTMLAudioElement | null>(null);
  const voiceScene = useRef<string | null>(null);
  const music = useRef<HTMLAudioElement | null>(null);
  const total = totalDuration(draft);
  const size = ASPECT_SIZE[aspect];
  const drawWidth = size.width / 2;
  const drawHeight = size.height / 2;

  useEffect(() => {
    let live = true;
    void loadAssets(draft, kit, fileUrl, assets.current).then((loaded) => {
      if (!live) return;
      assets.current = loaded;
      setReady((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [draft, kit, fileUrl]);

  useEffect(() => {
    if (seekTo) setTime(Math.min(seekTo.time, total));
  }, [seekTo, total]);

  // Draw whenever the time, draft or loaded files change.
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    void seekClips(draft, time, assets.current).then(() => drawFrame(ctx, draft, time, kit, assets.current));
    onTime?.(time);
  }, [time, draft, kit, ready, onTime]);

  // The clock.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + dt;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, total]);

  const at = sceneAt(draft.scenes, time);
  const scene = at ? draft.scenes[at.index] : undefined;

  // Voiceover for the scene playing.
  useEffect(() => {
    if (!playing || !scene?.voiceoverId) {
      voice.current?.pause();
      voiceScene.current = null;
      return;
    }
    if (voiceScene.current === scene.id) return;
    voice.current?.pause();
    const audio = new Audio(fileUrl(scene.voiceoverId));
    audio.muted = muted;
    audio.currentTime = at?.local ?? 0;
    void audio.play().catch(() => undefined);
    voice.current = audio;
    voiceScene.current = scene.id;
  }, [playing, scene?.id, scene?.voiceoverId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Background music.
  useEffect(() => {
    if (!draft.music) {
      music.current?.pause();
      music.current = null;
      return;
    }
    if (!music.current || !music.current.src.includes(draft.music.mediaId)) {
      music.current?.pause();
      music.current = new Audio(fileUrl(draft.music.mediaId));
      music.current.loop = true;
    }
    music.current.volume = draft.music.volume;
  }, [draft.music, fileUrl]);
  useEffect(() => {
    const audio = music.current;
    if (!audio) return;
    if (playing) {
      audio.currentTime = time % (audio.duration || Infinity);
      void audio.play().catch(() => undefined);
    } else audio.pause();
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (voice.current) voice.current.muted = muted;
    if (music.current) music.current.muted = muted;
  }, [muted]);

  useEffect(
    () => () => {
      voice.current?.pause();
      music.current?.pause();
    },
    [],
  );

  const caption = captions && scene?.script ? scene.script : null;

  return (
    <div className="space-y-2" data-testid="player">
      <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
        <canvas
          ref={canvas}
          width={drawWidth}
          height={drawHeight}
          className="mx-auto block max-h-[60vh] w-full object-contain"
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
          aria-label="Video preview"
        />
        {caption ? (
          <p
            data-testid="caption"
            className="absolute inset-x-4 bottom-3 mx-auto w-fit max-w-[90%] rounded-md bg-foreground/80 px-3 py-1 text-center text-sm text-background"
          >
            {caption}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="icon-sm"
          variant="outline"
          data-testid="play"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (!playing && time >= total) setTime(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <input
          type="range"
          min={0}
          max={total || 1}
          step={0.05}
          value={time}
          aria-label="Position"
          className="min-w-0 flex-1 accent-primary"
          onChange={(e) => {
            setTime(Number(e.target.value));
            voiceScene.current = null;
          }}
        />
        <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {time.toFixed(1)}s / {total.toFixed(1)}s
        </span>
        <Button size="icon-sm" variant="ghost" data-testid="mute" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} onClick={() => setMuted(!muted)}>
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          data-testid="captions"
          aria-label={captions ? "Hide captions" : "Show captions"}
          aria-pressed={captions}
          onClick={() => setCaptions(!captions)}
        >
          {captions ? <Captions /> : <CaptionsOff />}
        </Button>
      </div>
    </div>
  );
}

export { sceneStart };
