import {
  createMachineCredential,
  isUnderMcpAuthorizationServer,
  listMachineCredentials,
  revokeMachineCredential,
  rotateMachineCredential,
} from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type {
  MachineCredentialActorRefusal,
  MachineCredentialAdministration,
} from '../ports/machine-credentials';
import type { OrganizationAccess } from '../ports/organization-access';
import { type AuditedAct, isSecretShaped } from '../ports/organization-audit';
import { digestMachineSecret, newMachineKey } from '../service/machine-key';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

const insufficientScope = {
  ok: false,
  status: 403,
  body: { error: 'insufficient_scope' },
} as const;
const forbidden = { ok: false, status: 403, body: { error: 'forbidden' } } as const;
const notFound = { ok: false, status: 404, body: { error: 'not_found' } } as const;

/**
 * The session organization an administration route acts in, or the refusal
 * that ends the request: a delegation, an MCP session or a machine
 * credential's direct context alike, is `insufficient_scope`; no active
 * organization (legacy or refused access) is its organization refusal.
 * Shared by the machine credential and trusted issuer routes.
 */
export async function sessionOrganizationOf(
  organizations: OrganizationAccess,
  principal: Parameters<OrganizationAccess['resolve']>[0],
) {
  // Proof: with this guard dropped, `refuses a machine key and a delegation
  // every credential route` in `machine-credential-admin.controller.db.test.ts`
  // answered a machine key's list 200 with the credentials; watched
  // 2026-10-22.
  if (principal.delegation !== undefined) return insufficientScope;
  const resolved = await organizations.resolve(principal);
  if (!resolved.ok) return organizationRefusal(resolved);
  if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
  return resolved.access.scope.organizationId;
}

/**
 * The audience root of an active organization's request.
 *
 * @throws when it is not configured: boot refuses an activated store without
 * `WBS_MCP_AUTHORIZATION_SERVER`, so a route past its activation check that
 * meets none is a composition fault.
 */
export function activeAudienceRoot(audienceRoot: string | null): string {
  if (audienceRoot === null)
    throw new Error('an active organization was served without WBS_MCP_AUTHORIZATION_SERVER');
  return audienceRoot;
}

/**
 * Machine credential administration (`wbs-machine-credentials` A7, A11, A15,
 * A17, A22) for the active organization's members and admins. A delegation —
 * an MCP session or a machine credential's direct context alike — answers
 * `insufficient_scope`: a credential never mints, rotates or revokes one
 * (A12, A23). The store rechecks activation, the role and a member's own
 * account in each act's own transaction, so the route only names the
 * organization, mints ids and secrets, and never stores or logs a secret.
 * An `oidc` credential's audience narrowing must equal `audienceRoot` (be-01's
 * `WBS_MCP_AUTHORIZATION_SERVER`) or sit under it after a `/`, else
 * `audience_not_wbs` (`wbs-mcp-agent-surface` M2).
 */
export function machineCredentialRoutes(
  organizations: OrganizationAccess,
  credentials: MachineCredentialAdministration,
  audienceRoot: string | null,
  clock: Pick<Clock, 'now'>,
  afterRevoke: () => void,
) {
  const sessionOrganization = (principal: Parameters<OrganizationAccess['resolve']>[0]) =>
    sessionOrganizationOf(organizations, principal);
  const act = (actorId: string): AuditedAct => ({
    stamp: { at: clock.now(), by: actorId },
    actor: actorId,
    auditId: crypto.randomUUID(),
  });
  return [
    bind(
      listMachineCredentials,
      async ({ principal, query }): Promise<HttpReply<typeof listMachineCredentials>> => {
        const organizationId = await sessionOrganization(principal);
        if (typeof organizationId !== 'string') return organizationId;
        const listed = await credentials.list(
          organizationId,
          principal.id,
          {
            ...(query.personId === undefined ? {} : { personId: query.personId }),
            includeRevoked: query.include === 'revoked',
          },
          clock.now(),
        );
        if (listed === 'inactive') return organizationRefusal('no_active_organization');
        if (listed === 'forbidden') return forbidden;
        return {
          ok: true,
          status: 200,
          body: { credentials: listed.map((each) => ({ ...each, secrets: [...each.secrets] })) },
        };
      },
    ),
    bind(
      createMachineCredential,
      async ({ principal, body }): Promise<HttpReply<typeof createMachineCredential>> => {
        // A name shaped like a secret or a full subject is refused here, so
        // free text never reaches the audit writer's secret guard as a 500.
        // Proof: with this check removed, `refuses a name shaped like a secret
        // or a subject, storing nothing` in
        // `machine-credential-admin.controller.db.test.ts` stored each
        // credential (201); watched 2026-10-22.
        if (isSecretShaped(body.name))
          return { ok: false, status: 400, body: { error: 'invalid_body' } };
        const organizationId = await sessionOrganization(principal);
        if (typeof organizationId !== 'string') return organizationId;
        // `parseMachineKey` accepts only this UUID shape, and the table's
        // triggers refuse every other (task 2.5).
        const id = crypto.randomUUID();
        if (body.source === 'oidc') {
          const audience = body.audience ?? null;
          // Proof: with this refusal removed, `refuses a narrowing outside the
          // authorization server audience_not_wbs` (oidc-credential.controller.db.test.ts)
          // answered the first narrowing without the 400; watched 2026-10-27.
          if (
            audience !== null &&
            !isUnderMcpAuthorizationServer(audience, activeAudienceRoot(audienceRoot))
          )
            return { ok: false, status: 400, body: { error: 'audience_not_wbs' } };
          const created = await credentials.createOidc(
            organizationId,
            principal.id,
            {
              id,
              name: body.name,
              personId: body.personId,
              trustedIssuerId: body.trustedIssuerId,
              subject: body.subject,
              audience,
            },
            act(principal.id),
          );
          if (created.kind !== 'created') return createRefusal(created.kind, body.personId);
          const { issuer } = created.credential;
          if (issuer === null)
            throw new Error(`oidc credential ${id} was stored without its issuer`);
          return {
            ok: true,
            status: 201,
            body: {
              id,
              source: 'oidc',
              name: created.credential.name,
              personId: created.credential.personId,
              issuedBy: created.credential.issuedBy,
              createdAt: created.credential.createdAt,
              trustedIssuerId: body.trustedIssuerId,
              issuer,
              subject: body.subject,
              audience,
            },
          };
        }
        const { key, secret } = newMachineKey(id);
        const created = await credentials.createApiKey(
          organizationId,
          principal.id,
          {
            id,
            name: body.name,
            personId: body.personId,
            secretId: crypto.randomUUID(),
            digest: await digestMachineSecret(secret),
          },
          act(principal.id),
        );
        if (created.kind !== 'created') return createRefusal(created.kind, body.personId);
        return {
          ok: true,
          status: 201,
          body: {
            id,
            source: 'api_key',
            name: created.credential.name,
            personId: created.credential.personId,
            issuedBy: created.credential.issuedBy,
            createdAt: created.credential.createdAt,
            key,
          },
        };
      },
    ),
    bind(
      rotateMachineCredential,
      async ({ principal, params }): Promise<HttpReply<typeof rotateMachineCredential>> => {
        const organizationId = await sessionOrganization(principal);
        if (typeof organizationId !== 'string') return organizationId;
        const { key, secret } = newMachineKey(params.id);
        const secretId = crypto.randomUUID();
        const rotated = await credentials.rotateApiKey(
          organizationId,
          principal.id,
          params.id,
          { secretId, digest: await digestMachineSecret(secret) },
          act(principal.id),
        );
        switch (rotated.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'not_found':
            return notFound;
          case 'rotation_at_issuer':
          case 'rotation_in_progress':
            return { ok: false, status: 409, body: { error: rotated.kind } };
          case 'rotated':
            return {
              ok: true,
              status: 201,
              body: { id: params.id, secretId, key, previousExpiresAt: rotated.previousExpiresAt },
            };
        }
      },
    ),
    bind(
      revokeMachineCredential,
      async ({ principal, params }): Promise<HttpReply<typeof revokeMachineCredential>> => {
        const organizationId = await sessionOrganization(principal);
        if (typeof organizationId !== 'string') return organizationId;
        const revoked = await credentials.revoke(
          organizationId,
          principal.id,
          params.id,
          act(principal.id),
        );
        switch (revoked) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'not_found':
            return notFound;
          case 'revoked':
            // The revoke ended the person's leases if it was the last live
            // credential; the claims go on the tick this asks for, not the
            // next scheduled one (`wbs-claim-leases` L8).
            // Proof: with this call removed, `releases a revoked agent’s claims
            // on the tick the revoke asks for` (claim-lease.controller.db.test.ts)
            // still held them (2 pass, 1 fail); watched 2026-10-23.
            afterRevoke();
            return { ok: true, status: 204, body: EMPTY };
        }
      },
    ),
  ] as const;
}

/** The reply to a refused create, whichever source was asked for. */
function createRefusal(
  refused:
    | MachineCredentialActorRefusal
    | 'unknown_person'
    | 'person_not_bound'
    | 'account_not_member'
    | 'name_taken'
    | 'unknown_trusted_issuer'
    | 'subject_taken',
  personId: string,
): HttpReply<typeof createMachineCredential> {
  switch (refused) {
    case 'inactive':
      return organizationRefusal('no_active_organization');
    case 'forbidden':
      return forbidden;
    case 'unknown_person':
      return { ok: false, status: 404, body: { error: refused } };
    case 'unknown_trusted_issuer':
      return { ok: false, status: 404, body: { error: refused } };
    case 'person_not_bound':
      return { ok: false, status: 409, body: { error: refused, personId } };
    case 'account_not_member':
    case 'name_taken':
    case 'subject_taken':
      return { ok: false, status: 409, body: { error: refused } };
  }
}
