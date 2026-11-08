import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { usesRegistryDirectFixtureActions } from './registry-maintenance-host.native';

const prefix =
  '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0';
for (const mode of ['prove-gc-kill', 'prove-restore-kill']) {
  test('interruption direct route requires exact PID1 argv ' + mode, () => {
    expect(usesRegistryDirectFixtureActions(prefix + mode + '\0')).toBe(true);
    for (const command of [
      prefix + mode,
      prefix + mode + '\0extra\0',
      '/wrong' + prefix + mode + '\0',
    ])
      expect(usesRegistryDirectFixtureActions(command)).toBe(false);
  });
  test('interruption cleanup includes mounted cgroup view ' + mode, async () => {
    const source = await readFile(
      new URL('./registry-maintenance-host.native.ts', import.meta.url),
      'utf8',
    );
    const calls = [...source.matchAll(/await reapNamespace\(([^;]+)\);/g)];
    expect(calls).toHaveLength(1);
    const call = calls[0]?.[0];
    if (typeof call !== 'string') throw new Error('Missing cleanup caller');
    // Boundary: run the exact actual caller with only the namespace reaper modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      'mode',
      'reapNamespace',
      'return (async () => {' + call + '})();',
    ) as (...ports: unknown[]) => Promise<void>;
    const observed: boolean[] = [];
    await invoke(mode, (mounted: boolean) => {
      observed.push(mounted);
      return Promise.resolve();
    });
    expect(observed).toEqual([true]);
  });
}
for (const [mode, action, expected] of [
  ['prove-gc-kill', 'collect', 'kill'],
  ['prove-gc-kill', 'serve-deletion', 'direct'],
  ['prove-restore-kill', 'collect', 'direct'],
  ['prove-restore-kill', 'serve-deletion', 'tag'],
  ['prove-restore-kill', 'backup-restore', 'direct'],
  ['prove-gc-kill\0extra', 'collect', 'direct'],
  ['prove-restore-kill\0extra', 'serve-deletion', 'direct'],
] as const)
  test('interruption dispatch ' + mode.replaceAll('\0', ':') + ' ' + action, async () => {
    const source = await readFile(
      new URL('./registry-maintenance-host.native.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('        const dispatch =');
    const end = source.indexOf('        const receipt = await dispatch', start);
    if (start < 0 || end < 0) throw new Error('Missing exact dispatcher');
    // Boundary: only the selected action reference is observed; actual root/effect functions are modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      'fixtureCommand',
      'request',
      'isDirectFixture',
      'collectRegistryUnsafeFixture',
      'failRegistryTagCleanupFixture',
      'executeRegistryHostAction',
      'proveRegistryCollectionAdmission',
      'proveRegistryUploadGrace',
      'interruptRegistryCollectionFixture',
      source.slice(start, end) + '; return dispatch;',
    ) as (...ports: unknown[]) => unknown;
    expect(
      invoke(
        prefix + mode + '\0',
        { action },
        true,
        'unsafe',
        'tag',
        'direct',
        'admission',
        'grace',
        'kill',
      ),
    ).toBe(expected);
  });

for (const mode of ['restore-kill', 'gc-kill'])
  test(mode + ' main selector reaches only its fixed controller mode', async () => {
    const source = await readFile(
      new URL('./registry-maintenance-host.native.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf("          else if (\n            mode === 'prove-unsafe-gc'");
    const end = source.indexOf("          else if (mode === 'prove-shared')", start);
    if (start < 0 || end < 0) throw new Error('Missing controller routing block');
    const calls: unknown[][] = [];
    const owner = Symbol('owned runner');
    // Boundary: fixed routing expression only; controller execution is modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      'mode',
      'runNativeOwner',
      'proveRegistryDeletionHost',
      'return (async () => {' + source.slice(start, end).replace('else if', 'if') + '})();',
    ) as (...ports: unknown[]) => Promise<void>;
    await invoke('prove-' + mode, owner, (...arguments_: unknown[]) => {
      calls.push(arguments_);
      return Promise.resolve();
    });
    expect(calls).toEqual([[owner, mode]]);
  });

for (const mode of ['restore-kill', 'gc-kill'])
  test(mode + ' is an explicit private controller entrypoint', async () => {
    const source = await readFile(
      new URL('./registry-maintenance-host.native.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf("    else if (\n      mode === 'prove'");
    const end = source.indexOf('    ) {', start);
    if (start < 0 || end < 0) throw new Error('Missing controller admission expression');
    // Boundary: evaluate only the existing fixed mode admission expression.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const admits = new Function(
      'mode',
      'backupFault',
      'return (' + source.slice(start, end).replace('    else if (', '') + ');',
    ) as (mode: string, fault: undefined) => boolean;
    expect(admits('prove-' + mode, undefined)).toBe(true);
    expect(admits('prove-' + mode + '-extra', undefined)).toBe(false);
  });
