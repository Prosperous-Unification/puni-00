import { type BrowserContext, expect, type Page, test } from '@playwright/test';

interface Frame {
  type?: string;
  subscription?: string;
  seq?: number;
  message?: { type: string };
  replayed?: Record<string, number>;
}
interface Identity {
  id: string;
  row: string;
  step: string;
}

/** Real socket admission and wire barriers delimit silence without timed sleeps. */
function observe(page: Page) {
  const frames: Frame[] = [];
  const reads: { seq: number; workItems: { nodeReadings: Record<string, string> }[] }[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', (event) => {
      frames.push(JSON.parse(String(event.payload)) as Frame);
    });
  });
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname.endsWith('/work-items') && response.ok())
      reads.push((await response.json()) as (typeof reads)[number]);
  });
  return { frames, reads };
}

async function authenticate(context: BrowserContext, token: string) {
  await context.addCookies([
    {
      name: '__Host-wbs_access',
      value: token,
      domain: 'localhost',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

/** Controls the real native application socket without substituting its transport callbacks. */
async function operateSocket(page: Page, operation: 'ping' | 'close') {
  const cdp = await page.context().newCDPSession(page);
  try {
    const prototype = await cdp.send('Runtime.evaluate', { expression: 'WebSocket.prototype' });
    if (prototype.result.objectId === undefined) throw new Error('missing native socket prototype');
    const sockets = await cdp.send('Runtime.queryObjects', {
      prototypeObjectId: prototype.result.objectId,
    });
    await cdp.send('Runtime.callFunctionOn', {
      objectId: sockets.objects.objectId,
      functionDeclaration:
        'function(operation) { for (const socket of this) if (socket.readyState === WebSocket.OPEN && new URL(socket.url).pathname === "/ws") { if (operation === "close") socket.close(); else socket.send(JSON.stringify({ type: "ping" })); } }',
      arguments: [{ value: operation }],
    });
  } finally {
    await cdp.detach();
  }
}

test('A completion refreshes admitted B and C through their own real trees and reconnect replay', async ({
  browser,
  request,
}, testInfo) => {
  const identities = await request.get('http://localhost:7500/__fixture/identities');
  expect(identities.ok()).toBe(true);
  const fixture = (await identities.json()) as {
    projects: Record<string, Identity | undefined>;
    token: string;
    foreignToken: string;
  };
  const contexts: BrowserContext[] = [];
  const open = async (name: string) => {
    const project = fixture.projects[name];
    if (project === undefined) throw new Error(`missing ${name}`);
    const context = await browser.newContext();
    contexts.push(context);
    await authenticate(context, name === 'Foreign' ? fixture.foreignToken : fixture.token);
    const page = await context.newPage();
    const observed = observe(page);
    await page.goto(`http://localhost:7600/e2e/cross-project-refresh.html?project=${project.id}`);
    await expect(page.getByLabel('Name of 010')).toHaveValue(`${name} row`);
    await expect
      .poll(() =>
        observed.frames.some(
          (frame) =>
            frame.type === 'resume_ack' &&
            typeof frame.replayed?.[`project:${project.id}`] === 'number',
        ),
      )
      .toBe(true);
    return { page, context, project, ...observed };
  };
  try {
    const b = await open('B');
    const c = await open('C');
    const unrelated = await open('Unrelated');
    const foreign = await open('Foreign');
    const corner = (page: Page) => page.locator('[data-node-reading]').first();
    for (const client of [b, c])
      await expect(corner(client.page)).toHaveAttribute('data-node-reading', 'unknown');
    const initialReads = new Map(
      [b, c, unrelated, foreign].map((client) => [client, client.reads.length]),
    );
    let release!: () => void;
    let captured!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holding = new Promise<void>((resolve) => {
      captured = resolve;
    });
    await b.page.route(`**/api/projects/${b.project.id}/work-items`, async (route) => {
      const response = await route.fetch();
      captured();
      await released;
      await route.fulfill({ response });
    });
    const committed = await request.post('http://localhost:7500/__fixture/complete');
    expect(committed.status()).toBe(200);
    await holding;
    for (const client of [b, c])
      await expect
        .poll(
          () =>
            client.frames.filter(
              (frame) =>
                frame.subscription === `project:${client.project.id}` &&
                frame.message?.type === 'elsewhere_changed',
            ).length,
        )
        .toBe(1);
    await expect(corner(b.page)).toHaveAttribute('data-node-reading', 'unknown');
    await expect.poll(() => c.reads.length).toBe((initialReads.get(c) ?? -1) + 1);
    await expect(c.page.locator('body')).toHaveAttribute(
      'data-installed-seq',
      String(c.reads.at(-1)?.seq),
    );
    await expect(corner(c.page)).toHaveAttribute('data-node-reading', 'unknown');
    expect(c.reads.at(-1)?.workItems[0]?.nodeReadings[c.project.step]).toBe('unknown');
    release();
    await expect(corner(b.page)).toHaveAttribute('data-node-reading', 'waiting');
    await expect.poll(() => b.reads.length).toBe((initialReads.get(b) ?? -1) + 1);
    await expect(b.page.locator('body')).toHaveAttribute(
      'data-installed-seq',
      String(b.reads.at(-1)?.seq),
    );
    expect(b.reads.at(-1)?.workItems[0]?.nodeReadings[b.project.step]).toBe('waiting');
    await b.page.unroute(`**/api/projects/${b.project.id}/work-items`);
    // The command awaits push delivery; a pong orders frames on each observer's own socket.
    for (const client of [unrelated, foreign]) {
      const pongs = client.frames.filter((frame) => frame.type === 'pong').length;
      await operateSocket(client.page, 'ping');
      await expect
        .poll(() => client.frames.filter((frame) => frame.type === 'pong').length)
        .toBe(pongs + 1);
      expect(client.frames.filter((frame) => frame.subscription !== undefined)).toEqual([]);
      expect(client.reads.length).toBe(initialReads.get(client));
    }
    await b.page.screenshot({ path: testInfo.outputPath('B-installed-waiting.png') });
    await b.context.setOffline(true);
    // Chromium's offline emulation does not close established websockets. Close the real
    // native socket through DevTools; no transport or refresh callback is replaced.
    await operateSocket(b.page, 'close');
    await expect(
      b.page.getByRole('status').filter({ hasText: /connection|offline|reconnect/i }),
    ).toBeVisible();
    const reset = await request.post('http://localhost:7500/__fixture/reset');
    expect(reset.status()).toBe(200);
    await expect(corner(b.page)).toHaveAttribute('data-node-reading', 'waiting');
    await b.context.setOffline(false);
    await expect(corner(b.page)).toHaveAttribute('data-node-reading', 'unknown');
    expect(b.reads.at(-1)?.workItems[0]?.nodeReadings[b.project.step]).toBe('unknown');
    expect(b.frames.filter((frame) => frame.message?.type === 'elsewhere_changed')).toHaveLength(2);
    await b.page.route(`**/api/projects/${b.project.id}/work-items`, async (route) => {
      await route.fulfill({ status: 503, body: 'injected refresh outage' });
    });
    expect((await request.post('http://localhost:7500/__fixture/complete')).status()).toBe(200);
    await expect(b.page.locator('[data-stale-tree]')).toBeVisible();
    await expect(corner(b.page)).toHaveAttribute('data-node-reading', 'unknown');
    await b.page.unroute(`**/api/projects/${b.project.id}/work-items`);
    await b.page
      .locator('[data-stale-tree]')
      .getByRole('button', { name: 'Retry', exact: true })
      .click();
    await expect(corner(b.page)).toHaveAttribute('data-node-reading', 'waiting');
    await expect(b.page.locator('[data-stale-tree]')).toHaveCount(0);
    await testInfo.attach('installed-wire-evidence', {
      body: JSON.stringify(
        {
          B: { frames: b.frames, reads: b.reads },
          C: { frames: c.frames, reads: c.reads },
          unrelated: unrelated.frames,
          foreign: foreign.frames,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

for (const phone of [false, true]) {
  test(`${phone ? 'phone whole to node' : 'desktop node to whole'} predecessor scope survives accepted HTTP save and SQLite reload`, async ({
    browser,
    request,
  }, testInfo) => {
    const identities = await request.get('http://localhost:7500/__fixture/identities');
    expect(identities.status()).toBe(200);
    const fixture = (await identities.json()) as {
      projects: Record<string, Identity | undefined>;
      token: string;
    };
    const name = phone ? 'Phone' : 'Desktop';
    const owner = fixture.projects[name];
    const remote = fixture.projects['A'];
    if (owner === undefined || remote === undefined) throw new Error('missing scope fixture');
    const relationshipId = `A-${name}`;
    const context = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    });
    try {
      await authenticate(context, fixture.token);
      const page = await context.newPage();
      const observed = observe(page);
      const address = `http://localhost:7600/e2e/cross-project-refresh.html?project=${owner.id}&organization=org-a`;
      await page.goto(address);
      await expect(page.getByLabel('Name of 010')).toHaveValue(`${name} row`);
      const open = async () => {
        if (phone) {
          await page.getByRole('button', { name: 'Depends on for 010', exact: true }).click();
          await page.getByRole('button', { name: /^Edit AXX\./ }).click();
        } else {
          const picker = page.getByLabel('Add a dependency to 010');
          await picker.click();
          await picker.press('Home');
          await page.keyboard.press('Enter');
        }
        return page.getByRole('dialog', { name: 'Captured dependency' });
      };
      const details = await open();
      await details.getByRole('button', { name: 'Edit predecessor scope' }).click();
      const selector = details.getByLabel('Predecessor scope');
      const scope = phone ? 'node' : 'whole';
      const chosen = JSON.stringify([remote.id, remote.row, scope, phone ? remote.step : null]);
      await expect(selector.locator(`option[value='${chosen}']`)).toHaveCount(1);
      await selector.selectOption(chosen);
      const commands = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/projects/${owner.id}/commands` &&
          response.request().method() === 'POST',
      );
      const beforeReads = observed.reads.length;
      await details.getByRole('button', { name: 'Save', exact: true }).click();
      const response = await commands;
      expect(response.status(), await response.text()).toBe(200);
      const accepted: unknown = await response.json();
      expect(accepted).toEqual({ results: [{ index: 0 }], undoable: true, redoable: false });
      await expect(page.getByRole('dialog', { name: 'Captured dependency' })).toHaveCount(0);
      await expect.poll(() => observed.reads.length).toBeGreaterThan(beforeReads);
      await expect(page.locator('body')).toHaveAttribute(
        'data-installed-seq',
        String(observed.reads.at(-1)?.seq),
      );
      await page.reload();
      await expect(page.getByLabel('Name of 010')).toHaveValue(`${name} row`);
      const reopened = await open();
      await reopened.getByRole('button', { name: 'Edit predecessor scope' }).click();
      // Proof: independently forcing desktop/phone serialization to the old predecessor
      // makes this post-reload selected-coordinate assertion fail (see bounded verify receipt).
      await expect(reopened.getByLabel('Predecessor scope')).toHaveValue(chosen);
      const persisted = await request.get('http://localhost:7500/__fixture/relationships');
      expect(persisted.status()).toBe(200);
      const rows = (await persisted.json()) as { id: string }[];
      expect(rows.filter((row) => row.id === relationshipId)).toEqual([
        {
          id: relationshipId,
          organization_id: 'org-a',
          predecessor_project_id: remote.id,
          predecessor_work_item_id: remote.row,
          predecessor_scope: scope,
          predecessor_step_id: phone ? remote.step : null,
          successor_project_id: owner.id,
          successor_work_item_id: owner.row,
          successor_scope: 'node',
          successor_step_id: owner.step,
          type: 'FS',
        },
      ]);
      const command: unknown = response.request().postDataJSON();
      expect(command).toEqual({
        commands: [
          {
            kind: 'updateTypedDependency',
            dependencyId: relationshipId,
            predecessor: {
              projectId: remote.id,
              workItemId: remote.row,
              scope,
              ...(phone ? { stepId: remote.step } : {}),
            },
            successor: { scope: 'node', stepNodeId: `sn1.${owner.row}.${owner.step}` },
            type: 'FS',
          },
        ],
      });
      await testInfo.attach('accepted-scope-persistence', {
        body: JSON.stringify({ command, accepted, rows, reads: observed.reads }, null, 2),
        contentType: 'application/json',
      });
    } finally {
      await context.close();
    }
  });
}

for (const phone of [false, true]) {
  test(`${phone ? 'phone whole to node' : 'desktop node to whole'} successor scope survives accepted HTTP save and SQLite reload`, async ({
    browser,
    request,
  }, testInfo) => {
    const identities = await request.get('http://localhost:7500/__fixture/identities');
    expect(identities.status()).toBe(200);
    const fixture = (await identities.json()) as {
      projects: Record<string, Identity | undefined>;
      token: string;
    };
    const name = phone ? 'SuccessorPhone' : 'SuccessorDesktop';
    const owner = fixture.projects[name];
    const remote = fixture.projects['A'];
    if (owner === undefined || remote === undefined) throw new Error('missing scope fixture');
    const relationshipId = `A-${name}`;
    const context = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    });
    try {
      await authenticate(context, fixture.token);
      const page = await context.newPage();
      const observed = observe(page);
      const address = `http://localhost:7600/e2e/cross-project-refresh.html?project=${owner.id}&organization=org-a`;
      await page.goto(address);
      await expect(page.getByLabel('Name of 010')).toHaveValue(`${name} row`);
      const open = async () => {
        if (phone) {
          await page.getByRole('button', { name: 'Depends on for 010', exact: true }).click();
          await page.getByRole('button', { name: /^Edit AXX\./ }).click();
        } else {
          const picker = page.getByLabel('Add a dependency to 010');
          await picker.click();
          await picker.press('Home');
          await page.keyboard.press('Enter');
        }
        return page.getByRole('dialog', { name: 'Captured dependency' });
      };
      const details = await open();
      const selector = details.getByLabel('This work item');
      await expect(selector).toHaveValue(
        JSON.stringify([owner.id, owner.row, phone ? 'whole' : 'node', phone ? null : owner.step]),
      );
      const scope = phone ? 'node' : 'whole';
      const chosen = JSON.stringify([owner.id, owner.row, scope, phone ? owner.step : null]);
      await expect(selector.locator(`option[value='${chosen}']`)).toHaveCount(1);
      await selector.selectOption(chosen);
      const commands = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/projects/${owner.id}/commands` &&
          response.request().method() === 'POST',
      );
      const beforeReads = observed.reads.length;
      await details.getByRole('button', { name: 'Save', exact: true }).click();
      const response = await commands;
      expect(response.url()).toBe(`http://localhost:7600/api/projects/${owner.id}/commands`);
      expect(response.status(), await response.text()).toBe(200);
      const accepted: unknown = await response.json();
      expect(accepted).toEqual({ results: [{ index: 0 }], undoable: true, redoable: false });
      await expect(page.getByRole('dialog', { name: 'Captured dependency' })).toHaveCount(0);
      await expect.poll(() => observed.reads.length).toBeGreaterThan(beforeReads);
      await expect(page.locator('body')).toHaveAttribute(
        'data-installed-seq',
        String(observed.reads.at(-1)?.seq),
      );
      await page.reload();
      await expect(page.getByLabel('Name of 010')).toHaveValue(`${name} row`);
      const reopened = await open();
      // Proof: independently forcing desktop/phone serialization to the persisted successor
      // makes this post-reload selected-coordinate assertion fail (see bounded verify receipt).
      await expect(reopened.getByLabel('This work item')).toHaveValue(chosen);
      const persisted = await request.get('http://localhost:7500/__fixture/relationships');
      expect(persisted.status()).toBe(200);
      const rows = (await persisted.json()) as { id: string }[];
      expect(rows.filter((row) => row.id === relationshipId)).toEqual([
        {
          id: relationshipId,
          organization_id: 'org-a',
          predecessor_project_id: remote.id,
          predecessor_work_item_id: remote.row,
          predecessor_scope: 'node',
          predecessor_step_id: remote.step,
          successor_project_id: owner.id,
          successor_work_item_id: owner.row,
          successor_scope: scope,
          successor_step_id: phone ? owner.step : null,
          type: 'FS',
        },
      ]);
      const command: unknown = response.request().postDataJSON();
      expect(command).toEqual({
        commands: [
          {
            kind: 'updateTypedDependency',
            dependencyId: relationshipId,
            predecessor: {
              projectId: remote.id,
              workItemId: remote.row,
              scope: 'node',
              stepId: remote.step,
            },
            successor: phone
              ? { scope: 'node', stepNodeId: `sn1.${owner.row}.${owner.step}` }
              : { scope: 'whole', workItemId: owner.row },
            type: 'FS',
          },
        ],
      });
      await testInfo.attach('accepted-scope-persistence', {
        body: JSON.stringify({ command, accepted, rows, reads: observed.reads }, null, 2),
        contentType: 'application/json',
      });
    } finally {
      await context.close();
    }
  });
}

test('successor-only dated trees install the upstream estimate revision', async ({
  browser,
  request,
}, testInfo) => {
  const identities = await request.get('http://localhost:7500/__fixture/identities');
  expect(identities.status()).toBe(200);
  const fixture = (await identities.json()) as {
    projects: Record<string, Identity | undefined>;
    token: string;
  };
  const upstream = fixture.projects['DatedA'];
  if (upstream === undefined) throw new Error('missing dated upstream');
  const relationships: unknown = await (
    await request.get('http://localhost:7500/__fixture/relationships')
  ).json();
  const contexts: BrowserContext[] = [];
  const clients = [];
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    for (const name of ['DatedB', 'DatedC']) {
      const project = fixture.projects[name];
      if (project === undefined) throw new Error('missing dated successor');
      const context = await browser.newContext();
      contexts.push(context);
      await authenticate(context, fixture.token);
      const page = await context.newPage();
      const observed = observe(page);
      await page.goto(`http://localhost:7600/e2e/cross-project-refresh.html?project=${project.id}`);
      await expect(page.getByLabel('Name of 010')).toHaveValue(`${name} row`);
      await expect
        .poll(() =>
          observed.frames.some(
            (frame) =>
              frame.type === 'resume_ack' &&
              typeof frame.replayed?.[`project:${project.id}`] === 'number',
          ),
        )
        .toBe(true);
      clients.push({ page, project, ...observed });
    }
    const expected = [
      ['8 Sep', '8 Sep', '10 Sep', '10 Sep'],
      ['9 Sep', '9 Sep', '11 Sep', '11 Sep'],
    ];
    for (const [index, client] of clients.entries()) {
      await expect(client.page.locator('[data-start]').first()).toHaveText(expected[index][0]);
      await expect(client.page.locator('[data-finish]').first()).toHaveText(expected[index][1]);
    }
    let captured = false;
    const first = clients[0];
    await first.page.route(`**/api/projects/${first.project.id}/work-items`, async (route) => {
      const response = await route.fetch();
      captured = true;
      await released;
      await route.fulfill({ response });
    });
    const initial = clients.map((client) => {
      const baseline = client.reads.at(-1);
      if (baseline === undefined) throw new Error('missing dated baseline read');
      return { reads: client.reads.length, seq: baseline.seq };
    });
    const committed = await request.post(
      `http://localhost:7500/api/projects/${upstream.id}/commands`,
      {
        headers: {
          Authorization: `Bearer ${fixture.token}`,
          'X-WBS-Expected-Organization': 'org-a',
        },
        data: {
          commands: [
            {
              kind: 'setEstimate',
              workItemId: upstream.row,
              stepId: upstream.step,
              days: { optimistic: 3, realistic: 3, pessimistic: 3 },
            },
          ],
        },
      },
    );
    expect(committed.status(), await committed.text()).toBe(200);
    // Proof: constant dependency scheduling hash and suppressed live owner.invalidate
    // independently left captured false in this browser case (closure receipt).
    await expect.poll(() => captured).toBe(true);
    await expect(first.page.locator('[data-start]').first()).toHaveText('8 Sep');
    await expect(first.page.locator('[data-finish]').first()).toHaveText('8 Sep');
    await expect(first.page.locator('body')).toHaveAttribute(
      'data-installed-seq',
      String(initial[0]?.seq),
    );
    const second = clients[1];
    // Proof: retaining the initial delivered tree showed 9 Sep instead of 11 Sep.
    await expect(second.page.locator('[data-start]').first()).toHaveText('11 Sep');
    await expect(second.page.locator('[data-finish]').first()).toHaveText('11 Sep');
    release();
    for (const [index, client] of clients.entries()) {
      await expect(client.page.locator('[data-start]').first()).toHaveText(expected[index][2]);
      await expect(client.page.locator('[data-finish]').first()).toHaveText(expected[index][3]);
      await expect.poll(() => client.reads.length).toBe(initial[index].reads + 1);
      expect(client.reads.at(-1)?.seq).toBeGreaterThan(initial[index].seq);
      await expect(client.page.locator('body')).toHaveAttribute(
        'data-installed-seq',
        String(client.reads.at(-1)?.seq),
      );
      expect(
        client.frames.filter((frame) => frame.message?.type === 'elsewhere_changed'),
      ).toHaveLength(1);
    }
    expect(
      await (await request.get('http://localhost:7500/__fixture/relationships')).json(),
    ).toEqual(relationships);
    await testInfo.attach('dated-successor-wire', {
      body: JSON.stringify(
        clients.map(({ project, frames, reads }) => ({ project, frames, reads })),
      ),
      contentType: 'application/json',
    });
  } finally {
    release();
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('alphabetical discovery creates a qualified dependency that persists and refreshes on completion', async ({
  browser,
  request,
}, testInfo) => {
  const identities = await request.get('http://localhost:7500/__fixture/identities');
  expect(identities.status()).toBe(200);
  const fixture = (await identities.json()) as {
    projects: Record<string, Identity | undefined>;
    token: string;
  };
  const owner = fixture.projects['Author'];
  const remote = fixture.projects['A'];
  if (owner === undefined || remote === undefined) throw new Error('missing authoring fixture');
  expect((await request.post('http://localhost:7500/__fixture/reset')).status()).toBe(200);
  const relationships = async () => {
    const response = await request.get('http://localhost:7500/__fixture/relationships');
    expect(response.status()).toBe(200);
    return (await response.json()) as { id: string; successor_project_id: string }[];
  };
  expect((await relationships()).filter((row) => row.successor_project_id === owner.id)).toEqual(
    [],
  );
  const context = await browser.newContext();
  try {
    await authenticate(context, fixture.token);
    const page = await context.newPage();
    const observed = observe(page);
    await page.goto(
      `http://localhost:7600/e2e/cross-project-refresh.html?project=${owner.id}&organization=org-a`,
    );
    await expect(page.getByLabel('Name of 010')).toHaveValue('Author row');
    const picker = page.getByLabel('Add a dependency to 010');
    await picker.fill('axx');
    // Proof: suppressing alphabetic discovery made this real picker assertion fail (Task11 receipt).
    await expect(page.getByRole('option', { name: 'Project AXX - A', exact: true })).toBeVisible();
    await page.getByRole('option', { name: 'Project AXX - A', exact: true }).click();
    await expect(picker).toHaveValue('AXX.');
    const commands = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/projects/${owner.id}/commands` &&
        response.request().method() === 'POST',
    );
    await page.getByRole('option', { name: 'AXX.010 - A row', exact: true }).click();
    const response = await commands;
    expect(response.status()).toBe(200);
    const rows = (await relationships()).filter((row) => row.successor_project_id === owner.id);
    // Proof: reversing persisted endpoints and successor ownership left this owner's SQLite set empty.
    expect(rows).toHaveLength(1);
    expect(rows).toEqual([
      {
        id: expect.any(String),
        organization_id: 'org-a',
        predecessor_project_id: remote.id,
        predecessor_work_item_id: remote.row,
        predecessor_scope: 'whole',
        predecessor_step_id: null,
        successor_project_id: owner.id,
        successor_work_item_id: owner.row,
        successor_scope: 'whole',
        successor_step_id: null,
        type: 'FS',
      },
    ]);
    const accepted: unknown = await response.json();
    expect(accepted).toEqual({
      results: [{ index: 0, id: rows[0]?.id }],
      undoable: true,
      redoable: false,
    });
    const admissions = () =>
      observed.frames.filter(
        (frame) =>
          frame.type === 'resume_ack' &&
          typeof frame.replayed?.[`project:${owner.id}`] === 'number',
      ).length;
    const beforeReload = admissions();
    await page.reload();
    await expect(page.getByLabel('Name of 010')).toHaveValue('Author row');
    await picker.click();
    await picker.press('Home');
    await page.keyboard.press('Enter');
    const details = page.getByRole('dialog', { name: 'Captured dependency' });
    await expect(details).toBeVisible();
    await expect(details).toContainText('AXX.010');
    await details.getByRole('button', { name: 'Back to dependency picker', exact: true }).click();
    await expect(page.locator('[data-node-reading]').first()).toHaveAttribute(
      'data-node-reading',
      'unknown',
    );
    await expect.poll(admissions).toBeGreaterThan(beforeReload);
    const pongs = observed.frames.filter((frame) => frame.type === 'pong').length;
    await operateSocket(page, 'ping');
    await expect
      .poll(() => observed.frames.filter((frame) => frame.type === 'pong').length)
      .toBe(pongs + 1);
    const notifications = () =>
      observed.frames.filter((frame) => frame.message?.type === 'elsewhere_changed').length;
    const beforeNotifications = notifications();
    const before = observed.reads.length;
    expect((await request.post('http://localhost:7500/__fixture/complete')).status()).toBe(200);
    await expect(page.locator('[data-node-reading]').first()).toHaveAttribute(
      'data-node-reading',
      'waiting',
    );
    await expect.poll(() => observed.reads.length).toBeGreaterThan(before);
    await expect(page.locator('body')).toHaveAttribute(
      'data-installed-seq',
      String(observed.reads.at(-1)?.seq),
    );
    expect(notifications()).toBe(beforeNotifications + 1);
    expect(await relationships()).toEqual(expect.arrayContaining(rows));
    await testInfo.attach('created-qualified-dependency', {
      body: JSON.stringify({ rows, accepted, reads: observed.reads, frames: observed.frames }),
      contentType: 'application/json',
    });
  } finally {
    await context.close();
  }
});

test('abbreviation edit preserves a captured predecessor link and focuses its stable destination', async ({
  browser,
  request,
}, testInfo) => {
  const identities = await request.get('http://localhost:7500/__fixture/identities');
  expect(identities.status()).toBe(200);
  const fixture = (await identities.json()) as {
    projects: Record<string, Identity | undefined>;
    token: string;
  };
  const source = fixture.projects['RenameSource'];
  const target = fixture.projects['RenameTarget'];
  if (source === undefined || target === undefined) throw new Error('missing rename fixture');
  const relationships = async () => {
    const response = await request.get('http://localhost:7500/__fixture/relationships');
    expect(response.status()).toBe(200);
    return (await response.json()) as { id: string }[];
  };
  const before = (await relationships()).filter((row) => row.id === 'RenameSource-RenameTarget');
  expect(before).toEqual([
    {
      id: 'RenameSource-RenameTarget',
      organization_id: 'org-a',
      predecessor_project_id: source.id,
      predecessor_work_item_id: source.row,
      predecessor_scope: 'whole',
      predecessor_step_id: null,
      successor_project_id: target.id,
      successor_work_item_id: target.row,
      successor_scope: 'node',
      successor_step_id: target.step,
      type: 'FS',
    },
  ]);
  const context = await browser.newContext();
  try {
    await authenticate(context, fixture.token);
    // This document-only host substitution preserves the real anchor navigation URL.
    // Production root auth/onboarding composition is outside this dedicated fixture.
    await context.route('http://localhost:7600/?**', async (route) => {
      if (route.request().resourceType() !== 'document')
        throw new Error('unexpected root resource');
      const response = await route.fetch({
        url: 'http://localhost:7600/e2e/cross-project-refresh.html',
      });
      await route.fulfill({ response });
    });
    const targetPage = await context.newPage();
    const address = (projectId: string) =>
      `http://localhost:7600/e2e/cross-project-refresh.html?project=${projectId}&organization=org-a`;
    await targetPage.goto(address(target.id));
    await expect(targetPage.getByLabel('Name of 010')).toHaveValue('RenameTarget row');
    const open = async () => {
      const picker = targetPage.getByLabel('Add a dependency to 010');
      await picker.click();
      await picker.press('Home');
      await targetPage.keyboard.press('Enter');
      return targetPage.getByRole('dialog', { name: 'Captured dependency' });
    };
    const initial = await open();
    const predecessor = initial.getByRole('link', { name: /^Open NAV_OLD\.010/ });
    const href = await predecessor.getAttribute('href');
    if (href === null) throw new Error('missing captured predecessor href');
    // Proof: substituting abbreviation for projectId yielded NAV_OLD in this real href.
    expect(href).toBe(`/?${new URLSearchParams({ project: source.id, workItem: source.row })}`);
    await initial.getByRole('button', { name: 'Back to dependency picker', exact: true }).click();
    const sourcePage = await context.newPage();
    await sourcePage.goto(address(source.id));
    await expect(sourcePage.getByLabel('Name of 010')).toHaveValue('RenameSource row');
    await sourcePage.getByRole('button', { name: 'Project settings', exact: true }).click();
    const settings = sourcePage.getByRole('dialog', { name: 'Project settings', exact: true });
    await settings.getByRole('tab', { name: 'General', exact: true }).click();
    const abbreviation = settings.getByLabel('Project abbreviation', { exact: true });
    await expect(abbreviation).toHaveValue('NAV_OLD');
    const patch = sourcePage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/projects/${source.id}` &&
        response.request().method() === 'PATCH',
    );
    await abbreviation.fill('nav_new2');
    await abbreviation.press('Enter');
    const response = await patch;
    expect(response.status(), await response.text()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ abbreviation: 'nav_new2' });
    const accepted: unknown = await response.json();
    // Proof: omitting SQLite abbreviation persistence returned NAV_OLD here (Task11 receipt).
    expect(accepted).toEqual({
      project: expect.objectContaining({ id: source.id, abbreviation: 'NAV_NEW2' }),
    });
    await expect(abbreviation).toHaveValue('NAV_NEW2');
    await sourcePage.reload();
    await expect(sourcePage.getByLabel('Name of 010')).toHaveValue('RenameSource row');
    await sourcePage.getByRole('button', { name: 'Project settings', exact: true }).click();
    await sourcePage.getByRole('tab', { name: 'General', exact: true }).click();
    await expect(sourcePage.getByLabel('Project abbreviation', { exact: true })).toHaveValue(
      'NAV_NEW2',
    );
    await targetPage.reload();
    await expect(targetPage.getByLabel('Name of 010')).toHaveValue('RenameTarget row');
    const reopened = await open();
    const renamed = reopened.getByRole('link', { name: /^Open NAV_NEW2\.010/ });
    // The renamed label retains the exact anchor captured before editing.
    await expect(renamed).toHaveAttribute('href', href);
    expect((await relationships()).filter((row) => row.id === 'RenameSource-RenameTarget')).toEqual(
      before,
    );
    const landing = targetPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/projects/${source.id}/work-items` &&
        response.request().method() === 'GET',
    );
    const navigation = targetPage.waitForRequest(
      (request) =>
        request.isNavigationRequest() && request.url() === `http://localhost:7600${href}`,
    );
    await renamed.click();
    expect((await navigation).url()).toBe(`http://localhost:7600${href}`);
    const tree = await landing;
    expect(tree.status(), await tree.text()).toBe(200);
    await expect(targetPage.getByLabel('Name of 010')).toHaveValue('RenameSource row');
    // Proof: omitting the work-item branch left Name of 010 unfocused (Task11 receipt).
    await expect(targetPage.getByLabel('Name of 010')).toBeFocused();
    const installed: unknown = await tree.json();
    await testInfo.attach('abbreviation-stable-navigation', {
      body: JSON.stringify({
        source,
        target,
        href,
        accepted,
        relationships: before,
        tree: installed,
      }),
      contentType: 'application/json',
    });
  } finally {
    await context.close();
  }
});

test('phone alphabetical discovery creates a remote node dependency through HTTP and SQLite reload', async ({
  browser,
  request,
}, testInfo) => {
  const identities = await request.get('http://localhost:7500/__fixture/identities');
  expect(identities.status()).toBe(200);
  const fixture = (await identities.json()) as {
    projects: Record<string, Identity | undefined>;
    token: string;
  };
  const owner = fixture.projects['AuthorPhone'];
  const remote = fixture.projects['A'];
  if (owner === undefined || remote === undefined) throw new Error('missing authoring fixture');
  expect((await request.post('http://localhost:7500/__fixture/reset')).status()).toBe(200);
  const relationships = async () => {
    const response = await request.get('http://localhost:7500/__fixture/relationships');
    expect(response.status()).toBe(200);
    return (await response.json()) as { id: string; successor_project_id: string }[];
  };
  expect((await relationships()).filter((row) => row.successor_project_id === owner.id)).toEqual(
    [],
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    await authenticate(context, fixture.token);
    const page = await context.newPage();
    const observed = observe(page);
    await page.goto(
      `http://localhost:7600/e2e/cross-project-refresh.html?project=${owner.id}&organization=org-a`,
    );
    await expect(page.getByLabel('Name of 010')).toHaveValue('AuthorPhone row');
    await page.getByRole('button', { name: 'Add details to 010', exact: true }).click();
    await page.getByRole('button', { name: 'Depends on for 010', exact: true }).click();
    const picker = page.getByLabel('Add a dependency to 010');
    await picker.fill('axx');
    // Proof: suppressing production alphabetic discovery hid this phone project button (phone receipt).
    await expect(page.getByRole('button', { name: 'Project AXX - A', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Project AXX - A', exact: true }).click();
    await expect(picker).toHaveValue('AXX.');
    const commands = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/projects/${owner.id}/commands` &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^AXX\.010\.s1/, exact: true }).click();
    const response = await commands;
    expect(response.status()).toBe(200);
    const rows = (await relationships()).filter((row) => row.successor_project_id === owner.id);
    // Proof: reversing persisted endpoints and ownership left this phone owner's SQLite set empty.
    expect(rows).toHaveLength(1);
    // Proof: widening the stored remote node to whole failed this exact SQLite step/scope tuple.
    expect(rows).toEqual([
      {
        id: expect.any(String),
        organization_id: 'org-a',
        predecessor_project_id: remote.id,
        predecessor_work_item_id: remote.row,
        predecessor_scope: 'node',
        predecessor_step_id: remote.step,
        successor_project_id: owner.id,
        successor_work_item_id: owner.row,
        successor_scope: 'whole',
        successor_step_id: null,
        type: 'FS',
      },
    ]);
    const command: unknown = response.request().postDataJSON();
    expect(response.url()).toBe(`http://localhost:7600/api/projects/${owner.id}/commands`);
    expect(command).toEqual({
      commands: [
        {
          kind: 'addTypedDependency',
          predecessor: {
            projectId: remote.id,
            workItemId: remote.row,
            scope: 'node',
            stepId: remote.step,
          },
          successor: { scope: 'whole', workItemId: owner.row },
          type: 'FS',
        },
      ],
    });
    const accepted: unknown = await response.json();
    expect(accepted).toEqual({
      results: [{ index: 0, id: rows[0]?.id }],
      undoable: true,
      redoable: false,
    });
    const admissions = () =>
      observed.frames.filter(
        (frame) =>
          frame.type === 'resume_ack' &&
          typeof frame.replayed?.[`project:${owner.id}`] === 'number',
      ).length;
    const beforeReload = admissions();
    await page.reload();
    await expect(page.getByLabel('Name of 010')).toHaveValue('AuthorPhone row');
    await page.getByRole('button', { name: 'Depends on for 010', exact: true }).click();
    await page.getByRole('button', { name: /^Edit AXX\.010\.s1/ }).click();
    const details = page.getByRole('dialog', { name: 'Captured dependency' });
    await expect(details).toBeVisible();
    await expect(details).toContainText('AXX.010.s1');
    await details.getByRole('button', { name: 'Edit predecessor scope' }).click();
    await expect(details.getByLabel('Predecessor scope')).toHaveValue(
      JSON.stringify([remote.id, remote.row, 'node', remote.step]),
    );
    await expect(details.getByLabel('This work item')).toHaveValue(
      JSON.stringify([owner.id, owner.row, 'whole', null]),
    );
    await details.getByRole('button', { name: 'Back to dependency picker', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Reading: Unknown', { exact: true })).toBeVisible();
    await expect.poll(admissions).toBeGreaterThan(beforeReload);
    const pongs = observed.frames.filter((frame) => frame.type === 'pong').length;
    await operateSocket(page, 'ping');
    await expect
      .poll(() => observed.frames.filter((frame) => frame.type === 'pong').length)
      .toBe(pongs + 1);
    const notifications = () =>
      observed.frames.filter((frame) => frame.message?.type === 'elsewhere_changed').length;
    const beforeNotifications = notifications();
    const before = observed.reads.length;
    expect((await request.post('http://localhost:7500/__fixture/complete')).status()).toBe(200);
    await expect(page.getByText('Reading: Waiting', { exact: true })).toBeVisible();
    await expect.poll(() => observed.reads.length).toBeGreaterThan(before);
    await expect(page.locator('body')).toHaveAttribute(
      'data-installed-seq',
      String(observed.reads.at(-1)?.seq),
    );
    expect(notifications()).toBe(beforeNotifications + 1);
    expect(await relationships()).toEqual(expect.arrayContaining(rows));
    await testInfo.attach('created-qualified-dependency', {
      body: JSON.stringify({
        rows,
        command,
        accepted,
        reads: observed.reads,
        frames: observed.frames,
      }),
      contentType: 'application/json',
    });
  } finally {
    await context.close();
  }
});
