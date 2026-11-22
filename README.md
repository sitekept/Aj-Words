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
- **Installable PWA** — works offline once installed.
- **Curated library mode** — an optional build (`NEXT_PUBLIC_CURATED_LIBRARY=1`) where the bundled lists are the only lists: every path that adds, edits, shares or imports content is hidden. Used for the beta, so testers study a library the maintainer controls.

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
| `npm run e2e` | Playwright suite — two sequential passes (authoring build, then curated). Builds and serves production itself on port 3000, so nothing may be listening there. |
| `npm run build:curated` | Production build with the curated library locked (`NEXT_PUBLIC_CURATED_LIBRARY=1`). |
| `npm run import:phone -- <export.json>` | Regenerate the bundled lists from an in-app JSON export. |

Pure logic tests use Node's built-in runner. Validate changes with `npm test`, `npm run lint`, `npm run build`, and manual testing in the browser.

`package.json` also carries a PostCSS override to keep Next's pinned transitive dependency on a patched `8.5.x` release; keep `npm audit` clean when changing framework dependencies.

## Data & privacy

Everything you create stays on your device in `localStorage`. There are no accounts, servers, or telemetry. Use **Export** to download a JSON snapshot and **Import** to restore it on another device or browser.

The interface is in French.

The app ships a bundled starter list (`lib/builtin-vocabulary-data.json`), which every
install receives. Bundled lists are **content only** — no study progress travels with
them; your own progress on them lives on your device and survives app updates. When the
bundle is empty, a fresh install seeds a single deletable demo list instead
(`lib/demo-list.ts`).

### Curating the bundled lists

The bundle is the whole library in a `NEXT_PUBLIC_CURATED_LIBRARY=1` build, so this is
how lists get added or changed:

1. Run the app normally (`npm run dev`) — that is the full editing UI.
2. Build the lists there: **Nouvelle liste**, or paste tab-separated terms from Quizlet.
3. **Exporter** to a JSON file.
4. `npm run import:phone -- <export.json>` rewrites `lib/builtin-vocabulary-data.json`.
   It emits the `terms` shape, so progress and test history are dropped on the way in —
   `lib/builtin-vocabulary.ts` compiles `terms` into permanently fresh cards, while the
   `items` shape would preserve whatever the export carried. The script says so when it
   drops something.
5. `npm test`, then commit. Testers get the new lists on their next load, with their
   existing progress intact.

Two standing rules, both guarded by tests:

- A **new** list needs a **new** id. Retired ids are tombstoned on load
  (`lib/retired-lists.ts`) and the list would vanish everywhere, silently.
- Before **removing** a list from the bundle, append its id to `RETIRED_BUILTIN_IDS`, or
  its stored progress overlays resurface as lists of blank cards.

Whatever is in the bundle is in this public repository, and readable by anyone.

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

## Deployment

The app builds as a regular Next.js application — `next.config.ts` sets no
`output` mode, and its security headers (the CSP included) are served by
`async headers()`. **It must be deployed somewhere that runs Next**; copied to a
static file host, every header would be silently dropped.

Recommended: Vercel, connected to this repository.

1. Import the repository in the Vercel dashboard. The defaults are right
   (`npm run build`, framework Next.js); `engines.node` pins the runtime.
2. **Set no environment variables.** Without `NEXT_PUBLIC_SUPABASE_*` the app
   is fully local, the **Sync** button is hidden, and the CSP tightens to
   `connect-src 'self'`. See [Cloud sync](#cloud-sync-optional) to turn it on.
3. Optional: set `NEXT_PUBLIC_SITE_URL` to the deployment URL. It is only used
   as the `metadataBase` for the Open Graph share card; Vercel's own
   `VERCEL_PROJECT_PRODUCTION_URL` is used automatically when it is absent.

Beta notes:

- `app/layout.tsx` sets `robots: { index: false, follow: false }`. The link is
  meant to be handed to testers, not indexed — **remove that line** when the app
  goes public.
- Set **`NEXT_PUBLIC_CURATED_LIBRARY=1`** for the tester-facing deployment. The lists
  then come from the bundle only: no create, edit, delete, add-word, import, export or
  share, and the `#share=` fragment is ignored. Drop the variable to unlock the app at
  public launch. It closes the path, not the door — the app is client-side with no
  server and no accounts, so it is housekeeping rather than a permission.
  It also disables cloud sync outright, whatever the env vars say: a pull adds
  lists, so sync is an inbound content path like any other.
- The build identity (version + short commit SHA) is shown at the foot of the
  library panel, so a tester can say which build a report refers to.
- Feedback goes to the address in `FEEDBACK_EMAIL` (`lib/app-version.ts`)
  through a plain `mailto:` link — the app has no backend, so there is nothing
  that could receive a submitted form. The build label and the tester's browser
  are pre-filled in the message body, since a tester cannot be expected to know
  either. Set the constant to an empty string to hide the link entirely rather
  than ship a dead one. Note the address ships in the client bundle and in this
  public repository, so it is collectable by spam crawlers.
- `.github/workflows/ci.yml` runs lint, unit tests, the production build and the
  Playwright suite on every push and pull request.

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
