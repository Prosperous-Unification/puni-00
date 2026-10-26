import {
  type AdmittedMachineProof,
  type AuthenticationRefusal,
  isSecretShaped,
  machineGrantTermsOf,
  type MachineTokenAudit,
  type PresentedMachineCredential,
} from '@wbs/core';
import { MOST_CHARACTERS_IN_A_RUN_ID } from '@wbs/core/service/command-fields';

import { assertionTypeOf, type MachineGrantKeys, signMachineGrant } from './machine-grant';

/** What mcp-01's token endpoint asks be-01 for one grant (`wbs-mcp-agent-surface` M2, M3). */
export interface MachineGrantRequest {
  /** mcp-01's canonical authorization server, compared with be-01's own setting. */
  readonly issuer: string;
  readonly credential: PresentedMachineCredential;
  /** The `exp` mcp-01 wants, in seconds. */
  readonly expiresAt: number;
  /** The opted-in `wbs_run` (M15). */
  readonly run?: string;
}

/** be-01's answer to one grant request. */
export type MachineGrantOutcome =
  | {
      readonly kind: 'issued';
      readonly grant: string;
      readonly credentialId: string;
      readonly personId: string;
      readonly organizationId: string;
      readonly scopes: readonly ('read' | 'write')[];
      readonly expiresAt: number;
      readonly runId: string | null;
    }
  | { readonly kind: 'not_activated' | 'invalid_body' }
  | { readonly kind: 'refused'; readonly refusal: AuthenticationRefusal }
  | { readonly kind: 'unsupported_assertion_type'; readonly typ: string };

/** Issues machine grants; see {@link machineGrantAuthority}. */
export interface MachineGrantAuthority {
  issue(request: MachineGrantRequest): Promise<MachineGrantOutcome>;
}

/** What {@link machineGrantAuthority} reads. */
export interface MachineGrantAuthorityDependencies {
  readonly activationState: () => 'pre_activation' | 'activated';
  /** Null when `WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT` is not configured. */
  readonly keys: MachineGrantKeys | null;
  /** `WBS_MCP_AUTHORIZATION_SERVER`, null when not configured. */
  readonly authorizationServer: string | null;
  readonly admitProof: (
    presented: PresentedMachineCredential,
  ) => Promise<AdmittedMachineProof | AuthenticationRefusal>;
  readonly audit: MachineTokenAudit;
  readonly now: () => number;
  readonly newId?: () => string;
}

/**
 * Machine grant issuance (`wbs-mcp-agent-surface` M2, M3, M5), in this order:
 *
 * 1. Before the organization activation marker nothing is issued
 *    (`not_activated`).
 * 2. A grant key or the authorization server missing after activation, or
 *    mcp-01 naming another authorization server, is a server fault: it
 *    throws, never refuses and never defaults.
 * 3. A run that is empty, longer than 256 characters or shaped like a secret
 *    is `invalid_body`: it would be written to the audit row.
 * 4. An assertion whose `typ` is neither absent nor `JWT` is
 *    `unsupported_assertion_type`, before any verification.
 * 5. The proof is admitted through the `/api` verifiers ({@link
 *    MachineGrantAuthorityDependencies.admitProof}); no `jti` is consumed, so
 *    one workload token serves many processes until its `exp`.
 * 6. The terms ({@link machineGrantTermsOf}): `unknown_identity` for a
 *    non-member account, `invalid_body` for an `exp` not after now.
 * 7. The bounded audit row (M3), then the grant, signed with the current
 *    grant key.
 *
 * @throws on the faults of step 2 and every verifier, store or signing failure.
 */
export function machineGrantAuthority(
  deps: MachineGrantAuthorityDependencies,
): MachineGrantAuthority {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  return {
    async issue(request) {
      // Proof: with this check removed, `issues nothing before activation`
      // (machine-grant.controller.db.test.ts) answered 200 with a grant;
      // watched 2026-10-26.
      if (deps.activationState() !== 'activated') return { kind: 'not_activated' };
      if (deps.keys === null || deps.authorizationServer === null)
        throw new Error(
          'machine grants are requested after activation, but WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT or WBS_MCP_AUTHORIZATION_SERVER is not configured',
        );
      if (request.issuer !== deps.authorizationServer)
        throw new Error(
          `mcp-01 names authorization server ${request.issuer}, but WBS_MCP_AUTHORIZATION_SERVER is ${deps.authorizationServer}`,
        );
      const runId = request.run ?? null;
      if (
        runId !== null &&
        (runId.length === 0 || runId.length > MOST_CHARACTERS_IN_A_RUN_ID || isSecretShaped(runId))
      )
        return { kind: 'invalid_body' };
      if (request.credential.kind === 'oidc') {
        const declared = assertionTypeOf(request.credential.assertion);
        if (declared.kind === 'malformed') return { kind: 'refused', refusal: 'invalid_token' };
        if (declared.typ !== null && declared.typ !== 'JWT')
          return { kind: 'unsupported_assertion_type', typ: declared.typ };
      }
      const admitted = await deps.admitProof(request.credential);
      if (typeof admitted === 'string') return { kind: 'refused', refusal: admitted };
      const now = deps.now();
      const terms = machineGrantTermsOf(
        admitted.actor,
        {
          requestedExpiresAt: request.expiresAt,
          assertionExpiresAt: admitted.assertionExpiresAt,
          runId,
        },
        now,
      );
      if (terms === 'unknown_identity') return { kind: 'refused', refusal: terms };
      if (terms === 'no_lifetime') return { kind: 'invalid_body' };
      await deps.audit.record(
        {
          credentialId: terms.credentialId,
          organizationId: terms.organizationId,
          accountId: terms.accountId,
          personId: terms.personId,
          source: admitted.source,
          runId,
        },
        deps.now,
        newId,
      );
      return {
        kind: 'issued',
        grant: await signMachineGrant(deps.keys, terms, admitted.source),
        credentialId: terms.credentialId,
        personId: terms.personId,
        organizationId: terms.organizationId,
        scopes: terms.scopes,
        expiresAt: terms.expiresAt,
        runId,
      };
    },
  };
}

/**
 * The authority of a composition without machine grants: nothing is issued
 * before activation, and after it a request is the same server fault a
 * missing key is. Production boot refuses to start activated without them.
 */
export const NO_MACHINE_GRANTS: MachineGrantAuthority = {
  issue: () => Promise.reject(new Error('machine grants are not composed')),
};
