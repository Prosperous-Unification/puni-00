import { expect, type Page, test } from '@playwright/test';

/**
 * The plan as one surface, measured by a browser.
 *
 * Two claims, and neither of them can be made anywhere else. jsdom lays nothing
 * out, so "the chart sits under the last row rather than at the bottom of the
 * window" and "the chart is showing the row the table is showing" are both
 * claims about boxes a rendering engine put somewhere.
 *
 * Both come from the Browser Use Cloud audit of 2026-08-11
 * (`notes/wbs-cloud-test-run-2026-08-11.md`, Group C):
 *
 * - "508px dead white space on small plans (Gantt docked to viewport bottom)."
 * - "Table and Gantt scroll independently — can never read row N beside bar N;
 *   Gantt papers over it with a duplicate truncated 176px label column."
 *
 * `header.spec.ts` still owns the other half of the frame's height — that a
 * plan **taller** than the window still ends the frame at the bottom of it —
 * and this file asserts the same thing once more with the chart open, because
 * the chart is the sibling the frame now shares its column with.
 */

/**
 * How far a measured edge may be from where the arithmetic says, in CSS px.
 *
 * Two, not one: the numbers being compared here are two elements' rects against
 * each other rather than a rect against an integer, and a fractional row height
 * lands in both of them.
 */
const NEARLY = 2;

/** A plan short enough that the frame could never be filled by it. */
const SHORT_PLAN = 3;

/**
 * A plan taller than any frame this file produces, so a scroll is a real one.
 *
 * `header.spec.ts` measured twenty-three against a frame with no chart under
 * it; the chart takes a share of the same column, so the frame here is smaller
 * and twenty-three is past it with room to spare. The tests assert it rather
 * than trusting it.
 */
const TALL_PLAN = 23;

/** Signs up a throwaway account and opens a project with `rows` work items. */
async function seedPlan(page: Page, account: string, rows: number): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('plan-surface-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();

  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (let added = 0; added < rows; added += 1) {
    const number = String((added + 1) * 10).padStart(3, '0');
    await addRow.click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }
  // One estimate, so the chart has a mark on it as well as rows. A chart of
  // nothing but labels would still carry every measurement below, and it would
  // also be a chart nobody would ever have opened.
  const estimate = page.getByLabel('Dev estimate for 010');
  await estimate.fill('2/4/6');
  await estimate.blur();
  await expect(estimate).not.toHaveValue('');
}

/** Opens the chart and waits until it has drawn the plan's rows. */
async function openTheChart(page: Page, rows: number): Promise<void> {
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.locator('[data-gantt-chart]')).toBeVisible();
  // The invariant the whole link is built on, asserted where it is cheapest:
  // the chart draws exactly the rows the plan draws. Every measurement below
  // pairs a row with a label, and a chart one row short would pair them off by
  // one instead of failing.
  await expect(page.locator('[data-gantt-label]')).toHaveCount(rows);
}

/** Where the column has put the frame, the chart and the last row of the plan. */
function measureSurface(page: Page): Promise<{
  gap: number;
  pickerRoom: number;
  belowTable: number;
  belowLastRow: number;
  panelMinusFrame: number;
  belowChart: number;
  frameBottom: number;
  chartTop: number;
  windowHeight: number;
  pageOverflow: number;
  rowsPastTheFrame: number;
}> {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-table-frame]');
    const panel = document.querySelector('[data-gantt-panel]');
    if (frame === null) throw new Error('the scrolling frame is not on the page');
    if (panel === null) throw new Error('the chart is not on the page');
    const rows = [...frame.querySelectorAll('tbody tr[data-row-id]')];
    const last = rows.at(-1);
    if (last === undefined) throw new Error('the plan has no rows to measure');
    const frameBox = frame.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const room = Number.parseFloat(getComputedStyle(frame).paddingBottom);
    return {
      // What the audit measured: the white space between the plan's last row
      // and the top of the chart.
      gap: panelBox.top - last.getBoundingClientRect().bottom,
      pickerRoom: room,
      belowTable: frameBox.bottom - (frame.querySelector('table')?.getBoundingClientRect().bottom ?? 0),
      belowLastRow: (frame.querySelector('table')?.getBoundingClientRect().bottom ?? 0) - last.getBoundingClientRect().bottom,
      panelMinusFrame: panelBox.top - frameBox.bottom,
      belowChart: document.documentElement.clientHeight - panelBox.bottom,
      frameBottom: frameBox.bottom,
      chartTop: panelBox.top,
      windowHeight: document.documentElement.clientHeight,
      pageOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      // How much of the plan is past the bottom of the frame, which is what
      // says a measurement of a scrolled frame is not a measurement of a frame
      // that had nowhere to scroll.
      rowsPastTheFrame: frame.scrollHeight - frame.clientHeight,
    };
  });
}

/**
 * Which row the table is showing first, and where the chart's copy of that same
 * row stands.
 *
 * The row is found by a linear scan on purpose: `plan-scroll-link.ts` finds it
 * by a binary search, and a check that ran the same search over the same rects
 * would be the module agreeing with itself. What is asserted is only the
 * consequence — the two faces are showing one row, cut by the same amount.
 */
function measureAgreement(page: Page): Promise<{
  id: string;
  index: number;
  underTheHeading: number;
  underTheAxis: number;
  panelScrollLeft: number;
  frameScrollLeft: number;
  frameScrollTop: number;
  panelScrollTop: number;
  focused: string;
}> {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-table-frame]');
    const panel = document.querySelector('[data-gantt-panel]');
    if (frame === null || panel === null) throw new Error('the plan is not drawn twice');
    const heading = frame.querySelector('thead');
    const axis = panel.querySelector('[data-gantt-axis]');
    if (heading === null || axis === null) throw new Error('one of the two faces has no heading');
    const headingBottom = heading.getBoundingClientRect().bottom;
    const rows = [...frame.querySelectorAll('tbody tr[data-row-id]')];
    const shown = rows.find((row) => row.getBoundingClientRect().bottom > headingBottom + 1);
    if (shown === undefined) throw new Error('the table is showing no row at all');
    const id = shown.getAttribute('data-row-id') ?? '';
    const label = panel.querySelector(`[data-gantt-label="${id}"]`);
    if (label === null) throw new Error(`the chart draws no row ${id}`);
    return {
      id,
      index: rows.indexOf(shown),
      // How far each face's copy of that one row has gone under its own
      // heading. Equal means the two faces are showing the same thing.
      underTheHeading: shown.getBoundingClientRect().top - headingBottom,
      underTheAxis: label.getBoundingClientRect().top - axis.getBoundingClientRect().bottom,
      panelScrollLeft: panel.scrollLeft,
      frameScrollLeft: frame.scrollLeft,
      frameScrollTop: frame.scrollTop,
      panelScrollTop: panel.scrollTop,
      focused: document.activeElement?.getAttribute('aria-label') ?? String(document.activeElement?.tagName),
    };
  });
}

/** Turns the wheel over an element's middle, and lets the scroll settle. */
async function wheelOver(page: Page, selector: string, downBy: number): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} is not on the page to scroll`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, downBy);
  // The link runs inside the scroll event, so one frame after the wheel is
  // enough — this waits for a paint rather than for a duration.
  await page.evaluate(
    () => new Promise((settled) => requestAnimationFrame(() => requestAnimationFrame(settled))),
  );
}

let account = 0;
/** The account this test registered, unique per run and per case. */
let signedInAs = '';

test.beforeEach(({}, testInfo) => {
  account += 1;
  signedInAs = `surface-${String(Date.now())}-${String(account)}`;
  testInfo.setTimeout(testInfo.timeout + 30_000);
});

test.describe('the plan and its chart as one surface', () => {
  test('docks the chart under the last row rather than at the bottom of the window', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPlan(page, signedInAs, SHORT_PLAN);
    await openTheChart(page, SHORT_PLAN);
    const measured = await measureSurface(page);

    // Or the frame was full and there was never any dead space to reclaim.
    expect(
      measured.rowsPastTheFrame,
      'the seeded plan fills its frame, so this measures nothing',
    ).toBe(0);
    // The audit measured 508px of nothing here. What is left is the frame's own
    // picker room, which is the space a dependency list on the last row opens
    // into — functional space, and the one thing between the two faces.
    expect(
      measured.gap,
      `gap ${String(measured.gap)} room ${String(measured.pickerRoom)} belowTable ${String(measured.belowTable)} belowLastRow ${String(measured.belowLastRow)} panelMinusFrame ${String(measured.panelMinusFrame)}`,
    ).toBeLessThanOrEqual(measured.pickerRoom + NEARLY);
    // And the space that was between them is now under the chart, which is what
    // says the chart came up rather than the plan going down.
    expect(
      measured.belowChart,
      'the chart is still docked to the bottom of the window',
    ).toBeGreaterThan(100);
    expect(measured.pageOverflow, 'the page scrolls vertically behind the frame').toBe(0);
  });

  test('still ends the chart at the bottom of the window when the plan fills the frame', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPlan(page, signedInAs, TALL_PLAN);
    await openTheChart(page, TALL_PLAN);
    const measured = await measureSurface(page);

    // The half the shrink keeps: a plan past the remainder still gets the whole
    // remainder, and the frame is still the thing that scrolls.
    expect(
      measured.rowsPastTheFrame,
      'the seeded plan is shorter than the frame, so nothing here is being shrunk',
    ).toBeGreaterThan(0);
    expect(
      measured.belowChart,
      `the column stops ${String(Math.round(measured.belowChart))}px short of the window`,
    ).toBeLessThanOrEqual(16);
    // The two faces are adjacent, which is the other half of one surface: the
    // frame ends exactly where the chart begins.
    expect(measured.chartTop - measured.frameBottom).toBeLessThanOrEqual(NEARLY);
    expect(measured.pageOverflow, 'the page scrolls vertically behind the frame').toBe(0);
  });

  test('takes the chart to the row the table was scrolled to', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPlan(page, signedInAs, TALL_PLAN);
    await openTheChart(page, TALL_PLAN);

    const atRest = await measureAgreement(page);
    // Both faces start on the first row, so a check that only ever compared
    // them would pass on a link that does nothing at all.
    expect(atRest.index, 'the plan does not open on its first row').toBe(0);

    await wheelOver(page, '[data-table-frame]', 8 * 28);
    const scrolled = await measureAgreement(page);

    expect(scrolled.index, `frameTop ${String(scrolled.frameScrollTop)} panelTop ${String(scrolled.panelScrollTop)}`).toBeGreaterThan(0);
    expect(
      scrolled.underTheAxis,
      `the table is showing ${scrolled.id} and the chart is ${String(
        Math.round(scrolled.underTheAxis - scrolled.underTheHeading),
      )}px off it`,
    ).toBeCloseTo(scrolled.underTheHeading, 0);
  });

  test('takes the table to the row the chart was scrolled to', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPlan(page, signedInAs, TALL_PLAN);
    await openTheChart(page, TALL_PLAN);

    expect((await measureAgreement(page)).index).toBe(0);
    await wheelOver(page, '[data-gantt-panel]', 5 * 28);
    const scrolled = await measureAgreement(page);

    // Neither face is the master: a wheel over the chart is as much a scroll of
    // the plan as a wheel over the table.
    expect(scrolled.index, 'the wheel did not scroll the chart').toBeGreaterThan(0);
    expect(scrolled.underTheAxis).toBeCloseTo(scrolled.underTheHeading, 0);
  });

  test('follows the keyboard down the plan, and leaves the focus where it walked to', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPlan(page, signedInAs, TALL_PLAN);
    await openTheChart(page, TALL_PLAN);

    // Ctrl+J is the plan's own "next row, same column", and a browser scrolls
    // the cell it focuses into view — which is the third way this surface is
    // scrolled and the one that must not cost anybody their place.
    await page.getByLabel('Name of 010').focus();
    for (let step = 0; step < 15; step += 1) {
      await page.keyboard.press('Control+j');
    }
    await page.evaluate(
      () => new Promise((settled) => requestAnimationFrame(() => requestAnimationFrame(settled))),
    );
    const walked = await measureAgreement(page);

    // The walk reached a cell the frame had to scroll for, or this says nothing
    // about scrolling.
    expect(walked.index, `frameTop ${String(walked.frameScrollTop)} panelTop ${String(walked.panelScrollTop)} focus ${walked.focused}`).toBeGreaterThan(0);
    expect(walked.underTheAxis).toBeCloseTo(walked.underTheHeading, 0);
    // And the cell it walked to still has the focus. A link that scrolled by
    // `scrollIntoView` on the other face, or that moved the focus to bring a
    // row into view, would take the reader out of the cell they were typing in.
    await expect(page.getByLabel('Name of 160')).toBeFocused();
  });

  test('never moves either face sideways for the other', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPlan(page, signedInAs, TALL_PLAN);
    await openTheChart(page, TALL_PLAN);

    // An unfolded role is what makes the frame scroll sideways at all
    // (`unfolding-may-scroll`), and the chart's own sideways position is which
    // fortnight of the calendar it is showing. The two are different facts and
    // the link is not allowed to confuse them.
    await page.getByRole('button', { name: 'Unfold Dev estimates', exact: true }).click();
    await page.evaluate(() => {
      const frame = document.querySelector('[data-table-frame]');
      const panel = document.querySelector('[data-gantt-panel]');
      if (frame === null || panel === null) throw new Error('the plan is not drawn twice');
      frame.scrollLeft = 240;
      panel.scrollLeft = 0;
    });
    await wheelOver(page, '[data-table-frame]', 8 * 28);
    const scrolled = await measureAgreement(page);

    expect(scrolled.index, 'the wheel did not scroll the table').toBeGreaterThan(0);
    expect(scrolled.underTheAxis).toBeCloseTo(scrolled.underTheHeading, 0);
    // The frame kept the columns it was scrolled to, and the calendar did not
    // move under a caption that names the month at its left edge.
    expect(scrolled.frameScrollLeft, 'the table lost the columns it was scrolled to').toBe(240);
    expect(scrolled.panelScrollLeft, 'the chart was scrolled sideways by the table').toBe(0);
  });
});
