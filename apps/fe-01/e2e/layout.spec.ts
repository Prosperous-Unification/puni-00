import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type Page, test } from '@playwright/test';

import { type Box, findOverlap, findOverrun } from '../src/components/wbs/box-geometry';
import { PINNED_COLUMNS, pinnedGeometry, widthFor } from '../src/components/wbs/table-frame';

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

/**
 * Which column the width table declares at `tableX` px from the table's own
 * left edge, given the columns this plan is showing in the order it shows them.
 *
 * @throws When no column covers that offset — a probe past the right edge of
 * the declared table would otherwise be compared against nothing at all.
 */
function declaredColumnAt(order: readonly string[], tableX: number): string {
  let right = 0;
  for (const id of order) {
    right += widthFor(id);
    if (tableX < right) return id;
  }
  throw new Error(`${String(Math.round(tableX))}px is past the right edge of the declared table`);
}

/**
 * How far a popover opened in `columnId` on the first row hangs below that
 * cell, and whether the pixels below the cell are really its own.
 *
 * Both halves are needed and neither is the other. `getBoundingClientRect` is
 * **not** clipped by an ancestor's `overflow: hidden` — a listbox cut off at
 * the cell edge still reports its full height — so the overhang is only the
 * precondition that makes the probe meaningful. `elementFromPoint` is hit
 * testing, and hit testing does respect the clip: it is what says the popover
 * is visible rather than merely laid out.
 */
function popoverEscape(
  page: Page,
  columnId: string,
  popoverSelector: string,
): Promise<{ overhang: number; ownsPixelBelow: boolean; found: string }> {
  return page.evaluate(
    ({ column, selector }) => {
      const popover = document.querySelector(
        `tbody tr:first-child td[data-column="${column}"] ${selector}`,
      );
      if (popover === null) {
        throw new Error(`no ${selector} is open in the first row's ${column} cell`);
      }
      const cell = popover.closest('td');
      if (cell === null) throw new Error(`the ${column} popover is not in a cell`);
      const popoverBox = popover.getBoundingClientRect();
      const cellBox = cell.getBoundingClientRect();
      const at = document.elementFromPoint(popoverBox.x + popoverBox.width / 2, cellBox.bottom + 4);
      return {
        overhang: Math.round(popoverBox.bottom - cellBox.bottom),
        ownsPixelBelow: at !== null && popover.contains(at),
        // What is at that pixel instead, for the failure message: a clipped
        // popover leaves the row underneath showing through.
        found:
          at === null
            ? 'nothing at all'
            : `<${at.tagName.toLowerCase()}> in the ${
                at.closest('td')?.getAttribute('data-column') ?? 'no'
              } column`,
      };
    },
    { column: columnId, selector: popoverSelector },
  );
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
      const row = document.querySelector('tbody tr:first-child');
      if (row === null) throw new Error('the plan has no rows');
      const name = row.querySelector('td[data-column="name"]');
      if (name === null) throw new Error('the first row has no name cell');
      const frame = document.querySelector('[data-table-frame]');
      if (frame === null) throw new Error('the scrolling frame is not on the page');
      const box = name.getBoundingClientRect();
      const middle = box.y + box.height / 2;
      const columnAt = (x: number) =>
        document.elementFromPoint(x, middle)?.closest('td')?.getAttribute('data-column') ?? null;
      return {
        inside: columnAt(box.right - 2),
        outside: columnAt(box.right + 2),
        // The outside probe in the table's own coordinates, so the id painted
        // there can be held against the id the width table declares for it.
        outsideAt: box.right + 2 - frame.getBoundingClientRect().x + frame.scrollLeft,
        order: [...row.querySelectorAll('td')].map(
          (cell) => cell.getAttribute('data-column') ?? '(a cell with no data-column)',
        ),
      };
    });

    expect(edge.inside).toBe('name');
    // Three assertions where there was one, because the one they replace could
    // not fail. `expect(PINNED_IDS).not.toContain(edge.outside ?? 'nothing at
    // all')` passed when the probe found *nothing* — and a pinned block
    // painting over the whole row, or a table that never laid out, is exactly
    // what "nothing at all" looks like.
    expect(edge.outside, 'no cell owns the pixel past the pinned block').not.toBeNull();
    // Not a pinned column: that is the pinned block painting past its own
    // declared width, which is the fault this probe exists for.
    expect(PINNED_IDS.map(String)).not.toContain(edge.outside);
    // And it is the column the width table puts at that offset. Not written
    // out as `depends`: `depends` is the first unpinned column, but by
    // `SCROLLED` px it has scrolled in behind the pinned block along with
    // `team`, so which column shows at the block's right edge is a fact about
    // the declared widths — computed from them here, the same way the pinned
    // offsets are.
    expect(edge.outside).toBe(declaredColumnAt(edge.order, edge.outsideAt));
  });

  test('opens the dependency list out past the bottom of its own cell', async ({ page }) => {
    await scrollFrameTo(page, 0);
    // Two more rows first. The list 010 can depend on holds one entry in the
    // seeded pair, and one line is short enough to fit inside a cell made tall
    // by a wrapped name — which would leave the escape below with nothing to
    // measure. Three entries cannot fit.
    const addRow = page.getByRole('button', { name: 'Add work item' });
    await addRow.click();
    await expect(page.getByLabel('Name of 030')).toBeVisible();
    await addRow.click();
    await expect(page.getByLabel('Name of 040')).toBeVisible();

    await page.getByLabel('Add a dependency to 010').click();
    await expect(page.getByRole('listbox')).toBeVisible();

    const escape = await popoverEscape(page, 'depends', '[role="listbox"]');
    // Or the probe below the cell is a probe of empty space, and "the list
    // owns that pixel" would be a question nobody asked.
    expect(escape.overhang).toBeGreaterThan(8);
    expect(
      escape.ownsPixelBelow,
      `4px below the depends cell is ${escape.found}, not the open list`,
    ).toBe(true);
  });

  test('opens the notes preview out past the bottom of the name cell', async ({ page }) => {
    // The notes are written under the name, in the Name cell, and the rendered
    // preview hangs off that cell now — which is a pinned column, so this is
    // also where "pinned" and "must not clip" are asked to hold at once.
    const name = page.getByLabel('Name of 010');
    // A name and three paragraphs under it, so the rendered preview is taller
    // than the box it hangs off — the same reason the dependency list above is
    // given three entries. The cap on the box is what makes that true: it
    // shows four lines at rest and the preview holds the rest.
    await name.fill(
      'Racking survey\nAisle ends photographed\n\nMezzanine measured\n\nFire doors checked\n\nSprinkler heads counted',
    );
    await name.blur();
    await name.hover();
    await expect(page.getByRole('tooltip', { name: 'Notes for 010, rendered' })).toBeVisible();

    const escape = await popoverEscape(page, 'name', '[role="tooltip"]');
    expect(escape.overhang).toBeGreaterThan(8);
    expect(
      escape.ownsPixelBelow,
      `4px below the name cell is ${escape.found}, not the preview`,
    ).toBe(true);
  });

  test('moves the caret through a wrapped name before it leaves the row', async ({ page }) => {
    // The one assertion in this change that jsdom cannot make, and the reason
    // the caret rule is "position 0 and the end of the value" rather than
    // "the first and last logical line". This name is ONE logical line, long
    // enough to wrap onto several visual ones in a 360px column: Up pressed in
    // the middle of it must walk the caret up a visual line — the browser's own
    // behaviour — and must not move the focus to the row above.
    const name = page.getByLabel('Name of 020');
    await name.fill(
      'Draft the replacement layout including the mezzanine access stairs, the fire doors, the sprinkler heads and every aisle end that has to be photographed before the racking comes out',
    );
    await name.blur();

    // Wrapped for real, or this test is about a one-line box: the rendered box
    // is taller than a single line of its own font.
    const lines = await name.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
      return Math.round(box.height / lineHeight);
    });
    expect(lines, 'the name has to wrap for this test to be about wrapping').toBeGreaterThan(2);

    // The caret in the middle of the value, which is the middle of a wrapped
    // line rather than the start of a logical one.
    const middle = await name.evaluate((node) => {
      const box = node as HTMLTextAreaElement;
      box.focus();
      const at = Math.floor(box.value.length / 2);
      box.setSelectionRange(at, at);
      return at;
    });

    await page.keyboard.press('ArrowUp');
    await expect(name).toBeFocused();
    const moved = await name.evaluate((node) => (node as HTMLTextAreaElement).selectionStart);
    // The browser moved it, and it moved up rather than to the start: a visual
    // line back is fewer characters than the whole first half of the value.
    expect(moved).toBeLessThan(middle);
    expect(moved).toBeGreaterThan(0);

    // And from position 0 the row above takes the focus, the next press.
    await name.evaluate((node) => {
      (node as HTMLTextAreaElement).setSelectionRange(0, 0);
    });
    await page.keyboard.press('ArrowUp');
    await expect(page.getByLabel('Name of 010')).toBeFocused();
  });

  test('opens a row’s actions menu out past the bottom of its own cell', async ({ page }) => {
    // A row with nothing typed into it, so its cells are one line high and a
    // two-item menu cannot fit inside one — the same reason the dependency list
    // above is given three entries. The seeded rows have wrapped names and are
    // two lines tall.
    await page.getByRole('button', { name: 'Add work item' }).click();
    await expect(page.getByLabel('Name of 030')).toBeVisible();

    const actions = page.getByRole('button', { name: 'Actions for 030' });
    // `actions` is the last column of the table and `elementFromPoint` takes
    // viewport coordinates: unscrolled, the probe would be off screen.
    await actions.scrollIntoViewIfNeeded();
    await actions.click();
    await expect(page.getByRole('menu')).toBeVisible();

    const escape = await popoverEscape(page, 'actions', '[role="menu"]');
    // Or the probe below the cell is a probe of empty space.
    expect(escape.overhang).toBeGreaterThan(8);
    expect(
      escape.ownsPixelBelow,
      `4px below the actions cell is ${escape.found}, not the open menu`,
    ).toBe(true);
  });

  test('drives the actions menu from the keyboard, and gives the focus back', async ({ page }) => {
    // The half jsdom cannot have. `fireEvent` performs no default action, so a
    // unit test can assert that Tab was left alone and that the button holds
    // the focus — but not where the browser's own Tab then carries it, and not
    // that a click on an item lands before the blur closes the menu under it.
    const label = (): Promise<string | null> =>
      page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
    const focusedText = (): Promise<string | null> =>
      page.evaluate(() => document.activeElement?.textContent ?? null);

    const actions = page.getByRole('button', { name: 'Actions for 010' });
    await actions.focus();
    await page.keyboard.press('ArrowDown');

    await expect(page.getByRole('menu')).toBeVisible();
    expect(await focusedText()).toBe('Duplicate');
    await page.keyboard.press('ArrowDown');
    expect(await focusedText()).toBe('Delete');
    await page.keyboard.press('ArrowUp');
    expect(await focusedText()).toBe('Duplicate');

    // Escape closes and hands the focus back to the button it opened from.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await label()).toBe('Actions for 010');

    // Tab out of an open menu is not trapped: the menu closes, the focus goes
    // back to the button, and the browser's own Tab carries it on from there —
    // to the next tab stop in the DOM, which is the next row's Name.
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await label()).toBe('Name of 020');

    // And taking an item leaves the caret where the work carries on: in the
    // copy's Name, which the table asks for once be-01 has taken the copy.
    await actions.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Name of 020')).toHaveValue(
      'Survey the existing warehouse racking and photograph every aisle end (copy)',
    );
    await expect(page.getByLabel('Name of 020')).toBeFocused();
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
 * PROVING THIS GATE CAN FAIL — every fault below has now been watched.
 *
 * Run on h2puni on 2026-08-08, one fault at a time against the real stack and a
 * real chromium, each reverted before the next. What each run reported is in
 * `openspec/changes/table-geometry-and-tab-order/verify.md`; the observed
 * failure is repeated in one line here so the fault and its evidence stay
 * together. Two predictions written before a browser had ever seen this table
 * turned out to be wrong, and both are corrected below rather than quietly
 * dropped — an expectation nobody checked is the same category of claim R5 is
 * about.
 *
 * FAULT A — a control that asserts a width of its own, in a column too narrow
 * for it. This is the fault class the change removes.
 *   `table-frame.ts`:  ['name', 360]  ->  ['name', 100]
 *   `wbs-table.tsx`:   the Name cell's `width: '100%'`  ->  `width: '22em'`
 * Observed: `keeps every control inside the cell it belongs to` failed on
 * `["Name of 010 in name runs past the name cell", "Name of 020 …"]` against
 * `[]`. The adjacency tests did NOT fail on it, as written: a table never lays
 * two cells on top of each other, so a control overrunning its column is only
 * ever visible as containment. Two other tests did fail, for a reason the
 * prediction missed — a 260px-narrower table no longer scrolls 400px, so
 * `scrollFrameTo` failed its own precondition with `expected 400, received
 * 376`. That is the precondition doing its job, not the pin being measured.
 *
 * FAULT B — two width tables again, which is the bug that shipped.
 *   `table-frame.ts`: replace the derived `PINNED_COLUMNS` with literals,
 *   `[{ id: 'drag', width: 28 }, { id: 'number', width: 180 }, { id: 'name', width: 360 }]`
 * Observed: exactly the two adjacency tests failed, both on the same pair —
 * `{id: 'name', x: 248, width: 360}` followed by `{id: 'depends', x: 596}`,
 * Name pinned 12px into "Depends on" with the frame unscrolled.
 * `table-frame.test.ts` catches this one too; the point of running it here is
 * that this spec sees it in the paint rather than in the numbers.
 *
 * FAULT C — the pin itself.
 *   `table-frame.ts`: drop `position: 'sticky'` from `pinnedCellStyle`.
 * Observed: `holds the pinned columns there once the table is scrolled
 * sideways` failed on `{drag: -400, number: -372, name: -204}` against
 * `{drag: 0, number: 28, name: 196}` — the block scrolled away with its row.
 * The prediction that `paints the pinned block over the row that scrolls
 * behind it` would fail with it was WRONG, and it is worth knowing why: that
 * test asks which cell owns the pixel either side of the *measured* right edge
 * of the Name cell, and an unpinned table answers that question correctly —
 * the neighbour is where the declared widths say it is. Losing the pin is
 * invisible to a probe that follows the cell.
 *
 * FAULT C2 — what the probe does see, found by injecting faults until one bit.
 *   `table-frame.ts`: pin `['name', 'number', 'drag']` instead of
 *   `['drag', 'number', 'name']`.
 * Observed: `paints the pinned block over the row that scrolls behind it, and
 * stops there` failed on `expect(PINNED_IDS).not.toContain('number')`, the
 * received array `["name", "number", "drag"]` — a pinned column painting past
 * the block's own right edge, which is the fault that assertion exists for.
 * Two earlier candidates did NOT break it and are recorded because a failed
 * attempt at a negative test is evidence too: dropping `zIndex` from
 * `pinnedCellStyle` (a sticky cell is positioned, so it still paints over the
 * unpositioned cells sliding behind it — the z-indexes only order the sticky
 * elements against each other), and fault C above.
 *
 * FAULT D — the cell clipping the popovers that have to leave it. This is the
 * fault the first version of this change shipped, on a wrong reading of the
 * CSS: an absolutely positioned box escapes an `overflow: hidden` ancestor
 * only when its containing block is *outside* that ancestor, and both popovers'
 * containing block is a wrapper span inside the cell.
 *   `wbs-table.tsx`: drop the `opensAPopover` spread from the `<td>` style.
 * Observed: both popover tests failed on `ownsPixelBelow`, naming what showed
 * through instead — `4px below the depends cell is <input> in the team column,
 * not the open list` and `4px below the notes cell is <textarea> in the notes
 * column, not the preview`. That second observation was made while a Notes
 * column still existed; the preview hangs off the Name cell since 2026-08-08
 * and the same fault has not been re-run against it — see fault G. The
 * overhang assertions did NOT fail, deliberately:
 * `getBoundingClientRect` reports a clipped box at its full unclipped size, so
 * a check written only on the rectangles would pass with both popovers sliced
 * off at the cell edge. That is the vacuous version of this test, and the
 * reason the hit test is the assertion and the overhang only its precondition.
 *
 * THE TWO ACTIONS-MENU TESTS BELOW HAVE NOT BEEN RUN. They were added on
 * 2026-08-08 on a machine with no browser, and the faults for them are written
 * here as instructions rather than as observations —
 * `openspec/changes/actions-menu/verify.md` says so in the same words. Nothing
 * in this file may be read as evidence until the run happens on h2puni.
 *
 * FAULT E — the actions cell clipping the menu that has to leave it. This is
 * the narrowest clip in the table: a 140px menu off a 40px cell one line high.
 *   `wbs-table.tsx`: drop `'actions'` from `POPOVER_COLUMNS`.
 * Expected: `opens a row’s actions menu out past the bottom of its own cell`
 * fails on `ownsPixelBelow`, naming whatever shows through instead. The
 * overhang assertion is expected NOT to fail, for the reason fault D gives.
 *
 * FAULT F — the focus not really moving into the menu.
 *   `actions-menu.tsx`: drop `item.focus()` from the effect that follows the
 *   active item.
 * Expected: `drives the actions menu from the keyboard, and gives the focus
 * back` fails at the first `expect(await focusedText()).toBe('Duplicate')`,
 * with the ⋯ button still holding the focus. The unit tests catch this one too;
 * what only a browser can settle is the two assertions after it — where Tab
 * out of an open menu actually lands, and that a click on an item lands before
 * the blur closes the menu under it.
 *
 * THE TWO NOTES-IN-THE-NAME TESTS HAVE NOT BEEN RUN EITHER. Added on
 * 2026-08-08 on the same machine with no browser;
 * `openspec/changes/notes-live-in-the-name/verify.md` says so in the same
 * words. Faults G and H are instructions, not observations.
 *
 * FAULT G — the Name cell clipping the preview that now hangs off it. It is a
 * pinned column as well, which is the combination nothing has measured.
 *   `wbs-table.tsx`: drop `'name'` from `POPOVER_COLUMNS`.
 * Expected: `opens the notes preview out past the bottom of the name cell`
 * fails on `ownsPixelBelow`, naming what shows through instead. The overhang
 * assertion is expected NOT to fail, for the reason fault D gives.
 *
 * FAULT H — the caret rule written against logical lines instead of the ends
 * of the value, which is what a browser is needed to tell apart.
 *   `cell-navigation.ts`: replace the `caret.multiline` gate's
 *   `caret.atStart` with `!caret.textBefore.includes('\n')` — the rule v1 of
 *   the plan proposed, "leave from the first logical line".
 * Expected: `moves the caret through a wrapped name before it leaves the row`
 * fails at `await expect(name).toBeFocused()`, with the focus on `Name of 010`
 * — the row above taken while the caret still had two visual lines to climb.
 * jsdom cannot see this at all: it wraps nothing, so a name of any length is
 * one visual line there and both rules agree.
 */
