import { expect, type Locator, type Page, test } from '@playwright/test';
import type { PlanCommandWire } from '@wbs/contracts';

import {
  fixtureClient,
  fixtureSuccess,
  openSeededPlan,
  type SeededPlan,
  seedPlan,
} from './plan-fixture';

/**
 * The plan table's drag and drop after the drop cue (UI review F-128, F-129),
 * with a real pointer drag — Chromium runs native HTML5 drag and drop from
 * Playwright's mouse, as in `shell-faults.spec.ts`.
 *
 * The plan: `010` with four children `010.1`–`010.4`, then `020`. The gap under
 * `010.4` is two places at once — the last child of `010` (`below 010.4`) and
 * the first top-level row after it (`above 020`) — so only the line's depth
 * tells a reader which one a drop will take.
 */
async function seedNested(page: Page, testName: string, worker: number): Promise<SeededPlan> {
  const seeded = await seedPlan(
    page,
    {
      name: 'Drop depth',
      rows: [
        { ref: 'onboarding', name: 'Onboarding' },
        { ref: 'billing', name: 'Billing' },
      ],
    },
    { run: 'drop-cue', worker, test: `${testName}-${String(Date.now())}` },
  );
  const parentId = seeded.rowIds['onboarding'];
  const children = ['Sign-up form', 'Welcome tour', 'Invite teammates', 'Analytics events'];
  const commands: PlanCommandWire[] = children.map((name, index) => ({
    kind: 'createWorkItem',
    ref: `child${String(index)}`,
    name,
    parentId,
    ...(index === 0 ? { afterId: null } : { afterRef: `child${String(index - 1)}` }),
  }));
  fixtureSuccess(
    'postApiProjectsByIdCommands',
    await fixtureClient(page).postApiProjectsByIdCommands({
      params: { id: seeded.projectId },
      body: { commands },
    }),
  );
  await openSeededPlan(page, seeded);
  await expect(page.getByLabel('Name of 010.4', { exact: true })).toBeVisible();
  return seeded;
}

const rowOf = (page: Page, number: string): Locator =>
  page.locator('tbody tr', { has: page.getByLabel(`Name of ${number}`, { exact: true }) });

/** Presses a row's handle and drags until the target row reports `zone`. */
async function dragOnto(page: Page, from: string, to: string, zone: 'above' | 'below') {
  const handle = page.getByRole('button', { name: `Reorder ${from}`, exact: true });
  const target = rowOf(page, to);
  const start = await handle.boundingBox();
  const box = await target.boundingBox();
  if (start === null || box === null) throw new Error('the handle or the target has no box');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 20, { steps: 5 });
  const dy = zone === 'below' ? box.height - 3 : 3;
  await page.mouse.move(box.x + 300, box.y + dy, { steps: 12 });
  // The row's dragover reads the drag the previous render committed, so the
  // first one after the drag starts can fall on nothing: nudge until it lands.
  let nudge = 0;
  await expect(async () => {
    nudge = 1 - nudge;
    await page.mouse.move(box.x + 300 + nudge, box.y + dy);
    expect(await target.getAttribute('data-drop')).toBe(zone);
  }).toPass();
}

/**
 * Where the drop line starts: the leftmost painted pixel on the target row's
 * line (its bottom pixel for `below`, its top one for `above`) that stands at
 * 3:1 or more against the same column 4 px inside the row, in CSS px.
 */
async function lineStartX(page: Page, row: Locator, zone: 'above' | 'below'): Promise<number> {
  const box = await row.boundingBox();
  if (box === null) throw new Error('the target row has no box');
  const lineY = zone === 'below' ? Math.floor(box.y + box.height) - 1 : Math.ceil(box.y);
  const groundY = zone === 'below' ? lineY - 4 : lineY + 4;
  const top = Math.min(lineY, groundY);
  const clip = { x: Math.ceil(box.x), y: top, width: Math.floor(box.width) - 1, height: 5 };
  const shot = await page.screenshot({ clip, scale: 'css' });
  const offset = await page.evaluate(
    async ({ png, line, ground }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) throw new Error('no 2d canvas in this browser');
      context.drawImage(image, 0, 0);
      const { data, width } = context.getImageData(0, 0, image.width, image.height);
      const channel = (value: number): number => {
        const part = value / 255;
        return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (x: number, y: number): number => {
        const at = (y * width + x) * 4;
        return (
          0.2126 * channel(data[at]) +
          0.7152 * channel(data[at + 1]) +
          0.0722 * channel(data[at + 2])
        );
      };
      for (let x = 0; x < width; x += 1) {
        const [bright, dim] = [luminance(x, line), luminance(x, ground)].sort((a, b) => b - a);
        if ((bright + 0.05) / (dim + 0.05) >= 3) return x;
      }
      throw new Error('no drop line is painted on the target row');
    },
    { png: shot.toString('base64'), line: lineY - top, ground: groundY - top },
  );
  return clip.x + offset;
}

/** The left edge of a row's outline: its Number cell's caret gutter, which the depth indents. */
const outlineLeft = (page: Page, number: string): Promise<number> =>
  rowOf(page, number)
    .locator('[data-caret-gutter]')
    .evaluate((gutter) => gutter.getBoundingClientRect().left);

for (const scheme of ['light', 'dark'] as const) {
  test(`the drop line starts at the depth the row will land at, in ${scheme} (F-128)`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedNested(page, `depth-${scheme}`, testInfo.workerIndex);

    // Proof, watched 2026-10-16 on 3e06eb5a4 (a 2px inset shadow on every cell
    // of the target row): failed on `below 010.4 lands as a child of 010 ·
    // Expected: <= 1 · Received: 32` — the line began under the drag handle,
    // at the row's own left edge, whatever the depth.
    for (const [target, zone, sentence] of [
      ['010.4', 'below', 'below 010.4 lands as a child of 010'],
      ['020', 'above', 'above 020 lands at the top level'],
    ] as const) {
      await dragOnto(page, '010.2', target, zone);
      const starts = await lineStartX(page, rowOf(page, target), zone);
      const expected = await outlineLeft(page, target);
      expect(Math.abs(starts - expected), sentence).toBeLessThanOrEqual(1);
      await page.keyboard.press('Escape');
      await page.mouse.up();
    }
    // One level apart: the gap's two readings no longer draw the same line.
    expect(
      (await outlineLeft(page, '010.4')) - (await outlineLeft(page, '020')),
      'one level of indent between a child and a top-level row',
    ).toBe(12);
  });
}

/**
 * `010.1` grows two levels under it, `010.1.1` and `010.1.1.1`: depth 3, one
 * past the Number column's indent cap (`DEEPEST_INDENT` 2).
 */
async function seedDeep(page: Page, testName: string, worker: number): Promise<void> {
  const seeded = await seedPlan(
    page,
    {
      name: 'Drop past the cap',
      rows: [
        { ref: 'onboarding', name: 'Onboarding' },
        { ref: 'billing', name: 'Billing' },
      ],
    },
    { run: 'drop-cue', worker, test: `${testName}-${String(Date.now())}` },
  );
  const commands: PlanCommandWire[] = [
    {
      kind: 'createWorkItem',
      ref: 'form',
      name: 'Sign-up form',
      parentId: seeded.rowIds['onboarding'],
      afterId: null,
    },
    {
      kind: 'createWorkItem',
      ref: 'tour',
      name: 'Welcome tour',
      parentId: seeded.rowIds['onboarding'],
      afterRef: 'form',
    },
    {
      kind: 'createWorkItem',
      ref: 'fields',
      name: 'Form fields',
      parentRef: 'form',
      afterId: null,
    },
    {
      kind: 'createWorkItem',
      ref: 'email',
      name: 'Email field',
      parentRef: 'fields',
      afterId: null,
    },
  ];
  fixtureSuccess(
    'postApiProjectsByIdCommands',
    await fixtureClient(page).postApiProjectsByIdCommands({
      params: { id: seeded.projectId },
      body: { commands },
    }),
  );
  await openSeededPlan(page, seeded);
  await expect(page.getByLabel('Name of 010.1.1.1', { exact: true })).toBeVisible();
}

test('past the Number column’s indent cap the drop line starts where the number starts (F-143)', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedDeep(page, 'deep', testInfo.workerIndex);
  // A depth-3 row's number stands where a depth-2 row's does: the cap.
  expect(
    (await outlineLeft(page, '010.1.1.1')) - (await outlineLeft(page, '010.1.1')),
    'the Number cell stops indenting at the cap',
  ).toBe(0);
  await dragOnto(page, '010.2', '010.1.1.1', 'below');
  const starts = await lineStartX(page, rowOf(page, '010.1.1.1'), 'below');
  // Proof: on 43ead5a10 this failed on `below 010.1.1.1 starts at its number ·
  // Expected: <= 1 · Received: 12`: the line began a level inside the number,
  // at the uncapped outline the Number cell no longer draws.
  expect(
    Math.abs(starts - (await outlineLeft(page, '010.1.1.1'))),
    'below 010.1.1.1 starts at its number',
  ).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('a drop leaves no tool hint waiting where the drag began (F-129)', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedNested(page, 'ring', testInfo.workerIndex);
  await dragOnto(page, '010.2', '010.4', 'below');
  await page.mouse.up();
  await expect(page.getByLabel('Name of 010.4', { exact: true })).toHaveValue('Welcome tour');

  // Proof, watched 2026-10-16 on 3e06eb5a4: failed on `the wait ring after the
  // drop · Expected: 0 · Received: 1` — the ring stood beside the handle the
  // drag began on, 300 px from the resting pointer, and `Drag to move this row`
  // opened there 2 s later. Chromium answers the reorder under that handle
  // with a `pointerover` at the last position it saw before the drag, which
  // the hint layer read as a reader resting there. With only the stale
  // `pointerover` ignored, it failed on `a hint card after the drop · Expected:
  // 0 · Received: 1`: the focus the reorder hands back to the moved row's
  // handle opened the keyboard's instant card.
  await page.waitForTimeout(600);
  expect(await page.locator('[data-wait-ring]').count(), 'the wait ring after the drop').toBe(0);
  await page.waitForTimeout(2_000);
  await expect(page.locator('#hint-card'), 'a hint card after the drop').toHaveCount(0);

  // The layer still works once the pointer really moves: a rest on the
  // handle under it waits and opens as before.
  const handle = page.getByRole('button', { name: 'Reorder 020', exact: true });
  const box = await handle.boundingBox();
  if (box === null) throw new Error('the 020 handle has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await expect(page.locator('#hint-card')).toHaveText('Drag to move this row', { timeout: 5_000 });
});
