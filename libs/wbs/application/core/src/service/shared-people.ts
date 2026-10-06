import {
  addWorkdays,
  CalendarRangeError,
  type Elsewhere,
  lastWorkdayOf,
  type Schedule,
  ScheduleCycleError,
  workdayOrdinalOf,
} from '@wbs/domain';

import type { ChainSnapshot, ChainSnapshotStore } from '../ports/chain-snapshot-store';
import type { OrganizationPrincipal } from '../ports/organization-access';
import type { PlanInputReads } from '../ports/saved-plan-capture-values';
import type { CapturedScheduler, EngineUnavailable, ScheduleRead } from '../ports/scheduler';
import type { InfluencerRead, SharedPeopleRead } from '../ports/shared-people-values';
import { scheduleInputOfCaptured } from './saved-plan-schedule';

/** Reads the closure inside the adapter's snapshot and returns detached evidence by value. */
export class SharedPeopleReader {
  constructor(private readonly snapshots: ChainSnapshotStore) {}

  read(projectId: string, principal: OrganizationPrincipal) {
    return this.snapshots.withSnapshot(principal, projectId, (snapshot) =>
      readChain(snapshot, projectId),
    );
  }

  /** Reads for background optimizer work under current project ownership, never a synthetic user. */
  readProject(projectId: string) {
    return this.snapshots.withProjectSnapshot(projectId, (snapshot) =>
      readChain(snapshot, projectId),
    );
  }
}

/** Derives detached scheduling evidence using a caller-owned observation. */
export async function readChain(
  snapshot: ChainSnapshot,
  projectId: string,
): Promise<SharedPeopleRead> {
  const selected = selectInfluencers(snapshot.projects, projectId);
  const plans: PlanInputReads[] = [];
  for (const project of selected) plans.push(await snapshot.capturePlan(project.project.id));
  return readSharedPeople(plans, projectId, snapshot.scheduler);
}

/**
 * Schedules the influencer closure in rank order, converting displayed bookings through the
 * absolute workday axis. Undated projects stop traversal. Only engine unavailability refuses
 * a required influencer; cycle/calendar range remain explicit unavailable load evidence.
 * Uses capture reads exclusively: generations, slots, queues and events are outside this read.
 */
export function readSharedPeople(
  plans: readonly PlanInputReads[],
  projectId: string,
  scheduler: CapturedScheduler,
): SharedPeopleRead {
  const selected = selectInfluencers(plans, projectId);
  const bookings = new Map<
    string,
    { start: number; end: number; projectId: string; workItemId: string }[]
  >();
  const influencers: InfluencerRead[] = [];
  const target = selected.find((each) => each.project.id === projectId);
  if (target === undefined) return { kind: 'not_found' };
  for (const reads of selected) {
    const anchor =
      reads.project.startDate === null ? null : workdayOrdinalOf(reads.project.startDate);
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
        projectId: reads.project.id,
        input,
        engine: reads.project.scheduleEngine,
        objective: reads.project.scheduleObjective,
        enabled: reads.project.optimizationEnabled,
        /* Proof: live mode made the cache-publication negative throw at the forbidden admission callback. */ mode: 'capture',
      });
      // Proof: bypassing this refusal failed the required-influencer identity negative.
      if (scheduled.kind === 'engine_unavailable')
        return {
          ...scheduled,
          projectId: reads.project.id,
          name: reads.project.name,
          reads: target,
        };
      // Proof: forcing Fast at this influencer boundary made the mounted
      // selected-ready rank witness book B/C at 1/3 instead of 2/4.
      const selected = displaySchedule(reads.project, scheduled);
      const placed = projectBookings(reads, selected.planned);
      if (reads.project.id === projectId)
        return { kind: 'scheduled', reads, input, scheduled, influencers };
      influencers.push({
        projectId: reads.project.id,
        name: reads.project.name,
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
      if (reads.project.id === projectId)
        return { kind: 'unavailable', reason, reads, influencers };
      influencers.push({
        projectId: reads.project.id,
        name: reads.project.name,
        engine: 'fast',
        unavailable: reason,
      });
    }
  }
  throw new Error('required chain did not schedule its target');
}

/** Chooses the schedule a project actually displays from one captured engine observation. */
export function displaySchedule(
  settings: Pick<
    PlanInputReads['project'],
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

function projectBookings(reads: PlanInputReads, planned: Schedule) {
  const calendar = new Map<
    string,
    { start: number; end: number; projectId: string; workItemId: string }[]
  >();
  const date = reads.project.startDate;
  if (date === null) return calendar;
  // A displayed project must fit the calendar even when its last work item has no person.
  // Proof: omitting this preflight made all three unassigned out-of-range negatives return available schedules.
  let projectFinish = 0;
  for (const placed of planned.workItems.values()) {
    if (placed.earliestFinish > projectFinish) projectFinish = placed.earliestFinish;
  }
  addWorkdays(date, lastWorkdayOf(0, projectFinish));
  const anchor = workdayOrdinalOf(date);
  for (const slice of planned.slices.values()) {
    // Proof: admitting zero-time assigned slices made the zero-duration negative throw on a booking holding no time.
    if (slice.personId === null || slice.earliestFinish <= slice.earliestStart) continue;
    const intervals = calendar.get(slice.personId) ?? [];
    intervals.push({
      start: anchor + slice.earliestStart,
      end: anchor + slice.earliestFinish,
      projectId: reads.project.id,
      workItemId: slice.workItemId,
    });
    calendar.set(slice.personId, intervals);
  }
  return calendar;
}

/** Follows shared-person edges only toward higher ranks; undated projects stop the closure. */
export function selectInfluencers<T extends Pick<PlanInputReads, 'project' | 'assignments'>>(
  plans: readonly T[],
  projectId: string,
): readonly T[] {
  const targetIndex = plans.findIndex((each) => each.project.id === projectId);
  const target = plans.at(targetIndex);
  if (targetIndex < 0 || target === undefined) return [];
  const required = new Set([projectId]);
  if (target.project.startDate !== null) {
    const people = new Set(target.assignments.map((each) => each.personId));
    // Reverse rank traversal computes transitive edges without recursive live reads.
    for (let index = targetIndex - 1; index >= 0; index--) {
      const candidate = plans.at(index);
      // Proof: a missing rank slot without this guard produced a property dereference instead of the trusted-state refusal.
      if (candidate === undefined) throw new Error('rank index has no captured project');
      // Proof: admitting undated bridges made the undated-bridge negative include A/B instead of no influencers.
      if (
        candidate.project.startDate === null ||
        !candidate.assignments.some((each) => people.has(each.personId))
      )
        continue;
      required.add(candidate.project.id);
      // Proof: dropping person expansion made the transitive Ana→Ben negative place C at 2 instead of 3.
      for (const assignment of candidate.assignments) people.add(assignment.personId);
    }
  }
  return plans.slice(0, targetIndex + 1).filter((each) => required.has(each.project.id));
}
