import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parseOrThrow, parseSecretsOrThrow } from '@shared/validation';

import { readJson, readOperatorFile } from '../policy/preparation-inputs';
import {
  type BunExecutionToolkit,
  type BunToolkit,
  readBunToolkit,
  readSelectedBunToolkit,
  readToolkit,
  type Toolkit,
  type VerifiedToolkit,
} from '../policy/toolkit';
import { PackageManifest } from './manifest';
import { PuniManifest } from './puni-manifest';
import { PuniTestLevelManifest } from './puni-test-levels';
import { readRequiredTestLevelAssets } from './test-level-asset-files';

const PuniInstalledManifest = PuniManifest.or(PuniTestLevelManifest);

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

function readPuniPackageManifest(directory: string): typeof PuniInstalledManifest.infer {
  const path = join(directory, 'package-manifest.json');
  let bytes: Uint8Array;
  try {
    // Proof: c28-profile-regular-input; Reached FIFO child deadline detects synchronous acquisition with the regular-file boundary bypassed.; injected fault failed `refuses a native FIFO current manifest before synchronous input acquisition can block`; restoration passed.
    bytes = readOperatorFile(path);
  } catch (cause) {
    // Proof: c28-profile-unreadable-context; Distinct absent/unreadable named boundary diagnostics; raw IO still refuses.; injected fault failed `refuses absent current package state before toolkit access` and 1 additional named controls; restoration passed.
    throw new Error('installed PUNI package manifest is unreadable: ' + path, { cause });
  }
  let input: unknown;
  try {
    input = readJson(bytes);
  } catch (cause) {
    // Proof: c28-profile-malformed-context; Malformed byte boundary diagnostic, not admission.; injected fault failed `refuses malformed current package state before toolkit access` and 1 additional named controls; restoration passed.
    throw new Error('installed PUNI package manifest is malformed: ' + path, { cause });
  }
  try {
    return parseSecretsOrThrow(PuniInstalledManifest, input);
  } catch (cause) {
    // Proof: c28-profile-invalid-context; Invalid field boundary diagnostic, not admission.; injected fault failed `refuses undeclared current package fields with an otherwise valid native toolkit`; restoration passed.
    throw new Error('installed PUNI package manifest is invalid: ' + path, { cause });
  }
}

/**
 * Require the explicitly claimed closed PUNI profile and its matching toolkit before admission.
 * The descriptor digest, captured source revision and release tag must agree with separately
 * selected package metadata. Historical0.2.1/profile execution readers remain separate.
 * Native package/toolkit selection preserves symlink-parent meaning; later physical placement
 * still belongs to the operation before execution. Stable trusted installation is a premise,
 * not independent authentication of the root executable or clean-release provenance.
 * @throws for unreadable/malformed/unsupported package state, toolkit bytes/runtime or metadata disagreement.
 */
export function readInstalledPuniToolkit(
  distDirectory: string,
  toolkitDirectory: string,
): BunExecutionToolkit {
  // Proof: c28-profile-native-package; injected fault failed `preserves native symlink-parent selection of a different valid PUNI installation`; restoration passed.
  const manifest = readPuniPackageManifest(realpathSync.native(distDirectory));
  // Proof: c28-profile-native-toolkit; injected fault failed `preserves native symlink-parent selection of a different valid PUNI installation`; restoration passed.
  const selected =
    manifest.packageVersion === '0.4.0'
      ? {
          kind: 'selected' as const,
          toolkit: readSelectedBunToolkit(
            realpathSync.native(toolkitDirectory),
            manifest.sourceSelection,
          ),
        }
      : {
          kind: 'historical' as const,
          toolkit: readBunToolkit(realpathSync.native(toolkitDirectory)),
        };
  const toolkit = selected.toolkit;
  // Proof: c28-profile-digest; injected fault failed `refuses a self-consistent toolkit whose descriptor differs from the selected package identity`; restoration passed.
  if (toolkit.digest !== manifest.toolkitIdentity)
    throw new Error('installed toolkit differs from PUNI package manifest');
  // Proof: c28-profile-revision; injected fault failed `refuses package-bound toolkit with a different captured source revision`; restoration passed.
  if (toolkit.sourceRevision !== manifest.sourceRevision)
    throw new Error('installed toolkit source differs from PUNI package manifest');
  // Proof: c28-profile-tag; injected fault failed `refuses package-bound toolkit with a different release tag`; restoration passed.
  if (toolkit.tag !== 'puni-v' + manifest.packageVersion)
    throw new Error('installed toolkit release differs from PUNI package version');
  if (selected.kind === 'selected') readRequiredTestLevelAssets(distDirectory, selected.toolkit);
  return toolkit;
}
