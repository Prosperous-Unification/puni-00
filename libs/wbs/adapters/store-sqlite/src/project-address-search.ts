import type {
  AddressProjectKey,
  CapturedProjectAddresses,
  OrganizationPrincipal,
  ProjectAddressSearchStore,
  ProjectAddressSnapshot,
  ResourceAccess,
} from '@wbs/core';
import { isReservedStepCode, isStepCode } from '@wbs/domain';
import { and, asc, eq, gt, isNull, ne, or, type SQL, sql } from 'drizzle-orm';

import { type Connection, type Drizzle, drizzleReadTransaction } from './db';
import { type ActiveOrganizationOf, SqliteOrganizationAccess } from './organization-access';
import { decodeProjectAbbreviation } from './project-abbreviation';
import { project, projectAbbreviation, projectOrganization, step, workItem } from './schema';
export interface ProjectAddressSearchOptions {
  readonly openConnection: () => Connection;
  readonly activeOrganizationOf: (db: Drizzle) => ActiveOrganizationOf;
  readonly now: () => number;
}
/** Owns a read-only connection and transaction through admission and lookup; never retains reader authority. */
export class ProjectAddressSearchRepository implements ProjectAddressSearchStore {
  constructor(private readonly options: ProjectAddressSearchOptions) {}
  async withSnapshot<T>(
    principal: OrganizationPrincipal,
    read: (snapshot: ProjectAddressSnapshot) => T | Promise<T>,
  ) {
    const connection = this.options.openConnection();
    let active = true;
    try {
      const transaction = drizzleReadTransaction(connection.db);
      // Proof: removing transaction controls failed `holds authorization metadata and selected placements in one snapshot across rival writes` (rival name/placement visible, 2026-10-22).
      transaction.begin();
      try {
        const resolved = await new SqliteOrganizationAccess(
          connection.db,
          this.options.activeOrganizationOf(connection.db),
          this.options.now,
        ).resolve(principal);
        if (!resolved.ok) {
          transaction.commit();
          return resolved;
        }
        // Proof: removing the active guard failed `closes success modeled refusal and throws and rejects retained reader capabilities` (retained access did not throw, 2026-10-22).
        const assertActive = () => {
          if (!active) throw new Error('project address snapshot is closed');
        };
        const reader = new AddressReader(connection.db, resolved.access, assertActive);
        const value = await read(reader);
        transaction.commit();
        return { ok: true, value } as const;
      } catch (cause) {
        transaction.rollback();
        throw cause;
      }
    } finally {
      active = false;
      connection.close();
    }
  }
}
class AddressReader implements ProjectAddressSnapshot {
  constructor(
    private readonly db: Drizzle,
    private readonly authority: ResourceAccess,
    private readonly assertActive: () => void,
  ) {}
  get access() {
    this.assertActive();
    return this.authority;
  }
  // Proof: removing the organization predicate failed mounted alphabetic discovery (foreign AA instead of AX, 2026-10-22).
  private scope(): SQL | undefined {
    return this.authority.kind === 'legacy'
      ? undefined
      : eq(projectOrganization.organizationId, this.authority.scope.organizationId);
  }
  private projects(predicate?: SQL) {
    return this.db
      .select({
        projectId: project.id,
        name: project.name,
        organizationId: projectOrganization.organizationId,
        namespace: projectAbbreviation.namespace,
        abbreviation: projectAbbreviation.abbreviation,
      })
      .from(project)
      .leftJoin(projectOrganization, eq(projectOrganization.resourceId, project.id))
      .leftJoin(projectAbbreviation, eq(projectAbbreviation.projectId, project.id))
      .where(and(this.scope(), predicate));
  }
  searchProjects(search: string, after: AddressProjectKey | null, limit: number) {
    this.assertActive();
    // An authorized broken row must fail before a filter can hide absent code evidence.
    const anomaly = this.projects(
      or(
        isNull(projectAbbreviation.abbreviation),
        isNull(projectAbbreviation.namespace),
        ne(
          projectAbbreviation.namespace,
          sql`CASE WHEN ${projectOrganization.organizationId} IS NULL THEN 'legacy' ELSE 'org:' || ${projectOrganization.organizationId} END`,
        ),
      ),
    )
      .limit(1)
      .get();
    // Proof: bypassing anomaly decoding failed mounted `fails missing abbreviation evidence visibly even outside the discovery match` (200 instead of 500, 2026-10-22).
    if (anomaly !== undefined) decodeProjectAbbreviation(anomaly);
    const lowered = search.toLowerCase();
    // Proof: removing the non-ASCII superset branch failed mounted Unicode name matching (CITY omitted for i̇stan, 2026-10-22).
    const matches = or(
      sql`substr(lower(${projectAbbreviation.abbreviation}),1,${lowered.length}) = ${lowered}`,
      sql`instr(lower(${project.name}),${lowered}) > 0`,
      sql`${project.name} GLOB '*[^ -~]*'`,
    );
    const continuation =
      after === null
        ? undefined
        : or(
            gt(projectAbbreviation.abbreviation, after.abbreviation),
            and(
              eq(projectAbbreviation.abbreviation, after.abbreviation),
              gt(project.id, after.projectId),
            ),
          );
    return this.projects(and(matches, continuation))
      .orderBy(asc(projectAbbreviation.abbreviation), asc(project.id))
      .limit(limit)
      .all()
      .map((stored) => {
        const decoded = decodeProjectAbbreviation(stored);
        return {
          projectId: decoded.projectId,
          abbreviation: decoded.abbreviation,
          name: stored.name,
        };
      });
  }
  capture(projectId: string): CapturedProjectAddresses | null {
    this.assertActive();
    const selected = this.projects(eq(project.id, projectId)).get();
    if (selected === undefined) return null;
    const decoded = decodeProjectAbbreviation(selected);
    const identity = {
      projectId: decoded.projectId,
      abbreviation: decoded.abbreviation,
      name: selected.name,
    };
    // Proof: removing the project predicate failed mounted selected-project paging (foreign placement entered candidates, 2026-10-22).
    const placements = this.db
      .select({
        id: workItem.id,
        parentId: workItem.parentId,
        position: workItem.position,
        frozenNumber: workItem.frozenNumber,
        name: workItem.name,
      })
      .from(workItem)
      .where(eq(workItem.projectId, projectId))
      .all();
    // Proof: removing this validation failed `rejects malformed trusted placement evidence at capture before returning detached facts` with `capture admitted malformed placement evidence`; mounted malformed-frozen-number lookup also returned 200 instead of 500 (2026-10-22).
    for (const placement of placements) {
      if (
        typeof placement.id !== 'string' ||
        typeof placement.name !== 'string' ||
        !Number.isSafeInteger(placement.position) ||
        (placement.frozenNumber !== null &&
          !/^[0-9]+(?:\.[0-9]+)*(?![\s\S])/.test(placement.frozenNumber))
      )
        throw new Error('malformed project address placement');
    }
    // Proof: removing the project predicate failed mounted viewer lookup (other project step IDs appeared, 2026-10-22).
    const steps = this.db
      .select({ id: step.id, code: step.code, name: step.name, position: step.position })
      .from(step)
      .where(eq(step.projectId, projectId))
      .orderBy(asc(step.position), asc(step.id))
      .all();
    // Proof: removing step validation failed `rejects malformed trusted step evidence at capture before returning detached facts` (capture admitted text position, 2026-10-22).
    for (const selectedStep of steps) {
      if (
        typeof selectedStep.id !== 'string' ||
        typeof selectedStep.name !== 'string' ||
        !Number.isSafeInteger(selectedStep.position) ||
        (selectedStep.code !== null &&
          (!isStepCode(selectedStep.code) || isReservedStepCode(selectedStep.code)))
      )
        throw new Error('malformed project address step');
    }
    return { project: identity, placements, steps };
  }
}
