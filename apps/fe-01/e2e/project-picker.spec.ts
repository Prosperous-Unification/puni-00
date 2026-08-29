import { expect, type Page, test } from '@playwright/test';

/**
 * The project picker's own browser gate: where an entry's card opens, what a
 * click on the closed box does to the caret, and what a create leaves the
 * keyboard in.
 *
 * jsdom cannot be the oracle for any of it. A click's default action — moving
 * the focus and placing a caret in the text it hit — is the browser's, and
 * jsdom performs none of it: R5 #14/#15's fault class, three times over in
 * this repository. A card's placement is arithmetic over rectangles jsdom
 * measures as zero. `project-page.test.tsx` asserts the wiring against stubbed
 * rectangles; this file asserts what a browser does with the real ones.
 *
 * **NOT YET RUN.** Ports 3100/3200/4200 were held by a developer's dev server
 * while `project-picker-flow` was written, and `reuseExistingServer` would
 * have measured that checkout rather than this one — `LLM_README.md`'s
 * landmine, and R5's sixteenth entry. Every assertion here is a claim until it
 * is run with the ports free; that is recorded in the change's `verify.md`.
 */

/** The name be-01 gives a project nobody has named yet. */
const PLACEHOLDER = 'New project';

const picker = (page: Page) => page.getByRole('combobox', { name: 'Project' });

/** Signs in through the fixed local identity, on a page with no project open. */
async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
}

/**
 * Creates a project and names it, through the rename a create now arms.
 *
 * The typing is `keyboard.type` rather than `fill`: the placeholder is
 * **selected** when the field arms, and a browser replacing a selection with
 * the first character typed is the whole point of selecting it. `fill` would
 * set the value outright and prove nothing about the selection.
 */
async function createProjectNamed(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  const field = page.getByLabel('Project name');
  await expect(field).toBeFocused();
  await page.keyboard.type(name);
  await field.press('Enter');
  await expect(picker(page)).toHaveValue(name);
}

/**
 * Opens the picker from closed, whatever had the focus before.
 *
 * The list opens on the box taking the focus, so a second open in one test has
 * to give the focus up first — clicking a still-focused input fires no `focus`
 * at all. `header.spec.ts` learned this; it is the same bar.
 */
async function openPicker(page: Page): Promise<void> {
  await page.getByRole('heading', { name: 'WBS tool v2' }).click();
  await picker(page).click();
  await expect(page.getByRole('listbox', { name: 'Projects' })).toBeVisible();
}

/**
 * How far the open card and the option list overlap horizontally, in px.
 *
 * Zero for a card beside the list, zero for a card the window had no room for
 * at all, and positive for exactly the fault this change is about. Returned
 * with the card's own width so the caller can refuse to believe a zero that
 * came from a card with no rectangle — `G gantt-calendar-axis`'s sixteenth
 * fault was a measurement taken against something with no size.
 */
async function measureCardAgainstList(
  page: Page,
): Promise<{ overlap: number; cardWidth: number; showing: boolean }> {
  const list = await page.getByRole('listbox', { name: 'Projects' }).boundingBox();
  if (list === null) throw new Error('the picker is not open');
  const card = page.getByRole('tooltip').first();
  const box = (await card.count()) === 0 ? null : await card.boundingBox();
  if (box === null) return { overlap: 0, cardWidth: 0, showing: false };
  const overlap = Math.min(box.x + box.width, list.x + list.width) - Math.max(box.x, list.x);
  return { overlap: Math.max(0, Math.round(overlap)), cardWidth: box.width, showing: true };
}

test.describe('the project picker, driven by a browser', () => {
  test('clicking the closed picker does not put a caret in the project name', async ({ page }) => {
    await signIn(page);
    await createProjectNamed(page, 'Rewire the shed');

    // At rest the box is the label of what is open, and `readOnly` is what
    // stops the click's default action — hit-testing the text and placing a
    // caret in it — from ever running over the project's name.
    await expect(picker(page)).toHaveJSProperty('readOnly', true);
    await expect(picker(page)).toHaveValue('Rewire the shed');

    await picker(page).click();

    // The click focused the box, and focusing opens the list and hands the box
    // over to the search — so the name is not on screen to hold a caret, and
    // the box types in the same commit that opened.
    await expect(page.getByRole('listbox', { name: 'Projects' })).toBeVisible();
    await expect(picker(page)).toHaveJSProperty('readOnly', false);
    await expect(picker(page)).toHaveValue('');
    await picker(page).pressSequentially('Rew');
    await expect(picker(page)).toHaveValue('Rew');
    await expect(page.getByRole('option', { name: /Rewire the shed/ })).toBeVisible();
  });

  test('choosing a project takes the focus off the picker', async ({ page }) => {
    await signIn(page);
    await createProjectNamed(page, 'Rewire the shed');
    await createProjectNamed(page, 'Paint the fence');
    await openPicker(page);

    await page.getByRole('option', { name: /Rewire the shed/ }).click();

    await expect(picker(page)).toHaveValue('Rewire the shed');
    // Nothing focuses an option — the list's `mousedown` is prevented so the
    // click can land — so without the blur the box keeps the keyboard with the
    // project's name in it, which is a rename that is not armed and cannot be.
    await expect(picker(page)).not.toBeFocused();
    await expect(picker(page)).toHaveJSProperty('readOnly', true);
    await expect(page.getByLabel('Project name')).toHaveCount(0);
    await expect(page.getByRole('listbox', { name: 'Projects' })).toHaveCount(0);
  });

  test('the open card opens clear of the list it explains', async ({ page }) => {
    await signIn(page);
    await createProjectNamed(page, 'Rewire the shed');
    await createProjectNamed(page, 'Paint the fence');
    await createProjectNamed(page, 'Sand the floor');
    await openPicker(page);

    const option = page.getByRole('option').nth(1);
    await option.hover();
    await expect(page.getByRole('tooltip').first()).toBeVisible();
    const measured = await measureCardAgainstList(page);
    const optionBox = await option.boundingBox();
    if (optionBox === null) throw new Error('the second option has no rectangle');
    const cardBox = await page.getByRole('tooltip').first().boundingBox();
    if (cardBox === null) throw new Error('the card has no rectangle');

    // Or the card has no width, covers nothing wherever it is put, and the
    // assertion under this one is green by default.
    expect(measured.cardWidth, 'the card was measured as having no width').toBeGreaterThan(0);
    expect(
      measured.overlap,
      `the card covers ${String(measured.overlap)}px of the list it is being read against`,
    ).toBe(0);
    // And it stands on the row it describes rather than under it.
    expect(Math.round(cardBox.y - optionBox.y)).toBe(0);
  });

  test('a window with no room on the right never puts the card over the list', async ({ page }) => {
    await signIn(page);
    await createProjectNamed(page, 'Rewire the shed');
    await createProjectNamed(page, 'Paint the fence');
    await openPicker(page);
    await page.getByRole('option').first().hover();
    await expect(page.getByRole('tooltip').first()).toBeVisible();
    // The precondition: at a full-width window the card is up and has a size,
    // so a zero overlap after the window narrows is a placement rather than a
    // card that never opened.
    const wide = await measureCardAgainstList(page);
    expect(wide.showing, 'no card opened at the default viewport').toBe(true);
    expect(wide.cardWidth, 'the card was measured as having no width').toBeGreaterThan(0);

    await page.setViewportSize({ width: 700, height: 800 });
    await openPicker(page);
    await page.getByRole('option').first().hover();

    // Flipped to the left of the list, or refused the space altogether. Both
    // are "not over the list"; a clamp back into the viewport is the third
    // option and is the one this change exists to rule out.
    const narrow = await measureCardAgainstList(page);
    expect(
      narrow.overlap,
      `the card covers ${String(narrow.overlap)}px of the list at a 700px window`,
    ).toBe(0);
  });

  test('creating a project puts the caret in its name, whole', async ({ page }) => {
    await signIn(page);

    await page.getByRole('button', { name: 'New project' }).click();

    const field = page.getByLabel('Project name');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(PLACEHOLDER);
    const selection = await field.evaluate((node: HTMLInputElement) => [
      node.selectionStart,
      node.selectionEnd,
    ]);
    expect(selection, 'the placeholder name is not selected').toEqual([0, PLACEHOLDER.length]);

    // What selecting it is for, and a browser's own behaviour: the first
    // character typed replaces the selection.
    await page.keyboard.type('Rewire the shed');

    await expect(field).toHaveValue('Rewire the shed');
    await field.press('Enter');
    await expect(picker(page)).toHaveValue('Rewire the shed');
  });

  test('abandoning the new project’s rename keeps the project', async ({ page }) => {
    await signIn(page);

    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Project name').press('Escape');

    // The project was created before the rename was ever offered; Escape is
    // not a rollback and there is nothing to roll back.
    await expect(picker(page)).toHaveValue(PLACEHOLDER);
    await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
  });
});
