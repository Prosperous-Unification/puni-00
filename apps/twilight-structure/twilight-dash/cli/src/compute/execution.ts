import type { AgentRunHandle, AgentRunRequest } from './provider';

/** The longest `unreachable` reason WBS accepts (`compute-providers` P5). */
export const MAX_REASON_LENGTH = 200;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_COMMAND_DEADLINE_MS = 30_000;

/** The keys a run's environment may carry; everything else is refused before a process starts. */
export const RUN_ENVIRONMENT_ALLOWLIST: ReadonlySet<string> = new Set([
  'HOME',
  'LANG',
  'LC_ALL',
  'PATH',
  'TERM',
  'TZ',
]);

/** A local client process (`ssh`, `docker`) with its stdin closed and both outputs piped. */
export type ClientProcess = Bun.Subprocess<'ignore', 'pipe', 'pipe'>;

/** How one measuring command ended. `timedOut` is set for any exit after the deadline fired. */
export interface Execution {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** A transport fault a client names on stderr: the cause word WBS stores and its pattern. */
export type TransportFault = readonly [cause: string, pattern: RegExp];

/** Starts `argv` with exactly `environment`, stdin closed and both outputs piped. */
export function spawnClient(
  argv: readonly [string, ...string[]],
  environment: Readonly<Record<string, string>>,
): ClientProcess {
  return Bun.spawn([...argv], {
    env: { ...environment },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

/** The first non-blank line, trimmed: ssh ends its diagnostics with `\r\n` on a terminal-less run. */
export function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  );
}

/** `reason` cut to the {@link MAX_REASON_LENGTH} characters WBS accepts. */
export function boundReason(reason: string): string {
  return reason.slice(0, MAX_REASON_LENGTH);
}

/** The first fault whose pattern matches `stderr`, as `<client> <cause>: <first line>`. */
export function classifyTransportFault(
  client: string,
  faults: readonly TransportFault[],
  stderr: string,
): string | undefined {
  const fault = faults.find(([, pattern]) => pattern.test(stderr));
  return fault === undefined
    ? undefined
    : boundReason(`${client} ${fault[0]}: ${firstLine(stderr)}`);
}

/**
 * Waits for one measuring command. Past `deadlineMs` (default 30 000) the client is killed and
 * the answer is `timedOut` as soon as it has exited, without waiting for its pipes: a
 * `ProxyCommand`, an `ssh` a Docker context dials through, or another descendant may still hold
 * them open. The pipe readers then outlive the answer until that descendant closes the pipes;
 * this is bounded by the descendant's life, and the losing branch of the race cannot become an
 * unhandled rejection because the race's own `then` handles it. Any exit after the deadline fired
 * is `timedOut`, whichever branch of the race settles first.
 * @throws Error naming `subject` when stdout exceeds 1 MiB (stderr is not capped).
 */
export async function execute(
  child: ClientProcess,
  subject: string,
  deadlineMs = DEFAULT_COMMAND_DEADLINE_MS,
): Promise<Execution> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let pastDeadline = false;
  const killed = new Promise<Execution>((resolve) => {
    deadline = setTimeout(() => {
      pastDeadline = true;
      child.kill('SIGKILL');
      void child.exited.then((exitCode) => {
        resolve({ exitCode, stdout: '', stderr: '', timedOut: true });
      });
    }, deadlineMs);
  });
  const answered = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]).then(([stdout, stderr, exitCode]): Execution => {
    // Proof: dropping this cap made `refuses an answer over 1 MiB` parse the oversized meminfo
    // (2026-10-22).
    if (stdout.length > MAX_OUTPUT_BYTES) {
      throw new Error(`${subject} answered more than 1 MiB`);
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

/**
 * The run environment's first key outside {@link RUN_ENVIRONMENT_ALLOWLIST}, or an empty program,
 * as the error a run rejects with before any process starts; `undefined` when the request is
 * acceptable.
 */
export function refuseRunRequest(request: AgentRunRequest): Error | undefined {
  const refused = Object.keys(request.environment).find(
    (key) => !RUN_ENVIRONMENT_ALLOWLIST.has(key),
  );
  // Proof: skipping this refusal made `refuses a run environment key outside the allow-list
  // before ssh starts` spawn ssh and record an invocation (2026-10-22).
  if (refused !== undefined) return new Error(`run environment key ${refused} is not allow-listed`);
  if (request.command[0].length === 0)
    return new Error('run command must start with a program name');
  return undefined;
}

/**
 * The runs one provider instance started and has not seen end, and the listeners told when one
 * begins or ends. Counts are per process.
 */
export class RunTracker {
  readonly #listeners = new Set<() => void>();
  #active = 0;

  /** The runs started and not yet ended. */
  public get active(): number {
    return this.#active;
  }

  /**
   * Counts `child` as a run until it exits and answers its handle. stderr is drained so a chatty
   * run cannot block on a full pipe; it is not kept.
   */
  public track(child: ClientProcess, now: number): AgentRunHandle {
    this.change(1);
    const exited = Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
      .then(([stdout, , exitCode]) => ({ exitCode, stdout }))
      .finally(() => {
        this.change(-1);
      });
    return { kind: 'started', startedAt: now, exited };
  }

  public onRunChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  private change(delta: number): void {
    this.#active += delta;
    for (const listener of this.#listeners) listener();
  }
}
