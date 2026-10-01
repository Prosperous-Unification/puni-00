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
        const known: readonly string[] = ORGANIZATION_ROLES;
        // Proof: the malformed-role mounted fault must throw rather than
        // advertise a role whose authority the policy cannot interpret.
        for (const row of rows)
          if (!known.includes(row.role))
            throw new Error(
              `membership in organization "${row.organizationId}" has a malformed role`,
            );
        return rows;
      }),
    );
  }
}
