import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';

/**
 * The agent pools panel (`wbs-mcp-agent-surface` task 6.3), drawn by a browser
 * for an admin of an activated organization.
 *
 * Every `/api` request is answered at the browser's boundary, as
 * `organization.spec.ts` does and for its reason: no ordinary e2e seed reaches
 * an activated organization. jsdom proves the states and the requests
 * (`agent-pools-panel.test.tsx`); this proves what they paint, that the keys
 * arrive as one browser download and never as page text, and that nothing
 * runs sideways at a phone's width. Each state is saved as a screenshot for
 * review by eye.
 */

const DAY = 86_400_000;
/** Shaped like a key so a leak is unmistakable; it opens nothing. */
const KEY = 'wbs_mk_6f1c2a8e-0000-4000-8000-0000000000a1.cG9vbC1rZXktc2hvd24tbmV2ZXI';

interface PoolFixture {
  id: string;
  name: string;
  size: number;
  liveKeys: number;
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

/** How the stub answers the pool writes. */
interface Answers {
  rekey: 'keys' | 'pool_expired';
  revoke: 'revoked' | 'persons_not_removed';
}

function poolBody(pool: PoolFixture) {
  return {
    id: pool.id,
    name: pool.name,
    size: pool.size,
    expiresAt: pool.expiresAt,
    revokedAt: pool.revokedAt,
    createdAt: pool.createdAt,
    createdBy: 'u1',
    credentials: Array.from({ length: pool.liveKeys }, (_, index) => ({
      id: `${pool.id}-cred-${String(index + 1)}`,
      source: 'api_key',
      name: `${pool.name}-${String(index + 1)}`,
      personId: `${pool.id}-p-${String(index + 1)}`,
      issuedBy: 'u1',
      issuer: null,
      subject: null,
      createdAt: pool.createdAt,
      lastUsedAt: null,
      revokedAt: null,
      rotationEndsAt: null,
      secrets: [],
    })),
  };
}

function keysBody(pool: PoolFixture) {
  return {
    format: 'wbs-agent-pool-keys',
    version: 1,
    organizationId: 'org-a',
    authorizationServer: 'https://wbs.example/mcp/oauth',
    mcpResource: 'https://wbs.example/mcp',
    poolId: pool.id,
    name: pool.name,
    expiresAt: pool.expiresAt,
    issuedAt: Date.now(),
    agents: Array.from({ length: pool.size }, (_, index) => ({
      personId: `${pool.id}-p-${String(index + 1)}`,
      personName: `${pool.name}-${String(index + 1)}`,
      credentialId: `${pool.id}-cred-${String(index + 1)}`,
      key: `${KEY}${String(index)}`,
    })),
  };
}

/** Answers every request the page sends as an admin with `pools`, which the writes change. */
async function answerAsAdmin(
  page: Page,
  pools: PoolFixture[],
  answers: Answers = { rekey: 'keys', revoke: 'revoked' },
): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    const key = `${request.method()} ${url.pathname}`;
    const rekey = /^POST \/api\/organization\/agent-pools\/([^/]+)\/rekey$/.exec(key);
    const revoke = /^DELETE \/api\/organization\/agent-pools\/([^/]+)$/.exec(key);
    if (rekey !== null) {
      const pool = pools.find((each) => each.id === rekey[1]);
      if (pool === undefined) return json({ error: 'not_found' }, 404);
      if (answers.rekey === 'pool_expired') return json({ error: 'pool_expired' }, 409);
      return json(keysBody(pool), 201);
    }
    if (revoke !== null) {
      const pool = pools.find((each) => each.id === revoke[1]);
      if (pool === undefined) return json({ error: 'not_found' }, 404);
      const revokedCredentials = pool.liveKeys;
      pool.revokedAt = Date.now();
      pool.liveKeys = 0;
      if (answers.revoke === 'persons_not_removed')
        return json({ error: 'persons_not_removed', poolId: pool.id, revokedCredentials }, 409);
      return json({ poolId: pool.id, revokedCredentials, removedPersons: 0 });
    }
    switch (key) {
      case 'GET /api/auth/me':
        return json({ user: { id: 'u1', username: 'sam', scopes: ['read', 'write'] } });
      // An activated deployment: the organization runtime discovers `org-a`.
      case 'GET /api/onboarding':
        return json({
          state: 'selection_required',
          memberships: [{ organizationId: 'org-a', name: 'Acme', role: 'admin' }],
        });
      case 'GET /api/organization/active':
        return json({ organizationId: 'org-a', name: 'Acme', role: 'admin' });
      case 'GET /api/organization/limits':
        return json({
          source: 'default',
          limits: {
            maxAgentPersons: 40,
            maxConcurrentClaims: 200,
            maxCapacityUnitsPerResource: 64,
          },
          usage: {
            agentPersons: pools.reduce((sum, pool) => sum + pool.size, 0),
            concurrentClaims: 0,
            capacityUnits: [],
          },
        });
      case 'GET /api/organization/agent-pools':
        return json({ pools: pools.map(poolBody) });
      case 'POST /api/organization/agent-pools': {
        const body = request.postDataJSON() as { name: string; size: number; expiresAt?: number };
        const pool: PoolFixture = {
          id: 'pool-new',
          name: body.name,
          size: body.size,
          liveKeys: body.size,
          expiresAt: body.expiresAt ?? null,
          revokedAt: null,
          createdAt: Date.now(),
        };
        pools.push(pool);
        return json(keysBody(pool), 201);
      }
      case 'GET /api/organization/members':
        return json({ members: [] });
      case 'GET /api/organization/invitations':
        return json({ invitations: [] });
      case 'GET /api/organization/join-requests':
        return json({ requests: [] });
      case 'GET /api/organization/domains':
        return json({ domains: [] });
      case 'GET /api/organization/sso-connections':
        return json({ connections: [] });
      case 'GET /api/organization/session-policy':
        return json({ policy: null });
      case 'GET /api/organization/provisioning-tokens':
        return json({ tokens: [] });
      case 'GET /api/organization/machine-credentials':
        return json({ credentials: [] });
      case 'GET /api/organization/trusted-issuers':
        return json({ trustedIssuers: [], audienceRoot: 'https://wbs.example/mcp/oauth' });
      case 'GET /api/organization/compute-providers':
        return json({ computeProviders: [] });
      case 'GET /api/people':
        return json({ people: [] });
      case 'GET /api/organization':
        return json({ sharedPeople: false, sharingAvailable: true, canSwitch: true });
      default:
        return json({ error: 'not_found' }, 404);
    }
  });
}

const fixtures = (): PoolFixture[] => [
  {
    id: 'pool-1',
    name: 'swarm-a',
    size: 8,
    liveKeys: 8,
    expiresAt: Date.now() + 30 * DAY,
    revokedAt: null,
    createdAt: Date.UTC(2026, 9, 20, 9, 30),
  },
  {
    id: 'pool-2',
    name: 'nightly-reviewers',
    size: 4,
    liveKeys: 3,
    expiresAt: null,
    revokedAt: null,
    createdAt: Date.UTC(2026, 9, 22, 14, 5),
  },
  {
    id: 'pool-3',
    name: 'spike-old',
    size: 2,
    liveKeys: 2,
    expiresAt: Date.now() - DAY,
    revokedAt: null,
    createdAt: Date.UTC(2026, 7, 1, 8, 0),
  },
  {
    id: 'pool-4',
    name: 'swarm-retired',
    size: 6,
    liveKeys: 0,
    expiresAt: null,
    revokedAt: Date.UTC(2026, 9, 25, 17, 45),
    createdAt: Date.UTC(2026, 9, 1, 9, 0),
  },
];

async function openPanel(page: Page): Promise<Locator> {
  await page.goto('/organization');
  const panel = page.getByRole('region', { name: 'Agent pools', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Loading agent pools…')).toHaveCount(0);
  return panel;
}

/** Nothing sideways, no key in the page, then the panel saved for review. */
async function capture(page: Page, target: Locator, testInfo: TestInfo, name: string) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    main: (() => {
      const main = document.querySelector('main');
      if (main === null) throw new Error('the page has no main');
      return main.scrollWidth - main.clientWidth;
    })(),
  }));
  expect(overflow).toEqual({ document: 0, main: 0 });
  expect(await page.content()).not.toContain('wbs_mk_');
  // `main` scrolls, not the document, so a target taller than the window
  // would be cut at its edge: the window grows to hold it for the picture.
  const viewport = page.viewportSize();
  const box = await target.boundingBox();
  if (viewport === null || box === null) throw new Error(`${name} has no box to capture`);
  if (box.height + 240 > viewport.height)
    await page.setViewportSize({ width: viewport.width, height: Math.ceil(box.height) + 240 });
  await target.scrollIntoViewIfNeeded();
  const path = testInfo.outputPath(`${name}.png`);
  await target.screenshot({ path });
  await page.setViewportSize(viewport);
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const width of [1280, 375]) {
  test.describe(`agent pools at ${String(width)}px`, () => {
    test.use({ viewport: { width, height: width === 375 ? 812 : 900 } });
    const shot = (name: string) => `agent-pools-${name}-${String(width)}`;

    test('draws the empty and the populated list', async ({ page }, testInfo) => {
      const pools: PoolFixture[] = [];
      await answerAsAdmin(page, pools);
      const empty = await openPanel(page);
      await expect(empty.getByText(/No agent pool yet/)).toBeVisible();
      await capture(page, empty, testInfo, shot('empty'));
      pools.push(...fixtures());
      await empty.getByRole('button', { name: 'Refresh agent pools' }).click();
      await expect(empty.getByRole('listitem', { name: 'swarm-retired' })).toBeVisible();
      await capture(page, empty, testInfo, shot('list'));
    });

    test('creates a pool with its counts and saves the keys as one download', async ({
      page,
    }, testInfo) => {
      await answerAsAdmin(page, fixtures());
      const panel = await openPanel(page);
      await panel.getByRole('button', { name: 'Create agent pool' }).click();
      const dialog = page.getByRole('dialog', { name: 'Create an agent pool' });
      await dialog.getByLabel('Name').fill('swarm-b');
      await dialog.getByLabel('Agents').fill('12');
      await expect(dialog.getByLabel('What this creates')).toContainText(
        'Creates 12 agent persons, swarm-b-1 to swarm-b-12',
      );
      await capture(page, dialog, testInfo, shot('create-counts'));
      const saved = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Create and download keys' }).click();
      const download = await saved;
      expect(download.suggestedFilename()).toBe('pool-pool-new.keys.json');
      const note = panel.getByRole('status', { name: 'Keys downloaded' });
      await expect(note).toContainText('cannot be downloaded again');
      await capture(page, panel, testInfo, shot('created'));
    });

    test('re-keys after confirming, and asks for a new expiry when the pool expired', async ({
      page,
    }, testInfo) => {
      await answerAsAdmin(page, fixtures(), { rekey: 'pool_expired', revoke: 'revoked' });
      const panel = await openPanel(page);
      await panel.getByRole('button', { name: 'Re-key nightly-reviewers' }).click();
      const confirm = panel.getByRole('form', { name: 'Re-key nightly-reviewers' });
      await expect(confirm).toContainText('1 agent without a live key stays keyless.');
      await capture(
        page,
        panel.getByRole('listitem', { name: 'nightly-reviewers' }),
        testInfo,
        shot('rekey-confirm'),
      );
      await confirm.getByRole('button', { name: 'Re-key and download keys' }).click();
      await expect(confirm.getByRole('alert')).toContainText('This pool has expired.');
      await expect(confirm.getByLabel('New expiry')).toHaveAttribute('required', '');
      await capture(
        page,
        panel.getByRole('listitem', { name: 'nightly-reviewers' }),
        testInfo,
        shot('pool-expired'),
      );
    });

    test('revokes after confirming, and says when the persons were kept', async ({
      page,
    }, testInfo) => {
      await answerAsAdmin(page, fixtures(), { rekey: 'keys', revoke: 'persons_not_removed' });
      const panel = await openPanel(page);
      await panel.getByRole('button', { name: 'Revoke swarm-a' }).click();
      const confirm = panel.getByRole('group', { name: 'Revoke swarm-a' });
      await expect(confirm.getByRole('checkbox')).not.toBeChecked();
      await capture(
        page,
        panel.getByRole('listitem', { name: 'swarm-a' }),
        testInfo,
        shot('revoke-confirm'),
      );
      await confirm.getByRole('checkbox').check();
      await confirm.getByRole('button', { name: 'Revoke and remove persons' }).click();
      const kept = panel.getByRole('status', { name: 'Revoked, persons kept' });
      await expect(kept).toBeVisible();
      await expect(panel.getByRole('listitem', { name: 'swarm-a' })).toContainText('Revoked');
      await capture(page, panel, testInfo, shot('persons-kept'));
    });
  });
}
