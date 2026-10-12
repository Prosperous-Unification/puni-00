import type { Attempt, AttemptOutcome, RunningAttempt } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';

/** One attempt on the step node it ran at: a leaf's work item and one of its project's steps. */
export type StoredAttempt = Attempt & { readonly workItemId: string; readonly stepId: string };

/** A {@link StoredAttempt} that is still running. */
export type RunningStoredAttempt = RunningAttempt & {
  readonly workItemId: string;
  readonly stepId: string;
};

/** What {@link StepNodeAttemptStore.start} writes; the store assigns the number. */
export interface AttemptStart {
  readonly workItemId: string;
  readonly stepId: string;
  /** Epoch milliseconds, UTC. */
  readonly startedAt: number;
  readonly executorPersonId: string | null;
  readonly reference: string | null;
  readonly note: string | null;
}

/** The running attempt it ends, and with what; an absent reference or note keeps the stored one. */
export interface AttemptEnd {
  readonly workItemId: string;
  readonly stepId: string;
  /** Epoch milliseconds, UTC, never before the running attempt's start. */
  readonly endedAt: number;
  readonly outcome: AttemptOutcome;
  readonly reference?: string | null;
  readonly note?: string | null;
}

/**
 * The highest number a step node has issued (A42, ADR 0045): the floor its
 * next start numbers above. Outlives every attempt it counted, so a removed
 * number is never claimed again.
 */
export interface IssuedAttemptNumber {
  readonly workItemId: string;
  readonly stepId: string;
  readonly issued: number;
}

/**
 * A start, or its refusal: the node's running attempt (the unique partial
 * index's face), or the node stated `done`, read inside the start's own write
 * transaction so another process stating it done meanwhile is seen.
 */
export type AttemptStarted =
  | { readonly ok: true; readonly attempt: RunningStoredAttempt }
  | { readonly ok: false; readonly reason: 'attempt_running' | 'node_done' };

/** An end with the row as it was before, which is the undo's whole inverse. */
export type AttemptEnded =
  | { readonly ok: true; readonly prior: RunningStoredAttempt; readonly attempt: StoredAttempt }
  | { readonly ok: false; readonly reason: 'no_running_attempt' };

/**
 * Reading and writing the attempts at step nodes (ADR 0045,
 * `openspec/changes/step-node-attempts/design.md` D1).
 *
 * An attempt is a satellite of its work item, like a progress statement: every
 * write moves that work item's revision in the same transaction. Unlike a
 * statement it is **never pruned and never overwritten by a newer one** — a
 * node holds a history, numbered from 1, at most one of them running.
 *
 * Follows its work item through the hand-down when a leaf gains its first child
 * ({@link moveAll}), at the call site the estimates, actuals, progress and
 * measures move from.
 */
export interface StepNodeAttemptStore {
  /** Every attempt in the project, by work item, then step position, then number ascending. */
  listByProject(projectId: string): Promise<StoredAttempt[]>;
  /**
   * {@link listByProject} narrowed to the requested work items of the project;
   * an id outside it reads nothing.
   */
  listByWorkItems(projectId: string, ids: readonly string[]): Promise<StoredAttempt[]>;
  /** One work item's attempts keyed by step id, each list in ascending number. */
  listOfWorkItem(workItemId: string): Promise<ReadonlyMap<string, readonly StoredAttempt[]>>;
  /**
   * Starts the node's next attempt, numbered one past the higher of its
   * {@link IssuedAttemptNumber} and its highest row, both read inside the write
   * transaction so two concurrent starts cannot take one number, and writes
   * that number back as the node's mark (A42).
   *
   * @throws the driver's error for a work item, step or executor that does not
   * exist: the command layer resolves all three before it writes.
   */
  start(start: AttemptStart, stamp: WriteStamp): Promise<AttemptStarted>;
  /** Ends the node's running attempt; the database's check refuses an end before the start. */
  end(end: AttemptEnd, stamp: WriteStamp): Promise<AttemptEnded>;
  /**
   * Takes one attempt off by its number, answering the row it took or null
   * when none was there. The node's mark stays: the number remains issued,
   * which is also why the undo of a start, a removal, leaves the next start
   * one past it.
   */
  remove(
    workItemId: string,
    stepId: string,
    attemptNumber: number,
    stamp: WriteStamp,
  ): Promise<StoredAttempt | null>;
  /**
   * Writes one attempt back verbatim under its own number, inserting it or
   * overwriting the row holding that number: the inverse of {@link remove} and
   * of {@link end}, and the redo of a start. Raises the node's mark to the
   * number when it is higher, never lowers it.
   */
  restore(attempt: StoredAttempt, stamp: WriteStamp): Promise<void>;
  /**
   * The marks of the requested work items of the project, by work item then
   * step id; an id outside it reads nothing. Read before a delete for its undo:
   * the marks cascade with their work item.
   */
  listIssued(projectId: string, ids: readonly string[]): Promise<IssuedAttemptNumber[]>;
  /**
   * Raises each node's mark to the one given when it is higher, never lowering
   * it: how the restore of a deleted branch puts back numbers its attempts no
   * longer show. Moves no revision, as no reader sees a mark.
   *
   * @throws the driver's error for a work item or step that does not exist.
   */
  raiseIssued(marks: readonly IssuedAttemptNumber[]): Promise<void>;
  /**
   * Moves every attempt from one work item to another, numbers kept, for
   * `StepProgressStore.moveAll`'s reason: a leaf that gains its first child
   * stops being a node anyone reads, and its history goes to the child.
   *
   * Copies the marks rather than moving them, so a highest attempt removed
   * before the child arrived is still skipped at the child, and the parent
   * keeps its own: the undo of the create writes the attempts back onto the
   * parent, which then still knows every number it issued.
   */
  moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void>;
}
