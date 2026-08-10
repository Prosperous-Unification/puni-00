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

/** How far under the pinned block the card's own column is pushed, in px. */
const PIN_OVERLAP = 60;

test.describe('a card and the pinned columns it slides under', () => {
  test('paints over the pinned cell of the row below it', async ({ page }) => {
    // agy round 3, finding 6: the row lift (`POPOVER_ROW_LAYER`) is applied to
    // the Name column alone, so does a depends or folded-role card paint *under*
    // a pinned cell of the row below?
    //
    // The answer is no, and the reason is the one the lift's own comment gives:
    // it exists because the Name cell is `position: sticky` **with a z-index**,
    // which makes that `<td>` a stacking context and traps the preview inside it
    // at the pinned layer. Neither `depends` nor `<roleId>-final` is pinned —
    // `table-frame.test.ts` asserts `pinnedCellStyle` answers `undefined` for
    // both — so nothing on the way from those cards to the frame establishes a
    // stacking context, and the card's own `z-index: 20` competes directly with
    // the pinned layer, which is 1.
    //
    // Reasoning is not evidence, hence this. The two never overlap sitting
    // still — the pinned block is to the *left* of both columns and a card opens
    // rightwards — so the frame is scrolled until the depends column is half
    // under the pin, and the strip compared is inside the pinned Name cell of
    // the row below.
    //
    // Proof: `zIndex: 20` removed from `HoverCard`, this failed on `the pinned
    // cell below hides the card: expected false, received true`. Watched,
    // 2026-08-09.
    await page.setViewportSize({ width: 900, height: 700 });
    await page.getByRole('button', { name: 'Add work item' }).click();
    await expect(page.getByLabel('Name of 030')).toBeVisible();

    const typed = page.getByLabel('Add a dependency to 010');
    await typed.fill('030');
    await typed.press('Enter');
    await expect(page.getByLabel('Stop 010 waiting for 030')).toBeVisible();
    // The picker owns the cell while the box has the focus, so the card only
    // opens once the box has been left — which is how a reader reaches it too.
    await page.getByLabel('Name of 020').click();

    const dependsCell = page.getByLabel('Add a dependency to 010').locator('..');
    // The pinned cell, not the box inside it: the `<td>` is what is sticky, what
    // carries the opaque background, and what would hide the card.
    const pinnedBelow = page.getByLabel('Name of 020').locator('xpath=ancestor::td');

    // Measured, not guessed: how far the frame has to travel to put the left
    // 60px of the depends column under the pinned block, leaving its right
    // edge clear for a pointer. Asserted rather than assumed, because a frame
    // that would not scroll leaves everything below overlapping nothing.
    const atRest = await boxOf(dependsCell, 'the depends cell');
    const pinRight = await boxOf(pinnedBelow, 'the pinned cell below').then(
      (pin) => pin.x + pin.width,
    );
    const slide = Math.round(atRest.x - pinRight + PIN_OVERLAP);
    expect(slide, 'the depends column already sits under the pin').toBeGreaterThan(0);
    const reached = await page.evaluate((left) => {
      const frame = document.querySelector('[data-table-frame]');
      if (frame === null) throw new Error('the scrolling frame is not on the page');
      frame.scrollLeft = left;
      return frame.scrollLeft;
    }, slide);
    expect(reached, 'the frame would not scroll that far').toBe(slide);

    // On the half of the cell that is still clear of the pinned block: a
    // pointer aimed at the half under it lands on the pin instead.
    await dependsCell.hover({ position: { x: PIN_OVERLAP + 16, y: 4 } });
    expect(await cardsOpen(page), 'no card opened on the depends cell').toBe(1);

    const card = await boxOf(page.locator('[role="tooltip"]').first(), 'the card');
    const pinned = await boxOf(pinnedBelow, 'the pinned cell below');
    // The overlap, and it is a precondition rather than a formality: an empty
    // rectangle would make the comparison below a screenshot of two identical
    // patches of nothing — R5 tally #16, which is exactly this mistake.
    const strip = {
      x: Math.round(Math.max(card.x, pinned.x)),
      y: Math.round(Math.max(card.y, pinned.y)),
      width: 0,
      height: 0,
    };
    strip.width = Math.round(Math.min(card.x + card.width, pinned.x + pinned.width) - strip.x);
    strip.height = Math.round(Math.min(card.y + card.height, pinned.y + pinned.height) - strip.y);
    expect(strip.width, 'the card and the pinned box below it do not overlap').toBeGreaterThan(8);
    expect(strip.height, 'the card and the pinned box below it do not overlap').toBeGreaterThan(4);

    const painted = await page.screenshot({ clip: strip });
    await page.mouse.move(0, 0);
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
    const bare = await page.screenshot({ clip: strip });

    expect(
      painted.toString('base64') === bare.toString('base64'),
      'the pinned cell below hides the card',
    ).toBe(false);
  });
});

/** The `<tr>` a numbered row's cells sit in, found through its own Name box. */
const rowOf = (page: Page, number: string): Locator =>
  page.getByLabel(`Name of ${number}`).locator('xpath=ancestor::tr');

/**
 * The painted colour of a row's pinned Name cell.
 *
 * The **pinned** cell on purpose: it paints an opaque inline background, so a
 * highlight only reaches it through the `--cell-bg` join — which is exactly
 * the wiring these tests exist to see. jsdom asserts the `data-dep-lit`
 * attribute; whether any pixel changes colour is the cascade's doing, and the
 * cascade runs here.
 */
const rowBg = (page: Page, number: string): Promise<string> =>
  rowOf(page, number)
    .locator('td[data-column="name"]')
    .evaluate((cell) => getComputedStyle(cell).backgroundColor);

test.describe('hovering a dependency lights the rows it names', () => {
  /** A third row, waiting for the two the shared seed made. */
  async function seed030WaitingForBoth(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Add work item' }).click();
    await expect(page.getByLabel('Name of 030')).toBeVisible();
    const depends = page.getByLabel('Add a dependency to 030');
    await depends.click();
    await depends.fill('010, 020');
    await depends.press('Enter');
    await expect(page.getByRole('button', { name: /^Stop 030 waiting for / })).toHaveCount(2);
    // At rest: the picker owns the cell while the box has the focus.
    await page.getByLabel('Name of 010').click();
    await page.getByLabel('Name of 010').blur();
    await page.mouse.move(0, 0);
  }

  test('the cell lights every dependency’s row, and dark again on leaving', async ({ page }) => {
    await seed030WaitingForBoth(page);
    // The rest colours differ (banding), which is what makes the equality at
    // the bottom a claim about one shared tint rather than about any change.
    const rest010 = await rowBg(page, '010');
    const rest020 = await rowBg(page, '020');

    await page.getByLabel('Add a dependency to 030').hover();

    await expect(rowOf(page, '010')).toHaveAttribute('data-dep-lit', 'true');
    await expect(rowOf(page, '020')).toHaveAttribute('data-dep-lit', 'true');
    // Not the hovered row itself: the lit set is its dependencies, not it.
    await expect(rowOf(page, '030')).not.toHaveAttribute('data-dep-lit', 'true');
    // Polled: the cells cross-fade their background over 100ms.
    await expect.poll(() => rowBg(page, '010')).not.toBe(rest010);
    await expect.poll(() => rowBg(page, '020')).not.toBe(rest020);
    // One tint: a banded and an unbanded row land on the same colour, so the
    // rule re-pointed `--cell-bg` rather than nudging each row's own grey.
    expect(await rowBg(page, '010')).toBe(await rowBg(page, '020'));

    await page.mouse.move(0, 0);
    await expect.poll(() => rowBg(page, '010')).toBe(rest010);
    await expect.poll(() => rowBg(page, '020')).toBe(rest020);
  });

  test('a pill narrows the light to its row and tints its line in the card', async ({ page }) => {
    await seed030WaitingForBoth(page);
    const rest020 = await rowBg(page, '020');

    await page.getByRole('button', { name: 'Stop 030 waiting for 010' }).hover();

    await expect(rowOf(page, '010')).toHaveAttribute('data-dep-lit', 'true');
    await expect(rowOf(page, '020')).not.toHaveAttribute('data-dep-lit', 'true');
    await expect.poll(() => rowBg(page, '010')).not.toBe(await rowBg(page, '020'));
    expect(await rowBg(page, '020')).toBe(rest020);

    // The card is open — the pill is inside the cell the card belongs to —
    // and the pill's own line carries the lit row's exact painted colour: the
    // emphasis is the same tint spoken twice, not a second colour and not a
    // weight.
    expect(await cardsOpen(page)).toBe(1);
    const card = page.locator('[role="tooltip"]');
    const emphasised = card.getByText('010 - Survey the existing warehouse racking', {
      exact: true,
    });
    const other = card.getByText('020 - Draft the replacement layout', { exact: true });
    const litRow = await rowBg(page, '010');
    expect(await emphasised.evaluate((line) => getComputedStyle(line).backgroundColor)).toBe(
      litRow,
    );
    expect(await emphasised.evaluate((line) => getComputedStyle(line).fontWeight)).toBe('400');
    expect(await other.evaluate((line) => getComputedStyle(line).backgroundColor)).not.toBe(litRow);

    // Off the pill onto the cell's input area: the light widens back to every
    // dependency — the browser's own leave, `relatedTarget` and all.
    await page.getByLabel('Add a dependency to 030').hover();
    await expect(rowOf(page, '020')).toHaveAttribute('data-dep-lit', 'true');
    await expect.poll(() => rowBg(page, '020')).not.toBe(rest020);
  });

  test('a clipped chip has no hover target, and the cell still lights its row', async ({
    page,
  }) => {
    // The U3→U4 case, named in the plan rather than discovered: after
    // `deps-single-line` the strip clips, so a chip can stand out of sight
    // with no pixel to hover — its *row* must still light from the cell-level
    // hover. Seven siblings onto 020, the deep-plan shape `deps-cell.spec.ts`
    // proves the clipping of.
    const addRow = page.getByRole('button', { name: 'Add work item' });
    for (const number of ['030', '040', '050', '060', '070', '080', '090']) {
      await addRow.click();
      await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
    }
    const waitedFor = ['030', '040', '050', '060', '070', '080', '090'];
    const depends = page.getByLabel('Add a dependency to 020');
    await depends.click();
    await depends.fill(waitedFor.join(', '));
    await depends.press('Enter');
    await expect(page.getByRole('button', { name: /^Stop 020 waiting for / })).toHaveCount(7);
    await page.getByLabel('Name of 010').click();
    await page.getByLabel('Name of 010').blur();
    await page.mouse.move(0, 0);
    const rest090 = await rowBg(page, '090');

    const probed = await page.evaluate(() => {
      const chip = document.querySelector('[aria-label="Stop 020 waiting for 090"]');
      if (!(chip instanceof HTMLElement)) throw new Error('no chip for 090 on the page');
      const strip = chip.closest('[data-depends-strip]');
      if (!(strip instanceof HTMLElement)) throw new Error('the 090 chip is not in a strip');
      const box = chip.getBoundingClientRect();
      const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      // Somewhere in the cell that is neither a chip nor the box: the first
      // pixel along the strip's midline that hit-tests to the strip itself —
      // a gap between chips. That is what "cell-level hover" is once chips
      // crowd the cell, and finding it by hit test rather than by offset
      // keeps the probe honest about what the pointer would really land on.
      const stripBox = strip.getBoundingClientRect();
      const y = stripBox.y + stripBox.height / 2;
      let cellPoint: { x: number; y: number } | null = null;
      for (let x = Math.ceil(stripBox.x) + 1; x < stripBox.right - 1; x += 1) {
        if (document.elementFromPoint(x, y) === strip) {
          cellPoint = { x, y };
          break;
        }
      }
      return {
        chipWidth: box.width,
        chipHeight: box.height,
        clippedChipIsHoverable: at !== null && chip.contains(at),
        stripClips: strip.scrollWidth > strip.clientWidth,
        cellPoint,
      };
    });
    // The preconditions, before the claim (R5 #16): the chip is laid out with
    // real area, the strip really clips, and the chip's own centre answers to
    // something else — there is genuinely no hover target on it.
    expect(probed.chipWidth).toBeGreaterThan(0);
    expect(probed.chipHeight).toBeGreaterThan(0);
    expect(probed.stripClips, 'nothing is clipped; this fixture stopped overrunning').toBe(true);
    expect(probed.clippedChipIsHoverable, 'the 090 chip still answers a hit test').toBe(false);
    if (probed.cellPoint === null) throw new Error('no cell-level hover point in the strip');

    await page.mouse.move(probed.cellPoint.x, probed.cellPoint.y);

    // Every dependency's row lights — the clipped chip's included.
    for (const number of waitedFor) {
      await expect(rowOf(page, number)).toHaveAttribute('data-dep-lit', 'true');
    }
    await expect.poll(() => rowBg(page, '090')).not.toBe(rest090);
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

  test('scrolls a note taller than the preview once the pointer is on it', async ({ page }) => {
    // The one card that scrolls, and the only way to scroll it is to put the
    // pointer on it — which means crossing the name box between the marker at
    // the top right of the cell and the card hanging off its bottom edge. While
    // the marker owned the `mouseleave`, that trip unmounted the card before the
    // pointer arrived, and everything past 320px of a note was unreadable (codex
    // round 3, finding 1). The leave belongs to the cell, which holds both.
    //
    // A browser and nothing else can say this: jsdom lays nothing out, so it has
    // no 320px to overflow, no wheel, and no pointer that is anywhere. The
    // companion unit test — `keeps the preview open while the pointer crosses
    // the cell to reach it` — can see the state; only this can see the note.
    //
    // Proof: the `onMouseLeave` put back on the notes marker, this failed on
    // `the card closed on the way to it: expected 1, received 0`. Watched,
    // 2026-08-09.
    const lines = Array.from({ length: 40 }, (_, at) => `- line ${String(at + 1)}`);
    const name = page.getByLabel('Name of 010');
    await name.fill(`Racking survey\n\n${lines.join('\n')}`);
    await name.blur();

    await page.getByLabel('Notes on 010').hover();
    const card = page.locator('[role="tooltip"]');
    expect(await cardsOpen(page), 'the marker opened no preview').toBe(1);

    // The precondition, and R5 tally #16 is why it is stated: a note that fitted
    // the card would scroll nowhere, and every assertion below would hold of a
    // card nobody could break.
    const overflow = await card.evaluate((scrolled) => ({
      scrollHeight: scrolled.scrollHeight,
      clientHeight: scrolled.clientHeight,
    }));
    expect(
      overflow.scrollHeight,
      'the note fits the card, so there is nothing to scroll to',
    ).toBeGreaterThan(overflow.clientHeight + 40);

    const box = await boxOf(card.first(), 'the preview');
    await page.mouse.move(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));

    expect(await cardsOpen(page), 'the card closed on the way to it').toBe(1);

    await page.mouse.wheel(0, 4000);
    // Polled rather than read once: a wheel is applied on the compositor's own
    // schedule, and this is the one assertion in the file that is about a
    // gesture rather than about the frame a card opened in.
    await expect
      .poll(async () =>
        card.evaluate((scrolled) =>
          Math.round(scrolled.scrollHeight - scrolled.clientHeight - scrolled.scrollTop),
        ),
      )
      .toBeLessThanOrEqual(2);

    // And the last line is on screen, which is what a reader wanted: the numbers
    // above could be right about a box painted somewhere nobody can see.
    const lastBox = await boxOf(card.getByText('line 40', { exact: true }), 'the note’s last line');
    expect(lastBox.y).toBeGreaterThanOrEqual(box.y - 1);
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(box.y + box.height + 1);
  });

  test('marks only the rows that have notes', async ({ page }) => {
    const name = page.getByLabel('Name of 010');
    await name.fill('Racking survey\nthe mezzanine is unsurveyed');
    await name.blur();

    await expect(page.getByLabel('Notes on 010')).toBeVisible();
    await expect(page.getByLabel('Notes on 020')).toHaveCount(0);
  });
});
