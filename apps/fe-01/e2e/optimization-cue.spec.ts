import { expect, type Page, test } from '@playwright/test';

import type { PlanOptimizationView, PlanRead } from '../src/lib/wbs-api';
import { createProject } from './create-project';

/**
 * The schedule cue, in the only oracle that can say anything about it.
 *
 * Every claim here is a browser's: a rectangle, a default action, or the
 * document's own scroll width. jsdom lays nothing out and performs no default
 * action, so `optimization-cue.test.tsx` can say the pill carries the right
 * words and this file is what says the pill is a pill — R5 #14/#15/#17, three
 * faults found by driving Chromium and invisible to 2,500 jsdom cases.
 *
 * The optimizer is **faked at the wire** rather than solved for real: a solver
 * run needs the Python package, a seat and a plan big enough to be worth
 * optimizing, and none of that is what these five assertions are about. What
 * comes back is a payload be-01 really can produce — PRI ready and three
 * workdays ahead of Fast, Time still solving.
 */

/**
 * What the toolbar row has to lay out at 1280 with the cue on it — every
 * control's width plus the gaps — measured in this file's own Chromium on a
 * project with one row and optimization on.
 *
 * Pinned rather than derived from the bar it measures, which is
 * `plan-toolbar-controls`' lesson (R5): a budget read off its own subject is
 * decoration. `project-settings.spec.ts` pins the same row **without** the cue,
 * on a fresh project where the toggle is off and the pill is not drawn at all;
 * this is the figure with it.
 */
const LAID_OUT_WITH_THE_CUE_AT_1280 = 1563;

/** How far a measured edge may be from a pinned figure, in CSS px — `project-settings.spec.ts`'s. */
const NEARLY = 2;

const SUGGESTING: PlanOptimizationView = {
  enabled: true,
  engine: 'fast',
  objective: 'pri',
  inputHash: 'e2e-cue-input',
  generation: 1,
  contractVersion: '1.5+e2e',
  budgetMs: 60_000,
  displayed: 'fast',
  variants: { pri: { state: 'ready' }, time: { state: 'pending' } },
  finishDays: { fast: 10, pri: 7 },
  sameOrderAsFast: { pri: true },
};

/** A project with one row, whose plan read carries {@link SUGGESTING}. */
async function planWithACue(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page);
  await page.getByRole('button', { name: 'Add work item' }).click();
  await expect(page.getByLabel('Name of 010')).toBeVisible();

  await page.route('**/api/projects/*/work-items', async (route) => {
    const response = await route.fetch();
    const plan = (await response.json()) as PlanRead;
    await route.fulfill({
      response,
      json: { ...plan, startDate: '2026-09-07', optimization: SUGGESTING },
    });
  });
  await page.reload();
  await expect(page.locator('[data-optimization-cue]')).toBeVisible();
}

const pill = (page: Page) => page.getByRole('button', { name: /is the active schedule/ });

/**
 * The cue's own card, found through the pill's `aria-describedby`.
 *
 * Not `getByRole('tooltip')`: the app's **hint layer** draws one of those too —
 * `#hint-card`, from the `data-hint` on this very pill — so a bare role query
 * resolves to two elements and could resolve to the wrong one. Going through the
 * attribute also asserts the wiring a screen reader depends on.
 *
 * The attribute is a **list**, measured: `HintLayer` appends its own card's id
 * to whatever the element already pointed at, so this reads `"_r_4_ hint-card"`
 * with the pointer or the focus on the pill. Splitting it is not tidying — a
 * `#_r_4_ hint-card` selector is a descendant selector and matches nothing.
 */
async function cueCard(page: Page) {
  const described = await pill(page).getAttribute('aria-describedby');
  if (described === null) throw new Error('the pill points at no card');
  const ids = described.split(/\s+/).filter((id) => id !== '' && id !== 'hint-card');
  if (ids.length !== 1)
    throw new Error(`the pill points at ${String(ids.length)} cards of its own`);
  return page.locator(`#${ids.join('')}`);
}

/** The cue card's rectangle, in viewport coordinates. */
async function cueCardBox(page: Page): Promise<DOMRect> {
  const card = await cueCard(page);
  const box = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  return box as DOMRect;
}

async function boxOf(page: Page, selector: string): Promise<DOMRect> {
  const box = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  return box as DOMRect;
}

test.describe('the schedule cue, in a browser', () => {
  test('stands inside the toolbar row and takes the saving with it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await planWithACue(page);

    const cue = await boxOf(page, '[data-optimization-cue]');
    const toolbar = await boxOf(page, '[data-toolbar]');
    // Non-zero first, both of them: an assertion that one empty box is inside
    // another empty box is the vacuity `gantt-calendar-axis` shipped once (R5
    // #16).
    expect(cue.width, 'the cue has no rendered width').toBeGreaterThan(0);
    expect(cue.height, 'the cue has no rendered height').toBeGreaterThan(0);
    expect(toolbar.width).toBeGreaterThan(0);
    expect(cue.y).toBeGreaterThanOrEqual(toolbar.y - NEARLY);
    expect(cue.y + cue.height).toBeLessThanOrEqual(toolbar.y + toolbar.height + NEARLY);
    expect(cue.x).toBeGreaterThanOrEqual(toolbar.x - NEARLY);
    expect(cue.x + cue.width).toBeLessThanOrEqual(toolbar.x + toolbar.width + NEARLY);

    // The saving is on the pill, drawn, and not merely in the markup.
    const saving = await boxOf(page, '[data-cue-suggestion]');
    expect(saving.width, 'the suggestion has no rendered width').toBeGreaterThan(0);
    await expect(page.locator('[data-cue-suggestion]')).toHaveText('· PRI 3 days earlier');
  });

  test('lays the 1280 toolbar out inside its budget with the cue on it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await planWithACue(page);

    const measured = await page.evaluate(() => {
      const toolbar = document.querySelector('[data-toolbar]');
      if (toolbar === null) throw new Error('the plan has no toolbar');
      const boxes = [...toolbar.children].map((child) => child.getBoundingClientRect());
      if (boxes.length === 0) throw new Error('the toolbar has no controls');
      const gap = Number.parseFloat(getComputedStyle(toolbar).columnGap);
      if (!Number.isFinite(gap)) throw new Error('the toolbar has no column gap to read');
      return {
        laidOut: boxes.reduce((total, box) => total + box.width, 0) + gap * (boxes.length - 1),
        controls: boxes.length,
        rows: new Set(boxes.map((box) => Math.round(box.y))).size,
      };
    });
    // A bar that lost controls would flatter the budget below.
    expect(measured.controls, 'the toolbar lost controls').toBeGreaterThanOrEqual(16);
    // Proof: the pill's face given `reading.sentence` instead of the active
    // schedule's label — the banner this change deleted, wearing a pill's
    // clothes — and this failed on `2082px of controls to lay out, against the
    // 1563px this change left · Expected: <= 1565 · Received: 2081.92`.
    // Watched 2026-09-08.
    expect(
      measured.laidOut,
      `${String(Math.round(measured.laidOut))}px of controls to lay out, against the ${String(
        LAID_OUT_WITH_THE_CUE_AT_1280,
      )}px this change left`,
    ).toBeLessThanOrEqual(LAID_OUT_WITH_THE_CUE_AT_1280 + NEARLY);
    expect(measured.rows, 'the toolbar wraps to more rows than two').toBeLessThanOrEqual(2);
  });

  test('adds no sideways scroll to a phone, open or closed', async ({ page }) => {
    // The project is made at desktop width and the viewport narrowed after:
    // below `md` the plan draws itself as cards and `Add work item` is not on
    // the toolbar row at all, so building the fixture at 390px waits two
    // minutes for a button that is somewhere else.
    await planWithACue(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('[data-optimization-cue]')).toBeVisible();

    const scrolls = () =>
      page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
    const atRest = await scrolls();
    expect(atRest.documentWidth).toBeLessThanOrEqual(atRest.viewportWidth);

    // Proof: the same fault as the budget case above — the sentence on the
    // pill's face — and this failed on `Expected: <= 390 · Received: 719`, a
    // cue hanging 329px off the side of the screen. Watched 2026-09-08.
    const cue = await boxOf(page, '[data-optimization-cue]');
    expect(cue.width).toBeGreaterThan(0);
    expect(cue.x).toBeGreaterThanOrEqual(0);
    expect(cue.x + cue.width).toBeLessThanOrEqual(390 + NEARLY);

    // And with the card open, which is the box that carries a 420px ceiling:
    // it is portalled and clamped, and an absolutely positioned one would hang
    // 38px off a 390px screen.
    await pill(page).focus();
    const card = await cueCard(page);
    await expect(card).toBeVisible();
    const open = await cueCardBox(page);
    expect(open.width).toBeGreaterThan(0);
    expect(open.x).toBeGreaterThanOrEqual(0);
    expect(open.x + open.width).toBeLessThanOrEqual(390 + NEARLY);
    const withCardOpen = await scrolls();
    expect(withCardOpen.documentWidth).toBeLessThanOrEqual(withCardOpen.viewportWidth);
  });

  test('opens its card clear of the pill it hangs from', async ({ page }) => {
    await planWithACue(page);
    await pill(page).focus();
    const cardLocator = await cueCard(page);
    await expect(cardLocator).toBeVisible();

    const cue = await boxOf(page, '[data-optimization-cue]');
    const card = await cueCardBox(page);
    expect(card.width, 'the card has no rendered width').toBeGreaterThan(0);
    expect(card.height, 'the card has no rendered height').toBeGreaterThan(0);
    // Clear of it, on whichever side it opened: a card drawn over the control
    // that opened it hides the thing being explained.
    const overlaps =
      card.x < cue.x + cue.width &&
      cue.x < card.x + card.width &&
      card.y < cue.y + cue.height &&
      cue.y < card.y + card.height;
    // Proof: the anchor's `bottom` set to the pill's own `top`, so
    // `surfacePlacement` opens the card six pixels below the pill's top edge
    // rather than below the pill — and this failed on `the card is drawn over
    // the pill · Expected: false · Received: true`. Watched 2026-09-08. The
    // two non-zero assertions above are what stop this being a claim about two
    // empty boxes (R5 #16).
    expect(overlaps, 'the card is drawn over the pill').toBe(false);
    await expect(cardLocator).toContainText('PRI · 7 days · Earlier project deadline by 3 days');
  });

  test('opens on a click, and Escape gives the focus back to the pill', async ({ page }) => {
    await planWithACue(page);
    // Default actions: a click on a button, and Escape inside a menu. jsdom
    // performs neither, which is why this claim cannot be made there.
    await pill(page).click();
    const items = page.getByRole('menuitem');
    await expect(items).toHaveCount(3);
    await expect(items.first()).toBeFocused();

    await page.keyboard.press('Escape');
    expect(await page.getByRole('menuitem').count()).toBe(0);
    await expect(pill(page)).toBeFocused();
  });

  test('asks be-01 for the schedule the reader picked', async ({ page }) => {
    await planWithACue(page);
    await pill(page).click();
    // The settings live on the project row, so the switch is a project PATCH
    // carrying the two schedule fields — not an optimization-scoped endpoint.
    const patched = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        /\/api\/projects\/[^/]+$/.test(new URL(request.url()).pathname),
    );
    await page.getByRole('menuitem', { name: /^PRI/ }).click();
    const request = await patched;
    expect(JSON.parse(request.postData() ?? '{}')).toEqual({
      scheduleEngine: 'optimized',
      scheduleObjective: 'pri',
    });
  });
});
