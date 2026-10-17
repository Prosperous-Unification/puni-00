import { expect, type Page, test } from '@playwright/test';

import { paintedLeftEdge } from './control-edge';
import { createProject } from './create-project';

/**
 * The outline button's edge, painted (UI review F-124): every `outline` control
 * draws a 1 px boundary at 3:1 or more against the ground it stands on and
 * against its own fill, in both palettes — whether it is a `<Button>` or an
 * element that takes `buttonVariants` directly (the sign-in page's SSO link,
 * the toolbar's Freeze # menu).
 */

/** The signed-out page, reached the way `capture5.ts` reaches it: the session read says 401. */
async function openSignIn(page: Page): Promise<void> {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in with password' })).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const) {
  test(`outline controls paint a 3:1 edge, in ${scheme} (F-124)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    // Proof, watched 2026-10-16 on 3e06eb5a4: failed on `Continue with SSO:
    // outside · Expected: >= 3 · Received: 1.08…` (light) and `1.01…` (dark) —
    // `cva` appends without merging, so the base's `border-0 bg-transparent`
    // and the variant's `border bg-background` both reached the `<a>` and the
    // stylesheet's order kept the zero. With the merge in and the edge still
    // `--input`: `Received: 1.22…` (light) and `1.28…` (dark).
    await openSignIn(page);
    const controls = [
      ['Continue with SSO', page.getByRole('link', { name: 'Continue with SSO' })],
    ] as const;
    for (const [name, control] of controls) {
      // Polled: the palette flip interpolates its colours (`dark-mode.spec.ts`' settle).
      await expect
        .poll(async () => (await paintedLeftEdge(page, control)).outside, {
          message: `${name}: outside`,
        })
        .toBeGreaterThanOrEqual(3);
      expect(
        (await paintedLeftEdge(page, control)).inside,
        `${name}: inside`,
      ).toBeGreaterThanOrEqual(3);
    }

    await page.unroute('**/api/auth/me');
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
    await createProject(page, `Control edge ${scheme} ${String(Date.now())}`);
    await page.mouse.move(2, 400);
    for (const name of ['Rename project', 'Freeze #']) {
      const control = page.getByRole('button', { name, exact: true });
      await expect(control).toBeVisible();
      const edge = await paintedLeftEdge(page, control);
      expect(edge.outside, `${name}: outside`).toBeGreaterThanOrEqual(3);
      expect(edge.inside, `${name}: inside`).toBeGreaterThanOrEqual(3);
    }

    // Every other control box on the bar draws the same edge (F-152, F-137): the
    // disclosures, the selects and the text boxes beside the outline buttons.
    // Proof, watched 2026-10-17: before this change the first of them failed
    // on `Find: outside · Expected: >= 3 · Received: 1.22…` (light) and
    // `1.44…` (dark), the `--input` hairline.
    const boxes = [
      ['Find', page.getByRole('textbox', { name: 'Find', exact: true })],
      ['Project start date', page.getByLabel('Project start date')],
      ['Final estimate', page.getByLabel('Final estimate')],
      ...['Saved plans', 'Filters', 'Views', 'Columns', 'Export / Import'].map(
        (name) => [name, page.locator('summary', { hasText: name })] as const,
      ),
    ] as const;
    for (const [name, control] of boxes) {
      await expect(control).toBeVisible();
      const edge = await paintedLeftEdge(page, control);
      expect(edge.outside, `${name}: outside`).toBeGreaterThanOrEqual(3);
      expect(edge.inside, `${name}: inside`).toBeGreaterThanOrEqual(3);
    }
  });
}
