import { dateOfWorkdayOrdinal, type IsoDate } from './workday';

/**
 * A half-open interval `[start, end)` on the shared workday axis of
 * {@link workdayOrdinalOf}, fractions kept.
 */
export interface WorkdaySpan {
  readonly start: number;
  readonly end: number;
}

/** A maximal interval where two or more of one person's bookings run at once. */
export interface Overlap<T extends WorkdaySpan> extends WorkdaySpan {
  /** Every booking active anywhere in the interval, in the order they began. */
  readonly bookings: readonly T[];
}

/** One Monday-to-Friday week of a person's load, clipped to the window read. */
export interface LoadWeek {
  readonly weekOf: IsoDate;
  /** Workdays of the week the union of the person's bookings covers. */
  readonly booked: number;
  /** Workdays of the week two or more of the person's bookings cover. */
  readonly overlapping: number;
}

/**
 * The maximal intervals where at least two of `bookings` are active, each
 * naming every booking active in it.
 *
 * Strict: bookings that only touch (`a.end === b.start`) do not overlap,
 * because an end is processed before a start at the same instant. A booking
 * that ends where the next begins is a hand-off, and reporting it would hatch
 * every plan that schedules a person back to back.
 *
 * A span that holds no time (`end <= start`) books nothing and joins no
 * overlap. Proof: the filter removed made `lets a span that holds no time join
 * no overlap` (`person-load.test.ts`) report one; watched 2026-09-29.
 *
 * Proof: starts ordered before ends at one instant made `reports nothing for
 * touching bookings` (`person-load.test.ts`) report a zero-length overlap at 2,
 * and the mounted `does not report touching bookings as an overlap`
 * (`person-load.controller.db.test.ts`) list one overlap; watched 2026-09-29.
 */
export function overlapsOf<T extends WorkdaySpan>(bookings: readonly T[]): Overlap<T>[] {
  const edges = bookings
    .filter((booking) => booking.end > booking.start)
    .flatMap((booking) => [
      { at: booking.start, opens: true, booking },
      { at: booking.end, opens: false, booking },
    ])
    .sort((a, b) => a.at - b.at || Number(a.opens) - Number(b.opens));
  const active = new Set<T>();
  const found: Overlap<T>[] = [];
  let open: { start: number; members: Set<T> } | null = null;
  for (const edge of edges) {
    if (edge.opens) {
      active.add(edge.booking);
      if (open !== null) open.members.add(edge.booking);
      else if (active.size === 2) open = { start: edge.at, members: new Set(active) };
      continue;
    }
    active.delete(edge.booking);
    if (open !== null && active.size < 2) {
      found.push({ start: open.start, end: edge.at, bookings: [...open.members] });
      open = null;
    }
  }
  return found;
}

/**
 * One {@link LoadWeek} per week of the shared axis that intersects `window`,
 * each measured over the part of the week inside the window.
 */
export function weeklyLoadOf(bookings: readonly WorkdaySpan[], window: WorkdaySpan): LoadWeek[] {
  if (window.end <= window.start) return [];
  const union = unionOf(bookings);
  const overlaps = overlapsOf(bookings);
  const weeks: LoadWeek[] = [];
  for (let monday = Math.floor(window.start / 5) * 5; monday < window.end; monday += 5) {
    const week = { start: Math.max(monday, window.start), end: Math.min(monday + 5, window.end) };
    weeks.push({
      weekOf: dateOfWorkdayOrdinal(monday),
      booked: coveredWithin(union, week),
      overlapping: coveredWithin(overlaps, week),
    });
  }
  return weeks;
}

/** The disjoint intervals `spans` cover together, in order. */
function unionOf(spans: readonly WorkdaySpan[]): WorkdaySpan[] {
  const merged: { start: number; end: number }[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last !== undefined && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ start: span.start, end: span.end });
  }
  return merged;
}

/** How much of `within` the disjoint `spans` cover. */
function coveredWithin(spans: readonly WorkdaySpan[], within: WorkdaySpan): number {
  let covered = 0;
  for (const span of spans) {
    covered += Math.max(0, Math.min(span.end, within.end) - Math.max(span.start, within.start));
  }
  return covered;
}
