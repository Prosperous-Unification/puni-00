import { expect, test } from '@playwright/test';

/** Every API response here comes from bootBe01 and a disposable activated SQLite database. */
test('two tabs cannot redirect an A mutation into B', async ({ context, page }) => {
  const login = await context.request.post('/api/auth/login', {
    headers: { origin: 'http://localhost:7400' },
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
    throw new Error('native fixture login omitted its token');
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
  await page.goto('/organization');
  await expect(page.getByRole('button', { name: 'Choose org-a' })).toBeVisible();
  await expect(page.getByText('Organization: org-a', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose org-a' }).click();
  await expect(page.getByText('Organization: org-a', { exact: true })).toBeVisible();
  const staleRead = await context.request.get('/api/teams', {
    headers: { 'X-WBS-Expected-Organization': 'org-a' },
  });
  expect(staleRead.status()).toBe(200);
  const second = await context.newPage();
  await second.goto('/organization');
  await expect(second.getByText('Organization: org-a', { exact: true })).toBeVisible();
  let release: (() => Promise<void>) | undefined;
  let signalHeld: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    signalHeld = resolve;
  });
  let delayed = false;
  await page.route('**/api/organization/active', async (route) => {
    if (route.request().method() !== 'GET' || delayed) {
      await route.continue();
      return;
    }
    delayed = true;
    const response = await route.fetch();
    release = () => route.fulfill({ response });
    if (signalHeld === undefined) throw new Error('held discovery signal is absent');
    signalHeld();
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await held;
  await second.getByText('Organization: org-a', { exact: true }).click();
  await second.getByRole('button', { name: 'Choose org-b' }).click();
  await expect(second.getByText('Organization: org-b', { exact: true })).toBeVisible();
  await expect(page.getByText('Organization: org-b', { exact: true })).toBeVisible();
  if (release === undefined) throw new Error('held discovery response is absent');
  await release();
  await expect(page.getByText('Organization: org-b', { exact: true })).toBeVisible();
  await expect(page.getByText('Organization: org-a', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/organization/active');
  const refused = await context.request.post('/api/projects', {
    headers: { origin: 'http://localhost:7400', 'X-WBS-Expected-Organization': 'org-a' },
    data: { name: 'stale A mutation' },
  });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toEqual({ error: 'organization_context_changed' });
  const read = await context.request.get('/api/teams', {
    headers: { 'X-WBS-Expected-Organization': 'org-a' },
  });
  expect(read.status()).toBe(409);
  const projects = await context.request.get('/api/projects', {
    headers: { 'X-WBS-Expected-Organization': 'org-b' },
  });
  expect(projects.status()).toBe(200);
  expect(JSON.stringify(await projects.json())).not.toContain('stale A mutation');
  await second.close();
  await page.bringToFront();
  await page.getByRole('link', { name: 'Directory', exact: true }).click();
  await expect(page.getByLabel('New team', { exact: true })).toBeVisible();
  await page.getByLabel('New team', { exact: true }).fill('stale B team');
  let releaseMutation: (() => Promise<void>) | undefined;
  let signalMutation: (() => void) | undefined;
  const mutationHeld = new Promise<void>((resolve) => {
    signalMutation = resolve;
  });
  await page.route('**/api/directory/commands', (route) => {
    releaseMutation = () => route.continue();
    if (signalMutation === undefined) throw new Error('held mutation signal is absent');
    signalMutation();
  });
  let mutations = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/directory/commands'
    )
      mutations++;
  });
  const denied = page.waitForResponse(
    (response) => response.url().endsWith('/api/directory/commands') && response.status() === 409,
  );
  await page.getByRole('button', { name: 'Add team', exact: true }).click();
  await mutationHeld;
  // This selection emits no BroadcastChannel notice. The in-flight B request must retain B.
  const changed = await context.request.post('/api/organization/active', {
    headers: { origin: 'http://localhost:7400' },
    data: { organizationId: 'org-a' },
  });
  expect(changed.status()).toBe(200);
  if (releaseMutation === undefined) throw new Error('held mutation is absent');
  await releaseMutation();
  await denied;
  await expect(page.getByLabel('New team', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Organization: org-b', { exact: true })).toHaveCount(0);
  expect(mutations).toBe(1);
  await page.getByRole('button', { name: 'Check current organization' }).click();
  await expect(page.getByText('Organization: org-a', { exact: true })).toBeVisible();
  await expect(page.getByLabel('New team', { exact: true })).toBeVisible();
  const removed = await context.request.post('/api/__fixture/remove-a');
  expect(removed.status()).toBe(200);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByLabel('New team', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Organization: org-a', { exact: true })).toHaveCount(0);
  expect(mutations).toBe(1);
});

/** Fixture proof uses a seeded proven connection; no upstream IdP is contacted. */
test('browser provisioning token lifecycle releases the connection deletion blocker', async ({
  context,
  page,
}) => {
  const headers = { origin: 'http://localhost:7400', 'X-WBS-Expected-Organization': 'org-tokens' };
  const login = await context.request.post('/api/auth/login', {
    headers,
    data: { username: 'token-admin', password: 'correct-horse' },
  });
  expect(login.status()).toBe(200);
  const credential = (await login.json()) as { token: string };
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
  await page.goto('/organization');
  await page.getByRole('button', { name: 'Choose org-tokens' }).click();
  const panel = page.getByRole('region', { name: 'Provisioning tokens' });
  await expect(panel.getByText('No provisioning tokens.')).toBeVisible();
  await panel.getByRole('button', { name: 'Refresh provisioning tokens' }).focus();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Issue provisioning token' })).toBeFocused();
  await panel.getByRole('button', { name: 'Issue provisioning token' }).click();
  await expect(panel.getByText(/^wbs_scim_[A-Za-z0-9_-]{43}$/)).toBeVisible();
  const issued = await context.request.get('/api/organization/provisioning-tokens', { headers });
  expect(issued.status()).toBe(200);
  const listed = (await issued.json()) as { tokens: { id: string; expiresAt: number | null }[] };
  expect(listed.tokens).toHaveLength(1);
  const first = listed.tokens.at(0);
  if (first === undefined) throw new Error('Issued provisioning token is absent');
  expect(JSON.stringify(listed)).not.toContain('wbs_scim_');
  const blocked = await context.request.delete('/api/organization/sso-connections/conn-tokens', {
    headers,
  });
  expect(blocked.status()).toBe(409);
  expect(await blocked.json()).toEqual({ error: 'provisioning_active' });
  await panel.getByRole('button', { name: 'Dismiss secret' }).click();
  await panel.getByRole('button', { name: `Rotate ${first.id}`, exact: true }).click();
  await expect(panel.getByText(/^wbs_scim_[A-Za-z0-9_-]{43}$/)).toBeVisible();
  const rotated = await context.request.get('/api/organization/provisioning-tokens', { headers });
  expect(rotated.status()).toBe(200);
  const successor = (await rotated.json()) as {
    tokens: { id: string; expiresAt: number | null }[];
  };
  expect(successor.tokens).toHaveLength(2);
  const previous = successor.tokens.find((token) => token.id === first.id);
  if (previous?.expiresAt === null || previous?.expiresAt === undefined)
    throw new Error('Rotation omitted previous expiry');
  await expect(
    panel.getByText(`Previous token expires: ${new Date(previous.expiresAt).toISOString()}`),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await panel.getByRole('button', { name: 'Refresh provisioning tokens' }).click();
  await expect(panel.getByText(/^wbs_scim_/)).toHaveCount(0);
  await page.reload();
  await expect(panel.getByRole('listitem')).toHaveCount(2);
  await expect(panel.getByText(/^wbs_scim_/)).toHaveCount(0);
  for (const token of successor.tokens) {
    const row = panel
      .getByRole('listitem')
      .filter({ has: page.getByText(token.id, { exact: true }) });
    await row.getByLabel('Token ID to revoke').fill(token.id);
    await row.getByRole('button', { name: `Revoke ${token.id}`, exact: true }).click();
    await expect(row.getByText('Revoked', { exact: true })).toBeVisible();
  }
  const deleted = await context.request.delete('/api/organization/sso-connections/conn-tokens', {
    headers,
  });
  expect(deleted.status()).toBe(204);
});
