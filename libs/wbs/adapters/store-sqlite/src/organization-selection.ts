import { ORGANIZATION_ROLES, type OrganizationRole } from '@wbs/domain';
import { eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { readOrganizationActivation } from './organization-activation';
import { organization, organizationMembership } from './schema';

export interface SelectableMembership {
  readonly organizationId: string;
  readonly name: string;
  readonly role: OrganizationRole;
}

/** Current membership choices and durable activation, read in one snapshot. */
export class SqliteOrganizationSelection {
  constructor(private readonly db: SQLiteBunDatabase) {}

  list(userId: string): Promise<'inactive' | readonly SelectableMembership[]> {
    return Promise.resolve(
      this.db.transaction((tx) => {
        // Proof: bypassing marker admission made the mounted selection test
        // disclose choices before activation instead of onboarding_inactive.
        if (readOrganizationActivation(tx) === 'pre_activation') return 'inactive';
        const rows = tx
          .select({
            organizationId: organizationMembership.organizationId,
            name: organization.name,
            role: organizationMembership.role,
          })
          .from(organizationMembership)
          .innerJoin(organization, eq(organization.id, organizationMembership.organizationId))
          .where(eq(organizationMembership.userId, userId))
          .orderBy(organizationMembership.organizationId)
          .all();
        for (const row of rows) validateMembershipLabel(row.role, row.organizationId);
        return rows;
      }),
    );
  }
}

/** A compatibility label for explicit display only; never grant or credential evidence. */
export function validateMembershipLabel(label: string, organizationId: string): OrganizationRole {
  const known: readonly string[] = ORGANIZATION_ROLES;
  // Proof: display-label-validator; skipped the explicit display-label validator.
  // 'refuses a malformed compatibility label at the explicit memberships display boundary' (organization-authorization.db.test.ts) failed; restored GREEN, 2026-11-10.
  // 'refuses a malformed compatibility label at the explicit onboarding display boundary' (organization-authorization.db.test.ts) failed; restored GREEN, 2026-11-10.
  // 'refuses a malformed compatibility label at the explicit selection display boundary' (organization-authorization.db.test.ts) failed; restored GREEN, 2026-11-10.
  if (!known.includes(label))
    throw new Error(`membership in organization "${organizationId}" has a malformed role`);
  // The finite compatibility vocabulary above establishes the display DTO boundary.
  return label as OrganizationRole;
}
