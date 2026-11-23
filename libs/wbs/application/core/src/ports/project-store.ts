import { type AccessActor, type GrantRefusal, retainAccessAct } from './access-grants';
import type { Step } from './step-store';
import type { NewWorkPackage, WorkPackage, WorkPackageCreatorGrant } from './work-package-store';
import { retainWorkPackageCreation } from './work-package-store';

/** An engagement project; migrated rows may have no recorded creator. */
export interface Project {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number | null;
  readonly createdBy: string | null;
  /** The actual organizational unit, or explicitly none. */
  readonly spaceId: string | null;
  readonly spacePosition: number | null;
}

/** A current package's identity/name projection, without assuming its full plan model. */
export interface WorkPackageEntry {
  readonly id: string;
  readonly name: string;
}

/** Counts actual children; never a stored counter or an unavailable-count placeholder. */
export interface ProjectSummary extends Project {
  readonly workPackageCount: number;
}

/** Entries and count describe the same scoped read snapshot. */
export interface ProjectDetail extends ProjectSummary {
  readonly workPackages: readonly WorkPackageEntry[];
}

/** A retained real-user administration act; cascade event IDs belong to its write owner. */
export interface ProjectAct {
  readonly actor: Extract<AccessActor, { kind: 'user' }>;
  readonly at: number;
  readonly auditId: string;
}

export interface ProjectRenamed {
  readonly kind: 'renamed';
  readonly project: ProjectSummary;
}
export type ProjectDeleted =
  | { readonly kind: 'deleted' }
  | { readonly kind: 'not_empty'; readonly workPackageIds: readonly string[] };

/** A move reports the actual package and both parents from its single committed owner. */
export interface WorkPackageMoved {
  readonly kind: 'moved' | 'unchanged';
  readonly workPackageId: string;
  readonly projectId: string;
  readonly revision: number;
  readonly sourceProject: { readonly id: string; readonly revision: number };
  readonly targetProject: { readonly id: string; readonly revision: number };
}
/** Offline structural refusals; current request admission belongs to the admitted writer. */
export type WorkPackageMoveRefusal =
  | 'not_found'
  | 'cross_organization'
  | { readonly kind: 'dependency_crosses_project'; readonly dependencyIds: readonly string[] };

/** Identity and organization are explicit; a project does not acquire a package implicitly. */
export interface ProjectDraft {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
}

/** One real user's create act, with distinct caller-owned grant and event identities. */
export interface ProjectCreationAct {
  readonly actor: Extract<AccessActor, { kind: 'user' }>;
  readonly at: number;
  readonly grantId: string;
  readonly projectAuditId: string;
  readonly grantAuditId: string;
}

/** A complete retained first birth, never independent child metadata or authority. */
export interface ProjectFirstWorkPackage {
  readonly workPackage: NewWorkPackage;
  /** Retained legacy draft input, validated for ownership; current steps come from the reached catalogue. */
  readonly steps: readonly Step[];
  readonly creatorGrant: WorkPackageCreatorGrant;
}
/** Empty and complete first-birth successes are closed correlated variants. */
export type ProjectCreated =
  | { readonly kind: 'created'; readonly project: ProjectSummary }
  | {
      readonly kind: 'created_with_work_package';
      readonly project: ProjectSummary;
      readonly workPackage: WorkPackage;
      readonly steps: readonly Step[];
    };
/** Modeled address refusal returned only after the whole combined owner rolls back. */
export interface ProjectPackageRefusal {
  readonly kind: 'work_package_refused';
  readonly reason: 'abbreviation_taken' | 'abbreviation_exhausted';
}

/**
 * Self-owning administration, outside borrowed plan stores. The resource must
 * admit organization.create_project separately. Creation retains its inputs
 * before queueing, then writes project, creator project-manager grant (creation
 * origin), project_created and access_granted atomically. Optional first birth adds
 * the actual package, current catalogue values and its creation grant/access_granted in that same owner. A grant refusal writes
 * nothing. Unknown storage failures throw, rather than becoming a name conflict.
 */
export interface ProjectStore {
  create(
    draft: ProjectDraft,
    act: ProjectCreationAct,
    first?: ProjectFirstWorkPackage,
  ): Promise<ProjectCreated | ProjectPackageRefusal | 'name_taken' | GrantRefusal>;
  /** Missing and foreign IDs are alike; filtering precedes reading the row. */
  findIn(organizationId: string, projectId: string): Promise<ProjectDetail | null>;
  /** Projects in this organization only, ordered by name then id. */
  listIn(organizationId: string): Promise<readonly ProjectSummary[]>;
  /** Accepted same-name updates bump revision and audit; exact conflicts write nothing. */
  rename(
    organizationId: string,
    projectId: string,
    name: string,
    act: ProjectAct,
  ): Promise<ProjectRenamed | 'name_taken' | 'not_found'>;
  /** Moves one existing child atomically with both parent revisions and the destination-project audit. Same-parent is a state-preserving no-op. */
  moveWorkPackage(
    organizationId: string,
    workPackageId: string,
    targetProjectId: string,
    act: ProjectAct,
  ): Promise<WorkPackageMoved | WorkPackageMoveRefusal>;
  /** Empty only; removes/audits direct project grants atomically and preserves a current direct organization super-admin. The last empty project may be deleted. */
  delete(
    organizationId: string,
    projectId: string,
    act: ProjectAct,
  ): Promise<ProjectDeleted | 'not_found' | 'last_super_admin'>;
}

/** Detaches the user act before queueing; rejects malformed identities/instants before any write. */
export function retainProjectAct(
  organizationId: string,
  projectId: string,
  act: ProjectAct,
): ProjectAct {
  const access = retainAccessAct(act);
  if (access.actor.kind !== 'user')
    throw new Error('project administration requires a real user actor');
  if (
    typeof organizationId !== 'string' ||
    organizationId === '' ||
    typeof projectId !== 'string' ||
    projectId === ''
  )
    throw new Error('project organization and identity must be present');
  if (!Number.isSafeInteger(access.at) || access.at < 0)
    throw new Error('project administration instant is invalid');
  return {
    actor: { kind: 'user', userId: access.actor.userId },
    at: access.at,
    auditId: access.auditId,
  };
}

/**
 * Detaches the explicit create act and draft before an owner waits for its turn.
 * @throws for missing identities, a non-user actor, invalid instant or reused IDs.
 */
export function retainProjectCreation(
  draft: ProjectDraft,
  act: ProjectCreationAct,
): { draft: ProjectDraft; act: ProjectCreationAct } {
  const access = retainAccessAct({ actor: act.actor, at: act.at, auditId: act.grantAuditId });
  if (access.actor.kind !== 'user') throw new Error('project creation requires a real user actor');
  const identities = [draft.id, act.grantId, act.projectAuditId, act.grantAuditId];
  if (
    identities.some((id) => typeof id !== 'string' || id === '') ||
    new Set(identities).size !== identities.length
  )
    throw new Error('project, grant and audit identities must be present and distinct');
  if (
    typeof draft.organizationId !== 'string' ||
    draft.organizationId === '' ||
    typeof draft.name !== 'string' ||
    draft.name === ''
  )
    throw new Error('project organization and name must be present');
  if (!Number.isSafeInteger(access.at) || access.at < 0)
    throw new Error('project creation instant is invalid');
  return {
    draft: { id: draft.id, organizationId: draft.organizationId, name: draft.name },
    act: {
      actor: { kind: 'user', userId: access.actor.userId },
      at: access.at,
      grantId: act.grantId,
      projectAuditId: act.projectAuditId,
      grantAuditId: access.auditId,
    },
  };
}

/** Retains and checks one complete cross-entity birth before its owner queues. */
export function retainProjectFirstWorkPackage(
  draft: ProjectDraft,
  act: ProjectCreationAct,
  first: ProjectFirstWorkPackage | undefined,
): ProjectFirstWorkPackage | undefined {
  if (first === undefined) return undefined;
  const retained = retainWorkPackageCreation(
    first.workPackage,
    first.steps,
    { at: act.at, by: act.actor.userId },
    draft.organizationId,
    first.creatorGrant,
  );
  const ids = [
    draft.id,
    act.grantId,
    act.projectAuditId,
    act.grantAuditId,
    retained.workPackage.id,
    ...retained.steps.map((step) => step.id),
    retained.creatorGrant.id,
    retained.creatorGrant.auditId,
  ];
  if (ids.some((id) => typeof id !== 'string' || id === '') || new Set(ids).size !== ids.length)
    throw new Error('combined project, package, step, grant and audit identities must be distinct');
  if (
    retained.workPackage.projectId !== draft.id ||
    retained.steps.some((step) => step.workPackageId !== retained.workPackage.id) ||
    retained.workPackage.createdAt !== act.at
  )
    throw new Error('combined birth parent, step ownership or instant differs');
  return {
    workPackage: retained.workPackage,
    steps: retained.steps,
    creatorGrant: retained.creatorGrant,
  };
}

/** Detaches the real-user act before queueing; both addressed identities are explicit. */
export function retainWorkPackageMove(
  organizationId: string,
  workPackageId: string,
  targetProjectId: string,
  act: ProjectAct,
): ProjectAct {
  const retained = retainProjectAct(organizationId, targetProjectId, act);
  if (typeof workPackageId !== 'string' || workPackageId === '')
    throw new Error('work package move identity must be present');
  return retained;
}
