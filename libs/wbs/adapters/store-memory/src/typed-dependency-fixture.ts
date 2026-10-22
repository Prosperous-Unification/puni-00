import type { IncidentReceipt, StoredTypedDependency, TypedDependencyStore } from '@wbs/core';
import { formatTypedDependencyKey } from '@wbs/domain';

/** Typed link rows owned by one in-memory source transaction. */
export interface MemoryTypedDependencyTable {
  readonly rows: StoredTypedDependency[];
  readonly creation: Map<string, Pick<IncidentReceipt, 'createdAt' | 'createdBy'>>;
}

/** Creates a detached table so source snapshots can commit or roll back. */
export function memoryTypedDependencyTable(
  seed: readonly StoredTypedDependency[] = [],
): MemoryTypedDependencyTable {
  return {
    rows: structuredClone([...seed]),
    creation: new Map(seed.map(({ id }) => [id, { createdAt: null, createdBy: null }])),
  };
}

/**
 * A typed-link fixture with SQLite's identity and uniqueness refusals.
 * No project, work-item, step or organization context is available: this fixture
 * proves identity and ownership shape only, not SQLite endpoint integrity.
 *
 * Proof: omitting duplicate checks or unknown-ID refusals failed their
 * dedicated fixture tests; watched 2026-09-27.
 */
export function inMemoryTypedDependencies(
  seed: readonly StoredTypedDependency[] = [],
  table: MemoryTypedDependencyTable = memoryTypedDependencyTable(seed),
): TypedDependencyStore & { readonly rows: StoredTypedDependency[] } {
  const { rows, creation } = table;
  // Proof: removing owner agreement or the required predecessor project separately failed `refuses successor-owner disagreement and owner changes` (2026-10-22).
  const assertOwner = (row: StoredTypedDependency): void => {
    if (
      row.projectId !== row.successor.projectId ||
      typeof row.predecessor.projectId !== 'string'
    ) {
      throw new Error(`typed dependency ${row.id} has inconsistent successor ownership`);
    }
  };
  const capture = async (id: string): Promise<IncidentReceipt> => {
    await Promise.resolve();
    const dependency = rows.find((row) => row.id === id);
    const audit = creation.get(id);
    if (dependency === undefined || audit === undefined)
      throw new Error(`incident dependency ${id} does not exist`);
    return structuredClone({ dependency, ...audit });
  };
  return {
    rows,
    incidents: {
      capture,
      detach: async (receipt) => {
        const current = await capture(receipt.dependency.id);
        if (JSON.stringify(current) !== JSON.stringify(receipt))
          throw new Error('incident receipt changed');
        rows.splice(
          rows.findIndex((row) => row.id === receipt.dependency.id),
          1,
        );
        creation.delete(receipt.dependency.id);
      },
      restore: async (receipt, previous) => {
        await Promise.resolve();
        // Proof: removing duplicate refusal appended a second row with the same identity in incident restoration test, 2026-10-22.
        const row = receipt.dependency;
        assertOwner(row);
        if (row.id !== previous.id || row.projectId !== previous.projectId)
          throw new Error('incident restoration cannot change identity or owner');
        if (
          rows.some(
            (stored) =>
              stored.id === row.id ||
              formatTypedDependencyKey(stored) === formatTypedDependencyKey(row),
          )
        )
          throw new Error(`incident dependency ${row.id} already exists`);
        rows.push(structuredClone(row));
        creation.set(row.id, { createdAt: receipt.createdAt, createdBy: receipt.createdBy });
      },
    },
    listByProject: (projectId) =>
      Promise.resolve(rows.filter((row) => row.projectId === projectId)),
    listIncident: (projectIds) => {
      const projects = new Set(projectIds);
      return Promise.resolve(
        rows
          .filter(
            (row) =>
              projects.has(row.predecessor.projectId) || projects.has(row.successor.projectId),
          )
          .sort((left, right) => left.id.localeCompare(right.id)),
      );
    },
    add: async (row, stamp) => {
      await Promise.resolve();
      assertOwner(row);
      if (
        rows.some(
          (stored) =>
            stored.id === row.id ||
            formatTypedDependencyKey(stored) === formatTypedDependencyKey(row),
        )
      ) {
        throw new Error(`typed dependency ${row.id} already exists`);
      }
      rows.push(row);
      creation.set(row.id, { createdAt: stamp.at, createdBy: stamp.by });
    },
    update: async (row) => {
      await Promise.resolve();
      const index = rows.findIndex((stored) => stored.id === row.id);
      if (index < 0) throw new Error(`typed dependency ${row.id} does not exist`);
      if (
        rows.some(
          (stored) =>
            stored.id !== row.id &&
            formatTypedDependencyKey(stored) === formatTypedDependencyKey(row),
        )
      ) {
        throw new Error(`typed dependency ${row.id} already exists`);
      }
      assertOwner(row);
      // Proof: bypassing immutable ownership admitted the moved owner in `refuses successor-owner disagreement and owner changes` (2026-10-22).
      if (rows[index]?.projectId !== row.projectId)
        throw new Error(`typed dependency ${row.id} cannot move to project ${row.projectId}`);
      rows[index] = row;
    },
    remove: async (id) => {
      await Promise.resolve();
      const index = rows.findIndex((stored) => stored.id === id);
      if (index < 0) throw new Error(`typed dependency ${id} does not exist`);
      rows.splice(index, 1);
      creation.delete(id);
    },
    removeAllFor: async (workItemIds) => {
      await Promise.resolve();
      const doomed = new Set(workItemIds);
      const removed = rows.filter(
        (row) => doomed.has(row.predecessor.workItemId) || doomed.has(row.successor.workItemId),
      );
      // Proof: bypassing protection deleted the live successor prerequisite in `protects a surviving external successor before removing any doomed links` (2026-10-22).
      if (
        removed.some(
          (row) =>
            row.predecessor.projectId !== row.successor.projectId &&
            doomed.has(row.predecessor.workItemId) &&
            !doomed.has(row.successor.workItemId),
        )
      ) {
        throw new Error('external dependency predecessor has a surviving successor');
      }
      rows.splice(0, rows.length, ...rows.filter((row) => !removed.includes(row)));
      for (const row of removed) creation.delete(row.id);
      return removed;
    },
  };
}
