import { expect, test } from '@playwright/test';

import { painted, renderingGeometry, seedRenderingPlan } from '../e2e/rendering-fixture';

test('[TEST-AXES-038] a 100-row folded plan stays within its mounted-cell budget', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const plan = await seedRenderingPlan(page, { rows: 100, steps: 2, density: 'sparse' });
  expect(plan.ids).toHaveLength(100);
  expect(plan.steps).toBe(2);
  await page.goto('/');
  await expect(page.locator('[data-grid]')).toHaveAttribute('aria-rowcount', '101');
  const gantt = page.locator('[data-gantt-panel]');
  if (await gantt.count()) await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(gantt).toHaveCount(0);
  const fold = page.getByRole('button', { name: /^Fold .* estimates$/ });
  while ((await fold.count()) > 0) await fold.first().click();
  await expect(page.getByRole('button', { name: /^Unfold .* estimates$/ })).toHaveCount(2);

  const firstName = page.locator(`[data-name-input="${plan.ids[0]}"]`);
  await expect(firstName).toHaveValue('Row 0000');
  await firstName.focus();
  await expect(firstName).toBeFocused();
  const frame = page.locator('[data-table-frame]');
  const counts: number[] = [];
  for (const index of [0, 50, 99]) {
    await frame.evaluate((node, rowIndex) => {
      node.scrollTop = rowIndex === 99 ? node.scrollHeight : rowIndex * 28;
    }, index);
    const row = page.locator(`tr[data-row-id="${plan.ids[index]}"]`);
    await expect(row).toBeVisible();
    await painted(page);
    const geometry = await renderingGeometry(page);
    expect(geometry.mountedRows).toBeGreaterThan(0);
    expect(geometry.mountedCells).toBeGreaterThan(0);
    counts.push(geometry.mountedCells);
  }
  await expect(firstName).toBeFocused();
  await expect(page.locator(`tr[data-row-id="${plan.ids[0]}"]`)).toHaveCount(1);
  const measuredCells = Math.max(...counts);
  await testInfo.attach('puni.performance.observation.v1', {
    body: JSON.stringify({
      schemaVersion: 1,
      caseId: 'wbs-folded-mounted-cells',
      measurement: 'folded-mounted-cells',
      unit: 'count',
      value: measuredCells,
    }),
    contentType: 'application/json',
  });
});
