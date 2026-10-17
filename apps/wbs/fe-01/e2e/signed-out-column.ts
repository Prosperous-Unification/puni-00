import { expect, type Page } from '@playwright/test';

/**
 * Asserts the signed-out page's one column (`[data-sign-in]`, F-052) is centred
 * in the window on its own, whichever card it holds (Dany, 2026-10-18,
 * reversing D11 / F-125's one anchor): no sideways scroll, the middle within
 * 1 px of the window's across, at least 16 px above it, and the room above and
 * below within 48 px of each other.
 *
 * A window too short for the column plus two 16 px gutters cannot centre it:
 * there the column starts at least 16 px down and the page scrolls to its end,
 * nothing clipped. The sign-in card is centred with its refusal row's room
 * already counted (F-090): at rest the room above it is 18px more than below
(202 / 184 at 1440 × 900, measured 2026-10-18).
 *
 * Shared by the sign-in page and the cards drawn in its column (F-093), read
 * off `main[data-signed-out]`.
 */
export async function expectCentredColumn(page: Page): Promise<void> {
  const measured = await page.evaluate(() => {
    const column = document.querySelector('[data-sign-in]');
    if (column === null) throw new Error('the signed-out page has no [data-sign-in]');
    const box = column.getBoundingClientRect();
    return {
      card: column.closest('main')?.getAttribute('data-signed-out') ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        y: window.scrollY,
      },
      column: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
    };
  });
  if (measured.card === null) throw new Error('the signed-out column names no card');
  const card = measured.card;
  expect(measured.scroll.width, `${card}: the page scrolls sideways`).toBe(measured.viewport.width);
  const middle = (measured.column.left + measured.column.right) / 2;
  expect(
    Math.abs(middle - measured.viewport.width / 2),
    `${card}: the column is off the window’s middle`,
  ).toBeLessThanOrEqual(1);
  // Page coordinates, so a scrolled short window measures the same column.
  const top = measured.column.top + measured.scroll.y;
  const bottom = measured.column.bottom + measured.scroll.y;
  expect(top, `${card}: room above the column`).toBeGreaterThanOrEqual(16);
  expect(measured.scroll.height - bottom, `${card}: the column is clipped`).toBeGreaterThanOrEqual(
    0,
  );
  if (bottom - top + 32 > measured.viewport.height) return;
  const below = measured.viewport.height - bottom;
  expect(
    Math.abs(top - below),
    `${card}: the column is off the window’s vertical centre`,
  ).toBeLessThanOrEqual(48);
}
