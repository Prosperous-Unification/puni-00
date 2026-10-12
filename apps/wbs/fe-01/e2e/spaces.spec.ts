import { expect, type Page, test } from '@playwright/test';

import { LONG_NAME, stubSpacesApi } from './spaces-stub';

/**
 * The spaces pages, drawn by a browser, for a member who may arrange them.
 *
 * The API is answered at the browser's boundary (`spaces-stub.ts` says why).
 * jsdom proves the classes (`spaces-page.test.tsx`, `space-page.test.tsx`);
 * this proves what they paint: no bevelled platform control, nothing sideways
 * at a phone's width, and every control reachable by Tab.
 */

/** Opens `/spaces` with one space's rename form open, so its field and Save are drawn too. */
async function openSpaces(page: Page): Promise<void> {
  await page.goto('/spaces');
  await page.getByRole('button', { name: 'Rename Launch' }).click();
  await expect(page.getByLabel('New name for Launch')).toBeVisible();
}

/**
 * Opens the space `s` once its rows, roll-ups and add picker have drawn, and
 * moves the long-named project up, so the outcome sentence quoting its name
 * is drawn too.
 */
async function openSpace(page: Page): Promise<void> {
  await page.goto('/spaces/s');
  await expect(page.getByRole('img', { name: /^Website relaunch: / })).toBeVisible();
  await expect(page.getByLabel('Add a project')).toBeVisible();
  await page.getByRole('button', { name: `Move ${LONG_NAME} up` }).click();
  await expect(page.getByText(`Moved ${LONG_NAME} up.`)).toBeVisible();
}

/** Every control `main` offers, each named for a failure message. */
async function controlsOf(page: Page) {
  return page.locator('main').evaluate((main) =>
    [...main.querySelectorAll('button, input, select')].map((control) => {
      const style = getComputedStyle(control);
      return {
        name: control.getAttribute('aria-label') ?? (control.id || control.textContent),
        radius: style.borderTopLeftRadius,
        height: control.getBoundingClientRect().height,
      };
    }),
  );
}

const pages = [
  { path: '/spaces', open: openSpaces },
  { path: '/spaces/s', open: openSpace },
] as const;

for (const width of [1280, 375]) {
  test.describe(`spaces pages at ${String(width)}px`, () => {
    test.use({ viewport: { width, height: width === 375 ? 812 : 900 } });

    for (const { path, open } of pages) {
      test(`${path} draws every control with the chrome, nothing sideways`, async ({
        page,
      }, testInfo) => {
        await stubSpacesApi(page);
        await open(page);

        const controls = await controlsOf(page);
        expect(controls.length).toBeGreaterThan(5);
        // The platform's own button is drawn with a 0px or 2px corner; every
        // chrome control here is `rounded-md`, 6px.
        // Proof: 2026-10-12, with `spaces-page.tsx`'s Rename and Delete restored
        // to bare `<button>`s this listed both buttons of each space not being
        // renamed at `radius: "0px"` (`/spaces` failed at both widths).
        expect(controls.filter((control) => control.radius !== '6px')).toEqual([]);
        // A fingertip below `sm`, the chrome's own 36px above it.
        // Proof: 2026-10-12, dropping `className={CONTROL_HEIGHT}` from the
        // Rename button failed this on `/spaces` at 375px, listing the Rename
        // buttons of the two spaces not being renamed at `height: 36`.
        const height = width === 375 ? 44 : 36;
        expect(controls.filter((control) => Math.round(control.height) !== height)).toEqual([]);

        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(sideways).toBe(0);
        // `main` is the scroller, so a row wider than the phone widens it and
        // not the document. The Projects table is the one region allowed to
        // scroll sideways, inside its own card.
        // Proof: 2026-10-12, dropping `[overflow-wrap:anywhere]` from
        // `LINK_CLASS` failed this on `/spaces` at 375px: received 164; and
        // from `STATUS_CLASS`, on `/spaces/s` at 375px (the `Moved … up.`
        // sentence): received 102.
        const mainSideways = await page
          .locator('main')
          .evaluate((main) => main.scrollWidth - main.clientWidth);
        expect(mainSideways).toBe(0);

        await page.screenshot({
          path: testInfo.outputPath(`spaces-${path.replaceAll('/', '-')}-${String(width)}.png`),
          fullPage: true,
        });
      });

      test(`${path} reaches every control by Tab`, async ({ page }) => {
        await stubSpacesApi(page);
        await open(page);

        const expected = await page
          .locator('main')
          .evaluate(
            (main) =>
              main.querySelectorAll(
                'a[href], button:not([disabled]), input, select:not([disabled])',
              ).length,
          );
        const reached = new Set<string>();
        for (let press = 0; press < 80 && reached.size < expected; press += 1) {
          await page.keyboard.press('Tab');
          const focused = await page.evaluate(() => {
            const active = document.activeElement;
            if (active?.closest('main') == null) return null;
            const name =
              active.getAttribute('aria-label') ??
              (active.id || `${active.getAttribute('href') ?? ''}${active.textContent}`);
            return `${active.tagName}:${name}`;
          });
          if (focused !== null) reached.add(focused);
        }
        // Proof: 2026-10-12, `tabIndex={-1}` on the space page's Remove buttons
        // failed this on `/spaces/s` at both widths: expected 16, received 12.
        expect(reached.size).toBe(expected);
      });
    }
  });
}
