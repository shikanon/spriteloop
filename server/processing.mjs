import { validateProcessing } from "./catalog.mjs";
import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { removeSolidBackground } from "./matte.mjs";
import { jobDir, atomicJSON } from "./storage.mjs";
export function run(bin, args) {
  return new Promise((resolve, reject) => {
    let out = "",
      err = "";
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timeout = setTimeout(() => proc.kill("SIGKILL"), 180000);
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => {
      err = (err + d).slice(-5000);
    });
    proc.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timeout);
      code === 0
        ? resolve(out)
        : reject(new Error(`媒体处理失败：${err.slice(-1000)}`));
    });
  });
}
export async function probe(video) {
  const data = JSON.parse(
    await run(process.env.FFPROBE_PATH || ffprobe.path, [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      video,
    ]),
  );
  const stream = data.streams.find((s) => s.codec_type === "video");
  const duration = Number(data.format.duration);
  if (!stream || !Number.isFinite(duration) || duration <= 0 || duration > 60)
    throw new Error("视频需可解码，时长在 0–60 秒以内。");
  if (stream.width * stream.height > 3840 * 2160)
    throw new Error("导入视频最大支持 4K。");
  return {
    width: stream.width,
    height: stream.height,
    duration,
    codec: stream.codec_name,
  };
}
export async function prepareVideoPreview(job) {
  const base = jobDir(job.id),
    video = path.join(base, "source.mp4");
  const actual = await probe(video);
  let playbackName = "source.mp4";
  if (actual.codec !== "h264") {
    playbackName = "playback.mp4";
    await run(process.env.FFMPEG_PATH || ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      video,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      path.join(base, playbackName),
    ]);
  }
  // Connect three complete cycles without blending or reversing frames. Internal
  // seams can be judged without depending on the browser's end-of-file seek.
  await run(process.env.FFMPEG_PATH || ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-stream_loop",
    "2",
    "-i",
    path.join(base, playbackName),
    "-an",
    "-c:v",
    "copy",
    "-movflags",
    "+faststart",
    "-y",
    path.join(base, "loop-preview.mp4"),
  ]);
  return {
    actual,
    videoUrl: `/media/jobs/${job.id}/loop-preview.mp4`,
    sourceVideoUrl: `/media/jobs/${job.id}/${playbackName}`,
    cycles: 3,
  };
}
export async function processVideo(job, progress) {
  const base = jobDir(job.id),
    video = path.join(base, "source.mp4"),
    p = validateProcessing(job.processing);
  const { actual, videoUrl } = job.preview || (await prepareVideoPreview(job));
  const expected = Math.ceil(actual.duration * p.fps);
  if (expected > 360) throw new Error("最多采样 360 帧，请降低采样帧率。");
  const revision = "render-" + Date.now(),
    dir = path.join(base, revision);
  await mkdir(path.join(dir, "raw"), { recursive: true });
  await mkdir(path.join(dir, "frames"));
  const maxSide = p.size || Math.max(actual.width, actual.height);
  const factor = Math.min(1, maxSide / Math.max(actual.width, actual.height));
  const width = Math.max(1, Math.round(actual.width * factor)),
    height = Math.max(1, Math.round(actual.height * factor));
  const filter = `fps=${p.fps},scale=${width}:${height}:flags=neighbor`;
  await progress("extracting", 35, "解码视频并采样帧");
  await run(process.env.FFMPEG_PATH || ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    video,
    "-an",
    "-vf",
    filter,
    "-frames:v",
    "360",
    path.join(dir, "raw", "%04d.png"),
  ]);
  const files = (await readdir(path.join(dir, "raw")))
    .filter((f) => f.endsWith(".png"))
    .sort();
  if (!files.length) throw new Error("视频中未提取到有效画面。");
  let previous = null;
  const chosen = [];
  for (let i = 0; i < files.length; i++) {
    const file = path.join(dir, "raw", files[i]);
    const small = await sharp(file)
      .resize(32, 32, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();
    let diff = Infinity;
    if (previous) {
      let total = 0;
      for (let n = 0; n < small.length; n++)
        total += Math.abs(small[n] - previous[n]);
      diff = total / small.length;
    }
    if (
      p.mode === "uniform" ||
      i === 0 ||
      i === files.length - 1 ||
      diff >= 1.5
    ) {
      chosen.push({ file, timestamp: i / p.fps });
      previous = small;
    }
  }
  const cols = Math.ceil(Math.sqrt(chosen.length)),
    rows = Math.ceil(chosen.length / cols);
  if (cols * width * rows * height > 90000000)
    throw new Error(
      "图集像素超过 9000 万，请将导出尺寸设为 512 或 256，或降低采样帧率。",
    );
  await progress("matting", 55, "移除纯色背景并保留 Alpha 通道");
  const frames = [];
  const composite = [];
  for (let i = 0; i < chosen.length; i++) {
    const raw = await sharp(chosen[i].file).ensureAlpha().raw().toBuffer();
    if (p.removeWhite) removeSolidBackground(raw, width, height, p);
    const name = `${String(i).padStart(4, "0")}.png`,
      output = path.join(dir, "frames", name);
    await sharp(raw, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(output);
    const x = (i % cols) * width,
      y = Math.floor(i / cols) * height;
    const durationMs = Math.max(
      1,
      Math.round((chosen[i + 1]?.timestamp ?? actual.duration) * 1000) -
        Math.round(chosen[i].timestamp * 1000),
    );
    frames.push({
      name,
      url: `/media/jobs/${job.id}/${revision}/frames/${name}`,
      timestamp: chosen[i].timestamp,
      duration_ms: durationMs,
      frame: { x, y, w: width, h: height },
      anchor: { x: 0.5, y: 0.5 },
    });
    composite.push({ input: output, left: x, top: y });
  }
  await progress("exporting", 85, "打包透明序列帧与图集");
  await sharp({
    create: {
      width: cols * width,
      height: rows * height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composite)
    .png()
    .toFile(path.join(dir, "spritesheet.png"));
  const manifest = {
    version: 1,
    job_id: job.id,
    source: job.source || "ark",
    model: job.model || null,
    requested: { duration: job.duration, resolution: job.resolution },
    actual,
    processing: p,
    width,
    height,
    frame_count: frames.length,
    fps: p.fps,
    loop: job.loop,
    loop_quality: "unreviewed",
    frames,
    sheet: { width: cols * width, height: rows * height, columns: cols, rows },
    artifacts: [
      "frames/",
      "spritesheet.png",
      "spritesheet.json",
      "preview.webp",
      "manifest.json",
    ],
  };
  await atomicJSON(path.join(dir, "spritesheet.json"), {
    frames,
    meta: {
      image: "spritesheet.png",
      size: { w: cols * width, h: rows * height },
      loop: job.loop,
      loop_quality: "unreviewed",
    },
  });
  await atomicJSON(path.join(dir, "manifest.json"), manifest);
  // WebP uses the same selected frames and explicit variable durations as the player/JSON.
  await sharp(
    composite.map((item) => item.input),
    { join: { animated: true } },
  )
    .webp({
      lossless: true,
      loop: job.loop ? 0 : 1,
      delay: frames.map((f) => f.duration_ms),
    })
    .toFile(path.join(dir, "preview.webp"));
  return {
    ...manifest,
    revision,
    videoUrl,
    sheetUrl: `/media/jobs/${job.id}/${revision}/spritesheet.png`,
    previewUrl: `/media/jobs/${job.id}/${revision}/preview.webp`,
  };
}
