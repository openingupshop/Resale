"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";

export function CopyButton({
  text,
  label = "Copy",
  className = "",
  primary = false,
}: {
  text: string;
  label?: string;
  className?: string;
  primary?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function onClick() {
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!text}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium active:scale-95 disabled:opacity-40 ${
        primary
          ? "bg-accent text-accent-foreground"
          : `border bg-surface ${state === "copied" ? "border-accent text-accent" : "border-border"}`
      } ${className}`}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Failed" : label}
    </button>
  );
}
