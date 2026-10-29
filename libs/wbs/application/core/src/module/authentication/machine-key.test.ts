import { inMemoryUsers, memoryUserTable } from '@wbs/store-memory/auth-fixture';
import { describe, expect, it } from 'bun:test';

import { clockOf } from '../../ports/clock';
import type { LastUseOutcome, MachineCredentials } from '../../ports/machine-credentials';
import type { PasswordHasher, TokenCodec } from '../../ports/runtime';
import { digestMachineSecret, newMachineKey, parseMachineKey } from '../../service/machine-key';
import { AccountResource, NO_PROVEN_CONNECTIONS } from './account.resource';
import {
  AuthService,
  type MachineKeyVerification,
  type TrustedIssuerVerification,
} from './authentication.feature';

const NOW = 1_800_000_000_000;
const CREDENTIAL = '0f8fad5b-d9cb-469f-a165-70867728950e';
/** be-01's `WBS_MCP_AUTHORIZATION_SERVER` in these cases. */
const ROOT = 'https://wbs.example/mcp/oauth';

const passwords: PasswordHasher = {
  hash: (password) => Promise.resolve(password),
  verify: (password, hash) => Promise.resolve(password === hash),
};
const tokens: TokenCodec = {
  sign: () => Promise.resolve('token'),
  verify: () => Promise.resolve(null),
};

/**
 * Credentials that count their reads and hold one live key bound to
 * `accountId`, its OIDC twin for subject `agent` of trusted issuer `ti-1`, and
 * whose touch answers `touched`.
 */
async function credentialsFor(
  accountId: string,
  touched: LastUseOutcome = 'recorded',
  audience = `${ROOT}/org/org-a`,
) {
  const { key, secret } = newMachineKey(CREDENTIAL);
  const digest = await digestMachineSecret(secret);
  const reads: string[] = [];
  const credentials: MachineCredentials = {
    trustedRegistrationsOf: (issuer) => {
      reads.push(`registrations of ${issuer}`);
      return Promise.resolve([
        { id: 'ti-1', organizationId: 'org-a', audience, jwksUri: 'https://idp/jwks' },
      ]);
    },
    findOidcCredential: (trustedIssuerId, subject) =>
      Promise.resolve(
        trustedIssuerId === 'ti-1' && subject === 'agent'
          ? {
              credential: {
                id: CREDENTIAL,
                organizationId: 'org-a',
                personId: 'claire',
                source: 'oidc',
                boundAccountId: accountId,
                boundAccountRole: 'member',
                revokedAt: null,
                expiresAt: null,
                trustedIssuerId: 'ti-1',
                mcpFamilyId: null,
                secrets: [],
              },
              audience: null,
            }
          : null,
      ),
    findById: (id) => {
      reads.push(id);
      return Promise.resolve(
        id === CREDENTIAL
          ? {
              id,
              organizationId: 'org-a',
              personId: 'claire',
              source: 'api_key',
              boundAccountId: accountId,
              boundAccountRole: 'member',
              revokedAt: null,
              expiresAt: null,
              trustedIssuerId: null,
              mcpFamilyId: null,
              secrets: [{ digest, expiresAt: null }],
            }
          : null,
      );
    },
    touchLastUsed: () => Promise.resolve(touched),
  };
  return { key, reads, credentials };
}

/** Dany's account, which the live credentials are bound to. */
function usersWithDany() {
  const table = memoryUserTable();
  table.byId.set('dany-id', { id: 'dany-id', username: 'dany', passwordHash: null, createdAt: 1 });
  return inMemoryUsers(table);
}

/**
 * A trusted issuer `https://idp` whose every token verifies as subject `agent`
 * for the audience `audience`; `verified` lists each verification's audience.
 */
function trustedIssuersFor(audience = `${ROOT}/org/org-a`) {
  const verified: string[] = [];
  const trusted: TrustedIssuerVerification = {
    configuredIssuer: () => Promise.resolve(null),
    tokens: {
      peek: () => ({ issuer: 'https://idp', subject: 'agent', audiences: [audience] }),
      verify: (_token, expected) => {
        verified.push(expected.audience);
        return Promise.resolve({ kind: 'verified', subject: 'agent', expiresAt: 2_000_000_000 });
      },
    },
  };
  return { trusted, verified };
}
const { trusted: trustedIssuers } = trustedIssuersFor();

function service(
  machineKeys?: MachineKeyVerification,
  users = inMemoryUsers(),
  trusted?: TrustedIssuerVerification,
): AuthService {
  return new AuthService({
    tokens,
    passwords,
    ...(machineKeys === undefined ? {} : { machineKeys }),
    ...(trusted === undefined ? {} : { trustedIssuers: trusted }),
    account: new AccountResource({
      users,
      clock: clockOf({ now: () => NOW, newId: () => 'seeded' }),
      enterprise: NO_PROVEN_CONNECTIONS,
    }),
  });
}

describe('parseMachineKey', () => {
  it('reads a whole key and leaves every other token to the other verifiers', () => {
    const { key, secret } = newMachineKey(CREDENTIAL);
    expect(parseMachineKey(key)).toEqual({ credentialId: CREDENTIAL, secret });
    expect(parseMachineKey('eyJhbGciOiJSUzI1NiJ9.e30.sig')).toBeNull();
  });

  it('answers malformed for a prefixed token outside the grammar', () => {
    const { key } = newMachineKey(CREDENTIAL);
    for (const malformed of [
      'wbs_mk_',
      `${key}=`,
      key.slice(0, -1),
      key.replace('.', '..'),
      key.replace(CREDENTIAL, CREDENTIAL.toUpperCase()),
      key.replace('.', ''),
    ])
      expect(parseMachineKey(malformed)).toBe('malformed');
  });
});

describe('AuthService on /api: machine bearers (wbs-mcp-agent-surface M9)', () => {
  it('refuses a live, a malformed or an unwired key machine_bearer_not_accepted, reading nothing', async () => {
    const { key, reads, credentials } = await credentialsFor('dany-id');
    const auth = service({ credentials, now: () => NOW }, usersWithDany());
    expect(await auth.authenticateOrRefuse(key)).toBe('machine_bearer_not_accepted');
    expect(await auth.authenticateOrRefuse('wbs_mk_not-a-key')).toBe('machine_bearer_not_accepted');
    expect(await service().authenticateOrRefuse(key)).toBe('machine_bearer_not_accepted');
    expect(reads).toEqual([]);
  });

  it('refuses a trusted issuer’s JWT machine_bearer_not_accepted, reading no credential and verifying nothing', async () => {
    const { reads, credentials } = await credentialsFor('dany-id');
    const { trusted, verified } = trustedIssuersFor();
    const auth = service({ credentials, now: () => NOW }, usersWithDany(), trusted);
    expect(await auth.authenticateOrRefuse('header.payload.sig')).toBe(
      'machine_bearer_not_accepted',
    );
    expect(reads).toEqual(['registrations of https://idp']);
    expect(verified).toEqual([]);
  });

  it('keeps a stranger issuer’s JWT invalid_token, verifying nothing', async () => {
    const { reads, credentials } = await credentialsFor('dany-id');
    const { trusted, verified } = trustedIssuersFor();
    const auth = service(
      {
        credentials: { ...credentials, trustedRegistrationsOf: () => Promise.resolve([]) },
        now: () => NOW,
      },
      usersWithDany(),
      trusted,
    );
    expect(await auth.authenticateOrRefuse('header.payload.sig')).toBe('invalid_token');
    expect(reads).toEqual([]);
    expect(verified).toEqual([]);
  });

  it('answers machine_bearer_not_accepted as no principal where a route reads none', async () => {
    const { key, credentials } = await credentialsFor('dany-id');
    expect(
      await service({ credentials, now: () => NOW }, usersWithDany()).authenticate(key),
    ).toBeNull();
  });
});

describe('AuthService.admitMachineProof with an API key', () => {
  it('refuses a malformed key unknown_identity without reading a credential', async () => {
    const { reads, credentials } = await credentialsFor('nobody');
    const auth = service({ credentials, now: () => NOW });
    expect(await auth.admitMachineProof({ kind: 'api_key', key: 'wbs_mk_not-a-key' }, ROOT)).toBe(
      'unknown_identity',
    );
    expect(reads).toEqual([]);
  });

  // Proof: with the unwired branch answering unknown_identity instead of
  // throwing, this resolved; watched 2026-10-22.
  it('throws on a well-formed key when machine credentials are not wired', async () => {
    const { key } = await credentialsFor('nobody');
    expect(service().admitMachineProof({ kind: 'api_key', key }, ROOT)).rejects.toThrow(
      /not wired/,
    );
  });

  // The bound account's foreign key makes this corrupt state, not a refusal.
  // Proof: with the missing-account branch answering unknown_identity, this
  // resolved; watched 2026-10-22.
  it('throws when the admitted credential’s account does not exist', async () => {
    const { key, credentials } = await credentialsFor('missing-account');
    expect(
      service({ credentials, now: () => NOW }).admitMachineProof({ kind: 'api_key', key }, ROOT),
    ).rejects.toThrow(/missing account/);
  });

  it('admits a live key whose use is recorded or fresh', async () => {
    for (const touched of ['recorded', 'fresh'] as const) {
      const { key, credentials } = await credentialsFor('dany-id', touched);
      const admitted = await service(
        { credentials, now: () => NOW },
        usersWithDany(),
      ).admitMachineProof({ kind: 'api_key', key }, ROOT);
      expect(admitted).toMatchObject({ source: 'api_key', actor: { accountId: 'dany-id' } });
    }
  });

  // A removal (A24's person cascade) may commit between admission and the
  // touch: the refusal the next request gets, never a 500 or an admission.
  it('refuses unknown_identity when its credential is removed before the use is recorded', async () => {
    const { key, credentials } = await credentialsFor('dany-id', 'absent');
    expect(
      await service({ credentials, now: () => NOW }, usersWithDany()).admitMachineProof(
        { kind: 'api_key', key },
        ROOT,
      ),
    ).toBe('unknown_identity');
  });
});

describe('AuthService.admitMachineProof with a trusted-issuer assertion', () => {
  it('admits a verified assertion whose use is recorded', async () => {
    const { credentials } = await credentialsFor('dany-id');
    const auth = service({ credentials, now: () => NOW }, usersWithDany(), trustedIssuers);
    expect(
      await auth.admitMachineProof({ kind: 'oidc', assertion: 'header.payload.sig' }, ROOT),
    ).toMatchObject({ source: 'oidc', actor: { accountId: 'dany-id' } });
  });

  // Proof: with the OIDC path's `'absent'` branch removed (answered as a
  // principal), this admitted; watched 2026-10-23.
  it('refuses unknown_identity when its credential is removed before the use is recorded', async () => {
    const { credentials } = await credentialsFor('dany-id', 'absent');
    const auth = service({ credentials, now: () => NOW }, usersWithDany(), trustedIssuers);
    expect(
      await auth.admitMachineProof({ kind: 'oidc', assertion: 'header.payload.sig' }, ROOT),
    ).toBe('unknown_identity');
  });

  // Task 1.5 at use: a row stored before the M2 rule stops verifying.
  it('refuses a stored audience outside the authorization server invalid_token, verifying nothing', async () => {
    for (const audience of ['wbs:org:org-a', `${ROOT}.evil.example`, 'https://idp/api']) {
      const { credentials } = await credentialsFor('dany-id', 'recorded', audience);
      const { trusted, verified } = trustedIssuersFor(audience);
      const auth = service({ credentials, now: () => NOW }, usersWithDany(), trusted);
      expect(
        await auth.admitMachineProof({ kind: 'oidc', assertion: 'header.payload.sig' }, ROOT),
      ).toBe('invalid_token');
      expect(verified).toEqual([]);
    }
  });

  it('admits an audience equal to the authorization server', async () => {
    const { credentials } = await credentialsFor('dany-id', 'recorded', ROOT);
    const { trusted, verified } = trustedIssuersFor(ROOT);
    const auth = service({ credentials, now: () => NOW }, usersWithDany(), trusted);
    expect(
      await auth.admitMachineProof({ kind: 'oidc', assertion: 'header.payload.sig' }, ROOT),
    ).toMatchObject({ source: 'oidc' });
    expect(verified).toEqual([ROOT]);
  });
});
