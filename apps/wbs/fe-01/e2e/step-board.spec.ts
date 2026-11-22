import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import type { PlanCommandWire } from '@wbs/contracts';

import { addedBoardJournalRow, readBoardJournal } from './board-journal';
import { ORDINARY_STEPS } from './catalogue-fixture';
import { openOrdinaryContext } from './ordinary-context';
import { expect, type Locator, type Page, test } from './ordinary-test';
import {
  fixtureClient,
  fixtureSuccess,
  openSeededPlan,
  type SeededPlan,
  seedPlan,
} from './plan-fixture';
import { seedRenderingPlan } from './rendering-fixture';

const identity = (testName: string, worker: number) => ({
  run: 'step-board',
  worker,
  test: testName,
});

const boardOf = (page: Page): Locator => page.getByRole('region', { name: 'Step board' });

async function storedStep(page: Page, seeded: SeededPlan, rowRef: string, stepName: string) {
  const tree = fixtureSuccess(
    'getApiWorkPackagesByIdWork-items',
    await fixtureClient(page)['getApiWorkPackagesByIdWork-items']({
      params: { id: seeded.workPackageId },
    }),
  ).body;
  const row = tree.workItems.find((candidate) => candidate.id === seeded.rowIds[rowRef]);
  if (row === undefined) throw new Error(`Seeded row ${rowRef} is missing from stored tree`);
  if (!Object.hasOwn(seeded.stepIds, stepName))
    throw new Error(`Seeded step ${stepName} is missing`);
  const stepId = seeded.stepIds[stepName];
  return row.progress[stepId];
}

async function seedMixedBoard(page: Page, worker: number) {
  const seeded = await seedPlan(
    page,
    {
      name: 'Step board browser',
      rows: [
        { ref: 'first', name: 'Build a long first task' },
        { ref: 'second', name: 'Review the second task' },
      ],
    },
    identity('mixed', worker),
  );
  const commands: PlanCommandWire[] = [
    { kind: 'setStatus', workItemId: seeded.rowIds['first'], status: 'on_hold' },
    {
      kind: 'setProgress',
      workItemId: seeded.rowIds['second'],
      stepId: seeded.stepIds['Dev'],
      state: 'done',
    },
    {
      kind: 'setProgress',
      workItemId: seeded.rowIds['second'],
      stepId: seeded.stepIds['QA'],
      state: 'in_progress',
    },
  ];
  fixtureSuccess(
    'postApiWorkPackagesByIdCommands',
    await fixtureClient(page).postApiWorkPackagesByIdCommands({
      params: { id: seeded.workPackageId },
      body: { commands },
    }),
  );
  await openSeededPlan(page, seeded);
  await expect(page.getByLabel('Name of 010')).toBeVisible();
  return seeded;
}

async function columnGeometry(page: Page) {
  return page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('[aria-label="Step board"]');
    if (board === null) throw new Error('board is absent');
    const viewport = document.documentElement.clientWidth;
    return [...board.querySelectorAll<HTMLElement>('section[aria-label]')]
      .filter((node) => ['Unknown', 'In progress', 'Done'].includes(node.ariaLabel ?? ''))
      .map((node) => {
        const box = node.getBoundingClientRect();
        const cards = [...node.querySelectorAll<HTMLElement>('li')];
        return {
          label: node.ariaLabel,
          top: box.top,
          left: box.left,
          right: box.right,
          viewport,
          cards: cards.map((card) => {
            const bounds = card.getBoundingClientRect();
            const surface = card.querySelector<HTMLElement>('[aria-label^="Drag "]');
            if (surface === null) throw new Error('Board card has no title and step surface');
            return {
              left: bounds.left,
              right: bounds.right,
              scrollWidth: card.scrollWidth,
              clientWidth: card.clientWidth,
              surface: {
                name: surface.getAttribute('aria-label'),
                text: surface.textContent,
                scrollWidth: surface.scrollWidth,
                clientWidth: surface.clientWidth,
              },
              controls: [...card.querySelectorAll<HTMLButtonElement>('button')].map((control) => {
                const target = control.getBoundingClientRect();
                return {
                  name: control.getAttribute('aria-label'),
                  height: target.height,
                  left: target.left,
                  right: target.right,
                  scrollWidth: control.scrollWidth,
                  clientWidth: control.clientWidth,
                };
              }),
            };
          }),
        };
      });
  });
}

test('renders the ordered mixed board and readable columns at desktop and 390px', async ({
  page,
}, testInfo) => {
  const evidenceDirectory = process.env['E2E_BOARD_ARTIFACT_DIR'];
  if (evidenceDirectory !== undefined && !isAbsolute(evidenceDirectory))
    throw new Error('Board browser artifact directory must be absolute');
  if (evidenceDirectory !== undefined) await mkdir(evidenceDirectory);
  const capturePath = (name: string) =>
    evidenceDirectory === undefined ? testInfo.outputPath(name) : join(evidenceDirectory, name);
  const seeded = await seedMixedBoard(page, testInfo.workerIndex);
  const beforeShortcuts = readBoardJournal(seeded.workPackageId);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PATCH', 'DELETE'].includes(request.method()))
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  const plan = page.getByRole('button', { name: 'Plan', exact: true });
  const boardButton = page.getByRole('button', { name: 'Board', exact: true });
  await expect(plan).toHaveAttribute('aria-pressed', 'true');
  await expect(boardButton).toHaveAttribute('aria-pressed', 'false');
  await boardButton.click();
  await expect(boardButton).toHaveAttribute('aria-pressed', 'true');
  await expect(boardOf(page)).toBeVisible();
  const columns = ['Unknown', 'In progress', 'Done'] as const;
  for (const [index, name] of columns.entries()) {
    const section = page.getByRole('region', { name, exact: true });
    await expect(section).toBeVisible();
    await expect(section.locator('li')).toHaveCount([2, 1, 1][index]);
  }
  const done = page.getByRole('region', { name: 'Done' }).locator('li');
  // Proof: blanking production card titles made this real Chromium case receive
  // "020  Dev Status: In progress" instead of "Review the second task".
  for (const word of ['020', 'Review the second task', 'Dev', 'Status: In progress'])
    await expect(done).toContainText(word);
  const unknown = page.getByRole('region', { name: 'Unknown' }).locator('li').first();
  for (const word of ['010', 'Build a long first task', 'Status: On hold'])
    await expect(unknown).toContainText(word);
  const running = page.getByRole('region', { name: 'In progress' }).locator('li');
  for (const word of ['020', 'Review the second task', 'QA'])
    await expect(running).toContainText(word);
  const desktop = await columnGeometry(page);
  expect(desktop.map(({ label }) => label)).toEqual(columns);
  expect(desktop[0].left).toBeLessThan(desktop[1].left);
  expect(desktop[1].left).toBeLessThan(desktop[2].left);
  for (const column of desktop) {
    expect(column.right).toBeLessThanOrEqual(column.viewport + 1);
    for (const card of column.cards) {
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
      expect(card.surface.name).toMatch(/\b(?:010|020)\b/);
      expect(card.surface.name).toMatch(/\b(?:Dev|QA)\b/);
      expect(card.surface.scrollWidth).toBeLessThanOrEqual(card.surface.clientWidth + 1);
      expect(card.controls).toHaveLength(2);
      for (const control of card.controls) {
        expect(control.name).toMatch(/\b(?:010|020)\b/);
        expect(control.name).toMatch(/\b(?:Dev|QA)\b/);
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(control.right).toBeLessThanOrEqual(column.viewport + 1);
        expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 1);
      }
    }
  }
  await page.screenshot({ path: capturePath('step-board-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await columnGeometry(page);
  expect(mobile.map(({ label }) => label)).toEqual(columns);
  expect(mobile[0].top).toBeLessThan(mobile[1].top);
  expect(mobile[1].top).toBeLessThan(mobile[2].top);
  for (const column of mobile) {
    expect(column.right).toBeLessThanOrEqual(column.viewport + 1);
    for (const card of column.cards) {
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
      expect(card.surface.text).toMatch(/\b(?:Dev|QA)\b/);
      expect(card.surface.scrollWidth).toBeLessThanOrEqual(card.surface.clientWidth + 1);
      expect(card.controls).toHaveLength(2);
      for (const control of card.controls) {
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(control.right).toBeLessThanOrEqual(column.viewport + 1);
        expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 1);
      }
    }
  }
  await page.screenshot({ path: capturePath('step-board-390.png'), fullPage: true });
  await writeFile(
    capturePath('step-board-geometry.json'),
    JSON.stringify({ desktop, mobile }, null, 2),
  );
  await boardOf(page).press('ControlOrMeta+z');
  await boardOf(page).press('ControlOrMeta+Shift+z');
  await boardOf(page).press('?');
  expect(writes).toEqual([]);
  expect(readBoardJournal(seeded.workPackageId)).toEqual(beforeShortcuts);
  await page.getByRole('button', { name: 'Return to Plan' }).click();
  await expect(plan).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Name of 010')).toHaveValue('Build a long first task');
  await plan.focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => writes).toEqual([`POST /api/work-packages/${seeded.workPackageId}/undo`]);
  expect(readBoardJournal(seeded.workPackageId).some((row) => row.undone === 1)).toBe(true);
  expect(seeded.rowIds['first']).not.toBe(seeded.rowIds['second']);
});

test('moves one numbered card by native drag, then undoes, redoes and clears its stored step', async ({
  page,
}, testInfo) => {
  const seeded = await seedPlan(
    page,
    {
      name: 'Board progress journal',
      rows: [
        { ref: 'first', name: 'Build' },
        { ref: 'other', name: 'Build' },
      ],
    },
    identity('progress-journal', testInfo.workerIndex),
  );
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const baseline = readBoardJournal(seeded.workPackageId);
  const board = boardOf(page);
  const unknown = page.getByRole('region', { name: 'Unknown', exact: true });
  const done = page.getByRole('region', { name: 'Done', exact: true });
  const card = board.getByRole('button', { name: 'Drag 010 Build / Dev' });
  const commands: unknown[] = [];
  const history: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    const path = new URL(request.url()).pathname;
    if (path === `/api/work-packages/${seeded.workPackageId}/commands`)
      commands.push(request.postDataJSON());
    if (
      path === `/api/work-packages/${seeded.workPackageId}/undo` ||
      path === `/api/work-packages/${seeded.workPackageId}/redo`
    )
      history.push(path);
  });
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBeUndefined();
  await card.dragTo(unknown);
  const outside = board.getByRole('button', { name: 'Return to Plan' });
  const outsideBox = await outside.boundingBox();
  if (outsideBox === null) throw new Error('Return to Plan has no outside-drop geometry');
  const outsidePoint = {
    x: outsideBox.x + outsideBox.width / 2,
    y: outsideBox.y + outsideBox.height / 2,
  };
  for (const column of [
    unknown,
    page.getByRole('region', { name: 'In progress', exact: true }),
    done,
  ]) {
    const box = await column.boundingBox();
    if (box === null) throw new Error('Board column has no outside-drop geometry');
    expect(
      outsidePoint.x < box.x ||
        outsidePoint.x > box.x + box.width ||
        outsidePoint.y < box.y ||
        outsidePoint.y > box.y + box.height,
    ).toBe(true);
  }
  await card.dragTo(outside);
  await expect(board).toBeVisible();
  await done.evaluate(
    (target, pair) => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', JSON.stringify(pair));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    },
    { workItemId: seeded.rowIds['first'], stepId: seeded.stepIds['Dev'] },
  );
  expect(commands).toEqual([]);
  await card.dragTo(done);
  await expect.poll(() => commands).toHaveLength(1);
  expect(commands).toEqual([
    {
      commands: [
        {
          kind: 'setProgress',
          workItemId: seeded.rowIds['first'],
          stepId: seeded.stepIds['Dev'],
          state: 'done',
        },
      ],
    },
  ]);
  await expect(done.getByRole('button', { name: 'Drag 010 Build / Dev' })).toBeVisible();
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBe('done');
  await expect.poll(() => storedStep(page, seeded, 'first', 'QA')).toBeUndefined();
  await expect.poll(() => storedStep(page, seeded, 'other', 'Dev')).toBeUndefined();
  const moveRow = addedBoardJournalRow(baseline, readBoardJournal(seeded.workPackageId));
  expect(moveRow).toMatchObject({ kind: 'progress', undone: 0 });
  expect(JSON.parse(moveRow.inverse)).toMatchObject({
    do: 'clear_progress',
    workItemId: seeded.rowIds['first'],
    stepId: seeded.stepIds['Dev'],
  });

  await page.getByRole('button', { name: 'Return to Plan' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => history).toHaveLength(1);
  expect(history).toEqual([`/api/work-packages/${seeded.workPackageId}/undo`]);
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBeUndefined();
  expect(readBoardJournal(seeded.workPackageId).find((row) => row.id === moveRow.id)?.undone).toBe(
    1,
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => history).toHaveLength(2);
  expect(history).toEqual([
    `/api/work-packages/${seeded.workPackageId}/undo`,
    `/api/work-packages/${seeded.workPackageId}/redo`,
  ]);
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBe('done');
  expect(readBoardJournal(seeded.workPackageId).find((row) => row.id === moveRow.id)?.undone).toBe(
    0,
  );

  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const beforeClear = readBoardJournal(seeded.workPackageId);
  await board
    .getByRole('button', { name: 'Clear progress for 010 Build / Dev (move to Unknown)' })
    .click();
  await expect.poll(() => commands).toHaveLength(2);
  expect(commands).toEqual([
    {
      commands: [
        {
          kind: 'setProgress',
          workItemId: seeded.rowIds['first'],
          stepId: seeded.stepIds['Dev'],
          state: 'done',
        },
      ],
    },
    {
      commands: [
        {
          kind: 'clearProgress',
          workItemId: seeded.rowIds['first'],
          stepId: seeded.stepIds['Dev'],
        },
      ],
    },
  ]);
  await expect(unknown.getByRole('button', { name: 'Drag 010 Build / Dev' })).toBeVisible();
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBeUndefined();
  const clearRow = addedBoardJournalRow(beforeClear, readBoardJournal(seeded.workPackageId));
  expect(clearRow).toMatchObject({ kind: 'clear_progress', undone: 0 });
  expect(JSON.parse(clearRow.inverse)).toMatchObject({
    do: 'set_progress',
    workItemId: seeded.rowIds['first'],
    stepId: seeded.stepIds['Dev'],
    state: 'done',
  });
  await page.getByRole('button', { name: 'Return to Plan' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBe('done');
  expect(readBoardJournal(seeded.workPackageId).find((row) => row.id === clearRow.id)?.undone).toBe(
    1,
  );
});

test('cancels a started native card drag with Escape before a drop', async ({ page }, testInfo) => {
  const seeded = await seedPlan(
    page,
    { name: 'Board cancelled drag', rows: [{ ref: 'first', name: 'Build' }] },
    identity('cancelled-drag', testInfo.workerIndex),
  );
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const card = boardOf(page).getByRole('button', { name: 'Drag 010 Build / Dev' });
  const done = page.getByRole('region', { name: 'Done', exact: true });
  const cardBox = await card.boundingBox();
  const doneBox = await done.boundingBox();
  if (cardBox === null || doneBox === null) throw new Error('Card drag has no browser geometry');
  const commands: unknown[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api/work-packages/${seeded.workPackageId}/commands`
    )
      commands.push(request.postDataJSON());
  });
  await page.evaluate(() => {
    Reflect.set(window, 'boardDragStarted', 0);
    document.addEventListener(
      'dragstart',
      () => {
        const count: unknown = Reflect.get(window, 'boardDragStarted');
        if (typeof count !== 'number') throw new Error('Board drag counter is malformed');
        Reflect.set(window, 'boardDragStarted', count + 1);
      },
      { once: true },
    );
  });
  await card.focus();
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 40, cardBox.y + cardBox.height / 2 + 10, {
    steps: 8,
  });
  await expect
    .poll(() => page.evaluate((): unknown => Reflect.get(window, 'boardDragStarted')))
    .toBe(1);
  await page.keyboard.press('Escape');
  await page.mouse.move(doneBox.x + doneBox.width / 2, doneBox.y + doneBox.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  expect(commands).toEqual([]);
  await expect(
    page
      .getByRole('region', { name: 'Unknown', exact: true })
      .getByRole('button', { name: 'Drag 010 Build / Dev' }),
  ).toBeVisible();
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBeUndefined();
});

test('uses the numbered keyboard control and a phone touch tap with delivered focus', async ({
  browser,
  page,
}, testInfo) => {
  const seeded = await seedPlan(
    page,
    { name: 'Board input controls', rows: [{ ref: 'first', name: 'Build' }] },
    identity('input-controls', testInfo.workerIndex),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const board = boardOf(page);
  await board.getByRole('button', { name: 'Drag 010 Build / Dev' }).focus();
  await page.keyboard.press('Enter');
  await expect(
    board.getByRole('button', { name: 'Move 010 Build / Dev to In progress' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(board.getByRole('button', { name: 'Drag 010 Build / Dev' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    board.getByRole('button', { name: 'Move 010 Build / Dev to In progress' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  const doneControl = board.getByRole('button', { name: 'Move 010 Build / Dev to Done' });
  await expect(doneControl).toBeFocused();
  await page.keyboard.press('Space');
  const delivered = page
    .getByRole('region', { name: 'Done', exact: true })
    .getByRole('button', { name: 'Drag 010 Build / Dev' });
  await expect(delivered).toBeVisible();
  await expect(delivered).toBeFocused();
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBe('done');

  const touchContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const touch = await touchContext.newPage();
    await touch.goto('/');
    await expect(touch.getByRole('button', { name: 'local-dev' })).toBeVisible();
    await openSeededPlan(touch, seeded);
    await touch.getByRole('button', { name: 'Board', exact: true }).click();
    await boardOf(touch).getByRole('button', { name: 'Move 010 Build / Dev to In progress' }).tap();
    await expect(
      touch
        .getByRole('region', { name: 'In progress', exact: true })
        .getByRole('button', { name: 'Drag 010 Build / Dev' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'In progress', exact: true })
        .getByRole('button', { name: 'Drag 010 Build / Dev' }),
    ).toBeVisible();
    await expect.poll(() => storedStep(touch, seeded, 'first', 'Dev')).toBe('in_progress');
  } finally {
    await touchContext.close();
  }
});

test('restores a prior step value with one Plan Undo after a Board correction', async ({
  page,
}, testInfo) => {
  const seeded = await seedPlan(
    page,
    { name: 'Board prior progress', rows: [{ ref: 'first', name: 'Build' }] },
    identity('prior-progress', testInfo.workerIndex),
  );
  fixtureSuccess(
    'postApiWorkPackagesByIdCommands',
    await fixtureClient(page).postApiWorkPackagesByIdCommands({
      params: { id: seeded.workPackageId },
      body: {
        commands: [
          {
            kind: 'setProgress',
            workItemId: seeded.rowIds['first'],
            stepId: seeded.stepIds['Dev'],
            state: 'in_progress',
          },
        ],
      },
    }),
  );
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const commands: unknown[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api/work-packages/${seeded.workPackageId}/commands`
    )
      commands.push(request.postDataJSON());
  });
  await boardOf(page).getByRole('button', { name: 'Move 010 Build / Dev to Done' }).click();
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBe('done');
  expect(commands).toEqual([
    {
      commands: [
        {
          kind: 'setProgress',
          workItemId: seeded.rowIds['first'],
          stepId: seeded.stepIds['Dev'],
          state: 'done',
        },
      ],
    },
  ]);
  await page.getByRole('button', { name: 'Return to Plan' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBe('in_progress');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBe('done');
});

test('holds a Board command pending without an optimistic card move or duplicate send', async ({
  page,
}, testInfo) => {
  const seeded = await seedPlan(
    page,
    { name: 'Board pending command', rows: [{ ref: 'first', name: 'Build' }] },
    identity('pending-command', testInfo.workerIndex),
  );
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  let markHeld: () => void = () => {
    throw new Error('Board command was not held');
  };
  let releaseCommand: () => void = () => {
    throw new Error('Board command had no release');
  };
  let markRouteSettled: () => void = () => {
    throw new Error('Board command route did not settle');
  };
  const commandHeld = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const commandRelease = new Promise<void>((resolve) => {
    releaseCommand = resolve;
  });
  const routeSettled = new Promise<void>((resolve) => {
    markRouteSettled = resolve;
  });
  const commandPath = `**/api/work-packages/${seeded.workPackageId}/commands`;
  const commands: unknown[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api/work-packages/${seeded.workPackageId}/commands`
    )
      commands.push(request.postDataJSON());
  });
  await page.route(commandPath, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    markHeld();
    await commandRelease;
    try {
      await route.continue();
    } finally {
      markRouteSettled();
    }
  });
  try {
    const move = boardOf(page).getByRole('button', { name: 'Move 010 Build / Dev to Done' });
    await move.click();
    await commandHeld;
    await expect(boardOf(page).getByRole('status')).toContainText('Updating step progress');
    await expect(move).toBeDisabled();
    await expect(
      page
        .getByRole('region', { name: 'Unknown', exact: true })
        .getByRole('button', { name: 'Drag 010 Build / Dev' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Done', exact: true })
        .getByRole('button', { name: 'Drag 010 Build / Dev' }),
    ).toHaveCount(0);
    expect(commands).toEqual([
      {
        commands: [
          {
            kind: 'setProgress',
            workItemId: seeded.rowIds['first'],
            stepId: seeded.stepIds['Dev'],
            state: 'done',
          },
        ],
      },
    ]);
    await boardOf(page).getByRole('button', { name: 'Return to Plan' }).focus();
  } finally {
    releaseCommand();
    await routeSettled;
    await page.unroute(commandPath);
  }
  await expect(
    page
      .getByRole('region', { name: 'Done', exact: true })
      .getByRole('button', { name: 'Drag 010 Build / Dev' }),
  ).toBeVisible();
  await expect(boardOf(page).getByRole('button', { name: 'Return to Plan' })).toBeFocused();
  expect(commands).toHaveLength(1);
});

test('keeps Board admission pending through Plan remount while every post-command tree read is held', async ({
  page,
}, testInfo) => {
  const seeded = await seedPlan(
    page,
    { name: 'Board held covering reads', rows: [{ ref: 'first', name: 'Build' }] },
    identity('covering-read', testInfo.workerIndex),
  );
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const commandPath = `**/api/work-packages/${seeded.workPackageId}/commands`;
  const treePath = `**/api/work-packages/${seeded.workPackageId}/work-items`;
  const commands: unknown[] = [];
  let holdReads = false;
  let heldCount = 0;
  let markRead: () => void = () => {
    throw new Error('Post-command tree read did not start');
  };
  let releaseReads: () => void = () => {
    throw new Error('Tree reads had no release');
  };
  const readHeld = new Promise<void>((resolve) => {
    markRead = resolve;
  });
  const readRelease = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api/work-packages/${seeded.workPackageId}/commands`
    )
      commands.push(request.postDataJSON());
  });
  await page.route(commandPath, async (route) => {
    if (route.request().method() === 'POST') holdReads = true;
    await route.continue();
  });
  await page.route(treePath, async (route) => {
    if (route.request().method() !== 'GET' || !holdReads) {
      await route.continue();
      return;
    }
    heldCount += 1;
    markRead();
    await readRelease;
    await route.continue();
  });
  try {
    const commandResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/work-packages/${seeded.workPackageId}/commands` &&
        response.ok(),
    );
    await boardOf(page).getByRole('button', { name: 'Move 010 Build / Dev to Done' }).click();
    await commandResponse;
    await expect.poll(() => commands).toHaveLength(1);
    await readHeld;
    await expect.poll(() => heldCount).toBeGreaterThanOrEqual(1);
    // Every GET since dispatch is held, including websocket-triggered reads; no
    // fixture polling issues another GET until after release.
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await expect(boardOf(page).getByRole('status')).toContainText('Updating step progress');
    await expect(
      boardOf(page).getByRole('button', { name: 'Move 010 Build / Dev to Done' }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole('region', { name: 'Unknown', exact: true })
        .getByRole('button', { name: 'Drag 010 Build / Dev' }),
    ).toBeVisible();
    expect(commands).toHaveLength(1);
  } finally {
    releaseReads();
    await page.unroute(commandPath);
    await page.unroute(treePath);
  }
  await expect(
    page
      .getByRole('region', { name: 'Done', exact: true })
      .getByRole('button', { name: 'Drag 010 Build / Dev' }),
  ).toBeVisible();
  await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBe('done');
  expect(commands).toHaveLength(1);
});

test('shows one modeled command refusal and leaves stored progress unchanged', async ({
  page,
}, testInfo) => {
  const seeded = await seedPlan(
    page,
    { name: 'Board refused command', rows: [{ ref: 'first', name: 'Build' }] },
    identity('refused-command', testInfo.workerIndex),
  );
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const commandPath = `**/api/work-packages/${seeded.workPackageId}/commands`;
  const commands: unknown[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api/work-packages/${seeded.workPackageId}/commands`
    )
      commands.push(request.postDataJSON());
  });
  await page.route(commandPath, (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      json: { error: 'forbidden' },
    }),
  );
  try {
    await boardOf(page).getByRole('button', { name: 'Move 010 Build / Dev to Done' }).click();
    await expect.poll(() => commands).toHaveLength(1);
    expect(commands).toEqual([
      {
        commands: [
          {
            kind: 'setProgress',
            workItemId: seeded.rowIds['first'],
            stepId: seeded.stepIds['Dev'],
            state: 'done',
          },
        ],
      },
    ]);
    await expect(page.locator('[data-toast-text]')).toHaveCount(1);
    await expect(page.locator('[data-toast-text]')).toContainText(
      'this plan is not yours to change',
    );
    await expect(
      page
        .getByRole('region', { name: 'Unknown', exact: true })
        .getByRole('button', { name: 'Drag 010 Build / Dev' }),
    ).toBeVisible();
    await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBeUndefined();
  } finally {
    await page.unroute(commandPath);
  }
});

test('does not carry an old admitted Board request into a newly selected work package', async ({
  page,
}, testInfo) => {
  const first = await seedPlan(
    page,
    { name: 'Board old request', rows: [{ ref: 'first', name: 'Old card' }] },
    identity('old-request', testInfo.workerIndex),
  );
  const second = await seedPlan(
    page,
    { name: 'Board new runtime', rows: [{ ref: 'second', name: 'New card' }] },
    identity('new-runtime', testInfo.workerIndex),
  );
  await openSeededPlan(page, first);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const commandPath = `**/api/work-packages/${first.workPackageId}/commands`;
  let markHeld: () => void = () => {
    throw new Error('Old request did not start');
  };
  let releaseOld: () => void = () => {
    throw new Error('Old request has no release');
  };
  const held = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  const oldCommands: unknown[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api/work-packages/${first.workPackageId}/commands`
    )
      oldCommands.push(request.postDataJSON());
  });
  await page.route(commandPath, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    markHeld();
    await release;
    await route.continue();
  });
  try {
    await boardOf(page).getByRole('button', { name: 'Move 010 Old card / Dev to Done' }).click();
    await held;
    await expect.poll(() => oldCommands).toHaveLength(1);
    const picker = page.getByRole('combobox', { name: 'Work package' });
    await picker.click();
    await picker.fill(second.workPackageName);
    await page.getByRole('option').filter({ hasText: second.workPackageName }).click();
    await expect(picker).toHaveValue(second.workPackageName);
    releaseOld();
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await expect(boardOf(page)).toContainText('New card');
    await expect(boardOf(page)).not.toContainText('Old card');
    await expect.poll(() => storedStep(page, first, 'first', 'Dev')).toBe('done');
    await expect.poll(() => storedStep(page, second, 'second', 'Dev')).toBeUndefined();
    await expect(page.locator('[data-toast-text]')).toHaveCount(0);
    expect(oldCommands).toHaveLength(1);
  } finally {
    releaseOld();
    await page.unroute(commandPath);
  }
});

test('keeps the delivered card after a successful command with failed covering reads, then Retry only reads', async ({
  page,
}, testInfo) => {
  const seeded = await seedPlan(
    page,
    { name: 'Board failed covering read', rows: [{ ref: 'first', name: 'Build' }] },
    identity('failed-covering-read', testInfo.workerIndex),
  );
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const commandPath = `**/api/work-packages/${seeded.workPackageId}/commands`;
  const treePath = `**/api/work-packages/${seeded.workPackageId}/work-items`;
  let failReads = false;
  const commands: unknown[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api/work-packages/${seeded.workPackageId}/commands`
    )
      commands.push(request.postDataJSON());
  });
  await page.route(commandPath, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    failReads = true;
    await route.fulfill({ response });
  });
  await page.route(treePath, async (route) => {
    if (route.request().method() !== 'GET' || !failReads) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      json: { error: 'engine_unavailable', engine: 'optimized' },
    });
  });
  try {
    await boardOf(page).getByRole('button', { name: 'Move 010 Build / Dev to Done' }).click();
    await expect.poll(() => commands).toHaveLength(1);
    await expect(boardOf(page).getByRole('alert')).toContainText(
      'Showing the last delivered board',
    );
    await expect(
      page
        .getByRole('region', { name: 'Unknown', exact: true })
        .getByRole('button', { name: 'Drag 010 Build / Dev' }),
    ).toBeVisible();
    failReads = false;
    await expect.poll(() => storedStep(page, seeded, 'first', 'Dev')).toBe('done');
    await boardOf(page).getByRole('button', { name: 'Retry' }).click();
    expect(commands).toHaveLength(1);
    await expect(
      page
        .getByRole('region', { name: 'Done', exact: true })
        .getByRole('button', { name: 'Drag 010 Build / Dev' }),
    ).toBeVisible();
    expect(commands).toHaveLength(1);
  } finally {
    await page.unroute(commandPath);
    await page.unroute(treePath);
  }
});

test('keeps view controls in the phone toolbar and keyboard focus on the selected view', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seeded = await seedPlan(
    page,
    {
      name: 'Board phone room',
      rows: Array.from({ length: 1 }, (_, index) => ({
        ref: `r${String(index)}`,
        name: `Task ${String(index)}`,
      })),
    },
    identity('phone-room', testInfo.workerIndex),
  );
  await openSeededPlan(page, seeded);
  const selector = page.getByRole('group', { name: 'Work package view' });
  const actions = page.getByRole('button', { name: 'Plan actions', exact: true });
  const selectorBox = await selector.boundingBox();
  const actionsBox = await actions.boundingBox();
  if (selectorBox === null || actionsBox === null)
    throw new Error('Plan controls have no geometry');
  expect(
    Math.abs(selectorBox.y - actionsBox.y),
    'view controls share the existing phone toolbar row',
  ).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Board', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Board', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toBeFocused();
  for (const width of [768, 900, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const header = page.getByRole('banner');
    await expect(header.getByRole('group', { name: 'Work package view' })).toBeVisible();
    expect(
      await header.evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBeLessThanOrEqual(0);
    await header.getByRole('button', { name: 'Board', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(header.getByRole('button', { name: 'Board', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Space');
    await expect(header.getByRole('button', { name: 'Plan', exact: true })).toBeFocused();
  }
});

test('wraps unbroken card labels inside every column at desktop and 390px', async ({
  page,
}, testInfo) => {
  const title = 'UnbrokenTitle'.repeat(30);
  const stepName = 'UnbrokenStep'.repeat(8);
  const seeded = await seedPlan(
    page,
    {
      name: 'Step board wrapping',
      steps: [...ORDINARY_STEPS, { code: 'board-wrapping', name: stepName }],
      rows: [{ ref: 'first', name: title }],
    },
    identity('wrapping', testInfo.workerIndex),
  );
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const card = boardOf(page).locator('li');
  await expect(card.first()).toContainText(title);
  await expect(card.filter({ hasText: stepName })).toHaveCount(1);
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await columnGeometry(page);
    for (const column of geometry) {
      expect(column.right).toBeLessThanOrEqual(column.viewport + 1);
      for (const bounds of column.cards) {
        expect(bounds.right).toBeLessThanOrEqual(column.right + 1);
        expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
      }
    }
  }
});

test('preserves a cancelled-pointer draft through peer delivery and commits it once on ordinary leave', async ({
  browser,
  page,
}, testInfo) => {
  const seeded = await seedPlan(
    page,
    {
      name: 'Step board peer draft',
      rows: [
        { ref: 'first', name: 'Original first' },
        { ref: 'second', name: 'Original second' },
      ],
    },
    identity('peer-draft', testInfo.workerIndex),
  );
  await openSeededPlan(page, seeded);
  const field = page.getByLabel('Name of 010');
  await expect(field).toBeVisible();
  const writes: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PATCH', 'DELETE'].includes(request.method()) && request.url().includes('/api/'))
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await field.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Draft one');
  const boardButton = page.getByRole('button', { name: 'Board', exact: true });
  // Synthetic pointer cancellation happens before the browser moves focus.
  // Subsequent typing and the later click use real Chromium input events.
  await boardButton.dispatchEvent('pointerdown');
  await boardButton.dispatchEvent('pointercancel');
  await expect(field).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Draft two');
  await expect(field).toHaveValue('Draft two');
  expect(writes).toEqual([]);
  await boardButton.click();
  await expect(boardOf(page)).toBeVisible();
  expect(writes).toEqual([]);

  const peerContext = await openOrdinaryContext(browser, {
    viewport: { width: 1400, height: 900 },
  });
  let primary: { cause: unknown } | null = null;
  try {
    const peer = await peerContext.newPage();
    await peer.goto('/');
    await expect(peer.getByRole('button', { name: 'local-dev' })).toBeVisible();
    await openSeededPlan(peer, seeded);
    const sameFieldWrite = peer.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/commands') &&
        response.ok(),
    );
    await peer.getByLabel('Name of 010').fill('Peer first');
    await peer.getByLabel('Name of 010').blur();
    await sameFieldWrite;
    const bystanderWrite = peer.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/commands') &&
        response.ok(),
    );
    await peer.getByLabel('Name of 020').fill('Peer second');
    await peer.getByLabel('Name of 020').blur();
    await bystanderWrite;
    // The bystander's new text witnesses delivery of the peer's later event.
    // The held first field still retains the local draft through that tree.
    await expect(boardOf(page)).toContainText('Peer second');
    await expect(boardOf(page)).toContainText('Peer first');
    expect(writes).toEqual([]);

    await page.getByRole('button', { name: 'Return to Plan' }).click();
    await expect(field).toHaveValue('Draft two');
    await field.click();
    await expect(field).toBeFocused();
    const commit = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/commands') &&
        response.ok(),
    );
    await page.getByLabel('Name of 020').click();
    await commit;
    expect(writes.filter((request) => request.includes('/commands'))).toHaveLength(1);
    await expect(field).toHaveValue('Draft two');
  } catch (cause) {
    primary = { cause };
  }
  const cleanup: unknown[] = [];
  try {
    await peerContext.close();
  } catch (cause) {
    cleanup.push(cause);
  }
  if (primary !== null) {
    if (cleanup.length !== 0)
      throw new AggregateError([primary.cause, ...cleanup], 'Peer interaction and cleanup failed', {
        cause: primary.cause,
      });
    throw primary.cause;
  }
  if (cleanup.length !== 0) throw new AggregateError(cleanup, 'Peer context cleanup failed');

  const planButton = page.getByRole('button', { name: 'Plan', exact: true });
  await planButton.focus();
  await page.keyboard.press('Tab');
  await expect(boardButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(planButton).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(boardButton).toHaveAttribute('aria-pressed', 'true');
  expect(writes.filter((request) => request.includes('/commands'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Return to Plan' }).click();
  await field.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Mobile held draft');
  // Direct selector focus exercises the suspension boundary. Native Shift+Tab
  // from this field reaches intermediate Plan controls and commits on blur.
  await boardButton.focus();
  await expect(boardButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(boardButton).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Return to Plan' }).click();
  await expect(field).toHaveValue('Mobile held draft');
  expect(writes.filter((request) => request.includes('/commands'))).toHaveLength(1);
});

test('shows a first read failure, retries, then retains cards after a later failed peer refresh', async ({
  browser,
  page,
}, testInfo) => {
  const seeded = await seedPlan(
    page,
    { name: 'Step board failure', rows: [{ ref: 'first', name: 'Before peer' }] },
    identity('read-failure', testInfo.workerIndex),
  );
  let refuseReads = true;
  let holdFirstRead = true;
  let markFirstRead: () => void = () => {
    throw new Error('first read did not start');
  };
  let releaseFirstRead: () => void = () => {
    throw new Error('first read was not held');
  };
  const firstReadHeld = new Promise<void>((resolve) => {
    markFirstRead = resolve;
  });
  const firstReadRelease = new Promise<void>((resolve) => {
    releaseFirstRead = resolve;
  });
  await page.route(`**/api/work-packages/${seeded.workPackageId}/work-items`, async (route) => {
    if (route.request().method() !== 'GET' || !refuseReads) {
      await route.continue();
      return;
    }
    if (holdFirstRead) {
      holdFirstRead = false;
      markFirstRead();
      await firstReadRelease;
    }
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      json: { error: 'engine_unavailable', engine: 'optimized' },
    });
  });
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await firstReadHeld;
  await expect(boardOf(page)).toContainText('Loading board');
  releaseFirstRead();
  await expect(boardOf(page).getByRole('alert')).toContainText(
    'Optimized scheduling is unavailable',
  );
  await expect(boardOf(page).locator('li')).toHaveCount(0);
  refuseReads = false;
  await boardOf(page).getByRole('button', { name: 'Retry' }).click();
  await expect(boardOf(page)).toContainText('Before peer');
  await expect(boardOf(page).getByRole('alert')).toHaveCount(0);

  const peerContext = await openOrdinaryContext(browser);
  let primary: { cause: unknown } | null = null;
  try {
    const peer = await peerContext.newPage();
    await openSeededPlan(peer, seeded);
    refuseReads = true;
    const peerWrite = peer.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/commands') &&
        response.ok(),
    );
    await peer.getByLabel('Name of 010').fill('After peer');
    await peer.getByLabel('Name of 010').blur();
    await peerWrite;
    await expect(boardOf(page).getByRole('alert')).toContainText(
      'Showing the last delivered board',
    );
    await expect(boardOf(page)).toContainText('Before peer');
    refuseReads = false;
    await boardOf(page).getByRole('button', { name: 'Retry' }).click();
    await expect(boardOf(page)).toContainText('After peer');
    await expect(boardOf(page).getByRole('alert')).toHaveCount(0);
  } catch (cause) {
    primary = { cause };
  }
  const cleanup: unknown[] = [];
  try {
    await peerContext.close();
  } catch (cause) {
    cleanup.push(cause);
  }
  if (primary !== null) {
    if (cleanup.length !== 0)
      throw new AggregateError([primary.cause, ...cleanup], 'Peer interaction and cleanup failed', {
        cause: primary.cause,
      });
    throw primary.cause;
  }
  if (cleanup.length !== 0) throw new AggregateError(cleanup, 'Peer context cleanup failed');
});

test('does not carry late old cards or a suspended draft into another work package', async ({
  browser,
  page,
}, testInfo) => {
  const first = await seedPlan(
    page,
    { name: 'Board first work package', rows: [{ ref: 'first', name: 'First card' }] },
    identity('switch-first', testInfo.workerIndex),
  );
  const second = await seedPlan(
    page,
    { name: 'Board second work package', rows: [{ ref: 'second', name: 'Second card' }] },
    identity('switch-second', testInfo.workerIndex),
  );
  await openSeededPlan(page, first);
  const field = page.getByLabel('Name of 010');
  await field.fill('First private draft');
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(boardOf(page)).toContainText('First card');
  let markHeld: () => void = () => {
    throw new Error('old read did not start');
  };
  let releaseOldRead: () => void = () => {
    throw new Error('old read was not held');
  };
  const oldReadHeld = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const oldReadRelease = new Promise<void>((resolve) => {
    releaseOldRead = resolve;
  });
  let markOldReadFinished: () => void = () => {
    throw new Error('old read did not finish');
  };
  const oldReadFinished = new Promise<void>((resolve) => {
    markOldReadFinished = resolve;
  });
  await page.route(`**/api/work-packages/${first.workPackageId}/work-items`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    markHeld();
    await oldReadRelease;
    await route.fulfill({ response });
    markOldReadFinished();
  });
  const peerContext = await openOrdinaryContext(browser);
  let primary: { cause: unknown } | null = null;
  try {
    const peer = await peerContext.newPage();
    await openSeededPlan(peer, first);
    const peerWrite = peer.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/commands') &&
        response.ok(),
    );
    await peer.getByLabel('Name of 010').fill('Late old card');
    await peer.getByLabel('Name of 010').blur();
    await peerWrite;
    await oldReadHeld;
    const picker = page.getByRole('combobox', { name: 'Work package' });
    await picker.click();
    await picker.fill(second.workPackageName);
    await page.getByRole('option').filter({ hasText: second.workPackageName }).click();
    await expect(page.getByLabel('Name of 010')).toHaveValue('Second card');
    releaseOldRead();
    await oldReadFinished;
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await expect(boardOf(page)).toContainText('Second card');
    await expect(boardOf(page)).not.toContainText('First card');
    await expect(boardOf(page)).not.toContainText('Late old card');
    await expect(boardOf(page)).not.toContainText('First private draft');
    await page.getByRole('button', { name: 'Return to Plan' }).click();
    await expect(page.getByLabel('Name of 010')).toHaveValue('Second card');
  } catch (cause) {
    primary = { cause };
  }
  const cleanup: unknown[] = [];
  try {
    releaseOldRead();
  } catch (cause) {
    cleanup.push(cause);
  }
  try {
    await peerContext.close();
  } catch (cause) {
    cleanup.push(cause);
  }
  if (primary !== null) {
    if (cleanup.length !== 0)
      throw new AggregateError([primary.cause, ...cleanup], 'Peer interaction and cleanup failed', {
        cause: primary.cause,
      });
    throw primary.cause;
  }
  if (cleanup.length !== 0) throw new AggregateError(cleanup, 'Peer context cleanup failed');
});

test('keeps the delivered board visible while its live connection is down', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const BrowserSocket = window.WebSocket;
    const boardSockets: WebSocket[] = [];
    Object.assign(window, { boardSockets });
    window.WebSocket = class RecordingSocket extends BrowserSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (new URL(String(url), location.href).pathname === '/ws') boardSockets.push(this);
      }
    };
  });
  const seeded = await seedPlan(
    page,
    { name: 'Board disconnected', rows: [{ ref: 'first', name: 'Visible offline' }] },
    identity('disconnected', testInfo.workerIndex),
  );
  await openSeededPlan(page, seeded);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(boardOf(page)).toContainText('Visible offline');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const sockets: unknown = Reflect.get(window, 'boardSockets');
        return (
          Array.isArray(sockets) &&
          sockets.some((socket) => socket instanceof WebSocket && socket.readyState === 1)
        );
      }),
    )
    .toBe(true);
  await page.context().setOffline(true);
  const closedCount = await page.evaluate(() => {
    const sockets: unknown = Reflect.get(window, 'boardSockets');
    if (!Array.isArray(sockets)) throw new Error('work package sockets were not observed');
    let count = 0;
    for (const socket of sockets) {
      if (!(socket instanceof WebSocket) || socket.readyState !== 1) continue;
      socket.close();
      count += 1;
    }
    return count;
  });
  expect(closedCount).toBeGreaterThan(0);
  // Proof: suppressing the production warning made this real-browser outage
  // case find no Board status after closing every active page /ws socket.
  await expect(boardOf(page).getByRole('status')).toContainText('Reconnecting');
  await expect(boardOf(page)).toContainText('Visible offline');
});

test('measures every rendered card for a 500-leaf, five-step fixture', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const seeded = await seedRenderingPlan(page, { rows: 500, steps: 5, density: 'sparse' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  const started = performance.now();
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const cards = boardOf(page).locator('li');
  await expect(cards).toHaveCount(2500);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  const measurement = {
    setupMs: seeded.setupMs,
    boardRenderAndPaintMs: performance.now() - started,
    cardCount: await cards.count(),
    viewport: page.viewportSize(),
    browser: `chromium ${browser.version()}`,
    host: `${process.platform}/${process.arch}`,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain=v1'], { encoding: 'utf8' }).trim(),
    workPackageId: seeded.workPackageId,
  };
  await writeFile(
    testInfo.outputPath('step-board-500x5.json'),
    JSON.stringify(measurement, null, 2),
  );
  await page.screenshot({ path: testInfo.outputPath('step-board-500x5.png'), fullPage: true });
  expect(measurement.cardCount).toBe(2500);
});
