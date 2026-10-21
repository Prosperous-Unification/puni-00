import { inMemoryUsers } from '@wbs/store-memory/auth-fixture';
import { describe, expect, it } from 'bun:test';

import { clockOf } from '../../ports/clock';
import type { MachineCredentials } from '../../ports/machine-credentials';
import type { PasswordHasher, TokenCodec } from '../../ports/runtime';
import { digestMachineSecret, newMachineKey, parseMachineKey } from '../../service/machine-key';
import { AccountResource, NO_PROVEN_CONNECTIONS } from './account.resource';
import { AuthService, type MachineKeyVerification } from './authentication.feature';

const NOW = 1_800_000_000_000;
const CREDENTIAL = '0f8fad5b-d9cb-469f-a165-70867728950e';

const passwords: PasswordHasher = {
  hash: (password) => Promise.resolve(password),
  verify: (password, hash) => Promise.resolve(password === hash),
};
const tokens: TokenCodec = {
  sign: () => Promise.resolve('token'),
  verify: () => Promise.resolve(null),
};

/** Credentials that count their reads and hold one live key bound to `accountId`. */
async function credentialsFor(accountId: string) {
  const { key, secret } = newMachineKey(CREDENTIAL);
  const digest = await digestMachineSecret(secret);
  const reads: string[] = [];
  const credentials: MachineCredentials = {
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
              revokedAt: null,
              trustedIssuerId: null,
              mcpFamilyId: null,
              secrets: [{ digest, expiresAt: null }],
            }
          : null,
      );
    },
    touchLastUsed: () => Promise.resolve(),
  };
  return { key, reads, credentials };
}

function service(machineKeys?: MachineKeyVerification): AuthService {
  return new AuthService({
    tokens,
    passwords,
    ...(machineKeys === undefined ? {} : { machineKeys }),
    account: new AccountResource({
      users: inMemoryUsers(),
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

describe('AuthService with an API key', () => {
  it('refuses a malformed key unknown_identity without reading a credential', async () => {
    const { reads, credentials } = await credentialsFor('nobody');
    const auth = service({ credentials, now: () => NOW });
    expect(await auth.authenticateOrRefuse('wbs_mk_not-a-key')).toBe('unknown_identity');
    expect(reads).toEqual([]);
  });

  // Proof: with the unwired branch answering unknown_identity instead of
  // throwing, this resolved; watched 2026-10-22.
  it('throws on a well-formed key when machine credentials are not wired', async () => {
    const { key } = await credentialsFor('nobody');
    expect(service().authenticateOrRefuse(key)).rejects.toThrow(/not wired/);
  });

  // The bound account's foreign key makes this corrupt state, not a refusal.
  // Proof: with the missing-account branch answering unknown_identity, this
  // resolved; watched 2026-10-22.
  it('throws when the admitted credential’s account does not exist', async () => {
    const { key, credentials } = await credentialsFor('missing-account');
    expect(service({ credentials, now: () => NOW }).authenticateOrRefuse(key)).rejects.toThrow(
      /missing account/,
    );
  });
});
