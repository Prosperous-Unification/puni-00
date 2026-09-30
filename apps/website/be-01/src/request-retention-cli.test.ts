import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebsiteStore } from '@website/store-sqlite';
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

const commandPath = join(import.meta.dir, 'request-retention-cli.ts');

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

function withDatabase(run: (databasePath: string, directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'puni-request-retention-cli-'));
  try {
    const databasePath = join(directory, 'website.sqlite');
    const store = new WebsiteStore(databasePath);
    store.createDraft('draft-1', 'private description', 'private claim', 100, 1000);
    store.submit('private claim', 'key', 'hash', 'private@example.test', 'private', 'r-1', 500);
    const account = store.createProspect('owner@example.test', 10);
    store.ensureBlankRequest(account.id, 20);
    store.close();
    const database = new Database(databasePath);
    try {
      // An older API process wrote content into the blank request with no recorded anchor.
      database.run("UPDATE software_request SET brief = 'private typed brief'");
      database.run(
        "UPDATE retention_subject SET resolution = 'ambiguous', ambiguity = 'unanchored_content' WHERE subject_kind = 'software_request'",
      );
    } finally {
      database.close();
    }
    run(databasePath, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('report prints counts only and coverage refuses until the ambiguous anchor is resolved', () => {
  withDatabase((databasePath) => {
    const reported = command('report', databasePath);
    expect(reported.exitCode).toBe(0);
    const report = JSON.parse(reported.output) as {
      activation: string;
      deletion: string;
      softwareRequest: { ambiguous: number };
      proposalSubmission: { anchored: number; due: number };
    };
    expect(report).toMatchObject({
      activation: 'refused',
      deletion: 'disabled',
      softwareRequest: { ambiguous: 1 },
      proposalSubmission: { anchored: 1 },
    });
    expect(reported.output).not.toMatch(/private|example\.test|draft-1|r-1/);

    const refused = command('coverage', databasePath);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.output).toBe('');
    expect(refused.error).toContain('Retention activation refused: 1 ambiguous software request');

    const listed = command('ambiguous', databasePath);
    expect(listed.exitCode).toBe(0);
    expect(listed.output).not.toMatch(/private|example\.test/);
    const ambiguous = (JSON.parse(listed.output) as { kind: string; subjectId: string }[]).at(0);
    if (!ambiguous) throw new Error('No ambiguous subject listed');

    const unresolved = command(
      'resolve',
      databasePath,
      ambiguous.kind,
      ambiguous.subjectId,
      '15',
      'owner@example.test',
      'operator-1',
    );
    expect(unresolved.exitCode).not.toBe(0);
    expect(unresolved.error).toContain('Evidence reference must be an opaque reference');

    const resolved = command(
      'resolve',
      databasePath,
      ambiguous.kind,
      ambiguous.subjectId,
      '15',
      'ops-ticket:42',
      'operator-1',
    );
    expect(resolved.exitCode).toBe(0);
    expect(JSON.parse(resolved.output)).toEqual({ deadlineAt: Date.UTC(1971, 0, 1, 0, 0, 0, 15) });
    const ready = command('coverage', databasePath);
    expect(ready.exitCode).toBe(0);
    expect(JSON.parse(ready.output)).toMatchObject({ activation: 'ready', deletion: 'disabled' });

    const database = new Database(databasePath, { readonly: true });
    try {
      expect(
        database.query<{ brief: string }, []>('SELECT brief FROM software_request').get()?.brief,
      ).toBe('private typed brief');
      expect(
        database.query<{ email: string }, []>('SELECT email FROM proposal_submission').get()?.email,
      ).toBe('private@example.test');
    } finally {
      database.close();
    }
  });
});

test('source command refuses malformed arguments without creating a database', () => {
  withDatabase((databasePath, directory) => {
    for (const [arguments_, message] of [
      [[], 'Usage: report DATABASE | coverage DATABASE | ambiguous DATABASE | resolve'],
      [['unknown', databasePath], 'Usage: report DATABASE'],
      [['report', ''], 'Usage: report DATABASE'],
      [['report', databasePath, 'extra'], 'Usage: report DATABASE'],
      [
        ['resolve', databasePath, 'software_request', 'id', '15', 'ops:1'],
        'resolve DATABASE KIND SUBJECT_ID',
      ],
      [
        ['resolve', databasePath, 'account', 'id', '15', 'ops:1', 'operator-1'],
        'Kind must be software_request or proposal_submission',
      ],
      [
        ['resolve', databasePath, 'software_request', 'id', '1.5', 'ops:1', 'operator-1'],
        'ANCHOR_MS must be decimal UTC epoch milliseconds',
      ],
      [
        ['resolve', databasePath, 'software_request', 'id', '0x10', 'ops:1', 'operator-1'],
        'ANCHOR_MS must be decimal UTC epoch milliseconds',
      ],
    ] as const) {
      const rejected = command(...arguments_);
      expect(rejected.exitCode).not.toBe(0);
      expect(rejected.output).toBe('');
      expect(rejected.error).toContain(message);
    }
    expect(command('report', join(directory, 'missing.sqlite')).exitCode).not.toBe(0);
    expect(existsSync(join(directory, 'missing.sqlite'))).toBe(false);
  });
});
