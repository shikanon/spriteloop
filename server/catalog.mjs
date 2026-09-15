import { renderPrompt } from "./settings.mjs";
export const models = [
  {
    id: "doubao-seedance-2-5-260628",
    name: "Seedance 2.5",
    resolutions: ["480p", "720p", "1080p"],
    maxDuration: 30,
    audio: true,
  },
  {
    id: "doubao-seedance-2-0-mini-260615",
    name: "Seedance 2.0 Mini",
    resolutions: ["480p", "720p"],
    maxDuration: 15,
    audio: true,
  },
  {
    id: "doubao-seedance-2-0-fast-260128",
    name: "Seedance 2.0 Fast",
    resolutions: ["480p", "720p"],
    maxDuration: 15,
    audio: true,
  },
  {
    id: "doubao-seedance-2-0-260128",
    name: "Seedance 2.0",
    resolutions: ["480p", "720p", "1080p"],
    maxDuration: 15,
    audio: true,
  },
  {
    id: "doubao-seedance-1-5-pro-251215",
    name: "Seedance 1.5 Pro",
    resolutions: ["480p", "720p", "1080p"],
    maxDuration: 12,
    audio: true,
    cameraFixed: true,
  },
  {
    id: "doubao-seedance-1-0-pro-250528",
    name: "Seedance 1.0 Pro",
    resolutions: ["480p", "720p", "1080p"],
    maxDuration: 12,
    cameraFixed: true,
  },
];
export function validateGeneration(input) {
  const model = models.find((m) => m.id === input.model);
  if (!model) throw new Error("请选择支持的 Seedance 模型。");
  if (!model.resolutions.includes(input.resolution))
    throw new Error("当前模型不支持此分辨率。");
  if (
    !Number.isInteger(input.duration) ||
    input.duration < 4 ||
    input.duration > model.maxDuration
  )
    throw new Error(`视频时长需为 4–${model.maxDuration} 秒的整数。`);
  if (
    typeof input.prompt !== "string" ||
    !input.prompt.trim() ||
    input.prompt.length > 500
  )
    throw new Error("动作描述需为 1–500 字。");
  if (typeof input.loop !== "boolean") throw new Error("循环参数无效。");
  return model;
}
export function validateProcessing(input = {}) {
  const p = {
    mode: "uniform",
    fps: 12,
    removeWhite: true,
    backgroundColor: "#ffffff",
    tolerance: 30,
    softness: 2,
    preserveWhite: true,
    size: 512,
    ...input,
  };
  if (
    !["uniform", "keyframes"].includes(p.mode) ||
    !Number.isInteger(p.fps) ||
    p.fps < 1 ||
    p.fps > 24
  )
    throw new Error("采样方式或帧率无效，支持 1–24 FPS。");
  for (const [k, max] of [
    ["tolerance", 100],
    ["softness", 20],
  ])
    if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > max)
      throw new Error("背景处理参数超出范围。");
  if (![0, 256, 512, 768].includes(p.size)) throw new Error("导出尺寸无效。");
  if (
    typeof p.removeWhite !== "boolean" ||
    typeof p.preserveWhite !== "boolean"
  )
    throw new Error("背景处理参数无效。");
  if (
    typeof p.backgroundColor !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(p.backgroundColor)
  )
    throw new Error("背景颜色需为有效的六位十六进制颜色。");
  p.backgroundColor = p.backgroundColor.toLowerCase();
  return p;
}
export function buildRequest(input, model, first) {
  const { backgroundColor } = validateProcessing(input.processing);
  const prompt = renderPrompt(
    input.prompt,
    backgroundColor,
    input.promptTemplate,
  );
  return {
    model: model.id,
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: first }, role: "first_frame" },
      { type: "image_url", image_url: { url: first }, role: "last_frame" },
    ],
    duration: input.duration,
    resolution: input.resolution,
    ratio: "adaptive",
    watermark: false,
    ...(model.audio ? { generate_audio: false } : {}),
    ...(model.cameraFixed ? { camera_fixed: true } : {}),
  };
}
