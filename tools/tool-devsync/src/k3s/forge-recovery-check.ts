export interface PodObservation {
  readonly uid: string;
  readonly container: string;
  readonly restarts: number;
  readonly ready: boolean;
  readonly oom: boolean;
}
export interface PolicySpec {
  readonly ingress: readonly unknown[];
  readonly [field: string]: unknown;
}
export interface RecoveryDriver {
  observe(): Promise<PodObservation | null>;
  kill(pod: PodObservation): Promise<void>;
  check(
    phase: 'first' | 'ingress-positive' | 'ingress-denied' | 'restored',
  ): Promise<{ exitCode: number; output: string }>;
  readPolicy(): Promise<PolicySpec>;
  writePolicy(policy: PolicySpec): Promise<void>;
  cleanup(): Promise<void>;
  pause(): Promise<void>;
}
type Verdict = 'pending' | 'pass' | 'fail';
interface RecoveryReport {
  cold: Verdict;
  recovery: Verdict[];
  firstChecker: Verdict;
  ingressPositive: Verdict;
  ingressNegative: Verdict;
  policyRestored: Verdict;
  restoredChecker: Verdict;
  cleanup: Verdict;
  acceptancePassed: boolean;
  failures: string[];
}
/**
 * Runs first-attempt diagnostics with independent verdicts. External commands belong to the
 * driver; this coordinator never converts later readiness into a successful cold start.
 * Every observation and command must have its own finite deadline in the driver.
 */
export async function rehearseRecovery(
  driver: RecoveryDriver,
  timeoutMs: number,
): Promise<RecoveryReport> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('positive timeout required');
  const report: RecoveryReport = {
    cold: 'pending',
    recovery: [],
    firstChecker: 'pending',
    ingressPositive: 'pending',
    ingressNegative: 'pending',
    policyRestored: 'pending',
    restoredChecker: 'pending',
    cleanup: 'pending',
    acceptancePassed: false,
    failures: [],
  };
  let saved: PolicySpec | undefined;
  const cold = { failed: false };
  const awaitReady = async (prior?: PodObservation): Promise<PodObservation> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pod = await driver.observe();
      if (pod !== null) {
        if (prior === undefined) cold.failed ||= pod.oom || pod.restarts !== 0;
        // Proof: foreign Pod UID injection fails "rejects foreign Pod UID after PID1 termination".
        if (prior !== undefined && pod.uid !== prior.uid)
          throw new Error('foreign Pod UID during recovery');
        if (pod.ready) {
          // Proof: unchanged identity/count injections fail their PID1 termination tests.
          if (
            prior !== undefined &&
            (pod.container === prior.container || pod.restarts <= prior.restarts)
          ) {
            await driver.pause();
            continue;
          }
          return pod;
        }
      }
      await driver.pause();
    }
    throw new Error('bounded readiness deadline exceeded');
  };
  try {
    let pod = await awaitReady();
    // Proof: first OOM and restart observations fail their cold tests despite later readiness.
    report.cold = cold.failed ? 'fail' : 'pass';
    for (let attempt = 0; attempt < 2; attempt++) {
      report.recovery.push('pending');
      await driver.kill(pod);
      pod = await awaitReady(pod);
      report.recovery[attempt] = 'pass';
    }
    const first = await driver.check('first');
    report.firstChecker = first.exitCode === 0 ? 'pass' : 'fail';
    const positiveIngress = await driver.check('ingress-positive');
    report.ingressPositive = positiveIngress.exitCode === 0 ? 'pass' : 'fail';
    saved = await driver.readPolicy();
    await driver.writePolicy({ ...saved, ingress: [] });
    const negative = await driver.check('ingress-denied');
    // Proof: omitted ingress denial and unrelated executable failure fail the negative tests.
    report.ingressNegative =
      report.ingressPositive === 'pass' &&
      negative.exitCode !== 0 &&
      /CHECK FAILED: (?:web serves index.html|MCP answers 401|MCP resource URL|gateway WebSocket|browser opens the gateway|timed out .* (?:page|browser|ingress))/.test(
        negative.output,
      )
        ? 'pass'
        : 'fail';
    await driver.writePolicy(saved);
    const restored = await driver.readPolicy();
    // Proof: injected policy readback mismatch fails restoration despite successful cleanup.
    report.policyRestored = equalPolicy(restored, saved) ? 'pass' : 'fail';
    if (report.policyRestored === 'pass') saved = undefined;
    const positive = await driver.check('restored');
    report.restoredChecker = positive.exitCode === 0 ? 'pass' : 'fail';
  } catch (failure) {
    report.failures.push(String(failure));
    if (report.cold === 'pending') report.cold = 'fail';
    report.recovery = report.recovery.map((verdict) => (verdict === 'pending' ? 'fail' : verdict));
  } finally {
    if (saved !== undefined) {
      try {
        await driver.writePolicy(saved);
        if (!equalPolicy(await driver.readPolicy(), saved)) {
          report.failures.push('cleanup policy restoration mismatch');
        }
      } catch (failure) {
        report.failures.push(String(failure));
      }
    }
    try {
      await driver.cleanup();
      report.cleanup = 'pass';
    } catch (failure) {
      report.cleanup = 'fail';
      report.failures.push(String(failure));
    }
  }
  report.acceptancePassed =
    report.failures.length === 0 &&
    report.cold === 'pass' &&
    report.recovery.length === 2 &&
    report.recovery.every((verdict) => verdict === 'pass') &&
    [
      report.firstChecker,
      report.ingressPositive,
      report.ingressNegative,
      report.policyRestored,
      report.restoredChecker,
      report.cleanup,
    ].every((verdict) => verdict === 'pass');
  return report;
}

/** Kubernetes may reorder object keys; arrays and every field retain exact meaning. */
function equalPolicy(left: unknown, right: unknown): boolean {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, field]) => [key, canonicalize(field)]),
      );
    }
    return value;
  };
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}
