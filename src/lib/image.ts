import {
  IMAGE_JPEG_QUALITY,
  IMAGE_MAX_DIMENSION,
  THUMBNAIL_MAX_DIMENSION,
} from "@/lib/config";

export type CompressedPhoto = {
  id: string;
  /** Base64 JPEG without the data: prefix, ready for the API. */
  base64: string;
  /** data: URL for previews. */
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  originalBytes: number;
};

async function decode(file: Blob): Promise<ImageBitmap> {
  // Respect EXIF orientation so phone portrait shots aren't sideways.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function drawScaled(bitmap: ImageBitmap, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function toDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/** Resize to IMAGE_MAX_DIMENSION on the long edge and re-encode as JPEG. */
export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new Error(
      `Couldn't read ${file.name || "that photo"}. Try a JPEG or PNG, or take the photo in the app.`,
    );
  }
  const canvas = drawScaled(bitmap, IMAGE_MAX_DIMENSION);
  bitmap.close();
  const dataUrl = toDataUrl(canvas, IMAGE_JPEG_QUALITY);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return {
    id: crypto.randomUUID(),
    base64,
    dataUrl,
    bytes: Math.floor((base64.length * 3) / 4),
    width: canvas.width,
    height: canvas.height,
    originalBytes: file.size,
  };
}

/** Small JPEG data URL for the history list. */
export async function makeThumbnail(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await decode(blob);
  const canvas = drawScaled(bitmap, THUMBNAIL_MAX_DIMENSION);
  bitmap.close();
  return toDataUrl(canvas, 0.7);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
