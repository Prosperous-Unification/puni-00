import { readFile } from 'node:fs/promises';

import { readCustomProperties, vocabularyTokens } from '@ui/core-01/testing';
import { describe, expect, it } from 'bun:test';

const here = new URL('./', import.meta.url);
const theme = await readFile(new URL('./theme.css', here), 'utf8');
const vocabulary = await readFile(new URL('../../ui-core-01/src/vocabulary.css', here), 'utf8');
const tokens = vocabularyTokens(vocabulary);

/** Vocabulary tokens that are not colours: assigned once, in the light block, never re-pointed. */
const PALETTE_INDEPENDENT = ['--radius', '--font-body', '--font-display'] as const;

/** The kit's own tokens beyond the vocabulary: the layer order every portal reads. */
const KIT_TOKENS = ['--layer-modal', '--layer-card', '--layer-card-ring', '--layer-toast'] as const;

/** `apps/wbs/fe-01/src/styles.css` at a1a33b2cc, the values the WBS UI review measured. */
const WBS_LIGHT = {
  '--background': 'oklch(1 0 0)',
  '--foreground': 'oklch(0.129 0.042 264.695)',
  '--primary': 'oklch(0.208 0.042 265.755)',
  '--primary-foreground': 'oklch(0.984 0.003 247.858)',
  '--muted-foreground': 'oklch(0.554 0.046 257.417)',
  '--destructive': 'oklch(0.577 0.245 27.325)',
  '--ring': 'oklch(0.704 0.04 256.788)',
  '--control-edge': 'oklch(0.62 0.03 257)',
  '--radius': '0.5rem',
  '--font-body': 'sans-serif',
} as const;
const WBS_DARK = {
  '--background': 'oklch(0.129 0.042 264.695)',
  '--foreground': 'oklch(0.984 0.003 247.858)',
  '--primary': 'oklch(0.929 0.013 255.508)',
  '--primary-foreground': 'oklch(0.208 0.042 265.755)',
  '--muted-foreground': 'oklch(0.704 0.04 256.788)',
  '--destructive': 'oklch(0.704 0.191 22.216)',
  '--ring': 'oklch(0.551 0.027 264.364)',
  '--control-edge': 'oklch(0.58 0.03 257)',
} as const;

describe('the SaaS theme', () => {
  const light = readCustomProperties(theme, ':root');
  const dark = readCustomProperties(theme, '.dark');

  it('imports the vocabulary it assigns', () => {
    expect(theme).toContain("@import '../../ui-core-01/src/vocabulary.css';");
    expect(tokens.length).toBeGreaterThan(20);
  });

  it('assigns every vocabulary token in the light palette', () => {
    expect(tokens.filter((token) => !light.has(token))).toEqual([]);
  });

  it('re-points every colour token in the dark palette', () => {
    const colours = tokens.filter(
      (token) => !PALETTE_INDEPENDENT.includes(token as (typeof PALETTE_INDEPENDENT)[number]),
    );
    // Proof: deleting `--ring` from `.dark` made this read `["--ring"]` and fail (2026-10-21).
    expect(colours.filter((token) => !dark.has(token))).toEqual([]);
  });

  it('declares color-scheme beside each palette', () => {
    expect(theme).toMatch(/:root\s*\{\s*color-scheme:\s*light;/);
    expect(theme).toMatch(/\.dark\s*\{\s*color-scheme:\s*dark;/);
  });

  it('assigns the kit tokens once, in the light block', () => {
    expect(KIT_TOKENS.filter((token) => !light.has(token))).toEqual([]);
    expect(KIT_TOKENS.filter((token) => dark.has(token))).toEqual([]);
  });

  it('starts on the values WBS was measured on, so the move changes no pixel', () => {
    for (const [token, value] of Object.entries(WBS_LIGHT))
      expect(light.get(token), token).toBe(value);
    for (const [token, value] of Object.entries(WBS_DARK))
      expect(dark.get(token), token).toBe(value);
  });
});
