import {
  type Elsewhere,
  type ElsewhereBooking,
  type IsoDate,
  type Schedule,
  snapWorkdays,
  withinDrift,
  workdayOrdinalOf,
} from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

/**
 * One booking on the organization's absolute workday axis
 * ({@link workdayOrdinalOf} plus the holding project's offset), so bookings of
 * projects with different start dates compare directly.
 */
export interface HeldBooking {
  readonly start: number;
  readonly end: number;
  readonly projectId: string;
  readonly workItemId: string;
}

/** No bookings elsewhere: every plan nothing outranks, and every isolated organization's. */
export const NO_BOOKINGS_ELSEWHERE: Elsewhere = new Map();

/** Every person's bookings so far in a chain read, by person id, in placement order. */
export type RunningBookings = Map<string, HeldBooking[]>;

/** The people a canonical input's slices name: whom its schedule can place. */
export function peopleIn(input: ScheduleInput): Set<string> {
  const named = new Set<string>();
  for (const slice of input.slices) if (slice.personId !== null) named.add(slice.personId);
  return named;
}

/**
 * The influencers of `projectId` (spec `elsewhere-scheduling`, "The chain
 * reads influencers in rank order"): the projects ranked above it that share a
 * person with it or with another influencer, highest first.
 *
 * Computed from who is assigned where, with no scheduling. It over-reaches on
 * purpose where that is cheaper than precision: a project sharing a person
 * only with an influencer ranked above it cannot move this project, and is
 * scheduled all the same. Its bookings then reach nothing, because
 * {@link elsewhereFor} keeps only the people this project names.
 *
 * Proof: the closure cut to one step (only projects sharing a person with
 * `projectId` itself) made `reaches a project above through a shared person
 * of another influencer` (`elsewhere-chain.test.ts`) leave A out, and
 * `schedules C around B's bookings as they stand after A's`
 * (`shared-people.controller.db.test.ts`) start C at 4 instead of 6; watched
 * 2026-09-29.
 *
 * @throws when `order` does not hold `projectId`: the order and the project
 * were read for one organization, so a miss is a broken caller.
 */
export function influencersOf(
  projectId: string,
  order: readonly string[],
  peopleOf: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const at = order.indexOf(projectId);
  if (at === -1) throw new Error(`project ${projectId} is not in its organization's rank order`);
  const above = order.slice(0, at);
  const names = new Set(peopleOf.get(projectId));
  const reached = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const candidate of above) {
      if (reached.has(candidate)) continue;
      const people = peopleOf.get(candidate);
      if (people === undefined || ![...people].some((person) => names.has(person))) continue;
      reached.add(candidate);
      for (const person of people) names.add(person);
      grew = true;
    }
  }
  return above.filter((candidate) => reached.has(candidate));
}

/**
 * A project's bookings, from the schedule it displays, on the absolute axis:
 * each slice holding a person and some time.
 *
 * Offsets are snapped before they are placed on the axis, as the load view
 * does (`person-load.feature.ts`), so a drifted hand-off is not a sliver of
 * overlap.
 */
export function bookingsOf(
  projectId: string,
  startDate: IsoDate,
  planned: Schedule,
): RunningBookings {
  const anchor = workdayOrdinalOf(startDate);
  const byPerson: RunningBookings = new Map();
  for (const slice of planned.slices.values()) {
    if (slice.personId === null) continue;
    const start = anchor + snapWorkdays(slice.earliestStart);
    const end = anchor + snapWorkdays(slice.earliestFinish);
    if (end <= start) continue;
    const booking = { start, end, projectId, workItemId: slice.workItemId };
    const held = byPerson.get(slice.personId);
    if (held === undefined) byPerson.set(slice.personId, [booking]);
    else held.push(booking);
  }
  return byPerson;
}

/** Adds `added` to `running`, person by person. */
export function addBookings(running: RunningBookings, added: RunningBookings): void {
  for (const [person, bookings] of added) {
    const held = running.get(person);
    if (held === undefined) running.set(person, [...bookings]);
    else held.push(...bookings);
  }
}

/**
 * The bookings elsewhere of the people `names`, in the offsets of a project
 * starting on `startDate`: sorted, clamped at day 0, and without any that end
 * before it — nothing is placed before day 0, and a booking that cannot touch
 * the plan should not move its hash.
 *
 * One person's bookings from different influencers are disjoint by
 * construction, because the lower of two projects sharing a person works
 * around the higher one. Moving them between two projects' offsets adds and
 * subtracts whole-workday anchors, which can leave a hand-off a few ulps into
 * the booking before it; within {@link withinDrift} that start is the previous
 * end.
 *
 * @throws when two bookings of one person overlap by more than drift: the
 * chain's invariant is broken, and scheduling around the overlap would place
 * work on an answer nobody computed.
 */
export function elsewhereFor(
  names: ReadonlySet<string>,
  running: RunningBookings,
  startDate: IsoDate,
): Elsewhere {
  const anchor = workdayOrdinalOf(startDate);
  const elsewhere = new Map<string, ElsewhereBooking[]>();
  for (const person of [...names].sort()) {
    const held = running.get(person);
    if (held === undefined) continue;
    const bookings: ElsewhereBooking[] = [];
    let previousEnd = 0;
    for (const booking of [...held].sort((a, b) => a.start - b.start || a.end - b.end)) {
      const end = booking.end - anchor;
      let start = Math.max(0, booking.start - anchor);
      if (start < previousEnd) {
        if (!withinDrift(start, previousEnd)) {
          throw new Error(`bookings elsewhere of ${person} overlap across projects`);
        }
        start = previousEnd;
      }
      if (end <= start) continue;
      bookings.push({
        start,
        end,
        projectId: booking.projectId,
        workItemId: booking.workItemId,
      });
      previousEnd = end;
    }
    if (bookings.length > 0) elsewhere.set(person, bookings);
  }
  return elsewhere;
}

/** `input` with `elsewhere` stated, or unchanged when it is empty, so its hash stays. */
export function withElsewhere(input: ScheduleInput, elsewhere: Elsewhere): ScheduleInput {
  return elsewhere.size === 0 ? input : { ...input, elsewhere };
}
