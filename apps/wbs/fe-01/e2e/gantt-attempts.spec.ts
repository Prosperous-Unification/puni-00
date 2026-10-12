import { expect, type Page, test } from '@playwright/test';

import { createProject } from './create-project';

/** Stored historical attempts precede the forecast; one completed row keeps its step slices. */
async function seedAttemptChart(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page, 'Gantt attempt marks');
  await page.evaluate(async () => {
    const projectId = localStorage.getItem('wbs.project');
    if (projectId === null) throw new Error('no project to seed');
    const patch = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startDate: '2026-08-10', timezone: 'Europe/Kyiv' }),
    });
    if (!patch.ok) throw new Error(`project patch failed: ${String(patch.status)}`);
    const read = await fetch(`/api/projects/${projectId}/work-items`);
    if (!read.ok) throw new Error(`plan read failed: ${String(read.status)}`);
    const plan = (await read.json()) as { steps: { id: string; name: string }[] };
    const dev = plan.steps.find((step) => step.name === 'Dev')?.id;
    const qa = plan.steps.find((step) => step.name === 'QA')?.id;
    if (dev === undefined || qa === undefined) throw new Error('missing default steps');
    const instant = (time: string) => Date.parse(`2026-08-09T${time}:00+03:00`);
    const commands: Record<string, unknown>[] = [
      {
        kind: 'createWorkItem',
        ref: 'done',
        parentId: null,
        afterId: null,
        name: 'Completed attempts',
      },
      {
        kind: 'createWorkItem',
        ref: 'running',
        parentId: null,
        afterRef: 'done',
        name: 'Running attempts',
      },
      ...['done', 'running'].flatMap((ref) =>
        [dev, qa].map((stepId) => ({
          kind: 'setEstimate',
          workItemRef: ref,
          stepId,
          days: { optimistic: 0.5, realistic: 0.5, pessimistic: 0.5 },
        })),
      ),
      { kind: 'startAttempt', workItemRef: 'done', stepId: dev, at: instant('09:10') },
      {
        kind: 'endAttempt',
        workItemRef: 'done',
        stepId: dev,
        at: instant('09:40'),
        outcome: 'failed',
      },
      { kind: 'startAttempt', workItemRef: 'done', stepId: dev, at: instant('10:00') },
      {
        kind: 'endAttempt',
        workItemRef: 'done',
        stepId: dev,
        at: instant('10:20'),
        outcome: 'failed',
      },
      { kind: 'startAttempt', workItemRef: 'done', stepId: dev, at: instant('10:30') },
      {
        kind: 'endAttempt',
        workItemRef: 'done',
        stepId: dev,
        at: instant('12:00'),
        outcome: 'succeeded',
        reference: 'run/success',
      },
      { kind: 'setProgress', workItemRef: 'done', stepId: qa, state: 'done' },
      { kind: 'startAttempt', workItemRef: 'running', stepId: dev, at: instant('09:00') },
      {
        kind: 'endAttempt',
        workItemRef: 'running',
        stepId: dev,
        at: instant('09:02'),
        outcome: 'cancelled',
        reference: 'run/tick',
      },
      { kind: 'startAttempt', workItemRef: 'running', stepId: dev, at: instant('09:03') },
    ];
    const write = await fetch(`/api/projects/${projectId}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commands }),
    });
    if (!write.ok)
      throw new Error(`attempt fixture failed: ${String(write.status)} ${await write.text()}`);
  });
  await page.reload();
  await expect(page.getByLabel('Name of 020')).toBeVisible();
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await page.locator('[data-gantt-day-scale]').selectOption('896');
}

test('paint, completed forecast, translated hits and tick collision list agree at 15 min', async ({
  page,
}) => {
  await seedAttemptChart(page);
  await expect(page.locator('[data-axis-day="0"]')).toHaveAttribute('data-axis-date', '2026-08-09');
  for (const outcome of ['failed', 'cancelled', 'succeeded', 'running'])
    await expect(page.locator(`[data-attempt="${outcome}"]`).first()).toBeVisible();
  await expect(page.locator('[data-gantt-bar][data-done]')).toHaveCount(0);
  await expect(page.locator('[data-gantt-bar]')).toHaveCount(4);
  const tick = page.locator('[data-attempt="cancelled"] [data-attempt-hit]');
  const box = await tick.boundingBox();
  if (box === null) throw new Error('attempt tick has no pointer box');
  expect(box.width).toBeGreaterThanOrEqual(18);
  await tick.focus();
  await expect(page.getByText('Reference: run/tick', { exact: true })).toBeVisible();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('tooltip', { name: 'Choose a mark' })).toBeVisible();
  await page.getByRole('button', { name: /Attempt 1.*cancelled/ }).click();
  await expect(page.getByText('Reference: run/tick', { exact: true })).toBeVisible();
});
