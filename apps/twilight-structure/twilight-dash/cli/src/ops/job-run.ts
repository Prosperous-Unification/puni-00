import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:os';
import { Readable, Writable } from 'node:stream';

import type { Monotonic, WallClock } from '../clock';
import {
  type ContainerEvidence,
  declaredContainersOnly,
  type HostFacts,
  type HostJob,
  loadResourceConfiguration,
  ResourceRuntime,
} from '../resources/runtime';
import { type CataloguedJob, currentHead, hostClassOf, readCataloguedJob } from './catalogue';
import { checkDockerAvailable, ContainerWatch, dockerContainerEvidence } from './containers';
import { causeText, OpsRefusal } from './refusal';
import { HostJobRunRecords, type RunSample } from './run-records';
import {
  checkScopeAvailable,
  directoryBytes,
  scopeArguments,
  type ScopeTelemetry,
  scopeUnitOf,
} from './scope';

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
}

/**
 * The gated payload (J7): the shell reads `start` from fd 3 before the payload may run (the
 * runtime's FD gate), runs the payload in the foreground so its status is the payload's own
 * (128 + signal when signalled), reports that status on fd 4, and then keeps the scope occupied
 * until the launcher writes `done` on fd 3 or closes it, so the exit sample reads a live scope.
 * The no-op trap keeps the shell, not the payload, alive through a forwarded signal: a caught
 * signal is reset to its default in the exec'd payload, an ignored one would not be.
 */
const GATED_PAYLOAD = [
  'trap : HUP INT TERM',
  'read gate <&3 || exit 125',
  '[ "$gate" = start ] || exit 125',
  '"$@" 3<&- 4>&-',
  'status=$?',
  'echo "$status" >&4',
  'exec 4>&-',
  // Proof: replacing this read with `:` made `a one-second job is still measured` and `a gate is
  // measured` (job-run.test.ts) record `scope torn down before the exit sample` (2026-11-01, Slice 3).
  'read done <&3',
  'exit "$status"',
].join('\n');

/** Polls between the scope check's readings of `/proc/<pid>/cgroup`. */
const SCOPE_POLL_MS = 10;
const SCOPE_START_BUDGET_MS = 15_000;

/** The exit status of a process that ended with `code` or `signal`, as a shell reports it. */
function statusOf(code: number | null, signal: NodeJS.Signals | null): number {
  if (signal !== null) return 128 + constants.signals[signal];
  if (code === null) throw new Error('payload ended with neither a code nor a signal');
  return code;
}

/** The environment the payload starts with (J7). */
function jobEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  job: HostJob,
  label: string,
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(environment))
    if (value !== undefined) variables[key] = value;
  variables['TMPDIR'] = job.locator;
  variables['DASH_JOB_ID'] = job.id;
  variables['DASH_JOB_TYPE'] = job.descriptor.id;
  variables['HEAVY_LOCK_LABEL'] = label;
  for (const unit of job.units)
    variables[`DASH_JOB_UNIT_${unit.exclusiveId.toUpperCase()}`] = unit.path;
  return variables;
}

/** The leader never became a process: nothing ran and no identity can be recorded. */
class LaunchUnstarted extends Error {
  override readonly name = 'LaunchUnstarted';
}

interface Launched {
  child: ChildProcess;
  pid: number;
  gate: Writable;
  /** Resolves with the status the shell reported on fd 4, or null when it ended without one. */
  payloadStatus: Promise<number | null>;
  /** Resolves with the leader's own status once it exits. */
  leaderExit: Promise<number>;
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
  const child = spawn(
    systemdRun,
    [
      ...scopeArguments(unit, catalogued.descriptor),
      '--',
      '/bin/sh',
      '-c',
      GATED_PAYLOAD,
      'dash-job',
      ...argv,
    ],
    {
      cwd: deps.cwd,
      detached: true,
      stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe'],
      env: jobEnvironment(deps.environment, job, label),
    },
  );
  const leaderExit = new Promise<number>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code, signal) => {
      resolveExit(statusOf(code, signal));
    });
  });
  // A leader that never started (its executable gone since the probe) reports on `leaderExit`.
  // Proof: without this check `refuses 70 when systemd-run vanishes before the launch`
  // (job-run.test.ts) failed on "host job gate pipes unavailable" (2026-11-02, review F13).
  if (child.pid === undefined) {
    void leaderExit.catch(() => undefined);
    throw new LaunchUnstarted(`${systemdRun} did not start`);
  }
  const pid = child.pid;
  const gate = child.stdio[3];
  const status = child.stdio[4];
  if (!(gate instanceof Writable) || !(status instanceof Readable))
    throw new Error('host job gate pipes unavailable');
  // A gate write after the shell ended is an expected EPIPE, never a crash of the launcher.
  gate.on('error', () => undefined);
  const payloadStatus = new Promise<number | null>((resolveStatus) => {
    let text = '';
    status.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8');
    });
    status.once('close', () => {
      const line = text.trim();
      resolveStatus(/^\d{1,3}$/.test(line) ? Number(line) : null);
    });
  });
  return { child, pid, gate, payloadStatus, leaderExit };
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
  const deadline = monotonic.now() + SCOPE_START_BUDGET_MS;
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
  while (job.state !== 'released' && job.state !== 'blocked' && deps.monotonic.now() < deadline) {
    // One second, not faster: each pass takes the ledger write lock and reads Git and Docker
    // inside it, which would starve other launchers' polls (review F6).
    await Bun.sleep(1000);
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
function interruptedCode(signal: NodeJS.Signals): 129 | 130 | 143 {
  if (signal === 'SIGHUP') return 129;
  return signal === 'SIGINT' ? 130 : 143;
}

/** A signal the launcher received before its payload started, and the abort it raised. */
interface Interruption {
  readonly signal: AbortSignal;
  received(): NodeJS.Signals | null;
}

/**
 * Run one host job measured (`dash-host-jobs` J7, J8, J16): read the catalogue at the checkout's
 * HEAD; refuse before anything is reserved when the host cannot measure it; admit through the
 * host pool (73, 75); launch the payload through the FD gate inside a transient user scope,
 * persisting the leader's identity and the gate sample before the gate opens; sample every
 * interval and at exit; record the exit, settle on terminal evidence and return the payload's
 * own status. A signal before the gate opens refuses 129/130/143 with the payload never run; one
 * after is forwarded to the payload's session. A failure to read telemetry or to write a record
 * after the gate opened is recorded and reported, never substituted for the payload's status.
 * @throws OpsRefusal for every refusal before the payload runs (64, 70, 73, 75, 129, 130, 143).
 */
export async function runHostJob(
  request: JobRunRequest,
  deps: JobRunDependencies,
): Promise<number> {
  const catalogued = readCataloguedJob(deps.cwd, request.type, request.argv);
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
  let records: HostJobRunRecords;
  try {
    records = HostJobRunRecords.open(runtime.configuration.root, runtime.listHostJobs().length > 0);
  } catch (cause) {
    runtime.close();
    throw new OpsRefusal(70, `ops job run: ${causeText(cause)}`, { cause });
  }
  const abort = new AbortController();
  const received: { signal: NodeJS.Signals | null } = { signal: null };
  const forward: { to: ((signal: NodeJS.Signals) => void) | null } = { to: null };
  // Until the gate opens a signal only aborts: admission withdraws its ticket, and a launch in
  // progress refuses at the gate. After it opens, the signal goes to the payload's session.
  const onSignal = (signal: NodeJS.Signals): void => {
    received.signal ??= signal;
    if (forward.to !== null) forward.to(signal);
    else abort.abort();
  };
  const interruption: Interruption = { signal: abort.signal, received: () => received.signal };
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
  for (const signal of signals) process.on(signal, onSignal);
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
    );
    const admission = await runtime.admitHostJob(
      { descriptor: catalogued.descriptor, label: request.label, waitSeconds: request.waitSeconds },
      {
        pollMs: request.pollSeconds * 1000,
        signal: abort.signal,
        report: (line) => {
          deps.report(line);
        },
      },
    );
    if (admission.kind === 'cancelled') {
      const signal = received.signal ?? 'SIGTERM';
      throw new OpsRefusal(
        interruptedCode(signal),
        `ops job run: ${typeId} ${request.label} interrupted by ${signal} while waiting; its ticket is withdrawn`,
      );
    }
    if (admission.kind === 'refused') throw new OpsRefusal(admission.exitCode, admission.reason);
    if (admission.kind === 'waiting') throw new Error('host job admission returned while waiting');
    const containers =
      docker === null ? declaredContainersOnly : dockerContainerEvidence(docker, deps.environment);
    return await runAdmitted(
      runtime,
      records,
      admission.job,
      catalogued,
      systemdRun,
      docker,
      containers,
      request,
      deps,
      interruption,
      (handler) => {
        forward.to = handler;
      },
    );
  } finally {
    for (const signal of signals) process.removeListener(signal, onSignal);
    records.close();
    runtime.close();
  }
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
  deps: JobRunDependencies,
  interruption: Interruption,
  onSignal: (handler: (signal: NodeJS.Signals) => void) => void,
): Promise<number> {
  const job = runtime.prepareHostJob(admitted.id);
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
   * Close the gate unopened: the shell exits 125 and the payload never runs. The ledger records
   * the launch failure apart from any payload exit (review F5), then the job settles.
   */
  const refuseAtGate = async (code: 64 | 70 | 129 | 130 | 143, reason: string): Promise<never> => {
    launched.gate.destroy();
    // The gated shell exits 125 on the closed gate at once; a leader still inside `systemd-run`
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
    const signal = interruption.received();
    // Proof: without this check `a SIGINT while the scope starts refuses 130, the payload
    // never runs` (job-run.test.ts) refuse 70 "did not start scope" instead of 130
    // (2026-11-02, Slice 3 review F4).
    if (signal !== null)
      await refuseAtGate(
        interruptedCode(signal),
        `interrupted by ${signal} before the gate opened`,
      );
  };
  try {
    runtime.recordHostJobLaunch(job.id, pid);
  } catch (cause) {
    launched.gate.destroy();
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
  );
  await refuseIfInterrupted();
  if (cgroup === null) {
    if (launched.child.exitCode === null && launched.child.signalCode === null)
      killSession(pid, 'SIGKILL');
    // Proof: without this refusal `refuses 70 when the scope never starts, the payload never
    // runs` (job-run.test.ts) refuse "scope counters unreadable" on a null cgroup (2026-11-02, F2a).
    return refuseAtGate(70, `systemd-run did not start scope ${unit}`);
  }
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
  await refuseIfInterrupted().catch(async (cause: unknown) => {
    if (watch !== null) await watch.finish(deps.clock.read());
    throw cause;
  });
  onSignal((signal) => {
    // The whole session: the payload and its children, not only the gated shell.
    try {
      killSession(pid, signal);
    } catch (cause) {
      deps.report(`ops job: forwarding ${signal} to ${unit} failed: ${causeText(cause)}`);
    }
  });
  launched.gate.write('start\n');
  const failures: string[] = [];
  const persist = (sample: RunSample): void => {
    if (sample.failure !== null) failures.push(`${sample.kind}: ${sample.failure}`);
    try {
      records.sample(job.id, sample);
    } catch (cause) {
      failures.push(`${sample.kind} sample unrecorded: ${causeText(cause)}`);
    }
  };
  const payload: { ended: boolean; status: number | null } = { ended: false, status: null };
  const ending = Promise.race([launched.payloadStatus, launched.leaderExit.then(() => null)]).then(
    (status) => {
      payload.status = status;
      payload.ended = true;
    },
  );
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A cleared timer, not `Bun.sleep`: a pending sleep would hold the process open for up to
    // one interval after the job ended.
    // Proof: leaving the timer uncleared made `the launcher process ends with its job`
    // (job-run.test.ts) take 15.5 s for a payload that exits at once (2026-11-01, Slice 3).
    await Promise.race([
      ending,
      new Promise((resolveTick) => {
        timer = setTimeout(resolveTick, deps.sampleIntervalMs);
      }),
    ]);
    clearTimeout(timer);
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
  // status, or with its own when it died before reporting one.
  launched.gate.end('done\n');
  const leaderStatus = await launched.leaderExit;
  const status = payload.status ?? leaderStatus;
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
      attributionIncomplete: incomplete.length > 0,
      containers: verdicts,
    });
  } catch (cause) {
    deps.report(`ops job: ${job.id} run record outcome unrecorded: ${causeText(cause)}`);
  }
  try {
    await settle(runtime, job.id, containers, deps);
  } catch (cause) {
    deps.report(`ops job: ${job.id} settlement failed: ${causeText(cause)}; watch settles it`);
  }
  return status;
}
