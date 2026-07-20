"use client";

import { useEffect, useState } from "react";
import { isSpeechSupported, onVoicesChanged } from "@/lib/speech";

/**
 * Re-render hook for the async speechSynthesis voice list. Returns a version
 * counter: 0 until mounted on a speech-capable browser (so SSR markup never
 * shows speak buttons and hydration stays consistent), then bumps on mount
 * and again whenever `voiceschanged` fires. Components should render speech
 * UI only when the version is > 0 and `canSpeak(lang)` holds.
 */
export const useSpeechVoices = () => {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!isSpeechSupported()) {
      return;
    }

    setVersion((value) => value + 1);
    return onVoicesChanged(() => setVersion((value) => value + 1));
  }, []);

  return version;
};
