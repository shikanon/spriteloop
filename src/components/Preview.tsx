import { useEffect, useRef, useState } from "react";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Minus,
  Plus,
  Maximize,
  Image as ImageIcon,
  LoaderCircle,
  AlertCircle,
  ChevronRight,
  RotateCcw,
  Infinity as LoopIcon,
  ArrowRight,
} from "lucide-react";
import { Panel } from "./Controls";
import type { Asset, Job } from "../lib/types";
export function Preview({
  asset,
  job,
  onResume,
  onConfirm,
  submitting,
}: {
  asset: Asset | null;
  job: Job | null;
  onResume: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const [tab, setTab] = useState("transparent"),
    [zoom, setZoom] = useState(100),
    [playing, setPlaying] = useState(false),
    [index, setIndex] = useState(0);
  const canvas = useRef<HTMLDivElement>(null);
  const result = job?.status === "succeeded" ? job.result : undefined;
  const frames = result?.frames || [];
  const frame = frames[index] || frames[0];
  const busy =
    !!job && !["succeeded", "failed", "awaiting_review"].includes(job.status);
  const reviewNeeded =
    !!job?.videoReady && !job.continuityReview?.accepted && !busy;
  useEffect(() => {
    setIndex(0);
    setTab(reviewNeeded ? "video" : result ? "transparent" : "video");
  }, [result?.revision, job?.id, reviewNeeded]);
  useEffect(() => {
    setPlaying(!!result && tab === "transparent");
  }, [result?.revision, tab]);
  useEffect(() => {
    if (!playing || !frames.length) return;
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % frames.length),
      frame?.duration_ms || 100,
    );
    return () => clearTimeout(timer);
  }, [playing, index, frame, frames.length]);
  const currentTime = frame?.timestamp || 0,
    total = result?.actual.duration || 0;
  const step = (n: number) => {
    setPlaying(false);
    setIndex((i) => (i + n + frames.length) % frames.length);
  };
  return (
    <div className="center-column">
      <Panel
        title="动画预览"
        tools={
          <div className="preview-tools">
            <div className="segmented">
              <button
                className={tab === "transparent" ? "active" : ""}
                disabled={!result}
                onClick={() => setTab("transparent")}
              >
                透明序列帧
              </button>
              <button
                className={tab === "video" ? "active" : ""}
                disabled={!job?.videoReady}
                onClick={() => {
                  setTab("video");
                  setPlaying(false);
                }}
              >
                循环视频
              </button>
            </div>
            <div className="zoom-controls">
              <button
                aria-label="缩小"
                onClick={() => setZoom((z) => Math.max(50, z - 25))}
              >
                <Minus size={13} />
              </button>
              <span>{zoom}%</span>
              <button
                aria-label="放大"
                onClick={() => setZoom((z) => Math.min(200, z + 25))}
              >
                <Plus size={13} />
              </button>
            </div>
            <button
              className="icon-button fullscreen-button"
              aria-label="全屏预览"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void canvas.current?.requestFullscreen().catch(() => {});
              }}
            >
              <Maximize size={15} />
            </button>
          </div>
        }
        className="preview-panel"
      >
        <div className="canvas-wrap">
          <div
            ref={canvas}
            className={
              "preview-canvas checker " +
              (tab === "video" ? "video-canvas" : "")
            }
          >
            <div className="canvas-corners" />
            {tab === "video" && job?.videoReady ? (
              <LoopVideo
                key={job.id}
                src={
                  job.preview?.videoUrl ||
                  result?.videoUrl ||
                  `/media/jobs/${job.id}/source.mp4`
                }
              />
            ) : (
              <img
                className="sprite-main"
                style={{ transform: `scale(${zoom / 100})` }}
                src={frame?.url || asset?.url || "/assets/ranger.png"}
                alt={
                  frame
                    ? "透明动画当前帧"
                    : asset
                      ? "上传原画预览"
                      : "绿色游侠示例原画，尚未生成动画"
                }
              />
            )}
            {!busy && (
              <>
                <span className="canvas-label">
                  <span className="mini-dot" />
                  {tab === "video" && job?.videoReady
                    ? "尾帧 → 首帧 · 无限循环"
                    : result
                      ? "透明序列帧"
                      : asset
                        ? "原画预览 · 尚未生成"
                        : "示例原画 · 尚未生成"}
                </span>
                <span className="canvas-size">
                  {result
                    ? `${result.width} × ${result.height}`
                    : asset
                      ? `${asset.width} × ${asset.height}`
                      : "SPRITE PREVIEW"}
                </span>
              </>
            )}
            {busy ? (
              <div className="processing-overlay">
                <LoaderCircle size={29} className="spin" />
                <h3>{job.message || "等待处理"}</h3>
                <p>
                  {job.source === "ark"
                    ? "正在创建你的下一帧"
                    : "正在处理本地视频"}
                </p>
                <div className="progress-track">
                  <i style={{ width: `${job.progress || 3}%` }} />
                </div>
                <span className="tiny muted">
                  可离开页面，任务会保存在作品库
                </span>
              </div>
            ) : null}
          </div>
        </div>
        {tab === "video" && job?.videoReady ? (
          <div className="loop-playback-note">
            <LoopIcon size={16} />
            <span>完整动作首尾相接 · 三轮连续预览后继续无限循环</span>
          </div>
        ) : (
          <div className="player-controls">
            <button
              aria-label={playing ? "暂停动画" : "播放动画"}
              className="icon-button play-button"
              disabled={!frames.length || tab === "video"}
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? (
                <Pause size={19} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </button>
            <span className="timecode">
              {currentTime.toFixed(2)} <span>/ {total.toFixed(2)} s</span>
            </span>
            <input
              type="range"
              aria-label="时间轴进度"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={Math.min(index, Math.max(0, frames.length - 1))}
              disabled={!frames.length}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
            />
            <button
              className="icon-button"
              aria-label="上一帧"
              disabled={!frames.length}
              onClick={() => step(-1)}
            >
              <SkipBack size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="下一帧"
              disabled={!frames.length}
              onClick={() => step(1)}
            >
              <SkipForward size={15} />
            </button>
          </div>
        )}
      </Panel>
      {reviewNeeded ? (
        <Panel
          title="循环衔接检查"
          className="loop-review-panel"
          tools={<span className="tiny muted">转换前检查</span>}
        >
          <div className="loop-review-body">
            <div className="seam-diagram">
              <span>首帧</span>
              <ArrowRight size={15} />
              <span>完整动作</span>
              <ArrowRight size={15} />
              <span>尾帧 = 首帧</span>
              <LoopIcon size={19} />
            </div>
            <p>
              视频会无限循环。重点观察每次尾帧回到首帧时，姿态、位置和动作速度是否连贯。
            </p>
            <button
              className="primary confirm-loop"
              disabled={submitting}
              onClick={onConfirm}
            >
              {submitting ? "正在开始提取…" : "确认连贯，提取序列帧"}
              <ArrowRight size={16} />
            </button>
            <span className="hint">不连贯时可调整动作描述，重新生成。</span>
          </div>
        </Panel>
      ) : (
        <Panel
          title="时间轴 / 序列帧"
          className="timeline-panel"
          tools={
            <span className="tiny muted">
              {result
                ? `${result.fps} FPS　/　共 ${frames.length} 帧`
                : "先检查循环衔接"}
            </span>
          }
        >
          <div className="frame-strip">
            {frames.length
              ? frames.map((f, i) => (
                  <button
                    key={f.name}
                    className={"frame-slot " + (index === i ? "selected" : "")}
                    aria-label={`选择第 ${i + 1} 帧`}
                    onClick={() => {
                      setPlaying(false);
                      setIndex(i);
                    }}
                  >
                    <span className="frame-image checker">
                      <img loading="lazy" src={f.url} alt={`第 ${i + 1} 帧`} />
                    </span>
                    <span className="frame-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </button>
                ))
              : Array.from({ length: 8 }, (_, i) => (
                  <div className="frame-slot empty" key={i}>
                    <span className="frame-image">
                      <ImageIcon size={19} strokeWidth={1} />
                    </span>
                    <span className="frame-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                ))}
          </div>
          <div className="timeline-footer">
            <span>
              <span className="mini-dot" />
              {result
                ? "逐帧检查边缘与动作衔接"
                : "确认动作连贯后，序列帧将在这里展开"}
            </span>
            <span>
              {result ? "循环质量：待人工检查" : "让静态角色，拥有生命力。"}
            </span>
          </div>
        </Panel>
      )}
      {job?.status === "failed" ? (
        <div className="job-error" role="alert">
          <AlertCircle size={19} />
          <div>
            <strong>任务未完成</strong>
            <p>{job.error}</p>
            {job.providerId || job.videoReady ? (
              <button className="text-button" onClick={onResume}>
                <RotateCcw size={13} />
                继续处理此任务
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {result ? (
        <div className="result-note">
          <span>已保存到本地作品库</span>
          <span>
            实际视频 {result.actual.width} × {result.actual.height} ·{" "}
            {total.toFixed(2)} s <ChevronRight size={12} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

function LoopVideo({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  const start = () => {
    const media = video.current;
    if (media)
      void media
        .play()
        .then(() => setNeedsPlay(false))
        .catch(() => setNeedsPlay(true));
  };
  useEffect(() => {
    start();
  }, [src]);
  return (
    <>
      <video
        ref={video}
        src={src}
        aria-label="首尾衔接无限循环预览"
        controls
        loop
        autoPlay
        muted
        playsInline
        onLoadedData={() => {
          start();
        }}
      />
      {needsPlay ? (
        <button className="primary video-start" onClick={start}>
          <Play size={17} />
          开始无限循环播放
        </button>
      ) : null}
    </>
  );
}
