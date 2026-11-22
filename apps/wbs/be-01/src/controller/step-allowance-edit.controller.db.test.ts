import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';
import { createFixturePackage, readFixturePackage } from '../testing/space-rollup';

/**
 * A package step PATCH that sets an allowance over real
 * SQLite and the composed services: the rollback these cases assert is the
 * source's unit of work, which the controller fixtures only count.
 */
let h: OrganizationHarness;
let workPackage: string;
let qa: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  await h.register('admin');
  h.organization('org-a');
  h.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  h.member('org-a', 'admin', 'admin', ['org-admin']);
  h.grantPermissions('org-a', 'ada', ['organization.create_project', 'package.manage_settings']);
  h.bind('ada', 'org-a');
  h.bind('admin', 'org-a');
  h.activate();
  workPackage = await createFixturePackage(h, 'ada', 'Rewire the shed');
  const { steps } = await readFixturePackage(h, 'ada', workPackage);
  const step = steps.find(({ name }) => name === 'QA');
  if (step === undefined) throw new Error('the fixture work package needs a QA step');
  qa = step.id;
});

afterEach(() => {
  h.close();
});

const patchQa = (body: unknown): Promise<Answer> =>
  h.call('ada', 'PATCH', `/api/work-packages/${workPackage}/steps/${qa}`, body);

const batch = (commands: unknown[]): Promise<Answer> =>
  h.call('ada', 'POST', `/api/work-packages/${workPackage}/commands`, { commands });

/** QA's name and allowance as a plan read shows them. */
async function qaNow(): Promise<{ name: string; allowancePercent: number }> {
  const { steps } = await readFixturePackage(h, 'ada', workPackage);
  const held = steps.find((step) => step.id === qa);
  if (held === undefined) throw new Error('QA is gone');
  if (held.allowancePercent === undefined) throw new Error('QA has no effective allowance');
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

    expect(await patchQa({ allowanceBps: 100_000 })).toEqual({
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
});

describe('catalogue definitions and package allowances', () => {
  it('refuses a definition name on the allowance route and writes neither value', async () => {
    expect((await patchQa({ name: 'Review', allowanceBps: 3000 })).status).toBe(422);
    expect(await qaNow()).toEqual({ name: 'QA', allowancePercent: 0 });
  });

  it('undoes the package allowance while retaining the catalogue name', async () => {
    expect(
      await h.call('admin', 'PATCH', `/api/organization/steps/${qa}`, { name: 'Review' }),
    ).toMatchObject({ status: 200, body: { definition: { id: qa, name: 'Review' } } });
    expect(await patchQa({ allowanceBps: 3000 })).toMatchObject({
      status: 200,
      body: {
        step: { estimateUnit: 'workdays' as const, id: qa, name: 'Review', allowancePercent: 30 },
      },
    });

    expect((await h.call('ada', 'POST', `/api/work-packages/${workPackage}/undo`)).status).toBe(
      200,
    );
    expect(await qaNow()).toEqual({ name: 'Review', allowancePercent: 0 });
    expect(await h.call('ada', 'POST', `/api/work-packages/${workPackage}/undo`)).toMatchObject({
      status: 409,
      body: { error: 'nothing_to_undo' },
    });
  });
});
