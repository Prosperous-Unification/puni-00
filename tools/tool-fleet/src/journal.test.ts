import { chmod, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { readOperationJournal, writeOperationJournal } from './journal';

const journal = {
  schemaVersion: 1 as const,
  operationId: 'a'.repeat(64),
  planSha256: 'a'.repeat(64),
  state: 'running' as const,
  leaseOwner: 'owner-1',
  completedSteps: [],
  updatedAt: '2026-09-17T09:00:00.000Z',
};

describe('operation journal', () => {
  it('atomically replaces owner-only state and preserves old bytes on an interrupted write', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-journal-'));
    const path = join(directory, 'journal.json');
    await writeOperationJournal(path, journal);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const before = await readFile(path, 'utf8');

    expect(
      writeOperationJournal(path, { ...journal, state: 'complete' }, 'before-rename'),
    ).rejects.toThrow(/injected.*before rename/i);
    expect(await readFile(path, 'utf8')).toBe(before);
  });

  it('throws for absent, unreadable, malformed, and inexact required state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-journal-invalid-'));
    const path = join(directory, 'journal.json');
    expect(readOperationJournal(path)).rejects.toThrow(/required operation journal/i);
    await writeFile(path, '{');
    expect(readOperationJournal(path)).rejects.toThrow(/malformed.*journal/i);
    await writeFile(path, JSON.stringify({ ...journal, surprise: true }));
    expect(readOperationJournal(path)).rejects.toThrow(/journal.*surprise|validation/i);
    await chmod(path, 0o000);
    expect(readOperationJournal(path)).rejects.toThrow(/required operation journal/i);
  });
});
