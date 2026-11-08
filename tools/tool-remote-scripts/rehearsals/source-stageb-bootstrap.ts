import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';
type Registry = Readonly<{
  scope: string;
  device: string;
  inode: string;
  uid: number;
  gid: number;
  mode: number;
}>;
export type SourceReview = Readonly<{
  format: 'source-stageb-review';
  version: 1;
  implementationSha: string;
  workflowSha: string;
  nonce: string;
  inputManifestSha256: string;
  sourceSha: string;
  recipient: string;
  recipientFingerprint: string;
  fixtureAuthoritySha256: string;
  rosterPolicySha256: string;
  archivePolicySha256: string;
  registry: Registry;
  notBefore: number;
  notAfter: number;
  maximumDurationMs: number;
}>;

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
const reviewNames = [
  'format',
  'version',
  ...joinNames,
  'inputManifestSha256',
  'recipient',
  'registry',
  'notBefore',
  'notAfter',
  'maximumDurationMs',
];
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
  // Proof: closed-review-fields omission admitted the extra field in the actual proposed-review decoder.
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
/** Pure closed proposed-review parsing; grants no approval or token authority. @internal */
export function decodeSourceReview(bytes: Uint8Array): SourceReview {
  const checked = fields(decode(bytes, 16384), reviewNames);
  if (checked['format'] !== 'source-stageb-review' || checked['version'] !== 1)
    refuse('review version refused');
  const registry = fields(checked['registry'], ['scope', 'device', 'inode', 'uid', 'gid', 'mode']);
  if (registry['mode'] !== 448) refuse('registry mode refused');
  const decimal = (value: unknown): string => {
    const claim = text(value, /^(0|[1-9][0-9]{0,19})$/);
    if (BigInt(claim) > 18446744073709551615n) refuse('registry identity refused');
    return claim;
  };
  const recipient = text(checked['recipient'], /^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/);
  // Proof: recipient-fingerprint omission admitted the actual main with a changed embedded recipient and original index.
  if (hash(recipient) !== checked['recipientFingerprint']) refuse('recipient fingerprint refused');
  const notBefore = integer(checked['notBefore']);
  const notAfter = integer(checked['notAfter'], notBefore + 1);
  return Object.freeze({
    format: 'source-stageb-review',
    version: 1,
    implementationSha: hex(checked['implementationSha'], 40),
    workflowSha: hex(checked['workflowSha'], 40),
    nonce: hex(checked['nonce'], 32),
    inputManifestSha256: hex(checked['inputManifestSha256'], 64),
    sourceSha: hex(checked['sourceSha'], 40),
    recipient,
    recipientFingerprint: hex(checked['recipientFingerprint'], 64),
    fixtureAuthoritySha256: hex(checked['fixtureAuthoritySha256'], 64),
    rosterPolicySha256: hex(checked['rosterPolicySha256'], 64),
    archivePolicySha256: hex(checked['archivePolicySha256'], 64),
    registry: Object.freeze({
      scope: hex(registry['scope'], 32),
      device: decimal(registry['device']),
      inode: decimal(registry['inode']),
      uid: integer(registry['uid']),
      gid: integer(registry['gid']),
      mode: 448,
    }),
    notBefore,
    notAfter,
    // Proof: review-duration-bound fault admitted 600001ms in the actual decoder/assembly consumer.
    maximumDurationMs: integer(checked['maximumDurationMs'], 1, 600000),
  });
}

/** Reviewable ordinary bundle bytes; assembly conveys no execution permission or approval. */
export interface SourceBootstrapArtifact {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly reviewSha256: string;
  readonly maps: readonly Readonly<{ path: string; bytes: Uint8Array; sha256: string }>[];
  readonly runtimeImports: readonly string[];
}
const entry = `import { readSourceInputs, inspectSourceInputs, assertSourceInputArtifact, closeSourceInputs } from 'source-stageb:inputs';
import { fstat, write, close } from 'node:fs';
import { Writable } from 'node:stream';
export { readSourceInputs, inspectSourceInputs, assertSourceInputArtifact, closeSourceInputs };
if (import.meta.main) {
  const statOutput = () => new Promise((resolve, reject) => fstat(6, { bigint: true }, (failure, identity) => failure ? reject(failure) : resolve(identity)));
  const original = await statOutput();
  // Proof: output-eligibility omission touched/claimed with a regular FD6; the actual main negative observed the change.
  if (!original.isFIFO() && !original.isSocket()) throw new Error('private source component output refused');
  let owned = true; let stream; let streamClosed; let streamFailure; let closeFailure; let primary; let inspection;
  const sameOutput = async () => {
    const current = await statOutput();
    // Proof: round1 comparison omission changed before-write bytes and attempted a forbidden before-close; both consumers RED.
    if (current.dev !== original.dev || current.ino !== original.ino || (current.mode & 61440n) !== (original.mode & 61440n)) throw new Error('private source component output replaced');
  };
  const deadline = () => {
    if (inspection === undefined || performance.now() >= inspection.originalDeadline || Date.now() < inspection.review.notBefore || Date.now() >= inspection.review.notAfter) throw new Error('private source component deadline exceeded');
  };
  try {
    // Proof: output-access-preflight omission published a nonce claim on an actual read-only FIFO before downstream write refusal.
    await new Promise((resolve, reject) => write(6, Buffer.alloc(0), 0, 0, null, (failure, count) => failure ? reject(failure) : count === 0 ? resolve() : reject(new Error('private source component preflight refused'))));
    const token = await readSourceInputs();
    let inputFailure;
    try { inspection = inspectSourceInputs(token); } catch (failure) { inputFailure = failure; }
    try { await closeSourceInputs(token); } catch (failure) { if (inputFailure !== undefined) throw new AggregateError([inputFailure, failure], 'private source component input settlement failed'); throw failure; }
    if (inputFailure !== undefined) throw inputFailure;
    deadline(); await sameOutput(); deadline();
    const body = Buffer.from(JSON.stringify({ kind: 'source-inputs-component', observation: 'verified-and-closed' }), 'utf8');
    if (body.length < 1 || body.length > 256) throw new Error('private source component frame refused');
    const frame = Buffer.alloc(4 + body.length); frame.writeUInt32BE(body.length); body.copy(frame, 4);
    stream = new Writable({
      write(chunk, encoding, callback) {
        let offset = 0;
        const advance = () => write(6, chunk, offset, chunk.length - offset, null, (failure, count) => {
          if (failure) return callback(failure);
          if (count < 1) return callback(new Error('private source component short write'));
          offset += count; if (offset === chunk.length) callback(); else advance();
        });
        advance();
      },
      destroy(failure, callback) {
        // Proof: round1 cleanup-check omission yielded forbiddenCloseAttempts=1 after independently completed frame write.
        sameOutput().then(async () => {
          if (!owned) throw new Error('private source component output already settled');
          owned = false;
          await new Promise((resolve, reject) => close(6, cause => cause ? reject(cause) : resolve()));
        }).then(() => callback(failure), cause => { closeFailure = cause; callback(failure === null ? cause : new AggregateError([failure, cause], 'private source component output settlement failed')); });
      }
    });
    streamClosed = new Promise(resolve => stream.once('close', resolve));
    stream.on('error', failure => { streamFailure = failure; });
    await new Promise((resolve, reject) => stream.write(frame, failure => failure ? reject(failure) : resolve()));
    deadline();
    await new Promise((resolve, reject) => { stream.once('error', reject); stream.end(resolve); });
    deadline();
  } catch (failure) { primary = failure; }
  const cleanup = [];
  if (stream !== undefined) {
    stream.destroy(); await streamClosed;
    if (closeFailure !== undefined) cleanup.push(closeFailure);
    if (streamFailure !== undefined && streamFailure !== primary && streamFailure !== closeFailure) cleanup.push(streamFailure);
  } else {
    try { await sameOutput(); if (owned) { owned = false; await new Promise((resolve, reject) => close(6, failure => failure ? reject(failure) : resolve())); } } catch (failure) { cleanup.push(failure); }
  }
  if (primary !== undefined || cleanup.length !== 0) throw new AggregateError([...(primary === undefined ? [] : [primary]), ...cleanup], 'private source component failed');
  // Proof: final-output-deadline omission let held actual output close finish after expiry and satisfy frame plus child close0.
  deadline();
}`;

/** Deterministic fixed-entry assembly. The returned digest requires separate external approval. */
export async function buildSourceBootstrap(
  proposedReviewBytes: Uint8Array,
): Promise<SourceBootstrapArtifact> {
  if (isProxy(proposedReviewBytes) || !(proposedReviewBytes instanceof Uint8Array))
    refuse('review bytes refused');
  const byteLength: unknown = Reflect.get(Uint8Array.prototype, 'byteLength', proposedReviewBytes);
  if (typeof byteLength !== 'number' || byteLength < 1 || byteLength > 16384)
    refuse('review byte bound refused');
  const prototype: unknown = Object.getPrototypeOf(proposedReviewBytes);
  if (
    (prototype !== Uint8Array.prototype && prototype !== Buffer.prototype) ||
    Reflect.ownKeys(proposedReviewBytes).some(
      (key) => typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key),
    )
  )
    refuse('review byte properties refused');
  const reviewBytes = Uint8Array.prototype.slice.call(proposedReviewBytes);
  decodeSourceReview(reviewBytes);
  const reviewText = new TextDecoder('utf-8', { fatal: true }).decode(reviewBytes);
  const compilation = await Bun.build({
    entrypoints: ['source-stageb:entry'],
    target: 'bun',
    format: 'esm',
    splitting: false,
    minify: false,
    sourcemap: 'external',
    naming: 'source-stageb-bootstrap.[ext]',
    define: { SOURCE_STAGEB_REVIEW_LITERAL: JSON.stringify(reviewText) },
    plugins: [
      {
        name: 'fixed-source-stageb-entry',
        setup(build) {
          build.onResolve({ filter: /^source-stageb:entry$/ }, () => ({
            path: 'source-stageb-entry',
            namespace: 'source-stageb',
          }));
          build.onResolve({ filter: /^source-stageb:inputs$/ }, () => ({
            path: `${import.meta.dir}/source-stageb-inputs.ts`,
            namespace: 'file',
          }));
          build.onLoad({ filter: /.*/, namespace: 'source-stageb' }, () => ({
            contents: entry,
            loader: 'ts',
            resolveDir: import.meta.dir,
          }));
        },
      },
    ],
  });
  if (!compilation.success)
    throw new AggregateError(compilation.logs, 'source bootstrap compilation failed');
  const code = compilation.outputs.filter((output) => output.kind === 'entry-point');
  const entryOutput = code.at(0);
  if (code.length !== 1 || entryOutput === undefined) refuse('bundle output refused');
  const bytes = new Uint8Array(await entryOutput.arrayBuffer());
  const maps = await Promise.all(
    compilation.outputs
      .filter((output) => output.kind === 'sourcemap')
      .map(async (output) => {
        const bytes = new Uint8Array(await output.arrayBuffer());
        return Object.freeze({
          path: output.path.split('/').at(-1) ?? refuse('map path refused'),
          bytes,
          sha256: hash(bytes),
        });
      }),
  );
  if (maps.length !== 1) refuse('source map refused');
  const scanned = new Bun.Transpiler({ loader: 'js', target: 'bun' }).scan(bytes);
  const expectedExports = [
    'assertSourceInputArtifact',
    'closeSourceInputs',
    'inspectSourceInputs',
    'readSourceInputs',
  ];
  if (JSON.stringify([...scanned.exports].sort()) !== JSON.stringify(expectedExports))
    refuse('bundle exports refused');
  const runtimeImports = [...new Set(scanned.imports.map((dependency) => dependency.path))].sort();
  if (
    runtimeImports.some(
      (path) =>
        !['crypto', 'fs', 'fs/promises', 'stream', 'util/types'].includes(
          path.replace(/^node:/, ''),
        ),
    )
  )
    refuse('unbundled runtime dependency refused');
  return Object.freeze({
    bytes,
    sha256: hash(bytes),
    reviewSha256: hash(reviewBytes),
    maps: Object.freeze(maps),
    runtimeImports: Object.freeze(runtimeImports),
  });
}
