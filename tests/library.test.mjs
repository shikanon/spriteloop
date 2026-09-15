import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { listAssets, displayFilename } from "../server/storage.mjs";
import { validateProcessing } from "../server/catalog.mjs";
import { requestExtraction } from "../server/workflow.mjs";

test("asset library lists reusable images, keeps stable dates, and skips missing or invalid files", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "spriteloop-library-"));
  try {
    const legacy = {
      id: "legacy",
      file: "legacy.png",
      name: "old.png",
      width: 320,
      height: 320,
      hasAlpha: true,
    };
    const recent = {
      ...legacy,
      id: "recent",
      file: "recent.png",
      name: "new.png",
      createdAt: "2099-01-01T00:00:00.000Z",
    };
    for (const asset of [legacy, recent]) {
      await writeFile(
        path.join(dir, asset.id + ".json"),
        JSON.stringify(asset),
      );
      await writeFile(path.join(dir, asset.file), "test image bytes");
    }
    await writeFile(path.join(dir, "broken.json"), "not json");
    await writeFile(
      path.join(dir, "missing.json"),
      JSON.stringify({ ...legacy, id: "missing", file: "missing.png" }),
    );
    await writeFile(
      path.join(dir, "escape.json"),
      JSON.stringify({ ...legacy, id: "escape", file: "../private.png" }),
    );
    const items = await listAssets(dir);
    assert.deepEqual(
      items.map((a) => a.id),
      ["recent", "legacy"],
    );
    assert.equal(items[0].url, "/media/assets/recent.png");
    assert.equal(items[1].hasAlpha, true);
    assert.ok(Number.isFinite(Date.parse(items[1].createdAt)));
    assert.equal((await listAssets(dir))[1].createdAt, items[1].createdAt);
    assert.equal("file" in items[0], false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reprocessing preserves the original generation configuration for history restoration", () => {
  const original = validateProcessing({ fps: 12, backgroundColor: "#00ff00" });
  const job = {
    videoReady: true,
    continuityReview: { accepted: true },
    generationProcessing: original,
    processing: original,
    promptTemplate: "{{action}} RGB({{background_rgb}})",
  };
  const patch = requestExtraction(job, {
    processing: { fps: 6, backgroundColor: "#ffffff" },
  });
  const next = { ...job, ...patch };
  assert.equal(next.processing.fps, 6);
  assert.equal(next.processing.backgroundColor, "#ffffff");
  assert.equal(next.generationProcessing.fps, 12);
  assert.equal(next.generationProcessing.backgroundColor, "#00ff00");
  assert.equal(next.promptTemplate, job.promptTemplate);
});

test("asset names display Chinese multipart filenames without damaging normal names", () => {
  const name = "飞书文档 - 图片 (2).png";
  assert.equal(
    displayFilename(Buffer.from(name, "utf8").toString("latin1")),
    name,
  );
  assert.equal(displayFilename(name), name);
  assert.equal(displayFilename("café.png"), "café.png");
  assert.equal(displayFilename("ranger.png"), "ranger.png");
});
