import { cpSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { hashBytes } from '../evidence/content-manifest';
import { RelocationRefusal } from './relocation-refusal';

/**
 * Resolves one installed package directory, refusing anything that is not a real directory.
 * @throws {@link RelocationRefusal} `R19` naming the path.
 */
export function packageDirectory(modulesRoot: string, name: string): string {
  let path = modulesRoot;
  for (const segment of name.split('/')) {
    path = join(path, segment);
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(path);
    } catch (cause) {
      // Proof: rethrowing this lstat failure unwrapped lost the R19 missing-install diagnostic
      // in the relocation absent-module production negative.
      throw new RelocationRefusal('R19', `trusted node module is absent or a symlink: ${path}`, {
        cause,
      });
    }
    // Proof: inspecting only the final directory admitted vendor/node_modules and scoped-parent
    // symlinks to ambient packages; both trusted-modules production-path negatives returned names.
    if (!stats.isDirectory()) {
      throw new RelocationRefusal('R19', `trusted node module is absent or a symlink: ${path}`);
    }
  }
  return path;
}

/**
 * Release-owned declaration roots. Package, toolkit and relocation builds derive the same
 * installed dependency instances from these roots; candidate imports never extend this list.
 * Reviewed against the 21 TypeScript configs in the WBS diagnostic policy at 7e160ba6911504d8.
 * Includes recursively reached testing helpers and explicit declaration peers @sinclair/typebox,
 * openapi-types and @testing-library/dom; optional peer dependencies never widen the roots.
 */
export const trustedDeclarationRoots = [
  '@ark/schema',
  '@modelcontextprotocol/sdk',
  '@noble/hashes',
  '@opentelemetry/api',
  '@opentelemetry/exporter-prometheus',
  '@opentelemetry/sdk-metrics',
  '@radix-ui/react-dialog',
  '@sinclair/typebox',
  '@tanstack/react-router',
  '@tanstack/react-table',
  '@tanstack/table-core',
  '@testing-library/dom',
  '@testing-library/react',
  '@types/hast',
  '@types/react',
  '@types/react-dom',
  'ajv',
  'application-exception',
  'arktype',
  'bun-types',
  'class-variance-authority',
  'clsx',
  'di-bag',
  'drizzle-orm',
  'elysia',
  'jose',
  'openapi-types',
  'openid-client',
  'pino',
  'react',
  'react-dom',
  'react-markdown',
  'remark-gfm',
  'saxes',
  'tailwind-merge',
  'tldts',
  'typescript',
  'vite',
  'vitest',
  'zod',
] as const;

/**
 * Finds a dependency using Node's ancestor lookup, bounded by the trusted installation.
 * Nested instances keep their installed path so declaration imports resolve to the same version.
 */
function resolveDependency(modulesRoot: string, importer: string, dependency: string): string {
  let directory = importer;
  while (directory !== modulesRoot) {
    if (!directory.endsWith('/node_modules')) {
      const path = join(directory, 'node_modules', dependency);
      try {
        lstatSync(path);
      } catch (cause) {
        if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
        directory = dirname(directory);
        continue;
      }
      return relative(modulesRoot, packageDirectory(join(directory, 'node_modules'), dependency));
    }
    directory = dirname(directory);
  }
  return relative(modulesRoot, packageDirectory(modulesRoot, dependency));
}

/**
 * Sorted package paths for the transitive `dependencies` closure of
 * {@link trustedDeclarationRoots}, resolving each dependency from its installed importer.
 * Paths include nested `node_modules` segments where the lockfile installed another instance.
 * {@link hashTrustedModules} pins the copied bytes for every producer and consumer.
 * @throws {@link RelocationRefusal} `R19` for an absent or non-directory package.
 * @throws Error for unreadable or malformed installed manifests.
 */
export function trustedModuleNames(modulesRoot: string): string[] {
  const names = new Set<string>();
  // Check the compiler first so a missing installation keeps the established compiler refusal.
  const pending: string[] = [
    'typescript',
    ...trustedDeclarationRoots.filter((name) => name !== 'typescript'),
  ];
  for (const name of pending) {
    if (names.has(name)) continue;
    names.add(name);
    const directory = packageDirectory(modulesRoot, name);
    // Installed package manifests are a package-manager boundary. Only `dependencies` is
    // consumed; JSON shape and dependency names are checked before they become filesystem paths.
    const manifest: unknown = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    // Proof: bypassing manifest shape admitted [] and lost the named null refusal in
    // trusted-modules.test.ts; both malformed-manifest negatives failed.
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
      throw new Error(`trusted node module manifest is malformed: ${name}`);
    }
    if (!('dependencies' in manifest)) continue;
    const dependencies = manifest.dependencies;
    // Proof: bypassing dependency-map shape admitted [] and lost the named null refusal;
    // the malformed dependency-map production-path negatives failed.
    if (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies)) {
      throw new Error(`trusted node module dependencies are malformed: ${name}`);
    }
    for (const [dependency, version] of Object.entries(dependencies)) {
      // Proof: bypassing this boundary lost the named refusal for ../../escape and a numeric
      // version in the malformed-dependency production-path negatives.
      if (
        !/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_][a-z0-9_.-]*$/i.test(dependency) ||
        typeof version !== 'string'
      ) {
        throw new Error(`trusted node module dependency is malformed: ${name}: ${dependency}`);
      }
      pending.push(resolveDependency(modulesRoot, directory, dependency));
    }
  }
  return [...names].sort();
}

/** Installed metadata paths that Bun pack always omits; these are never compiler/runtime inputs. */
const omittedPackageMetadata = new Set([
  'elysia/bunfig.toml',
  'exact-mirror/bunfig.toml',
  'memoirist/bunfig.toml',
  'isexe/.npmignore',
  'stackback/.npmignore',
]);

/**
 * Copies only named package instances, preserving installed topology. Nested `node_modules`
 * are copied from the explicit closure entries so unrelated nested packages cannot enter it.
 * Only {@link omittedPackageMetadata} is excluded before hashing to match Bun pack's transport;
 * declarations and runtime assets retain their installed bytes.
 */
export function copyTrustedModules(
  destination: string,
  modulesRoot: string,
  names: readonly string[],
): void {
  mkdirSync(destination, { recursive: true });
  for (const name of [...names].sort()) {
    const source = packageDirectory(modulesRoot, name);
    const target = join(destination, ...name.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, {
      dereference: false,
      recursive: true,
      // Proof: copying nested node_modules wholesale admitted unrelated; the topology
      // production-path test failed its expected missing unrelated/package.json assertion.
      filter: (path) =>
        !relative(source, path).split('/').includes('node_modules') &&
        // Proof: retaining Bun-only metadata broke the packed-command closure digest; the
        // canonical-copy test first failed because elysia/bunfig.toml remained present.
        !omittedPackageMetadata.has(relative(modulesRoot, path)),
    });
  }
}

/**
 * One digest over a copied closure: every regular file below `root`, as sorted
 * `<relative path>:<sha256>` lines. A toolkit records it so a consumer can prove the 24 MB of
 * vendored TypeScript it is about to load is the reviewed copy, which `SHA256SUMS` cannot do
 * file-by-file without dwarfing the descriptor it lives in.
 * @throws Error when `root` is not a readable directory.
 */
export function hashTrustedModules(root: string): string {
  const lines: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : 1,
    )) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path, relative);
      // A symlink inside the closure is not a file this digest can pin; `packageDirectory` already
      // refuses a symlinked package, and a symlinked file below one would resolve outside the copy.
      else if (entry.isFile()) lines.push(`${relative}:${hashBytes(readFileSync(path))}`);
      else throw new Error(`trusted node modules carry a non-regular entry: ${relative}`);
    }
  };
  walk(root, '');
  return hashBytes(new TextEncoder().encode(`${lines.sort().join('\n')}\n`));
}

export function writeBytes(path: string, bytes: Uint8Array | string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return path;
}

/**
 * Bundles one entry into a standalone ESM module with the running Bun. The caller pins that Bun
 * first (`assertPinnedRuntime` in `relocation-activation.ts`, `assertReleaseRuntime` in
 * `release.ts`), because the bundle's digest is what the activation binds.
 * @throws Error naming the entry when the bundle cannot be produced.
 */
export async function buildValidatorBundle(
  entryPath: string,
  entryLabel = entryPath,
): Promise<Uint8Array> {
  let built: Awaited<ReturnType<typeof Bun.build>>;
  try {
    built = await Bun.build({ entrypoints: [entryPath], target: 'bun', format: 'esm' });
  } catch (cause) {
    // Proof: letting Bun's own `Bundle failed` escape named neither the entry nor the candidate;
    // the unbuildable-entry negative expected this message and received `Bundle failed`.
    // `entryLabel` keeps that message the caller's own repository-relative entry rather than a
    // scratch-directory absolute path the operator never wrote.
    throw new Error(`cannot rebuild the candidate validator from ${entryLabel}`, { cause });
  }
  // A build that reports failure without throwing is not reachable from the fixture entries, so
  // this guard carries no observed negative; it keeps an unsuccessful build out of the archive.
  if (!built.success || built.outputs.length !== 1) {
    throw new Error(
      `cannot rebuild the candidate validator from ${entryLabel}: ${built.logs.map(String).join('; ')}`,
    );
  }
  return new Uint8Array(await built.outputs[0].arrayBuffer());
}
