import type { Page } from '@playwright/test';

/**
 * The roles a plan toolbar control is exposed as: buttons, the `Plan with`
 * select (combobox), Find and the start date (textbox), and the four `<details>`
 * popovers, Filters, Views, Columns and Export / Import (group).
 */
const CONTROL_ROLES = ['button', 'combobox', 'textbox', 'group'] as const;

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
  let total = 0;
  for (const role of CONTROL_ROLES) total += await toolbar.getByRole(role).count();
  return total;
}
