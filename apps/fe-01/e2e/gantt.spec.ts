import { expect, type Locator, type Page, test } from '@playwright/test';

import { calendarScale } from '../src/components/wbs/gantt-geometry';
import { CHART_PAD_PX, DAY_PX, ROW_PX } from '../src/components/wbs/gantt-panel';

/**
 * Types a whole date into a date field and leaves it, which is what saves one.
 *
 * `fill` alone is not a saved date any more, and that is the product's rule
 * rather than an automation quirk: `DateField` holds everything typed while the
 * box has the focus, because a native date input fires a `change` per completed
 * segment and committing each of them saved a plan starting in year 0002. Tab
 * is how a person leaves the box, and the wait afterwards is the refetch that
 * commit starts — a click that lands inside it hits a `disabled` control and
 * goes nowhere (`aria-busy` on the toolbar is that window, said out loud).
 */
async function setDate(page: Page, label: string, day: string): Promise<void> {
  // A row's earliest-start cell is text at rest since `T2 compact-columns` and
  // mounts its editor only for the cell being edited, so it is opened first.
  // The toolbar's project start date is always an editor and is left alone.
  // A click rather than a `mousedown`: React flushes inside the mousedown
  // dispatch and the browser's own focus default then closes what it opened —
  // see `e2e/keyboard.spec.ts`.
  if ((await page.getByLabel(label, { exact: true }).getAttribute('type')) !== 'date') {
    await page.getByLabel(label, { exact: true }).click();
  }
  const box = page.getByLabel(label, { exact: true });
  await expect(box).toHaveAttribute('type', 'date');
  await box.fill(day);
  // `blur`, not `press('Tab')`: Chrome's date input owns Tab for stepping
  // between its own day/month/year segments, so a Tab from the day segment
  // never leaves the field at all — probed here, `document.activeElement` was
  // still the box afterwards. Leaving is what saves, so leaving is what this
  // does.
  //
  // The response is awaited, and the `aria-busy` after it, because the write
  // and the refetch it starts are the window every toolbar control is disabled
  // for — a click that lands inside it is dropped on the floor. Playwright's
  // own "wait until enabled" cannot see that: the button is still enabled at
  // the moment it is checked and goes dead a tick later, which is the same race
  // a person loses by hand.
  const saved = page.waitForResponse((response) => response.request().method() === 'PATCH');
  await box.blur();
  await saved;
  await expect(page.locator('[data-toolbar]')).toHaveAttribute('aria-busy', 'false');
}

/**
 * The Gantt panel, measured by the engine that draws it.
 *
 * `gantt-geometry.test.ts` and `gantt-panel.test.tsx` are 73 tests about
 * **numbers**: that a 3.5→6 slice reaches `x="3.5"`, that a bracket is a span,
 * that a caret's points are above a bar's top edge. Every one of them is an
 * attribute, because jsdom lays nothing out — and this panel's whole contract
 * is a layout. `viewBox="0 0 horizon rowCount"` with
 * `preserveAspectRatio="none"` over a CSS box of `horizon × DAY_PX` by
 * `rowCount × ROW_PX` is a claim about a **transform a browser performs**, and
 * nothing without a rendering engine can be asked whether it holds.
 *
 * Six things live here and nowhere else:
 *
 * 1. **The scale.** That the **calendar day** the engine's workday resolves to
 *    is the pixel the browser draws the bar at, and that the HTML axis cell
 *    above it — a different element, in a different box, positioned by the same
 *    `DAY_PX` — lands on the same edge. jsdom can watch both numbers be
 *    computed and can never watch them meet. The seeded plan reaches past its
 *    own first weekend on purpose; see {@link PAST_THE_WEEKEND}.
 * 2. **The sticky label column.** `position: sticky` is layout, and a rule
 *    that arrives on an element proves only that it arrived.
 * 3. **The page not scrolling sideways**, at 1400 and at 390. The whole reason
 *    the panel has a scroll container of its own.
 * 4. **Click-to-row.** `scrollIntoView` and the focus that follows it are
 *    default actions, and jsdom performs none — the exact shape of R5 faults
 *    #14 and #15, where a synthetic event in jsdom watched a guard be deleted
 *    and could not watch it be left half-done.
 * 5. **The three marks a live Chrome found invisible** on 2026-08-09, after
 *    every one of them was drawn, gated and green: a dependency arrow with no
 *    head, collapsed onto the successor's own left edge whenever the two bars
 *    touched; a not-before flag painted underneath the bar it belongs to; and
 *    a 1px summary bracket. All three were faults of **where** and **how
 *    heavy**, which is to say faults of pixels.
 * 6. **A stroke width.** `[stroke-width:2]` in a class attribute is a string;
 *    `getComputedStyle(...).strokeWidth` is the browser's answer.
 *
 * `DAY_PX` and `ROW_PX` are imported from the panel rather than written out
 * here, the way `layout.spec.ts` imports `table-frame`'s widths: a copy of a
 * constant is a second declaration that agrees until somebody changes one.
 */

/** The Monday the seeded plan begins on, so every workday offset is a weekday. */
const PLAN_START = '2026-08-10';

/**
 * The seeded plan's own scale, imported rather than re-derived here.
 *
 * The pixel a bar is drawn at is `startOf(data-start) × DAY_PX`, and the number
 * it is drawn at is the panel's own answer for the same workday — the two sides
 * of the transform this file exists to measure. A copy of the formula written
 * out here would be a second declaration that agrees until somebody changes one,
 * which is `layout.spec.ts`'s rule about `table-frame`'s widths.
 */
const SCALE = calendarScale(PLAN_START);

/**
 * A three-point estimate wide enough that the plan reaches past its own first
 * weekend.
 *
 * `2/4/6` is four days by PERT, and four workdays from a Monday is still the
 * same week: every calendar offset would equal its workday number and the whole
 * alignment check below would hold just as well on the axis this change
 * replaced. Six days puts the second leaf on the Tuesday after the weekend,
 * where the two numbers are two apart.
 */
const PAST_THE_WEEKEND = '6/6/6';

/**
 * How far a measured edge may be from the edge the arithmetic says, in CSS px.
 *
 * One pixel, and it is a tolerance for sub-pixel layout rather than for drift:
 * everything here runs at `deviceScaleFactor: 1`, and the numbers being
 * compared are a rect from the browser against a product of two integers.
 */
const NEARLY = 1;

/** The row of the plan holding this work item number, on the table face. */
const rowOf = (page: Page, number: string): Locator =>
  page.locator('tbody tr').filter({ has: page.getByLabel(`Name of ${number}`) });

/**
 * Signs up a throwaway account and builds the smallest plan that draws every
 * mark this file measures.
 *
 * Three rows: `010` is a parent, so it draws a summary bracket rather than a
 * bar; `010.1` and `010.2` are its leaves, and `010.2` waits for `010.1`. That
 * dependency is the point — a finish-to-start edge with no lag puts the
 * successor's start **on** the predecessor's finish, which is the commonest
 * shape in any plan and the one whose arrow used to collapse onto the
 * successor's own left edge.
 *
 * The not-before date is read off `010.2`'s own Start cell rather than computed
 * here, so the caret and the bar's left edge are the same workday whatever the
 * estimate is: the adjacency case, which is where the old flag disappeared
 * under the bar. Reading it out of the table also means the constraint does not
 * move the schedule — it names the day the row already starts on.
 *
 * @param page The page to seed, which it also navigates.
 * @param account The username to register, unique per test.
 * @param fixture What the two leaves are given beyond their shape.
 * @param fixture.estimate The three-point Dev estimate both leaves get. `2/4/6`
 * is four days by PERT, which is a small chart and stays inside the plan's
 * first week; the scale tests pass {@link PAST_THE_WEEKEND} and the
 * sticky-label tests one wider than the window.
 * @param fixture.extraRows Roots added after the three, for the tests that need
 * a plan taller than its own frame.
 */
async function seedPlan(
  page: Page,
  account: string,
  fixture: { estimate?: string; extraRows?: number } = {},
): Promise<void> {
  const { estimate = '2/4/6', extraRows = 0 } = fixture;
  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('gantt-gate-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();

  // First, because the Not before field is disabled without a day zero to
  // count from — and a chart of workday offsets has no axis dates to check.
  await setDate(page, 'Project start date', PLAN_START);

  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (const number of ['010', '020', '030']) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }

  // Tab at the caret's home position is the outliner's indent, and it puts the
  // row under its **previous sibling**. Twice on `020` and not on `020` then
  // `030`: indenting the first `020` renumbers what was `030` down to `020`,
  // and the second press then takes that row under `010` as well.
  for (const step of [0, 1]) {
    const box = page.getByLabel('Name of 020');
    await box.focus();
    await box.press('Tab');
    await expect(page.getByLabel(`Name of 010.${String(step + 1)}`)).toBeVisible();
  }

  for (const number of ['010.1', '010.2']) {
    const box = page.getByLabel(`Dev estimate for ${number}`);
    await box.fill(estimate);
    await box.blur();
    await expect(box).not.toHaveValue('');
  }

  const depends = page.getByLabel('Add a dependency to 010.2');
  await depends.click();
  await depends.fill('010.1');
  await depends.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop 010.2 waiting for 010.1' })).toBeVisible();

  // The day be-01 says this row starts, typed back in as the day it may not
  // start before: the caret and the bar's left edge on the same workday.
  // From the cell's `title`, not its text: the columns print `14 Aug` since `T2
  // compact-columns` and carry the whole `YYYY-MM-DD` in the attribute.
  const startsOn = await rowOf(page, '010.2').locator('[data-start]').getAttribute('title');
  if (startsOn === null || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) {
    throw new Error(
      `010.2's Start cell reads ${String(startsOn)}, which is not a date to hold it at`,
    );
  }
  await setDate(page, 'Earliest start for 010.2', startsOn);

  for (let added = 0; added < extraRows; added += 1) {
    const number = String((added + 2) * 10).padStart(3, '0');
    await addRow.click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }
}

/**
 * The smallest plan whose arrows leave the schedule at **both** ends.
 *
 * Four roots and two dependencies, and no indenting: `020` waits for `010` and
 * neither is estimated, so both sit at workday 0 — the successor's start is the
 * canvas's own left edge, which is where an arrow's approach goes negative.
 * `040` waits for the estimated `030`, so it starts at the far end of the
 * schedule and its arrow's outward leg reaches past it.
 *
 * Unestimated on purpose rather than by omission: it is the state every row of
 * every plan is in for its first few minutes, so the left-edge arrow is not an
 * edge case at all.
 */
async function seedEdgeRoutes(page: Page, account: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('gantt-gate-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
  await setDate(page, 'Project start date', PLAN_START);

  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (const number of ['010', '020', '030', '040']) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }

  // The one estimate in the plan, so the horizon is four workdays and `040`
  // starts on it.
  const estimate = page.getByLabel('Dev estimate for 030');
  await estimate.fill('2/4/6');
  await estimate.blur();
  await expect(estimate).not.toHaveValue('');

  for (const [waiting, on] of [
    ['020', '010'],
    ['040', '030'],
  ]) {
    const depends = page.getByLabel(`Add a dependency to ${waiting}`);
    await depends.click();
    await depends.fill(on);
    await depends.press('Enter');
    await expect(
      page.getByRole('button', { name: `Stop ${waiting} waiting for ${on}` }),
    ).toBeVisible();
  }
}

/**
 * Opens the Gantt panel and waits until it has drawn something.
 *
 * The toggle is one toolbar control under both renderers, but below the phone
 * breakpoint that toolbar is a sheet — so which gesture opens the chart is the
 * face's business and this is where it is written down once.
 */
async function openTheChart(
  page: Page,
  { throughTheSheet = false, drawn = '[data-gantt-bar]' } = {},
): Promise<void> {
  if (throughTheSheet) {
    await page.getByRole('button', { name: 'Plan actions' }).click();
    await expect(page.getByRole('dialog', { name: 'Plan actions' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.locator('[data-gantt-chart]')).toBeVisible();
  // A chart with nothing on it would make every measurement below vacuous. The
  // mark is a parameter because a fixture may be about a mark other than a bar
  // — an arrow's route off either end of the schedule, say — and waiting on the
  // bars would say nothing about whether that mark was drawn.
  await expect(page.locator(drawn).first()).toBeVisible();
}

/** One rectangle, as the browser lays it out. */
interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * The rectangle of the one element this selector matches.
 *
 * @throws When nothing matches, or when the box has no area — an empty rect
 * compares equal to another empty rect, and two marks that are both not drawn
 * would agree about everything.
 */
async function rectOf(page: Page, selector: string): Promise<Rect> {
  return page.evaluate((where) => {
    const node = document.querySelector(where);
    if (node === null) throw new Error(`nothing on the page at ${where}`);
    const box = node.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) {
      throw new Error(`${where} is drawn with no area: ${String(box.width)}×${String(box.height)}`);
    }
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  }, selector);
}

/**
 * What the browser actually paints at a point inside a mark's own box.
 *
 * The one question `getBoundingClientRect` cannot answer, and the reason this
 * fix needed a browser: an `<svg>` carries the UA's `overflow: hidden`, so a
 * path routed outside the viewBox is **not painted and not hit-testable** —
 * while its box goes on measuring exactly as if it were there. Every jsdom
 * assertion about such a mark passes, and so does every rectangle assertion
 * here. `elementFromPoint` is the browser saying which ink is on that pixel.
 *
 * @param page The page holding the chart.
 * @param selector The mark to probe.
 * @param at How far across the box to probe, 0 → 1. The arrow head is a
 * triangle pointing right, so a quarter in is thick and the tip is not.
 * @returns `'itself'` when the mark is what is painted there, and otherwise a
 * description of what was, so the failure names the thing in the way.
 * @throws When nothing matches the selector, or the box has no area.
 */
async function paintedAt(page: Page, selector: string, at = 0.25): Promise<string> {
  return page.evaluate(
    ({ where, across }) => {
      const node = document.querySelector(where);
      if (node === null) throw new Error(`nothing on the page at ${where}`);
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) {
        throw new Error(`${where} is drawn with no area to probe`);
      }
      const hit = document.elementFromPoint(
        box.left + box.width * across,
        box.top + box.height / 2,
      );
      if (hit === node) return 'itself';
      if (hit === null) return 'nothing at all — the point is off the viewport';
      const attributes = [...hit.attributes].map((each) => each.name).join(' ');
      return `<${hit.tagName} ${attributes}>`;
    },
    { where: selector, across: at },
  );
}

/**
 * Puts the chart at its far right edge, and says how far that was.
 *
 * @throws When the chart does not scroll at all. Every sticky assertion below
 * would otherwise be made about an unscrolled chart, where a label column that
 * held nothing would hold the left edge anyway — the vacuity `layout.spec.ts`
 * guards the same way.
 */
async function scrollChartFullyRight(page: Page): Promise<number> {
  const reached = await page.evaluate(() => {
    const panel = document.querySelector('[data-gantt-panel]');
    if (panel === null) throw new Error('the Gantt panel is not on the page');
    panel.scrollLeft = panel.scrollWidth;
    return panel.scrollLeft;
  });
  expect(
    reached,
    'the chart is not wider than its panel, so nothing was scrolled past',
  ).toBeGreaterThan(0);
  return reached;
}

/**
 * Seeds the plan at laptop width, and hands the page back at the viewport it
 * came in on.
 *
 * The phone tests are about the **chart** on a phone. Typing a three-point
 * estimate and a dependency into a card through the toolbar sheet is
 * `mobile.spec.ts`'s subject and is proved there; a second seeding path here
 * would fail about the sheet rather than about the chart. The renderer swaps on
 * `window.innerWidth` through a resize listener (`plan-renderer.ts`), so the
 * plan a laptop typed is the plan a phone draws — and the assertion below is
 * what says the swap happened rather than assuming it.
 *
 * @throws When the project declares no viewport, which would leave nothing to
 * restore and quietly measure a phone claim at 1400px.
 */
async function seedOnALaptop(
  page: Page,
  account: string,
  options: { estimate?: string; extraRows?: number } = {},
): Promise<void> {
  const phone = page.viewportSize();
  if (phone === null) throw new Error('this project declares no viewport to seed away from');
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedPlan(page, account, options);
  await page.setViewportSize(phone);
  await expect(page.locator('[data-plan-cards]')).toBeVisible();
}

let account = 0;

test.beforeEach(() => {
  account += 1;
});

const nextAccount = (): string => `e2e-chart-${String(Date.now())}-${String(account)}`;

test.describe('the chart, after the browser has scaled it', () => {
  test('draws a bar at the pixel its calendar day says, under its own axis cell', async ({
    page,
  }) => {
    await seedPlan(page, nextAccount(), { estimate: PAST_THE_WEEKEND });
    await openTheChart(page);

    const chart = await rectOf(page, '[data-gantt-chart]');
    const drawn = await page.evaluate(() =>
      [...document.querySelectorAll('[data-gantt-bar]')].map((bar) => {
        const box = bar.getBoundingClientRect();
        return {
          id: bar.getAttribute('data-gantt-bar') ?? '(a bar with no slice id)',
          // The engine's own **workday** number, carried on the element beside
          // the calendar geometry the browser drew from it.
          start: Number(bar.getAttribute('data-start')),
          userY: Number(bar.getAttribute('y')),
          left: box.left,
          top: box.top,
        };
      }),
    );
    expect(drawn.length, 'the seeded plan drew no bars to measure').toBeGreaterThan(0);
    const bars = drawn.map((bar) => ({ ...bar, at: SCALE.startOf(bar.start) }));

    // The fixture really does reach past its own first weekend, where the
    // calendar day and the workday are different numbers. Without this the
    // whole check below holds exactly as well on the axis this change replaced
    // — which is the shape of check R5 exists to stop, and it was watched
    // holding on the narrower plan before the estimate was widened.
    expect(
      bars.some((bar) => bar.at !== bar.start),
      'no bar in this plan is past a weekend, so the scale is not being measured',
    ).toBe(true);

    // The transform itself, on both axes: one calendar day is `DAY_PX` across
    // and one row is `ROW_PX` down, which is what `preserveAspectRatio="none"`
    // over a viewBox of days by rows means and what no jsdom test can perform.
    //
    // `CHART_PAD_PX` is in the arithmetic because the canvas begins one band
    // left of day 0 — the band the arrow routes and the caret live in, and
    // without which a browser clips them.
    for (const bar of bars) {
      expect(
        Math.abs(bar.left - chart.left - CHART_PAD_PX - bar.at * DAY_PX),
        `${bar.id} is not ${String(bar.at)} calendar days from the plan's first day`,
      ).toBeLessThanOrEqual(NEARLY);
      expect(
        Math.abs(bar.top - chart.top - bar.userY * ROW_PX),
        `${bar.id} is not on its own row`,
      ).toBeLessThanOrEqual(NEARLY);
    }

    // And the axis, which is HTML in a different box entirely: the cell for the
    // calendar day a bar starts on has to begin at the same pixel the bar does.
    // Two arrangements sized by the same constant, asserted against each other
    // rather than against the constant — and the cell is found by **calendar
    // offset**, because that is what a cell now stands for.
    //
    // Only the bars the axis has a cell for: whether the last bar starts on the
    // last cell is a fact about the fixture and not about the scale.
    const cells = await page.locator('[data-axis-day]').count();
    const printed = bars.filter((bar) => bar.at < cells);
    expect(printed, 'no bar starts on a day the axis prints').not.toHaveLength(0);
    for (const bar of printed) {
      const cell = await rectOf(page, `[data-axis-day="${String(bar.at)}"]`);
      expect(
        Math.abs(bar.left - cell.left),
        `${bar.id} does not begin under the axis cell for calendar day ${String(bar.at)}`,
      ).toBeLessThanOrEqual(NEARLY);
      // And that cell carries the workday the bar says it is on, which is the
      // join between the engine's number and the drawing's.
      await expect(page.locator(`[data-axis-day="${String(bar.at)}"]`)).toHaveAttribute(
        'data-axis-workday',
        String(bar.start),
      );
    }

    // The weekend is on the axis and under it, which is what the change is for:
    // cells 5 and 6 of a Monday-start plan are the Saturday and the Sunday, and
    // each has a column of its own in the chart.
    await expect(page.locator('[data-axis-day="5"]')).toHaveAttribute('data-axis-weekend', 'true');
    await expect(page.locator('[data-axis-day="6"]')).toHaveAttribute('data-axis-weekend', 'true');
    const saturday = await rectOf(page, '[data-gantt-weekend="5"]');
    expect(
      Math.abs(saturday.width - DAY_PX),
      'the Saturday column is not one day wide',
    ).toBeLessThanOrEqual(NEARLY);
    const fifthCell = await rectOf(page, '[data-axis-day="5"]');
    expect(
      Math.abs(saturday.left - fifthCell.left),
      'the Saturday column does not stand under its own axis cell',
    ).toBeLessThanOrEqual(NEARLY);
  });

  /**
   * The three marks the live inspection found, measured as rectangles.
   *
   * Each of them was drawn, and each of them was gated by a test that read its
   * `d` attribute. What none of those could say is whether the ink lands
   * anywhere a reader can see it.
   */
  test('draws the arrow head, the caret and the bracket where they can be seen', async ({
    page,
  }) => {
    await seedPlan(page, nextAccount(), { estimate: PAST_THE_WEEKEND });
    await openTheChart(page);

    // The bar the caret belongs to, found through the caret's own row and not
    // by counting: the first attempt at this took `bars.at(1)` on the reasoning
    // that `010` is a parent and draws no bar, and a new project lists **two**
    // roles — so index 1 is `010.1`'s unestimated QA slice, sitting at the same
    // workday as the bar that was wanted. Every assertion below passed against
    // it, including with the caret put back on top of the real bar: a
    // zero-height box cannot be overlapped. Watched, which is why the width is
    // asserted here.
    //
    // `data-assumed` and not the width alone, and that is this change's doing:
    // an unestimated slice is drawn across the assumed span now, so the QA bar
    // has area and the width filter that used to exclude it no longer does. The
    // bar this test wants is the one whose width somebody actually estimated.
    const successor = await page.evaluate(() => {
      const caret = document.querySelector('[data-gantt-not-before]');
      if (caret === null) throw new Error('no not-before caret was drawn to find a row by');
      const row = caret.getAttribute('data-gantt-not-before');
      const drawn = [...document.querySelectorAll('[data-gantt-bar]')].filter(
        (bar) =>
          Math.floor(Number(bar.getAttribute('y'))) === Number(row) &&
          !bar.hasAttribute('data-assumed') &&
          bar.getBoundingClientRect().width > 0,
      );
      if (drawn.length !== 1) {
        throw new Error(`row ${String(row)} holds ${String(drawn.length)} drawn bars, not one`);
      }
      const box = drawn[0].getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    });
    expect(successor.width, 'the successor’s bar has no width to measure against').toBeGreaterThan(
      0,
    );
    expect(
      successor.height,
      'the successor’s bar has no height to measure against',
    ).toBeGreaterThan(0);

    // 1. The head exists, has area, and its point is at the successor's left
    //    edge — which is the fact "the arrow has an arrowhead" reduces to.
    const head = await rectOf(page, '[data-gantt-arrow-head]');
    expect(
      Math.abs(head.right - successor.left),
      'the arrow head does not point at the successor’s left edge',
    ).toBeLessThanOrEqual(NEARLY);
    expect(head.left, 'the arrow head is not in front of the bar it points at').toBeLessThan(
      successor.left,
    );
    // And it is **painted**, which is a different claim from the three above:
    // a head clipped off the canvas reports this same box and puts no ink
    // anywhere. See {@link paintedAt}. The left-edge case, where that actually
    // happened, is the test below.
    expect(
      await paintedAt(page, '[data-gantt-arrow-head]'),
      'nothing of the arrow head is painted where its box says it is',
    ).toBe('itself');
    const viewport = page.viewportSize();
    expect(viewport, 'this project declares no viewport').not.toBeNull();
    expect(head.top).toBeGreaterThanOrEqual(0);
    expect(head.bottom).toBeLessThanOrEqual(viewport?.height ?? 0);

    // 2. The caret is clear of the bar it belongs to. The bar starts on the
    //    constrained day, so the two share an x — which is exactly the case
    //    that used to hide the flag, and the reason this is an intersection
    //    test rather than a "is it drawn" one.
    const caret = await rectOf(page, '[data-gantt-not-before]');
    const overlaps =
      caret.left < successor.right &&
      caret.right > successor.left &&
      caret.top < successor.bottom &&
      caret.bottom > successor.top;
    expect(overlaps, 'the not-before caret is drawn over the bar it belongs to').toBe(false);
    expect(
      Math.abs(caret.left - successor.left),
      'the caret does not stand at the day the bar starts on',
    ).toBeLessThanOrEqual(NEARLY);

    // 3. The paint, as the browser computed it rather than as a class
    //    attribute spells it: the arrow's stroke is heavy enough to be seen,
    //    and the parent's ghost bar is genuinely translucent — a parent drawn
    //    in solid ink is indistinguishable from work of its own, and only a
    //    computed style can say what `fill-foreground/15` came out as.
    //
    //    Negative: the ghost's class made `fill-foreground` whole fails the
    //    jsdom class assertion (watched 2026-08-09, `gantt-panel.test.tsx`),
    //    and must fail here on `expected 1 to be less than 1`. NOT yet watched
    //    in Chromium: the 2026-08-09 run was blocked by another checkout's dev
    //    servers on 3100/4200 (the reuseExistingServer landmine), and Dany
    //    chose to let CI's pixels job be the first browser run. Until someone
    //    watches it fail, the alpha half of this check is a claim, not a gate
    //    — verify.md of `gantt-polish` says so too.
    // The ghost's geometry before its paint: a translucent rect of no area
    // has the right computed fill and no pixels, which is the sixteenth
    // check's shape wearing the new mark. Non-zero both ways, and no taller
    // than the row band a bar is allowed.
    const ghost = await rectOf(page, '[data-gantt-bracket]');
    expect(ghost.right - ghost.left, "the parent's ghost bar has no width").toBeGreaterThan(0);
    expect(ghost.bottom - ghost.top, "the parent's ghost bar has no height").toBeGreaterThan(0);
    expect(ghost.bottom - ghost.top, 'the ghost spills out of its row').toBeLessThanOrEqual(28);

    const paint = await page.evaluate(() => {
      const node = (where: string): Element => {
        const found = document.querySelector(where);
        if (found === null) throw new Error(`nothing on the chart at ${where}`);
        return found;
      };
      const alphaOf = (color: string): number => {
        // Resolved through a probe so `color-mix(...)` answers as a concrete
        // color: what the paint is, not how the class spelt it. Chromium may
        // serialize that as `rgba(r, g, b, a)`, `rgb(r, g, b)`, or a
        // color-space form like `oklab(l a b / 0.15)` — the alpha is the
        // trailing `/ a` in the slash forms, the fourth comma argument in
        // rgba, and 1 where nothing says otherwise. A shape this parser does
        // not recognise throws rather than reading as opaque: an unreadable
        // paint asserted as alpha 1 would pass the solid-work check by
        // accident.
        const probe = document.createElement('div');
        // A sentinel first: an invalid assignment leaves the property alone,
        // and the probe would then answer with the body's inherited colour —
        // alpha 1, a wrong paint read as a solid one. Seeing the sentinel
        // survive is how `none` or a paint-server fill is told apart.
        probe.style.color = 'rgb(1, 2, 3)';
        probe.style.color = color;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        if (resolved === 'rgb(1, 2, 3)' && color !== 'rgb(1, 2, 3)') {
          throw new Error(`not a colour at all: ${color}`);
        }
        const body = /^[a-z-]+\(([^)]+)\)$/.exec(resolved)?.[1];
        if (body === undefined) throw new Error(`unreadable paint: ${resolved}`);
        const slashed = /\/\s*([\d.]+%?)\s*$/.exec(body)?.[1];
        const commaParts = body.split(',');
        const raw = slashed ?? (commaParts.length > 3 ? commaParts[3].trim() : '1');
        const alpha = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
        if (Number.isNaN(alpha)) throw new Error(`unreadable alpha in ${resolved}`);
        return alpha;
      };
      return {
        bracketAlpha: alphaOf(getComputedStyle(node('[data-gantt-bracket]')).fill),
        arrowStroke: Number.parseFloat(getComputedStyle(node('[data-gantt-arrow]')).strokeWidth),
      };
    });
    expect(paint.bracketAlpha, "the parent's ghost bar is painted as solid work").toBeLessThan(1);
    expect(paint.bracketAlpha, "the parent's ghost bar is not painted at all").toBeGreaterThan(0);
    expect(paint.arrowStroke, 'the dependency arrow is a hairline').toBeGreaterThanOrEqual(1.5);

    // 4. And the successor's bar really is past the plan's first weekend, so
    //    every measurement above was taken where a calendar coordinate and a
    //    workday number are different. On the narrower fixture this plan used
    //    to be seeded with they were the same and none of it was being tested.
    const onCalendar = await page.evaluate(() => {
      const caret = document.querySelector('[data-gantt-not-before]');
      if (caret === null) throw new Error('no not-before caret was drawn');
      const row = caret.getAttribute('data-gantt-not-before');
      const bar = [...document.querySelectorAll('[data-gantt-bar]')].find(
        (each) =>
          Math.floor(Number(each.getAttribute('y'))) === Number(row) &&
          !each.hasAttribute('data-assumed'),
      );
      if (bar === undefined) throw new Error(`row ${String(row)} holds no drawn bar`);
      return { start: Number(bar.getAttribute('data-start')), x: Number(bar.getAttribute('x')) };
    });
    expect(
      onCalendar.x,
      'the successor is inside the first week, where a workday number is already a calendar day',
    ).toBeGreaterThan(onCalendar.start);
  });

  /**
   * The two arrows that route outside the schedule, and the fix that lets them
   * be seen.
   *
   * `arrowRoute` steps `ARROW_APPROACH_PX` clear of a bar before it turns, so a
   * successor at **workday 0** is approached through negative x and an arrow off
   * the **last** bar leaves past the horizon. The canvas used to be the
   * schedule exactly, and an `<svg>`'s own `overflow: hidden` clipped both: the
   * head of a left-edge arrow painted nothing at all, measured here, while its
   * `getBoundingClientRect` went on reporting a box 7px wide. jsdom cannot hold
   * this — it has no clip and no hit test — so this is the only place the fix
   * is a fact.
   */
  test('paints an arrow that routes off either end of the schedule', async ({ page }) => {
    await seedEdgeRoutes(page, nextAccount());
    await openTheChart(page, { drawn: '[data-gantt-arrow-head]' });

    // Two arrows: `020` waits for `010` and both are unestimated, so the
    // successor starts at workday 0 and the route reaches left of the
    // schedule; `040` waits for the estimated `030`, so it starts at the far
    // end of it and the route reaches right of that. Asserted, because one
    // arrow would make half of this test vacuous.
    await expect(page.locator('[data-gantt-arrow-head]')).toHaveCount(2);

    // 1. Every mark's box is inside the canvas it is drawn on. This is the
    //    arithmetic the padded viewBox exists for, and it is measurable here
    //    because a clipped box still measures — it is the *canvas* that moved.
    const chart = await rectOf(page, '[data-gantt-chart]');
    const outside = await page.evaluate((canvas) => {
      const marks = [...document.querySelectorAll('[data-gantt-arrow], [data-gantt-arrow-head]')];
      if (marks.length === 0) throw new Error('no arrows on the chart to measure');
      return marks
        .map((mark) => ({ name: mark.getAttribute('d') ?? '', box: mark.getBoundingClientRect() }))
        .filter((mark) => mark.box.left < canvas.left - 1 || mark.box.right > canvas.right + 1)
        .map((mark) => mark.name);
    }, chart);
    expect(outside, 'a mark is drawn outside the canvas, where nothing paints').toEqual([]);

    // 2. And the ink is really there. `elementFromPoint` at the left-most
    //    head's own centre: the case that used to paint zero pixels.
    //
    // Proof: the viewBox put back to `0 0 horizon rowCount`, the SVG's width
    // back to `horizon * DAY_PX`, and the axis's and labels' `CHART_PAD_PX`
    // offsets removed — the drawing as it was. Assertion 1 failed first, on `a
    // mark is drawn outside the canvas, where nothing paints`, listing all
    // three: the left-edge elbow `M 0 0.5 L 0.357… L -0.357… L 0 1.5`, its head
    // `M 0 1.5 L -0.25 1.375 L -0.25 1.625 Z`, and the right-edge elbow out to
    // `4.357…` past a horizon of 4. With that assertion replaced by a `void`,
    // assertion 2 failed on `the left-edge arrow head is not painted at its own
    // centre: expected "itself", received "<BUTTON type data-gantt-label title
    // class style>"` — the row label the clipped head's pixel actually belongs
    // to. Watched 2026-08-09.
    const heads = page.locator('[data-gantt-arrow-head]');
    const boxes = await heads.evaluateAll((marks) =>
      marks.map((mark, index) => ({ index, left: mark.getBoundingClientRect().left })),
    );
    const leftmost = [...boxes].sort((one, other) => one.left - other.left)[0];
    expect(leftmost, 'no arrow head to probe').toBeDefined();
    const id = await heads.nth(leftmost.index).getAttribute('data-gantt-arrow-head');
    expect(
      await paintedAt(page, `[data-gantt-arrow-head="${String(id)}"]`),
      'the left-edge arrow head is not painted at its own centre',
    ).toBe('itself');

    // 3. The switch, asked in the one place jsdom cannot answer: a real click
    //    on a button inside a sticky, z-indexed subtree of an overflow-auto
    //    scroller — the exact arrangement that has eaten clicks here twice
    //    (R5 #14, #15). Both marks go and both come back.
    const toggle = page.locator('[data-gantt-arrows-toggle]');
    await toggle.click();
    await expect(page.locator('[data-gantt-arrow]')).toHaveCount(0);
    await expect(page.locator('[data-gantt-arrow-head]')).toHaveCount(0);
    await toggle.click();
    await expect(page.locator('[data-gantt-arrow]')).toHaveCount(2);
    await expect(page.locator('[data-gantt-arrow-head]')).toHaveCount(2);
  });

  test('holds the labels at the left edge with the chart scrolled fully right', async ({
    page,
  }) => {
    // Wide enough that 1400px cannot hold it: two chained 40-day slices is an
    // 80-workday horizon, which is 2240px of chart beside a 176px label column.
    await seedPlan(page, nextAccount(), { estimate: '40/40/40' });
    await openTheChart(page);
    await scrollChartFullyRight(page);

    const panel = await rectOf(page, '[data-gantt-panel]');
    const labels = await rectOf(page, '[data-gantt-labels]');
    expect(
      Math.abs(labels.left - panel.left),
      'the label column went with the chart instead of holding the edge',
    ).toBeLessThanOrEqual(NEARLY);

    // And the page itself never moved: the panel's own scroll container is what
    // takes the width, which is the half of design §4 a browser has to judge.
    const document_ = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    });
    expect(document_.scrollWidth, 'the page scrolls sideways').toBeLessThanOrEqual(
      document_.clientWidth,
    );
  });

  /**
   * The click that takes the plan to a row, in the one environment that
   * performs a default action.
   *
   * R5 #14 and #15 are both this shape: a jsdom test that dispatched a
   * synthetic event, watched the guard be deleted, and could never watch the
   * browser do the rest. `goToRow` focuses a cell and then calls
   * `scrollIntoView` behind a `typeof` guard — jsdom has no `scrollIntoView` at
   * all, so the guard's false branch is the **only** one its tests ever take.
   */
  test('scrolls the plan back to the row whose bar was clicked, and lands the caret', async ({
    page,
  }) => {
    await seedPlan(page, nextAccount(), { extraRows: 12 });
    await openTheChart(page);

    // The plan pushed to its bottom, so the first leaf is off screen and
    // something has to happen for the caret to reach it.
    const scrolledTo = await page.evaluate(() => {
      const frame = document.querySelector('[data-table-frame]');
      if (frame === null) throw new Error('the scrolling frame is not on the page');
      frame.scrollTop = frame.scrollHeight;
      return frame.scrollTop;
    });
    expect(
      scrolledTo,
      'the plan is not taller than its frame, so nothing had to scroll back',
    ).toBeGreaterThan(0);

    // The first bar is `010.1`'s: `010` is a parent and draws a bracket, not a
    // bar. Asserted rather than assumed — a bar on the wrong row would make the
    // focus assertion below a different claim.
    const firstBar = page.locator('[data-gantt-bar]').first();
    await expect(firstBar).toHaveAttribute('data-start', '0');
    await firstBar.click();

    await expect(page.getByLabel('Name of 010.1')).toBeFocused();
    const after = await page.evaluate(() => {
      const frame = document.querySelector('[data-table-frame]');
      if (frame === null) throw new Error('the scrolling frame is not on the page');
      return frame.scrollTop;
    });
    expect(after, 'the plan did not scroll to the row the bar belongs to').toBeLessThan(scrolledTo);
    // And the box the caret is in is actually on screen, which is the thing
    // `scrollIntoView` was called for rather than a number about it.
    await expect(page.getByLabel('Name of 010.1')).toBeInViewport();
  });
});

/**
 * The chart while the plan under it is being edited.
 *
 * One claim: the open panel draws the read that followed the last edit, never
 * the one it was opened over. The pipeline is `run` → `refresh` →
 * `setChartRead` → a new `ganttPlan` every render, and every link in it is
 * invisible to jsdom the moment it is half-broken rather than deleted — the
 * exact shape of R5 faults #14 and #15 — so the claim is held here, in the
 * browser, against real requests.
 *
 * Proof: `refresh` in `wbs-table.tsx` given the fault its own comment names —
 * `setChartRead` keeping the slices it has whenever it has any — and this
 * failed inside `openTheChart` on `locator('[data-gantt-bar]').first()` never
 * becoming visible: the frozen slices named rows the plan had since
 * renumbered, `layOutGantt` refused the skew, and the boundary withheld the
 * whole chart. Restored, watched green. 2026-08-09.
 */
test.describe('the chart under a plan being edited', () => {
  test('redraws the open chart as each schedule input changes', async ({ page }) => {
    await seedPlan(page, nextAccount());
    await openTheChart(page);

    // The seeded plan in engine numbers: `010.1`'s Dev runs 0→4, and `010.2`,
    // held by the dependency and its own date at once, 4→8.
    const firstBar = page.locator('[data-gantt-bar]').first();
    await expect(firstBar).toHaveAttribute('data-finish', '4');

    // An estimate edit stretches the open bar: 2/4/6 → 8/10/12 is ten days by
    // PERT. The dependent `010.2` follows to day 10 — its own not-before still
    // names day 4, and the dependency out-floors it.
    const estimate = page.getByLabel('Dev estimate for 010.1');
    await estimate.fill('8/10/12');
    const savedEstimate = page.waitForResponse((response) => response.request().method() === 'PUT');
    await estimate.blur();
    await savedEstimate;
    await expect(firstBar).toHaveAttribute('data-finish', '10');
    await expect(page.locator('[data-gantt-bar][data-start="10"][data-finish="14"]')).toBeVisible();

    // A not-before edit past everything else moves the row's bar to the day it
    // names: 2026-09-07 is workday 20 of a plan starting Monday 2026-08-10.
    await setDate(page, 'Earliest start for 010.2', '2026-09-07');
    await expect(page.locator('[data-gantt-bar][data-start="20"][data-finish="24"]')).toBeVisible();
  });
});

/**
 * The same chart on a phone, where the toolbar is a sheet and the plan is
 * cards.
 *
 * Two claims and both are `M mobile-cards`' contract meeting this panel: the
 * chart takes its own scroll area rather than making the page one, and
 * click-to-row lands on the **card's** name box because `cellIn` names a cell
 * rather than a piece of markup.
 */
test.describe('the chart on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('holds its labels and leaves the page still', async ({ page }) => {
    await seedOnALaptop(page, nextAccount(), { estimate: '40/40/40' });
    await openTheChart(page, { throughTheSheet: true });
    await scrollChartFullyRight(page);

    const panel = await rectOf(page, '[data-gantt-panel]');
    const labels = await rectOf(page, '[data-gantt-labels]');
    expect(
      Math.abs(labels.left - panel.left),
      'the label column went with the chart instead of holding the edge',
    ).toBeLessThanOrEqual(NEARLY);

    const document_ = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    });
    expect(document_.scrollWidth, 'the page scrolls sideways at 390').toBeLessThanOrEqual(
      document_.clientWidth,
    );
  });

  test('takes the cards face to a row when its bar is clicked', async ({ page }) => {
    // Enough cards that the list is taller than the phone: with three rows the
    // card is on screen wherever the list is, and every assertion below would
    // hold against a `goToRow` that scrolled nothing at all.
    await seedOnALaptop(page, nextAccount(), { extraRows: 12 });
    await openTheChart(page, { throughTheSheet: true });

    // The cards keep their own scroll area — `[data-plan-cards]`, not the page,
    // which never scrolls at all here. Measured rather than assumed: the
    // renderer's frame is `M mobile-cards`' and not this change's to know.
    const scrolledTo = await page.evaluate(() => {
      const cards = document.querySelector('[data-plan-cards]');
      if (cards === null) throw new Error('the phone is not showing the cards face');
      cards.scrollTop = cards.scrollHeight;
      return cards.scrollTop;
    });
    expect(
      scrolledTo,
      'the card list is not taller than the phone, so nothing had to scroll back',
    ).toBeGreaterThan(0);

    await page.locator('[data-gantt-bar]').first().click();

    await expect(page.getByLabel('Name of 010.1')).toBeFocused();
    const after = await page.evaluate(() => {
      const cards = document.querySelector('[data-plan-cards]');
      if (cards === null) throw new Error('the phone is not showing the cards face');
      return cards.scrollTop;
    });
    expect(after, 'the cards did not scroll to the row the bar belongs to').toBeLessThan(
      scrolledTo,
    );
    await expect(page.getByLabel('Name of 010.1')).toBeInViewport();
  });
});

/*
 * PROVING THESE CAN FAIL — watched 2026-08-09 against a real chromium on
 * ports 3111/3211/4211, one fault at a time, each reverted. Every message is
 * quoted in `openspec/changes/gantt-view/verify.md`.
 *
 * FAULT A — the arrow head deleted.
 *   `gantt-panel.tsx`: the `<path data-gantt-arrow-head>` struck from the SVG.
 * `draws the arrow head…` alone, on `nothing on the page at
 * [data-gantt-arrow-head]`.
 *
 * FAULT C — the not-before caret back on the bar.
 *   Its old `d`: a triangle hanging off the bar's own top-left corner.
 * `draws the arrow head…` alone, on `the not-before caret is drawn over the bar
 * it belongs to: expected true to be false`.
 *
 * FAULT B — `[stroke-width:2]` struck from the bracket.
 * `draws the arrow head…` alone, on `the summary bracket is a hairline:
 * expected 1 to be >= 2`. **No jsdom assertion in this repository can see this
 * one**: a class attribute is a string until a browser computes it.
 *
 * FAULT S — the SVG's CSS height 20px taller than `rowCount × ROW_PX`.
 * `draws a bar at the pixel…` on `… is not on its own row: expected
 * 7.866677246093751 to be <= 1`.
 *
 * FAULT X — an axis cell one pixel wider than `DAY_PX`.
 * `draws a bar at the pixel…` on `… does not begin under the axis cell for
 * workday 4: expected 4 to be <= 1`. Recorded against the workday axis this
 * change replaced; the assertion now names a calendar day.
 *
 * FAULT L — `sticky left-0` dropped from the label column.
 * Both label tests, on `the label column went with the chart instead of holding
 * the edge: expected 1048 to be <= 1`.
 *
 * FAULT F — the scroll suppressed: `goToRow` reduced to
 *   `cell.focus({ preventScroll: true })`.
 * Both click tests, on `the plan did not scroll to the row the bar belongs to`
 * and `the cards did not scroll…`. All 31 of `gantt-panel.test.tsx` passed
 * through it — jsdom takes the options bag and does nothing with it, and lays
 * nothing out to scroll.
 *
 * And one fault that is **not** in the list, because it cannot be caught here.
 * `tasks.md` named "the click's `scrollIntoView` guard inverted" as this
 * slice's negative. Inverted, all six tests passed: Chromium scrolls a focused
 * element into view of its own accord, so the guarded call is belt-and-braces
 * in a browser and load-bearing only in jsdom, which has no `scrollIntoView` at
 * all. FAULT F is the negative that does hold the behaviour, and it is the one
 * recorded.
 */
