import {
  type AgentPoolActorRefusal,
  type AgentPoolAgent,
  type AgentPoolDraft,
  type AgentPoolKeyDraft,
  agentPoolPersonName,
  type AgentPoolRenewal,
  type AgentPools,
  type AgentPoolSummary,
  type AuditedAct,
  MOST_AGENT_POOL_SIZE,
} from '@wbs/core';
import { type OrganizationLimitValues, refuseLimit } from '@wbs/domain';
import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { endLeasesOfUncredentialed } from './claim';
import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import {
  liveMachineSecretsOf,
  machineCredentialAuditDetail,
  machineCredentialSummaryOf,
} from './machine-credential-administration';
import { roleIn } from './organization';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import { checkedLimits, readAgentPersonCapIn } from './organization-limits';
import {
  agentPool,
  type AgentPoolRow,
  machineCredential,
  machineCredentialSecret,
  person,
  personOrganization,
} from './schema';

type Transaction = ImmediateTransaction;

const DIGEST = /^[0-9a-f]{64}$/;

/**
 * Null when the actor may administer `organizationId`'s pools now, else why
 * not: `inactive` before activation, `forbidden` for anyone but a current
 * `admin` or `super_admin`. Read inside the caller's transaction.
 *
 * Proof: with `admin` and `super_admin` widened to every member role here,
 * `refuses a member and a viewer forbidden, writing nothing` in
 * `agent-pool.controller.db.test.ts` created the member's pool (201); watched
 * 2026-10-28.
 */
function poolAdministratorRefusal(
  tx: Transaction,
  organizationId: string,
  actorId: string,
): AgentPoolActorRefusal | null {
  if (readOrganizationActivation(tx) !== 'activated') return 'inactive';
  const role = roleIn(tx, organizationId, actorId);
  return role === 'admin' || role === 'super_admin' ? null : 'forbidden';
}

/** @throws when a stored pool's times or size are not what a writer stores. */
function checkedPool(row: AgentPoolRow): Omit<AgentPoolSummary, 'credentials'> {
  for (const value of [row.expiresAt, row.revokedAt, row.createdAt])
    if (value !== null && !Number.isSafeInteger(value))
      throw new Error(`agent pool ${row.id} has a malformed time`);
  if (!Number.isSafeInteger(row.size) || row.size < 1 || row.size > MOST_AGENT_POOL_SIZE)
    throw new Error(`agent pool ${row.id} has a malformed size`);
  if (row.createdBy === null) throw new Error(`agent pool ${row.id} has no creator`);
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

/** The live pool `poolId` of `organizationId`, else undefined. */
function livePool(
  tx: Transaction,
  organizationId: string,
  poolId: string,
): AgentPoolRow | undefined {
  return tx
    .select()
    .from(agentPool)
    .where(
      and(
        eq(agentPool.id, poolId),
        eq(agentPool.organizationId, organizationId),
        isNull(agentPool.revokedAt),
      ),
    )
    .get();
}

/**
 * The persons `poolId`'s credentials name that still exist, with their
 * organization-local names, in name order: every such person for a
 * revocation (`'any'`), only those holding a live pool credential for a
 * re-key (`'live'`), so an agent whose key an admin revoked alone is not
 * re-armed (M7).
 */
function poolPersons(
  tx: Transaction,
  organizationId: string,
  poolId: string,
  holding: 'any' | 'live',
): { personId: string; personName: string }[] {
  return tx
    .selectDistinct({ personId: machineCredential.personId, personName: personOrganization.name })
    .from(machineCredential)
    .innerJoin(
      personOrganization,
      and(
        eq(personOrganization.resourceId, machineCredential.personId),
        eq(personOrganization.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(machineCredential.agentPoolId, poolId),
        // Proof: with this filter dropped (every pool person re-keyed),
        // `re-keys only the agents holding a live pool key` in
        // `agent-pool.controller.db.test.ts` answered three keys for a pool
        // whose second key an admin had revoked alone; watched 2026-10-28.
        holding === 'live' ? isNull(machineCredential.revokedAt) : undefined,
      ),
    )
    .orderBy(asc(personOrganization.name), asc(machineCredential.personId))
    .all();
}

/** The live credentials of `poolId`, oldest first. */
function livePoolCredentials(tx: Transaction, poolId: string) {
  return tx
    .select()
    .from(machineCredential)
    .where(and(eq(machineCredential.agentPoolId, poolId), isNull(machineCredential.revokedAt)))
    .orderBy(asc(machineCredential.createdAt), asc(machineCredential.id))
    .all();
}

/** Whether any of `names` is held by an organization person or a live credential. */
function isAnyNameHeld(tx: Transaction, organizationId: string, names: readonly string[]): boolean {
  const heldPerson = tx
    .select({ id: personOrganization.resourceId })
    .from(personOrganization)
    .where(
      and(
        eq(personOrganization.organizationId, organizationId),
        inArray(personOrganization.name, [...names]),
      ),
    )
    .get();
  if (heldPerson !== undefined) return true;
  const credential = tx
    .select({ id: machineCredential.id })
    .from(machineCredential)
    .where(
      and(
        eq(machineCredential.organizationId, organizationId),
        inArray(machineCredential.name, [...names]),
        isNull(machineCredential.revokedAt),
      ),
    )
    .get();
  return credential !== undefined;
}

/**
 * Inserts one API key of `poolId` for `key.personId`, named `name`, with its
 * `machine_credential_created` row.
 */
function issuePoolKey(
  tx: Transaction,
  organizationId: string,
  actorId: string,
  poolId: string,
  key: AgentPoolKeyDraft,
  name: string,
  act: AuditedAct,
): void {
  tx.insert(machineCredential)
    .values({
      id: key.credentialId,
      organizationId,
      personId: key.personId,
      issuedBy: actorId,
      source: 'api_key',
      name,
      agentPoolId: poolId,
      ...auditOnCreate(act.stamp),
    })
    .run();
  tx.insert(machineCredentialSecret)
    .values({
      id: key.secretId,
      credentialId: key.credentialId,
      digest: key.digest,
      ...auditOnCreate(act.stamp),
    })
    .run();
  const row = tx
    .select()
    .from(machineCredential)
    .where(eq(machineCredential.id, key.credentialId))
    .get();
  if (row === undefined) throw new Error(`pool key ${key.credentialId} vanished inside its write`);
  appendOrganizationAudit(tx, {
    id: crypto.randomUUID(),
    organizationId,
    actorId: act.actor,
    action: 'machine_credential_created',
    subjectKind: 'machine_credential',
    subjectId: key.credentialId,
    detail: { ...machineCredentialAuditDetail(row, key.secretId), agentPoolId: poolId },
    at: act.stamp.at,
  });
}

/**
 * Revokes `rows`, live credentials of `poolId`, at `act.stamp.at`, ending
 * every secret of each, with one `machine_credential_revoked` row each.
 * Leases are the caller's: a re-key keeps them, a pool revocation ends them.
 */
function revokePoolKeys(
  tx: Transaction,
  organizationId: string,
  poolId: string,
  rows: ReturnType<typeof livePoolCredentials>,
  act: AuditedAct,
): void {
  const at = act.stamp.at;
  for (const row of rows) {
    tx.update(machineCredential)
      .set({ revokedAt: at, ...auditOnUpdate(act.stamp) })
      .where(eq(machineCredential.id, row.id))
      .run();
    tx.update(machineCredentialSecret)
      .set({ expiresAt: at, ...auditOnUpdate(act.stamp) })
      .where(
        and(
          eq(machineCredentialSecret.credentialId, row.id),
          // A rotated key's older secret ends now too, not at its window's end.
          or(isNull(machineCredentialSecret.expiresAt), gt(machineCredentialSecret.expiresAt, at)),
        ),
      )
      .run();
    appendOrganizationAudit(tx, {
      id: crypto.randomUUID(),
      organizationId,
      actorId: act.actor,
      action: 'machine_credential_revoked',
      subjectKind: 'machine_credential',
      subjectId: row.id,
      detail: { ...machineCredentialAuditDetail(row, null), agentPoolId: poolId },
      at,
    });
  }
}

/** @throws on a digest that is not lowercase hex SHA-256, before anything is read. */
function assertDigests(keys: readonly AgentPoolKeyDraft[]): void {
  for (const key of keys)
    if (!DIGEST.test(key.digest)) throw new Error('agent pool key digest is malformed');
}

/** {@link AgentPools} over the shared database. */
export class AgentPoolRepository implements AgentPools {
  private readonly defaults: OrganizationLimitValues;

  /** @throws when `defaults` are outside the bounds an organization may hold. */
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
    defaults: OrganizationLimitValues,
  ) {
    this.defaults = checkedLimits(defaults, 'the deployment default');
  }

  async list(
    organizationId: string,
    actorId: string,
    at: number,
  ): Promise<readonly AgentPoolSummary[] | AgentPoolActorRefusal> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const refused = poolAdministratorRefusal(tx, organizationId, actorId);
      if (refused !== null) return refused;
      const pools = tx
        .select()
        .from(agentPool)
        .where(eq(agentPool.organizationId, organizationId))
        .orderBy(asc(agentPool.createdAt), asc(agentPool.id))
        .all();
      return pools.map((row) => {
        const credentials = livePoolCredentials(tx, row.id);
        const secrets = liveMachineSecretsOf(
          tx,
          credentials.map((each) => each.id),
          at,
        );
        return {
          ...checkedPool(row),
          credentials: credentials.map((each) =>
            machineCredentialSummaryOf(each, secrets.get(each.id) ?? []),
          ),
        };
      });
    });
  }

  /**
   * Proof: with the cap read before the write turn (outside this transaction)
   * and decided inside it, `never holds more agent persons than the cap,
   * however pool creations race` (agent-pool.db.test.ts, `fc.asyncModelRun`,
   * seed 20261028) failed on `[CreateRacing(3, 6)]`: the second racer
   * answered `created` where the model expected `agent_person_limit`, 9
   * agents of 8; watched 2026-10-28.
   */
  create(
    organizationId: string,
    actorId: string,
    draft: AgentPoolDraft,
    act: AuditedAct,
  ): ReturnType<AgentPools['create']> {
    const size = draft.agents.length;
    if (size < 1 || size > MOST_AGENT_POOL_SIZE)
      throw new Error(`an agent pool of ${String(size)} agents is outside its bounds`);
    assertDigests(draft.agents);
    return this.write((tx) => {
      const refused = poolAdministratorRefusal(tx, organizationId, actorId);
      if (refused !== null) return { kind: refused };
      const named = tx
        .select({ id: agentPool.id })
        .from(agentPool)
        .where(
          and(
            eq(agentPool.organizationId, organizationId),
            eq(agentPool.name, draft.name),
            isNull(agentPool.revokedAt),
          ),
        )
        .get();
      if (named !== undefined) return { kind: 'name_taken' };
      const names = draft.agents.map((_, index) => agentPoolPersonName(draft.name, index));
      if (isAnyNameHeld(tx, organizationId, names)) return { kind: 'name_taken' };
      // `addPerson`'s own decision over the same reading, once for the pool.
      // Proof: with this refusal disabled, `refuses a pool crossing the
      // agent-person cap, naming the cap and count, writing nothing`
      // (agent-pool.controller.db.test.ts) answered 201 with the keys
      // instead of 409; watched 2026-10-28.
      const crossed = refuseLimit({
        ...readAgentPersonCapIn(tx, organizationId, this.defaults),
        added: size,
      });
      if (crossed !== null) return { kind: 'agent_person_limit', ...crossed };
      tx.insert(agentPool)
        .values({
          id: draft.id,
          organizationId,
          name: draft.name,
          size,
          expiresAt: draft.expiresAt,
          ...auditOnCreate(act.stamp),
        })
        .run();
      const agents: AgentPoolAgent[] = [];
      for (const [index, key] of draft.agents.entries()) {
        const personName = agentPoolPersonName(draft.name, index);
        // The root's name is its own opaque id, as `addPersonWithin` gives
        // every scoped person; the organization knows it by `personName`.
        tx.insert(person)
          .values({
            id: key.personId,
            name: key.personId,
            kind: 'agent',
            accountId: actorId,
            ...auditOnCreate(act.stamp),
          })
          .run();
        // The side table carries no audit columns: written as `mapInOrganization` writes it.
        tx.run(
          sql`INSERT INTO person_organization (resource_id, organization_id, name) VALUES (${key.personId}, ${organizationId}, ${personName})`,
        );
        issuePoolKey(tx, organizationId, actorId, draft.id, key, personName, act);
        agents.push({ personId: key.personId, personName, credentialId: key.credentialId });
      }
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'agent_pool_created',
        subjectKind: 'agent_pool',
        subjectId: draft.id,
        detail: {
          size,
          expiresAt: draft.expiresAt,
          personIds: agents.map((each) => each.personId),
          credentialIds: agents.map((each) => each.credentialId),
        },
        at: act.stamp.at,
      });
      const pool = livePool(tx, organizationId, draft.id);
      if (pool === undefined) throw new Error(`agent pool ${draft.id} vanished inside its write`);
      return { kind: 'created', issued: { pool: checkedPool(pool), agents } } as const;
    });
  }

  async personsOf(
    organizationId: string,
    actorId: string,
    poolId: string,
  ): ReturnType<AgentPools['personsOf']> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const refused = poolAdministratorRefusal(tx, organizationId, actorId);
      if (refused !== null) return refused;
      if (livePool(tx, organizationId, poolId) === undefined) return 'not_found';
      return poolPersons(tx, organizationId, poolId, 'live');
    });
  }

  rekey(
    organizationId: string,
    actorId: string,
    poolId: string,
    renewal: AgentPoolRenewal,
    act: AuditedAct,
  ): ReturnType<AgentPools['rekey']> {
    const { keys } = renewal;
    assertDigests(keys);
    return this.write((tx) => {
      const refused = poolAdministratorRefusal(tx, organizationId, actorId);
      if (refused !== null) return { kind: refused };
      const found = livePool(tx, organizationId, poolId);
      if (found === undefined) return { kind: 'not_found' };
      // Proof: with this refusal disabled, `refuses re-keying an expired pool
      // unless a new expiry is given` (agent-pool.controller.db.test.ts) got
      // keys no admission would accept instead of 409; watched 2026-10-28.
      if (
        renewal.expiresAt === undefined &&
        found.expiresAt !== null &&
        found.expiresAt <= act.stamp.at
      )
        return { kind: 'pool_expired' };
      const pool =
        renewal.expiresAt === undefined ? found : { ...found, expiresAt: renewal.expiresAt };
      const persons = poolPersons(tx, organizationId, poolId, 'live');
      // Exactly the pool's persons, each once: a re-key never creates or
      // adds a person (M7), and never leaves one keyless.
      // Proof: with this refusal disabled, `refuses keys that do not name
      // exactly the pool's persons, writing nothing` (agent-pool.db.test.ts)
      // answered the one-person key set `rekeyed`; watched 2026-10-28.
      const wanted = new Set(persons.map((each) => each.personId));
      const named = new Set(keys.map((each) => each.personId));
      if (
        named.size !== keys.length ||
        named.size !== wanted.size ||
        [...named].some((each) => !wanted.has(each))
      )
        return { kind: 'pool_changed' };
      revokePoolKeys(tx, organizationId, poolId, livePoolCredentials(tx, poolId), act);
      const nameOf = new Map(persons.map((each) => [each.personId, each.personName]));
      const agents: AgentPoolAgent[] = [];
      for (const key of keys) {
        const personName = nameOf.get(key.personId);
        if (personName === undefined) throw new Error(`pool person ${key.personId} vanished`);
        issuePoolKey(tx, organizationId, actorId, poolId, key, personName, act);
        agents.push({ personId: key.personId, personName, credentialId: key.credentialId });
      }
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'agent_pool_rekeyed',
        subjectKind: 'agent_pool',
        subjectId: poolId,
        detail: { credentialIds: agents.map((each) => each.credentialId) },
        at: act.stamp.at,
      });
      tx.update(agentPool)
        .set({
          ...(renewal.expiresAt === undefined ? {} : { expiresAt: renewal.expiresAt }),
          ...auditOnUpdate(act.stamp),
        })
        .where(eq(agentPool.id, poolId))
        .run();
      agents.sort((a, b) => (a.personName < b.personName ? -1 : 1));
      return { kind: 'rekeyed', issued: { pool: checkedPool(pool), agents } } as const;
    });
  }

  revoke(
    organizationId: string,
    actorId: string,
    poolId: string,
    act: AuditedAct,
  ): ReturnType<AgentPools['revoke']> {
    return this.write((tx) => {
      const refused = poolAdministratorRefusal(tx, organizationId, actorId);
      if (refused !== null) return { kind: refused };
      if (livePool(tx, organizationId, poolId) === undefined) return { kind: 'not_found' };
      const at = act.stamp.at;
      const live = livePoolCredentials(tx, poolId);
      // Proof: with the first live credential left out of this revocation,
      // `revokes every key of the pool, ending their leases…` in
      // `agent-pool.controller.db.test.ts` kept that agent's claim through
      // the sweep; watched 2026-10-28.
      revokePoolKeys(tx, organizationId, poolId, live, act);
      const personIds = poolPersons(tx, organizationId, poolId, 'any').map((each) => each.personId);
      // Each person's last live credential takes its leases with it (L8); a
      // pool person also keyed alone keeps them.
      for (const personId of personIds) endLeasesOfUncredentialed(tx, personId, at);
      tx.update(agentPool)
        .set({ revokedAt: at, ...auditOnUpdate(act.stamp) })
        .where(eq(agentPool.id, poolId))
        .run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'agent_pool_revoked',
        subjectKind: 'agent_pool',
        subjectId: poolId,
        detail: { credentialIds: live.map((each) => each.id), personIds },
        at,
      });
      return { kind: 'revoked', revokedCredentials: live.length, personIds } as const;
    });
  }

  private write<T>(work: (tx: Transaction) => T): Promise<T> {
    return writeImmediately(this.db, this.gate, work);
  }
}
