import type {
  RefusedOrganizationAccess,
  ResourceAccess,
} from '@wbs/core/ports/organization-access';
import type { ProjectCaller } from '@wbs/core/ports/project-administration';
import type {
  ProjectDetailView,
  ProjectListView,
  ProjectRead,
  ProjectReadForbidden,
  ProjectView,
} from '@wbs/core/ports/project-read';
import type { Project } from '@wbs/core/ports/project-store';
import { and, asc, eq, sql } from 'drizzle-orm';

import { AccessDecisionRepository } from './access-decisions';
import { SqliteCommandAccess } from './command-access';
import { type Connection, type Drizzle, observeCommitted } from './db';
import { OPEN } from './gate';
import { MachineCredentialRepository } from './machine-credential';
import { type ActiveOrganizationOf, SqliteOrganizationAccess } from './organization-access';
import { readProjectEntriesIn, readProjectHeaderRow, readProjectRow } from './project-operations';
import { project } from './schema';
import { readSettingTargetIn } from './settings';

export interface SqliteProjectReadOptions {
  readonly openConnection: () => Connection;
  readonly activeOrganizationOf: (snapshot: Drizzle) => ActiveOrganizationOf;
  readonly now: () => number;
}

/** Copies only validated project metadata and the independently derived readable count. */
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
 * Dedicated committed observations with authority and rows on the same borrowed connection.
 * Construction acquires nothing. A source closes idle loans; already lent observations
 * may finish before their release physically closes them. No reader capability escapes.
 */
export class SqliteProjectRead implements ProjectRead {
  constructor(private readonly options: SqliteProjectReadOptions) {}

  async list(caller: ProjectCaller) {
    return await this.observe(
      caller,
      async (snapshot, access): Promise<readonly ProjectListView[]> => {
        const decisions = new AccessDecisionRepository(snapshot);
        const full = await decisions.readableProjectIds(
          access.principal,
          access.scope.organizationId,
        );
        const readable = await decisions.readablePackageIds(
          access.principal,
          access.scope.organizationId,
        );
        const projects = snapshot
          .select()
          .from(project)
          .where(eq(project.organizationId, access.scope.organizationId))
          .orderBy(asc(project.name), asc(project.id))
          .all();
        // Proof: omitting this mapping filter made the foreign BLOB-ID case fail at its first LIST decoder (M1); canonical passed before/after, 2026-11-14.
        const children = snapshot.all<{ projectId: unknown; childId: unknown }>(sql`
        SELECT parent.id AS "projectId", child.id AS "childId"
        FROM work_package child JOIN project parent ON parent.id=child.project_id
        JOIN work_package_organization mapping ON mapping.resource_id=child.id
        WHERE parent.organization_id=${access.scope.organizationId}
          AND mapping.organization_id=${access.scope.organizationId}`);
        const counts = new Map<string, number>();
        for (const child of children) {
          if (
            typeof child.projectId !== 'string' ||
            child.projectId === '' ||
            typeof child.childId !== 'string' ||
            child.childId === ''
          )
            throw new Error('stored project work package entry is malformed');
          // An absent accumulator means no readable child has contributed yet, not unavailable evidence.
          // Proof: counting unreadable children exposed shells at 'constructs lazily and omits projects' (privacy P5); canonical passed before/after, 2026-11-14.
          if (readable.has(child.childId))
            counts.set(child.projectId, (counts.get(child.projectId) ?? 0) + 1);
        }
        const views: ProjectListView[] = [];
        for (const row of projects) {
          const header = readProjectHeaderRow(row);
          const count = counts.get(header.id) ?? 0;
          // Proof: bypassing full metadata admission exposed Alpha metadata and invisible Beta at 'lists exact package-only shells' (privacy P1); canonical passed before/after, 2026-11-14.
          if (full.has(header.id)) views.push(copyProjectView(readProjectRow(row), count));
          // Proof: admitting zero-child shells exposed Alpha/Beta at 'constructs lazily and omits projects' (privacy P2); canonical passed before/after, 2026-11-14.
          else if (count > 0) views.push({ id: header.id, name: header.name });
        }
        return views;
      },
    );
  }

  async read(caller: ProjectCaller, projectId: string) {
    const observed = await this.observe(
      caller,
      async (snapshot, access): Promise<ProjectDetailView | ProjectReadForbidden | null> => {
        const row = snapshot
          .select()
          .from(project)
          .where(
            and(eq(project.organizationId, access.scope.organizationId), eq(project.id, projectId)),
          )
          .get();
        if (row === undefined) return null;
        const header = readProjectHeaderRow(row);
        const decisions = new AccessDecisionRepository(snapshot);
        const actualTarget = readSettingTargetIn(
          snapshot,
          { level: 'project', id: header.id },
          access.scope.organizationId,
        );
        if (actualTarget === null)
          throw new Error('selected project target disappeared inside its observation');
        const effective = await decisions.effectiveRoleAt(access.principal, actualTarget);
        const readable = await decisions.readablePackageIds(
          access.principal,
          access.scope.organizationId,
        );
        // Proof: bypassing detail admission returned full Alpha instead of the project.read refusal in 'lists exact package-only shells' (privacy P3); canonical passed before/after, 2026-11-14.
        if (effective === null) {
          // Proof: omitting this mapping filter passed full reads and shell LIST, then failed the foreign BLOB-ID shell DETAIL decoder (M3); canonical passed before/after, 2026-11-14.
          const children = snapshot.all<{ childId: unknown }>(sql`
            SELECT child.id AS "childId" FROM work_package child
            JOIN work_package_organization mapping ON mapping.resource_id=child.id
            WHERE child.project_id=${header.id} AND mapping.organization_id=${access.scope.organizationId}`);
          for (const child of children) {
            if (typeof child.childId !== 'string' || child.childId === '')
              throw new Error('stored project work package entry is malformed');
          }
          // Proof: ignoring child readability changed hidden Beta from null to forbidden in 'lists exact package-only shells' (privacy P4); canonical passed before/after, 2026-11-14.
          return children.some(
            (child) => typeof child.childId === 'string' && readable.has(child.childId),
          )
            ? { ok: false, error: 'forbidden', permission: 'project.read' }
            : null;
        }
        // Proof: omitting the child filter exposed SECRET/count2 on the second 'returns detached explicit fields' read (privacy P6, privacy only); canonical passed before/after, 2026-11-14.
        const workPackages = readProjectEntriesIn(snapshot, access.scope.organizationId, header.id)
          .filter((child) => readable.has(child.id))
          .map((child) => ({ id: child.id, name: child.name }));
        return { ...copyProjectView(readProjectRow(row), workPackages.length), workPackages };
      },
    );
    if (!observed.ok) return observed;
    // Proof: omitting this unwrap wrapped forbidden in ok:true/value; 'lists exact package-only shells and refuses their detail without inventing full metadata'
    // failed its first detail assertion; canonical passed before/after (project-read.db.test.ts, 2026-11-14). Refusal forwarding only.
    if (observed.value !== null && 'error' in observed.value) return observed.value;
    return { ok: true, value: observed.value } as const;
  }

  private async observe<T>(
    caller: ProjectCaller,
    read: (snapshot: Drizzle, access: Extract<ResourceAccess, { kind: 'scoped' }>) => Promise<T>,
  ): Promise<{ readonly ok: true; readonly value: T } | RefusedOrganizationAccess> {
    caller = structuredClone(caller);
    return await observeCommitted(this.options.openConnection, async (snapshot) => {
      const organizations = new SqliteOrganizationAccess(
        snapshot,
        this.options.activeOrganizationOf(snapshot),
        this.options.now,
      );
      const resolved = await new SqliteCommandAccess(
        snapshot,
        organizations,
        new MachineCredentialRepository(snapshot, OPEN),
      ).resolve(caller);
      if (!resolved.ok) return resolved;
      if (resolved.access.kind === 'legacy')
        return { ok: false, refusal: 'no_active_organization' };
      return { ok: true, value: await read(snapshot, resolved.access) };
    });
  }
}
