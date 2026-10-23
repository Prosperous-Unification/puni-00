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
