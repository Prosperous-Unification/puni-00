import { strict as assert } from 'node:assert';

import { chromium } from '@playwright/test';

import batch from './fixtures/batch-1.json';

const browser = await chromium.launch();
const observations = [];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const methods: string[] = [];
    page.on('request', (request) => methods.push(request.method()));
    await page.goto('http://127.0.0.1:4317/');
    await page.waitForFunction(() => 'timeline' in window && window.timeline.ready);
    const shortest = [...batch].sort(
      (a, b) => Date.parse(a.end) - Date.parse(a.start) - (Date.parse(b.end) - Date.parse(b.start)),
    )[0];
    await page.locator(`.hit[data-id="${shortest.id}"]`).focus();
    await page.keyboard.press('Enter');
    await page.click('#fit-selected');
    let maxPaintDrift = 0;
    let maxWidthError = 0;
    for (const span of [604800000, 86400000, 21600000, 3600000, 900000, 300000]) {
      const paint = page.locator(`.paint[data-id="${shortest.id}"]`);
      const before = await paint.boundingBox();
      assert.ok(before);
      await page.selectOption('#span', String(span));
      const after = await paint.boundingBox();
      assert.ok(after);
      const width = await page.evaluate(() => window.timeline.viewport.width);
      maxPaintDrift = Math.max(maxPaintDrift, Math.abs(before.x - after.x));
      maxWidthError = Math.max(maxWidthError, Math.abs(after.width - (112000 / span) * width));
      assert.ok(maxPaintDrift <= 1);
      assert.ok(maxWidthError <= 1);
    }
    const details = await page.locator('#details').textContent();
    assert.ok(details);
    assert.ok(details.includes(new Date(shortest.start).toISOString()));
    assert.ok(details.includes(new Date(shortest.end).toISOString()));
    const geometry = await page.locator('.paint').evaluateAll((paints) =>
      paints.map((paint) => {
        const box = paint.getBoundingClientRect();
        return { x: box.x, width: box.width };
      }),
    );
    for (const zone of ['UTC', 'Europe/Kyiv', 'Pacific/Auckland']) {
      await page.selectOption('#zone', zone);
      assert.deepEqual(
        await page.locator('.paint').evaluateAll((paints) =>
          paints.map((paint) => {
            const box = paint.getBoundingClientRect();
            return { x: box.x, width: box.width };
          }),
        ),
        geometry,
      );
    }
    await page.selectOption('#zone', 'UTC');
    await page.selectOption('#fixture', 'ambiguity');
    await page.click('#fit-all');
    const beforeMidnight = await page.evaluate(() =>
      new Date(window.timeline.viewport.start).toISOString(),
    );
    await page.click('#pan-right');
    const afterMidnight = await page.evaluate(() =>
      new Date(window.timeline.viewport.start).toISOString(),
    );
    assert.ok(beforeMidnight.startsWith('2026-09-19'));
    assert.ok(afterMidnight.startsWith('2026-09-20'));
    await page.locator('.hit[data-id="synthetic-touch"]').focus();
    await page.keyboard.press('Enter');
    assert.ok((await page.locator('#details').textContent())?.includes('synthetic-touch'));
    assert.ok(methods.every((method) => method === 'GET'));
    observations.push({
      viewport,
      maxPaintDriftCssPx: maxPaintDrift,
      maxPaintWidthErrorCssPx: maxWidthError,
      timezonePaintChangeCssPx: 0,
      midnightPanUTC: [beforeMidnight, afterMidnight],
      intendedTouchAttemptSelected: true,
      appRequestMethods: [...new Set(methods)],
    });
    await page.close();
  }
  const refusals = [];
  for (const [name, fixture] of [
    ['duplicate', [batch[0], batch[0]]],
    ['reversed', [{ ...batch[0], end: '2026-09-19T21:22:26Z' }]],
    ['invalid', [{ ...batch[0], start: '2026-02-30T00:00:00Z' }]],
  ] as const) {
    const page = await browser.newPage();
    await page.route('**/fixtures/batch-1.json', (route) => route.fulfill({ json: fixture }));
    const refusal = page.waitForEvent('pageerror');
    await page.goto('http://127.0.0.1:4317/');
    const error = await refusal;
    assert.ok(error.message.includes(name));
    assert.equal(await page.locator('.paint').count(), 0);
    refusals.push({ name, error: error.message, paintedAttempts: 0 });
    await page.close();
  }
  await Bun.write(
    `${import.meta.dir}/evidence/browser-audit.json`,
    JSON.stringify({ observations, refusals, passed: true }, null, 2) + '\n',
  );
  console.log(JSON.stringify({ observations, refusals, passed: true }));
} finally {
  await browser.close();
}
