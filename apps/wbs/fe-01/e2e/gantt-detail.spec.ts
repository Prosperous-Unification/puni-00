import { expect, type Page, test } from '@playwright/test';

import { createProject } from './create-project';

/**
 * What the chart's `Detail` switch hides, measured by the engine that paints it.
 *
 * The switch answered about three families of mark until 2026-09-12: the
 * stored-dependency arrows, the parent rows' summary brackets, and the bars for
 * slices nobody has estimated. Dany asked for the third in the first place
 * (2026-08-11, "remove … unestimated QA bars") and took it back after looking at
 * his own plan with the switch off — twelve of its rows are uncosted, and all
 * twelve drew nothing at all: _"with details disabled you still have to show the
 * unestimated slices"_.
 *
 * **A browser and not jsdom**, for the reason that report exists: this is a
 * claim about what a reader can see on a chart, and it was made by looking.
 * jsdom can watch the filter change and can say nothing about a row that has
 * gone blank.
 */

/** Two rows, one costed and one not, on a plan with no dependency at all. */
async function oneCostedAndOneNot(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page);

  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (const number of ['010', '020']) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }
  // Only `010` is costed. `020` is the uncosted row this file is about, and the
  // plan carries no edge — so the switch opens **off**, which is the state the
  // report was made in.
  const estimate = page.getByLabel('Dev estimate for 010');
  await estimate.fill('2/3/4');
  await estimate.blur();

  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.locator('[data-gantt-chart]')).toBeVisible();
  await expect(page.locator('[data-gantt-bar]').first()).toBeVisible();
  // The save and schedule refresh can finish after the chart opens. In CI
  // run 38522362798 the baseline still had four critical, unestimated bars;
  // the saved 2/3/4 estimate then gave 020 float and reduced its stroke while
  // Detail was clicked. Wait for the rendered three-day estimate before
  // measuring the switch's effect. The exact box comparison stays below.
  await expect(page.locator('[data-gantt-bar][aria-label^="010 - "]').first()).toHaveAttribute(
    'data-finish',
    '3',
  );
}

test.describe('what the chart’s detail switch hides, in a browser', () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'wait' });
  });

  test('draws an uncosted row with the detail off, and paints it as a guess', async ({ page }) => {
    await oneCostedAndOneNot(page);

    // The state the report was made in: nothing on this plan turns the switch on.
    await expect(page.locator('[data-gantt-detail-toggle]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // `020`'s own bar, found through the row's number rather than by counting:
    // every row carries a Dev and a QA slice, so a fully uncosted row draws two
    // assumed bars and the costed row draws one of its own. A global count says
    // nothing about *which* row is blank, and which row is blank is the report.
    //
    // Drawn with **area**, not merely present in the DOM — which is all jsdom
    // could ever have said about it.
    //
    // Proof: `drawnBars` put back to
    // `detailShown ? placed.bars : placed.bars.filter(({ bar }) => bar.estimated)` —
    // watched failing on `expect(locator).toBeVisible() failed · element(s) not
    // found` for this very locator, and the second case in this file timing out
    // on `locator.boundingBox`. That is the blank row, reproduced.
    const assumed = page.locator('[data-gantt-bar][data-assumed="true"][aria-label^="020 - "]');
    await expect(assumed.first()).toBeVisible();
    const box = await assumed.first().boundingBox();
    if (box === null) throw new Error('the assumed bar has no box');
    expect(box.width, 'the assumed bar is drawn with no width').toBeGreaterThan(0);
    expect(box.height, 'the assumed bar is drawn with no height').toBeGreaterThan(0);

    // And it still says it is a guess rather than passing for costed work: the
    // dashes, the lighter fill and `no estimate` are what carry that.
    const painted = await assumed.first().evaluate((bar) => {
      const style = getComputedStyle(bar);
      return { dash: style.strokeDasharray, fill: style.fillOpacity };
    });
    expect(painted.dash, 'the assumed bar is not dashed').not.toBe('none');
    expect(Number(painted.fill)).toBeLessThan(1);
    // `number · no estimate` (or `no estimate` on a narrow bar) since
    // ui-review F-037, where it used to lead with `?`.
    await expect(
      page.locator('[data-gantt-bar-label]').filter({ hasText: 'no estimate' }),
    ).not.toHaveCount(0);

    // Non-vacuity: the costed bar on `010` is drawn too, so the assertions above
    // are not holding of a chart that draws nothing — and it is *not* assumed,
    // so they are not holding of one that marks everything as a guess.
    await expect(page.locator('[data-gantt-bar]:not([data-assumed])')).toHaveCount(1);
  });

  test('leaves the uncosted row alone when the switch is pressed', async ({ page }) => {
    await oneCostedAndOneNot(page);
    const assumed = page.locator('[data-gantt-bar][data-assumed="true"][aria-label^="020 - "]');
    const before = await assumed.first().boundingBox();
    if (before === null) throw new Error('the assumed bar has no box');

    await page.locator('[data-gantt-detail-toggle]').click();

    await expect(page.locator('[data-gantt-detail-toggle]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Same bar, same place: the switch draws arrows and brackets, and this row
    // is no longer any of its business.
    await expect(assumed.first()).toBeVisible();
    expect(await assumed.first().boundingBox()).toEqual(before);
  });
});

/**
 * Two estimated rows named after `label` in the open project, the second
 * waiting on the first when `linked`.
 */
async function seedTwoRows(page: Page, label: string, linked: boolean): Promise<void> {
  const projectId = await page.evaluate(() => localStorage.getItem('wbs.project'));
  if (projectId === null) throw new Error('no project open to seed');
  const plan = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/work-items`);
    if (!response.ok) throw new Error(`plan read failed: ${String(response.status)}`);
    return response.json() as Promise<{ steps: { id: string; name: string }[] }>;
  }, projectId);
  const dev = plan.steps.find((step) => step.name === 'Dev');
  if (dev === undefined) throw new Error('a new project has no Dev step');
  const days = { optimistic: 2, realistic: 3, pessimistic: 4 };
  const commands = [
    { kind: 'createWorkItem', ref: 'first', parentId: null, afterId: null, name: `${label} first` },
    {
      kind: 'createWorkItem',
      ref: 'second',
      parentId: null,
      afterRef: 'first',
      name: `${label} second`,
    },
    { kind: 'setEstimate', workItemRef: 'first', stepId: dev.id, days },
    { kind: 'setEstimate', workItemRef: 'second', stepId: dev.id, days },
    ...(linked ? [{ kind: 'addDependency', workItemRef: 'second', predecessorRef: 'first' }] : []),
  ];
  await page.evaluate(
    async ({ id, body }) => {
      const response = await fetch(`/api/projects/${id}/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commands: body }),
      });
      if (!response.ok) throw new Error(`seed failed: ${String(response.status)}`);
    },
    { id: projectId, body: commands },
  );
}

/** Opens the header's project picker and chooses `name`. */
async function switchProject(page: Page, name: string): Promise<void> {
  const picker = page.getByRole('combobox', { name: 'Project' });
  await picker.evaluate((node) => {
    if (node instanceof HTMLElement) node.blur();
  });
  await picker.click();
  await page.getByRole('listbox', { name: 'Projects' }).getByRole('option', { name }).click();
  await expect(picker).toHaveValue(name);
}

test.describe('the detail switch across a project switch, in a browser', () => {
  /**
   * With nothing remembered, the never-said default belongs to the plan on
   * screen: choosing another project in the header decides it again from that
   * plan's first read, both ways (ui-review F-088).
   *
   * A **guard, not a proof of the hook's reset**: the page withdraws one
   * project's runtime before the next is live, so the table and its chart are
   * mounted afresh on every switch and the chart opens closed. This case
   * passed on the code before F-088 (main 3e06eb5a4, 2026-10-16); what it
   * pins is that the product path keeps deciding per plan. The reset itself,
   * for a panel that sees its links become unknown again, is proven in
   * `gantt-detail.test.tsx` and `gantt-panel.test.tsx`.
   *
   * Proof: with the default latched for the page's whole life (a module-level
   * latch in `useGanttDetail` set from the first known links, which is what a
   * chart surviving the switch would do), this failed on `Detail on for the
   * linked plan chosen next` (`Expected: "true", Received: "false"`). Watched
   * 2026-10-16.
   */
  test('decides the never-said default again for the project chosen next (F-088)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
    const tag = String(Date.now());
    const linked = `Linked ${tag}`;
    const plain = `Plain ${tag}`;
    const barsOf = (label: string) =>
      page.locator(`[data-gantt-bar][aria-label*="${label} first"]`);
    await createProject(page, linked);
    await seedTwoRows(page, linked, true);
    await createProject(page, plain);
    await seedTwoRows(page, plain, false);
    await page.reload();
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    await expect(barsOf(plain).first()).toBeVisible();
    const detail = page.locator('[data-gantt-detail-toggle]');
    await expect(detail, 'setup: a plan without links opens with Detail off').toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      await page.evaluate(() => localStorage.getItem('wbs.ganttDetail')),
      'setup: nothing remembered',
    ).toBeNull();

    await switchProject(page, linked);
    await expect(page.locator('[data-gantt-panel]'), 'a switch closes the chart').toHaveCount(0);
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    await expect(barsOf(linked).first(), 'setup: the linked plan is drawn').toBeVisible();
    await expect(detail, 'Detail on for the linked plan chosen next').toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await expect(page.locator('[data-gantt-arrow]').first()).toBeVisible();

    await switchProject(page, plain);
    await expect(page.locator('[data-gantt-panel]'), 'a switch closes the chart').toHaveCount(0);
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    await expect(barsOf(plain).first(), 'setup: the plain plan is drawn').toBeVisible();
    await expect(detail, 'Detail off again for the plain plan').toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      await page.evaluate(() => localStorage.getItem('wbs.ganttDetail')),
      'switching projects remembers nothing',
    ).toBeNull();
  });
});
