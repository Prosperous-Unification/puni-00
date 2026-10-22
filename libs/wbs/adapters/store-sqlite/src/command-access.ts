import type {
  CommandAccess,
  CommandCaller,
  OrganizationAccess,
  OrganizationAccessResolution,
} from '@wbs/core';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { readOrganizationActivation } from './organization-activation';

/** Current command authority over the same database and browser verifier as request admission. */
export class SqliteCommandAccess implements CommandAccess {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly organizations: OrganizationAccess,
  ) {}

  async resolve(caller: CommandCaller): Promise<OrganizationAccessResolution> {
    if (caller.kind === 'legacy') {
      // Proof: forcing pre-activation admitted the explicit legacy runner after durable activation (current-authority HTTP suite).
      return readOrganizationActivation(this.db) === 'pre_activation'
        ? { ok: true, access: { kind: 'legacy' } }
        : { ok: false, refusal: 'no_active_organization' };
    }
    const resolved = await this.organizations.resolve(caller.principal);
    if (!resolved.ok) return resolved;
    const expected = caller.expectedAccess;
    const current = resolved.access;
    // Proof: independently bypassing kind, organization and expected user equality made their direct-runner context assertions receive ok:true.
    // The current user check is defensive redundancy: SqliteOrganizationAccess derives it from the principal.
    if (
      current.kind !== expected.kind ||
      (current.kind === 'scoped' &&
        (expected.kind !== 'scoped' ||
          current.scope.organizationId !== expected.scope.organizationId ||
          expected.scope.userId !== caller.principal.id ||
          current.scope.userId !== caller.principal.id))
    )
      return { ok: false, refusal: 'organization_context_changed' };
    return resolved;
  }
}
