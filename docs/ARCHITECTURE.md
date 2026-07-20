# Architecture

A deep dive into how AJ Words is structured: the data model, where state lives, the
non-obvious flows (builtin lists, copy-on-write, progress merging), the quiz engine,
and the PWA layer. For a quick start and feature overview see the
[README](../README.md); for contributor/agent conventions see [CLAUDE.md](../CLAUDE.md).

## Contents

1. [Overview and principles](#1-overview-and-principles)
2. [Layered architecture](#2-layered-architecture)
3. [Data model](#3-data-model)
4. [State and persistence](#4-state-and-persistence)
5. [Builtin lists and copy-on-write](#5-builtin-lists-and-copy-on-write)
6. [List load and progress merge](#6-list-load-and-progress-merge)
7. [Progress and mastery](#7-progress-and-mastery)
8. [Quiz engine](#8-quiz-engine)
9. [Flashcards](#9-flashcards)
10. [Import and export](#10-import-and-export)
11. [PWA and service worker](#11-pwa-and-service-worker)
12. [Component map](#12-component-map)
13. [Configuration notes](#13-configuration-notes)
14. [Testing](#14-testing)

---

## 1. Overview and principles

AJ Words is a **fully client-side** vocabulary-learning PWA built on Next.js 16 (App
Router), React 19, and TypeScript (strict). There is **no backend, no database, and no
API routes** — every byte of user data lives in the browser's `localStorage`.

The whole app is one route. [`app/page.tsx`](../app/page.tsx) renders a single client
component, [`components/VocabularyApp.tsx`](../components/VocabularyApp.tsx), which owns
all view state via a `view` enum (`home` · `list` · `flashcards` · `quiz` · `score`) and
orchestrates every child component. The `@/*` import alias maps to the repo root
(`tsconfig.json`).

Guiding constraints:

- **Data logic is centralized and pure.** All normalization and progress math lives in
  [`lib/vocabulary-storage.ts`](../lib/vocabulary-storage.ts), a framework-free module.
  Components never read or write `localStorage` directly for vocabulary data — they go
  through the [`useVocabularyStore`](../lib/useVocabularyStore.ts) hook.
- **Status is derived, never trusted.** A word's `new`/`learning`/`mastered` status is
  always recomputed from its counters; stored status is only an output.
- **Bundled lists are shared and read-only**, with copy-on-write on first edit (see
  [§5](#5-builtin-lists-and-copy-on-write)).

## 2. Layered architecture

```mermaid
flowchart TD
  P["app/page.tsx"] --> VA["VocabularyApp.tsx"]
  VA --> Views["ListDetail / FlashcardMode / QuizRunner / ScoreScreen"]
  VA --> Hook["useVocabularyStore.ts"]
  Hook --> Lib["vocabulary-storage.ts (pure logic)"]
  Lib --> LS[("localStorage")]
  Lib --> Builtin["builtin-vocabulary.ts + .json"]
```

- **UI layer** — `VocabularyApp` plus the view/modal components in `components/`.
- **Store layer** — `useVocabularyStore` holds the React state, hydrates on mount, and
  autosaves on change. It exposes intent-level mutators (`addWord`, `updateList`,
  `recordQuizProgress`, …) and never leaks `localStorage` details upward.
- **Storage layer** — `vocabulary-storage.ts` is pure functions over plain objects:
  load/save, normalization, progress math, export/import payloads.
- **Seed data** — `builtin-vocabulary.ts` compiles the bundled
  `builtin-vocabulary-data.json` into typed `WordList`s.

## 3. Data model

All types are defined in [`types/vocabulary.ts`](../types/vocabulary.ts).

| Type | Key fields | Notes |
| --- | --- | --- |
| `WordList` | `id`, `title`, `language?`, `items[]`, `testHistory[]`, `createdAt`, `updatedAt` | Top-level container. |
| `VocabularyItem` | `id`, `word`, `translation`, `status`, `attempts`, `correctCount`, `wrongCount`, `correctStreak`, `wrongStreak`, `lastTestedAt?`, `lastWrongAt?`, `box`, `dueAt`, `createdAt`, `updatedAt` | `status` is `new \| learning \| mastered`, always derived from `box`. `box`/`dueAt` drive spaced repetition (see [§7](#7-progress-and-mastery)). |
| `TestHistoryEntry` | `id`, `mode`, `attempts[]`, `correctCount`, `total`, `score`, `createdAt` | One completed quiz; `score` is a 0–100 percentage. |
| `QuizAttempt` | `itemId`, `questionType`, `prompt`, `correctAnswer`, `userAnswer`, `isCorrect`, `options?` | `questionType` is `written \| choice`; `options` only for choice. |
| `ListProgress` | `total`, `mastered`, `learning`, `fresh` | **Derived** (via `getProgress`), never stored. |

`QuizMode` is `written | choice | mixed | test | full-review`.

### LocalStorage keys

| Key | Shape | Written by |
| --- | --- | --- |
| `worddeck.v1.lists` | `WordList[]` — local lists in full, plus compact progress overlays for touched builtin lists | `saveLists` (via the store) |
| `ajwords.v1.ui` | `{ selectedListId }` — last opened list (also mirrored to the `?list=` URL param) | `VocabularyApp` |
| `ajwords.v1.flashcards` | `{ [listId]: { nextIndex, updatedAt } }` — per-list flashcard resume position | `VocabularyApp` |
| `ajwords.v1.quizSessions` | `{ [listId:mode]: QuizSessionState }` — in-progress quiz, resumed after reload | `lib/quiz-session-storage.ts` |

## 4. State and persistence

[`useVocabularyStore`](../lib/useVocabularyStore.ts) is the single source of truth for
list data:

- **Hydrate on mount** — an effect calls `loadLists()` once and sets `hydrated`.
- **Autosave on change** — a second effect calls `saveLists(lists)` whenever `lists`
  changes (guarded by `hydrated` so the initial empty state doesn't clobber storage).
  Public lists are compacted before persistence: untouched bundled lists are omitted,
  and touched bundled lists store only per-item progress overlays plus test history.
- **Intent-level mutators** — `addList`, `updateList`, `deleteList`, `addWord`,
  `updateWord`, `deleteWord`, `recordQuizProgress`, `recordFlashcardProgress`,
  `addTestHistory`, `importLists`. The mutators that can touch a builtin list return
  `{ copied: boolean, listId }` so the UI can react to a copy-on-write fork.

`VocabularyApp` keeps the remaining **UI** state (current view, selected list, modal
state, in-flight quiz attempts) and manages the two UI-only `localStorage` keys directly
through small helpers (`readPreferredListId`/`writePreferredListId`,
`readFlashcardPosition`/`writeFlashcardPosition`).

## 5. Builtin lists and copy-on-write

This is the central non-obvious concept. The app ships 19 pre-seeded lists (Darija +
Hebrew Quizlet units) in
[`lib/builtin-vocabulary-data.json`](../lib/builtin-vocabulary-data.json), compiled into
typed `WordList`s by [`lib/builtin-vocabulary.ts`](../lib/builtin-vocabulary.ts). These
are treated as **shared / read-only**:

- `isPublicListId` (= `isBuiltinListId`) gates every place a list could be mutated.
- A builtin list **cannot be deleted**, and any edit to it (rename, add/edit/delete a
  word) does **not** mutate it. Instead the store calls `createLocalCopy` to fork a
  brand-new local list — fresh `id`, title suffixed `" (local copy)"` — and switches the
  user to it.
- Every affected mutator returns `{ copied, listId }`; when `copied` is `true`,
  `VocabularyApp` selects the new list and shows a "Created a local copy…" notice.

```mermaid
flowchart TD
  E["User edits a public list"] --> C{"isPublicListId?"}
  C -- no --> M["mutate in place + touchList"] --> R1["return copied: false"]
  C -- yes --> F["createLocalCopy: new id + '(local copy)' title"]
  F --> P["prepend new list to state"]
  P --> R2["return copied: true + new listId"]
  R2 --> N["UI: show notice + select copy"]
```

The same rule applies on **import**: an incoming list whose `id` matches a builtin id is
turned into a local copy rather than overwriting the shared definition (see
[§10](#10-import-and-export)).

## 6. List load and progress merge

Word **content** for builtin lists always comes from the bundled JSON, but a user's
**progress** on those words must survive reloads. `loadLists` reconciles the two:

```mermaid
flowchart TD
  S[("localStorage: worddeck.v1.lists")] --> PA["parse + normalize"]
  B["builtin lists (from JSON)"] --> MAP{"for each builtin id"}
  PA --> MAP
  MAP -- "stored exists" --> MG["mergeBuiltinListWithLocalState: JSON words + stored progress"]
  MAP -- "no stored" --> KEEP["use builtin as-is"]
  PA --> LOC["local-only lists pass through"]
  MG --> OUT["combined lists"]
  KEEP --> OUT
  LOC --> OUT
```

- `mergeBuiltinListWithLocalState` rebuilds each builtin list from its canonical JSON
  items, then overlays the stored per-item counters/status/timestamps where the item id
  matches. Words added or removed in the JSON therefore win; the user's stats follow
  along by id.
- Local (non-public) lists are returned verbatim.
- The result is `[...publicLists, ...localLists]`.

> **Maintenance note:** the runtime path (`vocabulary-storage.ts` `normalize*`) and the
> two build-time paths ([`builtin-vocabulary.ts`](../lib/builtin-vocabulary.ts) and the
> CLI [`scripts/import-phone-export.mjs`](../scripts/import-phone-export.mjs))
> independently parse and validate the same shapes. Change one and you almost certainly
> need to change the others.

## 7. Progress and mastery

Mastery is driven by a **Leitner spaced-repetition engine**
([`lib/srs.ts`](../lib/srs.ts)). Each `VocabularyItem` carries a `box` (0…`MAX_BOX`) and a
`dueAt` date. `scheduleNext` promotes a card one box on a correct answer — each box has a
longer interval (`LEITNER_INTERVALS`, in days) — and demotes it one box, due immediately,
on a miss.

| Box             | 0 | 1 | 2 | 3 | 4  | 5  | 6  | 7   |
| --------------- | - | - | - | - | -- | -- | -- | --- |
| Interval (days) | 0 | 1 | 3 | 7 | 16 | 35 | 75 | 150 |

Boxes 6–7 exist purely to keep spacing out mature cards — the mastery threshold is
unchanged at `MASTERED_BOX` (box ≥ 5), so they don't affect status, only how often a
long-mastered word comes back for review (instead of every 35 days forever).

`status` is **always derived** from the box by `deriveStatusFromBox`, never read from input:

- `attempts <= 0` → `new`
- `box >= MASTERED_BOX (5)` → `mastered`
- otherwise → `learning`

```mermaid
stateDiagram-v2
  [*] --> new
  new --> learning: first attempt (box 0 to 1)
  learning --> mastered: reach box 5 (5 correct in a row)
  mastered --> learning: wrong answer (box down one)
  learning --> learning: wrong answer (box down one)
```

Two functions apply outcomes (counters **and** the Leitner schedule), then re-derive status:

- **`applyAttemptsToItems`** — folds `QuizAttempt`s onto the matching items; called per
  finalized attempt during a quiz.
- **`applyFlashcardAssessmentToItems`** — applies a single swipe: `mastered` counts as a
  correct answer (promote one box), `learning` as a miss (demote one box).

> **`full-review` writes to the SRS like every other mode — by design.** A miss during a
> full review is genuine evidence of forgetting, so hiding it from the scheduler would let
> the schedule drift from reality (the same reasoning behind Anki's filtered decks
> rescheduling by default). A "casual review (no SRS impact)" toggle was considered and
> deferred.

Items saved before the SRS engine are migrated on load in `normalizeItem` via
`inferSrsFromLegacy` (box derived from the old streak counters, `dueAt` set to now so
nothing stays hidden).

Completed quizzes are also appended to `list.testHistory`, **capped at the 30 most recent
entries** (`addTestHistory` slices to 30).

## 8. Quiz engine

[`components/QuizRunner.tsx`](../components/QuizRunner.tsx) builds a session up front with
`buildQuestions(list, mode)`:

```mermaid
flowchart TD
  I["list.items"] --> Q{"mode == full-review?"}
  Q -- yes --> SH["shuffle all items"]
  Q -- no --> DUE["due items first (isDue), else non-mastered, else all"]
  DUE --> SO["sort most-overdue first, getAdaptivePriority tiebreak"]
  SH --> QT["per index: getQuestionType"]
  SO --> QT
  QT --> CH{"choice and items ≥ 4?"}
  CH -- yes --> OPT["buildOptions: 1 correct + 3 distractors"]
  CH -- no --> WR["written"]
```

- **Selection (`getSessionItems`)** — `full-review` shuffles everything; all other modes
  prioritize cards that are **due** for review (`isDue` against `dueAt`), which re-includes
  mastered-but-due cards. It falls back to non-mastered, then to all, so a session is never
  empty, ordering the pool most-overdue-first with `getAdaptivePriority` as a tiebreak.
- **Question type (`getQuestionType`)** — `written` is always written; `choice` is
  multiple-choice when possible; `mixed`/`test` alternate by index. Multiple choice
  requires at least 4 items in the list (`canUseChoice`), otherwise it falls back to
  written.
- **Options (`buildOptions`)** — the correct translation plus up to 3 unique distractors
  drawn from other items, shuffled, capped at 4.
- **Grading** — answers are compared after `normalizeAnswer` (trim, lowercase, collapse
  internal whitespace).

Progress is recorded **per finalized attempt** (`onAttemptFinalized` →
`recordQuizProgress`), and an in-progress session is persisted via
[`lib/quiz-session-storage.ts`](../lib/quiz-session-storage.ts) so a quiz survives a
reload. On finish, `VocabularyApp` clears the saved session, calls `addTestHistory` (logs
the attempt), then shows [`ScoreScreen`](../components/ScoreScreen.tsx) — score ring,
"frequent errors / still learning / mastered now" insights, correct/mistake lists, a full
per-question review, and a words-to-review list.

## 9. Flashcards

[`components/FlashcardMode.tsx`](../components/FlashcardMode.tsx) is a pointer-driven
swipe deck:

- **Swipe right → `mastered`, swipe left → `learning`** (threshold `SWIPE_THRESHOLD`),
  with the same outcomes available as buttons. Tapping flips the card.
- Each assessment calls back into `recordFlashcardProgress`.
- The **resume index** is persisted per list under `ajwords.v1.flashcards` and restored
  when the mode is entered, so a long deck can be studied across sessions.
- Honors `prefers-reduced-motion` (skips the exit animation delay).

## 10. Import and export

There are **three distinct** data paths — don't conflate them:

1. **In-app JSON export/import** — `createExportPayload` writes a file tagged
   `app: "aj-words", version: 1`; `parseExportPayload` validates that tag/version on
   import and normalizes every list. Importing an id that matches a builtin list forces a
   local copy. Driven from the Export/Import buttons in `VocabularyApp`.
2. **Quizlet paste** — [`lib/vocabulary-import.ts`](../lib/vocabulary-import.ts) parses
   tab-separated `word⇥translation` lines (used when creating/editing a list).
3. **CLI seed regeneration** — `npm run import:phone -- <export.json>` runs
   [`scripts/import-phone-export.mjs`](../scripts/import-phone-export.mjs), which takes an
   in-app export and rewrites `lib/builtin-vocabulary-data.json`. This is how the bundled
   starter lists are refreshed from a real device.

## 11. PWA and service worker

- [`app/manifest.ts`](../app/manifest.ts) is a Next metadata route served at
  `/manifest.webmanifest` (name, icons, standalone display, theme colors).
- [`public/sw.js`](../public/sw.js) is the service worker (cache name `aj-words-v4`).
  Strategies by request:
  - **navigation** → network-first, falling back to the cached `/` shell when offline;
  - **`/icons/*` and `/apple-touch-icon.png`** → stale-while-revalidate;
  - **`/manifest.webmanifest`** → cache-first;
  - **`/_next/static/*`** → stale-while-revalidate;
  - other **`/_next/*`** requests → bypassed (let Next handle dynamic internals).

> **Dev gotcha — the service worker is deliberately disabled in development.** It
> registers **only in production over HTTPS or a LAN host**. In dev, *two* mechanisms
> actively unregister any service worker and delete `aj-words*` caches: an effect in
> [`VocabularyApp.tsx`](../components/VocabularyApp.tsx) and an inline reset script in
> [`app/layout.tsx`](../app/layout.tsx). This prevents a stale worker from breaking the
> dev preview. Consequences:
> - Verify any caching/offline change with `npm run build` + `npm run start`, **not**
>   `npm run dev`.
> - When you change cached assets or strategy, **bump `CACHE_NAME`** in `public/sw.js`.

## 12. Component map

| Component | Role |
| --- | --- |
| `VocabularyApp.tsx` | Top-level orchestrator: view state machine, list selection, import/export, SW registration, UI persistence. |
| `ListLibrary.tsx` | Sidebar grid of list cards with inline progress and edit/delete actions. |
| `ListDetail.tsx` | Single-list view: words, progress summary, study launchers, test history. |
| `FlashcardMode.tsx` | Swipe flashcard deck ([§9](#9-flashcards)). |
| `QuizRunner.tsx` | Quiz engine UI and session logic ([§8](#8-quiz-engine)). |
| `ScoreScreen.tsx` | Post-quiz results, insights, and review. |
| `ListFormModal.tsx` / `WordFormModal.tsx` | Create/edit modals for lists and words. |
| `ProgressSummary.tsx` | Mastered/learning/new breakdown for a list. |
| `StatusBadge.tsx` | Small badge rendering a word's status. |
| `TestHistory.tsx` | Past test entries with a "review" action. |
| `BrandLogo.tsx` | The AJ Words mark. |
| `ui.tsx` | Design-system primitives: `Button`, `IconButton`, `Modal`, `TextField`, and the `cx` class-name helper. |
| `AJWordsScene.tsx` | Dependency-light CSS welcome visual (a floating card stack). Honors reduced-motion without WebGL. |

## 13. Configuration notes

- [`next.config.ts`](../next.config.ts) — `allowedDevOrigins` (private-network ranges so
  the dev server works when tested from a phone), security headers, and explicit
  no-cache headers for `/sw.js`.
- [`package.json`](../package.json) — contains a PostCSS override so Next's pinned
  transitive PostCSS dependency resolves to a patched `8.5.x` version.
- [`eslint.config.mjs`](../eslint.config.mjs) — extends `next` core-web-vitals +
  typescript, and disables `react-hooks/set-state-in-effect` (the store's
  hydrate-in-effect pattern relies on setting state inside effects).
- [`tsconfig.json`](../tsconfig.json) — strict mode; `@/*` path alias → repo root.
- `package.json` `dev`/`dev:host` pin the **dev server** to Webpack via `next dev
  --webpack`. Next 16 defaults to Turbopack, and `next build` still uses it — only the dev
  server is switched to Webpack.

## 14. Testing

Two independent layers:

- **Unit tests** (`npm test`) — Node's built-in runner over `lib/*.test.ts`,
  covering the pure logic modules (SRS, answer matching, cloze, persistence,
  session storage, stats, …). No framework, no DOM.
- **End-to-end tests** (`npm run e2e`) — Playwright specs in
  [`e2e/`](../e2e), configured by
  [`playwright.config.ts`](../playwright.config.ts). The config's `webServer`
  runs `npm run build && npm run start` itself, because the offline smoke test
  exercises the real service worker and the SW **only registers in
  production** ([§11](#11-pwa-and-service-worker)). Two Chromium projects run
  every spec: `desktop` (1440x1000) and `mobile` (390x844 with touch/mobile
  emulation). Each test gets a fresh browser context, so it starts from a
  clean localStorage with only the 19 bundled lists.

  Spec files: `creation` (list + word CRUD, reload persistence), `written-quiz`
  (verdicts, typo tolerance, diff, manual override, score), `choice` (option
  grid + highlighting, <4-word fallback), `direction-cloze` (reverse direction,
  cloze forcing typed input), `flashcards` (assess/undo/shuffle/progress),
  `import-export` (download round-trip, invalid-file errors), `session-reload`
  (mid-quiz resume), `offline` (SW caches serve the shell with the network cut).

  Because quiz question order is intentionally randomized, specs derive each
  expected answer from the displayed prompt via lookup maps in
  [`e2e/helpers.ts`](../e2e/helpers.ts) rather than assuming order. The `e2e/`
  directory is excluded from `tsconfig.json` and eslint; Playwright compiles
  the specs itself.
