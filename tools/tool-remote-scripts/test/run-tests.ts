import { createHash } from 'node:crypto';
import { accessSync, constants, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

export type RemoteTestCommand =
  'canonical' | 'graph' | 'graph-ordinary' | 'graph-legacy' | 'graph-identity';

export type GraphTestMode = 'graph-ordinary' | 'graph-legacy' | 'graph-identity';

export interface GraphAdmissionBoundary {
  readonly repository: string;
  readonly modulePath: string;
  readonly executable: string;
  readonly requiredExecutable: string;
  readonly declaredCount: number;
  readonly declaredTitlesSHA256: string;
}

const GRAPH_ADMISSION_NAMES: readonly string[] = [
  'PUNI_REMOTE_GRAPH_ADMISSION',
  'PUNI_REMOTE_GRAPH_MODE',
  'PUNI_REMOTE_GRAPH_ROOT',
  'PUNI_REMOTE_GRAPH_EXECUTABLE',
];
const GRAPH_TITLES_SHA256 = '9676491473de150ee073672db57973de44ec6707f2e1a5f5f5f5b75384e4bd2a';

function hasSelectionOverride(environment: Readonly<Record<string, string | undefined>>): boolean {
  return Object.keys(environment).some(
    (name) =>
      name === 'BUN_OPTIONS' ||
      name.startsWith('BUN_TEST_') ||
      name === 'NODE_OPTIONS' ||
      name === 'PUNI_UC1_PREFLIGHT',
  );
}

function isCanonicalPath(path: unknown): path is string {
  return (
    typeof path === 'string' && !path.includes('\0') && isAbsolute(path) && resolve(path) === path
  );
}

/**
 * Parses exactly one closed public command; no path, filter, timeout or preload arguments are forwarded.
 * Refuses ambient Bun/Node/historical/partition selection keys even when their supplied value is undefined.
 * @throws Error for unsupported commands or selection environment; performs no dispatch or I/O.
 */
export function readRemoteTestCommand(
  tokens: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): RemoteTestCommand {
  if (tokens.length !== 1) throw new Error('Unsupported remote graph command');
  const command = tokens[0];
  if (
    command !== 'canonical' &&
    command !== 'graph' &&
    command !== 'graph-ordinary' &&
    command !== 'graph-legacy' &&
    command !== 'graph-identity'
  )
    throw new Error('Unsupported remote graph command');
  if (
    hasSelectionOverride(environment) ||
    Object.keys(environment).some((name) => name.startsWith('PUNI_REMOTE_GRAPH_'))
  )
    throw new Error('Unsupported remote graph selection environment');
  return command;
}

/**
 * Reads exactly the four partition-admission keys and binds their mode/root/executable to the
 * caller's module boundary and complete frozen228 declaration census. Foreign selection refuses.
 * Canonical paths are lexical only: this proves no existence, readability, realpath or resource identity.
 * @throws Error for absent, mixed, unknown or mismatched admission; returns a mode, never a custody receipt.
 */
export function readGraphTestAdmission(
  environment: Readonly<Record<string, string | undefined>>,
  boundary: GraphAdmissionBoundary,
): GraphTestMode {
  const names = Object.keys(environment).filter((name) => name.startsWith('PUNI_REMOTE_GRAPH_'));
  if (
    hasSelectionOverride(environment) ||
    names.length !== GRAPH_ADMISSION_NAMES.length ||
    names.some((name) => !GRAPH_ADMISSION_NAMES.includes(name)) ||
    environment['PUNI_REMOTE_GRAPH_ADMISSION'] !== 'partitioned-228-v1'
  )
    throw new Error('Unsupported graph test admission');
  const mode = environment['PUNI_REMOTE_GRAPH_MODE'];
  if (mode !== 'graph-ordinary' && mode !== 'graph-legacy' && mode !== 'graph-identity')
    throw new Error('Unsupported graph test admission');
  if (
    !isCanonicalPath(boundary.repository) ||
    !isCanonicalPath(boundary.modulePath) ||
    !isCanonicalPath(boundary.executable) ||
    !isCanonicalPath(boundary.requiredExecutable) ||
    environment['PUNI_REMOTE_GRAPH_ROOT'] !== boundary.repository ||
    environment['PUNI_REMOTE_GRAPH_EXECUTABLE'] !== boundary.requiredExecutable ||
    boundary.executable !== boundary.requiredExecutable ||
    boundary.modulePath !==
      join(
        boundary.repository,
        'tools/tool-remote-scripts/src/lib/initial-handoff-graph.test.ts',
      ) ||
    boundary.declaredCount !== 228 ||
    boundary.declaredTitlesSHA256 !== GRAPH_TITLES_SHA256
  )
    throw new Error('Unsupported graph test admission');
  return mode;
}

const PROJECT = 'tools/tool-remote-scripts';
const GRAPH_FILE = 'src/lib/initial-handoff-graph.test.ts';
const NATIVE_CUSTODY_FILE = 'acceptance/dependency-owner-custody.test.ts';
const DISCOVERY = [
  'src',
  'test/edge-init.test.ts',
  'test/solver-drain-transport.test.ts',
  'test/solver-drain-fixture.test.ts',
  'test/source-exclusion-transport.test.ts',
  'test/source-exclusion-topology.test.ts',
  'test/source-exclusion-native.test.ts',
  'test/fixture-failure.test.ts',
];
const PHASES: readonly { readonly mode: GraphTestMode; readonly callbacks: number }[] = [
  { mode: 'graph-ordinary', callbacks: 202 },
  { mode: 'graph-legacy', callbacks: 11 },
  { mode: 'graph-identity', callbacks: 15 },
];
const STREAM_BYTES = 4 * 1024 * 1024;

type StreamOutcome =
  | { readonly status: 'known'; readonly bytes: Buffer; readonly sha256: string }
  | { readonly status: 'unknown'; readonly cause: unknown };
interface OwnedStream {
  readonly stream: ReadableStream<Uint8Array>;
  readonly chunks: Uint8Array[];
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  originalClosed: Promise<void> | undefined;
  closed: Promise<boolean> | undefined;
  task: Promise<StreamOutcome> | undefined;
  bytes: number;
  retainedBytes: number;
  eof: boolean;
  closedKnown: boolean;
  overflow: boolean;
  failure: unknown;
}
function spawnTests(argv: string[], cwd: string, environment: Record<string, string | undefined>) {
  return Bun.spawn(argv, {
    cwd,
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
}
interface OwnedInvocation {
  readonly argv: string[];
  readonly cwd: string;
  readonly environment: Record<string, string | undefined>;
  child: ReturnType<typeof spawnTests> | undefined;
  originalExit: Promise<number> | undefined;
  exit: Promise<PromiseSettledResult<number>> | undefined;
  stdout: OwnedStream | undefined;
  stderr: OwnedStream | undefined;
  readonly failures: unknown[];
}
interface CommandOwner {
  readonly active: OwnedInvocation[];
  readonly completed: OwnedInvocation[];
  readonly failures: unknown[];
  stopped: boolean;
  uncertain: boolean;
  reported: boolean;
  keeper: ReturnType<typeof setInterval> | undefined;
}
interface InvocationCapture {
  readonly original: OwnedInvocation;
  readonly exit: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly stdoutSHA256: string;
  readonly stderrSHA256: string;
}
interface ExecutionReceipt {
  readonly passed: number;
  readonly tests: number;
  readonly files: number;
  readonly titles: readonly string[];
}
interface PhaseReceipt extends ExecutionReceipt {
  readonly mode: GraphTestMode;
  readonly argv: readonly string[];
  readonly stdoutSHA256: string;
  readonly stderrSHA256: string;
}
export class CommandFailure extends Error {
  constructor(readonly status: number) {
    super(`Remote test child exited ${String(status)}`);
  }
}

function keepOriginals(owner: CommandOwner): void {
  owner.keeper ??= setInterval(() => owner, 30_000);
}
function markUnknown(owner: CommandOwner, cause: unknown): void {
  owner.stopped = true;
  owner.uncertain = true;
  owner.failures.push(cause);
  keepOriginals(owner);
}
function holdOriginals(owner: CommandOwner): Promise<never> {
  keepOriginals(owner);
  if (!owner.reported) {
    owner.reported = true;
    try {
      process.stderr.write(
        'Remote test STOP: original process/read custody unknown; no retry or later phase\n',
      );
    } catch (cause) {
      owner.failures.push(cause);
    }
  }
  return new Promise<never>(() => undefined);
}

/** Owns the original pipe before getReader; UNKNOWN never cancels, replaces or retries that reader. */
function retainStream(
  owner: CommandOwner,
  invocation: OwnedInvocation,
  name: 'stdout' | 'stderr',
  stream: ReadableStream<Uint8Array>,
): void {
  const retained: OwnedStream = {
    stream,
    chunks: [],
    reader: undefined,
    originalClosed: undefined,
    closed: undefined,
    task: undefined,
    bytes: 0,
    retainedBytes: 0,
    eof: false,
    closedKnown: false,
    overflow: false,
    failure: undefined,
  };
  invocation[name] = retained;
  try {
    const reader = stream.getReader();
    retained.reader = reader;
    const originalClosed = reader.closed;
    retained.originalClosed = originalClosed;
    retained.closed = originalClosed.then(
      () => {
        retained.closedKnown = true;
        return true;
      },
      (cause: unknown) => {
        retained.failure = cause;
        markUnknown(owner, cause);
        return false;
      },
    );
    const closed = retained.closed;
    retained.task = (async (): Promise<StreamOutcome> => {
      const digest = createHash('sha256');
      try {
        for (;;) {
          const frame = await reader.read();
          if (frame.done) {
            retained.eof = true;
            break;
          }
          const chunk: unknown = frame.value;
          if (!(chunk instanceof Uint8Array))
            throw new Error('Original remote test stream frame absent or malformed');
          retained.bytes += chunk.byteLength;
          digest.update(chunk);
          const remaining = Math.max(0, STREAM_BYTES - retained.retainedBytes);
          if (remaining !== 0) {
            const kept = chunk.slice(0, remaining);
            retained.chunks.push(kept);
            retained.retainedBytes += kept.byteLength;
            process[name].write(kept);
          }
          if (retained.bytes > STREAM_BYTES && !retained.overflow) {
            retained.overflow = true;
            markUnknown(
              owner,
              new Error('Original remote test output exceeded its retained bound'),
            );
          }
        }
        if (!(await closed) || retained.overflow)
          throw new Error('Original remote test stream closure or full output unavailable');
        reader.releaseLock();
        return {
          status: 'known',
          bytes: Buffer.concat(retained.chunks),
          sha256: digest.digest('hex'),
        };
      } catch (cause) {
        retained.failure = cause;
        markUnknown(owner, cause);
        return { status: 'unknown', cause };
      }
    })();
  } catch (cause) {
    retained.failure = cause;
    invocation.failures.push(cause);
    markUnknown(owner, cause);
  }
}

/** Known process/read retirement grants no native Graph-close authority; a nonzero child still fails the command. */
async function invokeTests(
  owner: CommandOwner,
  argv: string[],
  cwd: string,
  environment: Record<string, string | undefined>,
): Promise<InvocationCapture> {
  if (owner.stopped) throw new Error('Remote test composition already stopped');
  const invocation: OwnedInvocation = {
    argv,
    cwd,
    environment,
    child: undefined,
    originalExit: undefined,
    exit: undefined,
    stdout: undefined,
    stderr: undefined,
    failures: [],
  };
  owner.active.push(invocation);
  keepOriginals(owner);
  try {
    invocation.child = spawnTests(argv, cwd, environment);
  } catch (cause) {
    invocation.failures.push(cause);
    markUnknown(owner, cause);
    return holdOriginals(owner);
  }
  const child = invocation.child;
  try {
    child.ref();
  } catch (cause) {
    invocation.failures.push(cause);
    markUnknown(owner, cause);
  }
  try {
    const originalExit = child.exited;
    invocation.originalExit = originalExit;
    invocation.exit = originalExit.then(
      (value): PromiseFulfilledResult<number> => ({ status: 'fulfilled', value }),
      (reason: unknown): PromiseRejectedResult => {
        markUnknown(owner, reason);
        return { status: 'rejected', reason };
      },
    );
  } catch (cause) {
    invocation.failures.push(cause);
    markUnknown(owner, cause);
  }
  try {
    retainStream(owner, invocation, 'stdout', child.stdout);
  } catch (cause) {
    invocation.failures.push(cause);
    markUnknown(owner, cause);
  }
  try {
    retainStream(owner, invocation, 'stderr', child.stderr);
  } catch (cause) {
    invocation.failures.push(cause);
    markUnknown(owner, cause);
  }
  const exit = invocation.exit;
  const stdout = invocation.stdout?.task;
  const stderr = invocation.stderr?.task;
  if (
    exit === undefined ||
    stdout === undefined ||
    stderr === undefined ||
    invocation.failures.length !== 0
  )
    return holdOriginals(owner);
  const [termination, out, err] = await Promise.all([exit, stdout, stderr]);
  if (
    owner.uncertain ||
    termination.status !== 'fulfilled' ||
    out.status !== 'known' ||
    err.status !== 'known' ||
    child.exitCode !== termination.value ||
    child.signalCode !== null
  ) {
    markUnknown(owner, new Error('Original remote test process/read outcomes are not known'));
    return holdOriginals(owner);
  }
  const index = owner.active.indexOf(invocation);
  if (index < 0) {
    markUnknown(owner, new Error('Original remote test owner record absent'));
    return holdOriginals(owner);
  }
  owner.completed.push(invocation);
  owner.active.splice(index, 1);
  if (owner.active.length === 0 && owner.keeper !== undefined) {
    clearInterval(owner.keeper);
    owner.keeper = undefined;
  }
  return {
    original: invocation,
    exit: termination.value,
    stdout: out.bytes,
    stderr: err.bytes,
    stdoutSHA256: out.sha256,
    stderrSHA256: err.sha256,
  };
}

function requireFile(path: string): void {
  const status = lstatSync(path);
  if (!status.isFile() || realpathSync(path) !== path)
    throw new Error('Remote test owner requires canonical regular files');
  accessSync(path, constants.R_OK);
}
function refuseConfiguration(path: string): void {
  try {
    lstatSync(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  }
  throw new Error('Remote test owner does not support Bun configuration overrides');
}
function readText(bytes: Buffer): string {
  return stripVTControlCharacters(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Reads only the contiguous terminal Bun receipt; earlier nested summaries cannot supply it. */
function readReceipt(stderr: Buffer, expectedCallbacks?: number): ExecutionReceipt {
  const text = readText(stderr);
  const summary =
    /(?:^|\n)[ \t]*(\d+) pass\r?\n((?:[ \t]*\d+ (?:skip|todo|filtered out)\r?\n)*)[ \t]*(\d+) fail\r?\n(?:[ \t]*\d+ expect\(\) calls\r?\n)?Ran (\d+) tests? across (\d+) files?\.[^\r\n]*\s*$/.exec(
      text,
    );
  if (summary === null) throw new Error('Remote test child produced no complete terminal receipt');
  const passed = Number(summary[1]);
  const failed = Number(summary[3]);
  const tests = Number(summary[4]);
  const files = Number(summary[5]);
  if (
    ![passed, failed, tests, files].every(Number.isSafeInteger) ||
    passed <= 0 ||
    failed !== 0 ||
    tests < passed ||
    files <= 0
  )
    throw new Error('Remote test child produced no successful nonempty receipt');
  const titles =
    expectedCallbacks === undefined
      ? []
      : [...text.matchAll(/^\(pass\) (.*?)(?: \[[^\]\r\n]+\])?$/gm)].map((match) => match[1]);
  if (
    expectedCallbacks !== undefined &&
    (passed !== expectedCallbacks ||
      tests !== expectedCallbacks ||
      files !== 1 ||
      titles.length !== expectedCallbacks ||
      new Set(titles).size !== expectedCallbacks ||
      /\n[ \t]*[1-9]\d* (?:skip|todo|filtered out)\r?\n/.test(summary[0]))
  )
    throw new Error('Remote graph phase produced an incomplete selected callback receipt');
  return { passed, tests, files, titles };
}

interface GraphReceipt {
  readonly kind: 'remote-graph-composite';
  readonly source: { readonly path: string; readonly sha256: string };
  readonly censusSHA256: string;
  readonly callbacks: number;
  readonly uniqueGraphFiles: 1;
  readonly phases: readonly PhaseReceipt[];
}
interface GraphPartitionReceipt extends Omit<GraphReceipt, 'kind'> {
  readonly kind: 'remote-graph-partition';
}

/** The argument binds this copied module; it cannot select a foreign checkout before file reads or acquisition. */
function bindRepository(repository: string): void {
  const moduleRoot = resolve(import.meta.dir, '../../..');
  if (repository !== moduleRoot || resolve(repository) !== moduleRoot)
    throw new Error('Remote test launcher module/root binding differs');
  const project = join(repository, PROJECT);
  const graph = join(project, GRAPH_FILE);
  const preload = join(repository, 'tools/test/scratch/preload.ts');
  if (
    realpathSync(repository) !== repository ||
    import.meta.path !== join(project, 'test/run-tests.ts')
  )
    throw new Error('Remote test launcher module/root binding differs');
  for (const path of [
    import.meta.path,
    graph,
    preload,
    process.execPath,
    join(repository, '.bun-version'),
  ])
    requireFile(path);
  if (readFileSync(join(repository, '.bun-version'), 'utf8').trim() !== Bun.version)
    throw new Error('Remote test owner requires the pinned Bun version');
  for (const path of [
    join(repository, 'bunfig.toml'),
    join(project, 'bunfig.toml'),
    join(homedir(), '.bunfig.toml'),
  ])
    refuseConfiguration(path);
}

function createCommandOwner(): CommandOwner {
  return {
    active: [],
    completed: [],
    failures: [],
    stopped: false,
    uncertain: false,
    reported: false,
    keeper: undefined,
  };
}

async function runSelectedGraphTests(
  repository: string,
  command: 'graph' | GraphTestMode,
): Promise<GraphReceipt | GraphPartitionReceipt> {
  bindRepository(repository);
  readRemoteTestCommand([command], process.env);
  const graph = join(repository, PROJECT, GRAPH_FILE);
  const graphSHA256 = createHash('sha256').update(readFileSync(graph)).digest('hex');
  const owner = createCommandOwner();
  const baseEnvironment = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
  async function phase(mode: GraphTestMode, callbacks: number): Promise<PhaseReceipt> {
    const argv = [process.execPath, 'test', `./${PROJECT}/${GRAPH_FILE}`, '--timeout=10000'];
    if (mode === 'graph-ordinary') argv.push('--preload', './tools/test/scratch/preload.ts');
    const environment = {
      ...baseEnvironment,
      PUNI_REMOTE_GRAPH_ADMISSION: 'partitioned-228-v1',
      PUNI_REMOTE_GRAPH_MODE: mode,
      PUNI_REMOTE_GRAPH_ROOT: repository,
      PUNI_REMOTE_GRAPH_EXECUTABLE: process.execPath,
    };
    const capture = await invokeTests(owner, argv, repository, environment);
    if (capture.exit !== 0) throw new CommandFailure(capture.exit);
    const receipt = readReceipt(capture.stderr, callbacks);
    if (createHash('sha256').update(readFileSync(graph)).digest('hex') !== graphSHA256)
      throw new Error('Remote graph source epoch changed during composition');
    return {
      mode,
      ...receipt,
      argv,
      stdoutSHA256: capture.stdoutSHA256,
      stderrSHA256: capture.stderrSHA256,
    };
  }
  try {
    const selected =
      command === 'graph' ? PHASES : PHASES.filter((entry) => entry.mode === command);
    const phases: PhaseReceipt[] = [];
    for (const entry of selected) phases.push(await phase(entry.mode, entry.callbacks));
    if (command === 'graph') {
      const names = phases.flatMap((entry) => entry.titles);
      if (
        names.length !== 228 ||
        new Set(names).size !== 228 ||
        createHash('sha256').update(JSON.stringify(names)).digest('hex') !== GRAPH_TITLES_SHA256
      )
        throw new Error('Remote graph composition differs from the frozen228 declaration census');
    }
    return {
      kind: command === 'graph' ? 'remote-graph-composite' : 'remote-graph-partition',
      source: { path: `${PROJECT}/${GRAPH_FILE}`, sha256: graphSHA256 },
      censusSHA256: GRAPH_TITLES_SHA256,
      callbacks: phases.reduce((count, entry) => count + entry.tests, 0),
      uniqueGraphFiles: 1,
      phases,
    };
  } catch (cause) {
    owner.stopped = true;
    owner.failures.push(cause);
    if (owner.uncertain || owner.active.length !== 0) return holdOriginals(owner);
    throw cause;
  }
}

/**
 * Streams three owned graph partitions and returns their validated actual composite without printing it.
 * Repository must bind this module; closed selection/environment, physical files, Bun pin and configuration
 * checks precede every child. Known nonzero throws CommandFailure with the original status; UNKNOWN
 * retains original custody indefinitely and never resolves a receipt or permits a later phase.
 */
export async function runGraphTests(repository: string): Promise<GraphReceipt> {
  const receipt = await runSelectedGraphTests(repository, 'graph');
  if (receipt.kind !== 'remote-graph-composite')
    throw new Error('Remote graph composition did not return the complete graph receipt');
  return receipt;
}

async function runCommand(command: RemoteTestCommand): Promise<void> {
  const repository = resolve(import.meta.dir, '../../..');
  if (command !== 'canonical') {
    const receipt =
      command === 'graph'
        ? await runGraphTests(repository)
        : await runSelectedGraphTests(repository, command);
    console.log(JSON.stringify(receipt));
    return;
  }
  bindRepository(repository);
  readRemoteTestCommand([command], process.env);
  const project = join(repository, PROJECT);
  for (const path of DISCOVERY.slice(1)) requireFile(join(project, path));
  const graphReceipt = await runGraphTests(repository);
  const owner = createCommandOwner();
  try {
    const argv = [
      process.execPath,
      'test',
      ...DISCOVERY,
      '--preload',
      '../test/scratch/preload.ts',
      '--timeout=10000',
      `--path-ignore-patterns=${GRAPH_FILE}`,
      // Proof: omitting this literal ran the native custody marker; widening it
      // to acceptance/* hid the ordinary collision marker and failed the census.
      `--path-ignore-patterns=${NATIVE_CUSTODY_FILE}`,
    ];
    const remainder = await invokeTests(owner, argv, project, { ...process.env });
    if (remainder.exit !== 0) throw new CommandFailure(remainder.exit);
    const remainderReceipt = readReceipt(remainder.stderr);
    console.log(
      JSON.stringify({
        kind: 'remote-canonical-tests',
        graph: graphReceipt,
        remainder: {
          ...remainderReceipt,
          argv,
          stdoutSHA256: remainder.stdoutSHA256,
          stderrSHA256: remainder.stderrSHA256,
        },
      }),
    );
  } catch (cause) {
    owner.stopped = true;
    owner.failures.push(cause);
    if (owner.uncertain || owner.active.length !== 0) return holdOriginals(owner);
    throw cause;
  }
}

if (import.meta.main) {
  try {
    await runCommand(readRemoteTestCommand(process.argv.slice(2), process.env));
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    process.stderr.write(cause.message + '\n');
    process.exitCode = cause instanceof CommandFailure ? cause.status : 1;
  }
}
