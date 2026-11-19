
import { runLintChild } from '../lint-child';
import type { SubscribeLintInterrupts } from '../lint-interrupts';
import type { LintRuntime } from '../lint-runtime';
import { readLintCandidate } from '../run-lint';
export { verifyPuniInstallation } from './installation';

/** Resolve the actual consumer repository through the existing owned, frozen Git probes. */
export async function readInstallRepository(
  callerDirectory: string,
  runtime: LintRuntime,
  subscribeInterrupts: SubscribeLintInterrupts,
) {
  return await readLintCandidate(
    {
      version: 1,
      callerDirectory,
      request: { command: 'lint', kind: 'working', repository: callerDirectory, revision: 'HEAD' },
    },
    runtime,
    subscribeInterrupts,
  );
}

/** Reuse the existing detached child/pipe/cancellation settlement for one package stage. */
export async function runInstallChild(
  request: Omit<Parameters<typeof runLintChild>[0], 'stage' | 'stdin'>,
) {
  return await runLintChild({ ...request, stage: 'package install', stdin: undefined });
}

