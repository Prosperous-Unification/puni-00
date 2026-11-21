import { ORDINARY_STEPS } from './catalogue-fixture';
import { createWorkPackage } from './create-work-package';
import { expect, type Page, test } from './ordinary-test';
import { fixtureClient, fixtureSuccess, openSeededPlan, seedPlan } from './plan-fixture';

/** Opens an ordinary package whose Dev/QA catalogue bindings were authored by setup. */
async function openPlan(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createWorkPackage(page);
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
}

/** Opens local values; names and applicability belong to scope settings. */
async function openSteps(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Work package settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Work package settings' })).toBeVisible();
  await page.getByRole('tab', { name: 'Steps' }).click();
  await expect(page.getByLabel('Dev allowance (%)', { exact: true })).toBeVisible();
}

/** Every folded step column, observed from the rendered table. */
function columnsOnScreen(page: Page): Promise<string[]> {
  return page
    .locator('thead [data-column]')
    .evaluateAll((columns) => columns.map((column) => column.getAttribute('data-column') ?? ''));
}

/** Reads the actual package selected by this page, rather than its rendered input draft. */
async function storedAllowance(page: Page): Promise<number | undefined> {
  const id = await page.evaluate(() => localStorage.getItem('wbs.workPackage'));
  if (id === null) throw new Error('No selected package');
  const read = fixtureSuccess(
    'read allowance',
    await fixtureClient(page).getApiWorkPackagesById({ params: { id } }),
  );
  const dev = read.body.steps.find((step) => step.name === 'Dev');
  if (dev === undefined) throw new Error('Selected package has no Dev step');
  return dev.allowancePercent;
}

test.describe('the steps surface, in a browser', () => {
  test('opens from the toolbar and holds the focus inside itself', async ({ page }) => {
    await openPlan(page);
    await openSteps(page);
    for (let press = 0; press < 12; press += 1) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => document.activeElement?.closest('[data-modal-surface]') !== null),
        `Tab ${String(press + 1)} left the surface`,
      ).toBe(true);
    }
  });

  test('Escape closes it and gives the focus back to the button that opened it', async ({
    page,
  }) => {
    await openPlan(page);
    const opener = page.getByRole('button', { name: 'Work package settings' });
    await openSteps(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('a click away closes it', async ({ page }) => {
    await openPlan(page);
    await openSteps(page);
    await page.mouse.click(5, 5);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('Enter persists the package allowance and a reload retains it', async ({ page }) => {
    await openPlan(page);
    await openSteps(page);
    const allowance = page.getByLabel('Dev allowance (%)', { exact: true });
    await allowance.fill('12.5');
    await allowance.press('Enter');
    await expect.poll(() => storedAllowance(page)).toBe(12.5);
    await page.reload();
    await openSteps(page);
    await expect(allowance).toHaveValue('12.5');
  });

  test('Escape reverts an allowance draft before the modal can close', async ({ page }) => {
    await openPlan(page);
    await openSteps(page);
    const allowance = page.getByLabel('Dev allowance (%)', { exact: true });
    await allowance.fill('12.555');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(allowance).toHaveValue('12.555');
    await allowance.press('Escape');
    await expect(allowance).toHaveValue('0');
    expect(await storedAllowance(page)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('a third scoped step gives a new package a third set of columns', async ({ page }) => {
    await openPlan(page);
    await page.getByRole('button', { name: 'Add work item' }).click();
    await expect(page.getByLabel('Name of 010')).toBeVisible();
    expect((await columnsOnScreen(page)).filter((id) => id.endsWith('-final'))).toHaveLength(2);
    const minWidthBefore = await page
      .locator('table[data-grid]')
      .evaluate((table) => Number.parseInt(table.style.minWidth, 10));
    const seeded = await seedPlan(
      page,
      {
        name: 'Three scoped steps',
        steps: [...ORDINARY_STEPS, { code: 'design', name: 'Design' }],
        rows: [{ ref: 'row', name: '' }],
      },
      { run: 'steps', worker: 0, test: crypto.randomUUID() },
    );
    await openSeededPlan(page, seeded);
    await expect(page.getByRole('button', { name: 'Unfold Design estimates' })).toBeVisible();
    expect((await columnsOnScreen(page)).filter((id) => id.endsWith('-final'))).toHaveLength(3);
    const minWidthAfter = await page
      .locator('table[data-grid]')
      .evaluate((table) => Number.parseInt(table.style.minWidth, 10));
    expect(minWidthAfter - minWidthBefore).toBe(104);
    await openSteps(page);
    await expect(page.getByText(/3 steps need ≥.*px of width/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'New step', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove Design', exact: true })).toHaveCount(0);
  });

  test('project binding removal previews protected estimates without offering a cascade', async ({
    page,
  }) => {
    const seeded = await seedPlan(
      page,
      {
        name: 'Protected QA',
        steps: ORDINARY_STEPS,
        rows: [
          {
            ref: 'row',
            name: 'Protected work',
            estimates: { QA: { optimistic: 2, realistic: 3, pessimistic: 8 } },
          },
        ],
      },
      { run: 'steps', worker: 0, test: crypto.randomUUID() },
    );
    await page.goto('/projects/' + encodeURIComponent(seeded.projectId) + '/settings');
    await page
      .getByRole('button', { name: 'Preview removal of QA for Every type', exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: '1 protected steps would lose this binding.' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Protected work', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Confirm binding removal', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel('Delete them along with the step')).toHaveCount(0);
    await openSeededPlan(page, seeded);
    await expect(page.getByLabel('QA estimate for 010')).toHaveValue('2/3/8');
  });
});
