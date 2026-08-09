import { expect, type Page, test } from '@playwright/test';

/**
 * The Tailwind integration, measured by the browser that has to run it.
 *
 * `src/styles.test.ts` asserts what comes out of the compiler; this file
 * asserts what a page does with it. The two halves are not the same claim — a
 * stylesheet can compile perfectly and never be linked, and a reset can be
 * absent from the bundle and present in the browser because something else
 * pulled it in.
 *
 * No account and no plan: everything here is on the signed-out page, which is
 * the point. The tracer is chrome, `layout.spec.ts` is the table's oracle, and
 * neither should ever need the other's fixture.
 */

/** The tracer's value in `theme.css`: `--tracking-tight: -0.025em`. */
const TRACKING_TIGHT_EM = -0.025;

/**
 * Waits until React has mounted the signed-out page, which `page.goto` does not.
 *
 * `goto` resolves on the document's load event, and this app renders from
 * `main.tsx` after it — so a `document.querySelector` straight afterwards races
 * the first paint. Observed 2026-08-09: `leaves form controls the platform
 * font` failed on its own guard, `the signed-out page has no input to measure`,
 * on one run of many. That throw is the guard doing exactly its job — refusing
 * rather than measuring an empty page — and the bug was here, not in it.
 *
 * The username field rather than the heading, though `app.tsx` renders both in
 * the same pass: the field is what the second test measures, and the heading
 * would still be the weaker wait if that ever stopped being true.
 */
async function openSignedOutPage(page: Page): Promise<void> {
  await expect(page.getByLabel('Username')).toBeVisible();
}

test.describe('Tailwind, in the browser', () => {
  test('applies the tracer class the brand heading carries', async ({ page }) => {
    await page.goto('/');
    const brand = page.getByRole('heading', { name: 'WBS tool v2' });
    await expect(brand).toBeVisible();

    const applied = await brand.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        letterSpacing: style.letterSpacing,
        fontSize: Number.parseFloat(style.fontSize),
        // Read back rather than assumed: a class in the markup with no rule
        // behind it is exactly the state this whole change is about, and the
        // two facts together are what say the stylesheet arrived.
        classes: node.getAttribute('class'),
      };
    });

    expect(applied.classes).toContain('tracking-tight');
    // Computed, not declared: Chromium resolves `-0.025em` against the h1's own
    // font size, so this is the rule having been found, cascaded and applied.
    // `normal` — the value with no stylesheet at all — parses to NaN and fails
    // here, which is the failure this test exists to produce.
    expect(Number.parseFloat(applied.letterSpacing)).toBeCloseTo(
      applied.fontSize * TRACKING_TIGHT_EM,
      1,
    );
  });

  // Two tests, not one with two assertions: `expect` throws on the first
  // failure, so a second assertion in the same body is never evaluated in the
  // run that proves the first can fail — and a check nobody has watched break
  // is what R5 is about.
  test('leaves the heading the margin the user agent gives it', async ({ page }) => {
    await page.goto('/');
    await openSignedOutPage(page);

    const margin = await page.evaluate(() => {
      const heading = document.querySelector('h1');
      if (heading === null) throw new Error('the signed-out page has no brand heading');
      return getComputedStyle(heading).marginBlockStart;
    });

    // Preflight zeroes every margin. The user agent stylesheet gives an `h1`
    // `0.67em`, about 21px at this size — any of it says the reset is not here.
    expect(Number.parseFloat(margin)).toBeGreaterThan(0);
  });

  test('leaves form controls the platform font, not the page’s', async ({ page }) => {
    await page.goto('/');
    await openSignedOutPage(page);

    const sizes = await page.evaluate(() => {
      const field = document.querySelector('input');
      if (field === null) throw new Error('the signed-out page has no input to measure');
      return {
        field: getComputedStyle(field).fontSize,
        body: getComputedStyle(document.body).fontSize,
      };
    });

    // Preflight's `font: inherit` on form controls is the line that moves the
    // table: it makes an input take the page's font instead of the platform's
    // own, and `table-frame.ts` sizes the `not-before` column from what
    // Chromium does with an unconstrained `input[type=date]` in that font.
    expect(sizes.field).not.toBe(sizes.body);
  });
});

/*
 * PROVING THESE TWO CAN FAIL — watched 2026-08-09 against a real chromium, one
 * fault at a time, each reverted. Quoted in
 * `docs/plans/2026-08-08-tailwind-spike-verify.md`.
 *
 * FAULT M — the stylesheet never linked.
 *   `main.tsx`: drop `import './styles.css'`.
 * Observed: `applies the tracer class the brand heading carries` failed on
 * `expected NaN to be close to -0.8`, the class still in `className` and no
 * rule behind it. That NaN is `normal` — the letter-spacing of an h1 nothing
 * styled — and it is why the assertion is on the computed value rather than on
 * the class attribute, which passes in both worlds.
 *
 * FAULT N — unscoped preflight, the fault the whole change is shaped around.
 *   `styles.css`: the two imports replaced by `@import 'tailwindcss'`.
 * Observed: 2 failed, 31 passed — `leaves the heading the margin the user agent
 * gives it` on `Expected: > 0, Received: 0`, and `leaves form controls the
 * platform font, not the page's` on `Expected: not "16px"`.
 *
 * AND ALL 22 OF `layout.spec.ts`'s TESTS PASSED IN THAT SAME RUN, which is not
 * what the change that added this file expected and is the reason these two
 * tests exist at all. The table is styled inline — the earliest-start field
 * already carries `{ boxSizing: 'border-box', font: 'inherit' }` — and an
 * inline style outranks every layer, so preflight's *overlapping* declarations
 * lose. Its inherited ones do not: `line-height: 1.5` on `html` still reaches
 * every cell that does not set one, and no test in that suite measures a row
 * height. So the honest reading is that the geometry gate did not move, not
 * that the table did not. It will stop being even that once a cell is styled by
 * a class, and nothing will announce that; these two hold the line until then.
 */
