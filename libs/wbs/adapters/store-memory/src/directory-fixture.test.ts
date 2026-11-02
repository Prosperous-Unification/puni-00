import { describe, expect, test } from 'bun:test';

import { inMemoryDirectory } from './directory-fixture';

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
