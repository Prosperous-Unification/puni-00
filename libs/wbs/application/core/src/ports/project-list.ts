import type { ResourceAccess } from './organization-access';
import type { ProjectWithAccess } from './project-values';

/** The caller's project list, independent of the resource that supplies it. */
export interface ProjectList {
  /** The caller's projects in their own order, limited to their resolved access. */
  listWithin(actorId: string, access: ResourceAccess): Promise<ProjectWithAccess[]>;
}
