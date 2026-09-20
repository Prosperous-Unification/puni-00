import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The workspace root, from this file's own location. */
export const WORKSPACE = new URL('../../../', import.meta.url);

/**
 * The levels of the level-selection table the adopted projects can reach.
 *
 * Manual, Architecture, Performance, Browser and View exist in the table and are
 * not reachable from the adopted projects' test roots, so {@link levelOf} throws
 * rather than guessing when a file matches no row it knows.
 */
export type TestLevel = 'api' | 'conformance' | 'unit';

/** One Nx target declared to run exactly one level. */
export interface LevelTarget {
  readonly project: string;
  /** The project's root, workspace-relative. It is also the target's `cwd`. */
  readonly root: string;
  readonly target: string;
  readonly level: TestLevel;
  /** Where this target's JUnit report lands, workspace-relative. */
  readonly report: string;
  /** Directories under `root` this target's level is enumerated from. */
  readonly testRoots: readonly string[];
}

/**
 * The level targets adopted by the first increment of the test-axes change.
 *
 * Two projects, because they hold every test of the adopted capability. Adding a
 * row obliges that target to collect exactly the files {@link levelOf} puts at
 * its level.
 */
export const LEVEL_TARGETS: readonly LevelTarget[] = [
  {
    project: 'wbs-store-sqlite',
    root: 'libs/wbs/adapters/store-sqlite',
    target: 'test:api',
    level: 'api',
    report: 'tmp/junit/wbs-store-sqlite.api.xml',
    testRoots: ['src'],
  },
  {
    project: 'wbs-store-sqlite',
    root: 'libs/wbs/adapters/store-sqlite',
    target: 'test:unit',
    level: 'unit',
    report: 'tmp/junit/wbs-store-sqlite.unit.xml',
    testRoots: ['src'],
  },
  {
    project: 'wbs-core',
    root: 'libs/wbs/application/core',
    target: 'test:unit',
    level: 'unit',
    report: 'tmp/junit/wbs-core.unit.xml',
    testRoots: ['src'],
  },
];

/**
 * Targets of an adopted project declared to span levels on purpose.
 *
 * They are exempt from isolation while they say so. This increment does not
 * implement the other half of TEST-AXES-005 — an undeclared target that spans
 * levels is not refused — because no undeclared target of an adopted project
 * spans levels today.
 */
export const AGGREGATE_TARGETS: readonly string[] = ['wbs-store-sqlite:test', 'wbs-core:test'];

/**
 * Test-running targets of an adopted project that are neither a level target nor
 * an aggregate, each with the reason.
 *
 * The partition case leaves no remainder, so a new test target has to arrive in
 * one of these three lists.
 */
export const UNDECLARED_TEST_TARGETS: Readonly<Record<string, string>> = {
  'wbs-store-sqlite:test:conformance':
    'Conformance level. Its exact command is pinned by workspace-targets.test.ts, so it cannot ' +
    'gain a JUnit report in this increment.',
  'wbs-core:test:portable':
    'Browser level, run by Playwright from libs/wbs/application/core/playwright.config.ts.',
};

/**
 * Test files of an adopted project that lie outside its declared test roots.
 *
 * A list rather than a rule, for the reason `vitest.node-suites.ts` gives: the
 * entry carries why, and the case that reads it walks the tree, so the list
 * cannot go stale.
 */
export const KNOWN_OUTSIDE_TEST_ROOTS: Readonly<Record<string, string>> = {
  // Proof: deleting this entry failed "keeps every test file outside a declared test root on the
  // known list", naming portable-composition.spec.ts as an unexpected outside file (2026-09-20).
  'libs/wbs/application/core/testing/portable-composition.spec.ts':
    'Browser: collected by libs/wbs/application/core/playwright.config.ts (testDir ./testing, ' +
    'testMatch portable-composition.spec.ts) and run by wbs-core:test:portable, which this ' +
    'increment does not declare as a level target.',
};

/** Bun's own default test-file matcher, so enumeration sees what the runner sees. */
export const BUN_TEST_FILE = /(?:\.|_)(?:test|spec)\.[cm]?[jt]sx?$/;

/** Nx target names that run a test runner. */
export const TEST_TARGET_NAME = /^(?:test|integration|e2e)(?:[:-].+)?$/;

/** Directories never walked when enumerating a project's test files. */
const NEVER_WALKED = new Set(['node_modules', 'dist', 'coverage', 'test-results']);

/** One Nx target as a project manifest spells it. */
export interface ManifestTarget {
  readonly options?: { readonly command?: string; readonly cwd?: string };
}

/** One project manifest, reduced to what this module reads. */
export interface ProjectManifest {
  readonly name: string;
  readonly targets: Readonly<Record<string, ManifestTarget | undefined>>;
}

/**
 * One project's `project.json`, read from the workspace.
 *
 * Test boundary: the manifest is Nx's own schema and Nx validates it; this reads
 * the three fields the cases compare.
 *
 * @throws when the manifest is absent or unreadable.
 */
export async function readManifest(root: string): Promise<ProjectManifest> {
  const text = await readFile(new URL(`${root}/project.json`, WORKSPACE), 'utf8');
  return JSON.parse(text) as ProjectManifest;
}

/**
 * The test files a project's `test:conformance` target names.
 *
 * Read from the command rather than declared, because the command is the
 * authority row 2 of the level-selection table points at.
 */
export function conformanceFilesIn(command: string): readonly string[] {
  return [...command.matchAll(/\S+(?:\.|_)(?:test|spec)\.[cm]?[jt]sx?/g)].map(([path]) => path);
}

/**
 * The level of one test file of an adopted project, by the level-selection
 * table, in precedence order.
 *
 * @param projectRelativePath the path the runner names the file with
 * @param conformanceFiles what the project's `test:conformance` target names
 * @throws when no row matches, because an unclassified test file is scenario
 * TEST-AXES-001 and a default would hide it.
 */
export function levelOf(
  projectRelativePath: string,
  conformanceFiles: readonly string[],
): TestLevel {
  // Proof: deleting this precedence guard failed "resolves the plain and the database conformance
  // suffixes through target membership", receiving api and unit for its first two levels
  // (2026-09-20).
  if (conformanceFiles.includes(projectRelativePath)) return 'conformance';
  if (/\.db\.test\.[cm]?[jt]sx?$/.test(projectRelativePath)) return 'api';
  if (/\.test\.[cm]?[jt]s$/.test(projectRelativePath)) return 'unit';
  // Proof: replacing this throw with `return 'unit'` failed "refuses a file that matches no row"
  // because the received value was "unit" and no exception was thrown (2026-09-20).
  throw new Error(
    `${projectRelativePath} matches no row of the level-selection table this increment implements`,
  );
}

/** Every file Bun's runner would collect under `root`/`dir`, `root`-relative and sorted. */
export async function testFilesUnder(root: string, dir: string): Promise<string[]> {
  const found: string[] = [];
  const base = join(new URL(`${root}/`, WORKSPACE).pathname, dir);
  const glob = new Bun.Glob('**/*');
  for await (const entry of glob.scan({ cwd: base })) {
    if (entry.split('/').some((segment) => NEVER_WALKED.has(segment))) continue;
    if (BUN_TEST_FILE.test(entry)) found.push(`${dir}/${entry}`);
  }
  return found.sort();
}

/** Every file Bun's runner would collect anywhere under `root`, workspace-relative and sorted. */
export async function testFilesInProject(root: string): Promise<string[]> {
  const found: string[] = [];
  const glob = new Bun.Glob('**/*');
  for await (const entry of glob.scan({ cwd: new URL(`${root}/`, WORKSPACE).pathname })) {
    if (entry.split('/').some((segment) => NEVER_WALKED.has(segment))) continue;
    if (BUN_TEST_FILE.test(entry)) found.push(`${root}/${entry}`);
  }
  return found.sort();
}
