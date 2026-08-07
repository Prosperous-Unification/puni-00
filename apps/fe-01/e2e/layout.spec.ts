import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import { type Box, findOverlap, findOverrun } from '../src/components/wbs/box-geometry';
import { PINNED_COLUMNS, pinnedGeometry } from '../src/components/wbs/table-frame';

/**
 * The layout gate.
 *
 * The overlap this change removes shipped because nothing with a rendering
 * engine ever saw the table: jsdom lays nothing out, so every unit test in
 * `wbs-table.test.tsx` could watch the right rules arrive on the right
 * elements while a pinned Name painted straight over "Depends on". This is the
 * one spec that measures rectangles.
 *
 * Everything here is arithmetic on `getBoundingClientRect`, deliberately: no
 * pixel diffing, no screenshot baseline. A baseline would fail on a font
 * update and pass on the bug. The screenshot this run leaves behind is a
 * diagnostic and the thing widths get judged from by eye — it is not an
 * assertion.
 *
 * Each test seeds its own account and its own plan. That is two seconds a test
 * against a local stack, and it buys the thing that matters when this fails in
 * CI on a machine nobody can reproduce: eight independent reports rather than
 * one failure and seven skips.
 */

/** How far the frame is scrolled sideways for the sticky half of the checks. */
const SCROLLED = 400;

/** The columns held at the left edge, and the offsets they are held at. */
const PINNED_IDS = PINNED_COLUMNS.map((pinned) => pinned.id);

/**
 * Where the pinned column with this id is declared to sit, in px from the
 * frame's left edge.
 *
 * Read from `table-frame.ts` rather than written out here on purpose, and the
 * limit of that is worth stating: this spec cannot catch a width table that is
 * wrong in itself, because the browser is being asked to agree with the same
 * numbers. `table-frame.test.ts` pins the literals; what a browser adds is
 * whether the layout it produces *matches* the declaration — which is exactly
 * what drifted in the bug, and what no amount of unit testing could see.
 *
 * @throws When asked about a column that is not pinned, which would otherwise
 * compare a measured offset against nothing at all.
 */
function declaredLeft(columnId: string): number {
  const geometry = pinnedGeometry(columnId);
  if (geometry === undefined) throw new Error(`${columnId} is not a pinned column`);
  return geometry.left;
}

/**
 * Signs up a throwaway account and builds the smallest plan that exercises
 * every kind of cell: two rows with names long enough to wrap, one dependency
 * chip, one estimate.
 *
 * Through the UI rather than through the API, because half of what is being
 * measured is what the controls inside the cells do to them — a chip list that
 * wraps, a textarea that grew to fit its name — and none of that exists in a
 * plan seeded behind the table's back.
 */
async function seedPlan(page: Page, account: string): Promise<void> {
  await page.goto('/');

  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('layout-gate-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  const addRow = page.getByRole('button', { name: 'Add work item' });
  await addRow.click();
  await expect(page.getByLabel('Name of 010')).toBeVisible();
  await addRow.click();
  await expect(page.getByLabel('Name of 020')).toBeVisible();

  // Long enough to wrap in a 360px column, which is the case the name cell was
  // widened for and the one an unwrapped `22em` textarea used to run out of.
  const first = page.getByLabel('Name of 010');
  await first.fill('Survey the existing warehouse racking and photograph every aisle end');
  await first.blur();
  const second = page.getByLabel('Name of 020');
  await second.fill('Draft the replacement layout, including the mezzanine access stairs');
  await second.blur();

  const depends = page.getByLabel('Add a dependency to 020');
  await depends.click();
  await depends.fill('010');
  await depends.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop 020 waiting for 010' })).toBeVisible();

  const estimate = page.getByLabel('Dev estimate for 010');
  await estimate.fill('2/3/8');
  await estimate.blur();
  await expect(estimate).not.toHaveValue('');
}

/** Puts the frame at `scrollLeft`, deterministically — never a wheel gesture. */
async function scrollFrameTo(page: Page, scrollLeft: number): Promise<void> {
  const reached = await page.evaluate((left) => {
    const frame = document.querySelector('[data-table-frame]');
    if (frame === null) throw new Error('the scrolling frame is not on the page');
    frame.scrollLeft = left;
    return frame.scrollLeft;
  }, scrollLeft);
  // Asserted rather than assumed: a frame that cannot scroll that far leaves
  // `scrollLeft` at its maximum, and every sticky assertion below would then
  // be made about an unscrolled table and pass without meaning anything.
  expect(reached).toBe(scrollLeft);
}

/** Every cell of every row matching this selector, in DOM order, as boxes. */
function rowBoxes(page: Page, rowsSelector: string): Promise<Box[][]> {
  return page.evaluate((selector) => {
    const rows = [...document.querySelectorAll(selector)];
    if (rows.length === 0) throw new Error(`no rows matched ${selector}`);
    return rows.map((row) =>
      [...row.querySelectorAll('th, td')].map((cell) => {
        const box = cell.getBoundingClientRect();
        return {
          id: cell.getAttribute('data-column') ?? '(a cell with no data-column)',
          x: box.x,
          width: box.width,
        };
      }),
    );
  }, rowsSelector);
}

/** Every control in a body cell, paired with the cell it has to stay inside. */
function controlBoxes(page: Page): Promise<{ cell: Box; control: Box }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('tbody td')].flatMap((cell) => {
      const cellBox = cell.getBoundingClientRect();
      const column = cell.getAttribute('data-column') ?? '(a cell with no data-column)';
      // Inputs and textareas, which is every control in this table that has
      // ever asserted a width of its own. Not the chip buttons: those wrap
      // onto a second line rather than overrunning, and the cell is what
      // reflows around them.
      return [...cell.querySelectorAll('input, textarea')].map((control) => {
        const box = control.getBoundingClientRect();
        return {
          cell: { id: column, x: cellBox.x, width: cellBox.width },
          control: {
            id: `${control.getAttribute('aria-label') ?? control.tagName} in ${column}`,
            x: box.x,
            width: box.width,
          },
        };
      });
    }),
  );
}

/** Where the three pinned columns actually sit, in px from the frame's edge. */
function measuredLefts(page: Page, columnIds: readonly string[]): Promise<Record<string, number>> {
  return page.evaluate((ids) => {
    const frame = document.querySelector('[data-table-frame]');
    if (frame === null) throw new Error('the scrolling frame is not on the page');
    const edge = frame.getBoundingClientRect().x;
    const lefts: Record<string, number> = {};
    for (const id of ids) {
      const cell = document.querySelector(`tbody tr:first-child td[data-column="${id}"]`);
      if (cell === null) throw new Error(`the first row has no ${id} cell`);
      // Rounded to the nearest pixel, which states the half-pixel tolerance as
      // a comparison a failure message can print: `{name: 208}` against
      // `{name: 196}` says what moved and by how much.
      lefts[id] = Math.round(cell.getBoundingClientRect().x - edge);
    }
    return lefts;
  }, columnIds);
}

let account = 0;

test.beforeEach(async ({ page }) => {
  account += 1;
  await seedPlan(page, `e2e-${String(Date.now())}-${String(account)}`);
});

test.describe('the table, measured by a browser', () => {
  test('leaves a picture of the table for the eye that has to judge the widths', async ({
    page,
  }, testInfo) => {
    // The one artifact here that is not an assertion. Widths were settled by
    // eye before this gate existed; this is how the next person sees what CI
    // saw without a browser of their own.
    const picture = join(testInfo.project.outputDir, 'wbs-table.png');
    await page.screenshot({ path: picture });
    expect(existsSync(picture)).toBe(true);
  });

  test('lays the heading row out with no two cells on top of each other', async ({ page }) => {
    await scrollFrameTo(page, 0);
    const [heading] = await rowBoxes(page, 'thead tr');
    // Or an empty list would satisfy `findOverlap` without a table being laid
    // out at all. Twelve fixed columns plus a folded column per role.
    expect(heading.length).toBeGreaterThan(12);
    expect(findOverlap(heading)).toBe(undefined);
  });

  test('lays every body row out with no two cells on top of each other', async ({ page }) => {
    await scrollFrameTo(page, 0);
    const rows = await rowBoxes(page, 'tbody tr');
    expect(rows.flat().length).toBeGreaterThan(24);
    expect(rows.map((row) => findOverlap(row)).filter((found) => found !== undefined)).toEqual([]);
  });

  test('keeps every control inside the cell it belongs to', async ({ page }) => {
    await scrollFrameTo(page, 0);
    const controls = await controlBoxes(page);
    // Or an empty table would satisfy the assertion below without laying
    // anything out at all. Two rows of this plan hold well over a dozen boxes.
    expect(controls.length).toBeGreaterThan(12);
    expect(
      controls
        .filter(({ cell, control }) => findOverrun(cell, control) !== undefined)
        .map(({ cell, control }) => `${control.id} runs past the ${cell.id} cell`),
    ).toEqual([]);
  });

  test('puts the pinned columns exactly where they are declared to sit', async ({ page }) => {
    await scrollFrameTo(page, 0);
    expect(await measuredLefts(page, PINNED_IDS)).toEqual({
      drag: declaredLeft('drag'),
      number: declaredLeft('number'),
      name: declaredLeft('name'),
    });
  });

  test('holds the pinned columns there once the table is scrolled sideways', async ({ page }) => {
    // The invariant that drifted in the bug. Sticky offsets are prefix sums of
    // the declared widths, so a column laid out wider than it was declared
    // moves the pin and nothing else — visible only once something scrolls
    // behind it.
    await scrollFrameTo(page, SCROLLED);
    expect(await measuredLefts(page, PINNED_IDS)).toEqual({
      drag: declaredLeft('drag'),
      number: declaredLeft('number'),
      name: declaredLeft('name'),
    });
  });

  test('paints the pinned block over the row that scrolls behind it, and stops there', async ({
    page,
  }) => {
    await scrollFrameTo(page, SCROLLED);
    // `elementFromPoint`, not a sweep over the boxes. Once the frame is
    // scrolled, unpinned cells legitimately sit *underneath* the pinned block
    // — that is what sticky columns are — so their rectangles overlap by
    // design and an adjacent-pair check would fail on a correct paint. The
    // only question worth asking is which cell owns the pixel on each side of
    // the pinned block's right edge.
    const edge = await page.evaluate(() => {
      const name = document.querySelector('tbody tr:first-child td[data-column="name"]');
      if (name === null) throw new Error('the first row has no name cell');
      const box = name.getBoundingClientRect();
      const middle = box.y + box.height / 2;
      const columnAt = (x: number) =>
        document.elementFromPoint(x, middle)?.closest('td')?.getAttribute('data-column') ?? null;
      return { inside: columnAt(box.right - 2), outside: columnAt(box.right + 2) };
    });

    expect(edge.inside).toBe('name');
    // Non-null and unpinned: a null means the probe missed the table entirely,
    // and a pinned id means the pinned block is painting past its own width.
    expect(PINNED_IDS.map(String)).not.toContain(edge.outside ?? 'nothing at all');
  });

  test('walks the row with Tab in the order the cells are in the DOM', async ({ page }) => {
    // The production grid's own selector, `readonly` and `disabled` included:
    // a parent's rolled-up figures and the earliest-start cell of a plan with
    // no start date are both deliberately stepped over, and a walk that
    // expected them would fail on correct behaviour.
    const expected = await page.evaluate(() => {
      const row = document.querySelector('tbody tr');
      if (row === null) throw new Error('the plan has no rows');
      return [...row.querySelectorAll('[data-cell]:not([readonly]):not([disabled])')].map((cell) =>
        cell.getAttribute('data-cell'),
      );
    });
    expect(expected.length).toBeGreaterThan(4);

    await page.evaluate(() => {
      const name = document.querySelector<HTMLTextAreaElement>('tbody tr [data-cell$="::name"]');
      if (name === null) throw new Error('the first row has no name cell');
      name.focus();
      // The caret at the end, never at zero. At position zero Tab is the
      // outliner's indent — deliberately kept — and a walk started there would
      // restructure the plan instead of moving.
      name.setSelectionRange(name.value.length, name.value.length);
    });

    const walked: (string | null)[] = [];
    for (let step = 0; step < expected.length; step += 1) {
      if (step > 0) await page.keyboard.press('Tab');
      walked.push(
        await page.evaluate(() => document.activeElement?.getAttribute('data-cell') ?? null),
      );
    }

    expect(walked).toEqual(expected);
  });
});

/*
 * PROVING THIS GATE CAN FAIL — to be run in CI before this change merges.
 *
 * There is no browser on the machine this spec was written on, so none of the
 * three faults below has been watched failing yet. AGENTS.md R5 says a check
 * whose failure mode has never been observed is a claim rather than a gate, so
 * these are written as instructions and `verify.md` records them as pending
 * until CI has run them. Each is one line; push it on a scratch branch, read
 * the `pixels` job, revert.
 *
 * FAULT A — a control that asserts a width of its own, in a column too narrow
 * for it. This is the fault class the change removes.
 *   `table-frame.ts`:  ['name', 360]  ->  ['name', 100]
 *   `wbs-table.tsx`:   the Name cell's `width: '100%'`  ->  `width: '22em'`
 * Expected: `keeps every control inside the cell it belongs to` fails, naming
 * `Name of 010 runs past the name cell`. The adjacency tests do NOT fail on
 * this, and that is not a gap: a table never lays two cells on top of each
 * other, so a control overrunning its column is only ever visible as
 * containment. Anyone reading this fault as "the overlap test would catch it"
 * has the wrong test in mind.
 *
 * FAULT B — two width tables again, which is the bug that shipped.
 *   `table-frame.ts`: replace the derived `PINNED_COLUMNS` with literals,
 *   `[{ id: 'drag', width: 28 }, { id: 'number', width: 180 }, { id: 'name', width: 360 }]`
 * Expected: `lays every body row out with no two cells on top of each other`
 * and the heading-row test both fail — Name is pinned at 208 while the
 * colgroup lays it out at 196, so it sits 12px into "Depends on" even
 * unscrolled. `table-frame.test.ts` catches this one too; the point of running
 * it here is that this spec sees it in the paint rather than in the numbers.
 *
 * FAULT C — the pin itself.
 *   `table-frame.ts`: drop `position: 'sticky'` from `pinnedCellStyle`.
 * Expected: `holds the pinned columns there once the table is scrolled
 * sideways` fails (the measured lefts come back negative, having scrolled
 * away), and `paints the pinned block over the row that scrolls behind it`
 * fails with `inside` naming some other column.
 */
