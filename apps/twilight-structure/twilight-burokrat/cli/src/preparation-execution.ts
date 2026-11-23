import { Buffer } from 'node:buffer';

import { createLintInterrupts, type SubscribeLintInterrupts } from './lint-interrupts';
import { createLintOutputs, type LintOutputs } from './lint-output';

export interface PreparationExecution {
  readonly outputs: Pick<LintOutputs, 'stdout' | 'stderr' | 'reportDiagnostic'>;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}

/** Preserve modeled cleanup identities and retained outputs without printing automatic stacks. */
function formatPreparationFailure(cause: unknown): Uint8Array {
  const pending: unknown[] = [cause],
    seen = new Set<Error>(),
    messages: string[] = [];
  for (const selected of pending) {
    if (selected instanceof Error) {
      // Error cause graphs can share nodes or contain cycles; each identity contributes once.
      // Proof: c27-owner-cycle; injected fault failed `renders repeated nested error identities once without hanging on a cause cycle`; restoration passed.
      if (seen.has(selected)) continue;
      seen.add(selected);
      messages.push(selected.name + ': ' + selected.message);
      if (selected instanceof AggregateError) {
        const causes: readonly unknown[] = selected.errors;
        // Proof: c27-owner-causes; injected fault failed `retains nested preparation cleanup identities and owned paths without automatic stacks`; restoration passed.
        pending.push(...causes);
      }
      // Proof: c27-owner-cause; injected fault failed `retains nested preparation cleanup identities and owned paths without automatic stacks`; restoration passed.
      if (selected.cause !== undefined) pending.push(selected.cause);
    } else messages.push(String(selected));
  }
  return Buffer.from('puni preparation: ' + messages.join('\ncaused by: ') + '\n');
}

/**
 * Own signals, lazy native outputs and one bounded diagnostic through preparation settlement.
 * Nested cleanup causes retain process identities and partial-output paths. Every teardown is
 * attempted; operation/report/release failure remains nonzero over late interruption. Repeated
 * error identities render once. Reusable callers receive status without process-global exit;
 * executable callers must terminally exit after return because retained native references or
 * explicitly abandoned output operations do not become safe through ordinary draining.
 */
export async function runPreparationOperation(
  operation: (context: PreparationExecution) => Promise<number>,
): Promise<number> {
  const interrupts = createLintInterrupts();
  let first: 'SIGINT' | 'SIGTERM' | undefined;
  const unsubscribe = interrupts.subscribe((signal) => {
    // Proof: c27-owner-first; injected fault failed `returns the first native preparation interruption after otherwise successful completion`; restoration passed.
    first ??= signal;
  });
  const outputs = createLintOutputs({
    stdout: () => Bun.stdout.writer(),
    stderr: () => Bun.stderr.writer(),
    subscribeInterrupts: interrupts.subscribe,
  });
  async function reportFailure(cause: unknown): Promise<1> {
    try {
      await outputs.reportDiagnostic(formatPreparationFailure(cause));
    } catch {
      // Failed diagnostic formatting/writing is terminal failure, never another unowned reporter.
      return 1;
    }
    return 1;
  }
  let status: number;
  try {
    status = await operation({ outputs, subscribeInterrupts: interrupts.subscribe });
  } catch (cause) {
    status = await reportFailure(cause);
  }
  try {
    outputs.dispose();
  } catch (cause) {
    // Proof: c27-owner-release-outputs; injected fault failed `attempts every preparation teardown and returns failure after outputs release rejects`; restoration passed.
    status = await reportFailure(cause);
  }
  try {
    unsubscribe();
  } catch (cause) {
    // Proof: c27-owner-release-subscription; injected fault failed `attempts every preparation teardown and returns failure after subscription release rejects`; restoration passed.
    status = await reportFailure(cause);
  }
  try {
    interrupts.dispose();
  } catch (cause) {
    // Proof: c27-owner-release-interrupts; injected fault failed `attempts every preparation teardown and returns failure after interrupts release rejects`; restoration passed.
    status = await reportFailure(cause);
  }
  // Proof: c27-owner-failure-priority; injected fault failed `preserves preparation failure one over previously recorded native cancellation`; restoration passed.
  if (status !== 0 && status !== 130 && status !== 143) return status;
  return first === undefined ? status : first === 'SIGINT' ? 130 : 143;
}
