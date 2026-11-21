/**
 * The locale every user-facing date and number is formatted in.
 *
 * Pinned rather than left to the browser: the interface is written in French,
 * so `Intl.DateTimeFormat(undefined, …)` would render "Nov 22" and "Mon" for a
 * tester whose device is set to English — a mixed-locale interface reads worse
 * than one that is consistently French. Weekday and month names come from
 * `Intl`, so there is no hand-written translation table to drift.
 */
export const UI_LOCALE = "fr-FR";
