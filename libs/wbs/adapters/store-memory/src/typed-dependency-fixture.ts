import type { StoredTypedDependency, TypedDependencyStore } from '@wbs/core';
import { formatTypedDependencyKey } from '@wbs/domain';

/** Typed link rows owned by one in-memory source transaction. */
export interface MemoryTypedDependencyTable {
  readonly rows: StoredTypedDependency[];
}

/** Creates a detached table so source snapshots can commit or roll back. */
export function memoryTypedDependencyTable(
  seed: readonly StoredTypedDependency[] = [],
): MemoryTypedDependencyTable {
  return { rows: structuredClone([...seed]) };
}

/**
 * A typed-link fixture with SQLite's identity and uniqueness refusals.
 * Unknown update/remove IDs throw; bulk removal returns every incident row.
 *
 * Proof: omitting duplicate checks or unknown-ID refusals failed their
 * dedicated fixture tests; watched 2026-09-27.
 */
export function inMemoryTypedDependencies(
  seed: readonly StoredTypedDependency[] = [],
  table: MemoryTypedDependencyTable = memoryTypedDependencyTable(seed),
): TypedDependencyStore & { readonly rows: StoredTypedDependency[] } {
  const { rows } = table;
  return {
    rows,
    listByProject: (projectId) =>
      Promise.resolve(rows.filter((row) => row.projectId === projectId)),
    add: async (row) => {
      await Promise.resolve();
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
      rows[index] = row;
    },
    remove: async (id) => {
      await Promise.resolve();
      const index = rows.findIndex((stored) => stored.id === id);
      if (index < 0) throw new Error(`typed dependency ${id} does not exist`);
      rows.splice(index, 1);
    },
    removeAllFor: async (workItemIds) => {
      await Promise.resolve();
      const doomed = new Set(workItemIds);
      const removed = rows.filter(
        (row) => doomed.has(row.predecessor.workItemId) || doomed.has(row.successor.workItemId),
      );
      rows.splice(0, rows.length, ...rows.filter((row) => !removed.includes(row)));
      return removed;
    },
  };
}
