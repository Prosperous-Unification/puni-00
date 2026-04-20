import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const FORBIDDEN_KEYWORDS = [
  'DROP TABLE',
  'DROP COLUMN',
  'ALTER TABLE ... RENAME COLUMN',
  'TRUNCATE',
];

export interface MigrationIssue {
  file: string;
  reason: string;
}

export async function lintMigration(file: string): Promise<MigrationIssue | null> {
  if (!file.endsWith('.sql')) return null;
  const raw = (await readFile(file, 'utf8').catch(() => '')).toUpperCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    const needle = kw.replace(' ... ', ' ');
    if (raw.includes(needle)) {
      return {
        file,
        reason:
          `${basename(file)} contains destructive statement: ${kw}. ` +
          `Destructive migrations must be split into a deploy-then-cleanup pair (see plan).`,
      };
    }
  }
  return null;
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  const issues: MigrationIssue[] = [];
  for (const f of files) {
    const hit = await lintMigration(f);
    if (hit) issues.push(hit);
  }
  if (issues.length > 0) {
    console.error('[tool-git-hooks] migration-lint failed:');
    for (const i of issues) console.error(`  ${i.file}: ${i.reason}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
