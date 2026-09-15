import {
  X,
  FolderOpen,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import type { Job } from "../lib/types";
export function Dialog({
  view,
  onClose,
  jobs,
  onSelect,
}: {
  view: string;
  onClose: () => void;
  jobs: Job[];
  onSelect: (job: Job) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={view === "library" ? "作品库" : "使用指南"}
        className="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-heading">
          <h2>
            {view === "library" ? (
              <FolderOpen size={20} />
            ) : (
              <BookOpen size={20} />
            )}{" "}
            {view === "library" ? "本地作品库" : "从原画，到游戏中的下一帧"}
          </h2>
          <button
            autoFocus
            className="icon-button"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {view === "library" ? (
          <div className="library-list">
            {jobs.length ? (
              jobs.map((j) => (
                <button
                  key={j.id}
                  className="job-row"
                  onClick={() => onSelect(j)}
                >
                  <div className="job-thumb checker">
                    {j.result ? (
                      <img src={j.result.frames[0]?.url} alt="作品缩略图" />
                    ) : (
                      <FolderOpen size={24} />
                    )}
                  </div>
                  <div>
                    <strong>
                      {j.name || j.prompt?.slice(0, 27) || "动画任务"}
                    </strong>
                    <p>
                      {j.source === "import"
                        ? "本地视频"
                        : j.model?.replace("doubao-", "")}{" "}
                      · {new Date(j.createdAt).toLocaleString("zh-CN")}
                    </p>
                    <span className={"job-state " + j.status}>
                      {j.status === "succeeded" ? (
                        <CheckCircle2 size={12} />
                      ) : j.status === "failed" ? (
                        <AlertCircle size={12} />
                      ) : (
                        <LoaderCircle size={12} />
                      )}
                      {{
                        succeeded: "素材已就绪",
                        awaiting_review: "待检查循环衔接",
                        failed: "处理失败",
                        queued: "排队中",
                        running: "生成中",
                        processing: "帧处理中",
                      }[j.status] || j.status}
                      {j.result ? ` · ${j.result.frame_count} 帧` : ""}
                    </span>
                  </div>
                  <ArrowUpRight size={17} />
                </button>
              ))
            ) : (
              <div className="empty-library">
                <FolderOpen size={40} strokeWidth={1} />
                <h3>你的第一部作品，从这里开始</h3>
                <p>生成动画或导入视频后，素材将自动保存在本机。</p>
              </div>
            )}
          </div>
        ) : (
          <div className="guide">
            <ol>
              <li>
                <b>导入原画</b>
                <p>
                  上传 PNG、JPG 或 WebP，宽高 300–6000
                  px。透明原画会在发送给模型前合成所选背景色（默认白色，可选绿幕绿或自定义）。原本带场景的图片建议先去除背景。
                </p>
              </li>
              <li>
                <b>描述动作，生成视频</b>
                <p>
                  选择动作与模型。同一原画会自动用于首帧与尾帧，无需上传尾帧。生成使用你的方舟账户，按平台实际用量计费。
                </p>
              </li>
              <li>
                <b>提取、移除纯色背景与检查</b>
                <p>
                  先无限循环播放原始视频，检查尾帧回到首帧的衔接；点击「确认连贯，提取序列帧」后才开始转换。等间隔适合连续动画；关键帧会去除变化很小的采样帧，并保留每帧时长。调整容差、边缘和导出尺寸后，点击「应用设置」。生成模型不能保证均匀纯色背景或无缝循环，导出前请逐帧检查。
                </p>
              </li>
              <li>
                <b>带进你的游戏</b>
                <p>
                  导出透明 PNG 序列、Sprite Sheet + JSON、WebP 动画及
                  manifest。图集使用统一画布、固定中心锚点，不自动移动角色。历史记录与素材库保存在本机
                  data 目录。
                </p>
              </li>
            </ol>
            <a
              className="doc-link"
              href="https://ark.volcengine.com/region:cn-beijing/docs/82379/1520757?lang=zh"
              target="_blank"
              rel="noreferrer"
            >
              查看方舟官方模型文档 <ArrowUpRight size={15} />
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
