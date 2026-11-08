import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { usesRegistryDirectFixtureActions } from './registry-maintenance-host.native';

test('serving direct action route accepts only exact fixed PID1 argv', () => {
  const prefix =
    '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0';
  expect(usesRegistryDirectFixtureActions(prefix + 'prove-serving\0')).toBe(true);
  for (const command of [
    prefix + 'prove-serving',
    prefix + 'prove-serving\0extra\0',
    '/wrong' + prefix + 'prove-serving\0',
  ])
    expect(usesRegistryDirectFixtureActions(command)).toBe(false);
});
for (const fault of ['none', 'operation', 'cleanup', 'held', 'suffix'] as const)
  test('serving actual root caller owns controller and mounted cleanup ' + fault, async () => {
    const source = await readFile(
      new URL('./registry-maintenance-host.native.ts', import.meta.url),
      'utf8',
    );
    const start = source.lastIndexOf('if (import.meta.main) {');
    if (start < 0) throw new Error('Missing native main caller');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source.slice(start).replace('if (import.meta.main)', 'if (true)'),
    );
    const calls: unknown[] = [],
      output: string[] = [];
    const selected = {
      argv: [
        '/pinned/bun',
        '/pinned/proof.js',
        fault === 'suffix' ? 'prove-serving-extra' : 'prove-serving',
      ],
      exitCode: 0,
    };
    const owner = Symbol('owner'),
      cli = Symbol('cli');
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ports = {
      process: selected,
      backupFaultModes: new Map(),
      runNativeOwner: owner,
      runRegistryServingCli: cli,
      installMaintenanceReaper: () => {
        calls.push('reaper');
      },
      proveRegistryServingHost: async (...arguments_: unknown[]) => {
        calls.push(arguments_);
        if (fault === 'held') await gate;
        if (fault === 'operation') throw new Error('modeled operation');
        calls.push('completed');
      },
      reapNamespace: (mounted: boolean) => {
        calls.push(['cleanup', mounted]);
        return fault === 'cleanup'
          ? Promise.reject(new Error('modeled cleanup'))
          : Promise.resolve();
      },
      owner: (mode: string) => {
        calls.push(['owner', mode]);
        return Promise.resolve();
      },
      console: { error: (line: string) => output.push(line) },
    };
    // Boundary: entire actual main caller; native controllers, root reaper and owner effects are modeled. No privileged operation runs.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      ...Object.keys(ports),
      'return (async () => {' + body + '})();',
    ) as (...ports: unknown[]) => Promise<void>;
    const pending = invoke(...Object.values(ports));
    if (fault === 'held') {
      await Bun.sleep(10);
      if (release === undefined) throw new Error('Missing held controller release');
      try {
        expect(calls).toEqual(['reaper', [owner, cli]]);
      } finally {
        release();
      }
    }
    await pending;
    if (fault === 'suffix') {
      expect(calls).toEqual([['owner', 'prove-serving-extra']]);
      expect(selected.exitCode).toBe(0);
    } else {
      expect(calls).toEqual([
        'reaper',
        [owner, cli],
        ...(fault === 'operation' ? [] : ['completed']),
        ['cleanup', true],
      ]);
      expect(selected.exitCode).toBe(fault === 'operation' || fault === 'cleanup' ? 1 : 0);
      expect(output).toEqual(
        fault === 'operation' || fault === 'cleanup'
          ? ['Native host fixture operation failed']
          : [],
      );
    }
  });
