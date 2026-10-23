import type { Stats } from 'node:fs';
import { closeSync, constants, fstatSync, fsyncSync, writeFileSync } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { openDirectoryFile } from './directory-file';
import { assertNoEdgeOwner } from './edge-admission';
import { withCanonicalLock } from './lock';
import { readClosed, readString } from './managed-cohort';

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

async function assertPolicyDirectory(edgeState: string): Promise<Stats> {
  // Proof: canonical-state omission initialized alias state; edge-policy.test.ts exited 1.
  if (
    !isAbsolute(edgeState) ||
    resolve(edgeState) !== edgeState ||
    (await realpath(edgeState)) !== edgeState
  )
    throw new Error('edge policy requires canonical absolute edge directory');
  const state = await lstat(edgeState);
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

/** Bounded descriptor/path/parent-bound observation of only fixed edge-policy, pending or numbered restoration records. */
export async function captureEdgeRecord(
  edgeState: string,
  name: string,
  maximum: 4096 | 65536,
): Promise<EdgeRecordSnapshot> {
  // Proof: fixed-record-path omission read a non-contract private record; trusted-record test failed (exit 1).
  if (
    name !== 'edge-policy.json' &&
    name !== 'edge-owner.pending' &&
    !/^edge-owner-[0-9]{6,12}-solver-restore-intent\.json$/.test(name)
  )
    throw new Error('unsupported edge record path');
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

/** Explicit first adoption only on Linux x64. Exclusive descriptor-relative publication never repairs existing or partial evidence. */
export async function initializeOrdinaryEdgePolicy(edgeState: string): Promise<OrdinaryEdgePolicy> {
  const initialParent = await assertPolicyDirectory(edgeState);
  // Proof: init-lock omission admitted initialization while edge.lock was held
  // in edge-policy.test.ts (exit 1).
  return withCanonicalLock(join(edgeState, 'edge.lock'), async () => {
    // Proof: init-marker omission published beneath retained markers; edge-policy.test.ts exited 1.
    await assertNoEdgeOwner(edgeState);
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
      const parent = await directory.stat();
      const named = await assertPolicyDirectory(edgeState);
      // Proof: init-parent-identity omission lost pre-publication parent refusal in edge-policy.test.ts (exit 1).
      if (
        parent.dev !== named.dev ||
        parent.ino !== named.ino ||
        parent.dev !== initialParent.dev ||
        parent.ino !== initialParent.ino
      )
        throw new Error('edge policy directory changed before publication');
      // Proof: exclusive-init omission overwrote an existing publication; edge-policy.test.ts exited 1.
      // Proof: relative-publication path-open mutation wrote into the swapped foreign
      // directory; edge-policy.test.ts observed foreign publication (exit 1).
      const descriptor = openDirectoryFile(
        directory.fd,
        'edge-policy.json',
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      );
      const created = fstatSync(descriptor);
      try {
        writeFileSync(descriptor, `${JSON.stringify(policy)}\n`);
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
      const published = await lstat(join(edgeState, 'edge-policy.json'));
      if (published.dev !== created.dev || published.ino !== created.ino)
        throw new Error('edge policy publication identity changed');
      return readback;
    } finally {
      await directory.close();
    }
  });
}
