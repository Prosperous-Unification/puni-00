import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';

import { z } from 'zod';

import { decodeSourceArchivePolicy } from './source-stageb-archive-preflight';
import { decodeSourceReview, type SourceBootstrapArtifact } from './source-stageb-bootstrap';
import { copySourceFixtureBytes, decodeSourceFixturePolicy } from './source-stageb-fixture';
import type { SourceMigrationPackage } from './source-stageb-migration-worker';

function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function refuse(reason: string): never {
  throw Error('source fixture bootstrap ' + reason);
}
function ownValues(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (isProxy(value) || typeof value !== 'object' || value === null || Array.isArray(value))
    return refuse('plain package object required');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    return refuse('plain package prototype required');
  if (
    Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
    Object.keys(Object.getOwnPropertyDescriptors(value)).sort().join(',') !==
      [...names].sort().join(',')
  )
    return refuse('closed package fields required');
  const copied: Record<string, unknown> = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable)
      return refuse('package accessors refused');
    copied[name] = descriptor.value;
  }
  return copied;
}
function ownArray(value: unknown, count: number): unknown[] {
  if (isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    return refuse('plain bounded array required');
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  if (length?.value !== count || Reflect.ownKeys(value).length !== count + 1)
    return refuse('exact array membership required');
  const copied: unknown[] = [];
  for (let index = 0; index < count; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable)
      return refuse('array accessors refused');
    copied.push(descriptor.value);
  }
  return copied;
}
const absolutePath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      path.startsWith('/') &&
      !path.includes('\0') &&
      !path
        .split('/')
        .slice(1)
        .some((part) => part === '' || part === '.' || part === '..'),
  );
const packageSchema = z
  .object({
    version: z.literal(1),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    workflowSha: z.string().regex(/^[a-f0-9]{40}$/),
    nonce: z.string().regex(/^[a-f0-9]{32}$/),
    migrationManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    envelope: absolutePath,
    databases: z.tuple([
      z.object({ environment: z.literal('prod'), path: absolutePath }).strict(),
      z.object({ environment: z.literal('dev'), path: absolutePath }).strict(),
    ]),
  })
  .strict();
function copyMigrationPackage(proposed: SourceMigrationPackage): SourceMigrationPackage {
  // Proof: bootstrap-package-red.log observed all ten actual assembler negatives resolve before this boundary; getters/proxy/toJSON must remain uncalled.
  const copied = ownValues(proposed, [
    'version',
    'sourceSha',
    'workflowSha',
    'nonce',
    'migrationManifestSha256',
    'envelope',
    'databases',
  ]);
  copied['databases'] = ownArray(copied['databases'], 2).map((database) =>
    ownValues(database, ['environment', 'path']),
  );
  const parsed = packageSchema.parse(copied);
  if (parsed.databases[0].path === parsed.databases[1].path)
    return refuse('distinct database paths required');
  return Object.freeze({
    ...parsed,
    databases: Object.freeze([
      Object.freeze(parsed.databases[0]),
      Object.freeze(parsed.databases[1]),
    ] as const),
  });
}
function scanRuntime(bytes: Uint8Array) {
  const scanned = new Bun.Transpiler({ loader: 'js', target: 'bun' }).scan(bytes);
  const imports = [...new Set(scanned.imports.map((dependency) => dependency.path))].sort();
  const allowed = [
    'bun:sqlite',
    'bun:ffi',
    'crypto',
    'fs',
    'fs/promises',
    'os',
    'path',
    'util/types',
    'child_process',
    'stream',
    'events',
    'net',
    'assert',
  ];
  // Proof: shared-import-red.log omitted this allowlist; a scanner-only unresolved import in the real complete build returned a candidate. Exact c9 source restoration passed.
  if (imports.some((path) => !allowed.includes(path.replace(/^node:/, ''))))
    return refuse('runtime imports refused');
  return { imports, exports: [...scanned.exports].sort() };
}
async function collectBuild(compilation: Awaited<ReturnType<typeof Bun.build>>) {
  // Proof: compiler-success-red.log omitted this check; real builds marked failed while retaining valid outputs returned worker and complete candidates. Exact c9 restoration passed.
  if (!compilation.success)
    throw new AggregateError(compilation.logs, 'source fixture compilation failed');
  const entries = compilation.outputs.filter((output) => output.kind === 'entry-point');
  const executable = entries.at(0);
  // Proof: entry-cardinality-red.log omitted only cardinality; duplicated real entry outputs returned worker and complete candidates. Exact c9 restoration passed.
  if (entries.length !== 1 || executable === undefined) return refuse('single entry required');
  const bytes = new Uint8Array(await executable.arrayBuffer());
  const maps = await Promise.all(
    compilation.outputs
      .filter((output) => output.kind === 'sourcemap')
      .map(async (output) => {
        const bytes = new Uint8Array(await output.arrayBuffer());
        const path = output.path.split('/').at(-1);
        if (path === undefined) return refuse('map path');
        return Object.freeze({ path, bytes, sha256: digest(bytes) });
      }),
  );
  // Proof: map-cardinality-red.log omitted this check; missing and duplicate real maps returned worker and complete candidates. Exact c9 restoration passed.
  if (maps.length !== 1) return refuse('single source map required');
  return { bytes, sha256: digest(bytes), maps: Object.freeze(maps), scanned: scanRuntime(bytes) };
}
/** Builds only the fixed migration entry before facility/review commitments exist. Output is a candidate, never approval. */
export async function buildSourceFixtureMigrationWorker(proposed: SourceMigrationPackage) {
  const fixed = copyMigrationPackage(proposed);
  const literal = JSON.stringify(fixed);
  const compilation = await Bun.build({
    entrypoints: [import.meta.dir + '/source-stageb-migration-worker.ts'],
    target: 'bun',
    format: 'esm',
    splitting: false,
    minify: false,
    sourcemap: 'external',
    naming: 'source-stageb-migration-worker.[ext]',
    define: { SOURCE_STAGEB_MIGRATION_LITERAL: JSON.stringify(literal) },
  });
  const built = await collectBuild(compilation);
  // Proof: bootstrap-runtime-red.log observed the real worker build admit an injected child_process import before this fixed worker allowlist.
  if (
    built.scanned.imports.some(
      (path) =>
        !['bun:ffi', 'bun:sqlite', 'crypto', 'fs', 'os', 'path'].includes(
          path.replace(/^node:/, ''),
        ),
    )
  )
    return refuse('fixed worker runtime imports refused');
  // Proof: bootstrap-exports-red.log omitted fixed export checks with an extra scanner-observed factory; both actual assembler consumers resolved. Exact restoration passed.
  const expected = ['decodeSourceMigrationFrames', 'encodeSourceMigrationFrame'].sort();
  if (JSON.stringify(built.scanned.exports) !== JSON.stringify(expected))
    return refuse('fixed worker exports refused');
  return Object.freeze({
    bytes: built.bytes,
    sha256: built.sha256,
    maps: built.maps,
    runtimeImports: Object.freeze(built.scanned.imports),
  });
}
const entry = `export {readSourceInputs,inspectSourceInputs,assertSourceInputArtifact,closeSourceInputs} from 'source-stageb:inputs';
export {readSourceArtifacts,inspectSourceArtifacts,readSourceArtifactChunk,recheckSourceArtifacts,closeSourceArtifacts} from 'source-stageb:artifacts';
export {createSourceJournal,appendSourceIntent,dispatchSourceIntent,abandonSourceIntent,recordSourceObservation,recordSourceUncertainty,inspectSourceJournal,closeSourceJournal} from 'source-stageb:journal';
export {preflightSourceArchive,borrowSourceArchivePreflight,assertSourceArchivePreflight,releaseSourceArchivePreflight,closeSourceArchivePreflight} from 'source-stageb:archive-preflight';
export {stageSourceArtifacts,closeSourceStaging,buildSourcePrerequisites,inspectSourcePrerequisites,closeSourcePrerequisites} from 'source-stageb:builder';`;
/** Fixed complete same-closure I/J/B1/A2/B2 candidate assembly; every lexical body is externally reviewable. */
export async function buildSourceFixtureBootstrap(
  proposedReviewBytes: Uint8Array,
  proposedArchivePolicyBytes: Uint8Array,
  proposedFacilityBytes: Uint8Array,
  proposedRosterBytes: Uint8Array,
  proposedProducerBytes: readonly Uint8Array[],
  proposedMigrationPackage: SourceMigrationPackage,
): Promise<
  SourceBootstrapArtifact & {
    readonly fixtureAuthoritySha256: string;
    readonly rosterPolicySha256: string;
    readonly workerSha256: string;
  }
> {
  const reviewBytes = copySourceFixtureBytes(proposedReviewBytes, 16384);
  const archiveBytes = copySourceFixtureBytes(proposedArchivePolicyBytes, 16384);
  const facilityBytes = copySourceFixtureBytes(proposedFacilityBytes, 32768);
  const rosterBytes = copySourceFixtureBytes(proposedRosterBytes, 16384);
  // Proof: producer-membership-red.log omitted this snapshot: extra array fields returned a candidate; missing bodies reached a later policy refusal. Exact c9 restoration passed.
  const producerBytes = ownArray(proposedProducerBytes, 12).map((bytes) => {
    if (!(bytes instanceof Uint8Array)) return refuse('producer byte array required');
    // Proof: producer-copier-red.log broke the bounded copier: oversized bytes reached later JSON refusal. Restored valid-packet test requires this byte-custody refusal before any policy decode.
    return copySourceFixtureBytes(bytes, 16384);
  });
  // Proof: bootstrap-aggregate-red.log omitted this total check with a broken byte copier; both actual consumer tests reached later malformed-policy refusal. Exact restoration passed.
  const producerTotal = producerBytes.reduce((sum, bytes) => sum + bytes.byteLength, 0);
  if (
    producerTotal > 196608 ||
    facilityBytes.byteLength + rosterBytes.byteLength + producerTotal > 245760
  )
    return refuse('combined policy bytes exceed bound');
  const migrationPackage = copyMigrationPackage(proposedMigrationPackage);
  const review = decodeSourceReview(reviewBytes);
  decodeSourceArchivePolicy(archiveBytes);
  const policy = decodeSourceFixturePolicy(facilityBytes, rosterBytes, producerBytes);

  // Proof: bootstrap-joins-red.log omitted all four joins; six actual consumer negatives reached later public-export refusal instead of their required join. Exact restoration passed.
  if (
    review.archivePolicySha256 !== digest(archiveBytes) ||
    review.fixtureAuthoritySha256 !== digest(facilityBytes) ||
    review.rosterPolicySha256 !== digest(rosterBytes)
  )
    return refuse('review commitments differ');

  if (
    JSON.stringify([
      policy.facility.sourceSha,
      policy.facility.workflowSha,
      policy.facility.nonce,
    ]) !== JSON.stringify([review.sourceSha, review.workflowSha, review.nonce])
  )
    return refuse('review attempt differs');
  if (
    JSON.stringify([
      migrationPackage.sourceSha,
      migrationPackage.workflowSha,
      migrationPackage.nonce,
      migrationPackage.envelope,
      migrationPackage.migrationManifestSha256,
      migrationPackage.databases,
    ]) !==
    JSON.stringify([
      review.sourceSha,
      review.workflowSha,
      review.nonce,
      policy.facility.migration.envelope,
      policy.facility.migration.manifestSha256,
      policy.facility.migration.databases,
    ])
  )
    return refuse('worker package differs');
  const worker = await buildSourceFixtureMigrationWorker(migrationPackage);
  if (
    policy.facility.worker.sha256 !== worker.sha256 ||
    policy.facility.worker.bytes !== worker.bytes.byteLength
  )
    return refuse('built worker commitment differs');
  const text = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const compilation = await Bun.build({
    entrypoints: ['source-stageb:fixture-entry'],
    target: 'bun',
    format: 'esm',
    splitting: false,
    minify: false,
    sourcemap: 'external',
    naming: 'source-stageb-fixture-bootstrap.[ext]',
    define: {
      SOURCE_STAGEB_REVIEW_LITERAL: JSON.stringify(text(reviewBytes)),
      SOURCE_STAGEB_ARCHIVE_POLICY_LITERAL: JSON.stringify(text(archiveBytes)),
      SOURCE_STAGEB_FIXTURE_AUTHORITY_LITERAL: JSON.stringify(text(facilityBytes)),
      SOURCE_STAGEB_ROSTER_POLICY_LITERAL: JSON.stringify(text(rosterBytes)),
      SOURCE_STAGEB_PRODUCER_EVIDENCE_LITERAL: JSON.stringify(producerBytes.map(text)),
      SOURCE_STAGEB_MIGRATION_WORKER_LITERAL: JSON.stringify(
        Buffer.from(worker.bytes).toString('base64'),
      ),
    },
    plugins: [
      {
        name: 'fixed-source-stageb-fixture-entry',
        setup(build) {
          build.onResolve({ filter: /^source-stageb:fixture-entry$/ }, () => ({
            path: 'fixture-entry',
            namespace: 'fixture-entry',
          }));
          build.onResolve(
            { filter: /^source-stageb:(inputs|artifacts|journal|archive-preflight|builder)$/ },
            (args) => ({
              path:
                import.meta.dir +
                '/source-stageb-' +
                args.path.slice('source-stageb:'.length) +
                '.ts',
              namespace: 'file',
            }),
          );
          build.onLoad({ filter: /.*/, namespace: 'fixture-entry' }, () => ({
            contents: entry,
            loader: 'ts',
            resolveDir: import.meta.dir,
          }));
        },
      },
    ],
  });
  const built = await collectBuild(compilation);
  const expected = [
    'readSourceInputs',
    'inspectSourceInputs',
    'assertSourceInputArtifact',
    'closeSourceInputs',
    'readSourceArtifacts',
    'inspectSourceArtifacts',
    'readSourceArtifactChunk',
    'recheckSourceArtifacts',
    'closeSourceArtifacts',
    'createSourceJournal',
    'appendSourceIntent',
    'dispatchSourceIntent',
    'abandonSourceIntent',
    'recordSourceObservation',
    'recordSourceUncertainty',
    'inspectSourceJournal',
    'closeSourceJournal',
    'preflightSourceArchive',
    'borrowSourceArchivePreflight',
    'assertSourceArchivePreflight',
    'releaseSourceArchivePreflight',
    'closeSourceArchivePreflight',
    'stageSourceArtifacts',
    'closeSourceStaging',
    'buildSourcePrerequisites',
    'inspectSourcePrerequisites',
    'closeSourcePrerequisites',
  ].sort();
  if (JSON.stringify(built.scanned.exports) !== JSON.stringify(expected))
    return refuse('fixed public exports refused');
  return Object.freeze({
    bytes: built.bytes,
    sha256: built.sha256,
    reviewSha256: digest(reviewBytes),
    fixtureAuthoritySha256: digest(facilityBytes),
    rosterPolicySha256: digest(rosterBytes),
    workerSha256: worker.sha256,
    maps: built.maps,
    runtimeImports: Object.freeze(built.scanned.imports),
  });
}
