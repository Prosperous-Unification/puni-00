import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { arch, cpus, platform, totalmem } from 'node:os';

import { chromium, expect } from '@playwright/test';

import type {} from '../src/testing/subday-axis-benchmark';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const browserErrors: string[] = [];
page.on('pageerror', (error) => browserErrors.push(error.message));
try {
  await page.goto('http://127.0.0.1:4337/benchmarks/subday-axis.html');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const artifact = await page.evaluate(() => window.subdayBenchmark.artifact);
  // Proof: stale SHA, development mode and false PROD injections each reject the artifact before timing (see verify.md).
  if (artifact.sha !== sha || artifact.mode !== 'production' || !artifact.production) {
    throw new Error(
      `Benchmark artifact provenance mismatch: ${JSON.stringify(artifact)}; runner ${sha}`,
    );
  }
  const measurements = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const fixture of [
      { leaves: 500, renderer: false, attempts: false, count: 2500, entry: 'production panel' },
      { leaves: 2000, renderer: true, attempts: false, count: 10000, entry: 'renderer-only' },
      {
        leaves: 400,
        renderer: false,
        attempts: true,
        count: 2400,
        entry: 'production panel with 400 attempts',
      },
    ]) {
      await page.evaluate(
        ({ leaves, renderer, attempts }) =>
          window.subdayBenchmark.mountPanel(leaves, false, renderer, attempts),
        fixture,
      );
      console.error(
        `Measuring ${String(viewport.width)}px ${fixture.entry} ${String(fixture.count)} marks`,
      );
      const mounts: number[] = [];
      const rungs: number[] = [];
      const pans: number[] = [];
      for (let repetition = 0; repetition < 5; repetition += 1) {
        mounts.push(
          await page.evaluate(
            ({ leaves, renderer, attempts }) =>
              window.subdayBenchmark.mountPanel(leaves, false, renderer, attempts),
            fixture,
          ),
        );
        // Proof: dropping one fixture mark fails this census; observed in verify.md.
        await expect(page.locator('[data-gantt-bar], [data-attempt-paint]')).toHaveCount(
          fixture.count,
        );
        // Proof: forcing Days in the shared renderer fails this assertion; observed in verify.md.
        await expect(page.locator('[data-gantt-day-scale]')).toHaveValue('896');
        await expect(page.locator('[data-axis-day="0"]')).toHaveCSS('width', '896px');
        await page.locator('[data-gantt-day-scale]').selectOption('224');
        rungs.push(
          await page.evaluate(async () => {
            const control = document.querySelector<HTMLSelectElement>('[data-gantt-day-scale]');
            if (control === null) throw new Error('Measurement panel has no rung control');
            const started = performance.now();
            control.value = '896';
            control.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  resolve();
                }),
              ),
            );
            return performance.now() - started;
          }),
        );
        await expect(page.locator('[data-gantt-day-scale]')).toHaveValue('896');
        pans.push(
          await page.evaluate(async () => {
            const panel = document.querySelector<HTMLElement>('[data-gantt-panel]');
            if (panel === null) throw new Error('Measurement has no scroll panel');
            const before = panel.scrollLeft;
            const started = performance.now();
            panel.scrollLeft = before + 700;
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  resolve();
                }),
              ),
            );
            if (panel.scrollLeft <= before)
              throw new Error('Horizontal pan did not move the panel');
            return performance.now() - started;
          }),
        );
      }
      const counts = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('[data-gantt-panel]');
        if (panel === null) throw new Error('No panel for DOM census');
        const viewport = panel.getBoundingClientRect();
        const marks = [
          ...panel.querySelectorAll<SVGGraphicsElement>('[data-gantt-bar], [data-attempt-paint]'),
        ];
        return {
          elements: document.querySelectorAll('*').length,
          marks: marks.length,
          visibleMarks: marks.filter((mark) => {
            const box = mark.getBoundingClientRect();
            return (
              box.right > viewport.left &&
              box.left < viewport.right &&
              box.bottom > viewport.top &&
              box.top < viewport.bottom
            );
          }).length,
          paintedMarks: marks.filter((mark) => {
            const box = mark.getBBox();
            return (
              box.width > 0 && box.height > 0 && getComputedStyle(mark).visibility === 'visible'
            );
          }).length,
        };
      });
      measurements.push({
        viewport,
        ...fixture,
        mountMs: mounts,
        rungMs: rungs,
        panMs: pans,
        mountP95: Math.max(...mounts),
        rungP95: Math.max(...rungs),
        panP95: Math.max(...pans),
        counts,
      });
    }
    await page.evaluate(() => window.subdayBenchmark.mountPanel(2000));
    await expect(page.locator('[data-gantt-day-scale]')).toHaveValue('28');
    const disabled = page.locator('[data-gantt-day-scale] option[data-not-offered]');
    await expect(disabled).toHaveCount(3);
    await expect(disabled.first()).toContainText('not offered at 10000 marks');
    await expect(page.locator('[data-gantt-day-scale]')).toHaveAttribute(
      'title',
      '10000 marks; moved to Days',
    );
  }
  expect(browserErrors).toEqual([]);
  const evidence = {
    date: new Date().toISOString(),
    sha,
    artifact,
    hardware: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
    },
    browser: browser.version(),
    mode: 'Vite production benchmark artifact; one warmup then five fresh mounts per fixture/viewport; two animation frames after each operation; nearest-rank p95 (max of five)',
    entry:
      'vite.benchmark.config.ts → benchmarks/subday-axis.html → subday-axis-benchmark.tsx → GanttPanel/GanttRenderer',
    counts:
      'marks = DOM rectangles; visibleMarks = rectangles intersecting panel viewport after pan; paintedMarks = visible-style SVG rectangles with nonzero local geometry, including offscreen rectangles; no virtualization',
    measurements,
    oversizedProductionRefusal:
      'Verified separately on desktop and phone: Days, three disabled sub-day options, 10000-mark notice',
    browserErrors,
  };
  await writeFile(
    '/tmp/subday-production-measurements.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
