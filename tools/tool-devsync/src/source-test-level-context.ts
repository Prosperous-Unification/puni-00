import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type {
  TestLevelContext,
  TestLevelJudgeExecution,
  TestLevelJudgment,
} from '@puni/dash/performance-level';
import { createLaunch } from '@shared/bun-startup';

/**
 * Explicit historical source-client selection; this is never an installed source fallback.
 * Independent judging uses the actual source Burokrat program under the command's one native
 * owner. Fresh trusted cwd and captured protected Bun startup preserve candidate isolation;
 * the execution owner alone releases that cwd after tree/numeric/EOF settlement.
 */
export function createSourceTestLevelContext(
  clock: TestLevelContext['monotonic'],
): TestLevelContext {
  const root = resolve(import.meta.dir, '../../..');
  const runtime = process.execPath,
    environment = { ...process.env },
    callerDirectory = process.cwd();
  const temporaryDirectory = tmpdir();
  const judge = join(root, 'apps/twilight-structure/twilight-burokrat/cli/src/cli.ts');
  async function invoke(
    execution: TestLevelJudgeExecution,
    operands: readonly string[],
  ): Promise<TestLevelJudgment> {
    const cwd = execution.createJudgeDirectory(temporaryDirectory);
    try {
      const child = execution.spawn(
        [...createLaunch(runtime, judge), ...operands],
        cwd,
        {
          PATH: environment['PATH'] ?? '/usr/bin:/bin',
          HOME: cwd,
          TMPDIR: temporaryDirectory,
          LANG: 'C.UTF-8',
        },
        { stdout: 'pipe', stderr: 'pipe' },
      );
      const exit = execution.capture(child.exited);
      const stdout = child.stdout;
      if (!(stdout instanceof ReadableStream))
        throw new Error('Source Burokrat stdout pipe is absent; retained ' + cwd);
      const output = execution.capture(new Response(stdout).text());
      const stderr = child.stderr;
      if (!(stderr instanceof ReadableStream))
        throw new Error('Source Burokrat stderr pipe is absent; retained ' + cwd);
      const errors = execution.capture(new Response(stderr).text());
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const [exitCode, outputText, errorText] = await Promise.race([
          Promise.all([exit, output, errors]),
          new Promise<never>((_accept, reject) => {
            timeout = setTimeout(() => {
              reject(new Error('Source Burokrat request timed out; retained ' + cwd));
            }, 30_000);
          }),
        ]);
        execution.assertChildResult(child, exitCode);
        return { exitCode, stdout: outputText, stderr: errorText };
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    } catch (cause) {
      if (execution.isCancellation(cause)) throw cause;
      execution.retainFailure(cause);
      throw new Error('Source Burokrat request failed; retained ' + cwd, { cause });
    }
  }
  return {
    runtime,
    callerDirectory,
    environment,
    monotonic: clock,
    assets: {
      nodeModules: join(root, 'node_modules'),
      playwrightEntrypoint: join(root, 'node_modules/playwright/cli.js'),
      viteEntrypoint: join(root, 'node_modules/vite/bin/vite.js'),
      nxEntrypoint: join(root, 'node_modules/nx/dist/bin/nx.js'),
    },
    judge: {
      identity: (execution, repository, revision) =>
        invoke(execution, ['candidate-identity', 'committed', repository, revision]),
      performance: (execution, repository, revision, policy, evidence) =>
        invoke(execution, [
          'check',
          'committed',
          repository,
          revision,
          policy,
          '--rule',
          'PERF-THRESHOLD',
          ...(evidence === undefined ? [] : ['--performance-evidence', evidence]),
        ]),
    },
  };
}
