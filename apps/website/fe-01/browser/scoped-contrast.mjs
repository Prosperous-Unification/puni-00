import { Buffer } from 'node:buffer';

const hiddenText = `.proposal-card, .proposal-card * {
  color: transparent !important; -webkit-text-fill-color: transparent !important;
  text-shadow: none !important; text-decoration-color: transparent !important;
  caret-color: transparent !important;
}`;

/**
 * Reads visible own text and entered values, then samples their actual painted surfaces with
 * glyphs hidden without moving layout. Glass pseudo-elements, gradients and backdrop filters
 * remain painted. This samples a deterministic media-failure gradient, not every video frame.
 * Every measured text rectangle contributes three samples; this is not a whole-glyph WCAG audit.
 */
export async function auditScopedEditor(page, isDark) {
  const editor = page.locator('.proposal-card');
  const texts = await editor.evaluate((root) => {
    const records = [];
    for (const [index, element] of [root, ...root.querySelectorAll('*')].entries()) {
      if (!element.checkVisibility() || element.closest('.visually-hidden')) continue;
      const style = globalThis.getComputedStyle(element);
      const field = element.matches('input, textarea');
      const own = field
        ? element.value
        : [...element.childNodes]
            .filter((node) => node.nodeType === 3)
            .map((node) => node.textContent)
            .join('')
            .trim();
      if (!own) continue;
      const range = globalThis.document.createRange();
      range.selectNodeContents(element);
      const box = field ? element.getBoundingClientRect() : range.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) continue;
      const color = style.color.match(/[\d.]+/g).map(Number);
      let opacity = 1;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement)
        opacity *= Number(globalThis.getComputedStyle(ancestor).opacity);
      records.push({
        index,
        name: `${element.tagName.toLowerCase()} ${own.slice(0, 48)}`,
        color: [color[0], color[1], color[2], (color[3] ?? 1) * opacity],
        x: box.x + globalThis.scrollX,
        y: box.y + globalThis.scrollY,
        width: box.width,
        height: box.height,
      });
    }
    if (records.length === 0) throw new Error('Scoped contrast audit found no visible text');
    return records;
  });
  const sample = async (rectangles) => {
    const screenshot = await page.screenshot({ fullPage: true, style: hiddenText });
    return page.evaluate(
      async ({ encoded, rectangles }) => {
        const bytes = Uint8Array.from(globalThis.atob(encoded), (character) =>
          character.charCodeAt(0),
        );
        const bitmap = await globalThis.createImageBitmap(
          new globalThis.Blob([bytes], { type: 'image/png' }),
        );
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (context === null)
          throw new Error('Scoped contrast audit cannot decode rendered surface');
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return rectangles.map((box) =>
          [0.2, 0.5, 0.8].map((fraction) => {
            const x = Math.floor(box.x + box.width * fraction);
            const y = Math.floor(box.y + box.height * 0.5);
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height)
              throw new Error(
                `Scoped contrast sample is outside screenshot: ${String(x)},${String(y)}`,
              );
            return [...context.getImageData(x, y, 1, 1).data].slice(0, 3);
          }),
        );
      },
      { encoded: Buffer.from(screenshot).toString('base64'), rectangles },
    );
  };
  const luminance = (rgb) =>
    rgb
      .map((channel) => channel / 255)
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (foreground, background) => {
    const shown = foreground
      .slice(0, 3)
      .map(
        (channel, index) =>
          channel * (foreground[3] ?? 1) + background[index] * (1 - (foreground[3] ?? 1)),
      );
    const [high, low] = [luminance(shown), luminance(background)].sort(
      (first, second) => second - first,
    );
    return (high + 0.05) / (low + 0.05);
  };
  const problems = [];
  const indicators = [];
  const surfaces = [];
  if (isDark) {
    // The thread scrolls independently; sample each text after bringing it into that viewport.
    for (const text of texts) {
      const target = text.index === 0 ? editor : editor.locator('*').nth(text.index - 1);
      const box = await target.evaluate((element) => {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        const range = globalThis.document.createRange();
        range.selectNodeContents(element);
        const rectangle = element.matches('input, textarea')
          ? element.getBoundingClientRect()
          : range.getBoundingClientRect();
        return {
          x: rectangle.x + globalThis.scrollX,
          y: rectangle.y + globalThis.scrollY,
          width: rectangle.width,
          height: rectangle.height,
        };
      });
      const [surface] = await sample([box]);
      surfaces.push(surface);
    }
  } else surfaces.push(...(await sample(texts)));
  const ratios = texts.map((text, index) =>
    Math.min(...surfaces[index].map((surface) => contrast(text.color, surface))),
  );
  texts.forEach((text, index) => {
    if (ratios[index] < 4.5)
      problems.push(`scoped text ${ratios[index].toFixed(2)}:1 on ${text.name}`);
  });
  for (const field of await editor.locator('input:visible, textarea:visible').all()) {
    await field.evaluate((element) => {
      element.blur();
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    for (const mode of ['rest', 'focus']) {
      if (mode === 'focus') {
        await page.keyboard.press('Tab');
        await field.focus();
      }
      const indicator = await field.evaluate((element, mode) => {
        const style = globalThis.getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const color = (mode === 'rest' ? style.borderTopColor : style.outlineColor)
          .match(/[\d.]+/g)
          .map(Number);
        const width = Number.parseFloat(
          mode === 'rest' ? style.borderTopWidth : style.outlineWidth,
        );
        return {
          name: element.id,
          color,
          width,
          x: box.x + globalThis.scrollX - (mode === 'focus' ? 8 : 4),
          y: box.y + globalThis.scrollY,
          height: box.height,
          widthOfSample: 1,
        };
      }, mode);
      const [backgrounds] = await sample([{ ...indicator, width: indicator.widthOfSample }]);
      const ratio =
        indicator.width >= (mode === 'rest' ? 1 : 2)
          ? Math.min(...backgrounds.map((background) => contrast(indicator.color, background)))
          : 0;
      indicators.push({ name: indicator.name, mode, ratio });
      if (ratio < 3)
        problems.push(`scoped ${mode} indicator ${ratio.toFixed(2)}:1 on ${indicator.name}`);
    }
    await field.evaluate((element) => element.blur());
  }
  // Proof: stripping .form-panel from the compiled repair failed the dark palette check at
  // all four widths in screens.mjs; byte-identical restoration passed all scoped captures.
  if (isDark) {
    const palette = await editor.evaluate((root) => {
      const style = globalThis.getComputedStyle(root);
      return {
        label: globalThis.getComputedStyle(root.querySelector('.message-label')).color,
        preview:
          root.querySelector('.request-preview p') === null
            ? null
            : globalThis.getComputedStyle(root.querySelector('.request-preview p')).color,
        glass: globalThis.getComputedStyle(root, '::before').backgroundImage,
        page: style.getPropertyValue('--night').trim(),
      };
    });
    if (
      palette.label !== 'rgb(196, 189, 208)' ||
      (palette.preview !== null && palette.preview !== 'rgb(244, 242, 247)') ||
      palette.glass !==
        'linear-gradient(160deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.04))' ||
      palette.page !== '#0b0915'
    )
      problems.push(`dark scoped palette changed: ${JSON.stringify(palette)}`);
  }
  globalThis.console.log(
    `scoped measurements: ${JSON.stringify({
      texts: texts.map((text, index) => ({ name: text.name, ratio: ratios[index] })),
      indicators,
    })}`,
  );
  globalThis.console.log(
    `scoped contrast: ${String(texts.length)} visible texts, minimum ${Math.min(...ratios).toFixed(2)}:1, ${isDark ? 'night' : 'manual'}`,
  );
  return problems;
}
