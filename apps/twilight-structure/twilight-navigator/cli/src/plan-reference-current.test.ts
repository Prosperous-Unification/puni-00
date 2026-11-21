import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { digestOf, PlanReferenceRecord, PlanTasks } from '@twilight-burokrat/contracts';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { type ExportFixture, readExportFixture as fixture } from './testing/export-fixtures';
import { runTwin, runTwinInProcess, scratchDirectory } from './testing/run-twin';
let scratch: ReturnType<typeof scratchDirectory>;
beforeEach(() => {
  scratch = scratchDirectory();
  writeFileSync(join(scratch.path, 'requirements.md'), 'Requirements\n');
});
afterEach(() => {
  scratch.remove();
});
async function project(body: ExportFixture, name = 'out') {
  const path = join(scratch.path, name + '.json');
  writeFileSync(path, JSON.stringify(body));
  const output = join(scratch.path, name);
  mkdirSync(output);
  const run = await runTwinInProcess([
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
  return { run, output, path };
}
function readProjection(output: string) {
  return {
    tasks: PlanTasks.assert(JSON.parse(readFileSync(join(output, 'tasks.json'), 'utf8'))),
    reference: PlanReferenceRecord.assert(
      JSON.parse(readFileSync(join(output, 'plan-reference.json'), 'utf8')),
    ),
  };
}
test.each([12, 13, 14] as const)(
  'strict document%i produces local leaves and complete authored document edges',
  async (version) => {
    const body = fixture(version);
    const { run, output, path } = await project(body);
    expect(run.exitCode, run.stderr).toBe(0);
    const { tasks, reference } = readProjection(output);
    expect(tasks.schemaVersion).toBe(3);
    if (tasks.schemaVersion !== 3) throw Error('schema3 required');
    expect(tasks.plan).toBe(version === 12 ? body.project.id : body.workPackage.id);
    expect(reference.planRef.plan).toBe(tasks.plan);
    expect(reference.planDocumentVersion).toBe(version);
    expect(reference.exportDigest).toBe(
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    );
    expect(tasks.tasks.every((task) => !('typedDependencies' in task))).toBe(true);
    expect(tasks.typedDependencies).toHaveLength(body.typedDependencies.length);
    expect(reference.tasksDigest).toBe(digestOf(tasks));
    if (version !== 13) {
      const source = body.typedDependencies[0].predecessor;
      expect(tasks.typedDependencies[0].predecessor).toMatchObject({
        kind: 'external',
        workPackageId: version === 12 ? source.projectId : source.workPackageId,
        workItemId: source.workItemId,
        display: {
          workPackageName:
            version === 12 ? source.display.projectName : source.display.workPackageName,
        },
      });
    }
  },
);
test.each([12, 13, 14] as const)(
  'document%i retains parent successors, all endpoint scopes and authored order',
  async (version) => {
    const body = fixture(version);
    const leaf = body.workItems.at(-1);
    if (leaf === undefined) throw new Error('fixture leaf missing');
    const parent = {
      ...structuredClone(leaf),
      id: 'parent',
      parentId: null,
      name: 'Parent',
      number: 'P',
      estimates: {},
      dependsOn: [],
    };
    leaf.parentId = 'parent';
    body.workItems.unshift(parent);
    Reflect.set(
      body,
      'typedDependencies',
      ['whole', 'node', 'descendant-step'].map((scope, index) => {
        const local = {
          scope,
          workItem: leaf.id,
          ...(scope === 'whole' ? {} : { step: body.steps[0].id }),
        };
        const successor = {
          scope,
          workItem: 'parent',
          ...(scope === 'whole' ? {} : { step: body.steps[0].id }),
        };
        const remote = {
          kind: 'external',
          scope,
          [version === 12 ? 'projectId' : 'workPackageId']: 'remote-owner',
          workItemId: leaf.id,
          ...(scope === 'whole' ? {} : { stepId: 'remote-step' }),
          display: {
            [version === 12 ? 'projectName' : 'workPackageName']: 'Remote',
            abbreviation: 'R',
            workItemName: 'Remote leaf',
            address: 'R.1',
            ...(scope === 'whole' ? {} : { stepName: 'Remote step' }),
          },
        };
        return {
          id: 'edge-' + String(2 - index),
          type: ['FF', 'SS', 'FS'][index],
          predecessor: version === 13 ? local : remote,
          successor: version === 13 ? successor : { kind: 'internal', ...successor },
        };
      }),
    );
    const { run, output } = await project(body);
    expect(run.exitCode, run.stderr).toBe(0);
    const { tasks } = readProjection(output);
    if (tasks.schemaVersion !== 3) throw Error('schema3 required');
    expect(
      tasks.typedDependencies.map((edge) => [
        edge.id,
        edge.type,
        edge.predecessor.scope,
        edge.successor.workItem,
      ]),
    ).toEqual([
      ['edge-2', 'FF', 'whole', 'parent'],
      ['edge-1', 'SS', 'node', 'parent'],
      ['edge-0', 'FS', 'descendant-step', 'parent'],
    ]);
    expect(tasks.tasks.some((task) => task.id === 'parent')).toBe(false);
    if (version === 13)
      expect(tasks.typedDependencies[0].predecessor).toMatchObject({
        kind: 'internal',
        workItem: leaf.id,
      });
    else expect(tasks.typedDependencies[0].predecessor).not.toHaveProperty('workItem');
  },
);
test.each([12, 13, 14] as const)(
  'document%i refuses unknown nested fields before publication',
  async (version) => {
    const body = fixture(version);
    Reflect.set(body.steps[0], 'unexpected', true);
    const { run, output } = await project(body);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('plan export is malformed');
    expect(readdirSync(output)).toEqual([]);
  },
);
for (const version of [12, 14] as const)
  test.each([
    'missing history',
    'mixed owner',
    'mixed display',
    'mixed revision',
    'boundary version',
    'malformed placement',
    'history unknown',
    'missing labels',
  ])('connected' + String(version) + ' refuses %s before publication', async (fault) => {
    const body = fixture(version);
    const pred = body.typedDependencies[0].predecessor;
    if (fault === 'missing history') Reflect.deleteProperty(body, 'connected');
    if (fault === 'mixed owner') pred[version === 12 ? 'workPackageId' : 'projectId'] = 'bad';
    if (fault === 'mixed display')
      pred.display[version === 12 ? 'workPackageName' : 'projectName'] = 'bad';
    if (fault === 'mixed revision')
      body[version === 12 ? 'workPackageRevision' : 'projectRevision'] = 1;
    if (fault === 'boundary version')
      body.connected.placement.stages[0].boundary.version = version === 12 ? 2 : 1;
    if (fault === 'malformed placement')
      Reflect.set(body.connected, 'placement', { kind: 'scheduled' });
    if (fault === 'history unknown') Reflect.set(body.connected, 'extra', true);
    if (fault === 'missing labels') {
      pred.scope = 'node';
      pred.stepId = 'remote-step';
      delete pred.display.stepName;
    }
    const { run, output } = await project(body);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('plan export is malformed');
    expect(readdirSync(output)).toEqual([]);
  });
test('future17 refuses before content validation and publication', async () => {
  const body = fixture(14);
  body.document.version = 17;
  Reflect.set(body, 'workPackage', null);
  const { run, output } = await project(body);
  expect(run.exitCode).toBe(1);
  expect(run.stderr).toContain('has version 17');
  expect(readdirSync(output)).toEqual([]);
});

test.each([12, 13, 14] as const)(
  'document%i blockage facts keep the established boundary',
  async (version) => {
    for (const fault of ['owner', 'parent', 'step', 'duplicate', 'unsafe', 'fractional']) {
      const body = fixture(version);
      const leaf = body.workItems.at(-1);
      if (leaf === undefined) throw new Error('fixture leaf missing');
      const step = body.steps[0];
      body.stepBlockages = [{ workItemId: leaf.id, stepId: step.id, blockedAt: -1 }];
      if (fault === 'owner') body.stepBlockages[0].workItemId = 'absent';
      if (fault === 'parent') {
        const parent = { ...structuredClone(leaf), id: 'parent', parentId: null };
        leaf.parentId = 'parent';
        body.workItems.unshift(parent);
        body.stepBlockages[0].workItemId = 'parent';
      }
      if (fault === 'step') body.stepBlockages[0].stepId = 'absent';
      if (fault === 'duplicate') body.stepBlockages.push({ ...body.stepBlockages[0] });
      if (fault === 'unsafe') body.stepBlockages[0].blockedAt = Number.MAX_SAFE_INTEGER + 1;
      if (fault === 'fractional') body.stepBlockages[0].blockedAt = 0.5;
      const { run, output } = await project(body, fault);
      expect(run.exitCode, `blockage fault=${fault}; stderr=${run.stderr}`).toBe(1);
      expect(run.stderr).toContain('plan export is malformed');
      expect(readdirSync(output)).toEqual([]);
    }
  },
);

for (const version of [12, 13, 14] as const)
  test.each(['missing parent', 'parent cycle', 'step code', 'estimate step'])(
    'document' + String(version) + ' refuses projection %s before writing',
    async (fault) => {
      const body = fixture(version);
      const leaf = body.workItems.at(-1);
      if (leaf === undefined) throw Error('fixture leaf missing');
      if (fault === 'missing parent') leaf.parentId = 'absent';
      if (fault === 'parent cycle') {
        const parent = { ...structuredClone(leaf), id: 'parent', parentId: 'parent' };
        leaf.parentId = 'parent';
        body.workItems.unshift(parent);
      }
      if (fault === 'step code') body.steps.push({ ...body.steps[0], id: 'duplicate-code' });
      if (fault === 'estimate step')
        leaf.estimates['absent'] = { optimistic: 1, realistic: 1, pessimistic: 1 };
      const { run, output } = await project(body);
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toMatch(/missing parent|parent cycle|repeats a step code|unknown step/);
      expect(readdirSync(output)).toEqual([]);
    },
  );

test.each([12, 13, 14] as const)(
  'document%i refuses array in an object-valued estimate dictionary',
  async (version) => {
    const body = fixture(version);
    Reflect.set(body.workItems[0], 'estimates', []);
    const { run, output } = await project(body);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('plan export is malformed');
    expect(readdirSync(output)).toEqual([]);
  },
);

test('native14 entrypoint reads current identity and complete authored edges', () => {
  const output = join(scratch.path, 'native');
  mkdirSync(output);
  const run = runTwin([
    'plan-reference',
    '--export',
    join(import.meta.dir, 'fixtures/plan-export.v14.json'),
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
  expect(run.exitCode, run.stderr).toBe(0);
  const { tasks, reference } = readProjection(output);
  expect(tasks.schemaVersion).toBe(3);
  expect(reference.planRef.plan).toBe('C');
  if (tasks.schemaVersion !== 3) throw Error('schema3 required');
  expect(tasks.typedDependencies[0].predecessor).toMatchObject({
    kind: 'external',
    workPackageId: 'B',
    workItemId: 'b',
  });
});

test.each([12, 13, 14] as const)(
  'document%i retains valid negative blockage facts on a done local leaf',
  async (version) => {
    const body = fixture(version);
    const leaf = body.workItems.at(-1);
    if (leaf === undefined) throw Error('fixture leaf missing');
    const step = body.steps[0];
    leaf.progress[step.id] = 'done';
    body.stepBlockages = [];
    const first = await project(body, 'without-fact');
    expect(first.run.exitCode, first.run.stderr).toBe(0);
    const before = readProjection(first.output);
    body.stepBlockages = [{ workItemId: leaf.id, stepId: step.id, blockedAt: -1 }];
    const second = await project(body, 'retained-fact');
    expect(second.run.exitCode, second.run.stderr).toBe(0);
    const after = readProjection(second.output);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.reference.tasksDigest).toBe(before.reference.tasksDigest);
    expect(after.reference.exportDigest).not.toBe(before.reference.exportDigest);
  },
);
