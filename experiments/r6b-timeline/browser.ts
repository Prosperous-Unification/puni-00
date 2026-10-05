import { strict as assert } from 'node:assert';
import { cpus, totalmem } from 'node:os';

import { chromium, type Locator } from '@playwright/test';

interface Attempt {
  id: string;
  packet: string;
  slice: string;
  start: number;
  end: number | null;
}
interface Sample {
  mount: number;
  zoom: number;
  pan: number;
  actualSpanMs: number;
  dom: number;
  paintedAttempts: number;
  visibleRows: number;
  visibleAttempts: number;
  longTasks: { start: number; duration: number }[];
}
declare global {
  interface Window {
    timeline: {
      ready: boolean;
      mountedMs: number;
      longTasks: { start: number; duration: number }[];
      viewport: { start: number; span: number; width: number };
      attempts: Attempt[];
      selected: string | null;
      zoom(span: number): void;
      pan(fraction: number): void;
      selectAttempt(id: string): void;
      fitAll(): void;
      fitSelected(): void;
      geometry(): { id: string; x: number; width: number | null }[];
    };
  }
}

const evidence = `${import.meta.dir}/evidence`;
const browser = await chromium.launch({ headless: true });
const checks: string[] = [];
const browserVersion = browser.version();
async function readText(locator: Locator) {
  const text = await locator.textContent();
  assert.notEqual(text, null, 'required prototype element text');
  return String(text);
}
const assertions = async (viewport: { width: number; height: number }) => {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4317/');
  await page.waitForFunction(() => 'timeline' in window && window.timeline.ready);
  const fixture = await page.evaluate(() => window.timeline.attempts);
  assert.equal(fixture.length, 31);
  assert.equal(await page.locator('.hit').count(), 31);
  const fittedControls = await page.evaluate(() => ({
    span: window.timeline.viewport.span,
    displayedSpan: Number((document.getElementById('span') as HTMLSelectElement).value),
    slider: Number((document.getElementById('zoom') as HTMLInputElement).value),
  }));
  assert.equal(
    fittedControls.displayedSpan,
    fittedControls.span,
    'fit-all discrete display is stale',
  );
  assert.ok(
    Math.abs(
      fittedControls.slider -
        (Math.log(fittedControls.span / 300000) / Math.log(604800000 / 300000)) * 1000,
    ) <= 0.5,
    'fit-all continuous display is stale',
  );
  const shortest = [...fixture].sort((a, b) => {
    assert.notEqual(a.end, null);
    assert.notEqual(b.end, null);
    return Number(a.end) - a.start - (Number(b.end) - b.start);
  })[0];
  assert.ok(shortest);
  for (const variant of ['discrete', 'continuous']) {
    await page.selectOption('#variant', variant);
    await page.evaluate((id) => {
      window.timeline.selectAttempt(id);
    }, shortest.id);
    await page.click('#fit-selected');
    for (const span of [604800000, 86400000, 21600000, 3600000, 900000, 300000]) {
      const before = await page.evaluate((id) => {
        const placed = window.timeline.geometry().find((attempt) => attempt.id === id);
        if (!placed) throw new Error('selected geometry missing');
        return placed.x;
      }, shortest.id);
      if (variant === 'discrete') await page.selectOption('#span', String(span));
      else
        await page.locator('#zoom').evaluate((slider: HTMLInputElement, span) => {
          slider.value = String(
            Math.round((Math.log(span / 300000) / Math.log(604800000 / 300000)) * 1000),
          );
          slider.dispatchEvent(new Event('input', { bubbles: true }));
        }, span);
      const after = await page.evaluate(
        (id) => window.timeline.geometry().find((attempt) => attempt.id === id),
        shortest.id,
      );
      const width = await page.evaluate(() => window.timeline.viewport.width);
      assert.ok(after);
      assert.notEqual(after.width, null);
      assert.ok(Math.abs(before - after.x) <= 1, 'zoom anchor drift');
      const actualSpan = await page.evaluate(() => window.timeline.viewport.span);
      assert.ok(
        Math.abs(Number(after.width) - (112000 / actualSpan) * width) <= 1,
        'actual painted duration',
      );
      const hit = page.locator(`.hit[data-id="${shortest.id}"]`);
      await hit.focus();
      await page.keyboard.press('Enter');
      assert.ok((await readText(page.locator('#details'))).includes(shortest.id));
      const ticks = await page.locator('.tick').evaluateAll((ticks) =>
        ticks.map((tick) => {
          const bounds = tick.getBoundingClientRect();
          return { left: bounds.left, right: bounds.right };
        }),
      );
      for (let index = 1; index < ticks.length; index++)
        assert.ok(ticks[index].left >= ticks[index - 1].right + 7, 'overlapping ruler labels');
    }
    assert.ok((await readText(page.locator('#details'))).includes('"elapsedSeconds": 112'));
  }
  const geometry = await page.evaluate(() => window.timeline.geometry());
  for (const zone of ['UTC', 'Europe/Kyiv', 'Pacific/Auckland']) {
    await page.selectOption('#zone', zone);
    assert.deepEqual(
      await page.evaluate(() => window.timeline.geometry()),
      geometry,
      'timezone changed geometry',
    );
    assert.ok((await readText(page.locator('#details'))).includes('startUTC'));
  }
  await page.click('#fit-all');
  await page.locator('.track').first().focus();
  const before = await page.evaluate(() => window.timeline.viewport.start);
  await page.keyboard.press('ArrowRight');
  assert.ok(await page.evaluate((before) => window.timeline.viewport.start > before, before));
  await page.selectOption('#fixture', 'ambiguity');
  await page.click('#fit-all');
  const track = page.locator('.track').first();
  const bounds = await track.boundingBox();
  assert.ok(bounds);
  const x = await page.evaluate(() => window.timeline.geometry()[0].x);
  await page.mouse.click(bounds.x + Math.max(1, x + 5), bounds.y + 16);
  assert.equal(await page.locator('#ambiguity button').count(), 2);
  await page.getByRole('button', { name: 'synthetic-overlap-b', exact: true }).click();
  assert.ok((await readText(page.locator('#details'))).includes('synthetic-overlap-b'));
  for (const id of ['synthetic-zero', 'synthetic-missing']) {
    await page.locator(`.hit[data-id="${id}"]`).focus();
    await page.keyboard.press('Enter');
    const details = await readText(page.locator('#details'));
    assert.ok(details.includes(id));
    assert.ok(details.includes(id === 'synthetic-zero' ? '"elapsedSeconds": 0' : '"endUTC": null'));
  }
  assert.ok((await readText(page.locator('#date-fact'))).includes('day precision'));
  await page.screenshot({ path: `${evidence}/ambiguity-${String(viewport.width)}.png` });
  await page.selectOption('#fixture', 'batch');
  await page.click('#fit-all');
  await page.screenshot({ path: `${evidence}/batch-${String(viewport.width)}.png` });
  assert.deepEqual(errors, []);
  checks.push(
    `${String(viewport.width)}x${String(viewport.height)}: identity, geometry, anchor, all-scale keyboard, zones, ruler, pan, ambiguity, zero/open/day precision`,
  );
  await page.close();
};

try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ])
    await assertions(viewport);
  await Bun.write(
    `${evidence}/browser-checks.json`,
    JSON.stringify({ browser: browserVersion, checks, passed: true }, null, 2) + '\n',
  );
  console.log(JSON.stringify({ browser: browserVersion, checks, passed: true }));
  if (process.argv.includes('--measure')) {
    const measurements = [];
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      for (const variant of ['discrete', 'continuous'])
        for (const rows of [50, 500, 2000])
          for (const attempts of [1, 5]) {
            const page = await browser.newPage({ viewport });
            const url = `http://127.0.0.1:4317/?fixture=load&rows=${String(rows)}&attempts=${String(attempts)}&variant=${variant}`;
            await page.goto(url);
            await page.waitForFunction(() => 'timeline' in window && window.timeline.ready);
            await page.evaluate(async () => {
              // Static index.html defines these controls; browser acceptance above independently exercises them.
              if ((document.getElementById('variant') as HTMLSelectElement).value === 'discrete') {
                const control = document.getElementById('span') as HTMLSelectElement;
                control.value = '900000';
                control.dispatchEvent(new Event('change', { bubbles: true }));
              } else {
                const control = document.getElementById('zoom') as HTMLInputElement;
                control.value = String(
                  Math.round((Math.log(3) / Math.log(604800000 / 300000)) * 1000),
                );
                control.dispatchEvent(new Event('input', { bubbles: true }));
              }
              const pan = document.getElementById('pan-right');
              if (!pan) throw new Error('pan control missing');
              pan.click();
              await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              );
            });
            const repetitions: Sample[] = [];
            for (let repetition = 0; repetition < 5; repetition++) {
              await page.reload();
              await page.waitForFunction(() => 'timeline' in window && window.timeline.ready);
              const sample = await page.evaluate(async () => {
                const afterPaint = () =>
                  new Promise<void>((resolve) =>
                    requestAnimationFrame(() =>
                      requestAnimationFrame(() => {
                        resolve();
                      }),
                    ),
                  );
                await afterPaint();
                const mount = window.timeline.mountedMs;
                const before = performance.now();
                // Static index.html control types, already exercised by browser acceptance.
                if (
                  (document.getElementById('variant') as HTMLSelectElement).value === 'discrete'
                ) {
                  const control = document.getElementById('span') as HTMLSelectElement;
                  control.value = '900000';
                  control.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  const control = document.getElementById('zoom') as HTMLInputElement;
                  control.value = String(
                    Math.round((Math.log(3) / Math.log(604800000 / 300000)) * 1000),
                  );
                  control.dispatchEvent(new Event('input', { bubbles: true }));
                }
                await afterPaint();
                const zoom = performance.now() - before;
                const panning = performance.now();
                const panControl = document.getElementById('pan-right');
                if (!panControl) throw new Error('pan control missing');
                panControl.click();
                await afterPaint();
                const pan = performance.now() - panning;
                const timelineElement = document.getElementById('timeline');
                if (!timelineElement) throw new Error('timeline missing');
                const timeline = timelineElement.getBoundingClientRect();
                const visible = (selector: string) =>
                  [...document.querySelectorAll(selector)].filter((element) => {
                    const bounds = element.getBoundingClientRect();
                    return (
                      bounds.bottom > timeline.top + 53 &&
                      bounds.top < timeline.bottom &&
                      bounds.right > timeline.left + 130 &&
                      bounds.left < timeline.right
                    );
                  }).length;
                return {
                  mount,
                  zoom,
                  pan,
                  actualSpanMs: window.timeline.viewport.span,
                  dom: document.querySelectorAll('*').length,
                  paintedAttempts: document.querySelectorAll('.paint').length,
                  visibleRows: visible('.lane'),
                  visibleAttempts: visible('.paint'),
                  longTasks: window.timeline.longTasks.filter((task) => task.duration > 50),
                };
              });
              repetitions.push(sample);
            }
            const summarize = (key: 'mount' | 'zoom' | 'pan') => {
              const values = repetitions.map((sample) => sample[key]).sort((a, b) => a - b);
              return { median: values[2], p95: values[4] };
            };
            const summary = {
              coldMount: summarize('mount'),
              zoom: summarize('zoom'),
              pan: summarize('pan'),
            };
            measurements.push({
              viewport,
              variant,
              rows,
              attemptsPerRow: attempts,
              repetitions,
              summary,
            });
            console.log(
              `${String(viewport.width)} ${variant} ${String(rows)}x${String(attempts)}: ${JSON.stringify(summary)}`,
            );
            await page.close();
          }
    }
    await Bun.write(
      `${evidence}/measurements.json`,
      JSON.stringify(
        {
          recordedUTC: new Date().toISOString(),
          browser: browserVersion,
          browserMode: 'headless Chromium; not human task time',
          hardware: { cpu: cpus()[0].model, logicalCPUs: cpus().length, memoryBytes: totalmem() },
          protocol:
            'one warmup, five fresh-DOM reload mounts (warm HTTP/browser cache), actual discrete select change or continuous slider input plus pan button click, two-animation-frame completion; p95 nearest rank, n=5',
          provisionalP95TargetMs: 100,
          measurements,
        },
        null,
        2,
      ) + '\n',
    );
  }
} finally {
  await browser.close();
}
