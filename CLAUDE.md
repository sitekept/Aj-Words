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

# Regenerate the bundled seed lists from an in-app JSON export (see "Builtin lists" below):
npm run import:phone -- <aj-words-export.json> [--output <path>]
```

Pure logic has unit tests via Node's built-in runner (`node --test lib/*.test.ts`, e.g. `lib/srs.test.ts`) — no test framework or dependencies. Test files are excluded from `tsconfig`/eslint. Also verify changes via `npm run lint`, `npm run build`, and manual testing in the browser.

## Architecture

AJ Words is a **fully client-side** vocabulary-learning PWA: Next.js 16 App Router, React 19, TypeScript (strict). There is no backend, no database, and no API routes. The single route (`app/page.tsx`) renders one big client component, `components/VocabularyApp.tsx`, which owns all view state (a `view` enum: home / list / flashcards / quiz / score) and orchestrates every child. The `@/*` path alias maps to the repo root.

All persistence is **browser localStorage**, under these keys:
- `worddeck.v1.lists` — every word list and its progress
- `ajwords.v1.ui` — last-selected list id (also mirrored to the `?list=` URL param)
- `ajwords.v1.flashcards` — per-list flashcard resume index
- `ajwords.v1.quizSessions` — in-progress quiz sessions (resume after reload)

### Data layer (the important part)

`lib/vocabulary-storage.ts` is a pure, framework-free module holding the data model, all normalization, and all progress math. `lib/useVocabularyStore.ts` wraps it in a React hook that hydrates from localStorage on mount and autosaves on every change. **Put data logic in the storage module and expose it through the hook** — components never touch localStorage directly (except the flashcard-position and UI-state helpers inside `VocabularyApp.tsx`).

Types live in `types/vocabulary.ts`. A `WordList` has `items: VocabularyItem[]` plus `testHistory`. Status is one of `new | learning | mastered`.

### Builtin ("public") lists vs. local lists — copy-on-write

This is the central non-obvious concept. `lib/builtin-vocabulary-data.json` ships ~22 pre-seeded lists (Darija + Hebrew Quizlet units), compiled into typed `WordList`s by `lib/builtin-vocabulary.ts`. These are treated as **shared/read-only**:

- `isPublicListId` / `isBuiltinListId` gate behavior anywhere a list could be mutated.
- A public list **cannot be deleted**, and any edit to it (rename, add/edit/delete a word) does **not** mutate it. Instead the store calls `createLocalCopy` to fork a brand-new local list (fresh id, title suffixed "(local copy)") and switches the user to it. Every mutator in `useVocabularyStore.ts` returns `{ copied: boolean, listId }` so the UI can react to the fork.
- On load, `mergeBuiltinListWithLocalState` re-applies the user's stored per-item progress onto the canonical builtin definitions — so word content always comes from the JSON, but attempts/streaks/status survive. Non-public lists load verbatim.

When you change the data model, update **both** the runtime path (`vocabulary-storage.ts` `normalize*`) and the build-time path (`lib/builtin-vocabulary.ts` and `scripts/import-phone-export.mjs`), which independently parse/validate the same shapes.

### Progress & status derivation

Mastery is driven by a **Leitner spaced-repetition engine** (`lib/srs.ts`). Each `VocabularyItem` carries `box` + `dueAt`; `scheduleNext` promotes a card one box on a correct answer (longer interval) and demotes it one box (due now) on a miss. `status` is **always derived, never trusted** — `deriveStatusFromBox` returns `new` (no attempts), `mastered` (`box >= MASTERED_BOX`), else `learning`. The two mutators are `applyAttemptsToItems` (quiz, applied per finalized attempt) and `applyFlashcardAssessmentToItems` (a single swipe — `mastered` promotes, `learning` resets). Legacy items without SRS fields are migrated in `normalizeItem` via `inferSrsFromLegacy`. Test results are also appended to `list.testHistory` (capped at 30 entries).

### Quiz engine (`components/QuizRunner.tsx`)

Modes: `written | choice | mixed | test | full-review`. Question selection is **spaced-repetition-aware**: `getSessionItems` prioritizes items that are **due** (`isDue` against `dueAt`), which re-includes mastered-but-due cards; it falls back to non-mastered then all so a session is never empty, ordered most-overdue-first with `getAdaptivePriority` as a tiebreak. `full-review` shuffles everything. Multiple-choice requires ≥4 items (`canUseChoice`), else falls back to written. Answers are matched after normalization (trim / lowercase / collapse whitespace). In-progress sessions persist via `lib/quiz-session-storage.ts`, and `recordQuizProgress` is applied per finalized attempt.

### Flashcards (`components/FlashcardMode.tsx`)

Pointer-event swipe deck: swipe right = "mastered", left = "learning" (thresholds at top of file). Resume index is persisted per-list and restored on entry.

### Import / export

Two unrelated import paths — don't confuse them:
- **In-app export/import** (`VocabularyApp.tsx` + `parseExportPayload`/`createExportPayload`): JSON tagged `app: "aj-words", version: 1`. Import validates that tag and forces a local copy of any public-list id.
- **Quizlet paste** (`lib/vocabulary-import.ts`): parses tab-separated `word\ttranslation` lines.
- **CLI seed regeneration** (`scripts/import-phone-export.mjs`, via `npm run import:phone`): takes an in-app export and rewrites `lib/builtin-vocabulary-data.json`. This is how the bundled lists are updated.

## PWA & the dev service-worker gotcha

`app/manifest.ts` is a Next metadata route serving `/manifest.webmanifest`; `public/sw.js` is the service worker (cache-first for the app shell/icons, network-first for navigations, cache name `aj-words-v*`).

**The service worker only registers in production over HTTPS or LAN hosts.** In development the opposite happens — *two* mechanisms actively unregister any SW and delete `aj-words*` caches: an effect in `VocabularyApp.tsx` and an inline script in `app/layout.tsx`. This intentionally prevents a stale SW from breaking the dev preview, so:
- Any caching/offline change must be verified with `npm run build` + `npm run start`, not `npm run dev`.
- If you bump cache behavior, bump `CACHE_NAME` in `public/sw.js`.

## Other notes

- `components/AJWordsScene.tsx` (three.js / @react-three/fiber) is the welcome-screen 3D visual, dynamically imported with `ssr: false`.
- `components/ui.tsx` holds the shared design-system primitives (`Button`, `IconButton`, `Modal`, `TextField`, and the `cx` class-name helper) — reuse these rather than hand-rolling buttons/inputs.
- `next.config.ts` defines `allowedDevOrigins` (private-network ranges for phone testing), security headers, and explicit no-cache headers for `/sw.js`.
- `eslint.config.mjs` disables `react-hooks/set-state-in-effect` — the store's hydration pattern depends on setting state inside effects.
- Bundled list content includes Hebrew (RTL) and Darija; preserve the original strings when editing the data files.
