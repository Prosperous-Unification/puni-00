import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { scratchSync } from '.';

const PRELOAD = join(import.meta.dir, 'preload.ts');
const HELPER = join(import.meta.dir, 'index.ts');

/** Copies the actual preload/remover, injecting finite latency only at the fixture's rmSync boundary. */
function cleanupFixture(hookBudget?: number, ordinaryHang = false): string[] {
  const directory = scratchSync('cleanup-budget-');
  const helper = readFileSync(HELPER, 'utf8');
  const boundary = '    rmSync(processRoot, { recursive: true, force: true });';
  expect(helper.split(boundary)).toHaveLength(2);
  writeFileSync(
    join(directory, 'index.ts'),
    helper.replace(
      boundary,
      `    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);\n${boundary}`,
    ),
  );
  let preload = readFileSync(PRELOAD, 'utf8');
  if (hookBudget !== undefined)
    preload = preload.replace(
      /afterAll\(removeProcessRoot(?:,\s*[\d_]+)?\);/,
      hookBudget === 0
        ? 'afterAll(removeProcessRoot);'
        : `afterAll(removeProcessRoot, ${String(hookBudget)});`,
    );
  const preloadPath = join(directory, 'preload.ts');
  writeFileSync(preloadPath, preload);
  const suites = ['first', 'second'].map((name) => {
    const suite = join(directory, `${name}.test.ts`);
    writeFileSync(
      suite,
      `import { test } from 'bun:test';
       import { scratchSync } from './index';
       test('${name} cleanup fixture', async () => {
         console.log('FIXTURE_DIRECTORY=' + scratchSync('${name}-'));
         ${ordinaryHang ? 'await new Promise(() => {});' : ''}
       });`,
    );
    return suite;
  });
  return ['test', '--preload', preloadPath, '--timeout=20', ...suites];
}

async function runFixture(args: string[]) {
  const child = Bun.spawn([process.execPath, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const directories = [...stdout.matchAll(/^FIXTURE_DIRECTORY=(.+)$/gm)].map((match) => match[1]);
  expect(directories).toHaveLength(2);
  for (const directory of directories) expect(existsSync(directory)).toBe(false);
  return { stderr, status };
}

test('the actual preload allows bounded cleanup beyond the ordinary test budget', async () => {
  // Proof: deleting only the explicit allowance reproduced the unnamed hook timeout.
  const execution = await runFixture(cleanupFixture());
  expect(execution.status).toBe(0);
  expect(execution.stderr).not.toContain('hook timed out');
});

test('the cleanup allowance is scoped, finite and does not change ordinary test deadlines', async () => {
  const preload = readFileSync(PRELOAD, 'utf8');
  expect(preload).toMatch(/afterAll\(removeProcessRoot,\s*30_?000\);/);
  expect(preload).not.toMatch(/\bsetDefaultTimeout\s*\(/);
  const inherited = await runFixture(cleanupFixture(0));
  expect(inherited.status).toBe(1);
  expect(inherited.stderr).toContain('hook timed out');
  const bounded = await runFixture(cleanupFixture(50));
  expect(bounded.status).toBe(1);
  expect(bounded.stderr).toContain('hook timed out');
  const ordinary = await runFixture(cleanupFixture(undefined, true));
  expect(ordinary.status).toBe(1);
  expect(ordinary.stderr).toContain('timed out after 20ms');
  expect(ordinary.stderr).not.toContain('hook timed out');
});
