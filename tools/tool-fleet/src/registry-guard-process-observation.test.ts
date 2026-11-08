import { expect, test } from 'bun:test';

import { observeRegistryGuardProcess } from './registry-guard-process.fixture';

test('actual observer closure marks environ ESRCH transition without a mode claim', async () => {
  const proof = await observeRegistryGuardProcess({ fault: 'esrch' });
  expect({ mode: proof.mode, identity: proof.identity }).toEqual({
    mode: 'transition',
    identity: null,
  });
  expect(proof.seen.at(-1)).toBe('/proc/456/environ');
});
test('actual observer closure reports exited if owner ended during environ ESRCH', async () => {
  const proof = await observeRegistryGuardProcess({ fault: 'exit-esrch' });
  expect({ mode: proof.mode, identity: proof.identity }).toEqual({
    mode: 'exited',
    identity: null,
  });
});
test('actual observer closure preserves existing ENOENT transition', async () => {
  const proof = await observeRegistryGuardProcess({ fault: 'enoent' });
  expect({ mode: proof.mode, identity: proof.identity }).toEqual({
    mode: 'transition',
    identity: null,
  });
});
for (const fault of ['eacces', 'eperm', 'unknown', 'non-error'] as const)
  test('actual observer closure propagates original failure ' + fault, async () => {
    const proof = await observeRegistryGuardProcess({ fault });
    expect(proof.state).toBe('rejected');
    expect(proof.isOriginalFailure).toBe(true);
    expect(proof.seen.at(-1)).toBe('/proc/456/environ');
  });
test('actual observer closure keeps exact owned child identity on coherent reads', async () => {
  const proof = await observeRegistryGuardProcess({ fault: 'none' });
  expect({ mode: proof.mode, identity: proof.identity }).toEqual({
    mode: 'readonly',
    identity: '456:123',
  });
  expect(proof.seen).toEqual([
    '/proc/123/task/123/children',
    '/proc/456/stat',
    '/proc/456/cmdline',
    '/proc/456/status',
    '/proc/456/environ',
    '/proc/456/stat',
    '/proc/123/task/123/children',
  ]);
  expect(proof.kills).toEqual(['SIGTERM']);
  expect(proof.mounts).toEqual(['writable', 'readonly']);
  expect(proof.isReadonly).toBe(true);
  expect(proof.spawnCommand).toEqual([
    '/usr/bin/setpriv',
    '--reuid=59001',
    '--regid=59001',
    '--clear-groups',
    '--',
    '/bin/sh',
    '/etc/puni/registry-fixture-startup.sh',
    '/registry-journal/identities',
    '/var/lib/registry',
    '/registry-managed-journal',
    '/pinned/registry',
    'serve',
    '/etc/puni/ordinary-writer.json',
  ]);
});
test('actual observer closure still refuses invalid owned UID', async () => {
  const proof = await observeRegistryGuardProcess({ fault: 'uid' });
  expect(proof.state).toBe('rejected');
  expect(proof.message).toBe('Unexpected guard child owner');
});
test('actual observer closure still refuses ambiguous environment', async () => {
  const proof = await observeRegistryGuardProcess({ fault: 'environment' });
  expect(proof.state).toBe('rejected');
  expect(proof.message).toBe('Ambiguous guard child mode');
});
for (const fault of ['start-race', 'census-race'] as const)
  test('whole-starter observer refuses ' + fault, async () => {
    const proof = await observeRegistryGuardProcess({ fault });
    expect(proof.state).toBe('fulfilled');
    expect({ mode: proof.mode, identity: proof.identity }).toEqual({
      mode: 'transition',
      identity: null,
    });
  });
for (const [fault, message] of [
  ['multiple', 'Multiple owned guard servers observed'],
  ['oversize-census', 'Malformed guard observation child census'],
] as const)
  test('whole-starter observer refuses ' + fault, async () => {
    const proof = await observeRegistryGuardProcess({ fault });
    expect(proof.state).toBe('rejected');
    expect(proof.message).toBe(message);
  });
for (const fault of ['exited-before', 'exited-after'] as const)
  test('whole-starter observer reports ' + fault, async () => {
    const proof = await observeRegistryGuardProcess({ fault });
    expect(proof.state).toBe('fulfilled');
    expect({ mode: proof.mode, identity: proof.identity }).toEqual({
      mode: 'exited',
      identity: null,
    });
    expect(proof.seen).toHaveLength(fault === 'exited-before' ? 0 : 6);
  });
