import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { parseSecretsOrThrow } from '@shared/validation';

import { hashBytes } from '../evidence/content-manifest';
import { readJson, readOperatorFile } from '../policy/preparation-inputs';
import { isSameToolkitSource } from '../policy/source-selection';
import type { SelectedBunToolkit } from '../policy/toolkit';
import { PuniTestLevelManifest, TestLevelDescriptor, TestLevelSource } from './puni-test-levels';

/**
 * Join new-profile metadata and required tool/worker bytes to the already verified toolkit.
 * This verifies consistency, not external provenance: the root must independently authenticate
 * the complete retained archive and installation first. No source or ambient dependency fallback exists.
 */
export function readRequiredTestLevelAssets(distDirectory: string, toolkit: SelectedBunToolkit) {
  const directory = realpathSync.native(distDirectory);
  const manifest = parseSecretsOrThrow(
    PuniTestLevelManifest,
    readJson(readOperatorFile(join(directory, 'package-manifest.json'))),
  );
  const descriptorBytes = readOperatorFile(join(directory, 'test-level-assets.json'));
  if (hashBytes(descriptorBytes) !== manifest.testLevelIdentity)
    throw new Error('installed test-level descriptor differs from required package identity');
  const descriptor = parseSecretsOrThrow(TestLevelDescriptor, readJson(descriptorBytes));
  if (
    !isSameToolkitSource(manifest.sourceSelection, toolkit.sourceSelection) ||
    !isSameToolkitSource(descriptor.sourceSelection, manifest.sourceSelection)
  )
    throw new Error(
      'installed test-level source selection differs from required toolkit/profile identity',
    );
  if (
    descriptor.sourceRevision !== manifest.sourceRevision ||
    descriptor.bunVersion !== Bun.version ||
    descriptor.platform !== process.platform ||
    descriptor.architecture !== process.arch
  )
    throw new Error('installed test-level source, runtime or native platform differs');
  if (toolkit.trustedNodeModulesIdentity !== descriptor.toolchain.identity)
    throw new Error('installed test-level toolchain differs from required toolkit closure');
  function contained(path: string): string {
    const native = realpathSync.native(path);
    const offset = relative(directory, native);
    if (offset === '' || offset === '..' || offset.startsWith('..' + sep) || isAbsolute(offset))
      throw new Error('installed test-level asset escapes authenticated package');
    return native;
  }
  const nodeModules = contained(join(directory, descriptor.toolchain.directory));
  function executable(path: string): string {
    const native = contained(join(nodeModules, path));
    if (!statSync(native).isFile())
      throw new Error('installed test-level tool is not a regular file');
    return native;
  }
  const worker = readOperatorFile(contained(join(directory, descriptor.judge.entrypoint)));
  if (hashBytes(worker) !== descriptor.judge.sha256)
    throw new Error('installed Performance judge differs from required worker identity');
  const sourceRoot = readOperatorFile(contained(join(directory, descriptor.sourceRoot.entrypoint)));
  if (hashBytes(sourceRoot) !== descriptor.sourceRoot.sha256)
    throw new Error('installed source-root manifest differs from required producer identity');
  const sourceManifest = parseSecretsOrThrow(TestLevelSource, readJson(sourceRoot));
  if (!isSameToolkitSource(sourceManifest.sourceSelection, descriptor.sourceSelection))
    throw new Error('installed source-root selection differs from required test-level identity');
  return {
    sourceRoot: { bytes: Uint8Array.from(sourceRoot), sha256: descriptor.sourceRoot.sha256 },
    sourceRevision: descriptor.sourceRevision,
    sourceSelection: descriptor.sourceSelection,
    toolkit,
    assets: {
      nodeModules,
      playwrightEntrypoint: executable(descriptor.toolchain.playwright),
      viteEntrypoint: executable(descriptor.toolchain.vite),
      nxEntrypoint: executable(descriptor.toolchain.nx),
    },
    worker: { bytes: Uint8Array.from(worker), sha256: descriptor.judge.sha256 },
  };
}
