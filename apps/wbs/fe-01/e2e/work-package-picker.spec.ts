import { createWorkPackage } from './create-work-package';
import { openWorkPackageActions, selectOrdinaryProject } from './ordinary-context';
import { expect, type Page, test } from './ordinary-test';

/**
 * The work package picker's own browser gate: where an entry's card opens, what a
 * click on the closed box does to the caret, and what a create leaves the
 * keyboard in.
 *
 * jsdom cannot be the oracle for any of it. A click's default action — moving
 * the focus and placing a caret in the text it hit — is the browser's, and
 * jsdom performs none of it: R5 #14/#15's fault class, three times over in
 * this repository. A card's placement is arithmetic over rectangles jsdom
 * measures as zero. `work-package-page.test.tsx` asserts the wiring against stubbed
 * rectangles; this file asserts what a browser does with the real ones.
 *
 * **Every work package this file makes carries a per-test tag.** The fixed local
 * identity is one account for the whole run, and it keeps every work package every
 * spec has ever made in it: the first cut of this file called two work packages
 * `Rewire the shed` in two tests, and by the second one `getByRole('option', {
 * name: /Rewire the shed/ })` matched four rows and failed on strict mode. The
 * tag is per test rather than per run for `directory.spec.ts`'s reason — a
 * fixed name has one test measuring another test's row.
 */

/** The name be-01 gives a work package nobody has named yet. */
const PLACEHOLDER = 'New work package';

const picker = (page: Page) => page.getByRole('combobox', { name: 'Work package' });

/** What this test's work packages are called, unique across the run and the account. */
let tag = '';
let made = 0;

test.beforeEach(() => {
  made += 1;
  tag = `${String(Date.now())}-${String(made)}`;
});

/** A work package name only this test could have made. */
const named = (base: string) => `${base} ${tag}`;

/** The option for one of this test's own work packages, by the tag nothing else carries. */
const optionFor = (page: Page, name: string) =>
  page.getByRole('option', {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
  });

/** Signs in through the fixed local identity, on a page with no work package open. */
async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
}

/**
 * Opens the picker from closed, whatever had the focus before.
 *
 * The list opens on the box taking the focus, so a second open in one test has
 * to give the focus up first — clicking a still-focused input fires no `focus`
 * at all. `header.spec.ts` learned this; it is the same bar.
 */
async function openPicker(page: Page): Promise<void> {
  // Blurred directly rather than by clicking the brand: below 1024 the brand is visually
  // hidden (`AppHeader`), and a click aimed at it lands on the header instead.
  await picker(page).evaluate((node) => {
    if (node instanceof HTMLElement) node.blur();
  });
  await picker(page).click();
  await expect(page.getByRole('listbox', { name: 'Work packages' })).toBeVisible();
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
  const list = await page.getByRole('listbox', { name: 'Work packages' }).boundingBox();
  if (list === null) throw new Error('the picker is not open');
  const card = page.getByRole('tooltip').first();
  const box = (await card.count()) === 0 ? null : await card.boundingBox();
  if (box === null) return { overlap: 0, cardWidth: 0, showing: false };
  const overlap = Math.min(box.x + box.width, list.x + list.width) - Math.max(box.x, list.x);
  return { overlap: Math.max(0, Math.round(overlap)), cardWidth: box.width, showing: true };
}

test.describe('the work package picker, driven by a browser', () => {
  test('clicking the closed picker does not put a caret in the work package name', async ({
    page,
  }) => {
    await signIn(page);
    const shed = named('Rewire the shed');
    await createWorkPackage(page, shed);

    // At rest the box is the label of what is open, and the work package's name is
    // in it. `readOnly` is what stops the click's default action — hit-testing
    // that text and placing a caret in it — from ever running; a browser is
    // the only thing that performs a default action, so it is the only thing
    // that can be asked. Read as editability, which is `readOnly`'s whole
    // observable effect on a text box.
    await expect(picker(page)).toHaveValue(shed);
    await expect(picker(page)).not.toBeEditable();

    await picker(page).click();

    // The click focused the box, and focusing hands it to the search: the name
    // is no longer in it for a caret to be in, the caret that a focus does
    // place is at the start of an empty box, and the box takes typing in the
    // same commit that opened the list.
    await expect(page.getByRole('listbox', { name: 'Work packages' })).toBeVisible();
    await expect(picker(page)).toBeEditable();
    await expect(picker(page)).toHaveValue('');
    const caret = await picker(page).evaluate((node: HTMLInputElement) => [
      node.selectionStart,
      node.selectionEnd,
    ]);
    expect(caret, 'the focused picker holds a caret inside some text').toEqual([0, 0]);
    await picker(page).pressSequentially('Rewire');
    await expect(picker(page)).toHaveValue('Rewire');
    await expect(optionFor(page, shed)).toBeVisible();
  });

  test('choosing a work package takes the focus off the picker', async ({ page }) => {
    await signIn(page);
    const shed = named('Rewire the shed');
    await createWorkPackage(page, shed);
    await createWorkPackage(page, named('Paint the fence'));
    await openPicker(page);

    await optionFor(page, shed).click();

    await expect(picker(page)).toHaveValue(shed);
    // Nothing focuses an option — the list's `mousedown` is prevented so the
    // click can land — so without the blur the box keeps the keyboard with the
    // work package's name in it, which reads as a rename that is not armed and
    // cannot be.
    await expect(picker(page)).not.toBeFocused();
    await expect(picker(page)).not.toBeEditable();
    await expect(page.getByLabel('Work package name')).toHaveCount(0);
    await expect(page.getByRole('listbox', { name: 'Work packages' })).toHaveCount(0);
  });

  test('the open card opens clear of the list it explains', async ({ page }) => {
    await signIn(page);
    await createWorkPackage(page, named('Rewire the shed'));
    await createWorkPackage(page, named('Paint the fence'));
    await createWorkPackage(page, named('Sand the floor'));
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
    await createWorkPackage(page, named('Rewire the shed'));
    await createWorkPackage(page, named('Paint the fence'));
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

  test('creating a work package puts the caret in its name, whole', async ({ page }) => {
    await signIn(page);

    await selectOrdinaryProject(page);
    await openWorkPackageActions(page);
    await page.getByRole('banner').getByRole('button', { name: 'Create new work package' }).click();

    const field = page.getByLabel('Work package name');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(PLACEHOLDER);
    const selection = await field.evaluate((node: HTMLInputElement) => [
      node.selectionStart,
      node.selectionEnd,
    ]);
    expect(selection, 'the placeholder name is not selected').toEqual([0, PLACEHOLDER.length]);

    // What selecting it is for, and a browser's own behaviour: the first
    // character typed replaces the selection.
    const shed = named('Rewire the shed');
    await page.keyboard.type(shed);

    await expect(field).toHaveValue(shed);
    await field.press('Enter');
    await expect(picker(page)).toHaveValue(shed);
  });

  test('abandoning the new work package’s rename keeps the work package', async ({ page }) => {
    await signIn(page);

    await selectOrdinaryProject(page);
    await openWorkPackageActions(page);
    await page.getByRole('banner').getByRole('button', { name: 'Create new work package' }).click();
    await page.getByLabel('Work package name').press('Escape');

    // The work package was created before the rename was ever offered; Escape is
    // not a rollback and there is nothing to roll back.
    await expect(picker(page)).toHaveValue(PLACEHOLDER);
    await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
  });
});
