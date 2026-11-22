import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPORT_APP_ID,
  EXPORT_VERSION,
  wrapExportPayload
} from "./export-format.ts";

test("the envelope is the wire format the import path validates", () => {
  // These two values gate parseExportPayload. Changing either one orphans
  // every export a user has already saved.
  assert.equal(EXPORT_APP_ID, "aj-words");
  assert.equal(EXPORT_VERSION, 1);
});

test("wrapExportPayload produces an envelope the import path accepts", () => {
  // The error screen's rescue download used to write the bare localStorage
  // array, which parseExportPayload rejects outright — so the one recovery
  // path offered to a crashed tester produced an unimportable file.
  const payload = wrapExportPayload([{ id: "a", title: "Liste" }]);

  assert.deepEqual(payload, {
    app: "aj-words",
    version: 1,
    lists: [{ id: "a", title: "Liste" }]
  });
  assert.equal(Array.isArray(payload.lists), true);
});
