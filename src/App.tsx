import { useEffect, useState, useCallback } from "react";
import {
  Settings,
  ChevronRight,
  ArrowUpRight,
  Check,
  AlertCircle,
  X,
} from "lucide-react";
import { GenerationPanel } from "./components/GenerationPanel";
import { ProcessingPanel } from "./components/ProcessingPanel";
import { Preview } from "./components/Preview";
import { CollectionsDialog } from "./components/CollectionsDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { Dialog } from "./components/Dialogs";
import { api, json } from "./lib/api";
import {
  defaultProcessing,
  presets,
  type Asset,
  type Model,
  type Job,
  type Processing,
} from "./lib/types";
export default function App() {
  const [first, setFirst] = useState<Asset | null>(null),
    [models, setModels] = useState<Model[]>([]),
    [model, setModel] = useState("doubao-seedance-1-5-pro-251215"),
    [keyConfigured, setKeyConfigured] = useState(false),
    [connected, setConnected] = useState(false),
    [duration, setDuration] = useState(5),
    [resolution, setResolution] = useState("720p"),
    [prompt, setPrompt] = useState(presets[0].prompt),
    [processing, setProcessing] = useState<Processing>(defaultProcessing),
    [job, setJob] = useState<Job | null>(null),
    [jobs, setJobs] = useState<Job[]>([]),
    [assets, setAssets] = useState<Asset[]>([]),
    [collectionLoading, setCollectionLoading] = useState(false),
    [collectionError, setCollectionError] = useState(""),
    [restoredTemplate, setRestoredTemplate] = useState<string | null>(null),
    [restoredNotice, setRestoredNotice] = useState(""),
    [view, setView] = useState("studio"),
    [uploading, setUploading] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState("");
  const busy =
    submitting ||
    (!!job && !["succeeded", "failed", "awaiting_review"].includes(job.status));
  const refreshJobs = useCallback(async () => {
    setJobs(await api<Job[]>("/api/jobs"));
  }, []);
  const refreshCollections = useCallback(async () => {
    setCollectionLoading(true);
    setCollectionError("");
    try {
      const [savedJobs, savedAssets] = await Promise.all([
        api<Job[]>("/api/jobs"),
        api<Asset[]>("/api/assets"),
      ]);
      setJobs(savedJobs);
      setAssets(savedAssets);
    } catch (e) {
      setCollectionError((e as Error).message);
    } finally {
      setCollectionLoading(false);
    }
  }, []);
  useEffect(() => {
    if (view !== "history" && view !== "library") return;
    void refreshCollections();
  }, [view, refreshCollections]);
  useEffect(() => {
    let cancelled = false;
    api<{ models: Model[]; keyConfigured: boolean }>("/api/config")
      .then((c) => {
        if (cancelled) return;
        setModels(c.models);
        setKeyConfigured(c.keyConfigured);
        setConnected(true);
      })
      .catch((e) => setError(e.message));
    refreshJobs().catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [refreshJobs]);
  useEffect(() => {
    if (!job || ["succeeded", "failed", "awaiting_review"].includes(job.status))
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<Job>(`/api/jobs/${job.id}`);
        if (!cancelled) {
          setJob(next);
          if (["succeeded", "failed", "awaiting_review"].includes(next.status))
            await refreshJobs();
          else timer = setTimeout(poll, 2000);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          timer = setTimeout(poll, 5000);
        }
      }
    };
    timer = setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job?.id, job?.status, refreshJobs]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView("studio");
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const guarded = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const upload = async (file: File) => {
    setUploading(true);
    await guarded(async () => {
      if (file.size > 20 * 1024 * 1024) throw new Error("图片不能超过 20 MB。");
      const data = new FormData();
      data.append("file", file);
      const asset = await api<Asset>("/api/assets", {
        method: "POST",
        body: data,
      });
      setFirst(asset);
    });
    setUploading(false);
  };
  const sample = () =>
    guarded(async () => {
      const response = await fetch("/assets/ranger.png");
      await upload(
        new File([await response.blob()], "forest-ranger.png", {
          type: "image/png",
        }),
      );
    });
  const generate = async () => {
    if (!first) return;
    setSubmitting(true);
    await guarded(async () => {
      const created = await api<Job>(
        "/api/jobs",
        json({
          model,
          prompt,
          duration,
          resolution,
          firstAssetId: first.id,
          ...(restoredTemplate !== null
            ? { promptTemplate: restoredTemplate }
            : {}),
          processing,
        }),
      );
      setJob(created);
      await refreshJobs();
    });
    setSubmitting(false);
  };
  const process = (confirmContinuity = false) =>
    guarded(async () => {
      if (!job || busy) return;
      setSubmitting(true);
      try {
        setJob(
          await api<Job>(
            `/api/jobs/${job.id}/process`,
            json({ processing, confirmContinuity }),
          ),
        );
      } finally {
        setSubmitting(false);
      }
    });
  const resume = () =>
    guarded(async () => {
      if (job) setJob(await api<Job>(`/api/jobs/${job.id}/resume`, json({})));
    });
  const importVideo = async (file: File) => {
    setSubmitting(true);
    await guarded(async () => {
      const data = new FormData();
      data.append("file", file);
      data.append("processing", JSON.stringify(processing));
      setJob(
        await api<Job>("/api/import-video", { method: "POST", body: data }),
      );
      await refreshJobs();
    });
    setSubmitting(false);
  };
  const selectModel = (id: string) => {
    setModel(id);
    const item = models.find((m) => m.id === id);
    if (item) {
      if (!item.resolutions.includes(resolution)) setResolution("720p");
      if (duration > item.maxDuration) setDuration(item.maxDuration);
    }
  };
  const selectJob = (selected: Job, restoreGeneration = false) => {
    void guarded(async () => {
      const fresh = await api<Job>(`/api/jobs/${selected.id}`);
      const savedFirst = fresh.firstAssetId
        ? await api<Asset>(`/api/assets/${fresh.firstAssetId}`)
        : null;
      let template = fresh.promptTemplate;
      if (fresh.source === "ark" && !template) {
        template = (
          await api<{ defaultPromptTemplate: string }>("/api/settings")
        ).defaultPromptTemplate;
      }
      setFirst(savedFirst);
      setJob(fresh);
      setProcessing({
        ...defaultProcessing,
        ...(restoreGeneration
          ? fresh.generationProcessing || fresh.processing
          : fresh.processing),
      });
      setPrompt(fresh.prompt || presets[0].prompt);
      setModel(fresh.model || "doubao-seedance-1-5-pro-251215");
      setDuration(fresh.duration || 5);
      setResolution(fresh.resolution || "720p");
      setRestoredTemplate(template || null);
      setRestoredNotice(
        fresh.source === "ark"
          ? `已恢复 ${fresh.id.slice(0, 8)} 的生成参数${template ? "及提示词模板" : ""}`
          : `已打开 ${fresh.name || "历史视频"}，恢复处理参数`,
      );
      setView("studio");
    });
  };
  const useAsset = (asset: Asset) => {
    setFirst(asset);
    setJob(null);
    setError("");
    setRestoredNotice(`已从素材库选择 ${asset.name}`);
    setView("studio");
  };
  return (
    <>
      <header className="app-header">
        <a className="brand" href="/" aria-label="SpriteLoop 首页">
          <span className="pixel-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            SpriteLoop<small>让游戏角色动起来</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <button
            className={view === "studio" ? "active" : ""}
            onClick={() => setView("studio")}
          >
            动画工作台
          </button>
          <button
            className={view === "history" ? "active" : ""}
            onClick={() => setView("history")}
          >
            历史记录
            {jobs.length > 0 && (
              <span className="nav-count">{jobs.length}</span>
            )}
          </button>
          <button
            className={view === "library" ? "active" : ""}
            onClick={() => setView("library")}
          >
            素材库
          </button>
          <button
            className={view === "guide" ? "active" : ""}
            onClick={() => setView("guide")}
          >
            使用指南
            <ArrowUpRight size={12} />
          </button>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <Settings size={14} />
            设置
          </button>
        </nav>
        <div className="connection">
          <span className={"status-dot " + (connected ? "live" : "")} />
          {connected ? "本地服务运行中" : "正在连接服务"}
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <h1>
              制作你的下一帧<span>。</span>
            </h1>
            <p>从游戏原画，到可直接使用的透明序列帧。</p>
          </div>
          <div className="workflow">
            {[
              { title: "导入原画", desc: "上传角色原画或关键帧" },
              { title: "生成动画", desc: "首尾使用同一张原画" },
              { title: "循环检查", desc: "检查尾帧到首帧的衔接" },
              { title: "提取与导出", desc: "获得可直接使用的素材" },
            ].map((s, i) => (
              <div
                key={s.title}
                className={
                  "workflow-step " +
                  ((i === 0 && !job) ||
                  (i === 1 && busy) ||
                  (i === 2 &&
                    job?.videoReady &&
                    !job.continuityReview?.accepted) ||
                  (i === 3 && job?.status === "succeeded")
                    ? "active"
                    : "")
                }
              >
                <span className="step-number">
                  {i === 0 && first ? (
                    <Check size={18} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <div>
                  <b>{s.title}</b>
                  <p>{s.desc}</p>
                </div>
                {i < 3 ? (
                  <ChevronRight className="step-arrow" size={18} />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        {error ? (
          <div role="alert" className="toast-error">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="关闭错误提示"
              onClick={() => setError("")}
            >
              <X size={15} />
            </button>
          </div>
        ) : null}
        {restoredNotice && (
          <div className="restored-notice" role="status">
            <Check size={16} />
            <span>{restoredNotice}。点击「生成动画」才会创建新任务。</span>
            {restoredTemplate && (
              <details>
                <summary>历史提示词模板</summary>
                <pre>{restoredTemplate}</pre>
                <button
                  className="text-button"
                  onClick={() => {
                    setRestoredTemplate(null);
                    setRestoredNotice("已切换为设置中的最新提示词模板");
                  }}
                >
                  改用设置中的模板
                </button>
              </details>
            )}
            <button
              className="icon-button"
              aria-label="关闭恢复提示"
              onClick={() => setRestoredNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="workspace">
          <GenerationPanel
            {...{
              first,
              setFirst,
              upload,
              prompt,
              setPrompt,
              models,
              model,
              duration,
              setDuration,
              resolution,
              setResolution,
              busy,
              uploading,
              keyConfigured,
            }}
            setModel={selectModel}
            onGenerate={generate}
            onSample={sample}
            onLibrary={() => setView("library")}
          />
          <Preview
            asset={first}
            job={job}
            onResume={resume}
            onConfirm={() => void process(true)}
            submitting={submitting}
          />
          <ProcessingPanel
            value={processing}
            onChange={setProcessing}
            job={job}
            busy={busy}
            onProcess={() => void process()}
            onImport={importVideo}
          />
        </div>
      </main>
      <footer className="app-footer">
        <span>
          SpriteLoop <span className="version">v0.1.0</span>
          <i />
          专注于 2D 游戏动画创作
        </span>
        <span>
          <span className="mini-dot" />
          素材保存在本机
          <i />
          Powered by Seedance
        </span>
      </footer>
      {view === "history" || view === "library" ? (
        <CollectionsDialog
          key={view}
          view={view}
          jobs={jobs}
          assets={assets}
          models={models}
          loading={collectionLoading}
          error={collectionError || error}
          onClose={() => setView("studio")}
          onRestore={(j) => selectJob(j, true)}
          onOpen={(j) => selectJob(j)}
          onUseAsset={useAsset}
          onRefresh={refreshCollections}
        />
      ) : view === "settings" ? (
        <SettingsDialog
          onClose={() => setView("studio")}
          onSaved={setKeyConfigured}
          action={prompt}
          backgroundColor={processing.backgroundColor}
        />
      ) : view !== "studio" ? (
        <Dialog
          view={view}
          onClose={() => setView("studio")}
          jobs={jobs}
          onSelect={selectJob}
        />
      ) : null}
    </>
  );
}
