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

async function answerAsSuperAdmin(page: Page): Promise<void> {
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
      case 'GET /api/organization/domains':
        return json({
          domains: [
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

    test('reaches every control by Tab', async ({ page }) => {
      await answerAsSuperAdmin(page);
      await page.goto('/organization');
      await expect(
        page.getByRole('button', { name: 'Share people across projects' }),
      ).toBeVisible();

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
