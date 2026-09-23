"use client";

import { CopyButton } from "@/components/CopyButton";

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

export function Field({
  label,
  value,
  onChange,
  multiline,
  rows = 2,
  placeholder,
  meta,
  hideLabel,
  copyText,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  meta?: React.ReactNode;
  hideLabel?: boolean;
  copyText?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <div className={`mb-1 flex items-center justify-between gap-2 ${hideLabel ? "sr-only" : ""}`}>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {meta && <span className="text-xs text-muted">{meta}</span>}
      </div>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea
            id={id}
            rows={rows}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        ) : (
          <input
            id={id}
            value={value}
            inputMode={inputMode}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        )}
        <CopyButton text={copyText ?? value} className="mt-1" />
      </div>
    </div>
  );
}

/** Read-only value with a copy button, for fields derived from the item record. */
export function CopyRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">
          {label}
          {note && <span> · {note}</span>}
        </p>
        <p className={`break-words text-sm ${value ? "" : "text-muted"}`}>{value || "—"}</p>
      </div>
      <CopyButton text={value} />
    </div>
  );
}
