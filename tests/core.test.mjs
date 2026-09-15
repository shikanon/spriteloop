import test from "node:test";
import assert from "node:assert/strict";
import {
  models,
  validateGeneration,
  validateProcessing,
  buildRequest,
} from "../server/catalog.mjs";
import { removeWhite } from "../server/matte.mjs";
const base = {
  model: models[4].id,
  prompt: "原地呼吸",
  duration: 5,
  resolution: "720p",
  loop: true,
};
test("six models produce first/last frame requests with capability-specific options", () => {
  for (const model of models) {
    const input = { ...base, model: model.id };
    validateGeneration(input);
    const request = buildRequest(input, model, "data:first", "data:last");
    assert.equal(request.content[1].role, "first_frame");
    assert.equal(request.content[2].role, "last_frame");
    assert.equal(request.content[2].image_url.url, "data:first");
    assert.equal("camera_fixed" in request, !!model.cameraFixed);
    assert.equal("generate_audio" in request, !!model.audio);
    assert.match(request.content[0].text, /纯白色背景/);
  }
});
test("reject incompatible model resolution and malformed durations", () => {
  assert.throws(() =>
    validateGeneration({ ...base, model: models[1].id, resolution: "1080p" }),
  );
  assert.throws(() => validateGeneration({ ...base, duration: Infinity }));
  assert.throws(() => validateGeneration({ ...base, duration: 31 }));
  assert.throws(() => validateGeneration({ ...base, prompt: "" }));
  assert.throws(() => validateProcessing({ fps: 0 }));
  assert.throws(() => validateProcessing({ fps: 25 }));
  assert.throws(() => validateProcessing({ size: 999 }));
  assert.throws(() => validateProcessing({ removeWhite: "true" }));
});
test("border-connected matting preserves enclosed white subject details", () => {
  const w = 7,
    h = 7,
    rgba = Buffer.alloc(w * h * 4, 255);
  for (let y = 1; y <= 5; y++)
    for (let x = 1; x <= 5; x++)
      if (x === 1 || x === 5 || y === 1 || y === 5) {
        const i = (y * w + x) * 4;
        rgba[i] = 10;
        rgba[i + 1] = 80;
        rgba[i + 2] = 30;
      }
  const original = Buffer.from(rgba);
  removeWhite(rgba, w, h, { tolerance: 30, softness: 2, preserveWhite: true });
  assert.equal(rgba[3], 0);
  assert.equal(rgba[(3 * w + 3) * 4 + 3], 255);
  assert.equal(rgba[(1 * w + 1) * 4 + 3], 255);
  removeWhite(original, w, h, { preserveWhite: false });
  assert.equal(original[(3 * w + 3) * 4 + 3], 0);
});
test("soft edge alpha and no horizontal flood wrapping", () => {
  const rgba = Buffer.from([
    255, 255, 255, 255, 220, 220, 220, 255, 100, 150, 100, 255,
  ]);
  removeWhite(rgba, 3, 1, { tolerance: 30, softness: 10 });
  assert.equal(rgba[3], 0);
  assert.equal(rgba[7], 128);
  assert.equal(rgba[11], 255);
});

import { requestExtraction } from "../server/workflow.mjs";
test("extraction requires explicit continuity review and preserves acceptance on retry", () => {
  const job = { videoReady: true, status: "awaiting_review" };
  assert.throws(
    () => requestExtraction(job, { processing: { fps: 12 } }),
    /先循环预览/,
  );
  assert.throws(
    () => requestExtraction(job, { confirmContinuity: "true", processing: {} }),
    /先循环预览/,
  );
  const accepted = requestExtraction(job, {
    confirmContinuity: true,
    processing: { fps: 12 },
  });
  assert.equal(accepted.loop, true);
  assert.equal(accepted.continuityReview.accepted, true);
  assert.equal(job.continuityReview, undefined);
  const retry = requestExtraction(
    { ...job, ...accepted },
    { processing: { fps: 6 } },
  );
  assert.deepEqual(retry.continuityReview, accepted.continuityReview);
  assert.throws(
    () => requestExtraction({ videoReady: false }, { confirmContinuity: true }),
    /先生成/,
  );
  assert.throws(() =>
    requestExtraction(job, {
      confirmContinuity: true,
      processing: { fps: 99 },
    }),
  );
});

test("solid background selection defaults to white and validates custom RGB", () => {
  assert.equal(validateProcessing().backgroundColor, "#ffffff");
  assert.equal(
    validateProcessing({ backgroundColor: "#Aa22Ff" }).backgroundColor,
    "#aa22ff",
  );
  for (const color of [null, 5, "green", "#fff", "#00ff00ff", "#gggggg"])
    assert.throws(() => validateProcessing({ backgroundColor: color }));
  const green = buildRequest(
    { ...base, processing: { backgroundColor: "#00ff00" } },
    models[4],
    "same-frame",
  );
  assert.match(green.content[0].text, /纯绿色绿幕背景 RGB\(0,255,0\)/);
  assert.equal(green.content[1].image_url.url, green.content[2].image_url.url);
  const custom = buildRequest(
    { ...base, processing: { backgroundColor: "#123456" } },
    models[4],
    "same-frame",
  );
  assert.match(custom.content[0].text, /RGB\(18,52,86\)/);
});

test("green and custom mattes remove selected color and unmix softened edges", () => {
  const green = Buffer.from([
    0, 255, 0, 255, 35, 220, 35, 255, 255, 255, 255, 255,
  ]);
  removeWhite(green, 3, 1, {
    backgroundColor: "#00ff00",
    tolerance: 30,
    softness: 10,
  });
  assert.deepEqual(
    [...green],
    [0, 255, 0, 0, 70, 185, 70, 128, 255, 255, 255, 255],
  );
  const blue = Buffer.from([18, 52, 86, 255, 255, 255, 255, 255]);
  removeWhite(blue, 2, 1, { backgroundColor: "#123456" });
  assert.equal(blue[3], 0);
  assert.equal(blue[7], 255);
  const ring = Buffer.alloc(7 * 7 * 4);
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const border = x === 1 || x === 5 || y === 1 || y === 5;
      ring.set(border ? [255, 0, 0, 255] : [0, 255, 0, 255], (y * 7 + x) * 4);
    }
  const unprotected = Buffer.from(ring);
  removeWhite(ring, 7, 7, { backgroundColor: "#00ff00" });
  assert.equal(ring[3], 0);
  assert.equal(ring[(3 * 7 + 3) * 4 + 3], 255);
  removeWhite(unprotected, 7, 7, {
    backgroundColor: "#00ff00",
    preserveWhite: false,
  });
  assert.equal(unprotected[(3 * 7 + 3) * 4 + 3], 0);
});
