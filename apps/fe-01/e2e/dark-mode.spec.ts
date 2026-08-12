import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * The palette, measured by a browser.
 *
 * Everything here is a fact jsdom cannot state. It computes no colours, so a
 * contrast ratio read there is a ratio between two strings; it has no
 * `prefers-color-scheme`, so `vitest.setup.ts` installs a stand-in and what
 * that stand-in proves is that this app *listens*, not what a platform
 * *answers*; and it performs no default action for a key, so the half of R5 #14
 * that says a prevented Enter does not become a click can only be seen in
 * Chromium. `lib/theme.test.ts` and `account-menu.test.tsx` hold the rest.
 *
 * The numbers below were measured on the branch this change is based on, with
 * the probe described in `openspec/changes/dark-mode/verify.md`, before any of
 * it was written: the Gantt's row labels and `Log out` at **1.10:1**, the
 * dependency picker's options at **1.05:1**, the header's page links at
 * **2.14:1**. Each of the three was a surface painted a colour the palette
 * never named.
 */

/** Signs up a throwaway account and makes a plan two estimated rows deep. */
async function seedPlan(page: Page, account: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('dark-mode-gate-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (const number of ['010', '020']) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }
  const first = page.getByLabel('Name of 010');
  await first.fill('Survey the existing warehouse racking');
  await first.blur();
  const second = page.getByLabel('Name of 020');
  await second.fill('Draft the replacement layout');
  await second.blur();
  for (const number of ['010', '020']) {
    const estimate = page.getByLabel(`Dev estimate for ${number}`);
    await estimate.fill('2/4/6');
    await estimate.blur();
    await expect(estimate).not.toHaveValue('');
  }
}

/** The one button in the header that opens the account menu. */
const accountTrigger = (page: Page): Locator => page.locator('header button[aria-haspopup="menu"]');

/** Opens the account menu and hands back the answer asked for. */
async function chooseTheme(page: Page, answer: 'System' | 'Light' | 'Dark'): Promise<void> {
  await accountTrigger(page).click();
  await page.getByRole('menuitemradio', { name: answer }).click();
  await page.keyboard.press('Escape');
}

/** Which palette the document is in, as the only thing that decides it. */
const paletteOf = (page: Page): Promise<'light' | 'dark'> =>
  page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));

/**
 * What an element's text stands off the surface behind it, as WCAG counts it.
 *
 * Composited rather than read off one node: almost nothing in this app paints
 * its own background, so `getComputedStyle(node).backgroundColor` is
 * `rgba(0, 0, 0, 0)` for the elements whose legibility is in question and a
 * ratio against transparent is a number about nothing. Every ancestor's paint
 * is stacked until an opaque one is found, which is what a reader's eye does.
 *
 * Rasterised through a canvas for `hover-cards.spec.ts`' reason: a token
 * resolves to `oklch(…)`, a `color-mix` to `oklab(…)`, and neither can be
 * turned into a luminance by reading the string. A colour this engine refuses
 * leaves `fillStyle` where it was, so the sentinel is what makes that loud
 * instead of silently measuring the last colour again.
 */
function contrastOf(locator: Locator): Promise<number> {
  return locator.evaluate((node) => {
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
      return [painted[0] ?? 0, painted[1] ?? 0, painted[2] ?? 0, (painted[3] ?? 0) / 255];
    };
    const over = (
      top: [number, number, number, number],
      under: [number, number, number],
    ): [number, number, number] => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
    ];
    const luminance = (colour: [number, number, number]): number => {
      const channel = (raw: number): number => {
        const unit = raw / 255;
        return unit <= 0.03928 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4);
      };
      return (
        0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2])
      );
    };

    const stacked: [number, number, number, number][] = [];
    let ancestor: Element | null = node;
    while (ancestor !== null) {
      const painted = rgbaOf(getComputedStyle(ancestor).backgroundColor);
      if (painted[3] > 0) stacked.push(painted);
      if (painted[3] === 1) break;
      ancestor = ancestor.parentElement;
    }
    // White, because that is what a browser paints a document nothing painted —
    // and reaching this with an empty stack means the page itself named no
    // background, which is a fault worth measuring against the canvas it lands
    // on rather than throwing over.
    let surface: [number, number, number] = [255, 255, 255];
    for (const layer of stacked.reverse()) surface = over(layer, surface);

    const ink = over(rgbaOf(getComputedStyle(node).color), surface);
    const [brighter, dimmer] = [luminance(ink), luminance(surface)].sort((a, b) => b - a);
    return ((brighter ?? 0) + 0.05) / ((dimmer ?? 0) + 0.05);
  });
}

/** What WCAG asks of body text, and what every ratio below is held to. */
const READABLE = 4.5;

/** The face a `<button>` paints itself when no author stylesheet gives it one. */
const USER_AGENT_BUTTON_FACE = 'rgb(239, 239, 239)';

let account = 0;

test.beforeEach(async ({ page }) => {
  account += 1;
  await seedPlan(page, `dark${String(Date.now()).slice(-8)}${String(account)}`);
});

test.describe('the theme control', () => {
  test('repaints the page, and the answer outlives the tab', async ({ page }) => {
    expect(await paletteOf(page)).toBe('light');

    await chooseTheme(page, 'Dark');

    expect(await paletteOf(page)).toBe('dark');
    // Not only the class: the tokens it re-points are what anything is painted
    // from, and a class nothing hangs off is the state this change found.
    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );

    await page.reload();
    await expect(accountTrigger(page)).toBeVisible();
    expect(await paletteOf(page)).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      background,
    );

    await accountTrigger(page).click();
    await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('is dark at the first paint, before the app has mounted', async ({ page }) => {
    await chooseTheme(page, 'Dark');

    // The app's own entry module, refused. Without it React never mounts, so
    // whatever is on the root element at this point was put there by the
    // bootstrap in `index.html` and by nothing else — which is the claim, and
    // it cannot be made against a page that has already rendered.
    await page.route('**/src/main.tsx', (route) => route.abort());
    await page.goto('/');

    expect(await page.locator('#root').innerHTML()).toBe('');
    expect(await paletteOf(page)).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      'dark',
    );
  });

  test('follows the machine while nothing has been chosen, and stops when something is', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await expect(accountTrigger(page)).toBeVisible();
    expect(await paletteOf(page)).toBe('dark');

    // Live, on the open page: no reload between these two.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => paletteOf(page)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => paletteOf(page)).toBe('dark');

    await chooseTheme(page, 'Light');

    // Chosen outranks the machine, which is the whole reason there are three
    // states and not a checkbox.
    expect(await paletteOf(page)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(accountTrigger(page)).toBeVisible();
    expect(await paletteOf(page)).toBe('light');
  });

  test('hands the platform its own controls in the right palette', async ({ page }) => {
    const scheme = (): Promise<string> =>
      page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(await scheme()).toBe('light');

    await chooseTheme(page, 'Dark');

    // What a scrollbar, a caret and a date picker read — none of which is a
    // token, and all of which stay light on a dark page without this.
    expect(await scheme()).toBe('dark');
  });

  test('leaves a modified Enter to whatever it was aimed at', async ({ page }) => {
    await accountTrigger(page).click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).focus();

    await page.keyboard.press('Control+Enter');

    // R5 #14's fault, in a browser: a guard that returned without
    // `preventDefault` would leave Chromium to fire the button's own click and
    // take the item anyway. jsdom performs no default action, so it can see
    // the guard deleted and never the guard left half-done.
    expect(await paletteOf(page)).toBe('light');
    await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

test.describe('what the dark palette paints', () => {
  test.beforeEach(async ({ page }) => {
    await chooseTheme(page, 'Dark');
  });

  test('the Gantt’s row labels stand off the column they are in', async ({ page }) => {
    await page.getByRole('button', { name: 'Gantt' }).click();
    await expect(page.locator('[data-gantt-panel]')).toBeVisible();

    const label = page.locator('[data-gantt-label]').first();
    await expect(label).toBeVisible();

    // 1.10:1 before this change: a `<button>` naming no background kept the
    // user agent's `ButtonFace`, and the dark palette's near-white ink was
    // written on near-white paint.
    const ratio = await contrastOf(label);
    expect(ratio, `a Gantt row label reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      READABLE,
    );
  });

  test('the way out of the app stands off the menu it is in', async ({ page }) => {
    await accountTrigger(page).click();
    const logOut = page.getByRole('menuitem', { name: 'Log out' });
    await expect(logOut).toBeVisible();

    // The same 1.10:1, and the same fault: the menu is a `bg-popover` card and
    // the item on it painted itself grey.
    const ratio = await contrastOf(logOut);
    expect(ratio, `Log out reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(READABLE);

    // The three answers above it are read on the same card.
    for (const answer of ['System', 'Light', 'Dark']) {
      const item = page.getByRole('menuitemradio', { name: answer });
      const itemRatio = await contrastOf(item);
      expect(itemRatio, `${answer} reads at ${itemRatio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        READABLE,
      );
    }
  });

  test('the header’s page links are chrome rather than the browser’s blue', async ({ page }) => {
    const link = page.getByRole('link', { name: 'Directory' });
    await expect(link).toBeVisible();

    // 2.14:1 before: `buttonVariants` names no colour for `ghost` at rest and
    // the reset gives `color: inherit` to form controls and not to anchors, so
    // these kept `-webkit-link` — `rgb(0, 0, 238)` on a near-black page.
    const ratio = await contrastOf(link);
    expect(ratio, `the Directory link reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      READABLE,
    );
    expect(await link.evaluate((node) => getComputedStyle(node).color)).not.toBe(
      'rgb(0, 0, 238)',
    );
  });

  test('the dependency picker is a card of the palette’s own colour', async ({ page }) => {
    await page.getByLabel('Add a dependency to 020').click();
    const option = page.locator('[role="option"]').first();
    await expect(option).toBeVisible();

    // 1.05:1 before: the one popover in the app that never took the palette,
    // a `#fff` card under near-white text.
    const ratio = await contrastOf(option);
    expect(ratio, `a dependency option reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      READABLE,
    );

    const list = page.locator('[role="listbox"]').first();
    expect(await list.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
      await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--popover)';
        document.body.append(probe);
        const painted = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return painted;
      }),
    );
  });

  test('nothing on the page is painted a colour the palette never names', async ({ page }) => {
    const face = async (): Promise<string[]> =>
      page.evaluate((unnamed) => {
        const found: string[] = [];
        for (const node of document.querySelectorAll('*')) {
          const box = node.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          const style = getComputedStyle(node);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          if (style.backgroundColor === unnamed) {
            found.push(`${node.tagName.toLowerCase()} «${(node.textContent ?? '').slice(0, 24)}»`);
          }
        }
        return found;
      }, USER_AGENT_BUTTON_FACE);

    expect(await face(), 'the plan').toEqual([]);

    await page.getByRole('button', { name: 'Gantt' }).click();
    await expect(page.locator('[data-gantt-panel]')).toBeVisible();
    expect(await face(), 'the Gantt chart').toEqual([]);

    await accountTrigger(page).click();
    expect(await face(), 'the account menu').toEqual([]);
  });
});
