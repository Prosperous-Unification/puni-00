import { expect, it } from 'bun:test';

import { memoryEstimateTable } from './estimate-fixture';
import { inMemorySteps, memoryStepTable, stepRow } from './step-fixture';

it('refuses changing a memory step unit while estimates remain', async () => {
  const estimates = memoryEstimateTable();
  estimates.rows.push({
    workItemId: 'leaf',
    stepId: 'agent',
    optimistic: 1,
    realistic: 2,
    pessimistic: 3,
  });
  const steps = inMemorySteps(
    [],
    memoryStepTable([stepRow({ id: 'agent', projectId: 'project' })]),
    estimates,
  );
  expect(await steps.patchUnit('project', 'agent', 'minutes', { at: 1, by: 'owner' })).toEqual({
    ok: false,
    reason: 'estimates_present',
    count: 1,
  });
  expect(await steps.findById('agent')).toMatchObject({ estimateUnit: 'workdays' });
  estimates.rows.splice(0);
  expect(
    await steps.patchUnit('project', 'agent', 'minutes', { at: 1, by: 'owner' }),
  ).toMatchObject({ ok: true, step: { estimateUnit: 'minutes' } });
});
