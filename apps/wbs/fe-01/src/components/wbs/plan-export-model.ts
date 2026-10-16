import type { ChargedEstimate, EstimateUnit } from '@wbs/domain/estimate';
import type { WorkItemStatus } from '@wbs/domain/progress';

import type { EstimateMethod, PriorityBandView, SliceView } from '@/lib/wbs-api';

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
 * `estimates` and `finalDays` are `| undefined` on purpose. **A step a row was
 * never estimated for is absent from both**, and that absence is what the
 * export renders as an empty cell rather than a zero.
 */
export interface ExportRow {
  id: string;
  /**
   * The row above this one, or null at the root.
   *
   * Carried for one reason: a team label reaches down. `effectiveTeamsOf` walks
   * these to answer which team's people a row's work belongs to, and the export
   * prints both that answer and the label the row itself stores — an export
   * that showed moved dates and not the pool that moved them is the CSV
   * equivalent of a bare newline.
   */
  parentId: string | null;
  number: string;
  name: string;
  notes: string;
  /** True when the figures below are sums of the rows beneath rather than typed. */
  rolledUp: boolean;
  /** The teams this row states, 0..n. Empty inherits; see `effectiveTeamsOf`. */
  teamIds: readonly string[];
  /** The tags this row states, 0..n. Empty inherits; see `effectiveTagsOf`. */
  tagIds: readonly string[];
  /**
   * The services this row states, 0..n. Empty inherits; see `effectiveServicesOf`.
   *
   * Plural since the 2026-08-21 scope change, and the field the third dimension
   * enters this document by. Required rather than optional for the reason the
   * `priority` comment in the test fixture records at length: an optional field
   * is a field every caller may forget, and a forgotten label column exports as
   * blank rather than as a failure.
   */
  serviceIds: readonly string[];
  estimates: Record<string, ExportTrio | undefined>;
  finalDays: Record<string, number | undefined>;
  charged?: Record<string, ChargedEstimate>;
  finalTotal: number;
  /** By id — resolved to work item numbers here, because an id is not readable. */
  dependsOn: readonly string[];
  startNoEarlierThan: string | null;
  /**
   * Why that date is there, in the planner's own words, or null where nobody
   * has said.
   *
   * Its own column rather than a suffix on the date, which is how every other
   * piece of row text is carried here: a spreadsheet reader sorts and filters
   * on `Not before` as a date, and a cell reading `2026-09-12 — waiting on
   * client sign-off` is a date column that has stopped being one. `Notes`'
   * shape exactly, and it goes through the same `csvField` and `markdownCell`
   * escaping — a reason may hold commas, quotes and pipes like any sentence.
   *
   * **Optional, and nothing fills it yet.** `planForExport` in `wbs-table.tsx`
   * builds these rows and was another agent's file to edit while this was
   * written — the one line it owes is
   * `startNoEarlierThanReason: row.original.startNoEarlierThanReason`, beside
   * the `startNoEarlierThan` above it. Until that lands the column is exported
   * empty on every row, which is what it will read on every plan nobody has
   * explained anyway.
   */
  startNoEarlierThanReason?: string | null;
  /**
   * The last day this work item may finish on, as somebody typed it, or null
   * where nobody has set one.
   *
   * **Required rather than optional**, which is the `priority` and `serviceIds`
   * lesson a third time: a `Partial` spread satisfies a required field the base
   * object omits, so an optional field is one every caller may forget and a
   * forgotten date column exports blank rather than failing. Nothing in
   * `planForExport` fills it by hand — `rows: flat` hands the whole
   * `WorkItemView` over — so what this line buys is the type checker, and the
   * assertions below read the cell rather than the header so a producer that
   * stopped filling it fails a test.
   *
   * The floor one column over was exported from the day it existed and this was
   * not (TASK-291): a reader who exported a plan to hand to somebody lost every
   * deadline on it, with nothing on the sheet saying a column was missing. That
   * asymmetry is what made it a defect rather than a scope choice.
   */
  deadline: string | null;
  /** What the row reads as — `unknown`, `in_progress`, `done` — be-01's fold. */
  status: WorkItemStatus;
  /** The day work actually began, or null where nobody has said. */
  factStart: string | null;
  /** The day work actually finished, or null where nobody has said. */
  factEnd: string | null;
  /** The priority somebody gave this work — 1 upward, smaller first — or null. */
  priority: number | null;
  /**
   * How many people may work on this item at once, as somebody typed it.
   *
   * The **stored** number. What the engine could actually give it is
   * {@link ExportSlice.width}, and the export carries both because they differ
   * for two reasons a reader has no other way to learn: the team was smaller
   * than the number, or somebody is named on the work.
   */
  maxParallel: number;
  dates: { startsOn: string; endsOn: string } | null;
  /** Null for an on-hold row, which takes no part in the schedule. */
  schedule: {
    earliestStart: number;
    earliestFinish: number;
    float: number;
    critical: boolean;
  } | null;
  assignees: Record<string, string | undefined>;
  doesEveryStep: string | null;
  /**
   * The leaf's attempts by step id, as the read carries them, counted per step
   * into the sheet. Optional because the read leaves it out on a row with none.
   */
  attempts?: Record<string, readonly unknown[] | undefined>;
}

/**
 * One placed slice, as far as the export is concerned: whose row, and how wide
 * be-01 actually ran it.
 *
 * The compression lives here and not on the row: a row's duration is
 * `effort / width`, and without {@link ExportSlice.width} the CSV shows a
 * two-day row carrying six days of estimate and says nothing about why. `width`
 * is what the `Ran at` column reads, as a set per row.
 *
 * **`effort` is carried and read by nothing.** C3's own cross-review recorded it
 * (2026-08-13, P3) against a docstring that claimed all three did work. It is
 * not lost information — `Total days` is the effort and `Starts`/`Ends` are the
 * span — so the honest fix was this paragraph rather than deleting a field the
 * producer would then stop filling: `capacity-docs`, D6. `duration` stopped
 * being one of the unread two when `plan-mermaid.ts` began asking which slices
 * are points rather than spans.
 *
 * **This is be-01's `SliceView` and not a narrowing of it, since
 * `mermaid-gantt`.** It always was one at runtime — `planForExport` assigns
 * `chartRead.slices` verbatim (`wbs-table.tsx`) — and the four-field interface
 * that used to stand here only hid the rest from the type checker. A chart
 * cannot be drawn from four fields: `planToMermaid` needs the step, the person,
 * the offsets, the critical flag and whether anybody estimated the pair, and
 * every one of them was already in the object. Widening was therefore a change
 * with no new plumbing and no second request, which is the cheapest kind.
 *
 * The alias rather than a hand-written superset: two lists of the same fields
 * drift, and the drift would land as an export quietly disagreeing with the
 * chart about a slice both are reading out of the same array.
 */
export type ExportSlice = SliceView;

/**
 * What a document that is **not** the whole plan is a document of.
 *
 * Present only on an export of the rows one reader had on screen (R10 F5), and
 * absent — not empty, absent — on every other, which is what keeps the four
 * existing exports byte-for-byte what they were: they take `flat`, they say so
 * in the bundled document's `Scope` line, and that doctrine is settled (§9's
 * Q3).
 *
 * `criteria` is `filterWords`' list (`tree-search.ts`), so the document's
 * account of what was filtered is the filter's own account of itself rather
 * than a second one written here. Empty means the rows were narrowed by a
 * collapsed branch alone, which is a real way to have fewer rows on screen and
 * has to read differently from a filter that kept them out.
 */
export interface FilteredScope {
  /** How many rows the whole plan holds — how many are in the document is `rows.length`. */
  totalRows: number;
  criteria: readonly string[];
}

/** A step, team or person as the export needs it: something with a name to print. */
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
  /** Why be-01 could not produce calendar dates for the plan. */
  scheduleError: 'calendar_range' | 'cycle' | null;
  steps: readonly (NamedEntry & { estimateUnit?: EstimateUnit })[];
  teams: readonly NamedEntry[];
  /** The tag vocabulary, for the Tags column — `teams`' shape, one dimension over. */
  tags: readonly NamedEntry[];
  /**
   * The service vocabulary, for the Services column — `tags`' shape again.
   *
   * A **plan-level list** and not the directory's: an export is self-contained
   * (see this interface's own note), so a service renamed after the CSV was
   * taken leaves the CSV saying what it said on the day.
   */
  services: readonly NamedEntry[];
  /**
   * What this plan calls its priority numbers, for the Priority band column.
   *
   * The **plan's own** ladder travels with the export rather than being inferred
   * from the numbers, because a spreadsheet outlives the plan it came from: a CSV
   * saying `Critical` for 10 is still readable the day somebody re-cuts the
   * ladder, and one saying only `10` is a number nobody can name again.
   */
  priorityBands: readonly PriorityBandView[];
  people: readonly NamedEntry[];
  /**
   * The work items this document holds, in tree order.
   *
   * **Every one of them** for the four exports that have always existed —
   * collapsed branches and running filters are the screen's business, not a
   * document's. The one export that takes the rows on screen instead says so in
   * {@link PlanExport.scope}, and a document with rows missing and no scope is
   * the thing Q3 refused.
   */
  rows: readonly ExportRow[];
  /**
   * What this document is of, when it is not the whole plan — see
   * {@link FilteredScope}.
   *
   * Optional so every caller that takes the whole plan stays exactly what it
   * was, and so the absence itself carries the claim: no scope line means no
   * narrowing, and there is no way to write one down without also writing down
   * what it kept.
   */
  scope?: FilteredScope;
  /**
   * Every slice be-01 placed, in its own order.
   *
   * Empty on a plan that could not be scheduled, which is the same absence the
   * dates report as {@link NO_SCHEDULE}: a parallelism column filled in from
   * nothing would be this document's own invention.
   */
  slices: readonly ExportSlice[];
}
