import { expect, type Page } from '@playwright/test';

/**
 * Asserts the signed-out page's one column (`[data-sign-in]`, F-052) is centred
 * across the window and anchored by its top near the window's middle (F-090):
 * no sideways scroll, the middle within 1 px of the window's, at least 16 px
 * above it, nothing below the window, and within 48 px of true vertical centre.
 *
 * Shared by the sign-in page and the server-unavailable page (F-093), which
 * draw the same column around different cards.
 */
export async function expectAnchoredColumn(page: Page): Promise<void> {
  const measured = await page.evaluate(() => {
    const column = document.querySelector('[data-sign-in]');
    if (column === null) throw new Error('the signed-out page has no [data-sign-in]');
    const box = column.getBoundingClientRect();
    return {
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
    Math.abs(above - below),
    'the column is off the window’s vertical centre',
  ).toBeLessThanOrEqual(48);
}
