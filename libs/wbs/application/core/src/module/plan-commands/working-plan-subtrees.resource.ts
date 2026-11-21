import type { SubtreeStore } from '../../ports/subtree-store';
import type { WorkItemStore } from '../../ports/work-item-store';
import { retainFirstChildWrite } from '../step-catalogue/first-child';
import { retainMoveWrite } from '../step-catalogue/move';
import { retainSubtreeWrite } from '../step-catalogue/subtree-write';

interface RetainedSubtreeReads {
  byIds(ids: readonly string[]): ReturnType<WorkItemStore['listByIds']>;
}

/**
 * Builds the atomic subtree-write part of a batch-owned working plan.
 *
 * Reparented rows are read before persistence so both their old and new
 * parents refresh. After the source succeeds, every copied row is authorized
 * as a new retained identity and every structural, satellite-removal and edge
 * endpoint identity is refreshed before the write resolves.
 */
export function createWorkingPlanSubtrees(
  source: () => SubtreeStore,
  reads: RetainedSubtreeReads,
  assertOpen: () => void,
  refreshRows: (ids: readonly string[], insertedIds?: readonly string[]) => Promise<void>,
): SubtreeStore {
  return {
    inspectFirstChild: async (write, stamp) => {
      assertOpen();
      const kept = retainFirstChildWrite(write, stamp);
      const decision = await source().inspectFirstChild(kept.write, kept.stamp);
      assertOpen();
      return decision;
    },
    writeMove: async (write, stamp) => {
      assertOpen();
      const kept = retainMoveWrite(write, stamp);
      const written = await source().writeMove(kept.write, kept.stamp);
      assertOpen();
      if (written.kind !== 'written') return written;
      const { record } = written;
      await refreshRows([
        record.workItemId,
        ...(record.fromParentId === null ? [] : [record.fromParentId]),
        ...(record.parentId === null ? [] : [record.parentId]),
        ...kept.write.respaced.map(({ id }) => id),
      ]);
      assertOpen();
      return written;
    },
    writeFirstChild: async (write, stamp) => {
      assertOpen();
      const kept = retainFirstChildWrite(write, stamp);
      const written = await source().writeFirstChild(kept.write, kept.stamp);
      assertOpen();
      if (written.kind !== 'written') return written;
      const child = written.record.child;
      const direction = kept.write.kind === 'fresh' ? 'down' : kept.write.direction;
      await refreshRows(
        [
          child.parentId,
          child.id,
          ...kept.write.respaced.map(({ id }) => id),
          ...kept.write.localDependencies.flatMap(({ predecessor, successor }) => [
            predecessor.workItemId,
            successor.workItemId,
          ]),
        ],
        direction === 'down' ? [child.id] : [],
      );
      assertOpen();
      return written;
    },
    insertSubtree: async (copy, stamp) => {
      assertOpen();
      const kept = retainSubtreeWrite(copy, stamp);
      copy = kept.copy;
      stamp = kept.stamp;
      const reparentedBefore =
        copy.reparented.length === 0 ? [] : await reads.byIds(copy.reparented.map(({ id }) => id));
      assertOpen();
      const written = await source().insertSubtree(copy, stamp);
      assertOpen();
      if (written !== 'written') return written;
      const insertedIds = copy.rows.map(({ id }) => id);
      await refreshRows(
        [
          ...insertedIds,
          ...copy.rows.flatMap(({ parentId }) => (parentId === null ? [] : [parentId])),
          ...copy.respaced.map(({ id }) => id),
          ...copy.reparented.flatMap(({ id, parentId }) =>
            parentId === null ? [id] : [id, parentId],
          ),
          ...reparentedBefore.flatMap(({ parentId }) => (parentId === null ? [] : [parentId])),
          ...copy.removedEstimates.map(({ workItemId }) => workItemId),
          ...copy.removedActuals.map(({ workItemId }) => workItemId),
          ...copy.removedProgress.map(({ workItemId }) => workItemId),
          ...copy.removedMeasures.map(({ workItemId }) => workItemId),
          ...copy.dependencies.flatMap(({ predecessorId, successorId }) => [
            predecessorId,
            successorId,
          ]),
        ],
        insertedIds,
      );
      return written;
    },
  };
}
