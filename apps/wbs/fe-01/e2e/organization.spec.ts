import { expect, type Page, test, type TestInfo } from '@playwright/test';

/**
 * The organization page, drawn by a browser, for a super-admin of an activated
 * organization.
 *
 * The organization is answered at the browser's boundary rather than seeded in
 * be-01: the ordinary e2e servers run be-01 with organization selection
 * refusing (`REFUSE_ORGANIZATION_SELECTION`), so no seed there can reach an
 * activated organization, and activating one is a security boundary of its own.
 * What this file is about — what the page draws — needs only the replies, and
 * those are the contract shapes the panels' own tests answer with.
 *
 * jsdom proves the classes (`organization-page.test.tsx`); this proves what
 * they paint: no bevelled platform control, nothing sideways at a phone's
 * width, and every control reachable by Tab.
 */

const DAY = 86_400_000;
const ISOLATED_WORDS =
  'Each project schedules its people as if it had them alone. A person booked in two projects at once shows as an overlap on their load.';
const UNAVAILABLE_WORDS = 'Sharing people across projects is not available in this release yet.';
const SUPER_ADMIN_WORDS = 'Only a super-admin can change whether people are shared.';

type SharingReply =
  { sharedPeople: boolean; sharingAvailable: boolean; canSwitch: boolean } | { error: 'forbidden' };

async function answerAsSuperAdmin(
  page: Page,
  mode: 'ready' | 'denied' | 'held' | 'create-held' | 'enforce-held' = 'ready',
  sharing: SharingReply = { sharedPeople: false, sharingAvailable: true, canSwitch: true },
): Promise<void> {
  const now = Date.now();
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    switch (`${method} ${url.pathname}`) {
      case 'GET /api/auth/me':
        return json({ user: { id: 'u1', username: 'sam', scopes: ['read', 'write'] } });
      case 'GET /api/onboarding':
        return json({ error: 'onboarding_inactive' }, 403);
      case 'GET /api/organization/members':
        return json({
          members: [
            {
              userId: 'u1',
              username: 'sam',
              email: 'sam@acme.test',
              role: 'super_admin',
              createdAt: 1,
            },
            { userId: 'u2', username: 'ada', email: null, role: 'member', createdAt: 1 },
          ],
        });
      case 'GET /api/organization/invitations':
        return json({
          invitations: [
            {
              id: 'i1',
              email: 'grace.hopper.with.a.long.address@example.engineering.test',
              role: 'admin',
              expiresAt: now + 7 * DAY,
              revokedAt: null,
              consumedAt: null,
            },
          ],
        });
      case 'GET /api/organization/join-requests':
        return json({
          requests: [{ id: 'r1', email: 'ken@acme.test', status: 'pending', createdAt: 1 }],
        });
      case 'GET /api/organization/sso-connections':
        if (mode === 'denied') return json({ error: 'forbidden' }, 403);
        return json({
          connections: [
            {
              id: 'connection-a',
              domainClaimId: 'used-a',
              domain: 'acme-engineering-subsidiary.example',
              auth0Connection: 'acme-engineering-enterprise-saml',
              strategy: 'samlp',
              loginSlug: 'acme-europe-login',
              enforced: false,
              provenAt: null,
              provenBy: null,
              lastPrefixMismatchAt: null,
            },
            {
              id: 'connection-b',
              domainClaimId: 'used-b',
              domain: 'other.example',
              auth0Connection: 'other-company-oidc',
              strategy: 'oidc',
              loginSlug: 'other-company-login',
              enforced: true,
              provenAt: 1,
              provenBy: 'u1',
              lastPrefixMismatchAt: 2,
            },
          ],
        });
      case 'POST /api/organization/sso-connections':
        if (mode === 'create-held') {
          await new Promise<void>((resolve) => {
            page.once('close', () => {
              resolve();
            });
          });
          return;
        }
        return json({ error: 'login_slug_taken' }, 409);
      case 'PATCH /api/organization/sso-connections/connection-b':
        if (mode === 'enforce-held') {
          await new Promise<void>((resolve) => {
            page.once('close', () => {
              resolve();
            });
          });
          return;
        }
        return json({
          connection: {
            id: 'connection-b',
            domainClaimId: 'used-b',
            domain: 'other.example',
            auth0Connection: 'other-company-oidc',
            strategy: 'oidc',
            loginSlug: 'other-company-login',
            enforced: false,
            provenAt: 1,
            provenBy: 'u1',
            lastPrefixMismatchAt: 2,
          },
        });
      case 'DELETE /api/organization/sso-connections/connection-b':
        return json({ error: 'provisioning_active' }, 409);
      case 'POST /api/auth/link/auth0':
        if (mode === 'held') {
          await new Promise<void>((resolve) => {
            page.once('close', () => {
              resolve();
            });
          });
          return;
        }
        return json({ error: 'invalid_credentials' }, 401);
      case 'GET /api/organization/domains':
        return json({
          domains: [
            {
              id: 'available',
              domain: 'available.example',
              status: 'verified',
              challengeExpiresAt: null,
              lastSuccessAt: 1,
              lastCheckedAt: 1,
              proofWarning: false,
            },
            {
              id: 'd1',
              domain: 'acme-engineering-subsidiary.example',
              status: 'pending',
              challengeExpiresAt: now + DAY,
              lastSuccessAt: null,
              lastCheckedAt: null,
              proofWarning: false,
            },
          ],
        });
      case 'GET /api/organization/session-policy':
        return json({ policy: null });
      case 'GET /api/organization/provisioning-tokens':
        return json({ tokens: [] });
      case 'GET /api/organization':
        return json(sharing, 'error' in sharing ? 403 : 200);
      default:
        return json({ error: 'not_found' }, 404);
    }
  });
}

/** Every control the page's panels offer, each named for a failure message. */
async function controlsOf(page: Page) {
  return page.locator('main').evaluate((main) =>
    [...main.querySelectorAll('button, input, select')].map((control) => {
      const style = getComputedStyle(control);
      return {
        name: control.getAttribute('aria-label') ?? (control.id || control.textContent),
        radius: style.borderTopLeftRadius,
        appearance: style.getPropertyValue('appearance'),
        background: style.backgroundColor,
      };
    }),
  );
}

for (const width of [1280, 375]) {
  test.describe(`organization page at ${String(width)}px`, () => {
    test.use({ viewport: { width, height: width === 375 ? 812 : 900 } });

    test('draws every control with the chrome, nothing sideways', async ({ page }, testInfo) => {
      await answerAsSuperAdmin(page);
      await page.goto('/organization');
      await expect(
        page.getByRole('button', { name: 'Share people across projects' }),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Start proof for other.example' }).click();
      await page.getByLabel('How did you sign in to WBS?').selectOption('password');
      await expect(page.getByLabel('Your WBS password')).toBeVisible();
      const controls = await controlsOf(page);
      expect(controls.length).toBeGreaterThan(10);
      // The platform's own button is drawn with a 0px or 2px corner and its
      // `ButtonFace`; every chrome control here is `rounded-md`, 6px.
      // Proof: 2026-10-12, with `members-panel.tsx` restored to its bare
      // `<button>`s and `<select className="border p-2">`, this listed each of
      // them at `radius: "0px"` (both widths failed).
      expect(controls.filter((control) => control.radius !== '6px')).toEqual([]);

      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(sideways).toBe(0);
      // `main` is the scroller, so a row wider than the phone widens it and
      // not the document. Proof: 2026-10-12, dropping `[overflow-wrap:anywhere]`
      // from the invitation address failed this at 375px: received 97.
      const mainSideways = await page
        .locator('main')
        .evaluate((main) => main.scrollWidth - main.clientWidth);
      expect(mainSideways).toBe(0);

      await page.screenshot({ path: testInfo.outputPath(`organization-${String(width)}.png`) });
    });

    test('shows a denied setup without create or proof controls', async ({ page }) => {
      await answerAsSuperAdmin(page, 'denied');
      await page.goto('/organization');
      const panel = page.getByRole('region', { name: 'Company sign-in' });
      await expect(panel.getByRole('alert')).toHaveText(
        'Only a super-admin can set up company sign-in.',
      );
      await expect(panel.getByLabel('Verified domain')).toHaveCount(0);
      await expect(panel.getByRole('button', { name: /Start proof/ })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
    });

    test('keeps enforcement confirmed and freezes setup while PATCH is pending', async ({
      page,
    }) => {
      await answerAsSuperAdmin(page, 'enforce-held');
      await page.goto('/organization');
      const disabled = page.getByRole('button', {
        name: 'Enable enforcement for acme-engineering-subsidiary.example',
      });
      await expect(disabled).toBeDisabled();
      const requested = page.waitForRequest('**/api/organization/sso-connections/connection-b');
      await page.getByRole('button', { name: 'Disable enforcement for other.example' }).click();
      expect((await requested).postDataJSON()).toEqual({ enforced: false });
      await expect(
        page.getByRole('button', { name: 'Disable enforcement for other.example' }),
      ).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Refresh company sign-in' })).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Start proof for other.example' }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Disable enforcement for other.example' }),
      ).toBeVisible();
    });

    test('edits configuration and confirms removal with accessible phone-safe controls', async ({
      page,
    }) => {
      await answerAsSuperAdmin(page);
      await page.goto('/organization');
      await page.getByRole('button', { name: 'Edit connection for other.example' }).click();
      const editor = page.getByRole('form', { name: 'Edit connection for other.example' });
      await expect(editor.getByLabel('Auth0 connection name')).toHaveValue('other-company-oidc');
      await expect(editor.getByLabel('Strategy', { exact: true })).toHaveValue('oidc');
      await expect(editor.getByLabel('Login slug')).toHaveValue('other-company-login');
      await expect(editor).toContainText(
        'Changing the Auth0 name or strategy clears proof and enforcement',
      );
      expect(
        await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth),
      ).toBe(0);
      await editor.getByLabel('Login slug').fill('edited-company-login');
      const patched = page.waitForRequest(
        (request) =>
          request.method() === 'PATCH' && request.url().endsWith('/sso-connections/connection-b'),
      );
      await editor.getByRole('button', { name: 'Save connection for other.example' }).click();
      expect((await patched).postDataJSON()).toEqual({
        auth0Connection: 'other-company-oidc',
        strategy: 'oidc',
        loginSlug: 'edited-company-login',
      });
      await expect(editor).toHaveCount(0);
      let deletions = 0;
      page.on('request', (request) => {
        if (
          request.method() === 'DELETE' &&
          request.url().endsWith('/sso-connections/connection-b')
        )
          deletions += 1;
      });
      await page.getByRole('button', { name: 'Remove connection for other.example' }).click();
      const confirmation = page.getByRole('group', { name: 'Remove connection for other.example' });
      await expect(confirmation).toContainText('other.example through other-company-oidc');
      expect(
        await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth),
      ).toBe(0);
      await confirmation.getByRole('button', { name: 'Cancel removal of other.example' }).click();
      expect(deletions).toBe(0);
      await page.getByRole('button', { name: 'Remove connection for other.example' }).click();
      const removed = page.waitForRequest(
        (request) =>
          request.method() === 'DELETE' && request.url().endsWith('/sso-connections/connection-b'),
      );
      await confirmation.getByRole('button', { name: 'Confirm removal of other.example' }).click();
      await removed;
      await expect(page.getByRole('status')).toContainText('live provisioning');
      await expect(
        page.getByRole('button', { name: 'Remove connection for other.example' }),
      ).toBeEnabled();
    });

    test('holds the routed proof on one connection', async ({ page }) => {
      await answerAsSuperAdmin(page, 'held');
      await page.goto('/organization');
      await page.getByRole('button', { name: 'Start proof for other.example' }).click();
      await page.getByLabel('How did you sign in to WBS?').selectOption('provider');
      const requested = page.waitForRequest('**/api/auth/link/auth0');
      await page.getByRole('button', { name: 'Link your company sign-in' }).click();
      expect((await requested).postDataJSON()).toEqual({ organization: 'other-company-login' });
      await expect(
        page.getByRole('button', { name: 'Start proof for acme-engineering-subsidiary.example' }),
      ).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Refresh company sign-in' })).toBeDisabled();
      await expect(page.getByLabel('How did you sign in to WBS?')).toHaveCount(1);
      await expect(page.getByRole('group', { name: 'Prove other.example' })).toBeVisible();
    });

    test('disables the selected proof form while create is held', async ({ page }) => {
      await answerAsSuperAdmin(page, 'create-held');
      await page.goto('/organization');
      await page.getByLabel('Verified domain').selectOption('available');
      await page.getByLabel('Auth0 connection name').fill('new-company-oidc');
      await page.getByLabel('Strategy', { exact: true }).selectOption('oidc');
      await page.getByLabel('Login slug').fill('new-company-login');
      await page.getByRole('button', { name: 'Start proof for other.example' }).click();
      await page.getByLabel('How did you sign in to WBS?').selectOption('password');
      await page.getByLabel('Your WBS password').fill('fresh-password');
      const requested = page.waitForRequest('**/api/organization/sso-connections');
      await page.getByRole('button', { name: 'Create connection' }).click();
      expect((await requested).postDataJSON()).toEqual({
        domainClaimId: 'available',
        auth0Connection: 'new-company-oidc',
        strategy: 'oidc',
        loginSlug: 'new-company-login',
      });
      await expect(page.getByLabel('How did you sign in to WBS?')).toBeDisabled();
      await expect(page.getByLabel('Your WBS password')).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Link your company sign-in' })).toBeDisabled();
      await expect(page.getByRole('group', { name: 'Prove other.example' })).toBeVisible();
    });

    test('reaches every control by Tab', async ({ page }) => {
      await answerAsSuperAdmin(page);
      await page.goto('/organization');
      await expect(
        page.getByRole('button', { name: 'Share people across projects' }),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Start proof for other.example' }).click();
      await page.getByLabel('How did you sign in to WBS?').selectOption('password');
      await page.getByRole('button', { name: 'Edit connection for other.example' }).click();
      await page.getByRole('heading', { name: 'Organization', exact: true }).click();
      const expected = await page
        .locator('main')
        .evaluate((main) => main.querySelectorAll('button:not([disabled]), input, select').length);
      const reached = new Set<string>();
      for (let press = 0; press < 60 && reached.size < expected; press += 1) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => {
          const active = document.activeElement;
          if (active?.closest('main') == null) return null;
          const name = active.getAttribute('aria-label') ?? (active.id || active.textContent);
          return `${active.tagName}:${name}`;
        });
        if (focused !== null) reached.add(focused);
      }
      // Proof: 2026-10-12, `tabIndex={-1}` on the sharing panel's switch
      // failed this at both widths: expected 17, received 16.
      expect(reached.size).toBe(expected);
    });
  });
}

/** The sharing panel is fully visible and contained before its attached pixel evidence is captured. */
async function captureSharingPanel(
  page: Page,
  testInfo: TestInfo,
  colorScheme: 'light' | 'dark',
): Promise<void> {
  const panel = page.getByRole('region', { name: 'Shared people', exact: true });
  await expect(page.locator('html')).toHaveClass(
    colorScheme === 'dark' ? /dark/ : /^(?!.*\bdark\b).*$/,
  );
  await panel.scrollIntoViewIfNeeded();
  const geometry = await panel.evaluate((section) => {
    const rectangle = section.getBoundingClientRect();
    const main = section.closest('main');
    if (main === null) throw new Error('Shared people must belong to main');
    return {
      left: rectangle.left,
      right: rectangle.right,
      top: rectangle.top,
      bottom: rectangle.bottom,
      width: rectangle.width,
      height: rectangle.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mainOverflow: main.scrollWidth - main.clientWidth,
      panelOverflow: section.scrollWidth - section.clientWidth,
    };
  });
  expect(geometry.width).toBeGreaterThan(0);
  expect(geometry.height).toBeGreaterThan(0);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  // Proof: min-width:600px around the production panel failed here at 375px: right edge 600 (2026-10-16).
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.documentOverflow).toBe(0);
  expect(geometry.mainOverflow).toBe(0);
  expect(geometry.panelOverflow).toBe(0);
  const screenshot = testInfo.outputPath('shared-people.png');
  await panel.screenshot({ path: screenshot });
  await testInfo.attach('Shared people panel', {
    path: screenshot,
    contentType: 'image/png',
  });
}

for (const width of [375, 1280]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`Shared people at ${String(width)}px in ${colorScheme}`, () => {
      test.use({ viewport: { width, height: width === 375 ? 812 : 900 }, colorScheme });

      for (const canSwitch of [true, false]) {
        test(`keeps unavailable isolated people read-only with canSwitch ${String(canSwitch)}`, async ({
          page,
        }, testInfo) => {
          let patches = 0;
          page.on('request', (request) => {
            if (
              request.method() === 'PATCH' &&
              new URL(request.url()).pathname === '/api/organization'
            )
              patches += 1;
          });
          await answerAsSuperAdmin(page, 'ready', {
            sharedPeople: false,
            sharingAvailable: false,
            canSwitch,
          });
          await page.goto('/organization');
          const panel = page.getByRole('region', { name: 'Shared people', exact: true });
          // Proof: omitting SharingPanel from organization-page.tsx failed this region assertion (2026-10-16).
          await expect(panel).toBeVisible();
          for (const visit of ['initial', 'reloaded']) {
            if (visit === 'reloaded') await page.reload();
            // Proof: wrong isolated explanation and bypassing the unavailable branch each failed this exact copy assertion (2026-10-16).
            await expect(panel.locator('p')).toHaveText([ISOLATED_WORDS, UNAVAILABLE_WORDS]);
            await expect(panel.locator('button, input, select, [role="group"]')).toHaveCount(0);
            expect(patches).toBe(0);
          }
          await captureSharingPanel(page, testInfo, colorScheme);
        });
      }

      test('explains supported-release permission without controls', async ({ page }, testInfo) => {
        await answerAsSuperAdmin(page, 'ready', {
          sharedPeople: false,
          sharingAvailable: true,
          canSwitch: false,
        });
        await page.goto('/organization');
        const panel = page.getByRole('region', { name: 'Shared people', exact: true });
        // Proof: bypassing the production canSwitch branch removed the permission sentence and failed here (2026-10-16).
        await expect(panel.locator('p')).toHaveText([ISOLATED_WORDS, SUPER_ADMIN_WORDS]);
        await expect(panel.locator('button, input, select, [role="group"]')).toHaveCount(0);
        await captureSharingPanel(page, testInfo, colorScheme);
      });

      test('rejects an unsupported forbidden sharing reply', async ({ page }, testInfo) => {
        await answerAsSuperAdmin(page, 'ready', { error: 'forbidden' });
        await page.goto('/organization');
        const panel = page.getByRole('region', { name: 'Shared people', exact: true });
        // Proof: adding forbidden to readCapacityMode refusals produced the super-admin sentence and failed here (2026-10-16).
        await expect(panel.getByRole('alert')).toHaveText(
          'The server returned an unexpected response. Try again.',
        );
        await expect(panel.locator('p')).toHaveText([
          'The server returned an unexpected response. Try again.',
        ]);
        await expect(panel.getByRole('status')).toHaveCount(0);
        await expect(panel.locator('button, input, select, [role="group"]')).toHaveCount(0);
        await captureSharingPanel(page, testInfo, colorScheme);
      });
    });
  }
}
