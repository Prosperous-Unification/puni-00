import { expect, type Page, test } from '@playwright/test';

/**
 * `deps-single-line`, measured by a browser.
 *
 * jsdom watches the declarations arrive on the strip (`wbs-table.test.tsx`:
 * the strip exists, it clips, the wrapper still positions the listbox).
 * Whether a seven-chip row really rests at a chipless row's height, and
 * whether a clipped chip really is invisible, are questions about layout and
 * hit testing — the exact fault class of R5 #14–16, where a green jsdom suite
 * sat over a behaviour only a browser performs. Both are answered here, in
 * Chromium, against a row with real area (#16's lesson: assert the area
 * before believing the invisibility).
 */

/**
 * Signs up a throwaway account and builds the deep-plan fixture's dependency
 * shape: nine root rows, `020` waiting for seven of them — enough chips that
 * a 110px column is overrun several times — and `030` waiting for nothing,
 * as the chipless row the height claim is measured against.
 */
async function seedSevenChips(page: Page, account: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('deps-cell-gate-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (const number of ['010', '020', '030', '040', '050', '060', '070', '080', '090']) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }

  // Seven siblings — no ancestor or descendant among them, so be-01 refuses
  // none and the chip count below is exact.
  const waitedFor = ['030', '040', '050', '060', '070', '080', '090'];
  const depends = page.getByLabel('Add a dependency to 020');
  await depends.click();
  await depends.fill(waitedFor.join(', '));
  await depends.press('Enter');
  await expect(page.getByRole('button', { name: /^Stop 020 waiting for / })).toHaveCount(7);

  // At rest: the picker owns the cell while the box has the focus, and every
  // claim in this file is about the cell once it has been left.
  await page.getByLabel('Name of 010').click();
  await page.getByLabel('Name of 010').blur();
}

let account = 0;

test.beforeEach(async ({ page }) => {
  account += 1;
  await seedSevenChips(page, `e2e-deps-${String(Date.now())}-${String(account)}`);
});

test.describe('the deps cell rests on one line', () => {
  test('rests the seven-chip row at a chipless row’s height', async ({ page }) => {
    const measured = await page.evaluate(() => {
      const rowOf = (number: string): HTMLTableRowElement => {
        const box = document.querySelector(`[aria-label="Add a dependency to ${number}"]`);
        const row = box?.closest('tr');
        if (!(row instanceof HTMLTableRowElement))
          throw new Error(`no row on screen for ${number}`);
        return row;
      };
      const strip = rowOf('020').querySelector('[data-depends-strip]');
      if (!(strip instanceof HTMLElement)) throw new Error('020 has no depends strip');
      // The chips by their own name, not every button in the cell: since
      // `dep-add-button` the strip also carries the add affordance, and a bare
      // `button` query would count it as an eighth chip.
      const chips = [
        ...rowOf('020').querySelectorAll<HTMLElement>(
          'td[data-column="depends"] button[aria-label^="Stop "]',
        ),
      ];
      return {
        chipBoxes: chips.map((chip) => {
          const box = chip.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
        // The clip engaged for real: more strip content than strip.
        stripScrollWidth: strip.scrollWidth,
        stripClientWidth: strip.clientWidth,
        heavy: rowOf('020').getBoundingClientRect().height,
        chipless: rowOf('030').getBoundingClientRect().height,
      };
    });

    // Preconditions before the claim, or the equality below would hold for a
    // table that rendered no chips at all (R5 #16): seven chips, each laid
    // out with real area, and a strip that really is clipping.
    expect(measured.chipBoxes).toHaveLength(7);
    for (const [at, chip] of measured.chipBoxes.entries()) {
      expect(chip.width, `chip ${String(at)} has no width`).toBeGreaterThan(0);
      expect(chip.height, `chip ${String(at)} has no height`).toBeGreaterThan(0);
    }
    expect(
      measured.stripScrollWidth,
      'nothing is clipped, so this test is about an uncrowded cell',
    ).toBeGreaterThan(measured.stripClientWidth);

    // The claim: seven chips cost the row nothing. Within a pixel — rect
    // edges are sub-pixel.
    expect(
      Math.abs(measured.heavy - measured.chipless),
      `the seven-chip row is ${String(measured.heavy)}px where the chipless row is ${String(measured.chipless)}px`,
    ).toBeLessThanOrEqual(1);
  });

  test('a clipped chip is invisible at rest, and an unclipped one is not', async ({ page }) => {
    const probed = await page.evaluate(() => {
      const chipAt = (label: string): HTMLElement => {
        const chip = document.querySelector(`[aria-label="${label}"]`);
        if (!(chip instanceof HTMLElement)) throw new Error(`no chip on screen: ${label}`);
        return chip;
      };
      // Row 020's strip — reached from one of its own chips, never by a
      // document-wide query that would answer with the first row's.
      const strip = chipAt('Stop 020 waiting for 030').closest('[data-depends-strip]');
      // Hit-test one chip: what the page answers at its centre. `overflow:
      // hidden` clips hit testing along with paint, so this is what
      // distinguishes a chip somebody can see (and click) from one the strip
      // has clipped — `getBoundingClientRect` alone cannot, since a clipped
      // box still reports its full geometry.
      const probe = (label: string) => {
        const chip = chipAt(label);
        const box = chip.getBoundingClientRect();
        const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          width: box.width,
          height: box.height,
          left: box.left,
          answersToTheChip: at !== null && chip.contains(at),
          answered: at === null ? '(nothing)' : `<${at.tagName.toLowerCase()}>`,
        };
      };
      if (strip === null) throw new Error('no depends strip on the page');
      return {
        stripVisibleRight: strip.getBoundingClientRect().right,
        first: probe('Stop 020 waiting for 030'),
        last: probe('Stop 020 waiting for 090'),
      };
    });

    // The probe can see a chip at all — without this, "the last chip answers
    // to something else" would also be true of a page with no chips and of a
    // probe aimed wrong (R5 #16 again, and `D directory-page`'s lesson:
    // assert where the fault lives, with the probe proven live beside it).
    expect(probed.first.width).toBeGreaterThan(0);
    expect(probed.first.height).toBeGreaterThan(0);
    expect(
      probed.first.answersToTheChip,
      `the first chip's own centre answers ${probed.first.answered}`,
    ).toBe(true);

    // The last chip is laid out with real area — a zero-width chip would be
    // invisible for the wrong reason —
    expect(probed.last.width).toBeGreaterThan(0);
    expect(probed.last.height).toBeGreaterThan(0);
    // — stands wholly past the cell's visible edge —
    expect(
      probed.last.left,
      'the last chip is not even clipped, so this fixture stopped overrunning',
    ).toBeGreaterThanOrEqual(probed.stripVisibleRight - 1);
    // — and is invisible where it stands: the pixel at its centre belongs to
    // whatever the table put there instead.
    expect(
      probed.last.answersToTheChip,
      'a clipped chip still answered a hit test at its centre',
    ).toBe(false);
  });
});

/**
 * `dep-add-button`, measured by a browser.
 *
 * jsdom watches the button arrive at the head of the strip, focus the box on a
 * click, and cancel its own press (`wbs-table.test.tsx`). What it cannot watch
 * is any of the three reasons the button is shaped the way it is: whether the
 * head of a clipping line really escapes the clip, whether a real click really
 * lands the caret in the box, and whether a real press really leaves a
 * half-typed search alone — the last two being the exact fault class of R5
 * #12/#14/#15, where a green jsdom suite sat over a default action only a
 * browser performs.
 */
test.describe('the deps cell offers an always-visible add button', () => {
  test('keeps the add button visible in a cell whose chips are clipped', async ({ page }) => {
    const probed = await page.evaluate(() => {
      const at = (label: string): HTMLElement => {
        const found = document.querySelector(`[aria-label="${label}"]`);
        if (!(found instanceof HTMLElement)) throw new Error(`not on screen: ${label}`);
        return found;
      };
      const probe = (label: string) => {
        const node = at(label);
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          width: box.width,
          height: box.height,
          answersToItself: hit !== null && node.contains(hit),
          answered: hit === null ? '(nothing)' : `<${hit.tagName.toLowerCase()}>`,
        };
      };
      const strip = at('Stop 020 waiting for 030').closest('[data-depends-strip]');
      if (!(strip instanceof HTMLElement)) throw new Error('no depends strip on the page');
      return {
        // The clip is engaged: more strip content than strip. Without this the
        // whole test would be about an uncrowded cell, where nothing is at risk
        // and the button's placement decides nothing (R5 #16).
        stripScrollWidth: strip.scrollWidth,
        stripClientWidth: strip.clientWidth,
        add: probe('Make 020 wait for something'),
        chip: probe('Stop 020 waiting for 030'),
        lastChip: probe('Stop 020 waiting for 090'),
      };
    });

    expect(
      probed.stripScrollWidth,
      'nothing is clipped, so this test is about an uncrowded cell',
    ).toBeGreaterThan(probed.stripClientWidth);
    // And the clip really does hide what it overruns — the fact the button's
    // placement is chosen against, re-established here so the claim below is
    // read against a cell that is genuinely cutting things off.
    expect(
      probed.lastChip.answersToItself,
      'the last chip is not clipped, so this fixture stopped overrunning',
    ).toBe(false);

    // The claim: the affordance is laid out with real area and answers a hit
    // test at its own centre, in the crowded cell that clipped the chip above.
    expect(probed.add.width).toBeGreaterThan(0);
    expect(probed.add.height).toBeGreaterThan(0);
    expect(
      probed.add.answersToItself,
      `the add button's own centre answers ${probed.add.answered}`,
    ).toBe(true);

    // And it costs the strip's line nothing: no taller than the chips, which
    // are what set that line's height and so the row's. Sub-pixel tolerance,
    // rect edges being fractional.
    expect(probed.chip.height).toBeGreaterThan(0);
    expect(
      probed.add.height,
      `the add button is ${String(probed.add.height)}px where a chip is ${String(probed.chip.height)}px`,
    ).toBeLessThanOrEqual(probed.chip.height + 1);
  });

  test('opens the picker from the add button, with the caret in the box', async ({ page }) => {
    // 010 waits for nothing in this fixture and so has rows left to be offered
    // — 020 already waits for seven of the nine, and a cell with nothing to
    // offer opens no list at all (the same trap `layout.spec.ts` records).
    await page.getByRole('button', { name: 'Make 010 wait for something' }).click();

    await expect(page.getByRole('listbox')).toBeVisible();
    // The caret is where somebody can type, which is the whole point of the
    // affordance: it is not a second path to the picker, it is the first path
    // to the box.
    await expect(page.getByLabel('Add a dependency to 010')).toBeFocused();
  });

  test('keeps a half-typed search when the add button is pressed', async ({ page }) => {
    // The press must not move the focus. Without the `preventDefault` on it the
    // button takes the focus, the box blurs, and this cell's blur closes the
    // picker and drops what was typed into it — a control that means "search"
    // eating the search. jsdom can only see the cancel; this sees the effect.
    const box = page.getByLabel('Add a dependency to 010');
    await box.click();
    await box.fill('03');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.getByRole('button', { name: 'Make 010 wait for something' }).click();

    await expect(box).toHaveValue('03');
    await expect(box).toBeFocused();
    await expect(page.getByRole('listbox')).toBeVisible();
  });
});
