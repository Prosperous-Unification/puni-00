import { expect, type Page, test } from '@playwright/test';

import { painted, seedRenderingPlan } from './rendering-fixture';

interface ProbeCounters {
  recordHeightCalls: number;
  recordHeightMs: number;
  placeRowsCalls: number;
  placeRowsMs: number;
  reactCommits: number;
  reactCommitMs: number;
  anchorWrites: number;
  scrollLinkWrites: number;
}

interface FrameSample {
  at: number;
  table: string;
  gantt: string;
  tableCut: number;
  ganttCut: number;
}

const EMPTY_PROBE: ProbeCounters = {
  recordHeightCalls: 0,
  recordHeightMs: 0,
  placeRowsCalls: 0,
  placeRowsMs: 0,
  reactCommits: 0,
  reactCommitMs: 0,
  anchorWrites: 0,
  scrollLinkWrites: 0,
};

async function resetProbe(page: Page): Promise<void> {
  await page.evaluate((empty) => {
    (window as typeof window & { __wbsScrollProbe?: ProbeCounters }).__wbsScrollProbe =
      structuredClone(empty);
  }, EMPTY_PROBE);
}

async function sampleFrame(page: Page): Promise<FrameSample> {
  return page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('[data-table-frame]');
    const panel = document.querySelector<HTMLElement>('[data-gantt-panel]');
    const heading = frame?.querySelector<HTMLElement>('thead th');
    const axis = panel?.querySelector<HTMLElement>('[data-gantt-axis]');
    if (frame === null || panel === null || heading === null || axis === null)
      throw new Error('scroll probe cannot see both plan faces');
    const first = (port: HTMLElement, selector: string, boundary: number) => {
      const row = [...port.querySelectorAll<HTMLElement>(selector)].find(
        (candidate) => candidate.getBoundingClientRect().bottom > boundary + 1,
      );
      if (row === undefined) throw new Error(`scroll probe found no ${selector}`);
      const box = row.getBoundingClientRect();
      return { row, cut: (boundary - box.top) / box.height };
    };
    const table = first(frame, 'tr[data-row-id]', heading.getBoundingClientRect().bottom);
    const gantt = first(panel, '[data-gantt-label]', axis.getBoundingClientRect().bottom);
    return {
      at: performance.now(),
      table: table.row.dataset['rowId'] ?? '',
      gantt: gantt.row.dataset['ganttLabel'] ?? '',
      tableCut: table.cut,
      ganttCut: gantt.cut,
    };
  });
}

async function scrollTrace(page: Page, direction: 1 | -1): Promise<FrameSample[]> {
  const box = await page.locator('[data-table-frame]').boundingBox();
  if (box === null) throw new Error('scroll probe table has no geometry');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const samples: FrameSample[] = [];
  const deadline = Date.now() + 1_200;
  while (Date.now() < deadline) {
    await page.mouse.wheel(0, direction * 96);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    samples.push(await sampleFrame(page));
  }
  return samples;
}

test.use({ viewport: { width: 1280, height: 800 }, video: 'on' });

test.describe('large-plan scroll stability', () => {
  test.skip(process.env['WBS_SCROLL_PROBE'] !== '1', 'opt-in five-trace attribution probe');

  for (const rows of [50, 500, 2_000]) {
    test(`${String(rows)} rows stay monotonic and paired`, async ({ page }, testInfo) => {
      const seeded = await seedRenderingPlan(page, {
        rows,
        steps: 2,
        density: 'sparse',
        wrappedEvery: 5,
      });
      await page.goto('/');
      await page.getByRole('button', { name: 'Gantt', exact: true }).click();
      await expect(page.locator('[data-gantt-label]')).toHaveCount(rows);
      const wrapped = page.locator(`[data-name-input="${seeded.ids[4]}"]`);
      const oneLine = page.locator(`[data-name-input="${seeded.ids[3]}"]`);
      await expect(wrapped).toBeVisible();
      const [wrappedBox, oneLineBox] = await Promise.all([
        wrapped.boundingBox(),
        oneLine.boundingBox(),
      ]);
      if (wrappedBox === null || oneLineBox === null)
        throw new Error('seeded rows have no geometry');
      expect(wrappedBox.height, 'every fifth name wraps to two lines').toBeGreaterThan(
        oneLineBox.height * 1.5,
      );

      const session = await page.context().newCDPSession(page);
      await session.send('Performance.enable');
      const traces = [];
      for (let repeat = 0; repeat < 5; repeat += 1) {
        await page.locator('[data-table-frame]').evaluate((node) => {
          node.scrollTop = 0;
        });
        await painted(page);
        await resetProbe(page);
        const before = await session.send('Performance.getMetrics');
        const down = await scrollTrace(page, 1);
        const up = await scrollTrace(page, -1);
        const after = await session.send('Performance.getMetrics');
        const counters = await page.evaluate(() => {
          const active = (window as typeof window & { __wbsScrollProbe?: ProbeCounters })
            .__wbsScrollProbe;
          if (active === undefined) throw new Error('scroll probe instrumentation is absent');
          return active;
        });
        const metrics = (names: string[]) =>
          Object.fromEntries(
            names.map((name) => {
              const start = before.metrics.find((metric) => metric.name === name)?.value ?? 0;
              const end = after.metrics.find((metric) => metric.name === name)?.value ?? 0;
              return [name, (end - start) * 1_000];
            }),
          );
        traces.push({
          repeat,
          down,
          up,
          counters,
          metrics: metrics([
            'TaskDuration',
            'ScriptDuration',
            'LayoutDuration',
            'RecalcStyleDuration',
          ]),
        });
      }
      await session.detach();
      await testInfo.attach(`scroll-${String(rows)}.json`, {
        body: JSON.stringify({ rows, traces }, null, 2),
        contentType: 'application/json',
      });

      const indexes = new Map(seeded.ids.map((id, index) => [id, index]));
      const violations = traces.flatMap((trace) => [
        ...trace.down
          .slice(1)
          .filter(
            (sample, index) =>
              (indexes.get(sample.table) ?? -1) < (indexes.get(trace.down[index].table) ?? -1),
          ),
        ...trace.up
          .slice(1)
          .filter(
            (sample, index) =>
              (indexes.get(sample.table) ?? -1) > (indexes.get(trace.up[index].table) ?? -1),
          ),
      ]);
      const samples = traces.flatMap((trace) => [...trace.down, ...trace.up]);
      const pairingErrors = samples.map((sample) =>
        Math.abs(
          (indexes.get(sample.table) ?? -1) +
            sample.tableCut -
            ((indexes.get(sample.gantt) ?? -1) + sample.ganttCut),
        ),
      );
      const frameGaps = traces
        .flatMap((trace) => [trace.down, trace.up])
        .flatMap((run) => run.slice(1).map((sample, index) => sample.at - run[index].at));
      expect(violations, 'equal wheel steps never reverse the visible row').toEqual([]);
      expect(
        Math.max(...pairingErrors),
        'the two faces drift by more than one tenth row',
      ).toBeLessThanOrEqual(0.1);
      expect(
        Math.max(...frameGaps),
        'a sampled animation frame stalls for more than 50ms',
      ).toBeLessThanOrEqual(50);
    });
  }
});
