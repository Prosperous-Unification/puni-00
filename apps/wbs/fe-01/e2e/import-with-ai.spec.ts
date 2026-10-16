import { expect, test } from '@playwright/test';

import {
  IMPORT_WITH_AI_GUIDE_URL,
  IMPORT_WITH_AI_PROMPT,
} from '../src/components/wbs/import-with-ai';
import { openSeededPlan, seedPlan } from './plan-fixture';

const RUN_TOKEN = String(Date.now());

test('Export / Import opens Import with AI, copies the guide prompt and returns the focus', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const info = test.info();
  const seeded = await seedPlan(
    page,
    { name: 'Import with AI help', rows: [{ ref: 'row', name: 'Only row' }] },
    { run: RUN_TOKEN, worker: info.workerIndex, test: info.title },
  );
  await openSeededPlan(page, seeded);

  await page.locator('details[data-export] summary').click();
  const trigger = page.getByRole('button', { name: 'Import with AI' });
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Import with AI' });
  await expect(dialog).toBeVisible();
  // Proof: on 2026-10-16, against 3e06eb5a4, this failed on `expect(locator).toBeHidden()
  // failed · Received: visible` — the menu stood open behind the dialog (F-106).
  await expect(page.locator('[data-export-panel]')).toBeHidden();
  await expect(dialog.getByRole('link', { name: /Read the full guide/ })).toHaveAttribute(
    'href',
    IMPORT_WITH_AI_GUIDE_URL,
  );
  await expect(dialog).toContainText('The public MCP address is not published yet.');

  await dialog.getByRole('button', { name: 'Copy import prompt' }).click();
  await expect(dialog.getByText('Copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(IMPORT_WITH_AI_PROMPT);

  // The menu closed as the dialog opened (F-106), so the focus returns to what opened the
  // menu, the Export / Import summary, and the menu stays closed.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('details[data-export] summary')).toBeFocused();
  expect(
    await page
      .locator('details[data-export]')
      .evaluate((node) => (node as HTMLDetailsElement).open),
  ).toBe(false);
});
