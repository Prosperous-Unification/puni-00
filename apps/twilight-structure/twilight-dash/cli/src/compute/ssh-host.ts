import {
  readSshTransport,
  renderRemoteCommandArguments,
  type SshTransport,
} from '@tools/fleet-ssh-transport';

import { ConfigurationRefusal, type InstanceSettings, type ProviderAdapter } from './configuration';
import {
  type AgentRunHandle,
  type AgentRunRequest,
  type ComputeProvider,
  type Measure,
  type Measurement,
  MEASURES,
  type ResourceBinding,
} from './provider';

const KIB_PER_GIB = 1024 * 1024;
const MAX_REASON_LENGTH = 200;
const MAX_OUTPUT_BYTES = 1024 * 1024;

/** The keys a run's environment may carry; everything else is refused before ssh starts. */
export const RUN_ENVIRONMENT_ALLOWLIST: ReadonlySet<string> = new Set([
  'HOME',
  'LANG',
  'LC_ALL',
  'PATH',
  'TERM',
  'TZ',
]);

/**
 * ssh's own diagnostics for the transport faults an `ssh_host` provider answers `unreachable`
 * (`compute-providers` P8). ssh exits 255 for its own errors; a remote command exiting 255 would
 * look the same, and none of the measuring commands does. A 255 matching none of these throws.
 */
// Proof: removing each entry in turn failed its case: `connection_refused` and
// `host_key_mismatch` in `answers unreachable with the ssh cause when the port is closed, without
// throwing`, the other four in `answers unreachable for every typed transport fault` (2026-10-22).
const TRANSPORT_FAULTS: readonly (readonly [string, RegExp])[] = [
  ['connection_refused', /Connection refused/],
  ['timeout', /timed out/i],
  ['host_key_mismatch', /Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/],
  ['authentication_failed', /Permission denied/],
  ['name_unresolved', /Could not resolve hostname/],
  ['no_route', /No route to host|Network is unreachable/],
];

export interface SshHostOptions {
  /** The `ssh` client, resolved by the composition root; tests pass a fixture client. */
  readonly sshExecutable: string;
  /** The reporter's environment; only `PATH` and `HOME` reach ssh, beside the pinned agent. */
  readonly environment: Readonly<Record<string, string | undefined>>;
  /** ssh `ConnectTimeout`; default 10. */
  readonly connectTimeoutSeconds?: number;
  /** Kill a measuring ssh after this long and answer `unreachable timeout`; default 30 000. */
  readonly commandDeadlineMs?: number;
}

interface Execution {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

function quote(word: string): string {
  return `'${word.replaceAll("'", `'\\''`)}'`;
}

/** The first non-blank line, trimmed: ssh ends its diagnostics with `\r\n` on a terminal-less run. */
function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  );
}

/** The remote command that answers one measure. */
function measuringCommand(binding: ResourceBinding): string {
  switch (binding.measure) {
    case 'memory_gib':
      return 'cat /proc/meminfo';
    case 'disk_gib':
      return `df -kP -- ${quote(binding.path ?? '/')}`;
    case 'cpu_cores':
      return 'nproc && cat /proc/loadavg';
    case 'agent_slots':
      // Reachability only: a slot on a host Dash cannot reach is no slot.
      return 'true';
  }
}

/**
 * `/proc/meminfo`'s `MemTotal` and `MemAvailable` (kB, which the kernel means as KiB), floored to
 * GiB; usage is what is not available.
 * @throws Error naming the missing or nonsensical line.
 */
function parseMemory(
  host: string,
  stdout: string,
): { capacity: number; usage: number; lines: string } {
  const values = new Map<string, number>();
  const lines = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const match = /^(\w+):\s+(\d+) kB$/.exec(line.trim());
    if (match !== null) {
      values.set(match[1], Number(match[2]));
      lines.set(match[1], line.trim());
    }
  }
  const total = values.get('MemTotal');
  const available = values.get('MemAvailable');
  if (total === undefined) throw new Error(`/proc/meminfo on ${host} has no MemTotal line`);
  if (available === undefined) throw new Error(`/proc/meminfo on ${host} has no MemAvailable line`);
  if (available > total) {
    throw new Error(`/proc/meminfo on ${host} states MemAvailable above MemTotal`);
  }
  return {
    capacity: Math.floor(total / KIB_PER_GIB),
    usage: Math.floor((total - available) / KIB_PER_GIB),
    lines: `${lines.get('MemTotal') ?? ''}; ${lines.get('MemAvailable') ?? ''}`,
  };
}

/**
 * `df -kP`'s header and one data line: 1024-blocks and used, floored to GiB.
 * @throws Error when the answer is not exactly that.
 */
function parseDisk(host: string, path: string, stdout: string) {
  const lines = stdout.split('\n').filter((line) => line.trim().length > 0);
  const fields = lines.at(1)?.trim().split(/\s+/) ?? [];
  const blocks = fields.at(1) ?? '';
  const used = fields.at(2) ?? '';
  if (
    lines.length !== 2 ||
    !lines[0].startsWith('Filesystem') ||
    fields.length < 6 ||
    !/^\d+$/.test(blocks) ||
    !/^\d+$/.test(used)
  ) {
    throw new Error(`df -kP ${path} on ${host} answered no parseable data line`);
  }
  return {
    capacity: Math.floor(Number(blocks) / KIB_PER_GIB),
    usage: Math.floor(Number(used) / KIB_PER_GIB),
    lines: lines[1].trim(),
  };
}

/**
 * `nproc` and the one-minute load average of `/proc/loadavg`; usage is the load floored and
 * capped at the core count, the closest whole-core figure a single sample gives.
 * @throws Error when either line is not a number.
 */
function parseCores(host: string, stdout: string) {
  const lines = stdout.split('\n').map((line) => line.trim());
  const cores = lines.at(0) ?? '';
  const load = lines.at(1)?.split(/\s+/).at(0) ?? '';
  if (!/^[1-9]\d*$/.test(cores) || !/^\d+(?:\.\d+)?$/.test(load)) {
    throw new Error(`nproc and /proc/loadavg on ${host} answered no core count and load`);
  }
  return {
    capacity: Number(cores),
    usage: Math.min(Number(cores), Math.floor(Number(load))),
    lines: `nproc ${cores}; loadavg ${load}`,
  };
}

/** The settings an `ssh_host` instance needs beyond its bindings. */
function readHostSettings(settings: InstanceSettings): { host: string; transportFile: string } {
  const { host, sshTransportFile } = settings;
  if (host === undefined || sshTransportFile === undefined) {
    throw new ConfigurationRefusal(
      'config_malformed',
      `instance ${settings.instanceId} (ssh_host) needs host and sshTransportFile`,
    );
  }
  return { host, transportFile: sshTransportFile };
}

/**
 * An `ssh_host` provider (`compute-providers` P9): every observation and run is one `ssh` over the
 * pinned transport of `discovery-ssh-transport`. `agent_slots` counts the runs this instance
 * started and has not seen end, so it is per process: a reporter that starts no run reports 0 in
 * use.
 */
class SshHostProvider implements ComputeProvider {
  public readonly kind = 'ssh_host';
  public readonly capabilities = { measures: new Set<Measure>(MEASURES), runs: true };
  readonly #listeners = new Set<() => void>();
  #activeRuns = 0;

  public constructor(
    public readonly instanceId: string,
    private readonly host: string,
    private readonly transport: SshTransport,
    private readonly options: SshHostOptions,
  ) {}

  private spawnSsh(remoteCommand: string) {
    const args = renderRemoteCommandArguments(
      this.transport,
      this.host,
      remoteCommand,
      this.options.connectTimeoutSeconds ?? 10,
    );
    const { PATH, HOME } = this.options.environment;
    // Only what ssh needs reaches it: never the reporter's credential or other environment.
    return Bun.spawn([this.options.sshExecutable, ...args], {
      env: {
        ...(PATH === undefined ? {} : { PATH }),
        ...(HOME === undefined ? {} : { HOME }),
        SSH_AUTH_SOCK: this.transport.agentSocket,
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }

  /**
   * Runs one measuring ssh. Past the command deadline ssh is killed and the answer is `timedOut`
   * as soon as it has exited, without waiting for its pipes: a `ProxyCommand` or other descendant
   * may still hold them open. The pipe readers then outlive the answer until that descendant
   * closes the pipes; this is bounded by the descendant's life, and the losing branch of the race
   * cannot become an unhandled rejection because the race's own `then` handles it. Any exit after
   * the deadline fired is `timedOut`, whichever branch of the race settles first.
   */
  private async execute(remoteCommand: string): Promise<Execution> {
    const child = this.spawnSsh(remoteCommand);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let pastDeadline = false;
    const killed = new Promise<Execution>((resolve) => {
      deadline = setTimeout(() => {
        pastDeadline = true;
        child.kill('SIGKILL');
        void child.exited.then((exitCode) => {
          resolve({ exitCode, stdout: '', stderr: '', timedOut: true });
        });
      }, this.options.commandDeadlineMs ?? 30_000);
    });
    const answered = Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]).then(([stdout, stderr, exitCode]): Execution => {
      // Proof: dropping this cap made `refuses an answer over 1 MiB` parse the oversized meminfo
      // (2026-10-22).
      if (stdout.length > MAX_OUTPUT_BYTES) {
        throw new Error(`${remoteCommand} on ${this.host} answered more than 1 MiB`);
      }
      // In the fixture `killed` always won (3 of 3 runs with `timedOut: false` still passed), so
      // the proof forces this branch first by never resolving `killed`.
      // Proof: so forced, the flag passed `answers timeout when a killed ssh has no descendant`
      // and `timedOut: false` failed it with `true on stalled.fixture exited 137` (2026-10-22).
      return { exitCode, stdout, stderr, timedOut: pastDeadline };
    });
    // Proof: awaiting only `answered` made `bounds an unreachable reason…` fail its elapsed-time
    // assertion, the timed-out observation answering only after the fixture dial's descendant
    // `sleep` ended (about 5 s, not under 2 s) (2026-10-22).
    try {
      return await Promise.race([answered, killed]);
    } finally {
      clearTimeout(deadline);
    }
  }

  public async observe(binding: ResourceBinding, now: number): Promise<Measurement> {
    // Runs in use as of `now`, the instant the measurement is stamped with: a run that ends while
    // the reachability dial is in flight still counted at `now`.
    // Proof: reading `#activeRuns` after the dial made `counts the runs in use at the stamp, not
    // after the dial` fail with `usageUnits` 0 instead of 1 (2026-10-22).
    const runsInUse = this.#activeRuns;
    const command = measuringCommand(binding);
    const execution = await this.execute(command);
    if (execution.timedOut) {
      return {
        kind: 'unreachable',
        reason: `ssh timeout: no answer from ${this.host} within the command deadline`.slice(
          0,
          MAX_REASON_LENGTH,
        ),
        observedAt: now,
      };
    }
    if (execution.exitCode === 255) {
      const diagnostic = firstLine(execution.stderr);
      const fault = TRANSPORT_FAULTS.find(([, pattern]) => pattern.test(execution.stderr));
      // Proof: answering an unmatched 255 `unreachable` made `throws for an ssh failure that
      // names no transport fault` resolve instead of rejecting (2026-10-22).
      if (fault === undefined) {
        throw new Error(`ssh to ${this.host} exited 255 without a transport fault: ${diagnostic}`);
      }
      return {
        kind: 'unreachable',
        reason: `ssh ${fault[0]}: ${diagnostic}`.slice(0, MAX_REASON_LENGTH),
        observedAt: now,
      };
    }
    // Proof: dropping this branch made `throws when the remote command fails on a reachable host`
    // receive the parser's `has no MemTotal line` instead of the remote exit (2026-10-22).
    if (execution.exitCode !== 0) {
      throw new Error(
        `${command} on ${this.host} exited ${String(execution.exitCode)}: ${firstLine(execution.stderr)}`,
      );
    }
    // Proof: catching the parse errors below and answering `unreachable` made `throws for
    // /proc/meminfo without MemTotal` and `throws for an unparseable df answer` fail, each
    // resolving to an unreachable measurement instead of rejecting (2026-10-22).
    const parsed = this.parse(binding, execution.stdout, runsInUse);
    return {
      kind: 'measured',
      capacityUnits: parsed.capacity,
      usageUnits: parsed.usage,
      observedAt: now,
      evidence: `ssh ${this.transport.user}@${this.host}: ${parsed.lines}`,
    };
  }

  private parse(binding: ResourceBinding, stdout: string, runsInUse: number) {
    switch (binding.measure) {
      case 'memory_gib':
        return parseMemory(this.host, stdout);
      case 'disk_gib':
        return parseDisk(this.host, binding.path ?? '/', stdout);
      case 'cpu_cores':
        return parseCores(this.host, stdout);
      case 'agent_slots':
        return {
          capacity: binding.slots ?? 0,
          usage: runsInUse,
          lines: `${String(runsInUse)} of ${String(binding.slots ?? 0)} slots in use`,
        };
    }
  }

  public run(request: AgentRunRequest, now: number): Promise<AgentRunHandle> {
    const refused = Object.keys(request.environment).find(
      (key) => !RUN_ENVIRONMENT_ALLOWLIST.has(key),
    );
    // Proof: skipping this refusal made `refuses a run environment key outside the allow-list
    // before ssh starts` spawn ssh and record an invocation (2026-10-22).
    if (refused !== undefined) {
      return Promise.reject(new Error(`run environment key ${refused} is not allow-listed`));
    }
    if (request.command[0].includes('=') || request.command[0].length === 0) {
      return Promise.reject(new Error('run command must start with a program name'));
    }
    const assignments = Object.entries(request.environment).map(
      ([key, value]) => `${key}=${quote(value)}`,
    );
    // `env -i` starts the remote program with exactly the allow-listed environment.
    const remoteCommand = ['env', '-i', ...assignments, ...request.command.map(quote)].join(' ');
    const child = this.spawnSsh(remoteCommand);
    this.changeRuns(1);
    // stderr is drained so a chatty run cannot block on a full pipe; it is not kept.
    const exited = Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]).then(([stdout, , exitCode]) => ({ exitCode, stdout }));
    const settled = exited.finally(() => {
      this.changeRuns(-1);
    });
    return Promise.resolve({ startedAt: now, exited: settled });
  }

  private changeRuns(delta: number): void {
    this.#activeRuns += delta;
    for (const listener of this.#listeners) listener();
  }

  public onRunChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

/**
 * The `ssh_host` adapter: opening an instance reads and validates its transport file against its
 * host (owner-only, pinned in `known_hosts`, a live agent socket), so a configuration refusal
 * happens before any connection.
 */
export function sshHostAdapter(options: SshHostOptions): ProviderAdapter {
  return {
    measures: new Set<Measure>(MEASURES),
    async open(settings) {
      const { host, transportFile } = readHostSettings(settings);
      const transport = await readSshTransport(transportFile, options.environment, [host]);
      return new SshHostProvider(settings.instanceId, host, transport, options);
    },
  };
}
