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
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  } catch (cause) {
    throw new Error(`installed package manifest is unreadable: ${manifestPath}`, { cause });
  }
  const manifest = parseOrThrow(PackageManifest, input);
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
