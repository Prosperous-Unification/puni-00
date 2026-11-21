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
import { retainSecurityPrincipal } from '../ports/security-principal';
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
    // Proof: 2026-09-28, omitting the TXT owner-name length check made mounted
    // `refuses a domain whose complete TXT challenge hostname exceeds DNS length`
    // issue 201 for a 244-character domain and a 262-character DNS name.
    return isCanonicalDomain(host) && `_wbs-verification.${host}`.length <= 253 ? host : null;
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
        // Proof: bypassing this HTTP refusal (http-domain-nondelegation-0) failed `refuses a delegated caller even with current super-admin membership`; restored GREEN.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        // Proof: retaining the caller alias across organization resolution (route-snapshot-domain-release) failed `retains the route security principal across organization resolution at domain-release: id`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const released = await challenges.releaseClaim(
          resolved.access.scope.organizationId,
          actor,
          params.id,
        );
        switch (released) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return {
              ok: false,
              status: 403,
              // Proof: dropping this permission property (http-permission-domain-release) failed `encodes a current grant denial before effects at domain-release`; restored GREEN.
              body: { error: 'forbidden', permission: 'organization.manage_security' },
            };
          case 'not_found':
            return { ok: false, status: 404, body: { error: 'not_found' } };
          case 'stale':
            return { ok: false, status: 409, body: { error: 'stale' } };
          case 'sso_connection_exists':
            return { ok: false, status: 409, body: { error: 'sso_connection_exists' } };
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
        // Proof: bypassing this HTTP refusal (http-domain-nondelegation-1) failed `refuses a delegated caller even with current super-admin membership`; restored GREEN.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        // Proof: retaining the caller alias across organization resolution (route-snapshot-domain-rotate) failed `retains the route security principal across organization resolution at domain-rotate: id`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
        const now = clock.now();
        const rotated = await challenges.rotateClaim(
          resolved.access.scope.organizationId,
          actor,
          params.id,
          token,
          { at: now, by: actor.id },
        );
        switch (rotated.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return {
              ok: false,
              status: 403,
              // Proof: dropping this permission property (http-permission-domain-rotate) failed `encodes a current grant denial before effects at domain-rotate`; restored GREEN.
              body: { error: 'forbidden', permission: 'organization.manage_security' },
            };
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
        // Proof: 2026-09-28, removing this guard made mounted `refuses a
        // delegated caller even with current super-admin membership` promote
        // a matching claim, 200 instead of 403.
        // Proof: bypassing this HTTP refusal (http-domain-nondelegation-2) failed `refuses a delegated caller even with current super-admin membership`; restored GREEN.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        // Proof: retaining the caller alias across organization resolution (route-snapshot-domain-verify) failed `retains the route security principal across organization resolution at domain-verify: id`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const organizationId = resolved.access.scope.organizationId;
        const claim = await challenges.readClaimForVerification(organizationId, actor, params.id);
        if (claim === 'inactive') return organizationRefusal('no_active_organization');
        if (claim === 'forbidden')
          return {
            ok: false,
            status: 403,
            // Proof: dropping this permission property (http-permission-domain-verify) failed `encodes a current grant denial before effects at domain-verify`; restored GREEN.
            body: { error: 'forbidden', permission: 'organization.manage_security' },
          };
        if (claim === 'not_found') return { ok: false, status: 404, body: { error: 'not_found' } };
        if (claim === 'stale') return { ok: false, status: 409, body: { error: 'stale' } };
        const now = clock.now();
        // Proof: 2026-09-28, treating a retained proof's null expiry as zero made mounted
        // `restores a suspended claim through retained TXT proof without changing owner`
        // return stale 409 instead of checking authoritative TXT.
        // Proof: 2026-09-28, applying the old-proof overlap deadline to a
        // replacement made mounted `confirms a replacement proof after the
        // old-proof overlap ends` answer 409 instead of verifying the new TXT.
        if (claim.phase === 'pending' && claim.challengeExpiresAt <= now)
          return { ok: false, status: 409, body: { error: 'stale' } };
        // Proof: 2026-09-28, raising this bound to 50 seconds made mounted
        // `refuses malformed and timed-out resolver answers` observe 50,000
        // instead of 5,000 through its injected short timer.
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
          actor,
          claim,
          claim.challengeDigest,
          { at: clock.now(), by: actor.id },
          () => clock.now(),
        );
        switch (verified) {
          case 'verified':
            return { ok: true, status: 200, body: { id: claim.id, status: 'verified' } };
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return {
              ok: false,
              status: 403,
              // Proof: dropping this permission property (http-permission-domain-verify-commit) failed `rechecks current security grants after the lookup`; restored GREEN.
              body: { error: 'forbidden', permission: 'organization.manage_security' },
            };
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
        // Proof: bypassing this HTTP refusal (http-domain-nondelegation-3) failed `refuses a delegated caller even with current super-admin membership`; restored GREEN.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        // Proof: retaining the caller alias across organization resolution (route-snapshot-domain-list) failed `retains the route security principal across organization resolution at domain-list: id`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const claims = await challenges.listClaims(resolved.access.scope.organizationId, actor);
        if (claims === 'forbidden')
          return {
            ok: false,
            status: 403,
            // Proof: dropping this permission property (http-permission-domain-list) failed `encodes a current grant denial before effects at domain-list`; restored GREEN.
            body: { error: 'forbidden', permission: 'organization.manage_security' },
          };
        return { ok: true, status: 200, body: { domains: [...claims] } };
      },
    ),
    bind(
      createDomainChallenge,
      async ({ principal, body }): Promise<HttpReply<typeof createDomainChallenge>> => {
        // Proof: 2026-09-28, bypassing this POST guard made mounted `refuses a
        // delegated caller` issue a challenge instead of answering 403.
        // Proof: bypassing this HTTP refusal (http-domain-nondelegation-4) failed `refuses a delegated caller even with current super-admin membership`; restored GREEN.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        // Proof: retaining the caller alias across organization resolution (route-snapshot-domain-challenge) failed `retains the route security principal across organization resolution at domain-challenge: id`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
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
          actor,
          domain,
          digest,
          expiresAt,
          { at: now, by: actor.id },
        );
        switch (issued.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return {
              ok: false,
              status: 403,
              // Proof: dropping this permission property (http-permission-domain-challenge) failed `encodes a current grant denial before effects at domain-challenge`; restored GREEN.
              body: { error: 'forbidden', permission: 'organization.manage_security' },
            };
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
