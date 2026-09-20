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
/** **Bare text**: the project id itself, not a JSON string. Refuses nothing. */
export const PROJECT_KEY = 'wbs.project';
export const MERMAID_SECTION_MODE_KEY = 'wbs.mermaidSectionMode';

export const expansionKey = (projectId: string): string => `wbs.expanded.${projectId}`;
export const widthOverridesKey = (projectId: string): string => `wbs.columnWidths.${projectId}`;
export const ganttHeightKey = (projectId: string): string => `wbs.ganttHeight.${projectId}`;
export const ganttDayPxKey = (projectId: string): string => `wbs.ganttDayPx.${projectId}`;
export const ganttLabelsKey = (projectId: string): string => `wbs.ganttLabels.${projectId}`;
export const hiddenColumnsKey = (projectId: string): string => `wbs.hiddenColumns.${projectId}`;
export const linksResetShownKey = (projectId: string): string => `wbs.linksResetShown.${projectId}`;
export const savedViewsKey = (projectId: string): string => `wbs.views.${projectId}`;
/** **Bare text**: one section name, written without quotes. */
export const projectSettingsSectionKey = (projectId: string): string =>
  `wbs.projectSettingsSection.${projectId}`;
