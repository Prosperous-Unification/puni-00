import { expect, test } from '@playwright/test';

import { painted, renderingGeometry, seedRenderingPlan } from '../e2e/rendering-fixture';
import {
  publicationOffset,
  ROW_OVERSCAN_PX,
  ROW_PUBLICATION_STEP_PX,
} from '../src/components/wbs/use-plan-viewport';

interface PerformanceFrameReading {
  actualScrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  frameHeight: number;
  frameTop: number;
  frameBottom: number;
  publishedOffset: number;
  rowOverscanPx: number;
  rowPublicationStepPx: number;
  windowStart: number;
  windowEnd: number;
  visibleStart: number;
  visibleEnd: number;
  mountedRows: number;
  mountedCells: number;
  intersectingRows: number;
  intersectingCells: number;
  mountedRowDetails: {
    id: string;
    index: number;
    top: number;
    bottom: number;
    height: number;
    cells: number;
  }[];
  firstMountedRow: string | null;
  firstMountedIndex: number | null;
  lastMountedRow: string | null;
  lastMountedIndex: number | null;
  pinnedFirstRowMounted: boolean;
}

interface PerformanceSample extends PerformanceFrameReading {
  index: number;
  requestedPhysicalTop: number;
  /** Additional two frames at the same scroll position; diagnostic only. */
  followUp: PerformanceFrameReading;
}

test('[TEST-AXES-038] a 100-row folded plan stays within its mounted-cell budget', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const plan = await seedRenderingPlan(page, { rows: 100, steps: 2, density: 'sparse' });
  expect(plan.ids).toHaveLength(100);
  expect(plan.steps).toBe(2);
  await page.goto('/');
  await expect(page.locator('[data-grid]')).toHaveAttribute('aria-rowcount', '101');
  const gantt = page.locator('[data-gantt-panel]');
  if (await gantt.count()) await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(gantt).toHaveCount(0);
  const fold = page.getByRole('button', { name: /^Fold .* estimates$/ });
  while ((await fold.count()) > 0) await fold.first().click();
  await expect(page.getByRole('button', { name: /^Unfold .* estimates$/ })).toHaveCount(2);

  const firstName = page.locator(`[data-name-input="${plan.ids[0]}"]`);
  await expect(firstName).toHaveValue('Row 0000');
  await firstName.focus();
  await expect(firstName).toBeFocused();
  const frame = page.locator('[data-table-frame]');
  const counts: number[] = [];
  const samples: PerformanceSample[] = [];
  const readFrame = async (): Promise<PerformanceFrameReading> => {
    const geometry = await renderingGeometry(page);
    const frameGeometry = await frame.evaluate((node) => {
      const frameBox = node.getBoundingClientRect();
      return {
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        frameTop: frameBox.top,
        frameBottom: frameBox.bottom,
        mountedRows: [...node.querySelectorAll<HTMLElement>('tbody tr[data-row-id]')].map((row) => {
          const box = row.getBoundingClientRect();
          return {
            id: row.dataset['rowId'] ?? '',
            top: box.top,
            bottom: box.bottom,
            height: box.height,
            cells: row.querySelectorAll('td[data-column]').length,
          };
        }),
      };
    });
    const mountedRowDetails = frameGeometry.mountedRows.map((row) => ({
      ...row,
      index: plan.ids.indexOf(row.id),
    }));
    const publishedOffset = publicationOffset(geometry.scrollTop, ROW_PUBLICATION_STEP_PX);
    return {
      actualScrollTop: geometry.scrollTop,
      clientHeight: frameGeometry.clientHeight,
      scrollHeight: frameGeometry.scrollHeight,
      frameHeight: geometry.height,
      frameTop: frameGeometry.frameTop,
      frameBottom: frameGeometry.frameBottom,
      publishedOffset,
      rowOverscanPx: ROW_OVERSCAN_PX,
      rowPublicationStepPx: ROW_PUBLICATION_STEP_PX,
      windowStart: Math.max(0, publishedOffset - ROW_OVERSCAN_PX),
      windowEnd: Math.min(
        frameGeometry.scrollHeight,
        publishedOffset + frameGeometry.clientHeight + ROW_OVERSCAN_PX,
      ),
      visibleStart: geometry.scrollTop,
      visibleEnd: geometry.scrollTop + frameGeometry.clientHeight,
      mountedRows: geometry.mountedRows,
      mountedCells: geometry.mountedCells,
      intersectingRows: geometry.intersectingRows,
      intersectingCells: geometry.intersectingCells,
      mountedRowDetails,
      firstMountedRow: mountedRowDetails.at(0)?.id ?? null,
      firstMountedIndex: mountedRowDetails.at(0)?.index ?? null,
      lastMountedRow: mountedRowDetails.at(-1)?.id ?? null,
      lastMountedIndex: mountedRowDetails.at(-1)?.index ?? null,
      pinnedFirstRowMounted: mountedRowDetails.some((row) => row.id === plan.ids[0]),
    };
  };
  for (const index of [0, 50, 99]) {
    const requestedPhysicalTop = await frame.evaluate((node, rowIndex) => {
      const requested = rowIndex === 99 ? node.scrollHeight : rowIndex * 28;
      node.scrollTop = requested;
      return requested;
    }, index);
    const row = page.locator(`tr[data-row-id="${plan.ids[index]}"]`);
    await expect(row).toBeVisible();
    await painted(page);
    const reading = await readFrame();
    expect(reading.mountedRows).toBeGreaterThan(0);
    expect(reading.mountedCells).toBeGreaterThan(0);
    counts.push(reading.mountedCells);
    // The original scalar sample is fixed above. This second two-frame read
    // diagnoses later height/window changes and is never used in its maximum.
    await painted(page);
    const followUp = await readFrame();
    samples.push({ index, requestedPhysicalTop, ...reading, followUp });
  }
  await expect(firstName).toBeFocused();
  await expect(page.locator(`tr[data-row-id="${plan.ids[0]}"]`)).toHaveCount(1);
  const measuredCells = Math.max(...counts);
  await testInfo.attach('puni.performance.samples.v1', {
    body: JSON.stringify({ schemaVersion: 1, caseId: 'wbs-folded-mounted-cells', samples }),
    contentType: 'application/json',
  });
  await testInfo.attach('puni.performance.observation.v1', {
    body: JSON.stringify({
      schemaVersion: 1,
      caseId: 'wbs-folded-mounted-cells',
      measurement: 'folded-mounted-cells',
      unit: 'count',
      value: measuredCells,
    }),
    contentType: 'application/json',
  });
});
