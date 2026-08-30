import { expect, type Page, test } from '@playwright/test';

import { createProject } from './create-project';

/**
 * The toolbar's width with one `Project settings` control where three dialogs'
 * triggers stood, measured by a browser.
 *
 * `project-config-modal`'s one measurable claim (design D5): the folded toolbar
 * at 1280 is **no wider than it was**. jsdom lays nothing out, so the only thing
 * that can say how wide a row of buttons is, is Chromium.
 */

/**
 * How far a measured edge may be from the pinned figure, in CSS px. Two, as in
 * `plan-surface.spec.ts`: the numbers compared are rects from two runs of one
 * browser, and a fractional glyph advance lands in both of them.
 */
const NEARLY = 2;

/**
 * The toolbar's controls at 1280 on a fresh project **before** this change, with
 * ,  and  as three labelled buttons — measured on
 * `main` at `1ac9344` in this file's own Chromium, on a project with no rows.
 *
 * Two numbers, and why they are not the one D5 seems to ask for. "The folded
 * toolbar at 1280 is no wider than before" reads as a content width — and that
 * figure on `main` is **1248px, which is the bar's own width**, because at 1280
 * the eighteen controls already wrap to a **second row**. A bar that is already
 * full measures 1248 whatever is on it: the check would pass with three buttons
 * added and pass with ten removed, which is a check that cannot fail.
 *
 * What can be measured is what the bar has to **lay out** — every control's
 * width plus the gaps between them, `1445.33px` over 18 controls at a 6px gap —
 * and how many rows that took (`2`). Removing two labelled buttons and adding
 * one square one has to reduce the first and cannot increase the second.
 *
 * Both pinned rather than re-derived, for `plan-toolbar-controls-gate`'s reason:
 * the bar they describe no longer exists to be measured, and a budget resolved
 * from the current bar is decoration.
 */
const LAID_OUT_BEFORE_AT_1280 = 1445.33;
const ROWS_BEFORE_AT_1280 = 2;

/** Registers a throwaway account and opens an empty project. */
async function freshProject(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page);
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
}

/**
 * The toolbar's laid-out shape: every control's width plus the gaps between them
 * (what the bar has to fit, whatever it wrapped to) and how many rows it took.
 */
function measureToolbar(page: Page): Promise<{ laidOut: number; rows: number; controls: number }> {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[data-toolbar]');
    if (toolbar === null) throw new Error('the plan has no toolbar');
    const boxes = [...toolbar.children].map((child) => child.getBoundingClientRect());
    if (boxes.length === 0) throw new Error('the toolbar has no controls');
    const gap = Number.parseFloat(getComputedStyle(toolbar).columnGap);
    if (!Number.isFinite(gap)) throw new Error('the toolbar has no column gap to read');
    return {
      laidOut: boxes.reduce((total, box) => total + box.width, 0) + gap * (boxes.length - 1),
      rows: new Set(boxes.map((box) => Math.round(box.top))).size,
      controls: boxes.length,
    };
  });
}

test.describe('the project settings control, in a browser', () => {
  test('the toolbar keeps its 1280 budget with one settings control', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await freshProject(page);

    // Precondition first, so the budget below cannot be met by a bar that
    // simply lost its controls: the one control is there and the three are not.
    await expect(page.getByRole('button', { name: 'Project settings' })).toBeVisible();
    for (const gone of ['Teams', 'Priorities', 'Phases']) {
      await expect(
        page.locator('[data-toolbar]').getByRole('button', { name: gone, exact: true }),
      ).toHaveCount(0);
    }

    const measured = await measureToolbar(page);
    // Non-vacuity: a bar with fewer controls than three-into-one leaves is a bar
    // that lost something else, and the width below would be flattering it.
    expect(measured.controls, 'the toolbar lost controls beyond the three').toBeGreaterThanOrEqual(
      16,
    );
    // No more to lay out than before, and no more rows than before — the whole
    // of D5's measurable claim. The pins are the old bar's figures, so a bar
    // that grew back would fail here even if it still fitted the window.
    //
    // **Two faults, because the first never reaches this line.** Restoring
    // `<Button>Teams</Button>` and `<Button>Priorities</Button>` beside the
    // settings control fails on the **precondition** above — `Expected: 0 /
    // Received: 1`, the Teams control being back — and the run stops there
    // with this assertion unevaluated. A `Proof:` naming only that fault would
    // be evidence for the precondition and none at all for the budget.
    //
    // Proof: one control added whose name matches none of the three, so the
    // precondition still passes and the bar is merely wider —
    // `<Button variant="outline" size="sm">Capacity planning and
    // priorities</Button>` in `toolbarControls`. Watched failing on
    // `1465px of controls to lay out, against the 1445.33px the bar had with
    // three buttons`, `Expected: <= 1447.33 / Received: 1464.703125`;
    // 2026-08-30. Both faults are in `verify.md`.
    expect(
      measured.laidOut,
      `${String(Math.round(measured.laidOut))}px of controls to lay out, against the ${String(
        LAID_OUT_BEFORE_AT_1280,
      )}px the bar had with three buttons`,
    ).toBeLessThanOrEqual(LAID_OUT_BEFORE_AT_1280 + NEARLY);
    expect(measured.rows, 'the toolbar wraps to more rows than it did').toBeLessThanOrEqual(
      ROWS_BEFORE_AT_1280,
    );
  });

  test('opens on its control, offers three sections, and closes back onto it', async ({ page }) => {
    await freshProject(page);
    const control = page.getByRole('button', { name: 'Project settings' });
    await control.click();
    const dialog = page.getByRole('dialog', { name: 'Project settings' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab')).toHaveText(['Teams', 'Priorities', 'Phases']);

    // The arrow keys walk the list and select as they go — a real keydown on a
    // real focused tab, which is the half jsdom's synthetic dispatch cannot see.
    await dialog.getByRole('tab', { name: 'Teams' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('tab', { name: 'Priorities' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Name of band 1')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(control).toBeFocused();
  });
});
