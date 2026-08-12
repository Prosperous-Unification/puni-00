// TEMPORARY probe. Not a gate: it asserts nothing and prints measurements.
// Deleted before the branch is pushed.
import { expect, type Page, test } from '@playwright/test';

async function seed(page: Page, account: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Register' }).click();
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill('dark-probe-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  const addRow = page.getByRole('button', { name: 'Add work item' });
  for (const number of ['010', '020']) {
    await addRow.click();
    await expect(page.getByLabel(`Name of ${number}`)).toBeVisible();
  }
  const first = page.getByLabel('Name of 010');
  await first.fill('Survey the racking');
  await first.blur();
  const second = page.getByLabel('Name of 020');
  await second.fill('Draft the layout');
  await second.blur();
  for (const number of ['010', '020']) {
    const estimate = page.getByLabel(`Dev estimate for ${number}`);
    await estimate.fill('2/4/6');
    await estimate.blur();
    await expect(estimate).not.toHaveValue('');
  }
  await page.getByRole('button', { name: 'Gantt' }).click();
  await expect(page.locator('[data-gantt-panel]')).toBeVisible();
}

/**
 * Every element on the page whose own text does not stand off the surface it is
 * painted on, plus every element painted a colour the palette never names.
 */
async function offences(page: Page, what: string): Promise<void> {
  const found = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    const rgbOf = (colour: string): [number, number, number, number] => {
      ctx.fillStyle = '#ff00ff';
      ctx.fillStyle = colour;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
    };
    const over = (
      top: [number, number, number, number],
      under: [number, number, number],
    ): [number, number, number] => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
    ];
    const lum = (c: [number, number, number]): number => {
      const chan = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]);
    };
    const contrast = (a: [number, number, number], b: [number, number, number]): number => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
    };
    /** What is actually behind this element, compositing every translucent ancestor. */
    const surfaceUnder = (node: Element): [number, number, number] => {
      const stack: [number, number, number, number][] = [];
      let at: Element | null = node;
      while (at !== null) {
        const painted = rgbOf(getComputedStyle(at).backgroundColor);
        if (painted[3] > 0) stack.push(painted);
        if (painted[3] === 1) break;
        at = at.parentElement;
      }
      let base: [number, number, number] = [255, 255, 255];
      for (const layer of stack.reverse()) base = over(layer, base);
      return base;
    };
    const where = (node: Element): string => {
      const bits: string[] = [node.tagName.toLowerCase()];
      const cls = node.getAttribute('class');
      if (cls !== null && cls !== '') bits.push(`.${cls.split(/\s+/).slice(0, 4).join('.')}`);
      for (const attr of node.getAttributeNames()) {
        if (attr.startsWith('data-') || attr === 'role') bits.push(`[${attr}]`);
      }
      return bits.join('');
    };

    const out: string[] = [];
    const uaFace = new Set(['rgb(239, 239, 239)', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
    for (const node of document.querySelectorAll('*')) {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (style.visibility === 'hidden' || style.display === 'none') continue;

      const own = style.backgroundColor;
      if (uaFace.has(own) && own !== 'rgba(0, 0, 0, 0)') {
        out.push(`PAINT  ${where(node)} — background ${own}, a colour no token names`);
      }

      // Text of this element alone, not of its children.
      const writes = [...node.childNodes].some(
        (child) => child.nodeType === 3 && (child.textContent ?? '').trim() !== '',
      );
      if (!writes) continue;
      const ink = rgbOf(style.color);
      const behind = surfaceUnder(node);
      const ratio = contrast(over(ink, behind), behind);
      if (ratio < 4.5) {
        out.push(
          `INK    ${where(node)} — ${style.color} on ${style.backgroundColor === 'rgba(0, 0, 0, 0)' ? `(inherited ${behind.map(Math.round).join(',')})` : style.backgroundColor} = ${ratio.toFixed(2)}:1  «${(node.textContent ?? '').trim().slice(0, 30)}»`,
        );
      }
    }
    return [...new Set(out)];
  });
  console.log(`\n===== ${what}: ${String(found.length)} =====`);
  for (const line of found) console.log(`  ${line}`);
}

async function darken(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
  });
  await page.waitForTimeout(400);
}

test('probe: what the dark palette paints', async ({ page }) => {
  await seed(page, `dark-probe-${String(Date.now())}`);
  await darken(page);
  await offences(page, 'plan at rest, dark');

  await page.locator('header button[aria-haspopup="menu"]').click();
  await offences(page, 'account menu open, dark');
  await page.keyboard.press('Escape');

  await page.getByLabel('Add a dependency to 020').click();
  await page.waitForTimeout(200);
  await offences(page, 'dependency picker open, dark');
  await page.keyboard.press('Escape');

  const team = page.getByLabel('Service/team of 010');
  if ((await team.count()) > 0) {
    await team.click();
    await page.waitForTimeout(200);
    await offences(page, 'team picker open, dark');
    await page.keyboard.press('Escape');
  }

  await page.getByRole('button', { name: 'Shortcuts' }).click().catch(() => {});
  await page.waitForTimeout(200);
  await offences(page, 'shortcuts modal open, dark');
  await page.keyboard.press('Escape');

  // A toast, raised by a refused rename.
  await page.getByLabel('Name of 010').hover();
  await offences(page, 'row hovered, dark');

  // Mobile cards.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await offences(page, 'mobile cards, dark');
});
