import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'bun:test';
import { type ParseError, printParseErrorCode, visit } from 'jsonc-parser';

import { readDepthSensitiveConfigPaths } from '../workspace-inventory.mjs';

const WORKSPACE = new URL('../../../', import.meta.url);

interface DepthSensitivePath {
  readonly file: string;
  readonly propertyPath: string;
  readonly value: string;
}

/**
 * Every project or TypeScript configuration file below `directory`, found by walking the directory
 * tree rather than by asking Nx which projects exist, so that a project the inventory's own
 * discovery drops is still enumerated here.
 */
async function findConfigs(directory: string, found: string[] = []): Promise<string[]> {
  const entries = await readdir(join(fileURLToPath(WORKSPACE), directory), {
    withFileTypes: true,
  });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await findConfigs(path, found);
    else if (entry.name === 'project.json' || /^tsconfig(?:\.[^.]+)?\.json$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Refuse a configuration file this oracle cannot parse. The oracle reads files the production
 * inventory's project-scoped discovery need not reach, so its own boundary must refuse malformed
 * trusted state rather than report whatever the tolerant visitor managed to emit before the error.
 *
 * @throws Error naming the workspace-relative file and every parse error code it carries.
 */
function refuseUnparsableConfig(file: string, errors: readonly ParseError[]): void {
  if (errors.length > 0) {
    const failures = errors.map(({ error }) => printParseErrorCode(error)).join(', ');
    throw new Error(`cannot parse ${file}: ${failures}`);
  }
}

/**
 * The same inventory, derived a second way: a streaming JSONC visit reporting every string literal
 * carrying `../` with the property path it sits at. It shares no code with
 * `readDepthSensitiveConfigPaths`'s recursive object walk, so a filter added to that walk makes the
 * two disagree. It is not a pinned total, so a project that gains a parent-relative target path or
 * configuration file moves both sides together and needs no edit here.
 */
async function readOraclePaths(): Promise<DepthSensitivePath[]> {
  const files = [...(await findConfigs('apps')), ...(await findConfigs('libs'))].sort();
  const paths: DepthSensitivePath[] = [];
  for (const file of files) {
    const text = await readFile(join(fileURLToPath(WORKSPACE), file), 'utf8');
    const errors: ParseError[] = [];
    visit(
      text,
      {
        onLiteralValue(value, _offset, _length, _startLine, _startCharacter, pathOf) {
          if (typeof value === 'string' && value.includes('../')) {
            paths.push({ file, propertyPath: pathOf().join('.'), value });
          }
        },
        onError(error, offset, length) {
          errors.push({ error, offset, length });
        },
      },
      { allowTrailingComma: true },
    );
    refuseUnparsableConfig(file, errors);
  }
  return paths;
}

function sortPathKeys(paths: readonly DepthSensitivePath[]): string[] {
  return paths.map(({ file, propertyPath, value }) => `${file}\0${propertyPath}\0${value}`).sort();
}

async function failureMessageOf(reading: Promise<readonly unknown[]>): Promise<string> {
  try {
    await reading;
  } catch (failure) {
    if (failure instanceof Error) return failure.message;
    throw new Error('inventory rejected without an Error', { cause: failure });
  }
  throw new Error('inventory unexpectedly succeeded');
}

it('finds every parent-relative path in project and TypeScript configuration', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'workspace-inventory-'));
  await Promise.all(
    ['apps/probe', 'libs', 'tools'].map((root) =>
      mkdir(join(workspace, root), { recursive: true }),
    ),
  );
  await writeFile(
    join(workspace, 'apps/probe/project.json'),
    JSON.stringify({
      name: 'probe',
      tags: ['scope:app', 'ring:adapter', 'runtime:bun'],
      targets: { test: {} },
      $schema: '../../node_modules/nx/schemas/project-schema.json',
    }),
  );
  await writeFile(
    join(workspace, 'apps/probe/tsconfig.json'),
    `{
      // JSONC is the TypeScript configuration boundary.
      "extends": "../../tsconfig.base.json",
      "compilerOptions": { "outDir": "../../dist/out-tsc" },
      "references": [{ "path": "./tsconfig.spec.json" }]
    }`,
  );

  expect(await readDepthSensitiveConfigPaths(workspace)).toEqual([
    {
      file: 'apps/probe/project.json',
      propertyPath: '$schema',
      value: '../../node_modules/nx/schemas/project-schema.json',
    },
    {
      file: 'apps/probe/tsconfig.json',
      propertyPath: 'compilerOptions.outDir',
      value: '../../dist/out-tsc',
    },
    {
      file: 'apps/probe/tsconfig.json',
      propertyPath: 'extends',
      value: '../../tsconfig.base.json',
    },
  ]);
});

it('refuses malformed depth-sensitive configuration by its workspace path', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'workspace-inventory-'));
  await Promise.all(
    ['apps/probe', 'libs', 'tools'].map((root) =>
      mkdir(join(workspace, root), { recursive: true }),
    ),
  );
  await writeFile(
    join(workspace, 'apps/probe/project.json'),
    JSON.stringify({
      name: 'probe',
      tags: ['scope:app', 'ring:adapter', 'runtime:bun'],
      targets: { test: {} },
    }),
  );
  await writeFile(join(workspace, 'apps/probe/tsconfig.json'), '{ "extends": "../../oops" ');

  expect(await failureMessageOf(readDepthSensitiveConfigPaths(workspace))).toStartWith(
    'cannot parse apps/probe/tsconfig.json:',
  );
});

it('pins the complete moved depth-sensitive configuration inventory', async () => {
  const paths = await readDepthSensitiveConfigPaths(WORKSPACE);

  // Proof: filtering out `compilerOptions.outDir` made this production-workspace
  // oracle fail with 111 instead of 148 rows and omitted the core outDir below
  // (2026-09-14).
  // Proof: adding libs/shared/domain/validation's three tsconfigs without
  // raising these numbers failed with `Received length: 152` rows, then
  // `Received length: 76` files (2026-09-15).
  // Proof: adding the `@shared/validation` path mapping to fe-01's four tsconfigs without
  // raising the row count failed with `Received length: 156` against the pinned 152; the file
  // count stayed at 76 because all four were already inventoried (2026-09-16).
  // Proof: leaving 156/76 here after tool-wiki became the app apps/wiki/cli failed with
  // `Received length: 162` rows, then `Received length: 80` files — this inventory reads apps
  // and libraries only, so the project's four configuration files entered it for the first time
  // with six parent-relative values between them (2026-09-16).
  // Proof: leaving 162 here after the package release added apps/wiki/cli's `test:package`
  // target failed with `Received length: 163`; its command carries the project's seventh
  // parent-relative value in the already-inventoried project.json, so the file count holds
  // at 80 (2026-09-18).
  // Re-pinned after shared-failures added four configuration files carrying four
  // parent-relative values (2026-09-20).
  // Proof: leaving 163 here after the test-axes level targets landed failed with `Received
  // length: 166`: `wbs-store-sqlite:test:api`, `wbs-store-sqlite:test:unit` and
  // `wbs-core:test:unit` each carry one parent-relative JUnit path in an already-inventoried
  // project.json, so the file count holds at 80. Seen in the planner's whole-suite run; the
  // packet did not name this pin (2026-09-20).
  // Proof: merging the shared-failures lane (167 rows, 84 files) with the test-axes lane (166
  // rows, 80 files) needed both: with the rows pinned at 0 the merged tree reported `Received
  // length: 170`, then with the files pinned at 0, `Received length: 84`: four files and four rows
  // from shared-failures, three rows from the level targets (2026-09-20). Two lanes meeting at one
  // hand-moved count is a conflict by construction; work item G2 derives it.
  const oracle = await readOraclePaths();

  // Proof: returning `[]` as the first statement of `readOraclePaths` failed here with `Received:
  // 0` against the greater-than-100 guard, before tuple equality could pass vacuously (2026-09-21).
  expect(oracle.length).toBeGreaterThan(100);
  // Proof: filtering `compilerOptions.outDir` in `collectParentRelativePaths` failed tuple equality
  // with 44 expected rows absent from the production inventory (2026-09-21).
  // Proof: narrowing `isProjectConfig` to bare `tsconfig.json` failed tuple equality with 103
  // expected rows absent from the production inventory (2026-09-21).
  // Proof: removing the library branch from the production project-root filter failed tuple
  // equality with 65 expected rows absent from the production inventory (2026-09-21).
  // Proof: truncating apps/wbs/be-01/tsconfig.json failed in the production module with `cannot
  // parse apps/wbs/be-01/tsconfig.json: CloseBraceExpected` (2026-09-21).
  // Proof: disabling the production module's parse-error branch while leaving that file truncated
  // failed from `refuseUnparsableConfig` here with the same file and error code (2026-09-21).
  expect(sortPathKeys(paths)).toEqual(sortPathKeys(oracle));
  expect(paths).toContainEqual({
    file: 'apps/wbs/be-01/tsconfig.json',
    propertyPath: 'extends',
    value: '../../../tsconfig.base.json',
  });
  expect(paths).toContainEqual({
    file: 'libs/wbs/application/core/tsconfig.lib.json',
    propertyPath: 'compilerOptions.outDir',
    value: '../../../../dist/out-tsc',
  });
  expect(paths).toContainEqual({
    file: 'libs/wbs/adapters/solver-supervisor-protocol/tsconfig.lib.json',
    propertyPath: 'compilerOptions.outDir',
    value: '../../../../dist/out-tsc',
  });
  expect(paths).toContainEqual({
    file: 'apps/wbs/fe-01/tsconfig.e2e.json',
    propertyPath: 'compilerOptions.paths.@wbs/domain/workday.0',
    value: '../../../libs/wbs/domain/domain/src/workday.ts',
  });
  // Proof: pinning the pre-move `../../dist/tools/tool-wiki` here failed this oracle with the
  // moved project's actual three-deep outDir (2026-09-16).
  // Proof: pinning the three-deep outDir the project had before it joined the Twilight
  // Structure suite failed this oracle with its actual four-deep one (2026-09-25).
  expect(paths).toContainEqual({
    file: 'apps/twilight-structure/twilight-burokrat/cli/tsconfig.lib.json',
    propertyPath: 'compilerOptions.outDir',
    value: '../../../../dist/apps/twilight-structure/twilight-burokrat/cli',
  });
});

it('hashes every recursively discovered app and library TypeScript config', async () => {
  // Proof: after a 1/1 local cache hit, changing only
  // `libs/wbs/application/core/tsconfig.lib.json` made the owning target execute and fail with
  // 147 instead of 148 inventory rows (2026-09-14).
  const manifest = await Bun.file(new URL('../project.json', import.meta.url)).text();
  expect(manifest).toContain('"{workspaceRoot}/apps/**/tsconfig*.json"');
  expect(manifest).toContain('"{workspaceRoot}/libs/**/tsconfig*.json"');
});
