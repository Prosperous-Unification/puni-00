import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const certificateMigration = '20261022213000_add_optimization_boundary_certificates';
it('creates retained certificate storage and rolls back only an intact empty table', () => {
  const directory = mkdtempSync(join(tmpdir(), 'connected-migration-'));
  const path = join(directory, 'store.db');
  try {
    runMigrations(path, folder);
    rollbackTo(path, folder, certificateMigration);
    const sqlite = openDatabase(path);
    expect(
      sqlite
        .query("SELECT name FROM sqlite_master WHERE name='optimization_boundary_certificate'")
        .get(),
    ).not.toBeNull();
    const previousLedger = sqlite
      .query(
        "SELECT * FROM __drizzle_migrations WHERE name <> '20261022213000_add_optimization_boundary_certificates' ORDER BY id",
      )
      .all();
    sqlite.close();
    rollbackTo(path, folder, '20261022212000_add_cross_project_dependency_activation');
    const rolled = openDatabase(path);
    expect(
      rolled
        .query("SELECT name FROM sqlite_master WHERE name='optimization_boundary_certificate'")
        .get(),
    ).toBeNull();
    expect(rolled.query('SELECT * FROM __drizzle_migrations ORDER BY id').all()).toEqual(
      previousLedger,
    );
    rolled.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
for (const fault of ['retained', 'missing', 'replaced'] as const)
  it(`refuses ${fault} terminal table without changing the migration ledger`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'connected-down-'));
    const path = join(directory, 'store.db');
    try {
      runMigrations(path, folder);
      rollbackTo(path, folder, certificateMigration);
      const sqlite = openDatabase(path);
      if (fault === 'retained') {
        sqlite.run("INSERT INTO users(id,username,password_hash,created_at) VALUES('u','u','x',1)");
        sqlite.run("INSERT INTO project(id,name,owner_id,created_at) VALUES('B','B','u',1)");
        sqlite.run(
          "INSERT INTO optimization_boundary_certificate VALUES('B','h','time','v',1,'{}',1,'a',1)",
        );
      } else {
        sqlite.run('DROP TABLE optimization_boundary_certificate');
        if (fault === 'replaced')
          sqlite.run(
            'CREATE TABLE optimization_boundary_certificate(project_id,input_hash,objective,contract_version,budget_ms,certificate_json,generation,attempt_token,created_at)',
          );
      }
      const ledger = sqlite.query('SELECT * FROM __drizzle_migrations ORDER BY id').all();
      sqlite.close();
      // Proof: removing retention/schema predicates separately in scratch down scripts
      // made the pinned retained/replaced cases fail with no throw (2026-10-24).
      expect(() =>
        rollbackTo(path, folder, '20261022212000_add_cross_project_dependency_activation'),
      ).toThrow(
        fault === 'missing'
          ? 'no such table: optimization_boundary_certificate'
          : 'retained boundary certificates require compatible recovery',
      );
      const reopened = openDatabase(path);
      expect(reopened.query('SELECT * FROM __drizzle_migrations ORDER BY id').all()).toEqual(
        ledger,
      );
      if (fault === 'retained')
        expect(
          reopened.query('SELECT * FROM optimization_boundary_certificate').all(),
        ).toHaveLength(1);
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
