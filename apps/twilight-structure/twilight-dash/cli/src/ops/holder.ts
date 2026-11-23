import type { Admission, QueueOutcome } from '@shared/heavy-lock';

import type { Reservation } from '../resources/hold-log';
import { resolveReadyFile } from '../resources/hold-paths';
export { resolveReadyFile } from '../resources/hold-paths';
import {
  createDecision,
  createHold,
  formatIdentity,
  type Hold,
  readDecision,
  verifyHold,
} from '../resources/hold-token';
import { identifySelf } from '../resources/process-identity';

export interface Request {
  readonly holdFile: string;
  readonly label: string;
  readonly waitSeconds: number;
  readonly pollSeconds: number;
}
export interface Context {
  readonly recordControllerCancellation: () => void;
  readonly reservation: Reservation;
  readonly path: string;
  readonly signal: AbortSignal;
  readonly reportAdmission: (admission: Admission) => Promise<void>;
  /** The executable supplies a bounded reporter; failure remains part of the terminal outcome. */
  readonly reportUnconfirmed: (observation: {
    readonly pid: number;
    readonly cause: unknown;
  }) => Promise<void>;
}
export type Payload = { readonly kind: 'released' } | { readonly kind: 'cancelled' };
/** Authorized release before admission has no queue-arrival metadata or synthetic interrupt. */
export type Outcome = QueueOutcome<Payload> | { readonly kind: 'released' };

/**
 * Own a detached hold directly, without a payload child or frontend heartbeat. The complete
 * child identity precedes queue entry; a separate immutable readiness token is published only
 * after queue admission. Parent handoff must verify both identities plus the canonical record.
 * Authorized removal of the unchanged hold token ends normal ownership. Unexpected evidence
 * or readiness publication failure retains a referenced callback until verified authorized token removal or explicit holder cancellation;
 * it cannot throw through queue cleanup and release possibly admitted compute. This fixed loop
 * owns no compute descendants, and owner death never establishes their settlement.
 */
export async function runHolder(request: Request, context: Context): Promise<Outcome> {
  const selected = { ...request },
    path = context.path,
    signal = context.signal;
  /** Re-read externally mutable abort state instead of retaining readonly-property narrowing across waits. */
  // Proof: fresh-native-abort kept the real SIGINT-aborted helper alive when abort state was captured early.
  const isCancelled = (): boolean => signal.aborted;
  const reportAdmission = context.reportAdmission,
    reportUnconfirmed = context.reportUnconfirmed;
  const reservation = context.reservation,
    recordControllerCancellation = context.recordControllerCancellation;
  const retention = setInterval(() => undefined, 1000);
  let execution: { kind: 'completed'; outcome: Outcome } | { kind: 'failed'; cause: unknown };
  try {
    // Proof: holder-reservation-binding published Ready in another generation without this binding.
    if (reservation.holdFile !== selected.holdFile)
      throw new Error('durable hold request does not match its log reservation');
    if (isCancelled()) return { kind: 'cancelled' };
    const controllerBytes = formatIdentity(reservation.controller);
    function readWithdrawal(token?: Hold): 'pending' | 'cancelled' | 'retired' {
      const decision = readDecision(resolveReadyFile(selected.holdFile));
      if (decision === undefined) return 'pending';
      // Proof: bypassing controller birth made the foreign tagged cancelled test exit143 instead of70.
      if (decision.kind === 'cancelled' && formatIdentity(decision.identity) === controllerBytes)
        return 'cancelled';
      // Proof: bypassing helper birth made the foreign tagged retired test exit0 instead of70.
      if (decision.kind === 'retired' && formatIdentity(decision.identity) === token?.bytes)
        return 'retired';
      throw new Error('durable hold readiness already exists');
    }
    const wasCancelled = readWithdrawal() === 'cancelled';
    // Proof: prequeue-child-witness moved publication below cancellation and lost the actual143 child identity.
    const ownToken = createHold(selected.holdFile, identifySelf());
    if (wasCancelled) {
      recordControllerCancellation();
      return { kind: 'cancelled' };
    }
    const { runQueuedWork, createQueueRuntime } = await import('@shared/heavy-lock');
    const runtime = createQueueRuntime(signal),
      readElapsed = runtime.readElapsed,
      wait = runtime.wait;
    let wasReleasedBeforeAdmission = false;
    const readRelease = (): boolean => wasReleasedBeforeAdmission;
    function withdrawBeforeAdmission(): Payload | undefined {
      const withdrawal = readWithdrawal(ownToken);
      if (withdrawal === 'cancelled') {
        recordControllerCancellation();
        return { kind: 'cancelled' };
      }
      if (withdrawal === 'retired' || verifyHold(ownToken) === 'released') {
        wasReleasedBeforeAdmission = true;
        return { kind: 'released' };
      }
      return undefined;
    }
    // Proof: queued-withdrawal-poll and queued-original-release retained the native child without these withdrawal checks.
    const queueRuntime = {
      ...runtime,
      wait: async (seconds: number) => {
        const deadline = readElapsed() + seconds;
        for (;;) {
          if (isCancelled()) return 'cancelled' as const;
          if (withdrawBeforeAdmission() !== undefined) return 'cancelled' as const;
          const remaining = deadline - readElapsed();
          if (remaining <= 0) return 'elapsed' as const;
          if ((await wait(Math.min(0.05, remaining))) === 'cancelled') return 'cancelled' as const;
        }
      },
    };
    try {
      const outcome = await runQueuedWork(
        {
          path,
          label: selected.label,
          waitSeconds: selected.waitSeconds,
          pollSeconds: selected.pollSeconds,
          command: 'puni dash internal durable holder v1',
        },
        async (admission) => {
          if (isCancelled()) return { kind: 'cancelled' as const };
          const withdrawal = withdrawBeforeAdmission();
          if (withdrawal !== undefined) return withdrawal;
          async function retain(cause: unknown, prior: readonly unknown[] = []): Promise<never> {
            const failures: unknown[] = [...prior, cause];
            try {
              await reportUnconfirmed({ pid: ownToken.identity.pid, cause });
            } catch (reportFailure) {
              failures.push(reportFailure);
            }
            let observation: { kind: 'none' } | { kind: 'failed'; cause: unknown } = {
              kind: 'none',
            };
            // Proof: holder-retain-* exited the real helper with 70 after evidence loss without this wait.
            while (!isCancelled()) {
              try {
                if (verifyHold(ownToken) === 'released') break;
              } catch (cause) {
                if (observation.kind === 'none') observation = { kind: 'failed', cause };
              }
              await Bun.sleep(50);
            }
            if (observation.kind === 'failed') failures.push(observation.cause);
            throw new AggregateError(failures, 'durable hold authority observation failed');
          }
          let ready: Hold;
          try {
            // Publication may become visible even when a later observation or close fails.
            // Proof: ready-admission-fence published Ready while another native holder owned the mutex when moved above admission.
            ready = createDecision(resolveReadyFile(ownToken.path), 'ready', ownToken.identity);
          } catch (cause) {
            try {
              const withdrawal = withdrawBeforeAdmission();
              if (withdrawal !== undefined) return withdrawal;
            } catch (observationFailure) {
              return await retain(
                new AggregateError(
                  [cause, observationFailure],
                  'durable handoff publication failed',
                ),
              );
            }
            return await retain(cause);
          }
          const reportingFailures: unknown[] = [];
          try {
            await reportAdmission(admission);
          } catch (cause) {
            // Proof: holder-report-retain unwound actual ownership when the reporter failure escaped.
            reportingFailures.push(cause);
            try {
              await reportUnconfirmed({ pid: ownToken.identity.pid, cause });
            } catch (reportFailure) {
              reportingFailures.push(reportFailure);
            }
          }
          let isReleased = false;
          try {
            while (!isCancelled()) {
              if (verifyHold(ready) !== 'present')
                throw new Error('durable hold readiness disappeared');
              if (verifyHold(ownToken) === 'released') {
                isReleased = true;
                break;
              }
              await Bun.sleep(50);
            }
          } catch (cause) {
            return await retain(cause, reportingFailures);
          }
          // Delivery failure cannot release live compute, but known authorized release can settle it.
          // Proof: holder-report-cause returned 0 after authorized release instead of the prior failure.
          if (reportingFailures.length !== 0)
            throw new AggregateError(reportingFailures, 'durable hold admission reporting failed');
          return isReleased ? { kind: 'released' as const } : { kind: 'cancelled' as const };
        },
        queueRuntime,
      );
      execution = {
        kind: 'completed',
        outcome: outcome.kind === 'cancelled' && readRelease() ? { kind: 'released' } : outcome,
      };
    } catch (cause) {
      execution = { kind: 'failed', cause };
    }
    const failures: unknown[] = [];
    if (execution.kind === 'failed') failures.push(execution.cause);
    // Proof: deleting Ready at authorized settlement failed the complete child identity test.
    // Proof: ready-witness-retention and retired-witness-retention removed the complete decision under eager cleanup.
    // Ready and Retired retain the complete helper witness until qualified generation cleanup.
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(failures, 'durable hold operation and cleanup failed');
    if (execution.kind !== 'completed') throw new Error('durable hold failure was not preserved');
    return execution.outcome;
  } finally {
    clearInterval(retention);
  }
}
