import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  decodeRecord,
  digestOf,
  PlanReferenceRecord,
  PlanTasks,
} from '@twilight-burokrat/contracts';
import type { PlanDocument } from '@wbs/contracts';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  requireNonRoot,
  runTwin,
  runTwinInProcess,
  scratchDirectory,
  type TwinRun,
} from './testing/run-twin';

/**
 * Written by WBS's own exporter (`PlanDocumentService.export` over a memory source with a
 * fixed clock and sequential ids, 2026-10-11): two default steps, a parent with two leaves,
 * one top-level leaf, an FS typed dependency and a legacy dependency.
 */
const FIXTURE = join(import.meta.dir, 'fixtures', 'plan-export.v7.json');
const FIXTURE_BYTES = readFileSync(FIXTURE);
const PLANNING_COMMIT = '1'.repeat(40);
const SOURCE_BASE = '2'.repeat(40);

let scratch: { path: string; remove: () => void };
let output: string;
let requirements: string;

beforeEach(() => {
  scratch = scratchDirectory();
  output = join(scratch.path, 'out');
  mkdirSync(output);
  requirements = join(scratch.path, 'spec.md');
  writeFileSync(requirements, '## ADDED Requirements\n');
});

afterEach(() => {
  scratch.remove();
});

function planReferenceArgv(overrides: Readonly<Record<string, string>> = {}): string[] {
  const flags: Record<string, string> = {
    '--export': FIXTURE,
    '--repository': 'https://github.com/Prosperous-Unification/puni-00',
    '--change': 'twilight-navigator-plan-reference',
    '--planning-commit': PLANNING_COMMIT,
    '--source-base': SOURCE_BASE,
    '--requirements': requirements,
    '--output': output,
    ...overrides,
  };
  return ['plan-reference', ...Object.entries(flags).flat()];
}

const planReference = (overrides: Readonly<Record<string, string>> = {}) =>
  runTwinInProcess(planReferenceArgv(overrides));

function writeExport(mutate: (document: Record<string, unknown>) => void): string {
  const document = JSON.parse(FIXTURE_BYTES.toString('utf8')) as Record<string, unknown>;
  mutate(document);
  const path = join(scratch.path, 'export.json');
  writeFileSync(path, JSON.stringify(document));
  return path;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function expectRefusal(run: TwinRun, diagnostic: RegExp): void {
  expect(run.exitCode).toBe(1);
  expect(run.stdout).toBe('');
  expect(run.stderr).toMatch(diagnostic);
  expect(readdirSync(output)).toEqual([]);
}

describe('twin plan-reference', () => {
  test('writes a decodable plan reference and tasks export', () => {
    const run = runTwin(planReferenceArgv());

    expect(run.stderr).toBe('');
    expect(run.exitCode).toBe(0);
    expect(readdirSync(output).sort()).toEqual(['plan-reference.json', 'tasks.json']);
    for (const name of ['plan-reference.json', 'tasks.json']) {
      expect(statSync(join(output, name)).mode & 0o777).toBe(0o600);
    }
    const written = readJson(join(output, 'plan-reference.json'));
    const record = PlanReferenceRecord.assert(written);
    expect(decodeRecord('plan-reference', written)).toEqual(record);
    const tasks = PlanTasks.assert(readJson(join(output, 'tasks.json')));

    expect(run.stdout).toBe(`${record.referenceDigest}\n`);
    expect(record.planRef).toEqual({
      repository: 'https://github.com/Prosperous-Unification/puni-00',
      plan: '00000000-0000-4000-8000-000000000001',
      change: 'twilight-navigator-plan-reference',
      planningCommit: PLANNING_COMMIT,
      sourceBaseCommit: SOURCE_BASE,
      requirementsDigest: createHash('sha256').update('## ADDED Requirements\n').digest('hex'),
    });
    expect(record.exportDigest).toBe(createHash('sha256').update(FIXTURE_BYTES).digest('hex'));
    expect(record.tasksDigest).toBe(digestOf(tasks));
    expect(record.createdAt).toBe('2026-10-11T09:00:00.000Z');
    expect(record.taskCount).toBe(3);
    expect(record.planDocumentVersion).toBe(7);
    expect(tasks.steps.map(({ code }) => code)).toEqual(['dev', 'qa']);
    expect(tasks.tasks.map(({ number, name, ancestors }) => [number, name, ancestors])).toEqual([
      ['010.1', 'Record kinds', ['Navigator CLI']],
      ['010.2', 'plan-reference command', ['Navigator CLI']],
      ['020', 'Documentation', []],
    ]);
    expect(tasks.tasks[1].typedDependencies).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000028',
        type: 'FS',
        predecessor: { scope: 'whole', workItem: '00000000-0000-4000-8000-000000000007' },
        successor: { scope: 'whole', workItem: '00000000-0000-4000-8000-000000000010' },
      },
    ]);
    expect(tasks.tasks[2].dependsOn).toEqual(['00000000-0000-4000-8000-000000000010']);
    if (tasks.schemaVersion !== 1) throw new Error('v7 must retain task schema 1');
    expect(tasks.tasks[0].estimateDays).toEqual([
      { stepCode: 'dev', optimistic: 1, realistic: 2, pessimistic: 4 },
      { stepCode: 'qa', optimistic: 1, realistic: 2, pessimistic: 4 },
    ]);
    expect(readFileSync(FIXTURE)).toEqual(FIXTURE_BYTES);
  });

  // Fixture exported through PlanDocumentService.exportCaptured with the historical tree,
  // explicit workday/dev and minute/qa steps and a fixed clock (2026-10-13).
  test('writes native minute and workday estimates from the current exporter', async () => {
    const path = join(import.meta.dir, 'fixtures', 'plan-export.v8.json');
    const run = await planReference({ '--export': path });
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe('');
    const record = PlanReferenceRecord.assert(readJson(join(output, 'plan-reference.json')));
    expect(decodeRecord('plan-reference', record)).toEqual(record);
    expect(record.planDocumentVersion).toBe(8);
    expect(record.exportDigest).toBe(createHash('sha256').update(readFileSync(path)).digest('hex'));
    const tasks = PlanTasks.assert(readJson(join(output, 'tasks.json')));
    expect(tasks.schemaVersion).toBe(2);
    expect(tasks.tasks[0]).toMatchObject({
      estimates: [
        { stepCode: 'dev', unit: 'workdays', optimistic: 1, realistic: 2, pessimistic: 4 },
        { stepCode: 'qa', unit: 'minutes', optimistic: 30, realistic: 60, pessimistic: 120 },
      ],
    });
    expect(tasks.tasks[0]).not.toHaveProperty('estimateDays');
    expect(record.tasksDigest).toBe(digestOf(tasks));
  });

  test.each(['missing unit', 'unknown unit', 'unknown root key', 'unknown step key'])(
    'refuses a current export with %s',
    async (fault) => {
      const document = JSON.parse(
        readFileSync(join(import.meta.dir, 'fixtures', 'plan-export.v8.json'), 'utf8'),
      ) as Record<string, unknown>;
      const steps = document['steps'] as Record<string, unknown>[];
      if (fault === 'missing unit') delete steps[1]['estimateUnit'];
      if (fault === 'unknown unit') steps[1]['estimateUnit'] = 'hours';
      if (fault === 'unknown root key') document['extra'] = 1;
      if (fault === 'unknown step key') steps[1]['extra'] = 1;
      const path = join(scratch.path, 'current.json');
      writeFileSync(path, JSON.stringify(document));
      expectRefusal(await planReference({ '--export': path }), /plan export is malformed/);
    },
  );

  test('the same inputs produce the same bytes and digest', async () => {
    const first = await planReference();
    const firstBytes = ['plan-reference.json', 'tasks.json'].map((name) =>
      readFileSync(join(output, name), 'utf8'),
    );
    const second = await planReference({ '--output': scratch.path });

    expect(second.stdout).toBe(first.stdout);
    expect(
      ['plan-reference.json', 'tasks.json'].map((name) =>
        readFileSync(join(scratch.path, name), 'utf8'),
      ),
    ).toEqual(firstBytes);
  });

  test('refuses a version-6 document before writing', async () => {
    const path = writeExport((document) => {
      document['document'] = {
        format: 'wbs-plan',
        version: 6,
        exportedAt: '2026-10-11T09:00:00.000Z',
      };
    });
    expectRefusal(
      await planReference({ '--export': path }),
      /has version 6; twin reads versions 7 and 8 and 9 only/,
    );
  });

  // Exported by PlanDocumentService.exportCaptured on 2026-10-15 with mixed units,
  // a negative direct timestamp and done progress on its owner/step.
  test.each([false, true])(
    'reads v9 with empty facts %s and preserves native units and raw bytes',
    async (empty) => {
      const path = join(scratch.path, 'v9.json');
      const document = JSON.parse(
        readFileSync(join(import.meta.dir, 'fixtures', 'plan-export.v9.json'), 'utf8'),
      ) as PlanDocument;
      expect(document.stepBlockages).toHaveLength(1);
      if (empty) document.stepBlockages = [];
      writeFileSync(path, JSON.stringify(document, null, 3) + '\n');
      const bytes = readFileSync(path);
      const run = await planReference({ '--export': path });
      expect(run.exitCode, run.stderr).toBe(0);
      const record = PlanReferenceRecord.assert(readJson(join(output, 'plan-reference.json')));
      const tasks = PlanTasks.assert(readJson(join(output, 'tasks.json')));
      expect(record.planDocumentVersion).toBe(9);
      expect(record.exportDigest).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(tasks.schemaVersion).toBe(2);
      expect(tasks.tasks[0]).toMatchObject({
        estimates: [
          { stepCode: 'dev', unit: 'workdays', optimistic: 1, realistic: 2, pessimistic: 4 },
          { stepCode: 'qa', unit: 'minutes', optimistic: 30, realistic: 60, pessimistic: 120 },
        ],
      });
      expect(readFileSync(path)).toEqual(bytes);
    },
  );

  test('a blockedAt-only change preserves tasks but changes export and reference digests', async () => {
    const path = join(scratch.path, 'v9.json');
    const document = JSON.parse(
      readFileSync(join(import.meta.dir, 'fixtures', 'plan-export.v9.json'), 'utf8'),
    ) as PlanDocument;
    writeFileSync(path, JSON.stringify(document));
    expect((await planReference({ '--export': path })).exitCode).toBe(0);
    const first = PlanReferenceRecord.assert(readJson(join(output, 'plan-reference.json')));
    const firstTasks = readJson(join(output, 'tasks.json'));
    document.stepBlockages[0].blockedAt = -2;
    writeFileSync(path, JSON.stringify(document));
    expect((await planReference({ '--export': path, '--output': scratch.path })).exitCode).toBe(0);
    const second = PlanReferenceRecord.assert(readJson(join(scratch.path, 'plan-reference.json')));
    expect(readJson(join(scratch.path, 'tasks.json'))).toEqual(firstTasks);
    expect(second.tasksDigest).toBe(first.tasksDigest);
    expect(second.exportDigest).not.toBe(first.exportDigest);
    expect(second.referenceDigest).not.toBe(first.referenceDigest);
  });

  test.each([
    'owner',
    'parent',
    'step',
    'duplicate',
    'unsafe time',
    'fractional time',
    'missing facts',
    'unknown nested key',
    'future version',
  ])('refuses v9 %s before writing', async (fault) => {
    const document = JSON.parse(
      readFileSync(join(import.meta.dir, 'fixtures', 'plan-export.v9.json'), 'utf8'),
    ) as PlanDocument;
    const fact = document.stepBlockages[0];
    if (fault === 'owner') fact.workItemId = 'absent';
    if (fault === 'parent') fact.workItemId = document.workItems[0].id;
    if (fault === 'step') fact.stepId = 'absent';
    if (fault === 'duplicate') document.stepBlockages.push({ ...fact });
    if (fault === 'unsafe time') fact.blockedAt = Number.MAX_SAFE_INTEGER + 1;
    if (fault === 'fractional time') fact.blockedAt = 1.5;
    if (fault === 'missing facts') Reflect.deleteProperty(document, 'stepBlockages');
    if (fault === 'unknown nested key') Reflect.set(fact, 'extra', true);
    if (fault === 'future version') Reflect.set(document.document, 'version', 10);
    const path = join(scratch.path, 'v9.json');
    writeFileSync(path, JSON.stringify(document));
    expectRefusal(
      await planReference({ '--export': path }),
      fault === 'future version'
        ? /has version 10; twin reads versions 7 and 8 and 9 only/
        : /plan export is malformed/,
    );
  });

  test('refuses a missing output directory and names it', async () => {
    const absent = join(scratch.path, 'absent-dir');
    const run = await planReference({ '--output': absent });
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toBe(`output directory is missing: ${absent}`);
  });

  test('refuses an export carrying a key the version-7 contract does not declare', async () => {
    const path = writeExport((document) => {
      document['navigatorNote'] = 'extra';
    });
    expectRefusal(await planReference({ '--export': path }), /plan export is malformed/);
  });

  test.each(['workdays', 'minutes', 'hours'])(
    'refuses a version-7 step carrying estimateUnit %s before writing',
    async (estimateUnit) => {
      const path = writeExport((document) => {
        const steps = document['steps'] as Record<string, unknown>[];
        steps[0]['estimateUnit'] = estimateUnit;
      });
      expectRefusal(await planReference({ '--export': path }), /plan export is malformed/);
    },
  );

  test.each([
    { unit: 'workdays', days: 2 },
    { unit: 'minutes', minutes: 120 },
    { unit: 'hours', hours: 2 },
  ])('refuses a version-7 work item carrying charged %j before writing', async (charge) => {
    const path = writeExport((document) => {
      const workItems = document['workItems'] as Record<string, unknown>[];
      workItems[1]['charged'] = { '00000000-0000-4000-8000-000000000002': charge };
    });
    expectRefusal(await planReference({ '--export': path }), /plan export is malformed/);
  });

  test('refuses an existing output file and keeps its bytes', async () => {
    writeFileSync(join(output, 'tasks.json'), 'occupied');
    const run = await planReference();

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toMatch(/EEXIST/);
    expect(readFileSync(join(output, 'tasks.json'), 'utf8')).toBe('occupied');
    expect(readdirSync(output)).toEqual(['tasks.json']);
  });

  test('removes its own first file when the second is occupied', async () => {
    writeFileSync(join(output, 'plan-reference.json'), 'occupied');
    const run = await planReference();

    expect(run.exitCode).toBe(1);
    expect(readdirSync(output)).toEqual(['plan-reference.json']);
    expect(readFileSync(join(output, 'plan-reference.json'), 'utf8')).toBe('occupied');
  });

  test('refuses a missing export and names it, through the real entrypoint', () => {
    const path = join(scratch.path, 'absent.json');
    expectRefusal(
      runTwin(planReferenceArgv({ '--export': path })),
      new RegExp(`plan export is missing: ${path}`),
    );
  });

  test('refuses an unreadable export and names it', async () => {
    requireNonRoot();
    const path = join(scratch.path, 'locked.json');
    writeFileSync(path, FIXTURE_BYTES);
    chmodSync(path, 0o000);
    expectRefusal(
      await planReference({ '--export': path }),
      new RegExp(`plan export is unreadable: ${path}`),
    );
    expectRefusal(
      await planReference({ '--export': scratch.path }),
      new RegExp(`plan export is unreadable: ${scratch.path}`),
    );
  });

  test('refuses a malformed export and names it', async () => {
    const path = join(scratch.path, 'broken.json');
    writeFileSync(path, '{"document":');
    expectRefusal(
      await planReference({ '--export': path }),
      new RegExp(`plan export is malformed: ${path} is not JSON`),
    );
  });

  test('refuses a missing, unreadable or malformed requirements file', async () => {
    const absent = join(scratch.path, 'absent.md');
    expectRefusal(
      await planReference({ '--requirements': absent }),
      new RegExp(`requirements file is missing: ${absent}`),
    );
    expectRefusal(
      await planReference({ '--requirements': scratch.path }),
      new RegExp(`requirements file is unreadable: ${scratch.path}`),
    );
    writeFileSync(requirements, '');
    expectRefusal(await planReference(), /requirements file is malformed: .* is empty/);
    writeFileSync(requirements, Uint8Array.from([0xc3, 0x28]));
    expectRefusal(await planReference(), /requirements file is malformed: .* is not UTF-8/);
  });

  test('refuses a plan reference that would not decode, before writing', async () => {
    expectRefusal(await planReference({ '--planning-commit': 'abc123' }), /planningCommit/);
    expectRefusal(await planReference({ '--change': 'Not A Change' }), /change/);
  });
});
