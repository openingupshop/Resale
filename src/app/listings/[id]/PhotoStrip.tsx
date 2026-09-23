"use client";

import { useState } from "react";
import { savePhotos } from "@/lib/photo-share";

export function PhotoStrip({ urls }: { urls: string[] }) {
  const [busy, setBusy] = useState<null | "all" | "square">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "all" | "square") {
    setBusy(kind);
    setError(null);
    try {
      await savePhotos(urls, { squareCover: kind === "square" });
    } catch {
      setError("Couldn't prepare the photos. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!urls.length) return null;
  return (
    <section>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {urls.map((u, i) => (
          <li key={u} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
          </li>
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => run("all")}
          disabled={busy !== null}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy === "all" ? "Preparing…" : "Save photos"}
        </button>
        <button
          type="button"
          onClick={() => run("square")}
          disabled={busy !== null}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy === "square" ? "Preparing…" : "Save with square cover"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
