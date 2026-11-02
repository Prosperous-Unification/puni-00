import {
  type ClientReply,
  type createMachineCredential,
  type listMachineCredentials,
  type listTrustedIssuers,
  type registerTrustedIssuer,
  type removeTrustedIssuer,
  type revokeMachineCredential,
  type rotateMachineCredential,
} from '@wbs/contracts';

import { unreachable } from '@/lib/http';

import { lostAccess, READ_ONLY, type RefusalOutcome, RELOAD, said } from './organization-access';

/** Every refusal the four machine credential routes model. */
export type MachineCredentialRefusal = Extract<
  ClientReply<
    | typeof listMachineCredentials
    | typeof createMachineCredential
    | typeof rotateMachineCredential
    | typeof revokeMachineCredential
  >,
  { kind: 'refusal' }
>['body'];

/** Every refusal the three trusted issuer routes model. */
export type TrustedIssuerRefusal = Extract<
  ClientReply<
    typeof listTrustedIssuers | typeof registerTrustedIssuer | typeof removeTrustedIssuer
  >,
  { kind: 'refusal' }
>['body'];

/**
 * `audience_not_wbs` on a registration or a credential's narrowing
 * (`wbs-mcp-agent-surface` M2), naming the root when the page read it (the
 * admin-only trusted issuer list carries it), else asking for it.
 */
export function audienceNotWbsText(audienceRoot: string | null): string {
  return audienceRoot === null
    ? 'The audience must be WBS’s authorization server or a path under it (ask an admin for the value).'
    : `The audience must be ${audienceRoot} or a path under it.`;
}

/** The act a machine credential refusal answers; a create names its source. */
export type CredentialOperation = 'read' | 'create-api-key' | 'create-oidc' | 'rotate' | 'revoke';

/**
 * What a machine credential refusal says, or the page-level loss it is. A
 * `forbidden` read is a viewer's; a `forbidden` write is a member naming an
 * agent of another account (A7). `invalid_body` on a create is the name be-01
 * refuses for looking like a secret (A24) or for its length.
 *
 * Proof: 2026-10-22, answering `name_taken` with the `not_found` copy failed
 * `renders name_taken` in `machine-credentials-panel.test.tsx`.
 */
export function credentialRefusal(
  refusal: MachineCredentialRefusal,
  operation: CredentialOperation,
  audienceRoot: string | null,
): RefusalOutcome {
  switch (refusal.error) {
    case 'unauthenticated':
    case 'organization_context_changed':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(refusal.error);
    case 'sso_required':
    case 'reauthentication_required':
      return lostAccess(refusal);
    case 'forbidden':
      return said(
        operation === 'read'
          ? 'Your role cannot view machine credentials.'
          : 'You can manage credentials only for agents bound to your own account.',
      );
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'invalid_body':
      // Proof: 2026-10-22, answering the name sentence for every create failed
      // `renders invalid_body on an oidc create as name, subject or audience`.
      switch (operation) {
        case 'create-api-key':
          return said(
            'Choose a plain name of at most 80 characters that does not look like a key or token.',
          );
        case 'create-oidc':
          return said(
            'Check the name, subject and audience: each must be plain text that does not look like a key or token.',
          );
        default:
          return said(RELOAD);
      }
    case 'invalid_json':
    case 'invalid_params':
    case 'invalid_query':
    case 'invalid_origin':
      return said(RELOAD);
    case 'unknown_person':
      return said('That agent person is no longer in this organization. Refresh the list.');
    case 'unknown_trusted_issuer':
      return said('That trusted issuer is no longer registered. Refresh the list.');
    case 'person_not_bound':
      return said(
        'That agent person is not bound to an account. Bind it on the Directory page first.',
      );
    case 'account_not_member':
      return said('The account bound to that agent person is no longer a member here.');
    case 'name_taken':
      return said('A live credential already has this name. Choose another name.');
    case 'subject_taken':
      return said('Another credential of this trusted issuer already admits this subject.');
    case 'not_found':
      return said('This credential is not available for this action. Refresh the list.');
    case 'rotation_in_progress':
      return said('This key is already rotating. Rotate again after its window ends.');
    case 'rotation_at_issuer':
      return said('This credential rotates at its issuer, not in WBS.');
    case 'audience_not_wbs':
      return said(audienceNotWbsText(audienceRoot));
    default:
      return unreachable(refusal);
  }
}

/**
 * What a trusted issuer refusal says, or the page-level loss it is.
 *
 * Proof: 2026-10-22, dropping the count from `in_use` failed `shows in_use
 * with its count` in `trusted-issuers-section.test.tsx`.
 */
export function trustedIssuerRefusal(
  refusal: TrustedIssuerRefusal,
  audienceRoot: string | null,
): RefusalOutcome {
  switch (refusal.error) {
    case 'unauthenticated':
    case 'organization_context_changed':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(refusal.error);
    case 'sso_required':
    case 'reauthentication_required':
      return lostAccess(refusal);
    case 'forbidden':
      return said('Only an admin can manage trusted issuers.');
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'invalid_body':
      return said(
        'Enter a public HTTPS issuer URL (no IP address or private name, no query or fragment) and an audience.',
      );
    case 'invalid_json':
    case 'invalid_params':
    case 'invalid_query':
    case 'invalid_origin':
      return said(RELOAD);
    case 'unknown_sso_connection':
      return said('That company sign-in connection is not in this organization.');
    case 'issuer_unreachable':
      return said('The issuer’s discovery document could not be fetched.');
    case 'issuer_mismatch':
      return said('The discovery document names a different issuer.');
    case 'issuer_reserved':
      return said('This is WBS’s own sign-in issuer; it cannot be trusted for machines.');
    case 'issuer_not_oidc':
      return said('The discovery document has no HTTPS key set (jwks_uri).');
    case 'sso_connection_unproven':
      return said('Prove the company sign-in connection before choosing it.');
    case 'issuer_taken':
      return said('This issuer is already trusted.');
    case 'audience_taken':
      return said(
        'Another organization already trusts this issuer with this audience. Choose another audience.',
      );
    case 'trusted_issuer_limit':
      return said('This organization already trusts eight issuers. Remove one first.');
    case 'audience_not_wbs':
      return said(audienceNotWbsText(audienceRoot));
    case 'not_found':
      return said('This trusted issuer is no longer registered. Refresh the list.');
    case 'in_use':
      return said(
        `Revoke the ${String(refusal.machineCredentials)} live ${
          refusal.machineCredentials === 1 ? 'credential' : 'credentials'
        } naming this issuer before removing it.`,
      );
    default:
      return unreachable(refusal);
  }
}
