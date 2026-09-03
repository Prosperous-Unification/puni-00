import {
  addWorkdays,
  firstWorkdayOf,
  type IsoDate,
  lastWorkdayOf,
  SCHEDULE_ALGORITHM_ID,
  type Schedule,
  type Scheduled,
} from '@wbs/domain';

/**
 * The schedule body's own schema version, written into every body.
 *
 * Bumped when the *shape* of the body changes — a key renamed, a key removed,
 * the date rendering changed. A field **added** to `Scheduled`,
 * `ScheduledSlice` or `Schedule` does not bump it: those flow through
 * {@link buildScheduleBody} untouched by construction (see its doc), and a
 * reader that does not know the new key simply does not read it.
 *
 * Not to be confused with {@link SCHEDULE_ALGORITHM_ID}, which names the
 * arithmetic rather than the container. Two bodies can share this version and
 * disagree about every date in them.
 */
export const SCHEDULE_BODY_SCHEMA_VERSION = 1;

/**
 * The one key of `Schedule` that is never stored.
 *
 * `eventsVisited` counts the levelling pass's window searches. It is
 * instrumentation about the *run* — the same plan scheduled twice by the same
 * code can produce two figures — so storing it would make two identical plans
 * compare as different. Named as a set rather than deleted inline so the
 * exclusion is one greppable list, and so the test can assert against the same
 * name it is excluded by.
 */
const NOT_STORED: ReadonlySet<string> = new Set(['eventsVisited']);

/** One timing's calendar span, or nulls when the project is not on a calendar. */
export interface SpanDates {
  readonly startsOn: IsoDate | null;
  readonly endsOn: IsoDate | null;
}

/** A `Scheduled` or `ScheduledSlice` as stored: its own fields, plus the dates. */
export type DatedTiming = Record<string, unknown> & SpanDates;

/**
 * A schedule as it is stored: offsets, dates, and the counts — never the
 * instrumentation.
 *
 * The two maps become records because JSON has no `Map`, and their keys are the
 * engine's own: work item ids in `workItems`, `sliceKey`s in `slices`. Both are
 * declared loosely on purpose — the writer copies whatever the engine returned
 * rather than a field list, so a tight type here would be a second enumeration
 * to forget to update, which is the exact failure the deep-equality test in
 * `saved-plan-schedule-body.test.ts` exists to prevent.
 */
export interface ScheduleBody {
  readonly version: number;
  /** Which arithmetic produced these dates — see {@link SCHEDULE_ALGORITHM_ID}. */
  readonly algorithmId: string;
  readonly workItems: Record<string, DatedTiming>;
  readonly slices: Record<string, DatedTiming>;
  readonly waitingForPerson: number;
  readonly waitingForCapacity: number;
}

/**
 * One timing's span as calendar days, from the offsets the engine computed.
 *
 * Deliberately the **same** two readings the live table renders
 * (`work-item.service.ts` `datesOf`, `:358-377`), through the same
 * `@wbs/domain` helpers: `firstWorkdayOf` is snap-then-floor and
 * `lastWorkdayOf` is snap-then-`ceil − 1` clamped to the start's day, so the
 * finish sits on the day the work occupies rather than the one it spills into.
 * A saved plan that rendered its own arithmetic would disagree with the live
 * plan about a date neither of them computed differently, which is a difference
 * a reader would have no way to explain.
 *
 * Both keys are always present, `null` together when the project has no start
 * date. An absent key would make the stored key set depend on the calendar, and
 * the comparison in slice 6 reads key sets.
 */
function datesOf(timing: Scheduled, startDate: IsoDate | null): SpanDates {
  if (startDate === null) return { startsOn: null, endsOn: null };
  return {
    startsOn: addWorkdays(startDate, firstWorkdayOf(timing.earliestStart)),
    endsOn: addWorkdays(startDate, lastWorkdayOf(timing.earliestStart, timing.earliestFinish)),
  };
}

/** One of the engine's maps, as a record, with each value's dates merged in. */
function datedRecordOf(
  timings: ReadonlyMap<string, Scheduled>,
  startDate: IsoDate | null,
): Record<string, DatedTiming> {
  const stored: Record<string, DatedTiming> = {};
  for (const [key, timing] of timings) {
    // Spread rather than a field list: see `buildScheduleBody`.
    stored[key] = { ...timing, ...datesOf(timing, startDate) };
  }
  return stored;
}

/**
 * The schedule body for one captured plan.
 *
 * **Nothing here enumerates a field of `Scheduled`, `ScheduledSlice` or
 * `Schedule`, and that is the whole design.** The top level is a loop over the
 * engine's own keys minus {@link NOT_STORED}; each timing is a spread of its
 * own value plus the two dates. So a field added to any of those three
 * interfaces is stored the day it is added, with no edit here and no reviewer
 * remembering to make one.
 *
 * The alternative — writing the fields out — stays green for every field the
 * writer forgot, because the test that checks it would be reading the same
 * list. That is not a hypothetical: it is why the spec (`specs/wbs-domain`,
 * "The stored schedule body SHALL be deep-equal to what `schedule()`
 * returned") states the property as deep equality rather than as a schema.
 *
 * `startDate` is the captured project's own (`PlanInputReads.project`), not
 * today's: the dates a saved plan carries are the ones it had when it was
 * saved, and re-rendering them against a project whose start has since moved
 * would restate the plan, which is the fault this whole feature exists to
 * prevent.
 */
export function buildScheduleBody(planned: Schedule, startDate: IsoDate | null): ScheduleBody {
  const body: Record<string, unknown> = {
    version: SCHEDULE_BODY_SCHEMA_VERSION,
    algorithmId: SCHEDULE_ALGORITHM_ID,
  };
  for (const [key, value] of Object.entries(planned)) {
    if (NOT_STORED.has(key)) continue;
    body[key] =
      value instanceof Map
        ? datedRecordOf(value as ReadonlyMap<string, Scheduled>, startDate)
        : value;
  }
  return body as unknown as ScheduleBody;
}
