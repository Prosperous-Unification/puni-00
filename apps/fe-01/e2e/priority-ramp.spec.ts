import { expect, type Locator, type Page, test } from '@playwright/test';

import { createProject } from './create-project';

/**
 * The diverging priority ramp, measured by a browser in both palettes.
 *
 * `priority-band-style.test.ts` measures the **table**: five literals in one
 * array, parsed back into three numbers each. That is the right oracle for the
 * chroma margin and the wrong one for everything else, because jsdom computes no
 * colours at all — it cannot say that Chromium parses `oklch(0.59 0.06 240)`,
 * that the Prio cell's inline `color` survives the cascade, or that the ink
 * stands off the surface behind it in the palette the reader is in. Those are
 * facts about a rendering engine, and R5 #14/#15/#17 are three separate days
 * this repo shipped a jsdom green over a browser fault.
 *
 * Everything below is read through a canvas rather than off the string
 * `getComputedStyle` answers with, for `dark-mode.spec.ts`' reason: a colour
 * this engine will not parse leaves `fillStyle` where it was, so the sentinel is
 * what makes an unparsed colour loud instead of silently measuring the last one
 * again. It also makes the assertions independent of how Chromium chooses to
 * serialise a modern colour function.
 *
 * `openspec/changes/priority-default-medium/` — design.md D3, tasks 4.1.
 */

/** The rungs under test, as the default ladder's own default values. */
const ORDINARY = 50;
const LOW = 70;
const LOWEST = 90;

/** The row numbers the three rungs are typed onto, in order. */
const ROWS = ['010', '020', '030'] as const;

/**
 * The smallest chroma gap that still reads as two steps of one hue.
 *
 * The same number `priority-band-style.test.ts` holds, and stated rather than
 * measured off the table for the same reason: a margin read from the very values
 * under test is satisfied by any two numbers at all. The table's own gap is
 * 0.06, so an 8-bit round trip through a canvas has room to lose a thousandth
 * without this becoming flaky.
 */
const LEAST_CHROMA_STEP = 0.05;

/** Above this, a colour carries a hue somebody can name. The middle rung stays under it. */
const NEUTRAL_CHROMA = 0.03;

/**
 * What the Prio chip is held to, and why it is 3 rather than 4.5.
 *
 * The cell renders its band at `font-weight: 600` (`priority-cell.tsx`), which is
 * WCAG's large-text case, and 3:1 is what that asks. A number chosen because it
 * is the standard for what is actually on screen, not because it is the number
 * these inks happen to clear.
 */
const READABLE = 3;

/** Opens the fixed local identity and makes a plan of three named rows. */
async function seedPlan(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();

  // Through the shared fixture and not the `+` directly: a create arms a
  // rename on the bar and that arming lands one round trip *after* the table
  // appears, so a fixture that clicks on into the plan can have the keyboard
  // pulled back to the header mid-flight. `create-project.ts` says the whole
  // of it. This file was written the day before that fixture existed and was
  // the one create site `d2024a3` did not reach.
  await createProject(page);
  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (const number of ROWS) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }
  for (const [at, number] of ROWS.entries()) {
    const name = page.getByLabel(`Name of ${number}`);
    await name.fill(`Rung ${String(at)}`);
    await name.blur();
  }
}

/**
 * Types one priority into a row's Prio cell and waits for the **band** to land.
 *
 * The value and the paint are two different events, and waiting for the first
 * is how this spec produced a red that meant nothing. `toHaveValue` reads the
 * box's own draft, which Enter leaves in place immediately; the colour comes
 * from `priorityBandStyleOf` on the priority the **server** answered with, one
 * round trip later. Between the two the cell is an unprioritised cell — no
 * `color`, no weight, the table's own ink — and three cells measured in that
 * window are three copies of one colour.
 *
 * That is not hypothetical. On 2026-08-30, at a load average of 555 with three
 * browser gates sharing the machine, both palettes failed on
 * `expected 0 to be greater than or equal to 0.05` — the **exact** red this
 * spec's injected fault produces, with the colour table perfectly correct. The
 * assertion could not tell "these two ranks are the same colour" from "neither
 * rank has a colour yet", so its red was ambiguous and its green was luck.
 *
 * The signal is the cell's **`title`**, and picking it took two goes.
 * `font-weight` was the first answer — `priority-cell.tsx` sets 600 from
 * `paint !== null` alone — and it is a check that cannot fail *because of this
 * very change*: a created work item now carries the ladder's rank 2 default, so
 * every row is painted a band from birth and 600 is already there before
 * anything is typed. Watched: with the write held 3s and this wait in place,
 * both palettes still failed, in 1.6s, having waited for nothing.
 *
 * `title` is built from `paint.words`, which is `${label} — priority ${n}` off
 * the **stored** number, so it says which priority landed rather than that some
 * priority did. It is not a colour, so waiting on it is not waiting for the
 * answer the assertions below measure.
 */
async function setPriority(page: Page, number: string, priority: number): Promise<void> {
  const cell = page.getByLabel(`Priority for ${number}`);
  await cell.fill(String(priority));
  await cell.press('Enter');
  await expect(cell).toHaveValue(String(priority));
  // Proof: this line deleted, the spec run with `POST …/commands` held 3s by a
  // `page.route` handler, failed on `expected 0 to be greater than or equal to
  // 0.05` in both palettes — the load-average-555 red of 2026-08-30 reproduced
  // on an idle machine, with the colour table untouched. With the line in place
  // the same delayed run passes.
  await expect(
    cell,
    `the ${String(priority)} chip on ${number} never took its band's paint`,
  ).toHaveAttribute('title', new RegExp(`priority ${String(priority)}\\.`));
}

/** The one button in the header that opens the account menu — `dark-mode.spec.ts`' locator. */
const accountTrigger = (page: Page): Locator => page.locator('header button[aria-haspopup="menu"]');

/**
 * Waits for the palette flip's colour transitions to finish interpolating.
 *
 * `dark-mode.spec.ts`' `settled`, and the reason is quoted there in full: a
 * `getComputedStyle` read taken inside the ~150ms transition answers with an
 * interpolated colour neither palette names, and a finished `CSSTransition` is
 * never dropped from `getAnimations()` for a subtree Chromium has stopped
 * recalculating — so the two states that do not count are named rather than the
 * two that do.
 */
async function settled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.playState !== 'finished' && a.playState !== 'idle').length,
      ),
    )
    .toBe(0);
}

/** Opens the account menu, takes the palette asked for, and lets the paint land. */
async function chooseTheme(page: Page, answer: 'Light' | 'Dark'): Promise<void> {
  await accountTrigger(page).click();
  await page.getByRole('menuitemradio', { name: answer }).click();
  await page.keyboard.press('Escape');
  await settled(page);
}

/** One measured ink: its three OKLCh components, and what it stands off the page. */
interface MeasuredInk {
  lightness: number;
  chroma: number;
  hue: number;
  contrast: number;
}

/**
 * The colour a cell's text is actually painted, in OKLCh, and its contrast.
 *
 * Rasterised through a 2D canvas and converted back rather than read as text:
 * Chromium is free to serialise `color` as `oklch(…)`, `color(srgb …)` or `rgb(…)`
 * depending on the value and the version, and an assertion about a **margin**
 * cannot be made against any of those strings. Going through the canvas measures
 * what was painted, which is the thing under test, and the magenta sentinel turns
 * "this engine will not parse that" into a failure instead of a stale read.
 *
 * The surface is composited up the ancestors exactly as `dark-mode.spec.ts` does
 * it: almost nothing in this app paints its own background, so a ratio against
 * one node's `rgba(0, 0, 0, 0)` would be a number about nothing.
 *
 * The sRGB → OKLab matrices are Ottosson's, which is what CSS Color 4 defines
 * `oklch()` against — so a value that survives the round trip comes back as the
 * numbers written in `priority-band-style.ts`, give or take 8-bit quantisation.
 */
function measureInk(locator: Locator): Promise<MeasuredInk> {
  return locator.evaluate((node) => {
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
    const linear = (raw: number): number => {
      const unit = raw / 255;
      return unit <= 0.04045 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4);
    };
    const luminance = (colour: [number, number, number]): number =>
      0.2126 * linear(colour[0]) + 0.7152 * linear(colour[1]) + 0.0722 * linear(colour[2]);
    const oklchOf = (
      colour: [number, number, number],
    ): { lightness: number; chroma: number; hue: number } => {
      const [r, g, b] = [linear(colour[0]), linear(colour[1]), linear(colour[2])];
      const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      const lightness = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
      const green = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
      const blue = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
      const hue = ((Math.atan2(blue, green) * 180) / Math.PI + 360) % 360;
      return { lightness, chroma: Math.hypot(green, blue), hue };
    };

    const stacked: [number, number, number, number][] = [];
    let ancestor: Element | null = node;
    while (ancestor !== null) {
      const painted = rgbaOf(getComputedStyle(ancestor).backgroundColor);
      if (painted[3] > 0) stacked.push(painted);
      if (painted[3] === 1) break;
      ancestor = ancestor.parentElement;
    }
    // White, because that is what a browser paints a document nothing painted.
    let surface: [number, number, number] = [255, 255, 255];
    for (const layer of stacked.reverse()) surface = over(layer, surface);

    const ink = over(rgbaOf(getComputedStyle(node).color), surface);
    const [brighter, dimmer] = [luminance(ink), luminance(surface)].sort((a, b) => b - a);
    return { ...oklchOf(ink), contrast: (brighter + 0.05) / (dimmer + 0.05) };
  });
}

test.describe('the priority ramp, in a browser', () => {
  for (const palette of ['Light', 'Dark'] as const) {
    test(`diverges around the middle rung in the ${palette.toLowerCase()} palette`, async ({
      page,
    }) => {
      await seedPlan(page);
      await chooseTheme(page, palette);
      await setPriority(page, ROWS[0], ORDINARY);
      await setPriority(page, ROWS[1], LOW);
      await setPriority(page, ROWS[2], LOWEST);
      await settled(page);

      const ordinary = await measureInk(page.getByLabel(`Priority for ${ROWS[0]}`));
      const low = await measureInk(page.getByLabel(`Priority for ${ROWS[1]}`));
      const lowest = await measureInk(page.getByLabel(`Priority for ${ROWS[2]}`));

      // The middle rung is the commonest value on any screen now that a create
      // stamps it, and it must not carry a hue anybody can name.
      expect(ordinary.chroma).toBeLessThan(NEUTRAL_CHROMA);

      // **Each cool rung carries a hue of its own, said before the two are
      // compared.** A margin is a difference, and a difference of zero has two
      // causes: the ramp collapsed, or nothing was painted at all. The second
      // is what a contended machine produces, and the line below cannot tell
      // the two apart — so the ambiguity is removed here rather than left in
      // the message. `setPriority` now waits for the paint, which is the fix;
      // this is the assertion that says so out loud if that wait ever stops
      // working. Both cool inks carry more chroma than the neutral rung by
      // construction (0.06 and 0.12 against 0.02), so the floor they are held
      // to is the one the middle rung is held under.
      expect(low.chroma, 'the Low rung was never painted its band').toBeGreaterThan(NEUTRAL_CHROMA);
      expect(lowest.chroma, 'the Lowest rung was never painted its band').toBeGreaterThan(
        NEUTRAL_CHROMA,
      );

      // Proof: ranks 3 and 4 in `BAND_INKS` set to one value, watched failing on
      // this line in both palettes. A `toBeDefined`-shaped assertion on either
      // ink could not see it, and neither could an equality against a serialised
      // string — the two cells would simply hold the same legal colour.
      expect(lowest.chroma - low.chroma).toBeGreaterThanOrEqual(LEAST_CHROMA_STEP);
      // One cool hue, and the same one. A generous window because an 8-bit
      // round trip moves a low-chroma hue further than a high-chroma one.
      expect(Math.abs(low.hue - lowest.hue)).toBeLessThan(8);
      // One lightness band: they are two steps of chroma, not a ramp that also
      // gets darker and says "less important" twice.
      expect(Math.abs(low.lightness - lowest.lightness)).toBeLessThan(0.03);

      // And all three are legible against the surface they are actually on,
      // which is the whole reason this is measured here and not in jsdom.
      for (const measured of [ordinary, low, lowest]) {
        expect(measured.contrast).toBeGreaterThanOrEqual(READABLE);
      }
    });
  }
});
