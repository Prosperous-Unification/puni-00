import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  digestOf,
  digestWithout,
  PlanReferenceRecord,
  PlanTasks,
} from '@twilight-burokrat/contracts';
import { applyProjectCommands, validateSchema } from '@wbs/contracts';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { runTwin, runTwinInProcess, scratchDirectory, type TwinRun } from './testing/run-twin';

const FIXTURE = join(import.meta.dir, 'fixtures', 'plan-export.v8.json');
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
async function writePlanReference(
  directory: string,
  change: string,
  fixture = FIXTURE,
): Promise<void> {
  mkdirSync(directory);
  const requirements = join(scratch.path, 'spec.md');
  writeFileSync(requirements, '## ADDED Requirements\n');
  const run = await runTwinInProcess([
    'plan-reference',
    '--export',
    fixture,
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
    const expectedBatch = {
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
    };
    expect(batch).toEqual(expectedBatch);
    expect(readFileSync(output, 'utf8')).toBe(`${JSON.stringify(expectedBatch, null, 2)}\n`);
  });

  test.each([6, 7] as const)(
    'historical v%s task export keeps its digest and commands',
    async (version) => {
      const directory = join(scratch.path, 'historical');
      await writePlanReference(
        directory,
        reference.planRef.change,
        join(import.meta.dir, 'fixtures', 'plan-export.v7.json'),
      );
      tasksPath = join(directory, 'tasks.json');
      referencePath = join(directory, 'plan-reference.json');
      if (version === 6) {
        const historicalReference = JSON.parse(readFileSync(referencePath, 'utf8')) as Record<
          string,
          unknown
        >;
        historicalReference['planDocumentVersion'] = 6;
        historicalReference['referenceDigest'] = digestWithout(
          historicalReference,
          'referenceDigest',
        );
        writeFileSync(referencePath, JSON.stringify(historicalReference));
      }
      const historical = JSON.parse(readFileSync(tasksPath, 'utf8')) as unknown;
      const decoded = PlanTasks.assert(historical);
      expect(decoded.schemaVersion).toBe(1);
      expect(historical).toEqual(decoded);
      const bound = PlanReferenceRecord.assert(JSON.parse(readFileSync(referencePath, 'utf8')));
      expect(digestOf(decoded)).toBe(bound.tasksDigest);
      writeReceipt(receiptBody());
      const run = await runTwinInProcess(receiptToCommands());
      expect(run.exitCode).toBe(0);
      expect(
        (JSON.parse(readFileSync(output, 'utf8')) as { commands: unknown[] }).commands[0],
      ).toEqual({
        kind: 'setProgress',
        workItemId: RECORDS_TASK,
        stepId: DEV_STEP,
        state: 'done',
      });
    },
  );

  test.each([
    ['plan mismatch', /plan identity/],
    ['count mismatch', /task count/],
    ['v6 schema2', /schema pairing/],
    ['v7 schema2', /schema pairing/],
    ['v8 schema1', /schema pairing/],
    ['duplicate task ID', /unique task IDs/],
    ['duplicate step ID', /unique step IDs/],
    ['duplicate step code named by receipt', /unique step codes/],
  ] as const)('refuses re-digested %s before writing', async (fault, diagnostic) => {
    if (fault === 'v8 schema1') {
      const directory = join(scratch.path, 'historical-pair');
      await writePlanReference(
        directory,
        reference.planRef.change,
        join(import.meta.dir, 'fixtures', 'plan-export.v7.json'),
      );
      tasksPath = join(directory, 'tasks.json');
      referencePath = join(directory, 'plan-reference.json');
    }
    const tasks = JSON.parse(readFileSync(tasksPath, 'utf8')) as {
      plan: string;
      tasks: { id: string }[];
      steps: { id: string; code: string }[];
    };
    const bound = JSON.parse(readFileSync(referencePath, 'utf8')) as Record<string, unknown>;
    if (fault === 'plan mismatch') tasks.plan = 'another-plan';
    if (fault === 'count mismatch') bound['taskCount'] = 99;
    if (fault === 'v6 schema2') bound['planDocumentVersion'] = 6;
    if (fault === 'v7 schema2') bound['planDocumentVersion'] = 7;
    if (fault === 'v8 schema1') bound['planDocumentVersion'] = 8;
    if (fault === 'duplicate task ID') tasks.tasks[1].id = tasks.tasks[0].id;
    if (fault === 'duplicate step ID') tasks.steps[1].id = tasks.steps[0].id;
    if (fault === 'duplicate step code named by receipt') tasks.steps[1].code = 'dev';
    bound['tasksDigest'] = digestOf(tasks);
    bound['referenceDigest'] = digestWithout(bound, 'referenceDigest');
    writeFileSync(tasksPath, JSON.stringify(tasks));
    writeFileSync(referencePath, JSON.stringify(bound));
    writeReceipt(receiptBody({ entries: [doneEntry] }));
    const run =
      fault === 'plan mismatch'
        ? runTwin(receiptToCommands())
        : await runTwinInProcess(receiptToCommands());
    expectRefusal(run, diagnostic);
  });

  test('refuses a malformed task digest before writing', async () => {
    const bound = { ...reference, tasksDigest: 'not-a-digest' };
    bound.referenceDigest = digestWithout(bound, 'referenceDigest');
    writeFileSync(referencePath, JSON.stringify(bound));
    writeReceipt(receiptBody());
    expectRefusal(await runTwinInProcess(receiptToCommands()), /plan reference is malformed/);
  });

  test.each(['missing unit', 'unknown key', 'future schema'])(
    'refuses a current task export with %s',
    async (fault) => {
      writeReceipt(receiptBody());
      const tasks = JSON.parse(readFileSync(tasksPath, 'utf8')) as {
        schemaVersion: number;
        tasks: { estimates: Record<string, unknown>[] }[];
      };
      if (fault === 'missing unit') delete tasks.tasks[0].estimates[0]['unit'];
      if (fault === 'unknown key') tasks.tasks[0].estimates[0]['extra'] = 1;
      if (fault === 'future schema') tasks.schemaVersion = 3;
      writeFileSync(tasksPath, JSON.stringify(tasks));
      expectRefusal(await runTwinInProcess(receiptToCommands()), /task export is malformed/);
    },
  );

  test.each(['unit', 'value'])('refuses a tampered native estimate %s', async (fault) => {
    writeReceipt(receiptBody());
    const tasks = JSON.parse(readFileSync(tasksPath, 'utf8')) as {
      schemaVersion: number;
      tasks: { estimates: Record<string, unknown>[] }[];
    };
    if (fault === 'unit') tasks.tasks[0].estimates[0]['unit'] = 'minutes';
    if (fault === 'value') tasks.tasks[0].estimates[0]['realistic'] = 99;
    writeFileSync(tasksPath, JSON.stringify(tasks));
    expectRefusal(await runTwinInProcess(receiptToCommands()), /tasksDigest does not match tasks/);
  });

  test('current native estimates retain their digest and produce deterministic batches', async () => {
    const persisted = JSON.parse(readFileSync(tasksPath, 'utf8')) as unknown;
    const decoded = PlanTasks.assert(persisted);
    expect(decoded.schemaVersion).toBe(2);
    expect(persisted).toEqual(decoded);
    expect(digestOf(decoded)).toBe(reference.tasksDigest);
    writeReceipt(receiptBody());
    const first = await runTwinInProcess(receiptToCommands());
    expect(first.exitCode).toBe(0);
    const secondOutput = join(scratch.path, 'second-batch.json');
    const second = await runTwinInProcess(receiptToCommands({ '--output': secondOutput }));
    expect(second).toEqual(first);
    expect(readFileSync(secondOutput, 'utf8')).toBe(readFileSync(output, 'utf8'));
    expect(statSync(secondOutput).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(tasksPath, 'utf8'))).toEqual(persisted);
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
      /tasksDigest does not match tasks/,
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
      /tasksDigest does not match tasks/,
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
