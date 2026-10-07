import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';

const Sha256 = /^[0-9a-f]{64}$/;

/** A modeled refusal from the independently supplied content-addressed registry. */
export class CheckManifestRefusal extends Error {}
// Proof: omitting argv, contained cwd, safe env or time bound validation let
// the mounted selected-check preparation return a changed invocation descriptor.
const Command = type('string[]').narrow(
  (argv) => argv.length > 0 && argv.every((part) => part.length > 0 && !part.includes('\0')),
);
const Environment = type({ '[string]': 'string' }).narrow((env) =>
  Object.entries(env).every(
    ([name, value]) => ['CI', 'LANG', 'LC_ALL', 'TZ'].includes(name) && !value.includes('\0'),
  ),
);
// Proof: omitting the NUL check accepted canonical main and skip-probe cwd
// manifests in separate mounted preparation tests.
const RelativeDirectory = type('string').narrow(
  (path) =>
    path === '.' ||
    (path.length > 0 &&
      !path.startsWith('/') &&
      !path.includes('\0') &&
      !path.includes('\\') &&
      path
        .split('/')
        .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')),
);

const CheckInvocationManifest = type({
  schemaVersion: '1',
  kind: "'check-invocation'",
  argv: Command,
  cwd: RelativeDirectory,
  env: Environment,
  skipChannel: "'none'|'bun-test'",
  skipProbe: type({
    argv: Command,
    cwd: RelativeDirectory,
    env: Environment,
  })
    .onUndeclaredKey('reject')
    .or('null'),
  toolchainIdentity: Sha256,
  sandboxProfileIdentity: Sha256,
  // Proof: omitting the upper bound returned a descriptor with a 600001 ms limit.
  timeoutMilliseconds: type('number.integer>=1').narrow((milliseconds) => milliseconds <= 600_000),
  // Proof: independent lower and upper omissions accepted 0 and 10485761 byte caps.
  maxOutputBytes: type('number.integer>=1').narrow((bytes) => bytes <= 10_485_760),
}).onUndeclaredKey('reject');

export type CheckInvocationManifest = typeof CheckInvocationManifest.infer;

/**
 * Validates immutable invocation bytes from an independently controlled manifest resolver.
 * This does not authorize process launch; dispatch needs a separate durable reservation.
 */
export function decodeCheckInvocationManifest(
  bytes: unknown,
  identity: string,
): CheckInvocationManifest {
  if (typeof bytes !== 'string') throw new Error('check invocation manifest malformed');
  let manifest: CheckInvocationManifest;
  try {
    manifest = parseOrThrow(CheckInvocationManifest, JSON.parse(bytes) as unknown);
    // Proof: omitting canonical equality accepted alternate JSON bytes for the frozen command.
    if (serializeCanonical(manifest) !== bytes) {
      throw new Error('check invocation manifest bytes are not canonical');
    }
  } catch (cause) {
    throw new Error('check invocation manifest malformed', { cause });
  }
  // Proof: omitting digest equality accepted substituted argv under the selected command identity.
  if (!Sha256.test(identity) || hashBytes(bytes) !== identity) {
    throw new Error('check invocation manifest differs from frozen command');
  }
  return manifest;
}

function manifestPath(registry: string, identity: string): string {
  if (!Sha256.test(identity))
    throw new CheckManifestRefusal('check invocation manifest identity malformed');
  let root;
  try {
    root = lstatSync(registry);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      throw new CheckManifestRefusal('check invocation registry absent', { cause });
    }
    throw new CheckManifestRefusal('check invocation registry unreadable', { cause });
  }
  // Proof: omitting the directory check accepted a symlinked registry root.
  if (!root.isDirectory()) {
    throw new CheckManifestRefusal('check invocation registry unreadable');
  }
  return join(registry, `${identity}.json`);
}

/** Reads one exact content-addressed manifest; the deployment owns the registry directory. */
export function readCheckInvocationManifest(registry: string, identity: string): string {
  const path = manifestPath(registry, identity);
  let descriptor: number;
  try {
    // Proof: omitting O_NOFOLLOW accepted an entry symlink outside the registry;
    // omitting O_NONBLOCK made the mounted FIFO refusal time out before fstat.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      throw new CheckManifestRefusal('check invocation manifest absent', { cause });
    }
    throw new CheckManifestRefusal('check invocation manifest unreadable', { cause });
  }
  try {
    const entry = fstatSync(descriptor);
    // Proof: omitting the file-type check changed the FIFO's named unreadable
    // refusal to malformed (diagnostic only); omitting the byte cap accepted
    // an oversized canonical entry as a prepared descriptor.
    if (!entry.isFile() || entry.size > 1_048_576) {
      throw new CheckManifestRefusal('check invocation manifest unreadable');
    }
    return readFileSync(descriptor, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

/** Writes a selected manifest once; an occupied identity must retain exactly the same bytes. */
export function storeCheckInvocationManifest(registry: string, candidate: unknown): string {
  const manifest = parseOrThrow(CheckInvocationManifest, candidate);
  const bytes = serializeCanonical(manifest);
  // Proof: omitting this bound returned an identity and created a >1 MiB entry
  // that the reader then refused; the mounted writer test requires no entry.
  if (Buffer.byteLength(bytes, 'utf8') > 1_048_576) {
    throw new CheckManifestRefusal('check invocation manifest too large');
  }
  const identity = hashBytes(bytes);
  const path = manifestPath(registry, identity);
  try {
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST')) {
      throw new Error('check invocation manifest write failed', { cause });
    }
    // Proof: omitting exact occupied-byte equality returned success for a corrupted entry.
    if (readCheckInvocationManifest(registry, identity) !== bytes) {
      throw new Error('check invocation manifest conflicts', { cause });
    }
  }
  return identity;
}
