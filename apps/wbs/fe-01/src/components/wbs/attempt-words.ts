import type { AttemptOutcomeView, AttemptView } from '@/lib/wbs-api';

/** An instant as a card prints it: its day and its minute, both in one zone. */
export interface ZonedMoment {
  /** `12 Oct`. */
  day: string;
  /** `14:02`, on a 24-hour clock. */
  time: string;
}

/**
 * Formatters by zone. `Intl.DateTimeFormat` is the expensive half of a
 * format, and a plan prints every attempt of every card in one zone.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  const known = FORMATTERS.get(zone);
  if (known !== undefined) return known;
  // `en-GB` for `12 Oct` rather than `Oct 12`, the order every other short day
  // in this table reads in (`short-date.ts`).
  const made = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  FORMATTERS.set(zone, made);
  return made;
}

/**
 * The day and minute `epochMs` falls on **in the project's zone**, never the
 * reader's (`step-node-attempts` D3): two readers in different zones read one
 * attempt as one day.
 *
 * @throws RangeError for a zone `Intl` does not know, and for an instant that
 * is not a time at all — be-01 sends neither, so either is a malformed read.
 */
export function zonedMoment(epochMs: number, zone: string): ZonedMoment {
  // Proof: `timeZone` dropped from the formatter, `reads a Kyiv finish as the
  // next day for every reader` failed under `TZ=America/Los_Angeles` on
  // `11 Oct 16:30` for `12 Oct 02:30`, and the zoned suite's `reads a Kyiv
  // finish as 12 Oct 02:30 from Auckland` on `12 Oct 09:00–12:30`; watched
  // 2026-10-12.
  const parts = formatterFor(zone).formatToParts(epochMs);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const found = parts.find((each) => each.type === type)?.value;
    if (found === undefined) throw new RangeError(`no ${type} in ${String(epochMs)}`);
    return found;
  };
  return {
    day: `${part('day')} ${part('month')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

/**
 * When an attempt ran, in the project's zone: `12 Oct 14:02–14:41` within one
 * day, `11 Oct 16:30 – 12 Oct 02:10` across midnight, `12 Oct 14:02 – now`
 * while it runs.
 */
export function attemptWhen(attempt: AttemptView, zone: string): string {
  const start = zonedMoment(attempt.startedAt, zone);
  const from = `${start.day} ${start.time}`;
  if (attempt.endedAt === null) return `${from} – now`;
  const end = zonedMoment(attempt.endedAt, zone);
  return end.day === start.day ? `${from}–${end.time}` : `${from} – ${end.day} ${end.time}`;
}

/** The word an attempt's outcome prints as; a running attempt has none yet. */
export const OUTCOME_WORDS: Readonly<Record<AttemptOutcomeView, string>> = {
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/**
 * One line of a card's attempt list (`step-node-attempts` D7): `#3 failed ·
 * 12 Oct 14:02–14:41 · Kat · PR #12`, the executor and the reference left out
 * where there is none.
 */
export function attemptEntryText(
  attempt: AttemptView,
  zone: string,
  executorName: string | null,
): string {
  const outcome = attempt.outcome ?? 'running';
  return [
    `#${String(attempt.attemptNumber)} ${outcome}`,
    attemptWhen(attempt, zone),
    ...(executorName === null ? [] : [executorName]),
    ...(attempt.reference === null ? [] : [attempt.reference]),
  ].join(' · ');
}
