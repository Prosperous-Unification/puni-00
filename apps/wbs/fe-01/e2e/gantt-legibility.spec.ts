import { expect, type Page, test } from '@playwright/test';

import { createProject } from './create-project';

/** One JSON write through the page's own session, so the API sees a signed-in reader. */
async function jsonSend<T>(page: Page, method: string, path: string, body: unknown): Promise<T> {
  return page.evaluate(
    async ({ verb, at, value }) => {
      const response = await fetch(at, {
        method: verb,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      });
      if (!response.ok) {
        throw new Error(
          `${verb} ${at} failed: ${String(response.status)} ${await response.text()}`,
        );
      }
      const text = await response.text();
      return (text === '' ? null : JSON.parse(text)) as T;
    },
    { verb: method, at: path, value: body },
  );
}

/** The Monday every bar here is placed after. */
const PLAN_START = '2026-09-21';

/**
 * A plan that wears every bar colour the chart has: ten rows each on one of
 * ten people (the whole palette, handed out top-down), a row on nobody (the
 * unassigned grey), one done row, one row nobody estimated — whose two
 * placeholders share an instant and so share their row in lanes — and an
 * on-hold row with a row waiting on it, hatched as blocked by proxy.
 */
async function seedEveryBarColour(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page, 'Every bar colour');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('wbs.project'))).not.toBeNull();
  const projectId = await page.evaluate(() => localStorage.getItem('wbs.project'));
  if (projectId === null) throw new Error('no project id after creating the plan');
  await jsonSend(page, 'PATCH', `/api/projects/${projectId}`, { startDate: PLAN_START });

  const plan = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/work-items`);
    return response.json() as Promise<{ steps: { id: string; name: string }[] }>;
  }, projectId);
  const stepId = (name: string): string => {
    const step = plan.steps.find((each) => each.name === name);
    if (step === undefined) throw new Error(`a new project has no ${name} step`);
    return step.id;
  };
  const dev = stepId('Dev');
  const qa = stepId('QA');

  const people = Array.from({ length: 10 }, (_, at) => `Person ${String(at + 1)}`);
  const created = await jsonSend<{ results: { entity?: { id: string } }[] }>(
    page,
    'POST',
    '/api/directory/commands',
    { commands: people.map((name) => ({ kind: 'createPerson', name })) },
  );
  const personIds = created.results.map((answer) => {
    const id = answer.entity?.id;
    if (id === undefined) throw new Error('a person create answered no entry');
    return id;
  });

  const refs = [
    ...people.map((_, at) => `p${String(at)}`),
    'nobody',
    'done',
    'guess',
    'held',
    'proxy',
  ];
  const days = { optimistic: 2, realistic: 3, pessimistic: 4 };
  const seeded = await jsonSend<{ results: { ref?: string; id?: string }[] }>(
    page,
    'POST',
    `/api/projects/${projectId}/commands`,
    {
      commands: [
        ...refs.map((ref, at) => ({
          kind: 'createWorkItem',
          ref,
          parentId: null,
          ...(at === 0 ? { afterId: null } : { afterRef: refs[at - 1] }),
          name: `Row ${ref}`,
        })),
        ...refs
          .filter((ref) => ref !== 'guess')
          .flatMap((ref) => [
            { kind: 'setEstimate', workItemRef: ref, stepId: dev, days },
            { kind: 'setEstimate', workItemRef: ref, stepId: qa, days },
          ]),
        ...personIds.map((personId, at) => ({
          kind: 'setAssignee',
          workItemRef: `p${String(at)}`,
          stepId: dev,
          personId,
        })),
        { kind: 'setAssignee', workItemRef: 'done', stepId: dev, personId: personIds[0] },
        { kind: 'setStatus', workItemRef: 'done', status: 'done', on: '2026-09-25' },
        // Orange, a dark-ink colour: the hatch's red stripes are the worst
        // ground a dark label can cross.
        { kind: 'setAssignee', workItemRef: 'proxy', stepId: dev, personId: personIds[1] },
        { kind: 'setStatus', workItemRef: 'held', status: 'on_hold' },
      ],
    },
  );
  const idOf = (ref: string): string => {
    const id = seeded.results.find((answer) => answer.ref === ref)?.id;
    if (id === undefined) throw new Error(`the seed answered no id for ${ref}`);
    return id;
  };
  // Waiting on a held row is what hatches a bar as blocked by proxy.
  await jsonSend(page, 'POST', `/api/projects/${projectId}/commands`, {
    commands: [{ kind: 'addDependency', workItemId: idOf('proxy'), predecessorId: idOf('held') }],
  });
  await page.reload();
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.locator('[data-gantt-bar]').first()).toBeVisible();
}

/**
 * A plan of three rows whose steps share one scheduled instant, the shape of
 * `010.3.06` and `010.3.08` in the PUNI plan (ui-review F-101): `010` with only
 * its last step estimated, short, and `020` with no step estimated at all;
 * and `030`, whose last step is estimated at ten days and so runs far past
 * its unestimated first step's assumed span (F-138).
 * Unknown slices take no schedule time, so `010`'s unestimated first step and
 * its short estimated one start at one instant and are drawn in lanes.
 */
async function seedSharedInstants(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page, 'Shared instants');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('wbs.project'))).not.toBeNull();
  const projectId = await page.evaluate(() => localStorage.getItem('wbs.project'));
  if (projectId === null) throw new Error('no project id after creating the plan');
  await jsonSend(page, 'PATCH', `/api/projects/${projectId}`, { startDate: PLAN_START });
  const plan = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/work-items`);
    return response.json() as Promise<{ steps: { id: string; name: string }[] }>;
  }, projectId);
  const last = plan.steps.at(-1);
  if (last === undefined || plan.steps.length < 2) {
    throw new Error('a new project has fewer than two steps');
  }
  await jsonSend(page, 'POST', `/api/projects/${projectId}/commands`, {
    commands: [
      { kind: 'createWorkItem', ref: 'pile', parentId: null, afterId: null, name: 'Row pile' },
      { kind: 'createWorkItem', ref: 'ghost', parentId: null, afterRef: 'pile', name: 'Row ghost' },
      { kind: 'createWorkItem', ref: 'long', parentId: null, afterRef: 'ghost', name: 'Row long' },
      {
        kind: 'setEstimate',
        workItemRef: 'long',
        stepId: last.id,
        days: { optimistic: 8, realistic: 10, pessimistic: 12 },
      },
      {
        kind: 'setEstimate',
        workItemRef: 'pile',
        stepId: last.id,
        days: { optimistic: 0.25, realistic: 0.5, pessimistic: 1 },
      },
    ],
  });
  await page.reload();
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.locator('[data-gantt-bar]').first()).toBeVisible();
}

/**
 * Every on-bar label's contrast against the bar under it, measured the way
 * `status.spec.ts` measures a glyph: the computed colours composited on a 1×1
 * canvas — the page's own ground, then the bar's fill at its computed
 * `fill-opacity` — and WCAG's ratio of the two pixels.
 */
async function labelContrasts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('no 2d canvas in this browser');
    const pixel = (): [number, number, number] => {
      const rgba = context.getImageData(0, 0, 1, 1).data;
      if (rgba[3] !== 255) throw new Error('chart surface is not opaque');
      return [rgba[0], rgba[1], rgba[2]];
    };
    const paint = (colour: string, alpha = 1): void => {
      context.globalAlpha = alpha;
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      context.globalAlpha = 1;
    };
    const channel = (value: number): number => {
      const part = value / 255;
      return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([red, green, blue]: [number, number, number]): number =>
      0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    const groundOf = (element: Element): string => {
      for (let at: Element | null = element; at !== null; at = at.parentElement) {
        const colour = getComputedStyle(at).backgroundColor;
        if (colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent') return colour;
      }
      throw new Error('nothing under the chart paints a background');
    };
    const ratios: Record<string, number> = {};
    const bars = [...document.querySelectorAll('[data-gantt-bar]')];
    // A lane stack's one label is measured over its first bar, under its own
    // patch of ground (F-101).
    for (const label of document.querySelectorAll<HTMLElement>(
      '[data-gantt-bar-label], [data-gantt-stack-label]',
    )) {
      const sliceId = label.dataset['ganttBarLabel'] ?? label.dataset['ganttStackLabel'] ?? '';
      // Matched by value rather than by an attribute selector: a slice id is
      // two ids joined by a separator a CSS string does not carry verbatim.
      const bar = bars.find((each) => each.getAttribute('data-gantt-bar') === sliceId);
      if (bar === undefined) throw new Error(`label ${sliceId} has no bar under it`);
      const barStyle = getComputedStyle(bar);
      context.clearRect(0, 0, 1, 1);
      paint(groundOf(bar));
      paint(barStyle.fill, Number(barStyle.fillOpacity));
      // A hatched bar's red stripes cross the label too: unless the label
      // carries its own ground, measure it against a stripe, its worst case.
      const own = label.querySelector('[data-gantt-label-ground]');
      if (own !== null) paint(getComputedStyle(own).backgroundColor);
      else if (bar.getAttribute('data-blocked-by-proxy') === 'true') paint('#dc2626');
      const ground = luminance(pixel());
      context.clearRect(0, 0, 1, 1);
      paint(getComputedStyle(label).color);
      const ink = luminance(pixel());
      ratios[`${sliceId} on ${barStyle.fill}`] =
        (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05);
    }
    return ratios;
  });
}

test.describe('Gantt legibility (ui-review 2026-10-13)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`every bar label clears 4.5:1 on its bar, ${scheme} (F-038)`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme: scheme });
      await seedEveryBarColour(page);
      const ratios = await labelContrasts(page);
      await testInfo.attach(`bar label contrast, ${scheme}`, {
        body: JSON.stringify(ratios, null, 2),
        contentType: 'application/json',
      });
      // Ten people, the unassigned grey, a done bar and a placeholder: every
      // kind of fill a label sits on.
      expect(Object.keys(ratios).length).toBeGreaterThanOrEqual(15);
      expect(
        await page.locator('[data-gantt-bar][data-blocked-by-proxy="true"]').count(),
        'no hatched bar to measure',
      ).toBeGreaterThan(0);
      await expect(page.locator('[data-gantt-held]')).not.toHaveCount(0);
      // Proof: with `gantt-geometry.ts` as on main (tab10, a 0.35 luminance
      // threshold) and done bars at `[fill-opacity:0.75]`, this failed in both
      // schemes on the green bar's label, `rgb(44, 160, 44)` at
      // 3.4025803501541017; with the palette fixed and only the done bars'
      // 75% fill put back, in light on the done bar's label at
      // 3.2579494463966228. Watched 2026-10-13.
      for (const [bar, measured] of Object.entries(ratios)) {
        expect(measured, `label on ${bar}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  test('a strip toggle that is off reads as off, not as disabled (F-013)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedEveryBarColour(page);
    const names = page.locator('[data-gantt-labels-toggle]');
    const look = () =>
      names.evaluate((button) => {
        const style = getComputedStyle(button);
        return {
          struck: style.textDecorationLine.includes('line-through'),
          dashed: style.borderTopStyle === 'dashed',
          ground: style.backgroundColor,
        };
      });
    await expect(names).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    const pressed = await look();
    await names.click();
    await expect(names).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.move(0, 0);
    // Past the 150ms colour transition the variants carry.
    await page.waitForTimeout(300);
    const off = await look();
    // Proof: on main, whose off toggles were `line-through border-dashed`,
    // this failed on `Names struck through when off`, expected false,
    // received true; watched 2026-10-13.
    expect(off.struck, 'Names struck through when off').toBe(false);
    expect(off.dashed, 'Names dashed when off').toBe(false);
    // And on and off still differ at a glance: the pressed toggle is filled.
    expect(pressed.ground, 'the pressed toggle is drawn like the released one').not.toBe(
      off.ground,
    );
  });

  /**
   * The chart opened before the plan's first read lands must still open with
   * the detail its links call for: the never-said default waits for the links
   * instead of being decided on the empty plan the chart mounted with (F-065).
   *
   * Proof: on the code before F-065 this failed on `Detail pressed once the
   * links arrived` (`Expected: "true", Received: "false"`). Watched 2026-10-14.
   */
  test('Detail opens on for a plan with links even when the chart opens first (F-065)', async ({
    page,
  }) => {
    await seedEveryBarColour(page);
    const detail = page.locator('[data-gantt-detail-toggle]');
    await expect(detail, 'setup: the plan has links, so Detail opens on').toHaveAttribute(
      'aria-pressed',
      'true',
    );
    let release = (): void => {
      throw new Error('the tree read was never held');
    };
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heldReads = 0;
    await page.route(/\/api\/projects\/[^/]+\/work-items$/, async (route) => {
      heldReads += 1;
      await held;
      await route.continue();
    });
    try {
      await page.reload();
      await page.getByRole('button', { name: 'Gantt', exact: true }).click();
      await expect(page.locator('[data-gantt-panel]')).toBeVisible();
      expect(heldReads, 'setup: the chart opened while the tree read was held').toBeGreaterThan(0);
      await expect(page.locator('[data-gantt-bar]'), 'setup: no plan read has landed').toHaveCount(
        0,
      );
      release();
      await expect(page.locator('[data-gantt-bar]').first()).toBeVisible();
      await expect(detail, 'Detail pressed once the links arrived').toHaveAttribute(
        'aria-pressed',
        'true',
      );
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });

  test('labels never overlap one another on the chart (F-012)', async ({ page }) => {
    await seedEveryBarColour(page);
    const boxes = await page
      .locator('[data-gantt-bar-label], [data-gantt-stack-label]')
      .evaluateAll((labels) =>
        labels.map((label) => {
          const box = label.getBoundingClientRect();
          return {
            id: label.textContent,
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
          };
        }),
      );
    expect(boxes.length).toBeGreaterThan(10);
    // Proof: on main, whose labels took the whole bar band in every lane,
    // this failed on the `guess` row's two placeholders, `? · 130 · Row guess
    // over ? · 130 · Row guess`, expected false, received true; watched
    // 2026-10-13.
    for (const [at, first] of boxes.entries()) {
      for (const second of boxes.slice(at + 1)) {
        const overlap =
          first.left < second.right - 0.5 &&
          second.left < first.right - 0.5 &&
          first.top < second.bottom - 0.5 &&
          second.top < first.bottom - 0.5;
        expect(overlap, `${first.id} over ${second.id}`).toBe(false);
      }
    }
  });

  test('a row whose steps share one instant writes its number once, whole (F-101)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSharedInstants(page);
    const labels = await page
      .locator('[data-gantt-bar-label], [data-gantt-stack-label]')
      .evaluateAll((found) =>
        found.map((label) => {
          // The glyphs' own box, not the label's: what overprinted was ink.
          const range = document.createRange();
          range.selectNodeContents(label);
          const ink = range.getBoundingClientRect();
          const box = label.getBoundingClientRect();
          return {
            text: label.textContent,
            stack: label.hasAttribute('data-gantt-stack-label'),
            left: Math.max(ink.left, box.left),
            right: Math.min(ink.right, box.right),
            top: Math.max(ink.top, box.top),
            bottom: Math.min(ink.bottom, box.bottom),
          };
        }),
      );
    // `010` is one short estimated step beside unestimated ones; `020` is
    // nobody's estimate at all. Each writes its number once, on its stack.
    //
    // Proof: on main, which wrote a label in each lane, this failed on
    // `labels for 010`, expected length 1, received `["010 · no estimate",
    // "010"]`; watched 2026-10-16.
    //
    // The counts are pinned: the seed is fixed, so a stack that miscounted
    // must not pass (F-142).
    for (const [number, words] of [
      ['010', '010 · 2 steps · 1 no estimate'],
      ['020', '020 · 2 steps · no estimate'],
    ] as const) {
      const own = labels.filter((label) => label.text.startsWith(number));
      expect(
        own.map((label) => label.text),
        `labels for ${number}`,
      ).toEqual([words]);
      expect(own[0].stack, `${number} written by its stack`).toBe(true);
    }
    // `030`'s ten-day bar keeps its own words past the placeholder, beside
    // the stack's.
    //
    // Proof: on 52cdd2ae5, which gave every laned bar no label, this failed
    // on `labels for 030`, the received list missing `"bar: 030 · Row
    // long"` (only the stack's label); watched 2026-10-17.
    const long = labels.filter((label) => label.text.startsWith('030'));
    expect(
      long.map((label) => `${label.stack ? 'stack' : 'bar'}: ${label.text}`).sort(),
      'labels for 030',
    ).toEqual(['bar: 030 · Row long', 'stack: 030 · 2 steps · 1 no estimate']);
    // Every label here, the spilled one on its patch of bar fill included,
    // clears 4.5:1 on what it sits on.
    for (const [bar, measured] of Object.entries(await labelContrasts(page))) {
      expect(measured, `label on ${bar}`).toBeGreaterThanOrEqual(4.5);
    }
    // No two labels' ink touches, with a pixel of air on every side.
    for (const [at, first] of labels.entries()) {
      for (const second of labels.slice(at + 1)) {
        const touches =
          first.left < second.right + 1 &&
          second.left < first.right + 1 &&
          first.top < second.bottom + 1 &&
          second.top < first.bottom + 1;
        expect(touches, `${first.text} against ${second.text}`).toBe(false);
      }
    }
  });

  test('a compressed axis names its months and the chart fills the panel (F-023, F-026)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedEveryBarColour(page);
    await page.locator('[data-gantt-day-scale]').selectOption('4');
    await expect(page.locator('[data-gantt-axis] [data-axis-month]').first()).toHaveText(
      'Oct 2026',
    );
    const fit = await page.evaluate(() => {
      const panel = document.querySelector('[data-gantt-panel]');
      const chart = document.querySelector('[data-gantt-chart]');
      if (panel === null || chart === null) throw new Error('the chart is not on the page');
      return {
        panelRight: panel.getBoundingClientRect().right,
        chartRight: chart.getBoundingClientRect().right,
        scrolls: panel.scrollWidth > panel.clientWidth,
      };
    });
    // Proof: on main the month name was never drawn and the first assertion
    // failed (`element(s) not found` for `[data-axis-month]`); with the names
    // kept and the horizon put back to the schedule's own, this failed on the
    // chart's right edge, expected > 1404, received 260. Watched 2026-10-13.
    expect(fit.chartRight).toBeGreaterThan(fit.panelRight - 20);
    expect(fit.scrolls).toBe(false);
  });

  for (const width of [1440, 1024] as const) {
    test(`full screen fills its width at every rung, ${String(width)}px (F-062)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
      await seedEveryBarColour(page);
      await page.locator('[data-gantt-fullscreen-toggle]').click();
      await expect(page.locator('[data-gantt-fullscreen]')).toBeVisible();
      for (const pxPerWorkday of [28, 12, 4] as const) {
        await page.locator('[data-gantt-day-scale]').selectOption(String(pxPerWorkday));
        // How far the last axis column stops short of the scroll box's inner
        // right edge, and whether the box scrolls sideways. The fill is floored
        // to whole columns and keeps the chart's own right pad (12px), so a
        // filled chart is short by less than one column plus that pad and the
        // box never scrolls: a scrollbar here would be one for nothing.
        const fill = (): Promise<string> =>
          page.evaluate((columnPx) => {
            const panel = document.querySelector('[data-gantt-fullscreen] [data-gantt-panel]');
            const columns = document.querySelectorAll('[data-gantt-axis] [data-axis-day]');
            if (!(panel instanceof HTMLElement) || columns.length === 0) {
              throw new Error('the full-screen chart is not on the page');
            }
            const last = columns.item(columns.length - 1).getBoundingClientRect().right;
            const shortfall = panel.getBoundingClientRect().left + panel.clientWidth - last;
            const scrolls = panel.scrollWidth > panel.clientWidth;
            return shortfall >= 0 && shortfall < columnPx + 12 && !scrolls
              ? 'filled'
              : `last column ${String(shortfall)}px short of the edge, scrolls: ${String(scrolls)}`;
          }, pxPerWorkday);
        // Proof: on integration-1 abd06e9ad (the scroll box remounts into the
        // overlay while the width observers keep watching the detached box,
        // which measures 0) this failed at Days on a last column 804px short of
        // the edge at 1440 and 388px short at 1024. With the observers fixed and
        // `axisMonthWords`'s room check not yet written, at Weeks 1440 on `last
        // column 16px short of the edge, scrolls: true` — "Jan 2027" on the
        // last cell ran 15px past the chart. Watched 2026-10-14.
        await expect
          .poll(fill, { message: `the chart at ${String(pxPerWorkday)}px a day` })
          .toBe('filled');
      }
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-gantt-fullscreen]')).toHaveCount(0);
      // And back under the plan, the panel fills its own width again: the
      // scroll box remounts on the way out as well as on the way in.
      // Proof: with `fullScreen` dropped from the measuring effect's
      // dependencies and the loop above skipped, this failed on `expected 1144
      // to be less than 20` at 1440 and 728 at 1024. Watched 2026-10-14.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const panel = document.querySelector('[data-gantt-panel]');
            const chart = document.querySelector('[data-gantt-chart]');
            if (panel === null || chart === null) throw new Error('the chart is not on the page');
            return panel.getBoundingClientRect().right - chart.getBoundingClientRect().right;
          }),
        )
        .toBeLessThan(20);
    });
  }
});
