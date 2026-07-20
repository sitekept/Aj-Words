import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_PREFIX,
  listBackupKeys,
  readLatestBackup,
  writeRotatingBackup,
  type KeyValueStorage
} from "./local-backup.ts";

const createMemoryStorage = () => {
  const entries = new Map<string, string>();
  let pendingFailures = 0;

  const storage: KeyValueStorage = {
    getItem: (key) => (entries.has(key) ? (entries.get(key) as string) : null),
    setItem: (key, value) => {
      if (pendingFailures > 0) {
        pendingFailures -= 1;
        const error = new Error("quota exceeded");
        error.name = "QuotaExceededError";
        throw error;
      }
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    get length() {
      return entries.size;
    },
    key: (index) => Array.from(entries.keys())[index] ?? null
  };

  return {
    storage,
    failNextWrites: (count: number) => {
      pendingFailures = count;
    }
  };
};

test("rotation keeps at most three backups", () => {
  const { storage } = createMemoryStorage();
  const stamps = [
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T07:00:00.000Z",
    "2026-01-01T14:00:00.000Z",
    "2026-01-01T21:00:00.000Z"
  ];

  stamps.forEach((stamp, index) => {
    assert.deepEqual(writeRotatingBackup(storage, `payload-${index}`, stamp), {
      written: true
    });
  });

  assert.deepEqual(
    listBackupKeys(storage),
    stamps.slice(1).map((stamp) => `${BACKUP_PREFIX}${stamp}`)
  );
});

test("skips a write when the newest backup is younger than the interval", () => {
  const { storage } = createMemoryStorage();

  assert.deepEqual(
    writeRotatingBackup(storage, "first", "2026-01-01T00:00:00.000Z"),
    { written: true }
  );
  assert.deepEqual(
    writeRotatingBackup(storage, "second", "2026-01-01T05:59:00.000Z"),
    { written: false }
  );
  assert.equal(listBackupKeys(storage).length, 1);
  assert.equal(readLatestBackup(storage), "first");
});

test("prunes the oldest backup and retries once on a quota error", () => {
  const { storage, failNextWrites } = createMemoryStorage();
  storage.setItem(`${BACKUP_PREFIX}2026-01-01T00:00:00.000Z`, "oldest");
  storage.setItem(`${BACKUP_PREFIX}2026-01-01T07:00:00.000Z`, "newest");

  failNextWrites(1);
  const result = writeRotatingBackup(storage, "fresh", "2026-01-01T14:00:00.000Z");

  assert.deepEqual(result, { written: true });
  assert.deepEqual(listBackupKeys(storage), [
    `${BACKUP_PREFIX}2026-01-01T07:00:00.000Z`,
    `${BACKUP_PREFIX}2026-01-01T14:00:00.000Z`
  ]);
  assert.equal(readLatestBackup(storage), "fresh");
});

test("gives up silently when the retry also hits quota", () => {
  const { storage, failNextWrites } = createMemoryStorage();
  storage.setItem(`${BACKUP_PREFIX}2026-01-01T00:00:00.000Z`, "oldest");

  failNextWrites(2);
  assert.deepEqual(
    writeRotatingBackup(storage, "fresh", "2026-01-01T14:00:00.000Z"),
    { written: false }
  );
  // The failed attempt still sacrificed the oldest backup to make room.
  assert.deepEqual(listBackupKeys(storage), []);
});

test("readLatestBackup returns the newest backup value", () => {
  const { storage } = createMemoryStorage();
  storage.setItem(`${BACKUP_PREFIX}2026-01-01T00:00:00.000Z`, "old");
  storage.setItem(`${BACKUP_PREFIX}2026-01-02T00:00:00.000Z`, "new");
  storage.setItem("worddeck.v1.lists", "unrelated");

  assert.equal(readLatestBackup(storage), "new");
});

test("readLatestBackup returns null when no backups exist", () => {
  const { storage } = createMemoryStorage();
  storage.setItem("worddeck.v1.lists", "unrelated");

  assert.equal(readLatestBackup(storage), null);
});

test("listBackupKeys sorts keys ascending by timestamp", () => {
  const { storage } = createMemoryStorage();
  storage.setItem(`${BACKUP_PREFIX}2026-01-03T00:00:00.000Z`, "c");
  storage.setItem(`${BACKUP_PREFIX}2026-01-01T00:00:00.000Z`, "a");
  storage.setItem("ajwords.v1.ui", "unrelated");
  storage.setItem(`${BACKUP_PREFIX}2026-01-02T00:00:00.000Z`, "b");

  assert.deepEqual(listBackupKeys(storage), [
    `${BACKUP_PREFIX}2026-01-01T00:00:00.000Z`,
    `${BACKUP_PREFIX}2026-01-02T00:00:00.000Z`,
    `${BACKUP_PREFIX}2026-01-03T00:00:00.000Z`
  ]);
});

test("skips oversized payloads, measuring bytes not characters", () => {
  const { storage } = createMemoryStorage();

  assert.deepEqual(
    writeRotatingBackup(storage, "x".repeat(64), "2026-01-01T00:00:00.000Z", {
      maxPayloadBytes: 16
    }),
    { written: false }
  );
  // 10 two-byte characters exceed a 15-byte budget even at length 10.
  assert.deepEqual(
    writeRotatingBackup(storage, "é".repeat(10), "2026-01-01T00:00:00.000Z", {
      maxPayloadBytes: 15
    }),
    { written: false }
  );
  assert.equal(listBackupKeys(storage).length, 0);
});
