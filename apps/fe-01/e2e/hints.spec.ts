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
 * **Both assertions here need a browser and neither can be made upstairs.**
 * `hint.test.tsx` drives the layer's own listeners in jsdom and proves the card
 * opens, closes, ignores a tap and answers the keyboard. What jsdom cannot say
 * is whether a **native** tooltip is still in the document racing it — jsdom
 * renders no tooltip of any kind, so a `title` left on a control is invisible
 * to every test up there — or whether the card the layer draws is placed
 * anywhere near the control it belongs to, which is `getBoundingClientRect`'s
 * answer and jsdom's zeroes.
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

  test('a toolbar control explains itself in a card of this page, under itself', async ({
    page,
  }) => {
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

    await shortcuts.hover();

    /*
      **A tight budget, and it is the claim rather than a convenience.** The
      thing this change replaced is a tooltip Chromium shows after about a
      second, so a card asserted with Playwright's five-second default would be
      satisfied by exactly the behaviour being removed. 400ms is comfortably
      inside a hover the reader has not yet finished making and comfortably
      outside anything a native tooltip does.
    */
    // Proof: `<HintLayer />` taken out of `app.tsx`, which is every hint in the
    // app reduced to an attribute nothing draws. Watched failing on
    // `expect(locator).toBeVisible() failed · Expected: visible · Error:
    // element(s) not found · Expect "toBeVisible" with timeout 400ms`.
    const card = page.getByRole('tooltip');
    await expect(card).toBeVisible({ timeout: 400 });
    await expect(card).toHaveText(/Keyboard shortcuts/);

    // And it is placed against the control, which is the half only a browser
    // can say: jsdom answers every rectangle with zeroes, so an unplaced card
    // and a placed one are the same object up there.
    const boxes = await page.evaluate(() => {
      const control = document.querySelector('[data-hint*="Keyboard shortcuts"]');
      const tip = document.querySelector('[role="tooltip"]');
      if (control === null || tip === null) throw new Error('the control or its card is missing');
      const a = control.getBoundingClientRect();
      const b = tip.getBoundingClientRect();
      return {
        cardHasArea: b.width > 0 && b.height > 0,
        below: b.top >= a.top,
        horizontalGap: Math.max(a.left - b.right, b.left - a.right),
      };
    });

    // The card has a size before anything is claimed about where it is: a box
    // with no area sits inside every other box there is, which is
    // `G gantt-calendar-axis`'s sixteenth fault and the reason this line is
    // above the two below it rather than assumed by them.
    expect(boxes.cardHasArea, 'the card has no area').toBe(true);
    expect(boxes.below, 'the card is not under the control').toBe(true);
    expect(boxes.horizontalGap, 'the card is off to one side of the control').toBeLessThan(0);
  });
});
