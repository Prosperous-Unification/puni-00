import type { AuthenticatedUser } from '@wbs/contracts';
import {
  createSsoConnection,
  listSsoConnections,
  removeSsoConnection,
  updateSsoConnection,
} from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type {
  ConnectionAuthorityRefusal,
  EnterpriseConnection,
  EnterpriseConnections,
} from '../ports/enterprise-connections';
import type { OrganizationAccess } from '../ports/organization-access';
import type { AuditedAct } from '../ports/organization-audit';
import { retainSecurityPrincipal } from '../ports/security-principal';
import { bind, EMPTY } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** The wire form of a connection: the organization is the caller's own, so it is left out. */
function wireConnection({ organizationId: _organization, ...wire }: EnterpriseConnection) {
  return wire;
}

/** One act's audit identity, stamped by the injected clock (ADR 0012). */
function auditedAct(clock: Pick<Clock, 'now'>, actorId: string): AuditedAct {
  return { stamp: { at: clock.now(), by: actorId }, actor: actorId, auditId: crypto.randomUUID() };
}

/**
 * The organization a connection route acts in: the session's active one.
 * A delegation is refused outright; SSO administration is a browser act.
 */
async function sessionOrganization(
  organizations: OrganizationAccess,
  principal: AuthenticatedUser,
) {
  // Proof: 2026-10-12, removing this guard made mounted `refuses a delegated
  // caller` in `sso-connection.controller.db.test.ts` list the connections.
  // Proof: bypassing this HTTP refusal (http-nondelegation-sso-connection) failed `refuses a delegated caller even with current super-admin membership`; restored GREEN.
  if (principal.delegation !== undefined)
    return {
      ok: false,
      reply: { ok: false, status: 403, body: { error: 'insufficient_scope' } },
    } as const;
  // Proof: retaining the caller alias across organization resolution (route-snapshot-sso-create) failed `retains the route security principal across organization resolution at sso-create: id`; restored GREEN.
  const actor = retainSecurityPrincipal(principal);
  const resolved = await organizations.resolve(principal);
  if (!resolved.ok) return { ok: false, reply: organizationRefusal(resolved) } as const;
  if (resolved.access.kind === 'legacy')
    return { ok: false, reply: organizationRefusal('no_active_organization') } as const;
  return {
    ok: true,
    organizationId: resolved.access.scope.organizationId,
    principal: actor,
  } as const;
}

/** The reply every connection write shares for an authority refusal. */
function authorityRefusal(refusal: ConnectionAuthorityRefusal) {
  switch (refusal) {
    case 'inactive':
      return organizationRefusal('no_active_organization');
    case 'forbidden':
      return {
        ok: false,
        status: 403,
        // Proof: dropping this permission property (http-permission-sso-write) failed `encodes a current grant denial before effects at sso-create`; restored GREEN.
        body: { error: 'forbidden', permission: 'organization.manage_security' },
      } as const;
    case 'not_found':
      return { ok: false, status: 404, body: { error: 'not_found' } } as const;
  }
}

/**
 * Enterprise connection administration (`organization-sso`, D8): list,
 * create, change or enforce, and delete, for a current organization.manage_security holder in the
 * session's active organization. The store rechecks activation, current grants and
 * the claim inside each write's own transaction.
 *
 * `setEnforced` receives the upstream subject that authenticated the
 * actor's current credential (null for a password session), so switching
 * enforcement on is refused as `enforcement_would_lock_out_actor` when the
 * actor's own credential would fail the rule.
 */
export function ssoConnectionRoutes(
  organizations: OrganizationAccess,
  connections: EnterpriseConnections,
  clock: Pick<Clock, 'now'>,
) {
  return [
    bind(listSsoConnections, async ({ principal }) => {
      const session = await sessionOrganization(organizations, principal);
      if (!session.ok) return session.reply;
      const listed = await connections.list(session.organizationId, session.principal);
      if (listed === 'inactive') return organizationRefusal('no_active_organization');
      if (listed === 'forbidden')
        return {
          ok: false,
          status: 403,
          // Proof: dropping this permission property (http-permission-sso-list) failed `encodes a current grant denial before effects at sso-list`; restored GREEN.
          body: { error: 'forbidden', permission: 'organization.manage_security' },
        } as const;
      return { ok: true, status: 200, body: { connections: listed.map(wireConnection) } } as const;
    }),
    bind(createSsoConnection, async ({ principal, body }) => {
      const session = await sessionOrganization(organizations, principal);
      if (!session.ok) return session.reply;
      const created = await connections.create(
        session.organizationId,
        session.principal,
        body,
        crypto.randomUUID(),
        auditedAct(clock, session.principal.id),
      );
      switch (created.kind) {
        case 'created':
          return {
            ok: true,
            status: 201,
            body: { connection: wireConnection(created.connection) },
          } as const;
        case 'domain_not_verified':
        case 'sso_connection_exists':
        case 'login_slug_taken':
          return { ok: false, status: 409, body: { error: created.kind } } as const;
        default:
          return authorityRefusal(created.kind);
      }
    }),
    bind(updateSsoConnection, async ({ principal, params, body }) => {
      const { enforced, ...change } = body;
      const changesConfiguration = Object.keys(change).length > 0;
      // One request changes configuration or enforcement, never both: they
      // are two transactions, and the second refusing would strand the first.
      if (changesConfiguration === (enforced !== undefined))
        return { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
      const session = await sessionOrganization(organizations, principal);
      if (!session.ok) return session.reply;
      const act = auditedAct(clock, session.principal.id);
      if (enforced !== undefined) {
        const switched = await connections.setEnforced(
          session.organizationId,
          session.principal,
          params.id,
          enforced,
          // Proof: passing null here made `enables enforcement for a
          // super-admin signed in through the connection` in
          // `organization-credential-rules.controller.db.test.ts` answer 409
          // enforcement_would_lock_out_actor; watched 2026-10-12.
          session.principal.authentication?.kind === 'upstream'
            ? session.principal.authentication.subject
            : null,
          act,
        );
        switch (switched.kind) {
          case 'changed':
            return {
              ok: true,
              status: 200,
              body: { connection: wireConnection(switched.connection) },
            } as const;
          case 'sso_connection_unproven':
          case 'enforcement_would_lock_out_actor':
            return { ok: false, status: 409, body: { error: switched.kind } } as const;
          default:
            return authorityRefusal(switched.kind);
        }
      }
      const updated = await connections.update(
        session.organizationId,
        session.principal,
        params.id,
        change,
        act,
      );
      switch (updated.kind) {
        case 'updated':
          return {
            ok: true,
            status: 200,
            body: { connection: wireConnection(updated.connection) },
          } as const;
        case 'login_slug_taken':
          return { ok: false, status: 409, body: { error: updated.kind } } as const;
        default:
          return authorityRefusal(updated.kind);
      }
    }),
    bind(removeSsoConnection, async ({ principal, params }) => {
      const session = await sessionOrganization(organizations, principal);
      if (!session.ok) return session.reply;
      const removed = await connections.remove(
        session.organizationId,
        session.principal,
        params.id,
        auditedAct(clock, session.principal.id),
      );
      switch (removed) {
        case 'deleted':
          return { ok: true, status: 204, body: EMPTY } as const;
        case 'provisioning_active':
          return { ok: false, status: 409, body: { error: removed } } as const;
        default:
          return authorityRefusal(removed);
      }
    }),
  ] as const;
}
