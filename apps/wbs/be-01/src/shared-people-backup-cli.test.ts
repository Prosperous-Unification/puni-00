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

for (const [name, fixture, digest] of [
  [
    'published1',
    'legacy-shared-people-save1.json',
    'ea65189d5af61518fddf5bb825351667d2983f08ee9bf08c87ebe4ffd9a18117',
  ],
  [
    'current2',
    'shared-people-save2.json',
    '2aac813ad69f223b8ad8ddec6cba39bf9023d3d60a361070d4ff9292e5bdd206',
  ],
] as const) {
  it(
    'digests pinned ' + name + ' backup in its own wire generation without opening DB_PATH',
    async () => {
      const path = join(directory, 'pinned-' + name + '.json');
      const fixturePath = new URL(
        '../../../../openspec/changes/wbs-work-packages/fixtures/' + fixture,
        import.meta.url,
      );
      const bytes = readFileSync(fixturePath);
      writeFileSync(path, bytes);
      const database = join(directory, 'must-not-open-' + name);
      writeFileSync(database, 'sentinel');
      expect(await invoke(['digest', path], database)).toEqual({
        exit: 0,
        stdout: digest + '\n',
        stderr: '',
      });
      expect(readFileSync(database, 'utf8')).toBe('sentinel');
      expect(readFileSync(path)).toEqual(bytes);
    },
  );
}

it('canonicalizes current2 presentation before the real digest CLI prints its fixed identity', async () => {
  const path = join(directory, 'reordered-current2.json');
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        '../../../../openspec/changes/wbs-work-packages/fixtures/shared-people-save2.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    format: string;
    version: number;
    organizations: { organizationId: string; mode: string }[];
    ranks: {
      workPackageId: string;
      organizationId: string;
      position: number;
      createdAt: number;
      updatedAt: number | null;
      createdBy: string;
    }[];
  };
  const reordered = {
    ranks: fixture.ranks.map((rank) => ({
      createdBy: rank.createdBy,
      updatedAt: rank.updatedAt,
      createdAt: rank.createdAt,
      position: rank.position,
      organizationId: rank.organizationId,
      workPackageId: rank.workPackageId,
    })),
    organizations: [...fixture.organizations].reverse().map((organization) => ({
      mode: organization.mode,
      organizationId: organization.organizationId,
    })),
    version: fixture.version,
    format: fixture.format,
  };
  writeFileSync(path, JSON.stringify(reordered, null, 2));
  expect(await invoke(['digest', path])).toEqual({
    exit: 0,
    stdout: '2aac813ad69f223b8ad8ddec6cba39bf9023d3d60a361070d4ff9292e5bdd206\n',
    stderr: '',
  });
});
for (const fault of ['duplicate rank', 'invalid updatedAt', 'missing organization'] as const)
  it('refuses current2 ' + fault + ' at the real digest CLI without output', async () => {
    const path = join(directory, 'malformed-current2.json');
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          '../../../../openspec/changes/wbs-work-packages/fixtures/shared-people-save2.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { organizations: unknown[]; ranks: Record<string, unknown>[] };
    const malformed =
      fault === 'duplicate rank'
        ? { ...fixture, ranks: [...fixture.ranks, fixture.ranks[0]] }
        : fault === 'invalid updatedAt'
          ? { ...fixture, ranks: [{ ...fixture.ranks[0], updatedAt: false }] }
          : { ...fixture, organizations: [] };
    writeFileSync(path, JSON.stringify(malformed));
    const refused = await invoke(['digest', path]);
    expect(refused.exit).not.toBe(0);
    expect(refused.stdout).toBe('');
    expect(refused.stderr).toContain(
      fault === 'missing organization' ? 'rank organization is absent' : 'invalid',
    );
  });
