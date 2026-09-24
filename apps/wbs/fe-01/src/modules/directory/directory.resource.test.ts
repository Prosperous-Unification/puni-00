import { expect, test } from 'vitest';

import type { DirectoryRefusal, DirectoryUsage, PersonView } from '@/lib/wbs-api';

import { createDirectory } from './directory.resource';
import { fakeDirectoryApi, KAT, PLATFORM } from './fake-directory-api';

const USED: DirectoryUsage = { projects: [], members: [{ id: 'p1', name: 'Kat' }] };

test('a read installs all five vocabularies', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api, () => true);

  expect(directory.snapshot().people).toEqual([]);
  await directory.read();
  expect(directory.snapshot().people).toEqual([KAT]);
  expect(directory.snapshot().teams).toEqual([PLATFORM]);
});

test('the snapshot is the same object until something changed', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api, () => true);
  const before = directory.snapshot();

  expect(directory.snapshot()).toBe(before);
  await directory.read();
  const after = directory.snapshot();
  expect(after).not.toBe(before);
  expect(directory.snapshot()).toBe(after);
});

test('a refusal that says nothing new replaces no snapshot and wakes nobody', () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api, () => true);
  let told = 0;
  directory.subscribe(() => {
    told += 1;
  });
  const sameRefusal: DirectoryRefusal = { reason: 'refused', code: 'name_required' };

  directory.refuse(sameRefusal);
  const after = directory.snapshot();
  expect(told).toBe(1);

  directory.refuse(sameRefusal);
  expect(directory.snapshot()).toBe(after);
  expect(told).toBe(1);
});

test('subscribers are told once a read has installed, and not after they drop', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api, () => true);
  let told = 0;
  const drop = directory.subscribe(() => {
    told += 1;
  });

  await directory.read();
  expect(told).toBeGreaterThan(0);

  drop();
  const quiet = told;
  api.refuseRemovalWith(USED);
  directory.refuse({ reason: 'refused', code: 'request_failed' });
  expect(told).toBe(quiet);
});

test('only the newest read may install', async () => {
  const api = fakeDirectoryApi();
  /** Every people read still in flight, oldest first, answered by hand. */
  const pending: ((found: PersonView[]) => void)[] = [];
  api.listPeople = () =>
    new Promise<PersonView[]>((answer) => {
      pending.push(answer);
    });
  const directory = createDirectory(api, () => true);

  const first = directory.read();
  const second = directory.read();
  expect(pending).toHaveLength(2);

  // The newest answers first — somebody has renamed Kat to Bo.
  pending[1]?.([{ ...KAT, name: 'Bo' }]);
  await second;
  // Then the older one lands, carrying the name nobody holds any more.
  pending[0]?.([{ ...KAT, name: 'Stale' }]);
  await first;

  expect(directory.snapshot().people[0]?.name).toBe('Bo');
});

test('a write raises busy, refetches, and lowers it', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api, () => true);
  await directory.read();
  const before = api.readCount();

  const ran = directory.runWrite(async () => {
    await directory.renameEntry('tag', 'g1', 'legal');
  });
  expect(directory.snapshot().busy).toBe(true);
  await ran;
  expect(directory.snapshot().busy).toBe(false);
  expect(api.readCount()).toBe(before + 1);
});

test('a write that throws becomes a refusal, and still refetches', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api, () => true);
  api.throwOnRemoval(new Error('offline'));
  await directory.read();
  const before = api.readCount();

  await directory.runWrite(async () => {
    await directory.removeEntry('person', 'p1', false);
  });

  expect(directory.snapshot().problem).not.toBeNull();
  expect(directory.snapshot().busy).toBe(false);
  expect(api.readCount()).toBe(before + 1);
});

test('a refetch that throws becomes a refusal, and busy still falls', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api, () => true);
  await directory.read();
  api.listPeople = () => Promise.reject(new Error('offline'));

  await directory.runWrite(() => Promise.resolve());

  expect(directory.snapshot().problem).not.toBeNull();
  expect(directory.snapshot().busy).toBe(false);
});

test('a removal is passed the cascade it was given', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api, () => true);
  api.refuseRemovalWith(USED);

  await expect(directory.removeEntry('person', 'p1', false)).resolves.toEqual({
    ok: false,
    reason: 'in_use',
    usage: USED,
  });
  expect(api.removals).toEqual([['p1', false]]);
});

test('each kind renames through its own route', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api, () => true);

  await directory.renameEntry('person', 'p1', 'Bo');
  await directory.renameEntry('team', 't1', 'Core');
  await directory.renameEntry('tag', 'g1', 'legal');

  expect(api.personPatches).toEqual([{ id: 'p1', patch: { name: 'Bo' } }]);
  expect(api.teamPatches).toEqual([{ id: 't1', patch: { name: 'Core' } }]);
  expect(api.renames).toContainEqual(['g1', 'legal']);
});

test('a replaced client keeps everything the directory already held', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api, () => true);
  await directory.read();
  expect(directory.snapshot().people).toEqual([KAT]);

  const next = fakeDirectoryApi();
  const pending: ((found: PersonView[]) => void)[] = [];
  next.listPeople = () =>
    new Promise<PersonView[]>((answer) => {
      pending.push(answer);
    });

  directory.replaceClient(next);
  const reading = directory.read();

  // The whole of the claim: what was on screen is still on screen while the
  // replacement's own read is in flight.
  expect(directory.snapshot().people).toEqual([KAT]);

  pending[0]?.([{ ...KAT, name: 'Bo' }]);
  await reading;
  expect(directory.snapshot().people[0]?.name).toBe('Bo');
});
