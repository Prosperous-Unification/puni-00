import { input13Fixture, leafScheduleFixture } from '@wbs/domain/input13-fixture';
import { expect, test } from 'bun:test';

import { verifySavedPlanBodies } from './saved-plan-integrity';

test('saved-plan integrity reads local input13 and refuses its incomplete own census', () => {
  const input = input13Fixture(),
    bytes = JSON.stringify(input);
  expect(
    verifySavedPlanBodies(
      'saved',
      'package',
      { version: 13, bytes },
      { present: false, absentReason: 'not_requested' },
    ),
  ).toBeNull();
  input.leafSteps.pop();
  expect(
    verifySavedPlanBodies(
      'saved',
      'package',
      { version: 13, bytes: JSON.stringify(input) },
      { present: false, absentReason: 'not_requested' },
    ),
  ).toMatchObject({
    reason: 'body_invalid',
    body: 'input',
    code: 'leaf_inventory',
  });
});

test('saved-plan integrity selects leaf history from input13 and preserves absence coherence', () => {
  const input = input13Fixture(true);
  Reflect.set(input.dependencyHistory, 'placementState', {
    kind: 'unavailable',
    reason: 'calendar_range',
  });
  const bytes = JSON.stringify(input);
  expect(
    verifySavedPlanBodies(
      'saved',
      'package',
      { version: 13, bytes },
      { present: false, absentReason: 'infeasible' },
    ),
  ).toBeNull();
  expect(
    verifySavedPlanBodies(
      'saved',
      'package',
      { version: 13, bytes },
      { present: false, absentReason: 'unavailable' },
    ),
  ).toMatchObject({
    reason: 'body_invalid',
    body: 'schedule',
    code: 'absence_reason',
  });
});

for (const fault of ['none', 'foreign-step', 'false-boundary', 'parent-step'] as const)
  test('local input13 checks captured slice membership ' + fault, () => {
    const input = input13Fixture(),
      { evidence } = leafScheduleFixture();
    const slices = Object.fromEntries(
      Object.entries(evidence.baseline.slices).map(([key, slice]) => [
        key,
        { ...slice, startsOn: null, endsOn: null },
      ]),
    );
    const template = Object.values(slices).find(
      (slice) => slice.workItemId === 'spike' && slice.stepId === 'research',
    );
    if (template === undefined) throw new Error('fixture spike placement absent');
    if (fault !== 'none') {
      const workItemId = fault === 'parent-step' ? 'P' : 'spike',
        stepId = fault === 'false-boundary' ? null : 'qa';
      slices[workItemId + '\u0000' + (stepId ?? '')] = { ...template, workItemId, stepId };
    }
    const schedule = {
      version: 3,
      algorithmId: 'codec-control',
      slices,
      workItems: Object.fromEntries(
        Object.entries(evidence.baseline.workItems).map(([id, span]) => [
          id,
          { ...span, startsOn: null, endsOn: null },
        ]),
      ),
      waitingForPerson: 0,
      waitingForCapacity: 0,
    };
    const refusal = verifySavedPlanBodies(
      'saved',
      'package',
      { version: 13, bytes: JSON.stringify(input) },
      { present: true, version: 3, bytes: JSON.stringify(schedule), algorithmId: 'codec-control' },
    );
    if (fault === 'none') expect(refusal).toBeNull();
    else
      expect(refusal).toMatchObject({
        reason: 'body_invalid',
        body: 'schedule',
        code: 'placement_step',
      });
  });
