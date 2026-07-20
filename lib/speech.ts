// Text-to-speech helpers over the Web Speech API (speechSynthesis).
//
// resolveSpeechLangs is pure (no window access) and node-tested; everything
// else guards on isSpeechSupported() and silently no-ops when the browser
// lacks speech synthesis. Nothing here ever throws.

export interface ListSpeechLangs {
  word?: string;
  translation?: string;
}

// Free-form list language names (folded: lowercase, trimmed, diacritics
// stripped) mapped to BCP-47 primary language codes. Includes a few common
// native/French spellings since list names are user-typed.
const LANGUAGE_CODES: Record<string, string> = {
  english: "en",
  anglais: "en",
  hebrew: "he",
  hebreu: "he",
  french: "fr",
  francais: "fr",
  spanish: "es",
  espagnol: "es",
  espanol: "es",
  german: "de",
  deutsch: "de",
  allemand: "de",
  italian: "it",
  italiano: "it",
  italien: "it",
  portuguese: "pt",
  portugues: "pt",
  portugais: "pt",
  arabic: "ar",
  arabe: "ar",
  russian: "ru",
  russe: "ru",
  dutch: "nl"
};

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

// "darija" is deliberately unmapped: the bundled Darija lists are written in
// arabizi transliteration (digits for letters), which no voice can pronounce.
const codeFor = (name: string): string | undefined => {
  const folded = fold(name);
  return folded && folded !== "darija" ? LANGUAGE_CODES[folded] : undefined;
};

/**
 * Resolves a list's free-form `language` name to per-side speech languages.
 * Compound "A / B" names (the builtin "English / Hebrew" lists) put A on the
 * word side and B on the translation side. A single known language maps only
 * the word side — the translation side's language is unknown, and silence
 * beats speaking it with the wrong voice. Unknown/empty names resolve to {}.
 */
export const resolveSpeechLangs = (
  language: string | undefined
): ListSpeechLangs => {
  if (!language) {
    return {};
  }

  const parts = language.split("/");

  if (parts.length === 2) {
    const word = codeFor(parts[0]);
    const translation = codeFor(parts[1]);

    return {
      ...(word ? { word } : {}),
      ...(translation ? { translation } : {})
    };
  }

  if (parts.length > 2) {
    return {};
  }

  const word = codeFor(language);
  return word ? { word } : {};
};

export const isSpeechSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window;

// Some engines still report Hebrew voices under the legacy "iw" code.
const LANG_ALIASES: Record<string, string[]> = {
  he: ["he", "iw"]
};

const getVoices = (): SpeechSynthesisVoice[] => {
  if (!isSpeechSupported()) {
    return [];
  }

  try {
    return window.speechSynthesis.getVoices() ?? [];
  } catch {
    return [];
  }
};

export const getVoiceForLang = (lang: string): SpeechSynthesisVoice | null => {
  const prefixes = LANG_ALIASES[lang.toLowerCase()] ?? [lang.toLowerCase()];
  const matches = getVoices().filter((voice) => {
    const voiceLang = (voice.lang ?? "").toLowerCase().replace(/_/g, "-");
    return prefixes.some(
      (prefix) => voiceLang === prefix || voiceLang.startsWith(`${prefix}-`)
    );
  });

  if (!matches.length) {
    return null;
  }

  return matches.find((voice) => voice.localService) ?? matches[0];
};

export const canSpeak = (lang: string | undefined): boolean =>
  Boolean(lang) && isSpeechSupported() && getVoiceForLang(lang as string) !== null;

/** Cancels any in-flight utterance first, so rapid taps never overlap. */
export const speak = (text: string, lang: string): void => {
  if (!isSpeechSupported() || !text.trim()) {
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = getVoiceForLang(lang);
    if (voice) {
      utterance.voice = voice;
    }
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech is a best-effort enhancement; never surface an error.
  }
};

/**
 * Subscribes to the async voice list load. Returns an unsubscribe function
 * (a no-op when speech is unsupported).
 */
export const onVoicesChanged = (cb: () => void): (() => void) => {
  if (!isSpeechSupported()) {
    return () => {};
  }

  const synth = window.speechSynthesis;

  if (typeof synth.addEventListener === "function") {
    const listener = () => cb();
    synth.addEventListener("voiceschanged", listener);
    return () => synth.removeEventListener("voiceschanged", listener);
  }

  const previous = synth.onvoiceschanged;
  synth.onvoiceschanged = () => cb();
  return () => {
    synth.onvoiceschanged = previous ?? null;
  };
};
