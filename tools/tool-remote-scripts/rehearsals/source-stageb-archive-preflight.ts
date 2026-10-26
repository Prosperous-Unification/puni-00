import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, lstat, open, readFile, realpath } from 'node:fs/promises';
import { posix } from 'node:path';
import type { Readable } from 'node:stream';
import { isProxy } from 'node:util/types';

import {
  inspectSourceInputs,
  type SourceInputInspection,
  type SourceInputs,
} from './source-stageb-inputs';
import {
  appendSourceIntent,
  dispatchSourceIntent,
  inspectSourceJournal,
  type RecordedResource,
  recordSourceObservation,
  recordSourceUncertainty,
  type SourceDispatch,
  type SourceJournal,
} from './source-stageb-journal';

declare const SOURCE_STAGEB_ARCHIVE_POLICY_LITERAL: string;
const embeddedPolicy =
  typeof SOURCE_STAGEB_ARCHIVE_POLICY_LITERAL === 'undefined'
    ? undefined
    : SOURCE_STAGEB_ARCHIVE_POLICY_LITERAL;
const plaintext = 'source-stageb-age-preflight-v1\n';
interface Policy {
  readonly format: 'source-stageb-archive-policy';
  readonly version: 1;
  readonly container: {
    readonly format: 'source-stageb-private-archive';
    readonly version: 1;
    readonly indexFormat: 'source-stageb-private-index';
    readonly indexVersion: 1;
    readonly maximumBytes: 134217728;
    readonly membership: 'fixed-fifteen-slots-v1';
  };
  readonly encryption: 'age-native-x25519';
  readonly tool: {
    readonly directory: string;
    readonly directoryIdentity: {
      readonly device: string;
      readonly inode: string;
      readonly uid: number;
      readonly gid: number;
      readonly mode: 448;
    };
    readonly file: {
      readonly name: 'age';
      readonly bytes: number;
      readonly sha256: string;
      readonly uid: number;
      readonly gid: number;
      readonly mode: 320;
    };
    readonly release: string;
  };
  readonly preflight: {
    readonly plaintext: typeof plaintext;
    readonly stdoutBytes: 65536;
    readonly stderrBytes: 8192;
    readonly maximumDurationMs: 30000;
  };
}
function refuse(message: string): never {
  throw Error(`source archive preflight ${message}`);
}
function hash(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function fields(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    refuse('policy object refused');
  // Proof: closed-policy-fields omission admitted extra parsed policy fields in the actual decoder consumer.
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some((key, ordinal) => key !== names.at(ordinal)))
    refuse('policy fields refused');
  const checked: Record<string, unknown> = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)
      refuse('policy field refused');
    checked[name] = descriptor.value;
  }
  return checked;
}
// Proof: policy-integer-bounds omission admitted zero tool bytes in the actual decoder consumer.
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    refuse('policy integer refused');
  return value;
}
// Proof: retained policy-text omission first admitted noncanonical decimal inode '01'; later digest cases were not reached.
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) refuse('policy text refused');
  return value;
}
function decimal(value: unknown): string {
  const checked = text(value, /^(0|[1-9][0-9]{0,19})$/);
  // Proof: policy-identity-bound omission admitted a value above uint64 in the actual decoder consumer.
  if (BigInt(checked) > 18446744073709551615n) refuse('policy identity bound refused');
  return checked;
}
/** Pure proposed-policy decoder. Fixed canonical bytes and closed native fields convey no trust. @internal */
export function decodeSourceArchivePolicy(bytes: Uint8Array): Policy {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 1 ||
    bytes.length > 16384 ||
    bytes[0] === 239
  )
    refuse('policy encoding refused');
  const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const proposed: unknown = JSON.parse(body);
  // Proof: canonical-policy omission admitted missing LF/extra whitespace in the actual decoder consumer.
  if (body !== `${JSON.stringify(proposed)}\n`) refuse('canonical policy refused');
  const checked = fields(proposed, [
    'format',
    'version',
    'container',
    'encryption',
    'tool',
    'preflight',
  ]);
  const container = fields(checked['container'], [
    'format',
    'version',
    'indexFormat',
    'indexVersion',
    'maximumBytes',
    'membership',
  ]);
  const tool = fields(checked['tool'], ['directory', 'directoryIdentity', 'file', 'release']);
  const directory = fields(tool['directoryIdentity'], ['device', 'inode', 'uid', 'gid', 'mode']);
  const file = fields(tool['file'], ['name', 'bytes', 'sha256', 'uid', 'gid', 'mode']);
  const probe = fields(checked['preflight'], [
    'plaintext',
    'stdoutBytes',
    'stderrBytes',
    'maximumDurationMs',
  ]);
  // Proof: fixed-policy omission admitted changed format/container/preflight literals in the actual decoder consumer.
  if (
    checked['format'] !== 'source-stageb-archive-policy' ||
    checked['version'] !== 1 ||
    checked['encryption'] !== 'age-native-x25519' ||
    container['format'] !== 'source-stageb-private-archive' ||
    container['version'] !== 1 ||
    container['indexFormat'] !== 'source-stageb-private-index' ||
    container['indexVersion'] !== 1 ||
    container['maximumBytes'] !== 134217728 ||
    container['membership'] !== 'fixed-fifteen-slots-v1' ||
    directory['mode'] !== 448 ||
    file['name'] !== 'age' ||
    file['mode'] !== 320 ||
    probe['plaintext'] !== plaintext ||
    probe['stdoutBytes'] !== 65536 ||
    probe['stderrBytes'] !== 8192 ||
    probe['maximumDurationMs'] !== 30000
  )
    refuse('fixed policy refused');
  // Proof: policy-path omission admitted noncanonical native paths in the actual decoder consumer.
  const path = text(tool['directory'], /^\/[\s\S]+$/);
  if (
    Buffer.byteLength(path) > 4096 ||
    path.includes('\0') ||
    posix.normalize(path) !== path ||
    path.endsWith('/')
  )
    refuse('policy path refused');
  const release = text(tool['release'], /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/);
  const policy: Policy = {
    format: 'source-stageb-archive-policy',
    version: 1,
    container: {
      format: 'source-stageb-private-archive',
      version: 1,
      indexFormat: 'source-stageb-private-index',
      indexVersion: 1,
      maximumBytes: 134217728,
      membership: 'fixed-fifteen-slots-v1',
    },
    encryption: 'age-native-x25519',
    tool: {
      directory: path,
      directoryIdentity: {
        device: decimal(directory['device']),
        inode: decimal(directory['inode']),
        uid: integer(directory['uid']),
        gid: integer(directory['gid']),
        mode: 448,
      },
      file: {
        name: 'age',
        bytes: integer(file['bytes'], 1, 134217728),
        sha256: text(file['sha256'], /^[a-f0-9]{64}$/),
        uid: integer(file['uid']),
        gid: integer(file['gid']),
        mode: 320,
      },
      release,
    },
    preflight: { plaintext, stdoutBytes: 65536, stderrBytes: 8192, maximumDurationMs: 30000 },
  };
  return policy;
}
declare const preflightBrand: unique symbol;
declare const borrowBrand: unique symbol;
/** Original successful inert tool/recipient probe; never final archive or native authority. */
export interface SourceArchivePreflight {
  readonly [preflightBrand]: true;
}
/** One original active use of preflight evidence; exposes no descriptor, path or policy. */
export interface SourceArchivePreflightBorrow {
  readonly [borrowBrand]: true;
}
interface Tool {
  parent: FileHandle;
  file?: FileHandle;
  parentIdentity: BigIntStats;
  fileIdentity?: BigIntStats;
}
interface Lifetime {
  inputs: SourceInputs;
  journal: SourceJournal;
  inspection: SourceInputInspection;
  policy: Policy;
  tool: Tool;
  closing?: Promise<void>;
  closeRequested: boolean;
  active?: SourceArchivePreflightBorrow;
  released?: Promise<void>;
  releaseWaiter?: () => void;
  pending: Set<Promise<unknown>>;
}
const attempts = new WeakSet<SourceInputs>();
const lifetimes = new WeakMap<SourceArchivePreflight, Lifetime>();
const borrows = new WeakMap<SourceArchivePreflightBorrow, Lifetime>();
function deadline(inspection: SourceInputInspection, cutoff = inspection.originalDeadline): void {
  if (
    performance.now() >= cutoff ||
    Date.now() < inspection.review.notBefore ||
    Date.now() >= inspection.review.notAfter
  )
    refuse('deadline exceeded');
}
// Proof: r1 valid single-statement omission admitted proc inode drift and borrowed tool drift; tool oracle saw4 records before later proc ENOENT. Old ReferenceError mutation is invalid.
function sameIdentity(before: BigIntStats, after: BigIntStats, directory = false): void {
  for (const field of [
    'dev',
    'ino',
    'mode',
    'uid',
    'gid',
    'nlink',
    ...(directory ? [] : (['size', 'mtimeNs', 'ctimeNs'] as const)),
  ] as const)
    if (before[field] !== after[field]) refuse('tool identity changed');
}
function assertParent(identity: BigIntStats, policy: Policy): void {
  const expected = policy.tool.directoryIdentity;
  if (
    !identity.isDirectory() ||
    identity.dev.toString() !== expected.device ||
    identity.ino.toString() !== expected.inode ||
    identity.uid !== BigInt(expected.uid) ||
    identity.gid !== BigInt(expected.gid) ||
    (identity.mode & 4095n) !== 448n ||
    process.geteuid?.() !== expected.uid ||
    process.getegid?.() !== expected.gid
  )
    refuse('tool parent refused');
}
function assertFile(identity: BigIntStats, policy: Policy): void {
  const expected = policy.tool.file;
  if (
    !identity.isFile() ||
    identity.nlink !== 1n ||
    identity.size !== BigInt(expected.bytes) ||
    identity.uid !== BigInt(expected.uid) ||
    identity.gid !== BigInt(expected.gid) ||
    (identity.mode & 4095n) !== 320n ||
    process.geteuid?.() !== expected.uid ||
    process.getegid?.() !== expected.gid
  )
    refuse('tool file refused');
}
async function hashFile(file: FileHandle, size: number, check: () => void): Promise<string> {
  const digest = createHash('sha256');
  const bytes = Buffer.alloc(Math.min(size, 65536));
  let offset = 0;
  while (offset < size) {
    check();
    const read = await file.read(bytes, 0, Math.min(bytes.length, size - offset), offset);
    check();
    if (read.bytesRead < 1) refuse('tool premature eof');
    digest.update(bytes.subarray(0, read.bytesRead));
    offset += read.bytesRead;
  }
  return digest.digest('hex');
}
async function verifyTool(tool: Tool, policy: Policy, check: () => void): Promise<void> {
  check();
  if ((await realpath(policy.tool.directory)) !== policy.tool.directory)
    refuse('tool directory alias refused');
  const parent = await lstat(policy.tool.directory, { bigint: true });
  assertParent(parent, policy);
  sameIdentity(tool.parentIdentity, parent, true);
  sameIdentity(parent, await tool.parent.stat({ bigint: true }), true);
  const file = tool.file;
  const original = tool.fileIdentity;
  if (file === undefined || original === undefined) refuse('tool acquisition incomplete');
  const before = await lstat(`${policy.tool.directory}/age`, { bigint: true });
  assertFile(before, policy);
  sameIdentity(original, before);
  sameIdentity(original, await file.stat({ bigint: true }));
  // Proof: tool-hash omission passed the tool boundary and reached J create; restored no-create consumer is GREEN.
  if ((await hashFile(file, policy.tool.file.bytes, check)) !== policy.tool.file.sha256)
    refuse('tool hash refused');
  sameIdentity(original, await file.stat({ bigint: true }));
  sameIdentity(original, await lstat(`${policy.tool.directory}/age`, { bigint: true }));
  sameIdentity(tool.parentIdentity, await lstat(policy.tool.directory, { bigint: true }), true);
  check();
}
async function closeTool(tool: Tool): Promise<void> {
  const failures: unknown[] = [];
  if (tool.file !== undefined) {
    try {
      await tool.file.close();
    } catch (failure) {
      failures.push(failure);
    }
  }
  try {
    await tool.parent.close();
  } catch (failure) {
    failures.push(failure);
  }
  if (failures.length > 0) throw new AggregateError(failures, 'source archive tool close failed');
}
async function acquireTool(policy: Policy, check: () => void): Promise<Tool> {
  check();
  const parent = await open(
    policy.tool.directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  // Descriptor acquisition is retained before the next awaited operation, including late completion.
  let tool: Tool | undefined;
  try {
    tool = { parent, parentIdentity: await parent.stat({ bigint: true }) };
    check();
    assertParent(tool.parentIdentity, policy);
    tool.file = await open(
      `${policy.tool.directory}/age`,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    check();
    tool.fileIdentity = await tool.file.stat({ bigint: true });
    await verifyTool(tool, policy, check);
    return tool;
  } catch (primary) {
    let cleanupFailure: unknown;
    try {
      if (tool === undefined) await parent.close();
      else await closeTool(tool);
    } catch (cleanup) {
      cleanupFailure = cleanup;
    }
    if (cleanupFailure !== undefined)
      throw new AggregateError([primary, cleanupFailure], 'source archive acquisition failed', {
        cause: primary,
      });
    throw primary;
  }
}
async function checkJournal(
  inputs: SourceInputs,
  journal: SourceJournal,
): Promise<SourceInputInspection> {
  const inspection = inspectSourceInputs(inputs);
  const snapshot = await inspectSourceJournal(journal);
  if (snapshot.phase !== 'open') refuse('journal phase refused');
  const first = snapshot.records.at(0);
  if (typeof first !== 'object' || first === null || Array.isArray(first) || !('payload' in first))
    refuse('journal claim absent');
  const payload = first['payload'];
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    !('kind' in payload) ||
    payload['kind'] !== 'claim' ||
    !('claim' in payload)
  )
    refuse('journal claim refused');
  const claim = payload['claim'];
  if (typeof claim !== 'object' || claim === null || Array.isArray(claim))
    refuse('journal claim refused');
  // Proof: journal-input-join omission reached helper creation for a foreign source claim; restored no-create consumer is GREEN.
  for (const name of [
    'nonce',
    'implementationSha',
    'workflowSha',
    'sourceSha',
    'inputManifestSha256',
  ] as const)
    if (!(name in claim) || Reflect.get(claim, name) !== inspection.review[name])
      refuse('journal input join refused');
  inspectSourceInputs(inputs);
  return inspection;
}
interface ProcessIdentity {
  kind: 'helper';
  pid: number;
  start: string;
  uid: number;
  gid: number;
  executableSha256: string;
}
function hasExited(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}
async function readProcess(pid: number): Promise<{ start: string; uid: number; gid: number }> {
  const status = await readFile(`/proc/${String(pid)}/status`, 'utf8');
  const stat = await readFile(`/proc/${String(pid)}/stat`, 'utf8');
  const ending = stat.lastIndexOf(') ');
  const start = stat
    .slice(ending + 2)
    .split(' ')
    .at(19);
  // Proof: proc-owner omission minted after an independent UID fault; actual preflight rejection consumer became RED.
  const uid = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);
  const gid = /^Gid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);
  if (
    ending < 1 ||
    start === undefined ||
    !/^[1-9][0-9]*$/.test(start) ||
    uid === null ||
    gid === null ||
    uid.slice(1).some((value) => Number(value) !== process.geteuid?.()) ||
    gid.slice(1).some((value) => Number(value) !== process.getegid?.())
  )
    refuse('child identity refused');
  const owner = Number(uid[1]);
  const group = Number(gid[1]);
  if (!Number.isSafeInteger(owner) || !Number.isSafeInteger(group)) refuse('child owner refused');
  return { start, uid: owner, gid: group };
}
async function observeProcess(
  child: ChildProcessWithoutNullStreams,
  tool: Tool,
  policy: Policy,
  check: () => void,
): Promise<ProcessIdentity> {
  const pid = child.pid;
  if (pid === undefined || hasExited(child)) refuse('child exited before observation');
  const before = await readProcess(pid);
  const executable = await open(`/proc/${String(pid)}/exe`, constants.O_RDONLY);
  let observation: ProcessIdentity;
  try {
    const identity = await executable.stat({ bigint: true });
    const original = tool.fileIdentity;
    if (original === undefined) refuse('tool identity absent');
    sameIdentity(original, identity);
    // Proof: proc-executable-hash omission minted after independent executable byte drift; actual consumer became RED.
    if ((await hashFile(executable, policy.tool.file.bytes, check)) !== policy.tool.file.sha256)
      refuse('child executable hash refused');
    sameIdentity(identity, await executable.stat({ bigint: true }));
    const after = await readProcess(pid);
    // Proof: proc-start-bracket omission minted after independent live start drift; actual consumer became RED.
    if (
      JSON.stringify(before) !== JSON.stringify(after) ||
      child.exitCode !== null ||
      child.signalCode !== null
    )
      refuse('child observation changed');
    check();
    observation = { kind: 'helper', pid, ...before, executableSha256: policy.tool.file.sha256 };
  } catch (primary) {
    let cleanupFailure: unknown;
    try {
      await executable.close();
    } catch (cleanup) {
      cleanupFailure = cleanup;
    }
    // Proof: executable-readback/close fault lost the primary under finally; the actual consumer now retains both causes.
    if (cleanupFailure !== undefined)
      throw new AggregateError(
        [primary, cleanupFailure],
        'source archive executable observation failed',
        { cause: primary },
      );
    throw primary;
  }
  await executable.close();
  return observation;
}
interface Drain {
  bytes: number;
  sha256: string;
}
async function drain(stream: Readable, maximum: number): Promise<Drain> {
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const chunk of stream) {
    const received: unknown = chunk;
    if (!(received instanceof Uint8Array)) refuse('child chunk refused');
    const body = Buffer.from(received);
    bytes += body.length;
    // Proof: output-bound omission minted after 65537-byte stdout and 8193-byte stderr models; both actual consumers RED.
    if (bytes > maximum) refuse('child output overflow');
    digest.update(body);
  }
  return { bytes, sha256: digest.digest('hex') };
}
function requireDispatch(value: SourceDispatch | undefined): asserts value is SourceDispatch {
  if (value === undefined) refuse('dispatch unavailable');
}
async function dispatch(journal: SourceJournal, request: unknown): Promise<SourceDispatch> {
  return dispatchSourceIntent(journal, await appendSourceIntent(journal, request));
}
async function runProbe(
  inputs: SourceInputs,
  journal: SourceJournal,
  tool: Tool,
  policy: Policy,
  inspection: SourceInputInspection,
  cutoff: number,
): Promise<void> {
  const check = () => {
    deadline(inspection, cutoff);
    if (asynchronousFailure !== undefined)
      throw new Error('source archive asynchronous child failure', { cause: asynchronousFailure });
    inspectSourceInputs(inputs);
  };
  let pending: SourceDispatch | undefined = await dispatch(journal, {
    operation: 'create',
    resourceClass: 'helper',
    purpose: 'runtime',
  });
  let child: ChildProcessWithoutNullStreams | undefined;
  let resource: RecordedResource | undefined;
  let identity: ProcessIdentity | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
  let output: Promise<Drain> | undefined;
  let errors: Promise<Drain> | undefined;
  let termination: Promise<void> | undefined;
  let asynchronousFailure: unknown;
  const cleanupFailures: unknown[] = [];
  let primary: unknown;
  let publication: Promise<void> = Promise.resolve();
  const publish = (operation: () => Promise<void>): Promise<void> => {
    publication = operation();
    return publication;
  };
  const settlePending = async () => {
    if (pending !== undefined) {
      const original = pending;
      pending = undefined;
      try {
        await recordSourceUncertainty(journal, original, 'operation-failed');
      } catch (failure) {
        cleanupFailures.push(failure);
      }
    }
  };
  const terminate = (): Promise<void> => {
    if (termination !== undefined) return termination;
    termination = (async () => {
      try {
        // Proof: publication-settlement omission missed stop-join control order after resource/absence assertions passed; that final order oracle was RED.
        await publication;
      } catch (failure) {
        cleanupFailures.push(failure);
      }
      await settlePending();
      let stop: SourceDispatch | undefined;
      if (resource !== undefined) {
        try {
          stop = await dispatch(journal, { operation: 'stop-join', resource });
        } catch (failure) {
          cleanupFailures.push(failure);
        }
      }
      if (child !== undefined && !hasExited(child)) {
        if (identity !== undefined) {
          try {
            const current = await readProcess(identity.pid);
            if (current.start !== identity.start) refuse('child cleanup identity changed');
            child.kill('SIGKILL');
          } catch (failure) {
            // A genuine child close may race procfs removal; join decides cessation below.
            if (!hasExited(child)) cleanupFailures.push(failure);
          }
        } else child.kill('SIGKILL');
      }
      child?.stdin.destroy();
      if (closed !== undefined) await closed;
      // Proof: hung-drain test timed out at 10s without these destroys; restored cleanup joins at the original 500ms cutoff.
      child?.stdout.destroy();
      child?.stderr.destroy();
      const endpoints = await Promise.allSettled([output, errors]);
      for (const endpoint of endpoints)
        if (endpoint.status === 'rejected') cleanupFailures.push(endpoint.reason);
      if (stop !== undefined) {
        try {
          await recordSourceObservation(journal, stop, {
            observationSha256: hash('owned-child-joined'),
          });
        } catch (failure) {
          cleanupFailures.push(failure);
        }
      }
    })();
    return termination;
  };
  try {
    check();
    await verifyTool(tool, policy, check);
    check();
    child = spawn(
      `${policy.tool.directory}/age`,
      ['--encrypt', '--recipient', inspection.review.recipient],
      {
        cwd: policy.tool.directory,
        env: { LANG: 'C', LC_ALL: 'C' },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const acquired = child;
    closed = new Promise((resolve) =>
      acquired.once('close', (code, signal) => {
        resolve({ code, signal });
      }),
    );
    const spawned = new Promise<void>((resolve, reject) => {
      acquired.once('spawn', resolve);
      acquired.once('error', reject);
    });
    output = drain(child.stdout, 65536);
    errors = drain(child.stderr, 8192);
    // Attach rejection observers immediately; real cleanup remains joined through the original promises.
    for (const endpoint of [output, errors])
      void endpoint.catch((failure: unknown) => {
        asynchronousFailure = failure;
        void terminate().catch((cause: unknown) => cleanupFailures.push(cause));
      });
    timer = setTimeout(
      () => {
        asynchronousFailure = Error('source archive preflight child deadline exceeded');
        void terminate().catch((failure: unknown) => cleanupFailures.push(failure));
      },
      Math.max(1, cutoff - performance.now()),
    );
    await spawned;
    check();
    identity = await observeProcess(child, tool, policy, check);
    await publish(async () => {
      const createDispatch = pending;
      requireDispatch(createDispatch);
      resource = await recordSourceObservation(journal, createDispatch, {
        identity,
        observationSha256: hash(JSON.stringify(identity)),
      });
      pending = undefined;
    });
    check();
    if (resource === undefined) refuse('helper acknowledgement absent');
    check();
    await publish(async () => {
      pending = await dispatch(journal, { operation: 'write', resource });
    });
    check();
    await new Promise<void>((resolve, reject) => {
      acquired.stdin.once('error', reject);
      acquired.stdin.end(Buffer.from(plaintext), (failure?: Error | null) => {
        if (failure) reject(failure);
        else resolve();
      });
    });
    const [stdout, stderr, exit] = await Promise.all([output, errors, closed]);
    if (asynchronousFailure !== undefined)
      throw new Error('source archive asynchronous child failure', { cause: asynchronousFailure });
    check();
    // Proof: child-exit omission minted on modeled settled exit7; actual preflight rejection consumer RED.
    if (exit.code !== 0 || exit.signal !== null || stdout.bytes < 1)
      refuse('child transaction refused');
    await publish(async () => {
      const transaction = pending;
      requireDispatch(transaction);
      await recordSourceObservation(journal, transaction, {
        observationSha256: hash(
          JSON.stringify({
            inputBytes: Buffer.byteLength(plaintext),
            inputSha256: hash(plaintext),
            eof: true,
            stdout,
            stderr,
            exit,
          }),
        ),
      });
      pending = undefined;
    });
    check();
    await publish(async () => {
      pending = await dispatch(journal, { operation: 'remove', resource });
      const removal = pending;
      requireDispatch(removal);
      await recordSourceObservation(journal, removal, {
        observationSha256: hash('owned-child-joined-and-endpoints-settled'),
      });
      pending = undefined;
      resource = undefined;
    });
    check();
  } catch (failure) {
    primary = failure;
  }
  if (timer !== undefined) clearTimeout(timer);
  if (primary !== undefined || termination !== undefined) {
    await terminate();
    if (resource !== undefined) {
      try {
        const remove = await dispatch(journal, { operation: 'remove', resource });
        await recordSourceObservation(journal, remove, {
          observationSha256: hash('owned-child-joined-and-endpoints-settled'),
        });
      } catch (failure) {
        cleanupFailures.push(failure);
      }
    }
    throw new AggregateError(
      [
        ...(primary === undefined ? [] : [primary]),
        ...(asynchronousFailure === undefined ? [] : [asynchronousFailure]),
        ...cleanupFailures,
      ],
      'source archive probe failed',
      { cause: primary },
    );
  }
}
/** One original I attempt. Runs only the pinned standard CLI, journals and joins the inert probe before minting. */
export async function preflightSourceArchive(
  inputs: SourceInputs,
  journal: SourceJournal,
): Promise<SourceArchivePreflight> {
  const enteredAt = performance.now();
  const inspection = inspectSourceInputs(inputs);
  // Proof: one-attempt omission minted a second original preflight for the same actual I; consumer RED.
  if (attempts.has(inputs)) refuse('attempt already used');
  attempts.add(inputs);
  // Proof: entry-cutoff fault produced four J records after inspection extended admission by100ms; entry-derived cutoff restores one claim.
  const cutoff = Math.min(inspection.originalDeadline, enteredAt + 30000);
  const check = () => {
    deadline(inspection, cutoff);
    inspectSourceInputs(inputs);
  };
  await checkJournal(inputs, journal);
  check();
  if (embeddedPolicy === undefined) refuse('embedded policy absent');
  const bytes = new TextEncoder().encode(embeddedPolicy);
  // Proof: r1 policy-byte-joins omission attempted changed native directory acquisition (1vs0), then ENOENT; no helper creation was observed. Restored acquisition witness GREEN.
  if (
    bytes.length < 1 ||
    bytes.length > 16384 ||
    hash(bytes) !== inspection.review.archivePolicySha256 ||
    hash(bytes) !== inspection.index.archivePolicySha256
  )
    refuse('original archive policy join refused');
  const policy = decodeSourceArchivePolicy(bytes);
  const tool = await acquireTool(policy, check);
  try {
    await runProbe(inputs, journal, tool, policy, inspection, cutoff);
    await checkJournal(inputs, journal);
    await verifyTool(tool, policy, check);
    check();
    // Boundary: this closure alone mints and registers the erased branded identity after actual settlement.
    const original = Object.freeze({}) as SourceArchivePreflight;
    lifetimes.set(original, {
      inputs,
      journal,
      inspection,
      policy,
      tool,
      closeRequested: false,
      pending: new Set(),
    });
    return original;
  } catch (primary) {
    let cleanupFailure: unknown;
    try {
      await closeTool(tool);
    } catch (cleanup) {
      cleanupFailure = cleanup;
    }
    if (cleanupFailure !== undefined)
      throw new AggregateError([primary, cleanupFailure], 'source archive preflight failed', {
        cause: primary,
      });
    throw primary;
  }
}
function originalLifetime(original: SourceArchivePreflight): Lifetime {
  const lifetime = lifetimes.get(original);
  if (lifetime === undefined) refuse('original preflight required');
  return lifetime;
}
function activeLifetime(
  inputs: SourceInputs,
  journal: SourceJournal,
  borrow: SourceArchivePreflightBorrow,
): Lifetime {
  const lifetime = borrows.get(borrow);
  if (lifetime?.active !== borrow || lifetime.inputs !== inputs || lifetime.journal !== journal)
    refuse('original active borrow required');
  return lifetime;
}
async function verifyLifetime(lifetime: Lifetime): Promise<void> {
  await checkJournal(lifetime.inputs, lifetime.journal);
  await verifyTool(lifetime.tool, lifetime.policy, () => {
    deadline(lifetime.inspection);
    inspectSourceInputs(lifetime.inputs);
  });
}
async function register<T>(lifetime: Lifetime, operation: () => Promise<T>): Promise<T> {
  const pending = operation();
  lifetime.pending.add(pending);
  try {
    return await pending;
  } finally {
    lifetime.pending.delete(pending);
  }
}
/** Reserves one active original borrow before IO. Its deadline is I's immutable original cutoff. */
export async function borrowSourceArchivePreflight(
  inputs: SourceInputs,
  journal: SourceJournal,
  original: SourceArchivePreflight,
): Promise<SourceArchivePreflightBorrow> {
  const lifetime = originalLifetime(original);
  // Proof: wrong-input-borrow and single-borrow omissions admitted foreign I/J or overlapping original use; actual consumers RED.
  if (
    lifetime.inputs !== inputs ||
    lifetime.journal !== journal ||
    lifetime.closeRequested ||
    lifetime.active !== undefined
  )
    refuse('borrow refused');
  // Boundary: an opaque borrow is admitted only into this original lifetime's private registry.
  const borrow = Object.freeze({}) as SourceArchivePreflightBorrow;
  lifetime.active = borrow;
  lifetime.released = new Promise((resolve) => {
    lifetime.releaseWaiter = resolve;
  });
  try {
    await register(lifetime, () => verifyLifetime(lifetime));
    borrows.set(borrow, lifetime);
    return borrow;
  } catch (failure) {
    lifetime.active = undefined;
    lifetime.releaseWaiter?.();
    throw failure;
  }
}
/** Rechecks the genuine admitted borrow. closeRequested alone cannot invalidate an existing use. */
export async function assertSourceArchivePreflight(
  inputs: SourceInputs,
  journal: SourceJournal,
  borrow: SourceArchivePreflightBorrow,
): Promise<void> {
  const lifetime = activeLifetime(inputs, journal, borrow);
  await register(lifetime, () => verifyLifetime(lifetime));
  activeLifetime(inputs, journal, borrow);
}
/** Original release is permitted after expiry and waits for admitted continuity IO. */
export async function releaseSourceArchivePreflight(
  borrow: SourceArchivePreflightBorrow,
): Promise<void> {
  const lifetime = borrows.get(borrow);
  if (lifetime?.active !== borrow) refuse('original active borrow required');
  borrows.delete(borrow);
  const settled = await Promise.allSettled([...lifetime.pending]);
  lifetime.active = undefined;
  lifetime.releaseWaiter?.();
  const failures = settled
    .filter((entry): entry is PromiseRejectedResult => entry.status === 'rejected')
    .map((entry): unknown => entry.reason);
  if (failures.length > 0)
    throw new AggregateError(failures, 'source archive borrow settlement failed');
}
/** Memoized original-only descriptor settlement waits for active use and all registered IO. */
export function closeSourceArchivePreflight(original: SourceArchivePreflight): Promise<void> {
  let lifetime: Lifetime;
  try {
    lifetime = originalLifetime(original);
  } catch (failure) {
    return Promise.reject(new Error('source archive original close refused', { cause: failure }));
  }
  // Proof: close-memoization omission returned a different original settlement promise; actual lifecycle consumer RED.
  if (lifetime.closing !== undefined) return lifetime.closing;
  lifetime.closeRequested = true;
  lifetime.closing = (async () => {
    // Proof: close-await-use omission closed original descriptors during an admitted borrow; actual healthy-use consumer RED.
    if (lifetime.active !== undefined) await lifetime.released;
    const settled = await Promise.allSettled([...lifetime.pending]);
    const failures = settled
      .filter((entry): entry is PromiseRejectedResult => entry.status === 'rejected')
      .map((entry): unknown => entry.reason);
    try {
      await closeTool(lifetime.tool);
    } catch (failure) {
      failures.push(failure);
    }
    if (failures.length > 0)
      throw new AggregateError(failures, 'source archive preflight close failed');
  })();
  return lifetime.closing;
}
