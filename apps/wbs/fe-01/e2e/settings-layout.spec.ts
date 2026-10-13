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
  { width: 375, height: 812 },
]) {
  test(`the modal keeps one frame across sections at ${String(viewport.width)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const dialog = await openSettings(page);
    await addSteps(dialog);

    const frames: { section: string; top: number; height: number }[] = [];
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
      const box = await dialog.boundingBox();
      if (box === null) throw new Error(`the modal has no box on ${section}`);
      frames.push({ section, top: box.y, height: box.height });
    }
    // Proof: on main at 16eaa121f this failed on `Priorities moves the modal`:
    // at 1440 Teams was {top 277, height 346} and Priorities {top 181, height
    // 538}; at 375 {203, 406} against {41, 731}. Each section took its own
    // height and the dialog re-centred. Watched 2026-10-13.
    const first = frames.at(0);
    if (first === undefined) throw new Error('no frames measured');
    for (const frame of frames.slice(1)) {
      expect(
        { top: Math.round(frame.top), height: Math.round(frame.height) },
        `${frame.section} moves the modal`,
      ).toEqual({ top: Math.round(first.top), height: Math.round(first.height) });
    }
  });
}
