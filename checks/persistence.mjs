import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { json, png, step } from "./lib.mjs";

const runtime = await startRuntime();
try {
  step("write: a kit, a project, a published video, an upload and an export");
  const page = await (await runtime.context("owner")).newPage();
  await page.goto("/kits");
  await page.getByTestId("new-kit").click();
  await page.getByTestId("name-input").fill("Harbor Bikes");
  await Promise.all([page.waitForURL(/\/kits\/[0-9a-f-]+$/), page.getByTestId("name-submit").click()]);
  await page.getByTestId("kit-voice").fill("Confident and outdoorsy.");
  await page.getByTestId("save-kit").click();
  await expect(page.getByText("Kit saved")).toBeVisible();
  const kitId = page.url().split("/").pop();

  const post = (path, body) =>
    runtime.fetch(path, { role: "owner", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const project = await json(await post("/api/projects", { name: "Summer rides", shared: true }));
  const video = await json(await post("/api/videos", { title: "Trail season teaser", kitId, projectId: project.id }));
  const form = new FormData();
  form.set("file", new Blob([png(48)], { type: "image/png" }), "trail.png");
  form.set("purpose", "library");
  const media = await json(await runtime.fetch("/api/media", { role: "owner", method: "POST", body: form }));
  const current = await json(await runtime.fetch(`/api/videos/${video.id}`, { role: "owner" }));
  const draft = { ...current.draft, scenes: [...current.draft.scenes, { ...current.draft.scenes[0], id: "trail1", kind: "media", heading: "Ride further", mediaId: media.id, mediaType: "image" }] };
  expect((await runtime.fetch(`/api/videos/${video.id}`, { role: "owner", method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft }) })).status).toBe(200);
  expect((await post(`/api/videos/${video.id}/publish`, { shareMode: "public" })).status).toBe(200);
  const revision = (await json(await runtime.fetch(`/api/videos/${video.id}`, { role: "owner" }))).revision;
  const exported = await runtime.fetch(`/api/videos/${video.id}/exports?resolution=1080p&fps=30&revision=${revision}`, {
    role: "owner",
    method: "POST",
    headers: { "content-type": "video/mp4" },
    body: Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from("ftypisom"), Buffer.alloc(4)]),
  });
  expect(exported.status).toBe(201);

  await runtime.restart();

  step("read back after a restart");
  const again = await json(await runtime.fetch(`/api/videos/${video.id}`, { role: "owner" }));
  expect(again.title).toBe("Trail season teaser");
  expect(again.projectId).toBe(project.id);
  expect(again.kit.name).toBe("Harbor Bikes");
  expect(again.draft.scenes.map((s) => s.heading)).toContain("Ride further");
  expect((await runtime.fetch(`/files/${media.id}`, { role: "owner" })).status).toBe(200);
  const shared = await runtime.fetch(`/s/${video.id}`);
  expect(shared.status).toBe(200);
  expect((await runtime.fetch(`/s/${video.id}/files/${media.id}`)).status).toBe(200);
  const list = await json(await runtime.fetch(`/api/videos/${video.id}/exports`, { role: "owner" }));
  expect(list.exports).toHaveLength(1);
  expect(list.exports[0].fps).toBe(30);
  const projects = await json(await runtime.fetch("/api/projects", { role: "member" }));
  expect(projects.projects.map((p) => p.name)).toContain("Summer rides");
  const reread = await (await runtime.context("member")).newPage();
  await reread.goto(`/kits/${kitId}`);
  await expect(reread.getByTestId("kit-voice")).toHaveValue("Confident and outdoorsy.");
  await reread.goto("/");
  await expect(reread.getByTestId("video-title")).toHaveText(["Trail season teaser"]);
  console.log("persistence: all checks passed");
} finally {
  await runtime.close();
}
