import type { StepState } from '@wbs/domain/progress';

import { createChannel } from '@/modules/channel';
import type { DeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
import type { PlanWriter } from '@/modules/plan-writer/contract';
import type { Store } from '@/modules/store';

import type { StepBoardCard } from './step-board';

export type BoardColumn = 'unknown' | 'inProgress' | 'done';

export interface BoardActionHost {
  readonly plan: Store<DeliveredPlan>;
  readonly isCurrent: () => boolean;
  readonly writer: PlanWriter;
  readonly commands: {
    readonly setProgress: (workItemId: string, stepId: string, state: StepState) => Promise<void>;
    readonly clearProgress: (workItemId: string, stepId: string) => Promise<void>;
  };
}

export type BoardActionSnapshot =
  | { readonly kind: 'idle' | 'captured' | 'pending' }
  | { readonly kind: 'rejected'; readonly message: string };

export type BoardMoveOutcome = 'landed' | 'landed-unread' | 'refused' | 'not-sent';

export interface StepBoardAction extends Store<BoardActionSnapshot> {
  readonly capture: (card: StepBoardCard, column: BoardColumn) => void;
  readonly move: (target: BoardColumn) => Promise<BoardMoveOutcome>;
  readonly cancel: () => void;
}

interface CapturedCard {
  readonly workItemId: string;
  readonly stepId: string;
  readonly column: BoardColumn;
  readonly progress: StepState | null;
}

/** Check the delivered pair again at dispatch because commandsIssued can publish a newer tree. */
function rejectGesture(host: BoardActionHost, gesture: CapturedCard): string | null {
  // Proof: disabling this shared predicate at both call sites sent setProgress for a withdrawn
  // runtime; `sends no command for a withdrawn runtime` observed its command ledger first.
  // The same fault sent an old action's second request after real p2→p1→p2 owner replacement.
  if (!host.isCurrent()) return 'This work package is no longer selected.';
  const delivered = host.plan.snapshot();
  // Proof: dropping the absent-tree arm made a typed captured card against a current runtime
  // with no first tree reject with a TypeError instead of the modeled not-sent feedback.
  // Proof: independently dropping stale and failure checks made `sends no command when the
  // tree is stale/failed` receive landed and dispatch a progress request.
  if (
    delivered.tree === null ||
    delivered.treeFailure !== null ||
    delivered.staleResources.includes('tree')
  ) {
    return 'The plan needs a fresh tree read before this step can move.';
  }
  const tree = delivered.tree.value;
  const row = tree.workItems.find((candidate) => candidate.id === gesture.workItemId);
  // Proof: disabling row presence caused `deleted row` to dereference the absent row;
  // disabling the leaf check made `parent conversion` send a request and receive landed.
  if (row === undefined || tree.workItems.some((candidate) => candidate.parentId === row.id)) {
    return 'This work item is no longer a leaf in the current plan.';
  }
  // Proof: disabling this check made `deleted step` send a request and receive landed.
  if (!tree.steps.some((step) => step.id === gesture.stepId)) {
    return 'This step is no longer in the current plan.';
  }
  const progress = Object.hasOwn(row.progress, gesture.stepId)
    ? row.progress[gesture.stepId]
    : null;
  // Proof: disabling this comparison made the peer-progress-change test receive landed.
  if (progress !== gesture.progress) return 'This step progress changed before the move.';
  return null;
}

/** One selected runtime's Board progress admission and local gesture state. */
export function createStepBoardAction(host: BoardActionHost): StepBoardAction {
  const changes = createChannel<undefined>();
  let current: BoardActionSnapshot = { kind: 'idle' };
  let captured: CapturedCard | null = null;
  let pending = false;
  const replace = (next: BoardActionSnapshot): void => {
    current = next;
    changes.publish(undefined);
  };
  return {
    subscribe: (listener) => changes.subscribe(listener),
    snapshot: () => current,
    capture: (card, column) => {
      // Proof: removing this guard changed the pending snapshot to captured in
      // `rejects a second target while its own request is pending`.
      if (pending) return;
      captured = {
        workItemId: card.workItemId,
        stepId: card.stepId,
        column,
        progress: column === 'unknown' ? null : column === 'inProgress' ? 'in_progress' : 'done',
      };
      replace({ kind: 'captured' });
    },
    async move(target) {
      // Proof: removing pending admission made the second target send a second request in
      // `rejects a second target while its own request is pending`.
      // Proof: substituting shared busy for pending sent a second setProgress after a real
      // overlapping Plan writer lowered busy while this Board request was still held.
      if (pending || captured === null) return 'not-sent';
      const gesture = captured;
      // Proof: disabling this branch sent clearProgress for a same-column target.
      if (target === gesture.column) {
        captured = null;
        replace({ kind: 'idle' });
        return 'not-sent';
      }
      // Proof: bypassing this invocation alone left the final request guard intact but emitted
      // one commandsIssued event for an already-withdrawn runtime.
      const entryRejection = rejectGesture(host, gesture);
      if (entryRejection !== null) {
        captured = null;
        replace({ kind: 'rejected', message: entryRejection });
        return 'not-sent';
      }
      pending = true;
      // Proof: clearing pending here before the held request made `keeps admission pending
      // through both request and covering reread` observe idle instead of pending.
      replace({ kind: 'pending' });
      const dispatch: { rejection: string | null } = { rejection: null };
      try {
        const outcome = await host.writer.run(async (write) => {
          // Proof: bypassing only this invocation sent setProgress after commandsIssued retired
          // the runtime; the peer-progress notification likewise sent setProgress from stale
          // captured progress. Both tests inspected the command ledger before the outcome.
          dispatch.rejection = rejectGesture(host, gesture);
          if (dispatch.rejection !== null) return;
          if (target === 'unknown') {
            // Proof: substituting setProgress for clearProgress made Done→Unknown's exact
            // command assertion fail with setProgress instead of clearProgress.
            await write.perform(['tree'], () =>
              host.commands.clearProgress(gesture.workItemId, gesture.stepId),
            );
          } else {
            // Proof: changing the work-item id to `other-row` failed the exact pair assertion;
            // forcing `done` failed Unknown→In progress's exact state assertion.
            await write.perform(['tree'], () =>
              host.commands.setProgress(
                gesture.workItemId,
                gesture.stepId,
                target === 'inProgress' ? 'in_progress' : 'done',
              ),
            );
          }
        });
        if (dispatch.rejection !== null || outcome === 'unsent') return 'not-sent';
        return outcome;
      } finally {
        pending = false;
        captured = null;
        replace(
          dispatch.rejection === null
            ? { kind: 'idle' }
            : { kind: 'rejected', message: dispatch.rejection },
        );
      }
    },
    cancel: () => {
      // Proof: dropping this guard changed an admitted pending request to idle when
      // `rejects a second target while its own request is pending` called cancel.
      // Proof: removing it also made native dragend cancel an admitted pending request
      // in `accepts only a local card drag` after its valid drop sent the command.
      if (pending) return;
      // Proof: retaining captured after cancel sent a request in the cancelled-gesture test.
      captured = null;
      replace({ kind: 'idle' });
    },
  };
}
