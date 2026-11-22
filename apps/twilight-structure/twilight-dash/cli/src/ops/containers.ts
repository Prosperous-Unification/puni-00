import { type Subprocess } from 'bun';

import { execute, firstLine, spawnClient } from '../compute/execution';
import {
  DOCKER_DEADLINE_MS,
  dockerContainerEvidence,
  dockerEnvironment,
  JOB_LABEL,
} from '../resources/container-evidence';
import { causeText, OpsRefusal } from './refusal';
import type { ContainerSample, ContainerVerdict, LifetimeBound } from './run-records';

export { dockerContainerEvidence, JOB_LABEL };

/** The bound a type's containers run under, as the catalogue declares it. */
export interface ContainerBound {
  memoryGib: number;
  cpuCores: number;
}

/**
 * The label naming a declared host service (a timer or cron unrelated to any job) whose
 * container may start beside a job: attributed only under `--memory` and `--cpus`, and never
 * when it also carries {@link JOB_LABEL} (`dash-host-jobs` J16 amendment, A-ATTR-HOSTSVC-1).
 */
export const HOST_SERVICE_LABEL = 'puni.host-service';

const GIB = 1024 ** 3;
/** The longest `docker events` line the watch reads before it distrusts the stream. */
const MAX_EVENT_BYTES = 1024 * 1024;
const BYTE_UNITS: ReadonlyMap<string, number> = new Map([
  ['B', 1],
  ['kB', 1e3],
  ['KB', 1e3],
  ['MB', 1e6],
  ['GB', 1e9],
  ['TB', 1e12],
  ['KiB', 1024],
  ['MiB', 1024 ** 2],
  ['GiB', 1024 ** 3],
  ['TiB', 1024 ** 4],
]);

/**
 * The `docker` CLI for a type that declared a containers bound, checked before anything is
 * reserved (J16): on `PATH` and its daemon answering.
 * @throws OpsRefusal 70 naming the missing CLI or the daemon's first diagnostic.
 */
export function checkDockerAvailable(
  environment: Readonly<Record<string, string | undefined>>,
  typeId: string,
): string {
  const docker = Bun.which('docker', { PATH: environment['PATH'] ?? '' });
  // Proof: without it `refuses 70 before admission when docker is absent and a bound is
  // declared` (job-run.test.ts) throw `Executable not found in $PATH: "null"` (2026-11-01, Slice 3).
  if (docker === null)
    throw new OpsRefusal(
      70,
      `ops job run: job type ${typeId} declares a containers bound, and docker is not on PATH to watch them (dash-host-jobs J16)`,
    );
  const info = Bun.spawnSync([docker, 'info', '--format', '{{.ServerVersion}}'], {
    env: dockerEnvironment(environment),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: DOCKER_DEADLINE_MS,
    killSignal: 'SIGKILL',
  });
  // Proof: without it `refuses 70 before admission when the docker daemon does not answer`
  // (job-run.test.ts) admitted the job with DOCKER_HOST pointing nowhere (2026-11-02, F2e).
  if (info.exitCode !== 0)
    throw new OpsRefusal(
      70,
      `ops job run: job type ${typeId} declares a containers bound, and the docker daemon does not answer (${firstLine(info.stderr.toString('utf8')) || `exit ${String(info.exitCode)}`})`,
    );
  return docker;
}

function parseBytes(text: string): number {
  const match = /^(\d+(?:\.\d+)?)([A-Za-z]+)$/.exec(text.trim());
  const multiplier = match === null ? undefined : BYTE_UNITS.get(match[2]);
  if (match === null || multiplier === undefined)
    throw new Error(`docker stats answered a size it cannot read: ${text.slice(0, 40)}`);
  return Number(match[1]) * multiplier;
}

interface StatsRow {
  ID: string;
  CPUPerc: string;
  MemUsage: string;
}

function isStatsRow(row: unknown): row is StatsRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    'ID' in row &&
    typeof row.ID === 'string' &&
    'CPUPerc' in row &&
    typeof row.CPUPerc === 'string' &&
    'MemUsage' in row &&
    typeof row.MemUsage === 'string'
  );
}

/**
 * One `create` or `die` event the stream or the closing replay named. Its attributes carry every
 * label of the container with its `image` and `name`; `timeNano` is null when the daemon sent
 * none.
 */
interface ContainerEvent {
  id: string;
  action: 'create' | 'die';
  labels: Readonly<Record<string, string | undefined>>;
  image: string;
  timeNano: number | null;
}

function parseContainerEvent(line: string): ContainerEvent {
  // `docker events --format '{{json .}}'` is the daemon's own output, read once per line.
  const event = JSON.parse(line) as {
    id?: unknown;
    Action?: unknown;
    timeNano?: unknown;
    Actor?: { ID?: unknown; Attributes?: Record<string, unknown> };
  };
  const id = typeof event.id === 'string' ? event.id : event.Actor?.ID;
  if (typeof id !== 'string' || !/^[0-9a-f]{12,64}$/.test(id))
    throw new Error('docker events answered an event without a container id');
  // The stream asks for these two actions only; any other is not the daemon this watch knows.
  // Proof: without it `an event with an action the watch did not ask for is unverified`
  // (containers.test.ts) judged the destroy event as a create (2026-11-22).
  if (event.Action !== 'create' && event.Action !== 'die')
    throw new Error(
      `docker events answered action ${typeof event.Action === 'string' ? event.Action : 'none'} for ${id.slice(0, 12)}, not create or die`,
    );
  const attributes = event.Actor?.Attributes ?? {};
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes))
    if (typeof value === 'string') labels[key] = value;
  return {
    id,
    action: event.Action,
    labels,
    image: labels['image'] ?? 'unknown image',
    timeNano: typeof event.timeNano === 'number' ? event.timeNano : null,
  };
}

/** The `docker events` arguments of the stream and the replay: container creates and deaths. */
const EVENT_FILTERS = [
  '--filter',
  'type=container',
  '--filter',
  'event=create',
  '--filter',
  'event=die',
  '--format',
  '{{json .}}',
];

/**
 * The containers of one host job's window (J16): a `docker events` stream of every container
 * created from the gate on, each judged as it appears; advisory samples of the job's labelled
 * containers; a closing replay of the window so a container the stream had not delivered is
 * still judged. Docker's reading omits containers that vanish between samples and excludes file
 * cache: the samples are evidence, the declared bound is what admission trusts.
 */
export class ContainerWatch {
  private readonly judged = new Map<string, Promise<ContainerVerdict | null>>();
  /** Each judged container's create time, epoch nanoseconds, when its event carried one. */
  private readonly createdAt = new Map<string, number>();
  /** Each container's first die time, epoch nanoseconds, from the stream or the replay. */
  private readonly diedAt = new Map<string, number>();
  /** Settles once the stream has stopped and the replay was read: every die event is in. */
  private readonly closed = Promise.withResolvers<undefined>();
  private buffered = '';

  /** The stream reader; it never rejects, a failure becomes an `unverified` verdict. */
  private reading: Promise<void> = Promise.resolve();

  private constructor(
    private readonly docker: string,
    private readonly environment: Record<string, string>,
    private readonly jobId: string,
    private readonly bound: ContainerBound,
    private readonly sampleIntervalMs: number,
    private readonly since: string,
    private readonly stream: Subprocess<'ignore', 'pipe', 'ignore'>,
    private readonly isLiveJob: (id: string) => boolean,
  ) {}

  /**
   * Start watching every container created at or after `sinceMs` (epoch milliseconds).
   * `isLiveJob` says whether a `puni.job` label names an unreleased job in the ledger: a label
   * naming anything else attributes the container to nobody. `sampleIntervalMs` is the run's
   * sampling interval, the longest lifetime a labelled container may have ended within before
   * its bounds were read and still be attributed (A-ATTR-ENDED-1).
   */
  static start(
    docker: string,
    environment: Readonly<Record<string, string | undefined>>,
    jobId: string,
    bound: ContainerBound,
    sampleIntervalMs: number,
    sinceMs: number,
    isLiveJob: (id: string) => boolean,
  ): ContainerWatch {
    const since = (sinceMs / 1000).toFixed(3);
    const kept = dockerEnvironment(environment);
    const stream = Bun.spawn([docker, 'events', '--since', since, ...EVENT_FILTERS], {
      env: kept,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const watch = new ContainerWatch(
      docker,
      kept,
      jobId,
      bound,
      sampleIntervalMs,
      since,
      stream,
      isLiveJob,
    );
    watch.reading = watch.read().catch((cause: unknown) => {
      // Proof: without this catch `a failing docker events stream is an unverified verdict`
      // (containers.test.ts) ended the test process with an unhandled rejection (2026-11-02,
      // Slice 3 review F11).
      watch.judged.set(
        'stream',
        Promise.resolve({
          id: 'stream',
          verdict: 'unverified',
          reason: `docker events stream failed: ${causeText(cause)}`,
        }),
      );
    });
    return watch;
  }

  private async read(): Promise<void> {
    const decoder = new TextDecoder();
    for await (const chunk of this.stream.stdout) {
      this.buffered += decoder.decode(chunk, { stream: true });
      const lines = this.buffered.split('\n');
      this.buffered = lines.pop() ?? '';
      // A daemon event is a few hundred bytes; an unbounded line is not one, and the stream
      // cannot be trusted past it.
      if (this.buffered.length > MAX_EVENT_BYTES)
        throw new Error(`an event line exceeds ${String(MAX_EVENT_BYTES)} bytes`);
      for (const line of lines) if (line.trim() !== '') this.consider(line);
    }
  }

  private consider(line: string): void {
    let event: ContainerEvent;
    try {
      event = parseContainerEvent(line);
    } catch (cause) {
      const key = `malformed:${String(this.judged.size)}`;
      this.judged.set(
        key,
        Promise.resolve({ id: key, verdict: 'unverified', reason: causeText(cause) }),
      );
      return;
    }
    // Proof: not recording die times made `a labelled host-service container removed before
    // inspection is attributed from its events` (containers.test.ts) find verdict unverified, no
    // die event (2026-11-22).
    if (event.action === 'die') {
      if (event.timeNano !== null && !this.diedAt.has(event.id))
        this.diedAt.set(event.id, event.timeNano);
      return;
    }
    if (event.timeNano !== null && !this.createdAt.has(event.id))
      this.createdAt.set(event.id, event.timeNano);
    if (!this.judged.has(event.id))
      this.judged.set(
        event.id,
        this.judge(event).catch((cause: unknown): ContainerVerdict => ({
          id: event.id,
          verdict: 'unverified',
          reason: `container could not be judged: ${causeText(cause)}`,
        })),
      );
  }

  /**
   * A container labelled with this job runs within the bound when `--memory` and `--cpus` were
   * given at or under the declared figures; one labelled with another job is that job's and is
   * not judged here. Without {@link JOB_LABEL}, a container is a host service when it carries a
   * named {@link HOST_SERVICE_LABEL} and both bounds, and unattributed otherwise.
   */
  private async judge(event: ContainerEvent): Promise<ContainerVerdict | null> {
    const owner = event.labels[JOB_LABEL];
    // Proof: checking the host-service label before puni.job made `a container with both labels
    // is judged as the job container it names` (containers.test.ts) find verdict host-service
    // (2026-11-19).
    if (owner === undefined) return this.judgeUnowned(event);
    // Proof: returning null for every other label value made `a container labelled with no live
    // job is unlabelled` (containers.test.ts) record no verdict (2026-11-02, review F8).
    if (owner !== this.jobId) {
      if (this.isLiveJob(owner)) return null;
      return {
        id: event.id,
        verdict: 'unlabelled',
        reason: `container from ${event.image} is labelled ${JOB_LABEL}=${owner}, which names no live job`,
      };
    }
    const limits = await this.readLimits(event);
    if (limits === 'removed') return this.judgeRemoved(event, JOB_LABEL, owner);
    if ('verdict' in limits) return limits;
    const { memory, nanoCpus } = limits;
    const limit = this.bound.memoryGib * GIB;
    // Proof: dropping both the memory and cpu comparisons made `an unbounded container makes the run's
    // attribution incomplete` (job-run.test.ts) record the unbounded run complete (2026-11-01,
    // Slice 3).
    if (!(memory > 0 && memory <= limit))
      return {
        id: event.id,
        verdict: 'unbounded',
        reason: `container from ${event.image} has memory limit ${memory > 0 ? String(memory) : 'none'}, bound ${String(limit)} bytes`,
      };
    if (!(nanoCpus > 0 && nanoCpus <= this.bound.cpuCores * 1e9))
      return {
        id: event.id,
        verdict: 'unbounded',
        reason: `container from ${event.image} has cpu limit ${nanoCpus > 0 ? String(nanoCpus / 1e9) : 'none'}, bound ${String(this.bound.cpuCores)} cores (--cpus)`,
      };
    return {
      id: event.id,
      verdict: 'bounded',
      reason: `labelled, memory ${String(memory)} bytes, ${String(nanoCpus / 1e9)} cores`,
    };
  }

  /**
   * A container without {@link JOB_LABEL}: `host-service` when it names its service and runs
   * under `--memory` and `--cpus`, whatever their figures (the operator declared them, the job's
   * envelope does not hold them); `unlabelled` otherwise, naming what is missing.
   */
  private async judgeUnowned(event: ContainerEvent): Promise<ContainerVerdict> {
    const service = event.labels[HOST_SERVICE_LABEL];
    // Proof: judging every container without puni.job unlabelled made `a labelled, bounded
    // host-service container is attributed as host-service` (containers.test.ts) find verdict
    // unlabelled (2026-11-19).
    if (service === undefined)
      return {
        id: event.id,
        verdict: 'unlabelled',
        reason: `container from ${event.image} started without the ${JOB_LABEL} label`,
      };
    // Proof: dropping this check made `a host-service label with no name is unlabelled`
    // (containers.test.ts) find verdict host-service (2026-11-19).
    if (service.trim() === '')
      return {
        id: event.id,
        verdict: 'unlabelled',
        reason: `container from ${event.image} is labelled ${HOST_SERVICE_LABEL} with no name; a host service is attributed only by name`,
      };
    const limits = await this.readLimits(event);
    if (limits === 'removed') return this.judgeRemoved(event, HOST_SERVICE_LABEL, service);
    if ('verdict' in limits) return limits;
    const missing = [
      ...(limits.memory > 0 ? [] : ['--memory']),
      ...(limits.nanoCpus > 0 ? [] : ['--cpus']),
    ];
    // Proof: attributing a host-service container whatever its bounds made `a host-service
    // container without --memory or --cpus stays unlabelled, naming the missing bound`
    // (containers.test.ts) find verdict host-service for both containers (2026-11-19).
    if (missing.length > 0)
      return {
        id: event.id,
        verdict: 'unlabelled',
        reason: `container from ${event.image} is labelled ${HOST_SERVICE_LABEL}=${service} but started without ${missing.join(' and ')}; a host service is attributed only under declared bounds`,
      };
    const cpuCores = limits.nanoCpus / 1e9;
    return {
      id: event.id,
      verdict: 'host-service',
      reason: `host service ${service}, memory ${String(limits.memory)} bytes, ${String(cpuCores)} cores`,
      hostService: { name: service, memoryBytes: limits.memory, cpuCores },
    };
  }

  /**
   * A labelled container `docker inspect` no longer finds (A-ATTR-ENDED-1): its labels came with
   * its create event, its bounds went with it. Waits for the stream to stop and the replay to be
   * read, then attributes it `lifetime-bounded` when its own create and die events date a
   * lifetime of at most one sampling interval: no sample could have seen it, so its bounds could
   * not have mattered to one. Without both events, or after a longer life, it stays `unverified`.
   */
  private async judgeRemoved(
    event: ContainerEvent,
    label: LifetimeBound['label'],
    name: string,
  ): Promise<ContainerVerdict> {
    // Proof: without this wait `a die event only the closing replay delivers still dates the
    // lifetime` (containers.test.ts) found verdict unverified, no die event (2026-11-22).
    await this.closed.promise;
    const created = this.createdAt.get(event.id);
    const died = this.diedAt.get(event.id);
    const removed = `container from ${event.image} labelled ${label}=${name} was removed before its bound was read`;
    // Proof: attributing a removed container without its die event made `a removed labelled
    // container without its die event stays unverified` (containers.test.ts) find verdict
    // lifetime-bounded (2026-11-22).
    if (created === undefined || died === undefined)
      return {
        id: event.id,
        verdict: 'unverified',
        reason: `${removed}, and no ${created === undefined ? 'create' : 'die'} event dates its lifetime`,
      };
    const lifetimeMs = Math.max(0, (died - created) / 1e6);
    const seconds = `${(lifetimeMs / 1000).toFixed(1)} s`;
    // Proof: dropping this comparison made `a removed labelled container that lived longer than
    // one sampling interval stays unverified` (containers.test.ts) find verdict lifetime-bounded
    // (2026-11-22).
    if (lifetimeMs > this.sampleIntervalMs)
      return {
        id: event.id,
        verdict: 'unverified',
        reason: `${removed} after a lifetime of ${seconds}, longer than one sampling interval (${String(this.sampleIntervalMs)} ms)`,
      };
    return {
      id: event.id,
      verdict: 'lifetime-bounded',
      reason: `${label === JOB_LABEL ? 'job' : 'host-service'}=${name} from its create event (ended before inspection, lifetime ${seconds})`,
      lifetimeBound: { label, name, lifetimeMs, sampleIntervalMs: this.sampleIntervalMs },
    };
  }

  /**
   * The container's `--memory` (bytes) and `--cpus` (nano-CPUs) limits, zero when not given;
   * `removed` when the daemon answers it has no such container; or an `unverified` verdict when
   * it could not be read otherwise.
   */
  private async readLimits(
    event: ContainerEvent,
  ): Promise<{ memory: number; nanoCpus: number } | 'removed' | ContainerVerdict> {
    const inspected = await execute(
      spawnClient(
        [
          this.docker,
          'inspect',
          '--type',
          'container',
          '--format',
          '{{json .HostConfig.Memory}} {{json .HostConfig.NanoCpus}}',
          event.id,
        ],
        this.environment,
      ),
      `docker inspect ${event.id}`,
      DOCKER_DEADLINE_MS,
    );
    // Proof: without this branch `a labelled host-service container removed before inspection is
    // attributed from its events` (containers.test.ts) found verdict unverified, the reason
    // naming `No such container` (2026-11-22).
    if (
      !inspected.timedOut &&
      inspected.exitCode !== 0 &&
      inspected.stderr.includes('No such container')
    )
      return 'removed';
    if (inspected.exitCode !== 0 || inspected.timedOut)
      return {
        id: event.id,
        verdict: 'unverified',
        reason: `container ended or was unreadable before its bound was read: ${firstLine(inspected.stderr) || `exit ${String(inspected.exitCode)}`}`,
      };
    const [memoryText, cpuText] = inspected.stdout.trim().split(' ');
    return { memory: Number(memoryText), nanoCpus: Number(cpuText) };
  }

  /** The labelled containers' usage now: `docker ps` by label, then one `docker stats` sample. */
  async sample(): Promise<ContainerSample> {
    try {
      const listed = await execute(
        spawnClient(
          [
            this.docker,
            'ps',
            '--filter',
            `label=${JOB_LABEL}=${this.jobId}`,
            '--format',
            '{{.ID}}',
          ],
          this.environment,
        ),
        'docker ps',
        DOCKER_DEADLINE_MS,
      );
      if (listed.exitCode !== 0 || listed.timedOut)
        return { error: `docker ps: ${firstLine(listed.stderr) || 'timed out'}` };
      const labelled = new Set(
        listed.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== ''),
      );
      if (labelled.size === 0) return { labelled: 0, sampled: 0, memoryBytes: 0, cpuPercent: 0 };
      const stats = await execute(
        spawnClient(
          [this.docker, 'stats', '--no-stream', '--format', '{{json .}}'],
          this.environment,
        ),
        'docker stats',
        DOCKER_DEADLINE_MS,
      );
      if (stats.exitCode !== 0 || stats.timedOut)
        return { error: `docker stats: ${firstLine(stats.stderr) || 'timed out'}` };
      let sampled = 0;
      let memoryBytes = 0;
      let cpuPercent = 0;
      for (const line of stats.stdout.split('\n').filter((candidate) => candidate.trim() !== '')) {
        const row: unknown = JSON.parse(line);
        if (!isStatsRow(row)) return { error: 'docker stats answered a row it cannot read' };
        // A container removed mid-sample answers `--`; it adds nothing.
        if (!labelled.has(row.ID) || row.CPUPerc === '--') continue;
        const cpu = /^(\d+(?:\.\d+)?)%$/.exec(row.CPUPerc);
        if (cpu === null) return { error: 'docker stats answered a CPUPerc it cannot read' };
        sampled += 1;
        cpuPercent += Number(cpu[1]);
        memoryBytes += parseBytes(row.MemUsage.split(' / ').at(0) ?? '');
      }
      return { labelled: labelled.size, sampled, memoryBytes, cpuPercent };
    } catch (cause) {
      return { error: causeText(cause) };
    }
  }

  /**
   * Replay the window up to `untilMs`, judge every container the stream had not delivered, stop
   * the stream and return the verdicts in the order containers were created.
   */
  async finish(untilMs: number): Promise<ContainerVerdict[]> {
    try {
      const replay = await execute(
        spawnClient(
          [
            this.docker,
            'events',
            '--since',
            this.since,
            '--until',
            ((untilMs + 1000) / 1000).toFixed(3),
            ...EVENT_FILTERS,
          ],
          this.environment,
        ),
        'docker events replay',
        DOCKER_DEADLINE_MS,
      );
      // Proof: treating a failed replay as an empty one made `a failed docker events replay is
      // an unverified verdict` (containers.test.ts) record no verdict (2026-11-02, review F2f).
      if (replay.exitCode !== 0 || replay.timedOut)
        this.judged.set(
          'replay',
          Promise.resolve({
            id: 'replay',
            verdict: 'unverified',
            reason: `docker events replay failed: ${firstLine(replay.stderr) || 'timed out'}`,
          }),
        );
      else
        for (const line of replay.stdout.split('\n')) if (line.trim() !== '') this.consider(line);
    } finally {
      this.stream.kill('SIGKILL');
      await this.stream.exited;
      await this.reading;
      this.closed.resolve(undefined);
    }
    const verdicts = await Promise.all(this.judged.values());
    return verdicts.flatMap((verdict) => (verdict === null ? [] : [verdict]));
  }
}
