import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

/** `apps/wbs/fe-01`, where the tier's config runs; see `test-tiers.test.ts` for why `cwd`. */
const APP = process.cwd();

/** How long the inner run may take before `spawnSync` kills it and this case fails. */
const RUN_DEADLINE_MS = 45_000;

/**
 * The node tier exists to raise what the DOM tier hides: a browser global read by
 * production code throws there, and usually in a callback no test awaits. Its
 * run must then fail even though every assertion passed, which is Vitest's
 * default and one config key away from not being. So this runs the tier's own
 * config, with only its file list replaced, over one passing test that leaves
 * a rejection nobody handles, and requires a failed, loud run.
 *
 * Proof: with `dangerouslyIgnoreUnhandledErrors: true` added to
 * `vitest.node.config.ts`'s `test` block (2026-09-27), this failed on
 * `expected +0 to be 1`.
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

    const run = spawnSync('bunx', ['vitest', 'run', '--config', join(dir, 'vitest.config.ts')], {
      cwd: APP,
      encoding: 'utf8',
      env: { ...process.env, TZ: 'UTC', CLAUDECODE: '0', AGENT: '0' },
      timeout: RUN_DEADLINE_MS,
    });
    const output = `${run.stdout}${run.stderr}`;

    expect(run.error, output).toBeUndefined();
    expect(output).toMatch(/1 passed/);
    expect(output).toMatch(/Unhandled Rejection/);
    expect(output).toMatch(/nobody handled this/);
    expect(run.status, output).toBe(1);
  }, 60_000);
});
