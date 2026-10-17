import { expect, type Page, test } from '@playwright/test';

import { fixtureClient, fixtureSuccess, openSeededPlan, seedPlan } from './plan-fixture';

/**
 * The frames the chrome draws, read off every visible element outside the
 * grid (UI review F-153, F-154): no platform bevel survives on a bare element,
 * and no border falls back to `currentColor` — the text's ink — because nothing
 * named its colour.
 *
 * Computed style rather than pixels, on purpose: the faults are which rule
 * decided a border, and a sweep of every element finds the next bare one too,
 * where a pixel probe only measures the surfaces somebody thought to list.
 */

interface StrayFrame {
  /** The element, as a short CSS-ish path a reader can find it by. */
  where: string;
  /** What is wrong with its border. */
  fault: string;
}

/**
 * Every visible element outside `[data-grid]` whose border is the platform's
 * bevel (`outset`, `inset`, `groove`, `ridge`) or is painted in the element's
 * own text colour.
 *
 * A border that matches the ink is the bare `border` utility's fallback: with
 * no preflight, `border-color` starts at `currentColor`. No surface in the
 * palette asks for its text colour as its edge, so a match is the fallback.
 * Native radios and check boxes are skipped: the engine draws those itself and
 * their computed border is never painted.
 */
function strayFrames(page: Page): Promise<StrayFrame[]> {
  return page.evaluate(() => {
    const stray: StrayFrame[] = [];
    const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;
    const describe = (node: Element): string => {
      const label =
        node.getAttribute('aria-label') ??
        (node instanceof HTMLElement ? node.innerText.trim().slice(0, 30) : '');
      const attribute = [...node.attributes].find((each) => each.name.startsWith('data-'));
      return `${node.tagName.toLowerCase()}${attribute === undefined ? '' : `[${attribute.name}]`} "${label}"`;
    };
    for (const node of document.body.querySelectorAll('*')) {
      if (node.closest('[data-grid]') !== null) continue;
      if (node.getClientRects().length === 0) continue;
      if (node instanceof HTMLInputElement && ['radio', 'checkbox'].includes(node.type)) continue;
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden') continue;
      for (const side of sides) {
        const width = parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`));
        const kind = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
        const colour = style.getPropertyValue(`border-${side.toLowerCase()}-color`);
        if (width === 0 || kind === 'none' || kind === 'hidden') continue;
        if (['outset', 'inset', 'groove', 'ridge'].includes(kind)) {
          stray.push({ where: describe(node), fault: `${String(width)}px ${kind}` });
          break;
        }
        if (colour === style.color && !colour.endsWith(', 0)') && colour !== 'transparent') {
          stray.push({ where: describe(node), fault: `${side} edge in its ink ${colour}` });
          break;
        }
      }
    }
    return stray;
  });
}

async function expectNoStrayFrames(page: Page, surface: string): Promise<void> {
  await expect.poll(() => strayFrames(page), { message: surface }).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`draws no platform bevel and no ink-coloured frame, in ${scheme} (F-153, F-154)`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    // Proof, watched 2026-10-17: before this change the home card failed on
    // `section[data-no-project-open] … Top edge in its ink oklch(0.129 0.042
    // 264.695)` (light) and `oklch(0.984 0.003 247.858)` (dark). With the
    // base layer's `button`/`fieldset` frame reset deleted, the Gantt failed on
    // `button[data-gantt-label] "010 - Sign-up form" · 2px outset`; with the
    // labels patched past, Project settings failed on `button "Close" · 2px
    // outset`; with only `fieldset` dropped from the reset, Steps failed on
    // `fieldset "A dependency waits for…" · 2px groove`.
    const seeded = await seedPlan(
      page,
      {
        name: 'Chrome frames',
        rows: [
          {
            ref: 'a',
            name: 'Sign-up form',
            estimates: { Dev: { optimistic: 2, realistic: 3, pessimistic: 5 } },
          },
          {
            ref: 'b',
            name: 'Rate limiting',
            afterRef: 'a',
            estimates: { Dev: { optimistic: 1, realistic: 2, pessimistic: 3 } },
          },
        ],
      },
      { run: String(Date.now()), worker: info.workerIndex, test: `frames-${scheme}` },
    );
    // Two projects and none remembered: the page offers them rather than opening one.
    fixtureSuccess(
      'postApiProjects',
      await fixtureClient(page).postApiProjects({
        body: { name: `Sibling of ${seeded.projectName}` },
      }),
    );
    await page.evaluate(() => {
      localStorage.removeItem('wbs.project');
    });
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'No project open' })).toBeVisible();
    await expectNoStrayFrames(page, 'the home card');

    await openSeededPlan(page, seeded);
    await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
    await expectNoStrayFrames(page, 'the plan');

    for (const panel of ['Filters', 'Views', 'Columns', 'Saved plans', 'Export / Import']) {
      await page.locator('summary', { hasText: panel }).click();
      await expectNoStrayFrames(page, `the ${panel} popover`);
      await page.keyboard.press('Escape');
    }

    const gantt = page.getByRole('button', { name: 'Gantt', exact: true });
    await gantt.click();
    await expect(gantt).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-gantt-label]').first()).toBeVisible();
    await expectNoStrayFrames(page, 'the Gantt');
    await gantt.click();

    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await expectNoStrayFrames(page, 'the cheat sheet');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'local-dev' }).last().click();
    await expectNoStrayFrames(page, 'the account menu');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Project settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Project settings' });
    await expect(dialog).toBeVisible();
    for (const tab of ['Teams', 'Priorities', 'Steps', 'Estimating', 'Optimization', 'Timezone']) {
      await dialog.getByRole('tab', { name: tab, exact: true }).click();
      await expectNoStrayFrames(page, `Project settings › ${tab}`);
    }
    await page.keyboard.press('Escape');

    for (const path of ['/directory', '/spaces']) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Pages' })).toBeVisible();
      await expectNoStrayFrames(page, path);
    }
  });
}

test('keeps a frame where one is asked for (F-153)', async ({ page }) => {
  // The reset zeroes the platform's frame, never an author's: the outline
  // button's `border` and a text box's still draw 1px.
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  const widths = await page
    .getByRole('button', { name: 'local-dev' })
    .last()
    .evaluate((node) => getComputedStyle(node).borderTopWidth);
  expect(widths).toBe('1px');
});
