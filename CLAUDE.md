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

npm run build:curated # Production build with the curated library locked (NEXT_PUBLIC_CURATED_LIBRARY=1)

# Regenerate the bundled lists from an in-app JSON export (see "Builtin lists" below):
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

- `npm run e2e` is **two sequential passes** —
  `playwright test && E2E_CURATED=1 playwright test` — because the app ships in
  two shapes (see **App mode** below) and both builds write to `.next`:
  - default — the authoring build; every spec except `curated-library.spec.ts`.
  - `E2E_CURATED=1` — `npm run build:curated`, what beta testers get;
    `curated-library.spec.ts` only.
  The config builds and serves production itself on port 3000 both times, so
  nothing may be listening there. It must be the **production** server: the SW
  only registers in production, and dev actively unregisters it (see the PWA
  section below). `reuseExistingServer` is **false**, deliberately: the two
  passes serve different builds on the same port, so reusing a leftover server
  silently tests the wrong one — that has already cost one bogus failure.
- Run it before merging anything that touches components, the quiz engine,
  persistence, or `public/sw.js`. Each pass runs two projects: `desktop`
  (1440x1000) and `mobile` (390x844, touch) in the default pass — below 760px
  the library panel and detail panel swap instead of sitting side by side, and
  below 520px the topbar actions lose their labels — and `curated` /
  `curated-mobile` in the `E2E_CURATED=1` pass.
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

AJ Words is a **fully client-side** vocabulary-learning PWA: Next.js 16 App Router, React 19, TypeScript (strict). There are no API routes and no server data logic; an **optional, opt-in** Supabase cloud-sync layer is the only backend, and it is dormant unless env vars are set (see "Cloud sync" below). The single route (`app/page.tsx`) renders one big client component, `components/VocabularyApp.tsx`, which owns all view state (a `view` enum: home / list / flashcards / quiz / score) and orchestrates every child. The `@/*` path alias maps to the repo root.

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

`lib/builtin-vocabulary-data.json` is the **curated library**: the lists every install receives, compiled into typed `WordList`s by `lib/builtin-vocabulary.ts`. In a `NEXT_PUBLIC_CURATED_LIBRARY=1` build (see **App mode** below) they are the only lists that can exist.

The data file supports two shapes, and the difference matters:

- **`terms`** → `makeItems`, which hard-codes fresh cards (`status: "new"`, `box: 0`, no attempts). **Always use this.**
- **`items`** → `makeSnapshotItems`, which preserves whatever progress the JSON carries. This is how 19 lists once shipped with their owner's real study history for every tester to inherit. `lib/builtin-vocabulary.test.ts` fails if this shape appears in the bundle.

`seedLists` in `lib/vocabulary-storage.ts` seeds the deletable demo list (`lib/demo-list.ts`) **only when the bundle is empty** — a bundled list needs no seeding, and in a curated build the demo could not be deleted anyway.

Editing the bundle has two standing rules, both test-guarded: a **new** list needs a **new** id (retired ids are tombstoned on load), and a list must be added to `RETIRED_BUILTIN_IDS` **before** being removed. See **Retired builtin lists** below, and `README.md#curating-the-bundled-lists` for the authoring loop.

Builtin lists are treated as **shared/read-only**:

- `isPublicListId` / `isBuiltinListId` gate behavior anywhere a list could be mutated.
- A public list **cannot be deleted**, and any edit to it (rename, add/edit/delete a word) does **not** mutate it. Instead the store calls `createLocalCopy` to fork a brand-new local list (fresh id, title suffixed "(local copy)") and switches the user to it. Every mutator in `useVocabularyStore.ts` returns `{ copied: boolean, listId }` so the UI can react to the fork.
- On load, `mergeBuiltinListWithLocalState` re-applies the user's stored per-item progress onto the canonical builtin definitions — so word content always comes from the JSON, but attempts/streaks/status survive. Non-public lists load verbatim.

When you change the data model, update **both** the runtime path (`vocabulary-storage.ts` `normalize*`) and the build-time path (`lib/builtin-vocabulary.ts` and `scripts/import-phone-export.mjs`), which independently parse/validate the same shapes.

### Retired builtin lists (`lib/retired-lists.ts`)

A builtin list is never stored whole: `createPublicListOverlay` writes a compact **progress overlay** holding only the items whose progress changed, and only their `id` + progress fields — no `word`, no `translation`. Re-inflating that overlay depends on the canonical builtin still existing. Drop the builtins and `isPublicListId` goes permanently false, so those overlays fall through the "local lists" filter in `mergeStoredLists` and resurface as **real, editable lists of blank cards**, which `saveLists` then rewrites in full.

`isRetiredBuiltinList` drops them on load, inside `mergeStoredLists` — the single funnel used by both `loadLists` and `loadListsFromBackup` (the rotating backups hold the lists in full, so they are a second resurrection path). It matches on two things:

- `RETIRED_BUILTIN_IDS`, a **permanent tombstone list** of all 22 ids ever bundled (19 plus 3 duplicate Darija lists shipped in `d207199` and dropped in `77298ec`). **Never remove an entry**, and append to it before removing any list from the bundle.
- A shape check: a list whose every card has neither a word nor a translation. This catches overlays whose ids were never enumerated. `items.length > 0` is required, or a list the user just created and has not filled in would be eaten too.

**`isRetiredBuiltinList` takes an `isLiveBuiltin` predicate, and it is not optional.** The overlay of a list that *still ships* has exactly the same textless shape as an orphaned one, so the shape check alone deleted every user's progress on every bundled list, on every load, silently — it only stopped mattering while the bundle was empty. `mergeStoredLists` passes `isPublicListId`; the tombstone still wins, because data stored under a reused id belongs to the old list. Covered by `lib/retired-lists.test.ts` and end to end by `e2e/curated-library.spec.ts`.

Consequence to keep in mind: a list imported from an export taken *before* the removal carries a retired id with real content. `importLists` in `useVocabularyStore.ts` therefore re-ids those on the way in (keeping the title — there is no original to tell it apart from), or the tombstone filter would delete them on the next reload.

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
- **CLI seed regeneration** (`scripts/import-phone-export.mjs`, via `npm run import:phone`): takes an in-app export and rewrites `lib/builtin-vocabulary-data.json`. It emits the content-only `terms` shape and drops progress and `testHistory` by omission rather than by a delete list, so a newly added progress field cannot leak in by being forgotten; it prints a line when it drops something. The export deliberately **includes** builtin lists, so regenerating from one keeps the lists already bundled instead of wiping them.

## App mode (`lib/app-mode.ts`)

`CURATED_LIBRARY` / `canEditLibrary`, from `NEXT_PUBLIC_CURATED_LIBRARY` (inlined by Next at build time). Absent ⇒ **authoring**: the full app, and what `npm run dev`, `npm test` and 15 of the 16 spec files use. `=1` ⇒ **curated library**: the bundled lists are the only lists.

`VocabularyApp` reads the constant once and threads a `canEdit` prop into `ListLibrary` and `ListDetail`, so those components stay pure. What it hides: the topbar's « Nouvelle liste » / « Exporter » / « Importer » (and the hidden file input), per-list edit/delete, per-word edit/delete, « Ajouter un mot », « Modifier/Supprimer la liste », « Partager la liste », the welcome panel's « Créer une liste », and **the `#share=` fragment effect** — the one inbound path that is not a button, so gating buttons alone would leave it open. Both empty states lose their call to action, and so does the welcome copy (plus `APP_DESCRIPTION` in `app/layout.tsx`, which is the page description and the share card's subtitle).

**Two labels, one action — and that is how the first leak shipped.** The welcome panel's creation button says « Créer une liste », not « Nouvelle liste ». Gating the topbar and asserting only on its label let the welcome CTA reach production live in `7dc8d70`; the panel is `display:none` below 760px, so the `curated-mobile` project could not see it either. When you add a path that touches list content, search for the **action**, not for a label you remember.

**Cloud sync is gated on the mode too** — `lib/useCloudSync.ts` does `isCloudEnabled() && canEditLibrary`. A pull adds lists, so sync is an inbound content path like any other, and leaving it to the deployment's env vars is not enough: this project shipped a beta with `NEXT_PUBLIC_SUPABASE_*` set by accident, which gave every tester an anonymous identity and uploaded their lists.

Deliberately kept: « Réinitialiser la progression » (progress, not content) and every study mode. The rescue download in `app/error.tsx` stays as well, but it is relabelled: with no Import action to restore it, it is offered as a diagnostic to attach to a report rather than as a recovery. The storage-full messages in `lib/vocabulary-storage.ts` drop their "exportez vos listes" advice for the same reason — pointing at a button that is not there is the hollow offer that code was written to fix.

Two reasons it is a flag and not a deletion: the maintainer needs the editing UI to author the bundled lists, and 12 of the spec files build their fixtures through « Nouvelle liste ». It is also **not a permission** — client-side app, no server, no accounts: it closes the path, not the door.

## PWA & the dev service-worker gotcha

`app/manifest.ts` is a Next metadata route serving `/manifest.webmanifest`; `public/sw.js` is the service worker (cache-first for manifest/icons, stale-while-revalidate for `/_next/static/*`, network-first for navigations, cache name `aj-words-v*`).

**The service worker only registers in production over HTTPS or LAN hosts.** In development the opposite happens — *two* mechanisms actively unregister any SW and delete `aj-words*` caches: an effect in `VocabularyApp.tsx` and an inline script in `app/layout.tsx`. This intentionally prevents a stale SW from breaking the dev preview, so:
- Any caching/offline change must be verified with `npm run build` + `npm run start`, not `npm run dev`.
- If you bump cache behavior, bump `CACHE_NAME` in `public/sw.js`.

## Horizon 3 modules (differentiators)

- `lib/fsrs.ts` — FSRS-5 scheduler (pure). Drives `dueAt` only; `box` stays the mastery scale. See the ADR in `docs/ARCHITECTURE.md` §7.
- `lib/activity-log.ts` + `lib/daily-goal.ts` — global daily-review journal (`ajwords.v1.activityLog`) and opt-in goal (`ajwords.v1.dailyGoal`), same pattern as `lib/quiz-preferences.ts`. Fed from `VocabularyApp` callbacks (quiz attempt + flashcard swipe log +1; undo logs −1). **No streak is stored** — it is recomputed with forgiveness in `lib/stats.ts` (`activityStreak`/`activityHeatmap`). `components/ActivityHeatmap.tsx` renders it, in the **library panel** so it shows on the desktop sidebar and the mobile home.
- `lib/share-link.ts` — client-only list sharing: a compressed (`CompressionStream`, `deflate-raw`) export payload in the URL **fragment** (`#share=…`, never the query string). `VocabularyApp` decodes a `#share=` fragment on load and opens a confirm-to-import modal, then strips the fragment.

## Cloud sync (optional, opt-in)

Off by default. `lib/supabase-client.ts` `isCloudEnabled()` gates the whole feature on `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`; absent them, every sync call is a no-op, the **Sync** button is hidden, and `npm test`/`npm run e2e`/offline all behave exactly as the local-only app. Setup lives in `supabase/schema.sql` + `README.md#cloud-sync-optional`.

- **Scope is content only.** `lib/cloud-sync.ts` `toCloudList`/`itemToCloud` strip **all** progress (SRS box/dueAt/streaks/FSRS/testHistory) — only word/translation/note/example/altAnswers/tags sync. A pulled list is rebuilt with `normalizeList` (progress reset to fresh). **Builtin lists never upload** (`isPublicListId` filter); they already ship in the bundle.
- **Dedup rule** (`lib/list-dedupe.ts`, unit-tested): before upload, lists whose word|translation **pairs** are contained in a larger one (containment ≥ 0.9) collapse to the largest. Keyed on the *pair*, so the builtin "בחני מילים"/"השלמת משפטים" exercise pairs (0 identical pairs) are never merged.
- **Identity = anonymous auth + QR pairing, no login/no typed code.** `lib/device-pairing.ts` writes a short single-use code + the session into `device_pairings`; the new device opens `#pair=<code>` (mirrors the `#share=` fragment handling), redeems it via the `redeem_device_pairing` SECURITY DEFINER RPC, and adopts the session. Only the short code rides in the QR. `components/SyncDeviceModal.tsx` renders it with `qrcode-generator` (zero-dep, GIF data URL). **Trade-off:** anonymous identity has no recovery (documented in README).
- **Wiring**: `lib/useCloudSync.ts` (layered on the store, never mutating it) signs in / pairs, pulls + merges newer-or-absent lists by `updatedAt`, then debounces an **upsert-only** push (never deletes — a failed sync can't lose data). `next.config.ts` injects the Supabase origin into CSP `connect-src` at build time when the env var is set.

## Other notes

- `components/AJWordsScene.tsx` is the welcome-screen CSS visual. Keep it dependency-light and honor `prefers-reduced-motion`.
- `components/ui.tsx` holds the shared design-system primitives (`Button`, `IconButton`, `Modal`, `TextField`, and the `cx` class-name helper) — reuse these rather than hand-rolling buttons/inputs. `Modal` **portals to `document.body`**, so it renders above any local stacking context (e.g. opened from the heatmap deep in the library panel).
- `next.config.ts` defines `allowedDevOrigins` (private-network ranges for phone testing), security headers, and explicit no-cache headers for `/sw.js`. Its `script-src` adds `'unsafe-eval'` **in development only** (`NODE_ENV === "development"`): React Refresh evaluates code as a string, so without it `npm run dev` dies on an `EvalError` and never hydrates — the page just sits on the loading screen. Never let that keyword reach the production CSP; check with `curl -sI http://localhost:3000/ | grep -i content-security` after `npm run build && npm run start`.
- `package.json` has a PostCSS override because Next pins a vulnerable transitive version; verify `npm audit` when touching framework dependencies.
- `eslint.config.mjs` disables `react-hooks/set-state-in-effect` — the store's hydration pattern depends on setting state inside effects.
- **The UI is in French.** Strings are hardcoded in place — there is no i18n layer, deliberately. Translate the *values* of the label maps (`StatusBadge`, `STATUS_FILTERS`, `modeTitles`/`modeLabels`/`questionTypeLabels`) and never their keys: those are persisted `status` / `QuizMode` data and also feed CSS classes and storage keys. User-facing strings also live in `lib/vocabulary-storage.ts` (import errors, storage-full messages, `"Liste sans titre"`, the `" (copie locale)"` suffix). Dates go through `UI_LOCALE` (`lib/formatting.ts`), pinned to `fr-FR` so a device set to English does not render half the interface in English. Pluralisation uses `n <= 1`, not `n === 1`: **zero is singular in French**.
- The e2e specs select by visible French text, so any label change breaks them. `getByRole("button", { name })` matches the accessible name, which for `IconButton` comes from its `label` prop — renaming one silently breaks specs that never mention the component. Beware `title` on a `Button`: it wins the accessible-name computation, which is why the study-mode descriptions live in a `<details>` rather than in tooltips.
- `lib/app-version.ts` exposes the build identity (injected by `next.config.ts` from `package.json` + `VERCEL_GIT_COMMIT_SHA`) and `FEEDBACK_EMAIL`. The "Donner mon avis" link is a `mailto:` with the build and the browser pre-filled in the body — there is no backend to post a form to. An empty `FEEDBACK_EMAIL` hides the link rather than shipping a dead one, and the link must NOT carry `target="_blank"`: browsers hand a `mailto:` to the mail client and leave an empty tab behind.
- The working tree accumulates **cloud-sync conflict copies** named `<name> 2.ts` / `CLAUDE 2.md` (iCloud/Dropbox duplicates). They are stale snapshots, not real modules: `tsconfig.json` excludes `**/* ?.ts(x)`, eslint ignores them, and the `lib/*.test.ts` test glob doesn't match them. (The exclude uses `?`, not `[0-9]` — TypeScript globs support `*` and `?` but not character classes — and it covers ` 2` through ` 9`, because iCloud does produce copies past ` 2`, including inside `.next/`, where they break `tsc`.) Never edit one and never treat one as the source of truth — delete them instead. If you find a symbol only in a `* 2.ts` file, it was removed from the real one on purpose.
