import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';

import { decodeSourceArchivePolicy } from './source-stageb-archive-preflight';
import { decodeSourceReview, type SourceBootstrapArtifact } from './source-stageb-bootstrap';

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function copyBytes(bytes: Uint8Array): Uint8Array {
  if (isProxy(bytes) || !(bytes instanceof Uint8Array))
    throw Error('archive bootstrap bytes refused');
  const length: unknown = Reflect.get(Uint8Array.prototype, 'byteLength', bytes);
  if (typeof length !== 'number' || length < 1 || length > 16384)
    throw Error('archive bootstrap byte bound refused');
  // Proof: assembly-byte-properties omission emitted decorated proposed bytes; actual assembly rejection consumer RED.
  const prototype: unknown = Object.getPrototypeOf(bytes);
  if (
    (prototype !== Uint8Array.prototype && prototype !== Buffer.prototype) ||
    Reflect.ownKeys(bytes).some((key) => typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key))
  )
    throw Error('archive bootstrap byte properties refused');
  return Uint8Array.prototype.slice.call(bytes);
}
const entry = `export { readSourceInputs, inspectSourceInputs, assertSourceInputArtifact, closeSourceInputs } from 'source-stageb:inputs';
export { createSourceJournal, appendSourceIntent, dispatchSourceIntent, recordSourceObservation, recordSourceUncertainty, inspectSourceJournal, closeSourceJournal } from 'source-stageb:journal';
export { preflightSourceArchive, borrowSourceArchivePreflight, assertSourceArchivePreflight, releaseSourceArchivePreflight, closeSourceArchivePreflight } from 'source-stageb:archive-preflight';`;

/** Fixed same-closure I/J/A2 candidate assembly. Exact proposed bytes confer no approval. */
export async function buildSourceArchiveBootstrap(
  proposedReviewBytes: Uint8Array,
  proposedArchivePolicyBytes: Uint8Array,
): Promise<SourceBootstrapArtifact & { readonly archivePolicySha256: string }> {
  const reviewBytes = copyBytes(proposedReviewBytes);
  const policyBytes = copyBytes(proposedArchivePolicyBytes);
  const review = decodeSourceReview(reviewBytes);
  const archivePolicySha256 = digest(policyBytes);
  // Proof: assembly-policy-join omission emitted a package for mismatched proposed review/policy bytes; actual consumer RED.
  if (review.archivePolicySha256 !== archivePolicySha256)
    throw Error('archive bootstrap policy join refused');
  decodeSourceArchivePolicy(policyBytes);
  const compilation = await Bun.build({
    entrypoints: ['source-stageb:archive-entry'],
    target: 'bun',
    format: 'esm',
    splitting: false,
    minify: false,
    sourcemap: 'external',
    naming: 'source-stageb-archive-bootstrap.[ext]',
    define: {
      SOURCE_STAGEB_REVIEW_LITERAL: JSON.stringify(
        new TextDecoder('utf-8', { fatal: true }).decode(reviewBytes),
      ),
      SOURCE_STAGEB_ARCHIVE_POLICY_LITERAL: JSON.stringify(
        new TextDecoder('utf-8', { fatal: true }).decode(policyBytes),
      ),
    },
    plugins: [
      {
        name: 'fixed-source-stageb-archive-entry',
        setup(build) {
          build.onResolve({ filter: /^source-stageb:archive-entry$/ }, () => ({
            path: 'archive-entry',
            namespace: 'archive-entry',
          }));
          build.onResolve(
            { filter: /^source-stageb:(inputs|journal|archive-preflight)$/ },
            (args) => ({
              path: `${import.meta.dir}/source-stageb-${args.path.slice('source-stageb:'.length)}.ts`,
              namespace: 'file',
            }),
          );
          build.onLoad({ filter: /.*/, namespace: 'archive-entry' }, () => ({
            contents: entry,
            loader: 'ts',
            resolveDir: import.meta.dir,
          }));
        },
      },
    ],
  });
  // Proof: assembly-compilation omission emitted a failed compiler outcome's retained outputs; actual assembly consumer RED.
  if (!compilation.success)
    throw new AggregateError(compilation.logs, 'archive bootstrap compilation failed');
  const outputs = compilation.outputs.filter((output) => output.kind === 'entry-point');
  const executable = outputs.at(0);
  // Proof: assembly-single-entry omission emitted a duplicate-entry compiler outcome; actual assembly consumer RED.
  if (outputs.length !== 1 || executable === undefined)
    throw Error('archive bootstrap output refused');
  const bytes = new Uint8Array(await executable.arrayBuffer());
  const maps = await Promise.all(
    compilation.outputs
      .filter((output) => output.kind === 'sourcemap')
      .map(async (output) => {
        const bytes = new Uint8Array(await output.arrayBuffer());
        const path = output.path.split('/').at(-1);
        if (path === undefined) throw Error('archive bootstrap map refused');
        return Object.freeze({ path, bytes, sha256: digest(bytes) });
      }),
  );
  // Proof: assembly-single-map omission emitted duplicate maps; actual assembly consumer RED.
  if (maps.length !== 1) throw Error('archive bootstrap maps refused');
  const scanned = new Bun.Transpiler({ loader: 'js', target: 'bun' }).scan(bytes);
  const expected = [
    'readSourceInputs',
    'inspectSourceInputs',
    'assertSourceInputArtifact',
    'closeSourceInputs',
    'createSourceJournal',
    'appendSourceIntent',
    'dispatchSourceIntent',
    'recordSourceObservation',
    'recordSourceUncertainty',
    'inspectSourceJournal',
    'closeSourceJournal',
    'preflightSourceArchive',
    'borrowSourceArchivePreflight',
    'assertSourceArchivePreflight',
    'releaseSourceArchivePreflight',
    'closeSourceArchivePreflight',
  ].sort();
  // Proof: assembly-fixed-exports omission emitted an unexpected export projection; actual assembly consumer RED.
  if (JSON.stringify([...scanned.exports].sort()) !== JSON.stringify(expected))
    throw Error('archive bootstrap exports refused');
  const runtimeImports = [...new Set(scanned.imports.map((dependency) => dependency.path))].sort();
  // Proof: assembly-runtime-imports omission emitted an unapproved runtime import projection; actual assembly consumer RED.
  if (
    runtimeImports.some(
      (path) =>
        ![
          'crypto',
          'fs',
          'fs/promises',
          'util/types',
          'child_process',
          'stream',
          'events',
          'path',
        ].includes(path.replace(/^node:/, '')),
    )
  )
    throw Error('archive bootstrap dependency refused');
  return Object.freeze({
    bytes,
    sha256: digest(bytes),
    reviewSha256: digest(reviewBytes),
    archivePolicySha256,
    maps: Object.freeze(maps),
    runtimeImports: Object.freeze(runtimeImports),
  });
}
