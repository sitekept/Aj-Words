// The export envelope, in a module with NO imports of its own.
//
// It lives apart from lib/vocabulary-storage.ts so that app/error.tsx can
// produce a genuinely importable rescue file without importing the storage
// module — whose evaluation is one of the things that may have just crashed,
// and which would then take the error screen down with it.
//
// These two values are the wire format. Changing either one orphans every
// export a user has already saved.

export const EXPORT_APP_ID = "aj-words";
export const EXPORT_VERSION = 1;

/**
 * Wraps already-normalized lists in the envelope `parseExportPayload` expects.
 * `lists` is deliberately `unknown[]`: the rescue path in app/error.tsx hands
 * over whatever localStorage held, which the import path validates anyway.
 */
export const wrapExportPayload = (lists: unknown[]) => ({
  app: EXPORT_APP_ID,
  version: EXPORT_VERSION,
  lists
});
