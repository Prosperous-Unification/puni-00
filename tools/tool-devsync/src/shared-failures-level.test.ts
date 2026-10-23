import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  assertBunLevelCollection,
  assertBunReport,
  assertLevelEnvelope,
  assertReportCovers,
  collectedFiles,
  levelTargetNamed,
  parseLevelCommand,
  type ProjectManifest,
  readJUnitReport,
  readManifest,
  UNDECLARED_TEST_TARGETS,
  verifyTargetInventory,
  WORKSPACE,
} from './test-levels';

const ROOT = 'libs/shared/domain/failures';
const QUALIFIED = 'shared-failures:test:unit:level';
const LEGACY = 'bun test --coverage --coverage-reporter=lcov --timeout=10000';

/** Capture an expected asynchronous refusal for a synchronous assertion. */
async function rejectionOf(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
    return undefined;
  } catch (cause) {
    return cause;
  }
}

async function declaredCommand(): Promise<string> {
  return assertLevelEnvelope(levelTargetNamed(QUALIFIED), await readManifest(ROOT));
}

/** Execute the production command in a fresh project-shaped fixture, preserving relative reports. */
async function withRunnerFixture(
  check: (fixture: { project: string; report: string; command: string }) => void | Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'shared-failures-level-'));
  const project = join(directory, ROOT);
  const report = join(directory, 'tmp/junit/shared-failures.unit.xml');
  try {
    mkdirSync(join(project, 'src'), { recursive: true });
    mkdirSync(dirname(report), { recursive: true });
    writeFileSync(join(project, 'bunfig.toml'), '[test]\n');
    await check({ project, report, command: await declaredCommand() });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runCommand(project: string, command: string) {
  return Bun.spawnSync(['sh', '-c', command], {
    cwd: project,
    env: { ...process.env, CLAUDECODE: '0', AGENT: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

/** Audit the same per-project Bun boundary called by the full verifier, in a child-owned workspace. */
function auditProject(project: string, manifest: ProjectManifest) {
  const path = join(project, 'project.json');
  writeFileSync(path, JSON.stringify(manifest));
  const module = new URL('./test-levels.ts', import.meta.url).href;
  const workspace = project.slice(0, -(ROOT.length + 1));
  return Bun.spawnSync(
    [
      'bun',
      '--eval',
      `
      import { readFileSync } from 'node:fs';
      import { WORKSPACE, verifyBunProjectCollection } from ${JSON.stringify(module)};
      WORKSPACE.pathname = ${JSON.stringify(`${workspace}/`)};
      await verifyBunProjectCollection(${JSON.stringify(ROOT)}, JSON.parse(readFileSync(${JSON.stringify(path)}, 'utf8')));
    `,
    ],
    { cwd: WORKSPACE.pathname, stdout: 'pipe', stderr: 'pipe' },
  );
}

describe('shared-failures isolated Unit level', () => {
  it('registers the canonical Unit collection and preserves unreported legacy runners', async () => {
    const target = levelTargetNamed(QUALIFIED);
    expect(target).toEqual({
      project: 'shared-failures',
      root: ROOT,
      target: 'test:unit:level',
      level: 'unit',
      report: 'tmp/junit/shared-failures.unit.xml',
      testRoots: ['src'],
    });
    const manifest = await readManifest(ROOT);
    await verifyTargetInventory(ROOT, manifest);
    for (const name of ['test', 'test:unit']) {
      expect(manifest.targets[name]?.options?.command).toBe(LEGACY);
      expect(UNDECLARED_TEST_TARGETS[`shared-failures:${name}`]).toContain('without a JUnit');
      expect(() => levelTargetNamed(`shared-failures:${name}`)).toThrow('not a declared level');
    }
    const command = assertLevelEnvelope(target, manifest);
    assertBunReport(target, command);
    expect(collectedFiles(ROOT, parseLevelCommand(command).selector)).toEqual([
      'src/report-failure.test.ts',
    ]);
    expect(assertBunLevelCollection(target, command, [])).toEqual([
      `${ROOT}/src/report-failure.test.ts`,
    ]);
  });

  it('refuses unknown and missing target declarations through the production inventory', async () => {
    const manifest = await readManifest(ROOT);
    expect(
      String(
        await rejectionOf(
          verifyTargetInventory(ROOT, {
            ...manifest,
            targets: { ...manifest.targets, 'test:unknown': { options: { command: 'bun test' } } },
          }),
        ),
      ),
    ).toContain('unknown test target declaration shared-failures:test:unknown');
    const targets = { ...manifest.targets };
    delete targets['test:unit:level'];
    expect(
      String(await rejectionOf(verifyTargetInventory(ROOT, { ...manifest, targets }))),
    ).toContain(`${QUALIFIED} is missing from project manifest`);
  });

  it('refuses a different report identity even when clear and write agree', async () => {
    const command = (await declaredCommand()).replaceAll('shared-failures.unit.xml', 'wrong.xml');
    expect(() => {
      assertBunReport(levelTargetNamed(QUALIFIED), command);
    }).toThrow('report differs from declaration');
  });

  it('audits the full Unit source inventory and refuses omission of a new Unit file', async () => {
    const manifest = await readManifest(ROOT);
    await withRunnerFixture(({ project, command }) => {
      writeFileSync(join(project, 'src/report-failure.test.ts'), '');
      writeFileSync(join(project, 'src/added.test.ts'), '');
      expect(auditProject(project, manifest).exitCode).toBe(0);
      const entry = manifest.targets['test:unit:level'];
      const narrowed = {
        ...manifest,
        targets: {
          ...manifest.targets,
          'test:unit:level': {
            ...entry,
            options: {
              ...entry?.options,
              command: command.replace(
                parseLevelCommand(command).selector,
                "find ./src -name 'report-failure.test.ts'",
              ),
            },
          },
        },
      };
      const audit = auditProject(project, narrowed);
      expect(audit.exitCode).toBe(1);
      expect(audit.stderr.toString()).toContain(
        `shared-failures level targets do not collect ${ROOT}/src/added.test.ts`,
      );
    });
  });

  for (const [file, level] of [
    ['foreign.db.test.ts', 'api'],
    ['foreign.test.tsx', 'view'],
  ]) {
    it(`refuses ${level} files in the Unit collection`, async () => {
      const manifest = await readManifest(ROOT);
      await withRunnerFixture(({ project, command }) => {
        writeFileSync(join(project, 'src/report-failure.test.ts'), '');
        writeFileSync(join(project, 'src', file), '');
        const selector = parseLevelCommand(command).selector;
        const expanded = {
          ...manifest,
          targets: {
            ...manifest.targets,
            'test:unit:level': {
              ...manifest.targets['test:unit:level'],
              options: {
                ...manifest.targets['test:unit:level']?.options,
                command: command.replace(selector, "find ./src -name '*.test.*'"),
              },
            },
          },
        };
        const audit = auditProject(project, expanded);
        expect(audit.exitCode).toBe(1);
        expect(audit.stderr.toString()).toContain(
          `${QUALIFIED} is declared unit and collects ${ROOT}/src/${file}, which is ${level}`,
        );
      });
    });
  }

  // Proof: removing the production selector's ./ prefix made this actual runner fail
  // by executing the nested matching decoy (2026-10-17).
  it('executes literal operands without running a nested matching decoy', async () => {
    await withRunnerFixture(({ project, report, command }) => {
      writeFileSync(
        join(project, 'src/report-failure.test.ts'),
        "import { test, expect } from 'bun:test'; test('selected Unit', () => expect(1).toBe(1));\n",
      );
      mkdirSync(join(project, 'nested/src'), { recursive: true });
      writeFileSync(
        join(project, 'nested/src/report-failure.test.ts'),
        "import { test } from 'bun:test'; test('matching decoy', () => { throw new Error('decoy executed'); });\n",
      );
      const execution = runCommand(project, command);
      expect(execution.exitCode).toBe(0);
      expect(readJUnitReport(readFileSync(report, 'utf8'))).toEqual([
        { file: 'src/report-failure.test.ts', name: 'selected Unit', outcome: 'passed' },
      ]);
    });
  });

  // Proof: separately bypassing the empty guard lost no-cases; removing report deletion
  // left stale XML. Both production-command faults failed this case (2026-10-17).
  it('removes stale reports before refusing an empty selection', async () => {
    await withRunnerFixture(({ project, report, command }) => {
      writeFileSync(report, '<stale/>');
      const execution = runCommand(project, command);
      expect(execution.exitCode).toBe(1);
      expect(execution.stderr.toString()).toContain(`no-cases: ${QUALIFIED}`);
      expect(existsSync(report)).toBe(false);
    });
  });

  // Proof: replacing the production selection's && with ; ran partial selector output
  // and exited zero; this actual-command exit assertion failed (2026-10-17).
  it('removes stale reports and refuses a failing selector before Bun can discover tests', async () => {
    await withRunnerFixture(({ project, report, command }) => {
      writeFileSync(report, '<stale/>');
      writeFileSync(
        join(project, 'outside.test.ts'),
        "import { test } from 'bun:test'; test('unselected decoy', () => {});\n",
      );
      writeFileSync(
        join(project, 'src/report-failure.test.ts'),
        "import { test } from 'bun:test'; test('partial selector output', () => {});\n",
      );
      const failing = command.replace(
        "find ./src -name '*.test.ts' ! -name '*.db.test.ts'",
        "find ./src ./missing-source -name '*.test.ts'",
      );
      expect(failing).not.toBe(command);
      const execution = runCommand(project, failing);
      expect(execution.exitCode).not.toBe(0);
      expect(execution.stderr.toString()).toContain('./missing-source');
      expect(execution.stderr.toString()).not.toContain('unselected decoy');
      expect(existsSync(report)).toBe(false);
    });
  });

  it('writes all twenty real Unit outcomes to a fresh report', async () => {
    const target = levelTargetNamed(QUALIFIED);
    const command = await declaredCommand();
    const report = new URL(target.report, WORKSPACE).pathname;
    mkdirSync(dirname(report), { recursive: true });
    writeFileSync(report, '<stale/>');
    const execution = runCommand(new URL(`${ROOT}/`, WORKSPACE).pathname, command);
    expect(execution.exitCode).toBe(0);
    const cases = readJUnitReport(readFileSync(report, 'utf8'));
    expect(cases).toEqual(
      [
        'bounds the whole report and refuses to run the caught value',
        'names every property both reports skip',
        'skips a sensitive property whatever its capitalisation',
        'scrubs a caller-owned secret from message and stack, not only from its property',
        'treats a secret as literal text, not as a pattern',
        'an empty secret list leaves the key rules in force',
        'correlates a primitive failure without publishing its contents',
        'a cause that cannot be inspected is reported as reporting loss, not as a throw',
        'two losses in one process do not share a handle',
        'redacts a secret the disclosure policy selected into the public report',
        'reports a cause chain by path and redacts a key nested inside it',
        'keeps the order of an aggregate failure and reports a circular value',
        'stops the cause walk at the depth limit and says so on the deepest child',
        'stops at the child limit and says so on the root',
        'reports a thrown undefined, null and BigInt rather than losing them',
        'does not run a throwing getter while reporting',
        'bounds a very long Unicode message and marks it truncated',
        'drops the context whole when the report is over budget',
        'drops the reporting errors after the context when both cannot fit',
        'both reports validate against the installed schemas after redaction and truncation',
      ].map((name) => ({ name, outcome: 'passed', file: 'src/report-failure.test.ts' })),
    );
    assertReportCovers(target, cases, ['src/report-failure.test.ts']);
  });
});
