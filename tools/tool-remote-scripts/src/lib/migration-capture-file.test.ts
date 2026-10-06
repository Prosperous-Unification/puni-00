import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import { writeNewMigrationCapture } from './migration-capture-file';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('writeNewMigrationCapture', () => {
  it('syncs the published directory after the complete capture becomes visible', async () => {
    const root = scratchSync('migration-capture-sync-');
    roots.push(root);
    const path = join(root, 'attempt.json');
    const synced: string[] = [];
    await writeNewMigrationCapture(path, 'captured', (directory) => {
      expect(readFileSync(path, 'utf8')).toBe('captured');
      synced.push(directory);
      return Promise.resolve();
    });
    expect(synced).toEqual([root]);
  });

  it('persists a private capture and refuses replacement by the same or concurrent attempt', async () => {
    const root = scratchSync('migration-capture-');
    roots.push(root);
    const path = join(root, 'attempt.json');
    const originalUmask = process.umask(0o022);
    try {
      await writeNewMigrationCapture(path, '{"attempt":"first"}');
      expect(readFileSync(path, 'utf8')).toBe('{"attempt":"first"}');
      expect(statSync(path).mode & 0o777).toBe(0o600);
      let replacementFailed = false;
      try {
        await writeNewMigrationCapture(path, '{"attempt":"replacement"}');
      } catch {
        replacementFailed = true;
      }
      expect(replacementFailed).toBe(true);
      const attempts = await Promise.allSettled([
        writeNewMigrationCapture(path, 'second'),
        writeNewMigrationCapture(path, 'third'),
      ]);
      expect(attempts.map((attempt) => attempt.status)).toEqual(['rejected', 'rejected']);
      expect(readFileSync(path, 'utf8')).toBe('{"attempt":"first"}');
      expect(existsSync(`${path}.tmp`)).toBe(false);
    } finally {
      process.umask(originalUmask);
    }
  });
});
