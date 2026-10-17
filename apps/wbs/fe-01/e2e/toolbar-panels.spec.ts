import { expect, type Locator, type Page, test } from '@playwright/test';

import { fixtureClient, fixtureSuccess, openSeededPlan, seedPlan } from './plan-fixture';

/**
 * The plan toolbar's popovers and rows, measured by a browser.
 *
 * Each case names the UI review finding it guards (`F-0xx`, 2026-10-13 review ledger in
 * puni-plan). They are browser facts — focus after a key, a box's border, a row a
 * control was laid out on — which jsdom cannot see.
 */

const RUN_TOKEN = String(Date.now());

/** A plan with four unestimated leaves, a start day, and names Find can match. */
async function openPlan(page: Page): Promise<string> {
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
  return seeded.projectId;
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
    // Polled: `toggle` is dispatched as a task after the open, so the close of the other
    // lands a moment later (CI read both open on an immediate read, 2026-10-14).
    // Proof: on 2026-10-13, without the toggle listener in `useClosedOnDismiss`, this failed
    // listing both Filters and Views.
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll('details[open] > summary')].map((node) => node.textContent),
        ),
      )
      .toEqual(['Views']);
  });

  test('a popover the keyboard leaves is closed (F-028)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    await summaryOf(page, 'Columns').focus();
    await page.keyboard.press('Enter');
    // Shift+Tab from the summary leaves the panel for the Views summary before it.
    await page.keyboard.press('Shift+Tab');
    await expect(summaryOf(page, 'Views')).toBeFocused();
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

  test('Saved plans has the anatomy and the panel style of Views (F-061)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    /** What a reader sees of a panel, its name field and its empty line. */
    const look = async (panel: string, field: string, empty: string) => {
      const box = page.locator(panel);
      await expect(box).toBeVisible();
      const read = (node: Element) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          border: `${style.borderTopWidth} ${style.borderTopColor}`,
          radius: style.borderTopLeftRadius,
          padding: style.paddingTop,
          shadow: style.boxShadow,
          font: style.fontSize,
        };
      };
      const fieldBox = box.getByRole('textbox', { name: field });
      await expect(fieldBox, `${panel} has no name field`).toBeVisible();
      return {
        panel: await box.evaluate(read),
        field: await fieldBox.evaluate((node) => {
          const style = getComputedStyle(node);
          return `${style.height} ${style.borderTopColor} ${style.fontSize}`;
        }),
        empty: await box
          .getByText(empty)
          .evaluate((node) => `${getComputedStyle(node).color} ${getComputedStyle(node).fontSize}`),
      };
    };
    await summaryOf(page, 'Views').click();
    const views = await look('[data-saved-views-panel]', 'Name this view', 'No saved views yet.');
    await summaryOf(page, 'Views').click();
    await summaryOf(page, 'Saved plans').click();
    // Proof: on 2026-10-14, against the unstyled shelf, this failed on `[data-saved-plans-panel]
    // has no name field` — a heading, a native `Save plan` button and a bare sentence.
    const plans = await look('[data-saved-plans-panel]', 'Name this plan', 'No plans saved yet.');
    expect(plans).toEqual(views);

    // The primary Save is the toolbar's primary button, Add work item.
    const primary = await page
      .getByRole('button', { name: 'Add work item' })
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    const save = page.locator('[data-saved-plans-panel]').getByRole('button', { name: 'Save' });
    expect(await save.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(primary);

    // A named save lands as a row that offers compare and delete.
    await page.getByRole('textbox', { name: 'Name this plan' }).fill('Before the re-plan');
    await save.click();
    const row = page.locator('[data-saved-plans-panel] li', { hasText: 'Before the re-plan' });
    await expect(row).toBeVisible();
    await expect(
      row.getByRole('button', { name: 'Compare Before the re-plan with the current plan' }),
    ).toBeVisible();
    await row.getByRole('button', { name: 'Delete saved plan Before the re-plan' }).click();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(
      page.locator('[data-saved-plans-panel]').getByText('No plans saved yet.'),
    ).toBeVisible();
  });

  test('the Saved plans delete question keeps the keyboard inside the popover (F-061)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    await summaryOf(page, 'Saved plans').click();
    const panel = page.locator('[data-saved-plans-panel]');
    await panel.getByRole('textbox', { name: 'Name this plan' }).fill('Kept plan');
    await panel.getByRole('button', { name: 'Save' }).click();
    const cross = panel.getByRole('button', { name: 'Delete saved plan Kept plan' });
    await cross.focus();
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('button', { name: 'Keep' })).toBeFocused();
    await page.keyboard.press('Escape');
    // Proof: on 2026-10-14, against 6d4d02f33, this failed on `expect(locator).toBeFocused()
    // failed … element(s) not found` — Escape on the question closed the whole popover.
    await expect(cross).toBeFocused();
    const open = await summaryOf(page, 'Saved plans')
      .locator('..')
      .evaluate((node) => (node as HTMLDetailsElement).open);
    expect(open, 'Escape on the question closed the popover').toBe(true);
  });

  test('a save or a delete leaves a comparison current; an edit to the plan does not (F-100, F-103)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const projectId = await openPlan(page);
    await summaryOf(page, 'Saved plans').click();
    const panel = page.locator('[data-saved-plans-panel]');
    const banner = panel.getByText('This plan has changed since the comparison below was made.');
    const saveNamed = async (name: string) => {
      await panel.getByRole('textbox', { name: 'Name this plan' }).fill(name);
      await panel.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(panel.locator('li', { hasText: name })).toBeVisible();
    };
    await saveNamed('Baseline');
    await expect(panel.getByText('No differences.')).toBeVisible();

    // A named row's meta line is never cut inside a clause, and its fact reads whole (F-103).
    // Proof: on 2026-10-16, against 3e06eb5a4 (one `truncate` span, no fact), this failed on
    // `expect(locator).toHaveAttribute(expected) failed`, element(s) not found.
    const meta = panel.locator('li', { hasText: 'Baseline' }).locator('.saved-plan-list__meta');
    await expect(meta).toHaveAttribute('data-fact', /saved by .+ with its schedule$/, {
      timeout: 5000,
    });
    const cut = await meta.evaluate((line) =>
      [...line.children]
        .filter((clause) => clause.scrollWidth > clause.clientWidth + 0.5)
        .map((clause) => clause.textContent),
    );
    expect(cut, 'a meta clause is ellipsised').toEqual([]);

    // A second save: the shelf re-reads on the reader's refresh and on the broadcast. The
    // row appearing is after the refresh, which is when the old identity test lit up.
    await saveNamed('Second');
    await page.waitForTimeout(1000);
    // Proof: on 2026-10-16, against 3e06eb5a4, this failed on `expect(locator).toBeHidden()
    // failed` with the sentence on screen after the second save.
    await expect(banner).toBeHidden();

    const second = panel.locator('li', { hasText: 'Second' });
    await second.getByRole('button', { name: 'Delete saved plan Second' }).click();
    await second.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(second).toBeHidden();
    await page.waitForTimeout(1000);
    await expect(banner).toBeHidden();

    // An edit to the live plan, from anywhere, is a change of the comparison's live side.
    fixtureSuccess(
      'postApiProjectsByIdCommands',
      await fixtureClient(page).postApiProjectsByIdCommands({
        params: { id: projectId },
        body: {
          commands: [
            {
              kind: 'createWorkItem',
              ref: 'late',
              name: 'Late row',
              parentId: null,
              afterId: null,
            },
          ],
        },
      }),
    );
    await expect(banner).toBeVisible();
    await panel.getByRole('button', { name: 'Compare again' }).click();
    await expect(banner).toBeHidden();
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
  /*
    960×600 is the 1440×900 window at 150 % zoom, where UI review F-099 was
    reported; 960 and 1024 are also measured with the Export / Import menu open,
    because an open `<details>` is the one state of the group that lays out
    something more than its summary.

    F-099 itself did not reproduce: a probe at 880–1100 px in 10 px steps on an
    87-row plan, the menu open and closed, put every end control on one top at
    every width, and the reported capture shows one run too. These shapes pin it.
    Proof, watched 2026-10-16: the menu's panel taken out of `absolute` (laid out
    in the group's flow) failed both open shapes on `"transfer": 85` against
    Starts' `261`, and passed every closed one.
  */
  const shapes = [
    { width: 960, height: 600, menu: 'closed' },
    { width: 960, height: 600, menu: 'open' },
    { width: 1024, height: 900, menu: 'closed' },
    { width: 1024, height: 768, menu: 'open' },
    { width: 1280, height: 900, menu: 'closed' },
    { width: 1440, height: 900, menu: 'closed' },
  ] as const;
  for (const { width, height, menu } of shapes) {
    test(`ends the bar with one group, never split across rows, at ${String(width)}×${String(height)} with the Export / Import menu ${menu} (F-005, F-056, F-099)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openPlan(page);
      // A hidden column is what offers Reset layout.
      await summaryOf(page, 'Columns').click();
      await page.locator('[data-columns]').getByLabel('Tags').uncheck();
      await summaryOf(page, 'Columns').click();
      const reset = page.getByRole('button', { name: 'Reset layout' });
      await expect(reset).toBeVisible();
      if (menu === 'open') {
        await summaryOf(page, 'Export / Import').click();
        await expect(page.locator('[data-export-panel]')).toBeVisible();
      }
      const top = async (control: Locator): Promise<number> =>
        Math.round((await control.boundingBox())?.y ?? Number.NaN);
      // The end group's controls, by role and name, each on the row Starts is on.
      const end = {
        undo: await top(page.getByRole('button', { name: 'Undo' })),
        redo: await top(page.getByRole('button', { name: 'Redo' })),
        shortcuts: await top(page.getByRole('button', { name: 'Keyboard shortcuts' })),
        transfer: await top(summaryOf(page, 'Export / Import')),
        planWith: await top(page.getByLabel('Final estimate')),
        reset: await top(reset),
      };
      const starts = await top(page.getByLabel('Project start date'));
      // Proof, watched 2026-10-14 on the code before this change (Undo, Redo,
      // Keyboard shortcuts and Export / Import loose on the bar, the schedule
      // group alone with `ml-auto`): at 1024 it failed on Undo, Redo and Keyboard
      // shortcuts at `49` on row one while Starts, Plan with and Export / Import
      // stood at `85` on row two; at 1280 and 1440 on all four icon controls at
      // `49` above Starts.
      expect(end).toEqual({
        undo: starts,
        redo: starts,
        shortcuts: starts,
        transfer: starts,
        planWith: starts,
        reset: starts,
      });
      // One group, not two islands on one row: Export / Import stands one gap
      // from Starts. Proof, watched 2026-10-14: the end group made `grow` and its
      // `ml-auto` moved onto the schedule group inside it (two islands in one
      // row) failed on `Export / Import and Starts are apart · Received: 319.5`
      // at 1024, 575.5 at 1280 and 735.5 at 1440.
      const gap = await page.evaluate(() => {
        const transfer = document.querySelector('[data-toolbar] details[data-export]');
        const schedule = document.querySelector('[data-toolbar] [data-schedule]');
        if (transfer === null || schedule === null) throw new Error('the bar lost its end');
        return schedule.getBoundingClientRect().left - transfer.getBoundingClientRect().right;
      });
      expect(gap, 'Export / Import and Starts are apart').toBeLessThanOrEqual(7);
      // The group ends the bar on whichever row it is on.
      const resetRight = Math.round(
        await reset.evaluate((node) => node.getBoundingClientRect().right),
      );
      const toolbarRight = Math.round(
        await page.locator('[data-toolbar]').evaluate((node) => node.getBoundingClientRect().right),
      );
      expect(resetRight).toBe(toolbarRight);
      // Row two, where there is one, is the end group's alone: no other control
      // stands on the row the group is on unless that row is the first.
      // Proof, watched 2026-10-14 with the right-edge assertion above disabled:
      // Columns moved after the group failed on `a control outside the end group
      // shares its row · Received: ["Columns"]` at 1024 and 1280.
      const strays = await page.locator('[data-toolbar]').evaluate((toolbar, row) => {
        const first = Math.min(
          ...[...toolbar.children].map((child) => Math.round(child.getBoundingClientRect().y)),
        );
        return [...toolbar.querySelectorAll('button, input, select, summary')]
          .filter((control) => control.closest('[data-toolbar-end]') === null)
          .filter((control) => control.getBoundingClientRect().width > 0)
          .filter((control) => {
            const at = Math.round(control.getBoundingClientRect().y);
            return Math.abs(row - first) > 4 && Math.abs(at - row) <= 4;
          })
          .map((control) => control.getAttribute('aria-label') ?? control.textContent.trim());
      }, starts);
      expect(strays, 'a control outside the end group shares its row').toEqual([]);
    });
  }

  test('names the bar and its end groups to a screen reader (F-094)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    // Proof: on 3e06eb5a4 this failed on `getByRole('toolbar', { name: 'Plan' })`
    // `element(s) not found`: the F-005/F-056 grouping was visual only, a flat run
    // of buttons to a screen reader.
    const toolbar = page.getByRole('toolbar', { name: 'Plan' });
    await expect(toolbar).toBeVisible();
    const end = toolbar.getByRole('group', { name: 'Whole plan' });
    for (const name of ['Undo', 'Redo', 'Keyboard shortcuts'])
      await expect(end.getByRole('button', { name })).toBeVisible();
    await expect(end.locator('details[data-export]')).toBeVisible();
    const schedule = end.getByRole('group', { name: 'Schedule' });
    await expect(schedule.getByLabel('Project start date')).toBeVisible();
    await expect(schedule.getByLabel('Final estimate')).toBeVisible();
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

  test('an unset start day reads in the app’s words, not mm/dd/yyyy (F-059)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlan(page);
    const starts = page.getByLabel('Project start date');
    await starts.fill('');
    await starts.press('Enter');
    await expect(starts).toHaveValue('');
    await starts.blur();
    // Proof: on 2026-10-14, before the empty overlay, this failed on `element(s) not found`
    // — the browser's own `mm/dd/yyyy` was the only text in the box.
    await expect(page.locator('[data-start-day]')).toHaveText('No start date');
    const ink = await starts.evaluate((node) => getComputedStyle(node).color);
    expect(ink, 'the native mm/dd/yyyy shows under the words').toBe('rgba(0, 0, 0, 0)');

    // The native control stays reachable: a click lands on it and the keyboard types a day.
    await page.locator('[data-start-day]').click({ force: true });
    await expect(starts).toBeFocused();
    await expect(page.locator('[data-start-day]')).toBeHidden();
    await starts.fill('2026-09-21');
    await starts.press('Enter');
    await starts.blur();
    await expect(page.locator('[data-start-day]')).toHaveText('21 Sep 2026');
  });
});
