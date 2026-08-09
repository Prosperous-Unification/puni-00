import {
  addWorkdays,
  type EstimateMethod,
  finalDays,
  type IsoDate,
  workdaysBetween,
} from '@wbs/domain';

import type {
  CommandJournalStore,
  DependencyStore,
  DirectoryStore,
  EstimateStore,
  JournalEntry,
  Project,
  ProjectStore,
  Reparented,
  StoredEstimate,
  SubtreeStore,
  UndoState,
  WorkItem,
  WorkItemPatch,
  WorkItemStore,
} from '../repository';
import { isForeignKeyViolation } from '../repository/constraint';
import { assumedAssignee } from './assumed-assignee';
import type { Broadcaster } from './broadcast';
import { withAncestors } from './broadcast';
import {
  type CompensatingCommand,
  quoteName,
  readCommand,
  readPayload,
  readPreconditions,
  type Revisions,
  touchedBy,
} from './compensating';
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
 * The reading itself is {@link assumedAssignee}, shared with the role removal
 * that has to say whose answer it would change. Written out twice, the two
 * would drift, and the drift would show up as a confirmation naming the wrong
 * people.
 */
function phasesOf(assignees: Record<string, string>): {
  assignees: Record<string, string>;
  doesEveryPhase: string | null;
} {
  return { assignees, doesEveryPhase: assumedAssignee(assignees) };
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
  /**
   * How many times this work item has been written to, including writes to its
   * estimates, assignments and dependencies.
   *
   * Redeclared from {@link WorkItem} only to say what it means **for a reader**,
   * which is the reason it is on the wire at all: hold it alongside the row you
   * read, and a later write can ask to land only if the row has not moved
   * since. Nothing asks that yet — conditional undo and write preconditions are
   * the changes that will.
   *
   * It does **not** move when `number` does. A create anywhere above renumbers
   * rows nobody wrote to, and a revision that tracked the derived number would
   * be a project-wide counter with a work item's name on it.
   *
   * A created work item is 0. One created as the first child of a work item
   * that held estimates is 1: the handoff of those estimates down to it is a
   * second write, to a row that then genuinely holds something it did not
   * before.
   */
  revision: number;
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
  | 'ancestor'
  /** A subtree past {@link MAX_DUPLICATED_ROWS}. */
  | 'too_large'
  /**
   * A role the project does not hold — usually one somebody removed while this
   * caller had it on screen. `estimate.role_id` and `assignment.role_id` are
   * foreign keys, so without this the write reaches the database and answers
   * 500 for a request whose only fault is being out of date.
   */
  | 'unknown_role';

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
  subtrees: SubtreeStore;
  /**
   * Where every reversible command is written down.
   *
   * Required rather than optional. A service built without one would apply
   * every mutation and record none of them, and the only symptom would be an
   * undo key that quietly does nothing — the shape of failure `AGENTS.md` R5
   * exists to keep out of this repo.
   */
  journal: CommandJournalStore;
  broadcast: Broadcaster;
  newId?: () => string;
  now?: () => number;
}

/** Why an undo or a redo did not happen. */
export type UndoRefusal =
  | 'not_found'
  | 'forbidden'
  /** The account has nothing left in that half of its stack for this project. */
  | 'nothing_to_undo'
  /**
   * Something the command touched has been written to since, so reversing it
   * would overwrite a change nobody asked to lose. The entry is thrown away:
   * it can never apply again, and leaving it would refuse every later press of
   * the key for a change nobody can reach.
   */
  | 'stale_undo';

export interface UndoDone {
  /** What was reversed, as a sentence: `rename “Strip”`. */
  done: string;
  /** What could not be put back exactly, or null when everything was. */
  detail: string | null;
}

export type UndoOutcome =
  | { ok: true; result: UndoDone }
  | { ok: false; reason: UndoRefusal; detail: string | null };

/** Whether applying one compensating command worked, and what it could not do. */
type ApplyOutcome = { ok: true; detail: string | null } | { ok: false; detail: string };

/**
 * The largest subtree one duplication will copy.
 *
 * A judgement rather than a measurement: well above any phase somebody builds
 * by hand, well below anything that makes one transaction slow. It exists
 * because each duplication can double what the next one copies, and nothing
 * else in the tool bounds that.
 */
export const MAX_DUPLICATED_ROWS = 500;

/** What a duplicated root's name gains, so two identical siblings can be told apart in a picker. */
const COPY_SUFFIX = ' (copy)';

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

/** One row of `rows`, or a throw: an id from the same read is not allowed to be missing. */
function rowOf(rows: readonly WorkItem[], id: string): WorkItem {
  const found = rows.find((row) => row.id === id);
  if (found === undefined) throw new Error(`${id} is not a row of this project`);
  return found;
}

/** A work item's name for a sentence, or the empty string when the row has gone. */
function nameOf(rows: readonly WorkItem[], id: string): string {
  return rows.find((row) => row.id === id)?.name ?? '';
}

/** Which fields a patch actually names. An absent field and a null one mean different things. */
function fieldsOf(patch: WorkItemPatch): (keyof WorkItemPatch)[] {
  const named: (keyof WorkItemPatch)[] = [];
  if (patch.name !== undefined) named.push('name');
  if (patch.notes !== undefined) named.push('notes');
  if (patch.startNoEarlierThan !== undefined) named.push('startNoEarlierThan');
  if (patch.serviceTeamId !== undefined) named.push('serviceTeamId');
  return named;
}

/**
 * The patch that puts `before` back, naming **only** the fields the forward
 * patch named.
 *
 * Naming every field would be a rename that also silently restored a note
 * somebody else edited in between — an undo that reverses more than the change
 * it is undoing.
 */
function revertTo(before: WorkItem, patch: WorkItemPatch): WorkItemPatch {
  const out: WorkItemPatch = {};
  if (patch.name !== undefined) out.name = before.name;
  if (patch.notes !== undefined) out.notes = before.notes;
  if (patch.startNoEarlierThan !== undefined) out.startNoEarlierThan = before.startNoEarlierThan;
  if (patch.serviceTeamId !== undefined) out.serviceTeamId = before.serviceTeamId;
  return out;
}

/** The revisions of `ids` as `rows` holds them, skipping ids `rows` does not have. */
function revisionsIn(rows: readonly WorkItem[], ids: readonly string[]): Revisions {
  const byId = new Map(rows.map((row) => [row.id, row.revision]));
  const out: Revisions = {};
  for (const id of new Set(ids)) {
    const revision = byId.get(id);
    if (revision !== undefined) out[id] = revision;
  }
  return out;
}

/** A journalled command, as the mutation that ran it hands it over. */
interface Recording {
  /** What a redo re-applies. */
  forward: CompensatingCommand;
  /** What an undo applies. */
  inverse: CompensatingCommand;
  /** Every work item the command wrote to, whose revisions become its preconditions. */
  touched: string[];
  /**
   * The project's rows as the mutation read them **before** writing.
   *
   * Every mutation already has this: it is what its own guards were decided
   * against. It is here so the entry can record where the entities it touched
   * started, which is what lets the entry below it survive this one's undo —
   * see `Preconditions` in `compensating.ts`.
   */
  before: readonly WorkItem[];
}

export class WorkItemService {
  private readonly newId: () => string;
  private readonly now: () => number;

  constructor(private readonly opts: WorkItemServiceOptions) {
    this.newId = opts.newId ?? (() => crypto.randomUUID());
    this.now = opts.now ?? (() => Date.now());
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
    /**
     * The project row's own revision, which moves on its name, restriction,
     * estimate method, start date and roles — and on none of the work items
     * below it, each of which carries its own.
     */
    projectRevision: number;
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
      projectRevision: project.revision,
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
      // A row that has never been changed since it came into existence. The
      // estimate handoff below is a real second write and leaves a first child
      // at 1 — see {@link NumberedWorkItem.revision}.
      revision: 0,
    };
    await this.opts.workItems.insert(workItem, placed.renumbered);
    // A work item that had an estimate and now has a child no longer holds one:
    // the estimate described the work, and the work is the child now. Moving it
    // down keeps the total identical, which is what makes this safe to do
    // silently — the plan's numbers do not shift under the user.
    const gainsFirstChild =
      input.parentId !== null && !rows.some((row) => row.parentId === input.parentId)
        ? input.parentId
        : null;
    // Read before the move, because afterwards they are the child's. This is
    // the whole before-state an undo of this create has to put back.
    const handedDown =
      gainsFirstChild === null
        ? []
        : (await this.opts.estimates.listByProject(projectId)).filter(
            (each) => each.workItemId === gainsFirstChild,
          );
    if (gainsFirstChild !== null) {
      await this.opts.estimates.moveAll(gainsFirstChild, workItem.id);
    }
    await this.announceTree(projectId);
    await this.record(projectId, actorId, 'create', `add ${quoteName(workItem.name)}`, {
      forward: {
        do: 'restore_subtree',
        rows: [workItem],
        rootPosition: workItem.position,
        reparented: [],
        estimates: handedDown.map((each) => ({ ...each, workItemId: workItem.id })),
        assignments: [],
        internalDependencies: [],
        externalDependencies: [],
        removedEstimates: handedDown.map((each) => ({
          workItemId: each.workItemId,
          roleId: each.roleId,
        })),
      },
      inverse: {
        do: 'delete_subtree',
        rootId: workItem.id,
        // Exactly this row and nothing else. A work item somebody has since
        // built under is not one this undo may take away, and its own revision
        // would not say so — a child is a row of its own.
        expectedSubtree: [workItem.id],
        remove: [workItem.id],
        reparented: [],
        setEstimates: handedDown,
      },
      touched: gainsFirstChild === null ? [workItem.id] : [workItem.id, gainsFirstChild],
      before: rows,
    });
    return { ok: true, result: workItem };
  }

  async patch(
    id: string,
    actorId: string,
    patch: WorkItemPatch,
  ): Promise<WorkItemOutcome<WorkItem>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const before = context.result.workItem;
    const updated = await this.opts.workItems.patch(id, patch);
    if (updated === null) return { ok: false, reason: 'not_found' };
    await this.announceWorkItem(updated.projectId, id);
    // A patch naming no field wrote nothing — the store returns the row it
    // found — so there is nothing to reverse. Journalling it would put an
    // entry on the stack whose undo is visibly a no-op.
    if (fieldsOf(patch).length > 0) {
      await this.record(
        updated.projectId,
        actorId,
        'patch',
        patch.name === undefined
          ? `edit ${quoteName(updated.name)}`
          : `rename ${quoteName(updated.name)}`,
        {
          forward: { do: 'patch', workItemId: id, patch },
          inverse: { do: 'patch', workItemId: id, patch: revertTo(before, patch) },
          touched: [id],
          before: context.result.rows,
        },
      );
    }
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
    const { workItem } = context.result;
    if (!(await this.holdsRole(workItem.projectId, roleId)))
      return { ok: false, reason: 'unknown_role' };
    const before =
      (await this.opts.directory.assignmentsOf([id])).find((each) => each.roleId === roleId)
        ?.personId ?? null;
    const written = await this.writeNamingRole(workItem.projectId, roleId, () =>
      this.opts.directory.assign(id, roleId, personId),
    );
    if (!written) return { ok: false, reason: 'unknown_role' };
    await this.announceWorkItem(workItem.projectId, id);
    await this.record(
      workItem.projectId,
      actorId,
      personId === null ? 'unassign' : 'assign',
      personId === null
        ? `clear who does ${quoteName(workItem.name)}`
        : `assign ${quoteName(workItem.name)}`,
      {
        forward: { do: 'assign', workItemId: id, roleId, personId },
        inverse: { do: 'assign', workItemId: id, roleId, personId: before },
        touched: [id],
        before: context.result.rows,
      },
    );
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

    // Where it was, read before it leaves: the sibling it sat directly after,
    // or null when it was first. That is the shape `move` takes, so the
    // inverse is the same command with the arguments it had before.
    const wasAfter = this.groupUnder(rows, workItem.parentId)
      .filter((sibling) => sibling.id !== id && sibling.position < workItem.position)
      .sort((a, b) => a.position - b.position)
      .at(-1);

    const group = this.groupUnder(rows, input.parentId).filter((sibling) => sibling.id !== id);
    const placed = placeAfter(group, input.afterId);
    await this.opts.workItems.move(id, input.parentId, placed.position, placed.renumbered);
    await this.announceTree(workItem.projectId);
    await this.record(workItem.projectId, actorId, 'move', `move ${quoteName(workItem.name)}`, {
      forward: { do: 'move', workItemId: id, parentId: input.parentId, afterId: input.afterId },
      inverse: {
        do: 'move',
        workItemId: id,
        parentId: workItem.parentId,
        afterId: wasAfter?.id ?? null,
      },
      touched: [id],
      before: rows,
    });
    return { ok: true, result: null };
  }

  /**
   * Copies a work item and everything beneath it, as the next sibling of the
   * original.
   *
   * One write, on the server, because the alternative is the client replaying
   * a create and a patch per row: every intermediate state published to
   * everybody watching, a refetch each time, and copied dependencies still
   * pointing at the originals.
   *
   * What the copy carries, and what it deliberately does not, is in
   * `openspec/changes/duplicate-subtree/specs/wbs-domain/spec.md`. Two of
   * those rules are load-bearing enough to repeat here:
   *
   * - **No frozen numbers.** A frozen number is an identity that has left the
   *   tool — it is in somebody's ticket, which is why {@link move} refuses a
   *   frozen row. Two rows answering one ticket is the failure freezing
   *   exists to prevent. The original is untouched, so a frozen work item can
   *   still be duplicated: copying is not moving.
   * - **Only internal dependencies.** An edge with one end outside the
   *   subtree is left behind, so the copy schedules against its own work
   *   rather than inheriting wiring nobody asked it to have.
   *
   * Refuses `too_large` past {@link MAX_DUPLICATED_ROWS}, having written
   * nothing.
   */
  async duplicate(id: string, actorId: string): Promise<WorkItemOutcome<{ id: string }>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.result;

    // Ancestors-first, which is the order the copies have to be written in:
    // `parent_id` references a row that must already be there.
    const originals = subtreeOf(rows, id);
    if (originals.length > MAX_DUPLICATED_ROWS) return { ok: false, reason: 'too_large' };

    const newIds = new Map(originals.map((originalId) => [originalId, this.newId()]));
    /**
     * The copy of one original. Throws rather than defaulting: an id that was
     * not copied means the map and the subtree disagree, and carrying the
     * original's id through would wire the copy to the row it was copied from.
     */
    const copyOf = (originalId: string): string => {
      const copied = newIds.get(originalId);
      if (copied === undefined) throw new Error(`no copy was generated for ${originalId}`);
      return copied;
    };
    /**
     * A descendant's parent, which is always another row of the same subtree.
     * A null here would mean `subtreeOf` returned a second root.
     */
    const parentInside = (source: WorkItem): string => {
      if (source.parentId === null)
        throw new Error(`${source.id} is below the root but parentless`);
      return source.parentId;
    };
    const sourceOf = new Map(rows.map((row) => [row.id, row]));
    const inside = new Set(originals);

    const placed = placeAfter(this.groupUnder(rows, workItem.parentId), id);
    const copies = originals.map((originalId, index) => {
      const source = sourceOf.get(originalId);
      if (source === undefined) throw new Error(`${originalId} is not a row of this project`);
      const isRoot = index === 0;
      return {
        ...source,
        id: copyOf(originalId),
        // The root keeps the original's parent — it is its sibling. Everything
        // below hangs off the copy of its own parent, never the original's.
        parentId: isRoot ? source.parentId : copyOf(parentInside(source)),
        // Descendants keep their positions: their whole sibling group is
        // copied with them, so the order survives and stays distinct.
        position: isRoot ? placed.position : source.position,
        // Only the root is renamed. Its children are already told apart by the
        // parent above them, and suffixing every one of them would rewrite a
        // branch nobody asked to rename.
        name: isRoot ? `${source.name}${COPY_SUFFIX}` : source.name,
        frozenNumber: null,
        // Not the original's count. A copy is a new row that has never been
        // changed, and carrying the original's revision across would have a
        // reader's precondition on one row pass against the other.
        revision: 0,
      };
    });

    const stored = await this.opts.estimates.listByProject(workItem.projectId);
    const assigned = await this.opts.directory.assignmentsOf(originals);
    const edges = await this.opts.dependencies.listByProject(workItem.projectId);

    const copiedEstimates = stored
      .filter((each) => inside.has(each.workItemId))
      .map((each) => ({ ...each, workItemId: copyOf(each.workItemId) }));
    const copiedAssignments = assigned.map((each) => ({
      ...each,
      workItemId: copyOf(each.workItemId),
    }));
    const copiedEdges = edges
      .filter((edge) => inside.has(edge.predecessorId) && inside.has(edge.successorId))
      .map((edge) => ({
        id: this.newId(),
        projectId: edge.projectId,
        predecessorId: copyOf(edge.predecessorId),
        successorId: copyOf(edge.successorId),
      }));

    await this.opts.subtrees.insertSubtree({
      rows: copies,
      respaced: placed.renumbered,
      reparented: [],
      estimates: copiedEstimates,
      assignments: copiedAssignments,
      dependencies: copiedEdges,
      removedEstimates: [],
    });
    // Once, at the end. The copy renumbers rows it never touched — every later
    // sibling of the original, at every level — so it is the whole tree rather
    // than the rows that were written.
    await this.announceTree(workItem.projectId);
    const copyIds = copies.map((copy) => copy.id);
    await this.record(
      workItem.projectId,
      actorId,
      'duplicate',
      `duplicate ${quoteName(workItem.name)}`,
      {
        forward: {
          do: 'restore_subtree',
          rows: copies,
          rootPosition: placed.position,
          reparented: [],
          estimates: copiedEstimates,
          assignments: copiedAssignments,
          internalDependencies: copiedEdges,
          externalDependencies: [],
          removedEstimates: [],
        },
        inverse: {
          do: 'delete_subtree',
          rootId: copyOf(id),
          expectedSubtree: copyIds,
          remove: copyIds,
          reparented: [],
          setEstimates: [],
        },
        // Every copied row, all of them at 0. Anything typed into the copy
        // moves one of these and the undo refuses rather than throwing away
        // work somebody did in it.
        touched: copyIds,
        before: rows,
      },
    );
    return { ok: true, result: { id: copyOf(id) } };
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

    const label = `delete ${quoteName(workItem.name)}`;
    const storedEstimates = await this.opts.estimates.listByProject(workItem.projectId);
    const allEdges = await this.opts.dependencies.listByProject(workItem.projectId);

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
      const inside = new Set(doomed);
      const handedUp: StoredEstimate[] = [];
      if (parentId !== null && rows.filter((row) => row.parentId === parentId).length === 1) {
        const totals = rollUp(rows, storedEstimates);
        for (const [roleId, days] of totals.get(id) ?? []) {
          handedUp.push({ workItemId: parentId, roleId, ...days });
        }
      }
      for (const each of handedUp) await this.opts.estimates.set(each);
      const cut = allEdges.filter(
        (edge) => inside.has(edge.predecessorId) || inside.has(edge.successorId),
      );
      // Read before the delete, not after. `assignment.work_item_id` cascades,
      // so a moment later there is nothing left to read and the restore would
      // put the branch back with nobody on it.
      const doomedAssignments = await this.opts.directory.assignmentsOf(doomed);
      // Edges first, and every one touching anything in the subtree. The
      // foreign keys refuse a delete that would orphan one, so this is not
      // tidiness: without it, deleting a work item anything depends on fails
      // with a constraint error the caller cannot act on.
      for (const gone of doomed) await this.opts.dependencies.removeAllFor(gone);
      await this.opts.workItems.remove(doomed, []);
      await this.announceTree(workItem.projectId);
      await this.record(workItem.projectId, actorId, 'delete', label, {
        forward: {
          do: 'delete_subtree',
          rootId: id,
          expectedSubtree: doomed,
          remove: doomed,
          reparented: [],
          setEstimates: handedUp,
        },
        inverse: {
          do: 'restore_subtree',
          rows: doomed.map((each) => rowOf(rows, each)),
          rootPosition: workItem.position,
          reparented: [],
          estimates: storedEstimates.filter((each) => inside.has(each.workItemId)),
          assignments: doomedAssignments,
          internalDependencies: cut.filter(
            (edge) => inside.has(edge.predecessorId) && inside.has(edge.successorId),
          ),
          externalDependencies: cut.filter(
            (edge) => !inside.has(edge.predecessorId) || !inside.has(edge.successorId),
          ),
          removedEstimates: handedUp.map((each) => ({
            workItemId: each.workItemId,
            roleId: each.roleId,
          })),
        },
        // Two deliberate absences. The deleted rows are not here — nothing can
        // hold a revision of a row that is gone, and the restore's refusal to
        // write over an id that exists is what guards them. Neither are the
        // surviving ends of the edges that left with the branch: those edges
        // are best-effort by design, and refusing to put a whole branch back
        // because somebody renamed a neighbour would strand the work for a
        // reason that has nothing to do with it.
        touched: handedUp.map((each) => each.workItemId),
        before: rows,
      });
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
    const cut = allEdges.filter((edge) => edge.predecessorId === id || edge.successorId === id);
    // Read before the delete: the assignment rows cascade with the work item.
    const deletedAssignments = await this.opts.directory.assignmentsOf([id]);
    // The same reason as the cascade branch above: an edge to a row that is
    // going has nothing to point at, and the foreign keys say so. Only this row
    // leaves here — its children are promoted, and their edges stay valid.
    await this.opts.dependencies.removeAllFor(id);
    await this.opts.workItems.remove([id], promoted);
    await this.announceTree(workItem.projectId);
    await this.record(workItem.projectId, actorId, 'delete', label, {
      forward: {
        do: 'delete_subtree',
        rootId: id,
        expectedSubtree: subtreeOf(rows, id),
        remove: [id],
        reparented: promoted,
        setEstimates: [],
      },
      inverse: {
        do: 'restore_subtree',
        rows: [workItem],
        rootPosition: workItem.position,
        // Everyone the promotion rewrote, back where they were: the children
        // under the row coming back, and the former siblings at the positions
        // the promotion took from them. Restoring only the children would
        // leave the group respaced around a gap that is no longer there.
        reparented: promoted.map((each) => {
          const was = rowOf(rows, each.id);
          return { id: was.id, parentId: was.parentId, position: was.position };
        }),
        estimates: storedEstimates.filter((each) => each.workItemId === id),
        assignments: deletedAssignments,
        internalDependencies: [],
        externalDependencies: cut,
        removedEstimates: [],
      },
      // The promoted rows are preconditions because putting them back under the
      // restored parent is part of the undo. The ends of the edges that left
      // are not, for the reason given in the cascade branch above.
      touched: promoted.map((each) => each.id),
      before: rows,
    });
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
    // A freeze that pinned nothing — every number was already written down —
    // is not a change to reverse.
    if (updates.length > 0) {
      await this.record(projectId, actorId, 'freeze', 'freeze the numbers', {
        forward: { do: 'set_frozen', updates },
        inverse: {
          do: 'set_frozen',
          updates: updates.map((each) => ({ id: each.id, frozenNumber: null })),
        },
        touched: updates.map((each) => each.id),
        before: rows,
      });
    }
    return { ok: true, result: null };
  }

  /** Returns one work item to deriving, which is what lets it move again. */
  async unfreeze(id: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem } = context.result;
    await this.opts.workItems.setFrozenNumbers([{ id, frozenNumber: null }]);
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      actorId,
      'unfreeze',
      `unfreeze ${quoteName(workItem.name)}`,
      {
        forward: { do: 'set_frozen', updates: [{ id, frozenNumber: null }] },
        inverse: {
          do: 'set_frozen',
          updates: [{ id, frozenNumber: workItem.frozenNumber }],
        },
        touched: [id],
        before: context.result.rows,
      },
    );
    return { ok: true, result: null };
  }

  async unfreezeProject(projectId: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };

    const rows = await this.opts.workItems.listByProject(projectId);
    const frozen = rows.filter((row) => row.frozenNumber !== null);
    await this.opts.workItems.setFrozenNumbers(
      frozen.map((row) => ({
        id: row.id,
        frozenNumber: null,
        startNoEarlierThan: null,
        serviceTeamId: null,
      })),
    );
    await this.announceTree(projectId);
    if (frozen.length > 0) {
      await this.record(projectId, actorId, 'unfreeze', 'unfreeze the whole plan', {
        forward: {
          do: 'set_frozen',
          updates: frozen.map((row) => ({ id: row.id, frozenNumber: null })),
        },
        inverse: {
          do: 'set_frozen',
          updates: frozen.map((row) => ({ id: row.id, frozenNumber: row.frozenNumber })),
        },
        touched: frozen.map((row) => row.id),
        before: rows,
      });
    }
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
    const { rows, workItem } = context.result;
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    if (!(await this.holdsRole(workItem.projectId, roleId)))
      return { ok: false, reason: 'unknown_role' };
    const before = await this.storedTrio(workItem.projectId, id, roleId);
    const written = await this.writeNamingRole(workItem.projectId, roleId, () =>
      this.opts.estimates.set({ workItemId: id, roleId, ...days }),
    );
    if (!written) return { ok: false, reason: 'unknown_role' };
    await this.announceWorkItem(workItem.projectId, id);
    await this.record(
      workItem.projectId,
      actorId,
      'estimate',
      `estimate ${quoteName(workItem.name)}`,
      {
        forward: { do: 'set_estimate', workItemId: id, roleId, days },
        inverse:
          before === null
            ? { do: 'clear_estimate', workItemId: id, roleId }
            : { do: 'set_estimate', workItemId: id, roleId, days: before },
        touched: [id],
        before: context.result.rows,
      },
    );
    return { ok: true, result: null };
  }

  /**
   * Takes one work item's estimate for one role back off.
   *
   * Idempotent: clearing a trio that is not stored is the state the caller
   * asked for, so it succeeds rather than reporting a 404 for an estimate.
   * A missing *work item* is still `not_found` — that is a different absence,
   * and the same one `removeDependency` reports.
   *
   * No roll-up work is needed: a parent's figures are summed on read, never
   * stored, so the announce below carries the recomputed ancestors with it.
   * Not refused for a rolled-up work item either — one cannot hold a stored
   * estimate to begin with, so the call is already a no-op there, and refusing
   * it would make "clear what is not there" an error in exactly one place.
   *
   * Proof: dropping the `estimates.remove` call fails four tests across
   * `estimate.test.ts` and `work-item.controller.test.ts`, including the
   * parent roll-up one; dropping the announce fails `tells the project's
   * subscribers, with the ancestors whose totals moved` alone. Both watched
   * 2026-08-06 — see `openspec/changes/clear-estimate/verify.md`.
   */
  async clearEstimate(id: string, actorId: string, roleId: string): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem } = context.result;
    const before = await this.storedTrio(workItem.projectId, id, roleId);
    await this.opts.estimates.remove(id, roleId);
    await this.announceWorkItem(workItem.projectId, id);
    // Clearing a trio that was not there changed nothing — the call is
    // idempotent by design — so there is nothing to put back.
    if (before !== null) {
      await this.record(
        workItem.projectId,
        actorId,
        'clear_estimate',
        `clear the estimate on ${quoteName(workItem.name)}`,
        {
          forward: { do: 'clear_estimate', workItemId: id, roleId },
          inverse: { do: 'set_estimate', workItemId: id, roleId, days: before },
          touched: [id],
          before: context.result.rows,
        },
      );
    }
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
    await this.record(
      workItem.projectId,
      actorId,
      'add_dependency',
      `make ${quoteName(workItem.name)} wait for ${quoteName(nameOf(rows, predecessorId))}`,
      {
        forward: { do: 'add_dependency', successorId: id, predecessorId },
        inverse: { do: 'remove_dependency', successorId: id, predecessorId },
        touched: [id, predecessorId],
        before: rows,
      },
    );
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
    const { workItem, rows } = context.result;

    const existed = (await this.opts.dependencies.listByProject(workItem.projectId)).some(
      (edge) => edge.predecessorId === predecessorId && edge.successorId === id,
    );
    await this.opts.dependencies.remove(predecessorId, id);
    await this.announceTree(workItem.projectId);
    // The removal is idempotent, so a request for an edge that was not there
    // changed nothing and there is nothing to put back.
    if (existed) {
      await this.record(
        workItem.projectId,
        actorId,
        'remove_dependency',
        `stop ${quoteName(workItem.name)} waiting for ${quoteName(nameOf(rows, predecessorId))}`,
        {
          forward: { do: 'remove_dependency', successorId: id, predecessorId },
          inverse: { do: 'add_dependency', successorId: id, predecessorId },
          touched: [id, predecessorId],
          before: rows,
        },
      );
    }
    return { ok: true, result: null };
  }

  /**
   * Whether this account has anything to undo or redo on this project.
   *
   * Read by the controller alongside the tree rather than from its own route.
   * The tree read is already the thing every client does after every change of
   * its own and after every event from anybody else, so the answer arrives
   * exactly when it can have changed — and {@link tree} itself stays free of
   * an account, which matters because the broadcast reuses it.
   */
  undoState(projectId: string, actorId: string): Promise<UndoState> {
    return this.opts.journal.stateOf(projectId, actorId);
  }

  /**
   * Reverses this account's newest command on this project — **if nothing it
   * touched has moved since**.
   *
   * The condition is the whole design. An undo is a write computed from a
   * state that was read a while ago, so applying it blind is not "last writer
   * wins" by accident but by construction: it puts back a value nobody
   * currently on the plan asked for. Every entity the original command wrote
   * to is checked against the revision that command left it at, and a single
   * mismatch refuses the whole thing and says which row changed.
   *
   * A refused entry is **thrown away**. Its preconditions can never hold
   * again — revisions do not go down — so keeping it would jam the stack,
   * refusing every later press of the key for a change nobody can reach.
   */
  undo(projectId: string, actorId: string): Promise<UndoOutcome> {
    return this.walkStack(projectId, actorId, 'undo');
  }

  /**
   * Re-applies the command this account most recently undid on this project,
   * under exactly the same condition.
   *
   * A redo is as much a write from a stale read as an undo is, and the
   * asymmetry that would make it safe does not exist: between the undo and the
   * redo anybody may have edited the same row. The redo branch is cleared the
   * moment this account makes any forward change, because re-applying a
   * command on top of a plan that has moved on is a different command.
   */
  redo(projectId: string, actorId: string): Promise<UndoOutcome> {
    return this.walkStack(projectId, actorId, 'redo');
  }

  private async walkStack(
    projectId: string,
    actorId: string,
    direction: 'undo' | 'redo',
  ): Promise<UndoOutcome> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found', detail: null };
    // An undo is a mutation. Being allowed to read a restricted project is not
    // being allowed to reverse somebody's work in it.
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden', detail: null };

    // The whole stack, because applying one entry re-stamps its neighbours.
    // It is capped at fifty rows.
    const stack = await this.opts.journal.entriesFor(projectId, actorId);
    const entry: JournalEntry | undefined =
      direction === 'undo'
        ? [...stack].reverse().find((each) => !each.undone)
        : stack.find((each) => each.undone);
    if (entry === undefined) return { ok: false, reason: 'nothing_to_undo', detail: null };

    const payload = readPayload(entry.payload);
    const command = direction === 'undo' ? readCommand(entry.inverse) : payload.forward;
    const preconditions = readPreconditions(entry.preconditions);

    const moved = await this.staleness(projectId, preconditions.expected);
    if (moved !== null) {
      await this.opts.journal.discard(entry.id);
      return { ok: false, reason: 'stale_undo', detail: moved };
    }

    const applied = await this.apply(projectId, command);
    if (!applied.ok) {
      await this.opts.journal.discard(entry.id);
      return { ok: false, reason: 'stale_undo', detail: applied.detail };
    }

    // The entry now describes the other direction, so it checks the revisions
    // this application left and remembers the ones it started from. Nothing is
    // appended: an undo that was itself journalled would be undoable, and the
    // key would toggle one change forever instead of walking back through two.
    const now = await this.revisionsOf(projectId, touchedBy(command));
    await this.opts.journal.flip(entry.id, direction === 'undo', {
      expected: now,
      from: preconditions.expected,
    });
    await this.rebase(stack, entry, direction, preconditions.from, now);
    await this.announceTree(projectId);
    return { ok: true, result: { done: payload.label, detail: applied.detail } };
  }

  /**
   * Carries the entries this one was stacked on top of past the write the
   * application just made.
   *
   * This is what lets somebody press the key twice. An undo is an ordinary
   * mutation, so it moves the revisions of everything it touched — and the
   * entry below, which recorded those entities as it left them, would then be
   * checking against a number this account's own undo has walked past.
   *
   * The condition is exact and it is the whole safety of it: a neighbour is
   * carried forward **only** where the revision it expects is the one the
   * just-applied command started from. That equality says nobody wrote between
   * the two commands, and therefore that the entity now holds precisely what
   * the neighbour left it holding. Where somebody did write in between, the
   * numbers do not match, nothing is re-stamped, and that entry refuses when
   * it is reached — which is the entire point of the feature.
   *
   * Only the side being walked toward is touched: undoing carries the live
   * entries below, redoing carries the undone ones above.
   */
  private async rebase(
    stack: readonly JournalEntry[],
    applied: JournalEntry,
    direction: 'undo' | 'redo',
    startedFrom: Revisions,
    now: Revisions,
  ): Promise<void> {
    for (const other of stack) {
      if (other.id === applied.id) continue;
      const ahead = direction === 'undo' ? other.seq < applied.seq : other.seq > applied.seq;
      if (!ahead) continue;
      const their = readPreconditions(other.preconditions);
      let changed = false;
      const expected: Revisions = { ...their.expected };
      for (const [id, reached] of Object.entries(now)) {
        // Only where this neighbour has an opinion about the entity at all,
        // and where that opinion is exactly the revision the applied command
        // started from. Both halves matter: the first keeps a precondition
        // from being invented for a row the neighbour never touched, and the
        // second is what somebody else's write in between fails.
        if (!Object.hasOwn(their.expected, id)) continue;
        if (their.expected[id] !== startedFrom[id]) continue;
        expected[id] = reached;
        changed = true;
      }
      if (changed) await this.opts.journal.restamp(other.id, { ...their, expected });
    }
  }

  /**
   * Which entity has moved since the command ran, said in words a reader can
   * act on — or null when every one of them is exactly where it was.
   *
   * A row that is **gone** counts as moved. Its revision cannot be compared to
   * anything, and the change that removed it is a change the undo would be
   * computed against.
   */
  private async staleness(projectId: string, expected: Revisions): Promise<string | null> {
    const rows = await this.opts.workItems.listByProject(projectId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const [id, revision] of Object.entries(expected)) {
      const row = byId.get(id);
      if (row === undefined) return 'a work item this change touched has been deleted since';
      if (row.revision !== revision) return `${quoteName(row.name)} has changed since`;
    }
    return null;
  }

  /**
   * The current revisions of `ids`, skipping the ones that no longer exist.
   *
   * A row that is gone is deliberately absent rather than recorded as missing:
   * nobody can hold a revision for it, and the guard that matters for a row
   * that should stay gone is `restore_subtree` refusing to write over an id
   * that is there.
   */
  private async revisionsOf(projectId: string, ids: readonly string[]): Promise<Revisions> {
    const rows = await this.opts.workItems.listByProject(projectId);
    return revisionsIn(rows, ids);
  }

  /**
   * Applies one compensating command through the same stores every ordinary
   * mutation writes through, so revisions move, satellites follow and the
   * invariants hold.
   *
   * It re-checks the handful of rules a revision cannot express — a sibling
   * that has to exist for a placement, a leaf that has become a parent, an id
   * that is supposed to still be free — and answers `ok: false` rather than
   * throwing. Those are conditions to report, not faults: the caller turns
   * them into the same refusal a moved revision produces.
   */
  private async apply(projectId: string, command: CompensatingCommand): Promise<ApplyOutcome> {
    switch (command.do) {
      case 'patch': {
        const updated = await this.opts.workItems.patch(command.workItemId, command.patch);
        if (updated === null) return { ok: false, detail: 'the work item is no longer there' };
        return { ok: true, detail: null };
      }
      case 'set_estimate': {
        const rows = await this.opts.workItems.listByProject(projectId);
        if (rows.some((row) => row.parentId === command.workItemId)) {
          return { ok: false, detail: 'that work item has children now, so its figures are sums' };
        }
        // The phase the trio belonged to has been removed since. Putting the
        // figures back would be a foreign key error on a key somebody pressed
        // to be safe, so the entry is refused and discarded like any other
        // command the plan has moved past.
        if (!(await this.holdsRole(projectId, command.roleId))) {
          return { ok: false, detail: 'that phase is no longer in this project' };
        }
        const restored = await this.writeNamingRole(projectId, command.roleId, () =>
          this.opts.estimates.set({
            workItemId: command.workItemId,
            roleId: command.roleId,
            ...command.days,
          }),
        );
        if (!restored) return { ok: false, detail: 'that phase is no longer in this project' };
        return { ok: true, detail: null };
      }
      case 'clear_estimate':
        await this.opts.estimates.remove(command.workItemId, command.roleId);
        return { ok: true, detail: null };
      case 'assign':
        if (command.personId !== null && !(await this.holdsRole(projectId, command.roleId))) {
          return { ok: false, detail: 'that phase is no longer in this project' };
        }
        {
          const reassigned = await this.writeNamingRole(projectId, command.roleId, () =>
            this.opts.directory.assign(command.workItemId, command.roleId, command.personId),
          );
          if (!reassigned) return { ok: false, detail: 'that phase is no longer in this project' };
        }
        return { ok: true, detail: null };
      case 'add_dependency': {
        const rows = await this.opts.workItems.listByProject(projectId);
        const existing = await this.opts.dependencies.listByProject(projectId);
        const refusal = canDepend(rows, existing, command.predecessorId, command.successorId);
        if (refusal !== null) {
          return { ok: false, detail: `that dependency would now be refused: ${refusal}` };
        }
        await this.opts.dependencies.add({
          id: this.newId(),
          projectId,
          predecessorId: command.predecessorId,
          successorId: command.successorId,
        });
        return { ok: true, detail: null };
      }
      case 'remove_dependency':
        await this.opts.dependencies.remove(command.predecessorId, command.successorId);
        return { ok: true, detail: null };
      case 'move':
        return this.applyMove(projectId, command.workItemId, command.parentId, command.afterId);
      case 'set_frozen': {
        const rows = await this.opts.workItems.listByProject(projectId);
        const gone = command.updates.find((each) => !rows.some((row) => row.id === each.id));
        if (gone !== undefined) {
          return { ok: false, detail: 'a work item this change froze has been deleted since' };
        }
        await this.opts.workItems.setFrozenNumbers(command.updates);
        return { ok: true, detail: null };
      }
      case 'delete_subtree':
        return this.applyDelete(projectId, command);
      case 'restore_subtree':
        return this.applyRestore(projectId, command);
    }
  }

  private async applyMove(
    projectId: string,
    id: string,
    parentId: string | null,
    afterId: string | null,
  ): Promise<ApplyOutcome> {
    const rows = await this.opts.workItems.listByProject(projectId);
    const moving = rows.find((row) => row.id === id);
    if (moving === undefined) return { ok: false, detail: 'the work item is no longer there' };
    if (moving.frozenNumber !== null) {
      return { ok: false, detail: 'that work item has been frozen since, so it cannot move' };
    }
    if (parentId !== null && !rows.some((row) => row.id === parentId)) {
      return { ok: false, detail: 'the work item it sat under has been deleted since' };
    }
    const group = this.groupUnder(rows, parentId).filter((sibling) => sibling.id !== id);
    // `placeAfter` throws on a sibling that is not in the group, which is the
    // right answer for a caller that made the id up and the wrong one for a
    // row somebody deleted while this entry sat on the stack.
    if (afterId !== null && !group.some((sibling) => sibling.id === afterId)) {
      return { ok: false, detail: 'the work item it sat after has been deleted since' };
    }
    const placed = placeAfter(group, afterId);
    await this.opts.workItems.move(id, parentId, placed.position, placed.renumbered);
    return { ok: true, detail: null };
  }

  private async applyDelete(
    projectId: string,
    command: Extract<CompensatingCommand, { do: 'delete_subtree' }>,
  ): Promise<ApplyOutcome> {
    const rows = await this.opts.workItems.listByProject(projectId);
    if (!rows.some((row) => row.id === command.rootId)) {
      return { ok: false, detail: 'the work item is no longer there' };
    }
    // The guard a revision cannot give. A child written under a work item is a
    // row of its own and moves nothing on its parent, so a created row that
    // has since been built on still reads at the revision it was created with
    // — and taking it away would take somebody else's work with it.
    const now = new Set(subtreeOf(rows, command.rootId));
    const then = new Set(command.expectedSubtree);
    if (now.size !== then.size || [...then].some((id) => !now.has(id))) {
      return { ok: false, detail: 'work has been added or removed under that row since' };
    }
    for (const gone of command.remove) await this.opts.dependencies.removeAllFor(gone);
    await this.opts.workItems.remove(command.remove, command.reparented);
    for (const each of command.setEstimates) await this.opts.estimates.set(each);
    return { ok: true, detail: null };
  }

  private async applyRestore(
    projectId: string,
    command: Extract<CompensatingCommand, { do: 'restore_subtree' }>,
  ): Promise<ApplyOutcome> {
    const root = command.rows.at(0);
    if (root === undefined) throw new Error('a restore was journalled with no rows in it');
    const rows = await this.opts.workItems.listByProject(projectId);
    const taken = command.rows.find((row) => rows.some((each) => each.id === row.id));
    if (taken !== undefined) {
      // Nothing recreates an id, so this means something else is using one
      // this branch owns. Remapping to fresh ids would leave every reference
      // to the branch — journalled and otherwise — aimed at rows that are gone.
      return { ok: false, detail: 'something already exists where that work item was' };
    }
    if (root.parentId !== null && !rows.some((each) => each.id === root.parentId)) {
      return { ok: false, detail: 'the work item it sat under has been deleted since' };
    }

    // The sibling group as it will be once the reparenting has happened: the
    // rows going back under this branch leave it, and the ones the deletion
    // respaced take their old positions again. Placing against the group as it
    // stands would put the branch beside rows that are about to move.
    const backById = new Map(command.reparented.map((each) => [each.id, each]));
    const projected = rows
      .map((row) => {
        const back = backById.get(row.id);
        return back === undefined
          ? row
          : { ...row, parentId: back.parentId, position: back.position };
      })
      .filter((row) => row.parentId === root.parentId)
      .map(asSibling);
    const wasAfter = projected
      .filter((sibling) => sibling.position < command.rootPosition)
      .sort((a, b) => a.position - b.position)
      .at(-1);
    const placed = placeAfter(projected, wasAfter?.id ?? null);

    await this.opts.subtrees.insertSubtree({
      rows: command.rows.map((row) => ({
        ...row,
        position: row.id === root.id ? placed.position : row.position,
        // A row that has been away and come back is new to every reader
        // holding a number for it, so it starts again at 0 rather than
        // resuming the count it had. The consequence is deliberate: an older
        // entry on the stack that expected one of these rows at 4 now refuses,
        // which is the safe direction — see `design.md`.
        revision: 0,
      })),
      respaced: placed.renumbered,
      reparented: command.reparented,
      estimates: command.estimates,
      assignments: command.assignments,
      dependencies: command.internalDependencies,
      removedEstimates: command.removedEstimates,
    });

    // The edges that leave the branch, one at a time and through the same
    // guard an ordinary request goes through. This is the one part of a
    // restore that can come back incomplete, and it says so rather than
    // pretending otherwise.
    const after = await this.opts.workItems.listByProject(projectId);
    const skipped: string[] = [];
    for (const edge of command.externalDependencies) {
      const current = await this.opts.dependencies.listByProject(projectId);
      const refusal = canDepend(after, current, edge.predecessorId, edge.successorId);
      if (refusal !== null) {
        skipped.push(refusal);
        continue;
      }
      await this.opts.dependencies.add({
        id: this.newId(),
        projectId,
        predecessorId: edge.predecessorId,
        successorId: edge.successorId,
      });
    }
    return {
      ok: true,
      detail:
        skipped.length === 0
          ? null
          : `put back without ${String(skipped.length)} dependenc${skipped.length === 1 ? 'y' : 'ies'} the plan no longer allows (${[...new Set(skipped)].join(', ')})`,
    };
  }

  /**
   * Writes one command down, after it has been applied and announced.
   *
   * **Ordering, and what it costs.** The change is applied and broadcast
   * first, then journalled. A journal write that throws therefore fails the
   * request for a change that has already happened — the client refetches and
   * sees it — while everybody else's view of the plan stays correct. The
   * alternative, journalling before the broadcast, would trade an accurate
   * error for a project full of readers sitting on a tree that has moved.
   * Neither swallows the failure: the one thing this must never do is report
   * success for a command it did not record, because the symptom would be an
   * undo key that quietly skips a change. See `design.md`.
   *
   * The preconditions are read **after** the mutation, and are the revisions
   * it left behind. Recording the revisions from before it would make an undo
   * of somebody's own second edit pass when it must refuse.
   */
  private async record(
    projectId: string,
    actorId: string,
    kind: string,
    label: string,
    recording: Recording,
  ): Promise<void> {
    await this.opts.journal.append({
      id: this.newId(),
      projectId,
      userId: actorId,
      kind,
      payload: { label, forward: recording.forward },
      inverse: recording.inverse,
      preconditions: {
        expected: await this.revisionsOf(projectId, recording.touched),
        // The same entities as they were before the mutation, read off the row
        // list the mutation's own guard produced. Nothing is checked against
        // it — it is what tells a later undo whether the entry beneath this
        // one is still describing an unbroken chain. See `Preconditions`.
        from: revisionsIn(recording.before, recording.touched),
      },
      createdAt: this.now(),
    });
  }

  /**
   * Runs a write that names a role, answering false when the role went between
   * the check above it and the statement itself.
   *
   * {@link WorkItemService.holdsRole} narrows the window and does not close it:
   * a removal can commit between that read and this write, and `estimate` and
   * `assignment` both reference `role.id` by foreign key. Left alone that is a
   * 500 for a caller whose only fault is being a moment out of date, which R5
   * calls a modeled condition wearing an invariant's clothes.
   *
   * The translation is deliberately narrow. SQLite's message names no column,
   * so the role is re-read before the refusal is believed: a foreign key that
   * failed over a work item or a person that has gone is still unknown, and
   * still thrown.
   *
   * Proof: with the `catch` removed, `refuses the estimate rather than
   * answering with the foreign key` and `refuses the assignee the same way`
   * both fail with `SQLiteError: FOREIGN KEY constraint failed`; with the
   * `holdsRole` re-read dropped, `still throws a foreign key that is not about
   * the role` fails, an absent person reported as an absent phase. Watched
   * 2026-08-09.
   */
  private async writeNamingRole(
    projectId: string,
    roleId: string,
    write: () => Promise<void>,
  ): Promise<boolean> {
    try {
      await write();
      return true;
    } catch (err) {
      if (!isForeignKeyViolation(err)) throw err;
      if (await this.holdsRole(projectId, roleId)) throw err;
      return false;
    }
  }

  /**
   * Whether the project still holds this role.
   *
   * Asked on every write that names one, because a role can be removed while a
   * client has it on screen — and both `estimate` and `assignment` reference it
   * by foreign key. Reading the project's roles rather than taking a role store
   * of its own: the answer is one column of a list this service already reads.
   *
   * Proof: with both calls removed, `refuses an estimate and an assignee for a
   * role that has gone, rather than 500ing` fails with two 500s, and `leaves an
   * undo whose role has gone refusing as stale, not writing` 500s too; watched
   * 2026-08-08.
   */
  private async holdsRole(projectId: string, roleId: string): Promise<boolean> {
    const roles = await this.opts.projects.rolesOf(projectId);
    return roles.some((each) => each.id === roleId);
  }

  /** One work item's stored trio for one role, or null when it holds none. */
  private async storedTrio(
    projectId: string,
    workItemId: string,
    roleId: string,
  ): Promise<Days | null> {
    const found = (await this.opts.estimates.listByProject(projectId)).find(
      (each) => each.workItemId === workItemId && each.roleId === roleId,
    );
    if (found === undefined) return null;
    return {
      optimistic: found.optimistic,
      realistic: found.realistic,
      pessimistic: found.pessimistic,
    };
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
