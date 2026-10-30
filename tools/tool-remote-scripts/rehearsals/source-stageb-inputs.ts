import { createHash } from 'node:crypto';
import { type BigIntStats, close, constants, fstat, fsync, open, read, write } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isProxy } from 'node:util/types';

import { decodeSourceReview, type SourceReview } from './source-stageb-bootstrap';

declare const SOURCE_STAGEB_REVIEW_LITERAL: string;
const embeddedSourceReview =
  typeof SOURCE_STAGEB_REVIEW_LITERAL === 'undefined' ? undefined : SOURCE_STAGEB_REVIEW_LITERAL;
const slots = [
  'prerequisites',
  'source-tree',
  'dependencies',
  'configuration',
  'startup-manifest',
  'openapi',
  'migration-manifest',
  'installed-authority-manifest',
  'solver-artifacts',
] as const;
type Slot = (typeof slots)[number];
type Artifact = Readonly<{ slot: Slot; bytes: number; sha256: string }>;
type Index = Readonly<{
  format: 'source-stageb-inputs';
  version: 1;
  implementationSha: string;
  workflowSha: string;
  nonce: string;
  sourceSha: string;
  recipientFingerprint: string;
  fixtureAuthoritySha256: string;
  rosterPolicySha256: string;
  archivePolicySha256: string;
  artifacts: readonly Artifact[];
}>;
declare const inputBrand: unique symbol;
/** Original reviewed-input identity; does not confer native resource ownership. */
export interface SourceInputs {
  readonly [inputBrand]: true;
}
/** Detached evidence. Byte copies are mutable; the original token retains admission authority. */
export interface SourceInputInspection {
  readonly index: Index;
  readonly review: SourceReview;
  readonly manifestBytes: Uint8Array;
  readonly reviewBytes: Uint8Array;
  readonly reviewSha256: string;
  readonly originalDeadline: number;
}
interface Lifetime {
  review: SourceReview;
  index: Index;
  manifestBytes: Uint8Array;
  reviewBytes: Uint8Array;
  reviewSha256: string;
  deadline: number;
  live: boolean;
  descriptors: Set<number>;
  closing?: Promise<void>;
}
const lifetimes = new WeakMap<SourceInputs, Lifetime>();
let invoked = false;
const joinNames = [
  'implementationSha',
  'workflowSha',
  'nonce',
  'sourceSha',
  'recipientFingerprint',
  'fixtureAuthoritySha256',
  'rosterPolicySha256',
  'archivePolicySha256',
] as const;
function refuse(message: string): never {
  throw new Error(`source inputs ${message}`);
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
    refuse('object refused');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  // Proof: closed-index-fields omission let the actual main claim an index with an extra field.
  if (Reflect.ownKeys(descriptors).length !== names.length) refuse('fields refused');
  const checked: Record<string, unknown> = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)
      refuse('field refused');
    checked[name] = descriptor.value;
  }
  return checked;
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) refuse('text refused');
  return value;
}
function hex(value: unknown, length: number): string {
  const checked = text(value, /^[0-9a-f]+$/);
  // Proof: artifact-digest-length omission admitted a one-character digest in the actual index consumer.
  if (checked.length !== length) refuse('hex refused');
  return checked;
}
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    refuse('integer refused');
  return value;
}
function decode(bytes: Uint8Array, limit: number): unknown {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 1 ||
    bytes.length > limit ||
    bytes[0] === 239
  )
    refuse('encoding refused');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function parseIndex(bytes: Uint8Array, review: SourceReview): Index {
  // Proof: embedded-hash omission admitted same-owner valid JSON with changed artifact bytes.
  if (hash(bytes) !== review.inputManifestSha256) refuse('manifest hash refused');
  const checked = fields(decode(bytes, 8388608), ['format', 'version', ...joinNames, 'artifacts']);
  if (checked['format'] !== 'source-stageb-inputs' || checked['version'] !== 1)
    refuse('index version refused');
  // Proof: each of the eight index joins was independently omitted; closed-index main negatives admitted claims.
  for (const name of joinNames) if (checked[name] !== review[name]) refuse('index join refused');
  if (!Array.isArray(checked['artifacts']) || checked['artifacts'].length !== slots.length)
    refuse('artifact roster refused');
  const artifacts = checked['artifacts'].map((claim: unknown, ordinal: number) => {
    const checkedArtifact = fields(claim, ['slot', 'bytes', 'sha256']);
    const slot = slots.at(ordinal);
    // Proof: artifact-role-order omission admitted the reversed fixed roster through the actual main.
    if (slot === undefined || checkedArtifact['slot'] !== slot) refuse('artifact slot refused');
    return Object.freeze({
      slot,
      // Proof: artifact-byte-bound omission admitted zero-byte metadata in the actual main.
      bytes: integer(checkedArtifact['bytes'], 1, 17179869184),
      sha256: hex(checkedArtifact['sha256'], 64),
    });
  });
  return Object.freeze({
    format: 'source-stageb-inputs',
    version: 1,
    implementationSha: review.implementationSha,
    workflowSha: review.workflowSha,
    nonce: review.nonce,
    sourceSha: review.sourceSha,
    recipientFingerprint: review.recipientFingerprint,
    fixtureAuthoritySha256: review.fixtureAuthoritySha256,
    rosterPolicySha256: review.rosterPolicySha256,
    archivePolicySha256: review.archivePolicySha256,
    artifacts: Object.freeze(artifacts),
  });
}
function stat(fd: number): Promise<BigIntStats> {
  return new Promise((resolve, reject) => {
    fstat(fd, { bigint: true }, (failure, identity) => {
      if (failure === null) {
        resolve(identity);
      } else {
        reject(failure);
      }
    });
  });
}
function sync(fd: number): Promise<void> {
  return new Promise((resolve, reject) => {
    fsync(fd, (failure) => {
      if (failure === null) {
        resolve();
      } else {
        reject(failure);
      }
    });
  });
}
function openLeaf(path: string, flags: number): Promise<number> {
  return new Promise((resolve, reject) => {
    open(path, flags, 384, (failure, fd) => {
      if (failure === null) {
        resolve(fd);
      } else {
        reject(failure);
      }
    });
  });
}
// Proof: input-unreadable-cause omission lost injected EACCES; the actual reader consumer rejected that loss.
function readAt(fd: number, bytes: Uint8Array, offset: number): Promise<number> {
  return new Promise((resolve, reject) => {
    read(fd, bytes, offset, bytes.length - offset, offset, (failure, count) => {
      if (failure === null) {
        resolve(count);
      } else {
        reject(failure);
      }
    });
  });
}
function writeAt(fd: number, bytes: Uint8Array, offset: number): Promise<number> {
  return new Promise((resolve, reject) => {
    write(fd, bytes, offset, bytes.length - offset, offset, (failure, count) => {
      if (failure === null) {
        resolve(count);
      } else {
        reject(failure);
      }
    });
  });
}
async function settle(descriptors: Set<number>): Promise<unknown[]> {
  const failures: unknown[] = [];
  for (const fd of descriptors) {
    descriptors.delete(fd);
    try {
      await new Promise<void>((resolve, reject) => {
        close(fd, (failure) => {
          if (failure === null) {
            resolve();
          } else {
            reject(failure);
          }
        });
      });
    } catch (failure) {
      failures.push(failure);
    }
  }
  return failures;
}
async function settleOne(descriptors: Set<number>, fd: number): Promise<void> {
  if (!descriptors.delete(fd)) refuse('descriptor ownership refused');
  await new Promise<void>((resolve, reject) => {
    close(fd, (failure) => {
      if (failure === null) {
        resolve();
      } else {
        reject(failure);
      }
    });
  });
}
function sameIdentity(before: BigIntStats, after: BigIntStats): void {
  for (const name of [
    'dev',
    'ino',
    'size',
    'mode',
    'uid',
    'gid',
    'nlink',
    'mtimeNs',
    'ctimeNs',
  ] as const)
    if (before[name] !== after[name]) refuse('identity changed');
}
// Proof: separate single-link-fd7/private-file-mode omissions admitted actual hardlinked/group-writable input.
function assertFile(identity: BigIntStats, limit: number): number {
  if (
    !identity.isFile() ||
    identity.nlink !== 1n ||
    (identity.mode & 18n) !== 0n ||
    identity.size < 1n ||
    identity.size > BigInt(limit)
  )
    refuse('file refused');
  return Number(identity.size);
}
async function readExact(fd: number, before: BigIntStats, limit: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(assertFile(before, limit));
  let offset = 0;
  while (offset < bytes.length) {
    const count = await readAt(fd, bytes, offset);
    if (count < 1) refuse('premature eof');
    offset += count;
  }
  // Proof: input-identity-continuity omission admitted a changed inode injected after the real positional read.
  sameIdentity(before, await stat(fd));
  return bytes;
}
async function assertRegistry(review: SourceReview): Promise<void> {
  const identity = await stat(8);
  const registry = review.registry;
  if (
    !identity.isDirectory() ||
    identity.dev.toString() !== registry.device ||
    // Proof: registry-inode omission admitted a different actual directory with the same custody scope.
    identity.ino.toString() !== registry.inode ||
    identity.uid !== BigInt(registry.uid) ||
    identity.gid !== BigInt(registry.gid) ||
    (identity.mode & 4095n) !== 448n ||
    process.geteuid?.() !== registry.uid ||
    process.getegid?.() !== registry.gid
  )
    refuse('registry tuple refused');
}
function assertDeadline(review: SourceReview, deadline: number): void {
  const now = Date.now();
  if (performance.now() >= deadline || now < review.notBefore || now >= review.notAfter)
    refuse('deadline refused');
}
function getLifetime(token: SourceInputs): Lifetime {
  const lifetime = lifetimes.get(token);
  if (lifetime === undefined) refuse('original token required');
  return lifetime;
}
function assertLive(lifetime: Lifetime): void {
  if (!lifetime.live) refuse('closed');
  // Proof: live-original-deadline omission allowed inspection after the original I cutoff in the actual A1/J consumer.
  assertDeadline(lifetime.review, lifetime.deadline);
}

/** Owns fixed FD7/8 once. All admitted IO settles; partial publication permanently burns the nonce. */
export async function readSourceInputs(): Promise<SourceInputs> {
  // Proof: duplicate-entry omission performed a second read while the first positional read was held.
  if (invoked) refuse('already invoked');
  invoked = true;
  const enteredAt = performance.now();
  const enteredWall = Date.now();
  const descriptors = new Set<number>();
  try {
    if (embeddedSourceReview === undefined) refuse('missing embedded review');
    const reviewBytes = new TextEncoder().encode(embeddedSourceReview);
    const review = decodeSourceReview(reviewBytes);
    descriptors.add(7);
    descriptors.add(8);
    const deadline = enteredAt + Math.min(review.maximumDurationMs, review.notAfter - enteredWall);
    assertDeadline(review, deadline);
    const descriptorFlags = await readFile('/proc/self/fdinfo/7', 'utf8');
    const flags = /^flags:\s+([0-7]+)$/m.exec(descriptorFlags)?.[1];
    // Linux procfs reports the actual open access flags; no caller hash/owner claim substitutes for this boundary.
    // Proof: readonly-fd7 omission admitted the actual O_RDWR input descriptor with unchanged approved bytes.
    if (flags === undefined || (BigInt(`0o${flags}`) & 3n) !== 0n)
      refuse('readonly input required');
    const inputIdentity = await stat(7);
    const manifestBytes = await readExact(7, inputIdentity, 8388608);
    const index = parseIndex(manifestBytes, review);
    await assertRegistry(review);
    assertDeadline(review, deadline);
    const reviewSha256 = hash(reviewBytes);
    const claimBytes = new TextEncoder().encode(
      JSON.stringify({
        format: 'source-stageb-claim',
        version: 1,
        scope: review.registry.scope,
        nonce: review.nonce,
        implementationSha: review.implementationSha,
        workflowSha: review.workflowSha,
        sourceSha: review.sourceSha,
        reviewSha256,
        inputManifestSha256: review.inputManifestSha256,
      }),
    );
    // Proof: nonce-only-key fault let a coherent workflow/manifest change claim the same nonce again.
    const claimPath = `/proc/self/fd/8/source-stageb-${review.nonce}.claim`;
    const writer = await openLeaf(
      claimPath,
      // Proof: exclusive-create omission admitted a completed replay through the actual fixed main.
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    );
    descriptors.add(writer);
    const writerIdentity = await stat(writer);
    if (
      !writerIdentity.isFile() ||
      writerIdentity.nlink !== 1n ||
      (writerIdentity.mode & 4095n) !== 384n ||
      writerIdentity.uid !== BigInt(review.registry.uid) ||
      writerIdentity.gid !== BigInt(review.registry.gid)
    )
      refuse('claim identity refused');
    let offset = 0;
    while (offset < claimBytes.length) {
      const count = await writeAt(writer, claimBytes, offset);
      if (count < 1) refuse('claim write refused');
      offset += count;
    }
    // Proof: file-sync omission returned a token despite the controlled real-writer fsync failure dependency.
    await sync(writer);
    // Proof: directory-sync omission returned a token despite the controlled registry fsync failure dependency.
    await sync(8);
    const writtenIdentity = await stat(writer);
    for (const name of ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink'] as const)
      if (writtenIdentity[name] !== writerIdentity[name]) refuse('claim writer changed');
    if (writtenIdentity.size !== BigInt(claimBytes.length)) refuse('claim length refused');
    const reader = await openLeaf(claimPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    descriptors.add(reader);
    const readerIdentity = await stat(reader);
    // Proof: readback-inode omission admitted a separately reopened reader with a controlled inode fault.
    sameIdentity(writtenIdentity, readerIdentity);
    // Proof: readback-bytes omission admitted a changed byte injected into the actual reopened read.
    const readback = await readExact(reader, readerIdentity, 16384);
    if (
      readback.length !== claimBytes.length ||
      !readback.every((byte, ordinal) => byte === claimBytes[ordinal])
    )
      refuse('claim readback refused');
    sameIdentity(writtenIdentity, await stat(writer));
    await assertRegistry(review);
    await settleOne(descriptors, reader);
    await settleOne(descriptors, writer);
    // Proof: final-input-deadline omission admitted a token after held sync/FD7 close or wall-clock expiry.
    await settleOne(descriptors, 7);
    assertDeadline(review, deadline);
    // Boundary: only this module creates this unforgeable WeakMap identity; the interface brand is erased.
    const token = Object.freeze({}) as SourceInputs;
    lifetimes.set(token, {
      review,
      index,
      manifestBytes,
      reviewBytes,
      reviewSha256,
      deadline,
      live: true,
      descriptors,
    });
    return token;
  } catch (primary) {
    const cleanup = await settle(descriptors);
    // Proof: round1 primary-cause omission lost cause identity while errors still retained primary plus cleanup.
    throw new AggregateError([primary, ...cleanup], 'private source inputs failed', {
      cause: primary,
    });
  }
}
/** Copies exact authenticated bytes without reopening a path or renewing the original deadline. */
export function inspectSourceInputs(token: SourceInputs): SourceInputInspection {
  const lifetime = getLifetime(token);
  assertLive(lifetime);
  const projection = Object.freeze({
    index: lifetime.index,
    review: lifetime.review,
    // Proof: detached-manifest-copy omission let a returned mutation corrupt subsequent inspection and real A1 handoff.
    manifestBytes: lifetime.manifestBytes.slice(),
    // Proof: detached-review-copy omission corrupted the next exact review-byte inspection after returned-copy mutation.
    reviewBytes: lifetime.reviewBytes.slice(),
    reviewSha256: lifetime.reviewSha256,
    originalDeadline: lifetime.deadline,
  });
  assertLive(lifetime);
  return projection;
}
/** Joins bounded producer observations; does not attest that a producer actually read bytes. */
export function assertSourceInputArtifact(
  token: SourceInputs,
  slot: Slot,
  observedBytes: number,
  observedSha256: string,
): void {
  const lifetime = getLifetime(token);
  assertLive(lifetime);
  const artifact = lifetime.index.artifacts.find((artifact) => artifact.slot === slot);
  if (artifact === undefined) refuse('artifact join refused');
  if (
    artifact.bytes !== integer(observedBytes, 1, 17179869184) ||
    artifact.sha256 !== hex(observedSha256, 64)
  )
    refuse('artifact join refused');
  assertLive(lifetime);
}
/** Invalidates only an original token and memoizes exact once descriptor settlement, including failure. */
export function closeSourceInputs(token: SourceInputs): Promise<void> {
  let lifetime: Lifetime;
  try {
    // Proof: foreign-close-before-ownership fault closed the held original descriptors; foreign-token consumer caught interference.
    lifetime = getLifetime(token);
  } catch (failure) {
    const cause =
      failure instanceof Error
        ? failure
        : new Error('source inputs original token refusal', { cause: failure });
    return Promise.reject(cause);
  }
  // Proof: memoized-close omission returned another promise after genuine close failure; original consumer rejected it.
  if (lifetime.closing !== undefined) return lifetime.closing;
  lifetime.live = false;
  lifetime.manifestBytes = new Uint8Array();
  lifetime.reviewBytes = new Uint8Array();
  lifetime.closing = settle(lifetime.descriptors).then((failures) => {
    if (failures.length > 0)
      throw new AggregateError(failures, 'private source inputs close failed');
  });
  return lifetime.closing;
}
