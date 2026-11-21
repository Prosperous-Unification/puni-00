import { describe, expect, test } from 'bun:test';

import { inMemoryDirectory, memoryDirectoryTables } from './directory-fixture';

const stamp = { at: 0, by: 'u' };

describe('the in-memory person binding', () => {
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

test('reads only requested memory names owned by the organization', async () => {
  const tables = memoryDirectoryTables();
  const directory = inMemoryDirectory(undefined, tables);
  await directory.addPerson({ id: 'own', name: 'local own' }, [], stamp);
  await directory.addPerson({ id: 'foreign', name: 'local foreign' }, [], stamp);
  await directory.addPerson({ id: 'unrequested', name: 'local unrequested' }, [], stamp);
  tables.organizationOf.set('own', 'org-a');
  tables.organizationOf.set('foreign', 'org-b');
  tables.organizationOf.set('unrequested', 'org-a');

  expect(await directory.personNamesInOrganization('org-a', ['own', 'foreign', 'own'])).toEqual([
    { id: 'own', name: 'local own' },
  ]);
  expect(await directory.personNamesInOrganization('org-a', [])).toEqual([]);
});
