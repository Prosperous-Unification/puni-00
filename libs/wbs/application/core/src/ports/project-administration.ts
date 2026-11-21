import type { GrantRefusal } from './access-grants';
import type { CommandCaller } from './command-access';
import type { RefusedOrganizationAccess, ResourceAccess } from './organization-access';
import type { ProjectView } from './project-read';
import type { ProjectFirstWorkPackage, ProjectPackageRefusal } from './project-store';
import type { WorkPackageMoved, WorkPackageMoveRefusal } from './project-store';
import type { ProjectAct, ProjectCreationAct, ProjectDraft, ProjectStore } from './project-store';
import type { Step } from './step-store';
import type { WorkPackage } from './work-package-store';

/** Complete authenticated evidence; expected scope pins context and grants no authority. */
export type ProjectCaller = Extract<CommandCaller, { kind: 'human' }> & {
  readonly expectedAccess: Extract<ResourceAccess, { kind: 'scoped' }>;
};

export type ProjectCreation = Omit<ProjectDraft, 'organizationId'>;
export type ProjectBirth = Omit<ProjectCreationAct, 'actor'>;
export type ProjectChange = Omit<ProjectAct, 'actor'>;

export type ProjectWriteRefusal =
  | RefusedOrganizationAccess
  | { readonly ok: false; readonly error: 'insufficient_scope' }
  | {
      readonly ok: false;
      readonly error: 'forbidden';
      readonly permission: 'organization.create_project';
    };

/** Move admission adds only the current package.write decision to existing caller/project refusals. */
export type ProjectMoveRefusal =
  | ProjectWriteRefusal
  | { readonly ok: false; readonly error: 'forbidden'; readonly permission: 'package.write' };

/** Internal cross-organization storage refusal cannot cross the scoped admitted boundary. */
export type ProjectMove =
  WorkPackageMoved | Exclude<WorkPackageMoveRefusal, 'cross_organization'> | ProjectMoveRefusal;

/** Closed empty/combined success; public count covers actual children readable inside the same owner. */
export type ProjectCreatedView =
  | { readonly kind: 'created'; readonly project: ProjectView }
  | {
      readonly kind: 'created_with_work_package';
      readonly project: ProjectView;
      readonly workPackage: WorkPackage;
      readonly steps: readonly Step[];
    };

/** Public rename metadata counts only actual children readable in the same write owner. */
export interface ProjectRenamedView {
  readonly kind: 'renamed';
  readonly project: ProjectView;
}

/**
 * Current authenticated project writes, distinct from offline {@link ProjectStore}.
 * Retains caller/payload/IDs/instant before queueing, then resolves current context
 * and actual grants inside the same owner as project, creator grant and audits.
 * Organization and audit actor come from resolved access, never the payload.
 * Public success counts and not_empty child IDs use current readable actual children
 * inside that same owner. All actual children still prevent deletion, even when
 * the public refusal lists no IDs. Offline ProjectStore keeps complete child facts.
 * Interim E41 writes require organization.create_project; permissions3.4 performs
 * the later project.manage_settings cutover with its hierarchy and read policy.
 * @throws on malformed input, unreadable trusted state or storage/rollback failure.
 */
export interface ProjectAdministration {
  create(
    caller: ProjectCaller,
    draft: ProjectCreation,
    act: ProjectBirth,
    first?: ProjectFirstWorkPackage,
  ): Promise<
    ProjectCreatedView | ProjectPackageRefusal | 'name_taken' | GrantRefusal | ProjectWriteRefusal
  >;
  rename(
    caller: ProjectCaller,
    projectId: string,
    name: string,
    act: ProjectChange,
  ): Promise<ProjectRenamedView | 'name_taken' | 'not_found' | ProjectWriteRefusal>;
  /**
   * Retains the caller, both IDs and act before one current-authority writer.
   * Readable scoped W precedes scoped target, then organization.create_project
   * and package.write precede borrowed content checks. Same-parent is an admitted
   * state-preserving success; unknown trusted state/write/rollback failures throw.
   */
  moveWorkPackage(
    caller: ProjectCaller,
    workPackageId: string,
    targetProjectId: string,
    act: ProjectChange,
  ): Promise<ProjectMove>;
  delete(
    caller: ProjectCaller,
    projectId: string,
    act: ProjectChange,
  ): Promise<Awaited<ReturnType<ProjectStore['delete']>> | ProjectWriteRefusal>;
}
