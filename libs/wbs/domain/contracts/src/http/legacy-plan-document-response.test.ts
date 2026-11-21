import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import type { PlanDocumentV12 } from './legacy-plan-document-response';
import * as frozen from './legacy-plan-document-response';
const path = new URL(
  '../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-document12-connected.txt',
  import.meta.url,
);
function capture() {
  const bytes = readFileSync(path);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'd5d58dc017a9cabca1ae712f052c79ee6a4f5313e1dfd6c9fb561db2c29ba123',
  );
  return JSON.parse(bytes.toString()) as PlanDocumentV12;
}
function decoder() {
  expect('createLegacyPlanDocumentV12' in frozen).toBe(true);
  if (
    !('createLegacyPlanDocumentV12' in frozen) ||
    typeof frozen.createLegacyPlanDocumentV12 !== 'function'
  )
    throw Error('frozen12 factory missing');
  return frozen.createLegacyPlanDocumentV12();
}
test('complete frozen12 accepts the genuine outgoing mounted export without changing bytes', () => {
  const body = capture();
  expect(decoder().allows(body)).toBe(true);
  expect(body).toEqual(capture());
});
test.each([
  'history absent',
  'placement missing',
  'boundary2',
  'mixed root',
  'mixed owner',
  'mixed display',
  'mixed revision',
  'unknown history',
  'malformed position',
  'import mappings',
])('complete frozen12 refuses %s', (fault) => {
  const body = capture();
  const predecessor = body.typedDependencies[0].predecessor;
  if (predecessor.kind !== 'external') throw Error('captured external required');
  if (fault === 'history absent') Reflect.deleteProperty(body, 'connected');
  if (fault === 'placement missing') Reflect.deleteProperty(body.connected, 'placement');
  if (fault === 'boundary2')
    if (body.connected.placement.kind !== 'scheduled') throw Error('scheduled fixture required');
    else Reflect.set(body.connected.placement.stages[0].boundary, 'version', 2);
  if (fault === 'mixed root') Reflect.set(body, 'workPackage', body.project);
  if (fault === 'mixed owner')
    Reflect.set(body.typedDependencies[0].predecessor, 'workPackageId', 'foreign');
  if (fault === 'mixed display') Reflect.set(predecessor.display, 'workPackageName', 'foreign');
  if (fault === 'mixed revision') Reflect.set(body, 'workPackageRevision', body.projectRevision);
  if (fault === 'unknown history') Reflect.set(body.connected.projects[0], 'extra', true);
  if (fault === 'malformed position')
    if (body.connected.placement.kind !== 'scheduled') throw Error('scheduled fixture required');
    else Reflect.set(body.connected.placement.baseline[0], 'start', 'bad');
  if (fault === 'import mappings') Reflect.set(body, 'externalMappings', []);
  expect(decoder().allows(body)).toBe(false);
});

test('frozen12 closes history question, candidates and placement union arms', () => {
  const body = capture();
  if (body.connected.placement.kind !== 'scheduled') throw Error('scheduled archive required');
  const question = {
    projectId: body.project.id,
    inputHash: 'input',
    questionHash: 'question',
    objective: 'pri',
    contractVersion: 'contract',
    budgetMs: 1,
    quantum: 1,
    wireVersion: 5,
    stageBytes: 'canonical',
  };
  const optimization = {
    inputHash: 'input',
    generation: null,
    contractVersion: 'contract',
    budgetMs: 1,
    quantum: 1,
    wireVersion: 5,
    variants: { pri: { state: 'pending' }, time: { state: 'idle' } },
    candidates: { pri: { question, starts: [] }, time: null },
  };
  Reflect.set(body.connected.placement.stages[0], 'optimization', optimization);
  expect(decoder().allows(body)).toBe(true);
  Reflect.set(question, 'workPackageId', body.project.id);
  expect(decoder().allows(body)).toBe(false);
  Reflect.deleteProperty(question, 'workPackageId');
  Reflect.set(question, 'budgetMs', 'malformed');
  expect(decoder().allows(body)).toBe(false);
  for (const placement of [
    { kind: 'unavailable', reason: 'cycle' },
    {
      kind: 'engine_unavailable',
      engine: 'optimized',
      projects: ['remote'],
      reason: 'adapter_missing',
    },
    {
      kind: 'dependency_calendar_missing',
      projects: [{ projectId: 'remote', name: 'Remote', abbreviation: 'R' }],
    },
  ]) {
    Reflect.set(body.connected, 'placement', placement);
    expect(decoder().allows(body)).toBe(true);
    Reflect.set(placement, 'workPackages', []);
    expect(decoder().allows(body)).toBe(false);
  }
});
