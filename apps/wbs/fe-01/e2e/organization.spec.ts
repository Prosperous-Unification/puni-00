import { expect, type Page, test } from '@playwright/test';

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

async function answerAsSuperAdmin(
  page: Page,
  mode: 'ready' | 'denied' | 'held' | 'create-held' | 'enforce-held' = 'ready',
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
      case 'GET /api/organization':
        return json({ sharedPeople: false, sharingAvailable: true, canSwitch: true });
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
