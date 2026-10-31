import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import { constants, fstatSync } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { link, lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { assertNoEdgeOwner } from './edge-admission';
import type { EdgePolicyOriginIdentity, EdgePolicyOriginReceipt } from './edge-policy';
import { readOrdinaryEdgePolicy } from './edge-policy';
import { withExistingCanonicalLock } from './lock';
import { readClosed, readInteger, readString } from './managed-cohort';

interface SolverReaderOrigin {
  readonly state: string;
  readonly receiptPath: string;
  readonly attemptId: string;
}

function decodeIdentity(value: unknown, path: string, policy = false): EdgePolicyOriginIdentity {
  const fields = readClosed(value, [
    'path',
    'device',
    'inode',
    'mode',
    'uid',
    'gid',
    ...(policy ? ['contents', 'byteLength', 'sha256'] : []),
  ]);
  if (fields['path'] !== path) throw new Error('original receipt path differs');
  const device = readString(fields['device']);
  const inode = readString(fields['inode']);
  if (!/^(0|[1-9][0-9]*)$/.test(device) || !/^[1-9][0-9]*$/.test(inode))
    throw new Error('invalid original identity integer');
  const mode = readInteger(fields['mode']);
  if (mode > 0o7777) throw new Error('invalid original identity mode');
  return {
    path,
    device,
    inode,
    mode,
    uid: readInteger(fields['uid']),
    gid: readInteger(fields['gid']),
  };
}

/** Consumes only the producer's closed original observations, never a post-exit pathname baseline. */
function decodeOrigin(value: unknown, expected: SolverReaderOrigin): EdgePolicyOriginReceipt {
  const fields = readClosed(value, [
    'format',
    'version',
    'attemptId',
    'edgeState',
    'parent',
    'lock',
    'policy',
  ]);
  if (
    fields['format'] !== 'edge-policy-origin-receipt' ||
    fields['version'] !== 1 ||
    fields['attemptId'] !== expected.attemptId ||
    fields['edgeState'] !== expected.state
  )
    throw new Error('original receipt invocation differs');
  const policy = readClosed(fields['policy'], [
    'path',
    'device',
    'inode',
    'mode',
    'uid',
    'gid',
    'contents',
    'byteLength',
    'sha256',
  ]);
  const contents = `${JSON.stringify({ format: 'dependency-edge-policy', version: 1, phase: 'ordinary', edgeState: expected.state })}\n`;
  const sha256 = createHash('sha256').update(contents).digest('hex');
  if (
    policy['contents'] !== contents ||
    policy['byteLength'] !== Buffer.byteLength(contents) ||
    policy['sha256'] !== sha256
  )
    throw new Error('original ordinary policy bytes differ');
  return {
    format: 'edge-policy-origin-receipt',
    version: 1,
    attemptId: expected.attemptId,
    edgeState: expected.state,
    parent: decodeIdentity(fields['parent'], expected.state),
    lock: decodeIdentity(fields['lock'], join(expected.state, 'edge.lock')),
    policy: {
      ...decodeIdentity(policy, join(expected.state, 'edge-policy.json'), true),
      contents,
      byteLength: Buffer.byteLength(contents),
      sha256,
    },
  };
}

function assertIdentity(
  status: BigIntStats,
  expected: EdgePolicyOriginIdentity,
  directory = false,
): void {
  if (
    (directory ? !status.isDirectory() : !status.isFile()) ||
    String(status.dev) !== expected.device ||
    String(status.ino) !== expected.inode ||
    Number(status.mode & 0o7777n) !== expected.mode ||
    status.uid !== BigInt(expected.uid) ||
    status.gid !== BigInt(expected.gid)
  )
    throw new Error(`original identity changed: ${expected.path}`);
}

async function readPrivateReceipt(expected: SolverReaderOrigin): Promise<EdgePolicyOriginReceipt> {
  const parent = await lstat(dirname(expected.receiptPath), { bigint: true });
  const uid = process.getuid?.();
  if (
    uid === undefined ||
    !parent.isDirectory() ||
    (parent.mode & 0o7777n) !== 0o700n ||
    parent.uid !== BigInt(uid) ||
    (await realpath(dirname(expected.receiptPath))) !== dirname(expected.receiptPath)
  )
    throw new Error('original receipt requires owned private parent');
  const descriptor = await open(
    expected.receiptPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat({ bigint: true });
    if (
      !status.isFile() ||
      (status.mode & 0o7777n) !== 0o600n ||
      status.uid !== BigInt(uid) ||
      status.size < 1n ||
      status.size > 16384n
    )
      throw new Error('original receipt must be bounded private owned regular file');
    const bytes = Buffer.alloc(16385);
    const { bytesRead } = await descriptor.read(bytes, 0, bytes.length, 0);
    if (BigInt(bytesRead) !== status.size)
      throw new Error('original receipt changed while reading');
    const current = await lstat(expected.receiptPath, { bigint: true });
    const final = await descriptor.stat({ bigint: true });
    for (const observation of [current, final]) {
      if (
        observation.dev !== status.dev ||
        observation.ino !== status.ino ||
        observation.mode !== status.mode ||
        observation.uid !== status.uid ||
        observation.gid !== status.gid ||
        observation.size !== status.size
      )
        throw new Error('original receipt identity changed');
    }
    const namedParent = await lstat(dirname(expected.receiptPath), { bigint: true });
    if (
      parent.dev !== namedParent.dev ||
      parent.ino !== namedParent.ino ||
      parent.mode !== namedParent.mode ||
      parent.uid !== namedParent.uid ||
      parent.gid !== namedParent.gid
    )
      throw new Error('original receipt parent changed');
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead)),
    );
    return decodeOrigin(value, expected);
  } finally {
    await descriptor.close();
  }
}

async function assertOrigin(receipt: EdgePolicyOriginReceipt, descriptor: number): Promise<void> {
  if ((await realpath(receipt.edgeState)) !== receipt.edgeState)
    throw new Error('original state alias changed');
  assertIdentity(await lstat(receipt.edgeState, { bigint: true }), receipt.parent, true);
  await readdir(receipt.edgeState);
  assertIdentity(fstatSync(descriptor, { bigint: true }), receipt.lock);
  assertIdentity(await lstat(receipt.lock.path, { bigint: true }), receipt.lock);
  assertIdentity(await lstat(receipt.policy.path, { bigint: true }), receipt.policy);
  const policy = await open(
    receipt.policy.path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    assertIdentity(await policy.stat({ bigint: true }), receipt.policy);
    const bytes = Buffer.alloc(4097);
    const { bytesRead } = await policy.read(bytes, 0, bytes.length, 0);
    if (!bytes.subarray(0, bytesRead).equals(Buffer.from(receipt.policy.contents)))
      throw new Error('original policy bytes changed');
    assertIdentity(await policy.stat({ bigint: true }), receipt.policy);
    assertIdentity(await lstat(receipt.policy.path, { bigint: true }), receipt.policy);
  } finally {
    await policy.close();
  }
  await readOrdinaryEdgePolicy(receipt.edgeState);
  await assertNoEdgeOwner(receipt.edgeState);
  assertIdentity(await lstat(receipt.edgeState, { bigint: true }), receipt.parent, true);
}

/** Exact attended input pins; selection records scope and grants no reusable admission. */
export interface SolverReaderArtifact {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}
export interface SolverReaderSelection {
  readonly target: {
    readonly hostname: string;
    readonly account: { readonly name: string; readonly uid: number; readonly gid: number };
    readonly freshness: 'independently-designated-fresh';
  };
  readonly bun: SolverReaderArtifact;
  readonly reader: SolverReaderArtifact;
  readonly initializer: SolverReaderArtifact;
}
/** Production constructs canonical paths; isolated layouts are a local test construction seam. */
export interface SolverReaderLayout {
  readonly state: string;
  readonly staging: string;
  readonly bun: string;
  readonly reader: string;
}

/** Closed attended selection boundary. Observations record scope, never issue authorization. */
function readSolverReaderSelection(value: unknown): SolverReaderSelection {
  const fields = readClosed(value, ['target', 'bun', 'reader', 'initializer']);
  const target = readClosed(fields['target'], ['hostname', 'account', 'freshness']);
  const account = readClosed(target['account'], ['name', 'uid', 'gid']);
  if (target['freshness'] !== 'independently-designated-fresh')
    throw new Error(
      'first-reader preparation requires independently designated fresh target scope',
    );
  const hostname = readString(target['hostname']);
  const name = readString(account['name']);
  if (!/^[a-zA-Z0-9._-]{1,253}$/.test(hostname) || !/^[a-z_][a-z0-9_-]*[$]?$/.test(name))
    throw new Error('invalid independently selected target/account');
  const artifact = (input: unknown): SolverReaderArtifact => {
    const pin = readClosed(input, ['path', 'sha256', 'byteLength']);
    const path = readString(pin['path']);
    const sha256 = readString(pin['sha256']);
    const byteLength = readInteger(pin['byteLength']);
    if (
      !isAbsolute(path) ||
      resolve(path) !== path ||
      path.includes('\0') ||
      !/^[0-9a-f]{64}$/.test(sha256) ||
      byteLength < 1 ||
      byteLength > 536870912
    )
      throw new Error('invalid preselected artifact pin');
    return { path, sha256, byteLength };
  };
  return {
    target: {
      hostname,
      account: { name, uid: readInteger(account['uid']), gid: readInteger(account['gid']) },
      freshness: 'independently-designated-fresh',
    },
    bun: artifact(fields['bun']),
    reader: artifact(fields['reader']),
    initializer: artifact(fields['initializer']),
  };
}

/** Adds domain context to the single closed external selection boundary. */
export function decodeSolverReaderSelection(value: unknown): SolverReaderSelection {
  try {
    return readSolverReaderSelection(value);
  } catch (cause) {
    throw new Error(
      `invalid first-reader independently selected closed inputs: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

export interface SolverReaderArtifactObservation {
  readonly artifact: SolverReaderArtifact;
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly uid: string;
  readonly gid: string;
}

/** Hashes only the already opened regular descriptor, checking its named identity before/after. */
export async function captureSolverReaderArtifact(
  path: string,
): Promise<SolverReaderArtifactObservation> {
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat({ bigint: true });
    if (!status.isFile() || status.size < 1n || status.size > 536870912n)
      throw new Error(`invalid opened artifact: ${path}`);
    if (!sameIdentity(status, await lstat(path, { bigint: true })))
      throw new Error(`opened artifact name differs: ${path}`);
    const digest = createHash('sha256');
    const bytes = Buffer.alloc(65536);
    let length = 0;
    for (;;) {
      const { bytesRead } = await descriptor.read(bytes, 0, bytes.length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
      if (BigInt(length) > status.size) throw new Error(`opened artifact grew: ${path}`);
      digest.update(bytes.subarray(0, bytesRead));
    }
    for (const current of [
      await descriptor.stat({ bigint: true }),
      await lstat(path, { bigint: true }),
    ]) {
      if (
        !sameIdentity(status, current) ||
        current.size !== status.size ||
        BigInt(length) !== status.size
      )
        throw new Error(`opened artifact changed: ${path}`);
    }
    return {
      artifact: { path, sha256: digest.digest('hex'), byteLength: length },
      device: String(status.dev),
      inode: String(status.ino),
      mode: Number(status.mode & 0o7777n),
      uid: String(status.uid),
      gid: String(status.gid),
    };
  } finally {
    await descriptor.close();
  }
}

async function assertAbsent(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  }
  throw new Error(`first-reader preparation refuses existing state: ${path}`);
}

async function assertDirectory(
  path: string,
  uid: number,
  privateMode = false,
): Promise<BigIntStats> {
  const status = await lstat(path, { bigint: true });
  if (
    !status.isDirectory() ||
    (await realpath(path)) !== path ||
    status.uid !== BigInt(uid) ||
    (privateMode && (status.mode & 0o7777n) !== 0o700n)
  )
    throw new Error(`invalid preparation directory: ${path}`);
  await readdir(path);
  return status;
}

function sameIdentity(first: BigIntStats, second: BigIntStats): boolean {
  return (
    first.dev === second.dev &&
    first.ino === second.ino &&
    first.mode === second.mode &&
    first.uid === second.uid &&
    first.gid === second.gid
  );
}

async function readBounded(descriptor: FileHandle, maximum: number): Promise<Buffer> {
  const bytes = Buffer.alloc(maximum + 1);
  let length = 0;
  while (length < bytes.length) {
    const { bytesRead } = await descriptor.read(bytes, length, bytes.length - length, length);
    if (bytesRead === 0) break;
    length += bytesRead;
  }
  if (length > maximum) throw new Error('artifact grew beyond its approved byte bound');
  return bytes.subarray(0, length);
}

async function readArtifact(
  artifact: SolverReaderArtifact,
  uid: number,
  installed?: BigIntStats,
): Promise<BigIntStats> {
  if (
    !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
    !Number.isSafeInteger(artifact.byteLength) ||
    artifact.byteLength < 1 ||
    artifact.byteLength > 536870912
  )
    throw new Error('invalid preselected artifact pin');
  const descriptor = await open(
    artifact.path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat({ bigint: true });
    if (
      !status.isFile() ||
      status.uid !== BigInt(uid) ||
      status.size !== BigInt(artifact.byteLength) ||
      (installed !== undefined &&
        (!sameIdentity(status, installed) || (status.mode & 0o7777n) !== 0o755n))
    )
      throw new Error(`artifact identity, mode or size differs: ${artifact.path}`);
    const bytes = await readBounded(descriptor, artifact.byteLength);
    if (
      bytes.length !== artifact.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== artifact.sha256
    )
      throw new Error(`artifact hash differs: ${artifact.path}`);
    for (const observation of [
      await descriptor.stat({ bigint: true }),
      await lstat(artifact.path, { bigint: true }),
    ]) {
      if (!sameIdentity(status, observation) || observation.size !== status.size)
        throw new Error(`artifact changed during readback: ${artifact.path}`);
    }
    return status;
  } finally {
    await descriptor.close();
  }
}

/** Fixed local engineering limits; test clocks cannot alter production values. */
const READER_PROFILE = {
  operation: 180000,
  execution: 30000,
  observation: 15000,
  launchReserve: 45000,
  retained: 1048576,
  excerpt: 8192,
} as const;

/** Monotonic test construction only; production uses performance.now and real timers. */
export interface SolverReaderClock {
  now(): number;
  pause(milliseconds: number): Promise<void>;
}
export interface SolverReaderConstruction {
  readonly clock?: SolverReaderClock;
  /** May inject an observation error after a real pipe read; cannot provide EOF or exit evidence. */
  readonly afterRead?: (stream: 'stdout' | 'stderr') => void;
  /** Observes a detached scalar snapshot only; return/failure cannot control custody or admission. */
  readonly disposition?: (snapshot: SolverReaderDisposition) => void;
}
export interface SolverReaderDisposition {
  readonly waitSettled: boolean;
  readonly waitFailed: boolean;
  readonly stdoutEof: boolean;
  readonly stdoutFailed: boolean;
  readonly stderrEof: boolean;
  readonly stderrFailed: boolean;
}
export type SolverReaderTapObservation =
  | { readonly status: 'observed' }
  | { readonly status: 'observer-failed'; readonly diagnostic: 'written' | 'unavailable' };

/**
 * Test-construction observation boundary; a detached read-only scalar snapshot grants no authority.
 * Tap return is ignored. A tap or diagnostic failure is explicitly unavailable evidence and
 * never changes actual child/EOF/deadline state, refusal, cleanup, lock lifetime or HOLD.
 */
export function observeSolverReaderDisposition(
  tap: (snapshot: SolverReaderDisposition) => void,
  snapshot: SolverReaderDisposition,
  emit: (message: string) => void = (message) => {
    console.error(message);
  },
): SolverReaderTapObservation {
  try {
    tap(Object.freeze({ ...snapshot }));
    return { status: 'observed' };
  } catch {
    try {
      emit('[first-reader] construction disposition observer failed; proof witness unavailable');
      return { status: 'observer-failed', diagnostic: 'written' };
    } catch {
      return { status: 'observer-failed', diagnostic: 'unavailable' };
    }
  }
}

const READER_CLOCK: SolverReaderClock = {
  now: () => performance.now(),
  pause: (milliseconds) => Bun.sleep(milliseconds),
};
interface ReaderOutput {
  readonly code: number;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}
interface StreamObservation {
  eof: boolean;
  failure: unknown;
  failed: boolean;
  bytes: bigint;
  retained: number;
  chunks: Uint8Array[];
}

/** Actual EOF is the only successful reader outcome; a failed read remains live HOLD. */
async function drainReaderStream(
  stream: ReadableStream<Uint8Array>,
  observation: StreamObservation,
  afterRead?: () => void,
): Promise<void> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const chunk = await reader.read();
      afterRead?.();
      if (chunk.done) {
        observation.eof = true;
        return;
      }
      observation.bytes += BigInt(chunk.value.byteLength);
      const remaining = READER_PROFILE.retained - observation.retained;
      if (remaining > 0) {
        const retained = chunk.value.slice(0, remaining);
        observation.chunks.push(retained);
        observation.retained += retained.byteLength;
      }
    }
  } catch (cause) {
    // Read failure is an explicitly modeled permanent unknown, never manufactured EOF.
    observation.failed = true;
    observation.failure = cause;
  } finally {
    reader.releaseLock();
  }
}

function renderReaderStream(observation: StreamObservation, diagnostic = false): string {
  return Buffer.concat(observation.chunks)
    .subarray(0, diagnostic ? READER_PROFILE.excerpt : observation.retained)
    .toString('utf8');
}

/**
 * Observes original wait and both actual EOFs without racing them with release or cleanup.
 * Cutoffs and overflow close admission. Unknown observations keep this original owner live;
 * late original settlement permits refusal only. No signal, retry or replacement is issued.
 */
async function observeReaderChild(
  child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>,
  execution: number,
  clock: SolverReaderClock,
  operationDeadline?: number,
  afterRead?: (stream: 'stdout' | 'stderr') => void,
  disposition?: (snapshot: SolverReaderDisposition) => void,
): Promise<ReaderOutput> {
  const started = clock.now();
  const cutoff = started + execution;
  const stdout: StreamObservation = {
    eof: false,
    failure: undefined,
    failed: false,
    bytes: 0n,
    retained: 0,
    chunks: [],
  };
  const stderr: StreamObservation = {
    eof: false,
    failure: undefined,
    failed: false,
    bytes: 0n,
    retained: 0,
    chunks: [],
  };
  const outputTask = drainReaderStream(
    child.stdout,
    stdout,
    afterRead === undefined
      ? undefined
      : () => {
          afterRead('stdout');
        },
  );
  const errorTask = drainReaderStream(
    child.stderr,
    stderr,
    afterRead === undefined
      ? undefined
      : () => {
          afterRead('stderr');
        },
  );
  const settlement: { exit?: { code: number; observedAt: number }; waitFailed: boolean } = {
    waitFailed: false,
  };
  const waitTask = child.exited.then(
    (code) => {
      settlement.exit = { code, observedAt: clock.now() };
    },
    () => {
      settlement.waitFailed = true;
    },
  );
  let expired = false;
  let announcedHold = false;
  for (;;) {
    if (disposition !== undefined)
      observeSolverReaderDisposition(disposition, {
        waitSettled: settlement.exit !== undefined,
        waitFailed: settlement.waitFailed,
        stdoutEof: stdout.eof,
        stdoutFailed: stdout.failed,
        stderrEof: stderr.eof,
        stderrFailed: stderr.failed,
      });
    const now = clock.now();
    const exit = settlement.exit;
    if (
      (exit === undefined && now >= cutoff) ||
      (exit !== undefined && exit.observedAt >= cutoff) ||
      (operationDeadline !== undefined && now >= operationDeadline)
    )
      expired = true;
    const observationStart = exit === undefined ? cutoff : Math.min(exit.observedAt, cutoff);
    if (now >= observationStart + READER_PROFILE.observation) expired = true;
    if (
      !announcedHold &&
      (settlement.waitFailed ||
        stdout.failed ||
        stderr.failed ||
        (now >= observationStart + READER_PROFILE.observation &&
          (exit === undefined || !stdout.eof || !stderr.eof)))
    ) {
      announcedHold = true;
      console.error(
        '[first-reader] HOLD: original wait or actual EOF remains unknown; retain original operation/lock and partial state; no cleanup, retry or inverse',
      );
    }
    if (!settlement.waitFailed && exit !== undefined && stdout.eof && stderr.eof) {
      await waitTask;
      await outputTask;
      await errorTask;
      if (
        expired ||
        stdout.bytes > BigInt(READER_PROFILE.retained) ||
        stderr.bytes > BigInt(READER_PROFILE.retained) ||
        exit.code !== 0 ||
        child.signalCode !== null
      ) {
        throw new Error(
          `first-reader child failed: exit=${String(exit.code)} signal=${String(child.signalCode)} expired=${String(expired)} stdoutBytes=${String(stdout.bytes)} stderrBytes=${String(stderr.bytes)} stdoutTruncated=${String(stdout.bytes > BigInt(stdout.retained))} stderrTruncated=${String(stderr.bytes > BigInt(stderr.retained))}; stderr=${renderReaderStream(stderr, true)}; stdout=${renderReaderStream(stdout, true)}`,
        );
      }
      return {
        code: exit.code,
        signal: child.signalCode,
        stdout: renderReaderStream(stdout),
        stderr: renderReaderStream(stderr),
      };
    }
    // Failed wait/read never reaches EOF. Preserve tasks, descriptor and partial state for attended disposition.
    await clock.pause(10);
  }
}

/** Bounded first-reader transport only; local SSH settlement never proves a failed remote operation settled. */
export async function runSolverReaderTransport(
  argv: readonly string[],
  finalOperation: boolean,
  clock: SolverReaderClock = READER_CLOCK,
): Promise<ReaderOutput> {
  const child = Bun.spawn([...argv], { stdio: ['ignore', 'pipe', 'pipe'] });
  return observeReaderChild(child, finalOperation ? 210000 : 60000, clock);
}

async function runReaderChild(
  argv: readonly string[],
  state: string,
  clock: SolverReaderClock,
  deadline: number,
  descriptor?: number,
  afterRead?: (stream: 'stdout' | 'stderr') => void,
  disposition?: (snapshot: SolverReaderDisposition) => void,
): Promise<void> {
  if (deadline - clock.now() < READER_PROFILE.launchReserve)
    throw new Error('first-reader operation lacks the required child settlement reserve');
  const environment: NodeJS.ProcessEnv = { ...process.env, WBS_EDGE_STATE: state };
  delete environment['WBS_EDGE_LOCK_FD'];
  if (descriptor !== undefined) environment['WBS_EDGE_LOCK_FD'] = '3';
  const child = Bun.spawn([...argv], {
    env: environment,
    stdio:
      descriptor === undefined
        ? ['ignore', 'pipe', 'pipe']
        : ['ignore', 'pipe', 'pipe', descriptor],
  });
  await observeReaderChild(
    child,
    READER_PROFILE.execution,
    clock,
    deadline,
    afterRead,
    disposition,
  );
}

/** Validates ancestry before creating only the minimal selected canonical parent. */
async function ensureParent(path: string, uid: number, checkpoint: () => void): Promise<void> {
  const parent = dirname(path);
  const components = parent.split('/').filter((component) => component !== '');
  let current = '';
  for (const component of components) {
    current += `/${component}`;
    let status: BigIntStats;
    try {
      status = await lstat(current, { bigint: true });
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      checkpoint();
      await mkdir(current, { mode: 0o755 });
      status = await lstat(current, { bigint: true });
    }
    if (
      !status.isDirectory() ||
      (await realpath(current)) !== current ||
      (status.uid !== 0n && status.uid !== BigInt(uid))
    )
      throw new Error(`invalid destination ancestry: ${current}`);
  }
  await assertDirectory(parent, uid);
}

/**
 * Initializes exactly once, retains original custody/receipt privately, then publishes only Bun and reader.
 * Observe is a test-construction fault seam after real boundaries; it supplies no evidence or admission.
 * Failures retain policy and published files; there is no receipt-only resume API or automatic inverse.
 */
export async function prepareSolverReader(
  input: unknown,
  layout: SolverReaderLayout,
  observe?: (boundary: string) => Promise<void>,
  construction: SolverReaderConstruction = {},
): Promise<void> {
  const clock = construction.clock ?? READER_CLOCK;
  const deadline = clock.now() + READER_PROFILE.operation;
  const checkpoint = () => {
    if (clock.now() >= deadline) throw new Error('first-reader operation deadline expired');
  };
  const selection = decodeSolverReaderSelection(input);
  const account = userInfo();
  if (
    selection.target.hostname !== hostname() ||
    selection.target.account.name !== account.username ||
    selection.target.account.uid !== account.uid ||
    selection.target.account.gid !== account.gid
  )
    throw new Error('independently selected fresh target/account differs');
  for (const path of [layout.state, layout.staging, layout.bun, layout.reader]) {
    if (!isAbsolute(path) || resolve(path) !== path || path.includes('\0'))
      throw new Error('preparation paths must be canonical absolute paths');
  }
  if (layout.bun === layout.reader || dirname(layout.bun) !== dirname(layout.reader))
    throw new Error('preparation requires distinct fixed reader destinations in one parent');
  const uid = account.uid;
  const stagingParent = await assertDirectory(layout.staging, uid, true);
  for (const artifact of [selection.bun, selection.reader, selection.initializer]) {
    if (dirname(artifact.path) !== layout.staging)
      throw new Error('artifact is outside invocation staging');
    await readArtifact(artifact, uid);
  }
  checkpoint();
  await ensureParent(join(layout.state, 'edge-policy.json'), uid, checkpoint);
  checkpoint();
  const originalParent = await assertDirectory(layout.state, uid);
  for (const path of [
    join(layout.state, 'edge-policy.json'),
    join(layout.state, 'edge-owner.json'),
    join(layout.state, 'edge-owner.pending'),
    layout.bun,
    layout.reader,
  ])
    await assertAbsent(path);
  const attemptId = crypto.randomUUID();
  const receiptPath = join(layout.staging, `origin-${attemptId}.json`);
  await runReaderChild(
    [
      selection.bun.path,
      selection.initializer.path,
      '--execute',
      `--origin-receipt=${receiptPath}`,
      `--attempt-id=${attemptId}`,
    ],
    layout.state,
    clock,
    deadline,
    undefined,
    construction.afterRead,
    construction.disposition,
  );
  await observe?.('initialized');
  if (!sameIdentity(stagingParent, await assertDirectory(layout.staging, uid, true)))
    throw new Error('original receipt staging parent changed');
  const receipt = await readPrivateReceipt({ state: layout.state, receiptPath, attemptId });
  assertIdentity(originalParent, receipt.parent, true);
  if (
    receipt.policy.mode !== 0o600 ||
    receipt.policy.uid !== uid ||
    receipt.parent.uid !== uid ||
    receipt.lock.uid !== uid
  )
    throw new Error('original policy ownership or privacy differs');
  await withExistingCanonicalLock(join(layout.state, 'edge.lock'), async (descriptor) => {
    await assertOrigin(receipt, descriptor);
    for (const path of [layout.bun, layout.reader]) await assertAbsent(path);
    for (const artifact of [selection.bun, selection.reader, selection.initializer])
      await readArtifact(artifact, uid);
    await runReaderChild(
      [selection.bun.path, selection.reader.path, '--check-edge-policy'],
      layout.state,
      clock,
      deadline,
      descriptor,
      construction.afterRead,
      construction.disposition,
    );
    await observe?.('staged');
    await assertOrigin(receipt, descriptor);
    checkpoint();
    await ensureParent(layout.bun, uid, checkpoint);
    checkpoint();
    const parent = await assertDirectory(dirname(layout.bun), uid);
    const directory = await open(
      dirname(layout.bun),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    interface Sibling {
      artifact: SolverReaderArtifact;
      identity: BigIntStats;
      published: boolean;
    }
    const siblings: [Sibling | undefined, Sibling | undefined] = [undefined, undefined];
    const failures: unknown[] = [];
    try {
      const assertParent = async () => {
        if (
          !sameIdentity(parent, await directory.stat({ bigint: true })) ||
          !sameIdentity(parent, await assertDirectory(dirname(layout.bun), uid))
        )
          throw new Error('destination parent identity changed');
      };
      for (const [index, artifact] of [selection.bun, selection.reader].entries()) {
        checkpoint();
        await assertParent();
        checkpoint();
        const name = `.reader-${attemptId}-${String(index)}`;
        const siblingPath = join(dirname(layout.bun), name);
        const sibling = await open(
          siblingPath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        try {
          const source = await open(
            artifact.path,
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          );
          try {
            const status = await source.stat({ bigint: true });
            if (!status.isFile() || status.size !== BigInt(artifact.byteLength))
              throw new Error('staged artifact changed before copy');
            const bytes = await readBounded(source, artifact.byteLength);
            checkpoint();
            await sibling.writeFile(bytes);
          } finally {
            await source.close();
          }
          checkpoint();
          await sibling.chmod(0o755);
          await sibling.sync();
          const prepared = {
            artifact: { ...artifact, path: siblingPath },
            identity: await sibling.stat({ bigint: true }),
            published: false,
          };
          siblings[index] = prepared;
          await readArtifact(prepared.artifact, uid, prepared.identity);
        } finally {
          await sibling.close();
        }
      }
      checkpoint();
      await observe?.('siblings');
      await assertOrigin(receipt, descriptor);
      await assertParent();
      for (const path of [layout.bun, layout.reader]) await assertAbsent(path);
      for (const sibling of siblings) {
        if (sibling === undefined) throw new Error('missing prepared sibling');
        await readArtifact(sibling.artifact, uid, sibling.identity);
      }
      for (const [index, destination] of [layout.bun, layout.reader].entries()) {
        const sibling = siblings.at(index);
        if (sibling === undefined) throw new Error('missing prepared sibling');
        await assertOrigin(receipt, descriptor);
        await assertParent();
        checkpoint();
        await readArtifact(sibling.artifact, uid, sibling.identity);
        await assertParent();
        checkpoint();
        // Exclusive link has no replacement or EXDEV copy fallback. Descriptor-relative paths pin the parent.
        await link(
          `/proc/self/fd/${String(directory.fd)}/${basename(sibling.artifact.path)}`,
          `/proc/self/fd/${String(directory.fd)}/${basename(destination)}`,
        );
        sibling.published = true;
        await directory.sync();
        await readArtifact({ ...sibling.artifact, path: destination }, uid, sibling.identity);
        await assertParent();
        await observe?.(index === 0 ? 'published-bun' : 'published-reader');
      }
      const bun = siblings.at(0);
      const reader = siblings.at(1);
      if (bun === undefined || reader === undefined)
        throw new Error('missing installed pair evidence');
      await readArtifact({ ...selection.bun, path: layout.bun }, uid, bun.identity);
      await readArtifact({ ...selection.reader, path: layout.reader }, uid, reader.identity);
      await assertOrigin(receipt, descriptor);
      await runReaderChild(
        [layout.bun, layout.reader, '--check-edge-policy-inherited'],
        layout.state,
        clock,
        deadline,
        descriptor,
        construction.afterRead,
        construction.disposition,
      );
      await observe?.('installed');
      await readArtifact({ ...selection.bun, path: layout.bun }, uid, bun.identity);
      await readArtifact({ ...selection.reader, path: layout.reader }, uid, reader.identity);
      await assertOrigin(receipt, descriptor);
      await assertParent();
      for (const sibling of siblings) {
        if (sibling === undefined) throw new Error('missing published sibling');
        const relative = `/proc/self/fd/${String(directory.fd)}/${basename(sibling.artifact.path)}`;
        if (!sameIdentity(await lstat(relative, { bigint: true }), sibling.identity))
          throw new Error('published sibling alias identity changed');
        await unlink(relative);
      }
      await directory.sync();
      await assertParent();
      await assertOrigin(receipt, descriptor);
      checkpoint();
    } catch (cause) {
      failures.push(cause);
    }
    for (const sibling of siblings) {
      if (sibling === undefined || sibling.published) continue;
      try {
        const relative = `/proc/self/fd/${String(directory.fd)}/${basename(sibling.artifact.path)}`;
        const current = await lstat(relative, { bigint: true });
        if (!sameIdentity(current, sibling.identity))
          throw new Error('owned unpublished sibling identity changed; retained for inspection');
        await unlink(relative);
      } catch (cause) {
        failures.push(cause);
      }
    }
    try {
      await directory.close();
    } catch (cause) {
      failures.push(cause);
    }
    if (failures.length !== 0)
      throw new AggregateError(
        failures,
        `first-reader preparation refused; primary/cleanup failures: ${failures.map((cause) => (cause instanceof Error ? cause.message : String(cause))).join('; ')}`,
      );
  });
}

/** Returns the exact opened source bytes supplied to the compiler and their stable descriptor observation. */
export async function readSolverReaderBuildInput(
  path: string,
): Promise<{ observation: SolverReaderArtifactObservation; bytes: Uint8Array }> {
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat({ bigint: true });
    if (!status.isFile() || status.size < 1n || status.size > 536870912n)
      throw new Error(`invalid build file: ${path}`);
    const bytes = await readBounded(descriptor, Number(status.size));
    for (const current of [
      await descriptor.stat({ bigint: true }),
      await lstat(path, { bigint: true }),
    ]) {
      if (
        !sameIdentity(status, current) ||
        current.size !== status.size ||
        BigInt(bytes.byteLength) !== status.size
      )
        throw new Error(`build input changed while reading: ${path}`);
    }
    return {
      bytes,
      observation: {
        artifact: {
          path,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          byteLength: bytes.byteLength,
        },
        device: String(status.dev),
        inode: String(status.ino),
        mode: Number(status.mode & 0o7777n),
        uid: String(status.uid),
        gid: String(status.gid),
      },
    };
  } finally {
    await descriptor.close();
  }
}
