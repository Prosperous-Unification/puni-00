import type { FrozenNumber, Repositioned, WorkItem, WorkItemStore } from '../repository';
import { WorkItemService } from '../service/work-item.service';
import { inMemoryProjects } from './project-fixture';

/**
 * A WorkItemStore backed by a Map.
 *
 * `insert`, `move` and `remove` each apply their whole argument list before
 * returning, matching the single transaction the SQLite repository runs. A
 * fixture that applied only the primary write would let a test pass while the
 * respacing that keeps siblings distinct was silently dropped.
 */
export function inMemoryWorkItems(): WorkItemStore {
  const byId = new Map<string, WorkItem>();

  function reposition(updates: readonly Repositioned[]): void {
    for (const update of updates) {
      const existing = byId.get(update.id);
      if (existing === undefined) throw new Error(`cannot reposition unknown ${update.id}`);
      byId.set(update.id, { ...existing, position: update.position });
    }
  }

  return {
    listByProject(projectId) {
      return Promise.resolve([...byId.values()].filter((w) => w.projectId === projectId));
    },
    findById(id) {
      return Promise.resolve(byId.get(id) ?? null);
    },
    insert(workItem, respaced) {
      reposition(respaced);
      byId.set(workItem.id, workItem);
      return Promise.resolve();
    },
    patch(id, patch) {
      const existing = byId.get(id);
      if (existing === undefined) return Promise.resolve(null);
      const updated: WorkItem = {
        ...existing,
        name: patch.name ?? existing.name,
        notes: patch.notes ?? existing.notes,
      };
      byId.set(id, updated);
      return Promise.resolve(updated);
    },
    move(id, parentId, position, respaced) {
      const existing = byId.get(id);
      if (existing === undefined) throw new Error(`cannot move unknown ${id}`);
      reposition(respaced);
      byId.set(id, { ...existing, parentId, position });
      return Promise.resolve();
    },
    setFrozenNumbers(updates: readonly FrozenNumber[]) {
      for (const update of updates) {
        const existing = byId.get(update.id);
        if (existing === undefined) throw new Error(`cannot freeze unknown ${update.id}`);
        byId.set(update.id, { ...existing, frozenNumber: update.frozenNumber });
      }
      return Promise.resolve();
    },
    remove(ids, promoted) {
      // Promotions land before the deletion, and deletion runs deepest-first,
      // because that is the order the foreign keys force on the real
      // repository. A fixture free to do it in any order would let a test pass
      // against a sequence SQLite rejects.
      for (const child of promoted) {
        const existing = byId.get(child.id);
        if (existing === undefined) throw new Error(`cannot promote unknown ${child.id}`);
        byId.set(child.id, { ...existing, parentId: child.parentId, position: child.position });
      }
      for (const id of [...ids].reverse()) byId.delete(id);
      return Promise.resolve();
    },
  };
}

/** A WorkItemService over in-memory stores, for tests that only need `buildApp` to construct. */
export function testWorkItemService(): WorkItemService {
  return new WorkItemService({ workItems: inMemoryWorkItems(), projects: inMemoryProjects() });
}
