# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation map

- **`README.md`** — human onboarding: features, quick start, scripts.
- **`docs/ARCHITECTURE.md`** — deep dive with diagrams: data model, persistence, the builtin-list copy-on-write model, list load/merge, quiz engine, PWA.
- **`CLAUDE.md`** (this file) — conventions and gotchas for working in the repo.

## Commands

```bash
npm run dev            # Dev server (Webpack, not Turbopack — the --webpack flag is intentional)
npm run dev:host       # Same, bound to 0.0.0.0 for testing on a phone over the LAN
npm run build          # Production build
npm run start          # Serve the production build
npm run lint           # eslint (next core-web-vitals + typescript configs)
npm test               # Node built-in test runner for pure logic
npm run e2e            # Playwright end-to-end suite (builds + serves production itself)

# Regenerate the bundled seed lists from an in-app JSON export (see "Builtin lists" below):
npm run import:phone -- <aj-words-export.json> [--output <path>]
```

Pure logic has unit tests via Node's built-in runner (`npm test`, equivalent to `node --test lib/*.test.ts`) — no test framework or dependencies; Node strips the TypeScript types natively. Test files are excluded from `tsconfig`/eslint. Also verify changes via `npm run lint`, `npm run build`, and manual testing in the browser.

```bash
node --test lib/srs.test.ts                        # one file
node --test --test-name-pattern "promotes" lib/    # one test by name
```

### End-to-end tests (Playwright)

`e2e/*.spec.ts` + `playwright.config.ts` cover the real browser flows: list
creation, written/choice quizzes (tolerant matching, typo verdict, diff,
"J'avais raison" override), reverse direction, cloze, flashcards
(undo/shuffle/progress), export/import, mid-quiz reload resume, and a
production offline smoke test through the service worker.

- `npm run e2e` (or `npx playwright test`) — the config's `webServer` runs
  `npm run build && npm run start` itself, so no server should be running on
  port 3000. It must be the **production** server: the SW only registers in
  production, and dev actively unregisters it (see the PWA section below).
- Run it before merging anything that touches components, the quiz engine,
  persistence, or `public/sw.js`. Two projects run every spec: `desktop`
  (1440x1000) and `mobile` (390x844, touch) — below 760px the library panel
  and detail panel swap instead of sitting side by side.
- One-time setup on a new machine: `npx playwright install chromium`.
- The `e2e/` dir is excluded from `tsconfig.json` and ignored by eslint;
  Playwright transpiles the specs itself. `playwright-report/` and
  `test-results/` are gitignored.
- Writing specs: question order is **random** (the session pool is shuffled),
  so specs never assume order — they read the displayed prompt and look the
  answer up in a word→translation map (`e2e/helpers.ts`). The helpers also
  absorb two re-render races: `QuizRunner` rebuilds and reshuffles its
  questions in a mount effect (`readPrompt` waits for a stable prompt), and
  "Next" commits asynchronously (`nextQuestion` waits for the feedback panel
  to clear).

## Architecture

AJ Words is a **fully client-side** vocabulary-learning PWA: Next.js 16 App Router, React 19, TypeScript (strict). There is no backend, no database, and no API routes. The single route (`app/page.tsx`) renders one big client component, `components/VocabularyApp.tsx`, which owns all view state (a `view` enum: home / list / flashcards / quiz / score) and orchestrates every child. The `@/*` path alias maps to the repo root.

All persistence is **browser localStorage**, under these keys:
- `worddeck.v1.lists` — local lists in full plus compact progress overlays for touched builtin lists
- `ajwords.v1.ui` — last-selected list id (also mirrored to the `?list=` URL param)
- `ajwords.v1.flashcards` — per-list flashcard resume index
- `ajwords.v1.quizSessions` — in-progress quiz sessions (resume after reload)

### Data layer (the important part)

`lib/vocabulary-storage.ts` is a pure, framework-free module holding the data model, all normalization, and all progress math. `lib/useVocabularyStore.ts` wraps it in a React hook that hydrates from localStorage on mount and autosaves on every change. **Put data logic in the storage module and expose it through the hook** — components never touch localStorage directly (except the flashcard-position and UI-state helpers inside `VocabularyApp.tsx`).

Types live in `types/vocabulary.ts`. A `WordList` has `items: VocabularyItem[]` plus `testHistory`. Status is one of `new | learning | mastered`.

Two small modules the storage module depends on:
- `lib/quiz-modes.ts` — the **single source of truth** for `QuizMode` (`QUIZ_MODES` array + `isQuizMode`/`normalizeQuizMode` guards). `types/vocabulary.ts` merely re-exports the type. Adding or removing a mode starts here, then `QuizRunner.tsx`, then the docs.
- `lib/vocabulary-persistence.ts` — `createPersistedLists`, the **write side** of the builtin-list model and the mirror of `mergeBuiltinListWithLocalState`. Local lists are stored whole; builtin lists are diffed against their canonical baseline and stored as a compact overlay of only the items whose progress actually changed (dropped entirely when nothing changed). It's generic over the list type and takes `isPublicListId`/`getBuiltinList` as arguments, so it stays free of imports from the storage module.

### Builtin ("public") lists vs. local lists — copy-on-write

This is the central non-obvious concept. `lib/builtin-vocabulary-data.json` ships 19 pre-seeded lists (Darija + Hebrew Quizlet units), compiled into typed `WordList`s by `lib/builtin-vocabulary.ts`. These are treated as **shared/read-only**:

- `isPublicListId` / `isBuiltinListId` gate behavior anywhere a list could be mutated.
- A public list **cannot be deleted**, and any edit to it (rename, add/edit/delete a word) does **not** mutate it. Instead the store calls `createLocalCopy` to fork a brand-new local list (fresh id, title suffixed "(local copy)") and switches the user to it. Every mutator in `useVocabularyStore.ts` returns `{ copied: boolean, listId }` so the UI can react to the fork.
- On load, `mergeBuiltinListWithLocalState` re-applies the user's stored per-item progress onto the canonical builtin definitions — so word content always comes from the JSON, but attempts/streaks/status survive. Non-public lists load verbatim.

When you change the data model, update **both** the runtime path (`vocabulary-storage.ts` `normalize*`) and the build-time path (`lib/builtin-vocabulary.ts` and `scripts/import-phone-export.mjs`), which independently parse/validate the same shapes.

### Progress & status derivation

Mastery is driven by a **Leitner box** (`lib/srs.ts`) for status, and **FSRS** (`lib/fsrs.ts`) for scheduling. Each `VocabularyItem` carries `box` + `dueAt` (+ optional `stability`/`difficulty`). The two mutators `applyAttemptsToItems` (quiz) and `applyFlashcardAssessmentToItems` (swipe) advance `box` via `scheduleNext` **and** compute the next FSRS state to set `dueAt` — **`box` still owns status, FSRS owns `dueAt`** (see the ADR in `docs/ARCHITECTURE.md` §7). `status` is **always derived, never trusted** — `deriveStatusFromBox` returns `new` (no attempts), `mastered` (`box >= MASTERED_BOX`), else `learning`. Legacy items are migrated in `normalizeItem` (`inferSrsFromLegacy` for box; FSRS state inferred from box, **never touching an existing `dueAt`**). Test results are also appended to `list.testHistory` (capped at 30 entries). **Adding a card field?** Extend `lib/item-content.ts` (it fans out to five parse sites automatically) **and** the two hand-written mirrors — `useVocabularyStore.updateWord` (re-assigns each field explicitly, so a missed one is silently dropped on every edit) and `scripts/import-phone-export.mjs`.

### Quiz engine (`components/QuizRunner.tsx`)

Modes: `written | choice | mixed | test | full-review`. Question selection is **spaced-repetition-aware**: `getSessionItems` prioritizes items that are **due** (`isDue` against `dueAt`), which re-includes mastered-but-due cards; it falls back to non-mastered then all so a session is never empty, ordered most-overdue-first with `getAdaptivePriority` as a tiebreak. `full-review` shuffles everything and, like every mode, writes results back to the SRS (decision and rationale in `docs/ARCHITECTURE.md`). Multiple-choice requires ≥4 items (`canUseChoice`), else falls back to written. Written answers go through `lib/answer-matching.ts` (diacritic folding, comma/slash-separated alternatives, optional parentheticals, small-typo tolerance with a visible "correct — small typo" verdict and a character diff on miss); choice answers are exact. In-progress sessions persist via `lib/quiz-session-storage.ts`, and `recordQuizProgress` is applied per finalized attempt.

### Flashcards (`components/FlashcardMode.tsx`)

Pointer-event swipe deck: swipe right = "mastered", left = "learning" (thresholds at top of file). Resume index is persisted per-list and restored on entry.

### Import / export

Two unrelated import paths — don't confuse them:
- **In-app export/import** (`VocabularyApp.tsx` + `parseExportPayload`/`createExportPayload`): JSON tagged `app: "aj-words", version: 1`. Import validates that tag and forces a local copy of any public-list id.
- **Quizlet paste** (`lib/vocabulary-import.ts`): parses tab-separated `word\ttranslation` lines.
- **CLI seed regeneration** (`scripts/import-phone-export.mjs`, via `npm run import:phone`): takes an in-app export and rewrites `lib/builtin-vocabulary-data.json`. This is how the bundled lists are updated.

## PWA & the dev service-worker gotcha

`app/manifest.ts` is a Next metadata route serving `/manifest.webmanifest`; `public/sw.js` is the service worker (cache-first for manifest/icons, stale-while-revalidate for `/_next/static/*`, network-first for navigations, cache name `aj-words-v*`).

**The service worker only registers in production over HTTPS or LAN hosts.** In development the opposite happens — *two* mechanisms actively unregister any SW and delete `aj-words*` caches: an effect in `VocabularyApp.tsx` and an inline script in `app/layout.tsx`. This intentionally prevents a stale SW from breaking the dev preview, so:
- Any caching/offline change must be verified with `npm run build` + `npm run start`, not `npm run dev`.
- If you bump cache behavior, bump `CACHE_NAME` in `public/sw.js`.

## Horizon 3 modules (differentiators)

- `lib/fsrs.ts` — FSRS-5 scheduler (pure). Drives `dueAt` only; `box` stays the mastery scale. See the ADR in `docs/ARCHITECTURE.md` §7.
- `lib/activity-log.ts` + `lib/daily-goal.ts` — global daily-review journal (`ajwords.v1.activityLog`) and opt-in goal (`ajwords.v1.dailyGoal`), same pattern as `lib/quiz-preferences.ts`. Fed from `VocabularyApp` callbacks (quiz attempt + flashcard swipe log +1; undo logs −1). **No streak is stored** — it is recomputed with forgiveness in `lib/stats.ts` (`activityStreak`/`activityHeatmap`). `components/ActivityHeatmap.tsx` renders it, in the **library panel** so it shows on the desktop sidebar and the mobile home.
- `lib/image-store.ts` — IndexedDB blob store (`ajwords.images`) for card images. **Only images go to IndexedDB; lists stay in localStorage.** `lib/image-compress.ts` downscales uploads; `lib/useItemImage.ts`/`components/ItemImage.tsx` resolve `imageId`→object URL (or render `imageUrl`). **Never put image binary in the export/backup JSON** — `createExportPayload` strips `imageId` (backups cap at 1.5 MB; a data-URI would blow the quota). Orphan blobs are GC'd on load in `VocabularyApp`.
- `lib/share-link.ts` — client-only list sharing: a compressed (`CompressionStream`, `deflate-raw`) export payload in the URL **fragment** (`#share=…`, never the query string). `VocabularyApp` decodes a `#share=` fragment on load and opens a confirm-to-import modal, then strips the fragment.

## Other notes

- `components/AJWordsScene.tsx` is the welcome-screen CSS visual. Keep it dependency-light and honor `prefers-reduced-motion`.
- `components/ui.tsx` holds the shared design-system primitives (`Button`, `IconButton`, `Modal`, `TextField`, and the `cx` class-name helper) — reuse these rather than hand-rolling buttons/inputs. `Modal` **portals to `document.body`**, so it renders above any local stacking context (e.g. opened from the heatmap deep in the library panel).
- `next.config.ts` defines `allowedDevOrigins` (private-network ranges for phone testing), security headers, and explicit no-cache headers for `/sw.js`.
- `package.json` has a PostCSS override because Next pins a vulnerable transitive version; verify `npm audit` when touching framework dependencies.
- `eslint.config.mjs` disables `react-hooks/set-state-in-effect` — the store's hydration pattern depends on setting state inside effects.
- Bundled list content includes Hebrew (RTL) and Darija; preserve the original strings when editing the data files.
- The working tree accumulates **cloud-sync conflict copies** named `<name> 2.ts` / `CLAUDE 2.md` (iCloud/Dropbox duplicates). They are stale snapshots, not real modules: `tsconfig.json` excludes `**/* 2.ts`, eslint ignores them, and the `lib/*.test.ts` test glob doesn't match them. Never edit one and never treat one as the source of truth — delete them instead. If you find a symbol only in a `* 2.ts` file, it was removed from the real one on purpose.
