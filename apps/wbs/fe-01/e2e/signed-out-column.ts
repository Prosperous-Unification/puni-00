import { expect, type Page } from '@playwright/test';

/**
 * Asserts the signed-out page's one column (`[data-sign-in]`, F-052) is centred
 * across the window and anchored by its top near the window's middle (F-090):
 * no sideways scroll, the middle within 1 px of the window's, at least 16 px
 * above it, nothing below the window, and its top on the one anchor every card
 * shares — 15.5rem above the window's middle, never under 1rem (F-125, D11).
 *
 * Only the sign-in card is also held within 48 px of true vertical centre: the
 * anchor is measured from it, and the shorter cards under the same anchor
 * stand higher on purpose so the word mark never moves.
 *
 * Shared by the sign-in page and the cards drawn in its column (F-093), read
 * off `main[data-signed-out]`.
 */
export async function expectAnchoredColumn(page: Page): Promise<void> {
  const measured = await page.evaluate(() => {
    const column = document.querySelector('[data-sign-in]');
    if (column === null) throw new Error('the signed-out page has no [data-sign-in]');
    const box = column.getBoundingClientRect();
    return {
      card: column.closest('main')?.getAttribute('data-signed-out') ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      column: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
    };
  });
  expect(measured.scrollWidth, 'the page scrolls sideways').toBe(measured.viewport.width);
  const middle = (measured.column.left + measured.column.right) / 2;
  expect(
    Math.abs(middle - measured.viewport.width / 2),
    'the column is off the window’s middle',
  ).toBeLessThanOrEqual(1);
  const above = measured.column.top;
  const below = measured.viewport.height - measured.column.bottom;
  expect(above, 'room above the column').toBeGreaterThanOrEqual(16);
  expect(below, 'room below the column').toBeGreaterThanOrEqual(0);
  expect(
    Math.abs(above - Math.max(16, measured.viewport.height / 2 - 248)),
    'the column is off the signed-out anchor',
  ).toBeLessThanOrEqual(1);
  if (measured.card === null) throw new Error('the signed-out column names no card');
  if (measured.card !== 'sign-in') return;
  expect(
    Math.abs(above - below),
    'the column is off the window’s vertical centre',
  ).toBeLessThanOrEqual(48);
}
