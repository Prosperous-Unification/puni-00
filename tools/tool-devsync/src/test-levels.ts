import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { SaxesParser } from 'saxes';

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

/* ─── slice B adds everything below this line ────────────────────────────── */

/**
 * The only flags a declared level target may pass to Bun's runner.
 *
 * An allow-list and not a shape check: `--test-name-pattern`, `--preload`,
 * `--config`, `--bail` and `--todo` all change which tests run, so a target
 * carrying one would satisfy the file-level isolation check while running a
 * different set — a check that cannot fail.
 */
export const ALLOWED_LEVEL_FLAG =
  /^--(?:coverage|coverage-reporter=lcov|reporter=junit|reporter-outfile=\S+)$/;

/** The parts of a declared level target's command. */
export interface LevelCommand {
  /** The directory the command creates before running, as the command spells it. */
  readonly reportDirectory: string;
  /** The shell expression inside `$( … )` that names the files to run. */
  readonly selector: string;
  /** Every flag after the selector, in order. */
  readonly flags: readonly string[];
}

/**
 * The only command shape a declared level target may have:
 * `mkdir -p <dir> && bun test $( <selector> ) <flag>…`.
 *
 * Anchored on purpose. A positional argument after the selector is how a target
 * quietly gains a file of another level without the selector saying so, and a
 * second command substitution is a second selection rule.
 *
 * @throws when the command has any other shape, or carries a flag outside
 * {@link ALLOWED_LEVEL_FLAG}.
 */
export function parseLevelCommand(command: string): LevelCommand {
  const parsed = /^mkdir -p (\S+) && bun test \$\(([^()]*)\)((?: \S+)*)$/.exec(command);
  if (parsed === null) {
    throw new Error(
      `a declared level target must read \`mkdir -p <dir> && bun test $( <selector> ) <flag>…\`; got: ${command}`,
    );
  }
  const [, reportDirectory, selector, rest] = parsed;
  const flags = rest.split(/\s+/).filter(Boolean);
  const refused = flags.filter((flag) => !ALLOWED_LEVEL_FLAG.test(flag));
  if (refused.length > 0) {
    throw new Error(
      `a declared level target may not pass ${refused.join(', ')}; only coverage and JUnit reporting flags are allowed`,
    );
  }
  return { reportDirectory, selector, flags };
}

/**
 * The files one declared level target collects, by running the command's own
 * selector in the target's working directory.
 *
 * The selector is run rather than re-implemented: a second copy of the selection
 * rule is the drift this check exists to catch.
 *
 * @throws when the selector fails.
 */
export function collectedFiles(root: string, selector: string): readonly string[] {
  const run = Bun.spawnSync(['sh', '-c', selector], {
    cwd: new URL(`${root}/`, WORKSPACE).pathname,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (run.exitCode !== 0) {
    throw new Error(`${root}: the file selector failed: ${run.stderr.toString()}`);
  }
  return run.stdout.toString().split(/\s+/).filter(Boolean).sort();
}

/** The report path a target writes, spelled the way its own working directory must spell it. */
export function reportPathFrom(root: string, report: string): string {
  return `${'../'.repeat(root.split('/').length)}${report}`;
}

/* ─── slice C adds everything below this line ─────────────────────────────── */

/** The capability whose scenarios this increment allocates identifiers for. */
export const ADOPTED_CAPABILITY = 'project-assignment-reads';

/** The shape of every scenario identifier: the capability's name, then an ordinal. */
export const SCENARIO_IDENTIFIER = /^\[([A-Z][A-Z0-9-]*-\d{3})\] \S/;

/** @throws when `specMarkdown` holds no requirement or no scenario heading. */
function assertSpecification(specMarkdown: string): void {
  // Proof (C-4): deleting this guard failed "refuses a specification that holds no requirement"
  // with `Received function did not throw` and `Received value: []` (2026-09-20).
  if (!/^### Requirement: /m.test(specMarkdown)) {
    throw new Error('the capability specification holds no `### Requirement:` heading');
  }
  // Proof (C-1): deleting this guard failed "refuses a specification that holds no scenario"
  // with `Received function did not throw` and `Received value: []` (2026-09-20).
  if (!/^#### Scenario: /m.test(specMarkdown)) {
    throw new Error('the capability specification holds no `#### Scenario:` heading');
  }
}

/** Scenario headings of one capability specification that carry no identifier. */
export function scenariosWithoutIdentifier(specMarkdown: string): readonly string[] {
  assertSpecification(specMarkdown);
  return [...specMarkdown.matchAll(/^#### Scenario: (.*)$/gm)]
    .filter(([, title]) => !SCENARIO_IDENTIFIER.test(title))
    .map(([, title]) => title);
}

/**
 * Scenario identifiers of one capability specification, in document order.
 *
 * @throws when the text is not a capability specification, or when any scenario
 * heading carries no identifier. A ledger that silently skips the scenarios it
 * cannot name reports full coverage over a specification it never read.
 */
export function scenarioIdentifiers(specMarkdown: string): readonly string[] {
  const unidentified = scenariosWithoutIdentifier(specMarkdown);
  // Proof (C-2): deleting this guard failed "refuses a specification whose scenario carries no
  // identifier" with `Received function did not throw` and `[ "DEMO-001" ]` (2026-09-20).
  if (unidentified.length > 0) {
    throw new Error(`these scenarios carry no identifier: ${unidentified.join('; ')}`);
  }
  return [...specMarkdown.matchAll(/^#### Scenario: \[([A-Z][A-Z0-9-]*-\d{3})\]/gm)].map(
    ([, id]) => id,
  );
}

/**
 * One capability specification, read from the workspace.
 *
 * @throws when the specification is absent or unreadable.
 */
export async function readSpec(capability: string): Promise<string> {
  return readFile(new URL(`openspec/specs/${capability}/spec.md`, WORKSPACE), 'utf8');
}

/* ─── slice D adds everything below this line ─────────────────────────────── */

/** What one `<testcase>` of a JUnit report says happened. */
export type CaseOutcome = 'passed' | 'skipped' | 'failed';

/** One `<testcase>` of a JUnit report. */
export interface JUnitCase {
  readonly name: string;
  /** The path the runner named the file with, relative to the run's working directory. */
  readonly file: string;
  readonly outcome: CaseOutcome;
}

/** The elements Bun writes inside a `<testcase>`, and what each one says happened. */
const OUTCOME_ELEMENT = new Map<string, CaseOutcome>([
  ['error', 'failed'],
  ['failure', 'failed'],
  ['skipped', 'skipped'],
]);

/**
 * Every test case of one JUnit report.
 *
 * Well-formedness is `saxes`'s job, not this reader's: a hand-written tokenizer
 * twice accepted malformed reports — a garbage declaration, a duplicate
 * attribute, an unterminated attribute value, a malformed comment, an unknown
 * entity, CDATA outside the root — and manufactured a passing citation from
 * each, and a coverage ledger that cannot fail is worse than none. `saxes`
 * parses XML 1.0 strictly and streaming; everything it reports through its
 * `error` event is refused here with its own message and position.
 *
 * What is left is the STRUCTURE of a Bun JUnit report, which no XML parser
 * knows: a `testsuites` root, `testcase` directly inside a `testsuite`, an
 * outcome element directly inside its `testcase` and nothing else there, and a
 * `name` and a `file` on every case. Namespaces are refused rather than
 * resolved — the parser runs with `xmlns: false`, so a prefix binds to nothing
 * and a qualified `x:failure` would otherwise read as an unknown element and
 * turn a failing case into a passing one.
 *
 * Its limits, stated: it trusts `saxes` for well-formedness and for entity
 * expansion; it does not validate the JUnit schema beyond the rules above, so an
 * unknown element outside a `testcase` is accepted; and a document with no XML
 * declaration at all is well-formed XML and is accepted.
 *
 * @throws when the document is not well-formed XML 1.0, has a root other than
 * `testsuites`, carries a doctype, a CDATA section or a processing instruction,
 * uses a qualified name or an `xmlns` attribute, puts a `testcase` outside a
 * `testsuite`, puts an outcome element outside a `testcase`, puts any other
 * element inside a `testcase`, holds a `testcase` with no `name` or no `file`,
 * or holds no test case at all.
 */
export function readJUnitReport(xml: string): readonly JUnitCase[] {
  const parser = new SaxesParser({ xmlns: false, fileName: 'the JUnit report' });
  const cases: JUnitCase[] = [];
  /** The element names still open, outermost first. */
  const open: string[] = [];
  let malformed: Error | undefined;

  parser.on('error', (cause) => {
    malformed ??= cause;
  });
  // Proof (D-4): replacing this handler with a no-op failed "refuses a document type declaration"
  // because the report returned one passing case instead of throwing (2026-09-20).
  parser.on('doctype', () => {
    throw parser.makeError('has a document type declaration');
  });
  // Proof (D-5): replacing this handler with a no-op failed "refuses a CDATA section" because
  // the report did not throw; the outside-root CDATA case failed too (2026-09-20).
  parser.on('cdata', () => {
    throw parser.makeError('has a CDATA section');
  });
  // Proof (D-6): replacing this handler with a no-op failed "refuses a processing instruction
  // after the declaration" because the report returned one passing case (2026-09-20).
  parser.on('processinginstruction', (instruction) => {
    throw parser.makeError(`has a processing instruction <?${instruction.target}?>`);
  });
  parser.on('opentag', (tag) => {
    // Proof (D-7): deleting this guard failed "refuses a namespaced element name" with the later
    // unsupported-element refusal instead of the qualified-name refusal (2026-09-20).
    if (tag.name.includes(':')) {
      throw parser.makeError(`has a qualified element name <${tag.name}>`);
    }
    // A Map and not `tag.attributes[…]`: `noUncheckedIndexedAccess` is off, so an
    // index read types as `string` and the absent-attribute tests below would be
    // `no-unnecessary-condition` lint errors rather than the guards they are.
    const attributes = new Map(Object.entries(tag.attributes));
    for (const attribute of attributes.keys()) {
      // Proof (D-8): deleting this guard failed "refuses an xmlns attribute" because the report
      // returned one passing case instead of throwing (2026-09-20).
      if (attribute === 'xmlns') {
        throw parser.makeError(`has an xmlns attribute on <${tag.name}>`);
      }
      // Proof (D-9): deleting this guard failed "refuses a namespaced attribute name" because the
      // report returned one passing case instead of throwing (2026-09-20).
      if (attribute.includes(':')) {
        throw parser.makeError(`has a qualified attribute name ${attribute} on <${tag.name}>`);
      }
    }
    const parent = open.at(-1);
    // Proof (D-10): deleting this guard failed "refuses a report whose root is not testsuites"
    // with the later testcase-parent refusal instead of the root refusal (2026-09-20).
    if (parent === undefined && tag.name !== 'testsuites') {
      throw parser.makeError(`root is <${tag.name}>, not <testsuites>`);
    }
    // Proof (D-11): deleting this guard failed "refuses a testcase whose parent is not a
    // testsuite" because the report returned one passing case; the nested testcase failed too
    // (2026-09-20).
    if (tag.name === 'testcase' && parent !== 'testsuite') {
      throw parser.makeError(
        `holds a <testcase> inside <${parent ?? 'nothing'}>, not inside <testsuite>`,
      );
    }
    // Proof (D-12): deleting this guard failed "refuses an outcome element outside a testcase"
    // with the later no-testcase refusal instead of the parent refusal (2026-09-20).
    if (OUTCOME_ELEMENT.has(tag.name) && parent !== 'testcase') {
      throw parser.makeError(
        `holds a <${tag.name}> inside <${parent ?? 'nothing'}>, not inside <testcase>`,
      );
    }
    // Proof (D-13): deleting this guard failed both "refuses an unsupported element inside a
    // testcase" and "refuses a testcase hidden inside an outcome element" because each report
    // returned a passing case instead of throwing (2026-09-20).
    if (open.includes('testcase') && !OUTCOME_ELEMENT.has(tag.name)) {
      throw parser.makeError(`holds an unsupported <${tag.name}> inside a <testcase>`);
    }
    if (tag.name === 'testcase') {
      const title = attributes.get('name');
      // Proof (D-14): deleting this guard failed "refuses a testcase that names no test" with a
      // returned case whose name was undefined (2026-09-20).
      if (title === undefined) throw parser.makeError('holds a <testcase> with no name');
      const file = attributes.get('file');
      // Proof (D-15): deleting this guard failed "refuses a testcase that names no file" with a
      // returned case whose file was undefined (2026-09-20).
      if (file === undefined) throw parser.makeError('holds a <testcase> with no file');
      cases.push({ name: title, file, outcome: 'passed' });
    }
    // The owner is the case last pushed: an outcome element's parent is a
    // `testcase` (checked above) and `testcase` elements cannot nest, so the
    // enclosing case is the most recent one.
    const outcome = OUTCOME_ELEMENT.get(tag.name);
    // Proof (D-2): deleting this assignment failed the real-Bun-report case because its skipped
    // and failed cases were returned as passed; both coverage-outcome cases failed too
    // (2026-09-20).
    if (outcome !== undefined) cases[cases.length - 1] = { ...cases[cases.length - 1], outcome };
    open.push(tag.name);
  });
  // Proof (D-17): replacing this handler with a no-op failed the passing-citation case because a
  // later testcase appeared inside the still-open prior testcase; four other cases failed too
  // (2026-09-20).
  parser.on('closetag', () => {
    open.pop();
  });

  parser.write(xml).close();
  // Proof (D-3): deleting this rethrow failed the second-root case because one passing case was
  // returned; nineteen other malformed-document cases failed too (2026-09-20).
  if (malformed !== undefined) throw malformed;
  // Proof (D-16): deleting this guard failed "refuses a report that holds no testcase" because
  // the reader returned an empty array (2026-09-20).
  // Proof (E-4): an otherwise valid API report with no testcase made the coverage command refuse
  // it with `the JUnit report:1:0: holds no testcase` (2026-09-20).
  if (cases.length === 0) throw parser.makeError('holds no testcase');
  return cases;
}

/**
 * The scenario identifiers cited by a test that ran **and passed**.
 *
 * A skipped or failing test cites a scenario it did not prove, so it does not
 * cover it.
 */
export function passedCitations(cases: readonly JUnitCase[]): ReadonlySet<string> {
  const cited = new Set<string>();
  for (const one of cases) {
    // Proof (D-1): deleting this guard failed the skipped-or-failing coverage case because both
    // DEMO-001 and DEMO-002 disappeared from the uncovered list; the failure-text case failed too
    // (2026-09-20).
    // Proof (E-2): skipping PROJECT-ASSIGNMENT-READS-001 and regenerating the API report made its
    // coverage row `**no**` while the other two stayed `yes` (2026-09-20).
    if (one.outcome !== 'passed') continue;
    // Proof (E-1): removing PROJECT-ASSIGNMENT-READS-001 from the passing API test title and
    // regenerating its report made only that scenario's coverage row `**no**` (2026-09-20).
    const id = SCENARIO_IDENTIFIER.exec(one.name)?.[1];
    if (id !== undefined) cited.add(id);
  }
  return cited;
}

/** The capability's scenario identifiers that no passing test cites, in document order. */
export function uncoveredScenarios(
  specMarkdown: string,
  cited: ReadonlySet<string>,
): readonly string[] {
  return scenarioIdentifiers(specMarkdown).filter((id) => !cited.has(id));
}

/**
 * @throws when the report names a file the target does not collect — the report
 * of another target, or of a run against another tree.
 */
export function assertReportCovers(
  target: LevelTarget,
  cases: readonly JUnitCase[],
  collected: readonly string[],
): void {
  const known = new Set(collected);
  const foreign = [...new Set(cases.map(({ file }) => file))].filter((file) => !known.has(file));
  // Proof (E-3): replacing the API report with the SQLite Unit report made the coverage command
  // refuse its seven foreign files and say it was the report of another run (2026-09-20).
  if (foreign.length > 0) {
    throw new Error(
      `${target.project}:${target.target} did not collect ${foreign.sort().join(', ')}; ` +
        `${target.report} is the report of another run`,
    );
  }
}

/**
 * @throws when a file the report names has changed since the report was written.
 *
 * The design's manual-report rule in the small: a report goes stale when
 * something it measured changed, and a stale report read as coverage is a
 * green row for a test nobody ran. A heuristic, and stated as one: it compares
 * the modification times of the test files the report itself names, not of
 * their production dependencies and not of the specification, so a changed
 * dependency with an unchanged test file does not make the report stale here.
 */
export async function assertReportIsCurrent(
  target: LevelTarget,
  cases: readonly JUnitCase[],
): Promise<void> {
  const written = (await stat(new URL(target.report, WORKSPACE))).mtimeMs;
  const stale: string[] = [];
  for (const file of new Set(cases.map(({ file }) => file))) {
    const source = (await stat(new URL(`${target.root}/${file}`, WORKSPACE))).mtimeMs;
    if (source > written) stale.push(file);
  }
  // Proof (E-5): appending a trailing newline to assignment-scope.db.test.ts after its report was
  // written made the coverage command name the stale file and the API target to rerun (2026-09-20).
  if (stale.length > 0) {
    throw new Error(
      `${target.report} is older than ${stale.sort().join(', ')}; rerun ${target.project}:${target.target}`,
    );
  }
}

/** One declared level target, by its `project:target` name. */
export function levelTargetNamed(qualified: string): LevelTarget {
  const found = LEVEL_TARGETS.find(({ project, target }) => `${project}:${target}` === qualified);
  // Proof (E-9): naming aggregate target `wbs-core:test` made the coverage command refuse it as
  // not a declared level target (2026-09-20).
  if (found === undefined) throw new Error(`${qualified} is not a declared level target`);
  return found;
}
