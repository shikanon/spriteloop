import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createSettingsStore,
  defaultPromptTemplate,
  renderPrompt,
  validateTemplate,
} from "../server/settings.mjs";
import { buildRequest, models } from "../server/catalog.mjs";
import { arkRequest } from "../server/ark.mjs";

test("settings retain credentials, persist atomically, and never return secrets", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "spriteloop-settings-"));
  try {
    const store = createSettingsStore(dir, () => "environment-test-secret");
    const initial = await store.publicSettings();
    assert.equal(initial.keyConfigured, true);
    assert.equal(initial.keySource, "environment");
    assert.equal(initial.promptTemplate, defaultPromptTemplate);
    assert.ok(!JSON.stringify(initial).includes("environment-test-secret"));
    const template = "{{action}}。背景 RGB({{background_rgb}})。固定镜头。";
    await store.save({ promptTemplate: template, apiKey: "" });
    assert.equal((await store.get()).apiKey, "environment-test-secret");
    const saved = await store.save({ apiKey: "replacement-test-secret" });
    assert.equal(saved.keySource, "settings");
    assert.ok(!("apiKey" in saved));
    assert.ok(!JSON.stringify(saved).includes("replacement-test-secret"));
    const reopened = createSettingsStore(dir, () => "environment-test-secret");
    assert.equal((await reopened.get()).apiKey, "replacement-test-secret");
    assert.equal((await reopened.get()).promptTemplate, template);
    assert.equal(
      (await stat(path.join(dir, "settings.json"))).mode & 0o777,
      0o600,
    );
    await assert.rejects(
      store.save({ promptTemplate: "broken", apiKey: "should-not-be-saved" }),
    );
    assert.equal((await store.get()).apiKey, "replacement-test-secret");
    await assert.rejects(store.save({ apiKey: "bad\nkey" }));
    await Promise.all([
      store.save({ apiKey: "concurrent-test-secret" }),
      store.save({ promptTemplate: defaultPromptTemplate }),
    ]);
    assert.equal((await store.get()).apiKey, "concurrent-test-secret");
    assert.equal((await store.get()).promptTemplate, defaultPromptTemplate);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("preview and provider request use the same complete template without hidden suffixes", () => {
  const template =
    "{{action}}；{{background}} RGB({{background_rgb}})；保持双脚不动。";
  const job = {
    prompt: "角色呼吸",
    promptTemplate: template,
    duration: 4,
    resolution: "720p",
    processing: { backgroundColor: "#00ff00" },
  };
  const expected = "角色呼吸；纯绿色绿幕背景 RGB(0,255,0)；保持双脚不动。";
  assert.equal(renderPrompt(job.prompt, "#00ff00", template), expected);
  assert.equal(
    buildRequest(job, models[4], "same-frame").content[0].text,
    expected,
  );
  for (const value of [
    null,
    "",
    "{{action}}",
    "{{background_rgb}}",
    "{{action}}{{background_rgb}}{{unknown}}",
  ])
    assert.throws(() => validateTemplate(value));
  assert.equal(
    renderPrompt(
      "保留 {{background}} 文本",
      "#ffffff",
      "{{action}} RGB({{background_rgb}})",
    ),
    "保留 {{background}} 文本 RGB(255,255,255)",
  );
});

test("provider uses configured credential without adding it to request body", async () => {
  const previous = globalThis.fetch;
  let observed;
  globalThis.fetch = async (url, options) => {
    observed = { url, options };
    return { ok: true, json: async () => ({ id: "test-task" }) };
  };
  try {
    await arkRequest("", { model: models[4].id }, "explicit-test-secret");
    assert.equal(
      observed.options.headers.Authorization,
      "Bearer explicit-test-secret",
    );
    assert.ok(!observed.options.body.includes("explicit-test-secret"));
    assert.ok(observed.url.startsWith("https://ark.cn-beijing.volces.com/"));
  } finally {
    globalThis.fetch = previous;
  }
});
