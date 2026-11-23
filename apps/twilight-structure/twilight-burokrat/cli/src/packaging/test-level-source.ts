import { realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parseSecretsOrThrow } from '@shared/validation';

import { hashBytes } from '../evidence/content-manifest';
import type { PreparationGitContext } from '../policy/preparation-git';
import { readJson } from '../policy/preparation-inputs';
import { captureWorkingSource } from '../policy/working-source';
import { createTestLevelSource, TestLevelSource } from './puni-test-levels';
import { readWorkingBuildSource } from './source';

/**
 * Bind actual source main to the separately selected producer's complete relative source identity.
 * The physical checkout need not be the producer's private materialization. Actual current Git
 * membership includes edited and untracked source; matching only listed files would omit added
 * module-resolution candidates. Git/index/host source stability remains an explicit prerequisite,
 * not a hostile filesystem sandbox. Installed entrypoint admission uses a different exact boundary.
 * @throws for absent/malformed identities, changed bytes/modes/links/base, substituted main or root.
 */
export async function verifySourceTestLevelRoot(
  supplied: {
    readonly sourceRoot: string;
    readonly entrypoint: string;
    readonly manifest: { readonly bytes: Uint8Array; readonly sha256: string };
  },
  authority: Omit<PreparationGitContext, 'repository'>,
) {
  const selected = {
    sourceRoot: supplied.sourceRoot,
    entrypoint: supplied.entrypoint,
    manifest: { bytes: Uint8Array.from(supplied.manifest.bytes), sha256: supplied.manifest.sha256 },
  };
  const capturedAuthority = {
    runtime: {
      directory: authority.runtime.directory,
      environment: { ...authority.runtime.environment },
    },
    subscribeInterrupts: authority.subscribeInterrupts,
  };
  if (
    !/^[0-9a-f]{64}$/u.test(selected.manifest.sha256) ||
    hashBytes(selected.manifest.bytes) !== selected.manifest.sha256
  )
    throw new Error('source test levels require the independently selected source identity');
  const descriptor = parseSecretsOrThrow(TestLevelSource, readJson(selected.manifest.bytes));
  const directory = realpathSync.native(selected.sourceRoot),
    before = statSync(directory, { bigint: true });
  if (!before.isDirectory()) throw new Error('test-level source root is not a directory');
  const expectedEntrypoint = join(directory, descriptor.entrypoint);
  if (
    realpathSync.native(selected.entrypoint) !== expectedEntrypoint ||
    realpathSync.native(expectedEntrypoint) !== expectedEntrypoint
  )
    throw new Error('source test levels require the actual captured source main');
  const main = descriptor.files.find((file) => file.path === descriptor.entrypoint);
  if (main === undefined || (main.mode !== '100644' && main.mode !== '100755'))
    throw new Error('source test-level identity lacks its regular main entrypoint');
  const root = await readWorkingBuildSource(
    { repository: directory },
    { callerDirectory: capturedAuthority.runtime.directory, ...capturedAuthority },
  );
  if (root.kind === 'cancelled') return root;
  if (root.directory !== directory)
    throw new Error('test-level source root differs from the actual Git worktree root');
  const capture = await captureWorkingSource({ repository: directory, ...capturedAuthority });
  if (capture.kind === 'cancelled') return capture;
  const observed = capture.source.readSelection();
  const base =
    descriptor.sourceSelection.kind === 'committed'
      ? descriptor.sourceSelection.revision
      : descriptor.sourceSelection.base;
  if (
    observed.base !== base ||
    (descriptor.sourceSelection.kind === 'working' &&
      observed.identity !== descriptor.sourceSelection.identity)
  )
    throw new Error('actual source selection differs from the producer capture');
  const observedManifest = createTestLevelSource(capture.source, descriptor.sourceSelection);
  if (hashBytes(observedManifest) !== selected.manifest.sha256)
    throw new Error('actual source files, modes or links differ from the producer capture');
  const after = statSync(directory, { bigint: true });
  if (after.dev !== before.dev || after.ino !== before.ino)
    throw new Error('test-level source root changed during admission');
  return { kind: 'verified' as const, directory };
}
