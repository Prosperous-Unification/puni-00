import { expect, type Page, test } from '@playwright/test';

import { createProject } from './create-project';

/**
 * Every hint this app shows, drawn by the page rather than by the browser.
 *
 * Dany, 2026-08-31: _"make sure that all places where we show hint — this is
 * not slow system hint, but custom instant pretty hint"_. `start-date-hover-card`
 * had already done it for one cell; `hints-are-the-page-s-own` does it for the
 * other ninety-odd, by moving the words to `data-hint` and drawing them all in
 * one `HintLayer`.
 *
 * Dany, 2026-09-01: _"this must avoid unnecessary interruptions while moving
 * the cursor over UI elements, rn this is more annoying than useful when you
 * already know what buttons or UI elements do"_. So `tool-hints-wait` splits
 * them: words about the reader's own project keep `data-fact` and open at once,
 * words about what a control does keep `data-hint` and wait three seconds
 * behind a ring at the cursor.
 *
 * **None of these assertions can be made upstairs.** `hint.test.tsx` drives the
 * layer's own listeners in jsdom and proves the two paths apart on fake timers.
 * What jsdom cannot say is whether a **native** tooltip is still in the document
 * racing them — jsdom renders no tooltip of any kind, so a `title` left on a
 * control is invisible to every test up there — whether the card is placed
 * anywhere near the mark it belongs to, which is `getBoundingClientRect`'s
 * answer and jsdom's zeroes, or whether the ring lands near the real cursor,
 * which jsdom has none of.
 */

/** A plan with a toolbar, which is where most of this app's hints live. */
async function aPlan(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page);
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
}

test.describe('hints are the page’s own', () => {
  test('no control anywhere on the plan carries a native tooltip', async ({ page }) => {
    await aPlan(page);

    /*
      Every `title` **attribute** in the document, named by what carries it.

      An SVG `<title>` *element* is excluded and that is not a loophole: it is
      the accessible name of a shape, it draws no tooltip of its own in
      Chromium when the shape has an `aria-label`, and `gantt-panel.test.tsx`
      already asserts the bars have none. This is about the attribute, which is
      the one that makes Chromium wait a second and then draw in the platform's
      chrome.
    */
    const nativeTooltips = await page.evaluate(() =>
      [...document.querySelectorAll('[title]')].map((node) => ({
        tag: node.tagName.toLowerCase(),
        words: node.getAttribute('title'),
        name: node.getAttribute('aria-label') ?? node.textContent.slice(0, 40),
      })),
    );

    // Proof: `title="Undo your last change to this plan (Ctrl/⌘ + Z)"` put back
    // on the Undo button beside its `data-hint`. Watched failing on `Error: the
    // plan draws 1 native tooltips`, with the object the sweep found in the
    // diff under it.
    expect(
      nativeTooltips,
      `the plan draws ${String(nativeTooltips.length)} native tooltips`,
    ).toEqual([]);
  });

  test('no mark anywhere on the plan carries both a hint and a fact', async ({ page }) => {
    await aPlan(page);
    await page.getByRole('button', { name: 'Add work item' }).click();
    // The row's own number, and **not** `[data-fact]` unqualified: the first
    // mark carrying one is a facet `<label>` inside the closed Filters
    // disclosure, which is in the document and not visible, so waiting for it
    // to be seen waits for something that never happens. Measured — 63 polls
    // against `data-fact="No team owns a service yet…"`, "unexpected value
    // hidden". The sweep below reads the whole document either way; this is
    // only the wait that says the plan has finished drawing.
    await expect(page.locator('td [data-fact]').first()).toBeVisible();

    /*
      The two attributes are one choice, not a pair, and this is what keeps them
      one next month. Nesting is not the fault it guards — a fact chip inside a
      hinted toolbar is exactly what `closest` over both selectors is for — so
      the sweep is for **one node carrying both**, which is a call site that
      cannot say what kind of words it holds.
    */
    const carryingBoth = await page.evaluate(() =>
      [...document.querySelectorAll('[data-hint][data-fact]')].map((node) => ({
        tag: node.tagName.toLowerCase(),
        hint: node.getAttribute('data-hint'),
        fact: node.getAttribute('data-fact'),
      })),
    );

    // Proof: `data-fact="010"` added beside the Undo button's existing
    // `data-hint`. Watched failing on `Error: 1 marks carry both`, with the
    // button's two attributes printed in the diff under it.
    expect(carryingBoth, `${String(carryingBoth.length)} marks carry both`).toEqual([]);
  });

  test('a toolbar control waits three seconds, and rings while it does', async ({ page }) => {
    await aPlan(page);

    /*
      `Keyboard shortcuts` and not `Undo`, and the difference is the one thing
      worth knowing about this layer's reach: `buttonVariants`' base carries
      `disabled:pointer-events-none`, so a **disabled** control is not a hit
      target at all and no `pointerover` ever names it. Undo on a plan nobody
      has edited yet is disabled — measured, `elementFromPoint` at the button's
      own centre answering the toolbar `<div>` rather than the button. The
      controls that affects are Undo, Redo and Reset layout, whose hints restate
      what their labels already say; where the hint is the *reason* a control is
      off, the hint is on the live `<label>` around it rather than on the
      disabled `<input>` (`wbs-table.tsx`'s facet boxes).
    */
    const shortcuts = page.getByRole('button', { name: 'Keyboard shortcuts' });
    await expect(shortcuts).toHaveAttribute('data-hint', /Keyboard shortcuts/);

    const control = await shortcuts.boundingBox();
    if (control === null) throw new Error('the control has no box to hover');
    const cursor = { x: control.x + control.width / 2, y: control.y + control.height / 2 };

    const card = page.getByRole('tooltip');
    const ring = page.locator('[data-wait-ring]');

    await shortcuts.hover();
    await page.waitForTimeout(200);

    // Nothing at all through the quiet, which is the whole of what makes a
    // cursor crossing this toolbar leave no mark behind it.
    //
    // **Counted, not awaited.** `expect(locator).toHaveCount(0)` is a
    // *retrying* assertion: it polls for thirty seconds and is satisfied the
    // moment the count reaches zero, which for a ring means the moment the card
    // replaces it. Written that way this passed with `RING_QUIET_MS` set to 0 —
    // watched — and the fault was caught two assertions later by the card
    // instead. Every silence in this file is read once, at the instant it is
    // about.
    //
    // Proof: `RING_QUIET_MS` set to 0.
    expect(await ring.count(), 'the ring is drawn inside the quiet').toBe(0);

    await page.waitForTimeout(800);

    // A full second in and still silent. Playwright's five-second default would
    // be satisfied by exactly the native tooltip this layer replaced, and by a
    // wait of any length at all; the claim is the silence, so the silence is
    // what is measured.
    //
    // Proof: `TOOL_HINT_WAIT_MS` set to 0.
    expect(await card.count(), 'the card came up inside the first second').toBe(0);

    // And the ring is up, beside the real cursor — the half jsdom has no
    // pointer to say anything about. Its area is asserted before its position:
    // a box with no area sits inside every other box there is, which is
    // `G gantt-calendar-axis`'s sixteenth fault.
    const ringBox = await ring.boundingBox();
    if (ringBox === null) throw new Error('no ring is drawn a second into the wait');
    expect(ringBox.width > 0 && ringBox.height > 0, 'the ring has no area').toBe(true);
    const fromCursor = Math.hypot(
      ringBox.x + ringBox.width / 2 - cursor.x,
      ringBox.y + ringBox.height / 2 - cursor.y,
    );
    // Proof: `RING_OFFSET_PX` set to 400, which is a ring drawn beside a
    // different control entirely. Watched failing on `Error: the ring is 573px
    // from the cursor · Expected: < 40 · Received: 573.0596...`.
    expect(
      fromCursor,
      `the ring is ${String(Math.round(fromCursor))}px from the cursor`,
    ).toBeLessThan(40);

    // The card arrives on time. 2600ms is the rest of the three seconds plus a
    // frame, so a wait that had quietly grown longer fails here rather than
    // being absorbed by a generous default.
    await expect(card).toBeVisible({ timeout: 2600 });
    await expect(card).toHaveText(/Keyboard shortcuts/);

    // Proof: the `stopWaiting()` inside the opening timer removed — a ring left
    // spinning beside the card it had already delivered.
    expect(await ring.count(), 'the ring outlived the card it was waiting for').toBe(0);

    // And it is placed against the control, which is the half only a browser
    // can say: jsdom answers every rectangle with zeroes, so an unplaced card
    // and a placed one are the same object up there.
    const boxes = await page.evaluate(() => {
      const hinted = document.querySelector('[data-hint*="Keyboard shortcuts"]');
      const tip = document.querySelector('[role="tooltip"]');
      if (hinted === null || tip === null) throw new Error('the control or its card is missing');
      const a = hinted.getBoundingClientRect();
      const b = tip.getBoundingClientRect();
      return {
        cardHasArea: b.width > 0 && b.height > 0,
        below: b.top >= a.top,
        horizontalGap: Math.max(a.left - b.right, b.left - a.right),
      };
    });

    // The card has a size before anything is claimed about where it is, for the
    // ring's reason above.
    expect(boxes.cardHasArea, 'the card has no area').toBe(true);
    expect(boxes.below, 'the card is not under the control').toBe(true);
    expect(boxes.horizontalGap, 'the card is off to one side of the control').toBeLessThan(0);
  });

  /*
    **A browser case for "a scroll does not kill a wait" was written twice and
    shipped neither time.** The behaviour is real and is proved in
    `hint.test.tsx`, watched failing with the guard removed; what could not be
    made honest up here is the *oracle*.

    The first version added a work item and hovered `Gantt` — the arrangement a
    screenshot found the bug in. It is not an oracle: the same re-render both
    cancels the wait, through the scroll the settling table fires, and revives
    it, through a fresh `pointerover` on a button React has replaced under the
    cursor. Watched **passing** with the fault in, on one run of two.

    The second changed only the viewport height, so that nothing the pointer is
    over would move — the control's box was asserted identical either side of
    it. That one fails with the fix **in**: Chromium re-computes hit-testing
    after a resize and delivers a boundary event of its own, so the wait is
    ended by the browser rather than by this layer, and the case says nothing
    about the guard.

    A third try would need a page that scrolls without moving, re-rendering or
    re-hovering the control the pointer rests on, and this app has none. The
    jsdom case dispatches exactly one scroll and nothing else, which is the
    whole of what the guard is about.
  */

  test('a project fact answers at once and never rings', async ({ page }) => {
    await aPlan(page);
    await page.getByRole('button', { name: 'Add work item' }).click();

    /*
      The row's own number, which is the plainest fact on the page: the cell is
      sized to an envelope and a longer number is clipped, so the whole of it
      lives in the attribute and the card is the only place a reader sees it.

      **Named `010`, not `td [data-fact]`.** Written as the first fact in a row,
      this case was watched **passing** with the Number cell's attribute turned
      back into a `data-hint`: the locator simply found the next mark that is
      still a fact — a row carries several — and asserted the 400ms budget
      against a cell the fault had not touched. A test about one mark has to say
      which mark.
    */
    const said = '010';
    const number = page.locator(`td span[data-fact="${said}"]`);
    await expect(number).toBeVisible();

    await number.hover();

    /*
      **A tight budget, and it is the claim rather than a convenience.** The
      thing this replaced is a tooltip Chromium shows after about a second, and
      the thing beside it now waits three; a card asserted with Playwright's
      five-second default would be satisfied by either. 400ms is inside a hover
      the reader has not finished making and outside both.
    */
    // Proof: the row number's `data-fact` changed back to `data-hint`, which is
    // this whole change applied to the wrong side of the split. Watched failing
    // **at the locator above**, not here — `expect(locator).toBeVisible()
    // failed · Locator: locator('td span[data-fact="010"]') · Error: element(s)
    // not found`. That is the fault arriving one line earlier than expected and
    // it is the right place for it: the attribute is what says which kind of
    // words a mark holds, so changing it takes the mark out of this test's
    // reach rather than making its card late.
    const card = page.getByRole('tooltip');
    await expect(card).toBeVisible({ timeout: 400 });
    await expect(card).toHaveText(said);

    // And no ring, ever — read past the quiet, where one would be if this fact
    // had taken the tool path. Read before it, the assertion could not fail.
    await page.waitForTimeout(600);
    expect(await page.locator('[data-wait-ring]').count(), 'a fact drew a ring').toBe(0);
  });
});
