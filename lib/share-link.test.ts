import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeShare,
  encodeShare,
  extractShareToken,
  MAX_SHARE_BYTES,
  SHARE_HASH_KEY
} from "./share-link.ts";

const samplePayload = {
  app: "aj-words",
  version: 1,
  exportedAt: "2026-07-21T10:00:00.000Z",
  lists: [
    {
      id: "list-1",
      title: "Voyage — עברית",
      items: [
        { id: "a", word: "hello", translation: "שלום" },
        { id: "b", word: "goodbye", translation: "להתראות" }
      ]
    }
  ]
};

test("round-trips a payload through compress + base64url", async () => {
  const encoded = await encodeShare(samplePayload);
  assert.ok(encoded.token.startsWith("v1."));
  assert.equal(encoded.tooLarge, false);

  const decoded = await decodeShare(encoded.token);
  assert.deepEqual(decoded, samplePayload);
});

test("preserves RTL and non-ASCII content exactly", async () => {
  const encoded = await encodeShare(samplePayload);
  const decoded = (await decodeShare(encoded.token)) as typeof samplePayload;
  assert.equal(decoded.lists[0].items[0].translation, "שלום");
  assert.equal(decoded.lists[0].title, "Voyage — עברית");
});

test("decodes the raw (uncompressed) fallback format", async () => {
  // Simulate the fallback branch by decoding a hand-built raw token.
  const json = JSON.stringify({ hello: "world" });
  const base64url = Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const decoded = await decodeShare(`v1r.${base64url}`);
  assert.deepEqual(decoded, { hello: "world" });
});

test("returns null on corrupt or unknown input", async () => {
  assert.equal(await decodeShare("garbage-no-dot"), null);
  assert.equal(await decodeShare("v1.###notbase64###"), null);
  assert.equal(await decodeShare("v9.abcd"), null);
});

test("flags oversized payloads", async () => {
  const big = { blob: "x".repeat(MAX_SHARE_BYTES * 2) };
  const encoded = await encodeShare(big);
  // A long run of the same char compresses well, so build something incompressible.
  const noisy = {
    blob: Array.from({ length: 40000 }, (_, i) => (i * 2654435761) >>> 0).join(
      ","
    )
  };
  const encodedNoisy = await encodeShare(noisy);
  assert.ok(
    encoded.tooLarge || encodedNoisy.tooLarge,
    "expected at least one oversized payload to be flagged"
  );
});

test("extracts the share token from a location hash", () => {
  assert.equal(extractShareToken("#share=v1.abc"), "v1.abc");
  assert.equal(extractShareToken(`${SHARE_HASH_KEY}=v1.abc`), "v1.abc");
  assert.equal(extractShareToken("#list=foo"), null);
  assert.equal(extractShareToken(""), null);
});
