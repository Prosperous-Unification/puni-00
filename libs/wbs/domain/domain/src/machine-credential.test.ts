import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import {
  admitMachineCredential,
  digestsEqual,
  type MachineCredentialRecord,
  type PresentedMachineProof,
} from './machine-credential';

const NOW = 1_800_000_000_000;
const DIGEST = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const UNKNOWN = { kind: 'refused', refusal: 'unknown_identity' } as const;

function apiKey(overrides: Partial<MachineCredentialRecord> = {}): MachineCredentialRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    organizationId: 'org-a',
    personId: 'claire',
    source: 'api_key',
    boundAccountId: 'dany',
    revokedAt: null,
    trustedIssuerId: null,
    mcpFamilyId: null,
    secrets: [{ digest: DIGEST, expiresAt: null }],
    ...overrides,
  };
}

const presentedKey: PresentedMachineProof = { kind: 'api_key', digest: DIGEST };

describe('admitMachineCredential', () => {
  it('admits a live API key as its person’s bound account with read and write only', () => {
    expect(admitMachineCredential(presentedKey, apiKey(), NOW)).toEqual({
      kind: 'admitted',
      actor: {
        credentialId: '00000000-0000-4000-8000-000000000001',
        accountId: 'dany',
        organizationId: 'org-a',
        personId: 'claire',
        scopes: ['read', 'write'],
      },
    });
  });

  it('refuses an unknown credential', () => {
    expect(admitMachineCredential(presentedKey, null, NOW)).toEqual(UNKNOWN);
  });

  it('refuses a wrong secret', () => {
    expect(admitMachineCredential({ kind: 'api_key', digest: OTHER }, apiKey(), NOW)).toEqual(
      UNKNOWN,
    );
  });

  it('refuses a secret at and after its expiry, and admits it one millisecond before', () => {
    const rotated = apiKey({ secrets: [{ digest: DIGEST, expiresAt: NOW }] });
    expect(admitMachineCredential(presentedKey, rotated, NOW)).toEqual(UNKNOWN);
    expect(admitMachineCredential(presentedKey, rotated, NOW + 1)).toEqual(UNKNOWN);
    expect(admitMachineCredential(presentedKey, rotated, NOW - 1).kind).toBe('admitted');
  });

  it('admits both secrets during a rotation window', () => {
    const rotating = apiKey({
      secrets: [
        { digest: DIGEST, expiresAt: NOW + 1000 },
        { digest: OTHER, expiresAt: null },
      ],
    });
    expect(admitMachineCredential(presentedKey, rotating, NOW).kind).toBe('admitted');
    expect(admitMachineCredential({ kind: 'api_key', digest: OTHER }, rotating, NOW).kind).toBe(
      'admitted',
    );
  });

  it('refuses a revoked credential', () => {
    expect(admitMachineCredential(presentedKey, apiKey({ revokedAt: NOW - 1 }), NOW)).toEqual(
      UNKNOWN,
    );
  });

  it('refuses a credential whose person is no longer bound to an account', () => {
    expect(admitMachineCredential(presentedKey, apiKey({ boundAccountId: null }), NOW)).toEqual(
      UNKNOWN,
    );
  });

  it('refuses a proof of another source than the credential’s', () => {
    const consent = apiKey({ source: 'mcp_consent', secrets: [], mcpFamilyId: 'family-1' });
    expect(admitMachineCredential(presentedKey, consent, NOW)).toEqual(UNKNOWN);
    expect(
      admitMachineCredential({ kind: 'mcp_consent', familyId: 'family-1' }, apiKey(), NOW),
    ).toEqual(UNKNOWN);
  });

  // A secret row under a credential of another source is corrupt state, which
  // the source comparison refuses rather than trusting the secret.
  it('refuses an API key against a credential of another source holding its digest', () => {
    const oidc = apiKey({ source: 'oidc', trustedIssuerId: 'issuer-a' });
    expect(admitMachineCredential(presentedKey, oidc, NOW)).toEqual(UNKNOWN);
  });

  it('admits an OIDC credential only for its own trusted issuer', () => {
    const oidc = apiKey({ source: 'oidc', secrets: [], trustedIssuerId: 'issuer-a' });
    expect(
      admitMachineCredential({ kind: 'oidc', trustedIssuerId: 'issuer-a' }, oidc, NOW).kind,
    ).toBe('admitted');
  });

  // Two organizations trusting the same issuer URL hold two trusted-issuer
  // rows; a token verified through B's row must not reach A's credential.
  it('never admits another trusted issuer’s credential for the same subject', () => {
    const ofA = apiKey({ source: 'oidc', secrets: [], trustedIssuerId: 'issuer-of-a' });
    expect(
      admitMachineCredential({ kind: 'oidc', trustedIssuerId: 'issuer-of-b' }, ofA, NOW),
    ).toEqual(UNKNOWN);
  });

  it('admits a consent credential only for its own family', () => {
    const consent = apiKey({ source: 'mcp_consent', secrets: [], mcpFamilyId: 'family-1' });
    expect(
      admitMachineCredential({ kind: 'mcp_consent', familyId: 'family-1' }, consent, NOW).kind,
    ).toBe('admitted');
    expect(
      admitMachineCredential({ kind: 'mcp_consent', familyId: 'family-2' }, consent, NOW),
    ).toEqual(UNKNOWN);
  });

  it('refuses a revoked credential whatever its secrets’ expiries', () => {
    const expiry = fc.option(fc.integer({ min: NOW - 10_000, max: NOW + 10_000 }), { nil: null });
    fc.assert(
      fc.property(
        fc.array(fc.record({ digest: fc.constantFrom(DIGEST, OTHER), expiresAt: expiry }), {
          maxLength: 3,
        }),
        fc.integer({ min: 0, max: NOW }),
        (secrets, revokedAt) => {
          expect(admitMachineCredential(presentedKey, apiKey({ secrets, revokedAt }), NOW)).toEqual(
            UNKNOWN,
          );
        },
      ),
    );
  });
});

describe('digestsEqual', () => {
  it('answers equality of equal-length digests and refuses any length difference', () => {
    expect(digestsEqual(DIGEST, DIGEST)).toBe(true);
    expect(digestsEqual(DIGEST, `${'a'.repeat(63)}b`)).toBe(false);
    expect(digestsEqual(DIGEST, 'a'.repeat(63))).toBe(false);
  });
});
