import { type } from '@shared/validation';

import { ConfigurationRefusal, type InstanceSettings, type ProviderAdapter } from './configuration';
import {
  boundReason,
  classifyTransportFault,
  execute,
  firstLine,
  refuseRunRequest,
  RunTracker,
  spawnClient,
  type TransportFault,
} from './execution';
import type {
  AgentRunHandle,
  AgentRunRequest,
  ComputeProvider,
  Measure,
  Measurement,
  ResourceBinding,
} from './provider';

/** The label every run carries, valued with the instance id; usage sums only these containers. */
export const INSTANCE_LABEL = 'puni.compute-provider';

const BYTES_PER_GIB = 1024 ** 3;
const DOCKER_MEASURES: ReadonlySet<Measure> = new Set(['memory_gib', 'disk_gib', 'cpu_cores']);
const INFO = ['info', '--format', '{{json .}}'] as const;
const STATS = ['stats', '--no-stream', '--format', '{{json .}}'] as const;
const SYSTEM_DF = ['system', 'df', '--format', '{{json .}}'] as const;

/**
 * The units `docker` prints sizes in: binary (`docker stats` memory) and decimal (`docker system
 * df`). A size in any other unit throws.
 */
const BYTE_UNITS: ReadonlyMap<string, number> = new Map([
  ['B', 1],
  ['kB', 1e3],
  ['KB', 1e3],
  ['MB', 1e6],
  ['GB', 1e9],
  ['TB', 1e12],
  ['PB', 1e15],
  ['KiB', 1024],
  ['MiB', 1024 ** 2],
  ['GiB', 1024 ** 3],
  ['TiB', 1024 ** 4],
  ['PiB', 1024 ** 5],
]);

/**
 * The docker CLI's diagnostics for the faults a `docker` provider answers `unreachable`
 * (`compute-providers` P8): the daemon refusing or forbidding its socket, and the transport faults
 * of a `tcp://` or `ssh://` context. The CLI exits 1 for these and for every other error; a
 * non-zero exit matching none of them throws (a context that does not exist, for one).
 */
// Proof: removing `daemon_unreachable` made `answers unreachable when the daemon refuses the
// socket` throw `exited 1 without a transport fault`; removing `socket_permission_denied` made
// `answers unreachable for every typed docker transport fault` fail on it (2026-10-22).
const TRANSPORT_FAULTS: readonly TransportFault[] = [
  ['socket_permission_denied', /permission denied while trying to connect to the docker/i],
  [
    'daemon_unreachable',
    /Cannot connect to the Docker daemon|failed to connect to the docker API/i,
  ],
  ['host_key_mismatch', /Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/],
  ['authentication_failed', /Permission denied \(/],
  ['connection_refused', /connection refused/i],
  ['timeout', /timed out|i\/o timeout|deadline exceeded/i],
  ['name_unresolved', /no such host|Could not resolve hostname/i],
  ['no_route', /no route to host|network is unreachable/i],
];

const ContainerId = /^[0-9a-f]{12}$/;
const StatsRow = type({ ID: ContainerId, CPUPerc: 'string', MemUsage: 'string' });
const DiskRow = type({ Type: 'string', Size: 'string' });

export interface DockerOptions {
  /** The `docker` CLI, resolved on `PATH` by the composition root, `null` when it is absent. */
  readonly dockerExecutable: string | null;
  /**
   * The reporter's environment; only `PATH`, `HOME`, `DOCKER_CONFIG` (where contexts live) and
   * `SSH_AUTH_SOCK` (for an `ssh://` context) reach the CLI.
   */
  readonly environment: Readonly<Record<string, string | undefined>>;
  /** Kill a measuring `docker` after this long and answer `unreachable timeout`; default 30 000. */
  readonly commandDeadlineMs?: number;
}

/** A command's stdout, or the transport fault it answered. */
type Answer =
  | { readonly kind: 'answered'; readonly stdout: string }
  | { readonly kind: 'unreachable'; readonly reason: string };

/**
 * A size as `docker` prints it (`12.64MiB`, `14.83GB`, `0B`), in bytes.
 * @throws Error naming `subject` for any other text.
 */
function parseBytes(subject: string, text: string): number {
  const match = /^(\d+(?:\.\d+)?)([A-Za-z]+)$/.exec(text.trim());
  const multiplier = match === null ? undefined : BYTE_UNITS.get(match[2]);
  if (match === null || multiplier === undefined) {
    throw new Error(`${subject} answered a size it cannot read: ${text.slice(0, 40)}`);
  }
  return Number(match[1]) * multiplier;
}

/**
 * Each non-blank line as JSON.
 * @throws Error naming `subject` when a line is not JSON.
 */
function parseJsonLines(subject: string, stdout: string): unknown[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`${subject} answered a line that is not JSON`);
      }
    });
}

/**
 * `docker info`'s `MemTotal` (bytes) and `NCPU`.
 * @throws Error when the answer is not one JSON object carrying both as positive integers.
 */
function parseInfo(subject: string, stdout: string): { memTotal: number; cpus: number } {
  const [info, ...rest] = parseJsonLines(subject, stdout);
  if (typeof info !== 'object' || info === null || rest.length > 0) {
    throw new Error(`${subject} answered no single JSON object`);
  }
  const memTotal: unknown = 'MemTotal' in info ? info.MemTotal : undefined;
  const cpus: unknown = 'NCPU' in info ? info.NCPU : undefined;
  if (!Number.isSafeInteger(memTotal) || typeof memTotal !== 'number' || memTotal <= 0) {
    throw new Error(`${subject} answered no MemTotal`);
  }
  if (!Number.isSafeInteger(cpus) || typeof cpus !== 'number' || cpus <= 0) {
    throw new Error(`${subject} answered no NCPU`);
  }
  return { memTotal, cpus };
}

/**
 * `docker ps --format '{{.ID}}'`: one short container id per line, possibly none.
 * @throws Error for a line that is not one.
 */
function parseContainerIds(subject: string, stdout: string): ReadonlySet<string> {
  const ids = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!ids.every((id) => ContainerId.test(id))) {
    throw new Error(`${subject} answered a line that is not a container id`);
  }
  return new Set(ids);
}

/**
 * The usage of the containers carrying this instance's label, from one `docker stats --no-stream`
 * sample of every running container (`docker stats` cannot filter by label, so `labelled` holds
 * the ids `docker ps --filter label=…` named). Rows of other containers are skipped before their
 * values are read, so another tenant's or another instance's container never ends this one's
 * report. A labelled row whose sample failed (`CPUPerc` `--`, `MemUsage` `-- / --`: the container
 * was removed mid-sample, as a finished `docker run --rm` is, or its sample timed out) is counted
 * `inTransit` and adds nothing. A labelled container `ps` named and `stats` did not sample started
 * or ended between the two commands and is left out; `sampled` counts the labelled rows read.
 * @throws Error for a line that is not JSON, a row without the three fields, or a labelled row
 * whose values it cannot read.
 */
function sumLabelled(subject: string, stdout: string, labelled: ReadonlySet<string>) {
  let sampled = 0;
  let inTransit = 0;
  let memoryBytes = 0;
  let cpuPercent = 0;
  for (const line of parseJsonLines(subject, stdout)) {
    const row = StatsRow(line);
    if (row instanceof type.errors) throw new Error(`${subject} answered a row it cannot read`);
    // Proof: summing every row made `sums only the containers labelled with this instance` fail,
    // instance-a reporting 5 GiB of memory in use instead of 1: all four running containers of
    // the two-instance fixture (2026-10-22). Reading every row's values before this skip made
    // `skips unlabelled rows unread and counts a labelled sample in transit` throw `answered a
    // CPUPerc it cannot read` on the unlabelled `--` row (2026-10-23).
    if (!labelled.has(row.ID)) continue;
    sampled += 1;
    // Proof: without this branch the same test threw `answered a CPUPerc it cannot read` on the
    // labelled `--` row (2026-10-23).
    if (row.CPUPerc === '--' && row.MemUsage.startsWith('--')) {
      inTransit += 1;
      continue;
    }
    const used = row.MemUsage.split(' / ').at(0) ?? '';
    const cpu = /^(\d+(?:\.\d+)?)%$/.exec(row.CPUPerc);
    if (cpu === null) throw new Error(`${subject} answered a CPUPerc it cannot read`);
    memoryBytes += parseBytes(subject, used);
    cpuPercent += Number(cpu[1]);
  }
  return { labelled: labelled.size, sampled, inTransit, memoryBytes, cpuPercent };
}

/** The settings a `docker` instance needs beyond its bindings. */
function readDockerSettings(settings: InstanceSettings): {
  context: string;
  runImage: string | undefined;
} {
  if (settings.dockerContext === undefined) {
    throw new ConfigurationRefusal(
      'config_malformed',
      `instance ${settings.instanceId} (docker) needs dockerContext`,
    );
  }
  return { context: settings.dockerContext, runImage: settings.runImage };
}

/**
 * A `docker` provider (`compute-providers` P9): every observation and run is one `docker --context
 * <context>` command. Memory and cores are the daemon's (`docker info`), their usage the
 * containers labelled with this instance's id; disk usage is the daemon's whole `docker system df`
 * against the binding's `ceilingGib`. It runs only when the instance names a `runImage`.
 */
class DockerProvider implements ComputeProvider {
  public readonly kind = 'docker';
  public readonly capabilities: ComputeProvider['capabilities'];
  readonly #runs = new RunTracker();

  public constructor(
    public readonly instanceId: string,
    private readonly dockerExecutable: string,
    private readonly context: string,
    private readonly runImage: string | undefined,
    private readonly options: DockerOptions,
  ) {
    this.capabilities = { measures: DOCKER_MEASURES, runs: runImage !== undefined };
  }

  private spawnDocker(args: readonly string[]) {
    const { PATH, HOME, DOCKER_CONFIG, SSH_AUTH_SOCK } = this.options.environment;
    // Only what the CLI needs reaches it: never `DOCKER_HOST`, the credential or anything else.
    return spawnClient([this.dockerExecutable, '--context', this.context, ...args], {
      ...(PATH === undefined ? {} : { PATH }),
      ...(HOME === undefined ? {} : { HOME }),
      ...(DOCKER_CONFIG === undefined ? {} : { DOCKER_CONFIG }),
      ...(SSH_AUTH_SOCK === undefined ? {} : { SSH_AUTH_SOCK }),
    });
  }

  /**
   * One measuring command's stdout, or `unreachable` for a timeout or a typed transport fault.
   * @throws Error for any other non-zero exit, naming the command and the CLI's first line.
   */
  private async command(args: readonly string[]): Promise<Answer> {
    const subject = `docker ${args.join(' ')} on context ${this.context}`;
    const execution = await execute(
      this.spawnDocker(args),
      subject,
      this.options.commandDeadlineMs,
    );
    if (execution.timedOut) {
      return {
        kind: 'unreachable',
        reason: boundReason(
          `docker timeout: no answer from context ${this.context} within the command deadline`,
        ),
      };
    }
    // A failing `docker info` still prints a JSON object (`MemTotal: 0`), so stdout is read only
    // after a zero exit.
    if (execution.exitCode !== 0) {
      const reason = classifyTransportFault('docker', TRANSPORT_FAULTS, execution.stderr);
      // Proof: answering an unmatched exit `unreachable` made `throws for a docker failure that
      // names no transport fault` resolve instead of rejecting (2026-10-22).
      if (reason === undefined) {
        throw new Error(
          `${subject} exited ${String(execution.exitCode)} without a transport fault: ${firstLine(execution.stderr)}`,
        );
      }
      return { kind: 'unreachable', reason };
    }
    return { kind: 'answered', stdout: execution.stdout };
  }

  public async observe(binding: ResourceBinding, now: number): Promise<Measurement> {
    if (binding.measure === 'disk_gib') return this.observeDisk(binding, now);
    if (binding.measure === 'agent_slots') {
      throw new Error(`a docker instance cannot measure agent_slots (${binding.resourceId})`);
    }
    const info = await this.command(INFO);
    if (info.kind === 'unreachable') return { ...info, observedAt: now };
    // Proof: catching this parse and answering `unreachable` made `throws for docker info without
    // MemTotal and for an answer that is not JSON` resolve instead of rejecting (2026-10-22).
    const daemon = parseInfo(`docker info on context ${this.context}`, info.stdout);
    const filter = `label=${INSTANCE_LABEL}=${this.instanceId}`;
    const listed = await this.command(['ps', '--filter', filter, '--format', '{{.ID}}']);
    if (listed.kind === 'unreachable') return { ...listed, observedAt: now };
    const labelled = parseContainerIds(`docker ps on context ${this.context}`, listed.stdout);
    const sampled = await this.command(STATS);
    if (sampled.kind === 'unreachable') return { ...sampled, observedAt: now };
    const usage = sumLabelled(`docker stats on context ${this.context}`, sampled.stdout, labelled);
    const source = `docker context ${this.context}: ${String(usage.labelled)} labelled; ${String(usage.sampled)} sampled; ${String(usage.inTransit)} in transit`;
    if (binding.measure === 'memory_gib') {
      return {
        kind: 'measured',
        capacityUnits: Math.floor(daemon.memTotal / BYTES_PER_GIB),
        usageUnits: Math.floor(usage.memoryBytes / BYTES_PER_GIB),
        observedAt: now,
        evidence: `${source}; MemTotal ${String(daemon.memTotal)} B; in use ${String(Math.round(usage.memoryBytes))} B`,
      };
    }
    return {
      kind: 'measured',
      capacityUnits: daemon.cpus,
      usageUnits: Math.min(daemon.cpus, Math.floor(usage.cpuPercent / 100)),
      observedAt: now,
      evidence: `${source}; NCPU ${String(daemon.cpus)}; CPUPerc ${usage.cpuPercent.toFixed(2)}%`,
    };
  }

  /**
   * The daemon's whole disk usage (images, containers, volumes, build cache) floored to GiB,
   * against the binding's `ceilingGib`.
   * @throws Error when `docker system df` answers no row or a row it cannot read.
   */
  private async observeDisk(binding: ResourceBinding, now: number): Promise<Measurement> {
    const ceiling = binding.ceilingGib;
    if (ceiling === undefined) {
      throw new Error(`docker disk binding ${binding.resourceId} has no ceilingGib`);
    }
    const answer = await this.command(SYSTEM_DF);
    if (answer.kind === 'unreachable') return { ...answer, observedAt: now };
    const subject = `docker system df on context ${this.context}`;
    const rows = parseJsonLines(subject, answer.stdout).map((line) => {
      const row = DiskRow(line);
      if (row instanceof type.errors) throw new Error(`${subject} answered a row it cannot read`);
      return { type: row.Type, bytes: parseBytes(subject, row.Size), size: row.Size };
    });
    if (rows.length === 0) throw new Error(`${subject} answered no row`);
    const used = rows.reduce((sum, row) => sum + row.bytes, 0);
    return {
      kind: 'measured',
      capacityUnits: ceiling,
      usageUnits: Math.floor(used / BYTES_PER_GIB),
      observedAt: now,
      evidence: `docker context ${this.context}: ${rows.map((row) => `${row.type} ${row.size}`).join(', ')}; ceiling ${String(ceiling)} GiB`,
    };
  }

  public run(request: AgentRunRequest, now: number): Promise<AgentRunHandle> {
    const refusal = refuseRunRequest(request);
    if (refusal !== undefined) return Promise.reject(refusal);
    if (this.runImage === undefined) {
      return Promise.reject(new Error(`docker instance ${this.instanceId} names no runImage`));
    }
    const environment = Object.entries(request.environment).flatMap(([key, value]) => [
      '--env',
      `${key}=${value}`,
    ]);
    // Options end at the image; every word after it is the container's command.
    const args = [
      'run',
      '--rm',
      '--label',
      `${INSTANCE_LABEL}=${this.instanceId}`,
      ...environment,
      this.runImage,
      ...request.command,
    ];
    return Promise.resolve(this.#runs.track(this.spawnDocker(args), now));
  }

  public onRunChange(listener: () => void): () => void {
    return this.#runs.onRunChange(listener);
  }
}

/**
 * The `docker` adapter: opening an instance checks its context name and that the `docker` CLI is
 * on `PATH`; nothing is dialled until the first observation. Measures `memory_gib`, `cpu_cores`
 * and `disk_gib`; `agent_slots` is refused `unsupported_measure` at load.
 */
export function dockerAdapter(options: DockerOptions): ProviderAdapter {
  return {
    isStub: false,
    measures: DOCKER_MEASURES,
    // Through `then`, so a refusal rejects the promise rather than throwing at the call.
    open: (settings) =>
      Promise.resolve().then(() => {
        const { context, runImage } = readDockerSettings(settings);
        const { dockerExecutable } = options;
        if (dockerExecutable === null) {
          throw new Error(
            `report-capacity needs docker on PATH for instance ${settings.instanceId}`,
          );
        }
        return new DockerProvider(
          settings.instanceId,
          dockerExecutable,
          context,
          runImage,
          options,
        );
      }),
  };
}
