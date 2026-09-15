import { useState } from "react";
import {
  History,
  Images,
  X,
  Search,
  Upload,
  Film,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import type { Asset, Job, Model } from "../lib/types";
import { api } from "../lib/api";
const statusNames: Record<string, string> = {
  queued: "排队中",
  running: "生成中",
  processing: "帧处理中",
  awaiting_review: "待检查循环",
  succeeded: "已完成",
  failed: "失败",
};
const date = (value?: string) =>
  value
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "历史素材";
export function CollectionsDialog({
  view,
  jobs,
  assets,
  models,
  loading,
  error,
  onClose,
  onRestore,
  onOpen,
  onUseAsset,
  onRefresh,
}: {
  view: "history" | "library";
  jobs: Job[];
  assets: Asset[];
  models: Model[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onRestore: (job: Job) => void;
  onOpen: (job: Job) => void;
  onUseAsset: (asset: Asset) => void;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("images");
  const [status, setStatus] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const modelName = (j: Job) =>
    models.find((m) => m.id === j.model)?.name || j.model || "导入视频";
  const matches = (text: string) =>
    text.toLowerCase().includes(query.trim().toLowerCase());
  const records = jobs.filter(
    (j) =>
      matches([j.prompt, j.name, j.id, modelName(j)].join(" ")) &&
      (status === "all" || j.status === status),
  );
  const imageAssets = assets.filter((a) => matches(a.name));
  const animations = jobs
    .filter((j) => j.videoReady || j.result)
    .filter((j) => matches([j.name, j.prompt, j.id].join(" ")));
  const importAsset = async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api<Asset>("/api/assets", { method: "POST", body: form });
      await onRefresh();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="dialog collections-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={view === "history" ? "历史生成记录" : "素材库"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-heading">
          <h2>
            {view === "history" ? <History size={20} /> : <Images size={20} />}{" "}
            {view === "history" ? "历史生成记录" : "素材库"}
          </h2>
          <button
            autoFocus
            className="icon-button"
            aria-label="关闭素材窗口"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="collections-body">
          <p className="hint collection-intro">
            {view === "history"
              ? "点击记录恢复原画、动作、模型、时长、分辨率、背景与处理参数。恢复不会自动生成或计费。"
              : "上传的原画和生成的动画自动保存于本机，可随时复用和导出。"}
          </p>
          <div className="collection-toolbar">
            <label className="collection-search">
              <Search size={16} />
              <input
                aria-label={view === "history" ? "搜索历史记录" : "搜索素材"}
                placeholder={
                  view === "history"
                    ? "搜索动作、模型或任务 ID"
                    : "搜索素材名称或动作"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {view === "history" ? (
              <select
                aria-label="历史任务状态"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">全部状态</option>
                {Object.entries(statusNames).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <label className="secondary collection-upload">
                <Upload size={14} />
                {uploading ? "上传中…" : "上传原画"}
                <input
                  type="file"
                  aria-label="上传原画到素材库"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importAsset(file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            <button
              className="text-button"
              disabled={loading}
              onClick={() => void onRefresh()}
            >
              刷新
            </button>
          </div>
          {(error || uploadError) && (
            <p className="settings-error" role="alert">
              {uploadError || error}
            </p>
          )}
          {view === "library" && (
            <div className="collection-tabs">
              <button
                className={tab === "images" ? "active" : ""}
                onClick={() => setTab("images")}
              >
                <ImageIcon size={14} />
                原画素材 <span>{assets.length}</span>
              </button>
              <button
                className={tab === "animations" ? "active" : ""}
                onClick={() => setTab("animations")}
              >
                <Film size={14} />
                动画素材{" "}
                <span>
                  {jobs.filter((j) => j.videoReady || j.result).length}
                </span>
              </button>
            </div>
          )}
          {loading ? (
            <p className="collection-empty">正在读取本机记录…</p>
          ) : view === "history" ? (
            <>
              <p className="hint collection-count">
                共 {records.length} 条记录 · 按时间倒序
              </p>
              <div className="history-list">
                {records.map((j) => (
                  <button
                    className="history-card"
                    key={j.id}
                    onClick={() => onRestore(j)}
                    aria-label={`恢复参数 ${j.prompt || j.name || j.id}`}
                  >
                    <div className="history-thumb checker">
                      {j.firstAssetId ? (
                        <img
                          src={`/media/assets/${j.firstAssetId}.png`}
                          alt="生成原画"
                        />
                      ) : j.result ? (
                        <img src={j.result.frames[0]?.url} alt="动画缩略图" />
                      ) : (
                        <Film size={25} />
                      )}
                    </div>
                    <div className="history-content">
                      <div className="history-title">
                        <strong>{j.prompt || j.name || "动画任务"}</strong>
                        <span className={`job-state ${j.status}`}>
                          {statusNames[j.status] || j.status}
                        </span>
                      </div>
                      <p>
                        {modelName(j)} ·{" "}
                        {j.duration ? `${j.duration} 秒 · ` : ""}
                        {j.resolution ? `${j.resolution} · ` : ""}
                        {date(j.createdAt)}
                      </p>
                      <div className="history-details">
                        <span>
                          {(j.generationProcessing || j.processing).fps} FPS
                        </span>
                        <span>
                          {(j.generationProcessing || j.processing).mode ===
                          "keyframes"
                            ? "关键帧"
                            : "等间隔"}
                        </span>
                        <span>
                          <i
                            style={{
                              backgroundColor:
                                (j.generationProcessing || j.processing)
                                  .backgroundColor || "#ffffff",
                            }}
                          />
                          {(j.generationProcessing || j.processing)
                            .backgroundColor || "#FFFFFF"}
                        </span>
                        <span>任务 {j.id.slice(0, 8)}</span>
                        {j.result && <span>{j.result.frame_count} 帧</span>}
                      </div>
                      {j.error && <p className="history-error">{j.error}</p>}
                      <span className="restore-label">
                        {j.source === "ark"
                          ? "恢复生成参数"
                          : "恢复视频与处理参数"}{" "}
                        →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {!records.length && (
                <p className="collection-empty">
                  {jobs.length
                    ? "没有匹配的历史记录"
                    : "生成动画或导入视频后，记录会显示在这里。"}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="hint collection-count">
                共 {tab === "images" ? imageAssets.length : animations.length}{" "}
                个素材
              </p>
              <div className="asset-grid">
                {tab === "images"
                  ? imageAssets.map((a) => (
                      <article className="asset-card" key={a.id}>
                        <div className="asset-cover checker">
                          <img src={a.url} alt={a.name} loading="lazy" />
                        </div>
                        <div className="asset-info">
                          <strong title={a.name}>{a.name}</strong>
                          <p>
                            {a.width} × {a.height} ·{" "}
                            {a.hasAlpha ? "含透明通道" : "原画"}
                          </p>
                          <p>{date(a.createdAt)}</p>
                          <div className="asset-actions">
                            <button
                              className="secondary"
                              onClick={() => onUseAsset(a)}
                              aria-label={`用作首帧 ${a.name}`}
                            >
                              用作首帧
                            </button>
                            <a
                              href={a.url}
                              download={a.name}
                              aria-label={`下载原画 ${a.name}`}
                            >
                              <Download size={15} />
                            </a>
                          </div>
                        </div>
                      </article>
                    ))
                  : animations.map((j) => (
                      <article className="asset-card" key={j.id}>
                        <div className="asset-cover checker">
                          {j.result ? (
                            <img
                              src={j.result.previewUrl}
                              alt="循环动画预览"
                              loading="lazy"
                            />
                          ) : (
                            <video
                              src={
                                j.preview?.videoUrl ||
                                `/media/jobs/${j.id}/source.mp4`
                              }
                              muted
                              loop
                              controls
                              playsInline
                              preload="metadata"
                            />
                          )}
                        </div>
                        <div className="asset-info">
                          <strong title={j.prompt || j.name}>
                            {j.prompt || j.name || "动画素材"}
                          </strong>
                          <p>
                            {j.result
                              ? `${j.result.frame_count} 帧 · ${j.result.width} × ${j.result.height}`
                              : "视频已保存 · 待提取序列帧"}
                          </p>
                          <p>{date(j.createdAt)}</p>
                          <div className="asset-actions">
                            <button
                              className="secondary"
                              onClick={() => onOpen(j)}
                              aria-label={`打开动画 ${j.id.slice(0, 8)}`}
                            >
                              打开素材
                            </button>
                            {j.status === "succeeded" && j.result ? (
                              <a
                                href={`/api/jobs/${j.id}/export?format=all`}
                                download
                                aria-label={`导出动画 ${j.id.slice(0, 8)}`}
                              >
                                <Download size={15} />
                              </a>
                            ) : (
                              <a
                                href={`/media/jobs/${j.id}/source.mp4`}
                                download
                                aria-label={`下载视频 ${j.id.slice(0, 8)}`}
                              >
                                <Download size={15} />
                              </a>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
              </div>
              {!(tab === "images" ? imageAssets : animations).length && (
                <p className="collection-empty">
                  {query
                    ? "没有匹配的素材"
                    : tab === "images"
                      ? "上传原画后，即可在这里重复使用。"
                      : "生成动画或导入视频后，素材会自动出现在这里。"}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
