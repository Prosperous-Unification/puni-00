import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterEach, beforeAll, expect, it } from 'bun:test';

import { buildLintLauncher } from './policy/build-lint-launcher';
import { writeInstalledLintDeathProbe } from './testing/installed-lint-death-probe';
import { createInstalledLintFixture } from './testing/installed-lint-fixtures';

let launcher: Uint8Array;
const roots: string[] = [];
beforeAll(async () => {
  launcher = await buildLintLauncher();
});
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('reports unsolicited launcher death as unconfirmed while a detached stage remains alive, then the Linux fixture reaps it', async () => {
  const fixture = createInstalledLintFixture(
    launcher,
    (root) =>
      'import{writeFileSync}from"node:fs";writeFileSync(' +
      JSON.stringify(join(root, 'stage.pid')) +
      ',String(process.pid));setInterval(()=>undefined,1000);',
  );
  roots.push(fixture.root);
  const child = Bun.spawn(
    [...createLaunch(process.execPath, writeInstalledLintDeathProbe(fixture))],
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
  const expiry = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    expiry.reject(new Error('isolated owned death fixture did not settle'));
  }, 12000);
  try {
    const status = await Promise.race([child.exited, expiry.promise]);
    expect(status, await stderr).toBe(0);
    expect(child.signalCode).toBeNull();
    const source = await stdout;
    const report: unknown = JSON.parse(source);
    expect(report).toMatchObject({
      outerGone: true,
      stageAliveBeforeCleanup: true,
      adopted: true,
      reaped: true,
      gone: true,
      signal: 9,
      retained: 1,
      priorRestored: true,
    });
    expect(source).toContain('detached-stage cleanup is unconfirmed');
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill('SIGTERM');
    await Promise.allSettled([child.exited, stdout, stderr]);
  }
}, 15000);
