import { describe, expect, it } from 'bun:test';

import { actingPersonOf } from './principal';

describe('actingPersonOf', () => {
  // Proof: answering null for the machine and consent arms made this fail on
  // `Expected: "codex"`, `Received: null` (watched 2026-10-26).
  it('acts as the agent person of a consent or machine credential', () => {
    expect(
      actingPersonOf({
        kind: 'consent',
        issuer: 'https://idp.example/',
        subject: 'dany',
        credentialId: 'consent-1',
        personId: 'codex',
      }),
    ).toBe('codex');
    expect(actingPersonOf({ kind: 'machine', credentialId: 'key-1', personId: 'codex' })).toBe(
      'codex',
    );
  });

  it('is the account itself for an upstream pair, a password session or no credential', () => {
    expect(
      actingPersonOf({ kind: 'upstream', issuer: 'https://idp.example/', subject: 'dany' }),
    ).toBeNull();
    expect(actingPersonOf({ kind: 'first_party', issuedAt: 1 })).toBeNull();
    expect(actingPersonOf(undefined)).toBeNull();
  });
});
