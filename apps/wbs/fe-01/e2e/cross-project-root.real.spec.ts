import {
  type BrowserContext,
  expect,
  type Page,
  type Response,
  type Route,
  test,
} from '@playwright/test';

const evidenceByPage = new WeakMap<Page, { path: string; status?: number; failure?: string }[]>();
test.beforeEach(({ page }) => {
  const evidence: { path: string; status?: number; failure?: string }[] = [];
  evidenceByPage.set(page, evidence);
  page.on('response', (response) => {
    const address = new URL(response.url());
    if (address.pathname.startsWith('/api/') || response.request().resourceType() === 'document')
      evidence.push({ path: address.pathname, status: response.status() });
  });
  page.on('pageerror', (failure) => evidence.push({ path: 'browser', failure: failure.message }));
});
test.afterEach(async ({ page }, testInfo) => {
  const evidence = evidenceByPage.get(page);
  if (evidence === undefined) throw new Error('Missing browser request evidence');
  await testInfo.attach('normal-root-request-evidence', {
    body: JSON.stringify(evidence),
    contentType: 'application/json',
  });
});

interface Identity {
  id: string;
  row: string;
  step: string;
}

/** Real password login and the same HttpOnly cookie installation as the organization suite. */
async function authenticate(context: BrowserContext) {
  const login = await context.request.post('/api/auth/login', {
    headers: { origin: 'http://localhost:7600' },
    data: { username: 'ada', password: 'correct-horse' },
  });
  expect(login.status()).toBe(200);
  const credential: unknown = await login.json();
  if (
    typeof credential !== 'object' ||
    credential === null ||
    !('token' in credential) ||
    typeof credential.token !== 'string'
  )
    throw new Error('Fixture login omitted its token');
  const identities = await context.request.get('http://localhost:7500/__fixture/identities');
  expect(identities.status()).toBe(200);
  const seeds = (await identities.json()) as { token: string; foreignToken: string };
  expect(credential.token === seeds.token || credential.token === seeds.foreignToken).toBe(false);
  await context.addCookies([
    {
      name: '__Host-wbs_access',
      value: credential.token,
      domain: 'localhost',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

test('fixture forwarding preserves ordinary and ambiguous credential presentations', async ({
  context,
  request,
}) => {
  const identities = await request.get('http://localhost:7500/__fixture/identities');
  expect(identities.status()).toBe(200);
  const seeds = (await identities.json()) as { token: string; foreignToken: string };
  await authenticate(context);
  const fresh = await context.request.get('/api/organization/active');
  expect(fresh.status()).toBe(403);
  expect(await fresh.json()).toEqual({ error: 'no_active_organization' });
  const seedPresentations: Record<string, string>[] = [
    { authorization: `Bearer ${seeds.token}` },
    { cookie: `__Host-wbs_access=${seeds.token}` },
  ];
  for (const headers of seedPresentations) {
    const selected = await request.get('http://localhost:7500/api/organization/active', {
      headers,
    });
    expect(selected.status()).toBe(200);
    expect(await selected.json()).toEqual(expect.objectContaining({ organizationId: 'org-a' }));
  }
  const presentations: Record<string, string>[] = [
    { authorization: `Bearer ${seeds.token}`, cookie: `__Host-wbs_access=${seeds.token}` },
    { authorization: `Basic ${seeds.token}` },
    { authorization: seeds.token },
    { authorization: `Bearer ${seeds.token}`, cookie: `__Host-wbs_access=${seeds.foreignToken}` },
    { cookie: `__Host-wbs_access=${seeds.token}; __Host-wbs_access=${seeds.token}` },
    { cookie: `__Host-wbs_access =${seeds.token}` },
    { authorization: `Bearer ${seeds.token}`, cookie: '__Host-wbs_organization=' },
    { authorization: `Bearer ${seeds.token}`, cookie: '__Host-wbs_organization=invalid' },
    { authorization: `Bearer ${seeds.token}`, cookie: '__Host-wbs_organization =invalid' },
    {
      authorization: `Bearer ${seeds.token}`,
      cookie: '__Host-wbs_organization=invalid; __Host-wbs_organization=other',
    },
  ];
  for (const [index, headers] of presentations.entries()) {
    const refused = await request.get('http://localhost:7500/api/organization/active', { headers });
    expect(
      [401, 403],
      `Presentation ${String(index)} was forwarded without compatibility mutation`,
    ).toContain(refused.status());
  }
});

test('normal root discards a held old-organization lookup after a genuine scope transition', async ({
  context,
  page,
  request,
}, testInfo) => {
  const identities = await request.get('http://localhost:7500/__fixture/identities');
  expect(identities.status()).toBe(200);
  const fixture = (await identities.json()) as { projects: Record<string, Identity | undefined> };
  const owner = fixture.projects['RootStale'];
  const remote = fixture.projects['A'];
  if (owner === undefined || remote === undefined) throw new Error('Missing stale fixture');
  await authenticate(context);
  await page.goto('/organization');
  await page.getByRole('button', { name: 'Choose org-a' }).click();
  await page.goto(`/?project=${owner.id}`);
  await expect(page.getByLabel('Name of 010')).toHaveValue('RootStale row');
  const relationships = await request.get('http://localhost:7500/__fixture/relationships');
  expect(relationships.status()).toBe(200);
  const before: unknown = await relationships.json();
  let second: Page | undefined;
  let routeWork: Promise<void> | undefined;
  let intercepted: Route | undefined;
  let routeAborted = false;
  let releaseResponse: (() => void) | undefined;
  const fulfillment = { isSettled: false };
  let fetchJoined: boolean;
  let routeRemoved = false;
  let primaryFailure: unknown;
  let routeFailure: unknown;
  const teardownFailures: unknown[] = [];
  let stage = 'waiting for lookup';
  let lookupOutcome: 'pending' | 'finished' | 'failed' = 'pending';
  const isHeldLookup = (url: string) => {
    const address = new URL(url);
    return (
      address.pathname === '/api/project-addresses/projects' &&
      address.searchParams.get('q') === 'axx'
    );
  };
  page.on('requestfailed', (outgoing) => {
    if (isHeldLookup(outgoing.url())) lookupOutcome = 'failed';
  });
  page.on('requestfinished', (outgoing) => {
    if (isHeldLookup(outgoing.url())) lookupOutcome = 'finished';
  });
  let oldWrites = 0;
  let transitioned = false;
  page.on('request', (outgoing) => {
    if (
      transitioned &&
      outgoing.method() === 'POST' &&
      outgoing.headers()['x-wbs-expected-organization'] === 'org-a'
    )
      oldWrites++;
  });
  const pattern = '**/api/project-addresses/projects?**';
  try {
    second = await context.newPage();
    await second.goto(`/?project=${owner.id}`);
    await expect(second.getByText('Organization: org-a', { exact: true })).toBeVisible();
    await second.getByText('Organization: org-a', { exact: true }).click({ timeout: 5000 });
    await expect(second.getByRole('button', { name: 'Choose org-b' })).toBeVisible();
    await page.route(pattern, async (route) => {
      intercepted = route;
      const released = new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
      routeWork = (async () => {
        stage = 'lookup intercepted';
        expect(new URL(route.request().url()).searchParams.get('q')).toBe('axx');
        expect(route.request().headers()['x-wbs-expected-organization']).toBe('org-a');
        const response = await route.fetch({ timeout: 10_000 });
        stage = 'real response arrived';
        expect(response.status()).toBe(200);
        expect(await response.json()).toEqual(
          expect.objectContaining({
            projects: expect.arrayContaining([
              expect.objectContaining({ projectId: remote.id, abbreviation: 'AXX', name: 'A' }),
            ]),
          }),
        );
        stage = 'real response validated';
        await released;
        await route.fulfill({ response });
        fulfillment.isSettled = true;
      })();
      // The cleanup owner joins the original promise and attributes its failure with the primary error.
      await routeWork.catch((cause: unknown) => {
        routeFailure = cause;
      });
    });
    await page.getByLabel('Add a dependency to 010').fill('axx');
    await expect.poll(() => stage).toBe('real response validated');
    await testInfo.attach('second-tab-before-transition', {
      body: await second.locator('body').innerText(),
      contentType: 'text/plain',
    });
    await expect(second.getByRole('button', { name: 'Choose org-b' })).toBeVisible();
    await second.getByRole('button', { name: 'Choose org-b' }).click();
    await expect(second.getByText('Organization: org-b', { exact: true })).toBeVisible();
    // Proof: suppressing the real organization notice refresh retained org-a after the peer selected org-b (2026-10-26).
    await expect(page.getByText('Organization: org-b', { exact: true })).toBeVisible();
    transitioned = true;
    await expect(page.getByLabel('Add a dependency to 010')).toHaveCount(0);
    if (releaseResponse === undefined || routeWork === undefined)
      throw new Error('Missing held response');
    releaseResponse();
    await routeWork;
    await expect.poll(() => lookupOutcome).not.toBe('pending');
    await testInfo.attach('held-lookup-settlement', {
      body: JSON.stringify({
        stage,
        lookupOutcome,
        oldProjectId: remote.id,
        newOrganizationId: 'org-b',
      }),
      contentType: 'application/json',
    });
    await expect(page.getByRole('option', { name: 'Project AXX - A', exact: true })).toHaveCount(0);
    expect(oldWrites).toBe(0);
    const current = await context.request.get('/api/organization/active');
    expect(current.status()).toBe(200);
    expect(await current.json()).toEqual(expect.objectContaining({ organizationId: 'org-b' }));
    const stale = await context.request.get(`/api/projects/${owner.id}/work-items`, {
      headers: { 'X-WBS-Expected-Organization': 'org-a' },
    });
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toEqual({ error: 'organization_context_changed' });
    expect(
      await (await request.get('http://localhost:7500/__fixture/relationships')).json(),
    ).toEqual(before);
  } catch (cause) {
    primaryFailure = cause;
  } finally {
    // Proof: r1 held-response witness retains primary+release errors, joins work and still removes the route/closes the peer.
    releaseResponse?.();
    try {
      await routeWork;
    } catch (cause) {
      teardownFailures.push(cause);
    } finally {
      fetchJoined = true;
    }
    try {
      // Proof: r2 omits only abort with flags unchanged: exact held request lacks a terminal event before teardown; restore yields requestfailed.
      if (!fulfillment.isSettled && intercepted !== undefined) {
        await intercepted.abort();
        routeAborted = true;
      }
    } catch (cause) {
      teardownFailures.push(cause);
    }
    try {
      if (!page.isClosed()) await page.unroute(pattern);
      routeRemoved = true;
    } catch (cause) {
      teardownFailures.push(cause);
    }
    try {
      await second?.close();
    } catch (cause) {
      teardownFailures.push(cause);
    }
    try {
      await testInfo.attach('held-lookup-cleanup', {
        body: JSON.stringify({
          stage,
          fetchJoined,
          releaseSettled: fulfillment.isSettled,
          routeAborted,
          routeRemoved,
          routeFailure: routeFailure instanceof Error ? routeFailure.message : routeFailure,
          peerClosed: second === undefined || second.isClosed(),
          primaryFailure: primaryFailure instanceof Error ? primaryFailure.message : primaryFailure,
          teardownFailures: teardownFailures.map((cause) =>
            cause instanceof Error ? cause.message : String(cause),
          ),
        }),
        contentType: 'application/json',
      });
    } catch (cause) {
      teardownFailures.push(cause);
    }
  }
  const failures =
    primaryFailure === undefined ? teardownFailures : [primaryFailure, ...teardownFailures];
  if (failures.length > 0) throw new AggregateError(failures, 'Held lookup scope failed');
});

test('normal root authors, refreshes and navigates stable qualified prerequisites', async ({
  context,
  page,
  request,
}) => {
  const identities = await request.get('http://localhost:7500/__fixture/identities');
  expect(identities.status()).toBe(200);
  const fixture = (await identities.json()) as { projects: Record<string, Identity | undefined> };
  const owner = fixture.projects['RootAuthor'];
  if (owner === undefined) throw new Error('Missing author fixture');
  await authenticate(context);
  const unselected = await context.request.get('/api/organization/active');
  expect(unselected.status(), await unselected.text()).toBe(403);
  expect(await unselected.json()).toEqual({ error: 'no_active_organization' });
  const unavailable = await context.request.get(`/api/projects/${owner.id}/work-items`, {
    headers: { 'X-WBS-Expected-Organization': 'org-a' },
  });
  expect(unavailable.status(), await unavailable.text()).toBe(403);
  await page.goto('/organization');
  await page.getByRole('button', { name: 'Choose org-a' }).click();
  await page.goto(`/?project=${owner.id}`);
  await expect(page.getByText('Organization: org-a', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Name of 010')).toHaveValue('RootAuthor row');
  const remote = fixture.projects['A'];
  if (remote === undefined) throw new Error('Missing predecessor fixture');
  const relationships = async () => {
    const response = await request.get('http://localhost:7500/__fixture/relationships');
    expect(response.status()).toBe(200);
    return (await response.json()) as { id: string; successor_project_id: string }[];
  };
  expect((await request.post('http://localhost:7500/__fixture/reset')).status()).toBe(200);
  const picker = page.getByLabel('Add a dependency to 010');
  const discovery = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/project-addresses/projects',
  );
  await picker.fill('axx');
  const lookupResponse = await discovery;
  expect(lookupResponse.status()).toBe(200);
  // Proof: binding the session address client to legacy scope removed this header from the real200 lookup (2026-10-26).
  expect(lookupResponse.request().headers()['x-wbs-expected-organization']).toBe('org-a');
  await expect(page.getByRole('option', { name: 'Project AXX - A', exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'Project AXX - A', exact: true }).click();
  await expect(picker).toHaveValue('AXX.');
  const command = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/projects/${owner.id}/commands` &&
      response.request().method() === 'POST',
  );
  await page.getByRole('option', { name: 'AXX.010 - A row', exact: true }).click();
  const committed = await command;
  expect(committed.status(), await committed.text()).toBe(200);
  expect(committed.request().postDataJSON()).toEqual({
    commands: [
      {
        kind: 'addTypedDependency',
        predecessor: { projectId: remote.id, scope: 'whole', workItemId: remote.row },
        successor: { scope: 'whole', workItemId: owner.row },
        type: 'FS',
      },
    ],
  });
  const captured = (await relationships()).filter(
    (relationship) => relationship.successor_project_id === owner.id,
  );
  expect(captured).toEqual([
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
  expect(await committed.json()).toEqual({
    results: [{ index: 0, id: captured[0]?.id }],
    undoable: true,
    redoable: false,
  });
  await page.reload();
  await expect(page.getByLabel('Name of 010')).toHaveValue('RootAuthor row');
  expect(
    (await relationships()).filter(
      (relationship) => relationship.successor_project_id === owner.id,
    ),
  ).toEqual(captured);
  const details = await openDependency(page);
  await expect(details).toContainText('AXX.010');
  await details.getByRole('button', { name: 'Back to dependency picker', exact: true }).click();
  await expect(page.locator('[data-node-reading]').first()).toHaveAttribute(
    'data-node-reading',
    'unknown',
  );
  const frames: {
    type?: string;
    replayed?: Record<string, number>;
    subscription?: string;
    message?: { type: string };
  }[] = [];
  page.on('websocket', (socket) =>
    socket.on('framereceived', (frame) =>
      frames.push(JSON.parse(String(frame.payload)) as (typeof frames)[number]),
    ),
  );
  // Reload establishes a fresh, observable ordinary application websocket.
  await page.reload();
  await expect(page.getByLabel('Name of 010')).toHaveValue('RootAuthor row');
  await expect
    .poll(() =>
      frames.some(
        (frame) =>
          frame.type === 'resume_ack' &&
          typeof frame.replayed?.[`project:${owner.id}`] === 'number',
      ),
    )
    .toBe(true);
  const refreshed: Response[] = [];
  page.on('response', (response) => {
    if (
      new URL(response.url()).pathname === `/api/projects/${owner.id}/work-items` &&
      response.ok()
    )
      refreshed.push(response);
  });
  expect((await request.post('http://localhost:7500/__fixture/complete')).status()).toBe(200);
  await expect
    .poll(() =>
      frames.some(
        (frame) =>
          frame.subscription === `project:${owner.id}` &&
          frame.message?.type === 'elsewhere_changed',
      ),
    )
    .toBe(true);
  // Proof: suppressing delivered owner invalidation retained unknown after the real completion200 and elsewhere_changed frame (2026-10-26).
  await expect(page.locator('[data-node-reading]').first()).toHaveAttribute(
    'data-node-reading',
    'waiting',
  );
  const delivered = refreshed.at(-1);
  if (delivered === undefined) throw new Error('Missing delivered successor refetch');
  expect(((await delivered.json()) as { workItems: unknown }).workItems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: owner.row, nodeReadings: { [owner.step]: 'waiting' } }),
    ]),
  );
  expect(context.pages()).toHaveLength(1);
  expect(
    (await relationships()).filter(
      (relationship) => relationship.successor_project_id === owner.id,
    ),
  ).toEqual(captured);
  const renamed = await context.request.patch(`/api/projects/${remote.id}`, {
    headers: { origin: 'http://localhost:7600', 'X-WBS-Expected-Organization': 'org-a' },
    data: { abbreviation: 'ROOT_NAV' },
  });
  expect(renamed.status(), await renamed.text()).toBe(200);
  await page.reload();
  await expect(page.getByLabel('Name of 010')).toHaveValue('RootAuthor row');
  const reopened = await openDependency(page);
  const link = reopened.getByRole('link', { name: /^Open ROOT_NAV\.010/ });
  // Proof: substituting abbreviation for project UUID rendered project=ROOT_NAV in this actual anchor (2026-10-26).
  await expect(link).toHaveAttribute(
    'href',
    `/?${new URLSearchParams({ project: remote.id, workItem: remote.row })}`,
  );
  const document = page.waitForResponse(
    (response) =>
      response.request().resourceType() === 'document' && response.request().isNavigationRequest(),
  );
  const landing = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/projects/${remote.id}/work-items` && response.ok(),
  );
  await link.click();
  expect((await document).status()).toBe(200);
  const tree = await landing;
  expect(((await tree.json()) as { workItems: unknown }).workItems).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: remote.row })]),
  );
  const active = await context.request.get('/api/organization/active');
  expect(active.status()).toBe(200);
  expect(await active.json()).toEqual(expect.objectContaining({ organizationId: 'org-a' }));
  await expect(page.getByText('Organization: org-a', { exact: true })).toBeVisible();
  await expect(
    page.locator(`[data-row-id="${remote.row}"]`).getByLabel('Name of 010'),
  ).toBeFocused();
  await expect(page.getByLabel('Name of 010')).toHaveValue('A row');
  expect(
    (await relationships()).filter(
      (relationship) => relationship.successor_project_id === owner.id,
    ),
  ).toEqual(captured);
});

async function openDependency(page: Page) {
  const picker = page.getByLabel('Add a dependency to 010');
  await picker.click();
  await picker.press('Home');
  await page.keyboard.press('Enter');
  const details = page.getByRole('dialog', { name: 'Captured dependency' });
  await expect(details).toBeVisible();
  return details;
}
