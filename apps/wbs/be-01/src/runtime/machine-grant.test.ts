import { describe, expect, it } from 'bun:test';
import { SignJWT } from 'jose';

import {
  importMachineGrantKeys,
  MACHINE_GRANT_AUDIENCE,
  MACHINE_GRANT_TOKEN_TYPE,
  type MachineGrantKeys,
  machineGrantVerifier,
} from './machine-grant';

const CURRENT = 'grant-key-g-0123456789abcdefghijklmn';
const PREVIOUS = 'grant-key-n-0123456789abcdefghijklmn';
const NOW = Date.UTC(2026, 9, 26, 9, 0, 0);
const NOW_SECONDS = NOW / 1000;

/** A grant under the current key, `iat` and `aud` as given. */
function grant(
  keys: MachineGrantKeys,
  claims: { readonly iat?: number; readonly aud?: string | string[] } = {},
): Promise<string> {
  const iat = claims.iat ?? NOW_SECONDS;
  return new SignJWT({ person_id: 'claire', org: 'org-a', scope: 'read write' })
    .setProtectedHeader({ alg: 'HS256', typ: MACHINE_GRANT_TOKEN_TYPE, kid: keys.current.kid })
    .setIssuer('wbs')
    .setAudience(claims.aud ?? MACHINE_GRANT_AUDIENCE)
    .setSubject('credential-1')
    .setJti(crypto.randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(iat + 600)
    .sign(keys.current.key);
}

/** The message an import rejected with; `imported` when it resolved. */
function refusalOf(attempt: Promise<unknown>): Promise<string> {
  return attempt.then(
    () => 'imported',
    (cause: unknown) => (cause instanceof Error ? cause.message : 'a non-error rejection'),
  );
}

describe('importMachineGrantKeys', () => {
  it('refuses a previous key equal to the current one', async () => {
    expect(
      await refusalOf(importMachineGrantKeys({ current: CURRENT, previous: CURRENT })),
    ).toContain('must differ');
    expect(
      (await importMachineGrantKeys({ current: CURRENT, previous: PREVIOUS })).previous,
    ).not.toBeNull();
  });

  it('refuses a secret of too few distinct characters', async () => {
    expect(
      await refusalOf(importMachineGrantKeys({ current: 'g'.repeat(32), previous: null })),
    ).toContain('distinct characters');
    expect(
      await refusalOf(importMachineGrantKeys({ current: 'ab'.repeat(20), previous: null })),
    ).toContain('distinct characters');
  });

  it('derives a stable kid per key that is not the SHA-256 prefix of the secret', async () => {
    const once = await importMachineGrantKeys({ current: CURRENT, previous: PREVIOUS });
    const again = await importMachineGrantKeys({ current: CURRENT, previous: null });
    expect(once.current.kid).toBe(again.current.kid);
    expect(once.current.kid).not.toBe(once.previous?.kid);
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(CURRENT)),
    );
    expect(once.current.kid).not.toBe(Buffer.from(digest).toString('base64url').slice(0, 16));
  });
});

describe('machineGrantVerifier', () => {
  it('refuses a grant whose audience is an array naming the grant audience', async () => {
    const keys = await importMachineGrantKeys({ current: CURRENT, previous: null });
    const verify = machineGrantVerifier(keys, () => NOW);
    expect((await verify(await grant(keys))).kind).toBe('verified');
    expect(
      (await verify(await grant(keys, { aud: [MACHINE_GRANT_AUDIENCE, 'elsewhere'] }))).kind,
    ).toBe('refused');
  });

  it('refuses a grant issued more than 60 s in the future, and admits one 30 s ahead', async () => {
    const keys = await importMachineGrantKeys({ current: CURRENT, previous: null });
    const verify = machineGrantVerifier(keys, () => NOW);
    expect((await verify(await grant(keys, { iat: NOW_SECONDS + 30 }))).kind).toBe('verified');
    expect((await verify(await grant(keys, { iat: NOW_SECONDS + 61 }))).kind).toBe('refused');
  });
});
