/**
 * Every key this app writes into browser storage, in one place.
 *
 * The names and the formats beside them are a **compatibility fact**: readers
 * have these keys in their browsers now. Renaming one, or writing a JSON string
 * where bare text stands, silently loses whatever that reader had said. Two of
 * these are bare text on purpose — see {@link PROJECT_KEY} and
 * {@link projectSettingsSectionKey}.
 */
export const THEME_KEY = 'wbs.theme';
export const GANTT_DETAIL_KEY = 'wbs.ganttDetail';
/** Written for one day and never read since; dropped rather than migrated. */
export const RETIRED_GANTT_ARROWS_KEY = 'wbs.ganttArrows';
/**
 * **Bare text**: the project id itself, not a JSON string. Refuses nothing.
 *
 * Proof: changing the key to `wbs.projectId` failed the named-answer
 * compatibility case and eleven project-page cases; the raw-byte failures
 * included `expected null to be 'p3'` and `expected 'gone' to be null`.
 * Observed 2026-09-20.
 */
export const PROJECT_KEY = 'wbs.project';
export const MERMAID_SECTION_MODE_KEY = 'wbs.mermaidSectionMode';

/**
 * Where this browser remembers which of one project's branches are open.
 *
 * Per project, because the shape being remembered is that project's tree.
 * Per browser, like the chosen project beside it (`project-page.tsx`): my
 * collapsing must not reshuffle anybody else's table.
 */
export const expansionKey = (projectId: string): string => `wbs.expanded.${projectId}`;
/**
 * Where this browser remembers how wide one project's columns were dragged.
 *
 * Per project and per browser, exactly as {@link expansionKey} beside it: a
 * width is one reader's answer to how much of their screen a column deserves,
 * and be-01 is never told about it.
 */
export const widthOverridesKey = (projectId: string): string => `wbs.columnWidths.${projectId}`;
/**
 * Where this browser remembers how tall one project's Gantt panel was dragged.
 *
 * Per project and per browser for {@link widthOverridesKey}'s reason: the
 * chart's share of the screen is one reader's answer, and be-01 is never told
 * about it.
 */
export const ganttHeightKey = (projectId: string): string => `wbs.ganttHeight.${projectId}`;
/**
 * Where this browser remembers how wide one day of one project's chart is drawn.
 *
 * Per project for {@link ganttHeightKey}'s reason, and it is the same reason
 * rather than a similar one: a scale is **this plan's span against this
 * screen**, so a 74-day plan and a fortnight's worth of work want different
 * answers and neither is a preference about the feature. That is where it parts
 * from `wbs.ganttDetail`, which is one answer for the browser because turning
 * sixty elbows off is a statement about elbows.
 */
export const ganttDayPxKey = (projectId: string): string => `wbs.ganttDayPx.${projectId}`;
/**
 * Where this browser remembers whether one project's chart draws its row-name
 * column.
 *
 * Per project for {@link ganttDayPxKey}'s reason and the same one: the column
 * costs a fixed 176px whatever is in it, so whether that is worth paying is
 * **this plan's names against this screen** — a 74-day plan on a phone and a
 * fortnight on a monitor give opposite answers, and neither is a preference
 * about names. It parts from `wbs.ganttDetail` where the scale does.
 */
export const ganttLabelsKey = (projectId: string): string => `wbs.ganttLabels.${projectId}`;
/**
 * Where this browser remembers which of one project's columns a reader has
 * hidden — the {@link Hidden column}s that, taken off the default column set,
 * are that reader's {@link Column set}.
 *
 * Per project and per browser for {@link widthOverridesKey}'s reason: which
 * columns a reader wants on their screen is their answer, and be-01 is never
 * told about it.
 */
export const hiddenColumnsKey = (projectId: string): string => `wbs.hiddenColumns.${projectId}`;
/** A reset that showed Links survives reload without freezing the whole hide-list. */
export const linksResetShownKey = (projectId: string): string => `wbs.linksResetShown.${projectId}`;
/**
 * Where this browser remembers one project's saved views.
 *
 * Per project and per browser, exactly as {@link widthOverridesKey} beside
 * it: a view is one reader's own named answer to "what am I looking at",
 * and it must not appear in front of a different reader who opens the same
 * plan on their own machine.
 */
export const savedViewsKey = (projectId: string): string => `wbs.views.${projectId}`;
/** **Bare text**: one section name, written without quotes. */
export const projectSettingsSectionKey = (projectId: string): string =>
  `wbs.projectSettingsSection.${projectId}`;
