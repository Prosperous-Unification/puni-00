import { Button } from '@ui/saas-01';
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

import type { WorkPackageRuntime } from '@/modules/work-package/contract';

import { refusalSentence } from '../wbs/plan-refusal';
import { statusWords } from '../wbs/status-cell';
import { type StepBoardCard, workPackageStepBoard } from './step-board';
import type { BoardColumn, StepBoardAction } from './step-board-action';

const columns = [
  { key: 'unknown', label: 'Unknown' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'done', label: 'Done' },
] as const;

interface LocalDrag {
  readonly cardId: string;
  readonly origin: HTMLDivElement;
}

interface FocusIntent {
  readonly cardId: string;
  readonly target: BoardColumn;
  readonly origin: HTMLElement;
}

/** The selected work package's delivered board and its step-progress move controls. */
export function StepBoardView({
  workPackage,
  action,
  onReturnToPlan,
}: {
  workPackage: Pick<WorkPackageRuntime, 'plan' | 'reread'>;
  action: StepBoardAction;
  onReturnToPlan: () => void;
}): React.JSX.Element {
  const delivered = useSyncExternalStore(workPackage.plan.subscribe, workPackage.plan.snapshot);
  const actionState = useSyncExternalStore(action.subscribe, action.snapshot);
  const localDrag = useRef<LocalDrag | null>(null);
  const focusIntent = useRef<FocusIntent | null>(null);
  const surfaces = useRef(new Map<string, HTMLDivElement>());
  const { tree, treeFailure, staleResources, connected } = delivered;
  // Proof: suppressing this condition failed `shows a first tree failure and retries through
  // the current runtime` (no alert); ignoring staleResources alone failed `shows a stale
  // warning when the feed marks tree stale without a failure cause` (no alert).
  const treeMayBeStale = treeFailure !== null || staleResources.includes('tree');
  // Proof: replacing this cause with the generic sentence failed `shows a first tree failure
  // and retries through the current runtime` (the engine refusal was missing).
  const failureText =
    treeFailure === null
      ? 'This plan may be out of date — the last refresh failed.'
      : refusalSentence(treeFailure.cause);

  // A separate steps delivery can be newer than this tree. Work package only the tree's own steps.
  // Proof: replacing tree.value.steps with delivered.steps failed `does not combine separately
  // delivered newer steps with an older tree` (QA vanished before the newer tree arrived).
  // Proof: bypassing the projector's malformed-progress throw defaulted it to Unknown and
  // failed `sends invalid delivered progress to the visible app error boundary` (no app alert).
  // Proof: dropping the last board on stale failure failed `keeps last delivered cards visibly
  // stale after a failed read and shows disconnection` (Build vanished).
  // Proof: adding pending Unknown cards to Done failed `keeps pending and delivered
  // placement distinct` before the held request delivered a covering tree.
  const board = tree === null ? null : workPackageStepBoard(tree.value);
  // Proof: suppressing this branch failed `distinguishes an empty workPackage from work with
  // no workPackage steps` (no "No work items" text).
  const isEmptyWorkPackage = tree !== null && tree.value.workItems.length === 0;
  // Proof: suppressing this branch failed `distinguishes an empty workPackage from work with
  // no workPackage steps` (no "No work package steps" text).
  const hasNoSteps = tree !== null && tree.value.steps.length === 0;

  // Proof: removing this action-change reset focused the replacement runtime's same-ID
  // card when an old request was pending in `does not restore an old action focus`.
  useLayoutEffect(() => {
    focusIntent.current = null;
    localDrag.current = null;
  }, [action]);

  useLayoutEffect(() => {
    const intent = focusIntent.current;
    if (intent === null) return;
    if (board?.columns[intent.target].some((card) => card.id === intent.cardId)) {
      const active = document.activeElement;
      if (active === intent.origin || (!intent.origin.isConnected && active === document.body)) {
        const destination = surfaces.current.get(intent.cardId);
        focusIntent.current = null;
        // Proof: suppressing this invariant left no app error alert after a delivered move
        // whose registered focus surface was removed; the focused control was lost silently.
        if (destination === undefined)
          throw new Error('Delivered step card focus surface is missing');
        destination.focus();
      } else {
        focusIntent.current = null;
      }
    } else if (actionState.kind === 'idle' || actionState.kind === 'rejected') {
      focusIntent.current = null;
    }
  }, [board, actionState.kind]);

  useEffect(() => {
    const cancelOutsideDrop = (): void => {
      if (localDrag.current === null) return;
      localDrag.current = null;
      action.cancel();
    };
    const forgetMovedFocus = (event: FocusEvent): void => {
      const intent = focusIntent.current;
      if (intent !== null && event.target !== intent.origin) focusIntent.current = null;
    };
    window.addEventListener('drop', cancelOutsideDrop);
    document.addEventListener('focusin', forgetMovedFocus);
    return () => {
      window.removeEventListener('drop', cancelOutsideDrop);
      document.removeEventListener('focusin', forgetMovedFocus);
    };
  }, [action]);

  const cancelDrag = (): void => {
    localDrag.current = null;
    action.cancel();
  };

  const rememberFocus = (card: StepBoardCard, target: BoardColumn, origin: HTMLElement): void => {
    focusIntent.current =
      document.activeElement === origin ? { cardId: card.id, target, origin } : null;
  };

  const retry = (): void => {
    // Proof: rereading steps instead failed `shows a first tree failure and retries through
    // the current runtime` (received steps, expected tree).
    // Proof: injecting a direct progress resend here made the mounted failed-covering-read
    // Retry case record two progress requests instead of its one original request.
    void workPackage.reread(['tree']);
  };

  return (
    <section aria-label="Step board">
      {actionState.kind === 'rejected' && <p role="status">{actionState.message}</p>}
      {actionState.kind === 'pending' && <p role="status">Updating step progress…</p>}
      {treeMayBeStale && (
        <p role="alert">
          {/* Proof: removing these words failed `keeps last delivered cards visibly stale after
          a failed read and shows disconnection` (retained Build lacked an explicit stale warning). */}
          {tree !== null && 'Showing the last delivered board; it may be out of date. '}
          {failureText}{' '}
          <Button variant="outline" size="sm" type="button" onClick={retry}>
            Retry
          </Button>
        </p>
      )}
      {/* Proof: suppressing this warning failed `keeps last delivered cards visibly stale
      after a failed read and shows disconnection` (no status). */}
      {!connected && (
        <p role="status">Reconnecting — edits by other people may not be shown yet.</p>
      )}
      {board === null ? (
        treeMayBeStale ? null : (
          <p>Loading board…</p>
        )
      ) : isEmptyWorkPackage ? (
        <p>No work items</p>
      ) : hasNoSteps ? (
        <p>No work package steps</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {columns.map(({ key, label }) => (
            <section
              key={key}
              aria-label={label}
              onDragOver={(event) => {
                if (localDrag.current !== null) event.preventDefault();
              }}
              onDrop={(event) => {
                const drag = localDrag.current;
                // Proof: accepting a drop without a local drag sent a progress request
                // in `accepts only a local card drag` from an external drop event.
                if (drag === null) return;
                event.preventDefault();
                localDrag.current = null;
                if (document.activeElement === drag.origin) {
                  focusIntent.current = { cardId: drag.cardId, target: key, origin: drag.origin };
                }
                void action.move(key);
              }}
            >
              <h2>
                {label} ({board.columns[key].length})
              </h2>
              <ul>
                {board.columns[key].map((card) => (
                  // Proof: removing anywhere wrapping made the Chromium `wraps unbroken card
                  // labels inside every column at desktop and 390px` regression report a 2970px
                  // scroll width in a 405px card.
                  <li key={card.id} className="[overflow-wrap:anywhere]">
                    <div
                      ref={(surface) => {
                        if (surface === null) surfaces.current.delete(card.id);
                        else surfaces.current.set(card.id, surface);
                      }}
                      role="button"
                      aria-label={`Drag ${card.workItemNumber} ${card.title} / ${card.stepName}`}
                      tabIndex={0}
                      draggable={actionState.kind !== 'pending' && !treeMayBeStale}
                      onDragStart={(event) => {
                        if (
                          localDrag.current !== null ||
                          actionState.kind === 'pending' ||
                          treeMayBeStale
                        ) {
                          event.preventDefault();
                          return;
                        }
                        localDrag.current = { cardId: card.id, origin: event.currentTarget };
                        action.capture(card, key);
                        event.dataTransfer.setData('text/plain', 'Step card');
                      }}
                      onDragEnd={cancelDrag}
                      onClick={(event) => {
                        const moveControl = event.currentTarget.nextElementSibling;
                        // Proof: replacing this throw with a return removed the click error
                        // event when both adjacent move controls were absent; focus stayed put.
                        if (!(moveControl instanceof HTMLButtonElement))
                          throw new Error('Step card move control is missing');
                        moveControl.focus();
                      }}
                      onKeyDown={(event) => {
                        // Proof: suppressing keyboard entry failed the duplicate-title
                        // control test: Enter left focus on the draggable card.
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          const moveControl = event.currentTarget.nextElementSibling;
                          // Proof: replacing this throw with a return removed the Enter error
                          // event when both adjacent move controls were absent; focus stayed put.
                          if (!(moveControl instanceof HTMLButtonElement))
                            throw new Error('Step card move control is missing');
                          moveControl.focus();
                          return;
                        }
                        if (event.key !== 'Escape' || localDrag.current?.cardId !== card.id) return;
                        event.preventDefault();
                        cancelDrag();
                      }}
                    >
                      <span>{card.workItemNumber}</span> <span>{card.title}</span>{' '}
                      <span>{card.stepName}</span> <span>{statusWords(card.workItemStatus)}</span>
                    </div>
                    {columns
                      .filter((column) => column.key !== key)
                      .map((target) => (
                        <Button
                          key={target.key}
                          variant="outline"
                          size="sm"
                          // Proof: removing the minimum target height failed the duplicate-title
                          // control test, which checks the accessible move surface size.
                          className="min-h-11"
                          type="button"
                          aria-label={
                            target.key === 'unknown'
                              ? `Clear progress for ${card.workItemNumber} ${card.title} / ${card.stepName} (move to Unknown)`
                              : `Move ${card.workItemNumber} ${card.title} / ${card.stepName} to ${target.label}`
                          }
                          // Proof: dropping the stale-tree disable made `disables Board move controls
                          // after a failed covering tree read` observe an enabled move button.
                          disabled={actionState.kind === 'pending' || treeMayBeStale}
                          onClick={(event) => {
                            rememberFocus(card, target.key, event.currentTarget);
                            action.capture(card, key);
                            void action.move(target.key);
                          }}
                        >
                          {target.key === 'unknown' ? 'Clear progress' : target.label}
                        </Button>
                      ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" type="button" onClick={onReturnToPlan}>
        Return to Plan
      </Button>
    </section>
  );
}
