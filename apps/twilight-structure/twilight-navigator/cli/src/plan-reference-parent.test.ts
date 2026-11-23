import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PlanReferenceRecord, PlanTasks } from '@twilight-burokrat/contracts';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { currentExportFixture } from './testing/current-export-fixtures';
import { readExportFixture } from './testing/export-fixtures';
import { runTwinInProcess, scratchDirectory } from './testing/run-twin';

let scratch: ReturnType<typeof scratchDirectory>;
beforeEach(() => {
  scratch = scratchDirectory();
  writeFileSync(join(scratch.path, 'requirements.md'), 'Requirements\n');
});
afterEach(() => {
  scratch.remove();
});
async function project(body: unknown) {
  const path = join(scratch.path, 'export.json');
  writeFileSync(path, JSON.stringify(body));
  const output = join(scratch.path, 'output');
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
  return { run, path, output };
}

test.each([15, 16] as const)(
  'current producer%i selects the package rather than its distinct captured parent',
  async (version) => {
    const body = await currentExportFixture(version);
    expect(body.document.version).toBe(version);
    expect(body.workPackage.id).toBe('C');
    expect(body.project.id).toBe('captured-parent');
    expect(body.workPackage).not.toHaveProperty('ownerId');
    const { run, path, output } = await project(body);
    expect(run.exitCode, run.stderr).toBe(0);
    const tasks = PlanTasks.assert(JSON.parse(readFileSync(join(output, 'tasks.json'), 'utf8')));
    const reference = PlanReferenceRecord.assert(
      JSON.parse(readFileSync(join(output, 'plan-reference.json'), 'utf8')),
    );
    expect(tasks.schemaVersion).toBe(3);
    expect(tasks.plan).toBe('C');
    expect(reference.planRef.plan).toBe('C');
    expect(reference.planDocumentVersion).toBe(version);
    expect(reference.exportDigest).toBe(
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    );
  },
);

test.each([13, 14] as const)(
  'frozen%i still requires its original owner metadata',
  async (version) => {
    const body = readExportFixture(version);
    Reflect.deleteProperty(body.workPackage, 'ownerId');
    const { run, output } = await project(body);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('plan export is malformed');
    expect(readdirSync(output)).toEqual([]);
  },
);

test.each([15, 16] as const)(
  'current producer%i refuses an unknown blockage owner before publication',
  async (version) => {
    const body = await currentExportFixture(version);
    const step = body.steps.at(0);
    const leaf = body.workItems.find(
      (candidate) => !body.workItems.some((child) => child.parentId === candidate.id),
    );
    if (step === undefined || leaf === undefined)
      throw new Error('Current producer must contain a real leaf and step');
    const validFact = { workItemId: leaf.id, stepId: step.id, blockedAt: 1 };
    const unknownOwner = 'missing-current-blockage-owner';
    expect(body.workItems.some((candidate) => candidate.id === unknownOwner)).toBe(false);
    body.stepBlockages = [{ ...validFact, workItemId: unknownOwner }];
    const { run, output } = await project(body);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('plan export is malformed');
    expect(readdirSync(output)).toEqual([]);
  },
);

for (const version of [15, 16] as const)
  test.each([
    'missing parent',
    'missing parent id',
    'missing parent name',
    'missing package parent',
    'parent mismatch',
    'old owner',
    'unknown nested field',
    'wrong connected history',
  ])(`current${String(version)} refuses %s before publication`, async (fault) => {
    const body = await currentExportFixture(version);
    if (fault === 'missing parent') Reflect.deleteProperty(body, 'project');
    if (fault === 'missing parent id') Reflect.deleteProperty(body.project, 'id');
    if (fault === 'missing parent name') Reflect.deleteProperty(body.project, 'name');
    if (fault === 'missing package parent') Reflect.deleteProperty(body.workPackage, 'projectId');
    if (fault === 'parent mismatch') body.project.id = 'different-parent';
    if (fault === 'old owner') Reflect.set(body.workPackage, 'ownerId', 'old-owner');
    if (fault === 'unknown nested field') Reflect.set(body.project, 'extra', 'undeclared');
    if (fault === 'wrong connected history') {
      if (version === 16) Reflect.deleteProperty(body, 'connected');
      else Reflect.set(body, 'connected', { kind: 'connected' });
    }
    const { run, output } = await project(body);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('plan export is malformed');
    expect(readdirSync(output)).toEqual([]);
  });

test.each([6, 17, 99])(
  'unsupported%i reports the exact header before malformed content',
  async (version) => {
    const { run, path, output } = await project({
      document: { format: 'wbs-plan', version },
      workPackage: null,
    });
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toBe(
      `plan export ${path} has version ${String(version)}; twin reads versions 7 and 8 and 9 and 10 and 11 and 12 and 13 and 14 and 15 and 16 only`,
    );
    expect(readdirSync(output)).toEqual([]);
  },
);
