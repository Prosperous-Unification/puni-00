import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';
import ts from 'typescript';

const WORKSPACE = fileURLToPath(new URL('../../..', import.meta.url));
const APPLICATION = 'apps/wbs/fe-01';
const MODULES = `${APPLICATION}/src/modules`;

/** A file the module index's `knowledgeLimit` leaves out: a test suite or a shared fixture. */
const isUntracked = (path: string): boolean =>
  /\.test\.[cm]?[jt]sx?$/.test(path) || path.startsWith(`${APPLICATION}/src/testing/`);

/**
 * The fe-01 application's own module resolution, so `@/…` and the `@wbs/…` paths resolve as the
 * bundler and `tsc` resolve them.
 *
 * @throws When `tsconfig.app.json` is unreadable or malformed.
 */
function readCompilerOptions(): ts.CompilerOptions {
  const config = join(WORKSPACE, APPLICATION, 'tsconfig.app.json');
  const read = ts.readConfigFile(config, (path) => ts.sys.readFile(path));
  if (read.error !== undefined) {
    throw new Error(`${config}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`);
  }
  return ts.parseJsonConfigFileContent(read.config, ts.sys, join(WORKSPACE, APPLICATION)).options;
}

/** Every production source under the application, workspace-relative, sorted. */
async function listProductionSources(): Promise<readonly string[]> {
  const sources: string[] = [];
  for await (const path of new Bun.Glob('src/**/*.{ts,tsx}').scan({
    cwd: join(WORKSPACE, APPLICATION),
  })) {
    const file = `${APPLICATION}/${path}`;
    if (!isUntracked(file)) sources.push(file);
  }
  return sources.sort();
}

/**
 * The workspace-relative files one source imports, through static, type-only, re-export and
 * dynamic imports alike. A specifier the resolver cannot place is an external package.
 */
async function readImportedFiles(
  source: string,
  options: ts.CompilerOptions,
): Promise<readonly string[]> {
  const containing = join(WORKSPACE, source);
  const text = await readFile(containing, 'utf8');
  return ts
    .preProcessFile(text, true, true)
    .importedFiles.map(
      ({ fileName }) =>
        ts.resolveModuleName(fileName, containing, options, ts.sys).resolvedModule
          ?.resolvedFileName,
    )
    .filter((resolved) => resolved !== undefined)
    .map((resolved) => relative(WORKSPACE, resolved).split(sep).join('/'));
}

/**
 * Each module's production importers outside its own directory: the module graph's edges into
 * it. A runtime that installs a module, a sibling that builds on it and a delivery file that
 * reads it are all edges of the same kind here.
 */
async function readImporters(
  modules: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
  const options = readCompilerOptions();
  const importers = new Map(modules.map((name) => [name, new Set<string>()]));
  for (const source of await listProductionSources()) {
    for (const imported of await readImportedFiles(source, options)) {
      const target = /^apps\/wbs\/fe-01\/src\/modules\/([^/]+)\//.exec(imported)?.[1];
      if (target === undefined || source.startsWith(`${MODULES}/${target}/`)) continue;
      importers.get(target)?.add(source);
    }
  }
  return new Map([...importers].map(([name, files]) => [name, [...files].sort()]));
}

/**
 * The production importers a module's README index declares under `externalConsumers`.
 *
 * @throws When the README holds no single `module-index` line, or the block declares its
 *   consumers in any form but a `declared` list of paths.
 */
async function readDeclaredConsumers(name: string): Promise<readonly string[]> {
  const source = await readFile(join(WORKSPACE, MODULES, name, 'README.md'), 'utf8');
  const blocks = source
    .split('\n')
    .map((line) => /^<!-- module-index (\{.*\}) -->$/.exec(line)?.[1])
    .filter((block) => block !== undefined);
  if (blocks.length !== 1) {
    throw new Error(
      `${MODULES}/${name}/README.md holds ${String(blocks.length)} module-index lines`,
    );
  }
  // The README is trusted repository state whose shape the wiki validator owns; the guard below
  // refuses any consumer form this check does not read.
  const block = JSON.parse(blocks[0] ?? '') as {
    externalConsumers?: { kind?: unknown; memberships?: { kind?: unknown; path?: unknown }[] };
  };
  const consumers = block.externalConsumers;
  if (consumers?.kind !== 'declared' || consumers.memberships === undefined) {
    throw new Error(`${MODULES}/${name}/README.md declares no externalConsumers list`);
  }
  return consumers.memberships
    .map((membership) => {
      if (membership.kind !== 'path' || typeof membership.path !== 'string') {
        throw new Error(`${MODULES}/${name}/README.md declares a consumer that is not a path`);
      }
      return membership.path;
    })
    .sort();
}

const modules = (await readdir(join(WORKSPACE, MODULES), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const importers = await readImporters(modules);

/**
 * The frontend module graph check (adopt-frontend-lifetimes task 12): every module's declared
 * consumers equal the production files that import it. The modules a runtime installs rather than
 * a sealed DI Bag graph have no `module.ts` to resolve, so this is the graph they are checked by;
 * the sealed ones are held to the same edges.
 */
describe('frontend module graph', () => {
  // Proof (2026-10-11): filtering every directory out of `modules` failed `has modules to check`
  // with `Expected: > 0, Received: 0`.
  test('has modules to check', () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  // Proof (2026-10-11): deleting `runtime/project-runtime.ts` from calendar-markers' declared
  // consumers failed `calendar-markers is imported only by its declared consumers` with that file
  // as the one received extra importer; on the dispatch base the undeclared
  // `components/people/people-load-summary.tsx` failed directory-management the same way.
  // Answering empty compiler options failed all nine modules: `@/…` stopped resolving.
  test.each(modules)('%s is imported only by its declared consumers', async (name) => {
    expect({ module: name, importers: importers.get(name) }).toEqual({
      module: name,
      importers: await readDeclaredConsumers(name),
    });
  });
});
