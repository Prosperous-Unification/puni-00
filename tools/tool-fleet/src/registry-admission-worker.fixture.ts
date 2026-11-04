import * as filesystem from 'node:fs/promises';
import { isPromise } from 'node:util/types';

import { type } from 'arktype';
import { mock } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import * as journal from './registry-journal';
import * as actions from './registry-maintenance-actions';

const Selection = type({
  family: "'collection'",
  fault:
    "'normal'|'no-final-child'|'duplicate-final-child'|'missing-call'|'spawn-fails'|'effect-fails'|'invalid-child'|'root'|'action'|'marker'|'read-absent'|'read-unreadable'",
}).or({
  family: "'protection'",
  fault:
    "'none'|'kind'|'repository'|'closure'|'count'|'read-absent'|'read-unreadable'|'journal-fails'|'acquire-fails'",
});
const selection = Selection.assert({ family: process.argv.at(2), fault: process.argv.at(3) });
const originalFiles = { ...filesystem };
const originalJournal = { ...journal };
const originalActions = { ...actions };
const uid = Object.getOwnPropertyDescriptor(process, 'getuid');
if (!uid?.configurable) throw new Error('Required isolated UID descriptor unavailable');
const nativeSpawn = Bun.spawn;
const nativeSpawnSync = Bun.spawnSync;
const failure = new Error('owned exact failure');
const records: unknown[] = [];
const commands: unknown[] = [];
const requests: unknown[] = [];
const reads: string[] = [];
const digest = (letter: string) => 'sha256:' + letter.repeat(64);
const receipt = {
  kind: selection.fault === 'kind' ? 'expired' : 'protected',
  operationId: 'owned',
  repository: selection.fault === 'repository' ? 'retained/expired' : 'retained/index',
  root: digest('a'),
  manifests: (selection.fault === 'closure'
    ? ['b', 'c', 'd']
    : selection.fault === 'count'
      ? ['a', 'b']
      : ['a', 'b', 'c']
  ).map(digest),
  blobs: ['d', 'e', 'f', '0'].map(digest),
};
const ports = {};
const input = {
  request: { action: selection.fault === 'action' ? 'inspect' : 'collect', operationId: 'op' },
  installed: { distribution: { path: '/pinned/registry' } },
  journal: { retirements: [{ operationId: 'op', snapshotId: 'a'.repeat(64) }] },
};
const modeledSpawn = new Proxy(nativeSpawn, {
  apply(_spawn, _receiver, arguments_: unknown[]) {
    const command = type('string[]').assert(arguments_.at(0));
    if (
      command.length !== 2 ||
      command[0] !== '/pinned/registry' ||
      command[1] !== 'garbage-collect'
    )
      throw new Error('Unexpected admission GC command');
    commands.push(command);
    if (selection.fault === 'spawn-fails') throw failure;
    return { pid: selection.fault === 'invalid-child' ? 0 : 123 };
  },
});
const deniedSpawnSync = new Proxy(nativeSpawnSync, {
  apply() {
    throw new Error('Unexpected synchronous admission spawn');
  },
});

await mock.module('node:fs/promises', () => ({
  ...originalFiles,
  readFile(path: string, encoding: unknown) {
    return invokeRegistryCallback(() => {
      reads.push(path);
      if (
        encoding !== 'utf8' ||
        path !==
          (selection.family === 'collection'
            ? '/root/task8-fixture/collect-proof'
            : '/etc/puni/registry-deletion-protected.json')
      )
        throw new Error('Unexpected admission read contract');
      if (selection.fault === 'read-absent' || selection.fault === 'read-unreadable')
        throw Object.assign(failure, {
          code: selection.fault === 'read-absent' ? 'ENOENT' : 'EACCES',
        });
      return selection.family === 'collection'
        ? selection.fault === 'marker'
          ? 'disabled'
          : 'enabled'
        : JSON.stringify(receipt);
    });
  },
  appendFile(path: string, serialized: string, options: { mode?: unknown }) {
    return invokeRegistryCallback(() => {
      if (
        selection.family !== 'collection' ||
        path !== '/root/task8-fixture/collection-proof.log' ||
        options.mode !== 0o600
      )
        throw new Error('Unexpected admission append contract');
      records.push(JSON.parse(serialized));
    });
  },
}));
await mock.module('./registry-journal', () => ({
  ...originalJournal,
  executeRegistryCommand(path: string, request: unknown, selectedPorts: unknown) {
    return invokeRegistryCallback(() => {
      if (selection.family !== 'protection' || path !== '/journal' || selectedPorts !== ports)
        throw new Error('Unexpected protection authority binding');
      const selected = type({ command: "'read'|'acquire-protection'" }).assert(request);
      requests.push(request);
      if (
        selection.fault === 'journal-fails' ||
        (selection.fault === 'acquire-fails' && selected.command === 'acquire-protection')
      )
        throw failure;
      return { state: { revision: 7 } };
    });
  },
}));
await mock.module('./registry-maintenance-actions', () => ({
  ...originalActions,
  executeRegistryHostAction(selected: typeof input) {
    return invokeRegistryCallback(() => {
      if (selection.family !== 'collection') throw new Error('Unexpected collection dispatch');
      if (
        ['normal', 'no-final-child', 'duplicate-final-child'].includes(selection.fault) &&
        selected.journal.retirements.at(0)?.snapshotId !== 'a'.repeat(64)
      )
        throw new Error('GC requires the exact durable retirement receipt');
      if (selection.fault !== 'no-final-child') Bun.spawn(['/pinned/registry', 'garbage-collect']);
      if (selection.fault === 'duplicate-final-child')
        Bun.spawn(['/pinned/registry', 'garbage-collect']);
      if (selection.fault === 'effect-fails') throw failure;
      return 'verified';
    });
  },
}));
const collection = await import('./registry-maintenance-collection.fixture');
const protection = await import('./registry-deletion.fixture');
Object.defineProperty(process, 'getuid', {
  ...uid,
  value: () => (selection.fault === 'root' ? 59001 : 0),
});
// Boundary: every spawn is modeled and never forwards to the captured native implementation. The kernel UID is unchanged; only the eligibility read is modeled inside this disposable process.
Bun.spawn = modeledSpawn;
Bun.spawnSync = deniedSpawnSync;
let state: 'fulfilled' | 'rejected';
let value: string | null = null;
let message: string | null = null;
let isOriginalFailure = false;
let hasRestoredSpawn: boolean;
try {
  try {
    // Boundary: these helpers consume only the shown fields before calling modeled, already-held authority/dispatcher ports. Full installation/session validation is outside this test's scope.
    const pending: unknown =
      selection.family === 'collection'
        ? Reflect.apply(collection.proveRegistryCollectionAdmission, undefined, [input])
        : Reflect.apply(protection.protectRegistryDeletionFixture, undefined, [
            { journalPath: '/journal' },
            ports,
          ]);
    if (!isPromise(pending)) throw new Error('Admission helper did not return a native Promise');
    const returned: unknown = await pending;
    if (
      (selection.family === 'collection' && returned !== 'verified') ||
      (selection.family === 'protection' && returned !== undefined)
    )
      throw new Error('Admission helper returned an unexpected receipt');
    value = selection.family === 'collection' ? 'verified' : null;
    state = 'fulfilled';
  } catch (cause) {
    if (!(cause instanceof Error))
      throw new Error('Unexpected admission rejection shape', { cause });
    state = 'rejected';
    message = cause.message;
    isOriginalFailure = cause === failure;
  }
  hasRestoredSpawn = Bun.spawn === modeledSpawn && Bun.spawnSync === deniedSpawnSync;
} finally {
  Object.defineProperty(process, 'getuid', uid);
  Bun.spawn = nativeSpawn;
  Bun.spawnSync = nativeSpawnSync;
}
console.log(
  JSON.stringify({
    state,
    value,
    message,
    isOriginalFailure,
    hasRestoredSpawn,
    records,
    commands,
    requests,
    reads,
  }),
);
