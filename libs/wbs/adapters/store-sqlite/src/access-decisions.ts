import {
  type AccessDecisions,
  type AccessSubject,
  accessSubjectOf,
  type AccessTarget,
  capOf,
  type ScopedPrincipal,
} from '@wbs/core';
import {
  type EffectiveRole,
  effectiveRoleOn,
  type GrantTarget,
  reachingGrantsOf,
  type StoredGrantRow,
} from '@wbs/domain';
import { type SQL, sql } from 'drizzle-orm';

import type { Drizzle } from './db';

/** `access_grant` joined to its role and permission rows, as SQLite answers it. */
interface GrantPermissionRecord {
  readonly grant_id: string;
  readonly scope_kind: string;
  readonly scope_id: string;
  readonly subject_kind: string;
  readonly subject_id: string;
  readonly role_id: string;
  readonly object_kind: string;
  readonly reaches_restricted: number;
  readonly permission: string | null;
}

/** One row of the listing: a reaching grant's permission row, or a readable package. */
type ListingRecord =
  | ({ readonly row_kind: 'grant'; readonly package_id: null } & GrantPermissionRecord)
  | { readonly row_kind: 'package'; readonly package_id: string };

function storedGrantRowOf(record: GrantPermissionRecord): StoredGrantRow {
  if (record.reaches_restricted !== 0 && record.reaches_restricted !== 1)
    throw new Error(
      `access_role.reaches_restricted of ${record.role_id} is ${String(record.reaches_restricted)}`,
    );
  return {
    grantId: record.grant_id,
    scopeKind: record.scope_kind,
    scopeId: record.scope_id,
    subjectKind: record.subject_kind,
    subjectId: record.subject_id,
    roleId: record.role_id,
    objectKind: record.object_kind,
    reachesRestricted: record.reaches_restricted === 1,
    permission: record.permission,
  };
}

/**
 * The `subject` CTE of `wbs-permissions` P17: a credential's own row alone,
 * or the account, its access groups in the organization and the
 * organization-members subject. The `machine` guards are what keep an
 * agent's human's grants from reaching it.
 *
 * Proof: with the three `machine = 0` guards dropped, `a machine principal
 * holds only its credential grants` in `access-decisions.db.test.ts` gave the
 * agent its account's reach (`project.read` from the members subject's
 * grant); watched 2026-11-08.
 */
function subjectRows(subject: AccessSubject, organizationId: string): SQL {
  const machine = subject.kind === 'credential' ? 1 : 0;
  const credentialId = subject.kind === 'credential' ? subject.credentialId : null;
  return sql`subject(kind, id) AS (
    SELECT 'machine_credential', ${credentialId} WHERE ${machine} = 1
    UNION ALL SELECT 'user', ${subject.accountId} WHERE ${machine} = 0
    UNION ALL SELECT 'group', group_id FROM access_group_member
      WHERE organization_id = ${organizationId} AND user_id = ${subject.accountId} AND ${machine} = 0
    UNION ALL SELECT 'organization_members', ${organizationId} WHERE ${machine} = 0
  )`;
}

/**
 * Current membership of the account, re-read in the deciding statement.
 *
 * Proof: with this `EXISTS` removed, `a removed member keeps no access` and
 * `a credential whose account left the organization reaches nothing` in
 * `access-decisions.db.test.ts` still listed the removed member's packages;
 * watched 2026-11-08.
 */
function membershipHolds(subject: AccessSubject, organizationId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM organization_membership m
    WHERE m.organization_id = ${organizationId} AND m.user_id = ${subject.accountId})`;
}

/**
 * The scope rows a target's grants may name, nearest last: a work package
 * reaches its organization, its project when it has one and itself; a project
 * its organization and itself. The organization target has none: it reads
 * every grant in the organization (the `any` mode of CP16).
 */
function scopeRows(target: Exclude<AccessTarget, { kind: 'organization' }>): SQL {
  const { chain } = target;
  if (target.kind === 'project')
    return sql`VALUES ('organization', ${chain.organizationId}), ('project', ${target.chain.projectId})`;
  return 'projectId' in target.chain
    ? sql`VALUES ('organization', ${chain.organizationId}), ('project', ${target.chain.projectId}),
        ('work_package', ${target.chain.workPackageId})`
    : sql`VALUES ('organization', ${chain.organizationId}), ('work_package', ${target.chain.workPackageId})`;
}

function organizationOf(target: AccessTarget): string {
  return target.kind === 'organization' ? target.organizationId : target.chain.organizationId;
}

function grantTargetOf(target: AccessTarget): GrantTarget {
  return target.kind === 'work_package'
    ? { kind: 'work_package', restricted: target.restricted }
    : { kind: target.kind };
}

/**
 * {@link AccessDecisions} over SQLite (`wbs-custom-permissions` "Effective
 * set"): each method issues exactly one statement returning every reaching
 * grant's raw permission rows, which `@wbs/domain` validates
 * ({@link reachingGrantsOf}) before P5's transformation and the cap. No
 * filter in SQL reads a permission id except the listing's `package.read`
 * admission, so a corrupt row always reaches validation.
 *
 * Built over the caller's connection: on a batch's catalog it reads inside
 * that batch's transaction. It never writes, so it takes no gate turn.
 */
export class AccessDecisionRepository implements AccessDecisions {
  constructor(private readonly db: Drizzle) {}

  async effectiveRoleAt(
    principal: ScopedPrincipal,
    target: AccessTarget,
  ): Promise<EffectiveRole | null> {
    await Promise.resolve();
    const subject = accessSubjectOf(principal);
    const organizationId = organizationOf(target);
    const [scopeTable, scopeJoin] =
      target.kind === 'organization'
        ? [sql``, sql``]
        : [
            sql`, scope(kind, id) AS (${scopeRows(target)})`,
            sql`JOIN scope c ON c.kind = g.scope_kind AND c.id = g.scope_id`,
          ];
    // Proof: turning this `LEFT JOIN` inner (here, and separately the
    // listing's) made `throws EmptyRoleSet on both statements` resolve, the
    // empty role read as no grant; watched 2026-11-08.
    const records = this.db.all<GrantPermissionRecord>(sql`
      WITH ${subjectRows(subject, organizationId)}${scopeTable}
      SELECT g.id AS grant_id, g.scope_kind, g.scope_id, g.subject_kind, g.subject_id, g.role_id,
             r.object_kind, r.reaches_restricted, p.permission
      FROM subject s
      CROSS JOIN access_grant g ON g.subject_kind = s.kind AND g.subject_id = s.id
      ${scopeJoin}
      JOIN access_role r ON r.id = g.role_id
      LEFT JOIN access_role_permission p ON p.role_id = g.role_id
      WHERE g.organization_id = ${organizationId} AND ${membershipHolds(subject, organizationId)}
      ORDER BY g.id, p.permission`);
    return effectiveRoleOn(
      reachingGrantsOf(records.map(storedGrantRowOf)),
      grantTargetOf(target),
      capOf(subject),
    );
  }

  /**
   * One statement: every reaching grant's raw rows (validated, so a corrupt
   * row throws here exactly as on {@link effectiveRoleAt}) and, beside them,
   * the packages a grant whose set holds `package.read` admits after P5. The
   * cap never removes `package.read`, so it changes no listing. Until
   * `wbs-work-packages` slice 2 a package has no project, so no project grant
   * admits one.
   *
   * Proof, each fault alone in `access-decisions.db.test.ts`, watched
   * 2026-11-08: the `package.read` admission dropped made `an organization
   * role without package.read lists nothing and every detail is invisible`
   * list both unrestricted packages; the P5 clause dropped made `org-viewer,
   * project and package roles at organization scope and the members subject
   * are skipped` list `wp-closed`; the admin read dropped (`wp.restricted = 0`
   * only) made `org-admin and org-super-admin read a restricted package and
   * never write it` miss `wp-closed`; filtering the grant rows by the
   * vocabulary in SQL made `throws UnknownPermissionRow on both statements`
   * resolve. The generated list/detail agreement case failed under both P5
   * faults.
   */
  async readablePackageIds(
    principal: ScopedPrincipal,
    organizationId: string,
  ): Promise<ReadonlySet<string>> {
    await Promise.resolve();
    const subject = accessSubjectOf(principal);
    const records = this.db.all<ListingRecord>(sql`
      WITH ${subjectRows(subject, organizationId)},
      reaching AS MATERIALIZED (
        SELECT g.id AS grant_id, g.scope_kind, g.scope_id, g.subject_kind, g.subject_id, g.role_id,
               r.object_kind, r.reaches_restricted
        FROM subject s
        CROSS JOIN access_grant g ON g.subject_kind = s.kind AND g.subject_id = s.id
        JOIN access_role r ON r.id = g.role_id
        WHERE g.organization_id = ${organizationId} AND ${membershipHolds(subject, organizationId)}
      ),
      readers AS MATERIALIZED (
        SELECT reach.scope_kind, reach.scope_id, reach.subject_kind, reach.reaches_restricted
        FROM reaching reach
        WHERE EXISTS (SELECT 1 FROM access_role_permission p
                      WHERE p.role_id = reach.role_id AND p.permission = 'package.read')
      )
      SELECT 'grant' AS row_kind, NULL AS package_id, reach.grant_id, reach.scope_kind,
             reach.scope_id, reach.subject_kind, reach.subject_id, reach.role_id,
             reach.object_kind, reach.reaches_restricted, p.permission
      FROM reaching reach LEFT JOIN access_role_permission p ON p.role_id = reach.role_id
      UNION ALL
      SELECT 'package', wp.id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
      FROM project wp
      JOIN project_organization wpo ON wpo.resource_id = wp.id
      WHERE wpo.organization_id = ${organizationId}
        AND EXISTS (SELECT 1 FROM readers reader WHERE
              (reader.scope_kind = 'organization' AND (wp.restricted = 0
                 OR (reader.subject_kind <> 'organization_members' AND reader.reaches_restricted = 1)))
           OR (reader.scope_kind = 'work_package' AND reader.scope_id = wp.id))`);
    const grantRows: StoredGrantRow[] = [];
    const packageIds = new Set<string>();
    for (const record of records)
      if (record.row_kind === 'grant') grantRows.push(storedGrantRowOf(record));
      else packageIds.add(record.package_id);
    reachingGrantsOf(grantRows);
    return packageIds;
  }

  /**
   * The store-private reader of `wbs-permissions` P13: a work package's target
   * from its organization and package rows only (today's `project` and
   * `project_organization`), or null when it is absent or no organization
   * owns it. Task 3.4 replaces it with the project chain.
   */
  async packageTargetOf(workPackageId: string): Promise<AccessTarget | null> {
    await Promise.resolve();
    const row = this.db
      .all<{ organization_id: string; restricted: number }>(
        sql`
      SELECT wpo.organization_id, wp.restricted FROM project wp
      JOIN project_organization wpo ON wpo.resource_id = wp.id
      WHERE wp.id = ${workPackageId}`,
      )
      .at(0);
    if (row === undefined) return null;
    if (row.restricted !== 0 && row.restricted !== 1)
      throw new Error(`project.restricted of ${workPackageId} is ${String(row.restricted)}`);
    return {
      kind: 'work_package',
      chain: { level: 'work_package', organizationId: row.organization_id, workPackageId },
      restricted: row.restricted === 1,
    };
  }
}
