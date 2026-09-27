import type { StoredTypedDependency, TypedDependencyStore, WriteStamp } from '@wbs/core';
import {
  type DependencyEndpoint,
  isDependencyEndpointScope,
  isRelationshipType,
} from '@wbs/domain';
import { eq } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { typedDependency, type TypedDependencyRow } from './schema';

/**
 * Refuses stored endpoint discriminants that this release cannot interpret.
 *
 * Proof: bypassing the scope check made the corrupt-row case report the wrong
 * error (`other predecessor without a step`); bypassing the whole/step check
 * or the missing-step check made it resolve instead of throw. Each watched in
 * `typed-dependency.db.test.ts` on 2026-09-27.
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
function readTypedDependency(row: TypedDependencyRow): StoredTypedDependency {
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

function storedColumns(row: StoredTypedDependency) {
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
        tx.insert(typedDependency)
          .values({ id: row.id, ...storedColumns(row), ...auditOnCreate(stamp) })
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
        if (prior === undefined) throw new Error(`typed dependency ${row.id} does not exist`);
        readTypedDependency(prior);
        tx.update(typedDependency)
          .set({ ...storedColumns(row), ...auditOnUpdate(stamp) })
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
        if (prior === undefined) throw new Error(`typed dependency ${id} does not exist`);
        readTypedDependency(prior);
        tx.delete(typedDependency).where(eq(typedDependency.id, id)).run();
        bumpWorkItems(tx, [prior.predecessorWorkItemId, prior.successorWorkItemId], stamp);
      });
    });
  }
}
