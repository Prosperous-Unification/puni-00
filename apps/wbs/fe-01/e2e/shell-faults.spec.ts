import { expect, type Page, test } from '@playwright/test';

import { openSeededPlan, type SeededPlan, seedPlan } from './plan-fixture';
import { expectAnchoredColumn } from './signed-out-column';

/**
 * The shell when a tier is down, and the plan table's drop cue (UI review round
 * 4: F-076, F-077, F-078, F-079). The fault states are reached the way the
 * review's probes reached them by stopping gw-01 or be-01, but from inside the
 * page: `page.route` answers the API with the 502 a proxy gives for a stopped
 * be-01, and `page.routeWebSocket` closes the plan's stream as a stopped gw-01
 * does. The drag is a real pointer drag — Chromium runs native HTML5 drag and
 * drop from Playwright's mouse — not synthetic events.
 */

const identity = (testName: string, worker: number) => ({
  run: 'shell-faults',
  worker,
  test: `${testName}-${String(Date.now())}`,
});

async function seedFourRows(page: Page, testName: string, worker: number): Promise<SeededPlan> {
  return seedPlan(
    page,
    {
      name: 'Shell faults',
      rows: [
        { ref: 'a', name: 'Alpha row' },
        { ref: 'b', name: 'Bravo row', afterRef: 'a' },
        { ref: 'c', name: 'Charlie row', afterRef: 'b' },
        { ref: 'd', name: 'Delta row', afterRef: 'c' },
      ],
    },
    identity(testName, worker),
  );
}

const badGateway = { status: 502, contentType: 'text/plain', body: 'Bad Gateway' };

/** The header's connection pill: the presence section, by the heading it is named by. */
const pill = (page: Page) => page.getByRole('banner').locator('section[data-fact]');

test.describe('the session gate when the server is down (F-079)', () => {
  test('draws the server-unavailable state, then signs in on Try again', async ({ page }) => {
    await page.route('**/api/**', (route) => route.fulfill(badGateway));
    await page.goto('/');

    // Proof: on 5b65fd5ae this failed on `getByRole('heading', { name: 'Server
    // unavailable' })` not found: the sign-in form was drawn under "The server returned
    // an unexpected response. Try again." with "Other sign-in options could not be
    // loaded." below it.
    await expect(page.getByRole('heading', { name: 'Server unavailable' })).toBeVisible();
    // The outage card sits in the sign-in page's own column (F-093). Proof,
    // watched 2026-10-15: #479's top-left page (`p-8` main, `mb-6` heading)
    // with only `data-sign-in` added to its card failed at 1440 on `the column
    // is off the window’s middle · Expected: <= 1 · Received: 496`. The card
    // now stands on the sign-in card's own anchor, about 188px above true
    // centre at 1440, so the word mark does not move between the two (F-125,
    // D11); `expectAnchoredColumn` holds it to that anchor.
    for (const size of [
      { width: 1440, height: 900 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(size);
      await expectAnchoredColumn(page);
    }
    await expect(page.getByRole('alert')).toHaveText('The server is not available right now.');
    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveCount(0);
    await expect(page.getByText('Other sign-in options could not be loaded')).toHaveCount(0);

    await page.unroute('**/api/**');
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Server unavailable' })).toHaveCount(0);
  });
});

test.describe('the connection pill (D9)', () => {
  test('names the live link beside a write the server could not complete (F-078)', async ({
    page,
  }, testInfo) => {
    const seeded = await seedFourRows(page, 'write-refused', testInfo.workerIndex);
    await openSeededPlan(page, seeded);
    await expect(pill(page)).toHaveAttribute('data-fact', /^Live: /);

    // Every write answered as a stopped be-01 behind the proxy answers it; reads pass.
    await page.route('**/api/**', (route) =>
      route.request().method() === 'GET' ? route.continue() : route.fulfill(badGateway),
    );
    const name = page.getByLabel('Name of 020');
    await name.click();
    await name.pressSequentially(' again');
    await name.press('Tab');

    await expect(
      page.getByText('The server could not complete that change. Try again.'),
    ).toBeVisible();
    // The pill speaks of the live link only, so it says nothing the sentence contradicts.
    // Proof: on 5b65fd5ae this failed on `Expected pattern: /^Live: / Received string:
    // "Online: local-dev (you)"` — the header read `● Online` beside the refusal.
    await expect(pill(page)).toHaveAttribute('data-fact', /^Live: /);
    await expect(page.getByRole('banner').getByText('Online')).toHaveCount(0);
  });

  test('claims no roster while the live link is down (F-077)', async ({ page }, testInfo) => {
    const seeded = await seedFourRows(page, 'link-down', testInfo.workerIndex);
    // gw-01 stopped: every attempt the stream makes is closed at once.
    await page.routeWebSocket('**/ws', (socket) => socket.close());
    await openSeededPlan(page, seeded);

    await expect(
      page.getByText('Reconnecting — edits by other people may not be shown yet.'),
    ).toBeVisible();
    const section = pill(page);
    // Proof: on 5b65fd5ae this failed on `getByRole('heading', { name: 'Reconnecting' })`
    // `element(s) not found`: the header read `● Offline  Nobody yet.` at 1440 (and `● 0`
    // below it) while it could not know who was there.
    await expect(section.getByRole('heading', { name: 'Reconnecting' })).toBeVisible();
    await expect(section.getByText('Nobody yet.')).toHaveCount(0);
    await expect(section.locator('[data-presence-count]')).toHaveCount(0);
    await expect(section).toHaveAttribute(
      'data-fact',
      'Reconnecting: who else is here is not known until the link is back.',
    );
  });
});

/**
 * The contrast of a row's drop edge against the cell it is drawn on, per edge:
 * the strongest inset shadow at least 2px deep on the top or the bottom of the
 * target row's cells (`into`'s outline), or the line laid over the row on that
 * edge (`above`, `below`: `[data-drop-line]`, UI review F-128), rasterised
 * through a canvas for `external-refs.spec.ts`' reason (`oklch(…)` has no
 * luminance as a string).
 */
function dropEdgeContrast(page: Page, number: string): Promise<{ top: number; bottom: number }> {
  return page.evaluate((rowNumber) => {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx === null) throw new Error('no 2d context to rasterise a colour in');
    const rgbOf = (colour: string): [number, number, number] => {
      const sentinel = '#ff00ff';
      ctx.fillStyle = sentinel;
      ctx.fillStyle = colour;
      if (ctx.fillStyle === sentinel) throw new Error(`this engine will not parse ${colour}`);
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const painted = ctx.getImageData(0, 0, 1, 1).data;
      const alpha = painted[3] / 255;
      return [0, 1, 2].map((at) => painted[at] * alpha + 255 * (1 - alpha)) as [
        number,
        number,
        number,
      ];
    };
    const luminance = (colour: [number, number, number]): number => {
      const channel = (raw: number): number => {
        const unit = raw / 255;
        return unit <= 0.03928 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4);
      };
      return (
        0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2])
      );
    };
    const ratio = (a: [number, number, number], b: [number, number, number]): number => {
      const [bright, dim] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (bright + 0.05) / (dim + 0.05);
    };
    const row = document.querySelector(`tr:has([aria-label="Name of ${rowNumber}"])`);
    if (row === null) throw new Error(`no row ${rowNumber}`);
    const cell = row.querySelector('td:nth-child(3)');
    if (cell === null) throw new Error(`row ${rowNumber} has no third cell`);
    const style = getComputedStyle(cell);
    const ground = rgbOf(style.backgroundColor);
    const edges = { top: 1, bottom: 1 };
    const shadow = /((?:oklch|oklab|rgba?|color)\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g;
    for (const [, colour, , dy] of style.boxShadow.matchAll(shadow)) {
      const depth = Number(dy);
      const edge = depth >= 2 ? 'top' : depth <= -2 ? 'bottom' : null;
      if (edge !== null) edges[edge] = Math.max(edges[edge], ratio(rgbOf(colour), ground));
    }
    const line = document.querySelector('[data-drop-line]');
    const lineEdge = line?.getAttribute('data-drop-line');
    if (line !== null && (lineEdge === 'top' || lineEdge === 'bottom'))
      edges[lineEdge] = Math.max(
        edges[lineEdge],
        ratio(rgbOf(getComputedStyle(line).backgroundColor), ground),
      );
    return edges;
  }, number);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`a dragged row shows where it will land, in ${scheme} (F-076)`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    const seeded = await seedFourRows(page, `drop-cue-${scheme}`, testInfo.workerIndex);
    await openSeededPlan(page, seeded);
    const handle = page.getByRole('button', { name: 'Reorder 010' });
    const target = page.locator('tbody tr', { has: page.getByLabel('Name of 030') });
    const from = await handle.boundingBox();
    const box = await target.boundingBox();
    if (from === null || box === null) throw new Error('the handle or the target has no box');

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 20, { steps: 4 });

    // WCAG 1.4.11: a graphical cue needs 3:1 against what it is drawn on.
    // Proof: on 5b65fd5ae (a 2px `--ring` edge, only the `--grid-drop` tint for inside)
    // this failed on `above: the top edge Expected: >= 3 Received: 2.63…` in light and
    // `into: the top edge Received: 1` in dark.
    for (const [drop, dy, edges] of [
      ['above', 3, ['top']],
      ['below', box.height - 3, ['bottom']],
      ['into', box.height / 2, ['top', 'bottom']],
    ] as const) {
      await page.mouse.move(box.x + 300, box.y + dy, { steps: 6 });
      // The row's dragover reads the drag the previous render committed, so the
      // first one after the drag starts can fall on nothing: nudge until it lands.
      let nudge = 0;
      await expect(async () => {
        nudge = 1 - nudge;
        await page.mouse.move(box.x + 300 + nudge, box.y + dy);
        expect(await target.getAttribute('data-drop')).toBe(drop);
      }).toPass();
      const contrast = await dropEdgeContrast(page, '030');
      for (const edge of edges)
        expect(contrast[edge], `${drop}: the ${edge} edge`).toBeGreaterThanOrEqual(3);
    }

    await page.keyboard.press('Escape');
    await page.mouse.up();
  });
}
