import { inMemoryDirectory } from '@wbs/store-memory/directory-fixture';
import { describe, expect, test } from 'bun:test';

import { clockOf } from '../../ports/clock';
import type { DirectoryStore } from '../../ports/directory-store';
import type { ResourceAccess } from '../../ports/organization-access';
import { DirectoryService } from './directory.resource';

const scoped: ResourceAccess = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'u', role: 'member' },
};

/**
 * A service whose clock mints `id-1`, `id-2`, … over an in-memory directory
 * already holding tags named after the first `taken` of those ids.
 */
async function fixture(taken: number) {
  const base = inMemoryDirectory();
  for (let n = 1; n <= taken; n += 1) {
    await base.addTag({ id: `other-${String(n)}`, name: `id-${String(n)}` }, { at: 0, by: 'u' });
  }
  const mapped: string[] = [];
  const directory: DirectoryStore = {
    ...base,
    listInOrganization: () => Promise.resolve([]),
    mapInOrganization: (_catalog, resourceId) => {
      mapped.push(resourceId);
      return Promise.resolve();
    },
  };
  let minted = 0;
  const service = new DirectoryService({
    directory,
    broadcast: { publish: () => Promise.resolve(), latestSeq: () => Promise.resolve(-1) },
    clock: clockOf({
      now: () => 0,
      newId: () => {
        minted += 1;
        return `id-${String(minted)}`;
      },
    }),
  });
  return { service, mapped };
}

describe('an opaque root name', () => {
  test('retries an opaque root name another root holds, then gives up', async () => {
    const once = await fixture(1);
    expect(await once.service.addWithin('tags', 'u', 'urgent', scoped)).toEqual({
      id: 'id-2',
      name: 'urgent',
    });
    expect(once.mapped).toEqual(['id-2']);

    const always = await fixture(3);
    let refusal: unknown;
    try {
      await always.service.addWithin('tags', 'u', 'urgent', scoped);
    } catch (error) {
      refusal = error;
    }
    expect(String(refusal)).toContain('no free opaque directory name after 3 ids');
    expect(always.mapped).toEqual([]);
  });
});
