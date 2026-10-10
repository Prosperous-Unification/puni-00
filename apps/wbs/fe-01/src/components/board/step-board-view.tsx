import { useSyncExternalStore } from 'react';

import type { ProjectRuntime } from '@/modules/project/contract';

import { refusalSentence } from '../wbs/plan-refusal';
import { statusWords } from '../wbs/status-cell';
import { projectStepBoard } from './step-board';

const columns = [
  { key: 'unknown', label: 'Unknown' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'done', label: 'Done' },
] as const;

/** The selected project's read-only board, drawn from one delivered tree. */
export function StepBoardView({
  project,
  onReturnToPlan,
}: {
  project: Pick<ProjectRuntime, 'plan' | 'reread'>;
  onReturnToPlan: () => void;
}): React.JSX.Element {
  const delivered = useSyncExternalStore(project.plan.subscribe, project.plan.snapshot);
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

  // A separate steps delivery can be newer than this tree. Project only the tree's own steps.
  // Proof: replacing tree.value.steps with delivered.steps failed `does not combine separately
  // delivered newer steps with an older tree` (QA vanished before the newer tree arrived).
  // Proof: bypassing the projector's malformed-progress throw defaulted it to Unknown and
  // failed `sends invalid delivered progress to the visible app error boundary` (no app alert).
  // Proof: dropping the last board on stale failure failed `keeps last delivered cards visibly
  // stale after a failed read and shows disconnection` (Build vanished).
  const board = tree === null ? null : projectStepBoard(tree.value);
  // Proof: suppressing this branch failed `distinguishes an empty project from work with
  // no project steps` (no "No work items" text).
  const isEmptyProject = tree !== null && tree.value.workItems.length === 0;
  // Proof: suppressing this branch failed `distinguishes an empty project from work with
  // no project steps` (no "No project steps" text).
  const hasNoSteps = tree !== null && tree.value.steps.length === 0;

  const retry = (): void => {
    // Proof: rereading steps instead failed `shows a first tree failure and retries through
    // the current runtime` (received steps, expected tree).
    void project.reread(['tree']);
  };

  return (
    <section aria-label="Step board">
      {treeMayBeStale && (
        <p role="alert">
          {/* Proof: removing these words failed `keeps last delivered cards visibly stale after
          a failed read and shows disconnection` (retained Build lacked an explicit stale warning). */}
          {tree !== null && 'Showing the last delivered board; it may be out of date. '}
          {failureText}{' '}
          <button type="button" onClick={retry}>
            Retry
          </button>
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
      ) : isEmptyProject ? (
        <p>No work items</p>
      ) : hasNoSteps ? (
        <p>No project steps</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {columns.map(({ key, label }) => (
            <section key={key} aria-label={label}>
              <h2>
                {label} ({board.columns[key].length})
              </h2>
              <ul>
                {board.columns[key].map((card) => (
                  // Proof: removing anywhere wrapping made the Chromium `wraps unbroken card
                  // labels inside every column at desktop and 390px` regression report a 2970px
                  // scroll width in a 405px card.
                  <li key={card.id} className="[overflow-wrap:anywhere]">
                    <span>{card.workItemNumber}</span> <span>{card.title}</span>{' '}
                    <span>{card.stepName}</span> <span>{statusWords(card.workItemStatus)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <button type="button" onClick={onReturnToPlan}>
        Return to Plan
      </button>
    </section>
  );
}
