import { expect, type Locator, type Page, test } from '@playwright/test';

import { createProject } from './create-project';

/**
 * The project settings modal, laid out by a browser: what jsdom cannot measure.
 *
 * Two findings of the 2026-10-13 UI review live here. F-020: the Steps section's
 * name boxes collapsed to ~40px beside their unit, allowance and remove controls,
 * so a step could be neither read nor renamed. F-021: the modal took each
 * section's own height and re-centred, so changing section made it jump.
 */

/** Steps long enough that a collapsed box cannot show them by accident. */
const STEP_NAMES = ['Implementation', 'Code review', 'Release notes'] as const;

/** How far two measured edges may disagree, in CSS px: a fractional advance. */
const NEARLY = 1;

async function openSettings(page: Page): Promise<Locator> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page);
  // A phone reaches the toolbar only through its sheet; everywhere else the
  // toolbar is on the page.
  const sheet = page.getByRole('button', { name: 'Plan actions' });
  const addWorkItem = page.getByRole('button', { name: 'Add work item' });
  await expect(sheet.or(addWorkItem)).toBeVisible();
  if (await sheet.isVisible()) {
    await sheet.click();
    await expect(page.getByRole('dialog', { name: 'Plan actions' })).toBeVisible();
  }
  const control = page.getByRole('button', { name: 'Project settings' });
  await expect(control).toBeEnabled();
  await control.click();
  const dialog = page.getByRole('dialog', { name: 'Project settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function addSteps(dialog: Locator): Promise<void> {
  await dialog.getByRole('tab', { name: 'Steps' }).click();
  for (const name of STEP_NAMES) {
    await dialog.getByLabel('New step', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Add step' }).click();
    await expect(dialog.getByLabel(name, { exact: true })).toHaveValue(name);
  }
}

/**
 * One step row's measured shape: how wide its name box is against how wide its
 * name is drawn in that box's own font, and where its controls stand.
 */
interface StepRowShape {
  name: string;
  boxWidth: number;
  textWidth: number;
  boxLeft: number;
  removeLeft: number;
  unitRows: number;
  /** The shorter of the two unit labels, which are the radios' tap targets. */
  unitTargetHeight: number;
}

function measureStepRows(dialog: Locator): Promise<StepRowShape[]> {
  return dialog.evaluate((surface, names) => {
    const canvas = document.createElement('canvas');
    const pen = canvas.getContext('2d');
    if (pen === null) throw new Error('no 2d canvas to measure text with');
    return names.map((name) => {
      const box = [...surface.querySelectorAll('input')].find(
        (input) => input.labels?.[0]?.textContent === name,
      );
      if (box === undefined) throw new Error(`no name box labelled ${name}`);
      const style = getComputedStyle(box);
      pen.font = style.font;
      const padding =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight) +
        Number.parseFloat(style.borderLeftWidth) +
        Number.parseFloat(style.borderRightWidth);
      const remove = [...surface.querySelectorAll('button')].find(
        (button) =>
          (button.getAttribute('aria-label') ?? button.textContent.trim()) === `Remove ${name}`,
      );
      if (remove === undefined) throw new Error(`no remove control for ${name}`);
      const radios = [...surface.querySelectorAll('input[type="radio"]')].filter((radio) =>
        radio.getAttribute('aria-label')?.startsWith(`${name} `),
      );
      if (radios.length !== 2) throw new Error(`${name} has ${String(radios.length)} unit radios`);
      return {
        name,
        boxWidth: box.getBoundingClientRect().width,
        textWidth: pen.measureText(name).width + padding,
        boxLeft: box.getBoundingClientRect().left,
        removeLeft: remove.getBoundingClientRect().left,
        unitRows: new Set(radios.map((radio) => Math.round(radio.getBoundingClientRect().top)))
          .size,
        unitTargetHeight: Math.min(
          ...radios.map((radio) => {
            const label = radio.closest('label');
            if (label === null) throw new Error(`${name}'s unit radio has no label`);
            return label.getBoundingClientRect().height;
          }),
        ),
      };
    });
  }, STEP_NAMES);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
]) {
  test(`step rows are readable and aligned at ${String(viewport.width)}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const dialog = await openSettings(page);
    await addSteps(dialog);

    const rows = await measureStepRows(dialog);
    // Proof: on main at 16eaa121f (one flex row per step) this failed at 1440,
    // 1024 and 375 on `Implementation's name box is 96px wide for a 122px name`
    // (Expected >= 121.7, Received 95.7): the name form was the one flex child
    // allowed to shrink. Watched 2026-10-13.
    for (const row of rows) {
      expect(
        row.boxWidth,
        `${row.name}'s name box is ${String(Math.round(row.boxWidth))}px wide for a ${String(
          Math.round(row.textWidth),
        )}px name`,
      ).toBeGreaterThanOrEqual(row.textWidth);
      expect(row.unitRows, `${row.name}'s unit choice wraps`).toBe(1);
      // The radios' labels are their tap targets, and on a phone a target is
      // 44px — given by the phone floor in `styles.css`
      // (`[data-modal-surface] label:has(> input[type='radio'])`). Proof: with
      // that selector deleted this failed at 375 on `Implementation's unit
      // labels are 25px tall`. Watched 2026-10-14.
      if (viewport.width < 640)
        expect(
          row.unitTargetHeight,
          `${row.name}'s unit labels are ${String(Math.round(row.unitTargetHeight))}px tall`,
        ).toBeGreaterThanOrEqual(44);
    }
    const first = rows.at(0);
    if (first === undefined) throw new Error('no step rows measured');
    for (const row of rows.slice(1)) {
      expect(
        Math.abs(row.boxLeft - first.boxLeft),
        `${row.name}'s box is out of line`,
      ).toBeLessThanOrEqual(NEARLY);
      expect(
        Math.abs(row.removeLeft - first.removeLeft),
        `${row.name}'s remove control is out of line`,
      ).toBeLessThanOrEqual(NEARLY);
    }
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
]) {
  test(`the modal keeps its top and title in place across sections at ${String(
    viewport.width,
  )}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const dialog = await openSettings(page);
    await addSteps(dialog);
    const title = dialog.getByRole('heading', { name: 'Project settings' });

    const frames: { section: string; top: number; titleTop: number }[] = [];
    for (const section of [
      'Teams',
      'Priorities',
      'Steps',
      'Estimating',
      'Optimization',
      'Timezone',
    ]) {
      await dialog.getByRole('tab', { name: section }).click();
      await expect(dialog.getByRole('tab', { name: section })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      // Scrolled to the end of the section, so a surface that scrolls as one
      // (title and tabs with it) shows here as a title that moved.
      await dialog.getByRole('tabpanel').evaluate((panel) => {
        panel.scrollIntoView({ block: 'end' });
        panel.parentElement?.scrollTo({ top: panel.parentElement.scrollHeight });
      });
      const box = await dialog.boundingBox();
      const heading = await title.boundingBox();
      if (box === null || heading === null) throw new Error(`the modal has no box on ${section}`);
      frames.push({ section, top: box.y, titleTop: heading.y });
    }
    // Proof: on main at 16eaa121f this failed on `Priorities moves the modal`:
    // at 1440 Teams was {top 277, height 346} and Priorities {top 181, height
    // 538}; each section took its own height and the dialog re-centred. With
    // the fixed-height frame and no inner scroller it failed at 375 on
    // `Priorities moves the modal` (titleTop 66 against 23): the whole surface
    // scrolled, title included. Watched 2026-10-14.
    const first = frames.at(0);
    if (first === undefined) throw new Error('no frames measured');
    for (const frame of frames.slice(1)) {
      expect(
        { top: Math.round(frame.top), titleTop: Math.round(frame.titleTop) },
        `${frame.section} moves the modal`,
      ).toEqual({ top: Math.round(first.top), titleTop: Math.round(first.titleTop) });
    }
  });
}

test('the section tabs fit a phone, whole and apart, at 44px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const dialog = await openSettings(page);
  const tabs = await dialog.evaluate((surface) => {
    const right = surface.getBoundingClientRect().right;
    return [...surface.querySelectorAll('[role="tab"]')].map((tab) => {
      const box = tab.getBoundingClientRect();
      return {
        name: tab.textContent.trim(),
        cut: tab.scrollWidth > tab.clientWidth + 1,
        left: box.left,
        right: box.right,
        top: box.top,
        height: box.height,
        pastEdge: box.right > right + 1,
      };
    });
  });
  expect(tabs).toHaveLength(6);
  // Proof: on main at b0072a456 this failed on `Teams is cut short`: six tabs in
  // one unwrapped row at 375. Watched 2026-10-14.
  for (const tab of tabs) {
    expect(tab.cut, `${tab.name} is cut short`).toBe(false);
    expect(tab.pastEdge, `${tab.name} runs past the modal's edge`).toBe(false);
    expect(
      tab.height,
      `${tab.name} is ${String(Math.round(tab.height))}px tall`,
    ).toBeGreaterThanOrEqual(44);
  }
  for (const [at, tab] of tabs.entries()) {
    for (const other of tabs.slice(at + 1)) {
      const overlaps =
        Math.round(tab.top) === Math.round(other.top) &&
        tab.left < other.right - 1 &&
        other.left < tab.right - 1;
      expect(overlaps, `${tab.name} overlaps ${other.name}`).toBe(false);
    }
  }
});

test('priority bands are readable on a phone, inside the modal, at 44px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const dialog = await openSettings(page);
  await dialog.getByRole('tab', { name: 'Priorities' }).click();
  await expect(dialog.getByLabel('Name of band 1')).toHaveValue('Critical');
  const boxes = await dialog.evaluate((surface) => {
    const pen = document.createElement('canvas').getContext('2d');
    if (pen === null) throw new Error('no 2d canvas to measure text with');
    const right = surface.getBoundingClientRect().right;
    const panel = surface.querySelector('[role="tabpanel"]:not([hidden])');
    if (panel === null) throw new Error('no priorities panel');
    return [...panel.querySelectorAll('li input')].map((input) => {
      if (!(input instanceof HTMLInputElement)) throw new Error('not an input');
      const style = getComputedStyle(input);
      pen.font = style.font;
      const box = input.getBoundingClientRect();
      return {
        name: input.getAttribute('aria-label') ?? '?',
        width: box.width,
        textWidth:
          pen.measureText(input.value).width +
          Number.parseFloat(style.paddingLeft) +
          Number.parseFloat(style.paddingRight) +
          Number.parseFloat(style.borderLeftWidth) +
          Number.parseFloat(style.borderRightWidth),
        height: box.height,
        pastEdge: box.right > right + 1,
      };
    });
  });
  expect(boxes).toHaveLength(15);
  // Proof: on main at b0072a456 this failed on `Name of band 1 is 44px wide for
  // a 79px value`: one row of four controls at 375. Watched 2026-10-14.
  for (const box of boxes) {
    expect(
      box.width,
      `${box.name} is ${String(Math.round(box.width))}px wide for a ${String(Math.round(box.textWidth))}px value`,
    ).toBeGreaterThanOrEqual(box.textWidth);
    expect(box.pastEdge, `${box.name} runs past the modal's edge`).toBe(false);
    expect(
      box.height,
      `${box.name} is ${String(Math.round(box.height))}px tall`,
    ).toBeGreaterThanOrEqual(44);
  }
});

test.describe('one commit model (F-060, decision D7)', () => {
  test('a renamed band applies as the ladder is left and the ✕ closes over it, at 1440 and 375', async ({
    page,
  }) => {
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      const dialog = await openSettings(page);
      await dialog.getByRole('tab', { name: 'Priorities' }).click();
      const band = dialog.getByLabel('Name of band 1');
      await band.fill(`Blocker ${String(width)}`);
      // The ✕ is the way out: its press blurs the box, which sends the ladder, and the modal
      // closes once the write lands — no Save, and no second click.
      await dialog.getByRole('button', { name: 'Close' }).click();
      // Proof: on 2026-10-14, against the Cancel / Save ladder, this failed on `expect(locator)
      // .toBeHidden() failed` — the ✕ was refused over the typed band and nothing was sent.
      await expect(dialog).toBeHidden();

      // On a phone the sheet the settings were opened from is still open under them.
      const sheet = page.getByRole('dialog', { name: 'Plan actions' });
      if (width === 375 && !(await sheet.isVisible())) {
        await page.getByRole('button', { name: 'Plan actions' }).click();
      }
      await page.getByRole('button', { name: 'Project settings' }).click();
      await dialog.getByRole('tab', { name: 'Priorities' }).click();
      await expect(dialog.getByLabel('Name of band 1')).toHaveValue(`Blocker ${String(width)}`);
      await expect(dialog.getByRole('button', { name: 'Save' })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  });
});

/**
 * Holds every write the settings sections send for `ms` before letting it
 * through, so a case can look at the modal while the write travels.
 */
async function delaySettingsWrites(page: Page, ms: number): Promise<void> {
  await page.route('**/api/projects/*/commands', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

/** How a settings box draws: its ink, its cursor, and the ink's contrast on its own fill. */
interface BoxInk {
  color: string;
  cursor: string;
  contrast: number;
}

/**
 * Reads a box's computed ink and fill and measures their WCAG contrast the way
 * `status.spec.ts` does: both painted through a 1×1 canvas, the fill over the
 * dialog's own surface so a translucent one is composited.
 */
function inkOf(box: Locator): Promise<BoxInk> {
  return box.evaluate((input) => {
    const surface = input.closest('[role="dialog"]');
    if (surface === null) throw new Error('the box is not inside a dialog');
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('no 2d canvas in this browser');
    const paint = (colour: string): void => {
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
    };
    const pixel = (): [number, number, number] => {
      const rgba = context.getImageData(0, 0, 1, 1).data;
      if (rgba[3] !== 255) throw new Error('the dialog surface is not opaque');
      return [rgba[0], rgba[1], rgba[2]];
    };
    const channel = (value: number): number => {
      const part = value / 255;
      return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([red, green, blue]: [number, number, number]): number =>
      0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    const style = getComputedStyle(input);
    paint(getComputedStyle(surface).backgroundColor);
    paint(style.backgroundColor);
    const fill = pixel();
    paint(style.color);
    const ink = luminance(pixel());
    const ground = luminance(fill);
    return {
      color: style.color,
      cursor: style.cursor,
      contrast: (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05),
    };
  });
}

test.describe('the settings flow while a write travels (round 3)', () => {
  test('Enter in a band keeps the caret in the box while the ladder travels (F-066)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const dialog = await openSettings(page);
    await dialog.getByRole('tab', { name: 'Priorities' }).click();
    const band = dialog.getByLabel('Name of band 1');
    await band.fill('Blocker');
    await delaySettingsWrites(page, 1500);
    await band.press('Enter');
    // Proof: on 2026-10-14, against 85849d1f3 (the boxes `disabled` while the
    // write travels), this failed on `expect(locator).toBeFocused() failed` —
    // the disabled box gave the focus to the dialog, whose ring was drawn.
    await expect(band).toBeFocused();
    await expect(band).toHaveJSProperty('readOnly', true);
    await expect(dialog.getByRole('tabpanel', { name: 'Priorities' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(dialog.getByText('The ladder is applied.')).toBeVisible();
    await expect(band).toHaveJSProperty('readOnly', false);
    await expect(band).toBeFocused();
    await expect(band).toHaveValue('Blocker');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`a box whose write travels looks busy, still reads, and its section says so, ${scheme} (F-081)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      const dialog = await openSettings(page);
      await dialog.getByRole('tab', { name: 'Priorities' }).click();
      const band = dialog.getByLabel('Name of band 1');
      const editable = await inkOf(band);
      await band.fill('Blocker');
      await delaySettingsWrites(page, 1500);
      await band.press('Enter');
      await expect(band).toHaveJSProperty('readOnly', true);
      const saying = dialog.getByRole('status').filter({ hasText: 'Saving Priorities…' });
      // Proof: on 2026-10-16, against 3e06eb5a4 (no busy style, the foot line
      // only with a close request), this failed on `expect(locator)
      // .toBeVisible() failed` for `Saving Priorities…`; with the line in
      // place and the style removed, the cursor below failed on `Expected:
      // "progress" Received: "text"`, in both palettes.
      await expect(saying).toBeVisible();
      const busy = await inkOf(band);
      expect(busy.cursor).toBe('progress');
      expect(busy.color).not.toBe(editable.color);
      expect(busy.contrast, `busy ink ${busy.color}`).toBeGreaterThanOrEqual(4.5);

      await expect(dialog.getByText('The ladder is applied.')).toBeVisible();
      await expect(saying).toHaveCount(0);
      const landed = await inkOf(band);
      expect(landed).toEqual(editable);
    });
  }

  test('the closing line moves neither the title nor the tabs (453 review nit)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const dialog = await openSettings(page);
    await dialog.getByRole('tab', { name: 'Priorities' }).click();
    await dialog.getByLabel('Name of band 1').fill('Blocker');
    const tabs = dialog.getByRole('tablist', { name: 'Project settings sections' });
    const before = await tabs.boundingBox();
    await delaySettingsWrites(page, 2000);
    await dialog.getByRole('tab', { name: 'Timezone' }).click();
    await dialog.getByRole('button', { name: 'Close' }).click();
    const saying = dialog.getByRole('status').filter({ hasText: 'Saving Priorities' });
    await expect(saying).toBeVisible();
    const during = await tabs.boundingBox();
    if (before === null || during === null) throw new Error('the tab list has no box');
    // Proof: on 2026-10-14, against 85849d1f3 (the line between the description
    // and the body), this failed on `Expected: 150 … Received: 186` — the tab
    // list pushed down a line for as long as the write travelled.
    expect(Math.round(during.y)).toBe(Math.round(before.y));
    await expect(dialog).toBeHidden();
  });

  test('on a phone the settings fill the screen, with no sheet showing under them (F-054)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const dialog = await openSettings(page);
    const box = await dialog.boundingBox();
    if (box === null) throw new Error('the settings have no box');
    // What a finger at the bottom of the screen lands on: the settings, not the
    // dimmed Plan actions sheet they were opened from.
    const underFinger = await page.evaluate(() => {
      const hit = document.elementFromPoint(187, 800);
      return hit?.closest('[role="dialog"]')?.getAttribute('aria-labelledby') ?? null;
    });
    const settingsTitle = await dialog.getAttribute('aria-labelledby');
    // Proof: on 2026-10-14, against 85849d1f3 (the modal as tall as its
    // section, 5vh from the top), this failed on `{ top: 41, bottom: 455 }`
    // against `{ top: 0, bottom: 812 }`: the Plan actions sheet showed below.
    expect({ top: Math.round(box.y), bottom: Math.round(box.y + box.height) }).toEqual({
      top: 0,
      bottom: 812,
    });
    expect(underFinger).toBe(settingsTitle);
  });

  test('a zone typed while the list loads applies once it lands (F-069)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/timezones', async (route) => {
      await held;
      await route.continue();
    });
    const dialog = await openSettings(page);
    await dialog.getByRole('tab', { name: 'Timezone' }).click();
    const zone = dialog.locator('#project-timezone');
    // Proof: on 2026-10-14, against 85849d1f3 (the box disabled while the zones
    // load), this failed on `locator.fill: Test timeout of 60000ms exceeded`
    // with `element is not enabled` in its log.
    await zone.fill('Europe/Kyiv');
    await zone.press('Enter');
    await expect(dialog.getByText(/applies once they are read/)).toBeVisible();
    release();
    await expect(dialog.getByText('Saved as Europe/Kyiv.')).toBeVisible();
    await expect(dialog.getByRole('tab', { name: 'Timezone', exact: true })).toBeVisible();
  });
});
