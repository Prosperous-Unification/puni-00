import type { ScopedTypedDependency } from '@wbs/domain';

/** A typed link owned by its successor work package; the owner must equal successor.workPackageId. */
export type StoredTypedDependency = ScopedTypedDependency & { workPackageId: string };
