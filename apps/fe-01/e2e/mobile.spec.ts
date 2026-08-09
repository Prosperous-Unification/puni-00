import { expect, type Page, test } from '@playwright/test';

/**
 * The plan on a phone, measured by a browser.
 *
 * `plan-cards.test.tsx` proves what the cards render and which cells they are.
 * This file exists for the four things jsdom cannot answer, and every one of
 * them is the reason `M mobile-cards` was asked for:
 *
 * 1. **Nothing scrolls sideways.** jsdom lays nothing out, so a card whose
 *    figure box is 8px wider than the screen looks identical to one that fits.
 * 2. **A finger can hit the controls.** 44px is a measured rectangle or it is
 *    nothing.
 * 3. **A real focus trap.** Radix moves the focus with `focusin` listeners and
 *    sentinels, none of which jsdom performs — so the claim that the toolbar
 *    sheet gets out of the way of the caret can only be made here. It is the
 *    half `lands the focus in the card of a work item it just created` names
 *    and cannot see.
 * 4. **A round trip.** Typed on a card, written by be-01, read back after a
 *    reload — and a peer's edit arriving mid-word over a real socket rather
 *    than a dispatched event.
 */

/** An iPhone 14's CSS viewport, which is what the plan calls the phone case. */
test.use({ viewport: { width: 390, height: 844 } });

/** The name every card test types, long enough to wrap on a 390px screen. */
const A_LONG_NAME = 'Survey the existing warehouse racking and photograph every aisle end';

/** Opens the toolbar sheet, which is the only way to any toolbar control here. */
async function openTheSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Plan actions' }).click();
  await expect(page.getByRole('dialog', { name: 'Plan actions' })).toBeVisible();
}

/**
 * Signs up a throwaway account and builds the smallest plan with two cards in
 * it, through the UI and therefore through the sheet.
 *
 * Two rows because the peer test needs a row to be edited that is not the one
 * being typed in — the whole question is whether somebody else's change to
 * another card disturbs this one.
 */
async function seedPlan(page: Page, account: string): Promise<void> {
  await page.goto('/');

  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('mobile-gate-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('button', { name: 'Plan actions' })).toBeVisible();

  for (const number of ['010', '020']) {
    await openTheSheet(page);
    await page.getByRole('button', { name: 'Add work item' }).click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }
}

/**
 * One edit by somebody else, made the way somebody else makes it: a request to
 * be-01 from outside this page's own UI, which gw-01 then tells the page about.
 *
 * The session token is read out of the same `localStorage` the app keeps it in.
 * A second browser context signed into a second account would be the purer
 * fixture and is a change of its own — every project in this deployment is
 * readable by every account, but nothing in this spec's stack seeds a second
 * one, and what is being measured is what arrives at *this* page rather than
 * who sent it.
 */
async function aPeerRenames(page: Page, workItemId: string, name: string): Promise<void> {
  const status = await page.evaluate(
    async ([id, newName]) => {
      const raw = localStorage.getItem('wbs.session');
      if (raw === null) throw new Error('no session to borrow a token from');
      const session = JSON.parse(raw) as { token: string };
      const res = await fetch(`/api/work-items/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-wbs-token': session.token },
        body: JSON.stringify({ name: newName }),
      });
      return res.status;
    },
    [workItemId, name] as const,
  );
  expect(status, 'the peer edit was refused by be-01').toBe(200);
}

let account = 0;

test.beforeEach(async ({ page }) => {
  account += 1;
  await seedPlan(page, `e2e-mb-${String(Date.now())}-${String(account)}`);
});

test.describe('the plan on a phone, measured by a browser', () => {
  test('is cards, and nothing on the page scrolls sideways', async ({ page }) => {
    await expect(page.locator('[data-plan-cards]')).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);

    await page.getByLabel('Name of 010').fill(A_LONG_NAME);
    await page.getByLabel('Name of 010').blur();

    // The document first: the whole failure this renderer exists to remove is a
    // page you drag sideways to read one column of.
    const page_ = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    });
    expect(page_.scrollWidth, 'the page scrolls sideways').toBeLessThanOrEqual(page_.clientWidth);

    // Then each card, because a card that overflows its own box is the same
    // failure one level in — and the page can hide it behind `overflow`.
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll('[data-card]')].map((card) => ({
        number: card.querySelector('[data-number]')?.textContent ?? '?',
        scrollWidth: card.scrollWidth,
        clientWidth: card.clientWidth,
      })),
    );
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.scrollWidth, `card ${card.number} overflows itself`).toBeLessThanOrEqual(
        card.clientWidth,
      );
    }
  });

  test('gives every control a finger has to hit at least 44px', async ({ page }) => {
    const controls = [
      page.getByRole('button', { name: 'Plan actions' }),
      page.getByLabel('Name of 010'),
      page.getByLabel('Dev estimate for 010'),
    ];
    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box, 'the control is not on screen at all').not.toBeNull();
      expect(
        box?.height ?? 0,
        `${(await control.getAttribute('aria-label')) ?? 'control'} is short`,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test('sends a name typed on a card, and reads it back after a reload', async ({ page }) => {
    const name = page.getByLabel('Name of 010');
    await name.fill(A_LONG_NAME);
    await name.blur();
    // The plan, not the box: a value still on screen proves only that nothing
    // wiped it. The reload is what asks be-01.
    await page.reload();

    await expect(page.getByLabel('Name of 010')).toHaveValue(A_LONG_NAME);
  });

  /**
   * The sheet gets out of the way, and the caret goes where the create asked
   * for it.
   *
   * This is the browser half of `plan-cards.test.tsx`'s focus test: there, a
   * sheet left open still let the caret through, because jsdom performs none of
   * a focus scope. Here it would not.
   */
  test('closes the sheet on a control that acts, and lands the caret in the new card', async ({
    page,
  }) => {
    await openTheSheet(page);
    await page.getByRole('button', { name: 'Add work item' }).click();

    await expect(page.getByRole('dialog', { name: 'Plan actions' })).toBeHidden();
    await expect(page.getByLabel('Name of 030')).toBeFocused();
  });

  /**
   * The other half of that close, and the one that shipped broken: a control
   * that aims the caret nowhere must hand the focus back to the trigger.
   *
   * `onCloseAutoFocus` refused Radix's restore for **every** control on the
   * sheet, so `Collapse all`, `Gantt`, `Undo` and the exports each closed it and
   * left the focus on `<body>`. On a phone the sheet is the only route to any of
   * them, so that is a reader with nothing focused and nothing to Tab from,
   * every time they fold the plan.
   *
   * The browser is the honest oracle for this even though jsdom can see the
   * restore itself: what is being claimed is where a real `FocusScope` leaves
   * the focus as it unmounts, and jsdom performs none of the `focusin`
   * bookkeeping that scope is made of. `plan-cards.test.tsx` makes the same
   * assertion one layer down; this is the one that counts.
   *
   * Proof: `sheetControlTakesTheFocus.current` pinned back to the unconditional
   * `true` that shipped, this failed on `expect(locator).toBeFocused() …
   * Expected: focused / Received: inactive` for the `Plan actions` trigger, with
   * `document.activeElement` on `<body>`. Watched in Chromium at 390×844,
   * 2026-08-09.
   */
  test('gives the focus back to the trigger on a control that aims the caret nowhere', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: 'Plan actions' });
    await openTheSheet(page);
    await page.getByRole('button', { name: 'Collapse all' }).click();

    await expect(page.getByRole('dialog', { name: 'Plan actions' })).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  /**
   * A peer's edit arriving mid-word, over a real socket: it must take neither
   * the focus nor the half-typed value.
   *
   * Rule 2 of `live-editing.ts`, on the card renderer — the rule the whole
   * live-editing module exists for, and the one a second renderer was most
   * likely to lose. Typed and **not** left: the word is still being written.
   */
  test('keeps the focus and the half-typed word when somebody else edits another card', async ({
    page,
  }) => {
    const mine = page.getByLabel('Name of 010');
    await mine.click();
    await mine.pressSequentially('Strip the wir');

    const theirs = await page.locator('[data-card]').nth(1).getAttribute('data-card');
    expect(theirs, 'the second card has no id to rename by').not.toBeNull();
    await aPeerRenames(page, theirs ?? '', 'Their new name');

    await expect(page.getByLabel('Name of 020')).toHaveValue('Their new name');
    await expect(mine).toBeFocused();
    await expect(mine).toHaveValue('Strip the wir');
  });
});
