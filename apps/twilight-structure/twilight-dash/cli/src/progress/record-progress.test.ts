import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  canonicalJson,
  digestOf,
  digestWithout,
  type ProgressReceiptRecord,
} from '@twilight-burokrat/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';

import { runDash } from '../cli';

const navigatorRoot = join(import.meta.dir, '../../../../twilight-navigator/cli/src');
const burokrat = join(import.meta.dir, '../../../../twilight-burokrat/cli/src/cli.ts');
const entrypoint = join(import.meta.dir, '../entrypoint.ts');
let exportsRoot: string;
let directory: string;
let reference: Record<string, unknown>;
let tasks: {
  schemaVersion: number;
  plan: string;
  steps: { id: string; code: string }[];
  tasks: Record<string, unknown>[];
};
let entries: Record<string, unknown>[];
let referencePath: string;
let tasksPath: string;
let entriesPath: string;
let output: string;

function invokeCli(path: string, argv: string[], preload?: string) {
  const child = Bun.spawnSync({
    cmd: [process.execPath, ...(preload ? ['--preload', preload] : []), path, ...argv],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: child.exitCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  };
}
function buildFlags(overrides: Record<string, string> = {}) {
  return Object.entries({
    '--entries': entriesPath,
    '--plan-reference': referencePath,
    '--tasks': tasksPath,
    '--output': output,
    ...overrides,
  }).flat();
}
function invokeDash(argv = buildFlags(), preload?: string) {
  return invokeCli(entrypoint, ['record-progress', ...argv], preload);
}
function writeInputs(redigest = false) {
  if (redigest) {
    reference['tasksDigest'] = digestOf(tasks);
    reference['referenceDigest'] = digestWithout(reference, 'referenceDigest');
  }
  writeFileSync(referencePath, JSON.stringify(reference));
  writeFileSync(tasksPath, JSON.stringify(tasks));
  writeFileSync(entriesPath, JSON.stringify(entries));
}
function loadFixture(version = 9) {
  referencePath = join(directory, 'reference.json');
  tasksPath = join(directory, 'tasks.json');
  entriesPath = join(directory, 'entries.json');
  output = join(directory, 'receipt.json');
  reference = JSON.parse(
    readFileSync(
      join(exportsRoot, String(version === 6 ? 7 : version), 'plan-reference.json'),
      'utf8',
    ),
  ) as Record<string, unknown>;
  tasks = JSON.parse(
    readFileSync(join(exportsRoot, String(version === 6 ? 7 : version), 'tasks.json'), 'utf8'),
  ) as typeof tasks;
  entries = [
    {
      taskId: tasks.tasks[0]['id'],
      stepCode: tasks.steps[0].code,
      status: 'done',
      observedAt: '2026-10-11T10:05:00.000Z',
      evidence: 'does-not-exist/verify.md',
      measures: { hours_actual: 0, token_actual: 0 },
    },
    {
      taskId: tasks.tasks[0]['id'],
      stepCode: tasks.steps[0].code,
      status: 'in_progress',
      observedAt: '2026-10-11T10:00:00.000Z',
      evidence: { kind: 'external', authority: 'ci' },
    },
  ];
  if (version === 6) reference['planDocumentVersion'] = 6;
  writeInputs(version === 6);
}
function expectRefusal(diagnostic: string, preload?: string) {
  const invocation = invokeDash(buildFlags(), preload);
  expect(invocation.exitCode, invocation.stderr).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain(diagnostic);
  expect(invocation.stderr.trim().split('\n')).toHaveLength(1);
  expect(existsSync(output)).toBe(false);
  return invocation;
}
beforeAll(() => {
  exportsRoot = mkdtempSync(join(tmpdir(), 'dash-exports-'));
  const requirements = join(exportsRoot, 'requirements.md');
  writeFileSync(requirements, 'Requirements\n');
  for (const version of [7, 8, 9]) {
    const destination = join(exportsRoot, String(version));
    mkdirSync(destination);
    const invocation = invokeCli(join(navigatorRoot, 'entrypoint.ts'), [
      'plan-reference',
      '--export',
      join(navigatorRoot, 'fixtures', `plan-export.v${String(version)}.json`),
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
      destination,
    ]);
    if (invocation.exitCode !== 0) throw new Error(invocation.stderr);
  }
});
afterAll(() => {
  rmSync(exportsRoot, { recursive: true, force: true });
});
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dash-progress-'));
  loadFixture();
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

for (const version of [6, 7, 8, 9])
  test(`records canonical v1 receipt for reference v${String(version)} without changing inputs`, () => {
    loadFixture(version);
    const paths = [referencePath, tasksPath, entriesPath];
    const before = paths.map((path) => readFileSync(path));
    const invocation = invokeDash(
      version === 9
        ? [
            '--output',
            output,
            '--tasks',
            tasksPath,
            '--plan-reference',
            referencePath,
            '--entries',
            entriesPath,
          ]
        : buildFlags(),
    );
    expect(invocation.exitCode, invocation.stderr).toBe(0);
    expect(invocation.stderr).toBe('');
    const receipt = JSON.parse(readFileSync(output, 'utf8')) as Record<string, unknown>;
    const body = {
      schemaVersion: 1,
      kind: 'progress-receipt',
      planRef: reference['planRef'],
      entries,
    };
    expect(receipt).toEqual({ ...body, receiptDigest: digestOf(body) });
    expect(invocation.stdout).toBe(`${digestOf(body)}\n`);
    expect(readFileSync(output, 'utf8')).toBe(`${canonicalJson(receipt)}\n`);
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(paths.map((path) => readFileSync(path))).toEqual(before);
    expect(readdirSync(directory).sort()).toEqual([
      'entries.json',
      'receipt.json',
      'reference.json',
      'tasks.json',
    ]);
    const second = join(directory, 'second.json');
    writeFileSync(
      referencePath,
      JSON.stringify(Object.fromEntries(Object.entries(reference).reverse()), null, 2),
    );
    expect(invokeDash(buildFlags({ '--output': second })).stdout).toBe(invocation.stdout);
    expect(readFileSync(second)).toEqual(readFileSync(output));
  });

test('production consumers retain sequential commands and bounded consistency for v9 blockages', () => {
  expect(invokeDash().exitCode).toBe(0);
  const validation = invokeCli(burokrat, [
    'validate-progress-receipt',
    output,
    referencePath,
    tasksPath,
  ]);
  expect(validation.exitCode, validation.stderr).toBe(0);
  expect(JSON.parse(validation.stdout)).toEqual({
    schemaVersion: 1,
    scope: 'progress-receipt-consistency',
    receiptDigest: (JSON.parse(readFileSync(output, 'utf8')) as ProgressReceiptRecord)
      .receiptDigest,
    referenceDigest: reference['referenceDigest'],
    tasksDigest: reference['tasksDigest'],
    plan: tasks.plan,
    entryCount: 2,
  });
  const batch = join(directory, 'batch.json');
  const converted = invokeCli(join(navigatorRoot, 'entrypoint.ts'), [
    'receipt-to-commands',
    '--receipt',
    output,
    '--plan-reference',
    referencePath,
    '--tasks',
    tasksPath,
    '--output',
    batch,
  ]);
  expect(converted.exitCode, converted.stderr).toBe(0);
  expect(JSON.parse(readFileSync(batch, 'utf8'))).toEqual({
    id: tasks.plan,
    commands: [
      {
        kind: 'setProgress',
        workItemId: entries[0]['taskId'],
        stepId: tasks.steps[0].id,
        state: 'done',
      },
      {
        kind: 'setMeasure',
        workItemId: entries[0]['taskId'],
        stepId: tasks.steps[0].id,
        metric: 'token_actual',
        value: 0,
      },
      {
        kind: 'setMeasure',
        workItemId: entries[0]['taskId'],
        stepId: tasks.steps[0].id,
        metric: 'hours_actual',
        value: 0,
      },
      {
        kind: 'setProgress',
        workItemId: entries[1]['taskId'],
        stepId: tasks.steps[0].id,
        state: 'in_progress',
      },
    ],
  });
});

for (const name of [
  'unknown',
  'repeated',
  'missing',
  'valueless',
  'empty',
  'positional',
  'flagAsValue',
])
  test(`invocation ${name} refuses before reading`, () => {
    const complete = buildFlags({
      '--entries': '/absent/entries',
      '--plan-reference': '/absent/reference',
      '--tasks': '/absent/tasks',
    });
    const argv =
      name === 'missing'
        ? []
        : name === 'unknown'
          ? [...complete, '--unknown', 'x']
          : name === 'repeated'
            ? [...complete, '--entries', 'y']
            : name === 'positional'
              ? [...complete, 'operand', 'x']
              : [
                  ...complete.slice(0, -1),
                  ...(name === 'valueless' ? [] : [name === 'empty' ? '' : '--tasks']),
                ];
    const invocation = invokeDash(argv);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('usage: dash record-progress');
    expect(invocation.stderr).not.toContain('missing:');
    expect(existsSync(output)).toBe(false);
  });
for (const fault of [
  'empty',
  'object',
  'extra',
  'missing',
  'status',
  'measure',
  'time',
  'evidence',
  'evidenceExtra',
])
  test(`refuses malformed entries ${fault}`, () => {
    if (fault === 'empty') entries = [];
    if (fault === 'extra') entries[0]['extra'] = 'SECRET';
    if (fault === 'missing') delete entries[0]['status'];
    if (fault === 'status') entries[0]['status'] = 'ready';
    if (fault === 'measure') entries[0]['measures'] = { token_actual: -1 };
    if (fault === 'time') entries[0]['observedAt'] = 'SECRET';
    if (fault === 'evidence') entries[0]['evidence'] = '../SECRET';
    if (fault === 'evidenceExtra')
      entries[0]['evidence'] = { kind: 'external', authority: 'ci', extra: 'SECRET' };
    writeInputs();
    if (fault === 'object') writeFileSync(entriesPath, '{}');
    expect(expectRefusal('progress receipt is malformed').stderr).not.toContain('SECRET');
  });
for (const fault of [
  'referenceDigest',
  'tasksDigest',
  'plan',
  'count',
  'duplicateTask',
  'duplicateStepId',
  'duplicateStepCode',
  'v6schema2',
  'v7schema2',
  'v8schema1',
  'v9schema1',
  'v10',
  'unknownTask',
  'parentTask',
  'unknownStep',
  'referenceExtra',
  'tasksExtra',
])
  test(`refuses planning fault ${fault}`, () => {
    if (fault === 'v8schema1' || fault === 'v9schema1') loadFixture(7);
    if (fault === 'plan') tasks.plan = 'another';
    if (fault === 'count') reference['taskCount'] = 99;
    if (fault === 'duplicateTask') {
      tasks.tasks.push(tasks.tasks[0]);
      reference['taskCount'] = tasks.tasks.length;
    }
    if (fault === 'duplicateStepId') tasks.steps.push({ ...tasks.steps[0], code: 'other' });
    if (fault === 'duplicateStepCode') tasks.steps.push({ ...tasks.steps[0], id: 'other' });
    if (fault.startsWith('v'))
      reference['planDocumentVersion'] = Number(/^v(\d+)/.exec(fault)?.[1]);
    if (fault === 'unknownTask') entries[0]['taskId'] = 'absent';
    if (fault === 'parentTask') entries[0]['taskId'] = '00000000-0000-4000-8000-000000000004';
    if (fault === 'unknownStep') entries[0]['stepCode'] = 'absent';
    if (fault === 'referenceExtra') reference['extra'] = true;
    if (fault === 'tasksExtra') Object.assign(tasks, { extra: true });
    writeInputs(true);
    if (fault === 'referenceDigest') {
      reference['taskCount'] = 99;
      writeInputs();
    }
    if (fault === 'tasksDigest') {
      tasks.tasks[0]['name'] = 'changed';
      writeInputs();
    }
    expectRefusal(
      fault === 'referenceDigest' || fault === 'v10' || fault === 'referenceExtra'
        ? 'plan reference is malformed'
        : fault === 'tasksExtra'
          ? 'task export is malformed'
          : 'progress inputs are inconsistent',
    );
  });
test('consistency diagnostics never expose untrusted step text or newline', () => {
  entries[0]['stepCode'] = 'SECRET\nforged line';
  writeInputs();
  expect(expectRefusal('progress inputs are inconsistent').stderr).not.toContain('SECRET');
});
for (const role of ['entries', 'plan reference', 'task export'])
  for (const fault of ['missing', 'unreadable', 'empty', 'json', 'utf8'])
    test(`${role} input ${fault} refuses safely`, () => {
      const path =
        role === 'entries' ? entriesPath : role === 'plan reference' ? referencePath : tasksPath;
      if (fault === 'missing') rmSync(path);
      if (fault === 'unreadable') {
        if (process.getuid?.() === 0) throw new Error('permission proof requires non-root');
        chmodSync(path, 0);
      }
      if (fault === 'empty') writeFileSync(path, '');
      if (fault === 'json') writeFileSync(path, '{SECRET');
      // Replacement decoding could turn the byte into valid text; fatal UTF-8 must refuse it.
      if (fault === 'utf8')
        writeFileSync(
          path,
          Buffer.concat([Buffer.from('"'), Buffer.from([255]), Buffer.from('"')]),
        );
      try {
        expect(
          expectRefusal(
            `${role} is ${fault === 'missing' ? 'missing' : fault === 'unreadable' ? 'unreadable' : 'malformed'}`,
          ).stderr,
        ).not.toContain('SECRET');
      } finally {
        if (fault === 'unreadable') chmodSync(path, 0o600);
      }
    });
for (const occupied of ['file', 'directory', 'symlink', 'input'])
  test(`exclusive output preserves existing ${occupied}`, () => {
    if (occupied === 'file') writeFileSync(output, 'occupied');
    if (occupied === 'directory') mkdirSync(output);
    if (occupied === 'symlink') symlinkSync(entriesPath, output);
    if (occupied === 'input') output = entriesPath;
    const before = readFileSync(entriesPath);
    const invocation = invokeDash();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('cannot create progress receipt');
    expect(readFileSync(entriesPath)).toEqual(before);
    if (occupied === 'file') expect(readFileSync(output, 'utf8')).toBe('occupied');
  });
for (const fault of ['absent', 'unwritable'])
  test(`output parent ${fault} refuses`, () => {
    const parent = join(directory, 'parent');
    output = join(parent, 'receipt.json');
    if (fault === 'unwritable') {
      if (process.getuid?.() === 0) throw new Error('permission proof requires non-root');
      mkdirSync(parent, 0o500);
    }
    try {
      expectRefusal('cannot create progress receipt');
    } finally {
      if (fault === 'unwritable') chmodSync(parent, 0o700);
    }
  });
for (const fault of ['write', 'close', 'cleanup'])
  test(`publication ${fault} failure remains a refusal`, () => {
    const preload = join(directory, 'fault.ts');
    writeFileSync(
      preload,
      `import * as fs from 'node:fs'; import { mock } from 'bun:test'; mock.module('node:fs', () => ({ ...fs, ${fault === 'close' ? "closeSync(fd) { fs.closeSync(fd); throw new Error('injected close'); }" : "writeFileSync() { throw new Error('injected write'); }"}${fault === 'cleanup' ? ", unlinkSync() { throw new Error('injected cleanup'); }" : ''} }));`,
    );
    if (fault === 'cleanup') {
      const invocation = invokeDash(buildFlags(), preload);
      expect(invocation.exitCode).toBe(1);
      expect(invocation.stdout).toBe('');
      expect(invocation.stderr).toContain('cleanup failed');
      expect(existsSync(output)).toBe(true);
    } else expectRefusal('cannot publish progress receipt', preload);
  });
test('dispatcher uses no clocks or fleet planner', async () => {
  let stdout = '';
  const forbidden = () => {
    throw new Error('forbidden dependency');
  };
  await runDash(['record-progress', ...buildFlags()], {
    clock: { read: forbidden },
    monotonic: { now: forbidden },
    planEnrollment: forbidden,
    stdout: {
      write(text) {
        stdout += text;
      },
    },
  });
  expect(stdout).toBe(
    `${(JSON.parse(readFileSync(output, 'utf8')) as ProgressReceiptRecord).receiptDigest}\n`,
  );
});

// Proof: injected Date.now, fetch, Bun.spawnSync and a statically imported SQLite constructor
// independently failed this production entrypoint test (2026-10-15).
test('production recording refuses clock, network, subprocess and authority effects through canaries', () => {
  const preload = join(directory, 'canary.ts');
  writeFileSync(
    preload,
    `import * as sqlite from 'bun:sqlite'; import * as child from 'node:child_process'; import { mock } from 'bun:test';
const forbidden = () => { throw new Error('forbidden producer effect'); };
mock.module('bun:sqlite', () => ({ ...sqlite, Database: new Proxy(sqlite.Database, { construct: forbidden }) }));
mock.module('node:child_process', () => ({ ...child, execSync: forbidden, spawnSync: forbidden, spawn: forbidden, exec: forbidden, execFile: forbidden }));
Date.now = forbidden; globalThis.fetch = forbidden; Bun.spawn = forbidden; Bun.spawnSync = forbidden;
`,
  );
  const invocation = invokeDash(buildFlags(), preload);
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  expect(invocation.stderr).toBe('');
});

test('record-progress-v2 explicitly binds the complete producer reference', () => {
  const invocation = invokeCli(entrypoint, ['record-progress-v2', ...buildFlags()]);
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  const receipt = JSON.parse(readFileSync(output, 'utf8')) as Record<string, unknown>;
  expect(receipt['schemaVersion']).toBe(2);
  expect(receipt['referenceDigest']).toBe(reference['referenceDigest']);
  expect(receipt['receiptDigest']).toBe(digestWithout(receipt, 'receiptDigest'));
  const proposed = join(directory, 'batch.json');
  const admission = invokeCli(join(navigatorRoot, 'entrypoint.ts'), [
    'admit-progress',
    '--receipt',
    output,
    '--plan-reference',
    referencePath,
    '--tasks',
    tasksPath,
    '--accepted-reference',
    referencePath,
    '--output',
    proposed,
  ]);
  expect(admission.exitCode, admission.stderr).toBe(0);
  expect(existsSync(proposed)).toBe(true);
});
