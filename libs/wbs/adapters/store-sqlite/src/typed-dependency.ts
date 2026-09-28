import type { StoredTypedDependency, TypedDependencyStore, WriteStamp } from '@wbs/core';
import {
  type DependencyEndpoint,
  isDependencyEndpointScope,
  isRelationshipType,
} from '@wbs/domain';
import { eq, inArray, or } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { step, typedDependency, type TypedDependencyRow, workItem } from './schema';

/**
 * Refuses stored endpoint discriminants that this release cannot interpret.
 *
 * Proof: bypassing the scope check made `refuses unknown scopes and
 * scope/step mismatches on read` fail on the wrong message (`a other
 * predecessor without a step`); bypassing the whole/step check or the
 * missing-step check made it fail on `Received: (resolved without throwing)`; watched
 * 2026-09-27.
 */
function readEndpoint(
  rowId: string,
  end: 'predecessor' | 'successor',
  workItemId: string,
  scope: string,
  stepId: string | null,
): DependencyEndpoint {
  if (!isDependencyEndpointScope(scope)) {
    throw new Error(`typed dependency ${rowId} has unknown ${end} scope ${scope}`);
  }
  if (scope === 'whole') {
    if (stepId !== null)
      throw new Error(`typed dependency ${rowId} has a whole ${end} with a step`);
    return { scope, workItemId };
  }
  if (stepId === null)
    throw new Error(`typed dependency ${rowId} has a ${scope} ${end} without a step`);
  return { scope, workItemId, stepId };
}

/** Validates stored discriminants when SQLite rows cross into the domain. */
export function readTypedDependency(row: TypedDependencyRow): StoredTypedDependency {
  if (!isRelationshipType(row.type)) {
    throw new Error(`typed dependency ${row.id} has unknown relationship type ${row.type}`);
  }
  return {
    id: row.id,
    projectId: row.projectId,
    predecessor: readEndpoint(
      row.id,
      'predecessor',
      row.predecessorWorkItemId,
      row.predecessorScope,
      row.predecessorStepId,
    ),
    successor: readEndpoint(
      row.id,
      'successor',
      row.successorWorkItemId,
      row.successorScope,
      row.successorStepId,
    ),
    type: row.type,
  };
}

function mapStoredColumns(row: StoredTypedDependency) {
  return {
    projectId: row.projectId,
    predecessorWorkItemId: row.predecessor.workItemId,
    predecessorScope: row.predecessor.scope,
    predecessorStepId: row.predecessor.scope === 'whole' ? null : row.predecessor.stepId,
    successorWorkItemId: row.successor.workItemId,
    successorScope: row.successor.scope,
    successorStepId: row.successor.scope === 'whole' ? null : row.successor.stepId,
    type: row.type,
  };
}

type Transaction = Parameters<Parameters<Drizzle['transaction']>[0]>[0];

/**
 * Throws unless both endpoints name this project's rows in the shape their
 * scope requires: the work item and any step belong to `row.projectId`, a node
 * endpoint's work item has no children and a descendant-step endpoint's has
 * some.
 *
 * Once typed commands exist (task 4), the service must refuse these first
 * with typed 4xx. This is the persistence boundary inside the write's transaction,
 * where a concurrent tree edit cannot slip between the check and the insert.
 * Foreign keys alone prove only that the rows exist somewhere.
 *
 * Proof: the project comparison, the step-owner comparison and each of the two
 * leafhood comparisons disabled in turn made its own line of `refuses an
 * endpoint outside the project or in the wrong shape` fail on `Received:
 * (resolved without throwing)` (`foreign work item`, `foreign step`, `node on a
 * parent`, `descendant-step on a leaf`); watched 2026-09-27.
 */
export function assertEndpointsHeld(tx: Transaction, row: StoredTypedDependency): void {
  for (const endpoint of [row.predecessor, row.successor]) {
    const owner = tx
      .select({ projectId: workItem.projectId })
      .from(workItem)
      .where(eq(workItem.id, endpoint.workItemId))
      .get();
    if (owner?.projectId !== row.projectId) {
      throw new Error(
        `typed dependency ${row.id} names work item ${endpoint.workItemId} outside project ${row.projectId}`,
      );
    }
    if (endpoint.scope === 'whole') continue;
    const stepOwner = tx
      .select({ projectId: step.projectId })
      .from(step)
      .where(eq(step.id, endpoint.stepId))
      .get();
    if (stepOwner?.projectId !== row.projectId) {
      throw new Error(
        `typed dependency ${row.id} names step ${endpoint.stepId} outside project ${row.projectId}`,
      );
    }
    const child = tx
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.parentId, endpoint.workItemId))
      .limit(1)
      .get();
    if (endpoint.scope === 'node' && child !== undefined) {
      throw new Error(
        `typed dependency ${row.id} names a node of ${endpoint.workItemId}, a parent`,
      );
    }
    if (endpoint.scope === 'descendant-step' && child === undefined) {
      throw new Error(
        `typed dependency ${row.id} names descendants of ${endpoint.workItemId}, a leaf`,
      );
    }
  }
}

/** Typed links move both endpoint revisions in the same transaction as each write. */
export class TypedDependencyRepository implements TypedDependencyStore {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  async listByProject(projectId: string): Promise<StoredTypedDependency[]> {
    const rows = await this.db
      .select()
      .from(typedDependency)
      .where(eq(typedDependency.projectId, projectId));
    return rows.map(readTypedDependency);
  }

  async add(row: StoredTypedDependency, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        assertEndpointsHeld(tx, row);
        tx.insert(typedDependency)
          .values({ id: row.id, ...mapStoredColumns(row), ...auditOnCreate(stamp) })
          .run();
        bumpWorkItems(tx, [row.predecessor.workItemId, row.successor.workItemId], stamp);
      });
    });
  }

  async update(row: StoredTypedDependency, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        const prior = tx.select().from(typedDependency).where(eq(typedDependency.id, row.id)).get();
        // Proof: returning on a missing row made `refuses update of an unknown id`
        // fail on `Received: (resolved without throwing)`; watched 2026-09-27.
        if (prior === undefined) throw new Error(`typed dependency ${row.id} does not exist`);
        readTypedDependency(prior);
        // Proof: bypassing this comparison made `refuses moving a typed dependency`
        // fail because the endpoint guard reported `outside project` instead of
        // `cannot move`; watched 2026-09-27.
        if (prior.projectId !== row.projectId) {
          throw new Error(`typed dependency ${row.id} cannot move to project ${row.projectId}`);
        }
        assertEndpointsHeld(tx, row);
        tx.update(typedDependency)
          .set({ ...mapStoredColumns(row), ...auditOnUpdate(stamp) })
          .where(eq(typedDependency.id, row.id))
          .run();
        bumpWorkItems(
          tx,
          [
            prior.predecessorWorkItemId,
            prior.successorWorkItemId,
            row.predecessor.workItemId,
            row.successor.workItemId,
          ],
          stamp,
        );
      });
    });
  }

  async remove(id: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        const prior = tx.select().from(typedDependency).where(eq(typedDependency.id, id)).get();
        // Proof: returning on a missing row made `refuses removal of an unknown id`
        // fail on `Received: (resolved without throwing)`; watched 2026-09-27.
        if (prior === undefined) throw new Error(`typed dependency ${id} does not exist`);
        readTypedDependency(prior);
        tx.delete(typedDependency).where(eq(typedDependency.id, id)).run();
        bumpWorkItems(tx, [prior.predecessorWorkItemId, prior.successorWorkItemId], stamp);
      });
    });
  }

  /**
   * Both directions, because a work item being deleted is neither a predecessor
   * nor a successor any more. The foreign keys would refuse the delete otherwise,
   * which is the point: a link to a row that is gone is not a thing to keep.
   *
   * The **surviving** ends are bumped and the doomed ones are not. This is the
   * one place the links have to be read before they are written: which work
   * items lose a link is not knowable from the argument, and it is the *set of
   * rows* being read, never the counter — the counter is still `revision + 1`
   * in SQL, inside the same transaction as the delete. The caller is on its way
   * to deleting these rows, so bumping one would move a counter onto a row about
   * to stop existing.
   *
   * **The whole doomed set at once, in one transaction.** A per-row delete
   * would get the survivor rule wrong: a link between two doomed rows would
   * bump the far end, because a single-id call cannot tell a doomed sibling
   * from a survivor. Reading the set makes that answerable. The removed rows
   * pass through the same validating read as listByProject before being returned
   * for journaling.
   *
   * Proof: removing the bulk delete left all three links present in
   * `returns a doomed set of links and bumps only surviving endpoints`;
   * watched 2026-09-27.
   */
  async removeAllFor(
    workItemIds: readonly string[],
    stamp: WriteStamp,
  ): Promise<StoredTypedDependency[]> {
    return this.gate.enter(async () => {
      await Promise.resolve();
      if (workItemIds.length === 0) return [];
      const doomed = new Set(workItemIds);
      const touchesAny = or(
        inArray(typedDependency.predecessorWorkItemId, workItemIds),
        inArray(typedDependency.successorWorkItemId, workItemIds),
      );
      return this.db.transaction((tx) => {
        const losing = tx.select().from(typedDependency).where(touchesAny).all();
        const removed = losing.map(readTypedDependency);
        tx.delete(typedDependency).where(touchesAny).run();
        bumpWorkItems(
          tx,
          losing
            .flatMap(({ predecessorWorkItemId, successorWorkItemId }) => [
              predecessorWorkItemId,
              successorWorkItemId,
            ])
            .filter((id) => !doomed.has(id)),
          stamp,
        );
        return removed;
      });
    });
  }
}
