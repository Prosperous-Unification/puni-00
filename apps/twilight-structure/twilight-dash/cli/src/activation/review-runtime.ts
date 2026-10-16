import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import { hashBytes, serializeCanonical } from '@twilight-burokrat/judge';

const Sha256 = /^[0-9a-f]{64}$/;
const RuntimeFile = type({
  path: 'string',
  role: "'program' | 'dependency'",
  identity: Sha256,
  byteLength: 'number.integer >= 0',
}).onUndeclaredKey('reject');
const Closure = type({
  schemaVersion: '1',
  kind: "'review-runtime-closure'",
  parserProgramIdentity: Sha256,
  compilerHostIdentity: Sha256,
  resolutionPolicyIdentity: Sha256,
  files: RuntimeFile.array(),
}).onUndeclaredKey('reject');
export type ReviewRuntimeClosureV1 = typeof Closure.infer;
type FileIdentity = typeof RuntimeFile.infer;

export interface ReviewRuntimeLimits {
  maximumManifestBytes: number;
  maximumEntries: number;
  maximumPathBytes: number;
  maximumReads: number;
  maximumBytes: number;
  maximumProbes: number;
  maximumReadBytes: number;
  maximumOwnedBytes: number;
}
export interface ReviewRuntimeInput {
  runtimeRoot: string;
  candidateRoot: string;
  closureBytes: Uint8Array;
  runtimeClosureIdentity: string;
  limits: ReviewRuntimeLimits;
}
export interface ReviewRuntime {
  readonly closure: Readonly<Omit<ReviewRuntimeClosureV1, 'files'>> & {
    readonly files: readonly Readonly<FileIdentity>[];
  };
  readonly runtimeClosureIdentity: string;
  readFile(file: Readonly<FileIdentity>): Uint8Array;
}

const Owners = new WeakMap<ReviewRuntime, ReadonlyMap<string, Uint8Array>>();

// Proof: root-grammar admitted a lexical ../ root alias.
function assertRoot(path: string): void {
  if (!isAbsolute(path) || resolve(path) !== path || path.includes('\0') || path.includes('\\'))
    throw new Error('runtime root malformed');
}
function contains(parent: string, child: string): boolean {
  return parent === child || child.startsWith(parent === '/' ? '/' : `${parent}/`);
}

/** Opens every directory through a pinned parent descriptor; symlinks at any depth refuse. */
function openDirectory(path: string, chargeProbe: () => void, descriptors: number[]): number {
  chargeProbe();
  let directory = openSync('/', constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  descriptors.push(directory);
  for (const component of path.split('/').filter(Boolean)) {
    chargeProbe();
    directory = openSync(
      `/proc/self/fd/${String(directory)}/${component}`,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    descriptors.push(directory);
  }
  return directory;
}

/**
 * Admits an independently pinned canonical declared closure and captures all its bytes.
 * Installed roots and limits are bootstrap authority. This does not prove transitive closure
 * completeness or authenticate executing code. Reads return copies and share finite lifetime
 * read/allocation budgets with capture; no runtime read reopens a path.
 */
export function readReviewRuntime(input: ReviewRuntimeInput): ReviewRuntime {
  // Proof: limits-snapshot made a later caller limit mutation break a captured owned read.
  const limits = { ...input.limits };
  // Proof: limits-grammar admitted NaN installed ceilings.
  for (const ceiling of [
    limits.maximumManifestBytes,
    limits.maximumEntries,
    limits.maximumPathBytes,
    limits.maximumReads,
    limits.maximumBytes,
    limits.maximumProbes,
    limits.maximumReadBytes,
    limits.maximumOwnedBytes,
  ])
    if (!Number.isSafeInteger(ceiling) || ceiling < 1)
      throw new Error('runtime limit must be a positive safe integer');
  // Proof: manifest-cap admitted a document above its raw byte ceiling.
  if (input.closureBytes.byteLength > limits.maximumManifestBytes)
    throw new Error('runtime manifest ceiling exceeded');
  const source = Buffer.from(input.closureBytes);
  // Proof: schema-root/schema-file admitted undeclared closure/file keys when reject was removed.
  // Proof: utf8-fatal let a raw invalid UTF-8 path reach bootstrap IO when decoding was lossy.
  const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(source));
  // Proof: entry-cap omitted both census fences; maximumEntries=1 was admitted.
  if (
    decoded !== null &&
    typeof decoded === 'object' &&
    'files' in decoded &&
    Array.isArray(decoded.files) &&
    decoded.files.length > limits.maximumEntries
  )
    throw new Error('runtime entry ceiling exceeded');
  const closure = parseOrThrow(Closure, decoded);
  // Proof: independent-pin admitted a foreign digest; canonical-bytes admitted JSON without LF.
  if (
    !Sha256.test(input.runtimeClosureIdentity) ||
    hashBytes(source) !== input.runtimeClosureIdentity ||
    serializeCanonical(closure) !== source.toString('utf8')
  )
    throw new Error('runtime closure identity or canonical bytes differ');
  if (closure.files.length > limits.maximumEntries)
    throw new Error('runtime entry ceiling exceeded');
  // Proof: program-inventory admitted empty and dependency-only inventories.
  if (!closure.files.some((file) => file.role === 'program'))
    throw new Error('runtime program inventory absent');
  let previous: string | undefined;
  const paths = new Set<string>();
  let retained = 0;
  let probes = 0;
  let readBytes = 0;
  const chargeProbe = () => {
    // Proof: probe-cap admitted work beyond maximumProbes=1.
    if (probes >= limits.maximumProbes) throw new Error('runtime probe ceiling exceeded');
    probes += 1;
  };
  let allocated = 0;
  let reads = 0;
  const chargeRead = () => {
    // Proof: read-cap admitted work beyond maximumReads=1.
    if (reads >= limits.maximumReads) throw new Error('runtime read ceiling exceeded');
    reads += 1;
  };
  const chargeBytes = (length: number) => {
    // Proof: allocation-cap admitted content allocation beyond maximumBytes=1.
    if (!Number.isSafeInteger(length) || length > limits.maximumBytes - allocated)
      throw new Error('runtime byte ceiling exceeded');
    allocated += length;
  };
  for (const file of closure.files) {
    // Proof: path-grammar let malformed virtual paths reach bootstrap probes.
    if (
      Buffer.from(file.path, 'utf8').toString('utf8') !== file.path ||
      file.path.includes('\\') ||
      file.path.includes('\0') ||
      file.path.split('/').some((part) => part === '' || part === '.' || part === '..')
    )
      throw new Error('runtime file path malformed');
    // Proof: path-cap let a 150-byte virtual path reach bootstrap probes.
    if (Buffer.byteLength(file.path) > limits.maximumPathBytes)
      throw new Error('runtime path ceiling exceeded');
    // Proof: path-sort let duplicate/reversed manifests reach bootstrap probes.
    if (
      previous !== undefined &&
      (Buffer.compare(Buffer.from(previous), Buffer.from(file.path)) >= 0 ||
        file.path.startsWith(`${previous}/`))
    )
      throw new Error('runtime paths not unique sorted files');
    // Proof: length-safe replaced the named unsafe-length refusal with a later byte refusal.
    if (!Number.isSafeInteger(file.byteLength)) throw new Error('runtime file length malformed');
    // Proof: path-prefix let nonadjacent a, a-b, a/b reach bootstrap IO.
    if (file.path.split('/').some((_, index, parts) => paths.has(parts.slice(0, index).join('/'))))
      throw new Error('runtime paths contain a file ancestor');
    paths.add(file.path);
    // Proof: owned-cap admitted retained allocation beyond maximumOwnedBytes=1.
    if (file.byteLength + 1 > limits.maximumOwnedBytes - retained)
      throw new Error('runtime owned byte ceiling exceeded');
    retained += file.byteLength + 1;
    previous = file.path;
  }
  const { runtimeRoot, candidateRoot } = input;
  assertRoot(runtimeRoot);
  assertRoot(candidateRoot);
  // Proof: root-path-cap admitted long physical roots with short virtual paths.
  if (
    Buffer.byteLength(runtimeRoot) > limits.maximumPathBytes ||
    Buffer.byteLength(candidateRoot) > limits.maximumPathBytes
  )
    throw new Error('runtime root path ceiling exceeded');
  chargeProbe();
  const candidate = realpathSync(candidateRoot);
  // Proof: candidate-overlap admitted equal and containing candidate roots.
  if (contains(candidate, runtimeRoot) || contains(runtimeRoot, candidate))
    throw new Error('runtime candidate overlap');
  const owned = new Map<string, Uint8Array>();
  for (const file of closure.files) {
    const parts = file.path.split('/');
    const leaf = parts.pop();
    if (leaf === undefined) throw new Error('runtime leaf absent');
    const descriptors: number[] = [];
    const failures: unknown[] = [];
    try {
      // Proof: ancestor-symlink admitted a symlinked runtime root without directory O_NOFOLLOW.
      const directory = openDirectory([runtimeRoot, ...parts].join('/'), chargeProbe, descriptors);
      chargeProbe();
      // Proof: leaf-symlink admitted an exact-byte symlink without leaf O_NOFOLLOW;
      // nonblocking held the FIFO child until its controlled deadline without O_NONBLOCK.
      const descriptor = openSync(
        `/proc/self/fd/${String(directory)}/${leaf}`,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      descriptors.push(descriptor);
      chargeProbe();
      const before = fstatSync(descriptor);
      // Proof: file-kind allocated content for a directory before the later read refusal.
      if (!before.isFile()) throw new Error('runtime file unreadable');
      // Proof: preallocation-length allocated/read an already wrong-length file.
      if (before.size !== file.byteLength)
        throw new Error('runtime file identity or length differs');
      chargeBytes(file.byteLength + 1);
      const bytes = Buffer.alloc(file.byteLength + 1);
      let count = 0;
      while (count < bytes.length) {
        chargeRead();
        // Proof: capture-read-bytes admitted content IO beyond maximumReadBytes=1.
        if (bytes.length - count > limits.maximumReadBytes - readBytes)
          throw new Error('runtime read byte ceiling exceeded');
        const length = readSync(descriptor, bytes, count, bytes.length - count, count);
        readBytes += length;
        if (length === 0) break;
        count += length;
      }
      chargeProbe();
      const after = fstatSync(descriptor);
      // Proof: raw-identity admitted edited same-length bytes; stable-stat admitted
      // a same-byte chmod injected during the bounded read when time reconciliation was removed.
      if (
        count !== file.byteLength ||
        hashBytes(bytes.subarray(0, count)) !== file.identity ||
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs
      )
        throw new Error('runtime file identity or length differs');
      owned.set(file.path, bytes.subarray(0, count));
    } catch (cause) {
      let failure = cause;
      if (cause instanceof Error && 'code' in cause)
        failure = new Error(
          cause.code === 'ENOENT' ? 'runtime file absent' : 'runtime file unreadable',
          { cause },
        );
      failures.push(failure);
    } finally {
      for (const open of descriptors.reverse()) {
        try {
          closeSync(open);
        } catch (cause) {
          failures.push(cause);
        }
      }
    }
    if (failures.length === 1) throw failures[0];
    // Proof: cleanup-aggregate lost one of simultaneous injected read/close errors.
    if (failures.length > 1)
      throw new AggregateError(failures, 'runtime capture and cleanup failed');
  }
  // Proof: freeze-file/freeze-files/freeze-closure lost the explicit immutable metadata assertions.
  for (const file of closure.files) Object.freeze(file);
  Object.freeze(closure.files);
  Object.freeze(closure);
  // Proof: freeze-capability lost the explicit frozen capability assertion.
  const capability: ReviewRuntime = Object.freeze({
    closure,
    runtimeClosureIdentity: input.runtimeClosureIdentity,
    readFile(this: ReviewRuntime, file: Readonly<FileIdentity>): Uint8Array {
      // Proof: exact-owner admitted a spread capability with a copied method.
      if (Owners.get(this) !== owned) throw new Error('runtime capability is not owned');
      // Proof: tuple-snapshot returned compiler bytes for a parser tuple with a changing path getter.
      const { path, role, identity, byteLength } = file;
      const expected = closure.files.find((entry) => entry.path === path);
      // Proof: tuple admitted altered role/identity/length fields when their joins were omitted.
      if (
        expected?.role !== role ||
        expected.identity !== identity ||
        expected.byteLength !== byteLength
      )
        throw new Error('runtime file tuple differs');
      const bytes = owned.get(expected.path);
      if (bytes === undefined) throw new Error('runtime owned bytes absent');
      chargeRead();
      // Proof: copy-read-bytes admitted the second copy beyond its lifetime returned-byte cap.
      if (bytes.byteLength > limits.maximumReadBytes - readBytes)
        throw new Error('runtime read byte ceiling exceeded');
      readBytes += bytes.byteLength;
      chargeBytes(bytes.byteLength);
      // Proof: copy-return allowed a caller fill(0) to change a subsequent owned read.
      return Uint8Array.from(bytes);
    },
  });
  Owners.set(capability, owned);
  return capability;
}
