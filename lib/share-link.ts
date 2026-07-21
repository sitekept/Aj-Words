// List sharing via URL fragment — 100% client-side, no backend.
//
// A list's export payload is JSON-serialized, compressed with the native
// CompressionStream ("deflate-raw") when available, base64url-encoded, and
// carried in the URL FRAGMENT (never the query string, so it is never sent to
// any server). The app puts it after "#share="; the receiving tab decodes it
// and offers an import.
//
// This module is payload-agnostic on purpose (encode/decode any JSON value) so
// it stays pure and testable under `node --test` without pulling in the storage
// layer's "@/..." imports. The app composes it with createExportPayload /
// parseExportPayload from lib/vocabulary-storage.ts. CompressionStream exists in
// Node >=18, so the round-trip is exercised by the unit tests too.

export const SHARE_HASH_KEY = "share";

// Format prefixes distinguish a compressed payload from the raw fallback used
// when CompressionStream is unavailable (very old Safari).
const FORMAT_COMPRESSED = "v1";
const FORMAT_RAW = "v1r";

// A URL beyond ~30 KB is refused; beyond ~8 KB the caller is warned it may not
// survive every client/target.
export const MAX_SHARE_BYTES = 30 * 1024;
export const WARN_SHARE_BYTES = 8 * 1024;

export interface EncodedShare {
  /** The fragment value (without the "#share=" prefix). */
  token: string;
  /** Length of the token in bytes (a proxy for final URL length). */
  bytes: number;
  /** Over the hard limit — the caller should refuse to share. */
  tooLarge: boolean;
  /** Over the soft limit — the caller should warn but may proceed. */
  warn: boolean;
}

const hasCompression = (): boolean =>
  typeof CompressionStream !== "undefined" &&
  typeof DecompressionStream !== "undefined";

const concatChunks = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

// CompressionStream / DecompressionStream are GenericTransformStreams: their
// writable side accepts BufferSource, their readable side yields Uint8Array.
type ByteTransform = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<BufferSource>;
};

const pipeThrough = async (
  bytes: Uint8Array,
  stream: ByteTransform
): Promise<Uint8Array> => {
  const writer = stream.writable.getWriter();
  // bytes is a plain (non-shared) Uint8Array; the cast bridges TS's newer
  // generic ArrayBufferLike typing to the stream's BufferSource input.
  void writer.write(bytes as BufferSource);
  void writer.close();

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
    }
  }
  return concatChunks(chunks);
};

const compress = (bytes: Uint8Array): Promise<Uint8Array> =>
  pipeThrough(bytes, new CompressionStream("deflate-raw"));

const decompress = (bytes: Uint8Array): Promise<Uint8Array> =>
  pipeThrough(bytes, new DecompressionStream("deflate-raw"));

const bytesToBinary = (bytes: Uint8Array): string => {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return binary;
};

const binaryToBytes = (binary: string): Uint8Array => {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(bytesToBinary(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (normalized.length % 4)) % 4;
  return binaryToBytes(atob(normalized + "=".repeat(pad)));
};

/** Encode any JSON-serializable payload into a shareable fragment token. */
export const encodeShare = async (payload: unknown): Promise<EncodedShare> => {
  const json = JSON.stringify(payload);
  const raw = new TextEncoder().encode(json);

  let token: string;
  if (hasCompression()) {
    const compressed = await compress(raw);
    token = `${FORMAT_COMPRESSED}.${toBase64Url(compressed)}`;
  } else {
    token = `${FORMAT_RAW}.${toBase64Url(raw)}`;
  }

  const bytes = token.length;
  return {
    token,
    bytes,
    tooLarge: bytes > MAX_SHARE_BYTES,
    warn: bytes > WARN_SHARE_BYTES
  };
};

/** Decode a fragment token back into its payload, or null if unusable. */
export const decodeShare = async (token: string): Promise<unknown | null> => {
  try {
    const dot = token.indexOf(".");
    if (dot < 0) {
      return null;
    }

    const format = token.slice(0, dot);
    const data = token.slice(dot + 1);
    const bytes = fromBase64Url(data);

    let jsonBytes: Uint8Array;
    if (format === FORMAT_COMPRESSED) {
      if (!hasCompression()) {
        return null;
      }
      jsonBytes = await decompress(bytes);
    } else if (format === FORMAT_RAW) {
      jsonBytes = bytes;
    } else {
      return null;
    }

    return JSON.parse(new TextDecoder().decode(jsonBytes));
  } catch {
    return null;
  }
};

/** Pull the share token out of a location hash ("#share=..."), or null. */
export const extractShareToken = (hash: string): string | null => {
  if (!hash) {
    return null;
  }

  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return new URLSearchParams(raw).get(SHARE_HASH_KEY);
  } catch {
    return null;
  }
};
