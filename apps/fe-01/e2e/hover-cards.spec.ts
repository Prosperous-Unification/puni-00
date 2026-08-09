import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * The hover cards, measured by a browser.
 *
 * Three of the four assertions here are ones jsdom cannot make. jsdom sees a
 * card's presence, its text and its `pointer-events` declaration — and
 * `wbs-table.test.tsx` asserts all three — but it lays nothing out, so it can
 * see neither a card cut off at its cell's edge nor a click landing on the row
 * underneath one. Both of those are the exact shape of R5 tally #14–16: a green
 * unit suite over a fault only a browser performs.
 *
 * The fourth is instantness, and it is here because a delay is a thing a
 * browser has and jsdom does not: every assertion about an open card in this
 * file reads the DOM once, without Playwright's retrying matchers, so a card
 * that arrived a frame late would fail rather than be waited for.
 */

/** Signs up a throwaway account and makes a plan two rows deep. */
async function seedPlan(page: Page, account: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('hover-cards-gate-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  const addRow = page.getByRole('button', { name: 'Add work item' });
  await addRow.click();
  await expect(page.getByLabel('Name of 010')).toBeVisible();
  await addRow.click();
  await expect(page.getByLabel('Name of 020')).toBeVisible();

  const first = page.getByLabel('Name of 010');
  await first.fill('Survey the existing warehouse racking');
  await first.blur();
  const second = page.getByLabel('Name of 020');
  await second.fill('Draft the replacement layout');
  await second.blur();

  // The trio the folded cell hides behind one figure, and the row the card is
  // read from.
  const estimate = page.getByLabel('Dev estimate for 010');
  await estimate.fill('2/3/8');
  await estimate.blur();
  await expect(estimate).not.toHaveValue('');
}

/**
 * The folded Dev cell of one row — the wrapper the figure, the assignee and the
 * card share.
 *
 * Found through the box inside it rather than by `[data-final="…"]`: a role's
 * id is whatever be-01 minted when the project was made, so the only stable
 * handle on this cell is the label the column writes from the role's *name*.
 */
const foldedDevCell = (page: Page, number: string): Locator =>
  page.getByLabel(`Dev estimate for ${number}`).locator('..');

/** How many cards are open, read once — never waited for. */
const cardsOpen = (page: Page): Promise<number> => page.locator('[role="tooltip"]').count();

/** The open card's text, read once. */
async function cardText(page: Page): Promise<string> {
  const open = page.locator('[role="tooltip"]');
  expect(await open.count(), 'no card is open').toBe(1);
  return (await open.first().textContent()) ?? '';
}

/** The box a locator occupies, refused rather than defaulted when it has none. */
async function boxOf(locator: Locator, what: string): Promise<DOMRect> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${what} has no box on this page`);
  return box as DOMRect;
}

let account = 0;

test.beforeEach(async ({ page }) => {
  account += 1;
  await seedPlan(page, `e2e-hover-${String(Date.now())}-${String(account)}`);
});

test.describe('a hover card answers at once, whole, and out past its cell', () => {
  test('opens the folded figure in the same breath as the mouse arrives', async ({ page }) => {
    await foldedDevCell(page, '010').hover();

    // One read, no retry: `toBeVisible` would wait up to ten seconds for a card
    // that opens on a timer, and a card that opens on a timer is the thing this
    // change exists to not build.
    expect(await cardsOpen(page), 'no card in the frame the mouse arrived in').toBe(1);
    const text = await cardText(page);
    expect(text).toContain('optimistic 2');
    expect(text).toContain('realistic 3');
    expect(text).toContain('pessimistic 8');
  });

  test('paints the card past the bottom of a 96px cell', async ({ page }) => {
    // The `<td>` clips its contents (`CELL`'s `overflow: hidden`) and
    // `opensAPopover` lifts that for this column. A clipped box still reports
    // its full geometry, so measuring the card is not enough — what is asked
    // here is whether anything is *painted* below the cell, which is a
    // screenshot of that strip with the card open against the same strip with
    // it closed.
    //
    // Hit testing would be the cheaper probe and it is not available: a card
    // takes no pointer events, so `elementFromPoint` returns whatever is under
    // it whether the card is clipped or not.
    //
    // Proof: `opensAPopover`'s `-final` suffix branch removed, this failed on
    // `expected true to be false // the strip below the cell looks the same
    // with the card open` — the card cut off at the cell edge. Watched,
    // 2026-08-09.
    const folded = foldedDevCell(page, '010');
    const cell = folded.locator('xpath=ancestor::td');

    await folded.hover();
    expect(await cardsOpen(page)).toBe(1);

    const card = await boxOf(page.locator('[role="tooltip"]').first(), 'the card');
    const cellBox = await boxOf(cell, 'the folded cell');
    // The precondition, and R5 tally #16 is why it is here: a card of no size,
    // or one that never reached past its cell, would make the strip below it
    // empty and the comparison meaningless.
    expect(card.width, 'the card has no width').toBeGreaterThan(0);
    expect(card.height, 'the card has no height').toBeGreaterThan(0);
    expect(
      Math.round(card.y + card.height - (cellBox.y + cellBox.height)),
      'the card does not reach past the bottom of its cell',
    ).toBeGreaterThan(8);

    // A strip strictly below the cell, inside the card's own width.
    const strip = {
      x: Math.round(card.x + 4),
      y: Math.round(cellBox.y + cellBox.height + 2),
      width: Math.round(Math.min(card.width - 8, 120)),
      height: 8,
    };
    const painted = await page.screenshot({ clip: strip });

    // Away, and the card with it — then the same strip again.
    await page.mouse.move(0, 0);
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
    const bare = await page.screenshot({ clip: strip });

    // Compared as text rather than through `Buffer.equals`, which this
    // project's `Buffer` types will not accept another `Buffer` for.
    expect(
      painted.toString('base64') === bare.toString('base64'),
      'the strip below the cell looks the same with the card open',
    ).toBe(false);
  });

  test('lets a click through to the row underneath it', async ({ page }) => {
    // The fault this rule was written for: a card hanging over the row below
    // eats a click aimed at that row. `pointer-events: none` is the fix, and a
    // browser is the only thing that performs a click through a box.
    //
    // Proof: `HoverCard`'s default flipped to `pointerEvents: 'auto'`, this
    // failed on `locator.click: Test timeout of 60000ms exceeded` with the call
    // log reading `<div role="tooltip" aria-label="Dev for 010">…</div> …
    // intercepts pointer events` — the click retried until the clock ran out.
    // Watched, 2026-08-09.
    await foldedDevCell(page, '010').hover();
    expect(await cardsOpen(page)).toBe(1);

    // The same column, one row down — which is where this card hangs.
    const under = page.getByLabel('Dev estimate for 020');
    const underBox = await boxOf(under, 'the second row’s Dev cell');
    const card = await boxOf(page.locator('[role="tooltip"]').first(), 'the card');
    expect(
      underBox.y,
      'the card does not reach the row below, so this test clicks nothing',
    ).toBeLessThan(card.y + card.height);

    await under.click({ position: { x: 4, y: 4 } });

    await expect(under).toBeFocused();
  });
});

test.describe('the Name cell answers from its marker alone', () => {
  test('opens nothing from the cell and the rendered notes from the marker', async ({ page }) => {
    const name = page.getByLabel('Name of 010');
    await name.fill('Racking survey\n\n## Risks\n\n- the mezzanine is *unsurveyed*');
    await name.blur();

    await name.hover();
    expect(await cardsOpen(page), 'the cell itself opened a preview').toBe(0);

    await page.getByLabel('Notes on 010').hover();

    expect(await cardsOpen(page), 'the marker opened no preview').toBe(1);
    // Rendered, not printed: the heading and the emphasis are elements, which
    // is the whole difference between the preview and the box under it.
    const preview = page.getByRole('tooltip', { name: 'Notes for 010, rendered' });
    expect(await preview.locator('h2').textContent()).toBe('Risks');
    expect(await preview.locator('li em').textContent()).toBe('unsurveyed');
  });

  test('marks only the rows that have notes', async ({ page }) => {
    const name = page.getByLabel('Name of 010');
    await name.fill('Racking survey\nthe mezzanine is unsurveyed');
    await name.blur();

    await expect(page.getByLabel('Notes on 010')).toBeVisible();
    await expect(page.getByLabel('Notes on 020')).toHaveCount(0);
  });
});
