import {
  createDomainChallenge,
  listOrganizationDomains,
  releaseDomainClaim,
  rotateDomainProof,
  verifyDomainClaim,
} from '@wbs/contracts';
import { isCanonicalDomain } from '@wbs/domain';

import type { Clock } from '../ports/clock';
import type { DomainChallenges } from '../ports/domain-challenges';
import type { OrganizationAccess } from '../ports/organization-access';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** Turns a submitted Unicode host into one exact lower-case IDNA DNS name. */
function canonicalDomain(submitted: string): string | null {
  const raw = submitted.trim().replace(/\.$/, '');
  // Proof: 2026-09-28, allowing `%` or `\\` separately made mounted
  // `canonicalizes exact IDNA names and refuses malformed, provider, relay and
  // suffix domains` accept a rewritten host with 201 instead of 400.
  if (!/^[^\s:/?#@%\\]+$/.test(raw)) return null;
  try {
    const host = new URL(`http://${raw}`).hostname;
    if (/^\d+(?:\.\d+){3}$/.test(host) || (host === raw && !host.includes('.'))) return null;
    return isCanonicalDomain(host) ? host : null;
  } catch {
    return null;
  }
}

/** Domain listing and 24-hour initial TXT challenge issuance. */
export function domainRoutes(
  organizations: OrganizationAccess,
  challenges: DomainChallenges,
  clock: Pick<Clock, 'now'>,
) {
  return [
    bind(
      releaseDomainClaim,
      async ({ principal, params }): Promise<HttpReply<typeof releaseDomainClaim>> => {
        // Proof: 2026-09-28, bypassing this guard made mounted
        // `refuses a delegated caller even with current super-admin membership`
        // answer not_found rather than insufficient_scope for domain release.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const released = await challenges.releaseClaim(
          resolved.access.scope.organizationId,
          principal.id,
          params.id,
        );
        switch (released) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return { ok: false, status: 403, body: { error: 'forbidden' } };
          case 'not_found':
            return { ok: false, status: 404, body: { error: 'not_found' } };
          case 'stale':
            return { ok: false, status: 409, body: { error: 'stale' } };
          case 'released':
            return { ok: true, status: 204, body: EMPTY };
        }
      },
    ),
    bind(
      rotateDomainProof,
      async ({ principal, params }): Promise<HttpReply<typeof rotateDomainProof>> => {
        // Proof: 2026-09-28, bypassing this guard made mounted `refuses a
        // delegated caller even with current super-admin membership` return 404 instead of 403.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
        const now = clock.now();
        const rotated = await challenges.rotateClaim(
          resolved.access.scope.organizationId,
          principal.id,
          params.id,
          token,
          { at: now, by: principal.id },
        );
        switch (rotated.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return { ok: false, status: 403, body: { error: 'forbidden' } };
          case 'not_found':
            return { ok: false, status: 404, body: { error: 'not_found' } };
          case 'stale':
            return { ok: false, status: 409, body: { error: 'stale' } };
          case 'issued':
            return {
              ok: true,
              status: 201,
              body: {
                id: params.id,
                domain: rotated.domain,
                dnsName: `_wbs-verification.${rotated.domain}`,
                dnsValue: rotated.dnsValue,
                expiresAt: now + 86_400_000,
              },
            };
        }
      },
    ),
    bind(
      verifyDomainClaim,
      async ({ principal, params }): Promise<HttpReply<typeof verifyDomainClaim>> => {
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const organizationId = resolved.access.scope.organizationId;
        const claim = await challenges.readClaimForVerification(
          organizationId,
          principal.id,
          params.id,
        );
        if (claim === 'inactive') return organizationRefusal('no_active_organization');
        if (claim === 'forbidden') return { ok: false, status: 403, body: { error: 'forbidden' } };
        if (claim === 'not_found') return { ok: false, status: 404, body: { error: 'not_found' } };
        if (claim === 'stale') return { ok: false, status: 409, body: { error: 'stale' } };
        const now = clock.now();
        // Proof: 2026-09-28, treating a retained proof's null expiry as zero made mounted
        // `restores a suspended claim through retained TXT proof without changing owner`
        // return stale 409 instead of checking authoritative TXT.
        if (claim.challengeExpiresAt !== null && claim.challengeExpiresAt <= now)
          return { ok: false, status: 409, body: { error: 'stale' } };
        // Proof: 2026-09-28, raising this bound to 50 seconds made mounted
        // `refuses malformed and timed-out resolver answers` exceed its 8-second test deadline.
        const signal = AbortSignal.timeout(5_000);
        let records: readonly string[];
        try {
          // The resolver port must query authoritative DNS and reject malformed replies.
          records = await Promise.race([
            challenges.resolver.lookupTxt(`_wbs-verification.${claim.domain}`, signal),
            new Promise<never>((_resolve, reject) => {
              signal.addEventListener(
                'abort',
                () => {
                  reject(new Error('DNS timeout'));
                },
                { once: true },
              );
            }),
          ]);
          // Proof: 2026-09-28, bypassing this response validation made mounted
          // `refuses malformed and timed-out resolver answers` return 500 instead of 503 for a non-string TXT record.
          if (!Array.isArray(records) || !records.every((record) => typeof record === 'string'))
            throw new Error('malformed DNS TXT response');
        } catch {
          return { ok: false, status: 503, body: { error: 'dns_unavailable' } };
        }
        // Exact full TXT record matching prevents prefixes, fragments and old tokens.
        const prefix = `wbs-domain-verification=${organizationId}:${claim.domain}:`;
        const matching = records.filter(
          (record) =>
            record.startsWith(prefix) &&
            /^wbs-domain-verification=[^:]+:[^:]+:[a-f0-9]{64}$/.test(record),
        );
        const digests = await Promise.all(
          matching.map(async (record) =>
            Array.from(
              new Uint8Array(
                await crypto.subtle.digest('SHA-256', new TextEncoder().encode(record)),
              ),
              (byte) => byte.toString(16).padStart(2, '0'),
            ).join(''),
          ),
        );
        // Proof: 2026-09-28, bypassing the exact digest match made mounted `verifies only an exact current TXT value` promote a prefix-plus-extra TXT value (200 instead of 409).
        if (!digests.includes(claim.challengeDigest))
          return { ok: false, status: 409, body: { error: 'proof_mismatch' } };
        const verified = await challenges.verifyClaim(
          organizationId,
          principal.id,
          claim,
          claim.challengeDigest,
          { at: clock.now(), by: principal.id },
        );
        switch (verified) {
          case 'verified':
            return { ok: true, status: 200, body: { id: claim.id, status: 'verified' } };
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return { ok: false, status: 403, body: { error: 'forbidden' } };
          case 'not_found':
            return { ok: false, status: 404, body: { error: 'not_found' } };
          case 'taken':
            return { ok: false, status: 409, body: { error: 'domain_taken' } };
          case 'stale':
            return { ok: false, status: 409, body: { error: 'stale' } };
        }
      },
    ),
    bind(
      listOrganizationDomains,
      async ({ principal }): Promise<HttpReply<typeof listOrganizationDomains>> => {
        // Proof: 2026-09-28, bypassing this GET guard made mounted `refuses a
        // delegated caller` expose the domain list instead of answering 403.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const claims = await challenges.listClaims(
          resolved.access.scope.organizationId,
          principal.id,
        );
        if (claims === 'forbidden') return { ok: false, status: 403, body: { error: 'forbidden' } };
        return { ok: true, status: 200, body: { domains: [...claims] } };
      },
    ),
    bind(
      createDomainChallenge,
      async ({ principal, body }): Promise<HttpReply<typeof createDomainChallenge>> => {
        // Proof: 2026-09-28, bypassing this POST guard made mounted `refuses a
        // delegated caller` issue a challenge instead of answering 403.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const domain = canonicalDomain(body.domain);
        if (domain === null) return { ok: false, status: 400, body: { error: 'invalid_domain' } };
        // A full 32 random bytes are carried by each new challenge. Reissue
        // replaces its digest in the store's immediate transaction.
        // Proof: 2026-09-28, using 16 bytes made `reissues one pending row and
        // invalidates the old digest` receive a 32-hex rather than 64-hex token.
        const random = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
        const dnsValue = `wbs-domain-verification=${resolved.access.scope.organizationId}:${domain}:${random}`;
        const bytes = new TextEncoder().encode(dnsValue);
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          (byte) => byte.toString(16).padStart(2, '0'),
        ).join('');
        const now = clock.now();
        // Proof: 2026-09-28, using one hour made `reissues one pending row and
        // invalidates the old digest` receive an expiry outside its 24-hour bound.
        const expiresAt = now + 24 * 60 * 60 * 1000;
        const issued = await challenges.reissueClaim(
          resolved.access.scope.organizationId,
          principal.id,
          domain,
          digest,
          expiresAt,
          { at: now, by: principal.id },
        );
        switch (issued.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return { ok: false, status: 403, body: { error: 'forbidden' } };
          case 'unclaimable':
            return { ok: false, status: 409, body: { error: 'unclaimable' } };
          case 'already_claimed':
            return { ok: false, status: 409, body: { error: 'already_claimed' } };
          case 'issued':
            return {
              ok: true,
              status: 201,
              body: {
                id: issued.id,
                domain,
                dnsName: `_wbs-verification.${domain}`,
                dnsValue,
                expiresAt,
              },
            };
        }
      },
    ),
  ] as const;
}
