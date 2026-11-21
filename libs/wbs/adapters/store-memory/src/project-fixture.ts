import type { ProjectFirstWorkPackage, ProjectPackageRefusal, User, WorkPackage } from '@wbs/core';
import { retainProjectFirstWorkPackage, retainWorkPackageMove } from '@wbs/core';
import {
  type AccessGrantRecord,
  type GrantRefusal,
  isSecretShaped,
  type OrganizationAuditRecord,
  type Project,
  type ProjectCreated,
  type ProjectCreationAct,
  type ProjectDeleted,
  type ProjectDraft,
  type ProjectRenamed,
  type ProjectStore,
  type ProjectSummary,
  retainProjectAct,
  retainProjectCreation,
  type WorkPackageEntry,
} from '@wbs/core';
import type { WorkPackageMoved, WorkPackageMoveRefusal } from '@wbs/core/ports/project-store';
import {
  type AccessObjectKind,
  BUILT_IN_ROLES,
  formatTypedDependencyKey,
  isDependencyEndpointScope,
  isRelationshipType,
  type Permission,
  roleFitsScope,
} from '@wbs/domain';

import { writePackageCreatorGrantIn } from './package-creation-fixture';
import { clearMemorySettings } from './settings-fixture';
import {
  materializeMemoryPackageStepsIn,
  type MemoryStepCatalogueScope,
  type MemoryStepCatalogueTables,
  memoryStepCatalogueTables,
} from './step-catalogue';
import { readMemoryPackageStepsIn } from './step-package-reads';
import {
  type MemoryTypedDependencyTable,
  memoryTypedDependencyTable,
} from './typed-dependency-fixture';
import {
  createMemoryWorkPackageIn,
  type MemoryWorkPackageTables,
  memoryWorkPackageTables,
} from './work-package-fixture';

interface ProjectRole {
  readonly organizationId: string | null;
  readonly objectKind: AccessObjectKind;
  readonly permissions: ReadonlySet<Permission>;
}

/** Explicit standalone administration fixture state; later source composition must clone/replace these tables with its transaction state. */
export interface MemoryProjectTables {
  readonly users: Map<string, User>;
  readonly catalogue: MemoryStepCatalogueTables;
  readonly workItemTypes: Map<string, { readonly id: string }>;
  readonly typeOrganizations: Map<string, string>;
  readonly organizations: Map<string, { readonly legacy: boolean }>;
  readonly memberships: Map<string, Set<string>>;
  readonly roles: Map<string, ProjectRole>;
  readonly projects: Map<string, Project>;
  readonly workPackages: Map<string, WorkPackage>;
  readonly packages: MemoryWorkPackageTables;
  readonly dependencies: MemoryTypedDependencyTable;
  readonly grants: Map<string, AccessGrantRecord>;
  readonly audits: Map<string, OrganizationAuditRecord>;
  failAt:
    | 'package'
    | 'package_grant'
    | 'package_grant_audit'
    | 'project'
    | 'grant'
    | 'project_audit'
    | 'grant_audit'
    | 'move_package'
    | 'move_source'
    | 'move_target'
    | 'move_audit'
    | 'rename'
    | 'rename_audit'
    | 'delete_grants'
    | 'revoke_audit'
    | 'delete_project'
    | 'delete_audit'
    | null;
}

/** Empty entity/membership state and the real built-in role catalogue, never an implicit successful grant. */
export function memoryProjectTables(): MemoryProjectTables {
  const projects = new Map<string, Project>(),
    grants = new Map<string, AccessGrantRecord>(),
    audits = new Map<string, OrganizationAuditRecord>();
  const existing = memoryWorkPackageTables();
  // The package writer receives a derived catalogue view only inside the same staged owner.
  existing.creation.roles.clear();
  const packages: MemoryWorkPackageTables = {
    ...existing,
    creation: { ...existing.creation, projects, grants, audits },
  };
  return {
    users: new Map(),
    catalogue: memoryStepCatalogueTables(),
    workItemTypes: new Map(),
    typeOrganizations: new Map(),
    organizations: new Map(),
    memberships: new Map(),
    roles: new Map(
      BUILT_IN_ROLES.map((role) => [
        role.id,
        {
          organizationId: null,
          objectKind: role.objectKind,
          permissions: new Set(role.permissions),
        },
      ]),
    ),
    projects,
    workPackages: packages.workPackages,
    packages,
    dependencies: memoryTypedDependencyTable(),
    grants,
    audits,
    failAt: null,
  };
}

/** SQLite BINARY ordering compares UTF-8 bytes, including supplementary characters. */
function compareText(first: string, second: string): number {
  const encoder = new TextEncoder(),
    left = encoder.encode(first),
    right = encoder.encode(second);
  for (let index = 0; index < Math.min(left.length, right.length); index++)
    if (left[index] !== right[index]) return left[index] - right[index];
  return left.length - right.length;
}

/**
 * Validates admitted raw revision evidence before conflict/nonempty outcomes or arithmetic.
 * Zero and the safe maximum are valid evidence; overflow is checked only when advancing.
 * @throws When the stored revision is not a nonnegative safe integer.
 */
function validateProjectRevision(project: Project): void {
  // Proof: omitting the integer term admits a positive rounded fraction; omitting the nonnegative term admits -1 (memory-project-revision-fault-integer/nonnegative-v1).
  if (!Number.isSafeInteger(project.revision) || project.revision < 0)
    throw new Error('stored project revision is malformed');
}

/** Standalone stateful twin: one queued owner stages project/grants/audits and publishes only after every write and the direct-holder invariant succeed. */
export function inMemoryProjects(tables: MemoryProjectTables): ProjectStore {
  let tail: Promise<unknown> = Promise.resolve();
  const ownWrite = <T>(operation: () => T): Promise<T> => {
    const turn = tail.then(operation);
    tail = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  };
  const readPackageEntries = (state: MemoryProjectTables, projectId: string): WorkPackageEntry[] =>
    [...state.workPackages.values()]
      .filter((child) => child.projectId === projectId)
      .sort((first, second) => compareText(first.id, second.id))
      .map(({ id, name }) => ({ id, name }));
  const deriveProjectSummary = (state: MemoryProjectTables, project: Project): ProjectSummary => ({
    ...structuredClone(project),
    workPackageCount: readPackageEntries(state, project.id).length,
  });
  const requireProjectWrite = (
    state: MemoryProjectTables,
    stage: NonNullable<MemoryProjectTables['failAt']>,
  ) => {
    if (state.failAt === stage) throw new Error('controlled ' + stage + ' write failure');
  };
  const appendAudit = (
    state: MemoryProjectTables,
    stage: NonNullable<MemoryProjectTables['failAt']>,
    audit: OrganizationAuditRecord,
  ) => {
    requireProjectWrite(state, stage);
    if (state.audits.has(audit.id)) throw new Error('duplicate project audit identity');
    if (
      Object.values(audit.detail).some(
        (value) => typeof value === 'string' && isSecretShaped(value),
      )
    )
      throw new Error('project audit detail would carry a secret or a full subject');
    state.audits.set(audit.id, audit);
  };
  const publishProjectTables = (staged: MemoryProjectTables) => {
    const replace = <T>(live: Map<string, T>, accepted: ReadonlyMap<string, T>) => {
      live.clear();
      for (const [id, row] of accepted) live.set(id, row);
    };
    tables.dependencies.rows.splice(
      0,
      tables.dependencies.rows.length,
      ...staged.dependencies.rows,
    );
    replace(tables.dependencies.creation, staged.dependencies.creation);
    replace(tables.projects, staged.projects);
    // Proof: publication omission makes the separate committed Research read fail; prior-values truncation loses the older package (combined-project-fault-publication/prior-values-v1).
    replace(tables.catalogue.packageValues, staged.catalogue.packageValues);
    replace(tables.grants, staged.grants);
    replace(tables.audits, staged.audits);
    replace(tables.workPackages, staged.workPackages);
    replace(tables.packages.steps, staged.packages.steps);
    replace(tables.packages.opened, staged.packages.opened);
    replace(tables.packages.allowanceRevisions, staged.packages.allowanceRevisions);
    replace(tables.packages.owning, staged.packages.owning);
    replace(tables.packages.settings.values, staged.packages.settings.values);
    replace(tables.packages.spaces, staged.packages.spaces);
    replace(tables.packages.markers.held, staged.packages.markers.held);
    replace(tables.packages.creation.creators, staged.packages.creation.creators);
    replace(tables.packages.creation.roles, staged.packages.creation.roles);
  };
  const nextProjectRevision = (project: Project) => {
    const revision = project.revision + 1;
    if (!Number.isSafeInteger(revision)) throw new Error('project revision overflow');
    return revision;
  };
  const write = (
    draft: ProjectDraft,
    act: ProjectCreationAct,
    first?: ProjectFirstWorkPackage,
  ): ProjectCreated | ProjectPackageRefusal | 'name_taken' | GrantRefusal => {
    const staged = structuredClone(tables);
    if (
      [...staged.projects.values()].some(
        (project) => project.organizationId === draft.organizationId && project.name === draft.name,
      )
    )
      return 'name_taken';
    requireProjectWrite(staged, 'project');
    if (!staged.organizations.has(draft.organizationId) || !staged.users.has(act.actor.userId))
      throw new Error('project foreign-key reference is absent');
    if (staged.projects.has(draft.id)) throw new Error('duplicate project identity');
    const project: Project = {
      ...draft,
      spaceId: null,
      spacePosition: null,
      revision: 0,
      createdAt: act.at,
      updatedAt: act.at,
      createdBy: act.actor.userId,
    };
    staged.projects.set(project.id, project);
    const role = staged.roles.get('project-manager');
    if (
      role === undefined ||
      (role.organizationId !== null && role.organizationId !== draft.organizationId)
    )
      return 'unknown_role';
    if (!roleFitsScope(role.objectKind, 'project')) return 'role_scope_mismatch';
    if (!staged.memberships.get(draft.organizationId)?.has(act.actor.userId)) return 'not_a_member';
    if (
      [...staged.grants.values()].some(
        (grant) =>
          grant.organizationId === draft.organizationId &&
          grant.scope.kind === 'project' &&
          grant.scope.projectId === project.id &&
          grant.subject.kind === 'user' &&
          grant.subject.userId === act.actor.userId &&
          grant.roleId === 'project-manager',
      )
    )
      return 'already_granted';
    requireProjectWrite(staged, 'grant');
    if (staged.grants.has(act.grantId)) throw new Error('duplicate grant identity');
    const grant: AccessGrantRecord = {
      id: act.grantId,
      organizationId: draft.organizationId,
      scope: { kind: 'project', projectId: project.id },
      subject: { kind: 'user', userId: act.actor.userId },
      roleId: 'project-manager',
      origin: 'creation',
      createdAt: act.at,
      createdBy: act.actor.userId,
    };
    staged.grants.set(grant.id, grant);
    appendAudit(staged, 'project_audit', {
      id: act.projectAuditId,
      organizationId: project.organizationId,
      actorId: act.actor.userId,
      action: 'project_created',
      subjectKind: 'project',
      subjectId: project.id,
      detail: {},
      createdAt: act.at,
    });
    appendAudit(staged, 'grant_audit', {
      id: act.grantAuditId,
      organizationId: grant.organizationId,
      actorId: act.actor.userId,
      action: 'access_granted',
      subjectKind: 'access_grant',
      subjectId: grant.id,
      detail: {
        roleId: grant.roleId,
        scopeKind: grant.scope.kind,
        scopeId: project.id,
        subjectKind: 'user',
        subjectId: act.actor.userId,
        origin: grant.origin,
      },
      createdAt: act.at,
    });
    if (first !== undefined) {
      requireProjectWrite(staged, 'package');
      if (staged.workPackages.has(first.workPackage.id))
        throw new Error('duplicate package identity');
      const context = {
        users: staged.users,
        organizations: staged.organizations,
        memberships: staged.memberships,
        ownership: staged.packages.owning,
      };
      const written = createMemoryWorkPackageIn(
        first.workPackage,
        // Proof: legacy-rows restores the draft here; the empty-catalogue case observes retired Dev rows (combined-project-fault-legacy-rows-v1).
        [],
        draft.organizationId,
        staged.packages,
        context,
      );
      if (written === 'not_found')
        throw new Error('combined first package parent is missing or foreign');
      if (typeof written === 'string') return { kind: 'work_package_refused', reason: written };
      const scope: MemoryStepCatalogueScope = {
        usage: { users: staged.users },
        organizations: staged.organizations,
        spaces: staged.packages.spaces,
        projects: staged.projects,
        packages: staged.workPackages,
        packageOrganization: staged.packages.owning,
        packageOwnership: staged.packages.owning,
        types: staged.workItemTypes,
        typeOrganization: staged.typeOrganizations,
      };
      // Proof: omitting materialization makes the genuine Research birth throw for absent explicit values (combined-project-fault-materialization-v1).
      materializeMemoryPackageStepsIn(staged.catalogue, scope, draft.organizationId, written.id);
      const currentSteps = readMemoryPackageStepsIn(staged.catalogue, scope, written.id);
      staged.packages.creation.creators.set(written.id, act.actor.userId);
      // One stage-local view of the actual retained catalogue; never a separately seeded authority store.
      staged.packages.creation.roles.clear();
      for (const [id, role] of staged.roles)
        if (role.organizationId === null || role.organizationId === draft.organizationId)
          staged.packages.creation.roles.set(id, role.objectKind);
      requireProjectWrite(staged, 'package_grant');
      writePackageCreatorGrantIn(
        staged.packages.creation,
        context,
        draft.organizationId,
        written.id,
        { at: act.at, by: act.actor.userId },
        first.creatorGrant,
      );
      requireProjectWrite(staged, 'package_grant_audit');
      publishProjectTables(staged);
      return {
        kind: 'created_with_work_package',
        project: deriveProjectSummary(staged, project),
        workPackage: structuredClone(written),
        // Proof: reply substitutes legacy input; the independently authored Research identity/defaults differ (combined-project-fault-reply-v1).
        steps: currentSteps,
      };
    }
    publishProjectTables(staged);
    return { kind: 'created', project: deriveProjectSummary(staged, project) };
  };
  return {
    async create(draft, act, first) {
      ({ draft, act } = retainProjectCreation(draft, act));
      first = retainProjectFirstWorkPackage(draft, act, first);
      // Proof: queued-catalogue captures before admission; the genuinely added binding is absent from the newborn reply (combined-project-fault-queued-catalogue-v1).
      return await ownWrite(() => write(draft, act, first));
    },
    async findIn(organizationId, projectId) {
      await Promise.resolve();
      const project = tables.projects.get(projectId);
      if (project?.organizationId !== organizationId) return null;
      const workPackages = readPackageEntries(tables, project.id);
      return { ...structuredClone(project), workPackageCount: workPackages.length, workPackages };
    },
    async listIn(organizationId) {
      await Promise.resolve();
      return [...tables.projects.values()]
        .filter((project) => project.organizationId === organizationId)
        .sort(
          (first, second) =>
            compareText(first.name, second.name) || compareText(first.id, second.id),
        )
        .map((project) => deriveProjectSummary(tables, project));
    },
    async rename(
      organizationId,
      projectId,
      name,
      act,
    ): Promise<ProjectRenamed | 'name_taken' | 'not_found'> {
      act = retainProjectAct(organizationId, projectId, act);
      if (typeof name !== 'string' || name === '') throw new Error('project name must be present');
      return await ownWrite(() => {
        const staged = structuredClone(tables),
          current = staged.projects.get(projectId);
        if (current?.organizationId !== organizationId) return 'not_found';
        // Proof: removing this admission accepts null; moving it below the conflict hides damaged state (memory-project-revision-fault-rename-admission/order-v1).
        validateProjectRevision(current);
        if (
          [...staged.projects.values()].some(
            (other) =>
              other.organizationId === organizationId &&
              other.id !== projectId &&
              other.name === name,
          )
        )
          return 'name_taken';
        const revision = nextProjectRevision(current),
          renamed = { ...current, name, revision, updatedAt: act.at };
        requireProjectWrite(staged, 'rename');
        staged.projects.set(projectId, renamed);
        appendAudit(staged, 'rename_audit', {
          id: act.auditId,
          organizationId,
          actorId: act.actor.userId,
          action: 'project_renamed',
          subjectKind: 'project',
          subjectId: projectId,
          detail: { revision },
          createdAt: act.at,
        });
        publishProjectTables(staged);
        return { kind: 'renamed', project: deriveProjectSummary(staged, renamed) };
      });
    },
    async moveWorkPackage(
      organizationId,
      workPackageId,
      targetProjectId,
      act,
    ): Promise<WorkPackageMoved | WorkPackageMoveRefusal> {
      act = retainWorkPackageMove(organizationId, workPackageId, targetProjectId, act);
      return await ownWrite(() => {
        const staged = structuredClone(tables),
          selected = staged.workPackages.get(workPackageId);
        if (selected === undefined) return 'not_found';
        const owning = staged.packages.owning.get(workPackageId);
        if (owning === undefined) throw new Error('stored work package organization is absent');
        if (typeof owning !== 'string' || owning === '')
          throw new Error('stored work package organization is malformed');
        if (owning !== organizationId) return 'not_found';
        if (selected.id !== workPackageId)
          throw new Error('stored work package identity differs from key');
        const target = staged.projects.get(targetProjectId);
        if (target === undefined) return 'not_found';
        if (target.id !== targetProjectId)
          throw new Error('stored project identity differs from key');
        if (target.organizationId !== organizationId) return 'cross_organization';
        const readParent = (id: string): Project => {
          if (typeof id !== 'string' || id === '')
            throw new Error('stored work package parent is malformed');
          const parent = staged.projects.get(id);
          if (parent === undefined) throw new Error('stored work package parent is absent');
          if (parent.id !== id) throw new Error('stored project identity differs from key');
          if (parent.organizationId !== organizationId)
            throw new Error('stored work package parent organization differs');
          if (!Number.isSafeInteger(parent.revision) || parent.revision < 0)
            throw new Error('stored project revision is malformed');
          return parent;
        };
        const source = readParent(selected.projectId);
        readParent(targetProjectId);
        if (!Number.isSafeInteger(selected.revision) || selected.revision < 0)
          throw new Error('stored work package revision is malformed');
        const view = (
          kind: WorkPackageMoved['kind'],
          revision: number,
          sourceProject: Project,
          targetProject: Project,
        ): WorkPackageMoved => ({
          kind,
          workPackageId,
          projectId: targetProject.id,
          revision,
          sourceProject: { id: sourceProject.id, revision: sourceProject.revision },
          targetProject: { id: targetProject.id, revision: targetProject.revision },
        });
        if (source.id === target.id) return view('unchanged', selected.revision, source, target);
        const blockers = new Set<string>(),
          identities = new Set<string>(),
          keys = new Set<string>();
        for (const dependency of staged.dependencies.rows) {
          if (
            dependency.predecessor.workPackageId !== workPackageId &&
            dependency.successor.workPackageId !== workPackageId
          )
            continue;
          if (dependency.workPackageId !== dependency.successor.workPackageId)
            throw new Error('typed dependency has inconsistent successor ownership');
          if (!isRelationshipType(dependency.type))
            throw new Error('typed dependency has unknown relationship type');
          for (const endpoint of [dependency.predecessor, dependency.successor]) {
            if (
              !isDependencyEndpointScope(endpoint.scope) ||
              typeof endpoint.workItemId !== 'string' ||
              endpoint.workItemId === '' ||
              (endpoint.scope !== 'whole' &&
                (typeof endpoint.stepId !== 'string' || endpoint.stepId === ''))
            )
              throw new Error('typed dependency endpoint is malformed');
          }
          const key = formatTypedDependencyKey(dependency);
          if (
            identities.has(dependency.id) ||
            keys.has(key) ||
            staged.dependencies.rows.filter((row) => row.id === dependency.id).length !== 1
          )
            throw new Error('duplicate unified dependency ' + dependency.id);
          identities.add(dependency.id);
          keys.add(key);
          if (!staged.dependencies.creation.has(dependency.id))
            throw new Error('incident dependency creation evidence is absent');
          const parents = [dependency.predecessor, dependency.successor].map((endpoint) => {
            const counterpart = staged.workPackages.get(endpoint.workPackageId);
            if (counterpart === undefined) throw new Error('incident work package is absent');
            if (counterpart.id !== endpoint.workPackageId)
              throw new Error('stored work package identity differs from key');
            if (staged.packages.owning.get(endpoint.workPackageId) !== organizationId)
              throw new Error('incident work package organization differs');
            const parent = readParent(counterpart.projectId);
            return endpoint.workPackageId === workPackageId ? target.id : parent.id;
          });
          if (parents[0] !== parents[1]) blockers.add(dependency.id);
        }
        if (blockers.size !== 0)
          return {
            kind: 'dependency_crosses_project',
            dependencyIds: [...blockers].sort(compareText),
          };
        const revision = selected.revision + 1;
        if (!Number.isSafeInteger(revision)) throw new Error('work package revision overflow');
        const sourceRevision = nextProjectRevision(source),
          targetRevision = nextProjectRevision(target);
        requireProjectWrite(staged, 'move_package');
        staged.workPackages.set(workPackageId, { ...selected, projectId: target.id, revision });
        requireProjectWrite(staged, 'move_source');
        staged.projects.set(source.id, { ...source, revision: sourceRevision, updatedAt: act.at });
        requireProjectWrite(staged, 'move_target');
        staged.projects.set(target.id, { ...target, revision: targetRevision, updatedAt: act.at });
        appendAudit(staged, 'move_audit', {
          id: act.auditId,
          organizationId,
          actorId: act.actor.userId,
          action: 'work_package_moved',
          subjectKind: 'project',
          subjectId: target.id,
          detail: {
            workPackageId,
            fromProjectId: source.id,
            toProjectId: target.id,
            workPackageRevision: revision,
            sourceProjectRevision: sourceRevision,
            targetProjectRevision: targetRevision,
          },
          createdAt: act.at,
        });
        const accepted = view('moved', revision, readParent(source.id), readParent(target.id));
        publishProjectTables(staged);
        return accepted;
      });
    },
    async delete(
      organizationId,
      projectId,
      act,
    ): Promise<ProjectDeleted | 'not_found' | 'last_super_admin'> {
      act = retainProjectAct(organizationId, projectId, act);
      return await ownWrite(() => {
        const staged = structuredClone(tables),
          current = staged.projects.get(projectId);
        if (current?.organizationId !== organizationId) return 'not_found';
        // Proof: removing this admission accepts null; moving it below the child check hides damaged state (memory-project-revision-fault-delete-admission/order-v1).
        validateProjectRevision(current);
        const children = readPackageEntries(staged, projectId);
        if (children.length !== 0)
          return { kind: 'not_empty', workPackageIds: children.map(({ id }) => id) };
        const revision = nextProjectRevision(current);
        const removed = [...staged.grants.values()].filter(
          (grant) =>
            grant.organizationId === organizationId &&
            grant.scope.kind === 'project' &&
            grant.scope.projectId === projectId,
        );
        requireProjectWrite(staged, 'delete_grants');
        for (const grant of removed) staged.grants.delete(grant.id);
        for (const grant of removed) {
          const subjectId =
            grant.subject.kind === 'user'
              ? grant.subject.userId
              : grant.subject.kind === 'group'
                ? grant.subject.groupId
                : grant.subject.kind === 'machine_credential'
                  ? grant.subject.credentialId
                  : grant.organizationId;
          appendAudit(staged, 'revoke_audit', {
            id: crypto.randomUUID(),
            organizationId,
            actorId: act.actor.userId,
            action: 'access_revoked',
            subjectKind: 'access_grant',
            subjectId: grant.id,
            detail: {
              roleId: grant.roleId,
              scopeKind: 'project',
              scopeId: projectId,
              subjectKind: grant.subject.kind,
              subjectId,
              origin: 'cascade',
            },
            createdAt: act.at,
          });
        }
        requireProjectWrite(staged, 'delete_project');
        staged.projects.delete(projectId);
        clearMemorySettings(staged.packages.settings, staged.packages.markers, {
          level: 'project',
          id: projectId,
        });
        const hasDirectHolder = [...staged.grants.values()].some(
          (grant) =>
            grant.organizationId === organizationId &&
            grant.scope.kind === 'organization' &&
            grant.roleId === 'org-super-admin' &&
            grant.subject.kind === 'user' &&
            staged.memberships.get(organizationId)?.has(grant.subject.userId),
        );
        if (!hasDirectHolder) return 'last_super_admin';
        appendAudit(staged, 'delete_audit', {
          id: act.auditId,
          organizationId,
          actorId: act.actor.userId,
          action: 'project_deleted',
          subjectKind: 'project',
          subjectId: projectId,
          detail: { removedGrantCount: removed.length, revision },
          createdAt: act.at,
        });
        publishProjectTables(staged);
        return { kind: 'deleted' };
      });
    },
  };
}
