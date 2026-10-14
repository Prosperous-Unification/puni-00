import { expect, type Page, test } from '@playwright/test';
import type { PlanCommandWire } from '@wbs/contracts';

import {
  fixtureClient,
  fixtureSuccess,
  openSeededPlan,
  type SeededPlan,
  seedPlan,
} from './plan-fixture';

/**
 * The plan table as the UI review of 2026-10-13 read it (findings F-006,
 * F-022, F-033, F-034, F-035, F-043, F-044, F-048), measured by a browser:
 * every one of them is a clip, a wrap or an edge, which jsdom cannot see.
 *
 * One plan carries every shape the review photographed — a typed `SS` and `FF`
 * dependency, an assignee with the widest initials (`WW`) assumed on a second
 * step, trios beside fractional results, and chips in every reference column.
 */

const identity = (testName: string, worker: number) => ({
  run: 'plan-table-review',
  worker,
  test: testName,
});

interface ReviewPlan {
  seeded: SeededPlan;
}

async function seedReviewPlan(page: Page, testName: string, worker: number): Promise<ReviewPlan> {
  const suffix = `${testName}-w${String(worker)}`;
  const seeded = await seedPlan(
    page,
    {
      name: 'Plan table review',
      tags: [
        { ref: 'customer', name: 'customer-request' },
        { ref: 'debt', name: 'tech-debt' },
      ],
      rows: [
        {
          ref: 'signup',
          name: 'Sign-up form with email verification',
          estimates: {
            Dev: { optimistic: 2, realistic: 3, pessimistic: 5 },
            QA: { optimistic: 0.5, realistic: 0.5, pessimistic: 1 },
          },
          tagRefs: ['customer'],
        },
        {
          ref: 'rate',
          name: 'Rate limiting on the public API',
          afterRef: 'signup',
          estimates: {
            Dev: { optimistic: 2, realistic: 3, pessimistic: 4 },
            QA: { optimistic: 1, realistic: 1, pessimistic: 2 },
          },
          tagRefs: ['debt'],
        },
        {
          ref: 'cookie',
          name: 'Fix: session cookie not renewed after password change',
          afterRef: 'rate',
          estimates: { Dev: { optimistic: 0.5, realistic: 1, pessimistic: 2 } },
        },
        {
          ref: 'spike',
          name: 'Spike: evaluate Postgres row-level security',
          afterRef: 'cookie',
          estimates: { Dev: { optimistic: 3, realistic: 3, pessimistic: 3 } },
        },
        {
          ref: 'long',
          name:
            'A dependency candidate whose name keeps going well past the right edge of any laptop ' +
            'window there is, because the list it is offered in opens at its own cell and a name ' +
            'is as long as somebody typed it',
          afterRef: 'spike',
        },
      ],
    },
    identity(testName, worker),
  );
  const client = fixtureClient(page);
  const directory = [
    { kind: 'createTeam' as const, ref: 'team', name: `Backend ${suffix}` },
    { kind: 'createTeam' as const, ref: 'second', name: `Frontend ${suffix}` },
    {
      kind: 'createPerson' as const,
      ref: 'walter',
      name: `Walter White ${suffix}`,
      teamRefs: ['team'],
    },
    { kind: 'createWorkItemType' as const, ref: 'feature', name: `Feature ${suffix}` },
  ];
  const made = fixtureSuccess(
    'postApiDirectoryCommands',
    await client.postApiDirectoryCommands({ body: { commands: directory } }),
  ).body.results;
  const idOf = (ref: string): string => {
    const index = directory.findIndex((command) => command.ref === ref);
    const id = made.find((answer) => answer.index === index)?.id;
    if (id === undefined) throw new Error(`directory command ${ref} returned no id`);
    return id;
  };
  const row = (ref: string): string => seeded.rowIds[ref];
  const dev = seeded.stepIds['Dev'];
  const commands: PlanCommandWire[] = [
    // `WW` on Dev and nobody on QA: QA reads the assumed `(WW)`, the widest
    // form the assignee slot has to hold.
    { kind: 'setAssignee', workItemId: row('rate'), stepId: dev, personId: idOf('walter') },
    { kind: 'setAssignee', workItemId: row('signup'), stepId: dev, personId: idOf('walter') },
    {
      kind: 'patchWorkItem',
      workItemId: row('rate'),
      patch: { teamIds: [idOf('team'), idOf('second')], typeIds: [idOf('feature')] },
    },
    {
      kind: 'addTypedDependency',
      predecessor: { scope: 'whole', workItemId: row('rate') },
      successor: { scope: 'whole', workItemId: row('cookie') },
      type: 'SS',
    },
    {
      kind: 'addTypedDependency',
      predecessor: { scope: 'whole', workItemId: row('cookie') },
      successor: { scope: 'whole', workItemId: row('spike') },
      type: 'FF',
    },
    // A step's node as the predecessor: the longest chip the column draws.
    {
      kind: 'addTypedDependency',
      predecessor: { scope: 'node', workItemId: row('signup'), stepId: dev },
      successor: { scope: 'whole', workItemId: row('long') },
      type: 'SS',
    },
  ];
  fixtureSuccess(
    'postApiProjectsByIdCommands',
    await client.postApiProjectsByIdCommands({
      params: { id: seeded.projectId },
      body: { commands },
    }),
  );
  await openSeededPlan(page, seeded);
  await expect(page.getByLabel('Name of 050')).toBeVisible();
  return { seeded };
}

/**
 * The PUNI plan's numbering (F-057, F-058): three segments with a two-digit
 * leaf, `010.3.01`, the widest number the Depends on column draws by default.
 * `Website` (020) waits for three of them, `Launch` (030) for one, and
 * `Domains` (010.1) for three plain roots' worth of short numbers.
 */
async function seedDeepPlan(page: Page, testName: string, worker: number): Promise<SeededPlan> {
  const seeded = await seedPlan(
    page,
    {
      name: 'Deep numbers',
      rows: [
        { ref: 'infra', name: 'Infrastructure' },
        { ref: 'site', name: 'Website' },
        { ref: 'launch', name: 'Launch' },
      ],
    },
    identity(testName, worker),
  );
  const infra = seeded.rowIds['infra'];
  const hosts = Array.from({ length: 10 }, (_, index) => `host${String(index)}`);
  const commands: PlanCommandWire[] = [
    { kind: 'createWorkItem', ref: 'domains', name: 'Domains', parentId: infra, afterId: null },
    { kind: 'createWorkItem', ref: 'mail', name: 'Mail', parentId: infra, afterRef: 'domains' },
    { kind: 'createWorkItem', ref: 'hosting', name: 'Hosting', parentId: infra, afterRef: 'mail' },
    ...hosts.map((ref, index): PlanCommandWire => ({
      kind: 'createWorkItem',
      ref,
      name: `Host task ${String(index + 1)}`,
      parentRef: 'hosting',
      ...(index === 0 ? { afterId: null } : { afterRef: hosts[index - 1] }),
    })),
    ...['host0', 'host1', 'host2'].map((ref): PlanCommandWire => ({
      kind: 'addDependency',
      workItemId: seeded.rowIds['site'],
      predecessorRef: ref,
    })),
    { kind: 'addDependency', workItemId: seeded.rowIds['launch'], predecessorRef: 'host0' },
  ];
  const client = fixtureClient(page);
  fixtureSuccess(
    'postApiProjectsByIdCommands',
    await client.postApiProjectsByIdCommands({
      params: { id: seeded.projectId },
      body: { commands },
    }),
  );
  await openSeededPlan(page, seeded);
  await expect(page.getByLabel('Name of 010.3.10')).toBeVisible();
  return seeded;
}

/** What one resting Depends on strip draws, measured: whole chips, cut chips, and its count. */
async function readDependsStrip(page: Page, rowName: string) {
  return page
    .locator('tr', { hasText: rowName })
    .locator('[data-depends-strip]')
    .evaluate((strip) => {
      const line = strip.querySelector('[data-reference-chips]') ?? strip;
      const edge = line.getBoundingClientRect();
      const chips = [...strip.querySelectorAll('[data-reference-chip]')].map((chip) => {
        const box = chip.getBoundingClientRect();
        const words = chip.querySelector('span') ?? chip;
        return {
          text: words.textContent.trim(),
          drawn:
            box.top < edge.bottom - 0.5 &&
            box.left < edge.right &&
            getComputedStyle(chip).opacity !== '0',
          whole: box.right <= edge.right + 0.5 && words.scrollWidth <= words.clientWidth,
          right: box.right,
        };
      });
      const count = strip.querySelector('[data-reference-hidden-count]');
      return {
        chips,
        count: count === null ? null : count.textContent.trim(),
        countTitle: count?.getAttribute('title') ?? null,
        countLeft: count?.getBoundingClientRect().left ?? null,
        bareTotal: strip.querySelector('[data-dep-count]') !== null,
        fade: getComputedStyle(line).maskImage,
        stripFade: getComputedStyle(strip).maskImage,
      };
    });
}

async function showEveryColumn(page: Page): Promise<void> {
  await page.getByText('Columns', { exact: true }).click();
  for (const label of ['Links', 'Status', 'Teams', 'Tags', 'Services', 'Types']) {
    await page.getByRole('checkbox', { name: label, exact: true }).check();
  }
  await page.getByText('Columns', { exact: true }).click();
}

test.describe('the plan table, as the UI review read it', () => {
  test('names every column in whole words on one line', async ({ page }, testInfo) => {
    // F-006 and F-043. Proof, watched 2026-10-13 on the code before this
    // change: failed on `Received: ["#", "○", "Links", "Name", "Depends on",
    // "Prio", …]` — no `Status`, no `Priority`, no `Not before`.
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedReviewPlan(page, 'headers', testInfo.workerIndex);
    await showEveryColumn(page);

    const headings = await page.locator('[data-grid] thead th').evaluateAll((cells) =>
      cells.map((cell) => {
        // The heading itself, not the resize handle beside it.
        const content = cell.querySelector('button') ?? cell.firstElementChild ?? cell;
        // Distinct line boxes the heading's text lays out on.
        const range = document.createRange();
        range.selectNodeContents(content);
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        return {
          column: cell.getAttribute('data-column') ?? '',
          text: cell.textContent.trim(),
          clipped: content.scrollWidth > content.clientWidth,
          lines,
          transform: getComputedStyle(content).textTransform,
        };
      }),
    );
    // `drag` and `actions` head controls, not data. `in-parallel` keeps its
    // two-person icon in a 32px column, with its words as the heading's
    // accessible name — a column of three digits, not one the review named.
    const named = headings.filter(
      ({ column }) => !['drag', 'actions', 'in-parallel'].includes(column),
    );
    expect(named.map(({ text }) => text)).toEqual(
      expect.arrayContaining(['Status', 'Links', 'Depends on', 'Priority', 'Not before']),
    );
    for (const heading of named) {
      expect(heading.text, `${heading.column} has a heading`).not.toBe('');
      expect(heading.text, `${heading.column} abbreviates`).not.toMatch(/\.$/);
      expect(heading.clipped, `${heading.column} heading is clipped`).toBe(false);
      expect(heading.lines, `${heading.column} heading wraps`).toBeLessThanOrEqual(1);
    }
    expect(new Set(named.map(({ transform }) => transform))).toEqual(new Set(['none']));
  });

  test('keeps a typed dependency chip inside its cell', async ({ page }, testInfo) => {
    // F-033. Proof, watched 2026-10-13 on the code before this change:
    // failed on `010.s1-dev SS runs past its cell · Received: 17.015625`.
    // Since F-058 (2026-10-14) a chip is never cut, its words included: one
    // that does not fit whole is hidden and named by the `+N` count's title
    // (decision D4). Proof: the chip's undrawn style removed, this failed
    // on `010.s1-dev SS runs past its cell · Received: 27.734375`.
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedReviewPlan(page, 'typed-chips', testInfo.workerIndex);
    await page.mouse.move(2, 890);

    const chips = await page.locator('[data-typed-dependency-chip]').evaluateAll((all) =>
      all.map((chip) => {
        const strip = chip.closest('[data-depends-strip]');
        if (strip === null) throw new Error('a typed chip outside its strip');
        return {
          text: chip.textContent.trim(),
          title: chip.getAttribute('title') ?? '',
          past: chip.getBoundingClientRect().right - strip.getBoundingClientRect().right,
          shown: getComputedStyle(chip).opacity !== '0',
          countTitle:
            strip.querySelector('[data-reference-hidden-count]')?.getAttribute('title') ?? '',
        };
      }),
    );
    expect(chips).toHaveLength(3);
    for (const chip of chips) {
      expect(chip.title).not.toBe('');
      if (chip.shown) expect(chip.past, `${chip.text} runs past its cell`).toBeLessThanOrEqual(0);
      else expect(chip.countTitle).toBe(`Also: ${chip.text}`);
    }
  });

  test('keeps the initials whole and drops a trio that does not fit', async ({
    page,
  }, testInfo) => {
    // F-034. Proof, watched 2026-10-13. On the code before this change it
    // failed on `· WW · Expected: true · Received: false` — even the named
    // form overran the 32px slot. With `watchTrioFit` made a no-op, on
    // `0.5/0.5/1 is drawn cut · Received: "oklch(0.554 0.046 257.417)"`.
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedReviewPlan(page, 'estimate-cells', testInfo.workerIndex);

    const assignees = await page.locator('[data-folded-assignee]').evaluateAll((all) =>
      all.map((each) => ({
        text: each.textContent,
        fits: each.scrollWidth <= each.clientWidth,
      })),
    );
    for (const assignee of assignees) expect(assignee.fits, assignee.text).toBe(true);
    expect(assignees.map(({ text }) => text)).toEqual(expect.arrayContaining(['· WW', '(WW)']));

    await page.mouse.move(2, 890);
    const trios = await page.locator('[data-final] input').evaluateAll((boxes) =>
      boxes
        .filter((box): box is HTMLInputElement => box instanceof HTMLInputElement)
        .map((box) => ({
          value: box.value,
          besideResult: box.parentElement?.querySelector('[data-folded-final]') != null,
          overflows: box.scrollWidth > box.clientWidth,
          ink: getComputedStyle(box).webkitTextFillColor,
        })),
    );
    const cut = trios.filter(({ besideResult, overflows }) => besideResult && overflows);
    expect(cut.length, 'the plan has a trio too wide for its staffed cell').toBeGreaterThan(0);
    for (const trio of cut) expect(trio.ink, `${trio.value} is drawn cut`).toBe('rgba(0, 0, 0, 0)');

    // The focus gives the dropped trio back to be typed in.
    const box = page.getByLabel('QA estimate for 010');
    await box.focus();
    await expect
      .poll(() => box.evaluate((input) => getComputedStyle(input).webkitTextFillColor))
      .not.toBe('rgba(0, 0, 0, 0)');
  });

  test('keeps a refused draft’s ink after a resize', async ({ page }, testInfo) => {
    // Review of PR #409: a box that stopped being a resting trio (here: a
    // backwards trio be-01 would refuse, which is a complaint) must leave the
    // shared observer, or the next resize measures it again and blanks the
    // complaint's text under its red fill.
    // Proof: the `unobserve` taken out of `unwatchTrioFit`, this failed on
    // `Expected: not "rgba(0, 0, 0, 0)"` — watched 2026-10-13 with a window
    // resize, and again 2026-10-14 with the column drag below.
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedReviewPlan(page, 'refused-draft', testInfo.workerIndex);

    const box = page.getByLabel('QA estimate for 010');
    await box.click();
    await box.fill('8/3/2');
    await page.mouse.click(2, 890);
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    // The QA column's own edge dragged 20px narrower: a column is the one thing
    // that resizes this box — under `table-layout: fixed` a step column keeps
    // its declared width whatever the window does, so a window resize would
    // prove nothing about the observer.
    const qaColumn = await page
      .locator('thead th')
      .filter({ hasText: 'QA' })
      .first()
      .getAttribute('data-column');
    if (qaColumn === null) throw new Error('the QA heading has no column id');
    const widthBefore = await box.evaluate((input) => input.clientWidth);
    const handle = page.locator(`thead th[data-column="${qaColumn}"] [data-resize-handle]`);
    const grip = await handle.boundingBox();
    if (grip === null) throw new Error('the QA column has no resize handle on screen');
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    for (const step of [5, 10, 15, 20]) {
      await page.mouse.move(grip.x + grip.width / 2 - step, grip.y + grip.height / 2);
    }
    await page.mouse.up();
    expect(await box.evaluate((input) => input.clientWidth)).toBeLessThan(widthBefore);
    // Two frames, so the observer has reported both sizes.
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    expect(await box.evaluate((input) => getComputedStyle(input).webkitTextFillColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
  });

  test('draws no placeholder in a box too narrow for it', async ({ page }, testInfo) => {
    // F-035 and F-048. Proof, watched 2026-10-13 on the code before this
    // change: failed with 47 lines of cramped boxes — `search, or 010, 020`
    // in every Depends on cell, `add` and `search or add` beside a chip.
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedReviewPlan(page, 'placeholders', testInfo.workerIndex);
    await showEveryColumn(page);
    await page.mouse.move(2, 890);

    const cramped = await page
      .locator(
        '[data-grid] tbody [data-reference-strip] input, [data-grid] tbody [data-depends-input]',
      )
      .evaluateAll((boxes) =>
        boxes
          .filter((box): box is HTMLInputElement => box instanceof HTMLInputElement)
          .filter((box) => box.placeholder !== '')
          .map((box) => {
            const style = getComputedStyle(box);
            const probe = document.createElement('span');
            probe.style.cssText = `position:absolute;white-space:pre;font:${style.font}`;
            probe.textContent = box.placeholder;
            document.body.append(probe);
            const needs = probe.getBoundingClientRect().width;
            probe.remove();
            const room =
              box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            return { placeholder: box.placeholder, needs, room };
          })
          .filter(({ needs, room }) => needs > room + 0.5),
      );
    expect(cramped).toEqual([]);
  });

  test('ends a resting reference line on a whole chip', async ({ page }, testInfo) => {
    // Review of PR #409 (F-035/F-048): a second chip was cut mid-word at the
    // cell edge (`urgent × custo`, `Frontend × Ba`). A chip is drawn whole, or
    // ends in an ellipsis, or is not drawn at rest at all.
    // Proof, watched 2026-10-13 on the code before the wrap and `min-w-0`:
    // failed on `customer-request [plan-table-review/…]× is cut at the edge`.
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedReviewPlan(page, 'whole-chips', testInfo.workerIndex);
    // Two own tags on one row, more than its 120px holds.
    await page.getByLabel('Tags for 020').click();
    await page
      .getByRole('option', { name: /customer-request/ })
      .first()
      .click();
    await page.mouse.click(2, 890);
    await expect(
      page.locator('tr', { hasText: 'Rate limiting' }).locator('[data-reference-chip]'),
    ).toHaveCount(2);

    const cut = await page
      .locator('[data-grid] tbody [data-reference-chips]')
      .evaluateAll((groups) =>
        groups.flatMap((group) => {
          const line = group.getBoundingClientRect();
          return [...group.querySelectorAll('[data-reference-chip]')].flatMap((chip) => {
            const box = chip.getBoundingClientRect();
            const drawn = box.top < line.bottom && box.left < line.right;
            const whole = box.right <= line.right + 0.5;
            const words = chip.querySelector('span');
            const ellipsised =
              words !== null &&
              words.scrollWidth > words.clientWidth &&
              getComputedStyle(words).textOverflow === 'ellipsis' &&
              box.right <= line.right + 0.5;
            return drawn && !whole && !ellipsised ? [`${chip.textContent} is cut at the edge`] : [];
          });
        }),
      );
    expect(cut).toEqual([]);

    // And the line says what it hid (decision D4): two teams in 120px is one
    // drawn and `+1` beside it, named in the count's title; the fade only
    // where something is hidden.
    // Proof, watched 2026-10-14: the count's render removed, this failed on
    // `Expected: "+1" · element(s) not found`; the fade made unconditional, on
    // `a line that hides nothing wears no fade · Received: "linear-gradient(…"`.
    await showEveryColumn(page);
    await page.mouse.move(2, 890);
    const teams = page
      .locator('tr', { hasText: 'Rate limiting' })
      .locator('td[data-column="team"]');
    await expect(teams.locator('[data-reference-hidden-count]')).toHaveText('+1');
    await expect(teams.locator('[data-reference-hidden-count]')).toHaveAttribute(
      'title',
      /^Also: (Backend|Frontend) whole-chips-w\d+$/,
    );
    expect(
      await teams
        .locator('[data-reference-chips]')
        .evaluate((line) => getComputedStyle(line).maskImage),
    ).not.toBe('none');
    const lone = page.locator('tr', { hasText: 'Sign-up form' }).locator('td[data-column="type"]');
    expect(
      await lone
        .locator('[data-reference-chips]')
        .evaluate((line) => getComputedStyle(line).maskImage),
      'a line that hides nothing wears no fade',
    ).toBe('none');
  });

  test('keeps the dependency list inside the window', async ({ page }, testInfo) => {
    // F-022. Proof, watched 2026-10-13 with the cap's write removed: failed
    // on `Expected: <= 1024 · Received: 1234.203125`.
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedReviewPlan(page, 'depends-list', testInfo.workerIndex);

    const box = page.getByLabel('Add a dependency to 010');
    await box.click();
    await box.fill('dependency candidate');
    const list = page.getByRole('listbox', { name: 'Work items 010 can depend on' });
    await expect(list).toBeVisible();
    const geometry = await list.evaluate((element) => ({
      right: element.getBoundingClientRect().right,
      window: window.innerWidth,
      options: [...element.querySelectorAll('[role="option"]')].map((option) => ({
        cut: option.scrollWidth > option.clientWidth,
        ellipsis: getComputedStyle(option).textOverflow,
        title: option.getAttribute('title') ?? '',
      })),
    }));
    expect(geometry.right).toBeLessThanOrEqual(geometry.window);
    expect(geometry.options.some(({ cut }) => cut)).toBe(true);
    for (const option of geometry.options) {
      if (option.cut) expect(option.ellipsis).toBe('ellipsis');
      expect(option.title).not.toBe('');
    }
  });

  test('gives a step card’s actions one size', async ({ page }, testInfo) => {
    // F-044. Proof, watched 2026-10-13 on the code before this change: failed
    // on `not "One number means all three"` — every card a pointer opened
    // ended on the typing tutorial. And with the `[data-step-card] button`
    // rule renamed away in `styles.css`, on `Expected: >= 24 · Received: 21`
    // — the platform buttons' own height.
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedReviewPlan(page, 'step-card', testInfo.workerIndex);

    await page.locator('tr', { hasText: 'Rate limiting' }).locator('[data-final]').first().hover();
    const card = page.getByRole('tooltip').filter({ hasText: 'Dev for 020' });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText('One number means all three');
    const heights = await card
      .locator('button[data-card-action], button:has-text("Add dependency")')
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(1);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBeGreaterThanOrEqual(24);
  });

  test('draws a dependency number whole and counts what the line hid', async ({
    page,
  }, testInfo) => {
    // F-057 and F-058 (decision D4), on the PUNI plan's numbers at the
    // default column width. Proof, watched 2026-10-14 on the code before this
    // change: failed on `010.… is drawn cut` — every chip ellipsised its
    // number. On this change, each fault alone, watched 2026-10-14: the
    // column fixed at 84 again failed on `expect(received).toBeGreaterThan
    // · Received: 0` (the first chip hidden whole, `+3` alone); the count's
    // render removed, on `Expected: "+2" · Received: null`; the fade put on
    // every resting strip with chips, on `a line that hides nothing wears no
    // fade`.
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedDeepPlan(page, 'deep-depends', testInfo.workerIndex);
    await page.mouse.move(2, 890);

    const three = await readDependsStrip(page, 'Website');
    for (const chip of three.chips.filter(({ drawn }) => drawn))
      expect(chip.whole, `${chip.text} is drawn cut`).toBe(true);
    const drawn = three.chips.filter(({ drawn }) => drawn);
    const hidden = three.chips.filter(({ drawn }) => !drawn).map(({ text }) => text);
    expect(drawn.length).toBeGreaterThan(0);
    expect(three.bareTotal, 'a bare total drawn before the chips').toBe(false);
    expect(hidden.length).toBeGreaterThan(0);
    expect(three.count).toBe(`+${String(hidden.length)}`);
    expect(three.countTitle).toBe(`Also: ${hidden.join(', ')}`);
    // After the chips, never before them beside the `+`.
    expect(three.countLeft).toBeGreaterThanOrEqual(Math.max(...drawn.map(({ right }) => right)));
    expect(three.fade).not.toBe('none');
    // The fade on the chips' line, never over the count: the strip's last
    // 14px is where `+N` stands, and faded it fell below 4.5:1. Proof: the
    // fade moved back onto the strip, this failed on `the count stands under
    // the fade`. Watched 2026-10-14.
    expect(three.stripFade, 'the count stands under the fade').toBe('none');

    // One dependency: the chip whole, no count, no fade.
    const one = await readDependsStrip(page, 'Launch');
    expect(one.chips).toEqual([
      expect.objectContaining({ text: '010.3.01', drawn: true, whole: true }),
    ]);
    expect(one.count).toBeNull();
    expect(one.fade, 'a line that hides nothing wears no fade').toBe('none');
  });

  test('says `search` in every empty creatable picker', async ({ page }, testInfo) => {
    // F-063. Proof, watched 2026-10-14 on the code before this change: failed
    // on the Teams box's `search or add` beside the others' `search`.
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedReviewPlan(page, 'search-word', testInfo.workerIndex);
    await showEveryColumn(page);
    const words = await page
      .locator('tr', { hasText: 'Spike: evaluate' })
      .locator(
        ['team', 'tag', 'service', 'type']
          .map((id) => `td[data-column="${id}"] [data-reference-strip] input`)
          .join(', '),
      )
      .evaluateAll((boxes) =>
        boxes.flatMap((box) => (box instanceof HTMLInputElement ? [box.placeholder] : [])),
      );
    expect(words).toEqual(['search', 'search', 'search', 'search']);
  });
});
