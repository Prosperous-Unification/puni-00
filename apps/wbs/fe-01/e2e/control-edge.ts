import type { Locator, Page } from '@playwright/test';

/** What a control's left edge paints against the two grounds either side of it. */
export interface PaintedEdge {
  /** The WCAG ratio of the edge pixel to the ground 3 px outside the control. */
  outside: number;
  /** The WCAG ratio of the same pixel to the control's own fill 3 px inside. */
  inside: number;
}

/**
 * Reads the painted pixels across a control's left edge at its vertical middle
 * and returns the strongest edge pixel's contrast with the ground on either
 * side (WCAG 1.4.11 asks 3:1 of a boundary that is a control's only cue).
 *
 * A screenshot strip decoded through a canvas, `plan-table-review.spec.ts`'
 * method: a computed `border-color` is not proof of paint — the sign-in page's
 * SSO link carried `border-color: var(--input)` at `border-width: 0` (UI review
 * F-124), so only the pixels can say a border was drawn.
 *
 * @throws When the control has no box (it is not on screen).
 */
export async function paintedLeftEdge(page: Page, control: Locator): Promise<PaintedEdge> {
  const box = await control.boundingBox();
  if (box === null) throw new Error('the control has no box to measure');
  const left = Math.round(box.x);
  const clip = { x: left - 3, y: Math.round(box.y + box.height / 2), width: 7, height: 1 };
  const shot = await page.screenshot({ clip, scale: 'css' });
  return page.evaluate(async (png) => {
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
    const luminance = (x: number): number =>
      0.2126 * channel(data[x * 4]) +
      0.7152 * channel(data[x * 4 + 1]) +
      0.0722 * channel(data[x * 4 + 2]);
    const ratio = (one: number, two: number): number =>
      (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
    const outside = luminance(0);
    const inside = luminance(width - 1);
    let edge = 1;
    for (let x = 2; x < width - 1; x += 1)
      if (ratio(luminance(x), outside) > ratio(luminance(edge), outside)) edge = x;
    return { outside: ratio(luminance(edge), outside), inside: ratio(luminance(edge), inside) };
  }, shot.toString('base64'));
}
