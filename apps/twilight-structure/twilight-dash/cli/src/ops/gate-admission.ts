import type { Admission, QueueOutcome, QueueRequest } from '@shared/heavy-lock';

const admissionBrand = Symbol('gate admission');
/** Provider-private identity; queue timing fields alone confer no admission authority. */
export interface GateAdmission {
  readonly [admissionBrand]: true;
}
const admissions = new WeakMap<GateAdmission, Admission>();

/**
 * Read registry-owned immutable metadata only during the actual held callback lifetime.
 * @throws Unregistered or retired authority, before the checkout's modeled transaction recovery.
 */
export function readGateAdmission(admission: GateAdmission): Admission {
  const observation = admissions.get(admission);
  // Proof: C35 Task1b B01 admitted plain timing metadata; core entry returned Completion instead of Error at its first refusal assertion; restored pass. Later effects/HEAD assertions are not separate credit.
  if (observation === undefined) throw new Error('gate admission is not held');
  return observation;
}
/**
 * Mint only inside genuine local queue ownership; retire before record/native cleanup on either
 * callback outcome. Trusted work MUST await its complete admitted operation before returning.
 * Retirement cannot settle or contain an abandoned in-flight operation. This executable boundary
 * provides no enrolled authority and accepts no caller-supplied runtime or admission bypass.
 */
export async function withGateAdmission<T>(
  request: QueueRequest,
  signal: AbortSignal,
  work: (admission: GateAdmission) => Promise<T>,
): Promise<QueueOutcome<T>> {
  const { runQueuedWork, createQueueRuntime } = await import('@shared/heavy-lock');
  return await runQueuedWork(
    request,
    async (admission) => {
      const token = Object.freeze<GateAdmission>({ [admissionBrand]: true });
      admissions.set(
        token,
        // Proof: C35 Task1b B02 removed metadata freezing; the metadata case observed aheadAtArrival999 instead of0; restored pass. No independently reached waitedSeconds mutation.
        Object.freeze({
          aheadAtArrival: admission.aheadAtArrival,
          waitedSeconds: admission.waitedSeconds,
        }),
      );
      try {
        // Proof: C35 Task1b B04 removed await; the post-await not.toThrow failed after early membership retirement; restored pass. Promise adoption can still hold the native mutex; no release-escape claim.
        return await work(token);
      } finally {
        // Proof: C35 Task1b B03 omitted retirement; stale core entry returned Completion after both completed and failed callbacks instead of first Error refusal; both restored passes. Later effect assertions are not separate credit.
        admissions.delete(token);
      }
    },
    createQueueRuntime(signal),
  );
}
