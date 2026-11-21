import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import { projectSavedPlanInput } from './comparison-input';
import { readLegacySavedPlanInput11 } from './legacy-input11';
import { planFixtureRows } from './plan-fixture';
import { canonicalisePlanInputV12 } from './versioned-plan-input';

function historical11() {
  return structuredClone(
    readLegacySavedPlanInput11(
      JSON.parse(
        readFileSync(new URL('./fixtures/constructed-input11-local.txt', import.meta.url), 'utf8'),
      ),
    ),
  );
}
const current12 = () =>
  canonicalisePlanInputV12(
    {
      ...planFixtureRows,
      workPackage: { ...planFixtureRows.workPackage, projectId: 'recorded-parent' },
    },
    { kind: 'local' },
  );

test('historical11 separates actually recorded owner from unrecorded parent and ordinary facts', () => {
  const view = projectSavedPlanInput(historical11(), 11);
  expect(view).toMatchObject({
    inputEvidence: {
      parent: { kind: 'unrecorded' },
      retired: { ownerId: 'u1' },
      dependencies: { kind: 'recorded', history: { kind: 'local' } },
    },
  });
  expect(view.input.workPackage).not.toHaveProperty('ownerId');
  expect(view.input.workPackage).not.toHaveProperty('projectId');
  expect(view.input).not.toHaveProperty('schemaVersion');
  expect(view.input).not.toHaveProperty('dependencyHistory');
});

test('current12 records the captured parent without fabricating retired owner evidence', () => {
  const view = projectSavedPlanInput(current12(), 12);
  expect(view).toMatchObject({
    inputEvidence: {
      parent: { kind: 'recorded', projectId: 'recorded-parent' },
      dependencies: { kind: 'recorded', history: { kind: 'local' } },
    },
  });
  expect('retired' in view.inputEvidence).toBe(false);
  expect(view.input.workPackage).not.toHaveProperty('projectId');
  expect(view.input).toEqual(projectSavedPlanInput(historical11(), 11).input);
});

test('retired null remains recorded while an absent required historical owner refuses', () => {
  const body = historical11();
  Reflect.set(body.workPackage, 'ownerId', null);
  expect(projectSavedPlanInput(body, 11)).toMatchObject({
    inputEvidence: { retired: { ownerId: null } },
  });
  Reflect.deleteProperty(body.workPackage, 'ownerId');
  expect(() => projectSavedPlanInput(body, 11)).toThrow('shape');
});

test('dependency evidence uses the original version before its historical eleven projection', () => {
  for (const [version, name, kind] of [
    [9, 'legacy-input9-local.txt', 'unrecorded'],
    [10, 'legacy-input10-local.txt', 'recorded'],
  ] as const) {
    const body: unknown = JSON.parse(
      readFileSync(
        new URL(
          '../../../../../../openspec/changes/wbs-work-packages/fixtures/' + name,
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(projectSavedPlanInput(body, version)).toMatchObject({
      inputEvidence: { parent: { kind: 'unrecorded' }, dependencies: { kind } },
    });
  }
});

test('comparison projection is detached and validates declared original versions without rewriting them', () => {
  const body = structuredClone(current12()),
    before = JSON.stringify(body);
  const view = projectSavedPlanInput(body, 12);
  expect(view).toHaveProperty('inputEvidence');
  expect(JSON.stringify(body)).toBe(before);
  expect(Object.isFrozen(view.input.workPackage)).toBe(true);
  const capturedName = view.input.workPackage.name;
  Reflect.set(body.workPackage, 'name', 'Changed after projection');
  expect(view.input.workPackage.name).toBe(capturedName);
  expect(() => projectSavedPlanInput(body, 11)).toThrow('version');
  expect(() => projectSavedPlanInput(body, 14)).toThrow('from-the-future');
});
