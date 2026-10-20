import type { AllowancePercent, Days, MeasureMetric, StepState } from '@wbs/domain';

import type { ActualKey, StoredActual } from '../ports/actual-store';
import type { Claim } from '../ports/claim-store';
import type { StoredDependency } from '../ports/dependency-store';
import type { Assignment } from '../ports/directory-store';
import type { StoredEstimate } from '../ports/estimate-store';
import type { MeasureKey, StoredMeasure } from '../ports/measure-store';
import type { ProgressKey, StoredProgress } from '../ports/progress-store';
import type { StoredStepBlockage } from '../ports/step-blockage-store';
import type { IssuedAttemptNumber, StoredAttempt } from '../ports/step-node-attempt-store';
import type { EstimateKey } from '../ports/subtree-store';
import type { StoredTypedDependency } from '../ports/typed-dependency-store';
import type { FrozenNumber, Reparented, WorkItem, WorkItemPatch } from '../ports/work-item-store';
// Documentation targets remain in the journal decoder; these aliases preserve their displayed names.
import type {
  Preconditions as _Preconditions,
  referencesOf as _referencesOf,
  stepRevisionKey as _stepRevisionKey,
} from './compensating';

/**
 * One command, expressed so that it can be applied without knowing what it is
 * compensating for.
 *
 * Every journalled change is stored twice in this vocabulary: once as the
 * command a **redo** re-applies, and once as the command an **undo** applies.
 * The two are the same shape on purpose — `apply` has one implementation, so
 * undoing and redoing cannot drift apart, and an inverse is an ordinary
 * mutation that happens to restore rather than a second write path with its
 * own bugs.
 *
 * Each carries its whole before-state. Nothing here is recomputed from the
 * tree at the moment it is applied: a value worked out then would be worked
 * out from a plan that has moved on, which is the entire failure conditional
 * undo exists to prevent.
 */
export type CompensatingCommand =
  | { do: 'patch'; workItemId: string; patch: WorkItemPatch }
  | { do: 'set_estimate'; workItemId: string; stepId: string; days: Days }
  | { do: 'clear_estimate'; workItemId: string; stepId: string }
  /**
   * The days actually spent, as a plain number rather than a trio: an estimate
   * is a guess about a range and an actual is a fact about what happened.
   *
   * `recordedAt` is **not** carried. Re-applying this command stamps the write
   * with the moment it is re-applied, because that column says when the number
   * was typed and an undo is somebody typing it again now. Carrying the original
   * stamp would let a redo write a row that claims to predate the command that
   * wrote it.
   */
  | { do: 'set_actual'; workItemId: string; stepId: string; days: number }
  | { do: 'clear_actual'; workItemId: string; stepId: string }
  /**
   * A figure in a unit that is not days — tokens estimated, tokens spent, hours
   * spent — carrying the `metric` because that is part of the row's identity
   * rather than a property of it. A `set_measure` that dropped it would put the
   * number back under whichever metric happened to be read first.
   *
   * `recordedAt` is **not** carried, for `set_actual`'s reason exactly: an undo
   * is somebody recording the figure again, now.
   */
  | { do: 'set_measure'; workItemId: string; stepId: string; metric: MeasureMetric; value: number }
  | { do: 'clear_measure'; workItemId: string; stepId: string; metric: MeasureMetric }
  /**
   * Where the work has got to, as one of the two states a step may be **stored**
   * in. There is no `set_progress` carrying `unknown`: the way to say that
   * is `clear_progress`, because the absence of a row is how it is spelled in
   * the table and a command that could write it would be a second spelling.
   *
   * `statedAt` is **not** carried, for the reason `set_actual` does not carry
   * `recordedAt`: re-applying this is somebody saying it again, now.
   */
  | { do: 'set_progress'; workItemId: string; stepId: string; state: StepState }
  | { do: 'clear_progress'; workItemId: string; stepId: string }
  /** Conditional sparse fact replay; the original blocked time survives redo and undo. */
  | {
      do: 'replace_blockage';
      workItemId: string;
      stepId: string;
      expectedBlockedAt: number | null;
      replacementBlockedAt: number | null;
    }
  | { do: 'assign'; workItemId: string; stepId: string; personId: string | null }
  /**
   * One work item's demand on one resource written back, or removed on `null`
   * (`wbs-resources`): `setDemand`'s forward and inverse alike.
   */
  | { do: 'set_demand'; workItemId: string; resourceId: string; units: number | null }
  /**
   * Claims written back verbatim — id, run, parent and writing account — with
   * the `in_progress` statements the claim made on steps nobody had spoken
   * about: the redo of a claim and the undo of a release (`wbs-team-claims`).
   */
  | { do: 'add_claims'; claims: Claim[]; stated: ProgressKey[] }
  /**
   * Claims taken off by id, with the statements the claim had made: the undo
   * of a claim and the redo of a release. A release clears nothing.
   */
  | { do: 'remove_claims'; claims: Claim[]; cleared: ProgressKey[] }
  /**
   * One attempt written back **verbatim** under its own number, its instants,
   * outcome, executor, reference and note exactly as carried
   * (`step-node-attempts` D2): the redo of a start or an end, and the undo of
   * an end or a removal. An undo of an end is this patch of the prior row,
   * never a delete — the attempt existed before the end and exists after its
   * undo, running again.
   *
   * Unlike `set_progress` the instants **are** carried: they say when the work
   * ran, not when somebody typed it, and an undo must not move them.
   */
  | { do: 'restore_attempt'; attempt: StoredAttempt }
  /** Takes one attempt off by its number: the undo of a start and the redo of a removal. */
  | { do: 'remove_attempt'; workItemId: string; stepId: string; attemptNumber: number }
  | { do: 'add_dependency'; successorId: string; predecessorId: string }
  | { do: 'remove_dependency'; successorId: string; predecessorId: string }
  | { do: 'add_typed_dependency'; dependency: StoredTypedDependency }
  | { do: 'remove_typed_dependency'; dependency: StoredTypedDependency }
  | { do: 'update_typed_dependency'; from: StoredTypedDependency; to: StoredTypedDependency }
  /**
   * Historical destination progress may remain in place through inverse reparenting
   * only when the complete snapshot still matches. Absence requires no progress.
   * These are comparison facts, never progress writes or new statement timestamps.
   */
  | {
      do: 'move';
      workItemId: string;
      parentId: string | null;
      afterId: string | null;
      expectedProgress?: StoredProgress[];
    }
  /**
   * One press of `Arrange by schedule`: every work item of every sibling group
   * whose order changed, at the position it now holds.
   *
   * **Exact positions rather than *n* `move` steps**, which is the decision ADR
   * 0023's second half records. A `move` replays through `placeAfter`, one at a
   * time and respacing as it goes, and every `afterId` in such a batch goes
   * stale the moment somebody adds a sibling between the press and the undo.
   * A position is what the arrangement decided; re-deriving it later is a
   * second arrangement, of a plan that has moved on.
   *
   * `moved` is carried beside them because it is not recoverable from the
   * positions alone: it names the work items whose **place** changed, which is
   * what decides revisions and therefore what a peer's pending undo is refused
   * by. Respacing a sibling that stayed put must not bump it.
   */
  | { do: 'set_positions'; placements: Reparented[]; moved: string[] }
  | { do: 'set_frozen'; updates: FrozenNumber[] }
  /**
   * A project step's allowance, set to `allowancePercent`.
   *
   * Its precondition is the step's **allowance revision**, held in
   * {@link _Preconditions | Preconditions} under {@link _stepRevisionKey | stepRevisionKey}: an undo after
   * somebody else's edit — even one that put the value back — or after the
   * step's removal is refused as stale rather than overwriting newer work.
   */
  | { do: 'set_step_allowance'; stepId: string; allowancePercent: AllowancePercent }
  | DeleteSubtree
  | RestoreSubtree
  | Batch;

/**
 * A {@link Command batch} as one compensating command: the steps in the order
 * they are to be applied. A batch's forward holds the steps' forwards; its
 * inverse holds the steps' inverses **reversed**, so undoing walks the batch
 * backwards. `plan-commands` D3.
 *
 * Only ever recorded for two or more steps — a batch of one is recorded as that
 * one command, so a single edit's undo label and plan event are what they were.
 */
export interface Batch {
  do: 'batch';
  steps: CompensatingCommand[];
}

/** Exact deletion-owned facts; empty collections remain meaningful replay guards. */
export interface DeletionState {
  blockages: StoredStepBlockage[];
  /** Forward deletion hand-up; absent directions write no parent blockage. */
  handedBlockages?: StoredStepBlockage[];
  parentId: string | null;
  parentBlockages: StoredStepBlockage[];
  /** Historical parent statements to retain after undo recreates its children. */
  restoredParentProgress: StoredProgress[];
}

/**
 * Takes a branch away again: the inverse of a create or a duplicate, and the
 * re-application of a delete.
 *
 * `expectedSubtree` is the guard a revision cannot give. Adding a child under
 * a work item writes a row of its own and moves nothing on the parent, so a
 * created row that has since been built on reads at the revision it was
 * created with. Deleting it would take somebody else's work with it, and this
 * is what refuses instead.
 */
export interface DeleteSubtree {
  do: 'delete_subtree';
  deletionState?: DeletionState;
  /** The row whose whole subtree must still look the way the command left it. */
  rootId: string;
  /** Every id that was under `rootId`, including it, when the command ran. */
  expectedSubtree: string[];
  /** The ids actually deleted — all of `expectedSubtree` for a cascade, the root alone for a promotion. */
  remove: string[];
  /** Where the children being promoted out of `remove` go, and the respacing around them. */
  reparented: Reparented[];
  /** Estimates handed **up** to the surviving parent, exactly as the original delete wrote them. */
  setEstimates: StoredEstimate[];
  /**
   * Actuals handed **up** to the surviving parent, the same way and at the same
   * moment as {@link DeleteSubtree.setEstimates}.
   *
   * Carried with their `recordedAt` from the rows they were summed out of — the
   * newest of them, since the parent's number is now the whole branch's — so a
   * re-applied delete leaves the same stamp the original left rather than
   * claiming the days were recorded at the moment somebody pressed redo.
   */
  setActuals: StoredActual[];
  /**
   * Statements handed **up** to the surviving parent, at the same moment and by
   * the same rule as {@link DeleteSubtree.setActuals}.
   *
   * The branch's folded reading rather than its rows — a deleted child that is
   * itself a parent holds no rows of its own — and `unknown` is never in
   * here, because that is the absence of a row. Carried with the newest
   * `statedAt` in the branch, since the parent's reading is now the whole
   * branch's.
   */
  setProgress: StoredProgress[];
  /**
   * Figures in every unit that is not days, handed **up** to the surviving
   * parent, at the same moment and by the same rule as
   * {@link DeleteSubtree.setActuals}.
   *
   * The branch's folded totals rather than its rows, per metric, each carrying
   * the newest `recordedAt` in the branch for that metric and step — the
   * parent's figure is now the whole branch's. A metric nobody recorded
   * anywhere in the branch contributes nothing here, because the absence of a
   * row is how "nobody has said" is spelled in every unit.
   */
  setMeasures: StoredMeasure[];
  /**
   * Attempts handed **up** to the surviving parent verbatim, numbers kept: the
   * undo of a create that handed a leaf's attempts down to its first child
   * (`step-node-attempts` D1). Without them the child's delete would cascade
   * the attempts away. Absent from journals written before attempts existed,
   * which hand nothing up.
   */
  setAttempts?: StoredAttempt[];
}

/**
 * Puts a branch back: the inverse of a delete, and the re-application of a
 * create or a duplicate.
 *
 * The rows come back with the ids they had. Nothing recreated them — a
 * collision means something else is now using an id this branch owns, and that
 * is refused rather than remapped: a restore that invented fresh ids would
 * leave every journalled reference to the branch, and everybody else's, aimed
 * at rows that are gone.
 */
export interface RestoreSubtree {
  do: 'restore_subtree';
  deletionState?: DeletionState;
  /**
   * Ancestors first: `parent_id` references a row that has to be there already.
   * New journals carry the whole team set; old journals omit it and restore
   * the singleton projected in `serviceTeamId`.
   */
  /** Rows as {@link SubtreeCopy} inserts them, their team and type links included. */
  rows: (WorkItem & { teamIds?: readonly string[]; typeIds?: readonly string[] })[];
  /** Where the root sat among its siblings, which is how the restore finds its slot again. */
  rootPosition: number;
  /** Rows to put back under the restored branch, at the positions they had before. */
  reparented: Reparented[];
  estimates: StoredEstimate[];
  /**
   * The days recorded against the rows being restored, put back with them.
   *
   * Empty for the restore a **create** is the inverse of, except in one case: a
   * leaf that gains its first child hands its figures down, actuals with
   * estimates, so undoing that create has to hand them back up. Empty for a
   * **duplicate**, whose copies were never worked on — see
   * {@link SubtreeCopy.actuals}.
   */
  actuals: StoredActual[];
  /**
   * What the rows being restored said about themselves, put back with them.
   *
   * Empty for the restore a **create** is the inverse of, except in one case: a
   * leaf that gains its first child hands its statements down with its figures,
   * so undoing that create has to hand them back up. Empty for a **duplicate**,
   * whose copies nobody has ever worked on or spoken about.
   */
  progress: StoredProgress[];
  /**
   * The tokens and hours recorded against the rows being restored, put back
   * with them.
   *
   * Empty for the restore a **create** is the inverse of, except in the one
   * case the two figures beside it name: a leaf that gains its first child
   * hands everything it holds down, measures with actuals, so undoing that
   * create has to hand them back up. Empty for a **duplicate**, whose copies
   * nobody has ever spent a token or an hour on — see
   * {@link SubtreeCopy.measures}.
   */
  measures: StoredMeasure[];
  /**
   * The attempts at the restored rows' step nodes, put back verbatim with
   * their numbers: every attempt a delete's cascade took, or, for the redo of a
   * first-child create, the ones the create handed down. Absent from journals
   * written before attempts existed.
   */
  attempts?: StoredAttempt[];
  /**
   * The restored rows' attempt-number marks (A42), raised after the attempts:
   * the delete's cascade took them, and a number removed while it was the
   * highest shows in no attempt above. Each names a restored row; one on a
   * step removed since is dropped with that step. Not in
   * {@link _referencesOf | referencesOf}: the rows are the branch's own and the steps are
   * checked against the project when it is applied. Absent from journals
   * written before marks existed, whose restores raise each node to its
   * attempts' highest number only.
   */
  issuedAttemptNumbers?: IssuedAttemptNumber[];
  assignments: Assignment[];
  /** New journals carry the parent-to-child node IDs; old journals omit them because older creates recorded no mapping. */
  stepNodeMapping?: { from: string; to: string }[];
  /** Edges with both ends inside the branch: restored with it, in the same write. */
  internalDependencies: StoredDependency[];
  /**
   * Edges with one end outside the branch, restored **best-effort**.
   *
   * They are the one part of a restore that can come back incomplete, and the
   * one part whose other end is deliberately **not** a precondition. The row
   * at the far end may have been deleted, moved under the branch, or wired
   * into a path that would now close a circle, and each of those is judged
   * against the plan as it stands when the restore runs. Refusing the whole
   * restore for any of them would strand the branch for a reason that has
   * nothing to do with it; putting the edge back regardless would hand the
   * project a schedule nobody can compute. So the branch returns without that
   * edge, and the answer says how many and why.
   */
  externalDependencies: StoredDependency[];
  /** Estimates to take off the surviving parent, undoing the hand-up a delete did. */
  removedEstimates: EstimateKey[];
  /** Actuals to take off the surviving parent, for {@link RestoreSubtree.removedEstimates}' reason. */
  removedActuals: ActualKey[];
  /** Statements to take off the surviving parent, for {@link RestoreSubtree.removedEstimates}' reason. */
  removedProgress: ProgressKey[];
  /**
   * Figures to take off the surviving parent, for
   * {@link RestoreSubtree.removedEstimates}' reason, one key per metric.
   *
   * The metric is part of the key because it is part of the row's identity: a
   * pair may hold a token estimate the delete handed up and an hours fact it
   * did not, and taking the pair away wholesale would delete a figure this
   * restore never wrote.
   */
  removedMeasures: MeasureKey[];
  /**
   * Attempts to take off the surviving parent by number, for
   * {@link RestoreSubtree.removedEstimates}' reason: the redo of a first-child
   * create hands them down again. Absent from older journals.
   */
  removedAttempts?: AttemptKey[];
}

/** One attempt's identity: its node and its number. */
export interface AttemptKey {
  workItemId: string;
  stepId: string;
  attemptNumber: number;
}

/** What a journalled command did, in the words an undo says back. */
export interface JournalPayload {
  /** `rename “Strip”` — the sentence, already built, so it never re-derives a number that has moved. */
  label: string;
  /** What a redo re-applies. */
  forward: CompensatingCommand;
}

/** The one work item and step a command was aimed at, either of them absent. */
export interface CommandSubject {
  workItemId: string | null;
  stepId: string | null;
}
