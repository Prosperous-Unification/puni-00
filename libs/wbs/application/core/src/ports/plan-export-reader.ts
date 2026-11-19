import type { ResourceAccess } from './organization-access';
import type { LivePlanExportRead } from './shared-people-values';

/**
 * One complete detached export observation, including actual parent and document facts.
 * Current authority, ownership and all selected facts share the provider's source epoch.
 * No successful uncaptured sentinel, live reader or scheduler admission escapes.
 * Scoped shared/connected success requires current package.read for every retained
 * member in that observation; an unreadable member is opaque not_found.
 * @throws for missing, malformed or inconsistent trusted parent/capture state.
 */
export interface PlanExportReader {
  readExport(workPackageId: string, access: ResourceAccess): Promise<LivePlanExportRead>;
}
