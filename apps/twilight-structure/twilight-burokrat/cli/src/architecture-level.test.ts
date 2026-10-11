import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { afterEach, expect, test } from 'bun:test';

const runner = join(import.meta.dir, 'architecture-level.ts');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): { root: string; report: string; architectureFile: string } {
  const root = mkdtempSync(join(tmpdir(), 'architecture-level-'));
  roots.push(root);
  const architectureFile = 'src/architecture/mod-index.architecture.test.ts';
  const absoluteFile = join(root, architectureFile);
  const report = join(root, 'architecture.xml');
  mkdirSync(dirname(absoluteFile), { recursive: true });
  writeFileSync(
    absoluteFile,
    "import { test } from 'bun:test'; test('MOD-INDEX negative', () => {});\n",
  );
  writeFileSync(
    join(root, 'src/architecture-fixtures.json'),
    `${JSON.stringify({ schemaVersion: 1, fixtures: [{ ruleId: 'MOD-INDEX', file: architectureFile }] })}\n`,
  );
  return { root, report, architectureFile };
}

function run(root: string, report: string): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([process.execPath, runner, root, report], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function stderrOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stderr === undefined) throw new Error('stderr pipe was unavailable');
  // Proof: FORCE_COLOR=1 prefixed the anchored unmapped-fixture diagnostic with
  // VT codes; the named negative failed at two assertions until these were stripped.
  return stripVTControlCharacters(invocation.stderr.toString());
}

test('runs only the mapped rule fixture and writes fresh JUnit', () => {
  const { root, report } = fixture();
  writeFileSync(report, '<testsuites><testcase name="stale"/></testsuites>');
  const invocation = run(root, report);
  expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
  const xml = readFileSync(report, 'utf8');
  expect(xml).toContain('MOD-INDEX negative');
  expect(xml).not.toContain('stale');
});

test('refuses an unmapped architecture fixture after clearing stale JUnit', () => {
  const { root, report } = fixture();
  writeFileSync(
    join(root, 'src/architecture/extra.architecture.test.ts'),
    "import { test } from 'bun:test'; test('unmapped', () => {});\n",
  );
  writeFileSync(report, '<testsuites><testcase name="stale"/></testsuites>');
  const invocation = run(root, report);
  expect(invocation.exitCode).not.toBe(0);
  expect(stderrOf(invocation)).toMatch(/^error: unmapped architecture fixture:/m);
  expect(() => readFileSync(report)).toThrow();
});

test('refuses an empty mapping before Bun can discover unrelated tests', () => {
  const { root, report } = fixture();
  writeFileSync(
    join(root, 'src/architecture-fixtures.json'),
    '{"schemaVersion":1,"fixtures":[]}\n',
  );
  const invocation = run(root, report);
  expect(invocation.exitCode).not.toBe(0);
  expect(stderrOf(invocation)).toMatch(/^error: no-cases: Architecture has no mapped rules$/m);
  expect(() => readFileSync(report)).toThrow();
});

test('refuses a malformed fixture policy before running Bun', () => {
  const { root, report } = fixture();
  writeFileSync(report, '<testsuites><testcase name="stale"/></testsuites>');
  writeFileSync(
    join(root, 'src/architecture-fixtures.json'),
    '{"schemaVersion":2,"fixtures":[{"ruleId":"MOD-INDEX","file":"src/architecture/mod-index.architecture.test.ts"}]}\n',
  );
  const invocation = run(root, report);
  expect(invocation.exitCode).not.toBe(0);
  expect(stderrOf(invocation)).toMatch(
    /^ValidationError: Validation failed: schemaVersion must be 1 \(was 2\)$/m,
  );
  expect(() => readFileSync(report)).toThrow();
});

test('refuses missing policy and unreadable selector root after clearing stale JUnit', () => {
  const { root, report } = fixture();
  writeFileSync(report, '<testsuites><testcase name="stale"/></testsuites>');
  rmSync(join(root, 'src/architecture-fixtures.json'));
  const missing = run(root, report);
  expect(missing.exitCode).not.toBe(0);
  expect(stderrOf(missing)).toContain('ENOENT');
  expect(() => readFileSync(report)).toThrow();

  writeFileSync(
    join(root, 'src/architecture-fixtures.json'),
    '{"schemaVersion":1,"fixtures":[{"ruleId":"MOD-INDEX","file":"src/architecture/mod-index.architecture.test.ts"}]}\n',
  );
  rmSync(join(root, 'src/architecture'), { recursive: true });
  const missingSelector = run(root, report);
  expect(missingSelector.exitCode).not.toBe(0);
  expect(stderrOf(missingSelector)).toContain('ENOENT');
  expect(() => readFileSync(report)).toThrow();
});

test('refuses a mixed-level mapping and never runs its Unit file', () => {
  const { root, report, architectureFile } = fixture();
  const marker = join(root, 'unit-ran');
  writeFileSync(
    join(root, 'src/unit.test.ts'),
    `import { test } from 'bun:test'; test('unit', () => { Bun.write(${JSON.stringify(marker)}, 'ran'); });\n`,
  );
  writeFileSync(
    join(root, 'src/architecture-fixtures.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      fixtures: [
        { ruleId: 'MOD-INDEX', file: architectureFile },
        { ruleId: 'F7', file: 'src/unit.test.ts' },
      ],
    })}\n`,
  );
  const invocation = run(root, report);
  expect(invocation.exitCode).not.toBe(0);
  expect(stderrOf(invocation)).toMatch(/^error: Architecture target cannot collect Unit file/m);
  expect(() => readFileSync(marker)).toThrow();
  expect(() => readFileSync(report)).toThrow();
});

test('refuses mapping one rule to another rule negative', () => {
  const { root, report, architectureFile } = fixture();
  writeFileSync(
    join(root, 'src/architecture-fixtures.json'),
    `${JSON.stringify({ schemaVersion: 1, fixtures: [{ ruleId: 'F7', file: architectureFile }] })}\n`,
  );
  const invocation = run(root, report);
  expect(invocation.exitCode).not.toBe(0);
  expect(stderrOf(invocation)).toMatch(/^error: Architecture rule F7 needs its own fixture:/m);
  expect(() => readFileSync(report)).toThrow();
});

test('refuses a missing mapped fixture and a failed fixture run without stale JUnit', () => {
  const { root, report, architectureFile } = fixture();
  writeFileSync(report, '<testsuites><testcase name="stale"/></testsuites>');
  rmSync(join(root, architectureFile));
  const missing = run(root, report);
  expect(missing.exitCode).not.toBe(0);
  expect(stderrOf(missing)).toMatch(/^error: mapped architecture fixture is missing:/m);
  expect(() => readFileSync(report)).toThrow();

  writeFileSync(
    join(root, architectureFile),
    "import { test } from 'bun:test'; test('broken', () => { throw new Error('fixture failed'); });\n",
  );
  const failed = run(root, report);
  expect(failed.exitCode).not.toBe(0);
  expect(readFileSync(report, 'utf8')).toContain('fixture failed');
});

test('refuses a suite with only skipped cases', () => {
  const { root, report, architectureFile } = fixture();
  writeFileSync(
    join(root, architectureFile),
    "import { test } from 'bun:test'; test.skip('disabled negative', () => {});\n",
  );
  const invocation = run(root, report);
  expect(invocation.exitCode).not.toBe(0);
  expect(stderrOf(invocation)).toMatch(
    /^error: no-cases: Architecture has no passing rule negatives/m,
  );
});

test('refuses an unknown rule, duplicate rule and symlinked fixture', () => {
  const { root, report, architectureFile } = fixture();
  const policy = join(root, 'src/architecture-fixtures.json');
  const unknownFile = 'src/architecture/no-such-rule.architecture.test.ts';
  writeFileSync(
    join(root, unknownFile),
    "import { test } from 'bun:test'; test('unknown', () => {});\n",
  );
  for (const [fixtures, message] of [
    [[{ ruleId: 'NO-SUCH-RULE', file: unknownFile }], 'unknown rule NO-SUCH-RULE'],
    [
      [
        { ruleId: 'MOD-INDEX', file: architectureFile },
        { ruleId: 'MOD-INDEX', file: architectureFile },
      ],
      'mapped twice: MOD-INDEX',
    ],
  ] as const) {
    writeFileSync(policy, `${JSON.stringify({ schemaVersion: 1, fixtures })}\n`);
    const invocation = run(root, report);
    expect(invocation.exitCode).not.toBe(0);
    expect(stderrOf(invocation)).toMatch(new RegExp(`^error: .*${message}`, 'm'));
    expect(() => readFileSync(report)).toThrow();
  }
  rmSync(join(root, unknownFile));
  writeFileSync(
    policy,
    `${JSON.stringify({ schemaVersion: 1, fixtures: [{ ruleId: 'MOD-INDEX', file: architectureFile }] })}\n`,
  );
  const absoluteFile = join(root, architectureFile);
  rmSync(absoluteFile);
  writeFileSync(
    join(root, 'src/unit.test.ts'),
    "import { test } from 'bun:test'; test('unit', () => {});\n",
  );
  symlinkSync(join(root, 'src/unit.test.ts'), absoluteFile);
  const invocation = run(root, report);
  expect(invocation.exitCode).not.toBe(0);
  expect(stderrOf(invocation)).toMatch(
    /^error: mapped architecture fixture is not a regular file:/m,
  );
  expect(() => readFileSync(report)).toThrow();
});
