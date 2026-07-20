import test from "node:test";
import assert from "node:assert/strict";
import { resolveSpeechLangs } from "./speech.ts";

test("maps simple language names to word-side codes", () => {
  assert.deepEqual(resolveSpeechLangs("English"), { word: "en" });
  assert.deepEqual(resolveSpeechLangs("Hebrew"), { word: "he" });
  assert.deepEqual(resolveSpeechLangs("French"), { word: "fr" });
  assert.deepEqual(resolveSpeechLangs("Spanish"), { word: "es" });
  assert.deepEqual(resolveSpeechLangs("German"), { word: "de" });
  assert.deepEqual(resolveSpeechLangs("Italian"), { word: "it" });
  assert.deepEqual(resolveSpeechLangs("Portuguese"), { word: "pt" });
  assert.deepEqual(resolveSpeechLangs("Arabic"), { word: "ar" });
  assert.deepEqual(resolveSpeechLangs("Russian"), { word: "ru" });
  assert.deepEqual(resolveSpeechLangs("Dutch"), { word: "nl" });
});

test("splits the builtin compound name into word and translation sides", () => {
  assert.deepEqual(resolveSpeechLangs("English / Hebrew"), {
    word: "en",
    translation: "he"
  });
});

test("compound names tolerate spacing and keep only known sides", () => {
  assert.deepEqual(resolveSpeechLangs("french/spanish"), {
    word: "fr",
    translation: "es"
  });
  assert.deepEqual(resolveSpeechLangs("Klingon / Hebrew"), {
    translation: "he"
  });
  assert.deepEqual(resolveSpeechLangs("English / Klingon"), { word: "en" });
});

test("darija resolves to no speech languages on either side", () => {
  assert.deepEqual(resolveSpeechLangs("Darija"), {});
  assert.deepEqual(resolveSpeechLangs("English / Darija"), { word: "en" });
});

test("unknown, empty, and over-compound names resolve to {}", () => {
  assert.deepEqual(resolveSpeechLangs(undefined), {});
  assert.deepEqual(resolveSpeechLangs(""), {});
  assert.deepEqual(resolveSpeechLangs("   "), {});
  assert.deepEqual(resolveSpeechLangs("Klingon"), {});
  assert.deepEqual(resolveSpeechLangs("a / b / c"), {});
});

test("tolerates case, whitespace, and diacritics", () => {
  assert.deepEqual(resolveSpeechLangs("  ENGLISH  "), { word: "en" });
  assert.deepEqual(resolveSpeechLangs("hebrew"), { word: "he" });
  assert.deepEqual(resolveSpeechLangs("Français"), { word: "fr" });
  assert.deepEqual(resolveSpeechLangs("Español"), { word: "es" });
  assert.deepEqual(resolveSpeechLangs("Hébreu"), { word: "he" });
  assert.deepEqual(resolveSpeechLangs("ANGLAIS / HÉBREU"), {
    word: "en",
    translation: "he"
  });
});
