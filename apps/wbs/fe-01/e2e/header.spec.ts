import { expect, type Locator, type Page, test } from '@playwright/test';

import { createProject } from './create-project';

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

/**
 * The retained gain after the authenticated toolbar grew a second 27px row.
 *
 * The fixed local identity exercises the complete read/write toolbar. At
 * 1280×800 that leaves a measured 637px frame: 93px more than the old 544px
 * cap while still guarding against that cap returning.
 */
const GAIN = 90;

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

/**
 * The widest username `USERNAME` permits, in the widest glyphs it permits.
 *
 * be-01's rule is `/^[a-zA-Z0-9_-]{3,32}$/`, so 32 characters is the ceiling
 * and ASCII is the alphabet — a CJK string would be wider per glyph and cannot
 * be registered. `W` is the widest of those 62 characters in the UI font, which
 * makes this the widest owner name the backend can ever produce. Prefixed
 * because every account this file registers must be unique across runs, and
 * trimmed back to 32 so the registration is not refused.
 */
const LOCAL_USERNAME = 'local-dev';

/** A project name long enough that the entry cannot fit any bound this test allows. */
const LONG_PROJECT_NAME = 'Rewire the shed and repaint the hall and paint the fence out back';

/**
 * How far the open listbox reaches, and whether the document scrolls sideways.
 *
 * `entryOverflow` is the **precondition** rather than the claim: an entry that
 * fits needs no truncation, so the bound below would hold on a short string and
 * prove nothing about a long one. `G gantt-calendar-axis`'s sixteenth fault is
 * the shape this guards against — a measurement taken against something with no
 * size at all.
 */
/** The option for the project this page selected, independent of rival writers. */
async function selectedProjectOption(page: Page): Promise<Locator> {
  const projectId = await page.evaluate(() => window.localStorage.getItem('wbs.project'));
  if (projectId === null) throw new Error('the picker has no selected project');
  const option = page.locator(`#project-option-${projectId}`);
  // Proof: measuring the first global option instead failed both long-entry
  // cases in the real four-worker suite: a rival `New project` produced
  // `entryOverflow 0` while this exact long project was present one row later.
  await expect(option).toHaveCount(1);
  return option;
}

async function measureOpenListbox(page: Page): Promise<{
  pastRightEdge: number;
  pageOverflowX: number;
  entryOverflow: number;
  nameOverflow: number;
  nameLines: number;
}> {
  const option = await selectedProjectOption(page);
  return option.evaluate((entry) => {
    const list = document.querySelector('[role="listbox"]');
    if (list === null) throw new Error('the picker is not open');
    // The clipped span, not the row: `truncate` is on the meta span, and the
    // `<li>` itself is a flex container that fits whatever its items come to.
    const clipped = [...entry.querySelectorAll('span')];
    const overflow = Math.max(...clipped.map((span) => span.scrollWidth - span.clientWidth));
    // The name span alone, apart: the name is `shrink-0` and must never be
    // the half that gives way — the meta is. A `shrink-0` span's own scroll
    // and client widths agree even when it overflows its row, so a non-zero
    // number here means the name went back to shrinking.
    const nameSpan = clipped.at(0);
    if (nameSpan === undefined) throw new Error('the entry holds no name span');
    return {
      pastRightEdge: Math.round(
        list.getBoundingClientRect().right - document.documentElement.clientWidth,
      ),
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      entryOverflow: overflow,
      nameOverflow: nameSpan.scrollWidth - nameSpan.clientWidth,
      // Lines the name is drawn on: a name wider than the list wraps rather
      // than clipping (UI review F-086), so more than one is how a long entry
      // says it had to give way.
      nameLines: Math.round(
        nameSpan.getBoundingClientRect().height /
          Number.parseFloat(getComputedStyle(nameSpan).lineHeight),
      ),
    };
  });
}

/**
 * Hovers the first offered entry and reads the hover card back.
 *
 * The card is `role="tooltip"`, the same role the Name-cell and Gantt cards
 * use, so it is scoped by that rather than by a class. The hover is the whole
 * of the trigger: the change this test protects removes the native `title`
 * and its delay, so `hover()` followed by an immediate read is the claim —
 * the card is up with no delay a test can smuggle through.
 */
async function readHoverCard(page: Page): Promise<string> {
  await (await selectedProjectOption(page)).hover();
  const card = page.locator('[role="tooltip"]').first();
  await expect(card).toBeVisible();
  return (await card.textContent()) ?? '';
}

/**
 * Registers a throwaway account and opens a project. Nothing in it yet.
 *
 * Through {@link createProject}, which leaves the rename a create arms: every
 * test in this file measures the bar with the **picker** on it, and an armed
 * rename replaces the picker with a name field.
 */
async function signInWithAProject(page: Page, _account: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page);
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
}

/**
 * Signs the current account out and registers `account` in its place, with a
 * project of its own.
 *
 * `beforeEach` has already signed one account in, and the picker tests need an
 * account whose **username** is the thing under test. Signing out rather than
 * clearing storage because that is the only supported way out of the app and
 * it is already proven above.
 */
async function switchToAccountWithAProject(
  page: Page,
  _leaving: string,
  _account: string,
): Promise<void> {
  await createProject(page);
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
}

/** Renames the selected project, through the ✎ the bar offers for it. */
async function renameSelectedProject(page: Page, to: string): Promise<void> {
  await page.getByRole('button', { name: 'Rename project' }).click();
  await page.getByLabel('Project name').fill(to);
  await page.getByLabel('Project name').press('Enter');
  await expect(page.getByRole('combobox', { name: 'Project' })).toHaveValue(to);
}

/**
 * Opens the picker from closed, whatever had the focus before.
 *
 * The list opens on the input taking the focus, so a second open in one test
 * has to give the focus up first — clicking a still-focused input fires no
 * `focus` at all, and the measurement would be taken against a list that never
 * reopened.
 */
async function openPicker(page: Page): Promise<void> {
  // Blurred directly rather than by clicking the brand: below 1024 the brand is visually
  // hidden (`AppHeader`), and a click aimed at it lands on the page links instead.
  await page.getByRole('combobox', { name: 'Project' }).evaluate((node) => {
    if (node instanceof HTMLElement) node.blur();
  });
  await page.getByRole('combobox', { name: 'Project' }).click();
  await expect(page.getByRole('listbox', { name: 'Projects' })).toBeVisible();
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

/** What WCAG asks of a control's states against each other (1.4.11, non-text contrast). */
const DISTINCT_STATES = 3;

/**
 * The colour a control's own face is painted, composited over every ancestor's
 * paint the way `dark-mode.spec.ts`' `contrastOf` stacks a surface, and rasterised
 * through a canvas because a token resolves to `oklch(…)`.
 */
function paintedFill(control: Locator): Promise<[number, number, number]> {
  return control.evaluate((node) => {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx === null) throw new Error('no 2d context to rasterise a colour in');
    const rgbaOf = (colour: string): [number, number, number, number] => {
      const sentinel = '#ff00ff';
      ctx.fillStyle = sentinel;
      ctx.fillStyle = colour;
      if (ctx.fillStyle === sentinel) throw new Error(`this engine will not parse ${colour}`);
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const painted = ctx.getImageData(0, 0, 1, 1).data;
      return [painted[0], painted[1], painted[2], painted[3] / 255];
    };
    const stacked: [number, number, number, number][] = [];
    let ancestor: Element | null = node;
    while (ancestor !== null) {
      const painted = rgbaOf(getComputedStyle(ancestor).backgroundColor);
      if (painted[3] > 0) stacked.push(painted);
      if (painted[3] === 1) break;
      ancestor = ancestor.parentElement;
    }
    let surface: [number, number, number] = [255, 255, 255];
    for (const layer of stacked.reverse()) {
      surface = [
        layer[0] * layer[3] + surface[0] * (1 - layer[3]),
        layer[1] * layer[3] + surface[1] * (1 - layer[3]),
        layer[2] * layer[3] + surface[2] * (1 - layer[3]),
      ];
    }
    return surface;
  });
}

/** The WCAG ratio between two opaque sRGB colours. */
function ratioOf(one: [number, number, number], two: [number, number, number]): number {
  const luminance = (colour: [number, number, number]): number => {
    const channel = (raw: number): number => {
      const unit = raw / 255;
      return unit <= 0.04045 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2]);
  };
  const [brighter, dimmer] = [luminance(one), luminance(two)].sort((a, b) => b - a);
  return (brighter + 0.05) / (dimmer + 0.05);
}

/**
 * The strongest contrast a control's foot — its bottom 3 px at its middle —
 * paints against the ground 2 px below it: where a tab's current-page bar is
 * drawn. Pixels through a canvas, `control-edge.ts`' method, because the bar is
 * a box shadow no computed colour reports.
 */
async function paintedFoot(page: Page, control: Locator): Promise<number> {
  const box = await control.boundingBox();
  if (box === null) throw new Error('the control has no box to measure');
  const clip = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height) - 3,
    width: 1,
    height: 6,
  };
  const shot = await page.screenshot({ clip, scale: 'css' });
  const rows = await page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('no 2d canvas in this browser');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const out: [number, number, number][] = [];
    for (let y = 0; y < image.height; y += 1)
      out.push([
        data[y * image.width * 4],
        data[y * image.width * 4 + 1],
        data[y * image.width * 4 + 2],
      ]);
    return out;
  }, shot.toString('base64'));
  const ground = rows[rows.length - 1];
  return Math.max(...rows.slice(0, 3).map((row) => ratioOf(row, ground)));
}

/** How far the pressed control's face stands off its unpressed neighbour's. */
async function fillContrast(pressed: Locator, plain: Locator): Promise<number> {
  return ratioOf(await paintedFill(pressed), await paintedFill(plain));
}

/** The account this test registered, which is what names the menu it opens. */
let signedInAs = '';

test.beforeEach(async ({ page }) => {
  signedInAs = LOCAL_USERNAME;
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

  test('grows page links to phone touch targets only below the card breakpoint', async ({
    page,
  }) => {
    const links = page.getByRole('navigation', { name: 'Pages' }).getByRole('link');
    await expect(links).toHaveCount(3);

    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await links.evaluateAll((each) => ({
      heights: each.map((link) => Math.round(link.getBoundingClientRect().height)),
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(
      phone.heights,
      'Plan, Directory and Spaces stay at their 32px dense-header height on a phone',
    ).toEqual([44, 44, 44]);
    expect(phone.pageOverflowX, 'the larger phone targets make the page scroll sideways').toBe(0);

    await page.setViewportSize({ width: 768, height: 844 });
    const dense = await links.evaluateAll((each) =>
      each.map((link) => Math.round(link.getBoundingClientRect().height)),
    );
    expect(dense, 'the page links stop being dense at the 768px card breakpoint').toEqual([
      32, 32, 32,
    ]);
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

  test('holds the five things it is one row of', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const bar = page.getByRole('banner');

    // Every one of these is found by step and name, and inside the bar: the
    // brand, the two pages, the project, who else is here, and the account. The
    // account menu has never been opened by a browser before this line — `F`
    // shipped `modal.tsx` with the same gap and said so.
    //
    // The navigation is the fifth, added by `D directory-page`: it is the first
    // control this bar has gained since the fit matrix was written, which is
    // why that matrix is re-run below with it on the bar and FAULT W was
    // watched again.
    await expect(bar.getByRole('heading', { name: 'WBS tool v2' })).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Plan' })).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Directory' })).toBeVisible();
    await expect(bar.getByRole('combobox', { name: 'Project' })).toBeVisible();
    await expect(bar.getByRole('heading', { name: 'Live', exact: true })).toBeVisible();

    await bar.getByRole('button', { name: signedInAs }).click();
    await expect(page.getByRole('menu', { name: `Signed in as ${signedInAs}` })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeFocused();

    // Logout is still a real exit in local mode; a reload can resolve the
    // fixed development identity again, but this navigation stays signed out.
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    const sso = page.getByRole('link', { name: 'Continue with SSO' });
    await expect(sso).toBeVisible();
    await expect(sso).toHaveAttribute('href', '/api/auth/login');
    for (const control of [
      sso,
      page.getByLabel('Username'),
      page.getByLabel('Password'),
      page.getByRole('button', { name: 'Sign in with password' }),
    ]) {
      expect(await control.evaluate((element) => element.getBoundingClientRect().height)).toBe(44);
    }

    await page.route('**/api/auth/login', async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        username: 'password-qa',
        password: 'correct-horse',
      });
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ token: '', user: { id: 'password-qa', username: 'password-qa' } }),
      });
    });
    await page.getByLabel('Username').fill('password-qa');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByRole('button', { name: 'Sign in with password' }).click();
    await expect(page.getByRole('button', { name: 'password-qa' })).toBeVisible();
  });
});

/**
 * The bar against the UI review of 2026-10-13: a picker you can read, a roster
 * that does not clip, two rows on a phone with finger-sized controls, and one
 * row off a project.
 */
test.describe('the header bar, read by eye and measured', () => {
  test('keeps the picker readable and the roster unclipped from 900 up (F-011)', async ({
    page,
  }) => {
    await renameSelectedProject(page, LONG_PROJECT_NAME);
    // The roster: the section that carries the roster as its fact card. Not `header section`
    // alone — the Saved plans shelf is a section too, and comes first.
    const roster = page.getByRole('banner').locator('section[data-fact]');
    await expect(roster).toHaveAttribute('data-fact', /^Live: .*local-dev \(you\)/);
    const read: string[] = [];
    for (const width of [1440, 1280, 1024, 900]) {
      await page.setViewportSize({ width, height: 800 });
      const measured = await roster.evaluate((section) => {
        const picker = document.querySelector('[role="combobox"][aria-label="Project"]');
        if (!(picker instanceof HTMLInputElement)) throw new Error('the bar has no picker');
        const list = section.querySelector('ul');
        // A laid-out list (not the `sr-only` one below 1440): every name on its one visible
        // line must end inside the list's box; a name that does not fit has dropped whole.
        const cut =
          list === null || getComputedStyle(list).position === 'absolute'
            ? []
            : [...list.querySelectorAll('li')]
                .filter((name) => {
                  const box = name.getBoundingClientRect();
                  const bound = list.getBoundingClientRect();
                  const onTheLine = box.top < bound.bottom;
                  const clipped = name.scrollWidth > name.clientWidth + 1;
                  return onTheLine && (box.right > bound.right + 0.5 || clipped);
                })
                .map((name) => name.textContent);
        return {
          pickerWidth: Math.round(picker.getBoundingClientRect().width),
          ellipsis: getComputedStyle(picker).textOverflow,
          listShown: list !== null && getComputedStyle(list).position !== 'absolute',
          cut,
        };
      });
      if (measured.pickerWidth < 144)
        read.push(`${String(width)}: picker ${String(measured.pickerWidth)}px`);
      if (measured.ellipsis !== 'ellipsis') read.push(`${String(width)}: no ellipsis`);
      if (measured.cut.length > 0) read.push(`${String(width)}: cut ${measured.cut.join(',')}`);
      if (width === 1440 && !measured.listShown) read.push('1440: no roster line to measure');
    }
    // Proof: on 2026-10-13, against the bar before this change, this failed on `1280: no
    // ellipsis`, `1024: picker 53px`, `1024: no ellipsis`, `900: picker 26px`, `900: no
    // ellipsis`. With the roster collapse back at `xl` (1280) it failed on `1280: cut
    // local-dev (you)`, the review's 74px of room for 79px of name.
    expect(read).toEqual([]);
  });

  test('is two rows on a phone, with 44px project controls (F-010, F-041)', async ({ page }) => {
    await renameSelectedProject(page, LONG_PROJECT_NAME);
    await page.setViewportSize({ width: 375, height: 812 });
    const bar = page.getByRole('banner');
    const controls = [
      bar.getByRole('combobox', { name: 'Project' }),
      bar.getByRole('button', { name: 'Rename project' }),
      bar.getByRole('button', { name: 'Create new project' }),
    ];
    const heights: number[] = [];
    for (const control of controls)
      heights.push(Math.round((await control.boundingBox())?.height ?? 0));
    // Proof: on 2026-10-13, before this change, this failed reading [32, 32, 32].
    expect(heights).toEqual([44, 44, 44]);
    const height = Math.round((await bar.boundingBox())?.height ?? 0);
    // Two 44px rows, a 4px gap and the bar's padding and border: 101px. Three rows were 137.
    expect(height, 'the phone header is more than two rows').toBeLessThanOrEqual(104);
    const ellipsis = await controls[0].evaluate((node) => getComputedStyle(node).textOverflow);
    expect(ellipsis).toBe('ellipsis');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the phone header scrolls sideways').toBe(0);
  });

  test('is one row off a project on a phone (F-047)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/directory');
    const bar = page.getByRole('banner');
    await expect(bar.getByRole('link', { name: 'Directory' })).toBeVisible();
    const height = Math.round((await bar.boundingBox())?.height ?? 0);
    // Proof: on 2026-10-13, before this change, this failed on `Expected: <= 56 · Received:
    // 101` — a second row holding only the account menu.
    expect(height, 'the Directory header kept a second row').toBeLessThanOrEqual(56);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`marks the page that is showing and underlines no page link, in ${scheme} (F-155)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const nav = page.getByRole('navigation', { name: 'Pages' });
      for (const [path, current, other] of [
        ['/', 'Plan', 'Directory'],
        ['/directory', 'Directory', 'Plan'],
        ['/spaces', 'Spaces', 'Directory'],
      ] as const) {
        await page.goto(path);
        const marked = nav.getByRole('link', { name: current, exact: true });
        await expect(marked).toHaveAttribute('aria-current', 'page');
        await page.mouse.move(2, 400);
        // Polled: the palette flip interpolates its colours (`dark-mode.spec.ts`' settle).
        // Proof: before this change, `Plan is not marked · Expected: >= 3 · Received: 1`
        // on every page in both palettes — `bg-transparent` in `buttonVariants`
        // outranked the `activeProps` accent, and the accent itself is 1.07:1 on
        // white (watched 2026-10-17).
        await expect
          .poll(() => paintedFoot(page, marked), { message: `${current} is not marked` })
          .toBeGreaterThanOrEqual(3);
        expect(
          await paintedFoot(page, nav.getByRole('link', { name: other, exact: true })),
          `${other} is marked too`,
        ).toBeLessThan(1.5);
        const underlined = await nav
          .getByRole('link')
          .evaluateAll((links) =>
            links
              .filter((link) => getComputedStyle(link).textDecorationLine !== 'none')
              .map((link) => link.textContent),
          );
        // Proof: with `no-underline` taken off the links, `page links keep the link
        // underline` failed on `Received: ["Plan", "Directory", "Spaces"]` in both
        // palettes (watched 2026-10-17).
        expect(underlined, 'page links keep the link underline').toEqual([]);
      }
    });
  }

  test('draws the account menu in one control style (F-017)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('banner').getByRole('button', { name: signedInAs }).click();
    const logOut = page.getByRole('menuitem', { name: 'Log out' });
    await expect(logOut).toBeFocused();
    const read = await logOut.evaluate((node) => {
      const style = getComputedStyle(node);
      const menu = node.closest('[role="menu"]');
      if (menu === null) throw new Error('Log out is in no menu');
      return {
        outline: style.outlineStyle,
        border: style.borderTopWidth,
        lit: style.backgroundColor !== 'rgba(0, 0, 0, 0)',
        textLeft: Math.round(
          node.getBoundingClientRect().left + Number.parseFloat(style.paddingLeft),
        ),
        menuLeft: Math.round(menu.getBoundingClientRect().left),
      };
    });
    // Proof: on 2026-10-13, before this change, this failed on `lit: false` — the focused
    // Log out had no fill, only the bordered box the capture shows. With `border-0` dropped
    // from the row it failed on `border: "2px"` (the platform's button border).
    expect({ outline: read.outline, border: read.border, lit: read.lit }).toEqual({
      outline: 'none',
      border: '0px',
      lit: true,
    });
    // The Theme answers are one segmented control: no answer wears a border of its own.
    const themeBorders = await page
      .getByRole('group', { name: 'Theme' })
      .getByRole('menuitemradio')
      .evaluateAll((items) => items.map((item) => getComputedStyle(item).borderTopWidth));
    expect(themeBorders).toEqual(['0px', '0px', '0px']);
    const signedInLeft = await page
      .getByRole('menu')
      .locator('p')
      .first()
      .evaluate((node) =>
        Math.round(
          node.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(node).paddingLeft),
        ),
      );
    expect(read.textLeft, 'Log out does not start on the menu’s text edge').toBe(signedInLeft);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`draws a pressed toggle filled and its neighbour plain, 3:1 apart, ${scheme} (F-116)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      const bar = page.getByRole('banner');
      const plan = bar.getByRole('button', { name: 'Plan', exact: true });
      const board = bar.getByRole('button', { name: 'Board', exact: true });
      await expect(plan).toHaveAttribute('aria-pressed', 'true');
      // The resting pointer's hover is not a pressed style (the review's laptop capture).
      await page.mouse.move(1, 899);
      // Proof: on 3e06eb5a4 (default `Button`, no `aria-pressed:` rule) this failed with
      // `Expected: >= 3 Received: 1` (light) and `1.175…` (dark), both buttons the filled
      // primary. With the selector `outline` and `PRESSED` dropped from `buttonVariants`, it
      // failed in both palettes on `Received: 1` (2026-10-16).
      await expect
        .poll(() => fillContrast(plan, board), { message: 'Plan pressed against Board' })
        .toBeGreaterThanOrEqual(DISTINCT_STATES);
      await board.click();
      await expect(board).toHaveAttribute('aria-pressed', 'true');
      await page.mouse.move(1, 899);
      await expect
        .poll(() => fillContrast(board, plan), { message: 'Board pressed against Plan' })
        .toBeGreaterThanOrEqual(DISTINCT_STATES);
      await plan.click();
      // The same rule is the button's, not the selector's: the toolbar's Gantt toggle draws
      // its own two states the same way.
      const gantt = page.getByRole('button', { name: 'Gantt', exact: true });
      await expect(gantt).toHaveAttribute('aria-pressed', 'false');
      const off = await paintedFill(gantt);
      await gantt.click();
      await expect(gantt).toHaveAttribute('aria-pressed', 'true');
      await page.mouse.move(1, 899);
      await expect
        .poll(async () => ratioOf(await paintedFill(gantt), off), {
          message: 'Gantt on against Gantt off',
        })
        .toBeGreaterThanOrEqual(DISTINCT_STATES);
    });
  }
});

/**
 * The open picker, measured by a browser.
 *
 * jsdom lays nothing out: every one of `project-page.test.tsx`'s assertions
 * about this list would pass with the entry a mile wide, because there is no
 * mile and no width. The bound is a browser's to observe, which is why it is
 * here rather than beside the tests that cover what the entry says.
 */
test.describe('the open project picker, measured by a browser', () => {
  test('the widest entry be-01 permits stays inside the window', async ({ page }) => {
    await switchToAccountWithAProject(page, signedInAs, LOCAL_USERNAME);
    await renameSelectedProject(page, LONG_PROJECT_NAME);

    const measured: {
      width: number;
      pastRightEdge: number;
      pageOverflowX: number;
      nameLines: number;
    }[] = [];
    for (const width of FIT_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await openPicker(page);
      const { pastRightEdge, pageOverflowX, nameLines } = await measureOpenListbox(page);
      measured.push({ width, pastRightEdge, pageOverflowX, nameLines });
    }

    for (const at of measured) {
      // The precondition, at every width: the seeded entry really is wider
      // than the room it is given — it wraps (UI review F-086) — so the two
      // assertions under it are about a list that had to be bounded rather
      // than one that happened to fit.
      // Proof: with the entry back on one line (`whitespace-nowrap`), this
      // failed on `the entry fits on one line at 1280px`, `Received: 1`.
      // Watched 2026-10-16.
      expect(
        at.nameLines,
        `the entry fits on one line at ${String(at.width)}px, so the bound below proves nothing`,
      ).toBeGreaterThan(1);
      expect(
        at.pastRightEdge,
        `the listbox reaches ${String(at.pastRightEdge)}px past the window at ${String(at.width)}px`,
      ).toBeLessThanOrEqual(0);
      expect(
        at.pageOverflowX,
        `the document scrolls sideways at ${String(at.width)}px with the picker open`,
      ).toBe(0);
    }
  });

  test('a long entry wraps whole and its full text is still readable', async ({ page }) => {
    const owner = LOCAL_USERNAME;
    await switchToAccountWithAProject(page, signedInAs, owner);
    await renameSelectedProject(page, LONG_PROJECT_NAME);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPicker(page);

    const { nameLines, nameOverflow } = await measureOpenListbox(page);

    expect(nameLines, 'the entry fits on one line, so nothing had to give way').toBeGreaterThan(1);
    // The half that clipped is the meta, never the name: a long owner used to
    // squeeze every name to `New pr…` and the picker offered choices nobody
    // could tell apart (Dany, 2026-08-10).
    // Proof: `min-w-0 truncate` put back on the name span, this failed on
    // `Expected: 0, Received: 277` while the entry still clipped. Watched in
    // Chromium, 2026-08-10.
    expect(nameOverflow, 'the name is the half that clipped; it must show whole').toBe(0);
    // The whole name and the whole meta, which is what makes a truncated
    // meta survivable: the owner is how two projects of one name are told apart, so
    // a card carrying the name alone would lose exactly the part that was cut.
    const card = await readHoverCard(page);
    expect(card).toContain(LONG_PROJECT_NAME);
    expect(card).toContain(owner);
  });

  test('the portalled card follows its option when the listbox scrolls', async ({ page }) => {
    await switchToAccountWithAProject(page, signedInAs, LOCAL_USERNAME);
    // Ten more, so the list is longer than the box it drops from and really
    // scrolls. `createProject` is the wait: it returns with the picker back on
    // the bar, which is one create fully landed — the `waitForResponse` this
    // loop used to pair with the click said less, since the arming lands a
    // reload later than the POST it was watching.
    for (let index = 0; index < 10; index += 1) {
      await createProject(page);
    }
    await openPicker(page);
    const list = page.getByRole('listbox', { name: 'Projects' });
    const option = list.getByRole('option').nth(5);
    await option.hover();
    const card = page.getByRole('tooltip').first();
    await expect(card).toBeVisible();
    const before = await option.boundingBox();
    if (before === null) throw new Error('the sixth option has no browser rectangle');

    await list.evaluate((node) => {
      node.scrollTop += 12;
    });

    await expect
      .poll(async () => {
        const [optionBox, cardBox] = await Promise.all([option.boundingBox(), card.boundingBox()]);
        if (optionBox === null || cardBox === null) return null;
        return {
          optionMoved: Math.round(before.y - optionBox.y),
          // The card stands **on** the option's row rather than under it since
          // `project-picker-flow`: it opens beside the list, so following the
          // option means sharing its top edge. Where it opens sideways is
          // `e2e/project-picker.spec.ts`'s claim; this one is that it is still
          // remeasured while the list scrolls under it.
          cardOffset: Math.round(cardBox.y - optionBox.y),
        };
      })
      .toEqual({ optionMoved: 12, cardOffset: 0 });
  });

  test('two imports of one long name read apart at every width', async ({ page }) => {
    // A real import name (UI review F-086): the dated suffix is at the end,
    // where a picker that cuts its names cuts first, and the two imports
    // differ only there.
    const first = 'Twilight Shipyards roadmap 2026 (imported 15 Oct)';
    const second = 'Twilight Shipyards roadmap 2026 (imported 15 Oct, 2)';
    await renameSelectedProject(page, first);
    const firstId = await page.evaluate(() => window.localStorage.getItem('wbs.project'));
    await createProject(page);
    await renameSelectedProject(page, second);
    const secondId = await page.evaluate(() => window.localStorage.getItem('wbs.project'));
    if (firstId === null || secondId === null) throw new Error('the imports have no ids');

    const measured: {
      width: number;
      cutBy: number[];
      lines: number[];
      listWidth: number;
      pastRightEdge: number;
      pageOverflowX: number;
      fact: string | null;
    }[] = [];
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      await openPicker(page);
      const reading = await page.evaluate(
        (ids) => {
          const list = document.querySelector('[role="listbox"]');
          if (list === null) throw new Error('the picker is not open');
          const inner = list.getBoundingClientRect().right - list.clientLeft;
          return {
            // How far each name runs past the list's inner edge or past its
            // own box: either is a name the reader does not see whole.
            cutBy: ids.map((id) => {
              const name = document.querySelector(`#project-option-${id} span`);
              if (name === null) throw new Error(`no name for ${id}`);
              return Math.max(
                Math.round(name.getBoundingClientRect().right - inner),
                name.scrollWidth - name.clientWidth,
              );
            }),
            // Lines each name is drawn on: wrapping is the answer, but a list
            // narrower than the room beside it makes every name a paragraph.
            lines: ids.map((id) => {
              const name = document.querySelector(`#project-option-${id} span`);
              if (name === null) throw new Error(`no name for ${id}`);
              return Math.round(
                name.getBoundingClientRect().height /
                  Number.parseFloat(getComputedStyle(name).lineHeight),
              );
            }),
            listWidth: Math.round(list.getBoundingClientRect().width),
            pastRightEdge: Math.round(
              list.getBoundingClientRect().right - document.documentElement.clientWidth,
            ),
            pageOverflowX:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        },
        [firstId, secondId],
      );
      const box = page.getByRole('combobox', { name: 'Project' });
      await box.evaluate((node) => {
        if (node instanceof HTMLElement) node.blur();
      });
      measured.push({ width, ...reading, fact: await box.getAttribute('data-fact') });
    }

    // Proof: on the old list (`w-full`, `whitespace-nowrap`, the name
    // `shrink-0`) this failed at every width — `cutBy` `[46, 61]` at 1440,
    // `[135, 150]` at 1024 and `[158, 173]` at 375: the names ran past the
    // list's edge, the dates with them. Watched 2026-10-16.
    expect(measured.map(({ width, cutBy }) => ({ width, cutBy }))).toEqual(
      measured.map(({ width }) => ({ width, cutBy: [0, 0] })),
    );
    // From `md` up the list is at least the picker's widest (18rem = 288px)
    // whatever room the header's neighbours leave the input: the Plan / Board
    // selector's outline (#528) took 3px from the input at 1024, and a list at
    // the input's width put `(imported 15 Oct, 2)` on a third line.
    // Proof: with the list at the input's width (`w-full`, no `md:min-w-72`),
    // the integrated tree failed on `a name takes more than two lines at
    // 1024px: [3,3]`, and this check on `the list is narrower than 18rem at
    // 1024px`, `Received: 196`. Watched 2026-10-16.
    const laptop = measured.find(({ width }) => width === 1024);
    if (laptop === undefined) throw new Error('no reading at 1024');
    expect(laptop.listWidth, 'the list is narrower than 18rem at 1024px').toBeGreaterThanOrEqual(
      288,
    );
    // On a phone the list takes the window's width rather than the input's
    // (UI review F-130): the input starts at the margin there, so the bound
    // is known, and a name is one or two lines instead of four.
    // Proof: with the list at the input's width, this failed on `a name takes
    // more than two lines at 375px: [3,3]` — `Twilight Shipyards / roadmap
    // 2026 / (imported 15 Oct, 2)`. Watched 2026-10-16.
    for (const at of measured) {
      expect(
        Math.max(...at.lines),
        `a name takes more than two lines at ${String(at.width)}px: ${JSON.stringify(at.lines)}`,
      ).toBeLessThanOrEqual(2);
    }
    for (const at of measured) {
      expect(
        at.pastRightEdge,
        `the list passes the window at ${String(at.width)}px`,
      ).toBeLessThanOrEqual(0);
      expect(at.pageOverflowX, `the page scrolls sideways at ${String(at.width)}px`).toBe(0);
      // The closed box still cuts with an ellipsis; its fact card is the
      // app's own `title` (native ones are swept by `hints.spec.ts`).
      // Proof: `data-fact` dropped from the box failed on `the closed box does
      // not carry its name at 1440px`, `Received: null`. Watched 2026-10-16.
      expect(at.fact, `the closed box does not carry its name at ${String(at.width)}px`).toBe(
        second,
      );
    }
  });

  test('every entry’s date is still on screen at 1024 (F-107)', async ({ page }) => {
    // The date is what tells `Review fixture` from its twin; the owner is the
    // part that gives way when the list is narrow.
    await switchToAccountWithAProject(page, signedInAs, LOCAL_USERNAME);
    await renameSelectedProject(page, 'Review fixture');
    await page.setViewportSize({ width: 1024, height: 768 });
    await openPicker(page);

    const metas = await page
      .getByRole('listbox', { name: 'Projects' })
      .getByRole('option')
      .evaluateAll((options) =>
        options.map((option) => {
          const meta = option.lastElementChild;
          const text = meta?.firstChild;
          if (meta === null || text === null || text === undefined) {
            throw new Error(`option ${option.textContent} has no meta text`);
          }
          const words = text.textContent ?? '';
          const date = /\d{1,2} [A-Z][a-z]{2}( '\d\d)?/.exec(words);
          if (date === null) throw new Error(`no date in the meta ${words}`);
          const range = document.createRange();
          range.setStart(text, date.index);
          range.setEnd(text, date.index + date[0].length);
          const name = option.firstElementChild;
          if (name === null) throw new Error(`option ${option.textContent} has no name`);
          return {
            meta: words,
            // Names from other tests in this run may be as wide as the list
            // itself; that is F-086's listbox width, not this meta's order.
            nameShare: name.getBoundingClientRect().width / option.getBoundingClientRect().width,
            datePastEdge: Math.round(
              range.getBoundingClientRect().right - meta.getBoundingClientRect().right,
            ),
          };
        }),
      );
    const measured = metas.filter((each) => each.nameShare < 0.5);
    expect(measured.length, 'no option with a short name to measure').toBeGreaterThan(0);
    // Proof: on main, whose meta was `(local-dev · 16 Oct)`, this failed on
    // `the date in (local-dev · 16 Oct) is cut off`, the date's right
    // edge 33px past the meta's clipped edge; watched 2026-10-16.
    for (const { meta, datePastEdge } of measured) {
      expect(datePastEdge, `the date in ${meta} is cut off`).toBeLessThanOrEqual(0);
    }
  });

  test('a short entry is shown whole', async ({ page }) => {
    // The other side of the claim. Without it, "clipped" would be satisfied by
    // a picker that clips everything — including the two-word names most
    // projects have — and nobody would be told.
    await switchToAccountWithAProject(page, signedInAs, LOCAL_USERNAME);
    await renameSelectedProject(page, 'Shed');
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPicker(page);

    const { entryOverflow } = await measureOpenListbox(page);

    expect(entryOverflow, 'a four-letter project owned by a short name was clipped').toBe(0);
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
 *   (`P` a steps dialog, `G` a view switch, `M` a menu).
 * Three rather than one because the bar has about 460px of slack at its
 * narrowest — the picker and the roster give way first, by design — and one
 * more control is a thing it absorbs rather than a regression. `past: 50` at
 * 900 is the run that was watched.
 * Re-run by `D directory-page`, which put the two-page navigation on this bar:
 * with the nav in place the same three controls give `past: 38` at **1024**,
 * so the matrix can still fail with one more real control on it.
 * `keeps the header to one row at every laptop width` is what fails, and it
 * fails on `past` rather than on `rowsDeep`: a `flex-nowrap` bar with too much
 * in it runs off its own right edge instead of wrapping. That is why the check
 * reads both — with only `rowsDeep`, `flex-wrap` **and** a brand at `text-2xl`
 * left it green, watched.
 */
