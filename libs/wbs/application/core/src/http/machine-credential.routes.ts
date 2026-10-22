import {
  createMachineCredential,
  listMachineCredentials,
  revokeMachineCredential,
  rotateMachineCredential,
} from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { MachineCredentialAdministration } from '../ports/machine-credentials';
import type { OrganizationAccess } from '../ports/organization-access';
import type { AuditedAct } from '../ports/organization-audit';
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
 * Machine credential administration (`wbs-machine-credentials` A7, A11, A15,
 * A17, A22) for the active organization's members and admins. A delegation —
 * an MCP session or a machine credential's direct context alike — answers
 * `insufficient_scope`: a credential never mints, rotates or revokes one
 * (A12, A23). The store rechecks activation, the role and a member's own
 * account in each act's own transaction, so the route only names the
 * organization, mints ids and secrets, and never stores or logs a secret.
 */
export function machineCredentialRoutes(
  organizations: OrganizationAccess,
  credentials: MachineCredentialAdministration,
  clock: Pick<Clock, 'now'>,
) {
  /** The session organization, or the refusal that ends the request. */
  async function sessionOrganization(principal: Parameters<OrganizationAccess['resolve']>[0]) {
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
        const organizationId = await sessionOrganization(principal);
        if (typeof organizationId !== 'string') return organizationId;
        // `parseMachineKey` accepts only this UUID shape, and the table's
        // triggers refuse every other (task 2.5).
        const id = crypto.randomUUID();
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
        switch (created.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'unknown_person':
            return { ok: false, status: 404, body: { error: created.kind } };
          case 'person_not_bound':
            return {
              ok: false,
              status: 409,
              body: { error: created.kind, personId: body.personId },
            };
          case 'account_not_member':
          case 'name_taken':
            return { ok: false, status: 409, body: { error: created.kind } };
          case 'created':
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
        }
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
            return { ok: true, status: 204, body: EMPTY };
        }
      },
    ),
  ] as const;
}
