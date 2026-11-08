import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { usesRegistryDirectFixtureActions } from './registry-maintenance-host.native';

for (const [mode, mounted] of [
  ['prove-index', true],
  ['prove-history', true],
  ['prove-shared', true],
  ['prove-unsafe-gc', true],
  ['prove-tag-cleanup', true],
  ['prove-tag-recovery', true],
  ['prove-backup-owner-eof', true],
  ['prove-backup-guardian-eof', true],
  ['prove-backup-deadline', true],
  ['prove-permit-grammar', true],
  ['prove-permit-expiry', true],
  ['prove', false],
  // The upcoming populated rehearsal uses the reviewed modern transport with a readonly cgroup view.
  ['prove-populated', true],
] as const) {
  test(`native fixture cleanup passes actual cgroup-view ownership for ${mode}`, async () => {
    const source = await readFile(
      new URL('./registry-maintenance-host.native.ts', import.meta.url),
      'utf8',
    );
    const calls = [...source.matchAll(/await reapNamespace\(([^;]+)\);/g)];
    expect(calls).toHaveLength(1);
    const call = calls.at(0)?.at(0);
    if (call === undefined) throw new Error('Exact cleanup caller is absent');
    // Boundary: execute the actual trusted fixture caller expression; only the privileged reaper is modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function('mode', 'reapNamespace', `return (async () => { ${call} })();`) as (
      mode: string,
      reap: (hasCgroup: boolean) => Promise<void>,
    ) => Promise<void>;
    const observed: boolean[] = [];
    await invoke(mode, (hasCgroup) => {
      observed.push(hasCgroup);
      return Promise.resolve();
    });
    expect(observed).toEqual([mounted]);
  });
}

test('direct fixture dispatch recognizes only exact pinned index and history PID1 argv', () => {
  const prefix =
    '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0';
  expect(usesRegistryDirectFixtureActions(prefix + 'prove-index\0')).toBe(true);
  expect(usesRegistryDirectFixtureActions(prefix + 'prove-history\0')).toBe(true);
  expect(usesRegistryDirectFixtureActions(prefix + 'prove-shared\0')).toBe(true);
  expect(usesRegistryDirectFixtureActions(prefix + 'prove-unsafe-gc\0')).toBe(true);
  expect(usesRegistryDirectFixtureActions(prefix + 'prove-tag-cleanup\0')).toBe(true);
  expect(usesRegistryDirectFixtureActions(prefix + 'prove-tag-recovery\0')).toBe(true);
  for (const value of [
    prefix + 'prove-tag-recovery\0extra\0',
    prefix + 'prove-tag-recovery',
    prefix + 'prove-populated\0',
    prefix + 'prove-history',
    prefix + 'prove-history\0extra\0',
    '/other/bun\0' + prefix + 'prove-history\0',
  ])
    expect(usesRegistryDirectFixtureActions(value)).toBe(false);
});
