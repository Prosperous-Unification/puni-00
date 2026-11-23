import { and, count, eq, ne } from 'drizzle-orm';

import type { Drizzle } from './db';
import { accessGrant, organizationMembership } from './schema';

/** Modeled CP14 refusal, caught only after the owning transaction has rolled back. */
export class LastSuperAdmin extends Error {
  constructor() {
    super('organization requires a current direct built-in org-super-admin holder');
  }
}

/**
 * Counts only direct user built-in org-super-admin grants at this organization,
 * joined to current membership. Custom equivalents, groups and credentials do not count.
 * The caller owns the connection and must check after its writes, before commit.
 */
export function directSuperAdminCount(
  reader: Pick<Drizzle, 'select'>,
  organizationId: string,
  options: { readonly besides: string | null },
): number {
  // Proof: member-built-in-count: removed/broken boundary failed `rolls back removal of the final direct built-in holder despite custom equivalent authority`; named assertion RED and restored GREEN (task-2.5 guard-faults).
  const conditions = [
    eq(accessGrant.organizationId, organizationId),
    eq(accessGrant.scopeKind, 'organization'),
    /* Proof: counter-column-dependency: trusted-column availability/rollback; NOT a removed scope predicate or healthy-row isolation proof.
     * rolls final direct-holder removal back through the actual complete counter
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    eq(accessGrant.scopeId, organizationId),
    eq(accessGrant.subjectKind, 'user'),
    eq(accessGrant.roleId, 'org-super-admin'),
  ];
  if (options.besides !== null) conditions.push(ne(accessGrant.id, options.besides));
  const counted = reader
    .select({ holders: count() })
    .from(accessGrant)
    .innerJoin(
      organizationMembership,
      and(
        eq(organizationMembership.organizationId, accessGrant.organizationId),
        eq(organizationMembership.userId, accessGrant.subjectId),
      ),
    )
    .where(and(...conditions))
    .get();
  if (counted === undefined) throw new Error('a super-admin COUNT query answered no row');
  return counted.holders;
}

/** Throws a rollback refusal on zero; returning a value from a native owner would commit. */
export function requireSuperAdminIn(reader: Pick<Drizzle, 'select'>, organizationId: string): void {
  if (directSuperAdminCount(reader, organizationId, { besides: null }) === 0)
    throw new LastSuperAdmin();
}
