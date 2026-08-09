import { expect, type Page, test } from '@playwright/test';

/**
 * The header bar, and the height it hands the table.
 *
 * `layout.spec.ts` measures the table's columns; this file measures everything
 * above and around them. The two are separate because they fail for different
 * reasons and a run that mixes them says less: a wrapped header is a chrome
 * fault, a drifting pinned column is a geometry one.
 *
 * The numbers here are the change's whole claim, and they were measured on the
 * branch this one is based on before anything was written — `F
 * shadcn-foundation` at 1280×800 gave the frame **544px**, the `calc(100vh -
 * 16rem)` its own comment called approximate, and left the document scrolling
 * vertically at 996px in an 800px window. Both are quoted in
 * `openspec/changes/header-fits-a-row/verify.md`.
 */

/**
 * The frame's height on the branch this change is based on, in px at 1280×800.
 *
 * Measured, not derived — though it is also exactly `800 - 16rem`, which is
 * what says the old cap was doing the deciding rather than the layout.
 */
const FRAME_BEFORE = 544;

/** What the plan asked for: the table gains at least this much. */
const GAIN = 120;

/**
 * Enough rows that the table is taller than any frame this test could produce.
 *
 * Without it the frame's height is its content's and the measurement says
 * nothing: a two-row plan is about 340px tall in a frame that could be 690.
 * At 28px a row and 14px of heading — both measured — twenty-three rows plus
 * the frame's own 13rem of picker room is comfortably past it. The test asserts
 * that rather than trusting it.
 *
 * It was fifteen at 38px a row, and the restyle that made a row 28 is what
 * moved it: with fifteen the plan came to **exactly** the frame's height —
 * `scrollHeight 669, clientHeight 669` — and the precondition failed while the
 * claim under it was still true, the frame having gained its 125px all the
 * same. That is the guard doing its job rather than a regression, and it is why
 * the number is a measurement with the measurement written next to it.
 */
const ROWS_PAST_THE_FOLD = 23;

/** The widths the bar has to be one row at. `layout.spec.ts`'s matrix, plus 900. */
const FIT_WIDTHS = [1280, 1024, 900] as const;

/** Registers a throwaway account and opens a project. Nothing in it yet. */
async function signInWithAProject(page: Page, account: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('header-gate-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
}

/** Adds rows until the plan is taller than the window it is being read in. */
async function fillPastTheFold(page: Page): Promise<void> {
  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (let row = 1; row <= ROWS_PAST_THE_FOLD; row += 1) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${String(row * 10).padStart(3, '0')}`)).toBeVisible();
  }
}

interface FrameHeight {
  /** The scrollport: what is on screen, padding included. */
  clientHeight: number;
  /** What is in it. Bigger than the above, or the measurement proves nothing. */
  scrollHeight: number;
  /** How far the frame's bottom edge is from the bottom of the window, in px. */
  belowFrame: number;
  /** The page's own vertical overflow. Zero is the point of the whole change. */
  pageOverflow: number;
}

function measureFrame(page: Page): Promise<FrameHeight> {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-table-frame]');
    if (frame === null) throw new Error('the scrolling frame is not on the page');
    const box = frame.getBoundingClientRect();
    return {
      clientHeight: frame.clientHeight,
      scrollHeight: frame.scrollHeight,
      belowFrame: Math.round(document.documentElement.clientHeight - box.bottom),
      pageOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
}

/**
 * How many rows deep the header's controls are laid out, how far past its own
 * width they reach, and how tall the bar is.
 *
 * Three numbers because "one row" has two failure modes and they look nothing
 * alike. A bar that is allowed to **wrap** becomes two lines: the ratio of its
 * content height to its tallest child is 1 for one row and 2 for two, whatever
 * the children are — distinct tops would not do, since the controls are
 * vertically centred and are not all the same height. A bar that is **not**
 * allowed to wrap does not become two lines; it runs out past its own right
 * edge instead, and `scrollWidth` is what says so. A check that read only the
 * first would be a check that cannot fail for this bar, which is `flex-nowrap`:
 * watched, with `flex-wrap` and a doubled brand both in place and the assertion
 * still green.
 *
 * The height is the third because a bar that grew one enormous control is still
 * one row, and still not what this change asked for.
 */
function headerFit(page: Page): Promise<{ rowsDeep: number; past: number; height: number }> {
  return page.evaluate(() => {
    const bar = document.querySelector('header');
    if (bar === null) throw new Error('the page has no header bar');
    const style = getComputedStyle(bar);
    // `clientHeight` excludes the border and includes the padding, so the
    // padding is what has to come off to leave the flex container's own height.
    const content =
      bar.clientHeight -
      Number.parseFloat(style.paddingTop) -
      Number.parseFloat(style.paddingBottom);
    const tallest = Math.max(
      ...[...bar.children].map((child) => child.getBoundingClientRect().height),
    );
    if (tallest === 0) throw new Error('the header bar has nothing in it to measure');
    return {
      rowsDeep: Math.round(content / tallest),
      past: bar.scrollWidth - bar.clientWidth,
      height: Math.round(bar.getBoundingClientRect().height),
    };
  });
}

let account = 0;
/** The account this test registered, which is what names the menu it opens. */
let signedInAs = '';

test.beforeEach(async ({ page }) => {
  account += 1;
  signedInAs = `header-${String(Date.now())}-${String(account)}`;
  await signInWithAProject(page, signedInAs);
});

test.describe('the header bar, measured by a browser', () => {
  test('gives the table the height the chrome stopped taking', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await fillPastTheFold(page);
    const measured = await measureFrame(page);

    // Or this is a measurement of a frame the plan does not fill, and any
    // height at all would satisfy the assertion below.
    expect(
      measured.scrollHeight,
      'the seeded plan is shorter than the frame, so its height was decided by its content',
    ).toBeGreaterThan(measured.clientHeight);
    expect(
      measured.clientHeight,
      `the frame is ${String(measured.clientHeight)}px where the branch this is based on gave ${String(FRAME_BEFORE)}px`,
    ).toBeGreaterThanOrEqual(FRAME_BEFORE + GAIN);
  });

  test('ends the frame at the bottom of the window, and stops the page scrolling', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await fillPastTheFold(page);
    const measured = await measureFrame(page);

    // The remainder is real: what is under the frame is the page's own bottom
    // padding and nothing else. `calc(100vh - 16rem)` left 112px of nothing
    // here, which is the same fault read from the other end.
    expect(
      measured.belowFrame,
      'the frame stops short of the bottom of the window',
    ).toBeLessThanOrEqual(16);
    // And the page itself does not scroll, which is what "the frame is the
    // thing that scrolls" means. The old layout scrolled 196px here.
    expect(measured.pageOverflow, 'the page scrolls vertically behind the frame').toBe(0);
  });

  test('keeps the header to one row at every laptop width', async ({ page }) => {
    const laidOut: { width: number; rowsDeep: number; past: number }[] = [];
    for (const width of FIT_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      const { rowsDeep, past, height } = await headerFit(page);
      laidOut.push({ width, rowsDeep, past: Math.max(past, 0) });
      // The other half: one row of something enormous is not what was asked
      // for either. A bar of `h-8` controls with 4px of padding and a border is
      // 41px, measured.
      expect(
        height,
        `the bar is ${String(height)}px tall at ${String(width)}px`,
      ).toBeLessThanOrEqual(56);
    }

    // One row, and inside its own width at every one of them. `past` is the
    // half that can see a `flex-nowrap` bar with too much in it — the mode this
    // bar fails in — and `rowsDeep` the half that sees the wrap somebody would
    // add to fix it.
    expect(laidOut).toEqual(FIT_WIDTHS.map((width) => ({ width, rowsDeep: 1, past: 0 })));
  });

  test('keeps the page from scrolling at all at 125% zoom', async ({ page }) => {
    // The 1024 proxy: Chromium's root `zoom` scales the layout the way the
    // browser's own control does, so a 1280×800 window becomes 1024×640 CSS
    // px — narrow enough that the toolbar wraps, which is the state the header
    // must survive without wrapping itself.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addStyleTag({ content: 'html { zoom: 1.25; }' });
    await fillPastTheFold(page);

    const toolbarRows = await page.evaluate(() => {
      const toolbar = document.querySelector('[data-toolbar]');
      if (toolbar === null) throw new Error('the table has no toolbar');
      return new Set(
        [...toolbar.children].map((child) => Math.round(child.getBoundingClientRect().top)),
      ).size;
    });
    // The toolbar wraps here and is meant to — `F` and `T` both kept that, and
    // it is what makes this a test about a narrow window rather than about
    // 1280 with bigger type.
    expect(toolbarRows, 'the toolbar fits one row at 1024, so this proves nothing').toBeGreaterThan(
      1,
    );

    const measured = await measureFrame(page);
    expect(measured.pageOverflow, 'the page scrolls vertically at 125% zoom').toBe(0);
    const zoomed = await headerFit(page);
    expect(zoomed.rowsDeep, 'the header wrapped at 125% zoom').toBe(1);
    expect(zoomed.past, 'the header ran past its own width at 125% zoom').toBeLessThanOrEqual(0);
  });

  test('holds the four things it is one row of', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const bar = page.getByRole('banner');

    // Every one of these is found by role and name, and inside the bar: the
    // brand, the project, who else is here, and the account. The account menu
    // has never been opened by a browser before this line — `F` shipped
    // `modal.tsx` with the same gap and said so.
    await expect(bar.getByRole('heading', { name: 'WBS tool v2' })).toBeVisible();
    await expect(bar.getByRole('combobox', { name: 'Project' })).toBeVisible();
    await expect(bar.getByRole('heading', { name: /^Online \(/ })).toBeVisible();

    await bar.getByRole('button', { name: signedInAs }).click();
    await expect(page.getByRole('menu', { name: `Signed in as ${signedInAs}` })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeFocused();

    // And it really signs out: the way out of the app is the one thing in this
    // bar that nothing else can do.
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  });
});

/*
 * PROVING THESE CAN FAIL — watched against a real chromium, one fault at a
 * time, each reverted. Quoted in
 * `openspec/changes/header-fits-a-row/verify.md`.
 *
 * FAULT F — the frame goes back to guessing.
 *   `table-frame.ts`: `flex: '1 1 0%'` replaced by `maxHeight: 'calc(100vh -
 *   16rem)'`, which is what this change removed.
 * The first two tests are the ones that see it, and they are the change's
 * claim: 544px against 664 wanted, and a frame ending 112px above the bottom
 * of the window with the page scrolling behind it.
 *
 * FAULT W — three more controls in the bar.
 *   `app-header.tsx`: three `shrink-0` buttons of about 200px each added beside
 *   the brand, which is what the next three changes to this bar look like
 *   (`P` a phases dialog, `G` a view switch, `M` a menu).
 * Three rather than one because the bar has about 460px of slack at its
 * narrowest — the picker and the roster give way first, by design — and one
 * more control is a thing it absorbs rather than a regression. `past: 50` at
 * 900 is the run that was watched.
 * `keeps the header to one row at every laptop width` is what fails, and it
 * fails on `past` rather than on `rowsDeep`: a `flex-nowrap` bar with too much
 * in it runs off its own right edge instead of wrapping. That is why the check
 * reads both — with only `rowsDeep`, `flex-wrap` **and** a brand at `text-2xl`
 * left it green, watched.
 */
