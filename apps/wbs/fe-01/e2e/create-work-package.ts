import { expect, type Page } from '@playwright/test';

import { openWorkPackageActions, selectOrdinaryProject } from './ordinary-context';

/**
 * The name a create gives a work package before anybody renames it, and what the
 * armed field therefore holds selected.
 *
 * Copied rather than imported: `work-package-page.tsx` keeps it module-private, and
 * a browser fixture reaching into a component's internals to read a string is
 * a worse coupling than one literal with a reason beside it. The selection
 * assertion below fails loudly if the two ever drift.
 */
const PLACEHOLDER_WORK_PACKAGE_NAME = 'New work package';

/**
 * Selects the run's API-created destination, creates through the header's `+`, and leaves the bar at rest.
 *
 * **Every fixture in this directory that makes a work package goes through here**,
 * and the reason is that a create is no longer one act. Since
 * `work-package-picker-flow` it selects the work package, waits for the list to name it,
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
 *   item` is on screen as soon as the work package is selected, while the re-arm
 *   waits for `load()`. A fixture that clicks on into the table without
 *   waiting has the focus taken out from under it whenever that reload is slow
 *   enough, which is a race that shows up as another test's failure entirely.
 *
 * Waiting for the field and then leaving it deliberately removes both. Give a
 * `name` and it is typed over the selected placeholder and committed with
 * Enter — `keyboard.type` rather than `fill`, because replacing a selection
 * with the first character typed is the browser behaviour that selection is
 * for. Leave it out and Escape keeps the work package under its placeholder name;
 * nothing is rolled back, the work package is already created.
 *
 * **What the typing waits for, and why it is checked rather than assumed.** On
 * 2026-09-08 a CI shard failed on a work package called `endering 100/2/sparse`: the
 * `R` never reached the field, and every fixture in this directory goes through
 * here, so it surfaced as a rendering test's failure. `keyboard.type` types at
 * whatever the **document** has focused and replaces whatever the field has
 * **selected**, and this arming passes through states where neither is what a
 * caller assumes; the two assertions below are those states, waited for rather
 * than hoped for, and the value read after typing catches a loss at the field
 * instead of one round trip later at the picker.
 *
 * The trigger itself has not been reproduced: 1×, 4×, 10× and 20× CPU
 * throttling, a 700ms delayed work-package-list read, and fifteen attempts, all
 * clean on a Mac. So this is containment with a legible failure, not a proven
 * root cause.
 *
 * @param page The page to create on, already signed in and on the plan page.
 * @param name What to call it, or omitted to keep the placeholder name.
 */
export async function createWorkPackage(page: Page, name?: string): Promise<void> {
  await selectOrdinaryProject(page);
  await openWorkPackageActions(page);
  await page.getByRole('banner').getByRole('button', { name: 'Create new work package' }).click();
  const field = page.getByLabel('Work package name');
  await expect(field, 'the create did not arm a rename on the new work package').toBeVisible();
  const picker = page.getByRole('combobox', { name: 'Work package' });
  if (name === undefined) {
    await field.press('Escape');
  } else {
    // The two conditions `page.keyboard.type` depends on and does not check.
    // It types at **the document's** focus, so a field that is on screen but
    // not yet holding the keyboard swallows the characters aimed at it, and a
    // field whose placeholder is no longer selected keeps them instead of
    // being replaced by them. Both are states this arming passes through.
    await expect(field, 'the armed rename does not hold the keyboard').toBeFocused();
    await expect
      .poll(
        () =>
          field.evaluate((node) =>
            node instanceof HTMLInputElement
              ? `${String(node.selectionStart)}-${String(node.selectionEnd)}`
              : 'not an input',
          ),
        { message: 'the armed rename does not hold its placeholder selected' },
      )
      .toBe(`0-${String(PLACEHOLDER_WORK_PACKAGE_NAME.length)}`);
    await page.keyboard.type(name);
    // **Read the field before committing it.** A character lost on the way in
    // is otherwise discovered by the picker assertion below, three steps and
    // one round trip later, and reads there as a work package that came back under
    // the wrong name — which is how `endering 100/2/sparse` was reported in CI
    // on 2026-09-08 and why it was first taken for a backend answer. Here it
    // names the field, the expected text and the text that arrived.
    //
    // Proof: a `select()` deferred past React's commit on every `input` event —
    // which is what a re-arm does to a draft — and this failed on `the armed
    // rename lost characters on the way in · Expected: "Rendering 100/2/sparse"
    // · Received: "rse"`. Watched 2026-09-09. The comparison against the form
    // this replaced could not be obtained: without the two waits above, the
    // typing starts before the injected fault can attach, so the injection is
    // not deliverable to both forms. What is proven here is that a loss is
    // caught at the field and named — not that this shape of loss is what CI
    // hit, which remains unreproduced.
    await expect(field, 'the armed rename lost characters on the way in').toHaveValue(name);
    await field.press('Enter');
    await expect(picker).toHaveValue(name);
  }
  // The picker back on the bar is what says the header has settled: until it
  // is there the rename is still armed and still holds the keyboard.
  await expect(picker).toBeVisible();
}
