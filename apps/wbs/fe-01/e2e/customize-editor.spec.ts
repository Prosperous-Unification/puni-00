import { expect, type Locator, type Page, test } from '@playwright/test';

import { paintedLeftEdge } from './control-edge';
import { openSeededPlan, seedPlan } from './plan-fixture';

/**
 * The plan table's Customize dependency editor, opened from a Depends on cell
 * at 1440 (UI review F-176, F-177): what it is drawn in, and whether all of it
 * can be reached on a plan too short to hold it inside the table's frame.
 *
 * Three rows: the table's scroll frame is a few rows tall, and the editor is
 * taller than that, which is the case the review found Cancel and Add hidden in.
 */
async function openCustomize(page: Page, scheme: 'light' | 'dark'): Promise<Locator> {
  await page.emulateMedia({ colorScheme: scheme });
  await page.setViewportSize({ width: 1440, height: 900 });
  const info = test.info();
  const seeded = await seedPlan(
    page,
    {
      name: 'Customize a dependency',
      rows: [
        { ref: 'form', name: 'Sign-up form' },
        { ref: 'tour', name: 'Welcome tour', afterRef: 'form' },
        { ref: 'invite', name: 'Invite teammates', afterRef: 'tour' },
      ],
    },
    { run: String(Date.now()), worker: info.workerIndex, test: `customize-${scheme}` },
  );
  await openSeededPlan(page, seeded);
  const depends = page.getByLabel('Add a dependency to 030');
  await depends.click();
  await depends.fill('010');
  await page.getByRole('button', { name: 'Customize 010 - Sign-up form', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Customize dependency' });
  await expect(editor).toBeVisible();
  await page.mouse.move(2, 890);
  return editor;
}

/** Whether a hit test at the control's centre lands on the control itself. */
function reachable(control: Locator): Promise<boolean> {
  return control.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && node.contains(hit);
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`draws the grid's Customize editor whole and in the chrome's controls, ${scheme} (F-176, F-177)`, async ({
    page,
  }) => {
    const editor = await openCustomize(page, scheme);

    // Every part of it inside the window, and the actions answer a click where
    // they are drawn.
    // Proof: on 43ead5a10 this failed on `Cancel is reachable · Expected: true ·
    // Received: false`: the editor hung from the cell inside the table's
    // scroll frame and ran past its foot, so a hit test at Cancel landed on the
    // page section.
    const box = await editor.boundingBox();
    if (box === null) throw new Error('the editor has no box');
    expect(box.y, 'the editor’s top inside the window').toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, 'the editor’s foot inside the window').toBeLessThanOrEqual(900);
    for (const name of ['Cancel', 'Add'] as const) {
      expect(
        await reachable(editor.getByRole('button', { name, exact: true })),
        `${name} is reachable`,
      ).toBe(true);
    }

    // The chrome's control vocabulary (#564): the 6 px corner on every
    // control, and the 3:1 control edge on the selects and the outline buttons.
    const corners = await editor
      .locator('button, select')
      .evaluateAll((controls) =>
        controls
          .filter((control) => getComputedStyle(control).borderTopLeftRadius !== '6px')
          .map((control) => control.getAttribute('aria-label') ?? control.textContent.trim()),
      );
    expect(corners, 'controls without the 6 px corner').toEqual([]);
    const outlined = [
      editor.getByRole('button', { name: 'Back to dependency picker' }),
      editor.getByRole('button', { name: 'Cancel', exact: true }),
      ...(await editor.locator('select').all()),
    ];
    expect(outlined.length).toBeGreaterThanOrEqual(4);
    for (const control of outlined) {
      const edge = await paintedLeftEdge(page, control);
      expect(edge.outside, 'a control edge against the editor it stands on').toBeGreaterThanOrEqual(
        3,
      );
    }

    // Cancel gives the cell its box back, as Escape does.
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByLabel('Add a dependency to 030')).toBeFocused();
  });
}
