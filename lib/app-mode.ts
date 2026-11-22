/**
 * Build-time app mode.
 *
 * AJ Words ships in two shapes from one codebase:
 *
 * - **Authoring** (the default, flag absent): the full app. `npm run dev`,
 *   `npm test`, `npm run e2e` and the maintainer's own machine all run here.
 *   This is also how the bundled lists get made — author them in the app,
 *   export, then `npm run import:phone` regenerates
 *   lib/builtin-vocabulary-data.json from that export.
 *
 * - **Curated library** (`NEXT_PUBLIC_CURATED_LIBRARY=1`): the beta build.
 *   Testers study the lists that ship in the bundle and nothing else — every
 *   path that would add, change or remove list content is hidden, including the
 *   `#share=` fragment, which is the only one that is not a button.
 *
 * Why a flag rather than deleting the editing UI: the maintainer needs that UI
 * to produce the lists being shipped, and 12 of the 15 Playwright spec files
 * build their fixtures through "Nouvelle liste" — deleting it would take most
 * of the suite with it. Dropping the env var is also how this is reverted at
 * public launch.
 *
 * `NEXT_PUBLIC_*` is inlined by Next at build time, so this is a constant in the
 * bundle, not a runtime lookup — and it is NOT a permission. The app is
 * client-side with no server and no accounts: this closes the path, it does not
 * lock the door. That is the right trade for a beta among people you know.
 */
export const CURATED_LIBRARY = process.env.NEXT_PUBLIC_CURATED_LIBRARY === "1";

/** Can the person using this build change what is in the library? */
export const canEditLibrary = !CURATED_LIBRARY;
