import {
  type AccessDecisions,
  type AccessSubject,
  accessSubjectOf,
  type AccessTarget,
  capOf,
  type MemberEffectiveRole,
  type ScopedPrincipal,
} from '@wbs/core';
import {
  type EffectiveRole,
  effectiveRoleOn,
  type GrantTarget,
  type Permission,
  reachingGrantsOf,
  type StoredGrantRow,
} from '@wbs/domain';
import { type SQL, sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { readSettingTargetIn } from './settings';

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

/** A role LEFT JOIN preserves orphan grants as explicit corrupt trusted state. */
interface JoinedGrantRoleRecord extends Omit<
  GrantPermissionRecord,
  'object_kind' | 'reaches_restricted'
> {
  readonly catalogue_id: string | null;
  readonly object_kind: string | null;
  readonly reaches_restricted: number | null;
}

/** Validates nullable joined role metadata before the ordinary complete-row decoder. */
function readGrantRoleRow(record: JoinedGrantRoleRecord): StoredGrantRow {
  /* Proof: joined-role-missing: explicit missing-catalogue diagnostic before complete-row validation.
   * reports missing catalogue state through the actual direct-target writer
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  if (
    record.catalogue_id === null ||
    record.object_kind === null ||
    record.reaches_restricted === null
  )
    throw new Error(
      'access grant ' + record.grant_id + ' references missing access role ' + record.role_id,
    );
  return storedGrantRowOf({
    ...record,
    object_kind: record.object_kind,
    reaches_restricted: record.reaches_restricted,
  });
}

/** One row of the listing: a reaching grant's permission row, or a readable package. */
type ListingRecord =
  | ({ readonly row_kind: 'grant'; readonly package_id: null } & JoinedGrantRoleRecord)
  | { readonly row_kind: 'package'; readonly package_id: string }
  | ({ readonly row_kind: 'target' } & PackageTargetRecord);

/** A real scoped project target or one complete selected grant permission row. */
type ProjectListingRecord =
  | ({ readonly row_kind: 'grant' } & JoinedGrantRoleRecord)
  | {
      readonly row_kind: 'project';
      readonly project_id: unknown;
      readonly organization_id: unknown;
    };

/**
 * Proof: with the 0/1 guard removed, `throws on a reaches_restricted outside
 * 0 and 1, on both statements` (access-decisions.db.test.ts) resolved;
 * watched 2026-11-08.
 */
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
 * reaches its organization, actual project and itself; a project reaches its
 * organization and itself. The organization target
 * has none: it reads every grant in the organization (the `any` mode of CP16).
 *
 * Historical interim-chain proof; the coordinated parent transition replaces its old expectation.
 * Proof: with a `('project', projectId)` row added for a chain naming its
 * project, `a project grant reaches no package, in detail or in the listing,
 * until task 3.2` (access-decisions.db.test.ts) read the package in detail
 * while the listing omitted it; watched 2026-11-08.
 */
function scopeRows(target: Exclude<AccessTarget, { kind: 'organization' }>): SQL {
  return target.kind === 'project'
    ? sql`VALUES ('organization', ${target.chain.organizationId}), ('project', ${target.chain.projectId})`
    : sql`VALUES ('organization', ${target.chain.organizationId}), ('project', ${target.chain.projectId}), ('work_package', ${target.chain.workPackageId})`;
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
  constructor(private readonly db: Pick<Drizzle, 'all'>) {}

  /**
   * Validates every selected reaching grant before P5/cap projection.
   * @throws for missing catalogue rows or malformed kind, flag and permission sets,
   * even when another current grant independently supplies the requested authority.
   */
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
    // Proof: turning the permission `LEFT JOIN` inner (here, and separately the
    // listing's) made `throws EmptyRoleSet on both statements` resolve, the
    // empty role read as no grant; watched 2026-11-08.
    const records = this.db.all<JoinedGrantRoleRecord>(sql`
      WITH ${subjectRows(subject, organizationId)}${scopeTable}
      SELECT g.id AS grant_id, g.scope_kind, g.scope_id, g.subject_kind, g.subject_id, g.role_id,
             r.id AS catalogue_id, r.object_kind, r.reaches_restricted, p.permission
      FROM subject s
      CROSS JOIN access_grant g ON g.subject_kind = s.kind AND g.subject_id = s.id
      ${scopeJoin}
      /* Proof: effective-catalogue-join: making this role join INNER silently omitted the orphan.
       * rejects selected orphan-role beside sufficient grant at organization-effective
       * refuses a mounted work_package mutation on selected orphan-role beside sufficient package authority
       * both failed under the fault and passed after restoration (task2.4b catalogue receipts). */
      LEFT JOIN access_role r ON r.id = g.role_id
      LEFT JOIN access_role_permission p ON p.role_id = g.role_id
      WHERE g.organization_id = ${organizationId} AND ${membershipHolds(subject, organizationId)}
      ORDER BY g.id, p.permission`);
    /* Proof: effective-all-grant-validation: filtering raw rows by package.read/write hid corrupt permissions.
     * rejects selected unknown-permission beside sufficient grant at organization-effective
     * failed under the fault and passed after restoration (task2.4b catalogue receipts). */
    return effectiveRoleOn(
      reachingGrantsOf(records.map(readGrantRoleRow)),
      grantTargetOf(target),
      capOf(subject),
    );
  }

  /**
   * One statement: every reaching grant's raw rows (validated, so a corrupt
   * row throws here exactly as on {@link effectiveRoleAt}) and, beside them,
   * the packages a grant whose set holds `package.read` admits after P5. The
   * cap never removes `package.read`, so it changes no listing. Project grants
   * reach their actual current children without the organization-scope P5 cut.
   * Every package mapped to this organization is validated, even without a read
   * grant. A broken/missing mapping is also observed when the actual parent
   * belongs here; a valid foreign mapping stays opaque. This is not a global
   * audit of packages having neither an attributable map nor a parent.
   *
   * Proof, each fault alone in `access-decisions.db.test.ts`, watched
   * 2026-11-08: the `package.read` admission dropped made `an organization
   * role without package.read lists nothing and every detail is invisible`
   * list both unrestricted packages; the P5 clause dropped made `org-viewer,
   * workPackage and package roles at organization scope and the members subject
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
               r.id AS catalogue_id, r.object_kind, r.reaches_restricted
        FROM subject s
        CROSS JOIN access_grant g ON g.subject_kind = s.kind AND g.subject_id = s.id
        /* Proof: listing-catalogue-join: an INNER role join omitted the selected orphan before validation.
         * rejects selected orphan-role beside sufficient grant at listing
         * failed under the fault and passed after restoration (task2.4b catalogue receipts). */
        LEFT JOIN access_role r ON r.id = g.role_id
        WHERE g.organization_id = ${organizationId} AND ${membershipHolds(subject, organizationId)}
      ),
      targets AS MATERIALIZED (
        SELECT wp.id AS package_id, wpo.organization_id, wp.project_id,
               parent.id AS parent_id, parent.organization_id AS parent_organization_id,
               (SELECT actual_owner.id FROM organization actual_owner WHERE actual_owner.id =
                 (SELECT organization_id FROM work_package_organization WHERE resource_id = wp.id)) AS actual_organization_id,
               parent.space_id AS space_id,
               (SELECT selected_space.id FROM space selected_space WHERE selected_space.id = parent.space_id) AS actual_space_id,
               (SELECT selected_space.organization_id FROM space selected_space WHERE selected_space.id = parent.space_id) AS space_organization_id,
               wp.restricted
        FROM work_package wp
        LEFT JOIN work_package_organization wpo ON wpo.resource_id = wp.id
        LEFT JOIN project parent ON parent.id = wp.project_id
        WHERE wpo.organization_id = ${organizationId}
           OR ((wpo.organization_id IS NULL OR typeof(wpo.organization_id) <> 'text'
                OR wpo.organization_id = '') AND parent.organization_id = ${organizationId})
      ),
      readers AS MATERIALIZED (
        SELECT reach.scope_kind, reach.scope_id, reach.subject_kind, reach.reaches_restricted
        FROM reaching reach
        WHERE EXISTS (SELECT 1 FROM access_role_permission p
                      WHERE p.role_id = reach.role_id AND p.permission = 'package.read')
      )
      SELECT 'grant' AS row_kind, NULL AS package_id, reach.grant_id, reach.scope_kind,
             reach.scope_id, reach.subject_kind, reach.subject_id, reach.role_id,
             reach.catalogue_id, reach.object_kind, reach.reaches_restricted, p.permission,
             NULL AS organization_id, NULL AS project_id, NULL AS parent_id,
             NULL AS parent_organization_id, NULL AS actual_organization_id, NULL AS space_id, NULL AS actual_space_id, NULL AS space_organization_id, NULL AS restricted
      FROM reaching reach LEFT JOIN access_role_permission p ON p.role_id = reach.role_id
      UNION ALL
      SELECT 'target', package_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             organization_id, project_id, parent_id, parent_organization_id, actual_organization_id, space_id, actual_space_id, space_organization_id, restricted
      FROM targets
      UNION ALL
      SELECT 'package', wp.package_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
      FROM targets wp
      WHERE EXISTS (SELECT 1 FROM readers reader WHERE
              (reader.scope_kind = 'organization' AND (wp.restricted = 0
                 OR (reader.subject_kind <> 'organization_members' AND reader.reaches_restricted = 1)))
           OR (reader.scope_kind = 'project' AND reader.scope_id = wp.project_id)
           OR (reader.scope_kind = 'work_package' AND reader.scope_id = wp.package_id))`);
    const grantRows: StoredGrantRow[] = [];
    const packageIds = new Set<string>();
    /* Proof: listing-all-grant-validation: retaining only package.read grant records hid corrupt rows.
     * rejects selected unknown-permission beside sufficient grant at listing
     * failed under the fault and passed after restoration (task2.4b catalogue receipts). */
    for (const record of records)
      if (record.row_kind === 'grant') grantRows.push(readGrantRoleRow(record));
      else if (record.row_kind === 'target') readPackageTargetRow(record);
      else packageIds.add(record.package_id);
    reachingGrantsOf(grantRows);
    return packageIds;
  }

  /**
   * Batched project.read decisions over actual scoped projects on this borrowed connection.
   * Uses the same subject, membership, strict selected role rows and cap as detail;
   * package grants contribute no project permission. No generic memory/source capability.
   * @throws on malformed selected targets or grant catalogue state before permission filtering.
   */
  async readableProjectIds(
    principal: ScopedPrincipal,
    organizationId: string,
  ): Promise<ReadonlySet<string>> {
    await Promise.resolve();
    const subject = accessSubjectOf(principal);
    // Proof: omitting local membership kept14 IDs after deletion in 'uses one statement for many real projects' (privacy P9); canonical passed before/after, 2026-11-14.
    // Proof: omitting target organization selected a foreign row and failed 'agrees with real detail decisions' at the strict target guard (P10, availability); canonical passed before/after, 2026-11-14.
    // Proof: omitting grant organization exposed proj/proj-two in 'ignores an actual foreign-organization grant' (P11); canonical passed before/after, 2026-11-14.
    // Proof: omitting the reaching envelope selected package.teleport in 'ignores nonreaching package catalogue corruption' (P12, availability); canonical passed before/after, 2026-11-14.
    const records = this.db.all<ProjectListingRecord>(sql`
      WITH ${subjectRows(subject, organizationId)},
      targets AS MATERIALIZED (
        SELECT id AS project_id, organization_id FROM project
        WHERE organization_id = ${organizationId}
      ),
      reaching AS MATERIALIZED (
        SELECT g.id AS grant_id, g.scope_kind, g.scope_id, g.subject_kind, g.subject_id,
               g.role_id, r.id AS catalogue_id, r.object_kind, r.reaches_restricted
        FROM subject s CROSS JOIN access_grant g
          ON g.subject_kind=s.kind AND g.subject_id=s.id
        LEFT JOIN access_role r ON r.id=g.role_id
        WHERE g.organization_id=${organizationId}
          AND ${membershipHolds(subject, organizationId)}
          AND (g.scope_kind='organization' OR
               (g.scope_kind='project' AND EXISTS (
                 SELECT 1 FROM targets target WHERE target.project_id=g.scope_id)))
      )
      SELECT 'grant' AS row_kind, reach.grant_id, reach.scope_kind, reach.scope_id,
             reach.subject_kind, reach.subject_id, reach.role_id, reach.catalogue_id,
             reach.object_kind, reach.reaches_restricted, p.permission,
             NULL AS project_id, NULL AS organization_id
      FROM reaching reach LEFT JOIN access_role_permission p ON p.role_id=reach.role_id
      UNION ALL
      SELECT 'project', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
             project_id,organization_id FROM targets`);
    // Proof: skipping selected project-scope/organization-kind rows made the read resolve in 'rejects a selected incompatible project role even beside sufficient organization authority';
    // canonical passed before/after (access-decisions.db.test.ts, 2026-11-14). Local strict-decoder forwarding only.
    const grants = reachingGrantsOf(
      records.filter((record) => record.row_kind === 'grant').map(readGrantRoleRow),
    );
    const visible = new Set<string>();
    for (const record of records) {
      if (record.row_kind !== 'project') continue;
      // Proof: omitting this compound guard made the BLOB project-ID read resolve, failing rejectionOf in the owning SQL case (M4); canonical passed before/after, 2026-11-14.
      if (
        typeof record.project_id !== 'string' ||
        record.project_id === '' ||
        record.organization_id !== organizationId
      )
        throw new Error('stored project permission target is malformed');
      // Proof: removing per-target matching exposed proj-two for Ada in 'agrees with real detail decisions' (privacy P7); canonical passed before/after, 2026-11-14.
      const reaching = grants.filter(
        (grant) =>
          grant.scopeKind === 'organization' ||
          (grant.scopeKind === 'project' && grant.scopeId === record.project_id),
      );
      // Proof: bypassing visibility exposed proj-two in 'agrees with real detail decisions' (privacy P8, not cap necessity); canonical passed before/after, 2026-11-14.
      if (effectiveRoleOn(reaching, { kind: 'project' }, capOf(subject)) !== null)
        visible.add(record.project_id);
    }
    return visible;
  }

  /**
   * Reads an addressed current package and its parent with a narrow query and an absence orphan probe. Missing
   * package is null; a present package with missing/malformed map or parent throws.
   * A supplied organization conceals valid foreign mappings before parent validation;
   * null explicitly requests the raw internal global target, never ambient authority.
   */
  async packageTargetOf(
    packageId: string,
    organizationId: string | null,
  ): Promise<Extract<AccessTarget, { kind: 'work_package' }> | null> {
    await Promise.resolve();
    return readSettingTargetIn(this.db, { level: 'work_package', id: packageId }, organizationId);
  }
}

/** Raw columns of one current package/organization/parent LEFT JOIN observation. */
export interface PackageTargetRecord {
  readonly package_id: unknown;
  readonly organization_id: unknown;
  readonly project_id: unknown;
  readonly parent_id: unknown;
  readonly parent_organization_id: unknown;
  readonly actual_organization_id: unknown;
  readonly space_id: unknown;
  readonly actual_space_id: unknown;
  readonly space_organization_id: unknown;
  readonly restricted: unknown;
}

/** Validates the mapping identity before scoped readers decide foreign opacity. */
export function readPackageOrganization(packageId: string, organizationId: unknown): string {
  if (typeof organizationId !== 'string' || organizationId === '')
    throw new Error('package ' + packageId + ' has an absent or malformed organization mapping');
  return organizationId;
}

/** Validates owned parent correspondence before permission or DTO projection. */
export function readPackageTargetRow(
  row: PackageTargetRecord,
): Extract<AccessTarget, { kind: 'work_package' }> {
  if (typeof row.package_id !== 'string' || row.package_id === '')
    throw new Error('package target has an absent or malformed identity');
  const packageId = row.package_id;
  const organizationId = readPackageOrganization(packageId, row.organization_id);
  if (
    typeof row.project_id !== 'string' ||
    row.project_id === '' ||
    typeof row.parent_id !== 'string' ||
    row.parent_id !== row.project_id ||
    typeof row.parent_organization_id !== 'string' ||
    row.parent_organization_id !== organizationId
  )
    throw new Error('package ' + packageId + ' has an absent, malformed or foreign parent');
  if (row.actual_organization_id !== organizationId)
    throw new Error('package ' + packageId + ' has an absent organization ancestor');
  let spaceId: string | null;
  if (row.space_id === null) spaceId = null;
  else {
    if (
      typeof row.space_id !== 'string' ||
      row.space_id === '' ||
      row.actual_space_id !== row.space_id ||
      row.space_organization_id !== organizationId
    )
      throw new Error(
        'package ' + packageId + ' has an absent, malformed or foreign project space',
      );
    spaceId = row.space_id;
  }
  // Proof: with this guard removed, `throws on a package restricted flag
  // outside 0 and 1` resolved; watched 2026-11-08.
  if (row.restricted !== 0 && row.restricted !== 1)
    throw new Error(`restricted of package ${packageId} is ${String(row.restricted)}`);
  return {
    kind: 'work_package',
    chain: {
      level: 'work_package',
      organizationId,
      spaceId,
      projectId: row.project_id,
      workPackageId: packageId,
    },
    restricted: row.restricted === 1,
  };
}

/**
 * Reads account-reaching grants once for membership summaries. Every raw role is
 * validated before organization-kind projection; corruption at another scope is not
 * hidden. Only organization-scope provenance is returned, so no package ID escapes.
 */
export function readMemberAccessIn(
  db: Pick<Drizzle, 'all'>,
  organizationId: string,
  userId: string,
): { readonly effectiveRole: MemberEffectiveRole | null; readonly grantCount: number } {
  const subject: AccessSubject = { kind: 'account', accountId: userId };
  const records = db.all<JoinedGrantRoleRecord>(sql`WITH ${subjectRows(subject, organizationId)}
    SELECT g.id AS grant_id, g.scope_kind, g.scope_id, g.subject_kind, g.subject_id, g.role_id,
      r.id AS catalogue_id,r.object_kind, r.reaches_restricted, p.permission
    FROM subject s JOIN access_grant g ON g.subject_kind=s.kind AND g.subject_id=s.id
    /* Proof: member-summary-catalogue: removed/changed production boundary.
     * throws for an orphan target account grant before member summary projection
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    LEFT JOIN access_role r ON r.id=g.role_id
    LEFT JOIN access_role_permission p ON p.role_id=g.role_id
    WHERE g.organization_id=${organizationId} AND ${membershipHolds(subject, organizationId)}
    ORDER BY g.id,p.permission`);
  // Proof: member-summary-validate-all: removed/broken boundary failed `throws on corrupt nonorganization role rows before projecting member access`; named assertion RED and restored GREEN (task-2.5 guard-faults).
  reachingGrantsOf(records.map(readGrantRoleRow));
  // Proof: member-summary-role-kind: removed/broken boundary failed `reports organization-kind permission unions and distinct all-scope account grant counts`; named assertion RED and restored GREEN (task-2.5 guard-faults).
  const grants = reachingGrantsOf(
    records
      .filter(
        (record) =>
          record.scope_kind === 'organization' &&
          record.scope_id === organizationId &&
          record.object_kind === 'organization',
      )
      .map(readGrantRoleRow),
  );
  const permissions = new Set<Permission>();
  for (const grant of grants)
    for (const permission of grant.permissions) permissions.add(permission);
  return {
    // Proof: member-summary-distinct-count: removed/broken boundary failed `reports organization-kind permission unions and distinct all-scope account grant counts`; named assertion RED and restored GREEN (task-2.5 guard-faults).
    grantCount: new Set(records.map((record) => record.grant_id)).size,
    effectiveRole:
      grants.length === 0
        ? null
        : {
            permissions: [...permissions].sort(),
            via: grants.map(({ scopeKind, scopeId, subjectKind, subjectId, roleId }) => ({
              scopeKind,
              scopeId,
              subjectKind,
              subjectId,
              roleId,
            })),
          },
  };
}

/** Full organization-ancestor grant sets for P11; no target-kind filtering, P5 or cap. Caller admits the actual capped principal first. */
export function readGrantComparisonIn(
  db: Pick<Drizzle, 'all'>,
  principal: ScopedPrincipal,
  organizationId: string,
): ReadonlySet<Permission> {
  const subject = accessSubjectOf(principal);
  const records = db.all<JoinedGrantRoleRecord>(sql`WITH ${subjectRows(subject, organizationId)}
    SELECT g.id AS grant_id,g.scope_kind,g.scope_id,g.subject_kind,g.subject_id,g.role_id,
      r.id AS catalogue_id,r.object_kind,r.reaches_restricted,p.permission
    FROM subject s JOIN access_grant g ON g.subject_kind=s.kind AND g.subject_id=s.id
    /* Proof: comparison-catalogue: removed/changed production boundary.
     * throws for an orphan issuer grant even when valid current authority suffices
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    LEFT JOIN access_role r ON r.id=g.role_id LEFT JOIN access_role_permission p ON p.role_id=g.role_id
    /* Proof: initial-comparison-binding: canonical permission projection binding dependency; not scope-predicate removal or healthy-row isolation.
     * refuses the first permission missing from the full initial-role comparison set
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    WHERE g.organization_id=${organizationId} AND g.scope_kind='organization' AND g.scope_id=${organizationId}
      AND ${membershipHolds(subject, organizationId)} ORDER BY g.id,p.permission`);
  const permissions = new Set<Permission>();
  for (const grant of reachingGrantsOf(records.map(readGrantRoleRow)))
    for (const permission of grant.permissions) permissions.add(permission);
  return permissions;
}

/**
 * Classifies only the target account's direct organization-scope user grants.
 * Every selected role and complete permission set is validated before checking
 * catalogue kind; an orphan or malformed role cannot disappear as no holder.
 * Group/member-wide authority is outside this direct-holder rule.
 */
export function holdsDirectOrganizationRoleIn(
  db: Pick<Drizzle, 'all'>,
  organizationId: string,
  userId: string,
): boolean {
  const records =
    db.all<JoinedGrantRoleRecord>(sql`SELECT g.id AS grant_id,g.scope_kind,g.scope_id,g.subject_kind,g.subject_id,g.role_id,
  r.id AS catalogue_id,r.object_kind,r.reaches_restricted,p.permission
  /* Proof: direct-target-catalogue: removed/changed production boundary.
   * throws for target-only direct role catalogue missing before membership removal
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  FROM access_grant g LEFT JOIN access_role r ON r.id=g.role_id LEFT JOIN access_role_permission p ON p.role_id=g.role_id
  /* Proof: direct-target-user: direct-holder classification, not tenant isolation.
   * does not require organization-role permission for authority held only through a group
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  WHERE g.organization_id=${organizationId} AND g.subject_kind='user' AND g.subject_id=${userId}
    AND g.scope_kind='organization' AND g.scope_id=${organizationId} ORDER BY g.id,p.permission`);
  /* Proof: direct-target-permissions: removed/changed production boundary.
   * throws for target-only direct role catalogue kind before membership removal
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  reachingGrantsOf(records.map(readGrantRoleRow));
  /* Proof: direct-target-role-kind: removed/changed production boundary.
   * requires organization-role permission to remove a direct org-viewer holder
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  return records.some((record) => record.object_kind === 'organization');
}
