import { lstatSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import type { CheckInvocationManifest } from './check-manifest';
import type { ActivationRequest } from './request';

const Sha256 = /^[0-9a-f]{64}$/;
const RuntimeDescriptor = type({
  schemaVersion: '1',
  kind: "'check-runtime'",
  executableTreeIdentity: Sha256,
  executables: 'string[]',
})
  .onUndeclaredKey('reject')
  // Proof: omitting the host-path predicate returned a plan naming /usr/bin/bun from a frozen runtime.
  .narrow(
    (runtime) =>
      runtime.executables.length > 0 &&
      runtime.executables.every(
        (executable) =>
          executable.length > 0 &&
          !executable.includes('/') &&
          !executable.includes('\\') &&
          !executable.includes('\0'),
      ),
  );
export type CheckRuntimeDescriptor = typeof RuntimeDescriptor.infer;

const SandboxProfile = type({
  // Proof: independently widening namespace, network, capability or descriptor literals returned a plan for the matching forbidden profile.
  schemaVersion: '1',
  kind: "'check-sandbox-profile'",
  namespaces: "'private-all'",
  network: "'none'",
  capabilities: "'drop-all'",
  descriptors: "'stdio-only'",
  readOnlyMounts: 'string[]',
  writableMounts: 'string[]',
  virtualMounts: 'string[]',
  environmentAllowlist: 'string[]',
  wallTimeMilliseconds: 'number.integer>=1',
  cpuTimeMilliseconds: 'number.integer>=1',
  memoryBytes: 'number.integer>=1',
  processCount: 'number.integer>=1',
  maxOutputBytes: 'number.integer>=1',
})
  .onUndeclaredKey('reject')
  // Proof: independent mount/environment and upper resource-bound omissions returned a plan for their forbidden profile.
  .narrow(
    (profile) =>
      serializeCanonical(profile.readOnlyMounts) ===
        serializeCanonical(['candidate-source', 'toolchain-runtime']) &&
      serializeCanonical(profile.writableMounts) ===
        serializeCanonical(['workspace', 'tmp', 'home']) &&
      serializeCanonical(profile.virtualMounts) === serializeCanonical(['proc', 'dev']) &&
      serializeCanonical(profile.environmentAllowlist) ===
        serializeCanonical(['CI', 'LANG', 'LC_ALL', 'TZ']) &&
      profile.wallTimeMilliseconds <= 600_000 &&
      profile.cpuTimeMilliseconds <= 600_000 &&
      profile.memoryBytes <= 4_294_967_296 &&
      profile.processCount <= 64 &&
      profile.maxOutputBytes <= 10_485_760,
  );
export type CheckSandboxProfile = typeof SandboxProfile.infer;

const CandidateSnapshot = type({
  schemaVersion: '1',
  kind: "'candidate-snapshot'",
  requestIdentity: Sha256,
  headSha: /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/,
  // Proof: widening this identity accepted a non-hash snapshot label.
  snapshotIdentity: Sha256,
  root: 'string>=1',
}).onUndeclaredKey('reject');
export type CheckCandidateSnapshot = typeof CandidateSnapshot.infer;

function decodeDescriptor<T>(
  bytes: unknown,
  identity: string,
  schema: { assert: (value: unknown) => asserts value is T },
  label: string,
): T {
  // Proof: removing the size bound returned a plan for a canonical descriptor larger than one MiB.
  if (typeof bytes !== 'string' || bytes.length > 1_048_576)
    throw new Error(`check ${label} malformed`);
  let decoded: unknown;
  try {
    decoded = JSON.parse(bytes) as unknown;
    schema.assert(decoded);
    // Proof: omitting canonical equality accepted pretty-printed bytes under their frozen digest.
    if (serializeCanonical(decoded) !== bytes) throw new Error('noncanonical descriptor');
  } catch (cause) {
    throw new Error(`check ${label} malformed`, { cause });
  }
  // Proof: omitting digest equality accepted another canonical runtime under the frozen command's runtime identity.
  if (!Sha256.test(identity) || hashBytes(bytes) !== identity)
    throw new Error(`check ${label} differs from frozen identity`);
  return decoded;
}

/** Validates one immutable runtime descriptor without granting process authority. */
export function decodeCheckRuntime(bytes: unknown, identity: string): CheckRuntimeDescriptor {
  return decodeDescriptor(bytes, identity, RuntimeDescriptor, 'runtime');
}

/** Validates the fixed logical isolation policy; installed support is checked before a later launch. */
export function decodeCheckSandboxProfile(bytes: unknown, identity: string): CheckSandboxProfile {
  return decodeDescriptor(bytes, identity, SandboxProfile, 'sandbox profile');
}

function inspectDirectory(root: string, relative: string): void {
  const paths =
    relative === '.'
      ? [root]
      : [
          root,
          ...relative
            .split('/')
            .map((_, index, segments) => join(root, ...segments.slice(0, index + 1))),
        ];
  for (const path of paths) {
    let entry;
    try {
      entry = lstatSync(path);
    } catch (cause) {
      throw new Error('check candidate cwd unreadable', { cause });
    }
    // Proof: omitting the lstat directory condition returned a plan for a symlinked cwd or snapshot root.
    if (!entry.isDirectory()) throw new Error('check candidate cwd is not a contained directory');
  }
}

/** Validates an independently selected snapshot and both command cwd paths before an inert plan returns. */
export function inspectCheckCandidateSnapshot(
  input: unknown,
  request: ActivationRequest,
  manifest: CheckInvocationManifest,
): CheckCandidateSnapshot {
  const snapshot = parseOrThrow(CandidateSnapshot, input);
  // Proof: independently omitting request or head equality returned a plan for a foreign snapshot.
  if (snapshot.requestIdentity !== request.requestIdentity || snapshot.headSha !== request.headSha)
    throw new Error('check candidate snapshot differs from current request');
  // Proof: omitting absolute-root validation changed the mounted relative-root refusal to a later unreadable-path diagnostic.
  if (!isAbsolute(snapshot.root)) throw new Error('check candidate snapshot root is not absolute');
  inspectDirectory(snapshot.root, manifest.cwd);
  // Proof: omitting probe containment returned a plan whose probe cwd traversed a symlink.
  if (manifest.skipProbe !== null) inspectDirectory(snapshot.root, manifest.skipProbe.cwd);
  return snapshot;
}
