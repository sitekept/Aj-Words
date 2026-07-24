# AJ Words

A premium, offline-first vocabulary learning PWA. Build word lists, drill them with tactile swipe flashcards, and test recall with adaptive quizzes — all on-device, no account required.

<!-- screenshot placeholder -->

## Features

- **Local word lists** — create, edit, and organize vocabulary lists in the browser.
- **Swipe flashcards** — tactile pointer-driven deck; swipe right to mark *mastered*, left for *learning*. Resumes where you left off, per list.
- **Adaptive quizzes** — five modes (written, multiple choice, mixed, test, full review). Weak, due, and recently-missed words surface first; every mode, full review included, feeds the spaced-repetition schedule.
- **FSRS scheduling** — a modern spaced-repetition algorithm (FSRS-5) decides when each card is due, on top of the Leitner mastery scale.
- **Activity heatmap & gentle daily goal** — an Anki-style calendar of your review activity, with an opt-in daily goal that has *no* streak debt: a missed day never breaks anything.
- **Progress & mastery tracking** — per-word attempts, streaks, and a derived `new → learning → mastered` status, plus per-list test history.
- **Import / export & share by link** — move your data between devices as JSON, paste tab-separated terms from Quizlet, or share a whole list through a single compressed link (100 % client-side, no server).
- **Installable PWA** — works offline once installed; bundled starter lists (Darija + Hebrew Quizlet units) ship with the app.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · lucide-react.

By default there is **no backend and no database** — all state lives in the browser's `localStorage`. An **optional** cloud-sync layer (Supabase) can be switched on to carry your lists between devices without exporting a file; it stays completely off unless configured (see [Cloud sync](#cloud-sync-optional)).

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

## Cloud sync (optional)

Instead of exporting/importing a file, you can sync your lists through a Supabase database so they appear on your phone automatically. It is **opt-in and off by default**: when the two env vars below are absent, none of this code runs, the **Sync** button never appears, and the app behaves exactly as the local-only version above.

What it does (kept deliberately simple):

- **Syncs list *content* only** — words, translations, notes, examples, alt-answers, and tags. Learning **progress** (SRS boxes, due dates, streaks, test history) is **not** synced; it stays per-device. A list pulled onto a new device starts fresh.
- **Only your own lists** upload. The bundled starter lists already ship on every device, so they are never sent.
- **Duplicate lists are collapsed** on the way up: if two lists share (almost) all their word/translation pairs, only the one with the most words is kept.
- **No login, no code to type.** The first device signs in anonymously; to bring in your phone, open **Sync → scan the QR** with the phone's camera. The QR carries a short, single-use pairing code that expires in a few minutes.
  - Trade-off: an anonymous identity has **no recovery** — clearing browser data on every device, or losing your only device before pairing a second, orphans the cloud copy. Your local cache and the JSON **Export** remain the safety nets.

### Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard: **Authentication → Providers → Anonymous → On**.
3. Open **SQL → New query**, paste [`supabase/schema.sql`](supabase/schema.sql), and **Run** (creates the tables and the pairing RPC).
4. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase **Settings → API**).
5. `npm run build && npm run start`. The **Sync** button now appears; the build automatically adds your Supabase origin to the Content-Security-Policy `connect-src`.

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
