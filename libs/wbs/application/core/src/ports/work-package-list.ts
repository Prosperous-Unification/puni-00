import type { ResourceAccess } from './organization-access';
import type { WorkPackageWithAccess } from './work-package-values';

/**
 * The caller's work package list, independent of the resource that supplies it.
 *
 * Proof: restoring the concrete resource import directly or through a port
 * re-export made the committed K6 boundary oracle fail with
 * `concrete workPackage resource edge remains`; watched 2026-10-16. Commands and
 * candidate patches: `openspec/changes/work-package-rank-port-boundary/verify.md`.
 */
export interface WorkPackageList {
  /** The caller's work packages in their own order, limited to their resolved access. */
  listWithin(actorId: string, access: ResourceAccess): Promise<WorkPackageWithAccess[]>;
}
