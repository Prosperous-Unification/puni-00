import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parseOrThrow } from '@shared/validation';

import {
  type BunToolkit,
  readBunToolkit,
  readToolkit,
  type Toolkit,
  type VerifiedToolkit,
} from '../policy/toolkit';
import { PackageManifest } from './manifest';

/** Decode the installed package boundary before selecting or reading any toolkit. */
function readPackageManifest(distDirectory: string): typeof PackageManifest.infer {
  const manifestPath = join(distDirectory, 'package-manifest.json');
  let source: string;
  try {
    // Proof: package-regular-file; the injected fault fails refuses a format2 FIFO package-manifest.json; restoration passes.
    if (!statSync(manifestPath).isFile())
      throw new Error('installed package manifest is not a regular file');
    source = readFileSync(manifestPath, 'utf8');
  } catch (cause) {
    // Proof: removing this context exposed raw ENOENT and EISDIR diagnostics for the installed
    // package boundary; the packed-command negatives require the manifest path and state.
    // Proof: package-unreadable-context; the injected fault fails current refuses an absent package manifest|current refuses an unreadable package manifest; restoration passes.
    throw new Error(`installed package manifest is unreadable: ${manifestPath}`, { cause });
  }
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch (cause) {
    // Proof: replacing malformed JSON with `{}` made it reach schema validation; the production
    // negative lost the malformed-state refusal that distinguishes damaged bytes from fields.
    // Proof: package-malformed-context; the injected fault fails current refuses malformed package bytes; restoration passes.
    throw new Error(`installed package manifest is malformed: ${manifestPath}`, { cause });
  }
  let manifest: typeof PackageManifest.infer;
  try {
    // Proof: package-schema-boundary; the injected fault fails current refuses invalid package fields; restoration passes.
    manifest = parseOrThrow(PackageManifest, input);
  } catch (cause) {
    // Proof: skipping schema validation let `{}` reach toolkit comparison with an absent expected
    // identity; the installed-command negative then lost the invalid-schema boundary.
    // Proof: package-invalid-context; the injected fault fails current refuses invalid package fields; restoration passes.
    throw new Error(`installed package manifest is invalid: ${manifestPath}`, { cause });
  }
  return manifest;
}

/** A self-consistent toolkit cannot replace the expected package identity. */
function assertToolkitIdentity(
  manifest: typeof PackageManifest.infer,
  toolkit: VerifiedToolkit,
): void {
  // Proof: replacing the expected identity with the selected identity let a repacked package
  // substitute a self-consistent validator and toolkit descriptor; the installed-package negative
  // then executed the substituted validator instead of refusing the package/toolkit mismatch.
  if (toolkit.digest !== manifest.toolkitIdentity) {
    throw new Error(
      `installed toolkit differs from package manifest: ${toolkit.digest} != ${manifest.toolkitIdentity}`,
    );
  }
}

/**
 * Retain legacy execution compatibility until its producer and consumer switch is coherent.
 * @throws when package identity or legacy format/runtime verification fails.
 */
export function readInstalledToolkit(distDirectory: string, toolkitDirectory: string): Toolkit {
  const manifest = readPackageManifest(distDirectory);
  const toolkit = readToolkit(toolkitDirectory);
  assertToolkitIdentity(manifest, toolkit);
  return toolkit;
}

/**
 * Require current Bun format and package identity. Resolve host directory operands natively
 * before joining role paths so symlink/parent selection retains actual filesystem meaning.
 * @throws for unreadable/invalid package state, unsupported format/runtime or differing bytes.
 */
export function readInstalledBunToolkit(
  distDirectory: string,
  toolkitDirectory: string,
): BunToolkit {
  // Proof: reader-native-package; the injected fault fails preserves native symlink-parent authority; restoration passes.
  const manifest = readPackageManifest(realpathSync.native(distDirectory));
  // Proof: reader-native-toolkit; the injected fault fails preserves native symlink-parent authority; restoration passes.
  // Proof: reader-current-format-runtime; the injected fault fails refuses historical format even|refuses a current toolkit built by another runtime; restoration passes.
  // Proof: reader-package-binding; the injected fault fails refuses a current toolkit different; restoration passes.
  const toolkit = readBunToolkit(realpathSync.native(toolkitDirectory));
  assertToolkitIdentity(manifest, toolkit);
  return toolkit;
}
