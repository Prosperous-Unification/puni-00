import { describe, expect, it } from 'bun:test';

import {
  ADOPTED_CAPABILITY,
  AGGREGATE_TARGETS,
  collectedFiles,
  conformanceFilesIn,
  KNOWN_OUTSIDE_TEST_ROOTS,
  LEVEL_TARGETS,
  levelOf,
  parseLevelCommand,
  readManifest,
  readSpec,
  reportPathFrom,
  scenarioIdentifiers,
  scenariosWithoutIdentifier,
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
          // Proof (B-5): with AGGREGATE_TARGETS emptied this case failed naming `wbs-core:test` and
          // `wbs-store-sqlite:test` as unaccounted (2026-09-20).
          AGGREGATE_TARGETS.includes(qualified) ||
          qualified in UNDECLARED_TEST_TARGETS;
        if (!accounted) unaccounted.push(qualified);
      }
    }
    expect(unaccounted.sort()).toEqual([]);
  });
});

describe('declared level targets', () => {
  // Three shell spawns and three directory walks: the batch-2 brief's rule for a
  // test that spawns more than twice.
  it('collects exactly the files of its own level', async () => {
    const wrong: string[] = [];
    for (const target of LEVEL_TARGETS) {
      const label = `${target.project}:${target.target}`;
      const manifest = await readManifest(target.root);
      const declared = manifest.targets[target.target];
      if (declared === undefined) {
        wrong.push(`${label} is not declared in project.json`);
        continue;
      }
      // Proof (B-9): with only `wbs-core:test:unit`'s `cwd` changed to `libs/wbs/application` this
      // failed on `wbs-core:test:unit runs in libs/wbs/application, not libs/wbs/application/core`.
      // The aggregate `test` target has the same `cwd` line first in the file; two executor attempts
      // patched that one and the case rightly stayed green (2026-09-20).
      if (declared.options?.cwd !== target.root) {
        wrong.push(`${label} runs in ${String(declared.options?.cwd)}, not ${target.root}`);
        continue;
      }
      let selector;
      try {
        selector = parseLevelCommand(declared.options.command ?? '').selector;
      } catch (cause) {
        // Proof (B-3): `--test-name-pattern=NO_MATCH` added to `wbs-store-sqlite:test:api` failed both
        // cases on `command shape: a declared level target may not pass
        // --test-name-pattern=NO_MATCH; only coverage and JUnit reporting flags are allowed`
        // (2026-09-20).
        wrong.push(`${label} command shape: ${(cause as Error).message}`);
        continue;
      }
      const conformance = await conformanceFilesOf(target.root);
      // Proof (B-4): a selector of `find src --bogus-flag` made this throw `the file selector
      // failed` before any array was compared (2026-09-20).
      const collected = collectedFiles(target.root, selector);
      for (const file of collected) {
        const level = levelOf(file, conformance);
        // Proof (B-1): with the `! -name 'source-conformance.db.test.ts'` exclusion removed from
        // `test:api` this failed on `wbs-store-sqlite:test:api is declared api and collects
        // src/testing/source-conformance.db.test.ts, which is conformance` (2026-09-20).
        if (level !== target.level) {
          wrong.push(
            `${label} is declared ${target.level} and collects ${file}, which is ${level}`,
          );
        }
      }
      const owed = (
        await Promise.all(target.testRoots.map((root) => testFilesUnder(target.root, root)))
      )
        .flat()
        .filter((file) => levelOf(file, conformance) === target.level);
      // Proof (B-6): with `! -name 'assignment-scope.db.test.ts'` added to `test:api`'s selector this
      // failed on `wbs-store-sqlite:test:api is declared api and does not collect
      // src/assignment-scope.db.test.ts, which is api` (2026-09-20).
      for (const file of owed.filter((candidate) => !collected.includes(candidate))) {
        wrong.push(
          `${label} is declared ${target.level} and does not collect ${file}, which is ${target.level}`,
        );
      }
    }
    expect(wrong.sort()).toEqual([]);
  }, 30_000);

  it('writes a JUnit report where the declaration says', async () => {
    const missing: string[] = [];
    for (const target of LEVEL_TARGETS) {
      const label = `${target.project}:${target.target}`;
      const manifest = await readManifest(target.root);
      const command = manifest.targets[target.target]?.options?.command;
      if (command === undefined) {
        missing.push(`${label} is not declared in project.json`);
        continue;
      }
      let parsed;
      try {
        parsed = parseLevelCommand(command);
      } catch (cause) {
        missing.push(`${label} command shape: ${(cause as Error).message}`);
        continue;
      }
      const path = reportPathFrom(target.root, target.report);
      const directory = path.slice(0, path.lastIndexOf('/'));
      // Proof (B-2): with `--reporter=junit` removed from `wbs-core:test:unit` this failed on
      // `wbs-core:test:unit does not pass --reporter=junit` (2026-09-20).
      if (!parsed.flags.includes('--reporter=junit')) {
        missing.push(`${label} does not pass --reporter=junit`);
      }
      // Proof (B-7): with only the outfile's basename changed to `wrong.xml` this failed on
      // `wbs-core:test:unit does not write ../../../../tmp/junit/wbs-core.unit.xml` (2026-09-20).
      if (!parsed.flags.includes(`--reporter-outfile=${path}`)) {
        missing.push(`${label} does not write ${path}`);
      }
      // Proof (B-8): with only the `mkdir` directory changed to `../../../../tmp/wrong` this failed
      // on `wbs-core:test:unit does not create ../../../../tmp/junit` (2026-09-20).
      if (parsed.reportDirectory !== directory) {
        missing.push(`${label} does not create ${directory}`);
      }
    }
    expect(missing.sort()).toEqual([]);
  });

  it('refuses a command that names a test file outside its selector', () => {
    expect(() =>
      parseLevelCommand(
        `mkdir -p ../tmp/junit && bun test $(find src -name '*.db.test.ts') ${SQLITE_CONFORMANCE} --reporter=junit`,
      ),
    ).toThrow(`may not pass ${SQLITE_CONFORMANCE}`);
  });

  it('refuses a command that filters which tests run', () => {
    expect(() =>
      parseLevelCommand(
        "mkdir -p ../tmp/junit && bun test $(find src -name '*.db.test.ts') --test-name-pattern=NO_MATCH --reporter=junit",
      ),
    ).toThrow('may not pass --test-name-pattern=NO_MATCH');
  });
});

describe('the adopted capability', () => {
  it('leaves no scenario without an identifier', async () => {
    // Proof (C-3): removing PROJECT-ASSIGNMENT-READS-002 from the specification failed this case,
    // receiving "Assignment write among unrelated projects" instead of an empty list (2026-09-20).
    expect(scenariosWithoutIdentifier(await readSpec(ADOPTED_CAPABILITY))).toEqual([]);
  });

  it('allocates the identifiers once and in order', async () => {
    expect(scenarioIdentifiers(await readSpec(ADOPTED_CAPABILITY))).toEqual([
      'PROJECT-ASSIGNMENT-READS-001',
      'PROJECT-ASSIGNMENT-READS-002',
      'PROJECT-ASSIGNMENT-READS-003',
    ]);
  });

  it('refuses a specification that holds no scenario', () => {
    expect(() => scenariosWithoutIdentifier('### Requirement: alone\n')).toThrow(
      'no `#### Scenario:`',
    );
  });

  it('refuses a specification that holds no requirement', () => {
    expect(() => scenariosWithoutIdentifier('#### Scenario: [DEMO-001] a\n')).toThrow(
      'no `### Requirement:`',
    );
  });

  it('refuses a specification whose scenario carries no identifier', () => {
    expect(() =>
      scenarioIdentifiers('### Requirement: one\n#### Scenario: [DEMO-001] a\n#### Scenario: b\n'),
    ).toThrow('these scenarios carry no identifier: b');
  });
});
