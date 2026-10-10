import { formatStepNodeId } from '@wbs/domain/step-node';

import type { PlanRead, WorkItemView } from '@/lib/wbs-api';

/** A leaf-step identity with labels from the same delivered tree. */
export interface StepBoardCard {
  id: string;
  workItemId: string;
  stepId: string;
  workItemNumber: string;
  title: string;
  stepName: string;
  workItemStatus: WorkItemView['status'];
}

/** Column arrays retain the source traversal order, with its revision markers. */
export interface StepBoard {
  seq: PlanRead['seq'];
  projectRevision: PlanRead['projectRevision'];
  columns: {
    unknown: StepBoardCard[];
    inProgress: StepBoardCard[];
    done: StepBoardCard[];
  };
}

/**
 * Projects every leaf × step from one delivered tree, without reading slices.
 * Preserves work-item order and each delivered steps array's backend order.
 * Only absent progress means Unknown; server-derived work-item status is a label.
 * @throws When trusted progress is malformed, names an absent step, or repeats a card ID.
 */
export function projectStepBoard(plan: PlanRead): StepBoard {
  const board: StepBoard = {
    seq: plan.seq,
    projectRevision: plan.projectRevision,
    columns: { unknown: [], inProgress: [], done: [] },
  };
  const parentIds = new Set(plan.workItems.map((row) => row.parentId));
  const stepIds = new Set(plan.steps.map((step) => step.id));
  const cardIds = new Set<string>();

  // Proof: reversing workItems failed `preserves delivered leaf and step order independently of IDs and numbers`.
  for (const row of plan.workItems) {
    for (const [stepId, storedProgress] of Object.entries(row.progress)) {
      // A delivered-store fault can violate the declared domain union at runtime.
      const progress: unknown = storedProgress;
      // Proof: bypassing step membership failed `rejects progress naming a step absent from this delivered tree` (no throw).
      if (!stepIds.has(stepId)) {
        throw new Error(`Step board progress names absent step ${stepId} on ${row.id}`);
      }
      // Proof: bypassing the union check failed `rejects malformed progress instead of treating it as Unknown` (no throw).
      if (progress !== 'in_progress' && progress !== 'done') {
        throw new Error(`Step board progress is malformed for ${row.id}.${stepId}`);
      }
    }
    // Proof: bypassing parent exclusion failed `keeps held and unestimated leaves with no slices, excludes parents, and counts step progress`
    // with extra sn1.parent.qa and sn1.parent.dev cards.
    if (parentIds.has(row.id)) continue;
    // Proof: reversing steps failed `preserves delivered leaf and step order independently of IDs and numbers`.
    for (const step of plan.steps) {
      const id = formatStepNodeId({ workItemId: row.id, stepId: step.id });
      // Proof: bypassing identity membership separately failed `rejects duplicate card identities from repeated leaf IDs`
      // and `rejects duplicate card identities from repeated step IDs` (both no throw).
      if (cardIds.has(id)) {
        throw new Error(`Step board repeats card identity ${id}`);
      }
      cardIds.add(id);
      const card: StepBoardCard = {
        id,
        workItemId: row.id,
        stepId: step.id,
        workItemNumber: row.number,
        title: row.name,
        stepName: step.name,
        workItemStatus: row.status,
      };
      const progress = Object.hasOwn(row.progress, step.id) ? row.progress[step.id] : undefined;
      const column =
        progress === 'done' ? 'done' : progress === 'in_progress' ? 'inProgress' : 'unknown';
      board.columns[column].push(card);
    }
  }
  return board;
}
