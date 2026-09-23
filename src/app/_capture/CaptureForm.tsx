"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MAX_PHOTOS, MIN_PHOTOS } from "@/lib/config";
import {
  compressPhoto,
  formatBytes,
  makeThumbnail,
  type CompressedPhoto,
} from "@/lib/image";

export function CaptureForm({ remaining, limit }: { remaining: number; limit: number }) {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<CompressedPhoto[]>([]);
  const [processing, setProcessing] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const slotsLeft = MAX_PHOTOS - photos.length - processing;
  const outOfGenerations = remaining <= 0;

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const files = Array.from(list).slice(0, Math.max(0, slotsLeft));
    if (files.length < list.length) {
      setError(`Only ${MAX_PHOTOS} photos per item. Extra photos were skipped.`);
    }
    setProcessing((n) => n + files.length);
    for (const file of files) {
      try {
        const photo = await compressPhoto(file);
        setPhotos((prev) => [...prev, photo].slice(0, MAX_PHOTOS));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  }

  function remove(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  function makeCover(id: string) {
    setPhotos((prev) => {
      const pick = prev.find((p) => p.id === id);
      return pick ? [pick, ...prev.filter((p) => p.id !== id)] : prev;
    });
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const thumbnail = await makeThumbnail(photos[0].dataUrl);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos: photos.map((p) => p.base64),
          thumbnail,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      router.push(`/listings/${body.id}`);
    } catch (e) {
      setError((e as Error).message);
      setGenerating(false);
    }
  }

  const totalBytes = photos.reduce((sum, p) => sum + p.bytes, 0);
  const originalBytes = photos.reduce((sum, p) => sum + p.originalBytes, 0);
  const canGenerate =
    photos.length >= MIN_PHOTOS && processing === 0 && !generating && !outOfGenerations;

  return (
    <div className="mt-5">
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraInput.current?.click()}
          disabled={slotsLeft <= 0 || generating}
          className="flex h-24 flex-col items-center justify-center gap-1 rounded-2xl bg-accent text-accent-foreground disabled:opacity-40"
        >
          <CameraIcon />
          <span className="text-sm font-semibold">Take photo</span>
        </button>
        <button
          type="button"
          onClick={() => libraryInput.current?.click()}
          disabled={slotsLeft <= 0 || generating}
          className="flex h-24 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-surface disabled:opacity-40"
        >
          <PhotosIcon />
          <span className="text-sm font-semibold">Upload</span>
        </button>
      </div>

      <div className="mt-4 flex items-baseline justify-between text-sm">
        <span className="font-medium">
          {photos.length}/{MAX_PHOTOS} photos
          {processing > 0 && <span className="text-muted"> · compressing {processing}…</span>}
        </span>
        {photos.length > 0 && (
          <span className="text-xs text-muted">
            {formatBytes(originalBytes)} → {formatBytes(totalBytes)}
          </span>
        )}
      </div>

      {photos.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.dataUrl}
                alt={`Photo ${i + 1}`}
                className="h-full w-full object-cover"
                onClick={() => makeCover(p.id)}
              />
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Cover
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => remove(p.id)}
                disabled={generating}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          No photos yet. Good light and a plain background help.
        </div>
      )}
      {photos.length > 1 && (
        <p className="mt-2 text-xs text-muted">Tap a photo to make it the cover.</p>
      )}

      <label className="mt-5 block">
        <span className="text-sm font-medium">Notes (optional)</span>
        <span className="block text-xs text-muted">
          Things the photos can&apos;t show: worn twice, smoke-free home, original box included.
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          rows={2}
          disabled={generating}
          className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent"
        />
      </label>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="w-full rounded-xl bg-foreground px-4 py-3.5 text-base font-semibold text-background disabled:opacity-40"
          >
            {generating ? "Writing your listing…" : "Generate listing"}
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            {outOfGenerations
              ? `You've used all ${limit} listings for today. Resets at midnight UTC.`
              : `${remaining} of ${limit} listings left today`}
          </p>
        </div>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

function PhotosIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  );
}
