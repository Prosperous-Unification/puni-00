import {
  type GrantRefusal,
  type Project,
  type ProjectAct,
  type ProjectCreated,
  type ProjectCreationAct,
  type ProjectDeleted,
  type ProjectDetail,
  type ProjectDraft,
  type ProjectRenamed,
  type ProjectSummary,
  type WorkPackageEntry,
} from '@wbs/core';
import type {
  ProjectFirstWorkPackage,
  WorkPackageMoved,
  WorkPackageMoveRefusal,
} from '@wbs/core/ports/project-store';
import { and, asc, eq, getColumns, ne, sql } from 'drizzle-orm';

import { appendGrantAudit } from './access-audit';
import { deleteProjectGrantsIn, writeGrantIn } from './access-grant';
import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import { appendOrganizationAudit } from './organization-audit-log';
import { project, workPackage, workPackageOrganization } from './schema';
import { requireSuperAdminIn } from './super-admin';
import { readIncidentDependenciesIn } from './typed-dependency';
import { createWorkPackageIn } from './work-package-creation';

/** Carries a modeled borrowed grant refusal through rollback before the owner returns it. */
export class ProjectGrantRefused extends Error {
  constructor(readonly reason: GrantRefusal) {
    super('creator project grant refused: ' + reason);
  }
}

type ProjectRowValues = { readonly [Field in keyof Project]: unknown };

/** Validates scoped parent identity/name before its current read projection selects private fields. */
export function readProjectHeaderRow(
  row: Pick<ProjectRowValues, 'id' | 'organizationId' | 'name'>,
): Pick<Project, 'id' | 'organizationId' | 'name'> {
  const { id, organizationId, name } = row;
  if (typeof id !== 'string' || id === '') throw new Error('stored project id is malformed');
  if (typeof organizationId !== 'string' || organizationId === '')
    throw new Error('stored project organization_id is malformed');
  // Proof: omitting this whole name guard made the BLOB-name read resolve in 'rejects a malformed actual shell name before publishing package-only parent metadata';
  // canonical passed before/after (project-read.db.test.ts, 2026-11-14). No id/org/subclause proof.
  if (typeof name !== 'string' || name === '') throw new Error('stored project name is malformed');
  return { id, organizationId, name };
}

/**
 * Decodes the seven selected SQLite values into {@link Project}; integer-affinity
 * columns and Drizzle's declared types do not establish their runtime values.
 * IDs/name are nonempty strings, revision a nonnegative safe integer, timestamps
 * signed safe integers (historical instants may predate the Unix epoch). Migrated
 * creator and update instant may be null; a recorded creator is a nonempty string.
 * @throws on malformed trusted state, without coercion, defaults or a foreign-key rewalk.
 */
export function readProjectRow(row: ProjectRowValues): Project {
  const { id, organizationId, name } = readProjectHeaderRow(row);
  const { revision, createdAt, updatedAt, createdBy, spaceId, spacePosition } = row;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)
    throw new Error('stored project revision is malformed');
  if (typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt))
    throw new Error('stored project created_at is malformed');
  if (updatedAt !== null && (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt)))
    throw new Error('stored project updated_at is malformed');
  if (createdBy !== null && (typeof createdBy !== 'string' || createdBy === ''))
    throw new Error('stored project created_by is malformed');
  const assignment = readProjectSpace(spaceId, spacePosition);
  return { id, organizationId, name, revision, createdAt, updatedAt, createdBy, ...assignment };
}

/** Full metadata carries both actual space fields or neither; malformed trusted assignments never become none. */
function readProjectSpace(
  spaceId: unknown,
  spacePosition: unknown,
): Pick<Project, 'spaceId' | 'spacePosition'> {
  if (spaceId === null && spacePosition === null) return { spaceId, spacePosition };
  if (
    typeof spaceId === 'string' &&
    spaceId !== '' &&
    typeof spacePosition === 'number' &&
    Number.isSafeInteger(spacePosition)
  )
    return { spaceId, spacePosition };
  throw new Error('stored project space assignment is malformed');
}

const packageCount = sql<unknown>`(select count(*) from work_package counted where counted.project_id = "project"."id")`;

/** Aggregate values are driver evidence too; an unavailable or malformed count is never zero. */
function readProjectSummary(row: ProjectRowValues & { workPackageCount: unknown }): ProjectSummary {
  const selected = readProjectRow(row),
    count = row.workPackageCount;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
    throw new Error('stored project work package count is malformed');
  return { ...selected, workPackageCount: count };
}

/** Actual selected child values, shared by joined offline detail and admitted snapshot reads. */
function readProjectEntryRow(row: {
  readonly childId: unknown;
  readonly childName: unknown;
}): WorkPackageEntry {
  if (typeof row.childId !== 'string' || row.childId === '' || typeof row.childName !== 'string')
    throw new Error('stored project work package entry is malformed');
  return { id: row.childId, name: row.childName };
}

/** Borrows the scoped parent snapshot; filters valid foreign mappings before decoding child fields. */
export function readProjectEntriesIn(
  db: Pick<Drizzle, 'all'>,
  organizationId: string,
  projectId: string,
): readonly WorkPackageEntry[] {
  // Proof: omitting this mapping filter passed LIST then failed the foreign BLOB-name full DETAIL decoder (M2); canonical passed before/after, 2026-11-14.
  return db
    .all<{ childId: unknown; childName: unknown }>(
      sql`
    SELECT child.id AS "childId", child.name AS "childName" FROM work_package child
    JOIN work_package_organization mapping ON mapping.resource_id=child.id
    WHERE child.project_id=${projectId} AND mapping.organization_id=${organizationId} ORDER BY child.id`,
    )
    .map(readProjectEntryRow);
}

/** One scoped SQL snapshot supplies the parent and every actual child; absent/foreign parents decode nothing. */
export function readProjectDetailIn(
  db: Pick<Drizzle, 'select'>,
  organizationId: string,
  projectId: string,
): ProjectDetail | null {
  const rows = db
    .select({
      ...getColumns(project),
      childId: sql<unknown>`child.id`,
      childName: sql<unknown>`child.name`,
    })
    .from(project)
    .leftJoin(sql`work_package child`, sql`child.project_id = ${project.id}`)
    .where(and(eq(project.organizationId, organizationId), eq(project.id, projectId)))
    .orderBy(sql`child.id`)
    .all();
  const first = rows.at(0);
  if (first === undefined) return null;
  const selected = readProjectRow(first),
    workPackages: WorkPackageEntry[] = [];
  for (const row of rows) {
    if (row.childId === null && row.childName === null && rows.length === 1) continue;
    workPackages.push(readProjectEntryRow(row));
  }
  return { ...selected, workPackageCount: workPackages.length, workPackages };
}

/** Every accepted project write advances its revision; overflow cannot silently lose an increment. */
function nextProjectRevision(current: Project): number {
  const revision = current.revision + 1;
  if (!Number.isSafeInteger(revision)) throw new Error('project revision overflow');
  return revision;
}
/** Borrows one scoped read; caller retains the same database observation and lifetime. */
export function readProjectSummariesIn(
  db: Pick<Drizzle, 'select'>,
  organizationId: string,
): readonly ProjectSummary[] {
  return db
    .select({ ...getColumns(project), workPackageCount: packageCount })
    .from(project)
    .where(eq(project.organizationId, organizationId))
    .orderBy(asc(project.name), asc(project.id))
    .all()
    .map(readProjectSummary);
}

/** Borrows the caller's admitted same-connection owner; failures escape for that owner to roll back. */
export function createProjectIn(
  tx: Drizzle,
  draft: ProjectDraft,
  act: ProjectCreationAct,
): ProjectCreated | 'name_taken' {
  const clash = tx
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.organizationId, draft.organizationId), eq(project.name, draft.name)))
    .get();
  if (clash !== undefined) return 'name_taken';
  const created = readProjectRow(
    tx
      .insert(project)
      .values({ ...draft, ...auditOnCreate({ at: act.at, by: act.actor.userId }) })
      .returning()
      .get(),
  );
  const granted = writeGrantIn(
    tx,
    draft.organizationId,
    {
      id: act.grantId,
      scope: { kind: 'project', projectId: created.id },
      subject: { kind: 'user', userId: act.actor.userId },
      roleId: 'project-manager',
      origin: 'creation',
    },
    { actor: act.actor, at: act.at, auditId: act.grantAuditId },
  );
  if (typeof granted === 'string') throw new ProjectGrantRefused(granted);
  appendOrganizationAudit(tx, {
    id: act.projectAuditId,
    organizationId: draft.organizationId,
    actorId: act.actor.userId,
    action: 'project_created',
    subjectKind: 'project',
    subjectId: created.id,
    detail: {},
    at: act.at,
  });
  appendGrantAudit(tx, {
    grant: granted.grant,
    action: 'access_granted',
    auditId: act.grantAuditId,
    actorId: act.actor.userId,
    at: act.at,
    origin: 'creation',
  });
  const summary = tx
    .select({ ...getColumns(project), workPackageCount: packageCount })
    .from(project)
    .where(and(eq(project.organizationId, created.organizationId), eq(project.id, created.id)))
    .get();
  if (summary === undefined) throw new Error('created project is absent inside its owner');
  return { kind: 'created', project: readProjectSummary(summary) };
}

/** Borrows the caller's admitted same-connection owner; failures escape for that owner to roll back. */
export function renameProjectIn(
  tx: Drizzle,
  organizationId: string,
  projectId: string,
  name: string,
  act: ProjectAct,
): ProjectRenamed | 'name_taken' | 'not_found' {
  const current = readProjectDetailIn(tx, organizationId, projectId);
  if (current === null) return 'not_found';
  const clash = tx
    .select({ id: project.id })
    .from(project)
    .where(
      and(
        eq(project.organizationId, organizationId),
        eq(project.name, name),
        ne(project.id, projectId),
      ),
    )
    .get();
  if (clash !== undefined) return 'name_taken';
  const revision = nextProjectRevision(current);
  const renamed = readProjectRow(
    tx
      .update(project)
      .set({ name, revision, updatedAt: act.at })
      .where(and(eq(project.organizationId, organizationId), eq(project.id, projectId)))
      .returning()
      .get(),
  );
  appendOrganizationAudit(tx, {
    id: act.auditId,
    organizationId,
    actorId: act.actor.userId,
    action: 'project_renamed',
    subjectKind: 'project',
    subjectId: projectId,
    detail: { revision },
    at: act.at,
  });
  return {
    kind: 'renamed',
    project: { ...renamed, workPackageCount: current.workPackageCount },
  };
}

/** Borrows the caller's admitted same-connection owner; failures escape for that owner to roll back. */
export function deleteProjectIn(
  tx: Drizzle,
  organizationId: string,
  projectId: string,
  act: ProjectAct,
): ProjectDeleted | 'not_found' {
  const current = readProjectDetailIn(tx, organizationId, projectId);
  if (current === null) return 'not_found';
  if (current.workPackages.length !== 0)
    return { kind: 'not_empty', workPackageIds: current.workPackages.map(({ id }) => id) };
  const revision = nextProjectRevision(current);
  const removed = deleteProjectGrantsIn(tx, organizationId, projectId);
  for (const grant of removed)
    appendGrantAudit(tx, {
      grant,
      action: 'access_revoked',
      auditId: crypto.randomUUID(),
      actorId: act.actor.userId,
      at: act.at,
      origin: 'cascade',
    });
  tx.delete(project)
    .where(and(eq(project.organizationId, organizationId), eq(project.id, projectId)))
    .run();
  requireSuperAdminIn(tx, organizationId);
  appendOrganizationAudit(tx, {
    id: act.auditId,
    organizationId,
    actorId: act.actor.userId,
    action: 'project_deleted',
    subjectKind: 'project',
    subjectId: projectId,
    detail: { removedGrantCount: removed.length, revision },
    at: act.at,
  });
  return { kind: 'deleted' };
}

/** Completes the retained child on the caller's existing owner; absent parent or later failure must roll it all back. */
export function createFirstWorkPackageIn(
  tx: Drizzle,
  draft: ProjectDraft,
  act: ProjectCreationAct,
  first: ProjectFirstWorkPackage,
): Extract<ProjectCreated, { kind: 'created_with_work_package' }> {
  const written = createWorkPackageIn(
    tx,
    first.workPackage,
    first.steps,
    { at: act.at, by: act.actor.userId },
    { organizationId: draft.organizationId, creatorGrant: first.creatorGrant },
  );
  if (typeof written === 'string')
    throw new Error('combined first package parent is missing or foreign');
  const current = readProjectDetailIn(tx, draft.organizationId, draft.id);
  if (current === null) throw new Error('combined project is absent inside its owner');
  const { workPackages, ...project } = current;
  return {
    kind: 'created_with_work_package',
    project,
    workPackage: written,
    steps: first.steps.map((step) => ({ ...step })),
  };
}

/**
 * Borrows one existing immediate writer. It validates actual parent and incident
 * state before writes, preserving the package identity and every descendant row.
 * Unknown decoder, write, audit or reply failures escape to that owner's rollback.
 */
export function moveWorkPackageIn(
  tx: Drizzle,
  organizationId: string,
  workPackageId: string,
  targetProjectId: string,
  act: ProjectAct,
): WorkPackageMoved | WorkPackageMoveRefusal {
  const mapping = tx
    .select()
    .from(workPackageOrganization)
    .where(eq(workPackageOrganization.resourceId, workPackageId))
    .get();
  const selected = tx
    .select({
      id: workPackage.id,
      projectId: workPackage.projectId,
      revision: workPackage.revision,
    })
    .from(workPackage)
    .where(eq(workPackage.id, workPackageId))
    .get();
  if (selected === undefined) return 'not_found';
  if (mapping === undefined) throw new Error('stored work package organization is absent');
  if (typeof mapping.organizationId !== 'string' || mapping.organizationId === '')
    throw new Error('stored work package organization is malformed');
  if (mapping.organizationId !== organizationId) return 'not_found';
  const targetRow = tx.select().from(project).where(eq(project.id, targetProjectId)).get();
  if (targetRow === undefined) return 'not_found';
  if (targetRow.organizationId !== organizationId) return 'cross_organization';
  const target = readProjectRow(targetRow);
  const readParent = (id: string): Project => {
    if (typeof id !== 'string' || id === '')
      throw new Error('stored work package parent is malformed');
    const parent = tx.select().from(project).where(eq(project.id, id)).get();
    if (parent === undefined) throw new Error('stored work package parent is absent');
    const decoded = readProjectRow(parent);
    if (decoded.organizationId !== organizationId)
      throw new Error('stored work package parent organization differs');
    return decoded;
  };
  const source = readParent(selected.projectId);
  if (
    typeof selected.revision !== 'number' ||
    !Number.isSafeInteger(selected.revision) ||
    selected.revision < 0
  )
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
  const blockers = new Set<string>();
  for (const dependency of readIncidentDependenciesIn(tx, [workPackageId])) {
    const parents = [dependency.predecessor, dependency.successor].map((endpoint) => {
      const counterpart = tx
        .select({ projectId: workPackage.projectId })
        .from(workPackage)
        .where(eq(workPackage.id, endpoint.workPackageId))
        .get();
      if (counterpart === undefined) throw new Error('incident work package is absent');
      const parent = readParent(counterpart.projectId);
      return endpoint.workPackageId === workPackageId ? target.id : parent.id;
    });
    if (parents[0] !== parents[1]) blockers.add(dependency.id);
  }
  if (blockers.size !== 0)
    return {
      kind: 'dependency_crosses_project',
      dependencyIds: [...blockers].sort((left, right) =>
        Buffer.compare(Buffer.from(left), Buffer.from(right)),
      ),
    };
  const revision = selected.revision + 1;
  if (!Number.isSafeInteger(revision)) throw new Error('work package revision overflow');
  const sourceRevision = nextProjectRevision(source),
    targetRevision = nextProjectRevision(target);
  tx.update(workPackage)
    .set({ projectId: target.id, revision, ...auditOnUpdate({ at: act.at }) })
    .where(eq(workPackage.id, workPackageId))
    .run();
  tx.update(project)
    .set({ revision: sourceRevision, ...auditOnUpdate({ at: act.at }) })
    .where(eq(project.id, source.id))
    .run();
  tx.update(project)
    .set({ revision: targetRevision, ...auditOnUpdate({ at: act.at }) })
    .where(eq(project.id, target.id))
    .run();
  appendOrganizationAudit(tx, {
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
    at: act.at,
  });
  const committed = tx
    .select({ projectId: workPackage.projectId, revision: workPackage.revision })
    .from(workPackage)
    .where(eq(workPackage.id, workPackageId))
    .get();
  const committedSource = readParent(source.id),
    committedTarget = readParent(target.id);
  if (
    committed?.projectId !== target.id ||
    committed.revision !== revision ||
    committedSource.revision !== sourceRevision ||
    committedTarget.revision !== targetRevision
  )
    throw new Error('moved work package or parent revision differs inside its owner');
  return view('moved', committed.revision, committedSource, committedTarget);
}
