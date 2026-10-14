import { execFileSync } from 'node:child_process';

import { expect, type Page, test } from '@playwright/test';

import { seedStepReadings } from './step-readings-seed';

/** Explicit activation is confined to the fresh browser database selected by the fixture configuration. */
function activateFixture(): void {
  const database = process.env['E2E_TEST_DATABASE'];
  if (database === undefined) throw new Error('Missing ordinary browser fixture database');
  execFileSync(
    'bun',
    [
      '-e',
      "import { activateTestStepBlockages } from './libs/wbs/adapters/store-sqlite/src/testing/step-blockage-activation.ts'; activateTestStepBlockages(process.argv[1]);",
      database,
    ],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
}

async function seedBlockages(page: Page) {
  const { projectId } = await seedStepReadings(page);
  const identities = await page.evaluate(async (projectId) => {
    const response = await fetch(`/api/projects/${projectId}/work-items`);
    const tree = (await response.json()) as {
      workItems: { id: string; number: string }[];
      steps: { id: string; name: string }[];
    };
    const source = tree.workItems.find((row) => row.number === '040')?.id;
    const target = tree.workItems.find((row) => row.number === '020')?.id;
    const dev = tree.steps.find((step) => step.name === 'Dev')?.id;
    const qa = tree.steps.find((step) => step.name === 'QA')?.id;
    if (source === undefined || target === undefined || dev === undefined || qa === undefined)
      throw new Error('Missing browser seed identities');
    const written = await fetch(`/api/projects/${projectId}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { kind: 'setProgress', workItemId: source, stepId: dev, state: 'in_progress' },
          { kind: 'setStepBlocked', workItemId: source, stepId: dev, isBlocked: true },
          {
            kind: 'addTypedDependency',
            predecessor: { scope: 'node', workItemId: source, stepId: dev },
            successor: { scope: 'node', workItemId: target, stepId: qa },
            type: 'FS',
          },
        ],
      }),
    });
    if (!written.ok)
      throw new Error(
        `Blockage fixture write failed: ${String(written.status)} ${await written.text()}`,
      );
    return { source, target, dev, qa };
  }, projectId);
  await page.reload();
  await expect(page.getByLabel('Name of 040')).toBeVisible();
  return { projectId, ...identities };
}

async function openCard(page: Page, label: string) {
  await page.mouse.move(0, 0);
  await page.getByLabel(label).locator('..').hover();
  const card = page.getByRole('tooltip').filter({ hasText: /for \d{3}/ });
  await expect(card).toBeVisible();
  return card;
}

test.describe('step blockage on the production preview path', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(() => {
    activateFixture();
  });
  test('distinguishes direct and dependency blockage with named roots and retained progress', async ({
    page,
  }, testInfo) => {
    await seedBlockages(page);
    const direct = await openCard(page, 'Dev estimate for 040');
    await expect(direct.getByText('Direct step blockage', { exact: true })).toBeVisible();
    await expect(direct.getByText('Progress: In progress', { exact: true })).toBeVisible();
    await expect(direct.getByText(/Cause: 040\.s1-dev · Refund policy · Dev/)).toBeVisible();
    await expect(
      direct.getByRole('button', { name: 'Clear step blockage on 040.s1-dev' }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('direct-desktop.png') });
    const proxy = await openCard(page, 'QA estimate for 020');
    await expect(proxy.getByText('Blocked by dependency', { exact: true })).toBeVisible();
    await expect(proxy.getByText(/Cause: 040\.s1-dev · Refund policy · Dev/)).toBeVisible();
    await expect(proxy.getByRole('button', { name: 'Block step 020.s2-qa' })).toBeVisible();
  });
  test('keyboard clear and block use one undoable step action', async ({ page }) => {
    await seedBlockages(page);
    const cell = page.getByLabel('Dev estimate for 040');
    await cell.focus();
    await cell.press('F2');
    await expect(page.getByRole('button', { name: 'Copy reference' })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Clear step blockage on 040.s1-dev' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('No direct step blockage', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Block step 040.s1-dev' }).press('Enter');
    await expect(page.getByText('Direct step blockage', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cell).toBeFocused();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const undone = await openCard(page, 'Dev estimate for 040');
    await expect(undone.getByText('No direct step blockage', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    const redone = await openCard(page, 'Dev estimate for 040');
    await expect(redone.getByText('Direct step blockage', { exact: true })).toBeVisible();
  });
  test('phone disclosure names the cause and offers the scoped action', async ({
    page,
  }, testInfo) => {
    await seedBlockages(page);
    await page.setViewportSize({ width: 375, height: 850 });
    const row = page.locator('[data-card]').filter({ has: page.getByLabel('Name of 020') });
    const step = row.locator('[data-step-blockage]').filter({ hasText: 'Step blockage' });
    await step.last().locator('summary').click();
    await expect(step.last().getByText('Blocked by dependency', { exact: true })).toBeVisible();
    await expect(step.last().getByText(/Cause: 040\.s1-dev · Refund policy · Dev/)).toBeVisible();
    await expect(step.last().getByRole('button', { name: 'Block step 020.s2-qa' })).toBeVisible();
    const action = step.last().getByRole('button', { name: 'Block step 020.s2-qa' });
    expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('proxy-phone.png') });
  });

  test('nested blocked leaf and its downstream node retain named causes in both layouts', async ({
    page,
  }) => {
    const { projectId, source, dev, target, qa } = await seedBlockages(page);
    const nested = await page.evaluate(
      async ({ projectId, source, dev }) => {
        const written = await fetch(`/api/projects/${projectId}/commands`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            commands: [
              {
                kind: 'createWorkItem',
                ref: 'branch',
                parentId: null,
                afterId: source,
                name: 'Nested release',
              },
              { kind: 'moveWorkItem', workItemId: source, parentRef: 'branch', afterId: null },
            ],
          }),
        });
        if (!written.ok)
          throw new Error(
            `Nested fixture write failed: ${String(written.status)} ${await written.text()}`,
          );
        const response = await fetch(`/api/projects/${projectId}/work-items`);
        const tree = (await response.json()) as {
          workItems: { id: string; number: string }[];
          stepNodes: { workItemId: string; stepId: string; reference: string | null }[];
        };
        const number = tree.workItems.find((row) => row.id === source)?.number;
        const reference = tree.stepNodes.find(
          (node) => node.workItemId === source && node.stepId === dev,
        )?.reference;
        if (number === undefined || reference === undefined || reference === null)
          throw new Error('Missing nested fixture address');
        return { number, reference };
      },
      { projectId, source, dev },
    );
    await page.reload();
    await expect(page.getByLabel(`Name of ${nested.number}`)).toBeVisible();
    const direct = await openCard(page, `Dev estimate for ${nested.number}`);
    await expect(direct.getByText('Direct step blockage', { exact: true })).toBeVisible();
    await expect(
      direct.getByText(`Cause: ${nested.reference} · Refund policy · Dev`, { exact: true }),
    ).toBeVisible();
    const proxy = await openCard(page, 'QA estimate for 020');
    await expect(proxy.getByText('Blocked by dependency', { exact: true })).toBeVisible();
    await expect(
      proxy.getByText(`Cause: ${nested.reference} · Refund policy · Dev`, { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 375, height: 850 });
    for (const [ownerId, stepId, wording] of [
      [source, dev, 'Direct step blockage'],
      [target, qa, 'Blocked by dependency'],
    ] as const) {
      const details = page.locator(`[data-card="${ownerId}"] [data-step-blockage="${stepId}"]`);
      await details.locator('summary').click();
      await expect(details.getByText(wording, { exact: true })).toBeVisible();
      await expect(
        details.getByText(`Cause: ${nested.reference} · Refund policy · Dev`, { exact: true }),
      ).toBeVisible();
    }
  });
  test('supported blockage facts without node readings reach the Error Boundary', async ({
    page,
  }) => {
    const { source } = await seedBlockages(page);
    await page.route('**/api/projects/*/work-items*', async (route) => {
      const response = await route.fetch();
      const tree = (await response.json()) as {
        workItems: { id: string; nodeReadings?: unknown }[];
      };
      const row = tree.workItems.find((row) => row.id === source);
      if (row === undefined) throw new Error('Missing supported fixture row');
      delete row.nodeReadings;
      await route.fulfill({ response, json: tree });
    });
    await page.reload();
    await expect(page.getByText('Something went wrong!', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show Error' }).click();
    await expect(page.getByText(/Missing node reading for/)).toBeVisible();
  });
  test('malformed supported cause metadata reaches the application Error Boundary', async ({
    page,
  }) => {
    const { target, qa } = await seedBlockages(page);
    await page.route('**/api/projects/*/work-items*', async (route) => {
      const response = await route.fetch();
      const tree = (await response.json()) as {
        workItems: { id: string; blockageCauses: Record<string, unknown> }[];
      };
      const row = tree.workItems.find((row) => row.id === target);
      if (row === undefined) throw new Error('Missing target in intercepted read');
      row.blockageCauses[qa] = [{ kind: 'step', nodeId: 'missing-root' }];
      await route.fulfill({ response, json: tree });
    });
    await page.reload();
    await expect(page.getByText('Something went wrong!', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show Error' }).click();
    await expect(
      page.getByText('Unknown blockage cause missing-root', { exact: true }),
    ).toBeVisible();
  });
  test('an inactive writer reports its 409 without changing the direct fact', async ({ page }) => {
    const { projectId, source, dev } = await seedBlockages(page);
    const database = process.env['E2E_TEST_DATABASE'];
    if (database === undefined) throw new Error('Missing isolated browser database');
    execFileSync(
      'bun',
      [
        '-e',
        "import { Database } from 'bun:sqlite'; const db = new Database(process.argv[1], { readwrite: true, create: false }); db.run(\"UPDATE step_blockage_activation SET state='DISABLED' WHERE id=1\"); db.close();",
        database,
      ],
      { cwd: process.cwd(), stdio: 'pipe' },
    );
    const card = await openCard(page, 'Dev estimate for 040');
    const refused = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/projects/${projectId}/commands`) && response.status() === 409,
    );
    await card.getByRole('button', { name: 'Clear step blockage on 040.s1-dev' }).click();
    expect(await (await refused).json()).toMatchObject({ error: 'step_blockage_inactive' });
    await expect(
      page.getByText('Step blockage changes are not enabled on this server.', { exact: true }),
    ).toBeVisible();
    const retained = await page.evaluate(
      async ({ projectId, source, dev }) => {
        const response = await fetch(`/api/projects/${projectId}/work-items`);
        const tree = (await response.json()) as {
          workItems: { id: string; blockages: Record<string, unknown> }[];
        };
        return tree.workItems.find((row) => row.id === source)?.blockages[dev];
      },
      { projectId, source, dev },
    );
    expect(retained).toBeDefined();
    await expect(page.locator('[data-app-fault]')).toHaveCount(0);
  });
  test('older backend metadata reads unknown and offers no blockage write', async ({ page }) => {
    await seedBlockages(page);
    await page.route('**/api/projects/*/work-items*', async (route) => {
      const response = await route.fetch();
      const tree = (await response.json()) as {
        workItems: { blockages?: unknown; blockageCauses?: unknown; nodeReadings?: unknown }[];
      };
      for (const row of tree.workItems) {
        delete row.blockages;
        delete row.blockageCauses;
        delete row.nodeReadings;
      }
      await route.fulfill({ response, json: tree });
    });
    await page.reload();
    const card = await openCard(page, 'Dev estimate for 040');
    await expect(
      card.getByText('Step blockage unknown — this server omits blockage details.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: /step blockage on|Block step/ })).toHaveCount(0);
  });
});
