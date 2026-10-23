import type { Stats } from 'node:fs';
import { closeSync, constants, fstatSync, fsyncSync, writeFileSync } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { openDirectoryFile } from './directory-file';
import { assertNoEdgeOwner } from './edge-admission';
import { withCanonicalLock } from './lock';

export interface OrdinaryEdgePolicy {
  format: 'dependency-edge-policy';
  version: 1;
  phase: 'ordinary';
  edgeState: string;
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
  const parent = await assertPolicyDirectory(edgeState);
  const path = join(edgeState, 'edge-policy.json');
  // Proof: nofollow-open and nonblocking-open omissions lost ELOOP or hung FIFO refusal
  // in edge-policy.test.ts (each exit 1).
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = await descriptor.stat();
    const named = await lstat(path);
    // Proof: bounded-policy and opened-identity omissions admitted a valid oversized
    // document or lost the opened-path refusal in edge-policy.test.ts (each exit 1).
    if (
      !opened.isFile() ||
      !named.isFile() ||
      opened.dev !== named.dev ||
      opened.ino !== named.ino ||
      opened.size < 1 ||
      opened.size > 4096
    )
      throw new Error('invalid edge policy file identity, type or size');
    const bytes = new Uint8Array(4097);
    const { bytesRead } = await descriptor.read(bytes, 0, bytes.length, 0);
    const final = await descriptor.stat();
    const current = await lstat(path);
    // Proof: final-identity omission admitted replaced path and changed metadata
    // in edge-policy.test.ts (exit 1).
    if (
      bytesRead !== opened.size ||
      final.dev !== opened.dev ||
      final.ino !== opened.ino ||
      final.size !== opened.size ||
      final.mtimeMs !== opened.mtimeMs ||
      final.ctimeMs !== opened.ctimeMs ||
      current.dev !== opened.dev ||
      current.ino !== opened.ino ||
      current.size !== opened.size ||
      current.mtimeMs !== opened.mtimeMs ||
      current.ctimeMs !== opened.ctimeMs
    )
      throw new Error('edge policy changed while reading');
    // Proof: read-parent-identity omission accepted a swapped directory with a hardlinked
    // policy in edge-policy.test.ts (exit 1).
    const currentParent = await assertPolicyDirectory(edgeState);
    if (parent.dev !== currentParent.dev || parent.ino !== currentParent.ino)
      throw new Error('edge policy directory changed while reading');
    let value: unknown;
    try {
      value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead)),
      );
    } catch {
      // Proof: private-parse omission exposed malformed-file sentinel bytes in edge-policy.test.ts (exit 1).
      throw new Error('invalid edge policy JSON or UTF-8');
    }
    return decodeOrdinaryEdgePolicy(value, edgeState);
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
