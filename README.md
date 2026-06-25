# AJ Words

A premium, offline-first vocabulary learning PWA. Build word lists, drill them with tactile swipe flashcards, and test recall with adaptive quizzes — all on-device, no account required.

<!-- screenshot placeholder -->

## Features

- **Local word lists** — create, edit, and organize vocabulary lists in the browser.
- **Swipe flashcards** — tactile pointer-driven deck; swipe right to mark *mastered*, left for *learning*. Resumes where you left off, per list.
- **Adaptive quizzes** — six modes (written, multiple choice, mixed, test, full review, daily review). Weak and recently-missed words surface first.
- **Progress & mastery tracking** — per-word attempts, streaks, and a derived `new → learning → mastered` status, plus per-list test history.
- **Import / export** — move your data between devices as JSON, or paste tab-separated terms straight from Quizlet.
- **Installable PWA** — works offline once installed; bundled starter lists (Darija + Hebrew Quizlet units) ship with the app.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · lucide-react.

There is **no backend and no database** — all state lives in the browser's `localStorage`.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

The dev script intentionally pins the dev server to Webpack with `--webpack` (Next 16 defaults to Turbopack; the production `build` still uses it). To test on a phone over your LAN, run `npm run dev:host` and open `http://<your-machine-ip>:3000`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (Webpack). |
| `npm run dev:host` | Same, bound to `0.0.0.0` for LAN/phone testing. |
| `npm run build` | Production build. |
| `npm run start` | Serve the production build. |
| `npm run lint` | Run ESLint (`next` core-web-vitals + typescript configs). |
| `npm test` | Run pure logic tests with Node's built-in test runner. |
| `npm run import:phone -- <export.json>` | Regenerate the bundled starter lists from an in-app JSON export. |

Pure logic tests use Node's built-in runner. Validate changes with `npm test`, `npm run lint`, `npm run build`, and manual testing in the browser.

`package.json` also carries a PostCSS override to keep Next's pinned transitive dependency on a patched `8.5.x` release; keep `npm audit` clean when changing framework dependencies.

## Data & privacy

Everything you create stays on your device in `localStorage`. There are no accounts, servers, or telemetry. Use **Export** to download a JSON snapshot and **Import** to restore it on another device or browser.

## PWA & offline

The app is installable and caches its shell for offline use. The service worker registers **only in production over HTTPS or a local network host** — in development it is deliberately unregistered (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#11-pwa-and-service-worker)). Test caching/offline behavior with `npm run build` + `npm run start`, not `npm run dev`.

## Project layout

```
app/          Next.js App Router — layout, page, manifest route, global styles
components/   React UI — VocabularyApp orchestrator, study modes, modals, ui.tsx primitives
lib/          Data layer — storage, store hook, builtin lists, import parsing (+ bundled JSON)
types/        Shared TypeScript types (the data model)
scripts/      Node CLI to regenerate the bundled starter lists
public/        PWA assets — service worker, icons, manifest target
```

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — deep dive: data model, state/persistence, the builtin-list copy-on-write model, the quiz engine, the PWA, and flow diagrams.
- **[CLAUDE.md](CLAUDE.md)** — conventions and gotchas for contributors (and AI agents) working in this repo.
