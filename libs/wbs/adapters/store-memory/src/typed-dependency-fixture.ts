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
  const { rows } = table;
  // Proof: removing owner agreement or the required predecessor project separately failed `refuses successor-owner disagreement and owner changes` (2026-10-22).
  const assertOwner = (row: StoredTypedDependency): void => {
    if (
      row.projectId !== row.successor.projectId ||
      typeof row.predecessor.projectId !== 'string'
    ) {
      throw new Error(`typed dependency ${row.id} has inconsistent successor ownership`);
    }
  };
  return {
    rows,
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
    add: async (row) => {
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
      return removed;
    },
  };
}
