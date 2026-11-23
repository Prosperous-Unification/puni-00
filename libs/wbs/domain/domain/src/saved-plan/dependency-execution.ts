import type { RecordedDependencyHistory, SavedInputEvidence } from './comparison-input';
import { compareHistoryKeys } from './history-json';

/**
 * Projects already validated recorded execution into a detached comparison value.
 * Original versions explicitly select uniform or leaf semantics; missing fields never select a mode.
 * Uniform orders are derived before identity translation so tied policy positions retain their
 * captured ID order. Captured evidence and original bytes never receive these derived fields.
 */
export function projectDependencyExecution(
  captured: Extract<SavedInputEvidence['dependencies'], { kind: 'recorded' }>,
): RecordedDependencyHistory {
  if (captured.history.kind === 'local') return captured.history;
  if (captured.execution === 'leaf')
    return {
      ...captured.history,
      workPackages: captured.history.workPackages.map((member) => ({
        ...member,
        leafSteps: [...member.leafSteps].sort((left, right) =>
          compareHistoryKeys(left.workItemId, right.workItemId),
        ),
      })),
    };
  return {
    ...captured.history,
    workPackages: captured.history.workPackages.map((member) => {
      const parents = new Set(member.workItems.map((row) => row.parentId));
      const stepIds = [...member.steps]
        .sort(
          (left, right) => left.position - right.position || compareHistoryKeys(left.id, right.id),
        )
        .map((step) => step.id);
      return {
        ...member,
        leafSteps: member.workItems
          .filter((row) => !parents.has(row.id))
          .map((row) => ({ workItemId: row.id, stepIds: [...stepIds] }))
          .sort((left, right) => compareHistoryKeys(left.workItemId, right.workItemId)),
      };
    }),
  };
}
