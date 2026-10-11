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

/** A start, or the node's running attempt refusing it (the unique partial index's face). */
export type AttemptStarted =
  | { readonly ok: true; readonly attempt: RunningStoredAttempt }
  | { readonly ok: false; readonly reason: 'attempt_running' };

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
   * Starts the node's next attempt, numbered its highest plus one, read inside
   * the write transaction so two concurrent starts cannot take one number.
   *
   * @throws the driver's error for a work item, step or executor that does not
   * exist: the command layer resolves all three before it writes.
   */
  start(start: AttemptStart, stamp: WriteStamp): Promise<AttemptStarted>;
  /** Ends the node's running attempt; the database's check refuses an end before the start. */
  end(end: AttemptEnd, stamp: WriteStamp): Promise<AttemptEnded>;
  /** Takes one attempt off by its number, answering the row it took or null when none was there. */
  remove(
    workItemId: string,
    stepId: string,
    attemptNumber: number,
    stamp: WriteStamp,
  ): Promise<StoredAttempt | null>;
  /**
   * Writes one attempt back verbatim under its own number, inserting it or
   * overwriting the row holding that number: the inverse of {@link remove} and
   * of {@link end}.
   */
  restore(attempt: StoredAttempt, stamp: WriteStamp): Promise<void>;
  /**
   * Moves every attempt from one work item to another, numbers kept, for
   * `StepProgressStore.moveAll`'s reason: a leaf that gains its first child
   * stops being a node anyone reads, and its history goes to the child.
   */
  moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void>;
}
