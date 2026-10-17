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
 * bevel (`outset`, `inset`, `groove`, `ridge`), is painted in the element's own
 * text colour, or — on a control box — is the surface line.
 *
 * A border that matches the ink is the bare `border` utility's fallback: with
 * no preflight, `border-color` starts at `currentColor`. No surface in the
 * palette asks for its text colour as its edge, so a match is the fallback.
 *
 * A control box (a text box, select, summary, or a button that draws a border)
 * on `--border` is a field or button at 1.23:1, which is what the base layer's
 * default gives a bare `border` (review of #564, B1): a control names
 * `border-control-edge`.
 *
 * Radios and check boxes are skipped: their ring is the control itself, not a
 * frame, and the settings radios draw it in the ink on purpose.
 */
function strayFrames(page: Page): Promise<StrayFrame[]> {
  return page.evaluate(() => {
    const stray: StrayFrame[] = [];
    const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;
    const probe = document.createElement('div');
    probe.style.borderColor = 'var(--border)';
    document.body.append(probe);
    const surfaceLine = getComputedStyle(probe).borderTopColor;
    probe.remove();
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
      const control = node.matches('button, input, select, textarea, summary');
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
        if (control && colour === surfaceLine) {
          stray.push({ where: describe(node), fault: `${side} edge on the surface line` });
          break;
        }
      }
    }
    return stray;
  });
}

/**
 * Every visible control in `scope` not drawn in the chrome's vocabulary: the
 * platform's button has a square corner (and, since the base layer took its
 * bevel, nothing else), where every chrome control is `rounded-md`, 6px —
 * `organization.spec.ts`' `controlsOf` rule.
 */
function bareControls(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope);
    if (root === null) throw new Error(`nothing matches ${scope}`);
    return [...root.querySelectorAll('button, input, select, textarea')]
      .filter((node) => node.getClientRects().length > 0)
      .filter(
        (node) => !(node instanceof HTMLInputElement && ['radio', 'checkbox'].includes(node.type)),
      )
      .filter((node) => getComputedStyle(node).borderTopLeftRadius !== '6px')
      .map(
        (node) =>
          `${node.tagName.toLowerCase()} "${(node.getAttribute('aria-label') ?? (node as HTMLElement).innerText).trim().slice(0, 30)}" radius ${getComputedStyle(node).borderTopLeftRadius}`,
      );
  }, scope);
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

    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Return to Plan' })).toBeVisible();
    await expectNoStrayFrames(page, 'the Board');
    // Proof, watched 2026-10-18 on 555d6fc25: `the Board's controls` listed
    // `button "Return to Plan" radius 0px` — a bare button the base reset had
    // left as plain text (review of #564, B2).
    expect(await bareControls(page, '[aria-label="Step board"]'), "the Board's controls").toEqual(
      [],
    );
    await page.getByRole('button', { name: 'Plan', exact: true }).last().click();
    await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();

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
  // The reset zeroes the platform's frame, never an author's: an outline
  // button's `border` still draws 1px. A guard, not a fix: it passed before.
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  const widths = await page
    .getByRole('button', { name: 'local-dev' })
    .last()
    .evaluate((node) => getComputedStyle(node).borderTopWidth);
  expect(widths).toBe('1px');
});

async function answerOnboarding(page: Page, state: unknown): Promise<void> {
  await page.unrouteAll();
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    switch (`${route.request().method()} ${url.pathname}`) {
      case 'GET /api/auth/me':
        return json({ user: { id: 'u1', username: 'sam', scopes: ['read', 'write'] } });
      case 'GET /api/onboarding':
        return json(state);
      default:
        return json({ error: 'not_found' }, 404);
    }
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`draws onboarding in the chrome's controls and edges, in ${scheme} (review of #564)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    // Proof, watched 2026-10-18 on 555d6fc25: `create_organization` failed on
    // `input "" · Left edge on the surface line` (B1), and with the fields named
    // `border-control-edge`, the controls check failed on `button "Sign out"
    // radius 0px`, `button "Create organization" radius 0px` (B2).
    for (const [state, ready] of [
      [{ state: 'create_organization' }, 'Create organization'],
      [{ state: 'verification_required' }, 'Send code'],
      [
        {
          state: 'join_organization',
          organization: { id: 'o1', name: 'Acme' },
          pending: false,
        },
        'Request to join',
      ],
    ] as const) {
      await answerOnboarding(page, state);
      await page.goto('/');
      await expect(page.getByRole('button', { name: ready })).toBeVisible();
      await expectNoStrayFrames(page, `onboarding ${state.state}`);
      expect(await bareControls(page, 'main'), `onboarding ${state.state}`).toEqual([]);
    }
  });

  test(`draws a phone card sheet's controls on the control edge, in ${scheme} (review of #564)`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: scheme });
    const seeded = await seedPlan(
      page,
      {
        name: 'Card sheets',
        rows: [
          {
            ref: 'a',
            name: 'Sign-up form',
            estimates: { Dev: { optimistic: 2, realistic: 3, pessimistic: 5 } },
          },
          { ref: 'b', name: 'Rate limiting', afterRef: 'a' },
        ],
      },
      { run: String(Date.now()), worker: info.workerIndex, test: `sheets-${scheme}` },
    );
    await openSeededPlan(page, seeded);
    await page.getByRole('button', { name: 'Plan actions' }).click();
    const starts = page.getByLabel('Project start date');
    await starts.fill('2026-06-01');
    await starts.blur();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Plan actions' })).toBeHidden();
    const add = page.getByRole('button', { name: 'Add details to 010', exact: true });
    if ((await add.getAttribute('aria-expanded')) !== 'true') await add.click();
    await expect(add).toHaveAttribute('aria-expanded', 'true');
    // Proof, watched 2026-10-18 on 555d6fc25: the Earliest start sheet failed on
    // `input "Earliest start for 010" · Left edge on the surface line`,
    // `input "Why 010 may not start earlier"` and `button "Save"` — the sheet
    // renders outside the grid, so the base default reached it (B1).
    for (const field of ['Earliest start for 010', 'Priority for 010', 'Depends on for 010']) {
      await page.getByRole('button', { name: field, exact: true }).click();
      const sheet = page.getByRole('dialog').last();
      await expect(sheet).toBeVisible();
      await expectNoStrayFrames(page, `the ${field} sheet`);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    }
  });
}
