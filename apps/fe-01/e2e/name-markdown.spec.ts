import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * A name's markdown, in a browser.
 *
 * **Every assertion here is one jsdom cannot make**, and that is the whole
 * reason this file exists rather than another `describe` in
 * `wbs-table.test.tsx`. Three of this repository's recorded checks-that-cannot-
 * fail were unit tests standing over a browser's fault (`AGENTS.md`, R5
 * #14/#15, `M mobile-cards`, `T2 compact-columns`), and this change has the
 * same shape twice over:
 *
 * - **jsdom computes no layout.** A `p` margin, a `pre` block or a wrapped
 *   `<h1>` costs it nothing, so every DOM assertion about a name's markdown
 *   passes straight through the fault D3 is about.
 * - **jsdom applies no stylesheet.** The swap between the two boxes of a Name
 *   cell — the textarea's ink transparent at rest, the rendered box gone on
 *   focus — is two rules in `styles.css` and nothing else. A unit test can see
 *   the attribute they hang off and can never see the swap.
 *
 * The rendered box is deliberately out of the flow (`position: absolute`), so
 * "a row's height never moves" is true by **construction** rather than by
 * measurement. That makes the row-height assertion here the weaker half of the
 * claim, and it is written down as such: the load-bearing measurement is the
 * **rendered box's own height**, which does move when the block allowlist goes.
 */

/** The four names the height claim is made over, and what each of them is for. */
const NAMES = {
  /** A name with no markdown in it at all: the height every other row is held to. */
  plain: 'Strip the wiring',
  /** The inline grammar, which renders — and must still be one line high. */
  inline: '**bold** and *italic*',
  /** A heading marker, which must render as the characters it is. */
  heading: '# heading',
  /** A list marker, the other half of D3's block case. */
  list: '- list',
} as const;

/** The four rows, in the order they are made. */
const NUMBERS = ['010', '020', '030', '040'] as const;

/**
 * Signs up a throwaway account and makes a plan of `rows` empty work items.
 *
 * Through the UI, like the other browser gates: the boxes being measured are
 * ones somebody has typed into, sized by the same render path a real session
 * takes.
 */
async function seedRows(page: Page, rows: number): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();

  await page.getByRole('button', { name: 'New project' }).click();
  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (let made = 1; made <= rows; made += 1) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${String(made * 10).padStart(3, '0')}`)).toBeVisible();
  }
}

/** Types `text` into a Name cell and leaves it, which is what saves it. */
async function writeInto(cell: Locator, text: string): Promise<void> {
  await cell.fill(text);
  await cell.blur();
}

/**
 * The rendered reading of one Name cell — the box a reader actually sees.
 *
 * Found through the row's own id rather than by position: the two boxes carry
 * the same cell key, which is the one identity the grid and this file can agree
 * on (`cell-input.tsx`).
 */
async function renderedNameOf(page: Page, number: string): Promise<Locator> {
  const rowId = await page.getByLabel(`Name of ${number}`).getAttribute('data-name-input');
  expect(rowId, `the Name cell of ${number} carries no work item id`).not.toBeNull();
  return page.locator(`[data-cell-rendered="${rowId ?? ''}::name"]`);
}

/** Puts the page in one palette, the way `hover-cards.spec.ts` does. */
const wearPalette = (page: Page, palette: 'light' | 'dark'): Promise<void> =>
  page.evaluate((wanted) => {
    document.documentElement.classList.toggle('dark', wanted === 'dark');
  }, palette);

/** The height of a box that must be on screen, refusing a measurement of nothing. */
async function heightOf(box: Locator, what: string): Promise<number> {
  const measured = await box.boundingBox();
  expect(measured, `${what} is not on screen to be measured`).not.toBeNull();
  expect(measured?.height ?? 0, `${what} has no height at all`).toBeGreaterThan(0);
  return measured?.height ?? 0;
}

/** The metrics that decide whether the drawn text sits over the typed text. */
const boxMetrics = (node: Element) => {
  const style = getComputedStyle(node);
  return {
    paddingLeft: style.paddingLeft,
    paddingTop: style.paddingTop,
    borderLeftWidth: style.borderLeftWidth,
    borderTopWidth: style.borderTopWidth,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
  };
};

test.describe('a name of block markdown does not grow what it is drawn in', () => {
  for (const palette of ['light', 'dark'] as const) {
    test(`four rows, four names, one height — in ${palette}`, async ({ page }) => {
      await seedRows(page, NUMBERS.length);
      await wearPalette(page, palette);

      await writeInto(page.getByLabel('Name of 010'), NAMES.plain);
      await writeInto(page.getByLabel('Name of 020'), NAMES.inline);
      await writeInto(page.getByLabel('Name of 030'), NAMES.heading);
      await writeInto(page.getByLabel('Name of 040'), NAMES.list);

      // The precondition, and it is not a formality: a run where the markdown
      // never rendered would compare four identical plain rows and pass.
      await expect(page.locator('[data-cell-rendered] strong')).toHaveText('bold');
      await expect(page.locator('[data-cell-rendered] em')).toHaveText('italic');
      await expect(await renderedNameOf(page, '030')).toHaveText(NAMES.heading);
      await expect(await renderedNameOf(page, '040')).toHaveText(NAMES.list);

      // **The load-bearing measurement.** The rendered box is out of the flow,
      // so a block box inside it grows *it* and not the row: with the block
      // allowlist removed, `# heading` renders an `<h1>` whose margins and 2em
      // type stand well clear of one line of a 13px cell.
      const drawn: number[] = [];
      for (const number of NUMBERS) {
        drawn.push(await heightOf(await renderedNameOf(page, number), `the name of ${number}`));
      }
      for (const [at, height] of drawn.entries()) {
        expect(
          height,
          `${palette}: the rendered name of ${NUMBERS[at] ?? ''} is not one line high`,
        ).toBeCloseTo(drawn[0] ?? 0, 0);
      }

      // And the row itself, which is what a reader sees move. Weaker than the
      // measurement above **by construction** — the rendered box is absolutely
      // positioned, so nothing inside it can push a row — and here because that
      // is the requirement's own words, and because the day somebody puts the
      // rendered box back in the flow this is the assertion that notices.
      const rows: number[] = [];
      for (const number of NUMBERS) {
        rows.push(
          await heightOf(
            page.getByLabel(`Name of ${number}`).locator('xpath=ancestor::tr[1]'),
            `row ${number}`,
          ),
        );
      }
      for (const [at, height] of rows.entries()) {
        expect(height, `${palette}: row ${NUMBERS[at] ?? ''} is not the height of the first`).toBe(
          rows[0],
        );
      }
    });
  }
});

test.describe('the Name cell shows one of its two boxes at a time', () => {
  test('the rendered reading at rest, the source the moment it is written in', async ({ page }) => {
    await seedRows(page, 1);

    const box = page.getByLabel('Name of 010');
    await writeInto(box, NAMES.inline);
    const rendered = await renderedNameOf(page, '010');

    // At rest: the drawn box is on screen and the box under it has no ink of
    // its own, so the asterisks are not read twice.
    await expect(rendered).toBeVisible();
    expect(
      await box.evaluate((node) => getComputedStyle(node).color),
      'the source is still inked under the rendered name',
    ).toBe('rgba(0, 0, 0, 0)');

    // Written in: the drawn box is gone and the source is back, ink and all.
    await box.click();
    await expect(rendered).toBeHidden();
    expect(await box.inputValue(), 'the box holds something other than the source').toBe(
      NAMES.inline,
    );
    expect(
      await box.evaluate((node) => getComputedStyle(node).color),
      'the source somebody is typing is still invisible',
    ).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('the drawn text sits exactly where the typed text sits', async ({ page }) => {
    await seedRows(page, 1);

    const box = page.getByLabel('Name of 010');
    await writeInto(box, NAMES.plain);
    const rendered = await renderedNameOf(page, '010');

    // One spelling, two boxes: the rendered box takes the user agent's own
    // `<textarea>` metrics from `[data-cell-rendered]` in `styles.css`, and a
    // caller that gives its box a padding of its own puts the same class on
    // both. A mismatch here is a name that jumps sideways when it is clicked.
    expect(await rendered.evaluate(boxMetrics)).toEqual(await box.evaluate(boxMetrics));
  });

  test('a link in a name is not a tab stop and cannot be followed', async ({ page }) => {
    await seedRows(page, 1);

    const box = page.getByLabel('Name of 010');
    await writeInto(box, 'see [the plan](http://example.test/plan)');

    const drawn = await renderedNameOf(page, '010');
    await expect(drawn.locator('[data-name-link]')).toHaveText('the plan');
    // No anchor, so nothing to follow and nothing for Tab to land on. The
    // rendered box takes no pointer either, so a click on the link is a click
    // into the cell, which is what opens the editor.
    await expect(drawn.locator('a')).toHaveCount(0);
    expect(
      await drawn.evaluate((node) => getComputedStyle(node).pointerEvents),
      'the rendered name takes the pointer the box under it needs',
    ).toBe('none');
    await drawn.click();
    await expect(box).toBeFocused();
  });
});
