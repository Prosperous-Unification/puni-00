import type { EstimateMethod } from '@/lib/wbs-api';

/** One estimate's three points, as a row carries them into an export. */
export interface ExportTrio {
  optimistic: number;
  realistic: number;
  pessimistic: number;
}

/**
 * One work item, in the shape the export reads it.
 *
 * A structural subset of the table's `TreeRow` — deliberately, so the table
 * hands its rows straight over without building a second object per row — and
 * a plain one: no children, because the export is flat and the number carries
 * the outline.
 *
 * `estimates` and `finalDays` are `| undefined` on purpose. **A role a row was
 * never estimated for is absent from both**, and that absence is what the
 * export renders as an empty cell rather than a zero.
 */
export interface ExportRow {
  id: string;
  number: string;
  name: string;
  notes: string;
  /** True when the figures below are sums of the rows beneath rather than typed. */
  rolledUp: boolean;
  serviceTeamId: string | null;
  estimates: Record<string, ExportTrio | undefined>;
  finalDays: Record<string, number | undefined>;
  finalTotal: number;
  /** By id — resolved to work item numbers here, because an id is not readable. */
  dependsOn: readonly string[];
  startNoEarlierThan: string | null;
  dates: { startsOn: string; endsOn: string } | null;
  schedule: { earliestStart: number; earliestFinish: number; float: number; critical: boolean };
  assignees: Record<string, string | undefined>;
  doesEveryPhase: string | null;
}

/** A role, team or person as the export needs it: something with a name to print. */
export interface NamedEntry {
  id: string;
  name: string;
}

/**
 * A whole plan, ready to be written out.
 *
 * Every id in it resolves against the lists in the same object — this is a
 * self-contained document, not a view onto live state, which is what lets both
 * writers be pure.
 */
export interface PlanExport {
  projectName: string;
  /**
   * When this export was taken, as the caller's clock said it.
   *
   * Passed in rather than read here: a function that calls `Date.now()` cannot
   * be tested for the sentence it prints. The app passes an ISO UTC instant,
   * so the header is unambiguous about which day it means.
   */
  generatedAt: string;
  method: EstimateMethod;
  /** The day the plan starts, or null while it is not on a calendar at all. */
  startDate: string | null;
  /** `cycle` when be-01 could not order the graph, and so has no schedule to report. */
  scheduleError: 'cycle' | null;
  roles: readonly NamedEntry[];
  teams: readonly NamedEntry[];
  people: readonly NamedEntry[];
  /** Every work item, in tree order. Collapsed branches and searches are the screen's business. */
  rows: readonly ExportRow[];
}

/** The method under the name the project chose it by, never its wire value. */
const METHOD_NAMES: Record<EstimateMethod, string> = {
  pert: 'PERT',
  optimistic: 'optimistic',
  realistic: 'realistic',
  pessimistic: 'pessimistic',
};

/** What a plan with no start date says about its own dates. */
const NOT_ON_A_CALENDAR = 'not on a calendar';

/**
 * What stands in for a schedule figure that does not exist.
 *
 * A cycle leaves every row with the same zeroed schedule, and printing those
 * is a page of `day 0` that reads as "everything happens at once" — the
 * confident wrong answer the table's own banner exists to prevent.
 */
const NO_SCHEDULE = '—';

/** What an id that names nobody prints as, in the table's own words. */
const UNKNOWN_NAME = '(unknown)';

/** RFC 4180's record separator. Both writers of a CSV field agree on this one. */
const CRLF = '\r\n';

/**
 * The leading characters Excel, LibreOffice and Sheets read as the start of a
 * formula rather than as text (CSV injection, CWE-1236).
 *
 * A field starting with one of these is prefixed with an apostrophe, which
 * those readers strip back off while displaying the text. Applied to every
 * field rather than only to the typed ones: the rule is then one sentence, and
 * no exported figure is negative — days are durations, offsets count forward,
 * and slack is a late date minus an earlier one.
 */
const FORMULA_LEADERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * One field, escaped for a CSV a spreadsheet will neither misread nor execute.
 *
 * Quoted when it holds a comma, a quote or a line break; quotes inside a
 * quoted field are doubled. That is RFC 4180 exactly, and it is what makes a
 * multi-line note survive as one cell.
 */
function csvField(value: string): string {
  const guarded = FORMULA_LEADERS.has(value.slice(0, 1)) ? `'${value}` : value;
  if (!/["\r\n,]/.test(guarded)) return guarded;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/**
 * One cell, safe to put between two pipes.
 *
 * A pipe would open a column nobody asked for and a line break would end the
 * row halfway through, so those two are dealt with and **nothing else is**:
 * a note is Markdown source, and escaping its asterisks would export a
 * different document from the one that was written.
 */
function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll(/[\r\n]+/g, ' ');
}

/** A number as the plan holds it — full precision, not the table's one decimal. */
const showFigure = (days: number): string => String(days);

/** `entries`' name for `id`, or the table's word for an id that names nobody. */
function nameOf(entries: readonly NamedEntry[], id: string): string {
  return entries.find((entry) => entry.id === id)?.name ?? UNKNOWN_NAME;
}

/**
 * The header fields both formats carry, in one place so they cannot drift.
 *
 * This is the block codex asked for: a reader who is handed the table alone
 * has no way to know which of four methods produced the finals, whether the
 * dates are dates or offsets, or how old the figures are.
 */
function headerFields(plan: PlanExport): { key: string; value: string }[] {
  const fields = [
    { key: 'Project', value: plan.projectName },
    { key: 'Final figures', value: METHOD_NAMES[plan.method] },
    { key: 'Start date', value: plan.startDate ?? NOT_ON_A_CALENDAR },
    {
      key: 'Dates',
      value:
        plan.startDate === null
          ? 'day offsets from day zero — the plan is not on a calendar'
          : 'working days — dates skip weekends',
    },
    { key: 'Generated', value: plan.generatedAt },
    {
      key: 'Figures',
      value: 'unrounded; an empty cell means nobody has estimated it, never zero',
    },
  ];
  if (plan.scheduleError !== null) {
    fields.push({
      key: 'Schedule',
      value: `these dependencies run in a circle, so no dates could be worked out — every date and slack reads ${NO_SCHEDULE}`,
    });
  }
  return fields;
}

/** What a row's Starts cell says: a date, a day offset, or nothing knowable. */
function startsCell(plan: PlanExport, row: ExportRow): string {
  if (plan.scheduleError !== null) return NO_SCHEDULE;
  return row.dates?.startsOn ?? `day ${showFigure(row.schedule.earliestStart)}`;
}

/** What a row's Ends cell says. `endsOn` is the last day the work is still on. */
function endsCell(plan: PlanExport, row: ExportRow): string {
  if (plan.scheduleError !== null) return NO_SCHEDULE;
  return row.dates?.endsOn ?? `day ${showFigure(row.schedule.earliestFinish)}`;
}

/**
 * Who does one role's work on one row.
 *
 * The every-phase assumption is spelled out rather than left as a blank: the
 * table shows it in grey beside the picker, and an export that dropped it
 * would say nobody is doing the QA of a row one person is plainly doing all
 * of.
 */
function assigneeCell(plan: PlanExport, row: ExportRow, roleId: string): string {
  const assigned = row.assignees[roleId];
  if (assigned !== undefined) return nameOf(plan.people, assigned);
  if (row.doesEveryPhase === null) return '';
  return `${nameOf(plan.people, row.doesEveryPhase)} (assumed — the only assignee does every phase)`;
}

/** One column of the exported table: what it is called, and what a row puts in it. */
interface ExportColumn {
  header: string;
  cell: (row: ExportRow) => string;
}

/**
 * Every column, in the order both formats print them.
 *
 * The table stays **flat**: the derived number is the outline already (`010`,
 * `010.1`), so indenting the name would say the same thing a second time and
 * would do it differently in a spreadsheet than in Markdown.
 *
 * `markSums` is the one difference between the two formats. A rolled-up row's
 * figures are sums of the rows beneath it, and Markdown says so on the figure;
 * a CSV must not, because `7 (sum)` is text where a spreadsheet wants a
 * number. The marked final identifies the row — the trio beside it is a sum in
 * the same way.
 */
function columnsOf(plan: PlanExport, markSums: boolean): ExportColumn[] {
  const method = METHOD_NAMES[plan.method];
  /** A computed figure, with Markdown's sum marker where one applies. */
  const figure = (row: ExportRow, days: number | undefined): string => {
    if (days === undefined) return '';
    return markSums && row.rolledUp ? `${showFigure(days)} (sum)` : showFigure(days);
  };
  return [
    { header: 'Number', cell: (row) => row.number },
    { header: 'Name', cell: (row) => row.name },
    {
      header: 'Team',
      cell: (row) => (row.serviceTeamId === null ? '' : nameOf(plan.teams, row.serviceTeamId)),
    },
    ...plan.roles.flatMap((role): ExportColumn[] => [
      {
        header: `${role.name} optimistic`,
        cell: (row) => {
          const trio = row.estimates[role.id];
          return trio === undefined ? '' : showFigure(trio.optimistic);
        },
      },
      {
        header: `${role.name} realistic`,
        cell: (row) => {
          const trio = row.estimates[role.id];
          return trio === undefined ? '' : showFigure(trio.realistic);
        },
      },
      {
        header: `${role.name} pessimistic`,
        cell: (row) => {
          const trio = row.estimates[role.id];
          return trio === undefined ? '' : showFigure(trio.pessimistic);
        },
      },
      {
        header: `${role.name} final (${method})`,
        cell: (row) => figure(row, row.finalDays[role.id]),
      },
      { header: `${role.name} by`, cell: (row) => assigneeCell(plan, row, role.id) },
    ]),
    {
      header: `Total days (${method})`,
      // Empty rather than `0` when no role has a figure: a total of nothing
      // estimated is not a plan that takes no time.
      cell: (row) =>
        plan.roles.some((role) => row.finalDays[role.id] !== undefined)
          ? figure(row, row.finalTotal)
          : '',
    },
    {
      header: 'Depends on',
      cell: (row) =>
        row.dependsOn
          .flatMap((id) => {
            const predecessor = plan.rows.find((each) => each.id === id);
            return predecessor === undefined ? [] : [predecessor.number];
          })
          .join(', '),
    },
    { header: 'Not before', cell: (row) => row.startNoEarlierThan ?? '' },
    { header: 'Starts', cell: (row) => startsCell(plan, row) },
    { header: 'Ends', cell: (row) => endsCell(plan, row) },
    {
      header: 'Slack',
      cell: (row) => {
        if (plan.scheduleError !== null) return NO_SCHEDULE;
        return row.schedule.critical ? 'critical' : showFigure(row.schedule.float);
      },
    },
    { header: 'Notes', cell: (row) => row.notes },
  ];
}

/**
 * The plan as Markdown: a header block, then one flat table.
 *
 * What the header says is the point of it — which method produced the finals,
 * whether the dates are dates, when this was taken, and that the figures are
 * the raw ones rather than the rounded ones on screen. A table pasted into a
 * document outlives the screen it came off.
 */
export function planToMarkdown(plan: PlanExport): string {
  const columns = columnsOf(plan, true);
  const header = [
    ...headerFields(plan),
    { key: 'Rolled-up rows', value: 'a figure marked (sum) is the total of the rows beneath it' },
  ].map((field) => `**${field.key}:** ${markdownCell(field.value)}`);
  const table = [
    `| ${columns.map((each) => markdownCell(each.header)).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...plan.rows.map(
      (row) => `| ${columns.map((each) => markdownCell(each.cell(row))).join(' | ')} |`,
    ),
  ];
  return [...header, '', ...table, ''].join('\n');
}

/**
 * The plan as RFC 4180 CSV: the header block as leading `key,value` records,
 * a blank record, then the table.
 *
 * A comment syntax would have been the obvious place for the header, and CSV
 * has none — `#` is a convention some readers honour and others import as a
 * first column. Leading records are read by every spreadsheet there is, and
 * the blank one is what separates them from the column headings.
 *
 * No terminator after the last record: RFC 4180 leaves it optional, and a
 * trailing CRLF reads as an empty row in some importers.
 */
export function planToCsv(plan: PlanExport): string {
  const columns = columnsOf(plan, false);
  const records: string[][] = [
    ...headerFields(plan).map((field) => [field.key, field.value]),
    [],
    columns.map((each) => each.header),
    ...plan.rows.map((row) => columns.map((each) => each.cell(row))),
  ];
  return records.map((record) => record.map(csvField).join(',')).join(CRLF);
}

/** What a project with no usable characters in its name is filed under. */
const UNNAMEABLE_PROJECT = 'plan';

/**
 * The name the downloaded CSV lands under: the project, slugified, and the day
 * it was taken.
 *
 * The day comes off {@link PlanExport.generatedAt}, which is UTC — two people
 * exporting the same plan an hour either side of midnight in different
 * timezones therefore agree on the filename, and may disagree with their own
 * calendars by a day.
 */
export function planFileName(plan: Pick<PlanExport, 'projectName' | 'generatedAt'>): string {
  const slug = plan.projectName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  return `${slug === '' ? UNNAMEABLE_PROJECT : slug}-${plan.generatedAt.slice(0, 10)}.csv`;
}
