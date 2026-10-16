import { readFileSync, realpathSync } from 'node:fs';

import { resolveValidatorArtifactPaths } from '../policy/trust';
import { hashTrustedModules } from '../policy/trusted-modules';
import { hashBytes, hashCanonical } from './content-manifest';

/**
 * Identifies the actual entry dependency bytes and Bun executable used by this invocation.
 * A bundled entry identifies its executed bundle, while a source entry follows its imports.
 * Configured trusted modules are included because graph extraction loads its compiler dynamically.
 * @throws when an entry, dependency, executable or configured trusted module cannot be read.
 */
export function identifyCoverageRuntime(entryPath: string) {
  const paths = new Set([
    ...resolveValidatorArtifactPaths([entryPath]),
    realpathSync(process.execPath),
  ]);
  const artifacts = [...paths].sort().map((path) => ({
    path,
    // Proof: replacing artifact hashes with zeros made an imported dependency edit keep its identity; runtime identity changes failed.
    sha256: hashBytes(readFileSync(path)),
  }));
  const modules = process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'];
  const runtime = {
    artifacts,
    runtimeVersion: Bun.version,
    trustedModules:
      modules === undefined
        ? { kind: 'not-configured' as const }
        : {
            kind: 'configured' as const,
            path: realpathSync(modules),
            digest: hashTrustedModules(modules),
          },
  };
  return { ...runtime, digest: hashCanonical(runtime) };
}
