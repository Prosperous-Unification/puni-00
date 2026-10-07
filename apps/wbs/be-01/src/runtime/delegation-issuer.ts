import type { DelegationIssuer, DelegationSourceResolver } from '@wbs/core';
import { SignJWT } from 'jose';

import { DELEGATION_ISSUER, DELEGATION_TOKEN_TYPE, MOST_DELEGATION_SECONDS } from './delegation';

/** A verified source lacks the authority or scope to mint the requested bearer. */
export class DelegationSourceIneligible extends Error {}

/** Production refusal until a credential-binding adapter and activation ship. */
export const REFUSE_DELEGATION_ISSUANCE: DelegationIssuer = () =>
  Promise.reject(new Error('delegation issuance is inactive'));

/** A trusted, credential-bound source and server-selected audience are required to issue. */
export function delegationIssuer(
  key: CryptoKey,
  resolveSource: DelegationSourceResolver,
  isMember: (userId: string, organizationId: string) => Promise<boolean>,
  now: () => number = Date.now,
): DelegationIssuer {
  return async (credential, audience, scopes, organizationId) => {
    // Proof: bypassing this resolution admitted caller-supplied source claims in
    // `refuses forged source claims before signing` (2026-09-28).
    const source = await resolveSource(credential, organizationId);
    const issuedAt = Math.floor(now() / 1000);
    // Proof: replacing the originating credential's expiry with a five-minute
    // value failed `caps a verified source to five minutes and its credential
    // expiry` for a 90-second source (2026-09-28).
    const expiresAt = Math.min(
      Math.floor(source.credentialExpiresAt / 1000),
      issuedAt + MOST_DELEGATION_SECONDS,
    );
    // Proof: removing the five-minute cap made `caps a verified source to five
    // minutes and its credential expiry` fail (2026-09-28).
    // Proof: removing the missing-binding, delegated-source, membership or scope-ceiling check
    // separately failed `refuses delegated, expired, unbound, over-scoped or
    // nonmember sources`; each mutation was watched on 2026-09-28.
    if (
      expiresAt <= issuedAt ||
      // Proof (2026-09-28): removing this refusal made `issues a direct
      // context with a native identity and fixed audience` issue from a
      // delegated source.
      source.delegated ||
      ![source.userId, source.organizationId].every((value) => value.length > 0) ||
      (source.kind === 'verified-wbs-credential' &&
        ![source.client, source.grant, source.upstreamIssuer, source.upstreamSubject].every(
          (value) => value.length > 0,
        )) ||
      // Proof (2026-09-28): skipping the identity-kind/audience match made
      // `issues a direct context with a native identity and fixed audience`
      // sign a native context for the gateway audience.
      (source.kind === 'verified-first-party-credential') !== (audience === 'wbs-be-01/direct') ||
      scopes.length === 0 ||
      // Proof (2026-09-28): skipping the ceiling made `issues a direct
      // context with a native identity and fixed audience` issue write from
      // a read-only source.
      !scopes.every((scope) => source.scopeCeiling.includes(scope)) ||
      // Proof (2026-09-28): replacing this check with false made `issues a
      // direct context with a native identity and fixed audience` resolve
      // for a nonmember source.
      !(await isMember(source.userId, source.organizationId))
    ) {
      throw new DelegationSourceIneligible('delegation source is not eligible');
    }
    // Proof (2026-09-28): requiring upstream fields on a native session made
    // `issues a direct context with a native identity and fixed audience` fail.
    const identity =
      source.kind === 'verified-first-party-credential'
        ? { identity_kind: 'first_party' }
        : {
            client: source.client,
            grant: source.grant,
            upstream_iss: source.upstreamIssuer,
            upstream_sub: source.upstreamSubject,
          };
    return new SignJWT({
      org: source.organizationId,
      scope: scopes.join(' '),
      ...identity,
    })
      .setProtectedHeader({ alg: 'RS256', typ: DELEGATION_TOKEN_TYPE })
      .setIssuer(DELEGATION_ISSUER)
      .setSubject(source.userId)
      .setAudience(audience)
      .setJti(crypto.randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(key);
  };
}
