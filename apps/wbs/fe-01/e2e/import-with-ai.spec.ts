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
  await expect(dialog.getByRole('link', { name: /Read the full guide/ })).toHaveAttribute(
    'href',
    IMPORT_WITH_AI_GUIDE_URL,
  );
  await expect(dialog).toContainText('The public MCP address is not published yet.');

  await dialog.getByRole('button', { name: 'Copy import prompt' }).click();
  await expect(dialog.getByText('Copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(IMPORT_WITH_AI_PROMPT);

  // The Copy click must not close the Export menu, or the focus has no visible trigger to
  // return to (plan-toolbar.test.tsx proves the menu stays open).
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
