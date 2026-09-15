import { ChevronRight, Upload, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Asset } from "../lib/types";
export function Panel({
  title,
  children,
  tools,
  className = "",
}: {
  title: string;
  children: ReactNode;
  tools?: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-heading">
        <h2>
          <ChevronRight size={15} />
          {title}
        </h2>
        {tools}
      </div>
      {children}
    </section>
  );
}
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      className={"switch " + (checked ? "on" : "")}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function Range({
  label,
  value,
  min = 0,
  max,
  onChange,
  unit = "",
  disabled = false,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (n: number) => void;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <label className="range-field">
      <span className="field-label">
        {label}
        <b>
          {value}
          <i>{unit}</i>
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--range": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
      />
      <span className="range-ends">
        <span>{min}</span>
        <span>{max}</span>
      </span>
    </label>
  );
}
export function UploadBox({
  label,
  asset,
  onFile,
  onClear,
  disabled,
}: {
  label: string;
  asset: Asset | null;
  onFile: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="upload-block">
      <span className="field-label">{label}</span>
      <label
        className={"upload-zone " + (asset ? "has-image" : "")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled && e.dataTransfer.files[0])
            onFile(e.dataTransfer.files[0]);
        }}
      >
        {asset ? (
          <>
            <img src={asset.url} alt={asset.name} />
            <span className="upload-replace">
              <Upload size={12} /> 替换原画
            </span>
          </>
        ) : (
          <>
            <Plus size={25} strokeWidth={1.3} />
            <span>点击或拖入图片</span>
            <small>PNG / JPG / WEBP</small>
          </>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={label}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.[0]) onFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </label>
      {asset ? (
        <button
          className="remove-image"
          aria-label={`移除${label}`}
          onClick={onClear}
          disabled={disabled}
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}
