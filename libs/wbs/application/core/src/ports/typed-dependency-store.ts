import type { StoredTypedDependency } from './typed-dependency-values';
import type { WriteStamp } from './write-stamp';

export type { StoredTypedDependency } from './typed-dependency-values';

/** Exact physical creation evidence, including legitimate legacy null audit. */
export interface IncidentReceipt {
  readonly dependency: StoredTypedDependency;
  readonly createdAt: number | null;
  readonly createdBy: string | null;
}

/** Raw transaction persistence used only by the bound structural incident capability.
 * Detachment is physical staging, not a logical relationship deletion; restore
 * preserves creation evidence and bumps the old/new endpoint union once. */
export interface IncidentDependencyStore {
  capture(id: string): Promise<IncidentReceipt>;
  detach(receipt: IncidentReceipt): Promise<void>;
  restore(
    receipt: IncidentReceipt,
    previous: StoredTypedDependency,
    stamp: WriteStamp,
  ): Promise<void>;
}

/** Persistence boundary for typed endpoint links. Duplicate adds must refuse. */
export interface TypedDependencyStore {
  readonly incidents: IncidentDependencyStore;
  /** Reads both endpoint lifecycle markers within the current writer observation.
   * Missing or unreadable projects throw; deletion is an expected command conflict. */
  hasDeletingEndpoint(row: StoredTypedDependency): Promise<boolean>;
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
