import { inMemoryUsers, memoryUserTable } from '@wbs/store-memory/auth-fixture';
import { expect, test } from 'bun:test';

import { clockOf } from '../../ports/clock';
import { AccountResource } from './account.resource';

test('direct account resource reports an absent OIDC identity store', () => {
  const account = new AccountResource({
    users: inMemoryUsers(),
    clock: clockOf({ now: () => 1, newId: () => 'candidate' }),
  });
  expect(() =>
    account.resolveIdentity({
      issuer: 'https://id.example',
      subject: 'subject',
      email: null,
      emailVerified: false,
      scopes: ['read'],
    }),
  ).toThrow('OIDC identity store is not configured');
});

test('read-only OIDC lookup cannot link a same-email password account or create a new account', async () => {
  const table = memoryUserTable();
  table.byId.set('local', {
    id: 'local',
    username: 'ada@example.test',
    passwordHash: 'hash',
    createdAt: 1,
  });
  const users = inMemoryUsers(table);
  const account = new AccountResource({
    users,
    identities: users,
    clock: clockOf({ now: () => 2, newId: () => 'new-account' }),
  });

  expect(
    await account.readExistingIdentity({ issuer: 'https://issuer.test', subject: 'unknown' }),
  ).toBeNull();
  expect([...table.byId.values()]).toEqual([
    { id: 'local', username: 'ada@example.test', passwordHash: 'hash', createdAt: 1 },
  ]);
});
