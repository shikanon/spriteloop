import "dotenv/config";
import express from "express";
import multer from "multer";
import sharp from "sharp";
import archiver from "archiver";
import { randomUUID } from "node:crypto";
import { writeFile, rename } from "node:fs/promises";
import path from "node:path";
import {
  models,
  validateGeneration,
  validateProcessing,
  buildRequest,
} from "./catalog.mjs";
import {
  root,
  assetsRoot,
  initStorage,
  atomicJSON,
  jobDir,
  saveJob,
  getJob,
  listJobs,
  listAssets,
  displayFilename,
  getAsset,
  publicJob,
} from "./storage.mjs";
import { arkRequest, assetDataUrl } from "./ark.mjs";
import { processVideo, probe, prepareVideoPreview } from "./processing.mjs";
import { requestExtraction } from "./workflow.mjs";
import { settingsStore, renderPrompt, validateTemplate } from "./settings.mjs";
await initStorage();
const app = express();
app.disable("x-powered-by");
// This is a local single-user studio. Reject browser requests from other origins.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    origin !== `http://${req.headers.host}` &&
    origin !== `https://${req.headers.host}`
  )
    return res.status(403).json({ error: "拒绝跨站请求。" });
  const host = (req.headers.host || "").split(":")[0];
  if (!["localhost", "127.0.0.1", "["].includes(host))
    return res.status(403).json({ error: "仅支持本机访问。" });
  next();
});
app.use(express.json({ limit: "2mb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});
const videoUpload = multer({
  dest: path.join(root, "incoming"),
  limits: { fileSize: 150 * 1024 * 1024, files: 1 },
});
const active = new Set();
const queue = [];
let working = false;
function enqueue(id) {
  if (active.has(id)) return;
  active.add(id);
  queue.push(id);
  void drain();
}
async function drain() {
  if (working) return;
  working = true;
  while (queue.length) {
    const id = queue.shift();
    try {
      await execute(id);
    } catch (e) {
      const job = await getJob(id);
      job.status = "failed";
      job.error = e.message;
      job.updatedAt = new Date().toISOString();
      await saveJob(job);
    } finally {
      active.delete(id);
    }
  }
  working = false;
}
async function execute(id) {
  const job = await getJob(id);
  const update = async (stage, progress, message) => {
    Object.assign(job, {
      stage,
      progress,
      message,
      updatedAt: new Date().toISOString(),
    });
    await saveJob(job);
  };
  if (job.source === "ark" && !job.videoReady) {
    const { apiKey } = await settingsStore.get();
    if (!job.providerId) {
      const model = validateGeneration(job);
      const first = await getAsset(job.firstAssetId);
      const firstData = await assetDataUrl(
        first,
        job.processing?.backgroundColor,
      );
      await update("submitting", 5, "正在提交方舟任务");
      const result = await arkRequest(
        "",
        buildRequest(job, model, firstData),
        apiKey,
      );
      if (!result.id) throw new Error("方舟未返回任务 ID。");
      job.providerId = result.id;
      await saveJob(job);
    }
    job.status = "running";
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      const result = await arkRequest(
        "/" + encodeURIComponent(job.providerId),
        undefined,
        apiKey,
      );
      if (result.status === "succeeded") {
        if (!result.content?.video_url)
          throw new Error("方舟任务成功但没有视频地址。");
        job.provider = {
          status: result.status,
          duration: result.duration,
          resolution: result.resolution,
          seed: result.seed,
          usage: result.usage,
        };
        await update("downloading", 25, "视频生成完成，正在保存到本机");
        const url = new URL(result.content.video_url);
        if (url.protocol !== "https:")
          throw new Error("方舟返回了无效视频地址。");
        const response = await fetch(url, {
          signal: AbortSignal.timeout(120000),
        });
        if (!response.ok)
          throw new Error(
            `下载生成视频失败 (${response.status})。可稍后重试。`,
          );
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 200 * 1024 * 1024)
            throw new Error("生成视频超过 200MB 限制。");
          chunks.push(chunk);
        }
        await writeFile(
          path.join(jobDir(id), "source.mp4"),
          Buffer.concat(chunks),
        );
        job.videoReady = true;
        await saveJob(job);
        break;
      }
      if (["failed", "cancelled", "expired"].includes(result.status))
        throw new Error(
          `方舟任务 ${result.status}：${result.error?.message || result.error?.code || "请修改输入后重试。"}`,
        );
      await update(
        result.status === "queued" ? "queued" : "generating",
        15,
        result.status === "queued" ? "方舟排队中" : "方舟正在生成动画",
      );
      await new Promise((r) => setTimeout(r, 8000));
    }
    if (!job.videoReady)
      throw new Error(
        "本地等待已达 30 分钟；方舟任务可能仍在运行，可点击继续查询，不会重复提交。",
      );
  }
  if (!job.continuityReview?.accepted) {
    await update("preparing_preview", 30, "准备首尾循环预览");
    job.preview = await prepareVideoPreview(job);
    job.status = "awaiting_review";
    await update("loop_review", 30, "请检查尾帧回到首帧时的动作衔接");
    return;
  }
  job.status = "processing";
  await saveJob(job);
  job.result = await processVideo(job, update);
  job.status = "succeeded";
  job.stage = "done";
  job.progress = 100;
  job.message = "素材已就绪";
  job.error = null;
  job.updatedAt = new Date().toISOString();
  await saveJob(job);
}
app.get("/api/config", async (_req, res) => {
  const { keyConfigured } = await settingsStore.publicSettings();
  res
    .set("Cache-Control", "no-store")
    .json({ models, keyConfigured, local: true });
});
app.get("/api/settings", async (_req, res) => {
  res
    .set("Cache-Control", "no-store")
    .json(await settingsStore.publicSettings());
});
app.post("/api/settings", async (req, res) => {
  res.set("Cache-Control", "no-store").json(await settingsStore.save(req.body));
});
app.post("/api/settings/preview", (req, res) => {
  res.json({
    prompt: renderPrompt(
      req.body.action,
      req.body.backgroundColor,
      req.body.promptTemplate,
    ),
  });
});
app.get("/api/assets", async (_req, res) => res.json(await listAssets()));
app.get("/api/assets/:id", async (req, res) =>
  res.json(await getAsset(req.params.id)),
);
app.post("/api/assets", upload.single("file"), async (req, res) => {
  if (!req.file) throw new Error("请选择图片。");
  let image = sharp(req.file.buffer, { limitInputPixels: 36000000 });
  const meta = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(meta.format) || meta.pages > 1)
    throw new Error("请上传静态 PNG、JPEG 或 WebP。");
  const normalized = await image.rotate().png().toBuffer();
  const dims = await sharp(normalized).metadata();
  if (
    dims.width < 300 ||
    dims.height < 300 ||
    dims.width > 6000 ||
    dims.height > 6000 ||
    dims.width / dims.height < 0.4 ||
    dims.width / dims.height > 2.5
  )
    throw new Error(
      "方舟要求图片宽高 300–6000 px，宽高比 0.4–2.5。请先调整原画画布。",
    );
  const id = randomUUID(),
    file = id + ".png";
  const asset = {
    id,
    file,
    name: displayFilename(req.file.originalname).slice(0, 160),
    width: dims.width,
    height: dims.height,
    hasAlpha: !!meta.hasAlpha,
    createdAt: new Date().toISOString(),
    url: "/media/assets/" + file,
  };
  await writeFile(path.join(assetsRoot, file), normalized);
  await atomicJSON(path.join(assetsRoot, id + ".json"), asset);
  res.status(201).json(asset);
});
app.post("/api/jobs", async (req, res) => {
  if (active.size >= 4)
    throw new Error("最多保留 4 个待处理任务，请等待当前任务完成。");
  const { model, prompt, duration, resolution, firstAssetId, processing } =
    req.body;
  const input = { model, prompt, duration, resolution, loop: true };
  validateGeneration(input);
  await getAsset(firstAssetId);
  const settings = await settingsStore.get();
  if (!settings.apiKey) throw new Error("请先在设置中填写火山方舟 API Key。");
  const job = {
    id: randomUUID(),
    ...input,
    firstAssetId,
    promptTemplate:
      req.body.promptTemplate === undefined
        ? settings.promptTemplate
        : validateTemplate(req.body.promptTemplate),
    generationProcessing: validateProcessing(processing),
    lastAssetId: firstAssetId,
    processing: validateProcessing(processing),
    source: "ark",
    status: "queued",
    stage: "queued",
    progress: 0,
    message: "任务已创建",
    createdAt: new Date().toISOString(),
  };
  await saveJob(job);
  enqueue(job.id);
  res.status(202).json(publicJob(job));
});
app.post("/api/import-video", videoUpload.single("file"), async (req, res) => {
  if (!req.file) throw new Error("请选择视频。");
  try {
    if (active.size >= 4) throw new Error("任务队列已满，请稍后再试。");
    await probe(req.file.path);
    const processing = validateProcessing(
      JSON.parse(req.body.processing || "{}"),
    );
    const job = {
      id: randomUUID(),
      source: "import",
      name: displayFilename(req.file.originalname).slice(0, 160),
      loop: true,
      status: "queued",
      stage: "queued",
      progress: 0,
      videoReady: true,
      processing,
      createdAt: new Date().toISOString(),
    };
    await saveJob(job);
    await rename(req.file.path, path.join(jobDir(job.id), "source.mp4"));
    enqueue(job.id);
    res.status(202).json(job);
  } catch (e) {
    await import("node:fs/promises").then((fs) =>
      fs.unlink(req.file.path).catch(() => {}),
    );
    throw e;
  }
});
app.get("/api/jobs", async (_req, res) =>
  res.json((await listJobs()).map(publicJob)),
);
app.get("/api/jobs/:id", async (req, res) =>
  res.json(publicJob(await getJob(req.params.id))),
);
app.post("/api/jobs/:id/process", async (req, res) => {
  const job = await getJob(req.params.id);
  if (active.has(job.id)) throw new Error("当前任务正在处理中。");
  if (!job.videoReady) throw new Error("需要先生成或导入视频。");
  Object.assign(job, requestExtraction(job, req.body));
  job.status = "queued";
  job.stage = "queued";
  job.message = "等待重新处理已保存视频";
  job.error = null;
  job.progress = 0;
  await saveJob(job);
  enqueue(job.id);
  res.status(202).json(publicJob(job));
});
app.post("/api/jobs/:id/resume", async (req, res) => {
  const job = await getJob(req.params.id);
  if (active.has(job.id)) throw new Error("当前任务正在处理中。");
  if (!job.providerId && !job.videoReady)
    throw new Error("提交未成功，请重新生成。");
  if (["succeeded", "awaiting_review"].includes(job.status))
    return res.json(publicJob(job));
  job.status = "queued";
  job.error = null;
  await saveJob(job);
  enqueue(job.id);
  res.status(202).json(publicJob(job));
});
app.get("/api/jobs/:id/export", async (req, res) => {
  const job = await getJob(req.params.id);
  if (job.status !== "succeeded" || !job.result)
    throw new Error("素材尚未就绪。");
  const dir = path.join(jobDir(job.id), job.result.revision),
    format = req.query.format || "all";
  if (!["all", "frames", "sheet"].includes(format))
    throw new Error("导出格式无效。");
  res.attachment(`SpriteLoop-${job.id.slice(0, 8)}-${format}.zip`);
  const zip = archiver("zip", { zlib: { level: 5 } });
  zip.on("error", (err) => res.destroy(err));
  zip.pipe(res);
  if (format !== "sheet") zip.directory(path.join(dir, "frames"), "frames");
  if (format !== "frames") {
    zip.file(path.join(dir, "spritesheet.png"), { name: "spritesheet.png" });
    zip.file(path.join(dir, "spritesheet.json"), { name: "spritesheet.json" });
  }
  for (const file of ["manifest.json", "preview.webp"])
    zip.file(path.join(dir, file), { name: file });
  await zip.finalize();
});
// Expose only artifacts, never job internals or credentials.
app.use(
  "/media",
  (req, res, next) => {
    if (!/\.(png|webp|mp4)$/.test(req.path)) return res.sendStatus(404);
    next();
  },
  express.static(root, { dotfiles: "deny", index: false }),
);
app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在。" }));
app.use((err, _req, res, _next) => {
  res.status(err.status || 400).json({
    error:
      err.code === "LIMIT_FILE_SIZE"
        ? "文件超过大小限制。"
        : err.message || "请求失败。",
  });
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      fs: {
        deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/data/**"],
      },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(Number(process.env.PORT) || 3100, "127.0.0.1", () =>
  console.log(
    "SpriteLoop is ready at http://localhost:" + (process.env.PORT || 3100),
  ),
);
// Resume persisted jobs without re-creating an already-submitted provider task.
for (const job of await listJobs())
  if (["queued", "running", "processing"].includes(job.status)) {
    if (job.stage === "submitting" && !job.providerId) {
      job.status = "failed";
      job.error =
        "上次提交期间服务中断，无法确认方舟是否接受；请先在方舟控制台检查任务，避免重复计费。";
      await saveJob(job);
    } else enqueue(job.id);
  }
