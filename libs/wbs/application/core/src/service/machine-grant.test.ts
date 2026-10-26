import {
  admitMachineCredential,
  type MachineActor,
  type MachineCredentialRecord,
  type OrganizationRole,
} from '@wbs/domain';
import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { machineGrantTermsOf, MOST_MACHINE_GRANT_SECONDS } from './machine-grant';

// A real-epoch instant (2026-10-26), in milliseconds.
const NOW = Date.UTC(2026, 9, 26, 9, 0, 0);
const NOW_SECONDS = NOW / 1000;
const CREDENTIAL = '00000000-0000-4000-8000-000000000001';
const UNKNOWN = { kind: 'refused', refusal: 'unknown_identity' } as const;

function credential(overrides: Partial<MachineCredentialRecord> = {}): MachineCredentialRecord {
  return {
    id: CREDENTIAL,
    organizationId: 'org-a',
    personId: 'claire',
    source: 'api_key',
    boundAccountId: 'dany',
    boundAccountRole: 'super_admin',
    revokedAt: null,
    expiresAt: null,
    trustedIssuerId: null,
    mcpFamilyId: null,
    secrets: [{ digest: 'a'.repeat(64), expiresAt: null }],
    ...overrides,
  };
}

const grant = {
  kind: 'grant',
  credentialId: CREDENTIAL,
  personId: 'claire',
  organizationId: 'org-a',
} as const;

function actor(role: OrganizationRole | null = 'member'): MachineActor {
  return {
    credentialId: CREDENTIAL,
    accountId: 'dany',
    organizationId: 'org-a',
    personId: 'claire',
    accountRole: role,
    scopes: ['read', 'write'],
  };
}

describe('the grant variant of admitMachineCredential', () => {
  it('admits a live API-key or OIDC credential naming the grant’s person and organization', () => {
    expect(admitMachineCredential(grant, credential(), NOW)).toEqual({
      kind: 'admitted',
      actor: {
        credentialId: CREDENTIAL,
        accountId: 'dany',
        organizationId: 'org-a',
        personId: 'claire',
        accountRole: 'super_admin',
        scopes: ['read', 'write'],
      },
    });
    const oidc = credential({ source: 'oidc', secrets: [], trustedIssuerId: 'issuer-a' });
    expect(admitMachineCredential(grant, oidc, NOW).kind).toBe('admitted');
  });

  it('never admits a consent credential, whose sessions take delegations instead', () => {
    const consent = credential({ source: 'mcp_consent', secrets: [], mcpFamilyId: 'family-1' });
    expect(admitMachineCredential(grant, consent, NOW)).toEqual(UNKNOWN);
  });

  it('refuses a grant naming another person, organization or credential', () => {
    expect(admitMachineCredential({ ...grant, personId: 'codex' }, credential(), NOW)).toEqual(
      UNKNOWN,
    );
    expect(
      admitMachineCredential({ ...grant, organizationId: 'org-b' }, credential(), NOW),
    ).toEqual(UNKNOWN);
    expect(
      admitMachineCredential({ ...grant, credentialId: 'another' }, credential(), NOW),
    ).toEqual(UNKNOWN);
  });

  it('refuses a credential whose account is no longer a member of its organization', () => {
    expect(admitMachineCredential(grant, credential({ boundAccountRole: null }), NOW)).toEqual(
      UNKNOWN,
    );
  });

  it('refuses a pool credential at and after its expiry', () => {
    expect(admitMachineCredential(grant, credential({ expiresAt: NOW }), NOW)).toEqual(UNKNOWN);
    expect(admitMachineCredential(grant, credential({ expiresAt: NOW + 1 }), NOW).kind).toBe(
      'admitted',
    );
  });

  // Revocation, binding, membership and pool expiry are judged in one place,
  // whatever else the credential holds.
  // Each nullable fact is absent a third of the time, so every refusal meets
  // otherwise live credentials within the run count.
  // Proof: with the membership predicate of `matchesProof`'s grant case
  // removed, this property and `refuses a credential whose account is no
  // longer a member of its organization` failed; with the expiry check of
  // `admitMachineCredential` removed, this property and `refuses a pool
  // credential at and after its expiry` failed; watched 2026-10-26.
  it('never admits a revoked, unbound, non-member or expired-pool credential', () => {
    const absentOrOne = <T>(value: fc.Arbitrary<T>) => fc.option(value, { nil: null, freq: 2 });
    fc.assert(
      fc.property(
        fc.record({
          revokedAt: absentOrOne(fc.integer({ min: 0, max: NOW })),
          boundAccountId: absentOrOne(fc.constantFrom('dany', 'mem')),
          boundAccountRole: absentOrOne(
            fc.constantFrom<OrganizationRole>('super_admin', 'admin', 'member', 'viewer'),
          ),
          expiresAt: absentOrOne(fc.integer({ min: NOW - 10_000, max: NOW + 10_000 })),
          source: fc.constantFrom<'api_key' | 'oidc'>('api_key', 'oidc'),
        }),
        (shape) => {
          const admission = admitMachineCredential(grant, credential(shape), NOW);
          const live =
            shape.revokedAt === null &&
            shape.boundAccountId !== null &&
            shape.boundAccountRole !== null &&
            (shape.expiresAt === null || shape.expiresAt > NOW);
          expect(admission.kind).toBe(live ? 'admitted' : 'refused');
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('machineGrantTermsOf', () => {
  it('caps exp at the request, the grant cap and the assertion, whichever is first', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 * 24 * 60 * 60 }),
        fc.option(fc.integer({ min: 1, max: 3 * 24 * 60 * 60 }), { nil: null }),
        (requestedIn, assertionIn) => {
          const requested = NOW_SECONDS + requestedIn;
          const assertion = assertionIn === null ? null : NOW_SECONDS + assertionIn;
          const terms = machineGrantTermsOf(
            actor(),
            { requestedExpiresAt: requested, assertionExpiresAt: assertion, runId: null },
            NOW,
          );
          if (typeof terms === 'string') throw new Error(`refused: ${terms}`);
          expect(terms.issuedAt).toBe(NOW_SECONDS);
          expect(terms.expiresAt).toBe(
            Math.min(requested, NOW_SECONDS + MOST_MACHINE_GRANT_SECONDS, assertion ?? Infinity),
          );
        },
      ),
    );
  });

  it('caps a grant at 24 hours and 60 seconds', () => {
    expect(MOST_MACHINE_GRANT_SECONDS).toBe(24 * 60 * 60 + 60);
    const terms = machineGrantTermsOf(
      actor(),
      { requestedExpiresAt: NOW_SECONDS + 7 * 24 * 60 * 60, assertionExpiresAt: null, runId: null },
      NOW,
    );
    expect(typeof terms === 'string' ? terms : terms.expiresAt).toBe(NOW_SECONDS + 86_460);
  });

  it('refuses a request whose lifetime would be none', () => {
    expect(
      machineGrantTermsOf(
        actor(),
        { requestedExpiresAt: NOW_SECONDS, assertionExpiresAt: null, runId: null },
        NOW,
      ),
    ).toBe('no_lifetime');
    expect(
      machineGrantTermsOf(
        actor(),
        { requestedExpiresAt: NOW_SECONDS + 600, assertionExpiresAt: NOW_SECONDS, runId: null },
        NOW,
      ),
    ).toBe('no_lifetime');
  });

  it('derives scopes from the credential’s account role alone', () => {
    const scopesOf = (role: OrganizationRole | null) => {
      const terms = machineGrantTermsOf(
        actor(role),
        { requestedExpiresAt: NOW_SECONDS + 600, assertionExpiresAt: null, runId: null },
        NOW,
      );
      return typeof terms === 'string' ? terms : terms.scopes;
    };
    expect(scopesOf('super_admin')).toEqual(['read', 'write']);
    expect(scopesOf('admin')).toEqual(['read', 'write']);
    expect(scopesOf('member')).toEqual(['read', 'write']);
    expect(scopesOf('viewer')).toEqual(['read']);
    expect(scopesOf(null)).toBe('unknown_identity');
  });

  it('carries an opted-in run through, and none when none was asked', () => {
    const withRun = machineGrantTermsOf(
      actor(),
      { requestedExpiresAt: NOW_SECONDS + 600, assertionExpiresAt: null, runId: 'run-a' },
      NOW,
    );
    const without = machineGrantTermsOf(
      actor(),
      { requestedExpiresAt: NOW_SECONDS + 600, assertionExpiresAt: null, runId: null },
      NOW,
    );
    expect(typeof withRun === 'string' ? withRun : withRun.runId).toBe('run-a');
    expect(typeof without === 'string' ? without : without.runId).toBeNull();
  });

  it('names the credential, person, organization and acting account', () => {
    const terms = machineGrantTermsOf(
      actor(),
      { requestedExpiresAt: NOW_SECONDS + 600, assertionExpiresAt: null, runId: null },
      NOW,
    );
    expect(terms).toEqual({
      credentialId: CREDENTIAL,
      personId: 'claire',
      organizationId: 'org-a',
      accountId: 'dany',
      scopes: ['read', 'write'],
      runId: null,
      issuedAt: NOW_SECONDS,
      expiresAt: NOW_SECONDS + 600,
    });
  });
});
