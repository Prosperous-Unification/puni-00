import { expect, test } from '@playwright/test';

import { openSeededPlan, seedPlan } from './plan-fixture';

const RUN_TOKEN = String(Date.now());
const ROW_COUNT = 40;

test('pointing a visible bar leaves its linked offscreen table row in place', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const rows = Array.from({ length: ROW_COUNT }, (_, index) => ({
    ref: `row-${String(index)}`,
    name: `Pointed row ${String(index + 1)}`,
    estimates: { Dev: { optimistic: 2, realistic: 4, pessimistic: 6 } },
  }));
  const seeded = await seedPlan(
    page,
    { name: 'Pointed row offscreen', rows },
    {
      run: RUN_TOKEN,
      worker: test.info().workerIndex,
      test: test.info().title,
    },
  );
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.locator('[data-gantt-label]')).toHaveCount(ROW_COUNT);
  await expect(page.locator('[data-gantt-bar]:not([data-assumed])')).toHaveCount(ROW_COUNT);
  const panel = page.locator('[data-gantt-panel]');
  const panelBox = await panel.boundingBox();
  if (panelBox === null) throw new Error('chart panel has no box');
  await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2);
  await page.mouse.wheel(0, 6 * 28);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  async function measurePremise() {
    return page.evaluate(() => {
      const frame = document.querySelector('[data-table-frame]');
      const panel = document.querySelector('[data-gantt-panel]');
      const axis = document.querySelector('[data-gantt-axis]');
      if (!(frame instanceof HTMLElement) || !(panel instanceof HTMLElement) || axis === null)
        throw new Error('linked pane or axis is missing');
      const rows = [...frame.querySelectorAll('tbody tr[data-row-id]')];
      const frameBox = frame.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const contentTop = frame.querySelector('thead th')?.getBoundingClientRect().bottom;
      const chartTop = axis.getBoundingClientRect().bottom;
      if (contentTop === undefined) throw new Error('table heading is missing');
      const firstVisibleIndex = rows.findIndex(
        (row) => row.getBoundingClientRect().bottom > contentTop + 1,
      );
      const candidates = rows.map((row, index) => {
        const id = row.getAttribute('data-row-id');
        const label = id === null ? null : panel.querySelector(`[data-gantt-label="${id}"]`);
        const number = String((index + 1) * 10).padStart(3, '0');
        const bar = [...panel.querySelectorAll('[data-gantt-bar]:not([data-assumed])')].find(
          (mark) => mark.getAttribute('aria-label')?.startsWith(`${number} - `),
        );
        if (label === null || bar === undefined)
          throw new Error(`row ${number} has no paired label or bar`);
        const rowBox = row.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        const barBox = bar.getBoundingClientRect();
        const left = Math.max(barBox.left, panelBox.left, 0);
        const right = Math.min(barBox.right, panelBox.right, innerWidth);
        const top = Math.max(barBox.top, chartTop, panelBox.top, 0);
        const bottom = Math.min(barBox.bottom, panelBox.bottom, innerHeight);
        const point = { x: (left + right) / 2, y: (top + bottom) / 2 };
        return {
          index,
          number,
          rowTop: rowBox.top,
          rowBottom: rowBox.bottom,
          labelTop: labelBox.top,
          barTop: barBox.top,
          barBottom: barBox.bottom,
          rowBelow: rowBox.top >= frameBox.bottom,
          barVisible: left < right && top < bottom,
          exactHit:
            left < right &&
            top < bottom &&
            document.elementFromPoint(point.x, point.y)?.closest('[data-gantt-bar]') === bar,
          point,
        };
      });
      return {
        frame: {
          top: frameBox.top,
          bottom: frameBox.bottom,
          scrollTop: frame.scrollTop,
          clientHeight: frame.clientHeight,
          scrollHeight: frame.scrollHeight,
        },
        panel: {
          top: panelBox.top,
          bottom: panelBox.bottom,
          scrollTop: panel.scrollTop,
          clientHeight: panel.clientHeight,
          scrollHeight: panel.scrollHeight,
        },
        contentTop,
        chartTop,
        firstVisibleIndex,
        firstCutTable:
          firstVisibleIndex < 0
            ? null
            : (contentTop - rows[firstVisibleIndex].getBoundingClientRect().top) /
              rows[firstVisibleIndex].getBoundingClientRect().height,
        firstCutChart:
          firstVisibleIndex < 0
            ? null
            : (() => {
                const firstId = rows[firstVisibleIndex].getAttribute('data-row-id');
                const label =
                  firstId === null ? null : panel.querySelector(`[data-gantt-label="${firstId}"]`);
                if (label === null) throw new Error('first visible row has no chart label');
                const box = label.getBoundingClientRect();
                return (chartTop - box.top) / box.height;
              })(),
        candidates: candidates.filter(
          (candidate) =>
            candidate.index >= firstVisibleIndex && candidate.index <= firstVisibleIndex + 17,
        ),
      };
    });
  }

  const defaultLayout = await measurePremise();
  console.log('POINTED_ROW_DEFAULT_GEOMETRY', JSON.stringify(defaultLayout));
  let layout = defaultLayout;
  let chosen = defaultLayout.candidates.find(
    (candidate) => candidate.rowBelow && candidate.barVisible && candidate.exactHit,
  );
  if (chosen === undefined) {
    const grip = await page.locator('[data-gantt-height-handle]').boundingBox();
    if (grip === null) throw new Error('Gantt height handle has no box');
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 70, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const resizedLayout = await measurePremise();
    console.log('POINTED_ROW_DRAG_GEOMETRY', JSON.stringify(resizedLayout));
    layout = resizedLayout;
    chosen = resizedLayout.candidates.find(
      (candidate) => candidate.rowBelow && candidate.barVisible && candidate.exactHit,
    );
  }
  expect(chosen, 'no wholly offscreen table row has an exact visible bar hit').toBeDefined();
  if (chosen === undefined) throw new Error('offscreen pointed row premise is absent');
  expect(layout.frame.scrollTop, 'the linked table has not scrolled').toBeGreaterThan(0);
  expect(layout.panel.scrollTop, 'the linked chart has not scrolled').toBeGreaterThan(0);
  expect(
    layout.frame.clientHeight,
    'the table reached its 20rem minimum-height floor',
  ).toBeGreaterThan(360);
  expect(
    Math.abs((layout.firstCutTable ?? Infinity) - (layout.firstCutChart ?? -Infinity)),
    'first visible logical row is not aligned',
  ).toBeLessThanOrEqual(0.05);
  // Proof: substituting the paired visible row 070 made this explicit geometry assertion fail before pointer movement.
  expect(
    chosen.rowTop,
    'the paired table row is still inside its content clip',
  ).toBeGreaterThanOrEqual(layout.frame.bottom);
  // Proof: selecting the next clipped bar made this hit-point refusal fail before pointer movement.
  expect(
    chosen.barVisible && chosen.exactHit,
    'the selected bar is clipped or covered at its hit point',
  ).toBe(true);

  await page.mouse.move(0, 0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const before = await page.evaluate(() => {
    const table = document.querySelector('[data-table-frame]');
    const chart = document.querySelector('[data-gantt-panel]');
    if (!(table instanceof HTMLElement) || !(chart instanceof HTMLElement))
      throw new Error('a linked pane disappeared');
    const original: unknown = Reflect.get(Element.prototype, 'scrollIntoView');
    if (typeof original !== 'function') throw new Error('native scrollIntoView is missing');
    const calls: { target: string; options: unknown[] }[] = [];
    Reflect.set(window, '__offscreenPointedRowScrollRecorder', { original, calls });
    Element.prototype.scrollIntoView = function (...options) {
      calls.push({ target: this.outerHTML.slice(0, 160), options: [...options] });
      Reflect.apply(original, this, options);
    };
    return {
      tableTop: table.scrollTop,
      tableLeft: table.scrollLeft,
      chartTop: chart.scrollTop,
      chartLeft: chart.scrollLeft,
      pageX: window.scrollX,
      pageY: window.scrollY,
      focused: document.activeElement?.outerHTML,
    };
  });
  const navigations: string[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest()) navigations.push(request.url());
  });
  const url = page.url();
  try {
    await page.mouse.move(chosen.point.x, chosen.point.y);
    for (let frame = 0; frame < 3; frame += 1) {
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(resolve)));
      expect(page.url(), 'bar hover changed the page URL').toBe(url);
      expect(navigations, 'bar hover made a navigation request').toEqual([]);
      const after = await page.evaluate((number) => {
        const table = document.querySelector('[data-table-frame]');
        const chart = document.querySelector('[data-gantt-panel]');
        const row = document.querySelector(`[aria-label="Name of ${number}"]`)?.closest('tr');
        const recorder: unknown = Reflect.get(window, '__offscreenPointedRowScrollRecorder');
        if (
          !(table instanceof HTMLElement) ||
          !(chart instanceof HTMLElement) ||
          typeof recorder !== 'object' ||
          recorder === null ||
          !('calls' in recorder) ||
          !Array.isArray(recorder.calls)
        )
          throw new Error('linked pane or scroll recorder disappeared');
        return {
          positions: {
            tableTop: table.scrollTop,
            tableLeft: table.scrollLeft,
            chartTop: chart.scrollTop,
            chartLeft: chart.scrollLeft,
            pageX: window.scrollX,
            pageY: window.scrollY,
            focused: document.activeElement?.outerHTML,
          },
          rowTop: row?.getBoundingClientRect().top ?? null,
          tableBottom: table.getBoundingClientRect().bottom,
          scrollRequests: recorder.calls.length,
        };
      }, chosen.number);
      // Proof: routing bar pointerover through real onPickRow moved focus from
      // the Gantt button to Name of 390; this named assertion failed.
      expect(after.positions.focused, 'bar hover transferred focus through row navigation').toBe(
        before.focused,
      );
      expect(after.positions, 'bar hover scrolled a linked pane or page').toEqual(before);
      expect(after.scrollRequests, 'bar hover requested scrollIntoView').toBe(0);
      expect(after.rowTop, 'the pointed table row is no longer mounted').not.toBeNull();
      expect(after.rowTop, 'the pointed table row entered the content clip').toBeGreaterThanOrEqual(
        after.tableBottom,
      );
    }
    await expect(page.locator('[data-gantt-row-lit]')).toHaveAttribute(
      'data-gantt-row-lit',
      String(chosen.index),
    );
    await expect(page.locator('[data-gantt-label-lit]')).toHaveText(new RegExp(chosen.number));
    await expect(
      page.getByLabel(`Name of ${chosen.number}`).locator('xpath=ancestor::tr'),
    ).toHaveAttribute('data-row-lit', 'true');
  } finally {
    await page.evaluate(() => {
      const recorder: unknown = Reflect.get(window, '__offscreenPointedRowScrollRecorder');
      if (
        typeof recorder === 'object' &&
        recorder !== null &&
        'original' in recorder &&
        typeof recorder.original === 'function'
      )
        Element.prototype.scrollIntoView =
          recorder.original as typeof Element.prototype.scrollIntoView;
      Reflect.deleteProperty(window, '__offscreenPointedRowScrollRecorder');
    });
  }
});
