import type { QueueOutcome } from '@shared/heavy-lock';

import { readGateAdmission, withGateAdmission } from './gate-admission';
import {
  type CheckoutContext,
  type Completion,
  type Failure,
  type Request,
  runAdmittedCheckout,
  serviceInterrupts,
} from './gate-checkout-core';
import { createGateControl, type Interruption } from './gate-control';

export type { Completion, Failure, Request, Scope } from './gate-checkout-core';
export type { Interruption } from './gate-control';
export type Outcome = QueueOutcome<Completion> & { readonly interruption: Interruption };
export interface Context extends CheckoutContext {
  readonly path: string;
  readonly label: string;
  readonly waitSeconds: number;
  readonly pollSeconds: number;
  /** Independent non-native cancellation. Do not wrap this owner with another native-signal adapter. */
  readonly signal: AbortSignal;
}
/**
 * Perform a pinned checkout transaction entirely inside genuine queue admission. This internal
 * primitive accepts fixture/admitted paths, not enrollment authority. One executable invocation
 * owns process-wide signal listeners and umask through restoration; it is not a concurrent server API. The caller resolves commit
 * once and loads trusted work before invocation; a later protected installed bundle owns code
 * loading and public path selection. No source import occurs after checkout in this module.
 *
 * Missing tools/state throw into a retained failure record. Dirty65 and inaccessible66 are
 * modeled refusals. A failed restoration returns74 with every primary/report/cleanup cause.
 * Recovery decisions and Git mutations end inside admission. A late queue-close failure or
 * interruption can change the final status after keep was settled; the candidate then remains,
 * with no post-release Git recovery. Status74 outranks operational/report/release70, then an
 * existing work/refusal nonzero; first interruption projects130/143 only over otherwise0.
 * Every returned outcome independently retains that first native signal or external reason.
 * Original branch movement is never reset:
 * restore its saved commit detached and report74. Stable cooperating metadata/parent namespace is
 * required; this is not a hostile-filesystem sandbox. Executable filters and gitlinks are visibly
 * unsupported. There is no fetch/network fallback in this primitive.
 */
export async function runCheckout(request: Request, context: Context): Promise<Outcome> {
  // Proof: C33 A02 replaced the captured requested SHA with HEAD after admission; `owned gate checkout queued under isolated Linux supervision` reported the wrong selected commit; restoration passed.
  const selected = { ...request },
    captured = { ...context };
  const control = createGateControl(captured.signal),
    readInterruption = control.readInterruption,
    readInterruptionStatus = control.readStatus;
  const captureOutcome = (outcome: QueueOutcome<Completion>): Outcome => {
    const interruption = readInterruption();
    if (outcome.kind === 'cancelled' && interruption.kind === 'none')
      throw new Error('checkout queue cancellation lacks an observed control');
    if (outcome.kind === 'completed' && outcome.value.status === 0 && interruption.kind !== 'none')
      return {
        ...outcome,
        value: { ...outcome.value, status: readInterruptionStatus() },
        interruption,
      };
    // Proof: C33 S06 discarded interruption projection; the `nonzero-signal` and `restore-error-signal` native cases lost recorded INT while their nonzero statuses remained; restoration passed.
    return { ...outcome, interruption };
  };
  let ownedCompletion: { readonly aheadAtArrival: number; readonly value: Completion } | undefined;
  const readCompletion = ():
    { readonly aheadAtArrival: number; readonly value: Completion } | undefined => ownedCompletion;
  try {
    // Proof: C33 A01 moved checkout before admission; `owned gate checkout queued under isolated Linux supervision` observed changed HEAD while the independent holder remained held; restoration passed.
    const outcome = await withGateAdmission(
      {
        path: captured.path,
        label: captured.label,
        command: 'pinned gate checkout ' + selected.commit,
        waitSeconds: captured.waitSeconds,
        pollSeconds: captured.pollSeconds,
      },
      control.signal,
      async (token) => {
        const admission = readGateAdmission(token);
        const captureCompletion = (value: Completion): void => {
          ownedCompletion = { aheadAtArrival: admission.aheadAtArrival, value };
        };
        return await runAdmittedCheckout(
          selected,
          captured,
          { signal: control.signal, readStatus: control.readStatus },
          token,
          captureCompletion,
        );
      },
    );
    // Proof: C33 S05 removed post-release checkpoint; `retains successful keep tree on late native signal without post-release Git mutation` lost the returned INT/status; restoration passed. Unchanged receipt members are not separate proof.
    await serviceInterrupts();
    return captureOutcome(outcome);
  } catch (cause) {
    const completed = readCompletion();
    if (completed === undefined) throw cause;
    const cleanup: Failure = { phase: 'cleanup', cause };
    const failures: Failure[] = [...completed.value.failures, cleanup];
    try {
      await captured.reportFailure(cleanup);
    } catch (reportCause) {
      failures.push({ phase: 'report', cause: reportCause });
    }
    await serviceInterrupts();
    // Proof: C33 R09 used numeric work74 for cleanup priority; `preserves work74 primary and reporting causes across actual admission close failure` returned74 instead of70; restoration passed. Matching cause members are not new credit.
    return captureOutcome({
      kind: 'completed',
      aheadAtArrival: completed.aheadAtArrival,
      value: {
        // Proof: C35 Task1b B07 used numeric work74 as restoration authority; late-close receipt wrongly retained74 instead of70; restored pass. Returned classification only, not each receipt member.
        // Proof: C35 Task1b B08 discarded restoration priority; late-close receipt downgraded restoration74 to70; restored pass. Returned classification only, not each receipt member.
        status: completed.value.failures.some((failure) => failure.phase === 'restore') ? 74 : 70,
        failures,
      },
    });
  } finally {
    control.dispose();
  }
}
