import {
  addWorkdays,
  type EstimateMethod,
  finalDays,
  type IsoDate,
  workdaysBetween,
} from '@wbs/domain';

import type {
  DependencyStore,
  DirectoryStore,
  EstimateStore,
  Project,
  ProjectStore,
  Reparented,
  StoredEstimate,
  WorkItem,
  WorkItemPatch,
  WorkItemStore,
} from '../repository';
import type { Broadcaster } from './broadcast';
import { withAncestors } from './broadcast';
import { canDepend } from './dependency';
import { deriveNumbers } from './derive-numbers';
import { placeAfter, POSITION_STEP, type Sibling } from './place-sibling';
import { canEdit } from './project.service';
import { type Days, rollUp } from './roll-up';
import { schedule, ScheduleCycleError, type Scheduled } from './schedule';

/**
 * What a work item shows before any schedule could be computed for it.
 *
 * Reached only when a row is absent from the schedule, which cannot happen for a
 * row the schedule was given. It exists so the type has no optional field: an
 * absent schedule and a zero-day one look identical to a caller, and only one of
 * them is a plan.
 */
const UNSCHEDULED: Scheduled = {
  duration: 0,
  estimated: false,
  earliestStart: 0,
  earliestFinish: 0,
  latestStart: 0,
  latestFinish: 0,
  float: 0,
  critical: false,
};

/**
 * Planning days per leaf: every role's final figure, summed.
 *
 * Summing assumes the roles run one after another — Dev finishes, then QA
 * starts. That is the common case and the conservative one; a team that runs
 * them together sees a schedule slightly longer than reality, which is the
 * harmless direction for a plan. Modelling it properly needs to know who does
 * what and when, which needs assignees, which this does not have.
 *
 * A leaf with no estimate is **absent** from the map rather than zero, which is
 * what lets the schedule report it as unestimated instead of instant.
 */
function durationsOf(
  rows: readonly WorkItem[],
  estimates: readonly StoredEstimate[],
  hasChildren: ReadonlySet<string>,
  method: EstimateMethod,
): Map<string, number> {
  const durations = new Map<string, number>();
  for (const estimate of estimates) {
    if (hasChildren.has(estimate.workItemId)) continue;
    if (!rows.some((row) => row.id === estimate.workItemId)) continue;
    durations.set(
      estimate.workItemId,
      (durations.get(estimate.workItemId) ?? 0) + finalDays(estimate, method),
    );
  }
  return durations;
}

/**
 * A row's assignees, and who — if anyone — is assumed to be doing every phase.
 *
 * Exactly one assignee means that person does the lot; two or more means each
 * is doing their own, and none means nobody has been named. Reading it from
 * the assignments rather than storing it keeps one fact in one place: assign
 * the second role and the assumption ends by itself.
 */
function phasesOf(assignees: Record<string, string>): {
  assignees: Record<string, string>;
  doesEveryPhase: string | null;
} {
  const named = Object.values(assignees);
  return { assignees, doesEveryPhase: named.length === 1 ? (named[0] ?? null) : null };
}

/**
 * One row's span as calendar days, or null when it cannot have one.
 *
 * Null in two cases, both of them honest: the project is not on a calendar, or
 * the schedule could not be computed at all. Printing a date from a schedule
 * that failed would be the same confident lie as printing a page of zeroes,
 * which the banner above the table exists to prevent.
 *
 * The finish is nudged back inside the span: a task of any length occupies the
 * day it finishes on, so a one-day task starting Monday ends Monday rather
 * than Tuesday. A zero-length row — a parent with nothing under it, or an
 * unestimated leaf — starts and ends the same day.
 */
function datesOf(
  startDate: IsoDate | null,
  timing: Scheduled,
  failed: boolean,
): { startsOn: IsoDate; endsOn: IsoDate } | null {
  if (startDate === null || failed) return null;
  // The last day the work is still on: the day containing `earliestFinish`,
  // minus the one it would otherwise spill into. `ceil - 1` rather than
  // `finish - Number.EPSILON`, which was the first attempt and silently did
  // nothing — at a finish of 4 the epsilon is smaller than the gap between
  // representable doubles, so the subtraction rounded straight back to 4 and a
  // two-day task claimed a third day. A zero-length row keeps its start.
  const lastDay = Math.max(timing.earliestStart, Math.ceil(timing.earliestFinish) - 1);
  return {
    startsOn: addWorkdays(startDate, timing.earliestStart),
    endsOn: addWorkdays(startDate, lastDay),
  };
}

/**
 * One row's final figure per role, and their sum, under the project's method.
 *
 * Split out so the shape is built in one place: `finalDays` and `finalTotal`
 * disagreeing would be two answers to one question, and the table prints both
 * side by side.
 */
function finalsOf(
  byRole: ReadonlyMap<string, Days>,
  method: EstimateMethod,
): { finalDays: Record<string, number>; finalTotal: number } {
  const perRole: Record<string, number> = {};
  let total = 0;
  for (const [roleId, days] of byRole) {
    const final = finalDays(days, method);
    perRole[roleId] = final;
    total += final;
  }
  return { finalDays: perRole, finalTotal: total };
}

/**
 * A work item as a reader sees it: the stored row, the number derived for it and
 * its estimates by role — its own if it is a leaf, its descendants' sums if not.
 */
export interface NumberedWorkItem extends WorkItem {
  number: string;
  estimates: Record<string, Days>;
  /** True when the estimates above are sums and therefore not editable here. */
  rolledUp: boolean;
  /** The work items this one waits for, as written — either end may be a parent. */
  dependsOn: string[];
  /**
   * The one number this row is planned with, per role, and their sum.
   *
   * Computed here rather than on the client, from the same {@link finalDays}
   * the schedule's durations come from. Two implementations of "the final
   * estimate" is how a table comes to disagree with the dates printed beside
   * it, and this figure sits in the next column along from those dates.
   *
   * A role with no estimate anywhere below is absent, exactly as `estimates`
   * is: absent and zero mean opposite things.
   */
  finalDays: Record<string, number>;
  /** Every role's final figure, summed — the row's whole planning duration. */
  finalTotal: number;
  /**
   * When this can happen, in whole days from the project's day zero.
   *
   * `estimates` above is **effort** and this is **span**, and for a parent they
   * are different numbers: two independent children of 3 and 4 days are 7 days
   * of work inside a 4-day branch. Both are true and neither substitutes.
   */
  schedule: Scheduled;
  /**
   * When this happens on a calendar, or null while the project has no start
   * date.
   *
   * Working days only: weekends are skipped, so a five-day task starting on a
   * Thursday ends on the following Wednesday. Public holidays are not modelled
   * — they differ by country, company and year, and inventing them would put
   * dates in a plan nobody can account for.
   *
   * `endsOn` is the day the work item is still being worked on, not the day
   * after: a one-day task starting Monday ends Monday.
   */
  dates: { startsOn: IsoDate; endsOn: IsoDate } | null;
  /**
   * Who is doing this work, by role id.
   *
   * A role with nobody assigned is absent rather than null. When exactly one
   * role is assigned, `doesEveryPhase` names that person: Dany's "when just
   * one is assigned it is assumed they do both dev and QA". It is reported as
   * a reading of the assignments rather than written as a second row, so
   * nobody is recorded against work they were never given, and assigning the
   * other role simply stops the assumption.
   */
  assignees: Record<string, string>;
  doesEveryPhase: string | null;
}

/** Why a project has no dates, when it has none. `null` is the ordinary case. */
export type ScheduleError = 'cycle' | null;

export type DeleteStrategy = 'cascade' | 'promote';

export type WorkItemRefusal =
  | 'not_found'
  | 'forbidden'
  | 'strategy_required'
  | 'cycle'
  | 'frozen'
  | 'rolled_up'
  /** A dependency onto the work item's own ancestor, descendant, or itself. */
  | 'ancestor';

export type WorkItemOutcome<T> = { ok: true; result: T } | { ok: false; reason: WorkItemRefusal };

export interface CreateWorkItem {
  parentId: string | null;
  afterId: string | null;
  name?: string;
  notes?: string;
}

export interface MoveWorkItem {
  parentId: string | null;
  afterId: string | null;
}

export interface WorkItemServiceOptions {
  workItems: WorkItemStore;
  projects: ProjectStore;
  estimates: EstimateStore;
  directory: DirectoryStore;
  dependencies: DependencyStore;
  broadcast: Broadcaster;
  newId?: () => string;
}

const asSibling = (workItem: WorkItem): Sibling => ({
  id: workItem.id,
  position: workItem.position,
});

/** Whether `candidateId` sits anywhere below `ancestorId`, walking parents upward. */
function descendsFrom(rows: readonly WorkItem[], candidateId: string, ancestorId: string): boolean {
  const parentOf = new Map(rows.map((w) => [w.id, w.parentId]));
  let cursor: string | null | undefined = candidateId;
  while (cursor !== null && cursor !== undefined) {
    if (cursor === ancestorId) return true;
    cursor = parentOf.get(cursor);
  }
  return false;
}

/** `rootId` and everything beneath it. */
function subtreeOf(rows: readonly WorkItem[], rootId: string): string[] {
  const childrenOf = new Map<string | null, WorkItem[]>();
  for (const row of rows) {
    const group = childrenOf.get(row.parentId) ?? [];
    group.push(row);
    childrenOf.set(row.parentId, group);
  }
  const collected: string[] = [];
  const visit = (id: string): void => {
    collected.push(id);
    for (const child of childrenOf.get(id) ?? []) visit(child.id);
  };
  visit(rootId);
  return collected;
}

export class WorkItemService {
  private readonly newId: () => string;

  constructor(private readonly opts: WorkItemServiceOptions) {
    this.newId = opts.newId ?? (() => crypto.randomUUID());
  }

  /**
   * Every work item in the project, each carrying the number derived for it,
   * ordered as the tree reads.
   *
   * Sorting by the derived number rather than by position is what makes the
   * padding rules load-bearing: the numbers are built so that this one
   * lexicographic sort produces tree order across every level at once.
   */
  /**
   * The project's work items, and the event sequence the read happened at.
   *
   * The sequence is read *before* the rows rather than after. Reading it after
   * would let an event recorded mid-read be counted as already seen, and the
   * client would resume from a point past a change its rows do not contain. Read
   * first, the same event is replayed and the client refetches once too often —
   * the harmless direction.
   */
  async tree(projectId: string): Promise<{
    workItems: NumberedWorkItem[];
    seq: number;
    scheduleError: ScheduleError;
    estimateMethod: EstimateMethod;
    startDate: IsoDate | null;
  } | null> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return null;
    const seq = await this.opts.broadcast.latestSeq(projectId);
    const rows = await this.opts.workItems.listByProject(projectId);
    const stored = await this.opts.estimates.listByProject(projectId);
    const edges = await this.opts.dependencies.listByProject(projectId);
    const assigned = await this.opts.directory.assignmentsOf(rows.map((row) => row.id));
    const assigneesOf = new Map<string, Record<string, string>>();
    for (const each of assigned) {
      assigneesOf.set(each.workItemId, {
        ...(assigneesOf.get(each.workItemId) ?? {}),
        [each.roleId]: each.personId,
      });
    }
    const numbers = deriveNumbers(rows);
    const totals = rollUp(rows, stored);
    const hasChildren = new Set(rows.map((row) => row.parentId).filter((id) => id !== null));
    // The write path refuses an edge that would close a cycle, but two clients
    // drawing conflicting edges at the same instant are each checked against the
    // graph as they read it. If one ever lands, every read of this project must
    // still work: the rows are there, and a plan nobody can open is worse than
    // one with no dates in it. The dates go, the rows stay, and the reason is
    // reported rather than left as a page of zeroes.
    const durations = durationsOf(rows, stored, hasChildren, project.estimateMethod);
    // A manual date becomes an offset before the pass, and offsets become dates
    // after it: the schedule itself never sees a calendar, so weekends are
    // counted in exactly one place. Without a project start date there is
    // nothing to count from, so the constraints are simply not applied — a
    // plan off the calendar is the state it has always been in.
    const notBefore = new Map<string, number>();
    if (project.startDate !== null) {
      for (const row of rows) {
        if (row.startNoEarlierThan === null) continue;
        notBefore.set(row.id, workdaysBetween(project.startDate, row.startNoEarlierThan));
      }
    }
    let timing = new Map<string, Scheduled>();
    let scheduleError: ScheduleError = null;
    try {
      timing = schedule(rows, edges, durations, notBefore);
    } catch (err) {
      // Only the modeled failure. An unqualified catch here turned every
      // exception in this block — a stack overflow on a pathological tree, a
      // future mistake in `durationsOf` — into "your dependencies run in a
      // circle", which is a lie told confidently. R5: unknown is not OK.
      if (!(err instanceof ScheduleCycleError)) throw err;
      scheduleError = 'cycle';
    }
    const waitingFor = new Map<string, string[]>();
    for (const found of edges) {
      waitingFor.set(found.successorId, [
        ...(waitingFor.get(found.successorId) ?? []),
        found.predecessorId,
      ]);
    }
    const workItems = rows
      .map((row) => ({
        ...row,
        number: numbers.get(row.id) ?? '',
        estimates: Object.fromEntries(totals.get(row.id) ?? []),
        // A parent's final figure is its rolled-up totals put through the same
        // method, not the sum of its children's finals. For PERT the two agree
        // (the weighting is linear); for the others they agree too, since each
        // picks one point and the points are summed. Doing it from the totals
        // keeps one path rather than two that happen to match today.
        ...finalsOf(totals.get(row.id) ?? new Map(), project.estimateMethod),
        rolledUp: hasChildren.has(row.id),
        // Only predecessors that are in this project. A stored edge naming a
        // work item from elsewhere — which the schema does not prevent — would
        // otherwise be reported as a dependency on a number nobody can see.
        dependsOn: (waitingFor.get(row.id) ?? []).filter((id) => rows.some((r) => r.id === id)),
        ...phasesOf(assigneesOf.get(row.id) ?? {}),
        schedule: timing.get(row.id) ?? UNSCHEDULED,
        dates: datesOf(
          project.startDate,
          timing.get(row.id) ?? UNSCHEDULED,
          scheduleError !== null,
        ),
      }))
      .sort((a, b) => (a.number < b.number ? -1 : a.number > b.number ? 1 : 0));
    return {
      workItems,
      seq,
      scheduleError,
      estimateMethod: project.estimateMethod,
      startDate: project.startDate,
    };
  }

  async create(
    projectId: string,
    actorId: string,
    input: CreateWorkItem,
  ): Promise<WorkItemOutcome<WorkItem>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };

    const rows = await this.opts.workItems.listByProject(projectId);
    // `rows` is this project only, so a parent that is not among them belongs to
    // another project — or to none. The schema cannot catch it: `parent_id`
    // references `work_item.id` alone, not `(project_id, id)`. Accepting it
    // makes the row unreachable from any root here, and every later read of the
    // project throws instead of rendering.
    if (input.parentId !== null && !rows.some((row) => row.id === input.parentId)) {
      return { ok: false, reason: 'not_found' };
    }
    const placed = placeAfter(this.groupUnder(rows, input.parentId), input.afterId);
    const workItem: WorkItem = {
      id: this.newId(),
      projectId,
      parentId: input.parentId,
      position: placed.position,
      name: input.name ?? '',
      notes: input.notes ?? '',
      frozenNumber: null,
      startNoEarlierThan: null,
      serviceTeamId: null,
    };
    await this.opts.workItems.insert(workItem, placed.renumbered);
    // A work item that had an estimate and now has a child no longer holds one:
    // the estimate described the work, and the work is the child now. Moving it
    // down keeps the total identical, which is what makes this safe to do
    // silently — the plan's numbers do not shift under the user.
    if (input.parentId !== null && !rows.some((row) => row.parentId === input.parentId)) {
      await this.opts.estimates.moveAll(input.parentId, workItem.id);
    }
    await this.announceTree(projectId);
    return { ok: true, result: workItem };
  }

  async patch(
    id: string,
    actorId: string,
    patch: WorkItemPatch,
  ): Promise<WorkItemOutcome<WorkItem>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const updated = await this.opts.workItems.patch(id, patch);
    if (updated === null) return { ok: false, reason: 'not_found' };
    await this.announceWorkItem(updated.projectId, id);
    return { ok: true, result: updated };
  }

  /**
   * Sets, replaces or clears who does one work item's work for one role.
   *
   * The person is deliberately **not** checked against the work item's
   * `serviceTeamId`: Dany's call, 2026-08-06 — "keep people and service/team
   * lists decoupled for the work item". A team labels the work, a person does
   * it, and a platform engineer picking up a piece of billing work is an
   * ordinary Tuesday rather than a mistake to refuse.
   */
  async assign(
    id: string,
    actorId: string,
    roleId: string,
    personId: string | null,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    await this.opts.directory.assign(id, roleId, personId);
    await this.announceWorkItem(context.result.workItem.projectId, id);
    return { ok: true, result: null };
  }

  async move(id: string, actorId: string, input: MoveWorkItem): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.result;

    // A frozen number has left the tool — it is in someone's ticket. Moving the
    // row would either break that reference or quietly stop it meaning what it
    // said, so the freeze has to be lifted deliberately first.
    if (workItem.frozenNumber !== null) return { ok: false, reason: 'frozen' };

    // Same reason as in `create`: a parent outside this project detaches the row
    // from every root here.
    if (input.parentId !== null && !rows.some((row) => row.id === input.parentId)) {
      return { ok: false, reason: 'not_found' };
    }

    // Moving a work item beneath itself detaches its whole subtree from every
    // root: the rows survive, no number can be derived for them, and the project
    // reads as though the work vanished.
    if (input.parentId !== null && descendsFrom(rows, input.parentId, id)) {
      return { ok: false, reason: 'cycle' };
    }

    const group = this.groupUnder(rows, input.parentId).filter((sibling) => sibling.id !== id);
    const placed = placeAfter(group, input.afterId);
    await this.opts.workItems.move(id, input.parentId, placed.position, placed.renumbered);
    await this.announceTree(workItem.projectId);
    return { ok: true, result: null };
  }

  async remove(
    id: string,
    actorId: string,
    strategy: DeleteStrategy | null,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.result;

    const children = rows
      .filter((row) => row.parentId === id)
      .sort((a, b) => a.position - b.position);
    // A parent carries work below it that the caller may not have on screen, so
    // which of the two things they meant is theirs to say.
    if (children.length > 0 && strategy === null) return { ok: false, reason: 'strategy_required' };

    if (children.length === 0 || strategy === 'cascade') {
      // The mirror of the rule in `create`: a parent losing its last child takes
      // the estimates back, so the work is still described somewhere.
      //
      // The totals rather than the rows. `moveAll` alone was wrong whenever the
      // deleted child was itself a parent: its figures live on its descendants,
      // it holds no estimate rows of its own, so nothing moved and the whole
      // subtree's estimates were then deleted with it.
      const parentId = workItem.parentId;
      const doomed = subtreeOf(rows, id);
      if (parentId !== null && rows.filter((row) => row.parentId === parentId).length === 1) {
        const totals = rollUp(rows, await this.opts.estimates.listByProject(workItem.projectId));
        for (const [roleId, days] of totals.get(id) ?? []) {
          await this.opts.estimates.set({ workItemId: parentId, roleId, ...days });
        }
      }
      // Edges first, and every one touching anything in the subtree. The
      // foreign keys refuse a delete that would orphan one, so this is not
      // tidiness: without it, deleting a work item anything depends on fails
      // with a constraint error the caller cannot act on.
      for (const gone of doomed) await this.opts.dependencies.removeAllFor(gone);
      await this.opts.workItems.remove(doomed, []);
      await this.announceTree(workItem.projectId);
      return { ok: true, result: null };
    }

    const formerGroup = rows
      .filter((row) => row.parentId === workItem.parentId)
      .sort((a, b) => a.position - b.position);
    const promoted: Reparented[] = formerGroup
      .flatMap((sibling) => (sibling.id === id ? children : [sibling]))
      .map((sibling, i) => ({
        id: sibling.id,
        parentId: workItem.parentId,
        position: (i + 1) * POSITION_STEP,
      }));
    // The same reason as the cascade branch above: an edge to a row that is
    // going has nothing to point at, and the foreign keys say so. Only this row
    // leaves here — its children are promoted, and their edges stay valid.
    await this.opts.dependencies.removeAllFor(id);
    await this.opts.workItems.remove([id], promoted);
    await this.announceTree(workItem.projectId);
    return { ok: true, result: null };
  }

  /**
   * Writes the currently derived number of every work item that has none stored.
   *
   * Work items added afterwards keep deriving, so a project can be frozen,
   * planned into further, and frozen again — each freeze pinning only what was
   * unpinned at the time. Numbers already stored are not rewritten, which is the
   * whole point: they are what left the tool.
   */
  async freeze(projectId: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };

    const rows = await this.opts.workItems.listByProject(projectId);
    const numbers = deriveNumbers(rows);
    const updates = rows
      .filter((row) => row.frozenNumber === null)
      .map((row) => ({ id: row.id, frozenNumber: numbers.get(row.id) ?? null }));
    await this.opts.workItems.setFrozenNumbers(updates);
    await this.announceTree(projectId);
    return { ok: true, result: null };
  }

  /** Returns one work item to deriving, which is what lets it move again. */
  async unfreeze(id: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    await this.opts.workItems.setFrozenNumbers([{ id, frozenNumber: null }]);
    await this.announceTree(context.result.workItem.projectId);
    return { ok: true, result: null };
  }

  async unfreezeProject(projectId: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };

    const rows = await this.opts.workItems.listByProject(projectId);
    await this.opts.workItems.setFrozenNumbers(
      rows
        .filter((row) => row.frozenNumber !== null)
        .map((row) => ({
          id: row.id,
          frozenNumber: null,
          startNoEarlierThan: null,
          serviceTeamId: null,
        })),
    );
    await this.announceTree(projectId);
    return { ok: true, result: null };
  }

  /**
   * Writes one work item's estimate for one role.
   *
   * Refused for a work item that has children: its figures are the sum of what
   * is below it, and a stored estimate there would either be ignored or
   * double-counted. Neither is visible to whoever typed it.
   */
  async setEstimate(
    id: string,
    actorId: string,
    roleId: string,
    days: Days,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { rows } = context.result;
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    await this.opts.estimates.set({ workItemId: id, roleId, ...days });
    await this.announceWorkItem(context.result.workItem.projectId, id);
    return { ok: true, result: null };
  }

  /** Sends the whole tree, for a change that can renumber more than it touched. */
  /**
   * Records "`predecessorId` must finish before this starts".
   *
   * Broadcast as a whole-tree change, not a patch: one edge moves every date
   * downstream of it, and working out which rows those are is the schedule's
   * job, computed on read.
   */
  async addDependency(
    id: string,
    actorId: string,
    predecessorId: string,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.result;

    const existing = await this.opts.dependencies.listByProject(workItem.projectId);
    // `rows` is this project's only, so a predecessor from another project is
    // simply not among them and comes back `not_found` — the cross-project case
    // is unrepresentable rather than separately guarded.
    const refusal = canDepend(rows, existing, predecessorId, id);
    if (refusal !== null) return { ok: false, reason: refusal };

    await this.opts.dependencies.add({
      id: this.newId(),
      projectId: workItem.projectId,
      predecessorId,
      successorId: id,
    });
    await this.announceTree(workItem.projectId);
    return { ok: true, result: null };
  }

  /** Removing an edge that was not there is not an error; the state asked for is the state left. */
  async removeDependency(
    id: string,
    actorId: string,
    predecessorId: string,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;

    await this.opts.dependencies.remove(predecessorId, id);
    await this.announceTree(context.result.workItem.projectId);
    return { ok: true, result: null };
  }

  private async announceTree(projectId: string): Promise<void> {
    const tree = await this.tree(projectId);
    if (tree === null) return;
    await this.opts.broadcast.publish(projectId, {
      type: 'tree_replaced',
      workItems: tree.workItems,
    });
  }

  /** Sends one work item and its ancestors, whose roll-ups its change moved. */
  private async announceWorkItem(projectId: string, id: string): Promise<void> {
    const tree = await this.tree(projectId);
    if (tree === null) return;
    await this.opts.broadcast.publish(projectId, {
      type: 'work_items_changed',
      workItems: withAncestors(tree.workItems, id),
    });
  }

  private groupUnder(rows: readonly WorkItem[], parentId: string | null): Sibling[] {
    return rows.filter((row) => row.parentId === parentId).map(asSibling);
  }

  /** The work item, its project and the project's rows — or the refusal that stops the caller. */
  private async contextFor(
    id: string,
    actorId: string,
  ): Promise<WorkItemOutcome<{ workItem: WorkItem; project: Project; rows: WorkItem[] }>> {
    const workItem = await this.opts.workItems.findById(id);
    if (workItem === null) return { ok: false, reason: 'not_found' };
    const project = await this.opts.projects.findById(workItem.projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };
    const rows = await this.opts.workItems.listByProject(workItem.projectId);
    return { ok: true, result: { workItem, project, rows } };
  }
}
