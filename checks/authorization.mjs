import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { json, png, step } from "./lib.mjs";

const runtime = await startRuntime();
const post = (path, role, body) =>
  runtime.fetch(path, { role, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patch = (path, role, body) =>
  runtime.fetch(path, { role, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const upload = (role, fields, file = png(32)) => {
  const form = new FormData();
  form.set("file", new Blob([file], { type: "image/png" }), "screen.png");
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return runtime.fetch("/api/media", { role, method: "POST", body: form });
};

try {
  step("X001 private pages refuse anonymous and outsiders");
  await runtime.assertPrivateAccess(["/", "/kits", "/scenes", "/api/videos", "/api/projects"]);
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/logout", "/auth/login"]) {
    const anon = await runtime.fetch(path);
    expect(anon.status).not.toBe(200);
    const member = await runtime.fetch(path, { role: "member" });
    expect(member.status).toBe(404);
  }
  const home = await (await runtime.fetch("/", { role: "member" })).text();
  expect(home).not.toMatch(/type="password"/);

  step("X001 the app shows AI as off when the Gateway has no key");
  const page = await (await runtime.context("member")).newPage();
  await page.goto("/");
  await expect(page.getByTestId("ai-off")).toBeVisible();
  await page.getByTestId("composer-description").fill("A teaser for our spring menu");
  await expect(page.getByTestId("create-video")).toBeDisabled();
  await expect(page.getByTestId("create-blank")).toBeEnabled();

  step("F008 one member's videos stay theirs");
  const owned = await json(await post("/api/videos", "owner", { title: "Quarterly roadmap walkthrough" }));
  expect((await runtime.fetch(`/api/videos/${owned.id}`, { role: "owner" })).status).toBe(200);
  expect((await runtime.fetch(`/api/videos/${owned.id}`, { role: "member" })).status).toBe(404);
  expect((await patch(`/api/videos/${owned.id}`, "member", { title: "Taken over" })).status).toBe(404);
  expect((await runtime.fetch(`/api/videos/${owned.id}`, { role: "member", method: "DELETE" })).status).toBe(404);
  expect((await post(`/api/videos/${owned.id}/publish`, "member", { shareMode: "public" })).status).toBe(404);
  expect((await runtime.fetch(`/api/videos/${owned.id}/exports`, { role: "member" })).status).toBe(404);
  const memberList = await json(await runtime.fetch("/api/videos", { role: "member" }));
  expect(memberList.videos.map((v) => v.id)).not.toContain(owned.id);
  await page.goto(`/v/${owned.id}`);
  await expect(page.getByTestId("video-title-input")).toHaveCount(0);
  expect((await json(await runtime.fetch(`/api/videos/${owned.id}`, { role: "owner" }))).title).toBe("Quarterly roadmap walkthrough");
  expect((await runtime.fetch(`/api/videos/${owned.id}`, { role: "outsider" })).status).not.toBe(200);

  step("F008 personal projects stay private; shared ones open to members");
  const personal = await json(await post("/api/projects", "owner", { name: "Owner drafts", shared: false }));
  const shared = await json(await post("/api/projects", "owner", { name: "Launch team", shared: true }));
  const memberProjects = await json(await runtime.fetch("/api/projects", { role: "member" }));
  expect(memberProjects.projects.map((p) => p.id)).toEqual([shared.id]);
  expect((await patch(`/api/videos/${owned.id}`, "owner", { projectId: personal.id })).status).toBe(200);
  expect((await runtime.fetch(`/api/videos/${owned.id}`, { role: "member" })).status).toBe(404);
  expect((await patch(`/api/videos/${owned.id}`, "owner", { projectId: shared.id })).status).toBe(200);
  expect((await runtime.fetch(`/api/videos/${owned.id}`, { role: "member" })).status).toBe(200);
  expect((await patch(`/api/videos/${owned.id}`, "member", { title: "Roadmap walkthrough, Q3" })).status).toBe(200);
  const memberVideo = await json(await post("/api/videos", "member", { title: "Member's own teaser" }));
  expect((await patch(`/api/videos/${memberVideo.id}`, "member", { projectId: personal.id })).status).toBe(404);
  expect((await patch(`/api/videos/${owned.id}`, "member", { projectId: null })).status).toBe(200);
  expect((await runtime.fetch(`/api/videos/${owned.id}`, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(`/api/videos/${owned.id}`, { role: "owner" })).status).toBe(200);

  step("F008 uploaded media stays with its uploader");
  const media = await json(await upload("owner", { purpose: "library" }));
  expect((await runtime.fetch(`/files/${media.id}`, { role: "owner" })).status).toBe(200);
  expect((await runtime.fetch(`/files/${media.id}`, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(`/files/${media.id}?video=${memberVideo.id}`, { role: "member" })).status).toBe(404);
  const mine = await json(await runtime.fetch(`/api/videos/${memberVideo.id}`, { role: "member" }));
  const stolen = { ...mine.draft, scenes: [{ ...mine.draft.scenes[0], mediaId: media.id, mediaType: "image" }] };
  expect((await patch(`/api/videos/${memberVideo.id}`, "member", { draft: stolen })).status).toBe(404);
  expect((await upload("member", { purpose: "music", videoId: owned.id })).status).toBe(404);

  step("F001 brand kits are shared across the workspace");
  const kitPage = await (await runtime.context("owner")).newPage();
  await kitPage.goto("/kits");
  await kitPage.getByTestId("new-kit").click();
  await kitPage.getByTestId("name-input").fill("Team kit");
  await Promise.all([kitPage.waitForURL(/\/kits\/[0-9a-f-]+$/), kitPage.getByTestId("name-submit").click()]);
  const kitId = kitPage.url().split("/").pop();
  const logo = await json(await upload("owner", { purpose: "kit", kitId, assetKind: "logo" }));
  await page.goto(`/kits/${kitId}`);
  await page.getByTestId("kit-name-input").fill("Team kit, member edit");
  await page.getByTestId("save-kit").click();
  await expect(page.getByText("Kit saved")).toBeVisible();
  expect((await runtime.fetch(`/files/${logo.id}`, { role: "member" })).status).toBe(200);
  expect((await runtime.fetch(`/files/${logo.id}`, { role: "outsider" })).status).not.toBe(200);
  expect((await runtime.fetch(`/files/${logo.id}`)).status).not.toBe(200);

  step("F006 share links show only what was published, to whom it allows");
  expect((await runtime.fetch(`/s/${memberVideo.id}`)).status).toBe(404);
  expect((await post(`/api/videos/${memberVideo.id}/publish`, "member", { shareMode: "public" })).status).toBe(200);
  const sharedPage = await runtime.fetch(`/s/${memberVideo.id}`);
  expect(sharedPage.status).toBe(200);
  const body = await sharedPage.text();
  expect(body).toContain("own teaser</h1>");
  expect((await patch(`/api/videos/${memberVideo.id}`, "member", { title: "Unreleased new title" })).status).toBe(200);
  const afterRename = await (await runtime.fetch(`/s/${memberVideo.id}`)).text();
  expect(afterRename).not.toContain("Unreleased new title");
  expect(afterRename).not.toContain("member@example.test");
  expect((await runtime.fetch(`/s/${memberVideo.id}/files/${media.id}`)).status).toBe(404);
  expect((await runtime.fetch(`/s/${memberVideo.id}/files/${logo.id}`)).status).toBe(404);
  expect((await post(`/api/videos/${memberVideo.id}/publish`, "member", { shareMode: "private" })).status).toBe(200);
  expect((await runtime.fetch(`/s/${memberVideo.id}`)).status).toBe(404);
  expect((await runtime.fetch(`/s/${memberVideo.id}`, { role: "owner" })).status).toBe(404);
  expect((await runtime.fetch(`/s/${memberVideo.id}`, { role: "member" })).status).toBe(200);
  expect((await runtime.fetch(`/s/${memberVideo.id}`, { role: "outsider" })).status).not.toBe(200);
  expect((await runtime.fetch(`/s/${memberVideo.id}`, { method: "POST" })).status).not.toBe(200);

  step("F005 admins can restrict saving scenes to admins");
  await page.goto("/scenes");
  await expect(page.getByTestId("admin-only-switch")).toHaveCount(0);
  const ownerScenes = await (await runtime.context("owner")).newPage();
  await ownerScenes.goto("/scenes");
  await ownerScenes.getByTestId("admin-only-switch").click();
  await expect(ownerScenes.getByTestId("admin-only-switch")).toHaveAttribute("aria-checked", "true");
  await page.goto(`/v/${memberVideo.id}`);
  await page.getByTestId("save-scene").click();
  await page.getByTestId("name-input").fill("Member closer");
  await page.getByTestId("name-submit").click();
  await expect(page.getByText("Only admins can save scenes in this workspace.")).toBeVisible();
  await page.goto("/scenes");
  await expect(page.getByTestId("admin-only-note")).toBeVisible();
  await expect(page.getByTestId("saved-scene")).toHaveCount(0);
  await ownerScenes.goto(`/v/${owned.id}`);
  await ownerScenes.getByTestId("save-scene").click();
  await ownerScenes.getByTestId("name-input").fill("Roadmap closer");
  await ownerScenes.getByTestId("name-submit").click();
  await expect(ownerScenes.getByText("Scene saved")).toBeVisible();
  await page.goto("/scenes");
  await expect(page.getByTestId("saved-scene-name")).toHaveText(["Roadmap closer"]);
  await page.getByTestId("rename-saved-scene").click();
  await page.getByTestId("name-input").fill("Roadmap outro");
  await page.getByTestId("name-submit").click();
  await expect(page.getByTestId("saved-scene-name")).toHaveText(["Roadmap outro"]);
  console.log("authorization: all checks passed");
} finally {
  await runtime.close();
}
