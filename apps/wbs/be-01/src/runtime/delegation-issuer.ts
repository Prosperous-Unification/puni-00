import type { DelegationIssuer, DelegationSourceResolver } from '@wbs/core';
import { SignJWT } from 'jose';

import { DELEGATION_ISSUER, DELEGATION_TOKEN_TYPE, MOST_DELEGATION_SECONDS } from './delegation';

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
  return async (credential, audience, scopes) => {
    // Proof: bypassing this resolution admitted caller-supplied source claims in
    // `refuses forged source claims before signing` (2026-09-28).
    const source = await resolveSource(credential);
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
      source.delegated ||
      ![
        source.userId,
        source.organizationId,
        source.client,
        source.grant,
        source.upstreamIssuer,
        source.upstreamSubject,
      ].every((value) => value.length > 0) ||
      scopes.length === 0 ||
      !scopes.every((scope) => source.scopeCeiling.includes(scope)) ||
      !(await isMember(source.userId, source.organizationId))
    ) {
      throw new Error('delegation source is not eligible');
    }
    return new SignJWT({
      org: source.organizationId,
      client: source.client,
      grant: source.grant,
      scope: scopes.join(' '),
      upstream_iss: source.upstreamIssuer,
      upstream_sub: source.upstreamSubject,
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
