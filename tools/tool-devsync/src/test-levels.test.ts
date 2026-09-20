import { describe, expect, it } from 'bun:test';

import {
  AGGREGATE_TARGETS,
  conformanceFilesIn,
  KNOWN_OUTSIDE_TEST_ROOTS,
  LEVEL_TARGETS,
  levelOf,
  readManifest,
  TEST_TARGET_NAME,
  testFilesInProject,
  testFilesUnder,
  UNDECLARED_TEST_TARGETS,
} from './test-levels';

const SQLITE = 'libs/wbs/adapters/store-sqlite';
const SQLITE_CONFORMANCE = 'src/testing/source-conformance.db.test.ts';

/** The conformance files a project's own `test:conformance` target names. */
async function conformanceFilesOf(root: string): Promise<readonly string[]> {
  const manifest = await readManifest(root);
  const command = manifest.targets['test:conformance']?.options?.command;
  return command === undefined ? [] : conformanceFilesIn(command);
}

describe('the level-selection table', () => {
  it('resolves the plain and the database conformance suffixes through target membership', () => {
    expect([
      levelOf(SQLITE_CONFORMANCE, [SQLITE_CONFORMANCE]),
      levelOf('src/testing/source-conformance.test.ts', ['src/testing/source-conformance.test.ts']),
      levelOf('src/assignment-scope.db.test.ts', [SQLITE_CONFORMANCE]),
      levelOf('src/audit.test.ts', [SQLITE_CONFORMANCE]),
    ]).toEqual(['conformance', 'conformance', 'api', 'unit']);
  });

  it('refuses a file that matches no row', () => {
    expect(() => levelOf('e2e/plan.spec.ts', [])).toThrow('matches no row');
  });

  it('reads the conformance files out of the real targets', async () => {
    expect([
      await conformanceFilesOf(SQLITE),
      await conformanceFilesOf('libs/wbs/adapters/store-memory'),
    ]).toEqual([[SQLITE_CONFORMANCE], ['src/testing/source-conformance.test.ts']]);
  });
});

describe('the adopted projects', () => {
  it('keeps every test file outside a declared test root on the known list', async () => {
    const outside: string[] = [];
    for (const root of new Set(LEVEL_TARGETS.map((target) => target.root))) {
      const declared = new Set(
        (
          await Promise.all(
            LEVEL_TARGETS.filter((target) => target.root === root).flatMap((target) =>
              target.testRoots.map((testRoot) => testFilesUnder(root, testRoot)),
            ),
          )
        ).flatMap((files) => files.map((file) => `${root}/${file}`)),
      );
      outside.push(...(await testFilesInProject(root)).filter((file) => !declared.has(file)));
    }
    expect(outside.sort()).toEqual(Object.keys(KNOWN_OUTSIDE_TEST_ROOTS).sort());
  });

  it('accounts for every test-running target as a level, an aggregate or a known exception', async () => {
    const unaccounted: string[] = [];
    const declared = new Set(LEVEL_TARGETS.map(({ project, target }) => `${project}:${target}`));
    for (const root of new Set(LEVEL_TARGETS.map((target) => target.root))) {
      const manifest = await readManifest(root);
      for (const name of Object.keys(manifest.targets)) {
        if (!TEST_TARGET_NAME.test(name)) continue;
        const qualified = `${manifest.name}:${name}`;
        const accounted =
          declared.has(qualified) ||
          AGGREGATE_TARGETS.includes(qualified) ||
          qualified in UNDECLARED_TEST_TARGETS;
        if (!accounted) unaccounted.push(qualified);
      }
    }
    expect(unaccounted.sort()).toEqual([]);
  });
});
