import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import {
  assertExportSound,
  assertRestoredMatches,
  CUTOVER_PHASES,
  fencedSiteContext,
  K8S_APP_UID,
  parseSqliteReport,
  REVERSIBLE_PHASES,
  SQLITE_REPORT_SCRIPT,
  type SqliteReport,
} from './cutover';
import { BACKEND_TASK_SCRIPT } from './execute';

const BACKEND = resolve(import.meta.dir, '../../../../apps/wbs/be-01');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function bunScript(script: string, env: Record<string, string>): string {
  const child = Bun.spawnSync({
    cmd: ['bun', '-e', script],
    cwd: BACKEND,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString();
}

function report(overrides: Partial<SqliteReport> = {}): SqliteReport {
  return {
    path: '/export/wbs.sqlite',
    integrity: ['ok'],
    foreignKeyViolations: 0,
    migrations: ['0001_init', '0002_next'],
    counts: { project: 2 },
    known: { 'f11-known': true },
    sha256: 'a'.repeat(64),
    ownerUid: K8S_APP_UID,
    ...overrides,
  };
}

describe('SQLITE_REPORT_SCRIPT against the real be-01 migrations', () => {
  it('exports a consistent copy and reports migrations, counts and known rows', () => {
    const root = scratchSync('wbs-cutover-');
    roots.push(root);
    const db = join(root, 'wbs.db');
    bunScript("new (require('bun:sqlite').Database)(process.env.DB_PATH).close()", { DB_PATH: db });
    bunScript(BACKEND_TASK_SCRIPT, { DB_PATH: db, PUNI_TASK: 'migrate' });
    bunScript(
      "const d = new (require('bun:sqlite').Database)(process.env.DB_PATH); d.run(\"INSERT INTO users (id, username, created_at) VALUES ('u1', 'f11', 0)\"); d.run(\"INSERT INTO project (id, name, owner_id, created_at) VALUES ('p1', 'f11-known', 'u1', 0)\"); d.close()",
      { DB_PATH: db },
    );
    const exported = parseSqliteReport(
      bunScript(SQLITE_REPORT_SCRIPT, {
        PUNI_DB: db,
        PUNI_EXPORT: join(root, 'export.sqlite'),
        PUNI_KNOWN: JSON.stringify(['f11-known', 'f11-absent']),
      }),
    );
    expect(exported.path).toBe(join(root, 'export.sqlite'));
    expect(exported.integrity).toEqual(['ok']);
    expect(exported.migrations.length).toBeGreaterThan(0);
    expect(exported.counts['project']).toBe(1);
    expect(exported.known).toEqual({ 'f11-known': true, 'f11-absent': false });
    expect(() => {
      assertExportSound(exported);
    }).toThrow('lacks known rows: f11-absent');
    const again = parseSqliteReport(bunScript(SQLITE_REPORT_SCRIPT, { PUNI_DB: exported.path }));
    expect(again.sha256).toBe(exported.sha256);
    expect(() => bunScript(SQLITE_REPORT_SCRIPT, { PUNI_DB: join(root, 'absent.db') })).toThrow(
      'does not exist',
    );
  }, 60_000);
});

describe('export and restore judgements', () => {
  it('accepts a sound export', () => {
    expect(() => {
      assertExportSound(report());
    }).not.toThrow();
  });

  it('refuses an export whose integrity_check is not ok', () => {
    expect(() => {
      assertExportSound(report({ integrity: ['*** in database main *** Page 7 is never used'] }));
    }).toThrow('integrity_check on /export/wbs.sqlite');
  });

  it('refuses an export with foreign key violations', () => {
    expect(() => {
      assertExportSound(report({ foreignKeyViolations: 1 }));
    }).toThrow('found 1 violations');
  });

  it('accepts the restored export and refuses a restore with different bytes', () => {
    expect(() => {
      assertRestoredMatches(report(), report({ path: '/data/wbs.sqlite' }));
    }).not.toThrow();
    expect(() => {
      assertRestoredMatches(report(), report({ sha256: 'b'.repeat(64), counts: { project: 1 } }));
    }).toThrow(`sha256 ${'b'.repeat(64)} is not the export's`);
  });

  it('refuses a restored database the backend UID does not own', () => {
    expect(() => {
      assertRestoredMatches(report(), report({ ownerUid: 0 }));
    }).toThrow('owner uid 0 is not 10001');
  });
});

describe('cutover shape', () => {
  it('keeps every step before the traffic switch reversible', () => {
    expect(REVERSIBLE_PHASES).not.toContain('switch-traffic');
    expect(REVERSIBLE_PHASES).toEqual(CUTOVER_PHASES.slice(0, -1));
  });

  it('fences writes and WebSockets at the old edge while reads still pass', () => {
    const context = fencedSiteContext('http://wbs.f11.test', 'be-01-blue:3100', 'fe-01-blue:80');
    expect(context['BE_ROUTE']).toContain('respond @write');
    expect(context['BE_ROUTE']).toContain('reverse_proxy be-01-blue:3100');
    expect(context['GW_ROUTE']).toStartWith('respond ');
  });

  it('refuses a report without exactly one marked line', () => {
    expect(() => parseSqliteReport('nothing')).toThrow('got 0');
  });
});
