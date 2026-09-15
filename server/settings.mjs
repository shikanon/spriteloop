import { readFile, mkdir, writeFile, rename, chmod } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { root } from "./storage.mjs";

export const defaultPromptTemplate =
  "{{action}}。{{background}} RGB({{background_rgb}})，背景均匀、没有地面、没有阴影、没有文字或水印。镜头完全固定，角色完整保持在画面中央，保持原图的造型、比例、配色、装备和美术风格，不裁切、不缩放、不移动镜头。动作完成一个自然循环，最终恢复初始姿态。";
export function validateTemplate(template) {
  if (
    typeof template !== "string" ||
    !template.trim() ||
    template.length > 4000
  )
    throw new Error("提示词模板需为 1–4000 字。");
  for (const token of ["{{action}}", "{{background_rgb}}"])
    if (!template.includes(token))
      throw new Error(`模板需保留 ${token} 变量。`);
  const unknown = template
    .match(/\{\{[^{}]+\}\}/g)
    ?.find(
      (t) =>
        !["{{action}}", "{{background}}", "{{background_rgb}}"].includes(t),
    );
  if (unknown) throw new Error(`不支持的模板变量：${unknown}`);
  return template.trim();
}
export function renderPrompt(
  action,
  backgroundColor = "#ffffff",
  template = defaultPromptTemplate,
) {
  validateTemplate(template);
  if (typeof action !== "string" || !action.trim() || action.length > 500)
    throw new Error("动作描述需为 1–500 字。");
  if (!/^#[0-9a-f]{6}$/i.test(backgroundColor))
    throw new Error("背景颜色无效。");
  const color = backgroundColor.toLowerCase();
  const values = {
    action: action.trim(),
    background:
      color === "#ffffff"
        ? "纯白色背景"
        : color === "#00ff00"
          ? "纯绿色绿幕背景"
          : "纯色背景",
    background_rgb: color
      .slice(1)
      .match(/../g)
      .map((c) => parseInt(c, 16))
      .join(","),
  };
  return template.replace(
    /\{\{(action|background|background_rgb)\}\}/g,
    (_, name) => values[name],
  );
}
export function createSettingsStore(
  directory,
  environmentKey = () => process.env.ARK_API_KEY || "",
) {
  const file = path.join(directory, "settings.json");
  let pending = Promise.resolve();
  const read = async () => {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw new Error("无法读取本机设置。");
    }
  };
  const get = async () => {
    const saved = await read();
    return {
      promptTemplate: saved.promptTemplate || defaultPromptTemplate,
      apiKey: saved.apiKey || environmentKey().trim(),
      keySource: saved.apiKey
        ? "settings"
        : environmentKey().trim()
          ? "environment"
          : "none",
    };
  };
  const publicSettings = async () => {
    const { apiKey, ...settings } = await get();
    return { ...settings, keyConfigured: !!apiKey, defaultPromptTemplate };
  };
  const save = (input) => {
    const operation = pending.then(async () => {
      if (!input || typeof input !== "object")
        throw new Error("设置格式无效。");
      const saved = await read();
      if (input.promptTemplate !== undefined)
        saved.promptTemplate = validateTemplate(input.promptTemplate);
      if (input.apiKey !== undefined) {
        if (typeof input.apiKey !== "string")
          throw new Error("API Key 格式无效。");
        const key = input.apiKey.trim();
        if (
          key &&
          (key.length < 10 || key.length > 512 || /[^\x21-\x7e]/.test(key))
        )
          throw new Error("API Key 格式无效，请粘贴完整密钥。");
        if (key) saved.apiKey = key;
      }
      await mkdir(directory, { recursive: true });
      const tmp = file + "." + randomUUID() + ".tmp";
      await writeFile(tmp, JSON.stringify(saved, null, 2), { mode: 0o600 });
      await chmod(tmp, 0o600);
      await rename(tmp, file);
      return publicSettings();
    });
    pending = operation.catch(() => {});
    return operation;
  };
  return { get, publicSettings, save };
}
export const settingsStore = createSettingsStore(root);
