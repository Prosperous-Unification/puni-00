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
      const chips = [
        ...rowOf('020').querySelectorAll<HTMLElement>('td[data-column="depends"] button'),
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
