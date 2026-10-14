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
