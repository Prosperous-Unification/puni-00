import type { TypedDependency } from './typed-dependency';

/** A finish-to-start edge as it is stored: either end may be a parent. */
export interface StoredDependency {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
}

/** A typed link with the project that owns it. */
export type StoredTypedDependency = TypedDependency & { projectId: string };
