import { listTrustedIssuers, registerTrustedIssuer, removeTrustedIssuer } from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { OrganizationAccess } from '../ports/organization-access';
import { type AuditedAct, isSecretShaped } from '../ports/organization-audit';
import type {
  TrustedIssuerAdministration,
  TrustedIssuerDiscovery,
  TrustedIssuerRegistrationRefusal,
} from '../ports/trusted-issuers';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { sessionOrganizationOf } from './machine-credential.routes';
import { organizationRefusal } from './organization-refusal';

const forbidden = { ok: false, status: 403, body: { error: 'forbidden' } } as const;

/**
 * Trusted issuer administration (`wbs-machine-credentials` A16, A17) for the
 * active organization's admins. A delegation or a machine credential is
 * `insufficient_scope`, as on the credential routes.
 *
 * Registration runs in this order, so nothing is fetched for a caller who
 * could not register and nothing is stored for a URL that did not discover:
 * the configured sign-in issuer is `issuer_reserved` with no read; the
 * store's read-only check (role, connection gate, `issuer_taken`); one
 * discovery fetch; then the store's write, which checks everything again
 * with its audit row.
 *
 * `configuredIssuer` is the deployment's human sign-in Issuer Identifier, or
 * null when it configures none.
 */
export function trustedIssuerRoutes(
  organizations: OrganizationAccess,
  issuers: TrustedIssuerAdministration,
  discovery: TrustedIssuerDiscovery,
  configuredIssuer: () => Promise<string | null>,
  clock: Pick<Clock, 'now'>,
) {
  const act = (actorId: string): AuditedAct => ({
    stamp: { at: clock.now(), by: actorId },
    actor: actorId,
    auditId: crypto.randomUUID(),
  });
  return [
    bind(
      listTrustedIssuers,
      async ({ principal }): Promise<HttpReply<typeof listTrustedIssuers>> => {
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const listed = await issuers.list(organizationId, principal.id);
        if (listed === 'inactive') return organizationRefusal('no_active_organization');
        if (listed === 'forbidden') return forbidden;
        return { ok: true, status: 200, body: { trustedIssuers: [...listed] } };
      },
    ),
    bind(
      registerTrustedIssuer,
      async ({ principal, body }): Promise<HttpReply<typeof registerTrustedIssuer>> => {
        // The issuer URL is written to the audit detail, so one shaped like a
        // secret or a full subject is refused here rather than as the audit
        // writer's 500, as a credential's name is.
        // Proof: with this check removed, `refuses a body whose issuer is no
        // HTTPS issuer URL` in `trusted-issuer.controller.db.test.ts` let the
        // `|`-shaped issuer reach discovery and answered 409
        // issuer_unreachable instead of 400; watched 2026-10-22.
        if (isSecretShaped(body.issuer))
          return { ok: false, status: 400, body: { error: 'invalid_body' } };
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const ssoConnectionId = body.ssoConnectionId ?? null;
        // Proof: with this refusal removed, `refuses the configured sign-in
        // issuer, fetching nothing` in `trusted-issuer.controller.db.test.ts`
        // fetched its discovery and registered it; watched 2026-10-22.
        if (body.issuer === (await configuredIssuer()))
          return { ok: false, status: 409, body: { error: 'issuer_reserved' } };
        const ready = await issuers.checkRegistration(
          organizationId,
          principal.id,
          body.issuer,
          ssoConnectionId,
        );
        if (ready !== 'ready') return registrationRefusal(ready);
        const discovered = await discovery.discover(body.issuer);
        if (discovered.kind === 'unreachable')
          return { ok: false, status: 409, body: { error: 'issuer_unreachable' } };
        if (discovered.kind === 'mismatch')
          return { ok: false, status: 409, body: { error: 'issuer_mismatch' } };
        const registered = await issuers.register(
          organizationId,
          principal.id,
          {
            id: crypto.randomUUID(),
            issuer: body.issuer,
            jwksUri: discovered.jwksUri,
            defaultAudience: body.defaultAudience ?? null,
            ssoConnectionId,
          },
          act(principal.id),
        );
        if (registered.kind !== 'registered') return registrationRefusal(registered.kind);
        return { ok: true, status: 201, body: registered.issuer };
      },
    ),
    bind(
      removeTrustedIssuer,
      async ({ principal, params }): Promise<HttpReply<typeof removeTrustedIssuer>> => {
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const removed = await issuers.remove(
          organizationId,
          principal.id,
          params.id,
          act(principal.id),
        );
        if (typeof removed === 'object')
          return {
            ok: false,
            status: 409,
            body: { error: 'in_use', machineCredentials: removed.machineCredentials },
          };
        switch (removed) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'not_found':
            return { ok: false, status: 404, body: { error: 'not_found' } };
          case 'removed':
            return { ok: true, status: 204, body: EMPTY };
        }
      },
    ),
  ] as const;
}

function registrationRefusal(
  refused: TrustedIssuerRegistrationRefusal,
): HttpReply<typeof registerTrustedIssuer> {
  switch (refused) {
    case 'inactive':
      return organizationRefusal('no_active_organization');
    case 'forbidden':
      return forbidden;
    case 'unknown_sso_connection':
      return { ok: false, status: 404, body: { error: refused } };
    case 'issuer_not_oidc':
    case 'sso_connection_unproven':
    case 'issuer_taken':
      return { ok: false, status: 409, body: { error: refused } };
  }
}
