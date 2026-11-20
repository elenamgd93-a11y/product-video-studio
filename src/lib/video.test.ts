import { describe, expect, it } from "vitest";
import {
  MAX_FILES,
  blankDraft,
  exportFileName,
  fileIds,
  fitDurations,
  libraryScene,
  nextVersionNumber,
  pronounce,
  sceneAt,
  tooManyFiles,
  totalDuration,
} from "./video";

describe("timeline", () => {
  it("fits scene durations to the chosen length", () => {
    const scenes = fitDurations([{ duration: 3 }, { duration: 7 }, { duration: 5 }], 30);
    expect(scenes.reduce((s, x) => s + x.duration, 0)).toBe(30);
    expect(scenes.every((s) => s.duration >= 0.5)).toBe(true);
  });

  it("finds the scene playing at a time", () => {
    const draft = blankDraft(null);
    draft.scenes.push({ ...libraryScene("text", null), duration: 2 });
    expect(sceneAt(draft.scenes, 0.5)?.index).toBe(0);
    expect(sceneAt(draft.scenes, totalDuration(draft) - 0.1)?.index).toBe(1);
  });

  it("counts distinct files and caps them", () => {
    const draft = blankDraft(null);
    draft.scenes = Array.from({ length: MAX_FILES }, (_, i) => ({ ...libraryScene("media", null), mediaId: `m${i}` }));
    expect(fileIds(draft).size).toBe(MAX_FILES);
    expect(tooManyFiles(draft)).toBe(false);
    draft.music = { mediaId: "song", name: "song.mp3", volume: 0.5 };
    expect(tooManyFiles(draft)).toBe(true);
  });
});

describe("versions and files", () => {
  it("numbers versions from 1", () => {
    expect(nextVersionNumber([])).toBe(1);
    expect(nextVersionNumber([1, 2, 3])).toBe(4);
  });

  it("names exports after the title", () => {
    expect(exportFileName("Spring launch: mobile")).toBe("Spring launch mobile.mp4");
    expect(exportFileName("  ")).toBe("video.mp4");
  });

  it("applies pronunciation entries", () => {
    expect(pronounce("Order at Qwikr now", { pronunciations: [{ term: "Qwikr", spoken: "quicker" }] })).toBe(
      "Order at quicker now",
    );
  });
});
