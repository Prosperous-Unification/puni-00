import { createAgentPool, listAgentPools, rekeyAgentPool, revokeAgentPool } from '@wbs/contracts';
import type { Permission } from '@wbs/domain/access-role';

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
import { retainSecurityPrincipal } from '../ports/security-principal';
import { digestMachineSecret, newMachineKey } from '../service/machine-key';
import { bind, type HttpReply } from './endpoint';
import { activeAudienceRoot, sessionOrganizationOf } from './machine-credential.routes';
import { organizationRefusal } from './organization-refusal';

const forbidden = (permission: Permission) =>
  // Proof: pool-route-permission: dropping the returned named permission.
  // names manage_directory for a role-only agent-pool list refusal without effects
  // names manage_directory for a role-only agent-pool create refusal without effects
  // names manage_directory for a role-only agent-pool rekey refusal without effects
  // names manage_directory for a role-only agent-pool revoke refusal without effects
  // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
  ({ ok: false, status: 403, body: { error: 'forbidden', permission } }) as const;
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
 * current organization.manage_directory holders, from a browser session only:
 * a delegation, a grant or a machine credential's direct context is `insufficient_scope`, so a machine never
 * mints, re-keys or revokes agents (A12, A23). The store rechecks activation
 * and the actual principal's effective grant in each act's own transaction.
 * Pool revocation commits before optional directory cleanup: a later named
 * grant denial is persons_not_removed409 with its actual permission, leaving
 * the committed revocation and its callback intact. The keys are minted here,
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
      // Proof: pool-route-list-principal: retaining caller authority aliases across an await.
      // retains the pool list route principal before resolution: id
      // retains the pool list route principal before resolution: authentication
      // retains the pool list route principal before resolution: delegation
      // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
      const actor = retainSecurityPrincipal(principal);
      const organizationId = await sessionOrganizationOf(organizations, principal);
      if (typeof organizationId !== 'string') return organizationId;
      const listed = await pools.list(organizationId, actor, clock.now());
      if (listed === 'inactive') return organizationRefusal('no_active_organization');
      if ('kind' in listed) return forbidden(listed.permission);
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
        // Proof: pool-route-create-principal: retaining caller authority aliases across an await.
        // retains the pool create route principal before resolution: id
        // retains the pool create route principal before resolution: authentication
        // retains the pool create route principal before resolution: delegation
        // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
        const actor = retainSecurityPrincipal(principal);
        // Proof: pool-route-create-body: retaining caller body across resolution.
        // retains pool create route payload and target before resolution
        // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
        const retainedBody = { name: body.name, size: body.size, expiresAt: body.expiresAt };
        // Free text never reaches an audit detail, but a name shaped like a
        // key would be read as one wherever the pool is shown.
        if (isSecretShaped(retainedBody.name)) return invalidBody;
        const now = clock.now();
        // Proof: with the upper bound removed, `refuses a size of 0 or 101, an
        // oidc source, a past expiry or one past 90 days, writing nothing`
        // (agent-pool.controller.db.test.ts) created the 91-day pool (201);
        // watched 2026-10-28.
        if (
          retainedBody.expiresAt !== undefined &&
          !isAgentPoolExpiryWithinBounds(retainedBody.expiresAt, now)
        )
          return invalidBody;
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const minted = await Promise.all(
          Array.from({ length: retainedBody.size }, () => mintKey(crypto.randomUUID())),
        );
        const poolId = crypto.randomUUID();
        const stamped = act(actor.id);
        const created = await pools.create(
          organizationId,
          actor,
          {
            id: poolId,
            name: retainedBody.name,
            expiresAt: retainedBody.expiresAt ?? null,
            agents: minted.map((each) => each.draft),
          },
          stamped,
        );
        switch (created.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden(created.permission);
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
        // Proof: pool-route-rekey-principal: retaining caller authority aliases across an await.
        // retains the pool rekey route principal before resolution: id
        // retains the pool rekey route principal before resolution: authentication
        // retains the pool rekey route principal before resolution: delegation
        // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
        const actor = retainSecurityPrincipal(principal);
        const poolId = params.id;
        const expiresAt = body.expiresAt;
        // The same bound as a new pool's.
        // Proof: with this check removed, `re-keys an expired pool with a new
        // expiry within 90 days, and refuses one past them` in
        // `agent-pool.controller.db.test.ts` answered 201 instead of 400;
        // watched 2026-10-28.
        if (expiresAt !== undefined && !isAgentPoolExpiryWithinBounds(expiresAt, clock.now()))
          return invalidBody;
        // Proof: route-snapshot-pool-rekey: removing this boundary failed `retains the pool route audit actor across resolution at rekey`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        // Proof: pool-route-rekey-target-retry: rereading caller target after resolution.
        // retains pool rekey route payload and target before resolution
        // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
        const persons = await pools.personsOf(organizationId, actor, poolId);
        if (persons === 'inactive') return organizationRefusal('no_active_organization');
        if (typeof persons === 'object' && 'kind' in persons) return forbidden(persons.permission);
        if (persons === 'not_found') return notFound;
        const minted = await Promise.all(persons.map((each) => mintKey(each.personId)));
        const stamped = act(actor.id);
        const rekeyed = await pools.rekey(
          organizationId,
          actor,
          poolId,
          {
            keys: minted.map((each) => each.draft),
            // Proof: pool-route-rekey-expiry: rereading caller expiry after resolution.
            // retains pool rekey route payload and target before resolution
            // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
            ...(expiresAt === undefined ? {} : { expiresAt: expiresAt }),
          },
          stamped,
        );
        switch (rekeyed.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            // Proof: pool-route-rekey-writer-permission: dropping the returned named permission.
            // forwards the pool rekey writer permission after a successful persons preflight
            // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
            return forbidden(rekeyed.permission);
          case 'not_found':
            return notFound;
          case 'last_super_admin':
            return { ok: false, status: 409, body: { error: 'last_super_admin' } };
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
        // Proof: route-snapshot-pool-revoke: removing this boundary failed `retains the pool route audit actor across resolution at revoke`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        // Proof: pool-route-revoke-caller-retry2: retaining the resolver-substitutable complete caller through cleanup.
        // retains the original pool removal principal through directory cleanup: authentication
        // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
        const caller = structuredClone(principal);
        // Proof: pool-route-revoke-projection: passing the complete caller into an authority-only pool port.
        // passes only the pool revoke authority projection to its public port
        // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
        const actor = retainSecurityPrincipal(caller);
        const poolId = params.id;
        const removesPersons = query.removePersons === 'true';
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        // Proof: pool-route-revoke-target-retry: rereading caller target after resolution.
        // retains pool revoke route payload and target before resolution
        // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
        const revoked = await pools.revoke(organizationId, actor, poolId, act(actor.id));
        switch (revoked.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden(revoked.permission);
          case 'not_found':
            return notFound;
          case 'last_super_admin':
            return { ok: false, status: 409, body: { error: 'last_super_admin' } };
          case 'revoked':
            break;
        }
        // The revocation ended the leases of every person it left with no
        // live credential; the claims go on the tick this asks for
        // (`wbs-claim-leases` L8).
        afterRevoke();
        const answer = {
          poolId,
          revokedCredentials: revoked.revokedCredentials,
          removedPersons: 0,
        };
        // Proof: pool-route-revoke-cleanup-intent: rereading caller cleanup intent after resolution.
        // retains pool revoke route payload and target before resolution
        // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
        if (!removesPersons || revoked.personIds.length === 0)
          return { ok: true, status: 200, body: answer };
        // Proof: pool-cleanup-resolver-alias: removing this boundary failed `retains the original pool removal principal through directory cleanup: authentication`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        const resolved = await organizations.resolve(structuredClone(caller));
        if (!resolved.ok) return organizationRefusal(resolved);
        // One directory batch through the `deletePerson` cascade (A24): the
        // persons, their claims, assignments and credentials go together.
        // Proof: with this batch skipped, `removes the pool’s persons with
        // removePersons and releases the cap` (agent-pool.controller.db.test.ts)
        // answered `removedPersons: 0`, the eight persons kept; watched
        // 2026-10-28.
        const removed = await runner.runDirectoryWithin(
          // Proof: pool-cleanup-runner-principal: removing this boundary failed `retains the original pool removal principal through directory cleanup: authentication`;
          // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
          caller,
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
              /* Proof: cp14-pool-cleanup-cause: removed/changed production boundary.
               * preserves committed pool revocation when later person cleanup is CP14-blocked
               * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
              ...('reason' in removed && removed.reason === 'last_super_admin'
                ? { cause: 'last_super_admin' as const }
                : // Proof: pool-route-cleanup-admission: dropping the batch-admission forbidden permission projection.
                  // keeps committed pool revocation and names the admission cleanup grant refusal
                  // encodes the committed pool revocation and later grant refusal through HTTP
                  // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
                  (('refusal' in removed && removed.refusal === 'forbidden') ||
                      // Proof: pool-route-cleanup-execution: dropping the command-execution forbidden permission projection.
                      // keeps committed pool revocation and names the execution cleanup grant refusal
                      // Named RED with this fault; restored GREEN (task-2.4b pool receipt).
                      ('reason' in removed && removed.reason === 'forbidden')) &&
                    'permission' in removed &&
                    removed.permission !== undefined
                  ? { cause: 'forbidden' as const, permission: removed.permission }
                  : {}),
              poolId,
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
