"use client";

// The last line of defence: an error thrown by the root layout itself never
// reaches app/error.tsx, because that boundary lives *inside* the layout.
// This one replaces the whole document, so it ships its own <html>/<body> and
// cannot rely on globals.css having loaded.
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#fbf7ef",
          color: "#182d36",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}>
            AJ Words n&rsquo;a pas pu démarrer
          </h1>
          <p style={{ color: "#657780", lineHeight: 1.5 }}>
            Vos listes restent enregistrées dans ce navigateur. Réessayez, ou
            rechargez la page.
            {error.digest ? ` (${error.digest})` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "10px 18px",
              borderRadius: "10px",
              border: "none",
              background: "#2d6f68",
              color: "#fffcf4",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
