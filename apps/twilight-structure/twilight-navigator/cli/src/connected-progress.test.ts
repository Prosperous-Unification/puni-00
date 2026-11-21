import { closeSync, openSync } from 'node:fs';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  digestOf,
  PlanReferenceRecord,
  PlanTasks,
  ProgressReceiptRecord,
} from '@twilight-burokrat/contracts';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { currentExportFixture } from './testing/current-export-fixtures';
import { readExportFixture as fixture } from './testing/export-fixtures';
import { runTwin, runTwinInProcess, scratchDirectory } from './testing/run-twin';
let scratch: ReturnType<typeof scratchDirectory>;
beforeEach(() => {
  scratch = scratchDirectory();
  writeFileSync(join(scratch.path, 'requirements.md'), 'Requirements\n');
});
afterEach(() => {
  scratch.remove();
});
async function project(body: unknown, name: string) {
  const path = join(scratch.path, name + '.json');
  writeFileSync(path, JSON.stringify(body));
  const output = join(scratch.path, name);
  mkdirSync(output);
  const invocation = await runTwinInProcess([
    'plan-reference',
    '--export',
    path,
    '--repository',
    'repo',
    '--change',
    'change',
    '--planning-commit',
    '1'.repeat(40),
    '--source-base',
    '2'.repeat(40),
    '--requirements',
    join(scratch.path, 'requirements.md'),
    '--output',
    output,
  ]);
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  return {
    referencePath: join(output, 'plan-reference.json'),
    tasksPath: join(output, 'tasks.json'),
    tasks: PlanTasks.assert(JSON.parse(readFileSync(join(output, 'tasks.json'), 'utf8'))),
    reference: PlanReferenceRecord.assert(
      JSON.parse(readFileSync(join(output, 'plan-reference.json'), 'utf8')),
    ),
  };
}
function entry(tasks: PlanTasks, taskId = tasks.tasks[0].id) {
  return {
    taskId,
    stepCode: tasks.steps[0].code,
    status: 'done',
    observedAt: '2026-11-11T01:00:00.000Z',
    evidence: 'verify.md',
    measures: { token_actual: 7, hours_actual: 2 },
  };
}
function writeReceipt(
  reference: PlanReferenceRecord,
  tasks: PlanTasks,
  schemaVersion = 2,
  taskId?: string,
) {
  const body = {
    schemaVersion,
    kind: 'progress-receipt',
    planRef: reference.planRef,
    ...(schemaVersion === 2 ? { referenceDigest: reference.referenceDigest } : {}),
    entries: [entry(tasks, taskId)],
  };
  const path = join(scratch.path, 'receipt-' + String(Math.random()) + '.json');
  writeFileSync(path, JSON.stringify({ ...body, receiptDigest: digestOf(body) }));
  return path;
}
function convert(
  receipt: string,
  projection: Awaited<ReturnType<typeof project>>,
  output: string,
  accepted?: string,
) {
  return runTwinInProcess([
    accepted === undefined ? 'receipt-to-commands' : 'admit-progress',
    '--receipt',
    receipt,
    '--plan-reference',
    projection.referencePath,
    '--tasks',
    projection.tasksPath,
    ...(accepted === undefined ? [] : ['--accepted-reference', accepted]),
    '--output',
    output,
  ]);
}
let invocationOrdinal = 0;
/** Native CLI channel captures are separate files; only the outer run's shared FD claims chronology. */
async function invokeNative(tool: 'dash' | 'burokrat', argv: string[]) {
  const stem = join(scratch.path, 'native-' + String(invocationOrdinal++));
  const stdout = openSync(stem + '.stdout', 'wx', 0o600);
  const stderr = openSync(stem + '.stderr', 'wx', 0o600);
  const program =
    tool === 'dash'
      ? join(import.meta.dir, '../../../twilight-dash/cli/src/entrypoint.ts')
      : join(import.meta.dir, '../../../twilight-burokrat/cli/src/cli.ts');
  const child = Bun.spawn({ cmd: [process.execPath, program, ...argv], stdout, stderr });
  try {
    const exitCode = await child.exited;
    return {
      exitCode,
      stdout: readFileSync(stem + '.stdout', 'utf8'),
      stderr: readFileSync(stem + '.stderr', 'utf8'),
    };
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await child.exited;
    }
    closeSync(stdout);
    closeSync(stderr);
  }
}
test.each([12, 13, 14, 15, 16] as const)(
  'document%i Dash bound receipt validates in Burokrat and proposes local commands',
  async (version) => {
    const body =
      version === 15 || version === 16 ? await currentExportFixture(version) : fixture(version);
    const projection = await project(body, 'selected');
    const entries = join(scratch.path, 'entries.json');
    writeFileSync(entries, JSON.stringify([entry(projection.tasks)]));
    const receiptPath = join(scratch.path, 'dash-receipt.json');
    const dash = await invokeNative('dash', [
      'record-progress-v2',
      '--entries',
      entries,
      '--plan-reference',
      projection.referencePath,
      '--tasks',
      projection.tasksPath,
      '--output',
      receiptPath,
    ]);
    expect(dash.exitCode, dash.stderr).toBe(0);
    const receipt = ProgressReceiptRecord.assert(JSON.parse(readFileSync(receiptPath, 'utf8')));
    expect(receipt.schemaVersion).toBe(2);
    expect(receipt).toHaveProperty('referenceDigest', projection.reference.referenceDigest);
    expect(dash.stdout).toBe(receipt.receiptDigest + '\n');
    const checked = await invokeNative('burokrat', [
      'validate-progress-receipt',
      receiptPath,
      projection.referencePath,
      projection.tasksPath,
    ]);
    expect(checked.exitCode, checked.stderr).toBe(0);
    for (const mode of ['convert', 'admit']) {
      const output = join(scratch.path, mode + '.json');
      const invocation = await convert(
        receiptPath,
        projection,
        output,
        mode === 'admit' ? projection.referencePath : undefined,
      );
      expect(invocation.exitCode, invocation.stderr).toBe(0);
      const batch = JSON.parse(readFileSync(output, 'utf8')) as {
        id: string;
        commands: Record<string, unknown>[];
      };
      expect(batch).toEqual({
        id: projection.tasks.plan,
        commands: [
          {
            kind: 'setProgress',
            workItemId: projection.tasks.tasks[0].id,
            stepId: projection.tasks.steps[0].id,
            state: 'done',
          },
          {
            kind: 'setMeasure',
            workItemId: projection.tasks.tasks[0].id,
            stepId: projection.tasks.steps[0].id,
            metric: 'token_actual',
            value: 7,
          },
          {
            kind: 'setMeasure',
            workItemId: projection.tasks.tasks[0].id,
            stepId: projection.tasks.steps[0].id,
            metric: 'hours_actual',
            value: 2,
          },
        ],
      });
      expect(statSync(output).mode & 0o777).toBe(0o600);
      if (version === 15 || version === 16) {
        expect(batch.id).toBe('C');
        expect(batch.id).not.toBe('captured-parent');
      }
    }
  },
);
test.each([12, 14] as const)(
  'connected%i external-only receipt refuses; a cross-owner collision denotes the local leaf',
  async (version) => {
    const body = fixture(version);
    const external = body.typedDependencies[0].predecessor;
    external.workItemId = 'external-only';
    const projection = await project(body, 'external');
    const badReceipt = writeReceipt(projection.reference, projection.tasks, 2, 'external-only');
    const badOutput = join(scratch.path, 'bad.json');
    const refused = await convert(badReceipt, projection, badOutput);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('absent from the plan');
    expect(existsSync(badOutput)).toBe(false);
    external.workItemId = projection.tasks.tasks[0].id;
    const collision = await project(body, 'collision');
    const receipt = writeReceipt(collision.reference, collision.tasks);
    const output = join(scratch.path, 'local.json');
    expect((await convert(receipt, collision, output)).exitCode).toBe(0);
    const batch = JSON.parse(readFileSync(output, 'utf8')) as {
      id: string;
      commands: Record<string, unknown>[];
    };
    expect(batch.id).toBe(collision.tasks.plan);
    expect(batch.id).not.toBe(external[version === 12 ? 'projectId' : 'workPackageId']);
    expect(
      batch.commands.every(
        (command: Record<string, unknown>) =>
          command['workItemId'] === collision.tasks.tasks[0].id &&
          !('workPackageId' in command) &&
          !('projectId' in command),
      ),
    ).toBe(true);
  },
);
for (const version of [12, 14] as const)
  test.each(['owner', 'edge', 'display', 'history'])(
    'connected' +
      String(version) +
      ' old bound receipt refuses changed %s even with unchanged PlanRef',
    async (fault) => {
      const body = fixture(version);
      const first = await project(body, 'first');
      const receipt = writeReceipt(first.reference, first.tasks);
      if (fault === 'owner')
        body.typedDependencies[0].predecessor[version === 12 ? 'projectId' : 'workPackageId'] =
          'changed-owner';
      if (fault === 'edge') body.typedDependencies[0].type = 'FF';
      if (fault === 'display')
        body.typedDependencies[0].predecessor.display.workItemName = 'changed label';
      if (fault === 'history')
        body.connected[version === 12 ? 'projects' : 'workPackages'][0].revision += 1;
      const second = await project(body, 'second');
      expect(first.reference.planRef).toEqual(second.reference.planRef);
      expect(first.reference.referenceDigest).not.toBe(second.reference.referenceDigest);
      if (fault === 'history')
        expect(first.reference.tasksDigest).toBe(second.reference.tasksDigest);
      else expect(first.reference.tasksDigest).not.toBe(second.reference.tasksDigest);
      for (const [mode, producer, accepted] of [
        ['convert', second, undefined],
        ['producer', second, second.referencePath],
        ['selected', first, second.referencePath],
      ] as const) {
        const output = join(scratch.path, mode + '.json');
        const refused = await convert(receipt, producer, output, accepted);
        expect(refused.exitCode, `receipt mode=${mode}; stderr=${refused.stderr}`).toBe(1);
        expect(existsSync(output)).toBe(false);
      }
      const checked = await invokeNative('burokrat', [
        'validate-progress-receipt',
        receipt,
        second.referencePath,
        second.tasksPath,
      ]);
      expect(checked.exitCode).toBe(1);
    },
  );
test('schema1 connected conversion keeps historical limitation and admission refuses', async () => {
  const first = await project(fixture(14), 'first');
  const receipt = writeReceipt(first.reference, first.tasks, 1);
  const changed = fixture(14);
  changed.connected.mode = changed.connected.mode === 'shared' ? 'isolated' : 'shared';
  const second = await project(changed, 'second');
  const output = join(scratch.path, 'legacy.json');
  expect((await convert(receipt, second, output)).exitCode).toBe(0);
  const admitted = join(scratch.path, 'admit.json');
  const refused = await convert(receipt, first, admitted, first.referencePath);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('bound schema 2');
  expect(existsSync(admitted)).toBe(false);
});

test('native schema3 bound conversion and admission publish only the selected local batch', async () => {
  const projection = await project(fixture(14), 'native');
  const receipt = writeReceipt(projection.reference, projection.tasks);
  for (const command of ['receipt-to-commands', 'admit-progress']) {
    const output = join(scratch.path, command + '.json');
    const invocation = runTwin([
      command,
      '--receipt',
      receipt,
      '--plan-reference',
      projection.referencePath,
      '--tasks',
      projection.tasksPath,
      ...(command === 'admit-progress' ? ['--accepted-reference', projection.referencePath] : []),
      '--output',
      output,
    ]);
    expect(invocation.exitCode, invocation.stderr).toBe(0);
    const batch = JSON.parse(readFileSync(output, 'utf8')) as {
      id: string;
      commands: { workItemId: string }[];
    };
    expect(batch.id).toBe('C');
    expect(batch.commands.every((command) => command.workItemId === 'c')).toBe(true);
  }
});

async function recordBoundReceipt(projection: Awaited<ReturnType<typeof project>>, stem: string) {
  const entriesPath = join(scratch.path, stem + '-entries.json');
  const receiptPath = join(scratch.path, stem + '-receipt.json');
  writeFileSync(entriesPath, JSON.stringify([entry(projection.tasks)]));
  const run = await invokeNative('dash', [
    'record-progress-v2',
    '--entries',
    entriesPath,
    '--plan-reference',
    projection.referencePath,
    '--tasks',
    projection.tasksPath,
    '--output',
    receiptPath,
  ]);
  expect(run.exitCode, run.stderr).toBe(0);
  const receipt = ProgressReceiptRecord.assert(JSON.parse(readFileSync(receiptPath, 'utf8')));
  expect(receipt.schemaVersion).toBe(2);
  expect(receipt).toHaveProperty('referenceDigest', projection.reference.referenceDigest);
  return receiptPath;
}

for (const version of [15, 16] as const)
  test.each(['parent identity', 'parent name'] as const)(
    `current${String(version)} actual bound receipt refuses changed %s with identical tasks`,
    async (fault) => {
      const body = await currentExportFixture(version);
      const first = await project(body, 'first');
      const receipt = await recordBoundReceipt(first, 'original');
      const changed = structuredClone(body);
      if (fault === 'parent identity') {
        changed.project.id = 'replacement-parent';
        changed.workPackage.projectId = 'replacement-parent';
      } else changed.project.name = 'Replacement parent label';
      const second = await project(changed, 'second');
      expect(first.reference.planRef).toEqual(second.reference.planRef);
      expect(first.tasks).toEqual(second.tasks);
      expect(first.reference.tasksDigest).toBe(second.reference.tasksDigest);
      expect(first.reference.exportDigest).not.toBe(second.reference.exportDigest);
      expect(first.reference.referenceDigest).not.toBe(second.reference.referenceDigest);
      for (const [mode, producer, accepted] of [
        ['convert', second, undefined],
        ['producer', second, second.referencePath],
        ['selected', first, second.referencePath],
      ] as const) {
        const output = join(scratch.path, mode + '.json');
        const refused = await convert(receipt, producer, output, accepted);
        expect(refused.exitCode, refused.stderr).toBe(1);
        expect(existsSync(output)).toBe(false);
      }
      const checked = await invokeNative('burokrat', [
        'validate-progress-receipt',
        receipt,
        second.referencePath,
        second.tasksPath,
      ]);
      expect(checked.exitCode).toBe(1);
    },
  );

test('current16 history-only replacement invalidates an actual bound receipt while tasks remain equal', async () => {
  const body = await currentExportFixture(16);
  if (!('connected' in body)) throw new Error('constructed connected16 evidence absent');
  const first = await project(body, 'first');
  const receipt = await recordBoundReceipt(first, 'original');
  const member = body.connected.workPackages.at(0);
  if (member === undefined) throw new Error('constructed connected member absent');
  member.revision += 1;
  const second = await project(body, 'second');
  expect(first.tasks).toEqual(second.tasks);
  expect(first.reference.tasksDigest).toBe(second.reference.tasksDigest);
  expect(first.reference.exportDigest).not.toBe(second.reference.exportDigest);
  expect(first.reference.referenceDigest).not.toBe(second.reference.referenceDigest);
  for (const [mode, producer, accepted] of [
    ['convert', second, undefined],
    ['producer', second, second.referencePath],
    ['selected', first, second.referencePath],
  ] as const) {
    const output = join(scratch.path, mode + '.json');
    const refused = await convert(receipt, producer, output, accepted);
    expect(refused.exitCode, refused.stderr).toBe(1);
    expect(existsSync(output)).toBe(false);
  }
});

test('current16 external-only target refuses and a colliding ID still commands the local package', async () => {
  const body = await currentExportFixture(16);
  const predecessor = body.typedDependencies.at(0)?.predecessor;
  if (predecessor === undefined || !('kind' in predecessor) || predecessor.kind !== 'external')
    throw new Error('constructed external dependency absent');
  predecessor.workItemId = 'external-only';
  const first = await project(body, 'external');
  const externalReceipt = writeReceipt(first.reference, first.tasks, 2, 'external-only');
  const badOutput = join(scratch.path, 'external-batch.json');
  const refused = await convert(externalReceipt, first, badOutput);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('absent from the plan');
  expect(existsSync(badOutput)).toBe(false);
  predecessor.workItemId = 'c';
  const local = await project(body, 'local');
  const receipt = await recordBoundReceipt(local, 'local');
  const output = join(scratch.path, 'local-batch.json');
  expect((await convert(receipt, local, output, local.referencePath)).exitCode).toBe(0);
  const batch: unknown = JSON.parse(readFileSync(output, 'utf8'));
  expect(batch).toEqual({
    id: 'C',
    commands: [
      { kind: 'setProgress', workItemId: 'c', stepId: 'build', state: 'done' },
      { kind: 'setMeasure', workItemId: 'c', stepId: 'build', metric: 'token_actual', value: 7 },
      { kind: 'setMeasure', workItemId: 'c', stepId: 'build', metric: 'hours_actual', value: 2 },
    ],
  });
  expect(batch).not.toMatchObject({ id: 'captured-parent' });
  expect(batch).not.toMatchObject({ id: predecessor.workPackageId });
});

test.each([15, 16] as const)(
  'current%i keeps schema1 historical conversion and refuses selected admission',
  async (version) => {
    const body = await currentExportFixture(version);
    const first = await project(body, 'legacy-first');
    const receipt = writeReceipt(first.reference, first.tasks, 1);
    body.project.name = 'Changed parent after legacy receipt';
    const second = await project(body, 'legacy-second');
    expect(first.reference.planRef).toEqual(second.reference.planRef);
    expect(first.tasks).toEqual(second.tasks);
    const output = join(scratch.path, 'legacy-convert.json');
    const converted = await convert(receipt, second, output);
    expect(converted.exitCode, converted.stderr).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({ id: 'C' });
    const rejectedOutput = join(scratch.path, 'legacy-admit.json');
    const refused = await convert(receipt, first, rejectedOutput, first.referencePath);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('bound schema 2');
    expect(existsSync(rejectedOutput)).toBe(false);
  },
);
