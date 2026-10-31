import { createAgentPool, listAgentPools, rekeyAgentPool, revokeAgentPool } from '@wbs/contracts';

import type { PlanCommandRunner } from '../module/plan-commands/plan-commands.feature';
import {
  type AgentPoolIssued,
  type AgentPoolKeyDraft,
  type AgentPools,
  isAgentPoolExpiryWithinBounds,
  mcpResourceOfAuthorizationServer,
} from '../ports/agent-pools';
import type { Clock } from '../ports/clock';
import type { OrganizationAccess } from '../ports/organization-access';
import { type AuditedAct, isSecretShaped } from '../ports/organization-audit';
import { digestMachineSecret, newMachineKey } from '../service/machine-key';
import { bind, type HttpReply } from './endpoint';
import { activeAudienceRoot, sessionOrganizationOf } from './machine-credential.routes';
import { organizationRefusal } from './organization-refusal';

const forbidden = { ok: false, status: 403, body: { error: 'forbidden' } } as const;
const notFound = { ok: false, status: 404, body: { error: 'not_found' } } as const;
const invalidBody = { ok: false, status: 400, body: { error: 'invalid_body' } } as const;

/** One minted key: what the store keeps (`draft`) and the key the caller is shown once. */
interface MintedKey {
  readonly draft: AgentPoolKeyDraft;
  readonly key: string;
}

/** A fresh API key for `personId`: ids and secret minted here, only the digest handed on. */
async function mintKey(personId: string): Promise<MintedKey> {
  // `parseMachineKey` accepts only this UUID shape (task 2.5 of
  // `wbs-machine-credentials`), and the table's triggers refuse every other.
  const credentialId = crypto.randomUUID();
  const { key, secret } = newMachineKey(credentialId);
  return {
    draft: {
      personId,
      credentialId,
      secretId: crypto.randomUUID(),
      digest: await digestMachineSecret(secret),
    },
    key,
  };
}

/**
 * The keys document ({@link agentPoolKeys} in `@wbs/contracts`): the only
 * place a pool's keys ever appear.
 *
 * @throws when the store answered an agent no key was minted for.
 */
function keysDocument(
  organizationId: string,
  issued: AgentPoolIssued,
  minted: readonly MintedKey[],
  issuedAt: number,
  authorizationServer: string,
) {
  const keyOf = new Map(minted.map((each) => [each.draft.credentialId, each.key]));
  return {
    format: 'wbs-agent-pool-keys' as const,
    version: 1 as const,
    organizationId,
    authorizationServer,
    mcpResource: mcpResourceOfAuthorizationServer(authorizationServer),
    poolId: issued.pool.id,
    name: issued.pool.name,
    expiresAt: issued.pool.expiresAt,
    issuedAt,
    agents: issued.agents.map((agent) => {
      const key = keyOf.get(agent.credentialId);
      if (key === undefined) throw new Error(`no key was minted for ${agent.credentialId}`);
      return { ...agent, key };
    }),
  };
}

/**
 * Agent pools (`wbs-mcp-agent-surface` M7) for the active organization's
 * admins, from a browser session only: a delegation, a grant or a machine
 * credential's direct context is `insufficient_scope`, so a machine never
 * mints, re-keys or revokes agents (A12, A23). The store rechecks activation
 * and the admin role in each act's own transaction. The keys are minted here,
 * answered once in the response and handed to the store only as digests;
 * nothing here logs a key or a request body.
 */
export function agentPoolRoutes(
  organizations: OrganizationAccess,
  pools: AgentPools,
  runner: Pick<PlanCommandRunner, 'runDirectoryWithin'>,
  audienceRoot: string | null,
  clock: Pick<Clock, 'now'>,
  afterRevoke: () => void,
) {
  const act = (actorId: string): AuditedAct => ({
    stamp: { at: clock.now(), by: actorId },
    actor: actorId,
    auditId: crypto.randomUUID(),
  });
  return [
    bind(listAgentPools, async ({ principal }): Promise<HttpReply<typeof listAgentPools>> => {
      const organizationId = await sessionOrganizationOf(organizations, principal);
      if (typeof organizationId !== 'string') return organizationId;
      const listed = await pools.list(organizationId, principal.id, clock.now());
      if (listed === 'inactive') return organizationRefusal('no_active_organization');
      if (listed === 'forbidden') return forbidden;
      return {
        ok: true,
        status: 200,
        body: {
          pools: listed.map((pool) => ({
            ...pool,
            credentials: pool.credentials.map((each) => ({
              ...each,
              secrets: [...each.secrets],
            })),
          })),
        },
      };
    }),
    bind(
      createAgentPool,
      async ({ principal, body }): Promise<HttpReply<typeof createAgentPool>> => {
        // Free text never reaches an audit detail, but a name shaped like a
        // key would be read as one wherever the pool is shown.
        if (isSecretShaped(body.name)) return invalidBody;
        const now = clock.now();
        // Proof: with the upper bound removed, `refuses a size of 0 or 101, an
        // oidc source, a past expiry or one past 90 days, writing nothing`
        // (agent-pool.controller.db.test.ts) created the 91-day pool (201);
        // watched 2026-10-28.
        if (body.expiresAt !== undefined && !isAgentPoolExpiryWithinBounds(body.expiresAt, now))
          return invalidBody;
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const minted = await Promise.all(
          Array.from({ length: body.size }, () => mintKey(crypto.randomUUID())),
        );
        const poolId = crypto.randomUUID();
        const stamped = act(principal.id);
        const created = await pools.create(
          organizationId,
          principal.id,
          {
            id: poolId,
            name: body.name,
            expiresAt: body.expiresAt ?? null,
            agents: minted.map((each) => each.draft),
          },
          stamped,
        );
        switch (created.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'name_taken':
            return { ok: false, status: 409, body: { error: 'name_taken' } };
          case 'agent_person_limit':
            return {
              ok: false,
              status: 409,
              body: {
                error: 'agent_person_limit',
                cap: created.cap,
                current: created.current,
                added: created.added,
              },
            };
          case 'created':
            return {
              ok: true,
              status: 201,
              body: keysDocument(
                organizationId,
                created.issued,
                minted,
                stamped.stamp.at,
                activeAudienceRoot(audienceRoot),
              ),
            };
        }
      },
    ),
    bind(
      rekeyAgentPool,
      async ({ principal, params, body }): Promise<HttpReply<typeof rekeyAgentPool>> => {
        // The same bound as a new pool's.
        // Proof: with this check removed, `re-keys an expired pool with a new
        // expiry within 90 days, and refuses one past them` in
        // `agent-pool.controller.db.test.ts` answered 201 instead of 400;
        // watched 2026-10-28.
        if (
          body.expiresAt !== undefined &&
          !isAgentPoolExpiryWithinBounds(body.expiresAt, clock.now())
        )
          return invalidBody;
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const persons = await pools.personsOf(organizationId, principal.id, params.id);
        if (persons === 'inactive') return organizationRefusal('no_active_organization');
        if (persons === 'forbidden') return forbidden;
        if (persons === 'not_found') return notFound;
        const minted = await Promise.all(persons.map((each) => mintKey(each.personId)));
        const stamped = act(principal.id);
        const rekeyed = await pools.rekey(
          organizationId,
          principal.id,
          params.id,
          {
            keys: minted.map((each) => each.draft),
            ...(body.expiresAt === undefined ? {} : { expiresAt: body.expiresAt }),
          },
          stamped,
        );
        switch (rekeyed.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'not_found':
            return notFound;
          case 'pool_changed':
          case 'pool_expired':
            return { ok: false, status: 409, body: { error: rekeyed.kind } };
          case 'rekeyed':
            return {
              ok: true,
              status: 201,
              body: keysDocument(
                organizationId,
                rekeyed.issued,
                minted,
                stamped.stamp.at,
                activeAudienceRoot(audienceRoot),
              ),
            };
        }
      },
    ),
    bind(
      revokeAgentPool,
      async ({ principal, params, query }): Promise<HttpReply<typeof revokeAgentPool>> => {
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const revoked = await pools.revoke(
          organizationId,
          principal.id,
          params.id,
          act(principal.id),
        );
        switch (revoked.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'not_found':
            return notFound;
          case 'revoked':
            break;
        }
        // The revocation ended the leases of every person it left with no
        // live credential; the claims go on the tick this asks for
        // (`wbs-claim-leases` L8).
        afterRevoke();
        const answer = {
          poolId: params.id,
          revokedCredentials: revoked.revokedCredentials,
          removedPersons: 0,
        };
        if (query.removePersons !== 'true' || revoked.personIds.length === 0)
          return { ok: true, status: 200, body: answer };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        // One directory batch through the `deletePerson` cascade (A24): the
        // persons, their claims, assignments and credentials go together.
        // Proof: with this batch skipped, `removes the pool’s persons with
        // removePersons and releases the cap` (agent-pool.controller.db.test.ts)
        // answered `removedPersons: 0`, the eight persons kept; watched
        // 2026-10-28.
        const removed = await runner.runDirectoryWithin(
          principal.id,
          revoked.personIds.map((personId) => ({
            kind: 'deletePerson' as const,
            personId,
            cascade: true,
          })),
          resolved.access,
        );
        if (!removed.ok)
          return {
            ok: false,
            status: 409,
            body: {
              error: 'persons_not_removed',
              poolId: params.id,
              revokedCredentials: revoked.revokedCredentials,
            },
          };
        return {
          ok: true,
          status: 200,
          body: { ...answer, removedPersons: revoked.personIds.length },
        };
      },
    ),
  ] as const;
}
