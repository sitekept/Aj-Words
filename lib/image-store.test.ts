import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteImage,
  getImage,
  listImageIds,
  pruneImages,
  putImage
} from "./image-store.ts";

// Under `node --test` there is no IndexedDB. Every call must degrade gracefully
// (resolve, never throw) so UI callers never need to guard. The real IDB path
// is exercised by the browser verification and e2e, not here.

test("putImage resolves false when IndexedDB is unavailable", async () => {
  const blob = new Blob(["x"], { type: "image/png" });
  assert.equal(await putImage("id-1", blob), false);
});

test("getImage resolves null when unavailable", async () => {
  assert.equal(await getImage("id-1"), null);
});

test("deleteImage resolves without throwing", async () => {
  await assert.doesNotReject(deleteImage("id-1"));
});

test("listImageIds resolves an empty array", async () => {
  assert.deepEqual(await listImageIds(), []);
});

test("pruneImages resolves without throwing", async () => {
  await assert.doesNotReject(pruneImages(["keep-me"]));
});
