import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDrizzle } from './db';
import { DrizzleEventLogRepo } from './event-log';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let repo: DrizzleEventLogRepo;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-event-log-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  repo = new DrizzleEventLogRepo(openDrizzle(path));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('DrizzleEventLogRepo.latestSeq', () => {
  it('reports the sequence of the most recent event', async () => {
    await repo.recordEvent('project:a', { n: 1 }, 100);
    await repo.recordEvent('project:a', { n: 2 }, 200);
    await repo.recordEvent('project:a', { n: 3 }, 300);

    expect(await repo.latestSeq('project:a')).toBe(2);
  });

  it('reports -1 for a subscription that has recorded nothing', async () => {
    expect(await repo.latestSeq('project:never-touched')).toBe(-1);
  });

  it('does not read another subscription’s events', async () => {
    await repo.recordEvent('project:a', { n: 1 }, 100);
    await repo.recordEvent('project:b', { n: 1 }, 100);
    await repo.recordEvent('project:b', { n: 2 }, 200);

    expect(await repo.latestSeq('project:a')).toBe(0);
  });

  it('survives retention removing the earlier events', async () => {
    await repo.recordEvent('project:a', { n: 1 }, 100);
    await repo.recordEvent('project:a', { n: 2 }, 200);
    await repo.pruneBeyond(1);

    // The sequence is the stream's position, not a count of what is retained:
    // a client resuming after a prune must still be told where the stream is.
    expect(await repo.latestSeq('project:a')).toBe(1);
    expect(await repo.oldestSeq('project:a')).toBe(1);
  });
});
