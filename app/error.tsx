"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, RotateCcw } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui";
import { APP_BUILD_LABEL, buildFeedbackUrl } from "@/lib/app-version";

// Without this, any render error in VocabularyApp (which is the whole app —
// one big client component behind a four-line page) left the tester on a blank
// white page: no explanation, no way back, and no way to tell us about it.
//
// Two things matter here beyond apologising. First, the tester's data is still
// in localStorage, and saying so plainly stops them assuming it is gone.
// Second, the export has to work WITHOUT the store, since the store is the
// most likely thing to have just crashed — so it reads localStorage directly.
const STORAGE_KEY = "worddeck.v1.lists";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [feedbackUrl, setFeedbackUrl] = useState<string | null>(null);

  useEffect(() => {
    // navigator is read inside the URL builder, so defer to the client.
    setFeedbackUrl(buildFeedbackUrl());
  }, []);

  useEffect(() => {
    console.error("AJ Words a rencontré une erreur :", error);
  }, [error]);

  const exportRawLists = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const blob = new Blob([raw ?? "[]"], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `aj-words-secours-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Storage can be unreadable (Safari lockdown, blocked site data). There
      // is nothing useful to say here that the page does not already say.
    }
  };

  return (
    <main className="error-screen">
      <div className="error-card">
        <BrandLogo />
        <p className="eyebrow">
          <AlertTriangle size={15} aria-hidden="true" /> Une erreur est survenue
        </p>
        <h1>AJ Words s&rsquo;est arrêté net</h1>
        <p>
          <strong>Vos listes sont intactes.</strong> Elles sont enregistrées
          dans ce navigateur, pas dans cette page — réessayer ne les efface pas.
        </p>
        <div className="error-actions">
          <Button icon={<RotateCcw size={18} />} onClick={reset}>
            Réessayer
          </Button>
          <Button
            variant="secondary"
            icon={<Download size={18} />}
            onClick={exportRawLists}
          >
            Exporter mes listes
          </Button>
        </div>
        <p className="field-hint">
          Si cela se reproduit, signalez-le en précisant ce que vous faisiez
          juste avant. Version {APP_BUILD_LABEL}
          {error.digest ? ` · ${error.digest}` : ""}.
        </p>
        {feedbackUrl ? (
          <a href={feedbackUrl}>
            Donner mon avis
          </a>
        ) : null}
      </div>
    </main>
  );
}
