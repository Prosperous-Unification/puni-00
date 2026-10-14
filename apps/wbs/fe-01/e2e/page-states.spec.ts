import { expect, type Page, test } from '@playwright/test';

/**
 * The Directory, Organization and Spaces pages as a local-mode reader meets
 * them, measured by a browser: findings F-014 and F-015 of the 2026-10-13 UI
 * review.
 */

/** How far two measured edges may disagree, in CSS px. */
const NEARLY = 1;

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
}

/**
 * Every row of Directory cards, and how far short of the grid's right edge
 * that row stops — a row ending early is a card left alone with an empty cell
 * beside it.
 */
function measureCardRows(page: Page): Promise<{ titles: string[]; shortBy: number }[]> {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-directory-grid]');
    if (grid === null) throw new Error('the directory has no card grid');
    const right = grid.getBoundingClientRect().right;
    const rows = new Map<number, { titles: string[]; right: number }>();
    for (const card of grid.children) {
      const box = card.getBoundingClientRect();
      const top = Math.round(box.top);
      const row = rows.get(top) ?? { titles: [], right: 0 };
      row.titles.push(card.querySelector('h2')?.textContent ?? '?');
      row.right = Math.max(row.right, box.right);
      rows.set(top, row);
    }
    return [...rows.values()].map((row) => ({ titles: row.titles, shortBy: right - row.right }));
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`the directory has a heading and no card left alone at ${String(viewport.width)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    await page.getByRole('link', { name: 'Directory' }).click();
    // Proof: on main at 16eaa121f this failed on `getByRole('heading', { name:
    // 'Directory', level: 1 })` not visible: the page had only an sr-only h2.
    // Watched 2026-10-13.
    await expect(page.getByRole('heading', { name: 'Directory', level: 1 })).toBeVisible();

    const rows = await measureCardRows(page);
    expect(rows.length, 'the cards are not laid out in rows').toBeGreaterThan(1);
    // Proof: on main at 16eaa121f this failed at 1440 and 1024 on `Services
    // stops 717px short of the grid's edge`. Watched 2026-10-13.
    for (const row of rows) {
      expect(
        row.shortBy,
        `${row.titles.join(', ')} stops ${String(Math.round(row.shortBy))}px short of the grid's edge`,
      ).toBeLessThanOrEqual(NEARLY);
    }
  });
}

test('Organization says what local mode means and offers somewhere to go', async ({ page }) => {
  await signIn(page);
  await page.goto('/organization');
  const state = page.getByRole('main');
  await expect(state.getByRole('alert')).toBeVisible();
  // Proof: on main at 16eaa121f this failed on the link: the page said only
  // `No organization is selected for this session.` Watched 2026-10-13.
  const action = state.getByRole('link', { name: 'Open the plan' });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page).toHaveURL(/\/$/);
});

test('Spaces says what local mode means and offers All projects', async ({ page }) => {
  await signIn(page);
  await page.goto('/spaces');
  const state = page.getByRole('main');
  await expect(state.getByRole('alert')).toBeVisible();
  // Proof: on main at 16eaa121f this failed on `not.toContainText('deployment')`:
  // the page read `Until this deployment has one, only All projects is
  // available.` Watched 2026-10-13.
  await expect(state).not.toContainText('deployment');
  const action = state.getByRole('link', { name: 'Open All projects' });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page).toHaveURL(/\/spaces\/all$/);
});
