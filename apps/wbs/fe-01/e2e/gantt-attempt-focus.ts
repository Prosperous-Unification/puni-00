import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (error) => {
  errors.push(error.message);
});
try {
  await page.goto('http://127.0.0.1:4347/benchmarks/attempt-marks.html');
  for (const outcome of ['failed', 'cancelled', 'succeeded', 'running']) {
    const paint = page.locator(`[data-attempt="${outcome}"] [data-attempt-paint]`);
    const width = await paint.evaluate(
      (element) => (element as SVGRectElement).getBBox().width * 896,
    );
    expect(width).toBeCloseTo(4, 1);
    const fill = await paint.getAttribute('fill');
    if (outcome === 'failed' || outcome === 'cancelled') {
      if (fill === null) throw new Error('Attempt paint has no fill');
      const id = fill.slice(5, -1);
      const pattern = page.locator(`[id="${id}"]`);
      if (outcome === 'failed')
        await expect(pattern.locator('path')).toHaveAttribute('stroke', '#991b1b');
      else await expect(pattern.locator('ellipse')).toHaveAttribute('fill', '#92400e');
    } else await expect(paint).toHaveAttribute('fill', '#166534');
  }
  const hit = page.locator('[data-attempt="running"] [data-attempt-hit]');
  await hit.focus();
  await expect(page.getByRole('tooltip')).toContainText('Reference: run/4');
  await page.keyboard.press('Tab');
  await expect(hit).not.toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  const failed = page.locator('[data-attempt="failed"] [data-attempt-hit]');
  const forecast = page.locator('[data-gantt-hit="slice-0"]');
  await failed.focus();
  const attemptBounds = await failed.boundingBox();
  const forecastBounds = await forecast.boundingBox();
  if (attemptBounds === null || forecastBounds === null)
    throw new Error('Collision fixture has no hit bounds');
  await page.mouse.move(
    attemptBounds.x + attemptBounds.width / 2,
    (Math.max(attemptBounds.y, forecastBounds.y) +
      Math.min(attemptBounds.y + attemptBounds.height, forecastBounds.y + forecastBounds.height)) /
      2,
  );
  const chooser = page.getByRole('tooltip', { name: 'Choose a mark' });
  const choice = chooser.getByRole('button', { name: /Attempt 1 — failed/ });
  await expect(choice).toBeVisible();
  await choice.focus();
  await expect(choice).toBeFocused();
  await choice.click();
  await expect(page.getByRole('tooltip')).toContainText('Reference: run/1');
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      browser: browser.version(),
      tinyOutcomePaint: true,
      focusTabAway: true,
      chooserFocusTransfer: true,
      errors,
    }),
  );
} finally {
  await browser.close();
}
