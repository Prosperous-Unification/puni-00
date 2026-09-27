import type { StoredTypedDependency, WriteStamp } from '@wbs/core';
import { expect, it } from 'bun:test';

import { inMemoryTypedDependencies } from './typed-dependency-fixture';

const stamp: WriteStamp = { at: 1, by: 'owner' };

/** Whether a write refused; `.rejects` cannot be awaited under Bun's types. */
async function refuses(write: () => Promise<unknown>): Promise<boolean> {
  try {
    await write();
    return false;
  } catch {
    return true;
  }
}
const link = (id: string, predecessorId: string, successorId: string): StoredTypedDependency => ({
  id,
  projectId: 'project',
  predecessor: { scope: 'whole', workItemId: predecessorId },
  successor: { scope: 'whole', workItemId: successorId },
  type: 'FS',
});

/** Proof: with duplicate checks removed, both refusals resolved; watched 2026-09-27. */
it('refuses duplicate ids and endpoint keys', async () => {
  const store = inMemoryTypedDependencies();
  await store.add(link('one', 'a', 'b'), stamp);
  expect(await refuses(() => store.add(link('one', 'a', 'c'), stamp))).toBe(true);
  expect(await refuses(() => store.add(link('two', 'a', 'b'), stamp))).toBe(true);
  expect(await store.listByProject('project')).toEqual([link('one', 'a', 'b')]);
});

/** Proof: without the unknown-id checks, both writes resolved; watched 2026-09-27. */
it('refuses updates and removals of unknown ids', async () => {
  const store = inMemoryTypedDependencies();
  expect(await refuses(() => store.update(link('missing', 'a', 'b'), stamp))).toBe(true);
  expect(await refuses(() => store.remove('missing', stamp))).toBe(true);
  expect(await store.listByProject('project')).toEqual([]);
});

/** Proof: without the incident filter, the returned links and survivor set were wrong; watched 2026-09-27. */
it('removes and returns links touching the doomed set', async () => {
  const store = inMemoryTypedDependencies([
    link('inner', 'a', 'b'),
    link('out', 'a', 'c'),
    link('in', 'd', 'b'),
    link('keep', 'c', 'd'),
  ]);
  expect(await store.removeAllFor(['a', 'b'], stamp)).toEqual([
    link('inner', 'a', 'b'),
    link('out', 'a', 'c'),
    link('in', 'd', 'b'),
  ]);
  expect(await store.listByProject('project')).toEqual([link('keep', 'c', 'd')]);
});
