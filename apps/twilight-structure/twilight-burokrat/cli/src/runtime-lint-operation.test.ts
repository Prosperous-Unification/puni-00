import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterEach, beforeAll, expect, it } from 'bun:test';

import { buildLintLauncher } from './policy/build-lint-launcher';
import { createInstalledLintFixture } from './testing/installed-lint-fixtures';
import {
  writeInstalledLintAwaitProbe,
  writeInstalledLintOperationProbe,
} from './testing/installed-lint-operation-probe';

let launcher: Uint8Array;
const roots: string[] = [];
beforeAll(async () => {
  launcher = await buildLintLauncher();
});
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
for (const fault of [
  'send',
  'disconnect',
  'reader',
  'reader-read',
  'reader-cancel',
  'reader-release',
  'exit-getter',
  'signal-zero',
  'exit-reject',
  'exit-null',
  'exit-fraction',
  'exit-negative',
  'exit-range',
  'exit-string',
  'exit-nan',
] as const) {
  it(
    'owns ' + fault + ' failure through remaining launcher operations before refusing',
    async () => {
      const fixture = createInstalledLintFixture(
        launcher,
        (root) =>
          'import{writeFileSync}from"node:fs";writeFileSync(' +
          JSON.stringify(join(root, 'operation-ran')) +
          ',"ran");',
      );
      roots.push(fixture.root);
      const child = Bun.spawn(
        [...createLaunch(process.execPath, writeInstalledLintOperationProbe(fixture, fault))],
        {
          cwd: import.meta.dir,
          env: { PATH: '/usr/bin:/bin' },
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const stdout = new Response(child.stdout).text();
      const stderr = new Response(child.stderr).text();
      try {
        expect(await child.exited, await stderr).toBe(0);
        const report: unknown = JSON.parse(await stdout);
        expect(report).toMatchObject({
          injected: true,
          ownedFailure: true,
          finishedAtRejection: fault !== 'send' && fault !== 'disconnect',
          nativeExitedFinally: true,
          operationRanAtRejection: fault === 'reader-release' || fault === 'signal-zero',
          operationRanFinally: fault === 'reader-release' || fault === 'signal-zero',
        });
        if (fault.startsWith('reader') || fault === 'signal-zero')
          expect(report).toMatchObject({ nativeExitedAtRejection: true });
        if (fault === 'reader-cancel')
          expect(report).toMatchObject({
            hasCancelledStream: true,
            causes: expect.arrayContaining([
              'Error: controlled stream cancellation failure',
            ]) as unknown,
          });
        if (fault === 'reader-read')
          expect(report).toMatchObject({
            causes: expect.arrayContaining(['Error: controlled stream read failure']) as unknown,
          });
        if (fault === 'reader-release')
          expect(report).toMatchObject({
            causes: expect.arrayContaining(['Error: controlled reader release failure']) as unknown,
          });
        if (fault === 'send' || fault === 'disconnect')
          expect(report).toMatchObject({
            nativeExitedAtRejection: true,
            causes: expect.arrayContaining([
              'Error: controlled parent send failure',
              ...(fault === 'disconnect' ? ['Error: controlled parent disconnect failure'] : []),
            ]) as unknown,
          });
        if (fault === 'signal-zero') expect(report).toMatchObject({ nativeSignal: 'SIGKILL' });
      } finally {
        if (child.exitCode === null) child.kill('SIGTERM');
        await Promise.allSettled([child.exited, stdout, stderr]);
      }
    },
    12000,
  );
}

for (const channel of ['stdout', 'stderr'] as const)
  it(
    'awaits gated ' + channel + ' after actual native exit and channel settlement before returning',
    async () => {
      const fixture = createInstalledLintFixture(
        launcher,
        'process.' + channel + '.write("held output");',
      );
      roots.push(fixture.root);
      const child = Bun.spawn(
        [...createLaunch(process.execPath, writeInstalledLintAwaitProbe(fixture, channel))],
        {
          cwd: import.meta.dir,
          env: { PATH: '/usr/bin:/bin' },
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const stdout = new Response(child.stdout).text(),
        stderr = new Response(child.stderr).text();
      try {
        expect(await child.exited, await stderr).toBe(0);
        const report: unknown = JSON.parse(await stdout);
        expect(report).toEqual({ hasWaited: true, status: 130 });
      } finally {
        if (child.exitCode === null) child.kill('SIGTERM');
        await Promise.allSettled([child.exited, stdout, stderr]);
      }
    },
    12000,
  );
