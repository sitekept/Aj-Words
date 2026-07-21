// Client-side image downscale + re-encode, so a card image stays small enough
// for IndexedDB (lib/image-store.ts) without shipping the original megapixels.
// DOM-only (canvas); not exercised by `node --test`.

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> =>
  new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });

const loadBitmap = async (
  file: Blob
): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    image.src = url;
  });
};

const dimensions = (source: ImageBitmap | HTMLImageElement) => ({
  width: "width" in source ? source.width : 0,
  height: "height" in source ? source.height : 0
});

/**
 * Downscale `file` so its longest side is at most `maxSide`px, re-encoding to
 * WebP (falling back to JPEG) at the given quality. Returns the original file
 * if anything about the canvas path is unavailable.
 */
export const compressImageFile = async (
  file: File,
  maxSide = 800,
  quality = 0.8
): Promise<Blob> => {
  if (typeof document === "undefined") {
    return file;
  }

  try {
    const source = await loadBitmap(file);
    const { width, height } = dimensions(source);
    if (!width || !height) {
      return file;
    }

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }

    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    if ("close" in source && typeof source.close === "function") {
      source.close();
    }

    const encoded =
      (await canvasToBlob(canvas, "image/webp", quality)) ??
      (await canvasToBlob(canvas, "image/jpeg", quality));

    // Keep whichever is smaller — re-encoding a tiny image can grow it.
    if (encoded && encoded.size < file.size) {
      return encoded;
    }
    return encoded ?? file;
  } catch {
    return file;
  }
};

/** A short unique id for a stored image blob. */
export const createImageId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `img-${crypto.randomUUID()}`;
  }
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};
