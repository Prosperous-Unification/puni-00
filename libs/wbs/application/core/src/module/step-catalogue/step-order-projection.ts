import { indexCapturedLeafSteps, type LeafStepOrder, type StepTypeState } from '@wbs/domain';

import type { WorkItemStepProjection } from '../../ports/work-item-store';

/** Actual ownership/type evidence retained by one adapter observation, never caller-authored Source authority. */
export interface StepOrderObservation {
  readonly workPackageId: string;
  readonly owners: ReadonlyMap<string, string>;
  readonly types: ReadonlyMap<string, StepTypeState>;
  readonly steps: readonly { readonly id: string }[];
  readProposedTypes(workItemId: string, typeIds: readonly string[]): StepTypeState;
  resolve(type: StepTypeState): readonly { readonly stepId: string }[];
}

/** Validates complete proposed identity/type evidence before resolving future leaves; never substitutes current display metadata. */
export function projectStepOrders(
  observation: StepOrderObservation,
  projection: WorkItemStepProjection,
): LeafStepOrder[] {
  const ids = new Set<string>();
  for (const row of projection.rows) {
    // Proof: omission changed repeated-row's diagnostic at the later complete-index check; that check remained active.
    if (ids.has(row.id)) throw new Error('duplicate step projection row');
    ids.add(row.id);
    // Proof: omission accepted foreign-owner in the actual SQLite step projection test (2026-11-20).
    if (row.workPackageId !== observation.workPackageId)
      throw new Error('step projection row has another work package');
    const owner = observation.owners.get(row.id);
    // Proof: omission accepted foreign-stored-id, relabelling an actual foreign row as a fresh candidate.
    if (owner !== undefined && owner !== observation.workPackageId)
      throw new Error('step projection reuses a foreign row');
  }
  const replacements = new Map<string, StepTypeState>();
  for (const selection of projection.directTypes) {
    // Proof: omission silently ignored extra-type-entry in the actual SQLite projection test.
    if (!ids.has(selection.workItemId)) throw new Error('step projection type owner is absent');
    // Proof: omission accepted the last duplicate replacement in repeated-type-entry.
    if (replacements.has(selection.workItemId))
      throw new Error('duplicate step projection type owner');
    replacements.set(
      selection.workItemId,
      // Proof: replacing this dependency with untyped accepted foreign-type and repeated-type independently.
      observation.readProposedTypes(selection.workItemId, selection.typeIds),
    );
  }
  const parents = new Set(projection.rows.map((row) => row.parentId));
  const orders: LeafStepOrder[] = [];
  for (const row of projection.rows) {
    const type = replacements.has(row.id)
      ? replacements.get(row.id)
      : observation.types.get(row.id);
    // Proof: substituting empty own orders accepted absent-type in the actual SQLite projection test.
    if (type === undefined) throw new Error('fresh step projection lacks direct types');
    const resolved = observation.resolve(type);
    if (!parents.has(row.id))
      orders.push({ workItemId: row.id, stepIds: resolved.map((step) => step.stepId) });
  }
  // Proof: breaking this dependency accepted orphan and parent-cycle projections in the actual SQLite tests.
  indexCapturedLeafSteps(projection.rows, observation.steps, orders);
  return orders;
}
