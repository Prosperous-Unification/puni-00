import { describe, expect, test } from 'bun:test';

import { credentialKey, inMemoryDirectory, memoryDirectoryTables } from './directory-fixture';

const stamp = { at: 0, by: 'u' };

describe('the in-memory person binding and credential pins', () => {
  test('answers a pinned credential’s person and null for an unpinned or unknown pair', async () => {
    const tables = memoryDirectoryTables();
    tables.credentialPins.set(credentialKey('https://idp.example/', 'm2m-claire'), 'claire');
    const directory = inMemoryDirectory(undefined, tables, new Map([['dany', true]]));

    expect(await directory.credentialPinOf('https://idp.example/', 'm2m-claire')).toBe('claire');
    expect(await directory.credentialPinOf('https://idp.example/', 'browser-dany')).toBeNull();
    // The key is the pair, not a joined string another pair can spell.
    expect(await directory.credentialPinOf('https://idp.example/m2m-claire', '')).toBeNull();
  });

  test('refuses any binding when built without accounts, rather than guessing', async () => {
    const directory = inMemoryDirectory();
    await directory.addPerson({ id: 'claire', name: 'Claire' }, [], stamp);

    expect(
      await directory.patchPerson('claire', { accountId: 'dany' }, stamp).then(
        () => 'resolved',
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      ),
    ).toContain('built without accounts');
    expect(await directory.boundAccountOf('claire')).toBeNull();
  });
});
