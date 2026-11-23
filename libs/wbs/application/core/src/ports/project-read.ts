import type { RefusedOrganizationAccess } from './organization-access';
import type { ProjectCaller } from './project-administration';
import type { Project, WorkPackageEntry } from './project-store';

/** Full project metadata; count includes only currently readable actual children. */
export interface ProjectView extends Project {
  readonly workPackageCount: number;
}

/** A package-only reader receives no project facts beyond its actual identity/name. */
export interface ProjectShellView {
  readonly id: string;
  readonly name: string;
  readonly organizationId?: never;
  readonly spaceId?: never;
  readonly spacePosition?: never;
  readonly revision?: never;
  readonly createdAt?: never;
  readonly updatedAt?: never;
  readonly createdBy?: never;
  readonly workPackageCount?: never;
  readonly workPackages?: never;
}

/** LIST-only shell or full project metadata; create/rename replies remain full. */
export type ProjectListView = ProjectView | ProjectShellView;

/** A shell is visible in LIST but cannot disclose full project detail. */
export interface ProjectReadForbidden {
  readonly ok: false;
  readonly error: 'forbidden';
  readonly permission: 'project.read';
}

/** Entries and count share one committed authority/data snapshot and are detached from storage. */
export interface ProjectDetailView extends ProjectView {
  readonly workPackages: readonly WorkPackageEntry[];
}

/**
 * Reads engagement projects through complete retained authenticated evidence.
 * Project readers see full metadata; package-only readers see id/name shells in LIST
 * and receive project.read refusal for detail. No reaching read makes a project absent.
 * Child grants/P5/cap and project authority share the observation. No legacy success or body scope.
 * The first SQL read pins one committed snapshot; acquisition promises no arrival-time freshness.
 * @throws on unreadable/malformed trusted state or observation acquisition/settlement failure.
 */
export interface ProjectRead {
  list(
    caller: ProjectCaller,
  ): Promise<
    { readonly ok: true; readonly value: readonly ProjectListView[] } | RefusedOrganizationAccess
  >;
  read(
    caller: ProjectCaller,
    projectId: string,
  ): Promise<
    | { readonly ok: true; readonly value: ProjectDetailView | null }
    | RefusedOrganizationAccess
    | ProjectReadForbidden
  >;
}
