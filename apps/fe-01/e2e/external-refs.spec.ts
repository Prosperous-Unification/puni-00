import { expect, type Page, test } from '@playwright/test';

import { createProject } from './create-project';

/**
 * The ref column, measured by a browser.
 *
 * Everything here is a fact jsdom cannot state, and design D2's central claim is
 * the first of them: the marks are absolutely positioned inside a fixed-height
 * box, so a row wired to four systems and a row wired to none are the same
 * height and their cells are the same width. jsdom computes no layout, so every
 * one of the 565 cases in `wbs-table.test.tsx` would stay green with the marks
 * put back into normal flow — which is the fault this file exists to see.
 *
 * The second is the palette: a colour is a string to jsdom, so "every mark is
 * legible on both grounds" is a claim only an engine that rasterises can make.
 */

/** One JSON POST through the page's own session, so the API sees a signed-in reader. */
async function jsonPost<T>(page: Page, path: string, body: unknown): Promise<T> {
  return page.evaluate(
    async ({ at, value }) => {
      const response = await fetch(at, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      });
      if (!response.ok) throw new Error(`POST ${at} failed: ${String(response.status)}`);
      return response.json() as Promise<T>;
    },
    { at: path, value: body },
  );
}

/** One batch on a project, answering the id each command created (by index). */
async function commands(
  page: Page,
  projectId: string,
  list: Record<string, unknown>[],
): Promise<(string | undefined)[]> {
  const answer = await jsonPost<{ results: { id?: string }[] }>(
    page,
    `/api/projects/${projectId}/commands`,
    { commands: list },
  );
  return answer.results.map((each) => each.id);
}

interface Seed {
  projectId: string;
  /** The vocabulary as be-01 seeded it, by canonical name. */
  systemOf: Record<string, string>;
}

/**
 * Two rows: `010` wired to four systems and a `javascript:` URL, `020` wired to
 * nothing at all.
 *
 * The refs are written **through the API** rather than typed into the editor,
 * and for `reference-cells.spec.ts`' reason plus one of this file's own: the
 * `javascript:` URL is the fault the scheme guard exists for, and it arrives
 * the way it really would — from a peer, or a script, through a be-01 that
 * deliberately does not refuse a scheme at the write (a reader may override a
 * derived type, so a mismatch has to stay storable).
 */
async function seed(page: Page): Promise<Seed> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page);

  await expect.poll(() => page.evaluate(() => localStorage.getItem('wbs.project'))).not.toBeNull();
  const projectId = await page.evaluate(() => localStorage.getItem('wbs.project'));
  if (projectId === null) throw new Error('no project id after creating the plan');

  const vocabulary = await page.evaluate(async () => {
    const response = await fetch('/api/external-systems');
    return response.json() as Promise<{ externalSystems: { id: string; name: string }[] }>;
  });
  const systemOf = Object.fromEntries(
    vocabulary.externalSystems.map((system) => [system.name, system.id]),
  );
  // The vocabulary is seeded, not empty: these five are what `systemOfUrl`
  // answers, and a run against a be-01 that had seeded none would measure marks
  // that all drew as `other` while claiming to measure four systems.
  const seeded = new Set(vocabulary.externalSystems.map((system) => system.name));
  for (const name of ['jira-issue', 'github-pr', 'confluence-page', 'slack-message']) {
    if (!seeded.has(name)) throw new Error(`be-01 seeded no ${name}`);
  }

  // Placed by `ref`/`afterRef` rather than by two `afterId: null`s. Both of
  // those insert at the **front**, so the second row created is the one
  // numbered `010` — and every assertion below would then be about the row it
  // names and the refs of the other one. Found in Chromium, not reasoned about:
  // the card never opened, because `010` was the row with no links.
  const [first] = await commands(page, projectId, [
    {
      kind: 'createWorkItem',
      ref: 'wired',
      parentId: null,
      afterId: null,
      name: 'Wired to four systems',
    },
    { kind: 'createWorkItem', parentId: null, afterRef: 'wired', name: 'Wired to nothing' },
  ]);
  if (first === undefined) throw new Error('the first row was not created');

  await commands(page, projectId, [
    {
      kind: 'patchWorkItem',
      workItemId: first,
      patch: {
        externalRefs: [
          { systemId: systemOf['jira-issue'], url: 'https://acme.atlassian.net/browse/AB-1' },
          { systemId: systemOf['confluence-page'], url: 'https://acme.atlassian.net/wiki/spec' },
          { systemId: systemOf['github-pr'], url: 'https://github.com/acme/tool/pull/7' },
          { systemId: systemOf['slack-message'], url: 'https://acme.slack.com/archives/C1/p1' },
          // The fault the scheme guard exists for, stored the way it really
          // arrives. It rides on an existing system so that it is a *link* the
          // renderer has to refuse, not a ref the store refused first.
          { systemId: systemOf['jira-issue'], url: 'javascript:alert(1)' },
        ],
      },
    },
  ]);
  await page.reload();
  await expect(page.getByLabel('Links for 010')).toBeVisible();
  return { projectId, systemOf };
}

/** Opens the account menu, takes the palette asked for, and lets the paint land. */
async function chooseTheme(page: Page, answer: 'Light' | 'Dark'): Promise<void> {
  await page.locator('header button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitemradio', { name: answer }).click();
  await page.keyboard.press('Escape');
  // Every surface carries `transition-colors`, so a read taken inside the flip
  // answers with an interpolated colour neither palette names — `dark-mode.spec.ts`
  // measured 1.03:1 for a link whose resting ratio is 15.9:1.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getAnimations().filter((each) => each.playState === 'running').length,
      ),
    )
    .toBe(0);
}

/**
 * What each mark is painted, and what it stands on, as WCAG counts the two.
 *
 * The mark's **paint** rather than its text colour: a filled mark is its
 * `background-color` and a ring is its `border-top-color`, which is the whole
 * fill/hue split of design D3 read back off the page. Rasterised through a
 * canvas rather than parsed, for `dark-mode.spec.ts`' reason — `oklch(…)` and
 * `oklab(…)` cannot be turned into a luminance by reading the string, and a
 * colour this engine refuses leaves `fillStyle` where it was, so the sentinel
 * is what makes that loud instead of silently measuring the last colour again.
 */
function markContrasts(page: Page): Promise<{ kind: string; ratio: number; area: number }[]> {
  return page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx === null) throw new Error('no 2d context to rasterise a colour in');
    const rgbaOf = (colour: string): [number, number, number, number] => {
      const sentinel = '#ff00ff';
      ctx.fillStyle = sentinel;
      ctx.fillStyle = colour;
      if (ctx.fillStyle === sentinel) throw new Error(`this engine will not parse ${colour}`);
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const painted = ctx.getImageData(0, 0, 1, 1).data;
      return [painted[0], painted[1], painted[2], painted[3] / 255];
    };
    const over = (
      top: [number, number, number, number],
      under: [number, number, number],
    ): [number, number, number] => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
    ];
    const luminance = (colour: [number, number, number]): number => {
      const channel = (raw: number): number => {
        const unit = raw / 255;
        return unit <= 0.03928 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4);
      };
      return (
        0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2])
      );
    };
    const surfaceUnder = (node: Element): [number, number, number] => {
      const stacked: [number, number, number, number][] = [];
      let ancestor: Element | null = node.parentElement;
      while (ancestor !== null) {
        const painted = rgbaOf(getComputedStyle(ancestor).backgroundColor);
        if (painted[3] > 0) stacked.push(painted);
        if (painted[3] === 1) break;
        ancestor = ancestor.parentElement;
      }
      let surface: [number, number, number] = [255, 255, 255];
      for (const layer of stacked.reverse()) surface = over(layer, surface);
      return surface;
    };
    return [...document.querySelectorAll<HTMLElement>('[data-ref-mark]')].map((mark) => {
      const style = getComputedStyle(mark);
      const filled = rgbaOf(style.backgroundColor)[3] > 0;
      const paint = rgbaOf(filled ? style.backgroundColor : style.borderTopColor);
      const surface = surfaceUnder(mark);
      const ink = over(paint, surface);
      const [brighter, dimmer] = [luminance(ink), luminance(surface)].sort((a, b) => b - a);
      const box = mark.getBoundingClientRect();
      return {
        kind: mark.dataset['refMark'] ?? '',
        ratio: (brighter + 0.05) / (dimmer + 0.05),
        area: box.width * box.height,
      };
    });
  });
}

/** What WCAG asks of a graphical object, which is what a 6px dot is. */
const READABLE_MARK = 3;

test.describe('the ref column, in a browser', () => {
  test('four marks stand inside the cell, and move neither the row nor the column', async ({
    page,
  }) => {
    // Design D2's claim: the marks are placed out of flow in a fixed-height box,
    // so neither their number nor their absence moves anything.
    //
    // **The row-height half of that claim cannot fail, and saying so is the
    // point of this comment.** The ref cell's box is 12px inside a row the Name
    // cell already stands 26.19px tall — measured, 2026-08-31 — so the row is
    // never this cell's to move, and the equality below is a true statement
    // this design could not break. It is kept because the spec asks for it, and
    // it is not what the injected fault is watched against.
    //
    // What the fault really does is collapse the marks: a `<span>` in normal
    // flow is inline, width and height do not apply to it, and four 6px discs
    // become four zero-width text boxes standing outside the 12px box they were
    // meant to sit in.
    //
    // Proof: `markStyle`'s `position: 'absolute'` changed to `'static'` and the
    // rows measured — the height assertion **passed** (26.1875 either way, the
    // marks reported as `[164,150,0,15]`), and this failed on `jira is not a
    // 6×6 disc · Expected {"height": 6, "width": 6} · Received {"height": 15,
    // "width": 0}`. Watched, 2026-08-31.
    await seed(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    const measured = await page.evaluate(() => {
      const cellOf = (number: string): HTMLElement => {
        const cell = document.querySelector<HTMLElement>(`[aria-label="Links for ${number}"]`);
        if (cell === null) throw new Error(`no links cell on ${number}`);
        return cell;
      };
      const rowOf = (number: string): DOMRect => {
        const row = cellOf(number).closest('tr');
        if (!(row instanceof HTMLElement)) throw new Error(`no row for ${number}`);
        return row.getBoundingClientRect();
      };
      const tdOf = (number: string): DOMRect => {
        const td = cellOf(number).closest('td');
        if (!(td instanceof HTMLElement)) throw new Error(`no cell for ${number}`);
        return td.getBoundingClientRect();
      };
      const box = cellOf('010').getBoundingClientRect();
      return {
        wiredRow: rowOf('010').height,
        bareRow: rowOf('020').height,
        wiredCell: tdOf('010').width,
        bareCell: tdOf('020').width,
        box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
        marks: [...cellOf('010').querySelectorAll<HTMLElement>('[data-ref-mark]')].map((mark) => {
          const rect = mark.getBoundingClientRect();
          return {
            kind: mark.dataset['refMark'] ?? '',
            width: rect.width,
            height: rect.height,
            top: rect.top,
            bottom: rect.bottom,
            right: rect.right,
          };
        }),
      };
    });

    // Or this is a check about a cell that drew nothing: four systems and a
    // fifth ref into one of them, so four marks and no overflow.
    expect(measured.marks.map((mark) => mark.kind)).toEqual([
      'jira',
      'confluence',
      'github',
      'slack',
    ]);
    for (const mark of measured.marks) {
      // Every mark is the disc the design draws, at the size the column was
      // costed for. This is the assertion the normal-flow fault is watched
      // against.
      expect({ width: mark.width, height: mark.height }, `${mark.kind} is not a 6×6 disc`).toEqual({
        width: 6,
        height: 6,
      });
      // And it sits inside the fixed box, rather than escaping it downward the
      // way an inline one does.
      expect(mark.top, `${mark.kind} sits above its box`).toBeGreaterThanOrEqual(measured.box.top);
      expect(mark.bottom, `${mark.kind} hangs below its box`).toBeLessThanOrEqual(
        measured.box.bottom,
      );
      expect(mark.right, `${mark.kind} runs past the cell`).toBeLessThanOrEqual(measured.box.right);
    }
    // The spec's own two equalities. Both hold, and neither is load-bearing —
    // see the note at the top of this test.
    expect(measured.wiredRow, 'the two rows are not the same height').toBe(measured.bareRow);
    expect(measured.wiredCell, 'the two cells are not the same width').toBe(measured.bareCell);
    // And the column really is the 40px the width table declares, or "the same
    // width" is two cells agreeing about a number nobody chose.
    expect(measured.wiredCell).toBe(40);
  });

  test('the same at 390×844, where the plan is cards rather than a table', async ({ page }) => {
    await seed(page);
    await page.setViewportSize({ width: 390, height: 844 });
    // The phone renders the plan as cards, which have no ref column at all —
    // stated as an assertion rather than assumed, because a silently absent cell
    // is how a measurement of nothing passes. The claim this test can make at
    // this width is the table's, so the viewport is taken back to a width that
    // has one and the marks are measured there.
    // The card list has to be **on screen** before anything is counted.
    // `setViewportSize` does not flush React's re-render, and the first version
    // of this read the DOM straight after it — counting the table that had not
    // been unmounted yet. It flaked in the whole-gate run of 2026-08-31 on
    // `Expected: 0 · Received: 1` and passed twice on its own afterwards, which
    // is the signature: an assertion made before the render it is about, not a
    // ref column on a phone. `Plan actions` is the control the table's `Add
    // work item` becomes, so it is on screen exactly when the cards are.
    //
    // Proof: `CARDS_BELOW` in `plan-renderer.ts` dropped from 768 to 0, so the
    // **table** renders at 390 — this line failed on `expect(locator)
    // .toBeVisible() failed · Locator: getByRole('button', { name: 'Plan
    // actions' }) · element(s) not found`. Watched in Chromium, 2026-08-31.
    await expect(page.getByRole('button', { name: 'Plan actions' })).toBeVisible();
    // The count the test is named for, and it is **not** what the injection
    // above is watched by: with the table rendered at 390 the line before this
    // one stops the test first. Said plainly rather than left to look proven —
    // the fault this one is for is the other one, a card that grows a `Links
    // for …` control of its own (`mobile-card-facts` decides what a card
    // carries, and today it carries no refs). A retrying count rather than a
    // one-shot `evaluate`, for the render-timing reason above.
    await expect(page.getByLabel('Links for 010')).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByLabel('Links for 010')).toBeVisible();
    const heights = await page.evaluate(() => {
      const rowOf = (number: string): number => {
        const row = document
          .querySelector<HTMLElement>(`[aria-label="Links for ${number}"]`)
          ?.closest('tr');
        if (!(row instanceof HTMLElement)) throw new Error(`no row for ${number}`);
        return row.getBoundingClientRect().height;
      };
      return { wired: rowOf('010'), bare: rowOf('020') };
    });
    expect(heights.wired).toBe(heights.bare);
  });

  for (const palette of ['Light', 'Dark'] as const) {
    test(`every mark is legible in the ${palette.toLowerCase()} palette`, async ({ page }) => {
      // Design D3's own claim, and the reason the neutrals are tokens rather
      // than colours: `currentColor` is near-black on a light page and
      // near-white on a dark one, so the GitHub mark is the one that would
      // disappear if it were written as a hex.
      //
      // Proof: `FAMILY_PAINT.github` set to a literal `oklch(0.2 0 0)` — the
      // near-black a hex would have pinned — and the dark half of this failed
      // on `github is not legible on this ground · Expected: >= 3 · Received:
      // 1.1138806212915524`, with the light half still green. Watched,
      // 2026-08-31.
      await seed(page);
      await page.setViewportSize({ width: 1280, height: 800 });
      await chooseTheme(page, palette);

      const marks = await markContrasts(page);
      expect(marks.map((mark) => mark.kind)).toEqual(['jira', 'confluence', 'github', 'slack']);
      for (const mark of marks) {
        // A mark with no area is a mark nobody can see, and a ratio about it is
        // a ratio about nothing — `G gantt-view`'s zero-width bar, one column
        // over.
        expect(mark.area, `${mark.kind} is painted nothing at all`).toBeGreaterThan(0);
        expect(mark.ratio, `${mark.kind} is not legible on this ground`).toBeGreaterThanOrEqual(
          READABLE_MARK,
        );
      }
    });
  }

  test('a stored javascript: URL never becomes an href, on either surface', async ({ page }) => {
    // The scheme guard, in the engine that would actually run the URL. The ref
    // is stored through the API above, so nothing on the way in refused it and
    // the renderer is the only thing standing between it and a navigation.
    //
    // Proof: `followableHref` made to return its argument unconditionally, this
    // failed on `expect(locator).toHaveCount(expected) failed · Expected: 4 ·
    // Received: 5` at the card — one `a[data-refs-card-url]` more than the four
    // http refs. Watched, 2026-08-31.
    await seed(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.getByLabel('Links for 010').hover();
    const card = page.getByRole('tooltip', { name: 'Where 010 also exists' });
    await expect(card).toBeVisible();
    // Five refs, four of them followable: the anchors are the http ones, and
    // the fifth is on the page as text.
    await expect(card.locator('a[data-refs-card-url]')).toHaveCount(4);
    await expect(card.locator('span[data-refs-card-url]')).toHaveText(['javascript:alert(1)']);
    for (const href of await card
      .locator('a[data-refs-card-url]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))) {
      expect(href).toMatch(/^https?:/);
    }
    // No anchor anywhere on the page carries it — the assertion the card's own
    // count cannot make, because a guard that wrote the href onto a *different*
    // element would still leave the card holding four.
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);

    // And the editor, which is the other surface the rule is about.
    await page.getByLabel('Links for 010').click();
    const editor = page.getByRole('dialog', { name: 'Links for 010' });
    await expect(editor).toBeVisible();
    await expect(editor.locator('a[data-refs-editor-url]')).toHaveCount(4);
    await expect(editor.locator('span[data-refs-editor-url]')).toHaveText(['javascript:alert(1)']);
  });
});
