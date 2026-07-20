export const BACKUP_PREFIX = "worddeck.v1.backup.";

const DEFAULT_MAX_BACKUPS = 3;
const DEFAULT_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_PAYLOAD_BYTES = 1_572_864;

export interface KeyValueStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  length: number;
  key(i: number): string | null;
}

export interface RotatingBackupOptions {
  max?: number;
  minIntervalMs?: number;
  maxPayloadBytes?: number;
}

const payloadByteLength = (payload: string) =>
  typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(payload).length
    : payload.length;

const timestampFromKey = (key: string) =>
  Date.parse(key.slice(BACKUP_PREFIX.length));

export const listBackupKeys = (storage: KeyValueStorage): string[] => {
  const keys: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(BACKUP_PREFIX)) {
      keys.push(key);
    }
  }

  // ISO-8601 UTC timestamps are fixed-width, so a plain sort is chronological.
  return keys.sort();
};

const pruneBackups = (storage: KeyValueStorage, max: number) => {
  const keys = listBackupKeys(storage);

  for (let index = 0; index < keys.length - max; index += 1) {
    storage.removeItem(keys[index]);
  }
};

export const writeRotatingBackup = (
  storage: KeyValueStorage,
  payload: string,
  nowIso: string,
  opts?: RotatingBackupOptions
): { written: boolean } => {
  const max = opts?.max ?? DEFAULT_MAX_BACKUPS;
  const minIntervalMs = opts?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const maxPayloadBytes = opts?.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;

  try {
    if (payloadByteLength(payload) > maxPayloadBytes) {
      return { written: false };
    }

    const keys = listBackupKeys(storage);
    const newestKey = keys[keys.length - 1];

    if (newestKey) {
      const elapsed = Date.parse(nowIso) - timestampFromKey(newestKey);
      if (Number.isFinite(elapsed) && elapsed < minIntervalMs) {
        return { written: false };
      }
    }

    const nextKey = `${BACKUP_PREFIX}${nowIso}`;

    try {
      storage.setItem(nextKey, payload);
    } catch {
      // Likely quota: sacrifice the oldest backup and retry once.
      const oldestKey = listBackupKeys(storage).filter((key) => key !== nextKey)[0];
      if (oldestKey) {
        storage.removeItem(oldestKey);
      }

      try {
        storage.setItem(nextKey, payload);
      } catch {
        return { written: false };
      }
    }

    pruneBackups(storage, max);
    return { written: true };
  } catch {
    return { written: false };
  }
};

export const readLatestBackup = (storage: KeyValueStorage): string | null => {
  const keys = listBackupKeys(storage);

  for (let index = keys.length - 1; index >= 0; index -= 1) {
    const value = storage.getItem(keys[index]);
    if (value !== null) {
      return value;
    }
  }

  return null;
};
