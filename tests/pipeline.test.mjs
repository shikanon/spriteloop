import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import ffmpeg from "ffmpeg-static";
import { jobDir, initStorage } from "../server/storage.mjs";
import {
  run,
  processVideo,
  prepareVideoPreview,
  probe,
} from "../server/processing.mjs";
import { validateProcessing } from "../server/catalog.mjs";
for (const backgroundColor of ["#ffffff", "#00ff00"])
  test(`real FFmpeg ${backgroundColor} → alpha PNGs → sheet → WebP maintain geometry and timings`, async () => {
    await initStorage();
    const id = "test-" + randomUUID(),
      dir = jobDir(id);
    await mkdir(dir, { recursive: true });
    try {
      for (let i = 0; i < 2; i++)
        await sharp({
          create: {
            width: 128,
            height: 128,
            channels: 3,
            background: backgroundColor,
          },
        })
          .composite([
            {
              input: await sharp({
                create: {
                  width: 32,
                  height: 48,
                  channels: 4,
                  background: "#b83055",
                },
              })
                .png()
                .toBuffer(),
              left: 48 + i * 12,
              top: 40,
            },
          ])
          .png()
          .toFile(path.join(dir, `input${i}.png`));
      await run(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-framerate",
        "2",
        "-i",
        path.join(dir, "input%d.png"),
        "-t",
        "1",
        "-r",
        "24",
        "-pix_fmt",
        "yuv420p",
        path.join(dir, "source.mp4"),
      ]);
      const job = {
        id,
        loop: true,
        source: "import",
        processing: validateProcessing({ fps: 12, size: 256, backgroundColor }),
      };
      const preview = await prepareVideoPreview(job);
      assert.equal(preview.actual.duration, 1);
      assert.equal(preview.cycles, 3);
      const loopVideo = await probe(path.join(dir, "loop-preview.mp4"));
      assert.ok(Math.abs(loopVideo.duration - 3) < 0.05);
      assert.equal(
        (await readdir(dir)).filter((name) => name.startsWith("render-"))
          .length,
        0,
      );
      job.preview = preview;
      const result = await processVideo(job, async () => {});
      assert.equal(result.frames.length, 12);
      assert.equal(result.width, 128);
      assert.equal(result.height, 128);
      assert.equal(
        result.frames.reduce((sum, f) => sum + f.duration_ms, 0),
        1000,
      );
      const folder = path.join(dir, result.revision);
      const first = await sharp(path.join(folder, "frames/0000.png"))
        .ensureAlpha()
        .raw()
        .toBuffer();
      assert.equal(first[3], 0);
      assert.equal(first[(64 * 128 + 64) * 4 + 3], 255);
      const sheet = await sharp(
        path.join(folder, "spritesheet.png"),
      ).metadata();
      assert.equal(sheet.width, result.sheet.width);
      assert.equal(sheet.height, result.sheet.height);
      const webp = await sharp(path.join(folder, "preview.webp"), {
        animated: true,
      }).metadata();
      assert.equal(
        webp.delay.reduce((sum, d) => sum + d, 0),
        1000,
      );
      job.processing.mode = "keyframes";
      const reduced = await processVideo(job, async () => {});
      assert.equal(reduced.frames.length, 3);
      assert.equal(
        reduced.frames.reduce((sum, f) => sum + f.duration_ms, 0),
        1000,
      );
      const metadata = JSON.parse(
        await readFile(
          path.join(dir, reduced.revision, "manifest.json"),
          "utf8",
        ),
      );
      assert.equal(metadata.loop_quality, "unreviewed");
      assert.equal(metadata.frame_count, 3);
      assert.equal(metadata.processing.backgroundColor, backgroundColor);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
