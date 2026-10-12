import { useCallback, useEffect, useMemo, useState } from 'react';

import type { RunPlanWrite } from '@/lib/local-write';
import type { AttemptOutcomeView, PlanRead, StepView } from '@/lib/wbs-api';
import type { PlanCommands } from '@/modules/plan-commands/contract';

import type { EndingAttempt } from './end-attempt-dialog';
import { didLand } from './live-editing';
import type { Toast } from './toasts';
import type { TreeRow } from './wbs-rows';

export interface AttemptActionsHost {
  commands: PlanCommands;
  run: RunPlanWrite;
  pushToast: (toast: Toast) => void;
  /** Every row of the current tree, which the End dialog reads its attempt off. */
  rows: readonly TreeRow[];
  steps: readonly StepView[];
  stepNodes: PlanRead['stepNodes'];
}

/**
 * A step node as a reader names it in a sentence: its canonical reference,
 * else `Dev for 010` — the folded card's own title for an uncoded node.
 */
export function attemptNodeLabel(
  row: TreeRow,
  stepId: string,
  steps: readonly StepView[],
  stepNodes: PlanRead['stepNodes'],
): string {
  const reference = stepNodes?.find(
    (each) => each.workItemId === row.id && each.stepId === stepId,
  )?.reference;
  if (reference !== undefined && reference !== null) return reference;
  const step = steps.find((each) => each.id === stepId);
  if (step === undefined) throw new Error(`Missing step ${stepId} for an attempt on ${row.id}`);
  return `${step.name} for ${row.number}`;
}

/**
 * The plan's three attempt gestures (`step-node-attempts` D7) and the End
 * dialog's state: each a batch of one through the plan writer, so a refusal is
 * worded in a toast like every other write and the plan's Undo takes it back.
 *
 * The End dialog keeps the number of the attempt opened at a node and checks
 * it against the current tree on every render. A peer ending that attempt or
 * deleting the row closes the dialog, even when a new attempt starts before
 * the next read reaches this client.
 */
export function useAttemptActions({
  commands,
  run,
  pushToast,
  rows,
  steps,
  stepNodes,
}: AttemptActionsHost) {
  const [endingFor, setEndingFor] = useState<{
    rowId: string;
    stepId: string;
    attemptNumber: number;
  } | null>(null);

  const ending = useMemo<EndingAttempt | null>(() => {
    if (endingFor === null) return null;
    const row = rows.find((each) => each.id === endingFor.rowId);
    if (row === undefined) return null;
    const last = row.attempts?.[endingFor.stepId]?.at(-1);
    // Proof: the running check dropped, `closes the End dialog once a peer
    // ends the attempt` failed on `expected { rowId: 'w1', …(3) } to be null`;
    // watched 2026-10-12.
    // Proof: without the number comparison, a peer's end followed by a new
    // start reopened the old dialog for attempt 2, both across two reads and
    // when both changes arrived in one read (`use-attempt-actions.test.ts`).
    if (last?.outcome !== null || last.attemptNumber !== endingFor.attemptNumber) return null;
    return {
      rowId: row.id,
      stepId: endingFor.stepId,
      attemptNumber: last.attemptNumber,
      label: attemptNodeLabel(row, endingFor.stepId, steps, stepNodes),
    };
  }, [endingFor, rows, steps, stepNodes]);

  useEffect(() => {
    if (endingFor !== null && ending === null) setEndingFor(null);
  }, [ending, endingFor]);

  const startAttempt = useCallback(
    (rowId: string, stepId: string) => {
      void run((write) => write.perform(['tree'], () => commands.startAttempt(rowId, stepId)));
    },
    [commands, run],
  );

  const removeAttempt = useCallback(
    (rowId: string, stepId: string, attemptNumber: number) => {
      const row = rows.find((each) => each.id === rowId);
      if (row === undefined) throw new Error(`Missing row ${rowId} for an attempt removal`);
      const label = attemptNodeLabel(row, stepId, steps, stepNodes);
      void run((write) =>
        write.perform(['tree'], () => commands.removeAttempt(rowId, stepId, attemptNumber)),
      ).then((outcome) => {
        // Said, because the line simply goes: a correction nobody is told
        // about reads as a plan that lost a row of history.
        if (didLand(outcome)) {
          pushToast({
            kind: 'info',
            text: `Removed attempt ${String(attemptNumber)} of ${label}. Undo puts it back.`,
          });
        }
      });
    },
    [commands, pushToast, rows, run, stepNodes, steps],
  );

  const openEndAttempt = useCallback(
    (rowId: string, stepId: string) => {
      const row = rows.find((each) => each.id === rowId);
      if (row === undefined) throw new Error(`Missing row ${rowId} for an attempt end`);
      const last = row.attempts?.[stepId]?.at(-1);
      if (last?.outcome !== null) return;
      setEndingFor({ rowId, stepId, attemptNumber: last.attemptNumber });
    },
    [rows],
  );

  const closeEndAttempt = useCallback(() => {
    setEndingFor(null);
  }, []);

  const endAttempt = useCallback(
    (target: EndingAttempt, outcome: AttemptOutcomeView, reference: string | undefined) => {
      setEndingFor(null);
      void run((write) =>
        write.perform(['tree'], () =>
          commands.endAttempt(target.rowId, target.stepId, outcome, reference),
        ),
      );
    },
    [commands, run],
  );

  return { ending, startAttempt, removeAttempt, openEndAttempt, closeEndAttempt, endAttempt };
}
