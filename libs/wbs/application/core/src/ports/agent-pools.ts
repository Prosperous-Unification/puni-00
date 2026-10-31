import type { LimitCrossed } from '@wbs/domain';

import type { MachineCredentialSummary } from './machine-credentials';
import type { AuditedAct } from './organization-audit';

/** The most agent persons one pool creates (`wbs-mcp-agent-surface` M7). */
export const MOST_AGENT_POOL_SIZE = 100;

/** How far ahead a pool's `expiresAt` may lie: 90 days. */
export const MOST_AGENT_POOL_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

/** One API key a pool act issues: ids minted by the caller, only the digest of its secret. */
export interface AgentPoolKeyDraft {
  readonly personId: string;
  readonly credentialId: string;
  readonly secretId: string;
  readonly digest: string;
}

/**
 * A new pool: its id and every person and key id minted by the caller. The
 * agent at index `i` is named `<name>-<i + 1>` in the organization, and its
 * credential carries the same name.
 */
export interface AgentPoolDraft {
  readonly id: string;
  readonly name: string;
  readonly expiresAt: number | null;
  readonly agents: readonly AgentPoolKeyDraft[];
}

/**
 * What a re-key issues: one key per person {@link AgentPools.personsOf}
 * answered, and a new `expiresAt` when the admin gives one (already checked
 * against {@link MOST_AGENT_POOL_LIFETIME_MS} by the caller).
 */
export interface AgentPoolRenewal {
  readonly keys: readonly AgentPoolKeyDraft[];
  readonly expiresAt?: number;
}

/** One agent of a pool: its person, that person's organization-local name, and its live key's credential. */
export interface AgentPoolAgent {
  readonly personId: string;
  readonly personName: string;
  readonly credentialId: string;
}

/** A pool as its admins list it: never a secret or a digest. */
export interface AgentPoolSummary {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly expiresAt: number | null;
  readonly revokedAt: number | null;
  readonly createdAt: number;
  readonly createdBy: string;
  /** The pool's unrevoked credentials, oldest first. */
  readonly credentials: readonly MachineCredentialSummary[];
}

/** What a create or a re-key issued: the pool and one agent per key, in name order. */
export interface AgentPoolIssued {
  readonly pool: Omit<AgentPoolSummary, 'credentials'>;
  readonly agents: readonly AgentPoolAgent[];
}

/**
 * Why a pool act was refused before anything was read about the pool:
 * `inactive` before activation, `forbidden` for anyone but a current `admin`
 * or `super_admin` (M7: only an admin's browser session makes a pool).
 */
export type AgentPoolActorRefusal = 'inactive' | 'forbidden';

/**
 * Agent pools (`wbs-mcp-agent-surface` M7). Every act rechecks activation and
 * the actor's admin role inside the one immediate transaction that also
 * writes its audit rows, so the act and its audit commit or roll back
 * together. Only a SHA-256 digest of a key's secret ever reaches the store,
 * and no audit detail holds a key, a secret or a digest.
 *
 * Organization administration exists only on SQLite (as
 * {@link MachineCredentialAdministration} does): the memory source has no
 * activated organization.
 *
 * @throws when trusted state is missing, unreadable or malformed, and when an
 * audit row cannot be written (the act is then rolled back).
 */
export interface AgentPools {
  /** Every pool of the organization, revoked ones included, oldest first. */
  list(
    organizationId: string,
    actorId: string,
    at: number,
  ): Promise<readonly AgentPoolSummary[] | AgentPoolActorRefusal>;
  /**
   * Creates the pool, one agent person per draft agent bound to `actorId`'s
   * account, and one API key each issued by `actorId`, with one
   * `machine_credential_created` row per key and one `agent_pool_created`.
   * The agent-person cap is judged once for the whole pool, by the same
   * reading and decision `addPerson` uses, inside this transaction
   * (`wbs-organization-limits` L9, L10). `name_taken` when a live pool, an
   * organization person or a live credential holds the pool's name or one of
   * its agents' names.
   */
  create(
    organizationId: string,
    actorId: string,
    draft: AgentPoolDraft,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'created'; readonly issued: AgentPoolIssued }
    | { readonly kind: AgentPoolActorRefusal | 'name_taken' }
    | ({ readonly kind: 'agent_person_limit' } & LimitCrossed)
  >;
  /**
   * The persons of the live pool `poolId` a re-key keys, in name order: those
   * holding a live credential of the pool now, so an agent whose key an admin
   * revoked alone stays keyless (M7). `not_found` for a revoked pool or
   * another organization's.
   */
  personsOf(
    organizationId: string,
    actorId: string,
    poolId: string,
  ): Promise<
    | readonly { readonly personId: string; readonly personName: string }[]
    | AgentPoolActorRefusal
    | 'not_found'
  >;
  /**
   * Revokes every live key of the live pool `poolId` and issues
   * `renewal.keys`, one per person {@link personsOf} answers, creating no
   * person, and sets `renewal.expiresAt` when given. `pool_expired` when the
   * pool's `expiresAt` has passed at `act.stamp.at` and no new one is given;
   * `pool_changed` when the keys no longer name exactly those persons. One
   * `machine_credential_revoked` row per old key, one
   * `machine_credential_created` per new, and one `agent_pool_rekeyed`.
   */
  rekey(
    organizationId: string,
    actorId: string,
    poolId: string,
    renewal: AgentPoolRenewal,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'rekeyed'; readonly issued: AgentPoolIssued }
    | { readonly kind: AgentPoolActorRefusal | 'not_found' | 'pool_changed' | 'pool_expired' }
  >;
  /**
   * Revokes the live pool `poolId` and every live key of it at
   * `act.stamp.at`, ending the leases of each person left with no live
   * credential (`wbs-claim-leases` L8), with one `machine_credential_revoked`
   * row per key and one `agent_pool_revoked`. Answers the pool's persons, for
   * a removal the caller runs next.
   */
  revoke(
    organizationId: string,
    actorId: string,
    poolId: string,
    act: AuditedAct,
  ): Promise<
    | {
        readonly kind: 'revoked';
        readonly revokedCredentials: number;
        readonly personIds: readonly string[];
      }
    | { readonly kind: AgentPoolActorRefusal | 'not_found' }
  >;
}

/** Whether `expiresAt` is in the future at `now` and at most {@link MOST_AGENT_POOL_LIFETIME_MS} ahead. */
export function isAgentPoolExpiryWithinBounds(expiresAt: number, now: number): boolean {
  return expiresAt > now && expiresAt <= now + MOST_AGENT_POOL_LIFETIME_MS;
}

/**
 * The MCP resource whose authorization server is `authorizationServer`
 * (`<MCP_PUBLIC_URL>/oauth`, `mcpAuthorizationServerOf`): the URL an agent
 * connects to.
 *
 * @throws when `authorizationServer` does not end in `/oauth`; boot refuses
 * such a setting, so this is a composition fault.
 */
export function mcpResourceOfAuthorizationServer(authorizationServer: string): string {
  if (!authorizationServer.endsWith('/oauth'))
    throw new Error('WBS_MCP_AUTHORIZATION_SERVER does not end in /oauth');
  return authorizationServer.slice(0, -'/oauth'.length);
}

/**
 * Pools for an app composed without them: every act answers as before
 * activation (`no_active_organization`). Production wires the SQLite store.
 */
export const INACTIVE_AGENT_POOLS: AgentPools = {
  list: () => Promise.resolve('inactive'),
  create: () => Promise.resolve({ kind: 'inactive' }),
  personsOf: () => Promise.resolve('inactive'),
  rekey: () => Promise.resolve({ kind: 'inactive' }),
  revoke: () => Promise.resolve({ kind: 'inactive' }),
};

/** The organization-local name of the agent at `index` of pool `name`. */
export function agentPoolPersonName(name: string, index: number): string {
  return `${name}-${String(index + 1)}`;
}
