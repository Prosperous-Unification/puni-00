import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * Throwaway verification for R7 M4 — not part of the suite, not committed.
 * Signs up, builds a small real plan with a dependency and two roles on one
 * row, downloads the chart as a standalone .svg, opens the saved file with
 * `file://` in a fresh page (no app, no stylesheet), and screenshots both so
 * a human can compare them side by side.
 */
test('M4 verify: standalone svg matches the live chart', async ({ page, context }) => {
  const outDir = join(process.cwd(), 'tmp', 'm4-verify');
  mkdirSync(outDir, { recursive: true });

  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(`m4verify-${String(Date.now())}`);
  await page.getByLabel('Password').fill('gantt-svg-verify-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();

  if ((await page.getByLabel('Project start date', { exact: true }).getAttribute('type')) !== 'date') {
    await page.getByLabel('Project start date', { exact: true }).click();
  }
  const startBox = page.getByLabel('Project start date', { exact: true });
  await startBox.fill('2026-08-10');
  const savedStart = page.waitForResponse((r) => r.request().method() === 'PATCH');
  await startBox.blur();
  await savedStart;

  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (const number of ['010', '020']) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }
  await page.getByLabel('Name of 010').fill('Strip the hull');
  await page.getByLabel('Name of 020').fill('Rewire');
  await page.getByLabel('Name of 020').blur();

  await page.getByLabel('Dev estimate for 010').fill('4/6/8');
  await page.getByLabel('Dev estimate for 010').blur();
  await page.getByLabel('Dev estimate for 020').fill('2/3/4');
  await page.getByLabel('Dev estimate for 020').blur();

  const depends = page.getByLabel('Add a dependency to 020');
  await depends.click();
  await depends.fill('010');
  await depends.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop 020 waiting for 010' })).toBeVisible();

  await page.getByRole('button', { name: 'Gantt' }).click();
  await expect(page.locator('[data-gantt-panel]')).toBeVisible();
  await expect(page.locator('[data-gantt-bar]').first()).toBeVisible();

  const liveShot = join(outDir, 'live-chart.png');
  await page.locator('[data-gantt-panel]').screenshot({ path: liveShot });

  const button = page.getByRole('button', { name: 'Download this chart as a standalone SVG' });
  await expect(button).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  const svgPath = join(outDir, download.suggestedFilename());
  await download.saveAs(svgPath);
  expect(existsSync(svgPath)).toBe(true);

  const standalone = await context.newPage();
  await standalone.goto(`file://${svgPath}`);
  await standalone.waitForTimeout(300);
  await standalone.screenshot({ path: join(outDir, 'standalone-svg.png'), fullPage: true });

  console.log('SVG_PATH=' + svgPath);
  console.log('LIVE_SHOT=' + liveShot);
  console.log('STANDALONE_SHOT=' + join(outDir, 'standalone-svg.png'));
});
