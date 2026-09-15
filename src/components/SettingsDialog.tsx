import { useEffect, useState } from "react";
import { Settings, X, RotateCcw, Save } from "lucide-react";
import { api, json } from "../lib/api";

type StudioSettings = {
  promptTemplate: string;
  defaultPromptTemplate: string;
  keyConfigured: boolean;
  keySource: "settings" | "environment" | "none";
};
export function SettingsDialog({
  onClose,
  onSaved,
  action,
  backgroundColor,
}: {
  onClose: () => void;
  onSaved: (keyConfigured: boolean) => void;
  action: string;
  backgroundColor: string;
}) {
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [template, setTemplate] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [preview, setPreview] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<StudioSettings>("/api/settings")
      .then((s) => {
        if (!cancelled) {
          setSettings(s);
          setTemplate(s.promptTemplate);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    setPreview("");
    setPreviewError("");
    const timer = setTimeout(() => {
      api<{ prompt: string }>(
        "/api/settings/preview",
        json({ promptTemplate: template, action, backgroundColor }),
      )
        .then((r) => {
          if (!cancelled) setPreview(r.prompt);
        })
        .catch((e) => {
          if (!cancelled) setPreviewError(e.message);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [settings, template, action, backgroundColor]);
  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const next = await api<StudioSettings>(
        "/api/settings",
        json({
          promptTemplate: template,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      );
      setSettings(next);
      setTemplate(next.promptTemplate);
      setApiKey("");
      setSaved(true);
      onSaved(next.keyConfigured);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        className="dialog settings-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-heading">
          <h2>
            <Settings size={20} /> 工作台设置
          </h2>
          <button
            className="icon-button"
            aria-label="关闭设置"
            onClick={onClose}
            autoFocus
          >
            <X size={20} />
          </button>
        </div>
        <div className="settings-body">
          {error && (
            <p role="alert" className="settings-error">
              {error}
            </p>
          )}
          {!settings ? (
            <p className="hint">
              {error ? "关闭后重新打开设置以重试。" : "正在读取本机设置…"}
            </p>
          ) : (
            <>
              <div className="settings-section">
                <div className="settings-section-heading">
                  <h3>火山方舟 API Key</h3>
                  <span
                    className={
                      settings.keyConfigured
                        ? "key-status configured"
                        : "key-status"
                    }
                  >
                    {settings.keyConfigured ? "已配置" : "未配置"}
                  </span>
                </div>
                <p className="hint">
                  所有 Seedance 模型共用此密钥。
                  {settings.keySource === "environment"
                    ? "当前使用服务端环境配置。"
                    : settings.keySource === "settings"
                      ? "当前使用本机设置。"
                      : "填写后即可生成动画。"}
                </p>
                <label className="settings-label">
                  {settings.keyConfigured ? "更换 API Key" : "API Key"}
                  <input
                    type="password"
                    aria-label="火山方舟 API Key"
                    autoComplete="new-password"
                    spellCheck={false}
                    value={apiKey}
                    placeholder={
                      settings.keyConfigured
                        ? "已配置，留空保留当前密钥"
                        : "粘贴火山方舟 API Key"
                    }
                    disabled={saving}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setSaved(false);
                    }}
                  />
                </label>
                <p className="hint">
                  密钥仅保存在本机服务端，不会回显到页面。保存后生效。
                </p>
              </div>
              <div className="settings-section">
                <div className="settings-section-heading">
                  <h3>提示词模板</h3>
                  <button
                    className="text-button"
                    disabled={saving}
                    onClick={() => {
                      setTemplate(settings.defaultPromptTemplate);
                      setSaved(false);
                    }}
                  >
                    <RotateCcw size={13} /> 恢复默认模板
                  </button>
                </div>
                <p className="hint">
                  动作描述会填入模板，再提交给模型。背景、镜头、角色保持和循环要求均在下方编辑。
                </p>
                <label className="settings-label">
                  生成提示词模板
                  <textarea
                    aria-label="生成提示词模板"
                    value={template}
                    maxLength={4000}
                    disabled={saving}
                    onChange={(e) => {
                      setTemplate(e.target.value);
                      setSaved(false);
                    }}
                  />
                </label>
                <p className="template-tokens">
                  <code>{"{{action}}"}</code> 动作描述 ·{" "}
                  <code>{"{{background}}"}</code> 背景名称 ·{" "}
                  <code>{"{{background_rgb}}"}</code> 背景 RGB
                </p>
                <p className="hint">
                  请保留动作描述和背景 RGB
                  变量。保存后用于新任务，已有任务保留创建时的模板。
                </p>
                <label className="settings-label">
                  完整提示词预览{" "}
                  <span className="hint">使用当前动作描述和背景颜色</span>
                  <textarea
                    className="prompt-preview"
                    aria-label="完整提示词预览"
                    value={preview}
                    readOnly
                    placeholder={previewError || "正在生成预览…"}
                  />
                </label>
                {previewError && (
                  <p role="alert" className="settings-error">
                    {previewError}
                  </p>
                )}
                <p className="hint">
                  首尾使用同一张原画；时长、分辨率、关闭音频和水印等由模型参数控制。
                </p>
              </div>
              <div className="settings-actions">
                <span role="status">
                  {saved ? "设置已保存" : "设置保存在本机"}
                </span>
                <button
                  className="secondary"
                  disabled={saving || !template.trim()}
                  onClick={() => void save()}
                >
                  <Save size={15} />
                  {saving ? "正在保存…" : "保存设置"}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
