import {
  authorize,
  authorizePackage,
  type CommandAccess,
  retainProjectAct,
  retainProjectCreation,
} from '@wbs/core';
import type { ResourceAccess } from '@wbs/core/ports/organization-access';
import type {
  ProjectAdministration,
  ProjectBirth,
  ProjectCaller,
  ProjectChange,
  ProjectCreatedView,
  ProjectCreation,
  ProjectMove,
  ProjectRenamedView,
  ProjectWriteRefusal,
} from '@wbs/core/ports/project-administration';
import type { ProjectView } from '@wbs/core/ports/project-read';
import type { ProjectFirstWorkPackage } from '@wbs/core/ports/project-store';
import type { Project } from '@wbs/core/ports/project-store';
import { retainProjectFirstWorkPackage } from '@wbs/core/ports/project-store';
import { retainWorkPackageMove } from '@wbs/core/ports/project-store';
import { and, eq, sql } from 'drizzle-orm';

import { AccessDecisionRepository, readPackageTargetRow } from './access-decisions';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import {
  createFirstWorkPackageIn,
  createProjectIn,
  deleteProjectIn,
  moveWorkPackageIn,
  ProjectGrantRefused,
  readProjectDetailIn,
  renameProjectIn,
} from './project-operations';
import { project } from './schema';
import { runSecurityTransaction } from './security-transaction';
import { LastSuperAdmin } from './super-admin';
import { readWorkPackageCreationRefusal } from './work-package-creation';

/** Copies validated metadata without forwarding an offline all-child summary. */
function copyProjectView(project: Project, workPackageCount: number): ProjectView {
  return {
    id: project.id,
    organizationId: project.organizationId,
    spaceId: project.spaceId,
    spacePosition: project.spacePosition,
    name: project.name,
    revision: project.revision,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    createdBy: project.createdBy,
    workPackageCount,
  };
}

/**
 * Reads selected identity, actual ownership, current parent and raw restriction flag.
 * A valid foreign owner is opaque before content decoding. A present unmapped
 * package is corrupt trusted state, unlike a genuinely absent package.
 */
function readMovePackageIn(db: Drizzle, organizationId: string, workPackageId: string) {
  const row = db
    .all<{
      id: unknown;
      organizationId: unknown;
      restricted: unknown;
      projectId: unknown;
      parentId: unknown;
      parentOrganizationId: unknown;
      actualOrganizationId: unknown;
      spaceId: unknown;
      actualSpaceId: unknown;
      spaceOrganizationId: unknown;
    }>(
      sql`
      SELECT wp.id, wpo.organization_id AS organizationId, wp.restricted,
             wp.project_id AS projectId, parent.id AS parentId,
             parent.organization_id AS parentOrganizationId,
             (SELECT id FROM organization WHERE id=wpo.organization_id) AS actualOrganizationId,
             parent.space_id AS spaceId,
             (SELECT id FROM space WHERE id=parent.space_id) AS actualSpaceId,
             (SELECT organization_id FROM space WHERE id=parent.space_id) AS spaceOrganizationId
      FROM work_package wp
      LEFT JOIN work_package_organization wpo ON wpo.resource_id = wp.id
      LEFT JOIN project parent ON parent.id = wp.project_id
      WHERE wp.id = ${workPackageId}
    `,
    )
    .at(0);
  if (row === undefined) return null;
  if (row.organizationId === null || row.organizationId === undefined)
    throw new Error('stored move package organization is absent');
  if (typeof row.organizationId !== 'string' || row.organizationId === '')
    throw new Error('stored move package organization is malformed');
  if (row.organizationId !== organizationId) return null;
  if (row.id !== workPackageId) throw new Error('stored move package identity differs');
  if (row.restricted !== 0 && row.restricted !== 1)
    throw new Error('stored move package restricted flag is malformed');
  const target = readPackageTargetRow({
    package_id: row.id,
    organization_id: row.organizationId,
    project_id: row.projectId,
    parent_id: row.parentId,
    parent_organization_id: row.parentOrganizationId,
    actual_organization_id: row.actualOrganizationId,
    space_id: row.spaceId,
    actual_space_id: row.actualSpaceId,
    space_organization_id: row.spaceOrganizationId,
    restricted: row.restricted,
  });
  return { id: workPackageId, projectId: target.chain.projectId, restricted: row.restricted === 1 };
}

/**
 * Current project administration over one source connection and its coordinator.
 * The required CommandAccess must read that same database with the production
 * browser organization resolver and non-owning credential reader. Only this outer
 * owner queues; borrowed project operations never nest a repository or transaction.
 */
export class SqliteProjectAdministration implements ProjectAdministration {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
    private readonly commandAccess: CommandAccess,
  ) {}

  async create(
    caller: ProjectCaller,
    draft: ProjectCreation,
    act: ProjectBirth,
    first?: ProjectFirstWorkPackage,
  ) {
    caller = structuredClone(caller);
    // Expected organization validates retained input shape; current resolution below selects authority.
    const retained = retainProjectCreation(
      { ...draft, organizationId: caller.expectedAccess.scope.organizationId },
      { ...act, actor: { kind: 'user', userId: caller.principal.id } },
    );
    first = retainProjectFirstWorkPackage(retained.draft, retained.act, first);
    try {
      return await this.admit<ProjectCreatedView | 'name_taken'>(caller, async (tx, access) => {
        const created = createProjectIn(
          tx,
          { ...retained.draft, organizationId: access.scope.organizationId },
          { ...retained.act, actor: { kind: 'user', userId: access.scope.userId } },
        );
        if (typeof created === 'string') return created;
        if (first === undefined)
          return { kind: 'created', project: copyProjectView(created.project, 0) };
        const allowed = await authorize(
          new AccessDecisionRepository(tx),
          access.principal,
          { kind: 'organization', organizationId: access.scope.organizationId },
          'organization.create_project',
        );
        if (!allowed.ok) {
          if (allowed.reason === 'not_found')
            throw new Error('combined package organization authorization returned not_found');
          throw new ProjectAdmissionRefused({
            ok: false,
            error: 'forbidden',
            permission: 'organization.create_project',
          });
        }
        const completed = createFirstWorkPackageIn(
          tx,
          { ...retained.draft, organizationId: access.scope.organizationId },
          { ...retained.act, actor: { kind: 'user', userId: access.scope.userId } },
          first,
        );
        const current = readProjectDetailIn(tx, access.scope.organizationId, retained.draft.id);
        if (current === null)
          throw new Error('combined project is absent before public projection');
        const readable = await new AccessDecisionRepository(tx).readablePackageIds(
          access.principal,
          access.scope.organizationId,
        );
        return {
          ...completed,
          project: copyProjectView(
            current,
            current.workPackages.filter((child) => readable.has(child.id)).length,
          ),
        };
      });
    } catch (failure) {
      if (failure instanceof AggregateError) throw failure;
      if (failure instanceof ProjectAdmissionRefused) return failure.refusal;
      if (failure instanceof ProjectGrantRefused) return failure.reason;
      const refused = readWorkPackageCreationRefusal(failure);
      if (refused !== null) return { kind: 'work_package_refused' as const, reason: refused };
      throw failure;
    }
  }

  async rename(caller: ProjectCaller, projectId: string, name: string, act: ProjectChange) {
    caller = structuredClone(caller);
    const retained = retainProjectAct(caller.expectedAccess.scope.organizationId, projectId, {
      ...act,
      actor: { kind: 'user', userId: caller.principal.id },
    });
    if (typeof name !== 'string' || name === '') throw new Error('project name must be present');
    return await this.admit<ProjectRenamedView | 'name_taken' | 'not_found'>(
      caller,
      async (tx, access) => {
        const renamed = renameProjectIn(tx, access.scope.organizationId, projectId, name, {
          ...retained,
          actor: { kind: 'user', userId: access.scope.userId },
        });
        if (typeof renamed === 'string') return renamed;
        const current = readProjectDetailIn(tx, access.scope.organizationId, projectId);
        if (current === null) throw new Error('renamed project is absent inside its owner');
        const readable = await new AccessDecisionRepository(tx).readablePackageIds(
          access.principal,
          access.scope.organizationId,
        );
        return {
          kind: renamed.kind,
          project: copyProjectView(
            current,
            current.workPackages.filter((child) => readable.has(child.id)).length,
          ),
        };
      },
    );
  }

  async delete(caller: ProjectCaller, projectId: string, act: ProjectChange) {
    caller = structuredClone(caller);
    const retained = retainProjectAct(caller.expectedAccess.scope.organizationId, projectId, {
      ...act,
      actor: { kind: 'user', userId: caller.principal.id },
    });
    try {
      return await this.admit(caller, async (tx, access) => {
        const deleted = deleteProjectIn(tx, access.scope.organizationId, projectId, {
          ...retained,
          actor: { kind: 'user', userId: access.scope.userId },
        });
        if (typeof deleted === 'string' || deleted.kind !== 'not_empty') return deleted;
        const readable = await new AccessDecisionRepository(tx).readablePackageIds(
          access.principal,
          access.scope.organizationId,
        );
        return {
          kind: deleted.kind,
          workPackageIds: deleted.workPackageIds.filter((id) => readable.has(id)),
        };
      });
    } catch (failure) {
      if (failure instanceof LastSuperAdmin) return 'last_super_admin';
      throw failure;
    }
  }

  /**
   * Revalidates the complete caller inside one source writer, then observes
   * readable W, scoped target and both exact interim permissions in that order.
   * Borrowed movement preserves no-op/content/revision/audit semantics; an
   * impossible post-admission storage refusal throws through the same rollback.
   */
  async moveWorkPackage(
    caller: ProjectCaller,
    workPackageId: string,
    targetProjectId: string,
    act: ProjectChange,
  ): Promise<ProjectMove> {
    caller = structuredClone(caller);
    const retained = retainWorkPackageMove(
      caller.expectedAccess.scope.organizationId,
      workPackageId,
      targetProjectId,
      { ...act, actor: { kind: 'user', userId: caller.principal.id } },
    );
    if (!caller.principal.scopes.includes('write'))
      return { ok: false, error: 'insufficient_scope' };
    return await runSecurityTransaction<ProjectMove>(this.db, this.gate, async (tx) => {
      const resolved = await this.commandAccess.resolve(caller);
      if (!resolved.ok) return resolved;
      const access = resolved.access;
      if (access.kind === 'legacy') return { ok: false, refusal: 'no_active_organization' };
      const selected = readMovePackageIn(tx, access.scope.organizationId, workPackageId);
      if (selected === null) return 'not_found';
      const decisions = new AccessDecisionRepository(tx);
      const readable = await authorizePackage(
        decisions,
        access,
        selected,
        access.scope.userId,
        'package.read',
      );
      if (!readable.ok) return 'not_found';
      const target = tx
        .select({ id: project.id })
        .from(project)
        .where(
          and(
            eq(project.id, targetProjectId),
            eq(project.organizationId, access.scope.organizationId),
          ),
        )
        .get();
      if (target === undefined) return 'not_found';
      const organization = await authorize(
        decisions,
        access.principal,
        { kind: 'organization', organizationId: access.scope.organizationId },
        'organization.create_project',
      );
      if (!organization.ok)
        return { ok: false, error: 'forbidden', permission: 'organization.create_project' };
      const writable = await authorizePackage(
        decisions,
        access,
        selected,
        access.scope.userId,
        'package.write',
      );
      if (!writable.ok) {
        if (writable.reason === 'not_found')
          throw new Error('admitted move package visibility changed inside its owner');
        return { ok: false, error: 'forbidden', permission: 'package.write' };
      }
      const moved = moveWorkPackageIn(
        tx,
        access.scope.organizationId,
        workPackageId,
        targetProjectId,
        { ...retained, actor: { kind: 'user', userId: access.scope.userId } },
      );
      if (moved === 'not_found' || moved === 'cross_organization')
        throw new Error('admitted move lost its scoped package or target', { cause: moved });
      return moved;
    });
  }

  private async admit<T>(
    caller: ProjectCaller,
    write: (tx: Drizzle, access: Extract<ResourceAccess, { kind: 'scoped' }>) => T | Promise<T>,
  ): Promise<T | ProjectWriteRefusal> {
    if (!caller.principal.scopes.includes('write'))
      return { ok: false, error: 'insufficient_scope' };
    return await runSecurityTransaction<T | ProjectWriteRefusal>(this.db, this.gate, async (tx) => {
      const resolved = await this.commandAccess.resolve(caller);
      if (!resolved.ok) return resolved;
      const access = resolved.access;
      if (access.kind === 'legacy') return { ok: false, refusal: 'no_active_organization' };
      const decision = await authorize(
        new AccessDecisionRepository(tx),
        access.principal,
        { kind: 'organization', organizationId: access.scope.organizationId },
        'organization.create_project',
      );
      if (!decision.ok)
        return { ok: false, error: 'forbidden', permission: 'organization.create_project' };
      return await write(tx, access);
    });
  }
}

/** Carries only a modeled late refusal through the real owner's successful rollback. */
class ProjectAdmissionRefused extends Error {
  constructor(readonly refusal: ProjectWriteRefusal) {
    super('combined package admission refused');
  }
}
