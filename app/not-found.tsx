"use client";

// A client component only because <BrandLogo> pulls in components/ui.tsx,
// which uses useLayoutEffect. The page itself needs no interactivity.
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

// AJ Words serves a single route, so anything else is a mistyped or stale URL.
// Without this, Next's own English 404 showed through in a French app.
export default function NotFound() {
  return (
    <main className="error-screen">
      <div className="error-card">
        <BrandLogo />
        <p className="eyebrow">Page introuvable</p>
        <h1>Cette page n&rsquo;existe pas</h1>
        <p>
          AJ Words tient sur une seule page. Le lien que vous avez suivi est
          sans doute incomplet.
        </p>
        <div className="error-actions">
          <Link className="button button-primary button-md" href="/">
            Retour à l&rsquo;accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
