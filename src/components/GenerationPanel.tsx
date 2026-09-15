import { ArrowRight, Infinity as LoopIcon, Sparkles, Info } from "lucide-react";
import { Panel, UploadBox } from "./Controls";
import { presets, type Asset, type Model } from "../lib/types";
type Props = {
  first: Asset | null;
  setFirst: (a: Asset | null) => void;
  upload: (f: File) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  models: Model[];
  model: string;
  setModel: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  resolution: string;
  setResolution: (v: string) => void;
  busy: boolean;
  uploading: boolean;
  onGenerate: () => void;
  onSample: () => void;
  onLibrary: () => void;
  keyConfigured: boolean;
};
export function GenerationPanel(p: Props) {
  const current = p.models.find((m) => m.id === p.model);
  return (
    <Panel
      title="动画设定"
      className="generation-panel"
      tools={<span className="tiny muted">01</span>}
    >
      <div className="panel-body">
        <div className="upload-single">
          <UploadBox
            label="首帧（必填）"
            asset={p.first}
            onFile={p.upload}
            onClear={() => p.setFirst(null)}
            disabled={p.uploading}
          />
        </div>
        <div className="upload-meta">
          {p.first ? (
            <span>
              {p.first.width} × {p.first.height} ·{" "}
              {p.first.hasAlpha ? "含透明通道" : "不透明图片"}
            </span>
          ) : (
            <span>每张 ≤ 20 MB · 最短边 300 px</span>
          )}
          <button
            className="text-button"
            onClick={p.onSample}
            disabled={p.uploading}
          >
            使用示例
          </button>
        </div>
        <button
          className="secondary full-button asset-picker-button"
          onClick={p.onLibrary}
        >
          从素材库选择原画
        </button>
        <div className="loop-check fixed-loop">
          <LoopIcon size={16} />
          <span>首尾同帧 · 无限循环</span>
        </div>
        <p className="hint loop-hint">尾帧自动使用首帧，无需重复上传。</p>
        <label className="prompt-field">
          <span className="field-label">
            动作描述<span className="muted tiny">{p.prompt.length}/500</span>
          </span>
          <textarea
            maxLength={500}
            value={p.prompt}
            onChange={(e) => p.setPrompt(e.target.value)}
            placeholder="描述角色如何动起来…"
          />
        </label>
        <div className="preset-row">
          {presets.map((preset) => (
            <button
              key={preset.name}
              className={p.prompt === preset.prompt ? "selected" : ""}
              onClick={() => p.setPrompt(preset.prompt)}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <label className="select-field">
          生成模型
          <select
            aria-label="生成模型"
            value={p.model}
            onChange={(e) => p.setModel(e.target.value)}
          >
            {p.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-pair">
          <label className="select-field">
            动画时长
            <select
              aria-label="动画时长"
              value={p.duration}
              onChange={(e) => p.setDuration(Number(e.target.value))}
            >
              {[...new Set([4, 5, 6, 8, 10, 12, 15, 20, 30, p.duration])]
                .sort((a, b) => a - b)
                .filter((d) => d <= (current?.maxDuration || 12))
                .map((d) => (
                  <option key={d} value={d}>
                    {d} 秒
                  </option>
                ))}
            </select>
          </label>
          <label className="select-field">
            视频分辨率
            <select
              aria-label="视频分辨率"
              value={p.resolution}
              onChange={(e) => p.setResolution(e.target.value)}
            >
              {(current?.resolutions || ["720p"]).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="generation-note">
          <Info size={14} />
          <span>固定镜头 · 纯色背景 · 保持角色一致</span>
        </div>
        <button
          className="primary generate-button"
          onClick={p.onGenerate}
          disabled={
            p.busy ||
            p.uploading ||
            !p.first ||
            !p.prompt.trim() ||
            !p.keyConfigured
          }
        >
          <Sparkles size={18} />
          {p.busy ? "任务处理中" : "生成动画"}
          <ArrowRight size={17} />
        </button>
        <p className="hint centered">
          {p.keyConfigured
            ? "调用方舟模型，按实际生成用量计费"
            : "请在设置中配置火山方舟 API Key"}
        </p>
      </div>
    </Panel>
  );
}
