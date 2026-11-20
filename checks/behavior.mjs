import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { json, png, step, wav, withFakeAi } from "./lib.mjs";

const runtime = await startRuntime(withFakeAi);
try {
  const ctx = await runtime.context("owner", { acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const origin = `http://${runtime.hostname}`;

  // F001: brand kits.
  step("F001 create and edit a brand kit");
  await page.goto("/kits");
  await expect(page.getByText("No brand kits yet")).toBeVisible();
  await page.getByTestId("new-kit").click();
  await page.getByTestId("name-input").fill("Northwind Coffee");
  await Promise.all([page.waitForURL(/\/kits\/[0-9a-f-]+$/), page.getByTestId("name-submit").click()]);
  await page.getByTestId("color-hex").first().fill("#3b2f2f");
  await page.getByTestId("color-name").first().fill("Espresso");
  await page.getByTestId("color-hex").nth(2).fill("#d97706");
  await page.getByTestId("headingFont").selectOption("Serif");
  await page.getByTestId("kit-voice").fill("Warm and unhurried, like a barista who knows your order.");
  await page.getByTestId("add-pronunciation").click();
  await page.getByTestId("pronunciation-term").fill("Northwind");
  await page.getByTestId("pronunciation-spoken").fill("north wind");
  await page.getByTestId("asset-kind").selectOption("logo");
  await page.getByTestId("asset-upload").setInputFiles({ name: "northwind-logo.png", mimeType: "image/png", buffer: png(96) });
  await expect(page.getByTestId("kit-asset")).toHaveCount(1);
  await page.getByTestId("save-kit").click();
  await expect(page.getByText("Kit saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("color-hex").first()).toHaveValue("#3b2f2f");
  await expect(page.getByTestId("headingFont")).toHaveValue("Serif");
  await expect(page.getByTestId("pronunciation-spoken")).toHaveValue("north wind");
  const svgUpload = await runtime.fetch("/api/media", { role: "owner", method: "POST", body: (() => { const f = new FormData(); f.set("file", new Blob(["hello"], { type: "text/plain" }), "notes.txt"); f.set("purpose", "kit"); f.set("kitId", page.url().split("/").pop()); return f; })() });
  expect(svgUpload.status).toBe(403);

  await page.goto("/kits");
  const kitCard = page.getByTestId("kit-card").filter({ hasText: "Northwind Coffee" });
  await expect(kitCard.getByTestId("kit-logo")).toBeVisible();

  step("F001 delete a kit after confirming");
  await page.getByTestId("new-kit").click();
  await page.getByTestId("name-input").fill("Holiday promo");
  await Promise.all([page.waitForURL(/\/kits\/[0-9a-f-]+$/), page.getByTestId("name-submit").click()]);
  await page.getByTestId("delete-kit").click();
  await expect(page.getByRole("alertdialog")).toContainText("Delete \"Holiday promo\"?");
  await Promise.all([page.waitForURL(/\/kits$/), page.getByRole("button", { name: "Delete kit" }).click()]);
  await expect(page.getByTestId("kit-card")).toHaveCount(1);

  // F002: generate from a prompt.
  step("F002 composer rules and generation");
  await page.goto("/");
  await runtime.assertBackLink(page);
  await expect(page.getByTestId("ai-off")).toHaveCount(0);
  await expect(page.getByTestId("create-video")).toBeDisabled();
  await page.getByTestId("composer-description").fill("A short launch video for mobile order-ahead at our coffee shops, aimed at commuters");
  await expect(page.getByTestId("create-video")).toBeEnabled();
  await page.getByTestId("composer-kit").selectOption({ label: "Northwind Coffee" });
  await page.getByTestId("composer-quality").selectOption("high");
  await page.getByTestId("composer-length").selectOption("15");
  await page.getByTestId("composer-aspect").selectOption("16:9");
  await page.getByTestId("composer-length").selectOption("custom");
  await page.getByTestId("composer-custom-length").fill("400");
  await expect(page.getByTestId("create-video")).toBeDisabled();
  await page.getByTestId("composer-length").selectOption("15");
  await Promise.all([page.waitForURL(/\/v\/[0-9a-f-]+$/), page.getByTestId("create-video").click()]);
  const videoId = page.url().split("/").pop();
  await expect(page.getByTestId("video-title-input")).toHaveValue("Order Ahead Launch");
  await expect(page.getByTestId("scene-item")).toHaveCount(4);
  await expect(page.getByTestId("version-badge")).toHaveText(["V1"]);
  await expect(page.getByTestId("video-kit")).toHaveText("Kit: Northwind Coffee");
  const created = await json(await runtime.fetch(`/api/videos/${videoId}`, { role: "owner" }));
  expect(created.draft.scenes.reduce((s, x) => s + x.duration, 0)).toBe(15);
  expect(created.kit.name).toBe("Northwind Coffee");
  expect(created.draft.scenes[0].colors.foreground).toBe("#3b2f2f");

  // F003: timeline editor.
  step("F003 player controls and captions");
  await expect(page.getByTestId("player").locator("canvas")).toBeVisible();
  await page.getByTestId("play").click();
  await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Pause");
  await page.getByTestId("play").click();
  await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Play");
  await page.getByTestId("mute").click();
  await expect(page.getByTestId("mute")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("scene-item").first().click();
  await expect(page.getByTestId("caption")).toHaveText("Mornings are busy. Your coffee shouldn't wait.");
  await page.getByTestId("captions").click();
  await expect(page.getByTestId("caption")).toHaveCount(0);
  await page.getByTestId("captions").click();

  step("F003 add, duplicate, delete, resize and reorder scenes");
  await page.getByTestId("add-scene").click();
  await page.getByTestId("add-position").selectOption({ label: "At the end" });
  await page.getByTestId("add-kind-text").click();
  await expect(page.getByTestId("scene-item")).toHaveCount(5);
  await page.getByTestId("scene-heading").fill("Ready before you arrive");
  await expect(page.getByTestId("scene-heading-label").nth(4)).toHaveText("Ready before you arrive");
  await page.getByTestId("duplicate-scene").click();
  await expect(page.getByTestId("scene-item")).toHaveCount(6);
  await page.getByTestId("delete-scene").click();
  await expect(page.getByTestId("scene-item")).toHaveCount(5);
  await page.getByTestId("scene-item").first().click();
  await page.getByTestId("scene-duration").fill("4");
  await expect(page.getByTestId("scene-duration-label").first()).toHaveText("4s");
  await page.getByTestId("scene-item").nth(0).dragTo(page.getByTestId("scene-item").nth(1));
  await expect(page.getByTestId("scene-heading-label").nth(0)).toHaveText("Order in two taps");
  await expect(page.getByTestId("scene-heading-label").nth(1)).toHaveText("Skip the morning line");

  step("F003 design panel, voiceover and music");
  await page.getByTestId("scene-item").nth(1).click();
  await page.getByTestId("scene-script").fill("Northwind mornings start before you reach the counter.");
  await page.getByTestId("scene-voice").selectOption("coral");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.getByTestId("synth-voice").click();
  await expect(page.getByTestId("voiceover-ready")).toBeVisible();
  await expect(page.getByTestId("caption")).toHaveText("Northwind mornings start before you reach the counter.");
  await page.getByTestId("music-upload").setInputFiles({ name: "morning-loop.wav", mimeType: "audio/wav", buffer: wav() });
  await expect(page.getByTestId("music-name")).toHaveText("morning-loop.wav");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("scene-item")).toHaveCount(5);
  await expect(page.getByTestId("scene-heading-label").nth(0)).toHaveText("Order in two taps");
  await expect(page.getByTestId("music-name")).toHaveText("morning-loop.wav");
  await expect(page.getByTestId("version-badge")).toHaveCount(1);
  const edited = await json(await runtime.fetch(`/api/videos/${videoId}`, { role: "owner" }));
  expect(edited.draft.scenes[1].voiceoverId).toBeTruthy();
  const voice = await runtime.fetch(`/files/${edited.draft.scenes[1].voiceoverId}?video=${videoId}`, { role: "owner" });
  expect(voice.status).toBe(200);
  expect(voice.headers.get("content-type")).toBe("audio/mpeg");

  step("F003 the 128-file cap");
  const many = { ...edited.draft, scenes: Array.from({ length: 129 }, (_, i) => ({ ...edited.draft.scenes[0], id: `cap${i}`, duration: 1, mediaId: crypto.randomUUID(), mediaType: "image" })) };
  const capped = await runtime.fetch(`/api/videos/${videoId}`, { role: "owner", method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft: many }) });
  expect(capped.status).toBe(403);
  expect((await json(capped)).error).toContain("128 files");

  // F004: chat edits and versions.
  step("F004 chat edit makes V2");
  await page.getByTestId("chat-input").fill("Make the closing scene say Order ahead today");
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("version-badge")).toHaveText(["V1", "V2"]);
  await expect(page.getByTestId("scene-heading-label").last()).toHaveText("Order ahead today");

  step("F004 rate down with feedback and another pass");
  await page.getByTestId("assistant-message").last().getByTestId("rate-down").click();
  await expect(page.getByText("What could be better?")).toBeVisible();
  await page.getByTestId("feedback-input").fill("Make the opening line warmer");
  await page.getByTestId("feedback-retry").click();
  await expect(page.getByTestId("version-badge")).toHaveText(["V1", "V2", "V3"]);
  await expect(page.getByTestId("scene-heading-label").first()).toHaveText("Your morning, sorted");
  await page.getByTestId("assistant-message").last().getByTestId("rate-up").click();
  await expect(page.getByTestId("assistant-message").last().getByTestId("rate-up")).toHaveAttribute("aria-pressed", "true");

  step("F004 preview and restore versions");
  await page.getByTestId("version-preview-1").click();
  await expect(page.getByTestId("preview-banner")).toContainText("Previewing V1");
  await expect(page.getByTestId("scene-item")).toHaveCount(4);
  await expect(page.getByTestId("scene-heading-label").first()).toHaveText("Skip the morning line");
  await expect(page.getByTestId("add-scene")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to draft" }).click();
  await expect(page.getByTestId("scene-heading-label").first()).toHaveText("Your morning, sorted");
  await page.getByTestId("version-restore-1").click();
  await expect(page.getByTestId("scene-heading-label").first()).toHaveText("Skip the morning line");
  await expect(page.getByTestId("scene-item")).toHaveCount(4);
  await page.getByTestId("version-restore-3").click();
  await expect(page.getByTestId("scene-heading-label").first()).toHaveText("Your morning, sorted");
  await expect(page.getByTestId("version-badge")).toHaveCount(3);

  // F005: saved scenes.
  step("F005 save a scene and reuse it");
  await page.getByTestId("scene-item").last().click();
  await page.getByTestId("save-scene").click();
  await page.getByTestId("name-input").fill("Closing call to action");
  await page.getByTestId("name-submit").click();
  await expect(page.getByText("Scene saved")).toBeVisible();
  await page.goto("/scenes");
  await expect(page.getByTestId("saved-scene-name")).toHaveText(["Closing call to action"]);
  await page.getByTestId("rename-saved-scene").click();
  await page.getByTestId("name-input").fill("Order ahead closer");
  await page.getByTestId("name-submit").click();
  await expect(page.getByTestId("saved-scene-name")).toHaveText(["Order ahead closer"]);
  const blank = await json(await runtime.fetch("/api/videos", { role: "owner", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Barista training teaser" }) }));
  await page.goto(`/v/${blank.id}`);
  await expect(page.getByTestId("scene-item")).toHaveCount(1);
  await page.getByTestId("add-scene").click();
  await page.getByTestId("add-tab-saved").click();
  await page.getByTestId("add-saved").filter({ hasText: "Order ahead closer" }).click();
  await expect(page.getByTestId("scene-item")).toHaveCount(2);
  await expect(page.getByTestId("scene-heading-label").nth(1)).toHaveText("Order ahead today");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.goto("/scenes");
  await page.getByTestId("delete-saved-scene").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No saved scenes yet")).toBeVisible();

  // F006: publish and share.
  step("F006 publish and share publicly");
  await page.goto(`/v/${videoId}`);
  expect((await runtime.fetch(`/s/${videoId}`)).status).toBe(404);
  await page.getByTestId("publish").click();
  await expect(page.getByTestId("share-link")).toHaveAttribute("href", `${origin}/s/${videoId}`);
  expect((await runtime.fetch(`/s/${videoId}`)).status).toBe(404);
  await page.getByTestId("share-mode").selectOption("public");
  await expect(page.getByTestId("share-mode")).toHaveValue("public");
  const shared = await runtime.fetch(`/s/${videoId}`);
  expect(shared.status).toBe(200);
  expect(await shared.text()).toContain("Order Ahead Launch");
  const anon = await (await runtime.context(null)).newPage();
  await anon.goto(`/s/${videoId}`);
  await expect(anon.getByRole("heading", { name: "Order Ahead Launch" })).toBeVisible();
  await expect(anon.getByTestId("player").locator("canvas")).toBeVisible();

  step("F006 changes need publishing again");
  await expect(page.getByTestId("publish-changes")).toHaveCount(0);
  await page.getByTestId("scene-item").first().click();
  await page.getByTestId("scene-heading").fill("Your morning, already brewing");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("publish-changes")).toBeVisible();
  const before = await json(await runtime.fetch(`/api/videos/${videoId}`, { role: "owner" }));
  expect(before.draft.scenes[0].heading).toBe("Your morning, already brewing");
  await page.getByTestId("publish").click();
  await expect(page.getByTestId("publish-changes")).toHaveCount(0);
  await expect(page.getByTestId("publish")).toHaveText("Published");

  step("F006 link preview from a frame");
  await page.getByTestId("preview-time").fill("2");
  await page.getByTestId("preview-frame").click();
  await expect(page.getByTestId("preview-image")).toBeVisible();
  const html = await (await runtime.fetch(`/s/${videoId}`)).text();
  const og = html.match(/property="og:image" content="([^"]+)"/);
  expect(og?.[1]).toMatch(new RegExp(`^${origin}/s/${videoId}/files/[0-9a-f-]+$`));
  const image = await runtime.fetch(new URL(og[1]).pathname);
  expect(image.status).toBe(200);
  expect(image.headers.get("content-type")).toBe("image/png");

  step("F006 private links hide from anonymous visitors");
  await page.getByTestId("share-mode").selectOption("private");
  await expect(page.getByTestId("share-mode")).toHaveValue("private");
  expect((await runtime.fetch(`/s/${videoId}`)).status).toBe(404);
  expect((await runtime.fetch(new URL(og[1]).pathname)).status).toBe(404);
  expect((await runtime.fetch(`/s/${videoId}`, { role: "owner" })).status).toBe(200);
  await page.getByTestId("share-mode").selectOption("public");
  await expect(page.getByTestId("share-mode")).toHaveValue("public");

  // F007: export.
  step("F007 export an MP4 and reuse it");
  await page.getByTestId("export-resolution").selectOption("1080p");
  await page.getByTestId("export-fps").selectOption("24");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByTestId("export-start").click()]);
  expect(download.suggestedFilename()).toBe("Order Ahead Launch.mp4");
  await expect(page.getByTestId("export-row")).toHaveCount(1);
  await expect(page.getByTestId("export-row")).toContainText("1080p · 24 fps");
  const exports = await json(await runtime.fetch(`/api/videos/${videoId}/exports`, { role: "owner" }));
  const mp4 = Buffer.from(await (await runtime.fetch(`/files/${exports.exports[0].mediaId}?video=${videoId}`, { role: "owner" })).arrayBuffer());
  expect(mp4.subarray(4, 8).toString()).toBe("ftyp");
  const [again] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-start").click()]);
  expect(again.suggestedFilename()).toBe("Order Ahead Launch.mp4");
  await expect(page.getByText("No changes since the last export")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("export-row")).toHaveCount(1);
  await page.getByTestId("export-fps").selectOption("60");
  await page.getByTestId("export-restore").click();
  await expect(page.getByTestId("export-fps")).toHaveValue("24");
  const [old] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-download").click()]);
  expect(old.suggestedFilename()).toBe("Order Ahead Launch.mp4");

  // F008: library and projects.
  step("F008 search, projects, rename, duplicate and delete");
  await page.goto("/");
  await expect(page.getByTestId("video-card")).toHaveCount(2);
  await page.getByTestId("video-search").fill("order");
  await expect(page.getByTestId("video-title")).toHaveText(["Order Ahead Launch"]);
  await page.getByTestId("video-search").fill("nothing like this");
  await expect(page.getByText("No videos match")).toBeVisible();
  await page.getByTestId("video-search").fill("");
  await expect(page.getByTestId("video-card")).toHaveCount(2);
  await page.getByTestId("new-project").click();
  await page.getByTestId("name-input").fill("Spring launch");
  await page.getByTestId("name-submit").click();
  const card = page.getByTestId("video-card").filter({ hasText: "Order Ahead Launch" });
  await card.getByTestId("video-options").click();
  await page.getByRole("menuitem", { name: "Move to project" }).click();
  await page.getByTestId("move-target").selectOption({ label: "Spring launch" });
  await page.getByRole("button", { name: "Move" }).click();
  await expect(card).toContainText("Spring launch");
  await page.getByTestId("project-filter").selectOption({ label: "Spring launch" });
  await expect(page.getByTestId("video-title")).toHaveText(["Order Ahead Launch"]);
  await page.getByTestId("project-filter").selectOption("");

  const teaser = page.getByTestId("video-card").filter({ hasText: "Barista training teaser" });
  await teaser.getByTestId("video-options").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByTestId("name-input").fill("Barista training preview");
  await page.getByTestId("name-submit").click();
  await expect(page.getByTestId("video-title")).toContainText(["Barista training preview"]);

  await card.getByTestId("video-options").click();
  await Promise.all([page.waitForURL(/\/v\/[0-9a-f-]+$/), page.getByRole("menuitem", { name: "Duplicate" }).click()]);
  expect(page.url()).not.toContain(videoId);
  await expect(page.getByTestId("video-title-input")).toHaveValue("Order Ahead Launch (copy)");
  await expect(page.getByTestId("scene-item")).toHaveCount(5);
  await expect(page.getByTestId("version-badge")).toHaveCount(0);
  await expect(page.getByTestId("export-row")).toHaveCount(0);
  await page.goto("/");
  const copy = page.getByTestId("video-card").filter({ hasText: "(copy)" });
  await copy.getByTestId("video-options").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Delete");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("video-card")).toHaveCount(2);

  step("F001 later kit edits leave existing videos alone");
  await page.goto("/kits");
  await page.getByTestId("kit-card").first().click();
  await page.getByTestId("kit-name-input").fill("Northwind Roasters");
  await page.getByTestId("color-hex").first().fill("#000000");
  await page.getByTestId("save-kit").click();
  await expect(page.getByText("Kit saved")).toBeVisible();
  const after = await json(await runtime.fetch(`/api/videos/${videoId}`, { role: "owner" }));
  expect(after.kit.name).toBe("Northwind Coffee");
  expect(after.kit.colors[0].hex).toBe("#3b2f2f");

  step("phone-sized smoke");
  const phone = await (await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/");
  await expect(phone.getByTestId("composer-description")).toBeVisible();
  await expect(phone.getByTestId("create-video")).toBeVisible();
  await expect(phone.getByRole("link", { name: "Brand kits" })).toBeVisible();

  step("the editor with the finished video");
  await page.goto(`/v/${videoId}`);
  await expect(page.getByTestId("video-kit")).toHaveText("Kit: Northwind Coffee");
  await page.getByTestId("scene-item").nth(1).click();
  await expect(page.getByTestId("scene-panel")).toBeVisible();
  await page.mouse.move(0, 0);
  await runtime.screenshot(page);
  console.log("behavior: all checks passed");
} finally {
  await runtime.close();
}
