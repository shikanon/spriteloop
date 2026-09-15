import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
export const root = path.resolve("data");
export const jobsRoot = path.join(root, "jobs");
export const assetsRoot = path.join(root, "assets");
export async function initStorage() {
  await Promise.all([
    mkdir(jobsRoot, { recursive: true }),
    mkdir(assetsRoot, { recursive: true }),
  ]);
}
export function assertId(id) {
  if (!/^[a-zA-Z0-9_-]{1,90}$/.test(id))
    throw new Error("素材或任务 ID 无效。");
  return id;
}
export const jobDir = (id) => path.join(jobsRoot, assertId(id));
export async function atomicJSON(file, data) {
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}
export async function saveJob(job) {
  await mkdir(jobDir(job.id), { recursive: true });
  await atomicJSON(path.join(jobDir(job.id), "job.json"), job);
}
export async function getJob(id) {
  try {
    return JSON.parse(
      await readFile(path.join(jobDir(id), "job.json"), "utf8"),
    );
  } catch {
    throw Object.assign(new Error("找不到此任务。"), { status: 404 });
  }
}
export async function listJobs() {
  const dirs = await readdir(jobsRoot);
  const rows = await Promise.all(
    dirs.map((id) => getJob(id).catch(() => null)),
  );
  return rows
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
// Multipart filenames can arrive as UTF-8 bytes decoded as Latin-1.
export function displayFilename(name = "") {
  if (/[\u0080-\u00ff]/.test(name) && !/[^\u0000-\u00ff]/.test(name)) {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    if (!decoded.includes("\ufffd")) return decoded;
  }
  return name;
}
export async function getAsset(id) {
  try {
    const asset = JSON.parse(
      await readFile(path.join(assetsRoot, assertId(id) + ".json"), "utf8"),
    );
    return { ...asset, name: displayFilename(asset.name) };
  } catch {
    throw Object.assign(new Error("找不到原画，请重新上传。"), { status: 404 });
  }
}
export function publicJob(job) {
  const { providerUrl, ...safe } = job;
  return safe.name ? { ...safe, name: displayFilename(safe.name) } : safe;
}

export async function listAssets(directory = assetsRoot) {
  const entries = await readdir(directory);
  const assets = await Promise.all(
    entries
      .filter((name) => /^[a-zA-Z0-9_-]+\.json$/.test(name))
      .map(async (name) => {
        try {
          const asset = JSON.parse(
            await readFile(path.join(directory, name), "utf8"),
          );
          if (
            !asset.id ||
            name !== asset.id + ".json" ||
            asset.file !== asset.id + ".png"
          )
            return null;
          const info = await stat(path.join(directory, asset.file));
          return {
            id: asset.id,
            name: displayFilename(asset.name),
            url: "/media/assets/" + asset.file,
            width: asset.width,
            height: asset.height,
            hasAlpha: !!asset.hasAlpha,
            createdAt: asset.createdAt || info.birthtime.toISOString(),
          };
        } catch {
          return null;
        }
      }),
  );
  return assets
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
}
