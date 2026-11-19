import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:os';
import { Readable, Writable } from 'node:stream';

import type { Monotonic, WallClock } from '../clock';
import {
  awaitLegacyRelease,
  holdLegacyLock,
  jobHoldFile,
  type LegacyHold,
  type LegacyLock,
} from '../resources/legacy-lock';
import {
  type ContainerEvidence,
  declaredContainersOnly,
  type HostFacts,
  type HostJob,
  HostPoolModeRefusal,
  loadResourceConfiguration,
  ResourceRuntime,
} from '../resources/runtime';
import {
  type CataloguedJob,
  currentHead,
  hostClassOf,
  readCataloguedJob,
  toolchainOf,
} from './catalogue';
import { checkDockerAvailable, ContainerWatch, dockerContainerEvidence } from './containers';
import type { SubscribeControl } from './gate-control';
import {
  encodeGatedEnvironment,
  type GatedStatus,
  parseGatedStatus,
} from './gated-payload-protocol';
import { createJobControl, type JobControl, type JobInterruption } from './job-control';
import { readTermination } from './native-exit';
import { causeText, type OpsExitCode, OpsRefusal } from './refusal';
import { HostJobRunRecords, type RunSample } from './run-records';
import {
  checkScopeAvailable,
  directoryBytes,
  scopeArguments,
  type ScopeTelemetry,
  scopeUnitOf,
} from './scope';
import { checkEligibleTypes } from './switch-mode';

/** `ops job run`'s parsed command line (J7). */
export interface JobRunRequest {
  readonly config: string;
  readonly type: string;
  readonly label: string;
  readonly waitSeconds: number;
  readonly pollSeconds: number;
  readonly argv: readonly string[];
}

/** Everything `ops job run` reaches outside its arguments. */
export interface JobRunDependencies {
  /** Borrow cancellation only; the executable owner retains native listener disposal. */
  readonly control?: { readonly subscribe: SubscribeControl };
  /** Fully Dash-namespaced protected selected installation; captured before admission waits. */
  readonly helperPrefix: readonly string[];
  readonly clock: WallClock;
  readonly monotonic: Monotonic;
  /** The payload's environment before the job variables, and where tools are found (`PATH`). */
  readonly environment: Readonly<Record<string, string | undefined>>;
  /** Where the payload runs; its checkout's HEAD names the catalogue revision. */
  readonly cwd: string;
  /** Dash's own lines, one per call (stderr in production); the payload keeps both streams. */
  readonly report: (line: string) => void;
  readonly telemetry: ScopeTelemetry;
  readonly host: HostFacts;
  /** Ten seconds in production (J7). */
  readonly sampleIntervalMs: number;
  /** How long the launcher keeps settling before it leaves the job to `watch`. */
  readonly settleBudgetMs: number;
  /** The account the linger fix names. */
  readonly user: string;
  /** Native owner of the shared queue every host job takes in observe mode (J12). */
  readonly legacyLock: LegacyLock;
}

/** Polls between the scope check's readings of `/proc/<pid>/cgroup`. */
const SCOPE_POLL_MS = 10;
const SCOPE_START_BUDGET_MS = 15_000;

/**
 * The environment the payload starts with (J7). A calibration holds every unit of the pool; its
 * payload is handed the first unit of each id its envelope names, as an ordinary run would be.
 */
function jobEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  job: HostJob,
  label: string,
): Record<string, string> {
  // Proof: assignment-map replacement loses caller __proto__ in the actual selected
  // payload test `native payload preserves the exact supplied unusual environment names
  // before private transport`. Scope telemetry is emulated; no new real-systemd claim.
  const variables: Record<string, string> = Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  variables['TMPDIR'] = job.locator;
  variables['DASH_JOB_ID'] = job.id;
  variables['DASH_JOB_TYPE'] = job.descriptor.id;
  variables['HEAVY_LOCK_LABEL'] = label;
  for (const exclusiveId of job.descriptor.envelope.exclusive) {
    const unit = job.units.find((held) => held.exclusiveId === exclusiveId);
    if (unit === undefined) throw new Error(`host job ${job.id} holds no ${exclusiveId} unit`);
    variables[`DASH_JOB_UNIT_${exclusiveId.toUpperCase()}`] = unit.path;
  }
  return variables;
}

/** The leader never became a process: nothing ran and no identity can be recorded. */
class LaunchUnstarted extends Error {
  override readonly name = 'LaunchUnstarted';
}

/** Observe native writable delivery/half-close; a failed control never authorizes success. */
function writeControl(gate: Writable, text: string, end: boolean): Promise<void> {
  return new Promise((resolveWrite, rejectWrite) => {
    const failed = (cause: Error) => {
      gate.off('error', failed);
      rejectWrite(cause);
    };
    gate.once('error', failed);
    const delivered = (cause?: Error | null) => {
      gate.off('error', failed);
      if (cause) rejectWrite(cause);
      else resolveWrite();
    };
    if (end) gate.end(text, delivered);
    else gate.write(text, delivered);
  });
}

/** Actual stream evidence; native exit and an expired observation budget are never EOF. */
type PayloadObservation =
  | GatedStatus
  | { readonly kind: 'read-failed'; readonly cause: unknown }
  | { readonly kind: 'closed-before-end' }
  | { readonly kind: 'unconfirmed' };

interface Launched {
  child: ChildProcess;
  pid: number;
  gate: Writable;
  /** Canonical payload status, absent status and malformed status remain distinct. */
  payloadStatus: Promise<PayloadObservation>;
  environment: Writable;
  environmentTransfer: Promise<
    { readonly kind: 'transferred' } | { readonly kind: 'failed'; readonly cause: unknown }
  >;
  startupDeadline: number;
  /** Resolves with the leader's own status once it exits. */
  leaderExit: Promise<number>;
  readObservation():
    { readonly kind: 'healthy' } | { readonly kind: 'failed'; readonly cause: unknown };
}

function launchGated(
  systemdRun: string,
  unit: string,
  catalogued: CataloguedJob,
  job: HostJob,
  argv: readonly string[],
  label: string,
  deps: JobRunDependencies,
): Launched {
  const frame = encodeGatedEnvironment(jobEnvironment(deps.environment, job, label));
  const startupDeadline = deps.monotonic.now() + SCOPE_START_BUDGET_MS;
  const child = spawn(
    systemdRun,
    [
      ...scopeArguments(unit, catalogued.descriptor, job.calibration === true),
      '--',
      ...deps.helperPrefix,
      'ops',
      'job',
      'payload-internal-v1',
      '--',
      ...argv,
    ],
    {
      cwd: deps.cwd,
      detached: true,
      stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe', 'pipe'],
      env: deps.environment,
    },
  );
  let observation:
    { readonly kind: 'healthy' } | { readonly kind: 'failed'; readonly cause: unknown } = {
    kind: 'healthy',
  };
  function recordObservationFailure(cause: unknown): void {
    const prior = observation;
    observation = {
      kind: 'failed',
      cause:
        prior.kind === 'healthy'
          ? cause
          : new AggregateError([prior.cause, cause], 'multiple native leader observations failed'),
    };
    try {
      deps.report(
        'ops job: native scope helper observation failed; retaining ownership until actual native settlement',
      );
    } catch (reportCause) {
      observation = {
        kind: 'failed',
        cause: new AggregateError(
          [observation.cause, reportCause],
          'native leader observation and reporting failed',
        ),
      };
    }
  }
  const retained = setInterval(() => undefined, 1000);
  const leaderExit = new Promise<number>((resolveExit, rejectExit) => {
    child.once('error', (cause) => {
      // Proof: rejecting this join on a post-PID error finishes the operation before its
      // held native helper in `gated job observation leader-error`; retained reservations
      // and external telemetry remain separate authorities.
      if (child.pid === undefined) {
        clearInterval(retained);
        rejectExit(cause);
      } else recordObservationFailure(cause);
    });
    child.once('exit', (code, signal) => {
      const termination = readTermination(code, signal);
      if (termination.kind !== 'confirmed') {
        recordObservationFailure(termination.cause);
        return;
      }
      clearInterval(retained);
      resolveExit(termination.status);
    });
  });
  // A leader that never started (its executable gone since the probe) reports on `leaderExit`.
  // Proof: without this check `refuses 70 when systemd-run vanishes before the launch`
  // (job-run.test.ts) failed on "host job gate pipes unavailable" (2026-11-02, review F13).
  if (child.pid === undefined) {
    clearInterval(retained);
    void leaderExit.catch(() => undefined);
    throw new LaunchUnstarted(`${systemdRun} did not start`);
  }
  const pid = child.pid;
  const gate = child.stdio[3];
  const status = child.stdio[4],
    environment = child.stdio.at(5);
  if (
    !(gate instanceof Writable) ||
    !(status instanceof Readable) ||
    !(environment instanceof Writable)
  )
    throw new Error('host job gate pipes unavailable');
  // A gate write after the helper ended is an expected EPIPE, never a crash of the launcher.
  gate.on('error', () => undefined);
  const environmentTransfer = new Promise<
    { readonly kind: 'transferred' } | { readonly kind: 'failed'; readonly cause: unknown }
  >((resolveTransfer) => {
    environment.once('error', (cause) => {
      resolveTransfer({ kind: 'failed', cause });
    });
    environment.once('close', () => {
      if (!environment.writableFinished)
        resolveTransfer({
          kind: 'failed',
          cause: new Error('private environment closed before transfer'),
        });
    });
    environment.end(frame, () => {
      resolveTransfer({ kind: 'transferred' });
    });
  });
  const statusRetained = setInterval(() => undefined, 1000);
  const payloadStatus = new Promise<PayloadObservation>((resolveStatus) => {
    const settleStatus = (observation: PayloadObservation) => {
      clearInterval(statusRetained);
      resolveStatus(observation);
    };
    let bytes = Buffer.alloc(0),
      invalid = false,
      ended = false;
    status.on('data', (chunk: Buffer) => {
      if (invalid) return;
      if (chunk.byteLength > 4 - bytes.byteLength) {
        invalid = true;
        return;
      }
      bytes = Buffer.concat([bytes, chunk]);
    });
    status.once('error', (cause) => {
      invalid = true;
      settleStatus({ kind: 'read-failed', cause });
    });
    status.once('end', () => {
      ended = true;
      settleStatus(invalid ? { kind: 'invalid' } : parseGatedStatus(bytes));
    });
    status.once('close', () => {
      if (!ended) settleStatus({ kind: 'closed-before-end' });
    });
  });
  return {
    readObservation: () => observation,
    child,
    pid,
    gate,
    environment,
    environmentTransfer,
    startupDeadline,
    payloadStatus,
    leaderExit,
  };
}

/**
 * Join actual FD4 evidence even when the native leader exits before queued stream events.
 * One second after actual leader end is an observation budget, not an execution timeout or
 * evidence that writers/descendants are absent. Expiry reports once and keeps the real reader,
 * native reservation and hold owned until stream settlement. Empty EOF, malformed bytes,
 * read failure and close-before-end remain distinct; no native status substitutes for them.
 */
async function joinPayloadStatus(
  launched: Launched,
  deps: Pick<JobRunDependencies, 'report'>,
): Promise<PayloadObservation> {
  const observed = launched.payloadStatus.then((outcome) => ({
    kind: 'observed' as const,
    outcome,
  }));
  const first = await Promise.race([
    observed,
    launched.leaderExit.then(() => ({ kind: 'leader-ended' as const })),
  ]);
  // Proof: synthesizing absence here loses genuine330a/EOF delivered after actual
  // helper SIGKILL in `gated job observation fd4-delayed`; restored code preserves3.
  // Native exit is not stream EOF, and exit sampling may still lose telemetry.
  if (first.kind === 'observed') return first.outcome;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const next = await Promise.race([
    observed,
    new Promise<{ readonly kind: 'unconfirmed' }>((resolveExpiry) => {
      timer = setTimeout(() => {
        resolveExpiry({ kind: 'unconfirmed' });
      }, 1000);
    }),
  ]);
  clearTimeout(timer);
  if (next.kind === 'observed') return next.outcome;
  let reporting: { readonly cause: unknown } | undefined;
  try {
    // Proof: human-selected observation17 changes this text and fails the reports
    // assertion in `gated job observation fd4-unconfirmed`; one unchanged later baseline
    // passed. Message-only scope: the excluded original recipe is not a lifetime,
    // resource-release or cleanup proof.
    deps.report(
      'ops job: FD4 observation remains unconfirmed after native helper exit; retaining reader, job and hold ownership',
    );
  } catch (cause) {
    reporting = { cause };
  }
  const actual = await launched.payloadStatus;
  if (reporting !== undefined)
    throw actual.kind === 'read-failed'
      ? new AggregateError([reporting.cause, actual.cause], 'FD4 observation and reporting failed')
      : reporting.cause;
  return actual;
}

/**
 * The scope's cgroup once the gated leader is in `unit`, or null when the leader ended or the
 * start budget passed first (the user manager refused or hung), or when the launcher was interrupted.
 */
async function awaitScope(
  telemetry: ScopeTelemetry,
  pid: number,
  unit: string,
  leaderExit: Promise<number>,
  monotonic: Monotonic,
  interrupted: AbortSignal,
  deadline: number,
): Promise<string | null> {
  const leader = { ended: false };
  void leaderExit.then(
    () => {
      leader.ended = true;
    },
    () => {
      leader.ended = true;
    },
  );
  while (!leader.ended && !interrupted.aborted && monotonic.now() < deadline) {
    const cgroup = telemetry.cgroupOf(pid);
    if (cgroup?.endsWith(`/${unit}.scope`)) return cgroup;
    await Bun.sleep(SCOPE_POLL_MS);
  }
  return null;
}

/**
 * Settle the job on its terminal evidence for up to `budgetMs`, reporting each entry once it
 * stops changing: released, blocked, or still outstanding for `watch` to finish.
 */
async function settle(
  runtime: ResourceRuntime,
  jobId: string,
  containers: ContainerEvidence,
  deps: JobRunDependencies,
): Promise<void> {
  const deadline = deps.monotonic.now() + deps.settleBudgetMs;
  let job = runtime.settleHostJob(jobId, containers);
  // Immediately, then 250 ms (the Bun gate helper is usually just exiting), then once a second:
  // each pass takes the ledger write lock and reads Git and Docker inside it, which would
  // starve other launchers' polls if repeated faster (reviews F6, R9).
  for (
    let pass = 0;
    job.state !== 'released' && job.state !== 'blocked' && deps.monotonic.now() < deadline;
    pass++
  ) {
    await Bun.sleep(pass === 0 ? 250 : 1000);
    job = runtime.settleHostJob(jobId, containers);
  }
  const entries = [
    ['compute', job.compute],
    ['tmp', job.tmpDisk],
    ...job.units.map((unit) => [`unit ${unit.exclusiveId} ${unit.path}`, unit] as const),
  ] as const;
  for (const [name, entry] of entries)
    deps.report(
      `ops job: ${job.id} ${name} ${entry.state}: ${entry.reason}${entry.state === 'released' ? '' : '; watch settles it'}`,
    );
}

/** An empty-safe sample built at `observedAt` from whatever the readings answered. */
function readSample(
  kind: RunSample['kind'],
  observedAt: number,
  telemetry: ScopeTelemetry,
  cgroup: string,
  tmpDirectory: string,
): RunSample {
  const failures: string[] = [];
  let counters: RunSample['counters'] = null;
  try {
    // The exit sample needs a live scope: an emptied one is torn down underneath the reading.
    // Proof: never refusing here made `a scope torn down early is a recorded telemetry failure`
    // (job-run.test.ts) record no telemetry failure (2026-11-01, Slice 3).
    if (kind === 'exit' && telemetry.members(cgroup).length === 0)
      throw new Error(`scope ${cgroup} torn down before the exit sample`);
    counters = telemetry.read(cgroup);
  } catch (cause) {
    failures.push(causeText(cause));
  }
  let tmpBytes: number | null = null;
  try {
    tmpBytes = directoryBytes(tmpDirectory);
  } catch (cause) {
    failures.push(`tmp directory ${tmpDirectory} unreadable: ${causeText(cause)}`);
  }
  return {
    kind,
    observedAt,
    counters,
    tmpBytes,
    containers: null,
    failure: failures.length === 0 ? null : failures.join('; '),
  };
}

/** The exit code a launcher interrupted before its payload started returns, as a shell's. */
function interruptedCode(interruption: JobInterruption): 129 | 130 | 143 {
  if (interruption.kind === 'external') return 130;
  if (interruption.signal === 'SIGHUP') return 129;
  return interruption.signal === 'SIGINT' ? 130 : 143;
}

/** External reasons are opaque and never interpolated into job diagnostics. */
function interruptionText(interruption: JobInterruption): string {
  return interruption.kind === 'external'
    ? 'externally cancelled'
    : `interrupted by ${interruption.signal}`;
}

/** Expected cancellation must retain an observed control; queue wake alone supplies no provenance. */
function requireInterruption(interruption: JobInterruption | null): JobInterruption {
  if (interruption === null) throw new Error('host job cancellation lacks an observed control');
  return interruption;
}

/** The operation's first interruption and queue wake, without owner disposal authority. */
type Interruption = Pick<JobControl, 'signal' | 'received'>;

/**
 * Run one host job measured (`dash-host-jobs` J7, J8, J16): read the catalogue at the checkout's
 * HEAD; refuse before anything is reserved when the host cannot measure it; admit through the
 * host pool (73, 75); launch the payload through the FD gate inside a transient user scope,
 * persisting the leader's identity and the gate sample before the gate opens; sample every
 * interval and at exit; record the exit, settle on terminal evidence and return the payload's
 * own status. A signal before the gate opens refuses 129/130/143 with the payload never run; one
 * after is forwarded to the payload's session. Borrowed external cancellation refuses130 before
 * start with a redacted diagnostic and uses TERM transport afterward, preserving the parent's
 * reason and the payload's qualified status. The operation retires only its control lease after
 * native/FD/resource settlement; synchronous delivery failures surface after those joins. A failure
 * to read telemetry or to write a record after the gate opened is recorded and reported, never
 * substituted for the payload's status. Retirement is attempted once after required joins; its
 * failure never skips retained delivery causes. A sole operation/retirement/delivery cause is
 * rethrown unchanged, while concurrent causes retain their identities in an AggregateError.
 * @throws OpsRefusal for every refusal before the payload runs (64, 70, 73, 75, 129, 130, 143).
 */
export function runHostJob(request: JobRunRequest, deps: JobRunDependencies): Promise<number> {
  return executeHostJob(request, deps, false);
}

/**
 * Run one calibration of a host job (`dash-host-jobs` J9): as {@link runHostJob}, but admitted
 * only once the pool has drained, holding the whole `allocatable` vector and every exclusive
 * unit, in a scope with no `MemoryHigh` or `MemoryMax`, recorded as a calibration record.
 * @throws OpsRefusal as {@link runHostJob} does; 75 when the pool did not drain within the wait.
 */
export function calibrateHostJob(
  request: JobRunRequest,
  deps: JobRunDependencies,
): Promise<number> {
  return executeHostJob(request, deps, true);
}

async function executeHostJob(
  request: JobRunRequest,
  deps: JobRunDependencies,
  isCalibration: boolean,
): Promise<number> {
  const subscribe = deps.control?.subscribe;
  const prefix = [...deps.helperPrefix];
  if (prefix.length === 0 || prefix.some((word) => word === '' || word.includes('\0')))
    throw new OpsRefusal(70, 'ops job run: selected protected helper prefix is invalid');
  deps = {
    ...deps,
    helperPrefix: Object.freeze(prefix),
    environment: Object.freeze(Object.fromEntries(Object.entries(deps.environment))),
    cwd: deps.cwd,
  };
  request = { ...request, argv: Object.freeze([...request.argv]) };
  const control = createJobControl(subscribe),
    failures: unknown[] = [];
  let execution: { kind: 'completed'; status: number } | { kind: 'failed'; cause: unknown };
  try {
    const prior = control.received();
    if (prior !== null)
      throw new OpsRefusal(
        interruptedCode(prior),
        'ops job run: ' + interruptionText(prior) + ' before the gate opened',
      );
    execution = {
      kind: 'completed',
      status: await executeControlledHostJob(request, deps, isCalibration, control),
    };
  } catch (cause) {
    execution = { kind: 'failed', cause };
  } finally {
    try {
      control.close();
    } catch (cause) {
      failures.push(cause);
    }
  }
  try {
    control.throwIfFailed();
  } catch (cause) {
    failures.push(cause);
  }
  if (execution.kind === 'completed' && failures.length === 0) return execution.status;
  const causes = execution.kind === 'failed' ? [execution.cause, ...failures] : failures;
  if (causes.length === 1) throw causes[0];
  throw new AggregateError(causes, 'host job operation or control settlement failed');
}

async function executeControlledHostJob(
  request: JobRunRequest,
  deps: JobRunDependencies,
  isCalibration: boolean,
  interruption: JobControl,
): Promise<number> {
  const catalogued = readCataloguedJob(deps.cwd, request.type, request.argv);
  // One total wait (J12): the pool's admission and, in observe mode, the shell lock's queue.
  const arrivedAt = deps.clock.read();
  const toolchain = toolchainOf(deps.environment);
  const typeId = catalogued.descriptor.id;
  let runtime: ResourceRuntime;
  try {
    runtime = ResourceRuntime.open(loadResourceConfiguration(request.config), deps.clock);
  } catch (cause) {
    throw new OpsRefusal(
      70,
      `ops job run: host pool ${request.config} unusable: ${causeText(cause)}`,
      { cause },
    );
  }
  try {
    checkEligibleTypes(runtime.configuration, 'ops job run');
  } catch (cause) {
    runtime.close();
    throw cause;
  }
  let records: HostJobRunRecords;
  try {
    records = HostJobRunRecords.open(runtime.configuration.root, runtime.listHostJobs().length > 0);
  } catch (cause) {
    runtime.close();
    throw new OpsRefusal(70, `ops job run: ${causeText(cause)}`, { cause });
  }
  try {
    const docker =
      catalogued.descriptor.containers === 'none'
        ? null
        : checkDockerAvailable(deps.environment, typeId);
    const systemdRun = checkScopeAvailable(
      deps.environment,
      catalogued.descriptor,
      `dash-probe-${randomUUID()}`,
      deps.user,
      isCalibration,
    );
    const admission = await runtime.admitHostJob(
      {
        descriptor: catalogued.descriptor,
        label: request.label,
        waitSeconds: request.waitSeconds,
        ...(isCalibration ? { calibration: true as const } : {}),
      },
      {
        pollMs: request.pollSeconds * 1000,
        signal: interruption.signal,
        report: (line) => {
          deps.report(line);
        },
      },
    );
    if (admission.kind === 'cancelled') {
      const received = requireInterruption(interruption.received());
      throw new OpsRefusal(
        interruptedCode(received),
        `ops job run: ${typeId} ${request.label} ${interruptionText(received)} while waiting; its ticket is withdrawn`,
      );
    }
    if (admission.kind === 'refused') throw new OpsRefusal(admission.exitCode, admission.reason);
    if (admission.kind === 'waiting') throw new Error('host job admission returned while waiting');
    // The pool's mode cannot change under an admitted job: a switch waits for every unreleased
    // compute entry, this one included (J12). Proof: skipping the shell lock here made `a Dash
    // job never overlaps a legacy holder` (host-pool-mode.test.ts) see the runs overlap
    // (2026-11-02, Slice 6b).
    const legacyHold =
      runtime.hostPoolTransition().mode === 'observe'
        ? await queueOnLegacyLock(runtime, admission.job, request, arrivedAt, deps, interruption)
        : null;
    const containers =
      docker === null ? declaredContainersOnly : dockerContainerEvidence(docker, deps.environment);
    let execution: { kind: 'completed'; status: number } | { kind: 'failed'; cause: unknown };
    try {
      execution = {
        kind: 'completed',
        status: await runAdmitted(
          runtime,
          records,
          admission.job,
          catalogued,
          systemdRun,
          docker,
          containers,
          request,
          toolchain,
          deps,
          interruption,
          (recipient) => {
            interruption.setRecipient(recipient);
          },
        ),
      };
    } catch (cause) {
      execution = { kind: 'failed', cause };
    }
    if (legacyHold !== null) {
      try {
        await endLegacyHold(runtime, admission.job.id, legacyHold, deps);
      } catch (cleanupFailure) {
        if (execution.kind === 'failed')
          throw new AggregateError(
            [execution.cause, cleanupFailure],
            'host job operation and native hold cleanup failed',
            { cause: cleanupFailure },
          );
        throw cleanupFailure;
      }
    }
    if (execution.kind === 'failed') throw execution.cause;
    return execution.status;
  } finally {
    records.close();
    runtime.close();
  }
}

/**
 * Observe mode (J12): queue the admitted job through the native host-lock owner with what is
 * left of its one wait budget. Historical callers and Dash jobs share the same tickets,
 * deadlines, holder records and labels (`dash-job-<id> <label>`); the job launches only once
 * its immutable child token and Ready handoff are corroborated. A refusal or an interruption there withdraws the job, which was never prepared
 * or launched, releasing its reservation at once.
 * @throws OpsRefusal 75 when the shell lock gives no turn within the budget left, 129/130/143
 * when interrupted while queued there, 70 for any other refusal of the shell lock. A cancelled
 * outcome without observed control throws after checked withdrawal of this known unprepared
 * admission; concurrent provenance/withdrawal causes are aggregated. Native acquisition throws
 * or retained ownership do not authorize this withdrawal path.
 */
async function queueOnLegacyLock(
  runtime: ResourceRuntime,
  job: HostJob,
  request: JobRunRequest,
  arrivedAt: number,
  deps: JobRunDependencies,
  interruption: Interruption,
): Promise<LegacyHold> {
  // Whole seconds, rounded up: the shell lock counts its budget in seconds, and a sub-second
  // admission must not cost a caller its last second (S6B-A3).
  const remaining = Math.max(
    0,
    Math.ceil((arrivedAt + request.waitSeconds * 1000 - deps.clock.read()) / 1000),
  );
  const outcome = await holdLegacyLock(
    deps.legacyLock,
    {
      holdFile: jobHoldFile(runtime.configuration.root, job.id),
      label: `dash-job-${job.id} ${request.label}`,
      waitSeconds: remaining,
      pollSeconds: request.pollSeconds,
      signal: interruption.signal,
      report: deps.report,
    },
    deps.environment,
  );
  if (outcome.kind === 'held') return outcome.hold;
  let refusal: [OpsExitCode, string];
  if (outcome.kind === 'cancelled') {
    let received: JobInterruption;
    try {
      received = requireInterruption(interruption.received());
    } catch (cause) {
      try {
        runtime.withdrawUnlaunchedHostJob(job.id, causeText(cause));
      } catch (withdrawalCause) {
        throw new AggregateError(
          [cause, withdrawalCause],
          'host job cancellation provenance and unlaunched withdrawal failed',
          { cause: withdrawalCause },
        );
      }
      throw cause;
    }
    refusal = [
      interruptedCode(received),
      interruptionText(received) + ' while queued on the shell lock (observe mode)',
    ];
  } else if (outcome.exitCode === 75) {
    refusal = [
      75,
      `the shell lock gave no turn within the ${String(remaining)}s left of its wait budget (observe mode)`,
    ];
  } else {
    refusal = [
      70,
      `the shell lock refused it with exit ${String(outcome.exitCode)}: ${outcome.reason} (observe mode)`,
    ];
  }
  const [code, reason] = refusal;
  // Proof: without the withdrawal `a legacy deadline withdraws the Dash job`
  // (host-pool-mode.test.ts) left the job starting with its cores reserved (2026-11-02, Slice 6b).
  runtime.withdrawUnlaunchedHostJob(job.id, reason);
  throw new OpsRefusal(
    code,
    `ops job run: ${job.descriptor.id} ${job.label} refused: ${reason}; its reservation is withdrawn`,
  );
}

/**
 * Let go of the shell lock once the job's compute is released (J12): the payload's processes
 * are gone, which is what the lock serialised. A compute entry still outstanding keeps the hold
 * file, and `watch` removes it when that entry settles, so a surviving child never runs beside
 * a legacy caller.
 */
export async function endLegacyHold(
  runtime: Pick<ResourceRuntime, 'inspectHostJob'>,
  jobId: string,
  hold: LegacyHold,
  deps: Pick<JobRunDependencies, 'report'>,
): Promise<{ readonly kind: 'released' } | { readonly kind: 'retained' }> {
  let released: boolean;
  try {
    released = runtime.inspectHostJob(jobId).compute.state === 'released';
  } catch (cause) {
    // Proof: the previous return-on-unreadable branch failed the retained-ledger failure control in job-hold.test.ts; restoration passed (2026-11-11).
    throw new Error(
      'ops job: ' + jobId + ' keeps the native hold: its compute entry is unreadable',
      { cause },
    );
  }
  // Proof: removing compute authorization released an outstanding job in job-hold.test.ts; restoration passed (2026-11-11).
  if (!released) {
    deps.report(
      'ops job: ' + jobId + ' keeps the shell lock until its compute settles; watch releases it',
    );
    return { kind: 'retained' };
  }
  hold.release();
  // Proof: the previous rejected-exit-as-success projection failed the native-wait failure control in job-hold.test.ts; restoration passed (2026-11-11).
  await awaitLegacyRelease(hold);
  deps.report('ops job: ' + jobId + ' released the shell lock');
  return { kind: 'released' };
}

/** Kill the whole session of `pid`; a session already gone is not an error. */
export function killSession(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (cause) {
    // Proof: rethrowing ESRCH here made `killing a session already gone is not an error`
    // (job-run.test.ts) throw ESRCH, which in `runAdmitted` escaped and left the job
    // `held` (2026-11-02, Slice 3 review F10).
    if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') return;
    throw cause;
  }
}

async function runAdmitted(
  runtime: ResourceRuntime,
  records: HostJobRunRecords,
  admitted: HostJob,
  catalogued: CataloguedJob,
  systemdRun: string,
  docker: string | null,
  containers: ContainerEvidence,
  request: JobRunRequest,
  toolchain: string,
  deps: JobRunDependencies,
  interruption: Interruption,
  onSignal: (handler: (signal: NodeJS.Signals) => void) => void,
): Promise<number> {
  let job: HostJob;
  try {
    job = runtime.prepareHostJob(admitted.id);
  } catch (cause) {
    if (!(cause instanceof HostPoolModeRefusal)) throw cause;
    // Nothing was created: the guard was lost before preparation, so the job is withdrawn.
    runtime.withdrawUnlaunchedHostJob(admitted.id, cause.message);
    throw new OpsRefusal(75, `ops job run: ${cause.message}; its reservation is withdrawn`, {
      cause,
    });
  }
  const unit = scopeUnitOf(job.id);
  let launched: Launched;
  try {
    launched = launchGated(systemdRun, unit, catalogued, job, request.argv, request.label, deps);
  } catch (cause) {
    if (!(cause instanceof LaunchUnstarted)) throw cause;
    throw new OpsRefusal(
      70,
      `ops job run: ${cause.message}; the payload did not run, and the job stays charged until its launch grace passes`,
      { cause },
    );
  }
  const { pid } = launched;
  /**
   * Close the gate unopened: the helper exits 125 and the payload never runs. The ledger records
   * the launch failure apart from any payload exit (review F5), then the job settles.
   */
  const refuseAtGate = async (code: 64 | 70 | 129 | 130 | 143, reason: string): Promise<never> => {
    launched.gate.destroy();
    launched.environment.destroy();
    // The Bun gate helper exits 125 on the closed gate at once; a leader still inside `systemd-run`
    // (a hung user manager) does not, so it is killed after a grace.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lingering = await Promise.race([
      launched.leaderExit.then(
        () => false,
        () => false,
      ),
      new Promise<boolean>((resolveGrace) => {
        timer = setTimeout(() => {
          resolveGrace(true);
        }, 2000);
      }),
    ]);
    clearTimeout(timer);
    if (lingering) killSession(pid, 'SIGKILL');
    await launched.leaderExit.catch(() => undefined);
    try {
      runtime.recordHostJobLaunchFailure(job.id, `payload did not run: ${reason}`);
    } catch (cause) {
      deps.report(`ops job: ${job.id} launch failure unrecorded: ${causeText(cause)}`);
    }
    await settle(runtime, job.id, containers, deps);
    throw new OpsRefusal(code, `ops job run: ${reason}; the payload did not run`);
  };
  /** The interruption refusal, when a signal arrived before the gate opened. */
  const refuseIfInterrupted = async (): Promise<void> => {
    const received = interruption.received();
    // Proof: without this check `a SIGINT while the scope starts refuses 130, the payload
    // never runs` (job-run.test.ts) refuse 70 "did not start scope" instead of 130
    // (2026-11-02, Slice 3 review F4).
    if (received !== null)
      await refuseAtGate(
        interruptedCode(received),
        `${interruptionText(received)} before the gate opened`,
      );
  };
  try {
    runtime.recordHostJobLaunch(job.id, pid);
  } catch (cause) {
    launched.gate.destroy();
    launched.environment.destroy();
    await launched.leaderExit.catch(() => undefined);
    // Proof: without this refusal `refuses 70 when the launch identity cannot be recorded`
    // (job-run.test.ts) rejected with the bare ledger error (2026-11-02, Slice 3 review F2c).
    throw new OpsRefusal(
      70,
      `ops job run: launch identity of ${unit} unrecorded (${causeText(cause)}); the payload did not run, and the job stays charged until its launch grace passes`,
      { cause },
    );
  }
  const cgroup = await awaitScope(
    deps.telemetry,
    pid,
    unit,
    launched.leaderExit,
    deps.monotonic,
    interruption.signal,
    launched.startupDeadline,
  );
  await refuseIfInterrupted();
  if (cgroup === null) {
    if (launched.child.exitCode === null && launched.child.signalCode === null)
      killSession(pid, 'SIGKILL');
    // Proof: without this refusal `refuses 70 when the scope never starts, the payload never
    // runs` (job-run.test.ts) refuse "scope counters unreadable" on a null cgroup (2026-11-02, F2a).
    return refuseAtGate(70, `systemd-run did not start scope ${unit}`);
  }
  let transferTimer: ReturnType<typeof setTimeout> | undefined;
  const interruptedTransfer = Promise.withResolvers<{ readonly kind: 'interrupted' }>();
  const interruptTransfer = () => {
    interruptedTransfer.resolve({ kind: 'interrupted' });
  };
  interruption.signal.addEventListener('abort', interruptTransfer, { once: true });
  if (interruption.signal.aborted) interruptTransfer();
  const transfer = await Promise.race([
    launched.environmentTransfer,
    interruptedTransfer.promise,
    new Promise<{ readonly kind: 'expired' }>((resolveExpiry) => {
      transferTimer = setTimeout(
        () => {
          resolveExpiry({ kind: 'expired' });
        },
        Math.max(0, launched.startupDeadline - deps.monotonic.now()),
      );
    }),
  ]);
  clearTimeout(transferTimer);
  interruption.signal.removeEventListener('abort', interruptTransfer);
  await refuseIfInterrupted();
  if (transfer.kind !== 'transferred')
    return refuseAtGate(70, 'private payload environment transfer failed');
  const startedAt = deps.clock.read();
  const gateSample = readSample('gate', startedAt, deps.telemetry, cgroup, job.locator);
  // Proof: skipping this refusal made `refuses 70 when memory.peak is unreadable at the gate`
  // (job-run.test.ts) run the payload unmeasured, no refusal (2026-11-01, Slice 3).
  if (gateSample.counters === null || gateSample.failure !== null)
    return refuseAtGate(
      70,
      `scope counters unreadable at the gate: ${gateSample.failure ?? 'unknown'}`,
    );
  // The payload execs from the working tree: the checkout must still stand on the commit whose
  // catalogue admitted it, however long admission waited (review F9).
  const head = currentHead(catalogued.checkout);
  // Proof: without it `refuses 64 when the checkout moved while waiting` (job-run.test.ts) ran
  // the payload from the moved checkout (2026-11-02, Slice 3 review F9).
  if (head !== catalogued.revision)
    return refuseAtGate(
      64,
      `${catalogued.checkout} moved from ${catalogued.revision} to ${head ?? 'no HEAD'} while the job waited; rerun from the new commit`,
    );
  try {
    records.begin(
      {
        jobId: job.id,
        type: catalogued.descriptor.id,
        label: request.label,
        descriptor: catalogued.descriptor,
        descriptorDigest: catalogued.descriptorDigest,
        cataloguePath: catalogued.cataloguePath,
        launcherSha: catalogued.revision,
        argumentProfile: catalogued.jobType.argumentProfile,
        argv: request.argv,
        hostClass: hostClassOf(deps.host),
        toolchain,
        ...(job.calibration === true ? { calibration: true as const } : {}),
        unit,
        cgroup,
        tmpDirectory: job.locator,
        units: job.units.map((held) => ({ exclusiveId: held.exclusiveId, path: held.path })),
        startedAt,
      },
      gateSample,
    );
  } catch (cause) {
    // Proof: without this refusal `refuses 70 when the run record cannot be written at the
    // gate` (job-run.test.ts) reject with the bare lock error, the job left held (2026-11-02, F2b).
    return refuseAtGate(70, `run record unwritable at the gate: ${causeText(cause)}`);
  }
  const bound = catalogued.descriptor.containers;
  const watch =
    docker === null || bound === 'none'
      ? null
      : ContainerWatch.start(docker, deps.environment, job.id, bound, startedAt, (owner) =>
          runtime.listHostJobs().some((other) => other.id === owner && other.state !== 'released'),
        );
  // The gate sample, the HEAD check, `records.begin` and the watch start are synchronous: a
  // signal that arrived during them is dispatched only once the event loop turns, so turn it
  // (timers, then the poll and check phases) before the last look.
  // Proof: without these yields `a SIGINT during the synchronous gate work refuses 130`
  // (job-run.test.ts) ran the payload and recorded 130 as its exit (2026-11-02, review R2).
  await Bun.sleep(0);
  await new Promise<void>((resolveTurn) => {
    setImmediate(resolveTurn);
  });
  await refuseIfInterrupted().catch(async (cause: unknown) => {
    if (watch !== null) await watch.finish(deps.clock.read());
    throw cause;
  });
  onSignal((signal) => {
    // The whole session: the payload and its children, not only the Bun gate helper.
    try {
      killSession(pid, signal);
    } catch (cause) {
      try {
        deps.report(`ops job: forwarding ${signal} to ${unit} failed: ${causeText(cause)}`);
      } catch (reportCause) {
        throw new AggregateError([cause, reportCause], 'host job forwarding and reporting failed', {
          cause: reportCause,
        });
      }
      throw cause;
    }
  });
  let startControlFailed = false;
  try {
    await writeControl(launched.gate, 'start\n', false);
  } catch {
    // Proof: hiding the controlled start callback failure returns3 instead of failed70
    // in `gated job observation control-start-callback-after-status`. The callback
    // projection is not kernel EPIPE or proof the payload never ran.
    startControlFailed = true;
    launched.gate.destroy();
  }
  const failures: string[] = startControlFailed
    ? ['payload start control delivery is unconfirmed']
    : [];
  const persist = (sample: RunSample): void => {
    if (sample.failure !== null) failures.push(`${sample.kind}: ${sample.failure}`);
    try {
      records.sample(job.id, sample);
    } catch (cause) {
      failures.push(`${sample.kind} sample unrecorded: ${causeText(cause)}`);
    }
  };
  const payload: { ended: boolean; outcome: PayloadObservation } = {
    ended: false,
    outcome: { kind: 'unconfirmed' },
  };
  const ending = joinPayloadStatus(launched, deps).then((outcome) => {
    payload.outcome = outcome;
    payload.ended = true;
  });
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A cleared timer, not `Bun.sleep`: a pending sleep would hold the process open for up to
    // one interval after the job ended.
    // Proof: leaving the timer uncleared made `the launcher process ends with its job`
    // (job-run.test.ts) take 15.5 s for a payload that exits at once (2026-11-01, Slice 3).
    try {
      await Promise.race([
        ending,
        new Promise((resolveTick) => {
          timer = setTimeout(resolveTick, deps.sampleIntervalMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (payload.ended) break;
    const sample = readSample('interval', deps.clock.read(), deps.telemetry, cgroup, job.locator);
    if (watch !== null) sample.containers = await watch.sample();
    persist(sample);
  }
  const exitSample = readSample('exit', deps.clock.read(), deps.telemetry, cgroup, job.locator);
  if (watch !== null) exitSample.containers = await watch.sample();
  persist(exitSample);
  const verdicts = watch === null ? [] : await watch.finish(deps.clock.read());
  // The scope may end now: the exit sample is read. Then the leader exits with the payload's
  // status only when that private frame qualified; a leader status never substitutes for it.
  let acknowledgementFailed = false;
  try {
    await writeControl(launched.gate, 'done\n', true);
  } catch {
    // Proof: hiding this controlled end callback failure returns3 instead of failed70
    // in `gated job observation control-end-callback`; native helper end3 alone is
    // insufficient to erase a separate delivery failure.
    acknowledgementFailed = true;
    launched.gate.destroy();
  }
  const leaderStatus = await launched.leaderExit;
  if (payload.outcome.kind !== 'status') {
    deps.report(
      'ops job: ' +
        job.id +
        ' private payload status ' +
        payload.outcome.kind +
        '; run outcome remains incomplete',
    );
    await settle(runtime, job.id, containers, deps);
    throw new OpsRefusal(
      70,
      'ops job run: private payload status is not qualified',
      payload.outcome.kind === 'read-failed' ? { cause: payload.outcome.cause } : undefined,
    );
  }
  const status = payload.outcome.status;
  const leaderObservation = launched.readObservation();
  const helperSignal = launched.child.signalCode;
  // Proof: removing normal helper correspondence resolves the native contradiction case
  // instead of refusal70. Conversely treating actual helper signal loss as a normal
  // mismatch loses qualified payload3 in `gated job observation fd4-delayed`. That
  // recovery still records lost keeper/ACK/telemetry authority and incomplete attribution;
  // neither a valid frame nor ACK EPIPE alone grants native/resource settlement.
  const protocolFailed =
    leaderObservation.kind === 'failed' ||
    startControlFailed ||
    (helperSignal === null && (acknowledgementFailed || leaderStatus !== status));
  if (helperSignal !== null) {
    const loss =
      'private helper ended by ' +
      helperSignal +
      ' after qualified payload status' +
      (acknowledgementFailed ? '; acknowledgement failed' : '');
    failures.push(loss);
    deps.report('ops job: ' + job.id + ' ' + loss + '; exit keeper and attribution are incomplete');
  }
  if (leaderObservation.kind === 'failed')
    failures.push('private helper native observation reported an error before actual settlement');
  // A status above 128 is how a shell reports a signal; the record names the signal it implies.
  const signal =
    Object.entries(constants.signals).find(([, number]) => number === status - 128)?.[0] ?? null;
  let ledgerFailure: string | null = null;
  // Proof: letting this throw made `a ledger write failure is recorded apart; the status is
  // still the payload's` (job-run.test.ts) reject instead of returning 4 (2026-11-01, Slice 3).
  try {
    runtime.recordHostJobExit(job.id, status);
  } catch (cause) {
    ledgerFailure = `exit unrecorded in the resource ledger: ${causeText(cause)}`;
    deps.report(`ops job: ${job.id} ${ledgerFailure}`);
  }
  const telemetryFailure = failures.length === 0 ? null : failures.join('; ');
  // A run during which the singleton guard's holder died had no guarantee against a stale
  // launcher beside it: its attribution is incomplete (review H5).
  // `watch` marks it when it notices; the launcher re-checks at exit itself, so a host whose
  // `watch` is down still records the loss (review K4).
  let guardLost: string | undefined;
  try {
    let lost = runtime.inspectHostJob(job.id).guardLost;
    // Proof: without the exit re-check `a guard lost mid-run with no watch is still recorded`
    // (host-pool-mode.test.ts) found the run complete (2026-11-02, review K4).
    if (lost === undefined && !runtime.guardStillHeld())
      lost = runtime.recordGuardLostFor(job.id).guardLost;
    if (lost !== undefined)
      guardLost = `the singleton guard (pid ${lost.holderPid === null ? 'unrecorded' : String(lost.holderPid)}) was lost during the run`;
  } catch (cause) {
    // Unknown is not "held": the run's attribution is incomplete either way.
    guardLost = `the singleton guard could not be re-checked at exit (${causeText(cause)})`;
  }
  if (guardLost !== undefined) deps.report(`ops job: ${job.id} ${guardLost}`);
  if (telemetryFailure !== null)
    deps.report(`ops job: ${job.id} telemetry failure recorded: ${telemetryFailure}`);
  const incomplete = verdicts.filter((verdict) => verdict.verdict !== 'bounded');
  for (const verdict of incomplete)
    deps.report(
      `ops job: ${job.id} attribution incomplete: ${verdict.id.slice(0, 12)} ${verdict.verdict}: ${verdict.reason}`,
    );
  try {
    records.finish(job.id, {
      endedAt: deps.clock.read(),
      exitCode: status,
      signal,
      telemetryFailure,
      ledgerFailure,
      // Proof: without the guard term `a guard holder lost mid-run marks the running jobs`
      // (host-pool-mode.test.ts) found the run complete in `ops job audit` (2026-11-02, H5).
      attributionIncomplete:
        incomplete.length > 0 || guardLost !== undefined || helperSignal !== null || protocolFailed,
      containers: verdicts,
      ...(guardLost === undefined ? {} : { guardLost }),
    });
  } catch (cause) {
    deps.report(`ops job: ${job.id} run record outcome unrecorded: ${causeText(cause)}`);
  }
  try {
    await settle(runtime, job.id, containers, deps);
  } catch (cause) {
    deps.report(`ops job: ${job.id} settlement failed: ${causeText(cause)}; watch settles it`);
  }
  if (protocolFailed)
    throw new OpsRefusal(
      70,
      'ops job run: payload ended but private helper settlement failed',
      leaderObservation.kind === 'failed' ? { cause: leaderObservation.cause } : undefined,
    );
  return status;
}
