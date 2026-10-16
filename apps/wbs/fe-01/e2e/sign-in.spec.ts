import { expect, type Page, test } from '@playwright/test';

import { measureInk } from './measure-ink';
import { expectAnchoredColumn } from './signed-out-column';

/**
 * The signed-out page, measured (UI review F-052): one centred column with the
 * word mark, a line saying what the product is, and the sign-in panel, and no
 * empty error line holding the password field away from its button.
 */

/** The local identity's account button, as `header.spec.ts` finds it. */
const SIGNED_IN_AS = 'local-dev';

/**
 * Signs the local identity out through the account menu and waits for the card.
 *
 * A real exit, as `header.spec.ts` takes it: a reload would resolve the fixed
 * development identity again, so nothing here reloads afterwards.
 */
async function signOut(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: SIGNED_IN_AS }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with password' })).toBeVisible();
}

/** The boxes the layout claims are about, read in one pass. */
function measurePage(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string): DOMRect => {
      const node = document.querySelector(selector);
      if (node === null) throw new Error(`the sign-in page has no ${selector}`);
      return node.getBoundingClientRect();
    };
    const card = box('[data-sign-in] [data-sign-in-card]');
    const password = box('input[name="password"]');
    const submit = box('button[type="submit"]');
    return {
      viewport: { width: window.innerWidth },
      card: { left: card.left, right: card.right },
      passwordToSubmit: submit.top - password.bottom,
    };
  });
}

test.describe('the sign-in page (F-052)', () => {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 375, height: 812 },
  ]) {
    test(`centres one column and leaves no empty error line at ${String(size.width)}`, async ({
      page,
    }) => {
      // Proof, watched 2026-10-14 on the page before this change: failed on the
      // missing `[data-sign-in]` column (`the sign-in page has no [data-sign-in]`).
      // With only the two data attributes added to the old layout: at 1440 the
      // column's centre stood `Received: 496` px off the window's, at 1024
      // `Received: 288`, and at 375 (where the old card already filled the width)
      // the password field stood `Received: 52` px above its button — the reserved
      // `min-h-5` line between two 16px gaps. (The column checks now live in
      // `expectAnchoredColumn`, whose message reads `the signed-out page has no
      // [data-sign-in]`.)
      await signOut(page);
      await page.setViewportSize(size);
      // Centred across, and anchored by its top near the middle of the window
      // (F-090), so it reads as centred at rest and grows downward.
      await expectAnchoredColumn(page);
      const measured = await measurePage(page);
      const cardMiddle = (measured.card.left + measured.card.right) / 2;
      expect(Math.abs(cardMiddle - measured.viewport.width / 2)).toBeLessThanOrEqual(1);
      // At least the phone's 16px gutter on both sides.
      expect(measured.card.left).toBeGreaterThanOrEqual(16);
      expect(measured.viewport.width - measured.card.right).toBeGreaterThanOrEqual(16);
      // One form gap, not a reserved blank line between two of them.
      expect(measured.passwordToSubmit).toBeLessThanOrEqual(16.5);
    });
  }

  test('says what the product is under its word mark, readable in both palettes', async ({
    page,
  }) => {
    // Proof, watched 2026-10-14 on the page before this change: failed on the
    // missing line: `expect(locator).toBeVisible() failed · element(s) not found`.
    await signOut(page);
    const column = page.locator('[data-sign-in]');
    await expect(column.getByRole('heading', { level: 1, name: 'WBS tool v2' })).toBeVisible();
    const line = column.getByText(/work breakdown structure/i);
    await expect(line).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      // Polled: the palette flip interpolates its colours (`dark-mode.spec.ts`' settle).
      await expect
        .poll(async () => (await measureInk(line)).contrast, { message: `${scheme} line` })
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  test('opens a refused sign-in’s message between the field and the button', async ({ page }) => {
    // Proof, watched 2026-10-14: with the message's row left at `0fr` whatever it
    // held, this failed on `the message is drawn clipped · Expected: > 15 ·
    // Received: 12` — the line's bottom padding, the words cut away above it.
    await signOut(page);
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_credentials' }),
      }),
    );
    const heading = page.getByRole('heading', { level: 1, name: 'WBS tool v2' });
    const headingTop = (): Promise<number> =>
      heading.evaluate((node) => node.getBoundingClientRect().top);
    const restingTop = await headingTop();
    await page.getByLabel('Username').fill('someone');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in with password' }).click();
    const message = page.getByText('Username or password is incorrect.');
    await expect(message).toBeVisible();
    // Settled, then measured: the row opens with a short transition.
    await expect
      .poll(() => message.evaluate((node) => node.getBoundingClientRect().height), {
        message: 'the message is drawn clipped',
      })
      .toBeGreaterThan(15);
    const placed = await page.evaluate(() => {
      const text = [...document.querySelectorAll('[role="status"]')].find((node) =>
        node.textContent.includes('incorrect'),
      );
      const password = document.querySelector('input[name="password"]');
      const submit = document.querySelector('button[type="submit"]');
      if (text === undefined || password === null || submit === null)
        throw new Error('the refused form lost a part');
      return {
        afterField: text.getBoundingClientRect().top - password.getBoundingClientRect().bottom,
        beforeButton: submit.getBoundingClientRect().top - text.getBoundingClientRect().bottom,
      };
    });
    expect(placed.afterField).toBeGreaterThanOrEqual(0);
    expect(placed.beforeButton).toBeGreaterThanOrEqual(0);
    // The panel grows downward and nothing above the field moves (F-090, the D3
    // rule). Proof, watched 2026-10-15 on the vertically centred column:
    // failed on `the heading moved · Expected: <= 0.5 · Received: 16`.
    expect(Math.abs((await headingTop()) - restingTop), 'the heading moved').toBeLessThanOrEqual(
      0.5,
    );
  });
});

/**
 * The word mark is the signed-out family's fixed point (UI review F-125,
 * decision D11): sign-in, server unavailable and a proxy's refusal draw their
 * cards under one anchor, so a Try again that lands on another card never moves
 * the heading. Each state is reached from inside the page: the session read
 * answered 401 (no session), 502 (a stopped be-01 behind its proxy) and 403 in
 * HTML (a WAF before be-01 — the access-refused card where that card exists, the
 * sign-in form with a notice where it does not; either way the same column).
 */
test.describe('the signed-out word mark (F-125)', () => {
  const states = [
    ['sign-in', { status: 401, contentType: 'application/json', body: '{}' }],
    ['server unavailable', { status: 502, contentType: 'text/plain', body: 'Bad Gateway' }],
    ['access refused', { status: 403, contentType: 'text/html', body: '<h1>Access denied</h1>' }],
  ] as const;
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 375, height: 812 },
  ]) {
    test(`stands at one height on every signed-out card at ${String(size.width)}`, async ({
      page,
    }) => {
      // Proof, watched 2026-10-16 on 3e06eb5a4 (a padding per card,
      // `COLUMN_ANCHOR`): failed at 1440 on `server unavailable: the word mark
      // moved · Expected: <= 0.5 · Received: 96`.
      await page.setViewportSize(size);
      const heading = page.getByRole('heading', { level: 1, name: 'WBS tool v2' });
      const tops = new Map<string, number>();
      for (const [state, reply] of states) {
        await page.route('**/api/**', (route) =>
          route.request().url().endsWith('/api/auth/me') || state === 'server unavailable'
            ? route.fulfill(reply)
            : route.continue(),
        );
        await page.goto('/');
        await expect(heading).toBeVisible();
        await expect(
          page.locator('[data-sign-in] [data-sign-in-card], [data-server-unavailable]'),
        ).toBeVisible();
        tops.set(state, await heading.evaluate((node) => node.getBoundingClientRect().top));
        await page.unroute('**/api/**');
      }
      const anchor = tops.get('sign-in');
      if (anchor === undefined) throw new Error('the sign-in card was not measured');
      for (const [state, top] of tops)
        expect(Math.abs(top - anchor), `${state}: the word mark moved`).toBeLessThanOrEqual(0.5);
    });
  }
});
