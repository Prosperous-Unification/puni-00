import type { ScopedTypedDependency } from '@wbs/domain';

/** A typed link owned by its successor project; the owner must equal successor.projectId. */
export type StoredTypedDependency = ScopedTypedDependency & { projectId: string };
