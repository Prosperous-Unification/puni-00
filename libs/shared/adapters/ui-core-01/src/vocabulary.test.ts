import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'bun:test';

import { readCustomProperties, vocabularyTokens } from './testing';

const vocabulary = await readFile(new URL('./vocabulary.css', import.meta.url), 'utf8');

/** The names a kit assigns, pinned: a kit's `theme.test.ts` reads the same list from the file. */
const EXPECTED_TOKENS = [
  '--font-body',
  '--font-display',
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring',
  '--control-edge',
  '--radius',
] as const;

describe('the vocabulary', () => {
  it('assigns no value: every theme key is a var() reference', () => {
    const literals = [...readCustomProperties(vocabulary, '@theme inline')]
      .filter(([, value]) => !/var\(--[a-z0-9-]+\)/.test(value))
      .map(([name, value]) => `${name}: ${value}`);
    // Proof: `--color-background: oklch(1 0 0)` in the block made this read
    // `["--color-background: oklch(1 0 0)"]` and fail (2026-10-21).
    expect(literals).toEqual([]);
  });

  it('names exactly the tokens a kit must assign', () => {
    expect(vocabularyTokens(vocabulary)).toEqual([...EXPECTED_TOKENS]);
  });

  it('keeps the file to the one theme block', () => {
    expect(() => readCustomProperties(vocabulary, ':root')).toThrow('no block opens with :root');
  });
});
