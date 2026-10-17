import type { Page } from '@playwright/test';

/**
 * The roles a plan toolbar control is exposed as: buttons, the `Plan with`
 * select (combobox), and Find and the start date (textbox). The four `<details>`
 * popovers (Filters, Views, Columns, Export / Import) are counted as elements,
 * not by their `group` role: the bar's named wrappers (`Whole plan`,
 * `Schedule`, F-094) are groups too, and counting them would pad the floor the
 * budgets hold with two things that are not controls. Proof, watched
 * 2026-10-16 with the named groups in place and Redo taken off the bar: this
 * count failed `project-settings.spec.ts`' premise on `Expected: >= 17 ·
 * Received: 16`; the old count (the `group` role summed) passed it at 18.
 */
const CONTROL_ROLES = ['button', 'combobox', 'textbox'] as const;

/**
 * How many controls the plan toolbar offers, counted by accessible role.
 *
 * By role, not by `[data-toolbar]`'s children: the bar groups its end (Undo,
 * Redo, Keyboard shortcuts, Export / Import and the schedule controls) into one
 * flex item (UI review F-056), so a child count says how the bar wraps, not how
 * many controls it holds. The budgets that use this ask "did the bar lose
 * controls?", which is a question about what a reader can reach.
 *
 * @returns The visible controls in `[data-toolbar]`, every role summed.
 */
export async function countToolbarControls(page: Page): Promise<number> {
  const toolbar = page.locator('[data-toolbar]');
  let total = await toolbar.locator('details:visible').count();
  for (const role of CONTROL_ROLES) total += await toolbar.getByRole(role).count();
  return total;
}
