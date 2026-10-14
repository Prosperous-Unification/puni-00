import { expect, type Locator, type Page, test } from '@playwright/test';

import { seedStepReadings } from './step-readings-seed';

/**
 * `step-node-attempts` D7 in a browser, over the ordinary e2e servers' real
 * be-01: the step card's `Start attempt`, `End attempt` and `Remove`, each one
 * journalled act the plan's Undo takes back verbatim, the attempt times printed
 * in the project's zone, and the Timezone section of Project settings.
 *
 * The captures are the UI acceptance record: every new control and state at
 * 1280 and 375, light and dark, kept in `test-results` for review by eye.
 */

/** The project's zone, written the way Settings writes it. */
async function setProjectZone(page: Page, projectId: string, timezone: string): Promise<void> {
  await page.evaluate(
    async ({ id, zone }) => {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timezone: zone }),
      });
      if (!response.ok) throw new Error(`PATCH zone failed: ${String(response.status)}`);
    },
    { id: projectId, zone: timezone },
  );
}

/** Opens a step cell's card by pointing at the cell, as a reader does. */
async function openCard(page: Page, label: string): Promise<Locator> {
  await page.mouse.move(0, 0);
  await page.getByLabel(label).locator('..').hover();
  const card = page.locator('[role="tooltip"]').filter({ hasText: /for \d{3}/ });
  await expect(card).toBeVisible();
  return card;
}

/** The attempt lines of the open card, newest first. */
const attemptLines = (card: Locator): Locator =>
  card.getByRole('list', { name: /^Attempts at / }).getByRole('listitem');

/** The WCAG ratio between an element's ink and the opaque surface under it. */
async function inkContrast(mark: Locator, surface: Locator): Promise<number> {
  const ground = await surface.evaluate((element) => getComputedStyle(element).backgroundColor);
  return mark.evaluate((element, groundColour) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('no 2d canvas in this browser');
    const pixel = (colour: string): [number, number, number] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      const rgba = context.getImageData(0, 0, 1, 1).data;
      if (rgba[3] !== 255) throw new Error(`surface ${colour} is not opaque`);
      return [rgba[0], rgba[1], rgba[2]];
    };
    const channel = (value: number): number => {
      const part = value / 255;
      return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([red, green, blue]: [number, number, number]): number =>
      0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    const ink = luminance(pixel(getComputedStyle(element).color));
    const back = luminance(pixel(groundColour));
    return (Math.max(ink, back) + 0.05) / (Math.min(ink, back) + 0.05);
  }, ground);
}

test.describe('attempts on the step card, in a browser (step-node-attempts D7)', () => {
  // The wide captures are taken at 1280, the narrow ones at 375 below.
  test.use({ viewport: { width: 1280, height: 800 } });

  test('starts, ends and undoes an attempt, printed in the project zone', async ({
    page,
  }, testInfo) => {
    const { projectId } = await seedStepReadings(page);
    await setProjectZone(page, projectId, 'Europe/Kyiv');
    await page.reload();
    await expect(page.getByLabel('Name of 040')).toBeVisible();

    // 020's Dev is in progress with no attempt: the card offers a start.
    let card = await openCard(page, 'Dev estimate for 020');
    await page.screenshot({ path: testInfo.outputPath('attempts-card-start-1280-light.png') });
    await card.getByRole('button', { name: 'Start attempt' }).click();
    card = await openCard(page, 'Dev estimate for 020');
    await expect(attemptLines(card)).toHaveCount(1);
    await expect(attemptLines(card).first()).toContainText(
      /^●#1 running · \d+ \w{3} \d\d:\d\d – now/,
    );
    await expect(card.getByRole('button', { name: 'End attempt 1…' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('attempts-card-running-1280-light.png') });

    await card.getByRole('button', { name: 'End attempt 1…' }).click();
    const dialog = page.getByRole('dialog', { name: /^End attempt 1 of / });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'End attempt' })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('attempts-end-dialog-1280-light.png') });
    await dialog.getByText('Failed', { exact: true }).click();
    await dialog.getByLabel('Reference').fill('run-7');
    await page.screenshot({
      path: testInfo.outputPath('attempts-end-dialog-filled-1280-light.png'),
    });
    await dialog.getByRole('button', { name: 'End attempt' }).click();
    await expect(dialog).toBeHidden();

    card = await openCard(page, 'Dev estimate for 020');
    await expect(attemptLines(card).first()).toContainText(/#1 failed · .* · run-7/);
    await expect(card.getByRole('button', { name: 'Start attempt' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('attempts-card-ended-1280-light.png') });

    // One Undo puts it back running, with no outcome and no reference.
    await page.mouse.move(0, 0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('[data-toast-text]').first()).toContainText(
      /Undid: ended attempt 1 of .* failed/,
    );
    card = await openCard(page, 'Dev estimate for 020');
    await expect(attemptLines(card).first()).toContainText(/^●#1 running · .* – now/);
  });

  test('removes an attempt, and one Undo restores it under its own number', async ({
    page,
  }, testInfo) => {
    await seedStepReadings(page);
    let card = await openCard(page, 'QA estimate for 010');
    await expect(attemptLines(card)).toHaveCount(3);
    const before = await attemptLines(card).nth(1).textContent();
    await card.getByRole('button', { name: /^Remove attempt 2 of / }).click();
    await expect(page.locator('[data-toast-text]').first()).toContainText(
      /^Removed attempt 2 of .*\. Undo puts it back\.$/,
    );
    await page.screenshot({ path: testInfo.outputPath('attempts-removed-toast-1280-light.png') });
    card = await openCard(page, 'QA estimate for 010');
    await expect(attemptLines(card)).toHaveCount(2);
    await expect(card).not.toContainText('#2 failed');

    await page.mouse.move(0, 0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('[data-toast-text]').first()).toContainText(
      /Undid: removed attempt 2/,
    );
    card = await openCard(page, 'QA estimate for 010');
    await expect(attemptLines(card)).toHaveCount(3);
    expect(await attemptLines(card).nth(1).textContent()).toBe(before);
  });

  test('captures the attempt surfaces in dark and at 375px, and their ink clears its surface', async ({
    page,
  }, testInfo) => {
    const { projectId } = await seedStepReadings(page);
    await setProjectZone(page, projectId, 'Europe/Kyiv');
    await page.reload();
    await expect(page.getByLabel('Name of 040')).toBeVisible();

    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const card = await openCard(page, 'QA estimate for 010');
      // Surface-aware: each outcome dot and each line's words against the
      // card's own resolved background, in this scheme (2026-10-04's lesson —
      // a colour that clears the table can fail on a popover).
      for (const line of await attemptLines(card).all()) {
        const outcome = await line.getAttribute('data-attempt-outcome');
        const dot = line.locator('[aria-hidden="true"]');
        expect(
          await inkContrast(dot, card),
          `${String(outcome)} dot, ${scheme}`,
        ).toBeGreaterThanOrEqual(3);
        const words = line.locator('span').nth(1);
        expect(
          await inkContrast(words, card),
          `${String(outcome)} words, ${scheme}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      await page.screenshot({ path: testInfo.outputPath(`attempts-card-list-1280-${scheme}.png`) });
      if (scheme === 'dark') {
        await card.getByRole('button', { name: 'Start attempt' }).click();
        const running = await openCard(page, 'QA estimate for 010');
        await running.getByRole('button', { name: /^End attempt 4…/ }).click();
        const dialog = page.getByRole('dialog', { name: /^End attempt 4 of / });
        await dialog.getByText('Succeeded', { exact: true }).click();
        await page.screenshot({ path: testInfo.outputPath('attempts-end-dialog-1280-dark.png') });
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
      }
    }

    // Settings: the Timezone section, at rest on the saved zone.
    await page.mouse.move(0, 0);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.getByRole('button', { name: 'Project settings' }).click();
      const settings = page.getByRole('dialog', { name: 'Project settings' });
      await settings.getByRole('tab', { name: 'Timezone' }).click();
      const zone = settings.getByRole('combobox', { name: 'Timezone' });
      await expect(zone).toHaveValue('Europe/Kyiv');
      await expect(zone).toBeEnabled();
      await page.screenshot({
        path: testInfo.outputPath(`attempts-settings-timezone-1280-${scheme}.png`),
      });
      await zone.fill('America/New_York');
      await expect(settings.getByRole('button', { name: 'Save timezone' })).toBeEnabled();
      await page.screenshot({
        path: testInfo.outputPath(`attempts-settings-timezone-edited-1280-${scheme}.png`),
      });
      await zone.fill('Europe/Kyiv');
      await page.keyboard.press('Escape');
      await expect(settings).toBeHidden();
    }

    // A phone: the step line's Attempts details, opened by a tap.
    await page.setViewportSize({ width: 375, height: 812 });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const details = page.getByLabel('QA estimate for 010').locator(
        // The step's two disclosures share one line since F-042 (2026-10-13).
        'xpath=ancestor::*[@data-step][1]/following-sibling::*[@data-step-disclosures][1]/details[@data-step-attempts]',
      );
      await expect(details.locator('summary')).toHaveText(/Attempts \(4\)/);
      if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
      await expect(details.getByRole('button', { name: /^End attempt 4…/ })).toBeVisible();
      const remove = details.getByRole('button', { name: /^Remove attempt 4 of / });
      const box = await remove.boundingBox();
      expect(box?.height ?? 0, 'a finger-sized Remove').toBeGreaterThanOrEqual(44);
      await details.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`attempts-phone-375-${scheme}.png`) });
    }
    // No sideways scroll at 375px with the details open.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
