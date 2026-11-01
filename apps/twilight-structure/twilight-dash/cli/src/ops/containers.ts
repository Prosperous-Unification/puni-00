import { type Subprocess } from 'bun';

import { execute, firstLine, spawnClient } from '../compute/execution';
import type { ContainerEvidence } from '../resources/runtime';
import { causeText, OpsRefusal } from './refusal';
import type { ContainerSample, ContainerVerdict } from './run-records';

/** The label every container a host job starts carries, valued with the job's use id (J16). */
export const JOB_LABEL = 'puni.job';

/** The bound a type's containers run under, as the catalogue declares it. */
export interface ContainerBound {
  memoryGib: number;
  cpuCores: number;
}

const GIB = 1024 ** 3;
const DOCKER_DEADLINE_MS = 30_000;
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
 * The environment the `docker` CLI gets: what selects its daemon and finds its contexts, so the
 * watch reads the daemon the payload's own `docker` reaches.
 */
function dockerEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'DOCKER_CONFIG', 'DOCKER_HOST', 'DOCKER_CONTEXT']) {
    const value = environment[key];
    if (value !== undefined) kept[key] = value;
  }
  return kept;
}

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
  if (info.exitCode !== 0)
    throw new OpsRefusal(
      70,
      `ops job run: job type ${typeId} declares a containers bound, and the docker daemon does not answer (${firstLine(info.stderr.toString('utf8')) || `exit ${String(info.exitCode)}`})`,
    );
  return docker;
}

/**
 * Settlement's container evidence (J2'): no running container carries the job's label. A
 * failed reading throws, which keeps the compute entry charged.
 */
export function dockerContainerEvidence(
  docker: string,
  environment: Readonly<Record<string, string | undefined>>,
): ContainerEvidence {
  return {
    containersGone: (job) => {
      if (job.descriptor.containers === 'none') return true;
      const listed = Bun.spawnSync(
        [docker, 'ps', '--quiet', '--filter', `label=${JOB_LABEL}=${job.id}`],
        {
          env: dockerEnvironment(environment),
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: DOCKER_DEADLINE_MS,
          killSignal: 'SIGKILL',
        },
      );
      if (listed.exitCode !== 0)
        throw new Error(
          `docker ps answered exit ${String(listed.exitCode)}: ${firstLine(listed.stderr.toString('utf8'))}`,
        );
      return listed.stdout.toString('utf8').trim() === '';
    },
  };
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

/** One container event the stream or the closing replay named. */
interface CreateEvent {
  id: string;
  labels: Readonly<Record<string, string | undefined>>;
  image: string;
}

function parseCreateEvent(line: string): CreateEvent {
  // `docker events --format '{{json .}}'` is the daemon's own output, read once per line.
  const event = JSON.parse(line) as {
    id?: unknown;
    Actor?: { ID?: unknown; Attributes?: Record<string, unknown> };
  };
  const id = typeof event.id === 'string' ? event.id : event.Actor?.ID;
  if (typeof id !== 'string' || !/^[0-9a-f]{12,64}$/.test(id))
    throw new Error('docker events answered an event without a container id');
  const attributes = event.Actor?.Attributes ?? {};
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes))
    if (typeof value === 'string') labels[key] = value;
  return { id, labels, image: labels['image'] ?? 'unknown image' };
}

/**
 * The containers of one host job's window (J16): a `docker events` stream of every container
 * created from the gate on, each judged as it appears; advisory samples of the job's labelled
 * containers; a closing replay of the window so a container the stream had not delivered is
 * still judged. Docker's reading omits containers that vanish between samples and excludes file
 * cache: the samples are evidence, the declared bound is what admission trusts.
 */
export class ContainerWatch {
  private readonly judged = new Map<string, Promise<ContainerVerdict | null>>();
  private buffered = '';

  private constructor(
    private readonly docker: string,
    private readonly environment: Record<string, string>,
    private readonly jobId: string,
    private readonly bound: ContainerBound,
    private readonly since: string,
    private readonly stream: Subprocess<'ignore', 'pipe', 'ignore'>,
  ) {}

  /** Start watching every container created at or after `sinceMs` (epoch milliseconds). */
  static start(
    docker: string,
    environment: Readonly<Record<string, string | undefined>>,
    jobId: string,
    bound: ContainerBound,
    sinceMs: number,
  ): ContainerWatch {
    const since = (sinceMs / 1000).toFixed(3);
    const kept = dockerEnvironment(environment);
    const stream = Bun.spawn(
      [
        docker,
        'events',
        '--since',
        since,
        '--filter',
        'type=container',
        '--filter',
        'event=create',
        '--format',
        '{{json .}}',
      ],
      { env: kept, stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' },
    );
    const watch = new ContainerWatch(docker, kept, jobId, bound, since, stream);
    void watch.read();
    return watch;
  }

  private async read(): Promise<void> {
    const decoder = new TextDecoder();
    for await (const chunk of this.stream.stdout) {
      this.buffered += decoder.decode(chunk, { stream: true });
      const lines = this.buffered.split('\n');
      this.buffered = lines.pop() ?? '';
      for (const line of lines) if (line.trim() !== '') this.consider(line);
    }
  }

  private consider(line: string): void {
    let event: CreateEvent;
    try {
      event = parseCreateEvent(line);
    } catch (cause) {
      const key = `malformed:${String(this.judged.size)}`;
      this.judged.set(
        key,
        Promise.resolve({ id: key, verdict: 'unverified', reason: causeText(cause) }),
      );
      return;
    }
    if (!this.judged.has(event.id)) this.judged.set(event.id, this.judge(event));
  }

  /**
   * A container labelled with this job runs within the bound when `--memory` and `--cpus` were
   * given at or under the declared figures; one with no label is unattributed; one labelled
   * with another job is that job's and is not judged here.
   */
  private async judge(event: CreateEvent): Promise<ContainerVerdict | null> {
    const owner = event.labels[JOB_LABEL];
    if (owner === undefined)
      return {
        id: event.id,
        verdict: 'unlabelled',
        reason: `container from ${event.image} started without the ${JOB_LABEL} label`,
      };
    if (owner !== this.jobId) return null;
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
    if (inspected.exitCode !== 0 || inspected.timedOut)
      return {
        id: event.id,
        verdict: 'unverified',
        reason: `container ended or was unreadable before its bound was read: ${firstLine(inspected.stderr) || `exit ${String(inspected.exitCode)}`}`,
      };
    const [memoryText, cpuText] = inspected.stdout.trim().split(' ');
    const memory = Number(memoryText);
    const nanoCpus = Number(cpuText);
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
            '--filter',
            'type=container',
            '--filter',
            'event=create',
            '--format',
            '{{json .}}',
          ],
          this.environment,
        ),
        'docker events replay',
        DOCKER_DEADLINE_MS,
      );
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
      const verdicts = await Promise.all(this.judged.values());
      return verdicts.flatMap((verdict) => (verdict === null ? [] : [verdict]));
    } finally {
      this.stream.kill('SIGKILL');
      await this.stream.exited;
    }
  }
}
