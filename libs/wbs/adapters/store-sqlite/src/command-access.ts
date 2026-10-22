import type {
  CommandAccess,
  CommandCaller,
  MachineCredentials,
  OrganizationAccess,
  OrganizationAccessResolution,
} from '@wbs/core';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { readOrganizationActivation } from './organization-activation';

/**
 * Current command authority over the same database and browser verifier as request admission.
 * The required credential reader must share this database; its read runs inside the held writer
 * turn and must never reacquire the writer or consume delegation evidence.
 * A changed machine/consent binding refuses the retained operation as a context conflict.
 * This row check does not revalidate verifier expiry or API secret rotation windows.
 *
 * @throws when trusted credential storage cannot be read or validated.
 */
export class SqliteCommandAccess implements CommandAccess {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly organizations: OrganizationAccess,
    private readonly credentials: Pick<MachineCredentials, 'findById'>,
  ) {}

  async resolve(caller: CommandCaller): Promise<OrganizationAccessResolution> {
    if (caller.kind === 'legacy') {
      // Proof: forcing pre-activation admitted the explicit legacy runner after durable activation (current-authority HTTP suite).
      return readOrganizationActivation(this.db) === 'pre_activation'
        ? { ok: true, access: { kind: 'legacy' } }
        : { ok: false, refusal: 'no_active_organization' };
    }
    const { principal } = caller;
    const authentication = principal.authentication;
    if (authentication?.kind === 'machine' || authentication?.kind === 'consent') {
      const credential = await this.credentials.findById(authentication.credentialId);
      const context = principal.delegation;
      // Proof: independently bypassing missing/revoked/person/account/context/organization,
      // machine source, consent source/direct/family checks failed their mounted
      // `direct runner refuses current credential` cases (2026-10-22). Null/unbound
      // account has its own negative; bypassing the read failed all four
      // `throws on trusted credential` cases (absent/unreadable table, malformed source/time).
      if (credential === null || context === undefined)
        return { ok: false, refusal: 'organization_context_changed' };
      if (
        credential.revokedAt !== null ||
        credential.personId !== authentication.personId ||
        credential.boundAccountId !== principal.id ||
        credential.organizationId !== context.organizationId ||
        (authentication.kind === 'machine'
          ? credential.source === 'mcp_consent'
          : credential.source !== 'mcp_consent' ||
            (context.audience === 'wbs-be-01/direct'
              ? true
              : credential.mcpFamilyId !== context.grant))
      )
        return { ok: false, refusal: 'organization_context_changed' };
    }
    const resolved = await this.organizations.resolve(principal);
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
