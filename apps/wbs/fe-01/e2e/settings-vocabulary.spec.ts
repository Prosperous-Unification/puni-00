import { expect, type Locator, type Page, test } from '@playwright/test';

import { openSeededPlan, seedPlan } from './plan-fixture';

/**
 * The project settings modal in the app's one control vocabulary, measured by a
 * browser (ui-review round 5b, F-117 to F-123): tabs drawn like every other
 * chrome control, a locked unit that says why and still shows which, the
 * priority ladder's columns named on screen, and a scrolling section that ends
 * with the room it starts with.
 */

const RUN = String(Date.now());

/** What WCAG asks of a control's states against each other (1.4.11, non-text contrast). */
const DISTINCT_STATES = 3;

/** How far two measured edges may disagree, in CSS px: a fractional advance. */
const NEARLY = 1;

const ESTIMATE = { optimistic: 1, realistic: 2, pessimistic: 4 };

/** A plan whose Dev step holds two estimates and QA one, opened on its settings. */
async function openSettings(page: Page, title: string, workerIndex: number): Promise<Locator> {
  const seeded = await seedPlan(
    page,
    {
      name: 'Settings vocabulary',
      rows: [
        { ref: 'a', name: 'Wire the board', estimates: { Dev: ESTIMATE, QA: ESTIMATE } },
        { ref: 'b', name: 'Paint the hall', estimates: { Dev: ESTIMATE } },
      ],
    },
    { run: RUN, worker: workerIndex, test: title },
  );
  await openSeededPlan(page, seeded);
  const sheet = page.getByRole('button', { name: 'Plan actions' });
  const addWorkItem = page.getByRole('button', { name: 'Add work item' });
  await expect(sheet.or(addWorkItem)).toBeVisible();
  if (await sheet.isVisible()) await sheet.click();
  const control = page.getByRole('button', { name: 'Project settings' });
  await expect(control).toBeEnabled();
  await control.click();
  const dialog = page.getByRole('dialog', { name: 'Project settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * The colour at the centre of a radio's disc, as painted.
 *
 * Read off a screenshot, because a native radio's disc is the engine's own
 * drawing and no computed style says what it is: the review's figures (dark
 * centres 117 against 59) came from the pixels and so does this.
 */
async function discCentre(page: Page, radio: Locator): Promise<[number, number, number]> {
  const box = await radio.boundingBox();
  if (box === null) throw new Error('the radio has no box');
  const shot = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    scale: 'css',
  });
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('no 2d canvas in this browser');
    context.drawImage(image, 0, 0);
    const at = context.getImageData(
      Math.floor(image.width / 2),
      Math.floor(image.height / 2),
      1,
      1,
    ).data;
    return [at[0], at[1], at[2]] as [number, number, number];
  }, shot.toString('base64'));
}

/** The WCAG ratio between two opaque sRGB colours. */
function ratioOf(one: [number, number, number], two: [number, number, number]): number {
  const luminance = (colour: [number, number, number]): number => {
    const channel = (raw: number): number => {
      const unit = raw / 255;
      return unit <= 0.04045 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2]);
  };
  const [brighter, dimmer] = [luminance(one), luminance(two)].sort((a, b) => b - a);
  return (brighter + 0.05) / (dimmer + 0.05);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`the settings controls, ${scheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test('the section tabs wear no border of their own (F-117)', async ({ page }, info) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const dialog = await openSettings(page, info.titlePath.join(' '), info.workerIndex);
      const borders = await dialog
        .getByRole('tab')
        .evaluateAll((tabs) => tabs.map((tab) => getComputedStyle(tab).borderTopWidth));
      // Proof: injecting `border-2` into the rendered tab class made this test fail
      // at the every-tab assertion; the unmodified light and dark cases passed.
      expect(borders.length).toBeGreaterThan(0);
      expect(borders.every((border) => border === '0px')).toBe(true);
    });

    test('a locked unit says why and still shows which (F-118)', async ({ page }, info) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const dialog = await openSettings(page, info.titlePath.join(' '), info.workerIndex);
      await dialog.getByRole('tab', { name: 'Steps' }).click();
      const workdays = dialog.getByRole('radio', { name: 'Dev workdays' });
      const minutes = dialog.getByRole('radio', { name: 'Dev minutes' });
      await expect(workdays).toBeDisabled();
      await expect(workdays).toBeChecked();
      await expect(dialog.getByText('fixed by 2 estimates')).toBeVisible();
      await page.mouse.move(1, 899);
      const ratio = ratioOf(await discCentre(page, workdays), await discCentre(page, minutes));
      // Proof: on 3e06eb5a4 the text line failed first (`fixed by 2 estimates`: element(s)
      // not found); with it in place and the disabled-radio rule in `styles.css` disabled,
      // this failed with `Received: 1.437…` (light) and `2.431…` (dark): the engine's
      // disabled discs, a pale and a paler grey. Watched 2026-10-16.
      expect(ratio, 'the checked locked disc against the unchecked one').toBeGreaterThanOrEqual(
        DISTINCT_STATES,
      );
    });

    test('Optimization names its schedules whole, on one line at 375, and shows the active one while off (F-119)', async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 375, height: 812 });
      const dialog = await openSettings(page, info.titlePath.join(' '), info.workerIndex);
      await dialog.getByRole('tab', { name: 'Optimization' }).click();
      const fast = dialog.getByRole('radio', { name: 'Fast' });
      const priority = dialog.getByRole('radio', { name: 'Priority-first' });
      const finish = dialog.getByRole('radio', { name: 'Finish-first' });
      await expect(fast).toBeDisabled();
      await expect(fast).toBeChecked();
      const tops = await Promise.all(
        [fast, priority, finish].map(async (radio) =>
          Math.round((await radio.boundingBox())?.y ?? -1),
        ),
      );
      // Proof: on 3e06eb5a4 this timed out on `getByRole('radio', { name: 'Priority-first' })`:
      // the labels read Pri and Time. With the words fixed and the disabled-radio rule in
      // `styles.css` disabled, the disc check below failed with `Received: 1.437…` (light)
      // and `2.431…` (dark). Watched 2026-10-16.
      expect(new Set(tops).size, `the three schedules stand at ${tops.join(', ')}`).toBe(1);
      await page.mouse.move(1, 811);
      const ratio = ratioOf(await discCentre(page, fast), await discCentre(page, priority));
      expect(ratio, 'Fast against Priority-first while off').toBeGreaterThanOrEqual(
        DISTINCT_STATES,
      );
    });

    test('a locked radio is drawn as a live one is, only quieter (F-158)', async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const dialog = await openSettings(page, info.titlePath.join(' '), info.workerIndex);
      await dialog.getByRole('tab', { name: 'Steps' }).click();
      const locked = dialog.getByRole('radio', { name: 'Dev minutes' });
      const live = dialog.getByRole('radio', { name: 'New step minutes' });
      await expect(locked).toBeDisabled();
      await expect(locked).not.toBeChecked();
      await expect(live).toBeEnabled();
      await expect(live).not.toBeChecked();
      await page.mouse.move(1, 899);
      const centres = ratioOf(await discCentre(page, live), await discCentre(page, locked));
      // Proof: on e8894d014 (the engine's drawing for a live radio) this failed in dark
      // on `Expected: < 1.1 Received: 1.799…`: a filled grey disc beside a hollow locked
      // ring. In light the centres matched and the ring check below failed on `Expected:
      // > 4.76… Received: 1`. Watched 2026-10-17.
      expect(centres, 'the live unchecked centre against the locked one').toBeLessThan(1.1);
      const rings = await Promise.all(
        [live, locked].map((radio) =>
          radio.evaluate((input) => {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (context === null) throw new Error('no 2d canvas in this browser');
            const pixel = (colour: string): [number, number, number] => {
              context.fillStyle = colour;
              context.fillRect(0, 0, 1, 1);
              const rgba = context.getImageData(0, 0, 1, 1).data;
              return [rgba[0], rgba[1], rgba[2]];
            };
            const style = getComputedStyle(input);
            return { ring: pixel(style.borderTopColor), ground: pixel(style.backgroundColor) };
          }),
        ),
      );
      const contrasts = rings.map(({ ring, ground }) => ratioOf(ring, ground));
      const [liveRing, lockedRing] = [contrasts.at(0), contrasts.at(1)];
      if (liveRing === undefined || lockedRing === undefined) throw new Error('no ring measured');
      expect(lockedRing, 'the locked ring on its ground').toBeGreaterThanOrEqual(DISTINCT_STATES);
      expect(liveRing, 'the live ring is louder than the locked one').toBeGreaterThan(lockedRing);

      // A radio the palette draws still shows where the keyboard is.
      await dialog.getByLabel('New step', { exact: true }).focus();
      await page.keyboard.press('Tab');
      const focused = dialog.getByRole('radio', { name: 'New step workdays' });
      await expect(focused).toBeFocused();
      const ring = await focused.evaluate((input) => {
        const style = getComputedStyle(input);
        return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
      });
      // Proof: on 2026-10-17, with `outline: none` added to the radio rule in `styles.css`,
      // this failed on `Expected: not "none"`.
      expect(ring.style).not.toBe('none');
      expect(ring.width).toBeGreaterThan(0);
    });
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`the priority ladder heads its columns on screen at ${String(viewport.width)} (F-120)`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const dialog = await openSettings(page, info.titlePath.join(' '), info.workerIndex);
    await dialog.getByRole('tab', { name: 'Priorities' }).click();
    await expect(dialog.getByLabel('Name of band 1')).toHaveValue('Critical');
    const measured = await dialog.evaluate((surface) => {
      const header = surface.querySelector('[data-priority-header]');
      if (header === null) return null;
      const row = surface.querySelector('[role="tabpanel"]:not([hidden]) li');
      if (row === null) throw new Error('no band row');
      const boxes = [...row.querySelectorAll('input')];
      const [name, start, writes] = [boxes.at(0), boxes.at(1), boxes.at(2)];
      const range = row.querySelector('[data-priority-range]');
      if (name === undefined || start === undefined || writes === undefined || range === null)
        throw new Error('a band row is missing a column');
      const cells = [...header.children].map((cell) => {
        const box = cell.getBoundingClientRect();
        const ink = getComputedStyle(cell);
        return {
          text: cell.textContent,
          left: box.left,
          right: box.right,
          shown: box.width > 0 && box.height > 0 && ink.visibility === 'visible',
        };
      });
      const edges = (node: Element) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right };
      };
      return {
        cells,
        name: edges(name),
        start: edges(start),
        range: edges(range),
        writes: edges(writes),
      };
    });
    // Proof: on 3e06eb5a4 this failed with `Received: null`: no header row at all.
    expect(measured, 'the ladder has no header row').not.toBeNull();
    if (measured === null) return;
    const shown = measured.cells.map((cell) => (cell.shown ? cell.text : null));
    expect(shown).toEqual(['', 'Band', 'Starts at', 'Holds', 'Writes']);
    const edge = (at: number, side: 'left' | 'right'): number => {
      const cell = measured.cells.at(at);
      if (cell === undefined) throw new Error(`no header cell ${String(at)}`);
      return cell[side];
    };
    expect(Math.abs(edge(1, 'left') - measured.name.left)).toBeLessThanOrEqual(NEARLY);
    expect(Math.abs(edge(2, 'right') - measured.start.right)).toBeLessThanOrEqual(NEARLY);
    expect(Math.abs(edge(3, 'right') - measured.range.right)).toBeLessThanOrEqual(NEARLY);
    expect(Math.abs(edge(4, 'right') - measured.writes.right)).toBeLessThanOrEqual(NEARLY);
  });
}

test('on a phone every band names its own numbers, beside them (F-148)', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const dialog = await openSettings(page, info.titlePath.join(' '), info.workerIndex);
  await dialog.getByRole('tab', { name: 'Priorities' }).click();
  await expect(dialog.getByLabel('Name of band 1')).toHaveValue('Critical');
  const measured = await dialog.evaluate((surface) => {
    const panel = surface.querySelector('[role="tabpanel"]:not([hidden])');
    if (panel === null) throw new Error('no priorities panel');
    const header = panel.querySelector('[data-priority-header]');
    const headerShown =
      header !== null && header.getBoundingClientRect().height > 0 && header.checkVisibility();
    const edge = surface.getBoundingClientRect().right;
    const rows = [...panel.querySelectorAll('li')].map((row) => {
      const boxes = [...row.querySelectorAll('input')];
      const [start, writes] = [boxes.at(1), boxes.at(2)];
      if (start === undefined || writes === undefined) throw new Error('a band lacks a box');
      // The word standing on the box's own line, just left of it.
      const wordBefore = (box: Element): string | null => {
        const at = box.getBoundingClientRect();
        const word = [...row.querySelectorAll('span')].find((span) => {
          const shape = span.getBoundingClientRect();
          const middle = (shape.top + shape.bottom) / 2;
          return (
            span.checkVisibility() &&
            shape.width > 0 &&
            middle > at.top &&
            middle < at.bottom &&
            shape.right <= at.left &&
            at.left - shape.right <= 12
          );
        });
        return word?.textContent.trim() ?? null;
      };
      return {
        start: wordBefore(start),
        writes: wordBefore(writes),
        pastEdge: writes.getBoundingClientRect().right > edge + 1,
      };
    });
    return { headerShown, rows };
  });
  // Proof: on e8894d014 this failed on `Expected: false Received: true`: the header,
  // wrapped over band 1's name box, was the only place the numbers were named. Watched
  // 2026-10-17.
  expect(measured.headerShown, 'the ladder header on a phone').toBe(false);
  expect(measured.rows).toEqual(
    Array.from({ length: 5 }, () => ({ start: 'Starts at', writes: 'Writes', pastEdge: false })),
  );
});

test('on a phone every radio in Estimating and Steps is the floor’s 22px (F-157)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const dialog = await openSettings(page, info.titlePath.join(' '), info.workerIndex);
  const sizes: string[] = [];
  for (const section of ['Steps', 'Estimating']) {
    await dialog.getByRole('tab', { name: section }).click();
    const panel = dialog.getByRole('tabpanel', { name: section });
    for (const radio of await panel.getByRole('radio').all()) {
      const box = await radio.boundingBox();
      if (box === null) throw new Error('a radio has no box');
      sizes.push(`${String(Math.round(box.width))}x${String(Math.round(box.height))}`);
    }
  }
  // Proof: on e8894d014 this failed listing `13x22` four times and `15x22` twice, the
  // three reaches and the three roundings: flex items beside two-line labels, each
  // shrunk by its own label. Watched 2026-10-17.
  expect(sizes.length).toBeGreaterThan(6);
  expect(sizes.filter((size) => size !== '22x22')).toEqual([]);
});

test('a scrolling section ends with the room the modal starts with, at 1024×700 (F-123)', async ({
  page,
}, info) => {
  // 700 rather than the review's 768: since the base layer took the platform's
  // groove and padding off a bare `<fieldset>` (UI review F-153), Estimating fits
  // at 1024×768 and the precondition below failed on `Estimating fits`.
  await page.setViewportSize({ width: 1024, height: 700 });
  const dialog = await openSettings(page, info.titlePath.join(' '), info.workerIndex);
  await dialog.getByRole('tab', { name: 'Estimating' }).click();
  const measured = await dialog.evaluate((surface) => {
    const panel = surface.querySelector('[role="tabpanel"]:not([hidden])');
    const box = panel?.parentElement;
    if (panel === null || box === null || box === undefined) throw new Error('no section box');
    box.scrollTop = box.scrollHeight;
    const last = panel.querySelector(':scope > * > p:last-of-type');
    if (last === null) throw new Error('no closing paragraph');
    return {
      scrolls: box.scrollHeight > box.clientHeight,
      room: box.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom,
      top: Number.parseFloat(getComputedStyle(surface).paddingTop),
    };
  });
  expect(measured.scrolls, 'Estimating fits at 1024×700, so this measures nothing').toBe(true);
  // Proof: on 3e06eb5a4 this failed with `Expected: >= 23 Received: 0`: scrolled to its
  // end, the closing paragraph sat on the box's bottom edge.
  expect(measured.room).toBeGreaterThanOrEqual(measured.top - NEARLY);
});
