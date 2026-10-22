import type {
  AuditedAct,
  ConsentAgent,
  ConsentCredentialDraft,
  ConsentCredentials,
  ConsentEndOutcome,
  ConsentMintRefusal,
} from '@wbs/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { writeImmediately } from './immediate-write';
import { roleIn } from './organization';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import { machineCredential, person, personOrganization } from './schema';

/** {@link ConsentCredentials} over the shared database. */
export class ConsentCredentialRepository implements ConsentCredentials {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  async agentsBoundTo(userId: string, organizationId: string): Promise<readonly ConsentAgent[]> {
    await Promise.resolve();
    return this.db
      .select({ personId: person.id, name: person.name })
      .from(person)
      .innerJoin(personOrganization, eq(personOrganization.resourceId, person.id))
      .where(
        and(
          eq(personOrganization.organizationId, organizationId),
          eq(person.kind, 'agent'),
          // Proof: with this predicate removed, `lists only the agents bound
          // to the token's account` in `mcp-delegation.boot.db.test.ts`
          // offered ada grace's agent; watched 2026-10-22.
          eq(person.accountId, userId),
        ),
      )
      .orderBy(asc(person.name), asc(person.id))
      .all();
  }

  mint(
    organizationId: string,
    userId: string,
    draft: ConsentCredentialDraft,
    act: AuditedAct,
  ): Promise<'minted' | ConsentMintRefusal> {
    return writeImmediately(this.db, this.gate, (tx) => {
      if (readOrganizationActivation(tx) !== 'activated') return 'inactive';
      if (roleIn(tx, organizationId, userId) === null) return 'not_a_member';
      const agent = tx
        .select({ id: person.id })
        .from(person)
        .innerJoin(personOrganization, eq(personOrganization.resourceId, person.id))
        .where(
          and(
            eq(person.id, draft.personId),
            eq(personOrganization.organizationId, organizationId),
            eq(person.kind, 'agent'),
            // Proof: with this predicate removed, `refuses a mint for another
            // account's agent, storing nothing` in
            // `mcp-delegation.boot.db.test.ts` minted ada a credential for
            // grace's agent; watched 2026-10-22.
            eq(person.accountId, userId),
          ),
        )
        .get();
      if (agent === undefined) return 'person_not_bound';
      tx.insert(machineCredential)
        .values({
          id: draft.id,
          organizationId,
          personId: draft.personId,
          issuedBy: userId,
          source: 'mcp_consent',
          name: draft.name,
          mcpFamilyId: draft.familyId,
          ...auditOnCreate(act.stamp),
        })
        .run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'machine_credential_created',
        subjectKind: 'machine_credential',
        subjectId: draft.id,
        detail: { source: 'mcp_consent', personId: draft.personId, issuedBy: userId, issuer: null },
        at: act.stamp.at,
      });
      return 'minted' as const;
    });
  }

  end(credentialId: string, familyId: string, act: AuditedAct): Promise<ConsentEndOutcome> {
    return writeImmediately(this.db, this.gate, (tx) => {
      const row = tx
        .select()
        .from(machineCredential)
        .where(
          and(
            eq(machineCredential.id, credentialId),
            eq(machineCredential.source, 'mcp_consent'),
            // Proof: with this predicate removed, `ignores an end report that
            // names another family` in `mcp-delegation.boot.db.test.ts`
            // revoked the credential; watched 2026-10-22.
            eq(machineCredential.mcpFamilyId, familyId),
          ),
        )
        .get();
      if (row === undefined) return 'absent';
      if (row.revokedAt !== null) return 'already_revoked';
      const at = act.stamp.at;
      tx.update(machineCredential)
        .set({ revokedAt: at, ...auditOnUpdate(act.stamp) })
        .where(and(eq(machineCredential.id, credentialId), isNull(machineCredential.revokedAt)))
        .run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId: row.organizationId,
        actorId: act.actor,
        action: 'machine_credential_revoked',
        subjectKind: 'machine_credential',
        subjectId: credentialId,
        detail: {
          source: 'mcp_consent',
          personId: row.personId,
          issuedBy: row.issuedBy,
          issuer: null,
          endedBy: 'mcp_family_end',
        },
        at,
      });
      return 'revoked' as const;
    });
  }
}
