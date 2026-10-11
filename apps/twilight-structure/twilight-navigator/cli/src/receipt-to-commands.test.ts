import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { digestOf, PlanReferenceRecord } from '@twilight-burokrat/contracts';
import { applyProjectCommands, validateSchema } from '@wbs/contracts';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { PlanTasks } from './plan-tasks';
import { runTwin, runTwinInProcess, scratchDirectory, type TwinRun } from './testing/run-twin';

const FIXTURE = join(import.meta.dir, 'fixtures', 'plan-export.v6.json');
const RECORDS_TASK = '00000000-0000-4000-8000-000000000007';
const DOCS_TASK = '00000000-0000-4000-8000-000000000013';
const DEV_STEP = '00000000-0000-4000-8000-000000000002';
const QA_STEP = '00000000-0000-4000-8000-000000000003';

let scratch: { path: string; remove: () => void };
let referencePath: string;
let tasksPath: string;
let output: string;
let reference: PlanReferenceRecord;

/** A plan reference and task export written by the real `plan-reference` command. */
async function writePlanReference(directory: string, change: string): Promise<void> {
  mkdirSync(directory);
  const requirements = join(scratch.path, 'spec.md');
  writeFileSync(requirements, '## ADDED Requirements\n');
  const run = await runTwinInProcess([
    'plan-reference',
    '--export',
    FIXTURE,
    '--repository',
    'https://github.com/Prosperous-Unification/puni-00',
    '--change',
    change,
    '--planning-commit',
    '1'.repeat(40),
    '--source-base',
    '2'.repeat(40),
    '--requirements',
    requirements,
    '--output',
    directory,
  ]);
  if (run.exitCode !== 0) throw new Error(`fixture plan reference refused: ${run.stderr}`);
}

beforeEach(async () => {
  scratch = scratchDirectory();
  await writePlanReference(join(scratch.path, 'plan'), 'twilight-navigator-plan-reference');
  referencePath = join(scratch.path, 'plan', 'plan-reference.json');
  tasksPath = join(scratch.path, 'plan', 'tasks.json');
  reference = PlanReferenceRecord.assert(JSON.parse(readFileSync(referencePath, 'utf8')));
  output = join(scratch.path, 'batch.json');
});

afterEach(() => {
  scratch.remove();
});

const doneEntry = {
  taskId: RECORDS_TASK,
  stepCode: 'dev',
  status: 'done',
  measures: { hours_actual: 3.5, token_actual: 120000 },
  observedAt: '2026-10-11T10:00:00.000Z',
  evidence: 'openspec/changes/twilight-navigator-plan-reference/verify.md',
};
const startedEntry = {
  taskId: DOCS_TASK,
  stepCode: 'qa',
  status: 'in_progress',
  observedAt: '2026-10-11T10:05:00.000Z',
  evidence: { kind: 'external', authority: 'ci' },
};

function receiptBody(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    kind: 'progress-receipt',
    planRef: reference.planRef,
    entries: [doneEntry, startedEntry],
    ...overrides,
  };
}

function writeReceipt(body: object, digest: string = digestOf(body)): string {
  const path = join(scratch.path, 'receipt.json');
  writeFileSync(path, JSON.stringify({ ...body, receiptDigest: digest }));
  return path;
}

function receiptToCommands(overrides: Readonly<Record<string, string>> = {}): string[] {
  const flags: Record<string, string> = {
    '--receipt': join(scratch.path, 'receipt.json'),
    '--plan-reference': referencePath,
    '--tasks': tasksPath,
    '--output': output,
    ...overrides,
  };
  return ['receipt-to-commands', ...Object.entries(flags).flat()];
}

function expectRefusal(run: TwinRun, diagnostic: RegExp): void {
  expect(run.stderr).toMatch(diagnostic);
  expect(run.exitCode).toBe(1);
  expect(run.stdout).toBe('');
  expect(readdirSync(scratch.path)).not.toContain('batch.json');
}

describe('twin receipt-to-commands', () => {
  test('emits commands per entry in receipt order, through the real entrypoint', () => {
    writeReceipt(receiptBody());
    const run = runTwin(receiptToCommands());

    expect(run.stderr).toBe('');
    expect(run.exitCode).toBe(0);
    const batch = JSON.parse(readFileSync(output, 'utf8')) as { id: string; commands: unknown[] };
    expect(run.stdout).toBe(`${digestOf(batch)}\n`);
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(batch).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      commands: [
        { kind: 'setProgress', workItemId: RECORDS_TASK, stepId: DEV_STEP, state: 'done' },
        {
          kind: 'setMeasure',
          workItemId: RECORDS_TASK,
          stepId: DEV_STEP,
          metric: 'token_actual',
          value: 120000,
        },
        {
          kind: 'setMeasure',
          workItemId: RECORDS_TASK,
          stepId: DEV_STEP,
          metric: 'hours_actual',
          value: 3.5,
        },
        { kind: 'setProgress', workItemId: DOCS_TASK, stepId: QA_STEP, state: 'in_progress' },
      ],
    });
  });

  test('the emitted batch validates against the WBS command endpoint', async () => {
    writeReceipt(receiptBody());
    expect((await runTwinInProcess(receiptToCommands())).exitCode).toBe(0);
    const batch = JSON.parse(readFileSync(output, 'utf8')) as { id: string; commands: unknown };

    expect(await validateSchema(applyProjectCommands.params, { id: batch.id })).toEqual({
      value: { id: batch.id },
    });
    expect(
      (await validateSchema(applyProjectCommands.body, { commands: batch.commands })).issues,
    ).toBeUndefined();
  });

  test('refuses a receipt for another plan reference', async () => {
    writeReceipt(receiptBody({ planRef: { ...reference.planRef, change: 'another-change' } }));
    expectRefusal(
      await runTwinInProcess(receiptToCommands()),
      /progress receipt names another plan reference/,
    );
  });

  test('refuses a task export the plan reference does not bind', async () => {
    writeReceipt(receiptBody());
    const tasks = PlanTasks.assert(JSON.parse(readFileSync(tasksPath, 'utf8')));
    const otherTasks = join(scratch.path, 'other-tasks.json');
    writeFileSync(
      otherTasks,
      JSON.stringify({
        ...tasks,
        tasks: tasks.tasks.map((task) => ({ ...task, name: 'renamed' })),
      }),
    );
    expectRefusal(
      await runTwinInProcess(receiptToCommands({ '--tasks': otherTasks })),
      /task export does not match the plan reference tasksDigest/,
    );
  });

  test('refuses an unknown task or step before writing', async () => {
    writeReceipt(receiptBody({ entries: [doneEntry, { ...startedEntry, taskId: 'absent-task' }] }));
    expectRefusal(
      await runTwinInProcess(receiptToCommands()),
      /receipt entry 1 names task absent-task, absent from the plan/,
    );
    writeReceipt(receiptBody({ entries: [{ ...doneEntry, stepCode: 'deploy' }] }));
    expectRefusal(
      await runTwinInProcess(receiptToCommands()),
      /receipt entry 0 names step deploy, absent from the plan/,
    );
    // A parent work item is not a task: its rows roll up and take no step progress.
    writeReceipt(
      receiptBody({ entries: [{ ...doneEntry, taskId: '00000000-0000-4000-8000-000000000004' }] }),
    );
    expectRefusal(await runTwinInProcess(receiptToCommands()), /absent from the plan/);
  });

  test('refuses a tampered receipt, plan reference or task export', async () => {
    writeReceipt(receiptBody(), digestOf(receiptBody({ entries: [doneEntry] })));
    expectRefusal(await runTwinInProcess(receiptToCommands()), /progress receipt is malformed/);

    writeReceipt(receiptBody());
    const tamperedReference = join(scratch.path, 'tampered-reference.json');
    writeFileSync(tamperedReference, JSON.stringify({ ...reference, taskCount: 99 }));
    expectRefusal(
      await runTwinInProcess(receiptToCommands({ '--plan-reference': tamperedReference })),
      /plan reference is malformed/,
    );

    const tamperedTasks = join(scratch.path, 'tampered-tasks.json');
    writeFileSync(
      tamperedTasks,
      readFileSync(tasksPath, 'utf8').replace('"Documentation"', '"Docs"'),
    );
    expectRefusal(
      await runTwinInProcess(receiptToCommands({ '--tasks': tamperedTasks })),
      /does not match the plan reference tasksDigest/,
    );
  });

  test('refuses a missing, unreadable or malformed receipt and names it', async () => {
    const absent = join(scratch.path, 'receipt.json');
    expectRefusal(
      await runTwinInProcess(receiptToCommands()),
      new RegExp(`progress receipt is missing: ${absent}`),
    );
    expectRefusal(
      await runTwinInProcess(receiptToCommands({ '--receipt': scratch.path })),
      new RegExp(`progress receipt is unreadable: ${scratch.path}`),
    );
    writeFileSync(absent, '{');
    expectRefusal(
      await runTwinInProcess(receiptToCommands()),
      new RegExp(`progress receipt is malformed: ${absent} is not JSON`),
    );
  });

  test('refuses an existing output file and keeps its bytes', async () => {
    writeReceipt(receiptBody());
    writeFileSync(output, 'occupied');
    const run = await runTwinInProcess(receiptToCommands());

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toMatch(/EEXIST/);
    expect(readFileSync(output, 'utf8')).toBe('occupied');
  });
});
