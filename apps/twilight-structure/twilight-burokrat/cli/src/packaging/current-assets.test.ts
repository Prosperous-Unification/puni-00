import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { bunToolkitRoles } from '../policy/bun-release';
import { planSelectedBunToolkit } from '../policy/selected-bun-release';
import { readSelectedBunToolkit } from '../policy/toolkit';
import { hashTrustedModules } from '../policy/trusted-modules';
import { createPuniTestLevelManifest, createTestLevelAssets } from './puni-test-levels';
import { readRequiredTestLevelAssets } from './test-level-asset-files';

/** Self-consistency fixture only; no supplied bytes acquire archive or release provenance. */
function withinAssets(
  exercise: (
    directory: string,
    read: () => ReturnType<typeof readRequiredTestLevelAssets>,
    repin: (path: string) => void,
  ) => void,
): void {
  const directory = mkdtempSync(join(tmpdir(), 'puni current assets '));
  let primary: { cause: unknown } | undefined;
  try {
    const toolkit = join(directory, 'toolkit'),
      modules = join(toolkit, 'node_modules');
    const sourceSelection = {
      kind: 'committed' as const,
      revision: 'a'.repeat(40),
      tree: 'b'.repeat(40),
    };
    for (const path of ['playwright/cli.js', 'vite/bin/vite.js', 'nx/dist/bin/nx.js']) {
      mkdirSync(dirname(join(modules, path)), { recursive: true });
      writeFileSync(join(modules, path), 'export {};\n');
    }
    const roleBytes = {
      'launcher.mjs': Buffer.from('export const role="launcher";\n'),
      'snapshotter.ts': Buffer.from('export const role="snapshotter";\n'),
      'validator.mjs': Buffer.from('export const role="validator";\n'),
      'prepare-activation.mjs': Buffer.from('export const role="activation";\n'),
      'prepare-relocation-activation.mjs': Buffer.from('export const role="relocation";\n'),
    };
    const planned = planSelectedBunToolkit({
      tag: 'puni-v0.4.0',
      sourceRevision: sourceSelection.revision,
      bunVersion: Bun.version,
      roleBytes,
      trustedNodeModules: ['playwright', 'vite', 'nx'],
      trustedNodeModulesIdentity: hashTrustedModules(modules),
      sourceSelection,
    });
    for (const role of bunToolkitRoles) writeFileSync(join(toolkit, role), roleBytes[role]);
    writeFileSync(join(toolkit, 'toolkit.json'), planned.descriptor);
    const verified = readSelectedBunToolkit(toolkit, sourceSelection);
    const worker = Buffer.from('export {};\n');
    const source = Buffer.from(
      JSON.stringify({
        format: 'puni-test-level-source',
        version: 1,
        entrypoint: 'apps/puni/cli/src/entrypoint.ts',
        sourceSelection,
        files: [
          { path: 'apps/puni/cli/src/entrypoint.ts', mode: '100644', sha256: hashBytes(worker) },
        ],
      }),
    );
    writeFileSync(join(directory, 'performance-judge.mjs'), worker);
    writeFileSync(join(directory, 'test-level-source.json'), source);
    const assetBytes = createTestLevelAssets(
      sourceSelection,
      Bun.version,
      verified.trustedNodeModulesIdentity,
      hashBytes(worker),
      hashBytes(source),
    );
    writeFileSync(join(directory, 'test-level-assets.json'), assetBytes);
    const writeProfile = (bytes: Uint8Array) => {
      writeFileSync(
        join(directory, 'package-manifest.json'),
        createPuniTestLevelManifest(sourceSelection, verified.digest, hashBytes(bytes)),
      );
    };
    writeProfile(assetBytes);
    const read = () => readRequiredTestLevelAssets(directory, verified);
    expect(read().assets.nodeModules).toBe(modules);
    exercise(directory, read, (path) => {
      const changed: unknown = JSON.parse(Buffer.from(assetBytes).toString('utf8'));
      if (
        changed === null ||
        typeof changed !== 'object' ||
        !('toolchain' in changed) ||
        changed.toolchain === null ||
        typeof changed.toolchain !== 'object'
      )
        throw new Error('Owned descriptor fixture malformed');
      Reflect.set(changed.toolchain, 'directory', path);
      const bytes = Buffer.from(JSON.stringify(changed));
      writeFileSync(join(directory, 'test-level-assets.json'), bytes);
      writeProfile(bytes);
    });
  } catch (cause) {
    primary = { cause };
  }
  try {
    rmSync(directory, { recursive: true });
  } catch (cleanup) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'current asset fixture and release failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}

for (const location of ['toolkit/trusted-node-modules', 'toolkit/alternate'])
  test(
    'current assets refuse an existing repinned noncanonical dependency directory ' + location,
    () => {
      withinAssets((directory, read, repin) => {
        cpSync(join(directory, 'toolkit/node_modules'), join(directory, location), {
          recursive: true,
        });
        repin(location);
        expect(() => read()).toThrow();
        expect(readFileSync(join(directory, location, 'playwright/cli.js'), 'utf8')).toBe(
          'export {};\n',
        );
      });
    },
  );
