import { expect, test } from 'vitest';

import type { DirectoryUsage } from '@/lib/wbs-api';
import { createDirectory } from '@/modules/directory/directory.resource';
import { fakeDirectoryApi, KAT, PLATFORM } from '@/modules/directory/fake-directory-api';

import { createDirectoryManagement } from './directory-management.feature';

const USED: DirectoryUsage = { projects: [], members: [{ id: 'p1', name: 'Kat' }] };

const over = (api: ReturnType<typeof fakeDirectoryApi>) =>
  createDirectoryManagement(createDirectory(api));

/** Counts how often a completion callback ran, which is the whole ordering claim. */
function counter(): { note: () => void; ran: () => number } {
  let ran = 0;
  return {
    note: () => {
      ran += 1;
    },
    ran: () => ran,
  };
}

test('a name of whitespace alone is never sent, and says so', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const draft = counter();
  await management.read();

  expect(management.renameEntry('person', KAT, '   ', draft.note)).toBe('empty');
  expect(api.renames).toEqual([]);
  expect(draft.ran()).toBe(0);
  expect(management.snapshot().problem).toEqual({ reason: 'refused', code: 'name_required' });
});

test('a name equal to the stored one is not sent', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const draft = counter();
  await management.read();

  expect(management.renameEntry('person', KAT, 'Kat', draft.note)).toBe('unchanged');
  expect(api.renames).toEqual([]);
  expect(draft.ran()).toBe(0);
});

test('a rename is trimmed, sent, and its caller told before the refetch', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  await management.read();
  /** What the counter read at the moment the refetch began. */
  let atRefetch = -1;
  const draft = counter();
  api.listPeople = () => {
    if (atRefetch === -1) atRefetch = draft.ran();
    return Promise.resolve([KAT]);
  };

  expect(management.renameEntry('person', KAT, '  Bo  ', draft.note)).toBe('sent');
  await management.settled();

  expect(api.personPatches).toEqual([{ id: 'p1', patch: { name: 'Bo' } }]);
  expect(draft.ran()).toBe(1);
  // The whole ordering claim: the caller had already been told when the refetch
  // started, which is where the page dropped its name draft.
  expect(atRefetch).toBe(1);
});

test('a rename that throws never tells its caller', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const draft = counter();
  await management.read();
  api.patchPerson = () => Promise.reject(new Error('offline'));

  expect(management.renameEntry('person', KAT, 'Bo', draft.note)).toBe('sent');
  await management.settled();

  expect(draft.ran()).toBe(0);
  expect(management.snapshot().problem).not.toBeNull();
});

test('each of the five adds trims, sends and clears its box', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const cleared = counter();
  await management.read();

  expect(management.addPerson('  Bo  ', cleared.note)).toBe('sent');
  await management.settled();
  expect(management.addTeam('Core', cleared.note)).toBe('sent');
  await management.settled();
  expect(management.addTag('legal', cleared.note)).toBe('sent');
  await management.settled();
  expect(management.addService('Payments', cleared.note)).toBe('sent');
  await management.settled();
  expect(management.addWorkItemType('Spike', cleared.note)).toBe('sent');
  await management.settled();

  expect(api.creates).toEqual(['Bo', 'Core', 'legal', 'Payments', 'Spike']);
  expect(cleared.ran()).toBe(5);
});

test('an empty add is refused without a request and keeps its box', () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const cleared = counter();

  expect(management.addPerson('   ', cleared.note)).toBe('empty');
  expect(api.creates).toEqual([]);
  expect(cleared.ran()).toBe(0);
  expect(management.snapshot().problem).toEqual({ reason: 'refused', code: 'name_required' });
});

test('choosing the kind somebody already has sends nothing', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  await management.read();

  management.chooseKind(KAT, 'person');
  await management.settled();

  expect(api.personPatches).toEqual([]);
});

test('making a team for somebody creates before it patches', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  await management.read();
  api.holdCreates();

  management.addTeamForPerson(KAT, 'Core');
  await Promise.resolve();
  await Promise.resolve();
  // Nothing may reach the person while the team is still being made.
  expect(api.log.filter((entry) => entry.startsWith('patchPerson'))).toEqual([]);

  api.releaseCreates();
  await management.settled();

  expect(api.log.filter((entry) => !entry.startsWith('list'))).toEqual([
    'addTeam:Core',
    'patchPerson:p1',
  ]);
  expect(api.personPatches).toEqual([{ id: 'p1', patch: { teamIds: ['new-Core'] } }]);
});

test('making a service for a team creates before it patches', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  await management.read();
  api.holdCreates();

  management.addServiceForTeam(PLATFORM, 'Payments');
  await Promise.resolve();
  await Promise.resolve();
  expect(api.log.filter((entry) => entry.startsWith('patchTeam'))).toEqual([]);

  api.releaseCreates();
  await management.settled();

  expect(api.log.filter((entry) => !entry.startsWith('list'))).toEqual([
    'addService:Payments',
    'patchTeam:t1',
  ]);
  expect(api.teamPatches).toEqual([{ id: 't1', patch: { serviceIds: ['new-Payments'] } }]);
});

test('a removal is always asked without a cascade first', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  api.refuseRemovalWith(USED);
  const refused: DirectoryUsage[] = [];
  await management.read();

  management.askToRemove('person', KAT, (usage) => refused.push(usage));
  await management.settled();

  expect(api.removals).toEqual([['p1', false]]);
  expect(refused).toEqual([USED]);
});

test('a removal nothing points at confirms nothing', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const refused = counter();
  await management.read();

  management.askToRemove('person', KAT, refused.note);
  await management.settled();

  expect(api.removals).toEqual([['p1', false]]);
  expect(refused.ran()).toBe(0);
});

test('a confirmed removal repeats the ask with the cascade', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const gone = counter();
  await management.read();

  management.confirmRemoval('person', 'p1', gone.note);
  await management.settled();

  expect(api.removals).toEqual([['p1', true]]);
  expect(gone.ran()).toBe(1);
});

test('a second refusal against a confirmed cascade is raised, not confirmed', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const gone = counter();
  api.refuseRemovalWith(USED);
  await management.read();

  management.confirmRemoval('person', 'p1', gone.note);
  await management.settled();

  expect(gone.ran()).toBe(0);
  expect(management.snapshot().problem).not.toBeNull();
});
