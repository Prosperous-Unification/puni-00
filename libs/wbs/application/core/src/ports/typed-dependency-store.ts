import type { ScopedTypedDependency } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';

/** A typed link owned by its successor project; the owner must equal successor.projectId. */
export type StoredTypedDependency = ScopedTypedDependency & { projectId: string };

/** Persistence boundary for typed endpoint links. Duplicate adds must refuse. */
export interface TypedDependencyStore {
  /** Relationships owned by this successor project, including local and external rows. */
  listByProject(projectId: string): Promise<StoredTypedDependency[]>;
  /** Each relationship touching any requested project once, ordered by relationship ID. */
  listIncident(projectIds: readonly string[]): Promise<StoredTypedDependency[]>;
  add(row: StoredTypedDependency, stamp: WriteStamp): Promise<void>;
  update(row: StoredTypedDependency, stamp: WriteStamp): Promise<void>;
  remove(id: string, stamp: WriteStamp): Promise<void>;
  /** Removes local incident links and external links with doomed successors for journaling.
   * Refuses before mutation if an external predecessor is doomed but its successor survives. */
  removeAllFor(workItemIds: readonly string[], stamp: WriteStamp): Promise<StoredTypedDependency[]>;
}
