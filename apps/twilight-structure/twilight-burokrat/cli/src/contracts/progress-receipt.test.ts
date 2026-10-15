import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';

import { invokeCli } from '../invoke-cli';
import { digestOf, digestWithout } from './canonical';

let directory: string;
let reference: Record<string, unknown>;
let tasks: {
  schemaVersion: number;
  plan: string;
  steps: { id: string; code: string; name: string }[];
  tasks: Record<string, unknown>[];
};
let referencePath: string;
let tasksPath: string;
let receiptPath: string;
let receipt: Record<string, unknown>;

let exportsDirectory: string;

beforeAll(() => {
  exportsDirectory = mkdtempSync(join(tmpdir(), 'navigator-exports-'));
  const requirements = join(exportsDirectory, 'requirements.md');
  writeFileSync(requirements, 'Requirements\n');
  for (const version of [7, 8, 9]) {
    const output = join(exportsDirectory, `v${String(version)}`);
    mkdirSync(output);
    const child = Bun.spawnSync({
      cmd: [
        process.execPath,
        join(import.meta.dir, '../../../../twilight-navigator/cli/src/entrypoint.ts'),
        'plan-reference',
        '--export',
        join(
          import.meta.dir,
          '../../../../twilight-navigator/cli/src/fixtures',
          `plan-export.v${String(version)}.json`,
        ),
        '--repository',
        'repo',
        '--change',
        'change',
        '--planning-commit',
        '1'.repeat(40),
        '--source-base',
        '2'.repeat(40),
        '--requirements',
        requirements,
        '--output',
        output,
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0)
      throw new Error(`Navigator fixture generation failed: ${child.stderr.toString()}`);
  }
});
afterAll(() => {
  rmSync(exportsDirectory, { recursive: true, force: true });
});

function generate(version: 7 | 8 | 9 = 8): void {
  const output = join(directory, `v${String(version)}`);
  mkdirSync(output);
  referencePath = join(output, 'plan-reference.json');
  tasksPath = join(output, 'tasks.json');
  writeFileSync(
    referencePath,
    readFileSync(join(exportsDirectory, `v${String(version)}`, 'plan-reference.json')),
  );
  writeFileSync(
    tasksPath,
    readFileSync(join(exportsDirectory, `v${String(version)}`, 'tasks.json')),
  );
  reference = JSON.parse(readFileSync(referencePath, 'utf8')) as typeof reference;
  tasks = JSON.parse(readFileSync(tasksPath, 'utf8')) as typeof tasks;
  receiptPath = join(output, 'receipt.json');
  const body = {
    schemaVersion: 1,
    kind: 'progress-receipt',
    planRef: reference['planRef'],
    entries: [
      {
        taskId: tasks.tasks[0]['id'],
        stepCode: tasks.steps[0].code,
        status: 'done',
        observedAt: '2026-10-11T10:00:00.000Z',
        evidence: 'verify.md',
      },
    ],
  };
  receipt = { ...body, receiptDigest: digestOf(body) };
  writeFileSync(receiptPath, JSON.stringify(receipt));
}

function save(redigest = false): void {
  if (redigest) {
    reference['tasksDigest'] = digestOf(tasks);
    reference['referenceDigest'] = digestWithout(reference, 'referenceDigest');
  }
  writeFileSync(receiptPath, JSON.stringify(receipt));
  writeFileSync(referencePath, JSON.stringify(reference));
  writeFileSync(tasksPath, JSON.stringify(tasks));
}

async function refuse(message: string): Promise<void> {
  const invocation = await invokeCli([
    'validate-progress-receipt',
    receiptPath,
    referencePath,
    tasksPath,
  ]);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain(message);
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'plan-tasks-'));
  generate();
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

for (const version of [7, 8, 9] as const) {
  test(`validates real Navigator v${String(version)} output deterministically`, async () => {
    if (version !== 8) generate(version);
    const argv = ['validate-progress-receipt', receiptPath, referencePath, tasksPath];
    const first = await invokeCli(argv);
    expect(first.exitCode).toBe(0);
    expect(JSON.parse(first.stdout)).toEqual({
      schemaVersion: 1,
      scope: 'progress-receipt-consistency',
      receiptDigest: receipt['receiptDigest'],
      referenceDigest: reference['referenceDigest'],
      tasksDigest: reference['tasksDigest'],
      plan: tasks.plan,
      entryCount: 1,
    });
    expect(await invokeCli(argv)).toEqual(first);
  });
}
test('retains historical v6 reference support', async () => {
  generate(7);
  reference['planDocumentVersion'] = 6;
  save(true);
  expect(
    (await invokeCli(['validate-progress-receipt', receiptPath, referencePath, tasksPath]))
      .exitCode,
  ).toBe(0);
});
test('refuses tampered task values', async () => {
  tasks.tasks[0]['name'] = 'tampered';
  save();
  await refuse('tasksDigest');
});
test('refuses tampered reference values', async () => {
  reference['taskCount'] = 100;
  save();
  await refuse('referenceDigest');
});
test('refuses a re-digested plan mismatch', async () => {
  tasks.plan = 'another';
  save(true);
  await refuse('plan identity');
});
test('refuses a re-digested count mismatch', async () => {
  reference['taskCount'] = 100;
  save(true);
  await refuse('task count');
});
for (const version of [6, 7] as const) {
  test(`refuses schema 2 with reference v${String(version)}`, async () => {
    reference['planDocumentVersion'] = version;
    save(true);
    await refuse('schema pairing');
  });
}
test.each([8, 9])('refuses schema 1 with reference v%s', async (version) => {
  generate(7);
  reference['planDocumentVersion'] = version;
  save(true);
  await refuse('schema pairing');
});
test('refuses duplicate task IDs', async () => {
  tasks.tasks.push(tasks.tasks[0]);
  reference['taskCount'] = tasks.tasks.length;
  save(true);
  await refuse('unique task IDs');
});
test('refuses duplicate step IDs', async () => {
  tasks.steps.push({ ...tasks.steps[0], code: 'other' });
  save(true);
  await refuse('unique step IDs');
});
test('refuses duplicate step codes', async () => {
  tasks.steps.push({ ...tasks.steps[0], id: 'other' });
  save(true);
  await refuse('unique step codes');
});
for (const location of [
  'reference',
  'planRef',
  'tasks',
  'task',
  'step',
  'estimate',
  'dependency',
  'endpoint',
] as const) {
  test(`refuses unknown ${location} keys`, async () => {
    const selected =
      location === 'reference'
        ? reference
        : location === 'planRef'
          ? reference['planRef']
          : location === 'tasks'
            ? tasks
            : location === 'task'
              ? tasks.tasks[0]
              : location === 'step'
                ? tasks.steps[0]
                : location === 'estimate'
                  ? (
                      tasks.tasks.find((task) => (task['estimates'] as unknown[]).length > 0)?.[
                        'estimates'
                      ] as unknown[]
                    )[0]
                  : location === 'dependency'
                    ? (
                        tasks.tasks.find(
                          (task) => (task['typedDependencies'] as unknown[]).length > 0,
                        )?.['typedDependencies'] as unknown[]
                      )[0]
                    : (
                        tasks.tasks.find(
                          (task) => (task['typedDependencies'] as unknown[]).length > 0,
                        )?.['typedDependencies'] as Record<string, unknown>[]
                      )[0]['predecessor'];
    Object.assign(selected as object, { extra: true });
    save(true);
    await refuse('extra');
  });
}
for (const operand of ['receipt', 'reference', 'tasks'] as const) {
  for (const fault of ['missing', 'unreadable', 'malformed', 'utf8'] as const) {
    test(`refuses ${fault} ${operand}`, async () => {
      const path =
        operand === 'receipt' ? receiptPath : operand === 'reference' ? referencePath : tasksPath;
      if (fault === 'missing') rmSync(path);
      if (fault === 'unreadable') {
        if (process.getuid?.() === 0) throw new Error('file-mode proof requires non-root');
        chmodSync(path, 0);
      }
      if (fault === 'malformed') writeFileSync(path, '{');
      if (fault === 'utf8') writeFileSync(path, Buffer.from([255]));
      try {
        await refuse(
          fault === 'utf8'
            ? 'not UTF-8'
            : fault === 'malformed'
              ? 'malformed JSON'
              : 'cannot read JSON',
        );
      } finally {
        if (fault === 'unreadable') chmodSync(path, 0o600);
      }
    });
  }
}
for (const operands of [
  [],
  ['absent'],
  ['absent', 'absent', 'absent', 'extra'],
  ['absent', 'absent'],
  ['', 'absent', 'absent'],
  ['--flag', 'absent', 'absent'],
]) {
  test(`refuses invalid operands ${JSON.stringify(operands)} before reads`, async () => {
    const invocation = await invokeCli(['validate-progress-receipt', ...operands]);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('usage: twib validate-progress-receipt');
  });
}

test('accepts canonical equivalence with different whitespace and key ordering', async () => {
  writeFileSync(
    tasksPath,
    JSON.stringify(Object.fromEntries(Object.entries(tasks).reverse()), null, 4),
  );
  expect(
    (await invokeCli(['validate-progress-receipt', receiptPath, referencePath, tasksPath]))
      .exitCode,
  ).toBe(0);
});

test('the process entrypoint refuses extra operands without reading files', () => {
  const child = Bun.spawnSync({
    cmd: [
      process.execPath,
      join(import.meta.dir, '../cli.ts'),
      'validate-progress-receipt',
      'absent',
      'absent',
      'absent',
      'extra',
    ],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode).toBe(1);
  expect(child.stdout.toString()).toBe('');
  expect(child.stderr.toString()).toContain('usage: twib validate-progress-receipt');
});

for (const field of [
  'repository',
  'plan',
  'change',
  'planningCommit',
  'sourceBaseCommit',
  'requirementsDigest',
] as const) {
  test(`refuses redigested receipt PlanRef mismatch at ${field}`, async () => {
    const planRef = receipt['planRef'] as Record<string, unknown>;
    receipt['planRef'] = {
      ...planRef,
      [field]: field.endsWith('Commit')
        ? '3'.repeat(40)
        : field === 'requirementsDigest'
          ? 'a'.repeat(64)
          : 'another',
    };
    receipt['receiptDigest'] = digestWithout(receipt, 'receiptDigest');
    save();
    await refuse('another plan reference');
  });
}
for (const fault of ['unknown task', 'parent as task', 'unknown step'] as const) {
  test(`refuses ${fault} in a redigested receipt`, async () => {
    const entries = receipt['entries'] as Record<string, unknown>[];
    if (fault === 'unknown step') entries[0]['stepCode'] = 'absent';
    else
      entries[0]['taskId'] =
        fault === 'unknown task' ? 'absent' : '00000000-0000-4000-8000-000000000004';
    receipt['receiptDigest'] = digestWithout(receipt, 'receiptDigest');
    save();
    await refuse(fault === 'unknown step' ? 'names step' : 'names task');
  });
}
test('refuses tampered receipt values', async () => {
  (receipt['entries'] as Record<string, unknown>[])[0]['status'] = 'in_progress';
  save();
  await refuse('receiptDigest');
});
for (const location of ['receipt', 'receipt planRef', 'entry', 'measures', 'evidence'] as const) {
  test(`refuses unknown ${location} keys`, async () => {
    const entry = (receipt['entries'] as Record<string, unknown>[])[0];
    if (location === 'measures') entry['measures'] = { hours_actual: 1, extra: true };
    else if (location === 'evidence')
      entry['evidence'] = { kind: 'external', authority: 'ci', extra: true };
    else if (location === 'entry') entry['extra'] = true;
    else if (location === 'receipt planRef')
      receipt['planRef'] = { ...(receipt['planRef'] as object), extra: true };
    else receipt['extra'] = true;
    receipt['receiptDigest'] = digestWithout(receipt, 'receiptDigest');
    save();
    await refuse('extra');
  });
}
test('refuses plan document v10', async () => {
  reference['planDocumentVersion'] = 10;
  save(true);
  await refuse('planDocumentVersion');
});
