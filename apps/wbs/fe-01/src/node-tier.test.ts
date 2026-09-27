import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

/** `apps/wbs/fe-01`, where the tier's config runs; see `test-tiers.test.ts` for why `cwd`. */
const APP = process.cwd();

/** How long the inner run may take before `spawnSync` kills it and this case fails. */
const RUN_DEADLINE_MS = 45_000;

/** The config argument of `test:unit`'s command, which this case swaps for its own. */
const TIER_CONFIG = '--config vitest.node.config.ts';

/** `test:unit`'s command line exactly as Nx runs it, flags and environment included. */
function readTierCommand(): string {
  const project = JSON.parse(readFileSync(join(APP, 'project.json'), 'utf8')) as {
    targets: { 'test:unit': { options: { command: string } } };
  };
  return project.targets['test:unit'].options.command;
}

/**
 * The node tier exists to raise what the DOM tier hides: a browser global read by
 * production code throws there, and usually in a callback no test awaits. Its
 * run must then fail even though every assertion passed, which is Vitest's
 * default and one config key or flag away from not being. So this runs
 * `test:unit`'s own command line, with only the file list of its config
 * replaced, over one passing test that leaves a rejection nobody handles, and
 * requires a failed, loud run. Nx itself is not run: this suite is part of that
 * target, and a run-commands target exits with its command's status.
 *
 * Proof (2026-09-27): with `dangerouslyIgnoreUnhandledErrors: true` added to
 * `vitest.node.config.ts`'s `test` block this failed on `expected +0 to be 1`,
 * and with `--dangerouslyIgnoreUnhandledErrors` appended to `test:unit`'s
 * command it failed the same way.
 */
describe('the node tier', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('fails a run whose only fault is an unhandled rejection', () => {
    // Inside the app, because Vite loads no test file from outside its root.
    // No other run collects it: the DOM tier's include reaches `src/**` and the root
    // files, and the node tier's include is a fixed list.
    dir = mkdtempSync(join(APP, '.node-tier-'));
    writeFileSync(
      join(dir, 'unhandled.test.ts'),
      `import { expect, it } from 'vitest';
it('passes, and leaves a rejection behind', () => {
  void Promise.reject(new Error('nobody handled this'));
  expect(true).toBe(true);
});
`,
    );
    writeFileSync(
      join(dir, 'vitest.config.ts'),
      `import nodeTier from '../vitest.node.config';
export default { ...nodeTier, test: { ...nodeTier.test, include: ['${basename(dir)}/*.test.ts'] } };
`,
    );

    const command = readTierCommand();
    expect(command).toContain(TIER_CONFIG);
    const run = spawnSync(
      'sh',
      ['-c', command.replace(TIER_CONFIG, `--config ${dir}/vitest.config.ts`)],
      {
        cwd: APP,
        encoding: 'utf8',
        env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
        timeout: RUN_DEADLINE_MS,
      },
    );
    const output = `${run.stdout}${run.stderr}`;

    expect(run.error, output).toBeUndefined();
    expect(output).toMatch(/1 passed/);
    expect(output).toMatch(/Unhandled Rejection/);
    expect(output).toMatch(/nobody handled this/);
    expect(run.status, output).toBe(1);
  }, 60_000);
});
