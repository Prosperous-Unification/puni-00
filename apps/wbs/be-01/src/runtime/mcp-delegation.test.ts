import type { AuthenticatedUser } from '@wbs/contracts';
import { describe, expect, it } from 'bun:test';
import { generateKeyPair, SignJWT, UnsecuredJWT } from 'jose';

import { mcpDelegationAuthority } from './mcp-delegation';

/**
 * The expiry edges of {@link mcpDelegationAuthority} under an injected clock,
 * which the booted suite (`mcp-delegation.boot.db.test.ts`) cannot reach: its
 * OIDC verifier refuses an expired upstream token before this code runs.
 */
const ADA: AuthenticatedUser = {
  id: 'u-ada',
  username: 'ada',
  scopes: ['read', 'write'],
  authentication: { kind: 'upstream', issuer: 'https://idp.test/', subject: 'auth0|ada' },
};

async function authority(now: number) {
  const keys = await generateKeyPair('RS256');
  return mcpDelegationAuthority({
    // Stands in for the OIDC verifier: admits any token as ada.
    authenticate: () => Promise.resolve(ADA),
    choices: { list: () => Promise.resolve([]) },
    organizations: {
      resolve: () =>
        Promise.resolve({
          ok: true,
          access: {
            kind: 'scoped',
            scope: { organizationId: 'org-a', userId: 'u-ada', role: 'member' },
          },
        }),
    },
    credentialFactsOf: () => Promise.resolve(null),
    mappedUserOf: () => Promise.resolve(null),
    isMember: () => Promise.resolve(true),
    activationState: () => 'activated',
    signingKey: keys.privateKey,
    now: () => now,
  });
}

const REQUEST = {
  organizationId: 'org-a',
  userId: 'u-ada',
  client: 'client-1',
  grant: 'family-1',
  scopes: ['read'],
} as const;

describe('MCP delegation expiry', () => {
  it('issues while the upstream token is unexpired and refuses it from its expiry on', async () => {
    const expiresAt = 1_800_000_000;
    const token = new UnsecuredJWT({}).setExpirationTime(expiresAt).encode();
    expect((await (await authority(expiresAt * 1000 - 1_000)).issue(token, REQUEST)).kind).toBe(
      'issued',
    );
    // Proof: removing the `expiresAt <= now()` refusal made this answer
    // `refused` (not_a_member) from the signer instead of `unauthenticated`,
    // which mcp-01 would read as a removed member; watched 2026-10-21.
    expect(await (await authority(expiresAt * 1000)).issue(token, REQUEST)).toEqual({
      kind: 'unauthenticated',
    });
  });

  it('refuses a verified token that carries no numeric expiry', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('k'.repeat(32)));
    // Proof: removing the numeric `exp` check made this sign with an
    // undefined expiry and throw instead of answering; watched 2026-10-21.
    expect(await (await authority(Date.now())).issue(token, REQUEST)).toEqual({
      kind: 'unauthenticated',
    });
  });
});
