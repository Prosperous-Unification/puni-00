import { expect, type Page } from '@playwright/test';

/**
 * Creates a project through the header's `+` and leaves the bar at rest.
 *
 * **Every fixture in this directory that makes a project goes through here**,
 * and the reason is that a create is no longer one act. Since
 * `project-picker-flow` it selects the project, waits for the list to name it,
 * and then **arms a rename** on it: the name field replaces the picker on the
 * bar, takes the keyboard, and holds the placeholder name selected so the
 * first keystroke replaces it. Two things follow, and both have already broken
 * a spec that walked past them:
 *
 * - While the rename is armed there is **no picker and no ✎ on the bar**.
 *   `tailwind.spec.ts`'s `openChromeControl` clicked `Rename` straight after
 *   the create and waited sixty seconds for a button that a create had just
 *   taken away.
 * - The arming lands **one round trip after the table appears** — `Add work
 *   item` is on screen as soon as the project is selected, while the re-arm
 *   waits for `load()`. A fixture that clicks on into the table without
 *   waiting has the focus taken out from under it whenever that reload is slow
 *   enough, which is a race that shows up as another test's failure entirely.
 *
 * Waiting for the field and then leaving it deliberately removes both. Give a
 * `name` and it is typed over the selected placeholder and committed with
 * Enter — `keyboard.type` rather than `fill`, because replacing a selection
 * with the first character typed is the browser behaviour that selection is
 * for. Leave it out and Escape keeps the project under its placeholder name;
 * nothing is rolled back, the project is already created.
 *
 * @param page The page to create on, already signed in and on the plan page.
 * @param name What to call it, or omitted to keep the placeholder name.
 */
export async function createProject(page: Page, name?: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  const field = page.getByLabel('Project name');
  await expect(field, 'the create did not arm a rename on the new project').toBeVisible();
  const picker = page.getByRole('combobox', { name: 'Project' });
  if (name === undefined) {
    await field.press('Escape');
  } else {
    await page.keyboard.type(name);
    await field.press('Enter');
    await expect(picker).toHaveValue(name);
  }
  // The picker back on the bar is what says the header has settled: until it
  // is there the rename is still armed and still holds the keyboard.
  await expect(picker).toBeVisible();
}
