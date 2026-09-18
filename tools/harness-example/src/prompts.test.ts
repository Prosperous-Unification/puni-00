import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'bun:test';

import { readLatestPrompt } from './prompts';

/** The message a promise rejects with; the repo's tests avoid `.rejects` (see saved-plan-atomicity.db.test.ts). */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (caught: unknown) {
    return caught instanceof Error ? caught.message : String(caught);
  }
  throw new Error('expected a rejection');
}

async function dirWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'prompts-'));
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(dir, name), text);
  return dir;
}

describe('readLatestPrompt', () => {
  it('picks the largest leading number, compared as a number', async () => {
    const dir = await dirWith({ '9.old.md': 'nine', '10.new.md': 'ten', '020.mid.md': 'twenty' });
    // Proof: with the leading number compared as the digit string it was
    // matched from (`match[1] as unknown as number`), this failed on
    // `- "file": "020.mid.md" · + "file": "9.old.md"`. Watched 2026-09-13.
    expect(await readLatestPrompt(dir)).toEqual({ file: '020.mid.md', text: 'twenty' });
  });

  it('ignores dotfiles and trims the text', async () => {
    const dir = await dirWith({ '.DS_Store': '', '010.a.md': '  hello  \n' });
    expect(await readLatestPrompt(dir)).toEqual({ file: '010.a.md', text: 'hello' });
  });

  it('refuses two files with the same number instead of picking one', async () => {
    const dir = await dirWith({ '010.a.md': 'a', '010.b.md': 'b' });
    // Proof: with the tie check deleted from `readLatestPrompt`, this failed on
    // `error: expected a rejection`: the picker silently returned whichever of
    // the two files readdir listed first. Watched 2026-09-13.
    expect(await rejection(readLatestPrompt(dir))).toMatch(/share number 010/);
  });

  it('throws on a missing directory, an empty one, an unnumbered file, and an empty prompt', async () => {
    const missing = path.join(tmpdir(), `does-not-exist-${String(Date.now())}`);
    expect(await rejection(readLatestPrompt(missing))).toMatch(/ENOENT/);
    const empty = await mkdtemp(path.join(tmpdir(), 'prompts-'));
    await mkdir(empty, { recursive: true });
    expect(await rejection(readLatestPrompt(empty))).toMatch(/no prompt files/);
    const unnumbered = await dirWith({ 'notes.md': 'x', '010.a.md': 'y' });
    expect(await rejection(readLatestPrompt(unnumbered))).toMatch(
      /without a leading number: notes.md/,
    );
    const blank = await dirWith({ '010.a.md': '\n' });
    expect(await rejection(readLatestPrompt(blank))).toMatch(/is empty: 010.a.md/);
  });
});
