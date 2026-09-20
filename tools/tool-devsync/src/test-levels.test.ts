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
  passedCitations,
  readJUnitReport,
  readManifest,
  readSpec,
  reportPathFrom,
  scenarioIdentifiers,
  scenariosWithoutIdentifier,
  TEST_TARGET_NAME,
  testFilesInProject,
  testFilesUnder,
  uncoveredScenarios,
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

describe('the scenario join', () => {
  const report = (...cases: string[]): string =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<testsuites name="bun test">',
      '  <testsuite name="src/a.test.ts" file="src/a.test.ts">',
      ...cases,
      '  </testsuite>',
      '</testsuites>',
      '',
    ].join('\n');
  const passing = (title: string): string =>
    `    <testcase name="${title}" classname="d" time="0.1" file="src/a.test.ts" />`;
  const spec = [
    '### Requirement: one',
    '#### Scenario: [DEMO-001] first',
    '#### Scenario: [DEMO-002] second',
    '#### Scenario: [DEMO-003] third',
    '',
  ].join('\n');
  const citations = (xml: string): ReadonlySet<string> => passedCitations(readJUnitReport(xml));

  /** Bun 1.4.2's own output, copied from a run of a seven-case scratch file. */
  const asBunWritesIt = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites name="bun test" tests="7" assertions="5" failures="1" skipped="2" time="0.00438912">',
    '  <testsuite name="src/a.test.ts" file="src/a.test.ts" tests="7" assertions="5" failures="1" skipped="2" time="0.001451567" hostname="pop-os">',
    '    <testsuite name="outer group" file="src/a.test.ts" line="3" tests="6" assertions="4" failures="1" skipped="2" time="0" hostname="pop-os">',
    '      <testsuite name="inner group" file="src/a.test.ts" line="4" tests="1" assertions="1" failures="0" skipped="0" time="0" hostname="pop-os">',
    '        <testcase name="[DEMO-001] passes plainly" classname="inner group &gt; outer group" time="0.000018" file="src/a.test.ts" line="5" assertions="1" />',
    '      </testsuite>',
    '      <testcase name="[DEMO-002] has &lt;angle&gt; &amp; &quot;quotes&quot; and &apos;apostrophes&apos;" classname="outer group" time="0.000014" file="src/a.test.ts" line="10" assertions="1" />',
    '      <testcase name="[DEMO-003] has a&#10;newline in its title" classname="outer group" time="0.000015" file="src/a.test.ts" line="14" assertions="1" />',
    '      <testcase name="is skipped" classname="outer group" time="0" file="src/a.test.ts" line="18" assertions="0">',
    '        <skipped />',
    '      </testcase>',
    '      <testcase name="fails on purpose with &lt;tag&gt; &amp; &quot;quotes&quot;" classname="outer group" time="0.000231" file="src/a.test.ts" line="22" assertions="1">',
    '        <failure type="AssertionError" message="expect(received).toBe(expected)&#10;&#10;Expected: 5&#10;Received: 4&#10;">AssertionError: expect(received).toBe(expected)&#10;&#10;Expected: 5&#10;Received: 4&#10;&#10;      at src/a.test.ts:23:15&#10;</failure>',
    '      </testcase>',
    '      <testcase name="is a todo" classname="outer group" time="0" file="src/a.test.ts" line="26" assertions="0">',
    '        <skipped message="TODO" />',
    '      </testcase>',
    '    </testsuite>',
    '    <testcase name="top level case" classname="" time="0.000134" file="src/a.test.ts" line="29" assertions="1" />',
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');

  it('reads an identifier out of a passing test title', () => {
    expect([
      ...citations(report(passing('[DEMO-001] a cited case'), passing('an uncited case'))),
    ]).toEqual(['DEMO-001']);
  });

  it('names a scenario that no passing test cites', () => {
    expect([
      uncoveredScenarios(spec, citations(report(passing('[DEMO-001] a'), passing('[DEMO-002] b')))),
      uncoveredScenarios(
        spec,
        citations(
          report(passing('[DEMO-001] a'), passing('[DEMO-002] b'), passing('[DEMO-003] c')),
        ),
      ),
    ]).toEqual([['DEMO-003'], []]);
  });

  it('does not count a skipped or a failing test as coverage', () => {
    const skipped =
      '    <testcase name="[DEMO-001] a" classname="d" file="src/a.test.ts"><skipped /></testcase>';
    const failing =
      '    <testcase name="[DEMO-002] b" classname="d" file="src/a.test.ts"><failure message="x">no</failure></testcase>';
    expect(
      uncoveredScenarios(spec, citations(report(skipped, failing, passing('[DEMO-003] c')))),
    ).toEqual(['DEMO-001', 'DEMO-002']);
  });

  it('does not read a citation out of a comment or out of failure text', () => {
    const commented = `    <!-- <testcase name="[DEMO-001] a" file="src/a.test.ts" /> -->`;
    const inText =
      '    <testcase name="[DEMO-003] c" classname="d" file="src/a.test.ts"><failure message="expected name=&quot;[DEMO-002] b&quot;">t</failure></testcase>';
    expect([...citations(report(commented, inText))]).toEqual([]);
  });

  it('reads the report Bun really writes, nesting, escapes and outcomes included', () => {
    expect(readJUnitReport(asBunWritesIt)).toEqual([
      { name: '[DEMO-001] passes plainly', file: 'src/a.test.ts', outcome: 'passed' },
      {
        name: `[DEMO-002] has <angle> & "quotes" and 'apostrophes'`,
        file: 'src/a.test.ts',
        outcome: 'passed',
      },
      {
        name: '[DEMO-003] has a\nnewline in its title',
        file: 'src/a.test.ts',
        outcome: 'passed',
      },
      { name: 'is skipped', file: 'src/a.test.ts', outcome: 'skipped' },
      {
        name: 'fails on purpose with <tag> & "quotes"',
        file: 'src/a.test.ts',
        outcome: 'failed',
      },
      { name: 'is a todo', file: 'src/a.test.ts', outcome: 'skipped' },
      { name: 'top level case', file: 'src/a.test.ts', outcome: 'passed' },
    ]);
    expect([...passedCitations(readJUnitReport(asBunWritesIt))]).toEqual([
      'DEMO-001',
      'DEMO-002',
      'DEMO-003',
    ]);
  });

  it('refuses a report whose root is not testsuites', () => {
    expect(() =>
      readJUnitReport(
        '<?xml version="1.0"?>\n<coverage>\n  <testcase name="[DEMO-001] a" file="src/a.test.ts" />\n</coverage>\n',
      ),
    ).toThrow('root is <coverage>, not <testsuites>');
  });

  it('refuses a testcase whose parent is not a testsuite', () => {
    expect(() =>
      readJUnitReport(
        `<?xml version="1.0"?>\n<testsuites>\n${passing('[DEMO-001] a')}\n</testsuites>\n`,
      ),
    ).toThrow('holds a <testcase> inside <testsuites>, not inside <testsuite>');
  });

  it('refuses a testcase nested inside a failure element', () => {
    expect(() =>
      readJUnitReport(
        report(
          '    <testcase name="outer" file="src/a.test.ts">',
          '      <failure>',
          '        <testcase name="[DEMO-001] a" file="src/a.test.ts"/>',
          '      </failure>',
          '    </testcase>',
        ),
      ),
    ).toThrow('holds a <testcase> inside <failure>, not inside <testsuite>');
  });

  it('refuses an outcome element outside a testcase', () => {
    expect(() => readJUnitReport(report('    <failure message="x">no</failure>'))).toThrow(
      'holds a <failure> inside <testsuite>, not inside <testcase>',
    );
  });

  it('refuses an unsupported element inside a testcase', () => {
    expect(() =>
      readJUnitReport(
        report(
          '    <testcase name="[DEMO-001] a" file="src/a.test.ts"><system-out>x</system-out></testcase>',
        ),
      ),
    ).toThrow('holds an unsupported <system-out> inside a <testcase>');
  });

  it('refuses a testcase hidden inside an outcome element', () => {
    for (const outcome of ['failure', 'error', 'skipped']) {
      expect(() =>
        readJUnitReport(
          report(
            `<testcase name="outer" file="src/a.test.ts"><${outcome}><testsuite>`,
            passing('[DEMO-001] a'),
            `</testsuite></${outcome}></testcase>`,
          ),
        ),
      ).toThrow('holds an unsupported <testsuite> inside a <testcase>');
    }
  });

  it('refuses a namespaced element name', () => {
    expect(() =>
      readJUnitReport(
        report(
          '    <testcase name="[DEMO-001] a" file="src/a.test.ts">',
          '      <x:failure>failed</x:failure>',
          '    </testcase>',
        ),
      ),
    ).toThrow('has a qualified element name <x:failure>');
  });

  it('refuses a namespaced attribute name', () => {
    expect(() =>
      readJUnitReport(
        report('    <testcase name="[DEMO-001] a" file="src/a.test.ts" x:kind="odd" />'),
      ),
    ).toThrow('has a qualified attribute name x:kind on <testcase>');
  });

  it('refuses an xmlns attribute', () => {
    expect(() =>
      readJUnitReport(
        report('    <testcase name="[DEMO-001] a" file="src/a.test.ts" xmlns="urn:test" />'),
      ),
    ).toThrow('has an xmlns attribute on <testcase>');
  });

  it('refuses a document type declaration', () => {
    expect(() =>
      readJUnitReport(
        `<?xml version="1.0"?>\n<!DOCTYPE testsuites>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n  </testsuite>\n</testsuites>\n`,
      ),
    ).toThrow('has a document type declaration');
  });

  it('refuses a CDATA section', () => {
    expect(() =>
      readJUnitReport(
        report(
          '    <testcase name="[DEMO-001] a" file="src/a.test.ts"><![CDATA[anything]]></testcase>',
        ),
      ),
    ).toThrow('has a CDATA section');
  });

  it('refuses a CDATA section outside the root element', () => {
    expect(() =>
      readJUnitReport(`${report(passing('[DEMO-001] a'))}<![CDATA[trailing junk]]>\n`),
    ).toThrow('has a CDATA section');
  });

  it('refuses a processing instruction after the declaration', () => {
    expect(() => readJUnitReport(report('    <?sortme?>', passing('[DEMO-001] a')))).toThrow(
      'has a processing instruction <?sortme?>',
    );
  });

  it('refuses a testcase that names no test', () => {
    expect(() => readJUnitReport(report('    <testcase file="src/a.test.ts" />'))).toThrow(
      'holds a <testcase> with no name',
    );
  });

  it('refuses a testcase that names no file', () => {
    expect(() => readJUnitReport(report('    <testcase name="[DEMO-001] a" />'))).toThrow(
      'holds a <testcase> with no file',
    );
  });

  it('refuses a report that holds no testcase', () => {
    expect(() => readJUnitReport(report())).toThrow('holds no testcase');
  });

  it('refuses a document with a second root element', () => {
    expect(() => readJUnitReport(`${report(passing('[DEMO-001] a'))}<testsuites />\n`)).toThrow(
      'documents may contain only one root',
    );
  });

  it('refuses a report that is not a JUnit document', () => {
    expect(() => readJUnitReport('[DEMO-001] not xml at all')).toThrow(
      'text data outside of root node',
    );
  });

  it('refuses a malformed XML declaration', () => {
    expect(() =>
      readJUnitReport(
        `<?xml garbage?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n  </testsuite>\n</testsuites>\n`,
      ),
    ).toThrow('XML declaration is incomplete');
  });

  it('refuses a declaration whose version is not an XML version', () => {
    expect(() =>
      readJUnitReport(
        `<?xml version="garbage"?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n  </testsuite>\n</testsuites>\n`,
      ),
    ).toThrow('version number must match');
  });

  it('refuses a declaration that names no version', () => {
    expect(() =>
      readJUnitReport(
        `<?xml encoding="UTF-8"?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n  </testsuite>\n</testsuites>\n`,
      ),
    ).toThrow('expected one of version');
  });

  it('refuses a second XML declaration inside the root', () => {
    expect(() =>
      readJUnitReport(report('    <?xml version="1.0"?>', passing('[DEMO-001] a'))),
    ).toThrow('an XML declaration must be at the start of the document');
  });

  it('refuses text outside the root element', () => {
    expect(() => readJUnitReport(`${report(passing('[DEMO-001] a'))}trailing junk\n`)).toThrow(
      'text data outside of root node',
    );
  });

  it('refuses a malformed processing instruction', () => {
    expect(() => readJUnitReport(report('    <?broken>', passing('[DEMO-001] a')))).toThrow(
      'disallowed character in processing instruction name',
    );
  });

  it('refuses a malformed comment', () => {
    expect(() =>
      readJUnitReport(report('    <!-- bad -- comment -->', passing('[DEMO-001] a'))),
    ).toThrow('malformed comment');
  });

  it('refuses an unterminated comment', () => {
    expect(() =>
      readJUnitReport(`<?xml version="1.0"?>\n<testsuites>\n  <!-- never ends\n`),
    ).toThrow('unclosed tag: testsuites');
  });

  it('refuses an unterminated CDATA section', () => {
    expect(() =>
      readJUnitReport(`<?xml version="1.0"?>\n<testsuites>\n  <![CDATA[never ends\n`),
    ).toThrow('unclosed tag: testsuites');
  });

  it('refuses an entity it does not know', () => {
    expect(() =>
      readJUnitReport(
        report('    <testcase name="[DEMO-001] a" file="src/a.test.ts">&bogus;</testcase>'),
      ),
    ).toThrow('undefined entity');
  });

  it('refuses a repeated attribute', () => {
    expect(() =>
      readJUnitReport(
        report('    <testcase name="[DEMO-001] a" file="src/a.test.ts" name="[DEMO-002] b" />'),
      ),
    ).toThrow('duplicate attribute: name');
  });

  it('refuses two attributes with no whitespace between them', () => {
    expect(() =>
      readJUnitReport(report('    <testcase name="[DEMO-001] a"file="src/a.test.ts" />')),
    ).toThrow('no whitespace between attributes');
  });

  it('refuses an attribute whose value is never closed', () => {
    expect(() =>
      readJUnitReport(
        '<?xml version="1.0"?>\n<testsuites><testsuite name="s"><testcase name="[DEMO-001] a" file="src/a.test.ts" broken="/></testsuite></testsuites>\n',
      ),
    ).toThrow('disallowed character');
  });

  it('refuses an unescaped angle bracket in an attribute value', () => {
    expect(() =>
      readJUnitReport(report('    <testcase name="a < b" file="src/a.test.ts" />')),
    ).toThrow('disallowed character');
  });

  it('refuses an attribute with no value', () => {
    expect(() =>
      readJUnitReport(report('    <testcase name="[DEMO-001] a" file="src/a.test.ts" garbage />')),
    ).toThrow('attribute without value');
  });

  it('refuses a truncated report', () => {
    expect(() =>
      readJUnitReport('<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="s"'),
    ).toThrow('unclosed tag: testsuites');
  });

  it('refuses a report that closes an element that is not open', () => {
    expect(() =>
      readJUnitReport(
        `<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n</testsuites>\n`,
      ),
    ).toThrow('unexpected close tag');
  });

  it('refuses a report that leaves an element open', () => {
    expect(() =>
      readJUnitReport(
        `<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n`,
      ),
    ).toThrow('unclosed tag: testsuite');
  });
});
