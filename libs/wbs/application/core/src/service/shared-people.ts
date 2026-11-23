import {
  addWorkdays,
  CalendarRangeError,
  deriveNumbers,
  type Elsewhere,
  lastWorkdayOf,
  type Schedule,
  ScheduleCycleError,
  workdayOrdinalOf,
} from '@wbs/domain';

import type { ChainSnapshot, ChainSnapshotStore } from '../ports/chain-snapshot-store';
import type { OrganizationPrincipal } from '../ports/organization-access';
import type { ResolvedPlanInputReads } from '../ports/saved-plan-capture-values';
import type { CapturedScheduler, EngineUnavailable, ScheduleRead } from '../ports/scheduler';
import type {
  ElsewhereHolderLabel,
  InfluencerRead,
  SharedPeopleRead,
} from '../ports/shared-people-values';
import { scheduleInputOfCaptured } from './saved-plan-schedule';

/** Reads the closure inside the adapter's snapshot and returns detached evidence by value. */
export class SharedPeopleReader {
  constructor(private readonly snapshots: ChainSnapshotStore) {}

  read(workPackageId: string, principal: OrganizationPrincipal) {
    return this.snapshots.withSnapshot(principal, workPackageId, (snapshot) =>
      readChain(snapshot, workPackageId),
    );
  }

  /** Reads for background optimizer work under current work package ownership, never a synthetic user. */
  readWorkPackage(workPackageId: string) {
    return this.snapshots.withWorkPackageSnapshot(workPackageId, (snapshot) =>
      readChain(snapshot, workPackageId),
    );
  }
}

/** Derives detached scheduling evidence using a caller-owned observation. */
export async function readChain(
  snapshot: ChainSnapshot,
  workPackageId: string,
): Promise<SharedPeopleRead> {
  const selected = selectInfluencers(snapshot.workPackages, workPackageId);
  const plans: ResolvedPlanInputReads[] = [];
  for (const workPackage of selected)
    plans.push(await snapshot.capturePlan(workPackage.workPackage.id));
  return readSharedPeople(plans, workPackageId, snapshot.scheduler);
}

/**
 * Schedules the influencer closure in rank order, converting displayed bookings through the
 * absolute workday axis. Undated work packages stop traversal. Only engine unavailability refuses
 * a required influencer; cycle/calendar range remain explicit unavailable load evidence.
 * Uses capture reads exclusively: generations, slots, queues and events are outside this read.
 */
export function readSharedPeople(
  plans: readonly ResolvedPlanInputReads[],
  workPackageId: string,
  scheduler: CapturedScheduler,
): SharedPeopleRead {
  const selected = selectInfluencers(plans, workPackageId);
  const bookings = new Map<
    string,
    { start: number; end: number; workPackageId: string; workItemId: string }[]
  >();
  const influencers: InfluencerRead[] = [];
  const labels: HolderLabels = new Map();
  const target = selected.find((each) => each.workPackage.id === workPackageId);
  if (target === undefined) return { kind: 'not_found' };
  for (const reads of selected) {
    const anchor =
      reads.workPackage.startDate === null ? null : workdayOrdinalOf(reads.workPackage.startDate);
    const elsewhere: Elsewhere = new Map(
      [...bookings]
        .filter(([personId]) => reads.assignments.some((each) => each.personId === personId))
        .map(([personId, intervals]) => [
          personId,
          intervals.map((interval) => ({
            ...interval,
            start: interval.start - (anchor ?? 0),
            end: interval.end - (anchor ?? 0),
          })),
        ]),
    );
    try {
      const input = scheduleInputOfCaptured(
        reads,
        anchor === null || elsewhere.size === 0 ? undefined : elsewhere,
      );
      const scheduled = scheduler.read({
        workPackageId: reads.workPackage.id,
        input,
        engine: reads.workPackage.scheduleEngine,
        objective: reads.workPackage.scheduleObjective,
        enabled: reads.workPackage.optimizationEnabled,
        /* Proof: live mode made the cache-publication negative throw at the forbidden admission callback. */ mode: 'capture',
      });
      // Proof: bypassing this refusal failed the required-influencer identity negative.
      if (scheduled.kind === 'engine_unavailable')
        return {
          ...scheduled,
          workPackageId: reads.workPackage.id,
          name: reads.workPackage.name,
          reads: target,
        };
      // Proof: forcing Fast at this influencer boundary made the mounted
      // selected-ready rank witness book B/C at 1/3 instead of 2/4.
      const selected = displaySchedule(reads.workPackage, scheduled);
      const placed = workPackageBookings(reads, selected.planned);
      if (reads.workPackage.id === workPackageId)
        return {
          kind: 'scheduled',
          reads,
          input,
          scheduled,
          influencers,
          holders: holdersOf(scheduled.fast, labels),
        };
      const numbers = deriveNumbers(reads.workItems);
      labels.set(reads.workPackage.id, {
        workPackageName: reads.workPackage.name,
        rows: new Map(
          reads.workItems.map((row) => [row.id, { number: numbers.get(row.id), name: row.name }]),
        ),
      });
      influencers.push({
        workPackageId: reads.workPackage.id,
        name: reads.workPackage.name,
        engine: selected.engine,
        unavailable: null,
      });
      for (const [personId, intervals] of placed) {
        const calendar = [...(bookings.get(personId) ?? []), ...intervals].sort(
          (a, b) => a.start - b.start || a.end - b.end,
        );
        bookings.set(personId, calendar);
      }
    } catch (failure) {
      // Proof: swallowing an unknown failure made the unexpected-scheduler-fault negative return dates.
      if (!(failure instanceof ScheduleCycleError) && !(failure instanceof CalendarRangeError))
        throw failure;
      const reason = failure instanceof ScheduleCycleError ? 'cycle' : 'calendar_range';
      // Proof: returning unavailable for an upstream failure made both
      // mounted cycle/range Retry skip-bookings cases answer 500 instead of 200.
      if (reads.workPackage.id === workPackageId)
        return { kind: 'unavailable', reason, reads, influencers };
      influencers.push({
        workPackageId: reads.workPackage.id,
        name: reads.workPackage.name,
        engine: 'fast',
        unavailable: reason,
      });
    }
  }
  throw new Error('required chain did not schedule its target');
}

/** Each scheduled influencer's name and its rows' numbers and names, by work package id. */
type HolderLabels = Map<
  string,
  {
    readonly workPackageName: string;
    readonly rows: ReadonlyMap<
      string,
      { readonly number: string | undefined; readonly name: string }
    >;
  }
>;

/**
 * One label per holder a target slice names, in the order the slices name them.
 *
 * @throws when a slice names a work package or row the chain read no label for: the holder and the
 * labels come from the one observation, so a miss is a broken chain, never a booking to leave
 * unnamed.
 */
function holdersOf(planned: Schedule, labels: HolderLabels): ElsewhereHolderLabel[] {
  const holders = new Map<string, ElsewhereHolderLabel>();
  for (const slice of planned.slices.values()) {
    const holder = slice.elsewhereHolder;
    if (holder === undefined) continue;
    const key = `${holder.workPackageId}\u0000${holder.workItemId}`;
    if (holders.has(key)) continue;
    const workPackage = labels.get(holder.workPackageId);
    const row = workPackage?.rows.get(holder.workItemId);
    // Proof: this refusal replaced by `continue` made `throws when a target slice
    // names a holder the chain read no label for` (`shared-people.test.ts`) not
    // throw; watched 2026-10-11.
    if (workPackage === undefined || row?.number === undefined)
      throw new Error(
        `booking elsewhere held by ${holder.workPackageId}/${holder.workItemId} has no label`,
      );
    holders.set(key, {
      workPackageId: holder.workPackageId,
      workPackageName: workPackage.workPackageName,
      workItemId: holder.workItemId,
      number: row.number,
      name: row.name,
    });
  }
  return [...holders.values()];
}

/** Chooses the schedule a work package actually displays from one captured engine observation. */
export function displaySchedule(
  settings: Pick<
    ResolvedPlanInputReads['workPackage'],
    'optimizationEnabled' | 'scheduleEngine' | 'scheduleObjective'
  >,
  scheduled: Exclude<ScheduleRead, EngineUnavailable>,
): { readonly planned: Schedule; readonly engine: 'fast' | 'optimized' } {
  const optimization = scheduled.optimization;
  const objective = settings.scheduleObjective;
  // Proof: a capability returning optimization:null made the no-state negative return Fast.
  if (
    settings.optimizationEnabled &&
    settings.scheduleEngine === 'optimized' &&
    optimization === null
  ) {
    throw new Error('optimized chain returned no optimization state');
  }
  if (
    settings.optimizationEnabled &&
    settings.scheduleEngine === 'optimized' &&
    optimization !== null &&
    optimization.variants[objective].state === 'ready'
  ) {
    const planned = optimization.schedules[objective];
    // Proof: omitting this guard made the missing-ready-schedule negative receive a null dereference instead of the trusted-state refusal.
    if (planned === null) throw new Error('ready chain schedule is absent');
    return { planned, engine: 'optimized' };
  }
  return { planned: scheduled.fast, engine: 'fast' };
}

function workPackageBookings(reads: ResolvedPlanInputReads, planned: Schedule) {
  const calendar = new Map<
    string,
    { start: number; end: number; workPackageId: string; workItemId: string }[]
  >();
  const date = reads.workPackage.startDate;
  if (date === null) return calendar;
  // A displayed work package must fit the calendar even when its last work item has no person.
  // Proof: omitting this preflight made all three unassigned out-of-range negatives return available schedules.
  let workPackageFinish = 0;
  for (const placed of planned.workItems.values()) {
    if (placed.earliestFinish > workPackageFinish) workPackageFinish = placed.earliestFinish;
  }
  addWorkdays(date, lastWorkdayOf(0, workPackageFinish));
  const anchor = workdayOrdinalOf(date);
  for (const slice of planned.slices.values()) {
    // Proof: admitting zero-time assigned slices made the zero-duration negative throw on a booking holding no time.
    if (slice.personId === null || slice.earliestFinish <= slice.earliestStart) continue;
    const intervals = calendar.get(slice.personId) ?? [];
    intervals.push({
      start: anchor + slice.earliestStart,
      end: anchor + slice.earliestFinish,
      workPackageId: reads.workPackage.id,
      workItemId: slice.workItemId,
    });
    calendar.set(slice.personId, intervals);
  }
  return calendar;
}

/** Follows shared-person edges only toward higher ranks; undated work packages stop the closure. */
export function selectInfluencers<
  T extends {
    readonly workPackage: Pick<ResolvedPlanInputReads['workPackage'], 'id' | 'startDate'>;
    readonly assignments: ResolvedPlanInputReads['assignments'];
  },
>(plans: readonly T[], workPackageId: string): readonly T[] {
  const targetIndex = plans.findIndex((each) => each.workPackage.id === workPackageId);
  const target = plans.at(targetIndex);
  if (targetIndex < 0 || target === undefined) return [];
  const required = new Set([workPackageId]);
  if (target.workPackage.startDate !== null) {
    const people = new Set(target.assignments.map((each) => each.personId));
    // Reverse rank traversal computes transitive edges without recursive live reads.
    for (let index = targetIndex - 1; index >= 0; index--) {
      const candidate = plans.at(index);
      // Proof: a missing rank slot without this guard produced a property dereference instead of the trusted-state refusal.
      if (candidate === undefined) throw new Error('rank index has no captured work package');
      // Proof: admitting undated bridges made the undated-bridge negative include A/B instead of no influencers.
      if (
        candidate.workPackage.startDate === null ||
        !candidate.assignments.some((each) => people.has(each.personId))
      )
        continue;
      required.add(candidate.workPackage.id);
      // Proof: dropping person expansion made the transitive Ana→Ben negative place C at 2 instead of 3.
      for (const assignment of candidate.assignments) people.add(assignment.personId);
    }
  }
  return plans.slice(0, targetIndex + 1).filter((each) => required.has(each.workPackage.id));
}
