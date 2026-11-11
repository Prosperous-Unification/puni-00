import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
it('ends parsed PUNI lock execution after its owner settles despite retained native references', () => {
  const root = mkdtempSync(join(tmpdir(), 'puni lock completion '));
  roots.push(root);
  const preload = join(root, 'preload.ts'),
    entry = join(import.meta.dir, 'entrypoint.ts');
  const selected =
    'export function wallClock(){return {read:()=>0};}export function monotonicClock(){return {now:()=>0};}export async function executeRequest(){setInterval(()=>undefined,1000);process.stdout.write("lock returned");return 37;}';
  writeFileSync(
    preload,
    'Bun.plugin({name:"lock-native-tail",setup(build){build.onLoad({filter:new RegExp("twilight-dash/cli/src/runtime-facade[.]ts$")},()=>({loader:"ts",contents:' +
      JSON.stringify(selected) +
      '}));}});',
  );
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      '--preload',
      preload,
      entry,
      'd',
      'ops',
      'lock',
      'status',
    ],
    { cwd: root, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 4000 },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(37);
  expect(child.stdout.toString()).toBe('lock returned');
});
