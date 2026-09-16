import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Files in the prompt directory are named `<number>.<anything>`, e.g.
 * `010.hello.md`, `020.csv-cli.md`. The number orders them; nothing else does.
 */
const NUMBERED = /^(\d+)\./;

/**
 * Picks the prompt file with the largest leading number and returns its text.
 *
 * The number is compared numerically, so `9.x` loses to `10.x`. A missing or
 * empty directory throws, and so does a non-dot file without a leading number
 * or two files sharing one number: a prompt that cannot be ordered would be
 * silently skipped otherwise, and a skipped prompt looks exactly like an
 * older one winning.
 */
export async function readLatestPrompt(dir: string): Promise<{ file: string; text: string }> {
  const entries = (await readdir(dir)).filter((name) => !name.startsWith('.'));
  if (entries.length === 0) throw new Error(`no prompt files in ${dir}`);
  let best: { file: string; number: number } | null = null;
  for (const file of entries) {
    const match = NUMBERED.exec(file);
    if (!match?.[1]) throw new Error(`prompt file without a leading number: ${file}`);
    const number = Number(match[1]);
    if (best !== null && number === best.number) {
      throw new Error(`two prompt files share number ${match[1]}: ${best.file}, ${file}`);
    }
    if (best === null || number > best.number) best = { file, number };
  }
  if (best === null) throw new Error(`no prompt files in ${dir}`);
  const text = (await readFile(path.join(dir, best.file), 'utf8')).trim();
  if (!text) throw new Error(`prompt file is empty: ${best.file}`);
  return { file: best.file, text };
}
