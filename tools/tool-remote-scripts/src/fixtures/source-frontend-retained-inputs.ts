import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { scratchAsync } from '@tools/test-scratch';

import type * as MaterializerModule from './source-frontend-profile';

const ROOT = resolve(import.meta.dir, '../../../..');
const SOURCE_PATHS = [
  'apps/wbs/fe-01/index.html',
  'apps/wbs/fe-01/src/main.tsx',
  'apps/wbs/fe-01/vite.config.ts',
  'apps/wbs/fe-01/project.json',
  'deploy/dev-src/Dockerfile',
  'deploy/dev-src/compose.yml',
  'package.json',
  'bun.lock',
];
const DEPENDENCY_PATHS = [
  'node_modules/vite/package.json',
  'node_modules/vite/dist/node/chunks/node.js',
  'node_modules/vite/dist/node/index.js',
  'node_modules/@vitejs/plugin-react/package.json',
  'node_modules/@vitejs/plugin-react/dist/index.js',
  'node_modules/@tailwindcss/vite/package.json',
  'node_modules/@tailwindcss/vite/dist/index.mjs',
  'node_modules/react/package.json',
  'node_modules/react-dom/package.json',
  'node_modules/rolldown/package.json',
];

/**
 * Materializes the retained registry-S3/configuration inputs through an unchanged
 * copy of {@link import('./source-frontend-profile').prepareSourceFrontendProfile}.
 * Its existing complete size/hash guards authenticate all eighteen actual inputs
 * before copying; live source changes never become retained fixture expectations.
 * The capsule belongs to the test scratch owner and is removed after consumption.
 *
 * Index/main, deploy files and root manifests come from commit
 * 1b24635f141a40638cd39a70a6a1b49566693db4. Vite comes from local Git blob
 * f0fab672c7e15fe63c38dba8fd9c42cbab2047b5. The project is reconstructed from
 * b73a40f9d306a64518f153d4152affc868e7dbc6 by changing exactly three reviewed
 * Playwright references to cross-work-package; its full existing pin authenticates
 * that reconstruction. The serial-lint variant uses exact retained main Vite
 * and project bytes from 9d57780286fff21d6a29521bebce4ff68aae5f1f. These are selection inputs, not historical HTTP captures
 * or qualification of the current live source or Vite producer. Installed package
 * inputs remain live and must satisfy the unchanged materializer's fixed pins.
 */
export async function prepareRetainedSourceFrontendProfile(
  destination: string,
  configuration: 'renamed' | 'serial-lint' = 'renamed',
): Promise<void> {
  const capsule = await scratchAsync('source-frontend-retained-');
  try {
    for (const path of [...SOURCE_PATHS, ...DEPENDENCY_PATHS]) {
      const retained =
        configuration === 'serial-lint' && path === 'apps/wbs/fe-01/vite.config.ts'
          ? 'apps/wbs/fe-01/vite.serial-lint.config.ts'
          : configuration === 'serial-lint' && path === 'apps/wbs/fe-01/project.json'
            ? 'apps/wbs/fe-01/project.serial-lint.json'
            : path;
      const selected = SOURCE_PATHS.includes(path)
        ? join(import.meta.dir, 'source-frontend-retained-inputs', retained + '.txt')
        : join(ROOT, path);
      const target = join(capsule, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await readFile(selected));
    }
    const copied = join(
      capsule,
      'tools/tool-remote-scripts/src/fixtures/source-frontend-profile.ts',
    );
    await mkdir(dirname(copied), { recursive: true });
    await writeFile(copied, await readFile(join(import.meta.dir, 'source-frontend-profile.ts')));
    // The import boundary is the exact repository module copied into this owned capsule.
    const materializer = (await import(pathToFileURL(copied).href)) as typeof MaterializerModule;
    // Proof: a same-length retained project asset fault refused all 22 configuration
    // preparations; exact restoration passed the same selected tests (2026-11-21).
    await materializer.prepareSourceFrontendProfile(destination);
  } finally {
    await rm(capsule, { recursive: true });
  }
}
