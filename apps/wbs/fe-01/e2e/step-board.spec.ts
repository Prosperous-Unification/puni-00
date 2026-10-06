import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

import { expect, type Locator, type Page, test } from '@playwright/test';
import type { PlanCommandWire } from '@wbs/contracts';

import { fixtureClient, fixtureSuccess, openSeededPlan, seedPlan } from './plan-fixture';
import { seedRenderingPlan } from './rendering-fixture';

const identity = (testName: string, worker: number) => ({
  run: 'step-board',
  worker,
  test: testName,
});

const boardOf = (page: Page): Locator => page.getByRole('region', { name: 'Step board' });

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
    'postApiProjectsByIdCommands',
    await fixtureClient(page).postApiProjectsByIdCommands({
      params: { id: seeded.projectId },
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
            return {
              left: bounds.left,
              right: bounds.right,
              scrollWidth: card.scrollWidth,
              clientWidth: card.clientWidth,
            };
          }),
        };
      });
  });
}

test('renders the ordered mixed board and readable columns at desktop and 390px', async ({
  page,
}, testInfo) => {
  const seeded = await seedMixedBoard(page, testInfo.workerIndex);
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
    for (const card of column.cards)
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
  }
  await page.screenshot({ path: testInfo.outputPath('step-board-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await columnGeometry(page);
  expect(mobile.map(({ label }) => label)).toEqual(columns);
  expect(mobile[0].top).toBeLessThan(mobile[1].top);
  expect(mobile[1].top).toBeLessThan(mobile[2].top);
  for (const column of mobile) {
    expect(column.right).toBeLessThanOrEqual(column.viewport + 1);
    for (const card of column.cards)
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
  }
  await page.screenshot({ path: testInfo.outputPath('step-board-390.png'), fullPage: true });
  await writeFile(
    testInfo.outputPath('step-board-geometry.json'),
    JSON.stringify({ desktop, mobile }, null, 2),
  );
  await boardOf(page).locator('li').first().dragTo(boardOf(page).locator('li').last());
  await boardOf(page).press('ControlOrMeta+z');
  await boardOf(page).press('ControlOrMeta+Shift+z');
  await boardOf(page).press('?');
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Return to Plan' }).click();
  await expect(plan).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Name of 010')).toHaveValue('Build a long first task');
  expect(seeded.rowIds['first']).not.toBe(seeded.rowIds['second']);
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

  const peerContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    locale: 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1400, height: 900 },
  });
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
  } finally {
    await peerContext.close();
  }

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
  await page.route(`**/api/projects/${seeded.projectId}/work-items`, async (route) => {
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

  const peerContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
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
  } finally {
    await peerContext.close();
  }
});

test('does not carry late old cards or a suspended draft into another project', async ({
  browser,
  page,
}, testInfo) => {
  const first = await seedPlan(
    page,
    { name: 'Board first project', rows: [{ ref: 'first', name: 'First card' }] },
    identity('switch-first', testInfo.workerIndex),
  );
  const second = await seedPlan(
    page,
    { name: 'Board second project', rows: [{ ref: 'second', name: 'Second card' }] },
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
  await page.route(`**/api/projects/${first.projectId}/work-items`, async (route) => {
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
  const peerContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
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
    const picker = page.getByRole('combobox', { name: 'Project' });
    await picker.click();
    await picker.fill(second.projectName);
    await page.getByRole('option').filter({ hasText: second.projectName }).click();
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
  } finally {
    releaseOldRead();
    await peerContext.close();
  }
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
    if (!Array.isArray(sockets)) throw new Error('project sockets were not observed');
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
    projectId: seeded.projectId,
  };
  await writeFile(
    testInfo.outputPath('step-board-500x5.json'),
    JSON.stringify(measurement, null, 2),
  );
  await page.screenshot({ path: testInfo.outputPath('step-board-500x5.png'), fullPage: true });
  expect(measurement.cardCount).toBe(2500);
});
