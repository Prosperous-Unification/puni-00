import { describe, expect, it } from 'bun:test';

import { actingPersonOf, credentialPinOf } from './principal';

describe('actingPersonOf', () => {
  // Proof: answering null for every pin made this fail on `Expected: "codex"`,
  // `Received: null` (1 pass, 1 fail; watched 2026-10-26).
  it('acts as the agent person of a consent or machine credential', () => {
    expect(
      actingPersonOf(
        credentialPinOf({
          kind: 'consent',
          issuer: 'https://idp.example/',
          subject: 'dany',
          credentialId: 'consent-1',
          personId: 'codex',
        }),
      ),
    ).toBe('codex');
    expect(
      actingPersonOf(
        credentialPinOf({ kind: 'machine', credentialId: 'key-1', personId: 'codex' }),
      ),
    ).toBe('codex');
  });

  it('is the account itself for an upstream pair, a password session or no credential', () => {
    expect(
      actingPersonOf(
        credentialPinOf({ kind: 'upstream', issuer: 'https://idp.example/', subject: 'dany' }),
      ),
    ).toBeNull();
    expect(actingPersonOf(credentialPinOf({ kind: 'first_party', issuedAt: 1 }))).toBeNull();
    expect(actingPersonOf(credentialPinOf(undefined))).toBeNull();
  });
});
