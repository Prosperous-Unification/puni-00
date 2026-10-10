import type { StoredTypedDependency } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';

export type { StoredTypedDependency } from '@wbs/domain';

/** Persistence boundary for typed endpoint links. Duplicate adds must refuse. */
export interface TypedDependencyStore {
  listByProject(projectId: string): Promise<StoredTypedDependency[]>;
  add(row: StoredTypedDependency, stamp: WriteStamp): Promise<void>;
  update(row: StoredTypedDependency, stamp: WriteStamp): Promise<void>;
  remove(id: string, stamp: WriteStamp): Promise<void>;
  /** Removes every incident link and returns the removed rows for journaling. */
  removeAllFor(workItemIds: readonly string[], stamp: WriteStamp): Promise<StoredTypedDependency[]>;
}
