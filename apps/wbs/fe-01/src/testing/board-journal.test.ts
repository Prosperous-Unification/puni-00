import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { readBoardJournal } from '../../e2e/board-journal';

const previous = process.env['E2E_TEST_DATABASE'];
afterEach(() => {
  if (previous === undefined) delete process.env['E2E_TEST_DATABASE'];
  else process.env['E2E_TEST_DATABASE'] = previous;
});

it('refuses an absent run database rather than inventing an empty journal baseline', () => {
  const directory = join(tmpdir(), `board-journal-absent-${crypto.randomUUID()}`);
  process.env['E2E_TEST_DATABASE'] = join(directory, 'board.db');
  expect(() => readBoardJournal('seeded-project')).toThrow();
});

it('refuses malformed run database bytes rather than reporting no journal rows', () => {
  const directory = mkdtempSync(join(tmpdir(), 'board-journal-malformed-'));
  const databasePath = join(directory, 'board.db');
  writeFileSync(databasePath, 'not sqlite');
  process.env['E2E_TEST_DATABASE'] = databasePath;
  try {
    expect(() => readBoardJournal('seeded-project')).toThrow();
  } finally {
    rmSync(directory, { recursive: true });
  }
});
