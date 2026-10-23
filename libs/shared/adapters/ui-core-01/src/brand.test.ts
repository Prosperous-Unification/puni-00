import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'bun:test';

import { readCustomProperties, stripCssComments } from './testing';

const here = new URL('./', import.meta.url);
const brand = await readFile(new URL('./brand.css', here), 'utf8');

/** The digests `fonts/README.md` documents, read from the table rather than copied. */
async function documentedDigests(): Promise<ReadonlyMap<string, string>> {
  const readme = await readFile(new URL('./fonts/README.md', here), 'utf8');
  const digests = new Map<string, string>();
  for (const [, file, digest] of readme.matchAll(
    /^\| `([^`]+\.ttf)` +\| +\d+ \| `([0-9a-f]{64})` \|$/gm,
  )) {
    digests.set(file, digest);
  }
  if (digests.size === 0) throw new Error('fonts/README.md documents no digest');
  return digests;
}

describe('the brand constants', () => {
  it('are literals under --brand-*, never references', () => {
    const constants = readCustomProperties(brand, ':root');
    expect(constants.size).toBeGreaterThan(0);
    const wrong = [...constants].filter(
      ([name, value]) => !name.startsWith('--brand-') || value.includes('var('),
    );
    expect(wrong).toEqual([]);
  });

  it('declares the two faces the font files carry', () => {
    const faces = [...stripCssComments(brand).matchAll(/font-family:\s*'([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(faces).toEqual(['Geist', 'Inter Tight']);
    for (const file of ['Geist-variable.ttf', 'InterTight-variable.ttf']) {
      expect(brand).toContain(`url('./fonts/${file}')`);
    }
  });

  it('ships every font with its OFL notice and the documented digest', async () => {
    const digests = await documentedDigests();
    const files = await readdir(new URL('./fonts/', here));
    for (const [file, digest] of digests) {
      expect(files, file).toContain(file);
      expect(files, file).toContain(file.replace('-variable.ttf', '-OFL.txt'));
      const bytes = await readFile(new URL(`./fonts/${file}`, here));
      // Proof: truncating Geist-variable.ttf by one byte failed here on the digest (2026-10-21).
      expect(createHash('sha256').update(bytes).digest('hex'), file).toBe(digest);
    }
    // The website keeps its own copies until it adopts a kit; they must be the same bytes.
    for (const [file, digest] of digests) {
      const siblings = new URL(`../../../../../apps/website/fe-01/src/assets/fonts/${file}`, here);
      const bytes = await readFile(siblings);
      expect(createHash('sha256').update(bytes).digest('hex'), `website ${file}`).toBe(digest);
    }
  });
});
