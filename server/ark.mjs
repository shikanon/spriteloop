import { settingsStore } from "./settings.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { assetsRoot } from "./storage.mjs";
export async function assetDataUrl(asset, backgroundColor = "#ffffff") {
  const png = await sharp(await readFile(path.join(assetsRoot, asset.file)))
    .flatten({ background: backgroundColor })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
export async function arkRequest(endpoint, body, apiKey) {
  const key = apiKey ?? (await settingsStore.get()).apiKey;
  if (!key)
    throw new Error("尚未配置方舟 API Key，请在设置中填写火山方舟 API Key。");
  const response = await fetch(
    `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks${endpoint}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `方舟 ${response.status} · ${data.error?.code || "RequestFailed"}：${data.error?.message || "接口请求失败"}`,
    );
  return data;
}
