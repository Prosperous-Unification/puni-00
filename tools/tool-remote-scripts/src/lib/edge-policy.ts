import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import { closeSync, constants, fstatSync, fsyncSync, writeFileSync } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { openDirectoryFile } from './directory-file';
import { assertNoEdgeOwner } from './edge-admission';
import { withCanonicalLock } from './lock';
import { readClosed, readString } from './managed-cohort';

/** Optional evidence destination and attempt correlation; grants no policy or startup authority. */
export interface EdgePolicyOriginRequest {
  readonly attemptId: string;
  readonly receiptPath: string;
}

/** Stable filesystem identity; mutable holder bytes and timestamps are deliberately excluded. */
export interface EdgePolicyOriginIdentity {
  readonly path: string;
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
}

/** Original initializer observations, not an admission manifest or a replacement permission. */
export interface EdgePolicyOriginReceipt {
  readonly format: 'edge-policy-origin-receipt';
  readonly version: 1;
  readonly attemptId: string;
  readonly edgeState: string;
  readonly parent: EdgePolicyOriginIdentity;
  readonly lock: EdgePolicyOriginIdentity;
  readonly policy: EdgePolicyOriginIdentity & {
    readonly contents: string;
    readonly byteLength: number;
    readonly sha256: string;
  };
}

function observeOriginIdentity(path: string, status: BigIntStats): EdgePolicyOriginIdentity {
  const uid = Number(status.uid);
  const gid = Number(status.gid);
  // Proof: removing checked UID/GID conversion admitted a simulated unsafe GID;
  // edge-policy.test.ts "origin metadata boundary refuses without unsupported evidence:
  // unsafe-integer" failed with "unsupported origin metadata admitted".
  if (!Number.isSafeInteger(uid) || uid < 0 || !Number.isSafeInteger(gid) || gid < 0)
    throw new Error('origin metadata integer is unsafe');
  return {
    path,
    device: String(status.dev),
    inode: String(status.ino),
    mode: Number(status.mode & 0o7777n),
    uid,
    gid,
  };
}

export interface OrdinaryEdgePolicy {
  format: 'dependency-edge-policy';
  version: 1;
  phase: 'ordinary';
  edgeState: string;
}

export interface RestoringEdgePolicy {
  readonly format: 'dependency-edge-policy';
  readonly version: 1;
  readonly phase: 'restoring';
  readonly edgeState: string;
  readonly ownerPublicationSha256: string;
  readonly restorationIntent: { readonly name: string; readonly sha256: string };
}
export type EdgePolicy = OrdinaryEdgePolicy | RestoringEdgePolicy;
export interface EdgeRecordSnapshot {
  readonly path: string;
  readonly device: string;
  readonly inode: string;
  readonly parentDevice: string;
  readonly parentInode: string;
  readonly mode: number;
  readonly contents: string;
}
export interface EdgePolicySnapshot extends EdgeRecordSnapshot {
  readonly policy: EdgePolicy;
}

/** Closed phase-aware grammar; active remains unsupported and grants no fallback. */
export function decodeEdgePolicy(value: unknown, edgeState: string): EdgePolicy {
  if (!(
    typeof value === 'object' &&
    value !== null &&
    'phase' in value &&
    value.phase === 'restoring'
  ))
    return decodeOrdinaryEdgePolicy(value, edgeState);
  try {
    return decodeRestoringEdgePolicy(value, edgeState);
  } catch (cause) {
    throw new Error('invalid restoring edge policy', { cause });
  }
}

function decodeRestoringEdgePolicy(value: unknown, edgeState: string): RestoringEdgePolicy {
  // Proof: policy-closed omission admitted extra restoring fields; phase-aware policy reader test failed (exit 1).
  const policy = readClosed(value, [
    'format',
    'version',
    'phase',
    'edgeState',
    'ownerPublicationSha256',
    'restorationIntent',
  ]);
  const reference = readClosed(policy['restorationIntent'], ['name', 'sha256']);
  const name = readString(reference['name']);
  const sha256 = readString(reference['sha256']);
  const ownerPublicationSha256 = readString(policy['ownerPublicationSha256']);
  // Proof: widening this grammar admitted activation evidence as restoration authority; every-activation-label negative failed.
  // Proof: permitting only the new participant-start-intent label failed the decoder negative at its eighth assertion; restored policy remains solver-intent-only.
  if (
    policy['format'] !== 'dependency-edge-policy' ||
    policy['version'] !== 1 ||
    policy['phase'] !== 'restoring' ||
    policy['edgeState'] !== edgeState ||
    !/^[a-f0-9]{64}$/.test(ownerPublicationSha256) ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !/^edge-owner-[0-9]{6,12}-solver-restore-intent\.json$/.test(name)
  )
    throw new Error('invalid restoring edge policy');
  return {
    format: 'dependency-edge-policy',
    version: 1,
    phase: 'restoring',
    edgeState,
    ownerPublicationSha256,
    restorationIntent: { name, sha256 },
  };
}

/** Rejects all unimplemented phases and binds the closed policy to one canonical directory. */
export function decodeOrdinaryEdgePolicy(value: unknown, edgeState: string): OrdinaryEdgePolicy {
  // Proof: closed-policy omission admitted unsupported phases in edge-policy.test.ts (exit 1).
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('invalid ordinary edge policy');
  if (
    Object.keys(value).sort().join(',') !== 'edgeState,format,phase,version' ||
    !('format' in value) ||
    value.format !== 'dependency-edge-policy' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('phase' in value) ||
    value.phase !== 'ordinary' ||
    !('edgeState' in value) ||
    value.edgeState !== edgeState
  )
    throw new Error('invalid ordinary edge policy: unsupported fields, phase or state binding');
  return { format: 'dependency-edge-policy', version: 1, phase: 'ordinary', edgeState };
}

async function assertPolicyDirectory(edgeState: string): Promise<BigIntStats> {
  // Proof: canonical-state omission initialized alias state; edge-policy.test.ts exited 1.
  if (
    !isAbsolute(edgeState) ||
    resolve(edgeState) !== edgeState ||
    (await realpath(edgeState)) !== edgeState
  )
    throw new Error('edge policy requires canonical absolute edge directory');
  const state = await lstat(edgeState, { bigint: true });
  if (!state.isDirectory()) throw new Error('edge policy requires a real directory');
  // Proof: readable-directory omission admitted 0333 trusted state; edge-policy.test.ts exited 1.
  await readdir(edgeState);
  return state;
}

/** Reads a bounded regular nonsymlink document and refuses inode or metadata drift during inspection. */
export async function readOrdinaryEdgePolicy(edgeState: string): Promise<OrdinaryEdgePolicy> {
  const snapshot = await captureEdgePolicy(edgeState);
  return decodeOrdinaryEdgePolicy(snapshot.policy, edgeState);
}

/** Captures exact bounded policy bytes and both file/parent identities without admitting startup. */
export async function captureEdgePolicy(edgeState: string): Promise<EdgePolicySnapshot> {
  const captured = await captureEdgeRecord(edgeState, 'edge-policy.json', 4096);
  let value: unknown;
  try {
    value = JSON.parse(captured.contents);
  } catch {
    throw new Error('invalid edge policy JSON or UTF-8');
  }
  return { ...captured, policy: decodeEdgePolicy(value, edgeState) };
}

export type ParticipantFenceName =
  | 'dependency-source-dev-intent.json'
  | 'dependency-source-dev-complete.json'
  | 'dependency-backend-fence.json'
  | 'dependency-backend-intent.json'
  | 'dependency-backend-complete.json'
  | 'dependency-gateway-fence.json'
  | 'dependency-gateway-intent.json'
  | 'dependency-gateway-complete.json';

/**
 * Captures one of the eight retained participant fences with bounded private bytes
 * and unchanged file/parent identity. Observation grants no authority to release it.
 * @throws on an unsupported name or unreadable, malformed or changed file/parent.
 */
export async function captureParticipantFence(
  edgeState: string,
  name: string,
): Promise<EdgeRecordSnapshot> {
  // Proof: removing this guard admitted a readable edge-policy sibling; the
  // participant-name negative in closed-restoration-records.test.ts failed.
  if (
    name !== 'dependency-source-dev-intent.json' &&
    name !== 'dependency-source-dev-complete.json' &&
    name !== 'dependency-backend-fence.json' &&
    name !== 'dependency-backend-intent.json' &&
    name !== 'dependency-backend-complete.json' &&
    name !== 'dependency-gateway-fence.json' &&
    name !== 'dependency-gateway-intent.json' &&
    name !== 'dependency-gateway-complete.json'
  )
    throw new Error('unsupported participant fence path');
  return captureRecord(edgeState, name, 65536);
}

/**
 * Captures an ordinary owner operation intent with a six-to-twelve-digit sequence,
 * bounded private bytes and unchanged file/parent identity. This grants no authority.
 * @throws on an unsupported name or unreadable, malformed or changed file/parent.
 */
export async function captureOwnerOperationIntent(
  edgeState: string,
  name: string,
): Promise<EdgeRecordSnapshot> {
  // Proof: removing this guard admitted a readable participant-fence sibling;
  // the owner-name negative in closed-restoration-records.test.ts failed.
  if (!/^edge-owner-[0-9]{6,12}-intent\.json$/.test(name))
    throw new Error('unsupported owner operation intent path');
  return captureRecord(edgeState, name, 65536);
}

/** Bounded descriptor/path/parent-bound observation of fixed policy, pending, numbered restoration and closed activation records. */
export async function captureEdgeRecord(
  edgeState: string,
  name: string,
  maximum: 4096 | 65536,
): Promise<EdgeRecordSnapshot> {
  // Proof: fixed-record-path omission read a non-contract private record; trusted-record test failed (exit 1).
  if (
    name !== 'edge-policy.json' &&
    name !== 'edge-owner.pending' &&
    !/^edge-owner-[0-9]{6,12}-solver-restore-intent\.json$/.test(name) &&
    !/^edge-owner-[0-9]{6,12}-activation-(participants|capture|backup|intent|committed|fenced-complete|participant-restore-intent|participant-start-intent|participant-ready|participant-policy-intent|participants-restored)\.json$/.test(
      name,
    )
  )
    throw new Error('unsupported edge record path');
  return captureRecord(edgeState, name, maximum);
}

/**
 * Captures only the numbered solver completion family through the shared bounded
 * reader. That family also contains policy-publication records; this filename
 * boundary validates no ready phase and grants no restoration authority.
 * @throws for another family, malformed name or unreadable/invalid private bytes.
 */
export async function captureSolverRestorationCompletion(
  edgeState: string,
  name: string,
): Promise<EdgeRecordSnapshot> {
  // Proof: omitting this family guard read a real wrong-family intent; the
  // completion reader refusal assertion failed, then exact restoration passed.
  if (!/^edge-owner-[0-9]{6,12}-solver-restore-complete\.json$/.test(name))
    throw new Error('unsupported solver restoration completion path');
  return captureRecord(edgeState, name, 65536);
}

/** Reads only filenames already admitted by this module's closed capture entrypoints. */
async function captureRecord(
  edgeState: string,
  name: string,
  maximum: 4096 | 65536,
): Promise<EdgeRecordSnapshot> {
  await assertPolicyDirectory(edgeState);
  const parent = await lstat(edgeState, { bigint: true });
  const path = join(edgeState, name);
  // Proof: nofollow-open and nonblocking-open omissions lost ELOOP or hung FIFO refusal
  // in edge-policy.test.ts (each exit 1).
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = await descriptor.stat({ bigint: true });
    const named = await lstat(path, { bigint: true });
    // Proof: bounded-policy and opened-identity omissions admitted a valid oversized
    // document or lost the opened-path refusal in edge-policy.test.ts (each exit 1).
    // Proof: edge-record-identity-size-mode omission admitted oversized/public intent bytes; trusted-record test failed (exit 1).
    if (
      !opened.isFile() ||
      !named.isFile() ||
      opened.dev !== named.dev ||
      opened.ino !== named.ino ||
      opened.size < 1n ||
      opened.size > BigInt(maximum) ||
      (name !== 'edge-policy.json' && (opened.mode & 0o777n) !== 0o600n)
    )
      throw new Error('invalid edge policy file identity, type or size');
    const bytes = new Uint8Array(maximum + 1);
    const { bytesRead } = await descriptor.read(bytes, 0, bytes.length, 0);
    const final = await descriptor.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    // Proof: final-identity omission admitted replaced path and changed metadata
    // in edge-policy.test.ts (exit 1).
    if (
      BigInt(bytesRead) !== opened.size ||
      final.dev !== opened.dev ||
      final.ino !== opened.ino ||
      final.size !== opened.size ||
      final.mtimeNs !== opened.mtimeNs ||
      final.ctimeNs !== opened.ctimeNs ||
      current.dev !== opened.dev ||
      current.ino !== opened.ino ||
      current.size !== opened.size ||
      current.mtimeNs !== opened.mtimeNs ||
      current.ctimeNs !== opened.ctimeNs
    )
      throw new Error('edge policy changed while reading');
    // Proof: read-parent-identity omission accepted a swapped directory with a hardlinked
    // policy in edge-policy.test.ts (exit 1).
    await assertPolicyDirectory(edgeState);
    const currentParent = await lstat(edgeState, { bigint: true });
    if (parent.dev !== currentParent.dev || parent.ino !== currentParent.ino)
      throw new Error('edge policy directory changed while reading');
    return {
      path,
      device: String(opened.dev),
      inode: String(opened.ino),
      parentDevice: String(parent.dev),
      parentInode: String(parent.ino),
      mode: Number(opened.mode & 0o777n),
      contents: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        bytes.subarray(0, bytesRead),
      ),
    };
  } finally {
    await descriptor.close();
  }
}

interface OriginDestination {
  readonly request: EdgePolicyOriginRequest;
  readonly directory: FileHandle;
  readonly parent: BigIntStats;
  readonly name: string;
  readonly uid: number;
}

function matchesOriginIdentity(opened: BigIntStats, expected: BigIntStats): boolean {
  return (
    opened.dev === expected.dev &&
    opened.ino === expected.ino &&
    opened.mode === expected.mode &&
    opened.uid === expected.uid &&
    opened.gid === expected.gid
  );
}

/** Admits only a fresh evidence destination through one retained private canonical parent. */
async function prepareOriginDestination(
  origin: EdgePolicyOriginRequest,
): Promise<OriginDestination> {
  // Proof: selecting known fields instead of enforcing the closed request admitted an
  // extra field; edge-policy.test.ts "origin request refuses malformed shape before
  // policy creation: extra" lost its expected Error.
  const fields = readClosed(origin, ['attemptId', 'receiptPath']);
  const attemptId = readString(fields['attemptId']);
  const receiptPath = readString(fields['receiptPath']);
  const name = basename(receiptPath);
  // Proof: omitting this composite request grammar admitted the uuid case; the
  // policy-collision case created policy before later refusal. Both owning cases in
  // edge-policy.test.ts failed; this proves grammar/ordering, not each predicate.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId) ||
    !isAbsolute(receiptPath) ||
    resolve(receiptPath) !== receiptPath ||
    receiptPath.includes('\0') ||
    name === '/' ||
    name === 'edge-policy.json' ||
    name === 'edge.lock' ||
    name.startsWith('edge-owner')
  )
    throw new Error('invalid origin receipt request');
  const parentPath = dirname(receiptPath);
  // Proof: omitting both canonical-parent checks admitted alias-ancestor;
  // edge-policy.test.ts "unsafe origin destination refuses before policy creation:
  // alias-ancestor" lost its expected Error (one shared family).
  if ((await realpath(parentPath)) !== parentPath)
    throw new Error('origin receipt requires a canonical parent');
  const parent = await lstat(parentPath, { bigint: true });
  const getuid = process.getuid;
  if (typeof getuid !== 'function') throw new Error('origin receipt requires a process UID');
  const uid = getuid();
  // Proof: removing this private-parent guard admitted public-parent and a consistent
  // foreign-UID observation; their edge-policy.test.ts refusal cases failed. This is
  // one composite guard, not separate type/mode/UID necessity or real chown evidence.
  if (!parent.isDirectory() || (parent.mode & 0o7777n) !== 0o700n || parent.uid !== BigInt(uid))
    throw new Error('origin receipt requires an owned private parent');
  const directory = await open(
    parentPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const opened = await directory.stat({ bigint: true });
    if (!opened.isDirectory() || !matchesOriginIdentity(opened, parent))
      throw new Error('origin receipt parent changed before initialization');
    // Proof: omitting destination preflight created policy before later O_EXCL refusal;
    // edge-policy.test.ts "unsafe origin destination refuses before policy creation:
    // existing" failed its no-policy assertion (ordering only).
    try {
      await lstat(receiptPath);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
        return { request: { attemptId, receiptPath }, directory, parent, name, uid };
      throw cause;
    }
    throw new Error('origin receipt destination already exists');
  } catch (cause) {
    await directory.close();
    throw cause;
  }
}

/** Rechecks retained directory authority without using mutable directory timestamps or contents. */
async function verifyOriginDirectory(
  path: string,
  directory: FileHandle,
  expected: BigIntStats,
): Promise<void> {
  // Proof: bypassing this shared directory verifier admitted late-parent, parent-inode
  // and state-inode observations; their metadata-boundary/required-receipt-failure
  // cases in edge-policy.test.ts failed. No per-call or per-field necessity is claimed.
  const opened = await directory.stat({ bigint: true });
  const named = await lstat(path, { bigint: true });
  if (
    !opened.isDirectory() ||
    !named.isDirectory() ||
    (await realpath(path)) !== path ||
    !matchesOriginIdentity(opened, expected) ||
    !matchesOriginIdentity(named, expected)
  )
    throw new Error('origin directory identity changed');
}

/** Independently opens exact bounded bytes and verifies original created identity, type and ownership. */
async function verifyOriginBytes(
  path: string,
  expected: BigIntStats,
  contents: string,
  maximum: number,
): Promise<void> {
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = await descriptor.stat({ bigint: true });
    const named = await lstat(path, { bigint: true });
    const expectedBytes = Buffer.from(contents);
    if (
      !expected.isFile() ||
      !opened.isFile() ||
      !named.isFile() ||
      !matchesOriginIdentity(opened, expected) ||
      !matchesOriginIdentity(named, expected) ||
      opened.size < 1n ||
      opened.size > BigInt(maximum) ||
      opened.size !== BigInt(expectedBytes.byteLength)
    )
      throw new Error('origin file identity, mode, owner or size changed');
    const bytes = Buffer.alloc(maximum + 1);
    const { bytesRead } = await descriptor.read(bytes, 0, bytes.length, 0);
    const final = await descriptor.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    if (
      bytesRead !== expectedBytes.byteLength ||
      !bytes.subarray(0, bytesRead).equals(expectedBytes) ||
      !matchesOriginIdentity(final, expected) ||
      !matchesOriginIdentity(current, expected) ||
      final.size !== opened.size ||
      current.size !== opened.size
    )
      throw new Error('origin file changed during independent readback');
  } finally {
    await descriptor.close();
  }
}

/** Requires the original held descriptor and its canonical named inode; lock-holder bytes are mutable. */
async function verifyOriginLock(
  path: string,
  descriptor: number,
  expected: BigIntStats,
): Promise<void> {
  // Proof: bypassing original-lock verification admitted late lock replacement;
  // edge-policy.test.ts "required receipt failure retains created policy without
  // success: lock-inode" failed with "required origin failure admitted".
  const opened = fstatSync(descriptor, { bigint: true });
  const named = await lstat(path, { bigint: true });
  if (
    !opened.isFile() ||
    !named.isFile() ||
    (await realpath(path)) !== path ||
    !matchesOriginIdentity(opened, expected) ||
    !matchesOriginIdentity(named, expected)
  )
    throw new Error('original origin lock identity changed');
}

/** Publishes required private evidence while the initializer still owns its original lock. Errors retain partial state. */
async function publishOriginReceipt(
  edgeState: string,
  destination: OriginDestination,
  directory: FileHandle,
  parent: BigIntStats,
  lockDescriptor: number,
  created: BigIntStats,
  contents: string,
): Promise<void> {
  const lockPath = join(edgeState, 'edge.lock');
  const policyPath = join(edgeState, 'edge-policy.json');
  const lock = fstatSync(lockDescriptor, { bigint: true });
  // Proof: removing this created-policy guard admitted an actual chmod644 file;
  // edge-policy.test.ts "origin exclusive creation refuses nonprivate actual file:
  // policy" failed. This witnesses the composite privacy guard.
  if ((created.mode & 0o7777n) !== 0o600n || created.uid !== BigInt(destination.uid))
    throw new Error('origin created policy must be private and owned');
  await verifyOriginDirectory(edgeState, directory, parent);
  await verifyOriginLock(lockPath, lockDescriptor, lock);
  await verifyOriginBytes(policyPath, created, contents, 4096);
  const receipt: EdgePolicyOriginReceipt = {
    format: 'edge-policy-origin-receipt',
    version: 1,
    attemptId: destination.request.attemptId,
    edgeState,
    parent: observeOriginIdentity(edgeState, parent),
    lock: observeOriginIdentity(lockPath, lock),
    policy: {
      ...observeOriginIdentity(policyPath, created),
      contents,
      byteLength: Buffer.byteLength(contents),
      sha256: createHash('sha256').update(contents).digest('hex'),
    },
  };
  const serialized = `${JSON.stringify(receipt)}\n`;
  // Proof: removing the emission bound created an oversized receipt before bounded
  // readback refused; edge-policy.test.ts "serialized origin receipt bound refuses
  // while retaining created policy" failed its no-receipt assertion (ordering only).
  if (Buffer.byteLength(serialized) > 16384) throw new Error('origin receipt exceeds byte bound');
  await verifyOriginDirectory(
    dirname(destination.request.receiptPath),
    destination.directory,
    destination.parent,
  );
  const descriptor = openDirectoryFile(
    destination.directory.fd,
    destination.name,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
  );
  let published: BigIntStats;
  try {
    published = fstatSync(descriptor, { bigint: true });
    // Proof: removing this created-receipt guard admitted an actual chmod644 file;
    // edge-policy.test.ts "origin exclusive creation refuses nonprivate actual file:
    // receipt" failed. This witnesses the composite privacy guard.
    if (
      !published.isFile() ||
      (published.mode & 0o7777n) !== 0o600n ||
      published.uid !== BigInt(destination.uid)
    )
      throw new Error('origin receipt must be a private owned file');
    // Proof: omitting receipt write left the write fault boundary unreached in
    // edge-policy.test.ts "required receipt failure retains created policy without
    // success: write". This proves operation presence, not error propagation/durability.
    writeFileSync(descriptor, serialized);
    // Proof: omitting receipt fsync left the file-sync fault boundary unreached in
    // edge-policy.test.ts "required receipt failure retains created policy without
    // success: file-sync". This proves operation presence, not physical durability.
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  // Proof: omitting independent receipt verification admitted corrupted readback;
  // edge-policy.test.ts "required receipt failure retains created policy without
  // success: readback" failed. This is one shared verification dependency.
  await verifyOriginBytes(destination.request.receiptPath, published, serialized, 16384);
  // Proof: omitting receipt-parent fsync left the parent-sync fault boundary unreached
  // in edge-policy.test.ts "required receipt failure retains created policy without
  // success: parent-sync"; operation presence, not error propagation/durability.
  fsyncSync(destination.directory.fd);
  await verifyOriginDirectory(
    dirname(destination.request.receiptPath),
    destination.directory,
    destination.parent,
  );
  await verifyOriginDirectory(edgeState, directory, parent);
  await verifyOriginLock(lockPath, lockDescriptor, lock);
  // Proof: rebasing this closing identity to the current pathname admitted replacement;
  // edge-policy.test.ts "required receipt failure retains created policy without
  // success: policy-inode" failed. The expected identity must remain the created one.
  await verifyOriginBytes(policyPath, created, contents, 4096);
}

/**
 * Explicit first adoption only on Linux x64; legacy calls retain their ordinary-policy return.
 * Optional origin evidence is admitted before mutation and durably verified under the original lock.
 * Required evidence failure throws while retaining any already-created policy and partial receipt.
 */
export async function initializeOrdinaryEdgePolicy(
  edgeState: string,
  origin?: EdgePolicyOriginRequest,
): Promise<OrdinaryEdgePolicy> {
  const initialParent = await assertPolicyDirectory(edgeState);
  const destination = origin === undefined ? undefined : await prepareOriginDestination(origin);
  try {
    // Proof: init-lock omission admitted initialization while edge.lock was held
    // in edge-policy.test.ts (exit 1).
    // Proof: releasing the real lock before its initializer callback let a real contender
    // report ACQUIRED instead of REFUSED; edge-policy.test.ts "origin receipt publication
    // excludes a real lock contender until original return" failed (callback interval).
    return await withCanonicalLock(join(edgeState, 'edge.lock'), async (lockDescriptor) => {
      // Proof: init-marker omission published beneath retained markers; edge-policy.test.ts exited 1.
      await assertNoEdgeOwner(edgeState);
      if (destination !== undefined)
        await verifyOriginDirectory(
          dirname(destination.request.receiptPath),
          destination.directory,
          destination.parent,
        );
      const policy: OrdinaryEdgePolicy = {
        format: 'dependency-edge-policy',
        version: 1,
        phase: 'ordinary',
        edgeState,
      };
      const directory = await open(
        edgeState,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        const parent = await directory.stat({ bigint: true });
        const named = await assertPolicyDirectory(edgeState);
        // Proof: init-parent-identity omission lost pre-publication parent refusal in edge-policy.test.ts (exit 1).
        if (
          parent.dev !== named.dev ||
          parent.ino !== named.ino ||
          parent.dev !== initialParent.dev ||
          parent.ino !== initialParent.ino
        )
          throw new Error('edge policy directory changed before publication');
        if (destination !== undefined)
          await verifyOriginDirectory(
            dirname(destination.request.receiptPath),
            destination.directory,
            destination.parent,
          );
        // Proof: exclusive-init omission overwrote an existing publication; edge-policy.test.ts exited 1.
        // Proof: relative-publication path-open mutation wrote into the swapped foreign
        // directory; edge-policy.test.ts observed foreign publication (exit 1).
        const descriptor = openDirectoryFile(
          directory.fd,
          'edge-policy.json',
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        );
        const created = fstatSync(descriptor, { bigint: true });
        const contents = `${JSON.stringify(policy)}\n`;
        try {
          writeFileSync(descriptor, contents);
          // Proof: file-sync omission ignored an injected sync failure; edge-policy.test.ts exited 1.
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
        // Proof: directory-sync omission ignored an injected directory sync failure; edge-policy.test.ts exited 1.
        fsyncSync(directory.fd);
        // Proof: publication-parent omission lost the parent-swap refusal boundary in edge-policy.test.ts (exit 1).
        const current = await assertPolicyDirectory(edgeState);
        if (parent.dev !== current.dev || parent.ino !== current.ino)
          throw new Error('edge policy directory changed during publication');
        // Proof: independent-readback omission admitted a corrupted publication; edge-policy.test.ts exited 1.
        const readback = await readOrdinaryEdgePolicy(edgeState);
        // Proof: publication-identity omission accepted same-byte inode replacement in edge-policy.test.ts (exit 1).
        const published = await lstat(join(edgeState, 'edge-policy.json'), { bigint: true });
        if (published.dev !== created.dev || published.ino !== created.ino)
          throw new Error('edge policy publication identity changed');
        // Proof: omitting this one publication call left the API receipt absent and CLI
        // success followed by ENOENT; edge-policy.test.ts "origin receipt retains created
        // policy and original parent and lock before release" and initialize-edge-policy.test.ts
        // "origin CLI preserves legacy stdout and original process custody" failed.
        if (destination !== undefined)
          await publishOriginReceipt(
            edgeState,
            destination,
            directory,
            parent,
            lockDescriptor,
            created,
            contents,
          );
        return readback;
      } finally {
        await directory.close();
      }
    });
  } finally {
    await destination?.directory.close();
  }
}
