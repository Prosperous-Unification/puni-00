import {
  issueProvisioningToken,
  listProvisioningTokens,
  revokeProvisioningToken,
  rotateProvisioningToken,
} from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { OrganizationAccess } from '../ports/organization-access';
import type { AuditedAct } from '../ports/organization-audit';
import {
  PROVISIONING_ROTATION_OVERLAP_MS,
  type ProvisioningTokens,
} from '../ports/provisioning-tokens';
import { retainSecurityPrincipal } from '../ports/security-principal';
import { digestProvisioningSecret, newProvisioningSecret } from '../service/provisioning-secret';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

const insufficientScope = {
  ok: false,
  status: 403,
  body: { error: 'insufficient_scope' },
} as const;
const forbidden = {
  ok: false,
  status: 403,
  // Proof: dropping this permission property (http-permission-provisioning) failed `encodes a current grant denial before effects at provisioning-issue`; restored GREEN.
  body: { error: 'forbidden', permission: 'organization.manage_security' },
} as const;
const notFound = { ok: false, status: 404, body: { error: 'not_found' } } as const;

/**
 * Provisioning-token administration for a current organization.manage_security holder in the
 * session's organization (`organization-scim`). A delegation answers
 * `insufficient_scope`: a token is a credential, and an agent never mints one.
 * The store rechecks activation and the current security grant in each write's own
 * transaction, so the route only names the organization.
 */
export function provisioningTokenRoutes(
  organizations: OrganizationAccess,
  tokens: ProvisioningTokens,
  clock: Pick<Clock, 'now'>,
) {
  /** The session organization, or the refusal that ends the request. */
  async function sessionOrganization(principal: Parameters<OrganizationAccess['resolve']>[0]) {
    // Proof: dropping this guard made mounted `refuses a delegated caller even
    // with current super-admin membership` fail, the delegation answering
    // other than 403 insufficient_scope; watched 2026-10-12.
    // Proof: bypassing this HTTP refusal (http-nondelegation-provisioning-token) failed `refuses a delegated caller even with current super-admin membership`; restored GREEN.
    if (principal.delegation !== undefined) return insufficientScope;
    // Proof: retaining the caller alias across organization resolution (route-snapshot-provisioning-issue) failed `retains the route security principal across organization resolution at provisioning-issue: id`; restored GREEN.
    const actor = retainSecurityPrincipal(principal);
    const resolved = await organizations.resolve(principal);
    if (!resolved.ok) return organizationRefusal(resolved);
    if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
    return { organizationId: resolved.access.scope.organizationId, principal: actor };
  }
  const act = (actorId: string): AuditedAct => ({
    stamp: { at: clock.now(), by: actorId },
    actor: actorId,
    auditId: crypto.randomUUID(),
  });
  return [
    bind(
      listProvisioningTokens,
      async ({ principal }): Promise<HttpReply<typeof listProvisioningTokens>> => {
        const session = await sessionOrganization(principal);
        if ('ok' in session) return session;
        const { organizationId, principal: actor } = session;
        const listed = await tokens.list(organizationId, actor);
        if (listed === 'inactive') return organizationRefusal('no_active_organization');
        if (listed === 'forbidden') return forbidden;
        return { ok: true, status: 200, body: { tokens: [...listed] } };
      },
    ),
    bind(
      issueProvisioningToken,
      async ({ principal }): Promise<HttpReply<typeof issueProvisioningToken>> => {
        const session = await sessionOrganization(principal);
        if ('ok' in session) return session;
        const { organizationId, principal: actor } = session;
        const secret = newProvisioningSecret();
        const issued = await tokens.issue(
          organizationId,
          actor,
          crypto.randomUUID(),
          // Proof: passing the raw `secret` here made mounted `shows the
          // secret once, stores only its digest and lists no secret` fail:
          // 500 instead of 201, the store refusing a non-digest; watched
          // 2026-10-12.
          await digestProvisioningSecret(secret),
          act(actor.id),
        );
        switch (issued.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'sso_connection_unproven':
          case 'token_limit':
            return { ok: false, status: 409, body: { error: issued.kind } };
          case 'issued':
            return {
              ok: true,
              status: 201,
              body: { id: issued.token.id, token: secret, createdAt: issued.token.createdAt },
            };
        }
      },
    ),
    bind(
      rotateProvisioningToken,
      async ({ principal, params }): Promise<HttpReply<typeof rotateProvisioningToken>> => {
        const session = await sessionOrganization(principal);
        if ('ok' in session) return session;
        const { organizationId, principal: actor } = session;
        const secret = newProvisioningSecret();
        const rotation = act(actor.id);
        const rotated = await tokens.rotate(
          organizationId,
          actor,
          params.id,
          crypto.randomUUID(),
          await digestProvisioningSecret(secret),
          rotation,
        );
        switch (rotated.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'not_found':
            return notFound;
          case 'sso_connection_unproven':
          case 'token_limit':
            return { ok: false, status: 409, body: { error: rotated.kind } };
          case 'rotated':
            return {
              ok: true,
              status: 201,
              body: {
                id: rotated.token.id,
                token: secret,
                createdAt: rotated.token.createdAt,
                previousExpiresAt: rotation.stamp.at + PROVISIONING_ROTATION_OVERLAP_MS,
              },
            };
        }
      },
    ),
    bind(
      revokeProvisioningToken,
      async ({ principal, params }): Promise<HttpReply<typeof revokeProvisioningToken>> => {
        const session = await sessionOrganization(principal);
        if ('ok' in session) return session;
        const { organizationId, principal: actor } = session;
        const revoked = await tokens.revoke(organizationId, actor, params.id, act(actor.id));
        switch (revoked) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'not_found':
            return notFound;
          case 'revoked':
            return { ok: true, status: 204, body: EMPTY };
        }
      },
    ),
  ] as const;
}
