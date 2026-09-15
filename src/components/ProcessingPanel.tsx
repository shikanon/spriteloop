import { Download, Info, SlidersHorizontal, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Panel, Range, Switch } from "./Controls";
import { defaultProcessing, type Processing, type Job } from "../lib/types";
export function ProcessingPanel({
  value,
  onChange,
  job,
  busy,
  onProcess,
  onImport,
}: {
  value: Processing;
  onChange: (p: Processing) => void;
  job: Job | null;
  busy: boolean;
  onProcess: () => void;
  onImport: (f: File) => void;
}) {
  const [colorText, setColorText] = useState(value.backgroundColor);
  useEffect(() => setColorText(value.backgroundColor), [value.backgroundColor]);
  const set = <K extends keyof Processing>(k: K, v: Processing[K]) =>
    onChange({ ...value, [k]: v });
  const dirty =
    !!job?.result &&
    JSON.stringify(value) !==
      JSON.stringify({ ...defaultProcessing, ...job.result.processing });
  return (
    <aside className="right-column">
      <Panel
        title="帧处理"
        tools={<SlidersHorizontal size={14} className="muted" />}
      >
        <div className="panel-body">
          <span className="field-label">提取方式</span>
          <div className="segmented full">
            <button
              className={value.mode === "uniform" ? "active" : ""}
              onClick={() => set("mode", "uniform")}
            >
              等间隔
            </button>
            <button
              className={value.mode === "keyframes" ? "active" : ""}
              onClick={() => set("mode", "keyframes")}
            >
              关键帧
            </button>
          </div>
          <p className="hint mode-hint">
            {value.mode === "uniform"
              ? "按固定帧率采样，适合流畅动作。"
              : "根据画面变化去重，保留原始时间间隔。"}
          </p>
          <Range
            label="采样帧率"
            value={value.fps}
            min={1}
            max={24}
            unit="FPS"
            onChange={(n) => set("fps", n)}
          />
          <div className="divider" />
          <div className="switch-row">
            <div>
              移除纯色背景<p className="hint">将所选背景色转换为透明通道</p>
            </div>
            <Switch
              label="移除纯色背景"
              checked={value.removeWhite}
              onChange={(v) => set("removeWhite", v)}
            />
          </div>
          <div className="background-color-field">
            <span className="field-label">背景颜色</span>
            <div
              className="background-presets"
              role="group"
              aria-label="背景颜色预设"
            >
              {[
                { color: "#ffffff", label: "白色" },
                { color: "#00ff00", label: "绿幕绿" },
              ].map(({ color, label }) => (
                <button
                  key={color}
                  className={value.backgroundColor === color ? "active" : ""}
                  aria-pressed={value.backgroundColor === color}
                  onClick={() => set("backgroundColor", color)}
                >
                  <span
                    className="color-swatch"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </button>
              ))}
              <label className="custom-color" title="自定义背景颜色">
                <input
                  type="color"
                  aria-label="自定义背景颜色"
                  value={value.backgroundColor}
                  onChange={(e) => set("backgroundColor", e.target.value)}
                />
                自定义
              </label>
            </div>
            <p className="hint color-value">
              <input
                className="color-hex"
                aria-label="背景色 HEX"
                value={colorText}
                maxLength={7}
                spellCheck={false}
                onChange={(e) => {
                  const text = e.target.value;
                  setColorText(text);
                  if (/^#[0-9a-f]{6}$/i.test(text))
                    set("backgroundColor", text.toLowerCase());
                }}
                onBlur={() => setColorText(value.backgroundColor)}
              />{" "}
              · 用于新视频生成与背景移除
            </p>
            <p className="hint">已有视频请选择其实际背景色。</p>
          </div>
          <Range
            label="颜色容差"
            value={value.tolerance}
            max={100}
            disabled={!value.removeWhite}
            onChange={(n) => set("tolerance", n)}
          />
          <Range
            label="边缘柔化"
            value={value.softness}
            max={20}
            disabled={!value.removeWhite}
            onChange={(n) => set("softness", n)}
          />
          <label className="simple-check">
            <input
              type="checkbox"
              checked={value.preserveWhite}
              disabled={!value.removeWhite}
              onChange={(e) => set("preserveWhite", e.target.checked)}
            />
            保留角色内部同色细节
          </label>
          <p className="info-note">
            <Info size={14} />
            从画面边缘移除背景，减少误删角色。
          </p>
          {job?.videoReady ? (
            <button
              className="secondary full-button"
              disabled={busy || !job.continuityReview?.accepted}
              onClick={onProcess}
            >
              {busy
                ? "正在处理…"
                : !job.continuityReview?.accepted
                  ? "先完成循环衔接检查"
                  : dirty
                    ? "应用设置，重新处理"
                    : "重新提取序列帧"}
            </button>
          ) : null}
        </div>
      </Panel>
      <Panel title="导出设置">
        <div className="panel-body">
          <label className="select-field">
            导出尺寸
            <select
              aria-label="导出尺寸"
              value={value.size}
              onChange={(e) => set("size", Number(e.target.value))}
            >
              <option value={256}>256 px · 最长边</option>
              <option value={512}>512 px · 最长边</option>
              <option value={768}>768 px · 最长边</option>
              <option value={0}>原始尺寸</option>
            </select>
          </label>
          <Export job={job} busy={busy} dirty={dirty} />
          <label className={"import-video " + (busy ? "disabled" : "")}>
            <Video size={14} />
            或导入已有纯色背景视频
            <input
              type="file"
              aria-label="导入已有纯色背景视频"
              accept="video/mp4,video/quicktime,video/webm"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.[0]) onImport(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </Panel>
    </aside>
  );
}
function Export({
  job,
  busy,
  dirty,
}: {
  job: Job | null;
  busy: boolean;
  dirty: boolean;
}) {
  const [format, setFormat] = useState("all");
  return (
    <>
      <label className="select-field export-select">
        导出格式
        <select
          aria-label="导出格式"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="all">完整素材包</option>
          <option value="frames">PNG 序列帧</option>
          <option value="sheet">Sprite Sheet + JSON</option>
        </select>
      </label>
      <p className="hint">包含透明素材、动画预览与帧元数据</p>
      {job?.status === "succeeded" && !busy && !dirty ? (
        <a
          className="export-button"
          href={`/api/jobs/${job.id}/export?format=${format}`}
          download
        >
          <Download size={17} />
          导出素材
        </a>
      ) : (
        <button className="export-button" disabled>
          <Download size={17} />
          {dirty ? "先应用处理设置" : "导出素材"}
        </button>
      )}
    </>
  );
}
