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

const ROOT = 'libs/shared/domain/validation';
const QUALIFIED = 'shared-validation:test:unit:level';
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
  const directory = mkdtempSync(join(tmpdir(), 'shared-validation-level-'));
  const project = join(directory, ROOT);
  const report = join(directory, 'tmp/junit/shared-validation.unit.xml');
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

describe('shared-validation isolated Unit level', () => {
  it('registers the canonical Unit collection and preserves unreported legacy runners', async () => {
    const target = levelTargetNamed(QUALIFIED);
    expect(target).toEqual({
      project: 'shared-validation',
      root: ROOT,
      target: 'test:unit:level',
      level: 'unit',
      report: 'tmp/junit/shared-validation.unit.xml',
      testRoots: ['src'],
    });
    const manifest = await readManifest(ROOT);
    await verifyTargetInventory(ROOT, manifest);
    for (const name of ['test', 'test:unit']) {
      expect(manifest.targets[name]?.options?.command).toBe(LEGACY);
      expect(UNDECLARED_TEST_TARGETS[`shared-validation:${name}`]).toContain('without a JUnit');
      expect(() => levelTargetNamed(`shared-validation:${name}`)).toThrow('not a declared level');
    }
    const command = assertLevelEnvelope(target, manifest);
    assertBunReport(target, command);
    expect(collectedFiles(ROOT, parseLevelCommand(command).selector)).toEqual(['src/core.test.ts']);
    expect(assertBunLevelCollection(target, command, [])).toEqual([`${ROOT}/src/core.test.ts`]);
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
    ).toContain('unknown test target declaration shared-validation:test:unknown');
    const targets = { ...manifest.targets };
    delete targets['test:unit:level'];
    expect(
      String(await rejectionOf(verifyTargetInventory(ROOT, { ...manifest, targets }))),
    ).toContain(`${QUALIFIED} is missing from project manifest`);
  });

  it('refuses a different report identity even when clear and write agree', async () => {
    const command = (await declaredCommand()).replaceAll('shared-validation.unit.xml', 'wrong.xml');
    expect(() => {
      assertBunReport(levelTargetNamed(QUALIFIED), command);
    }).toThrow('report differs from declaration');
  });

  it('audits the full Unit source inventory and refuses omission of a new Unit file', async () => {
    const manifest = await readManifest(ROOT);
    await withRunnerFixture(({ project, command }) => {
      writeFileSync(join(project, 'src/core.test.ts'), '');
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
                "find ./src -name 'core.test.ts'",
              ),
            },
          },
        },
      };
      const audit = auditProject(project, narrowed);
      expect(audit.exitCode).toBe(1);
      expect(audit.stderr.toString()).toContain(
        `shared-validation level targets do not collect ${ROOT}/src/added.test.ts`,
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
        writeFileSync(join(project, 'src/core.test.ts'), '');
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
        join(project, 'src/core.test.ts'),
        "import { test, expect } from 'bun:test'; test('selected Unit', () => expect(1).toBe(1));\n",
      );
      mkdirSync(join(project, 'nested/src'), { recursive: true });
      writeFileSync(
        join(project, 'nested/src/core.test.ts'),
        "import { test } from 'bun:test'; test('matching decoy', () => { throw new Error('decoy executed'); });\n",
      );
      const execution = runCommand(project, command);
      expect(execution.exitCode).toBe(0);
      expect(readJUnitReport(readFileSync(report, 'utf8'))).toEqual([
        { file: 'src/core.test.ts', name: 'selected Unit', outcome: 'passed' },
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
        join(project, 'src/core.test.ts'),
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

  it('writes all three real Unit outcomes to a fresh report', async () => {
    const target = levelTargetNamed(QUALIFIED);
    const command = await declaredCommand();
    const report = new URL(target.report, WORKSPACE).pathname;
    mkdirSync(dirname(report), { recursive: true });
    writeFileSync(report, '<stale/>');
    const execution = runCommand(new URL(`${ROOT}/`, WORKSPACE).pathname, command);
    expect(execution.exitCode).toBe(0);
    const cases = readJUnitReport(readFileSync(report, 'utf8'));
    expect(cases.map(({ name, outcome, file }) => ({ name, outcome, file }))).toEqual([
      {
        name: 're-exports ArkType type function that validates objects',
        outcome: 'passed',
        file: 'src/core.test.ts',
      },
      {
        name: 'parseOrThrow returns parsed value on success',
        outcome: 'passed',
        file: 'src/core.test.ts',
      },
      {
        name: 'parseOrThrow throws ValidationError on failure, embedding the offending value',
        outcome: 'passed',
        file: 'src/core.test.ts',
      },
    ]);
    assertReportCovers(target, cases, ['src/core.test.ts']);
  });
});
