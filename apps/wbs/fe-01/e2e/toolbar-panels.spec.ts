import { expect, type Locator, type Page, test } from '@playwright/test';

import { openSeededPlan, seedPlan } from './plan-fixture';

/**
 * The plan toolbar's popovers and rows, measured by a browser.
 *
 * Each case names the UI review finding it guards (`F-0xx`, 2026-10-13 review ledger in
 * puni-plan). They are browser facts — focus after a key, a box's border, a row a
 * control was laid out on — which jsdom cannot see.
 */

const RUN_TOKEN = String(Date.now());

/** A plan with four unestimated leaves, a start day, and names Find can match. */
async function openPlan(page: Page): Promise<void> {
  const info = test.info();
  const seeded = await seedPlan(
    page,
    {
      name: 'Toolbar panels',
      rows: [
        { ref: 'a', name: 'Wire the board' },
        { ref: 'b', name: 'Paint the hall' },
        { ref: 'c', name: 'Board the attic' },
        { ref: 'd', name: 'Fit the doors' },
      ],
    },
    { run: RUN_TOKEN, worker: info.workerIndex, test: info.title },
  );
  await openSeededPlan(page, seeded);
  const starts = page.getByLabel('Project start date');
  await starts.fill('2026-09-19');
  await starts.press('Enter');
  await expect(starts).toHaveValue('2026-09-19');
}

/** Every `<details>` popover the toolbar and the header carry, by its summary's words. */
const PANELS = ['Filters', 'Views', 'Columns', 'Export / Import', 'Saved plans'] as const;

function summaryOf(page: Page, words: string): Locator {
  return page.locator('details > summary', { hasText: words }).first();
}

test.describe('the toolbar popovers', () => {
  test('every popover closes on Escape and gives the focus back to its summary (F-028)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    const left: string[] = [];
    for (const words of PANELS) {
      const summary = summaryOf(page, words);
      await summary.click();
      const details = summary.locator('..');
      await expect(details).toHaveAttribute('open', '');
      // From inside the panel, where a reader who has been ticking boxes is.
      const inside = details.locator('input, button, select').first();
      if ((await inside.count()) > 0) await inside.focus();
      await page.keyboard.press('Escape');
      const open = await details.evaluate((node) => (node as HTMLDetailsElement).open);
      const focused = await summary.evaluate((node) => node === document.activeElement);
      if (open || !focused) left.push(`${words}: open=${String(open)} focused=${String(focused)}`);
    }
    // Proof: on 2026-10-13, against the panels before `useClosedOnDismiss` listened for
    // Escape, this failed listing all five as `open=true focused=false`.
    expect(left, 'popovers Escape did not close, or closed without returning focus').toEqual([]);
  });

  test('opening one popover by the keyboard closes the other (F-028)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    await summaryOf(page, 'Filters').focus();
    await page.keyboard.press('Enter');
    await summaryOf(page, 'Views').focus();
    await page.keyboard.press('Enter');
    const open = await page.evaluate(() =>
      [...document.querySelectorAll('details[open] > summary')].map((node) => node.textContent),
    );
    // Proof: on 2026-10-13, without the toggle listener in `useClosedOnDismiss`, this failed
    // listing both Filters and Views.
    expect(open).toEqual(['Views']);
  });

  test('a popover the keyboard leaves is closed (F-028)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    await summaryOf(page, 'Columns').focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Find').focus();
    const open = await summaryOf(page, 'Columns')
      .locator('..')
      .evaluate((node) => (node as HTMLDetailsElement).open);
    // Proof: on 2026-10-13, without the focusout listener, this failed on `expected false,
    // received true`.
    expect(open).toBe(false);
  });

  test('a popover in the phone sheet is part of the sheet’s scroll (F-030)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: 'Plan actions' }).click();
    await summaryOf(page, 'Filters').click();
    const panel = page.locator('[data-facets] > div');
    await expect(panel).toBeVisible();
    const read = await panel.evaluate((node) => ({
      maxHeight: getComputedStyle(node).maxHeight,
      attachment: getComputedStyle(node).backgroundAttachment,
    }));
    // Proof: on 2026-10-13, with the sheet rule's `max-height: none` and `background` taken
    // out, this failed on `Expected: "none" · Received: "640px"`.
    expect(read.maxHeight).toBe('none');
    expect(read.attachment).not.toContain('local');
    await page.screenshot({
      path: test.info().outputPath('sheet-filters-375.png'),
    });
  });

  test('Filters and Columns show their whole list at 1440×900 (F-030)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    for (const [words, panel] of [
      ['Filters', '[data-facets] > div'],
      ['Columns', '[data-columns] > div'],
    ] as const) {
      await summaryOf(page, words).click();
      const clipped = await page
        .locator(panel)
        .evaluate((node) => node.scrollHeight - node.clientHeight);
      // Proof: on 2026-10-13, at the old `max-h-80`, this failed on `Columns is clipped by
      // 162px`.
      expect(clipped, `${words} is clipped by ${String(clipped)}px`).toBeLessThanOrEqual(0);
      await summaryOf(page, words).click();
    }
  });

  test('a popover too tall for its window says more follows (F-030)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    await page.setViewportSize({ width: 1440, height: 560 });
    await summaryOf(page, 'Columns').click();
    const panel = page.locator('[data-columns] > div');
    const read = await panel.evaluate((node) => ({
      clipped: node.scrollHeight - node.clientHeight,
      attachment: getComputedStyle(node).backgroundAttachment,
    }));
    expect(read.clipped, 'the window is tall enough that nothing is clipped').toBeGreaterThan(0);
    // The scroll cue: the covers ride with the content (`local`) and the shadows stay at the
    // edges (`scroll`), so a shadow shows exactly where more is hidden.
    // Proof: on 2026-10-13, without `scroll-cue` on the panel, this failed on `Expected
    // substring: "local" · Received string: "scroll"`.
    expect(read.attachment).toContain('local');
  });

  test('Export / Import is one line and lists plain menu items (F-004, F-031)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    const summary = summaryOf(page, 'Export / Import');
    const lines = await summary.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });
    // Proof: on 2026-10-13, with the old `w-16 leading-3` summary, this failed on
    // `Expected: 1 · Received: 2`.
    expect(lines, 'the Export / Import label wraps').toBe(1);
    const summaryHeight = (await summary.boundingBox())?.height;
    const filtersHeight = (await summaryOf(page, 'Filters').boundingBox())?.height;
    expect(summaryHeight).toBe(filtersHeight);

    await summary.click();
    const bordered = await page
      .locator('[data-export-panel]')
      .evaluate((panel) =>
        [...panel.querySelectorAll('button, label')]
          .filter((item) => getComputedStyle(item).borderTopWidth !== '0px')
          .map((item) => item.textContent.trim()),
      );
    // Proof: on 2026-10-13, with the seven export buttons put back to `variant="outline"`,
    // this failed listing all seven by name.
    expect(bordered, 'menu items drawn as bordered buttons').toEqual([]);
  });
});

test.describe('the toolbar rows', () => {
  // 1440 only: at 1024 the action controls alone need ~1130px of a 992px row, so the keyboard
  // button and Export / Import wrap to row two whatever the grouping does — there they sit at
  // its left and the schedule group at its right (lane record, F-005).
  test('keeps the schedule controls together on a row of their own at 1440 (F-005)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    // A hidden column is what offers Reset layout.
    await summaryOf(page, 'Columns').click();
    await page.locator('[data-columns]').getByLabel('Tags').uncheck();
    await summaryOf(page, 'Columns').click();
    const reset = page.getByRole('button', { name: 'Reset layout' });
    await expect(reset).toBeVisible();
    const top = async (control: Locator): Promise<number> =>
      Math.round((await control.boundingBox())?.y ?? Number.NaN);
    const starts = await top(page.getByLabel('Project start date'));
    const planWith = await top(page.getByLabel('Final estimate'));
    const resetTop = await top(reset);
    const resetRight = Math.round(
      await reset.evaluate((node) => node.getBoundingClientRect().right),
    );
    const toolbarRight = Math.round(
      await page.locator('[data-toolbar]').evaluate((node) => node.getBoundingClientRect().right),
    );
    // Proof: on 2026-10-13, before the group, this failed with Starts at 49 and `planWith: 85,
    // resetTop: 85` — Plan with and Reset layout alone on row two.
    expect({ planWith, resetTop }).toEqual({ planWith: starts, resetTop: starts });
    // The group ends the bar on whichever row it is on.
    expect(resetRight).toBe(toolbarRight);
    // Wide enough for every action on the first row: the second is the schedule's alone.
    const exportTop = await top(summaryOf(page, 'Export / Import'));
    expect(exportTop, 'an action control was laid out on the schedule row').toBeLessThan(starts);
  });

  test('the Find count does not move the controls beside it (F-016)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    const undo = page.getByRole('button', { name: 'Undo' });
    const before = (await undo.boundingBox())?.x;
    await page.getByLabel('Find').fill('board');
    const count = page.getByRole('status').filter({ hasText: 'of 4 rows' });
    await expect(count).toBeVisible();
    // Proof: on 2026-10-13, with the count as a toolbar child, this failed on `Expected:
    // 876.09375 · Received: 950.609375` — Undo pushed 74px right by the count.
    expect((await undo.boundingBox())?.x).toBe(before);
  });

  test('the start day reads in the cells’ own words (F-007)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    // Proof: on 2026-10-13, before the overlay, this failed on `element(s) not found` — only
    // the native `09/19/2026` was on screen.
    // At rest: the words show only while the field does not hold the focus, and the commit
    // in `openPlan` may leave it there.
    await page.getByLabel('Project start date').blur();
    await expect(page.locator('[data-start-day]')).toBeVisible();
    await expect(page.locator('[data-start-day]')).toHaveText('19 Sep 2026');
    const ink = await page
      .getByLabel('Project start date')
      .evaluate((node) => getComputedStyle(node).color);
    expect(ink, 'the native date text shows under the overlay').toBe('rgba(0, 0, 0, 0)');

    // Focused, the native field is the one on screen, for typing a day.
    await page.getByLabel('Project start date').focus();
    await expect(page.locator('[data-start-day]')).toBeHidden();
  });
});
