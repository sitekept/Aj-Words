import type { NextConfig } from "next";

// A static CSP, deliberately without a nonce. Nonces require per-request
// generation via middleware, which forces dynamic rendering — this app is
// fully static and its service worker caches the navigation response, so a
// nonce would buy nothing and risk the offline path.
//
// 'unsafe-inline' on script-src is unavoidable: Next's hydration payload ships
// as inline <script> whose content changes every build, so no stable hash
// exists. That is an acceptable trade here — the app has no eval, no
// dangerouslySetInnerHTML in production (the only inline script, the local
// service-worker reset in app/layout.tsx, is dev-only) and loads no
// third-party script. The real hardening is everything else: nothing can be
// framed, no plugins, no base-tag injection, no form posting or network call
// to a foreign origin.
// When cloud sync is configured, its Supabase origin must be reachable by the
// browser (auth, REST, storage). We read the same public env var the client
// uses and add ONLY that exact origin to connect-src — the strict default
// (connect-src 'self') is kept whenever sync is off. Card images already fall
// under img-src's blanket https:, so no img-src change is needed.
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    return raw ? new URL(raw).origin : null;
  } catch {
    return null;
  }
})();

const connectSrc = ["'self'", supabaseOrigin].filter(Boolean).join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  // React style={} props and Next's injected <style> blocks.
  "style-src 'self' 'unsafe-inline'",
  // blob: for card images resolved from IndexedDB via URL.createObjectURL
  // (lib/useItemImage.ts); https: for the user-supplied external imageUrl and
  // Supabase Storage public image URLs.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "media-src 'self'",
  // Service-worker registration (/sw.js).
  "worker-src 'self'",
  "manifest-src 'self'"
].join("; ");

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy
  },
  {
    // The app needs none of these. speechSynthesis (TTS) is not gated by
    // Permissions-Policy, so muting everything here costs no feature.
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()"
    ].join(", ")
  },
  {
    // Ignored by browsers over plain http, so this is inert on the LAN/dev
    // hosts and only takes effect on the HTTPS deployment. No "preload": that
    // commits the whole domain and is painful to walk back.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains"
  }
];

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "10.*.*.*",
    "172.*.*.*",
    "192.168.*.*",
    "*.local"
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8"
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate"
          }
        ]
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
