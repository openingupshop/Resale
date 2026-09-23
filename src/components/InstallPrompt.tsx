"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "install-prompt-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Offers "Add to home screen". Android Chrome fires beforeinstallprompt, so we
 * can show a real Install button; iPhone Safari has no such event, so we show
 * the Share → Add to Home Screen steps instead.
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || readDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const ua = navigator.userAgent;
    const iOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
    // Timer so the state update happens outside the effect body.
    const t = iOS ? setTimeout(() => setMode("ios"), 0) : undefined;

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(t);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode: it just shows again next visit.
    }
    setMode("hidden");
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setMode("hidden");
  }

  if (mode === "hidden") return null;
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Put Resale on your home screen</p>
        {mode === "android" ? (
          <p className="text-muted">Opens full screen, like an app.</p>
        ) : (
          <p className="text-muted">
            In Safari, tap the Share button, then <strong>Add to Home Screen</strong>.
          </p>
        )}
        <div className="mt-2 flex gap-3">
          {mode === "android" && (
            <button type="button" onClick={install} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-foreground">
              Install
            </button>
          )}
          <button type="button" onClick={dismiss} className="py-1.5 text-muted">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
