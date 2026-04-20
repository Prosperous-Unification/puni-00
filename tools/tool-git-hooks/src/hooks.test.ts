import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { isConventional } from './hooks/conventional';
import { lintMigration } from './hooks/migration-lint';
import { scan } from './hooks/plaintext-secrets';

describe('conventional', () => {
  it('accepts conventional subjects', () => {
    expect(isConventional('feat(gw): add ping')).toBe(true);
    expect(isConventional('fix: bug\n\nbody')).toBe(true);
    expect(isConventional('chore(deps)!: drop node 18')).toBe(true);
  });

  it('rejects non-conventional', () => {
    expect(isConventional('wip')).toBe(false);
    expect(isConventional('Add stuff')).toBe(false);
  });
});

describe('plaintext-secrets.scan', () => {
  it('detects AWS keys and age secrets', async () => {
    const d = await mkdtemp(join(tmpdir(), 'hooks-'));
    const f = join(d, 'leaky.env');
    await writeFile(f, 'AWS_KEY=AKIAABCDEFGHIJKLMNOP\n', 'utf8');
    const hit = await scan(f);
    expect(hit).not.toBeNull();
    expect(hit?.finding).toMatch(/AWS/);
  });

  it('returns null for clean files', async () => {
    const d = await mkdtemp(join(tmpdir(), 'hooks-'));
    const f = join(d, 'clean.env');
    await writeFile(f, 'PORT=3000\n', 'utf8');
    expect(await scan(f)).toBeNull();
  });
});

describe('migration-lint', () => {
  it('flags DROP TABLE', async () => {
    const d = await mkdtemp(join(tmpdir(), 'mig-'));
    const f = join(d, '0002_bad.sql');
    await writeFile(f, 'DROP TABLE users;', 'utf8');
    const hit = await lintMigration(f);
    expect(hit?.reason).toMatch(/DROP TABLE/);
  });

  it('allows CREATE TABLE', async () => {
    const d = await mkdtemp(join(tmpdir(), 'mig-'));
    const f = join(d, '0003_ok.sql');
    await writeFile(f, 'CREATE TABLE t (id INTEGER);', 'utf8');
    expect(await lintMigration(f)).toBeNull();
  });
});
