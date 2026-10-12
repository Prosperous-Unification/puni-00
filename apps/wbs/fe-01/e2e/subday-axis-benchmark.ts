import { writeFile } from 'node:fs/promises';

import { chromium, expect } from '@playwright/test';

import type {} from '../src/testing/subday-axis-benchmark';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const browserErrors: string[] = [];
page.on('pageerror', (error) => {
  browserErrors.push(error.message);
});
try {
  await page.goto('http://127.0.0.1:4337/benchmarks/subday-axis.html');
  const first = page.locator('[data-gantt-bar="mark-0-0"]');
  await expect(first).toHaveAttribute('data-tick', 'true');
  const bounds = await first.boundingBox();
  if (bounds === null) throw new Error('Two-minute fixture mark has no browser rectangle');
  const fillWidth = await first.evaluate((mark) => {
    // The browser reports an SVG rect here; its fill geometry excludes the 1px outline.
    const rect = mark as SVGRectElement;
    return rect.getBBox().width * 896;
  });
  expect(fillWidth).toBeCloseTo(4, 1);
  const hit = page.locator('[data-gantt-hit="mark-0-0"]');
  const hitBounds = await hit.boundingBox();
  if (hitBounds === null) throw new Error('Two-minute fixture has no pointer rectangle');
  expect(hitBounds.width).toBeGreaterThanOrEqual(17.99);
  expect(hitBounds.height).toBeGreaterThanOrEqual(17.99);
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-gantt-hit'),
      { x: hitBounds.x + 2, y: hitBounds.y + hitBounds.height / 2 },
    ),
  ).toBe('mark-0-0');
  await page.mouse.move(hitBounds.x + 2, hitBounds.y + hitBounds.height / 2);
  await expect(page.getByRole('tooltip')).toContainText('2 min');
  const second = await page.locator('[data-gantt-hit="mark-0-1"]').boundingBox();
  if (second === null) throw new Error('Second fixture pointer rectangle is absent');
  await page.mouse.move(
    second.x + 2,
    Math.max(hitBounds.y, second.y) +
      (Math.min(hitBounds.y + hitBounds.height, second.y + second.height) -
        Math.max(hitBounds.y, second.y)) /
        2,
  );
  await expect(page.getByRole('button', { name: 'row-0 · Step 0 · 2 min' })).toBeVisible();
  await page.getByRole('button', { name: 'row-0 · Step 1 · 2 min' }).click();
  await expect(page.getByRole('tooltip')).toContainText('Step 1 · Unassigned');
  await page.screenshot({ path: '/tmp/subday2-browser.png' });
  await page.evaluate(() => window.subdayBenchmark.mountPanel(500));
  const mounts: number[] = [];
  const interactions: number[] = [];
  for (let repetition = 0; repetition < 5; repetition += 1) {
    mounts.push(await page.evaluate(() => window.subdayBenchmark.mountPanel(500)));
    await page.locator('[data-gantt-day-scale]').selectOption('28');
    interactions.push(
      await page.evaluate(async () => {
        const control = document.querySelector<HTMLSelectElement>('[data-gantt-day-scale]');
        if (control === null) throw new Error('Measurement panel has no rung control');
        const started = performance.now();
        control.value = '896';
        control.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
        return performance.now() - started;
      }),
    );
    await expect(page.locator('[data-gantt-day-scale]')).toHaveValue('896');
    await expect(page.locator('[data-gantt-bar]')).toHaveCount(2500);
  }
  await page.evaluate(() => window.subdayBenchmark.mountPanel(2000));
  await expect(page.locator('[data-gantt-day-scale]')).toHaveValue('28');
  const disabled = page.locator('[data-gantt-day-scale] option[data-not-offered]');
  await expect(disabled).toHaveCount(3);
  await expect(disabled.first()).toContainText('not offered at 10000 marks');
  expect(browserErrors).toEqual([]);
  const evidence = {
    date: new Date().toISOString(),
    browser: browser.version(),
    viewport: { width: 1440, height: 900 },
    fixture: '500 visible leaves × 5 forecast steps; no attempts',
    entry:
      'benchmarks/subday-axis.html → src/testing/subday-axis-benchmark.tsx → shipped GanttPanel',
    mode: 'Vite development; warm caches; one warmup then five fresh mounts; two-frame completion',
    mountMs: mounts,
    interactionMs: interactions,
    mountP95: Math.max(...mounts),
    interactionP95: Math.max(...interactions),
    oversized: '2000×5 production refusal at Days verified; renderer-only cost not measured',
    tinyMark: {
      fillWidth,
      outlinedWidth: bounds.width,
      hitWidth: hitBounds.width,
      hitHeight: hitBounds.height,
      explicitCollisionChoice: true,
    },
    browserErrors,
  };
  await writeFile('/tmp/subday2-measurements.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
