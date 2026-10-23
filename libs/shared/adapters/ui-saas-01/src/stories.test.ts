import { access, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'bun:test';

import { listPrimitives, toFileStem } from './exports.testing';
import { BUTTON_SIZES, BUTTON_VARIANTS } from './index';

/** Whether a file beside this one exists; any failure other than absence is rethrown. */
async function isPresent(name: string): Promise<boolean> {
  try {
    await access(new URL(`./${name}`, import.meta.url));
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

describe('the kit catalogue', () => {
  it('has a story file for every exported primitive', async () => {
    const primitives = listPrimitives();
    expect(primitives.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const { name } of primitives) {
      if (!(await isPresent(`${toFileStem(name)}.stories.tsx`))) missing.push(name);
    }
    // Proof: moving `label.stories.tsx` away made this read `["Label"]` and fail (2026-10-21).
    expect(missing).toEqual([]);
  });

  it('names every button variant and size in the button stories', async () => {
    const stories = await readFile(new URL('./button.stories.tsx', import.meta.url), 'utf8');
    const keys = [...BUTTON_VARIANTS, ...BUTTON_SIZES];
    // Proof: deleting the `Ghost` story's `'ghost'` made this read `["ghost"]` and fail (2026-10-21).
    expect(keys.filter((key) => !stories.includes(`'${key}'`))).toEqual([]);
  });
});
