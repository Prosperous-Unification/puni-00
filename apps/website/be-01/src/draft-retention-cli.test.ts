import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebsiteStore } from '@website/store-sqlite';
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

const commandPath = join(import.meta.dir, 'draft-retention-cli.ts');

function command(...arguments_: string[]): { exitCode: number; output: string; error: string } {
  const child = Bun.spawnSync(['bun', commandPath, ...arguments_], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: child.exitCode,
    output: new TextDecoder().decode(child.stdout),
    error: new TextDecoder().decode(child.stderr),
  };
}

test('source command inspects and explicitly applies a reviewed plan', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-retention-cli-'));
  const databasePath = join(directory, 'website.sqlite');
  try {
    const store = new WebsiteStore(databasePath);
    store.createDraft('expired', 'private description', 'private claim', 1, 2);
    store.close();
    const inspected = command('inspect', databasePath);
    expect(inspected.exitCode).toBe(0);
    const plan = JSON.parse(inspected.output) as {
      cutoff: number;
      eligibleDrafts: number;
      fingerprint: string;
    };
    expect(plan.eligibleDrafts).toBe(1);
    expect(inspected.output).not.toMatch(/private|expired/);
    const applied = command('apply', databasePath, String(plan.cutoff), plan.fingerprint);
    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.output)).toEqual({
      deletedDrafts: 1,
      retainedDrafts: 0,
      deletedConversations: 0,
      deletedConversationTurns: 0,
      deletedConversationOperations: 0,
      retainedOperations: 0,
    });
    const database = new Database(databasePath, { readonly: true });
    expect(
      database.query<{ count: number }, []>('SELECT count(*) AS count FROM intake_draft').get()
        ?.count,
    ).toBe(0);
    database.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('source command refuses malformed arguments without creating or deleting a database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-retention-cli-'));
  const databasePath = join(directory, 'website.sqlite');
  try {
    const store = new WebsiteStore(databasePath);
    store.createDraft('expired', 'private description', 'private claim', 1, 2);
    store.close();
    for (const [arguments_, message] of [
      [[], 'Usage: inspect DATABASE | apply DATABASE CUTOFF FINGERPRINT'],
      [['inspect', ''], 'Usage: inspect DATABASE | apply DATABASE CUTOFF FINGERPRINT'],
      [['unknown', databasePath], 'Usage: inspect DATABASE | apply DATABASE CUTOFF FINGERPRINT'],
      [['inspect', databasePath, 'extra'], 'Usage: inspect DATABASE'],
      [['apply', databasePath, 'not-a-number', 'a'.repeat(64)], 'Cutoff must be UTC'],
      [['apply', databasePath, '1.2', 'a'.repeat(64)], 'Cutoff must be UTC'],
      [['apply', databasePath, '9007199254740992', 'a'.repeat(64)], 'safe UTC'],
      [['apply', databasePath, '2', 'invalid'], 'Fingerprint must be lowercase'],
      [['apply', databasePath, '2'], 'Usage: apply DATABASE'],
    ] as const) {
      const rejected = command(...arguments_);
      expect(rejected.exitCode).not.toBe(0);
      expect(rejected.output).toBe('');
      expect(rejected.error).toContain(message);
    }
    expect(command('inspect', join(directory, 'missing.sqlite')).exitCode).not.toBe(0);
    expect(existsSync(join(directory, 'missing.sqlite'))).toBe(false);
    const database = new Database(databasePath, { readonly: true });
    expect(
      database.query<{ count: number }, []>('SELECT count(*) AS count FROM intake_draft').get()
        ?.count,
    ).toBe(1);
    database.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
