import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * A step PATCH that sets an allowance, alone or with a rename, over real
 * SQLite and the composed services: the rollback these cases assert is the
 * source's unit of work, which the controller fixtures only count.
 */
let h: OrganizationHarness;
let workPackage: string;
let qa: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  h.grantPermissions('org-a', 'ada', ['organization.create_project', 'package.manage_settings']);
  h.bind('ada', 'org-a');
  h.activate();
  const created = await h.call('ada', 'POST', '/api/work-packages', { name: 'Rewire the shed' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  const body = created.body as {
    workPackage: { id: string };
    steps: { id: string; name: string }[];
  };
  workPackage = body.workPackage.id;
  qa = stepNamed(body.steps, 'QA');
});

afterEach(() => {
  h.close();
});

function stepNamed(steps: readonly { id: string; name: string }[], name: string): string {
  const step = steps.find((each) => each.name === name);
  if (step === undefined) throw new Error(`a work package without its seed step ${name}`);
  return step.id;
}

const patchQa = (body: unknown): Promise<Answer> =>
  h.call('ada', 'PATCH', `/api/work-packages/${workPackage}/steps/${qa}`, body);

const batch = (commands: unknown[]): Promise<Answer> =>
  h.call('ada', 'POST', `/api/work-packages/${workPackage}/commands`, { commands });

/** QA's name and allowance as a plan read shows them. */
async function qaNow(): Promise<{ name: string; allowancePercent: number }> {
  const read = await h.call('ada', 'GET', `/api/work-packages/${workPackage}`);
  const steps = (read.body as { steps: { id: string; name: string; allowancePercent: number }[] })
    .steps;
  const held = steps.find((step) => step.id === qa);
  if (held === undefined) throw new Error('QA is gone');
  return { name: held.name, allowancePercent: held.allowancePercent };
}

/**
 * One QA estimate that fits the supported calendar at 0% but not at +1000%:
 * 30M working days fit, 330M do not.
 */
async function nearTheCalendarEdge(): Promise<void> {
  const started = await h.call('ada', 'PATCH', `/api/work-packages/${workPackage}`, {
    startDate: '2026-01-05',
  });
  expect(started.status).toBe(200);
  const created = await batch([
    { kind: 'createWorkItem', ref: 'leaf', parentId: null, afterId: null, name: 'Glacier' },
    {
      kind: 'setEstimate',
      workItemRef: 'leaf',
      stepId: qa,
      days: { optimistic: 30_000_000, realistic: 30_000_000, pessimistic: 30_000_000 },
    },
  ]);
  expect(created.status).toBe(200);
}

describe('an allowance that would push the plan past the calendar', () => {
  it('is a typed 422 over HTTP and in a batch, and changes nothing', async () => {
    await nearTheCalendarEdge();

    expect(await patchQa({ allowancePercent: 1000 })).toEqual({
      status: 422,
      body: { error: 'calendar_range' },
    });
    expect(await batch([{ kind: 'setStepAllowance', stepId: qa, allowancePercent: 1000 }])).toEqual(
      {
        status: 422,
        body: { error: 'calendar_range', at: 0, kind: 'setStepAllowance' },
      },
    );
    expect(await qaNow()).toEqual({ name: 'QA', allowancePercent: 0 });
  });

  it('takes back the rename sent in the same edit', async () => {
    await nearTheCalendarEdge();

    expect(await patchQa({ name: 'Review', allowancePercent: 1000 })).toEqual({
      status: 422,
      body: { error: 'calendar_range' },
    });
    expect(await qaNow()).toEqual({ name: 'QA', allowancePercent: 0 });
  });
});

describe('a rename and an allowance in one edit', () => {
  it('writes no allowance when the rename is refused', async () => {
    expect(await patchQa({ name: 'Dev', allowancePercent: 30 })).toEqual({
      status: 409,
      body: { error: 'taken' },
    });
    expect(await qaNow()).toEqual({ name: 'QA', allowancePercent: 0 });
  });

  it('writes both, as one undo entry for the allowance', async () => {
    expect(await patchQa({ name: 'Review', allowancePercent: 30 })).toMatchObject({
      status: 200,
      body: {
        step: { estimateUnit: 'workdays' as const, id: qa, name: 'Review', allowancePercent: 30 },
      },
    });

    expect((await h.call('ada', 'POST', `/api/work-packages/${workPackage}/undo`)).status).toBe(
      200,
    );
    // Step renames are not journalled, so the undo takes back only the allowance.
    expect(await qaNow()).toEqual({ name: 'Review', allowancePercent: 0 });
    expect(await h.call('ada', 'POST', `/api/work-packages/${workPackage}/undo`)).toMatchObject({
      status: 409,
      body: { error: 'nothing_to_undo' },
    });
  });
});
