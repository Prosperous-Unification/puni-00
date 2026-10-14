import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openConnection, openDatabase } from './db';
import { OPEN } from './gate';
import { rollbackTo } from './migrate-down';
import { SharedPeopleRestoreApprovalRepository } from './shared-people-restore-approval';
import { MIGRATIONS_FOLDER, openSpaceDatabase } from './testing/space-database';

let directory: string;
let path: string;
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-restore-approval-'));
  path = await openSpaceDatabase(directory);
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function execute(statement: string) {
  const sqlite = openDatabase(path);
  try {
    return sqlite.query(statement).all();
  } finally {
    sqlite.close();
  }
}
function operation(id = 'restore-1', digest = 'a'.repeat(64)) {
  execute(`INSERT INTO shared_people_restore_operation VALUES ('${id}', '${digest}', 1)`);
}
function approval(id = 'approval-1', org = 'org-a', op = 'restore-1') {
  execute(
    `INSERT INTO shared_people_restore_approval VALUES ('${id}', '${op}', '${org}', 'ada', 1)`,
  );
}

const PREVIOUS = '20261012130000_add_step_estimate_unit';

describe('shared people restore approval schema', () => {
  it('rejects malformed operation bindings at durable storage', () => {
    for (const digest of ['a', 'A'.repeat(64), 'g'.repeat(64)])
      expect(() => {
        operation('restore-1', digest);
      }).toThrow();
    expect(() => {
      operation('');
    }).toThrow();
    expect(execute('SELECT * FROM shared_people_restore_operation')).toEqual([]);
  });

  it('rejects duplicate consent and foreign or absent parents', () => {
    operation();
    approval();
    expect(() => {
      approval('approval-2');
    }).toThrow();
    expect(() => {
      approval('approval-3', 'org-missing');
    }).toThrow();
    expect(() => {
      approval('approval-4', 'org-b', 'restore-missing');
    }).toThrow();
    expect(execute('SELECT id FROM shared_people_restore_approval')).toEqual([
      { id: 'approval-1' },
    ]);
  });

  it('refuses issuance before organization activation on the writer', async () => {
    execute(
      "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'ada', 'super_admin', 1)",
    );
    const connection = openConnection(path);
    try {
      expect(
        await new SharedPeopleRestoreApprovalRepository(connection.db, OPEN).approve(
          'org-a',
          'restore-1',
          'a'.repeat(64),
          'approval-1',
          { by: 'ada', at: 10 },
        ),
      ).toEqual({ ok: false, refusal: 'forbidden' });
      expect(execute('SELECT * FROM shared_people_restore_operation')).toEqual([]);
    } finally {
      connection.close();
    }
  });

  it('holds the immediate SQLite writer before reading current membership', async () => {
    execute(
      "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'ada', 'super_admin', 1)",
    );
    execute("UPDATE organization_activation SET state = 'activated', activated_at = 1");
    const rival = openDatabase(path);
    rival.run('PRAGMA busy_timeout = 0');
    let observed = false;
    const connection = openConnection(path, {
      logQuery(query) {
        if (!query.includes('from "organization_membership"')) return;
        observed = true;
        expect(() =>
          rival.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = 'ada'"),
        ).toThrow('database is locked');
      },
    });
    try {
      expect(
        await new SharedPeopleRestoreApprovalRepository(connection.db, OPEN).approve(
          'org-a',
          'restore-1',
          'a'.repeat(64),
          'approval-1',
          { by: 'ada', at: 10 },
        ),
      ).toMatchObject({ ok: true, approval: { actorId: 'ada' } });
      expect(observed).toBe(true);
    } finally {
      connection.close();
      rival.close();
    }
  });

  it('rolls back an empty schema', () => {
    rollbackTo(path, MIGRATIONS_FOLDER, PREVIOUS);
    expect(
      execute("SELECT name FROM sqlite_master WHERE name LIKE 'shared_people_restore_%'"),
    ).toEqual([]);
  });

  for (const withApproval of [false, true])
    it(`preserves evidence and ledger on rollback with approval=${String(withApproval)}`, () => {
      operation();
      if (withApproval) approval();
      const ledger = execute('SELECT * FROM __drizzle_migrations');
      const operations = execute('SELECT * FROM shared_people_restore_operation');
      const approvals = execute('SELECT * FROM shared_people_restore_approval');
      expect(() => rollbackTo(path, MIGRATIONS_FOLDER, PREVIOUS)).toThrow(
        'shared people restore evidence is recorded',
      );
      expect(execute('SELECT * FROM __drizzle_migrations')).toEqual(ledger);
      expect(execute('SELECT * FROM shared_people_restore_operation')).toEqual(operations);
      expect(execute('SELECT * FROM shared_people_restore_approval')).toEqual(approvals);
    });
});
