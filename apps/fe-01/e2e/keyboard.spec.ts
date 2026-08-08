import { expect, type Page, test } from '@playwright/test';

/**
 * The command chords, in a browser.
 *
 * `wbs-table.test.tsx` proves the routing matrix — chord × cell class ×
 * picker-open — and it proves it against events a test constructed. Three
 * things are outside what jsdom can say anything about, and each of them is a
 * test in here:
 *
 * 1. **Ordering against a real event loop.** Cmd+Enter flushes the cell, waits
 *    for be-01 to answer, and only then creates. The unit test holds a fake
 *    open to see it; this one runs it against three real servers, where the
 *    round trip is a real one and the refetch it triggers is a real render.
 * 2. **A real `keyup`.** Ctrl+D's second press waits for D to have been let go,
 *    and jsdom only ever sees the `keyup` a test chose to fire. Here the
 *    keyboard sends both halves of every press.
 * 3. **A real newline.** Enter in the Name cell is the browser's own default
 *    action, which jsdom does not perform at all: a synthetic keydown leaves
 *    the value untouched whether the key was prevented or not. Only a browser
 *    can say the note went in and the box grew to hold it.
 *
 * What none of this can prove is the one thing `tools/dev/chord-probe.html`
 * exists for: Playwright dispatches into the page, so a chord the operating
 * system would have eaten arrives here regardless.
 */

/**
 * Signs up a throwaway account and makes a plan of `rows` empty work items.
 *
 * Through the UI, like the layout gate's own seed: what is being measured is
 * what the keyboard does to a table somebody has actually been typing in.
 */
async function seedRows(page: Page, account: string, rows: number): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('keyboard-gate-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (let made = 1; made <= rows; made += 1) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${String(made * 10).padStart(3, '0')}`)).toBeVisible();
  }
}

/** Every work item number on screen, top to bottom. */
function numbersOnScreen(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('tbody [data-number]')].map((node) => node.textContent),
  );
}

let account = 0;

test.beforeEach(() => {
  account += 1;
});

test.describe('the command chords, in a browser', () => {
  test('types a note under a name with Enter, and the box grows to hold it', async ({ page }) => {
    await seedRows(page, `e2e-keys-${String(Date.now())}-${String(account)}`, 1);

    const name = page.getByLabel('Name of 010');
    await name.click();
    await name.pressSequentially('Strip the old wiring');
    const oneLine = await name.boundingBox();
    expect(oneLine, 'the name cell has to be on screen').not.toBeNull();

    // The chord this whole change exists to make possible. jsdom performs no
    // default action for a synthetic key, so this line is the only place in
    // the repository where Enter actually puts a newline into the box.
    await page.keyboard.press('Enter');
    await page.keyboard.type('measure twice, the fuse box is old');

    await expect(name).toHaveValue('Strip the old wiring\nmeasure twice, the fuse box is old');
    const grown = await name.boundingBox();
    expect(grown, 'the name cell has to still be on screen').not.toBeNull();
    // `autoSize` following the value, which is what stops a note being written
    // into a one-line box nobody can read back.
    expect(grown?.height ?? 0).toBeGreaterThan(oneLine?.height ?? 0);

    await name.blur();
    // Two fields on the server, from one box: the first line is the name and
    // the rest is the note. Read back off the reloaded page, so this is be-01's
    // answer rather than the DOM's memory of what was typed.
    await page.reload();
    await expect(page.getByLabel('Name of 010')).toHaveValue(
      'Strip the old wiring\nmeasure twice, the fuse box is old',
    );
  });

  test('Cmd+Enter saves the cell before it creates the row it lands in', async ({ page }) => {
    await seedRows(page, `e2e-keys-${String(Date.now())}-${String(account)}`, 2);

    // The two writes this chord makes: `PATCH /api/work-items/:id` saves the
    // name, `POST /api/projects/:id/work-items` makes the row. Reads and the
    // refetches they trigger are left out — this is about which of the two
    // writes went first.
    const writes: string[] = [];
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const method = request.method();
      if (method === 'PATCH' || method === 'POST') {
        writes.push(`${method} ${new URL(request.url()).pathname}`);
      }
      await route.continue();
    });

    const last = page.getByLabel('Name of 020');
    await last.click();
    await last.pressSequentially('Sand the frames');

    await page.keyboard.press('ControlOrMeta+Enter');

    await expect(page.getByLabel('Name of 030')).toBeVisible();
    await expect(page.getByLabel('Name of 030')).toBeFocused();
    await expect(page.getByLabel('Name of 020')).toHaveValue('Sand the frames');

    // The save first, the create second — the ordering the unit test asserts
    // against a held promise, here against a real round trip.
    const made = writes.join(', ');
    expect(writes.at(0), `the writes this chord made were ${made}`).toMatch(/^PATCH \/api\/work-/);
    expect(writes.at(1), `the writes this chord made were ${made}`).toMatch(
      /^POST \/api\/projects/,
    );
    expect(writes.filter((each) => each.startsWith('POST'))).toHaveLength(1);
  });

  test('Ctrl+D arms on the first press and deletes on the second', async ({ page }) => {
    await seedRows(page, `e2e-keys-${String(Date.now())}-${String(account)}`, 3);

    const second = page.getByLabel('Name of 020');
    await second.click();
    await second.pressSequentially('Sand the frames');
    await second.blur();
    await second.click();

    // A real press: keydown, then keyup. The keyup is the half jsdom only ever
    // sees because a test chose to send it, and the half the confirm waits for.
    await page.keyboard.press('Control+d');

    await expect(page.locator('tr[data-armed="true"] [data-number]')).toHaveText('020');
    await expect(page.getByText('Ctrl+D again deletes 020 — its children move up')).toBeVisible();
    // Still three rows: nothing is destroyed on one gesture.
    expect(await numbersOnScreen(page)).toEqual(['010', '020', '030']);

    await page.keyboard.press('Control+d');

    await expect(page.getByText('Deleted 020 — Cmd+Z restores')).toBeVisible();
    expect(await numbersOnScreen(page)).toEqual(['010', '020']);
    // The row that took its place holds the name the deleted one did not.
    await expect(page.getByLabel('Name of 020')).not.toHaveValue('Sand the frames');
    await expect(page.locator('tr[data-armed="true"]')).toHaveCount(0);
  });

  test('a held Ctrl+D arms once and never deletes', async ({ page }) => {
    await seedRows(page, `e2e-keys-${String(Date.now())}-${String(account)}`, 3);

    await page.getByLabel('Name of 020').click();

    // Held down, so the browser's own auto-repeat produces the second, third
    // and fourth keydowns — each with `repeat: true` and no keyup between
    // them. This is the sequence the two guards exist for, delivered by a real
    // keyboard implementation rather than described by a test.
    await page.keyboard.down('Control');
    await page.keyboard.down('d');
    await page.waitForTimeout(600);
    await page.keyboard.up('d');
    await page.keyboard.up('Control');

    await expect(page.locator('tr[data-armed="true"] [data-number]')).toHaveText('020');
    expect(await numbersOnScreen(page)).toEqual(['010', '020', '030']);
  });
});
