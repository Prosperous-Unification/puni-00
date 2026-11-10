import { Buffer } from 'node:buffer';

import { createLintInterrupts, type SubscribeLintInterrupts } from './lint-interrupts';
import { createLintOutputs, type LintOutputs } from './lint-output';
import { createLintParentControl, type LintParentControl } from './lint-parent-control';

export interface LintExecution {
  readonly outputs: Pick<LintOutputs, 'stdout' | 'stderr' | 'reportDiagnostic'>;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}

/**
 * Own native signals and output through one lint operation, including its bounded terminal
 * reporter and every teardown attempt. Optional installed-parent controls release before the
 * broker and announce finished only after lifecycle settlement. The executable decides its
 * terminal exit after this owner returns; returned failure never proves retained groups absent.
 */
export async function runLintOperation(
  operation: (context: LintExecution) => Promise<number>,
  isParent: boolean,
): Promise<number> {
  const interrupts = createLintInterrupts();
  const outputs = createLintOutputs({
    stdout: () => Bun.stdout.writer(),
    stderr: () => Bun.stderr.writer(),
    subscribeInterrupts: interrupts.subscribe,
  });
  async function reportFailure(cause: unknown): Promise<1> {
    try {
      await outputs.reportDiagnostic(
        Buffer.from(
          'tool-wiki lint: ' + (cause instanceof Error ? cause.message : String(cause)) + '\n',
        ),
      );
    } catch {
      // Proof: main-terminal-report-contained; `contains terminal reporting failures without Bun automatic reporting` fails with this injected fault and passes after restoration.
      // Terminal reporting/release failure is exit 1; another reporter would be unowned.
      return 1;
    }
    return 1;
  }
  let status: number;
  let parent: LintParentControl | undefined;
  try {
    parent = createLintParentControl(interrupts, isParent);
    // Proof: executable-start-gate; `does not read the typed request after pre-start cancel` failed with the recorded source fault and passed after restoration.
    const start = parent.kind === 'connected' ? await parent.start : { kind: 'started' as const };
    // Proof: executable-start-failure-before-io; `does not read the typed request after pre-start invalid` failed with the recorded source fault and passed after restoration.
    if (start.kind === 'failed') throw start.cause;
    status =
      // Proof: executable-start-cancel-before-io; `does not read the typed request after pre-start cancel` failed with the recorded source fault and passed after restoration.
      start.kind === 'cancelled'
        ? start.signal === 'SIGINT'
          ? 130
          : 143
        : await operation({
            outputs,
            subscribeInterrupts: interrupts.subscribe,
          });
    const failure = parent.kind === 'connected' ? parent.readFailure() : undefined;
    // Proof: executable-read-control-failure; `actual installed launcher ordered parent control > cleans its actual live stage after duplicate-start` failed with the recorded source fault and passed after restoration.
    if (failure !== undefined) throw failure;
  } catch (cause) {
    status = await reportFailure(cause);
  }
  if (parent?.kind === 'connected') {
    try {
      // Proof: executable-control-before-dispose; `contains actual child broker-dispose-late failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
      // Proof: executable-release-contained; `contains actual child release failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
      parent.releaseControl();
    } catch (cause) {
      status = await reportFailure(cause);
    }
  }
  try {
    // Proof: main-terminal-disposal-contained; `contains terminal disposal failures without Bun automatic reporting` fails with this injected fault and passes after restoration.
    outputs.dispose();
  } catch (cause) {
    status = await reportFailure(cause);
  }
  try {
    interrupts.dispose();
  } catch (cause) {
    status = await reportFailure(cause);
  }
  if (parent?.kind === 'connected') {
    try {
      // Proof: executable-finished-contained; `contains actual child finished-late failures within its owned executable boundary` failed with the recorded source fault and passed after restoration.
      parent.finishLifecycle();
    } catch (cause) {
      status = await reportFailure(cause);
    }
  }
  return status;
}
