import { expect, type Page, test } from '@playwright/test';

import { createProject } from './create-project';

/** Persists native minutes through the same HTTP commands and read model the plan uses. */
async function seedMinuteChart(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page, 'Two native minutes');
  const stored = await page.evaluate(async () => {
    const projectId = localStorage.getItem('wbs.project');
    if (projectId === null) throw new Error('Missing project to seed');
    const send = async (path: string, method = 'GET', body?: unknown) => {
      const reply = await fetch(`/api/projects/${projectId}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!reply.ok)
        throw new Error(`${method} ${path}: ${String(reply.status)} ${await reply.text()}`);
      return reply.json() as Promise<unknown>;
    };
    await send('', 'PATCH', { startDate: '2026-08-10', timezone: 'Europe/Kyiv' });
    const initial = (await send('/work-items')) as { steps: { id: string; name: string }[] };
    const stepId = initial.steps.find((step) => step.name === 'Dev')?.id;
    if (stepId === undefined) throw new Error('Missing Dev step');
    const qaId = initial.steps.find((step) => step.name === 'QA')?.id;
    if (qaId === undefined) throw new Error('Missing QA step');
    await send(`/steps/${stepId}`, 'PATCH', { estimateUnit: 'minutes' });
    await send('/commands', 'POST', {
      commands: [
        {
          kind: 'createWorkItem',
          ref: 'minute',
          parentId: null,
          afterId: null,
          name: 'Two minutes',
        },
        {
          kind: 'setEstimate',
          workItemRef: 'minute',
          stepId,
          days: { optimistic: 2, realistic: 2, pessimistic: 2 },
        },
        {
          kind: 'setEstimate',
          workItemRef: 'minute',
          stepId: qaId,
          days: { optimistic: 0, realistic: 0, pessimistic: 0 },
        },
      ],
    });
    const persisted = (await send('/work-items')) as {
      steps: { id: string; estimateUnit: string }[];
      workItems: {
        id: string;
        charged: Record<string, unknown>;
        schedule: { duration: number } | null;
      }[];
    };
    return { stepId, persisted };
  });
  expect(stored.persisted.steps.find((step) => step.id === stored.stepId)?.estimateUnit).toBe(
    'minutes',
  );
  expect(stored.persisted.workItems[0].charged[stored.stepId]).toEqual({
    unit: 'minutes',
    minutes: 2,
  });
  expect(stored.persisted.workItems[0].schedule?.duration).toBeCloseTo(2 / 480, 9);
  await page.reload();
  await expect(page.getByLabel('Name of 010')).toHaveValue('Two minutes');
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await page.locator('[data-gantt-day-scale]').selectOption('896');
}

test.use({ timezoneId: 'America/Los_Angeles' });

test('a persisted two-minute estimate schedules a 4px tick with an 18px pointer and native card', async ({
  page,
}) => {
  await seedMinuteChart(page);
  const bar = page.locator('[data-gantt-bar][data-tick="true"]').first();
  await expect(bar).toBeVisible();
  const paint = await bar.boundingBox();
  if (paint === null) throw new Error('Minute tick has no painted box');
  const authored = await bar.evaluate((mark) => {
    if (!(mark instanceof SVGRectElement)) throw new Error('Minute paint is not a rect');
    const transform = mark.getScreenCTM();
    if (transform === null) throw new Error('Minute paint has no screen transform');
    return mark.width.baseVal.value * transform.a;
  });
  expect(authored).toBeCloseTo(4, 2);
  expect(Number(await bar.getAttribute('width')) * 896).toBeCloseTo(4, 6);
  // The existing 2px outline extends 1px on either side of the 4px fill.
  expect(paint.width).toBeCloseTo(6, 1);
  const sliceId = await bar.getAttribute('data-gantt-bar');
  if (sliceId === null) throw new Error('Minute tick has no slice identity');
  const hit = bar.locator('xpath=..').locator('[data-gantt-hit]');
  const pointer = await hit.boundingBox();
  if (pointer === null) throw new Error('Minute tick has no pointer box');
  expect(pointer.width).toBeCloseTo(18, 1);
  const authoredHit = await hit.evaluate((mark) => {
    if (!(mark instanceof SVGRectElement)) throw new Error('Minute pointer is not a rect');
    const transform = mark.getScreenCTM();
    if (transform === null) throw new Error('Minute pointer has no screen transform');
    return mark.width.baseVal.value * transform.a;
  });
  expect(authoredHit).toBeCloseTo(18, 2);
  expect(Number(await hit.getAttribute('width')) * 896).toBeCloseTo(18, 6);
  await page.mouse.move(pointer.x + pointer.width / 2, pointer.y + pointer.height / 2);
  await page
    .getByRole('tooltip', { name: 'Choose a mark' })
    .getByRole('button', { name: '010 · Dev · 2 min' })
    .click();
  await expect(page.getByRole('tooltip')).toContainText('2 min · placed on the working calendar');
  await expect(page.locator('[data-axis-day="0"]')).toHaveAttribute('data-axis-date', '2026-08-10');
});

test('missing trusted native minutes on an API read reaches the visible Error Boundary', async ({
  page,
}) => {
  await seedMinuteChart(page);
  await page.route('**/api/projects/*/work-items', async (route) => {
    const reply = await route.fetch();
    const tree = (await reply.json()) as { workItems: { charged?: unknown }[] };
    for (const row of tree.workItems) delete row.charged;
    await route.fulfill({ response: reply, json: tree });
  });
  await page.reload();
  // Proof: deleting the persisted API charge reaches this visible Error Boundary, rather than inventing minutes (2026-10-13).
  await expect(page.getByText('Something went wrong!', { exact: true })).toBeVisible();
  await expect(page.locator('[data-gantt-chart]')).toHaveCount(0);
});

test('fractional native minutes are refused by the real API without changing the stored charge', async ({
  page,
}) => {
  await seedMinuteChart(page);
  const refusal = await page.evaluate(async () => {
    const projectId = localStorage.getItem('wbs.project');
    if (projectId === null) throw new Error('Missing project');
    const read = await fetch(`/api/projects/${projectId}/work-items`);
    if (!read.ok) throw new Error('Cannot read persisted plan');
    const tree = (await read.json()) as {
      steps: { id: string; name: string }[];
      workItems: { id: string }[];
    };
    const stepId = tree.steps.find((step) => step.name === 'Dev')?.id;
    if (stepId === undefined) throw new Error('Missing minute step');
    const write = await fetch(`/api/projects/${projectId}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        commands: [
          {
            kind: 'setEstimate',
            workItemId: tree.workItems[0].id,
            stepId,
            days: { optimistic: 1.5, realistic: 1.5, pessimistic: 1.5 },
          },
        ],
      }),
    });
    const after = await fetch(`/api/projects/${projectId}/work-items`);
    if (!after.ok) throw new Error('Cannot verify unchanged charge');
    const persisted = (await after.json()) as { workItems: { charged: Record<string, unknown> }[] };
    return {
      status: write.status,
      body: (await write.json()) as unknown,
      charge: persisted.workItems[0].charged[stepId],
    };
  });
  expect(refusal.status).toBe(422);
  expect(refusal.body).toMatchObject({ error: 'minutes_not_integer' });
  expect(refusal.charge).toEqual({ unit: 'minutes', minutes: 2 });
});

test('a missing project zone visibly disables attempts while retaining the forecast', async ({
  page,
}) => {
  await seedMinuteChart(page);
  await page.route('**/api/projects/*/work-items', async (route) => {
    const reply = await route.fetch();
    const tree = (await reply.json()) as { timezone?: string };
    delete tree.timezone;
    await route.fulfill({ response: reply, json: tree });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await page.locator('[data-gantt-day-scale]').selectOption('896');
  await expect(
    page.getByText('Attempt marks unavailable: project timezone is unavailable', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-gantt-bar][data-tick="true"]').first()).toBeVisible();
});
