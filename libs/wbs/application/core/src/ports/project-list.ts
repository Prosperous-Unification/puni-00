import type { ResourceAccess } from './organization-access';
import type { ProjectWithAccess } from './project-values';

/**
 * The caller's project list, independent of the resource that supplies it.
 *
 * Proof: restoring the concrete resource import directly or through a port
 * re-export made the committed K6 boundary oracle fail with
 * `concrete project resource edge remains`; watched 2026-10-16. Commands and
 * candidate patches: `openspec/changes/project-rank-port-boundary/verify.md`.
 */
export interface ProjectList {
  /** The caller's projects in their own order, limited to their resolved access. */
  listWithin(actorId: string, access: ResourceAccess): Promise<ProjectWithAccess[]>;
}
