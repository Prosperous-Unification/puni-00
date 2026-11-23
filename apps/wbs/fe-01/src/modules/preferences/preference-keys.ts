/**
 * Every key this app writes into browser storage, in one place.
 *
 * The names and the formats beside them are a **compatibility fact**: readers
 * have these keys in their browsers now. Renaming one, or writing a JSON string
 * where bare text stands, silently loses whatever that reader had said. Two of
 * these are bare text on purpose — see {@link WORK_PACKAGE_KEY} and
 * {@link workPackageSettingsSectionKey}.
 */
export const THEME_KEY = 'wbs.theme';
export const GANTT_DETAIL_KEY = 'wbs.ganttDetail';
/** Written for one day and never read since; dropped rather than migrated. */
export const RETIRED_GANTT_ARROWS_KEY = 'wbs.ganttArrows';
/**
 * **Bare text**: the work package id itself, not a JSON string. Refuses nothing.
 *
 * Proof: changing the key to `wbs.workPackageId` failed the named-answer
 * compatibility case and eleven work-package-page cases; the raw-byte failures
 * included `expected null to be 'p3'` and `expected 'gone' to be null`.
 * Observed 2026-09-20.
 */
export const WORK_PACKAGE_KEY = 'wbs.workPackage';
export const MERMAID_SECTION_MODE_KEY = 'wbs.mermaidSectionMode';

/**
 * Where this browser remembers which of one work package's branches are open.
 *
 * Per work package, because the shape being remembered is that work package's tree.
 * Per browser, like the chosen work package beside it (`work-package-page.tsx`): my
 * collapsing must not reshuffle anybody else's table.
 */
export const expansionKey = (workPackageId: string): string => `wbs.expanded.${workPackageId}`;
/**
 * Where this browser remembers how wide one work package's columns were dragged.
 *
 * Per work package and per browser, exactly as {@link expansionKey} beside it: a
 * width is one reader's answer to how much of their screen a column deserves,
 * and be-01 is never told about it.
 */
export const widthOverridesKey = (workPackageId: string): string =>
  `wbs.columnWidths.${workPackageId}`;
/**
 * Where this browser remembers how tall one work package's Gantt panel was dragged.
 *
 * Per work package and per browser for {@link widthOverridesKey}'s reason: the
 * chart's share of the screen is one reader's answer, and be-01 is never told
 * about it.
 */
export const ganttHeightKey = (workPackageId: string): string => `wbs.ganttHeight.${workPackageId}`;
/**
 * Where this browser remembers how wide one day of one work package's chart is drawn.
 *
 * Per work package for {@link ganttHeightKey}'s reason, and it is the same reason
 * rather than a similar one: a scale is **this plan's span against this
 * screen**, so a 74-day plan and a fortnight's worth of work want different
 * answers and neither is a preference about the feature. That is where it parts
 * from `wbs.ganttDetail`, which is one answer for the browser because turning
 * sixty elbows off is a statement about elbows.
 */
export const ganttDayPxKey = (workPackageId: string): string => `wbs.ganttDayPx.${workPackageId}`;
/**
 * Where this browser remembers whether one work package's chart draws its row-name
 * column.
 *
 * Per work package for {@link ganttDayPxKey}'s reason and the same one: the column
 * costs a fixed 176px whatever is in it, so whether that is worth paying is
 * **this plan's names against this screen** — a 74-day plan on a phone and a
 * fortnight on a monitor give opposite answers, and neither is a preference
 * about names. It parts from `wbs.ganttDetail` where the scale does.
 */
export const ganttLabelsKey = (workPackageId: string): string => `wbs.ganttLabels.${workPackageId}`;
/**
 * Where this browser remembers which of one work package's columns a reader has
 * hidden — the {@link Hidden column}s that, taken off the default column set,
 * are that reader's {@link Column set}.
 *
 * Per work package and per browser for {@link widthOverridesKey}'s reason: which
 * columns a reader wants on their screen is their answer, and be-01 is never
 * told about it.
 */
export const hiddenColumnsKey = (workPackageId: string): string =>
  `wbs.hiddenColumns.${workPackageId}`;
/**
 * Where this browser remembers which of one work package's measure columns a reader
 * turned on or off, by definition key (`wbs-measure-budgets` D7).
 *
 * A record of answers rather than a hide-list, and that is the difference from
 * {@link hiddenColumnsKey}: a measure's columns are off unless its definition
 * says `showByDefault`, so a key nobody has answered must keep following the
 * definition, and a definition created later must start hidden. Per work package
 * and per browser for {@link widthOverridesKey}'s reason.
 */
export const measureColumnsKey = (workPackageId: string): string =>
  `wbs.measureColumns.${workPackageId}`;
/** A reset that showed Links survives reload without freezing the whole hide-list. */
export const linksResetShownKey = (workPackageId: string): string =>
  `wbs.linksResetShown.${workPackageId}`;
/**
 * Where this browser remembers one work package's saved views.
 *
 * Per work package and per browser, exactly as {@link widthOverridesKey} beside
 * it: a view is one reader's own named answer to "what am I looking at",
 * and it must not appear in front of a different reader who opens the same
 * plan on their own machine.
 */
export const savedViewsKey = (workPackageId: string): string => `wbs.views.${workPackageId}`;
/** **Bare text**: one section name, written without quotes. */
export const workPackageSettingsSectionKey = (workPackageId: string): string =>
  `wbs.workPackageSettingsSection.${workPackageId}`;
