import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

let directory: string;
const cli = new URL('./shared-people-rollback-cli.ts', import.meta.url).pathname;
const saved = {
  format: 'shared-people-save',
  version: 1,
  organizations: [
    { organizationId: 'org-z', mode: 'shared' },
    { organizationId: 'org-a', mode: 'isolated' },
  ],
  ranks: [
    {
      createdBy: 'ada',
      updatedAt: 2,
      createdAt: 1,
      position: 3,
      organizationId: 'org-a',
      projectId: 'a1',
    },
  ],
};
const DIGEST = 'ea65189d5af61518fddf5bb825351667d2983f08ee9bf08c87ebe4ffd9a18117';
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-backup-digest-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

async function invoke(args: string[], dbPath?: string) {
  const env = { ...process.env };
  delete env['DB_PATH'];
  if (dbPath !== undefined) env['DB_PATH'] = dbPath;
  const child = Bun.spawn([process.execPath, cli, ...args], {
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exit, stdout, stderr };
}

describe('shared people backup digest CLI', () => {
  it('digests a shared backup without DB_PATH and emits only its canonical digest', async () => {
    const path = join(directory, 'backup.json');
    writeFileSync(path, JSON.stringify(saved, null, 2));
    expect(await invoke(['digest', path])).toEqual({ exit: 0, stdout: DIGEST + '\n', stderr: '' });
  });

  it('never opens or alters a supplied database while computing a digest', async () => {
    const path = join(directory, 'backup.json');
    const database = join(directory, 'not-a-database');
    writeFileSync(path, JSON.stringify(saved));
    writeFileSync(database, 'sentinel');
    expect(await invoke(['digest', path], database)).toEqual({
      exit: 0,
      stdout: DIGEST + '\n',
      stderr: '',
    });
    expect(readFileSync(database, 'utf8')).toBe('sentinel');
  });

  it('refuses a backup rank outside the saved organization set before producing a digest', async () => {
    const path = join(directory, 'foreign-rank.json');
    writeFileSync(path, JSON.stringify({ ...saved, organizations: [saved.organizations[0]] }));
    const rejected = await invoke(['digest', path]);
    expect(rejected.exit).not.toBe(0);
    expect(rejected.stdout).toBe('');
    expect(rejected.stderr).toContain('rank organization is absent');
  });

  it('refuses invalid arguments and absent, unreadable or malformed backups without a database', async () => {
    const malformed = join(directory, 'bad.json');
    writeFileSync(malformed, '{');
    for (const args of [
      ['digest'],
      ['digest', ''],
      ['digest', malformed, 'extra'],
      ['digest', join(directory, 'missing')],
      ['digest', directory],
      ['digest', malformed],
    ]) {
      const rejected = await invoke(args);
      expect(rejected.exit).not.toBe(0);
      expect(rejected.stdout).toBe('');
    }
  });
});
