import type { TypedDependency } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';

/** A typed link with the project that owns it. */
export type StoredTypedDependency = TypedDependency & { projectId: string };

/** Persistence boundary for typed endpoint links. Duplicate adds must refuse. */
export interface TypedDependencyStore {
  listByProject(projectId: string): Promise<StoredTypedDependency[]>;
  add(row: StoredTypedDependency, stamp: WriteStamp): Promise<void>;
  update(row: StoredTypedDependency, stamp: WriteStamp): Promise<void>;
  remove(id: string, stamp: WriteStamp): Promise<void>;
}
