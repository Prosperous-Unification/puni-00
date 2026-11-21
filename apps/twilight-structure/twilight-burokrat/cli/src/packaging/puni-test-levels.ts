import { parseSecretsOrThrow, type } from '@shared/validation';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import type { SourceFiles } from '../policy/source-files';
import { ToolkitSourceSelection as TestLevelSourceSelection } from '../policy/source-selection';
export { TestLevelSourceSelection };

/** Complete captured relative source identities, independent from the producer's temporary physical root. */
export const TestLevelSource = type({
  format: "'puni-test-level-source'",
  version: '1',
  entrypoint: "'apps/puni/cli/src/entrypoint.ts'",
  sourceSelection: TestLevelSourceSelection,
  files: type({
    path: 'string>=1',
    mode: "'100644' | '100755' | '120000'",
    sha256: /^[0-9a-f]{64}$/u,
  })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');

/** Bind actual captured bytes and modes, not a producer snapshot pathname or an environment flag. */
export function createTestLevelSource(
  files: SourceFiles,
  selection: typeof TestLevelSourceSelection.infer,
): Uint8Array {
  const entries = files
    .readSnapshot()
    .entries.map((entry) => ({
      path: entry.path,
      mode: entry.mode,
      sha256: hashBytes(files.readFile(entry.path)),
    }))
    .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  return new TextEncoder().encode(
    serializeCanonical(
      parseSecretsOrThrow(TestLevelSource, {
        format: 'puni-test-level-source',
        version: 1,
        entrypoint: 'apps/puni/cli/src/entrypoint.ts',
        sourceSelection: selection,
        files: entries,
      }),
    ),
  );
}

export const testLevelPackageVersion = '0.4.0';

/** Distinct closed profile for delivered Browser/Performance capabilities; historical profile serializers stay separate. */
export const PuniTestLevelManifest = type({
  packageVersion: "'0.4.0'",
  schemaVersion: '1',
  sourceRevision: /^[0-9a-f]{40}$/u,
  sourceSelection: TestLevelSourceSelection,
  toolkitIdentity: /^[0-9a-f]{64}$/u,
  testLevelIdentity: /^[0-9a-f]{64}$/u,
}).onUndeclaredKey('reject');

/** Fixed delivered paths are producer-owned, never chosen by the runtime candidate or descriptor operands. */
export const TestLevelDescriptor = type({
  format: "'puni-test-level-assets'",
  version: '1',
  sourceRevision: /^[0-9a-f]{40}$/u,
  sourceSelection: TestLevelSourceSelection,
  bunVersion: 'string>=1',
  platform: "'linux'",
  architecture: "'x64'",
  toolchain: type({
    // Proof: canonical-layout-fault-descriptor-location-v118 widened this to arbitrary strings; the production reader admitted existing repinned historical/alternate directories. Both own refusal assertions failed; restored controls passed.
    directory: "'toolkit/node_modules'",
    identity: /^[0-9a-f]{64}$/u,
    playwright: "'playwright/cli.js'",
    vite: "'vite/bin/vite.js'",
    nx: "'nx/dist/bin/nx.js'",
  }).onUndeclaredKey('reject'),
  sourceRoot: type({
    entrypoint: "'test-level-source.json'",
    sha256: /^[0-9a-f]{64}$/u,
  }).onUndeclaredKey('reject'),
  judge: type({
    entrypoint: "'performance-judge.mjs'",
    sha256: /^[0-9a-f]{64}$/u,
  }).onUndeclaredKey('reject'),
}).onUndeclaredKey('reject');

/** Serialize the required new profile without widening historical0.3.0 or0.2.1 manifest contracts. */
export function createPuniTestLevelManifest(
  sourceSelection: typeof TestLevelSourceSelection.infer,
  toolkitIdentity: string,
  testLevelIdentity: string,
): Uint8Array {
  return new TextEncoder().encode(
    serializeCanonical(
      parseSecretsOrThrow(PuniTestLevelManifest, {
        packageVersion: testLevelPackageVersion,
        schemaVersion: 1,
        sourceRevision:
          sourceSelection.kind === 'committed' ? sourceSelection.revision : sourceSelection.base,
        sourceSelection,
        toolkitIdentity,
        testLevelIdentity,
      }),
    ),
  );
}

/** Describe actual same-build bytes; Linux x64 GNU native dependencies are mandatory for this asset set. */
export function createTestLevelAssets(
  sourceSelection: typeof TestLevelSourceSelection.infer,
  bunVersion: string,
  toolchainIdentity: string,
  judgeIdentity: string,
  sourceIdentity: string,
): Uint8Array {
  return new TextEncoder().encode(
    serializeCanonical(
      parseSecretsOrThrow(TestLevelDescriptor, {
        format: 'puni-test-level-assets',
        version: 1,
        sourceRevision:
          sourceSelection.kind === 'committed' ? sourceSelection.revision : sourceSelection.base,
        sourceSelection,
        bunVersion,
        platform: process.platform,
        architecture: process.arch,
        toolchain: {
          directory: 'toolkit/node_modules',
          identity: toolchainIdentity,
          playwright: 'playwright/cli.js',
          vite: 'vite/bin/vite.js',
          nx: 'nx/dist/bin/nx.js',
        },
        sourceRoot: { entrypoint: 'test-level-source.json', sha256: sourceIdentity },
        judge: { entrypoint: 'performance-judge.mjs', sha256: judgeIdentity },
      }),
    ),
  );
}
