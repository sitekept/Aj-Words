import type { Metadata, Viewport } from "next";
import "./globals.css";

const localServiceWorkerResetScript = `
  (function () {
    var host = window.location.hostname;
    var isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /^10\\./.test(host) ||
      /^172\\.(1[6-9]|2[0-9]|3[0-1])\\./.test(host) ||
      /^192\\.168\\./.test(host) ||
      /\\.local$/.test(host);

    if (!isLocal) {
      return;
    }

    var cleanups = [];

    if ("serviceWorker" in navigator) {
      cleanups.push(
        navigator.serviceWorker
          .getRegistrations()
          .then(function (registrations) {
            return Promise.all(
              registrations.map(function (registration) {
                return registration.unregister();
              })
            );
          })
          .catch(function () {})
      );
    }

    if ("caches" in window) {
      cleanups.push(
        caches
          .keys()
          .then(function (keys) {
            return Promise.all(
              keys
                .filter(function (key) {
                  return key.indexOf("aj-words") === 0;
                })
                .map(function (key) {
                  return caches.delete(key);
                })
            );
          })
          .catch(function () {})
      );
    }

    var resetKey = "ajwords.local-sw-reset";
    var resetAlreadyRequested = false;

    try {
      resetAlreadyRequested = sessionStorage.getItem(resetKey) === "1";
    } catch (error) {}

    if (
      navigator.serviceWorker &&
      navigator.serviceWorker.controller &&
      !resetAlreadyRequested
    ) {
      try {
        sessionStorage.setItem(resetKey, "1");
      } catch (error) {}
      Promise.all(cleanups).finally(function () {
        window.location.replace(window.location.href);
      });
    }
  })();
`;
const shouldResetLocalServiceWorker = process.env.NODE_ENV !== "production";

const APP_DESCRIPTION =
  "Créez vos listes de vocabulaire, révisez-les en cartes mémo et testez votre mémoire. Tout reste sur votre appareil.";

// Where the app is served from. Needed for absolute Open Graph URLs: without a
// metadataBase, the share card's image resolves relative to nothing and the
// link previews as a bare URL. Vercel exposes the deployment host at build
// time; the localhost fallback keeps local builds working.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AJ Words",
  description: APP_DESCRIPTION,
  applicationName: "AJ Words",
  manifest: "/manifest.webmanifest",
  // This is a PRIVATE beta: the link is handed to testers, not published.
  // Remove this block when the app goes public.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "AJ Words",
    title: "AJ Words — apprenez votre vocabulaire",
    description: APP_DESCRIPTION,
    url: "/"
  },
  twitter: {
    card: "summary_large_image",
    title: "AJ Words — apprenez votre vocabulaire",
    description: APP_DESCRIPTION
  },
  appleWebApp: {
    capable: true,
    title: "AJ Words",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fffdf7",
  colorScheme: "light"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        {shouldResetLocalServiceWorker ? (
          <script
            dangerouslySetInnerHTML={{ __html: localServiceWorkerResetScript }}
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
