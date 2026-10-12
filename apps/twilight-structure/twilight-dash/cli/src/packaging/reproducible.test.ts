import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { buildLauncher, launcherBuildConfig, normaliseLauncher, workspaceRoot } from './build';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

/** The package directory under `node_modules` that holds `path`, scoped names included. */
function packageDirectory(path: string): string {
  const marker = path.lastIndexOf('node_modules/');
  if (marker < 0) throw new Error(`not a node_modules path: ${path}`);
  const segments = path.slice(marker + 'node_modules/'.length).split('/');
  const name = segments[0].startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  return join(path.slice(0, marker), 'node_modules', name);
}

/**
 * Copies every input of the launcher build, whole packages for `node_modules` inputs, and the
 * manifests and TypeScript configurations that steer resolution, into a fresh root. Copies, not
 * symlinks, so the bundler sees a different real path.
 */
async function copyBuildInputs(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), `dash-launcher-${String(roots.length)}-`));
  roots.push(root);
  const built = await Bun.build({ ...launcherBuildConfig(), metafile: true });
  if (!built.success || built.metafile === undefined) throw new Error('metafile build failed');
  const inputs = Object.keys(built.metafile.inputs).map((path) => resolve(process.cwd(), path));
  const copied = new Set<string>();
  for (const input of inputs) {
    const source = input.includes('/node_modules/') ? packageDirectory(input) : input;
    if (copied.has(source)) continue;
    copied.add(source);
    cpSync(source, join(root, relative(workspaceRoot, source)), {
      recursive: true,
      verbatimSymlinks: true,
    });
  }
  for (const path of ['package.json', 'tsconfig.base.json', 'node_modules/typescript']) {
    cpSync(join(workspaceRoot, path), join(root, path), {
      recursive: true,
      verbatimSymlinks: true,
    });
  }
  for (const input of inputs.filter((path) => !path.includes('/node_modules/'))) {
    for (
      let directory = dirname(input);
      directory !== workspaceRoot;
      directory = dirname(directory)
    ) {
      for (const name of ['tsconfig.json', 'package.json']) {
        const config = join(directory, name);
        if (existsSync(config)) cpSync(config, join(root, relative(workspaceRoot, config)));
      }
    }
  }
  return root;
}

test('two checkouts at different paths build byte-identical launchers', async () => {
  // Proof: with the root normalisation removed from build.ts, the bundle built at the first copy
  // still named that copy through TypeScript's inlined `__dirname`; without the throw in
  // `normaliseLauncher` the `includes(root)` assertion failed instead (2026-10-12).
  const first = await copyBuildInputs();
  const second = await copyBuildInputs();
  const identities: string[] = [];
  for (const root of [first, second]) {
    const destination = join(root, 'dist');
    identities.push(await buildLauncher(destination, Bun.build, root));
    const bundle = readFileSync(join(destination, 'observation-service.mjs'), 'utf8');
    expect(bundle.includes(root), root).toBe(false);
    expect(bundle.includes('/home/'), root).toBe(false);
    expect(bundle.includes(workspaceRoot), root).toBe(false);
    // Bun's per-module comments name paths relative to the building process's working directory.
    // Proof: dropping the whitespace minification from build.ts left `// ../…/node_modules/…`
    // comments and failed here (2026-10-12).
    expect(/^\/\/ (?!@bun\b).*$/m.exec(bundle)?.[0] ?? null, root).toBeNull();
  }
  expect(identities[0]).toBe(identities[1]);
}, 180_000);

test('normaliseLauncher refuses home, cache and checkout paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'dash-launcher-paths-'));
  roots.push(root);
  expect(normaliseLauncher(`var d = "${root}/node_modules/x";`, root)).toBe(
    'var d = "node_modules/x";',
  );
  for (const leaked of [
    `${homedir()}/.bun/install/cache/x`,
    `${homedir()}/wd/other-checkout/node_modules/x`,
    root,
  ]) {
    expect(() => normaliseLauncher(`var d = "${leaked}";`, root), leaked).toThrow(
      'launcher still names a build-host path',
    );
  }
});
