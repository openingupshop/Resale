async function toFile(url: string, name: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  return new File([blob], name, { type: "image/jpeg" });
}

/** Center-crop to a square, for sites whose cover photo is shown square. */
async function squareFile(url: string, name: string): Promise<File> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  canvas.getContext("2d")!.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    side,
    side,
  );
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.9),
  );
  return new File([blob], name, { type: "image/jpeg" });
}

/**
 * Hands the photos to the phone's share sheet ("Save Images" puts them in the
 * camera roll). Falls back to plain downloads where file sharing isn't supported.
 */
export async function savePhotos(urls: string[], opts: { squareCover?: boolean } = {}) {
  const files = await Promise.all(
    urls.map((u, i) =>
      i === 0 && opts.squareCover ? squareFile(u, "photo-1-square.jpg") : toFile(u, `photo-${i + 1}.jpg`),
    ),
  );
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  for (const file of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
