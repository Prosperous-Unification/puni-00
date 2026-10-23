import { readdir } from 'node:fs/promises';

import { describe, expect, it } from 'bun:test';

import * as core from './index';

describe('the core surface', () => {
  it('carries no component: no .tsx file under src', async () => {
    const files = await readdir(new URL('./', import.meta.url), { recursive: true });
    // Proof: an empty `probe.tsx` beside this file made this read `["probe.tsx"]` (2026-10-21).
    expect(files.filter((file) => file.endsWith('.tsx'))).toEqual([]);
  });

  it('exports helpers only, never a PascalCase name a component would have', () => {
    expect(Object.keys(core).filter((name) => /^[A-Z]/.test(name))).toEqual([]);
    expect(Object.keys(core).sort()).toEqual(['cn']);
  });
});
