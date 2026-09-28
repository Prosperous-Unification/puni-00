import { createDomainChallenge, listOrganizationDomains } from '@wbs/contracts';
import { isCanonicalDomain } from '@wbs/domain';

import type { Clock } from '../ports/clock';
import type { DomainChallenges } from '../ports/domain-challenges';
import type { OrganizationAccess } from '../ports/organization-access';
import { bind, type HttpReply } from './endpoint';
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
