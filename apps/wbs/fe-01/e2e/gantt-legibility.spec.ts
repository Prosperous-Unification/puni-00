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
 * unassigned grey), one done row, and one row nobody estimated — whose two
 * placeholders share an instant and so share their row in lanes.
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

  const refs = [...people.map((_, at) => `p${String(at)}`), 'nobody', 'done', 'guess'];
  const days = { optimistic: 2, realistic: 3, pessimistic: 4 };
  await jsonSend(page, 'POST', `/api/projects/${projectId}/commands`, {
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
    for (const label of document.querySelectorAll<HTMLElement>('[data-gantt-bar-label]')) {
      const sliceId = label.dataset['ganttBarLabel'] ?? '';
      // Matched by value rather than by an attribute selector: a slice id is
      // two ids joined by a separator a CSS string does not carry verbatim.
      const bar = bars.find((each) => each.getAttribute('data-gantt-bar') === sliceId);
      if (bar === undefined) throw new Error(`label ${sliceId} has no bar under it`);
      const barStyle = getComputedStyle(bar);
      context.clearRect(0, 0, 1, 1);
      paint(groundOf(bar));
      paint(barStyle.fill, Number(barStyle.fillOpacity));
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
      expect(Object.keys(ratios).length).toBeGreaterThanOrEqual(14);
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

  test('labels never overlap one another on the chart (F-012)', async ({ page }) => {
    await seedEveryBarColour(page);
    const boxes = await page.locator('[data-gantt-bar-label]').evaluateAll((labels) =>
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
});
