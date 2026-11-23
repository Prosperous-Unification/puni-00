import type { ProjectRollUp, WorkPackageRollUp } from '@wbs/domain';

import type { CommandCaller } from './command-access';
import type { RefusedOrganizationAccess } from './organization-access';
import type { ProjectShellView } from './project-read';
import type { WorkPackageWithAccess } from './work-package-store';

/** The virtual space containing the caller's projects, including those outside named spaces. */
export const ALL_PROJECTS = 'all';

/** A space's counts include only admitted projects and their readable children. */
export interface SpaceReadHeader {
  readonly id: string;
  readonly name: string;
  readonly virtual: boolean;
  readonly projectCount: number;
  readonly workPackageCount: number;
  readonly revision: number;
  readonly createdById: string | null;
  readonly createdAt: number | null;
}

/** Project identity stays a shell; position and readable children describe its row in this space. */
export interface SpaceProjectRow {
  readonly project: ProjectShellView;
  readonly position: number;
  readonly workPackages: readonly WorkPackageWithAccess[];
}

/** Detached grouped contents and current management permission from one committed observation. */
export interface SpaceView {
  readonly space: SpaceReadHeader;
  readonly writable: boolean;
  readonly projects: readonly SpaceProjectRow[];
  readonly personIds: readonly string[];
  readonly serviceTeamIds: readonly string[];
}

/**
 * Resolves complete retained caller evidence and project/package visibility on the same snapshot
 * as space membership. Project readers see empty projects; package-only readers see their actual
 * parent names with only readable children. Membership grants no authority. Named projects sort
 * by position/id; All projects sorts by name/id; children sort by name/id in binary order.
 * Pre-activation legacy access retains deployment-wide reads and named-space legacy ownership.
 * No snapshot, store capability or mutable shared DTO escapes.
 * @throws on malformed/unreadable trusted state or observation acquisition/settlement failure.
 */
export interface SpaceRead {
  read(
    caller: CommandCaller,
    spaceId: string,
  ): Promise<
    | { readonly ok: true; readonly value: SpaceView }
    | RefusedOrganizationAccess
    | { readonly ok: false; readonly refusal: 'organization_required' }
    | { readonly ok: false; readonly refusal: 'not_found' }
  >;
}

/** One actual project and all its readable child figures, detached from a single committed epoch. */
export interface SpaceProjectRollUp {
  readonly project: ProjectShellView;
  readonly position: number;
  readonly rollUp: ProjectRollUp;
  readonly workPackages: readonly {
    readonly workPackage: WorkPackageWithAccess;
    readonly rollUp: WorkPackageRollUp | { readonly kind: 'unavailable' };
  }[];
}

/**
 * Captures current caller, space/project membership, readable child inputs and installed cache
 * selection together. Unknown, foreign, nonmember or invisible project IDs refuse the whole read
 * as not_found. Local placement and presentation finish after the read loan closes. No write,
 * optimizer admission, source capability or lifetime escapes; missing scheduling configuration throws.
 */
export interface SpaceRollUpRead {
  rollUps(
    caller: CommandCaller,
    spaceId: string,
    projectIds: readonly string[],
  ): Promise<
    | { readonly ok: true; readonly value: readonly SpaceProjectRollUp[] }
    | RefusedOrganizationAccess
    | { readonly ok: false; readonly refusal: 'organization_required' }
    | { readonly ok: false; readonly refusal: 'not_found' }
  >;
}
