/**
 * The build identifier shown in the UI and quoted in bug reports.
 *
 * Nothing used to surface a version: `package.json` carried one but it was
 * never imported, and the only build marker was `CACHE_NAME` inside the service
 * worker. A beta tester could not say which build they were on, and we could
 * not tell either.
 *
 * Both values are injected at build time by next.config.ts, so this module
 * stays free of `process.env` guesswork at runtime.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/** Short commit SHA when the host exposes one (Vercel does); empty otherwise. */
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? "";

/** e.g. "0.1.0 · a1b2c3d", or just "0.1.0" when no SHA is available. */
export const APP_BUILD_LABEL = APP_COMMIT
  ? `${APP_VERSION} · ${APP_COMMIT}`
  : APP_VERSION;

/**
 * Where "Donner mon avis" sends testers.
 *
 * A `mailto:` rather than a hosted form, deliberately: AJ Words has no backend,
 * so there is nothing in the app that could receive a submission, and a form
 * would mean standing up (and trusting) a third-party service for a short beta.
 *
 * Leave this empty to hide the link entirely rather than ship a dead one.
 *
 * Note this address ends up in the client bundle and in a public repository, so
 * it is collectable by spam crawlers. Use a dedicated address if that matters.
 */
export const FEEDBACK_EMAIL = "sitekept@gmail.com";

/**
 * A pre-addressed bug report: the build and the browser are filled in already,
 * because a tester cannot be expected to know either, and a report without them
 * is hard to act on. The rest is left for them to write.
 */
export const buildFeedbackUrl = (): string | null => {
  if (!FEEDBACK_EMAIL) {
    return null;
  }

  const browser =
    typeof navigator === "undefined" ? "inconnu" : navigator.userAgent;

  const body = [
    "Décrivez ce qui s'est passé, et ce que vous faisiez juste avant :",
    "",
    "",
    "---",
    "Merci de laisser les lignes ci-dessous, elles m'aident à reproduire :",
    `Version : ${APP_BUILD_LABEL}`,
    `Navigateur : ${browser}`
  ].join("\n");

  const params = new URLSearchParams({
    subject: `AJ Words — retour beta (${APP_BUILD_LABEL})`,
    body
  });

  // URLSearchParams encodes spaces as "+", which mail clients render literally
  // in a body. %20 is what they expect.
  return `mailto:${FEEDBACK_EMAIL}?${params.toString().replace(/\+/g, "%20")}`;
};
