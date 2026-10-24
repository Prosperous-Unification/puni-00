import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, link, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { installed, roots } from '../fixtures/source-startup';
import { captureSourceRestartTree } from './source-startup-manifest';

const openapi = '{"openapi":"3.1.0","info":{"title":"independent pinned source fixture"}}\n';
const digest = (contents: string) => createHash('sha256').update(contents).digest('hex');
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function generated(root: string) {
  for (const path of ['.nx/workspace-data', 'node_modules/.vite', 'apps/wbs/fe-01/.vite/deps']) {
    await mkdir(join(root, path), { recursive: true, mode: 0o755 });
    await writeFile(join(root, path, 'generated.json'), '{}\n', { mode: 0o644 });
  }
  await writeFile(join(root, 'apps/wbs/mcp-01/src/openapi.json'), openapi, { mode: 0o644 });
}
test('source restart tree keeps cold rejection and admits only fixed generated running outputs', async () => {
  const prepared = await installed();
  const monitor = await captureSourceRestartTree(
    prepared.root,
    prepared.manifest,
    performance.now() + 10000,
    digest(openapi),
  );
  await monitor.inspectCold();
  await generated(prepared.root);
  await monitor.inspectRunning();
  await rejects(monitor.inspectCold());
});
for (const fault of [
  'extra-input',
  'changed-input',
  'same-byte-input',
  'parent',
  'public-input',
  'wrong-openapi',
  'missing-openapi',
  'derived-symlink',
  'derived-hardlink',
  'derived-root-file',
  'old-dist',
] as const)
  test(`running source inputs refuse ${fault}`, async () => {
    const prepared = await installed();
    const monitor = await captureSourceRestartTree(
      prepared.root,
      prepared.manifest,
      performance.now() + 10000,
      digest(openapi),
    );
    await generated(prepared.root);
    const input = join(prepared.root, 'apps/wbs/be-01/src/main.ts');
    if (fault === 'extra-input')
      await writeFile(join(prepared.root, 'apps/wbs/be-01/src/shadow.ts'), 'export {};\n');
    if (fault === 'changed-input') await writeFile(input, 'PRIVATE_INPUT_CHANGE\n');
    if (fault === 'same-byte-input') {
      const original = await readFile(input);
      await rm(input);
      await writeFile(input, original, { mode: 0o644 });
    }
    if (fault === 'parent') {
      await rename(
        join(prepared.root, 'apps/wbs/be-01/src'),
        join(prepared.root, 'apps/wbs/be-01/old-source'),
      );
      await mkdir(join(prepared.root, 'apps/wbs/be-01/src'));
      await link(join(prepared.root, 'apps/wbs/be-01/old-source/main.ts'), input);
    }
    if (fault === 'public-input') await chmod(input, 0o666);
    if (fault === 'wrong-openapi')
      await writeFile(join(prepared.root, 'apps/wbs/mcp-01/src/openapi.json'), '{}\n');
    if (fault === 'missing-openapi')
      await rm(join(prepared.root, 'apps/wbs/mcp-01/src/openapi.json'));
    if (fault === 'derived-symlink')
      await symlink(
        '../../apps/wbs/be-01/src/main.ts',
        join(prepared.root, 'node_modules/.vite/alias'),
      );
    if (fault === 'derived-hardlink')
      await link(input, join(prepared.root, 'node_modules/.vite/alias'));
    if (fault === 'derived-root-file') {
      await rm(join(prepared.root, '.nx'), { recursive: true });
      await writeFile(join(prepared.root, '.nx'), '{}\n', { mode: 0o644 });
    }
    if (fault === 'old-dist') await mkdir(join(prepared.root, 'dist'));
    await rejects(monitor.inspectRunning());
    expect(
      await readFile(join(prepared.root, 'apps/wbs/mcp-01/src/main.ts'), 'utf8'),
    ).not.toContain('PRIVATE_INPUT_CHANGE');
  });
