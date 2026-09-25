import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseOrThrow } from '@shared/validation';

import { readToolkit, type Toolkit } from '../policy/prepare-activation-cli';
import { PackageManifest } from './manifest';

/**
 * Reads the package identity beside the executable and verifies the selected toolkit against it.
 * @throws when either manifest is unreadable, malformed, or names different toolkit bytes.
 */
export function readInstalledToolkit(distDirectory: string, toolkitDirectory: string): Toolkit {
  const manifestPath = join(distDirectory, 'package-manifest.json');
  let source: string;
  try {
    source = readFileSync(manifestPath, 'utf8');
  } catch (cause) {
    // Proof: removing this context exposed raw ENOENT and EISDIR diagnostics for the installed
    // package boundary; the packed-command negatives require the manifest path and state.
    throw new Error(`installed package manifest is unreadable: ${manifestPath}`, { cause });
  }
  let input: unknown;
  try {
    input = JSON.parse(source) as unknown;
  } catch (cause) {
    // Proof: replacing malformed JSON with `{}` made it reach schema validation; the production
    // negative lost the malformed-state refusal that distinguishes damaged bytes from fields.
    throw new Error(`installed package manifest is malformed: ${manifestPath}`, { cause });
  }
  let manifest: typeof PackageManifest.infer;
  try {
    manifest = parseOrThrow(PackageManifest, input);
  } catch (cause) {
    // Proof: skipping schema validation let `{}` reach toolkit comparison with an absent expected
    // identity; the installed-command negative then lost the invalid-schema boundary.
    throw new Error(`installed package manifest is invalid: ${manifestPath}`, { cause });
  }
  const toolkit = readToolkit(toolkitDirectory);
  // Proof: replacing the expected identity with the selected identity let a repacked package
  // substitute a self-consistent validator and toolkit descriptor; the installed-package negative
  // then executed the substituted validator instead of refusing the package/toolkit mismatch.
  if (toolkit.digest !== manifest.toolkitIdentity) {
    throw new Error(
      `installed toolkit differs from package manifest: ${toolkit.digest} != ${manifest.toolkitIdentity}`,
    );
  }
  return toolkit;
}
