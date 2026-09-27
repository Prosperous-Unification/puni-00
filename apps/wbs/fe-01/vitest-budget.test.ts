// @vitest-environment node
//
// A config-level check beside the configs it runs, like `vite-config.test.ts`.
// It starts a second Vitest, so it needs no DOM of its own.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const APP = dirname(fileURLToPath(import.meta.url));

/** The budgets the hung run is given: short, so the case costs seconds and not a target budget. */
const HANG_BUDGET_MS = 500;

/** How long the hung run may take before this case kills it and fails. */
const RUN_DEADLINE_MS = 45_000;

/** The output and exit of one Vitest run over the hung suites. */
interface HungRun {
  readonly exitCode: number | null;
  readonly output: string;
  /** Whether the run outlived {@link RUN_DEADLINE_MS} and was killed, which is the fault. */
  readonly outlived: boolean;
}

/**
 * Runs the real `vitest.config.ts`, setup file included, over `dir` with the
 * target's serial flags and the short budgets above. The run gets its own
 * process group, so a hung run is killed whole rather than left holding the gate.
 */
function runHungSuites(dir: string): Promise<HungRun> {
  const child = spawn(
    'bunx',
    [
      'vitest',
      'run',
      '--config',
      'vitest.config.ts',
      '--dir',
      dir,
      '--no-file-parallelism',
      '--maxWorkers=1',
      `--testTimeout=${String(HANG_BUDGET_MS)}`,
      `--hookTimeout=${String(HANG_BUDGET_MS)}`,
    ],
    {
      cwd: APP,
      detached: true,
      env: { ...process.env, TZ: 'UTC', CLAUDECODE: '0', AGENT: '0' },
    },
  );
  let output = '';
  let outlived = false;
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const deadline = setTimeout(() => {
    outlived = true;
    killGroup(child.pid);
  }, RUN_DEADLINE_MS);
  return new Promise((settle, fail) => {
    child.on('error', fail);
    child.on('close', (exitCode) => {
      clearTimeout(deadline);
      settle({ exitCode, output, outlived });
    });
  });
}

/** Kills a detached child's whole process group; a group already gone is the goal, not a fault. */
function killGroup(pid: number | undefined): void {
  if (pid === undefined) throw new Error('the hung Vitest run never started');
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ESRCH') throw cause;
  }
}

/**
 * fe-01's time budgets live on its target's command lines
 * (`docs/test-budgets.md`), and the devsync guard
 * `every Vitest command states its own time budgets` makes every target state
 * them. A budget is only worth stating if it ends a hang, and a flag is not the
 * last word: a `vi.setConfig` in the shared setup file runs after the command
 * line is read and would turn the budget off for every suite. So this runs the real config and setup file over one hung test and one
 * hung hook, and both must end at the budget the command line gave them.
 *
 * Proof: with `vi.setConfig({ testTimeout: 0, hookTimeout: 0 })` appended to
 * `vitest.setup.ts`, this failed on its own 60-second limit and left the hung
 * run behind (2026-09-27); with the deadline and group kill added, the same
 * fault failed on `outlived` after 45 s and left nothing running. With
 * `hookTimeout: 0` alone it failed the same way, so the hook arm is live too.
 */
describe('the Vitest time budget', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('ends a hung test and a hung hook at the budget the command line states', async () => {
    // Inside the app: Vite will not load a test file from outside its root. The
    // base include reaches only `src/**` and this directory's own files, so no
    // other run collects these.
    dir = mkdtempSync(join(APP, '.vitest-budget-'));
    writeFileSync(
      join(dir, 'hung-test.test.ts'),
      `import { it } from 'vitest';
it('waits on a promise that never settles', () => new Promise(() => {}));
`,
    );
    writeFileSync(
      join(dir, 'hung-hook.test.ts'),
      `import { beforeAll, it } from 'vitest';
beforeAll(() => new Promise(() => {}));
it('runs after a hook that never settles', () => {});
`,
    );

    const run = await runHungSuites(dir);

    expect(run.outlived, run.output).toBe(false);
    expect(run.output).toContain(`Test timed out in ${String(HANG_BUDGET_MS)}ms`);
    expect(run.output).toContain(`Hook timed out in ${String(HANG_BUDGET_MS)}ms`);
    expect(run.exitCode).toBe(1);
  }, 60_000);
});
