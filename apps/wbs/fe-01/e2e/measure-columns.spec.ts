import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';

import { openSeededPlan, type SeededPlan, seedPlan } from './plan-fixture';

/**
 * Measure columns and the Measures panel, drawn by a browser
 * (`wbs-measure-budgets` tasks 4.2 and 4.3).
 *
 * The definitions are answered at the browser's boundary, for
 * `organization.spec.ts`'s reason: measures belong to an organization and the
 * ordinary e2e be-01 has none to answer `GET /api/measures` with (it says
 * `409 organization_required`). The budgets, money bases and mixes a panel has
 * to draw are written onto the real plan read for three named rows, since an
 * unowned project holds no cost definition to price; everything else — the
 * tokens trio and fact the interaction types — goes to the real be-01 and comes
 * back on its own read.
 *
 * Screenshots go to the test's output; with `MEASURE_EVIDENCE_DIR` set they are
 * also copied there (the slice's evidence), so CI never writes into the tree.
 */

const SEEDED_MEASURES = [
  ['time', 'Time', 'days', 'duration', 'real', true, true, true, false, 1, null],
  ['tokens', 'Tokens', 'tokens', 'count', 'integer', true, false, false, false, 2, null],
  ['hours', 'Hours', 'hours', 'duration', 'real', false, false, false, false, 3, null],
  ['cost', 'Cost', 'micro-USD', 'money', 'integer', true, false, false, false, 4, 'USD'],
  [
    'agent_minutes',
    'Agent minutes',
    'minutes',
    'duration',
    'integer',
    false,
    false,
    false,
    true,
    5,
    null,
  ],
].map(
  ([
    key,
    name,
    unit,
    kind,
    scale,
    threePoint,
    showByDefault,
    schedulesWork,
    derived,
    order,
    currency,
  ]) => ({
    id: `m-${String(key)}`,
    key,
    name,
    unit,
    kind,
    scale,
    threePoint,
    showByDefault,
    schedulesWork,
    derived,
    order,
    currency,
  }),
);

const CARD_A = { currency: 'USD', rateCardDigest: 'sha256:aaaa1111bbbb2222' };
const CARD_B = { currency: 'USD', rateCardDigest: 'sha256:cccc3333dddd4444' };

/** What the read says about the three rows the panel's states are drawn on, by row name. */
function measureFieldsFor(name: string, devStepId: string): Record<string, unknown> | null {
  if (name === 'Agent run: summarise incident reports')
    return {
      measures: {
        token_actual: { [devStepId]: 1200 },
        cost: { [devStepId]: 1_800_000 },
        agent_minutes: { [devStepId]: 95 },
      },
      measureEstimates: {
        tokens: {
          [devStepId]: {
            optimistic: 500,
            realistic: 800,
            pessimistic: 1400,
            singlePoint: false,
            expected: 850,
            variance: 350,
          },
        },
        cost: {
          [devStepId]: {
            optimistic: 1_000_000,
            realistic: 1_500_000,
            pessimistic: 3_000_000,
            singlePoint: false,
            expected: 1_666_667,
            variance: 133_333,
          },
        },
      },
      budgets: {
        tokens: { cap: 1000, policy: 'strict', source: 'stated', remaining: -200, exceeded: true },
        cost: {
          cap: 3_000_000,
          policy: 'advisory',
          source: 'derived',
          remaining: 1_200_000,
          exceeded: false,
        },
      },
      moneyBases: { cost: { facts: CARD_A, estimates: CARD_A } },
    };
  if (name === 'Re-price the nightly batch')
    return {
      measures: { token_actual: { [devStepId]: 40_000 } },
      measureEstimates: {
        tokens: {
          [devStepId]: {
            optimistic: 30_000,
            realistic: 30_000,
            pessimistic: 30_000,
            singlePoint: true,
            expected: 30_000,
            variance: 10_000,
          },
        },
      },
      budgets: {
        tokens: {
          cap: 50_000,
          policy: 'advisory',
          source: 'stated',
          remaining: 10_000,
          exceeded: false,
        },
      },
      mixedRateCards: { cost: { facts: [CARD_A, CARD_B] } },
    };
  return null;
}

/** Answers the definitions, and writes the panel's states onto the real plan read. */
async function answerMeasures(page: Page, devStepId: string): Promise<void> {
  await page.route('**/api/measures', (route) =>
    route.fulfill({ status: 200, json: { measures: SEEDED_MEASURES } }),
  );
  await page.route('**/api/projects/*/work-items*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { workItems: { name: string }[] };
    body.workItems = body.workItems.map((row) => ({
      ...row,
      ...(measureFieldsFor(row.name, devStepId) ?? {}),
    }));
    await route.fulfill({ response, json: body });
  });
}

async function seedMeasurePlan(page: Page, testInfo: TestInfo): Promise<SeededPlan> {
  return seedPlan(
    page,
    {
      name: 'Measures',
      rows: [
        {
          ref: 'agent',
          name: 'Agent run: summarise incident reports',
          estimates: { Dev: { optimistic: 1, realistic: 2, pessimistic: 4 } },
        },
        {
          ref: 'batch',
          name: 'Re-price the nightly batch',
          afterRef: 'agent',
          estimates: { Dev: { optimistic: 2, realistic: 3, pessimistic: 5 } },
        },
        {
          ref: 'fresh',
          name: 'Draft the onboarding email',
          afterRef: 'batch',
          estimates: { Dev: { optimistic: 0.5, realistic: 1, pessimistic: 2 } },
        },
      ],
    },
    { run: 'measure-columns', worker: testInfo.workerIndex, test: testInfo.title.slice(0, 24) },
  );
}

/** Saves a screenshot to the test's output, and to the evidence folder when one is named. */
async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  const evidence = process.env['MEASURE_EVIDENCE_DIR'];
  if (evidence !== undefined && evidence !== '') {
    mkdirSync(evidence, { recursive: true });
    copyFileSync(path, join(evidence, `${name}.png`));
  }
}

const measureHeadings = (page: Page) =>
  page
    .locator('th[data-column^="measure-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-column')));

async function openPanel(page: Page, number: string) {
  await page.getByRole('button', { name: `Actions for ${number}` }).click();
  await page.getByRole('menuitem', { name: 'Measures…' }).click();
  const panel = page.getByRole('dialog', { name: `Measures for ${number}` });
  await expect(panel).toBeVisible();
  return panel;
}

async function freshContextPage(browser: Browser, width: number, height: number) {
  const context = await browser.newContext({ viewport: { width, height } });
  return { context, page: await context.newPage() };
}

test.describe('measure columns', () => {
  test('a fresh reader sees time only; tokens enabled stays with that reader', async ({
    page,
    browser,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seeded = await seedMeasurePlan(page, testInfo);
    const devStepId = seeded.stepIds['Dev'] ?? '';
    await answerMeasures(page, devStepId);
    await openSeededPlan(page, seeded);
    await expect(page.locator('th[data-column="final-total"]')).toBeVisible();
    expect(await measureHeadings(page)).toEqual([]);

    await page.locator('details[data-columns] > summary').click();
    const tokens = page.locator('[data-measure-choice="tokens"] input');
    await expect(tokens).not.toBeChecked();
    await tokens.check();
    await page.locator('[data-measure-choice="cost"] input').check();
    await expect(page.locator('th[data-column="measure-cost-variance"]')).toBeVisible();
    await capture(page, testInfo, 'desktop-column-chooser');
    await page.keyboard.press('Escape');
    await page.mouse.click(1400, 880);
    expect(await measureHeadings(page)).toEqual([
      'measure-tokens-estimate',
      'measure-tokens-fact',
      'measure-tokens-variance',
      'measure-cost-estimate',
      'measure-cost-fact',
      'measure-cost-variance',
    ]);
    await expect(page.locator('td[data-column="measure-tokens-estimate"]').first()).toHaveText(
      '850',
    );
    await expect(page.locator('td[data-column="measure-cost-fact"]').nth(1)).toHaveText(
      'mixed cards',
    );
    await capture(page, testInfo, 'desktop-table-tokens-cost');

    // The same reader after a reload keeps the answer; another reader's
    // browser holds none of it.
    await page.reload();
    await expect(page.locator('th[data-column="measure-tokens-fact"]')).toBeVisible();
    const other = await freshContextPage(browser, 1440, 900);
    await answerMeasures(other.page, devStepId);
    await openSeededPlan(other.page, seeded);
    await expect(other.page.locator('th[data-column="final-total"]')).toBeVisible();
    expect(await measureHeadings(other.page)).toEqual([]);
    await other.context.close();
  });

  test('the Measures panel draws strict, advisory, mixed and empty states', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seeded = await seedMeasurePlan(page, testInfo);
    await answerMeasures(page, seeded.stepIds['Dev'] ?? '');
    await openSeededPlan(page, seeded);
    await expect(page.locator('th[data-column="final-total"]')).toBeVisible();

    let panel = await openPanel(page, '010');
    await expect(panel.getByRole('meter', { name: 'Tokens budget spent' })).toHaveAttribute(
      'aria-valuetext',
      '1,200 of 1,000, exceeded',
    );
    await expect(panel.locator('[data-budget="advisory"]')).toContainText('derived · advisory');
    await capture(page, testInfo, 'desktop-panel-strict-advisory');
    await page.keyboard.press('Escape');

    panel = await openPanel(page, '020');
    await expect(panel.locator('[data-budget="blocked"]')).toContainText('Budget unknown');
    await expect(panel.locator('[data-single-point]').first()).toBeVisible();
    await capture(page, testInfo, 'desktop-panel-mixed');
    await page.keyboard.press('Escape');

    panel = await openPanel(page, '030');
    await expect(panel.locator('[data-measures-empty]')).toBeVisible();
    await capture(page, testInfo, 'desktop-panel-empty');
  });

  test('on a phone, the chooser and the panel fit the screen', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const seeded = await seedMeasurePlan(page, testInfo);
    await answerMeasures(page, seeded.stepIds['Dev'] ?? '');
    await page.evaluate(
      ([key]) => {
        localStorage.setItem(key, JSON.stringify({ tokens: true, cost: true }));
      },
      [`wbs.measureColumns.${seeded.projectId}`],
    );
    await openSeededPlan(page, seeded);
    await expect(page.getByRole('article', { name: 'Work item 010' })).toBeVisible();
    await capture(page, testInfo, 'mobile-cards');

    await page.getByRole('button', { name: 'Plan actions' }).click();
    await page.locator('details[data-columns] > summary').click();
    await expect(page.locator('[data-measure-choice="tokens"] input')).toBeChecked();
    await page.locator('[data-measure-choices]').scrollIntoViewIfNeeded();
    await capture(page, testInfo, 'mobile-column-chooser');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    const panel = await openPanel(page, '010');
    const width = await panel.evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(390);
    await capture(page, testInfo, 'mobile-panel-strict-advisory');
    await page.keyboard.press('Escape');
    await openPanel(page, '020');
    await capture(page, testInfo, 'mobile-panel-mixed');
    await page.keyboard.press('Escape');
    await openPanel(page, '030');
    await capture(page, testInfo, 'mobile-panel-empty');
  });

  test('a typed tokens estimate and fact come back from be-01 as variance', async ({
    browser,
  }, testInfo) => {
    const evidence = process.env['MEASURE_EVIDENCE_DIR'];
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ...(evidence === undefined || evidence === ''
        ? {}
        : {
            recordVideo: { dir: testInfo.outputPath('video'), size: { width: 1440, height: 900 } },
          }),
    });
    const page = await context.newPage();
    const seeded = await seedMeasurePlan(page, testInfo);
    await answerMeasures(page, seeded.stepIds['Dev'] ?? '');
    await openSeededPlan(page, seeded);
    await expect(page.locator('th[data-column="final-total"]')).toBeVisible();

    await page.locator('details[data-columns] > summary').click();
    await page.locator('[data-measure-choice="tokens"] input').check();
    await page.waitForTimeout(400);
    await page.locator('details[data-columns] > summary').click();
    const variance = page.locator('td[data-column="measure-tokens-variance"]').nth(2);
    await expect(variance).toHaveText('—');

    const panel = await openPanel(page, '030');
    const tokens = panel.getByRole('region', { name: 'Tokens' });
    await tokens.getByRole('button', { name: 'Edit' }).click();
    await tokens.getByLabel('Tokens optimistic').pressSequentially('100', { delay: 40 });
    await tokens.getByLabel('Tokens realistic').pressSequentially('200', { delay: 40 });
    await tokens.getByLabel('Tokens pessimistic').pressSequentially('600', { delay: 40 });
    await tokens.getByRole('button', { name: 'Save estimate' }).click();
    await expect(tokens.locator('[data-measure-trio]')).toContainText('Optimistic 100');
    await tokens.getByLabel('Tokens fact').pressSequentially('300', { delay: 40 });
    await tokens.getByRole('button', { name: 'Save fact' }).click();
    await expect(tokens.locator('dd').nth(2)).toHaveText('+50');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await expect(variance).toHaveText('+50');
    await expect(page.locator('td[data-column="measure-tokens-estimate"]').nth(2)).toHaveText(
      '250',
    );
    await page.waitForTimeout(800);
    const video = page.video();
    await context.close();
    if (video !== null && evidence !== undefined && evidence !== '') {
      mkdirSync(evidence, { recursive: true });
      copyFileSync(await video.path(), join(evidence, 'interaction-toggle-estimate-variance.webm'));
    }
  });
});
