import { type CDPSession, expect, type Page, test } from '@playwright/test';

import { painted, seedRenderingPlan } from './rendering-fixture';

interface ProbeCounters {
  recordHeightCalls: number;
  recordHeightMs: number;
  placeRowsCalls: number;
  placeRowsMs: number;
  reactCommits: number;
  reactCommitMs: number;
  ganttCommits: number;
  ganttCommitMs: number;
  anchorWrites: number;
  scrollLinkWrites: number;
}

interface FrameSample {
  at: number;
  table: string;
  gantt: string;
  tableCut: number;
  ganttCut: number;
  counters: ProbeCounters;
}

const EMPTY_PROBE: ProbeCounters = {
  recordHeightCalls: 0,
  recordHeightMs: 0,
  placeRowsCalls: 0,
  placeRowsMs: 0,
  reactCommits: 0,
  reactCommitMs: 0,
  ganttCommits: 0,
  ganttCommitMs: 0,
  anchorWrites: 0,
  scrollLinkWrites: 0,
};

async function resetProbe(page: Page): Promise<void> {
  await page.evaluate((empty) => {
    window.__wbsScrollProbe = structuredClone(empty);
  }, EMPTY_PROBE);
}

async function pointAtTable(page: Page): Promise<void> {
  const box = await page.locator('[data-table-frame]').boundingBox();
  if (box === null) throw new Error('scroll probe table has no geometry');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function scrollTrace(page: Page, direction: 1 | -1): Promise<FrameSample[]> {
  await page.evaluate(() => {
    type ObservedWindow = typeof window & {
      __wbsScrollProbe?: ProbeCounters;
      __wbsScrollFrames?: FrameSample[];
      __wbsScrollFramesDone?: boolean;
    };
    const observed = window as ObservedWindow;
    observed.__wbsScrollFrames = [];
    observed.__wbsScrollFramesDone = false;
    const deadline = performance.now() + 1_200;
    const frame = document.querySelector<HTMLElement>('[data-table-frame]');
    const panel = document.querySelector<HTMLElement>('[data-gantt-panel]');
    if (frame === null || panel === null)
      throw new Error('scroll probe cannot see both plan faces');
    const heading = frame.querySelector<HTMLElement>('thead th');
    const axis = panel.querySelector<HTMLElement>('[data-gantt-axis]');
    if (heading === null || axis === null)
      throw new Error('scroll probe cannot see both plan headings');
    // The complete Gantt list is stable for this read. Re-querying and copying
    // 2,000 labels on every sampled frame made the observer itself allocate
    // hundreds of thousands of entries and introduced counter-free GC stalls.
    const ganttRows = Array.from(panel.querySelectorAll<HTMLElement>('[data-gantt-label]'));
    const first = (rows: readonly HTMLElement[], boundary: number) => {
      let low = 0;
      let high = rows.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const row = rows.at(middle);
        if (row !== undefined && row.getBoundingClientRect().bottom > boundary + 1) high = middle;
        else low = middle + 1;
      }
      const row = rows.at(low);
      if (row === undefined) throw new Error('scroll probe found no row');
      const rowBox = row.getBoundingClientRect();
      return { row, cut: (boundary - rowBox.top) / rowBox.height };
    };
    const capture = () => {
      // Table rows are virtualized and may be replaced between frames; unlike
      // the complete Gantt list, this bounded list must be read afresh.
      const tableRows = Array.from(frame.querySelectorAll<HTMLElement>('tr[data-row-id]'));
      const table = first(tableRows, heading.getBoundingClientRect().bottom);
      const gantt = first(ganttRows, axis.getBoundingClientRect().bottom);
      if (observed.__wbsScrollProbe === undefined)
        throw new Error('scroll probe instrumentation is absent');
      observed.__wbsScrollFrames?.push({
        at: performance.now(),
        table: table.row.dataset['rowId'] ?? '',
        gantt: gantt.row.dataset['ganttLabel'] ?? '',
        tableCut: table.cut,
        ganttCut: gantt.cut,
        counters: structuredClone(observed.__wbsScrollProbe),
      });
      if (performance.now() < deadline) requestAnimationFrame(capture);
      else observed.__wbsScrollFramesDone = true;
    };
    requestAnimationFrame(capture);
  });
  for (let step = 0; step < 60; step += 1) {
    await page.mouse.wheel(0, direction * 96);
    await page.waitForTimeout(16);
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __wbsScrollFramesDone?: boolean }).__wbsScrollFramesDone ??
          false,
      ),
    )
    .toBe(true);
  return page.evaluate(
    () => (window as typeof window & { __wbsScrollFrames?: FrameSample[] }).__wbsScrollFrames ?? [],
  );
}

async function timelineTrace<T>(session: CDPSession, action: () => Promise<T>) {
  if (process.env['WBS_SCROLL_TIMELINE'] === '0') {
    return {
      value: await action(),
      timeline: { layoutMs: 0, paintMs: 0, updateLayoutTreeMs: 0 },
    };
  }
  await session.send('Tracing.start', {
    categories: 'devtools.timeline',
    transferMode: 'ReturnAsStream',
  });
  const value = await action();
  const completed = new Promise<string>((resolve, reject) => {
    session.once('Tracing.tracingComplete', ({ stream }: { stream?: string }) => {
      if (stream === undefined) reject(new Error('Chromium trace has no stream'));
      else resolve(stream);
    });
  });
  await session.send('Tracing.end');
  const stream = await completed;
  let raw = '';
  for (;;) {
    const chunk = await session.send('IO.read', { handle: stream });
    raw += chunk.data;
    if (chunk.eof) break;
  }
  await session.send('IO.close', { handle: stream });
  const events =
    (JSON.parse(raw) as { traceEvents?: { name?: string; dur?: number }[] }).traceEvents ?? [];
  const durationMs = (name: string) =>
    events
      .filter((event) => event.name === name)
      .reduce((total, event) => total + (event.dur ?? 0) / 1_000, 0);
  return {
    value,
    timeline: {
      layoutMs: durationMs('Layout'),
      paintMs: durationMs('Paint'),
      updateLayoutTreeMs: durationMs('UpdateLayoutTree'),
    },
  };
}

test.use({
  viewport: { width: 1280, height: 800 },
  video: process.env['WBS_SCROLL_VIDEO'] === '0' ? 'off' : 'on',
});

test('50-row plan reaches matching terminal positions from either face', async ({ page }) => {
  const seeded = await seedRenderingPlan(page, {
    rows: 50,
    steps: 2,
    density: 'sparse',
    wrappedEvery: 5,
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.locator('[data-gantt-label]')).toHaveCount(50);

  const positions = async () =>
    page.evaluate(() => {
      const first = (port: Element, selector: string, edge: number) => {
        const row = [...port.querySelectorAll<HTMLElement>(selector)].find(
          (candidate) => candidate.getBoundingClientRect().bottom > edge + 1,
        );
        if (row === undefined) return { id: '', cut: 0 };
        const box = row.getBoundingClientRect();
        return { id: row.dataset['rowId'] ?? row.dataset['ganttLabel'] ?? '', cut: (edge - box.top) / box.height };
      };
      const table = document.querySelector<HTMLElement>('[data-table-frame]');
      const panel = document.querySelector<HTMLElement>('[data-gantt-panel]');
      const heading = table?.querySelector('thead th')?.getBoundingClientRect().bottom;
      const axis = panel?.querySelector<HTMLElement>('[data-gantt-axis]')?.getBoundingClientRect().bottom;
      if (table === null || panel === null || heading === undefined || axis === undefined)
        throw new Error('the two plan faces have no measurable headings');
      return {
        table: first(table, 'tr[data-row-id]', heading),
        gantt: first(panel, '[data-gantt-label]', axis),
      };
    });
  const indexes = new Map(seeded.ids.map((id, index) => [id, index]));

  for (const driver of ['[data-table-frame]', '[data-gantt-panel]'] as const) {
    for (const terminal of ['end', 'start'] as const) {
      for (let settle = 0; settle < 3; settle += 1) {
        await page.locator(driver).evaluate((node, edge) => {
          node.scrollTop = edge === 'end' ? node.scrollHeight : 0;
          node.dispatchEvent(new Event('scroll'));
        }, terminal);
        await painted(page);
      }
      const driverGap = await page.locator(driver).evaluate((node, edge) =>
        edge === 'end' ? node.scrollHeight - node.clientHeight - node.scrollTop : node.scrollTop,
      terminal);
      expect(driverGap, `${driver} driver does not roll back at ${terminal}`).toBeLessThanOrEqual(1);
      const paired = await positions();
      const mismatch = Math.abs(
        (indexes.get(paired.table.id) ?? -1) + paired.table.cut -
          ((indexes.get(paired.gantt.id) ?? -1) + paired.gantt.cut),
      );
      expect(mismatch, `${driver} leaves mismatched faces at ${terminal}`).toBeLessThanOrEqual(0.1);
    }
  }
});

test.describe('large-plan scroll stability', () => {
  test.describe.configure({ timeout: 10 * 60_000 });
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
      expect(wrappedBox.height, 'every fifth name wraps to at least two lines').toBeGreaterThan(
        oneLineBox.height * 1.5,
      );
      expect(wrappedBox.height, 'every fifth name wraps to exactly two lines').toBeLessThan(
        oneLineBox.height * 2.5,
      );

      const session = await page.context().newCDPSession(page);
      await session.send('Performance.enable');
      const traces = [];
      const repeats = Number(process.env['WBS_SCROLL_REPEATS'] ?? '5');
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        await page.locator('[data-table-frame]').evaluate((node) => {
          node.scrollTop = 0;
        });
        await painted(page);
        // Pointer placement is setup, not scrolling. Counting its row-light
        // publication charged the first trace for a Gantt commit a reader had
        // already paid before starting a wheel gesture.
        await pointAtTable(page);
        await painted(page);
        await resetProbe(page);
        const before = await session.send('Performance.getMetrics');
        const traced = await timelineTrace(session, async () => ({
          down: await scrollTrace(page, 1),
          up: await scrollTrace(page, -1),
        }));
        const { down, up } = traced.value;
        const after = await session.send('Performance.getMetrics');
        const counters = await page.evaluate(() => {
          const active = window.__wbsScrollProbe;
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
          timeline: traced.timeline,
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
      if (process.env['WBS_SCROLL_SUMMARY'] === '1')
        console.log(
          `WBS_SCROLL_SUMMARY ${JSON.stringify({
            rows,
            repeats,
            counters: traces.map((trace) => trace.counters),
            worstPairingRows: Math.max(...pairingErrors),
            worstFrameGapMs: Math.max(...frameGaps),
          })}`,
        );
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
