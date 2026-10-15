import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { StepBlockageInactive } from '@wbs/core';
import { afterEach, beforeEach, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openConnection, openDatabase, SQLiteError } from './db';
import { OPEN } from './gate';
import { probeSchema } from './health-probe';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { openSqliteSource } from './source';
import { StepBlockageRepository } from './step-blockage';
import {
  readStepBlockageActivation,
  translateStepBlockageFailure,
} from './step-blockage-activation';
import { activateTestStepBlockages } from './testing/step-blockage-activation';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string;
let path: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-blockage-admission-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  const sqlite = openDatabase(path);
  sqlite.run("INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)");
  sqlite.run(
    "INSERT INTO project (id,name,owner_id,revision,created_at) VALUES ('p','Plan','u',0,1)",
  );
  sqlite.run("INSERT INTO step (id,project_id,name,position) VALUES ('dev','p','Dev',1)");
  sqlite.run(
    "INSERT INTO work_item (id,project_id,name,position,revision) VALUES ('a','p','A',1,0)",
  );
  sqlite.close();
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it('starts disabled and refuses an independent writer insert', () => {
  const sqlite = openDatabase(path);
  try {
    expect(() =>
      sqlite.run(
        "INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES ('a','dev',1)",
      ),
    ).toThrow('step_blockage_inactive');
    expect(sqlite.query('SELECT * FROM step_blockage').all()).toEqual([]);
  } finally {
    sqlite.close();
  }
});

it('validates disabled readiness, refuses missing markers and trigger omissions', () => {
  const connection = openConnection(path);
  try {
    expect(readStepBlockageActivation(connection.db)).toBe('DISABLED');
    connection.db.run('DELETE FROM step_blockage_activation');
    expect(() => readStepBlockageActivation(connection.db)).toThrow(
      'invalid step blockage activation marker',
    );
    connection.db.run("INSERT INTO step_blockage_activation VALUES (1,'DISABLED')");
    connection.db.run('DROP TRIGGER step_blockage_admit_update');
    expect(() => readStepBlockageActivation(connection.db)).toThrow(
      'invalid step blockage activation triggers',
    );
  } finally {
    connection.close();
  }
});

it('translates only the exact native sentinel and Drizzle cause', () => {
  const connection = openConnection(path);
  try {
    const repository = new StepBlockageRepository(connection.db, OPEN);
    expect(
      repository.set({ workItemId: 'a', stepId: 'dev', blockedAt: 1 }, { at: 1, by: 'u' }),
    ).rejects.toBeInstanceOf(StepBlockageInactive);
    const impostor = Object.assign(new Error('step_blockage_inactive'), {
      code: 'SQLITE_CONSTRAINT_TRIGGER',
    });
    expect(translateStepBlockageFailure(impostor)).toBe(impostor);
    const ordinary = new Error('step_blockage_inactive');
    expect(translateStepBlockageFailure(ordinary)).toBe(ordinary);
    const unrelated = new Error('unexpected SQL');
    expect(translateStepBlockageFailure(unrelated)).toBe(unrelated);
  } finally {
    connection.close();
  }
});

for (const statement of [
  "UPDATE step_blockage SET blocked_at=2 WHERE work_item_id='a'",
  "DELETE FROM step_blockage WHERE work_item_id='a'",
  "DELETE FROM work_item WHERE id='a'",
  "DELETE FROM project WHERE id='p'",
]) {
  it(`refuses independent disabled writer: ${statement}`, () => {
    activateTestStepBlockages(path);
    const seed = openDatabase(path);
    seed.run("INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES ('a','dev',1)");
    seed.run("UPDATE step_blockage_activation SET state='DISABLED'");
    seed.close();
    const writer = openDatabase(path);
    try {
      expect(() => writer.run(statement)).toThrow(
        statement.includes('DELETE FROM project')
          ? 'FOREIGN KEY constraint failed'
          : 'step_blockage_inactive',
      );
      expect(
        writer.query('SELECT work_item_id,step_id,blocked_at FROM step_blockage').all(),
      ).toEqual([{ work_item_id: 'a', step_id: 'dev', blocked_at: 1 }]);
      expect(writer.query('SELECT id FROM work_item').all()).toEqual([{ id: 'a' }]);
    } finally {
      writer.close();
    }
  });
}

for (const fault of ['absent', 'duplicate', 'malformed', 'wrong-id'] as const) {
  it(`refuses ${fault} activation authority at readiness`, () => {
    const connection = openConnection(path);
    try {
      connection.db.run('DROP TABLE step_blockage_activation');
      connection.db.run('CREATE TABLE step_blockage_activation (id,state)');
      if (fault !== 'absent')
        connection.db.run("INSERT INTO step_blockage_activation VALUES (1,'ENABLED')");
      if (fault === 'duplicate')
        connection.db.run("INSERT INTO step_blockage_activation VALUES (1,'ENABLED')");
      if (fault === 'malformed')
        connection.db.run("UPDATE step_blockage_activation SET state='invalid'");
      if (fault === 'wrong-id') connection.db.run('UPDATE step_blockage_activation SET id=2');
      expect(() => probeSchema(connection.db)).toThrow('invalid step blockage activation marker');
      expect(() => {
        try {
          connection.db.run(
            "INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES ('a','dev',1)",
          );
        } catch (failure) {
          throw translateStepBlockageFailure(failure);
        }
      }).toThrow('step_blockage_inactive');
    } finally {
      connection.close();
    }
  });
}

for (const action of ['insert', 'update', 'delete']) {
  it(`refuses missing ${action} trigger at readiness`, () => {
    const connection = openConnection(path);
    try {
      connection.db.run(`DROP TRIGGER step_blockage_admit_${action}`);
      expect(() => probeSchema(connection.db)).toThrow('invalid step blockage activation triggers');
    } finally {
      connection.close();
    }
  });
}

it('refuses a changed trigger definition at readiness', () => {
  const connection = openConnection(path);
  try {
    connection.db.run('DROP TRIGGER step_blockage_admit_insert');
    connection.db.run(
      'CREATE TRIGGER step_blockage_admit_insert BEFORE INSERT ON step_blockage BEGIN SELECT 1; END',
    );
    expect(() => probeSchema(connection.db)).toThrow('invalid step blockage activation triggers');
  } finally {
    connection.close();
  }
});

it('refuses the wrong migration and unreadable connection at readiness', () => {
  const connection = openConnection(path);
  connection.db.run(
    "UPDATE __drizzle_migrations SET name='wrong' WHERE name='20261014140000_add_step_blockage_activation'",
  );
  expect(() => probeSchema(connection.db)).toThrow('missing step blockage activation migration');
  connection.close();
  expect(() => probeSchema(connection.db)).toThrow();
});

it('keeps writer admission disabled across migration restart', () => {
  runMigrations(path, FOLDER);
  const connection = openConnection(path);
  try {
    expect(readStepBlockageActivation(connection.db)).toBe('DISABLED');
  } finally {
    connection.close();
  }
});

it('rolls back earlier writes before mapping an inactive writer through the production UoW', async () => {
  const source = openSqliteSource({ dbPath: path });
  try {
    expect(
      source.uow.run(async ({ stores }) => {
        source.db.run("UPDATE project SET name='changed',revision=revision+1 WHERE id='p'");
        await stores.blockages.set(
          { workItemId: 'a', stepId: 'dev', blockedAt: 1 },
          { at: 1, by: 'u' },
        );
        return { commit: true, value: 'committed' };
      }),
    ).rejects.toBeInstanceOf(StepBlockageInactive);
    expect(
      source.db.get<{ name: string; revision: number }>(
        "SELECT name,revision FROM project WHERE id='p'",
      ),
    ).toEqual({ name: 'Plan', revision: 0 });
    expect(await source.stores.blockages.listByProject('p')).toEqual([]);
  } finally {
    await source.close();
  }
});

for (const direction of ['forward', 'inverse', 'preconditions'] as const) {
  it(`refuses empty nested structural ${direction} replay at cursor flip and rolls back its writes`, async () => {
    const source = openSqliteSource({ dbPath: path });
    try {
      const payload =
        direction === 'forward'
          ? { do: 'batch', steps: [{ do: 'restore_subtree', deletionState: { blockages: [] } }] }
          : { do: 'patch' };
      const inverse =
        direction === 'inverse'
          ? { do: 'batch', steps: [{ do: 'move', expectedProgress: [] }] }
          : { do: 'patch' };
      const preconditions = direction === 'preconditions' ? { moveProgress: {} } : {};
      source.db
        .run(sql`INSERT INTO command_journal (id,project_id,user_id,seq,kind,payload,inverse,preconditions,undone,created_at)
        VALUES ('j','p','u',1,'deleteWorkItem',${JSON.stringify(payload)},${JSON.stringify(inverse)},${JSON.stringify(preconditions)},0,1)`);
      const before = source.db.all('SELECT * FROM command_journal');
      for (const undone of [true, false]) {
        expect(
          source.uow.run(async ({ stores }) => {
            source.db.run("UPDATE project SET name='changed',revision=revision+1 WHERE id='p'");
            await stores.journal.flip('j', undone, {});
            return { commit: true, value: 'committed' };
          }),
        ).rejects.toBeInstanceOf(StepBlockageInactive);
        expect(source.db.all('SELECT * FROM command_journal')).toEqual(before);
        expect(
          source.db.get<{ name: string; revision: number }>(
            "SELECT name,revision FROM project WHERE id='p'",
          ),
        ).toEqual({ name: 'Plan', revision: 0 });
      }
    } finally {
      await source.close();
    }
  });
}

for (const retained of ['facts', 'forward-history', 'inverse-history', 'preconditions'] as const) {
  it(`refuses down migration over retained ${retained} without changing the ledger`, () => {
    rollbackTo(path, FOLDER, '20261014140000_add_step_blockage_activation');
    activateTestStepBlockages(path);
    const sqlite = openDatabase(path);
    if (retained === 'facts')
      sqlite.run(
        "INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES ('a','dev',1)",
      );
    else {
      const payload =
        retained === 'forward-history'
          ? { do: 'batch', steps: [{ do: 'restore_subtree', deletionState: { blockages: [] } }] }
          : { do: 'patch' };
      const inverse =
        retained === 'inverse-history'
          ? { do: 'batch', steps: [{ do: 'move', expectedProgress: [] }] }
          : { do: 'patch' };
      const preconditions = retained === 'preconditions' ? { moveProgress: {} } : {};
      sqlite.run(
        `INSERT INTO command_journal (id,project_id,user_id,seq,kind,payload,inverse,preconditions,undone,created_at)
        VALUES ('j','p','u',1,'deleteWorkItem',?,?,?,0,1)`,
        [JSON.stringify(payload), JSON.stringify(inverse), JSON.stringify(preconditions)],
      );
    }
    const before = sqlite.query('SELECT * FROM __drizzle_migrations ORDER BY id').all();
    sqlite.close();
    expect(() =>
      rollbackTo(path, FOLDER, '20261014130000_add_shared_people_restore_receipts'),
    ).toThrow('stopped-writer recovery integration required');
    const reopened = openDatabase(path);
    try {
      expect(reopened.query('SELECT * FROM __drizzle_migrations ORDER BY id').all()).toEqual(
        before,
      );
    } finally {
      reopened.close();
    }
  });
}

it('refuses an absent marker table and missing trigger metadata at readiness', () => {
  const connection = openConnection(path);
  try {
    connection.db.run('DROP TABLE step_blockage_activation');
    expect(() => probeSchema(connection.db)).toThrow();
  } finally {
    connection.close();
  }
});

it('maps an inactive raw owner cascade after full production UoW rollback', async () => {
  activateTestStepBlockages(path);
  const source = openSqliteSource({ dbPath: path });
  try {
    source.db.run(
      "INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES ('a','dev',1)",
    );
    source.db.run("UPDATE step_blockage_activation SET state='DISABLED'");
    expect(
      source.uow.run(() => {
        source.db.run("UPDATE project SET name='changed',revision=revision+1 WHERE id='p'");
        source.db.run("DELETE FROM work_item WHERE id='a'");
        return Promise.resolve({ commit: true, value: 'committed' });
      }),
    ).rejects.toBeInstanceOf(StepBlockageInactive);
    expect(
      source.db.get<{ name: string; revision: number }>(
        "SELECT name,revision FROM project WHERE id='p'",
      ),
    ).toEqual({ name: 'Plan', revision: 0 });
    expect(source.db.all('SELECT work_item_id,step_id,blocked_at FROM step_blockage')).toEqual([
      { work_item_id: 'a', step_id: 'dev', blocked_at: 1 },
    ]);
  } finally {
    await source.close();
  }
});

it('preserves genuine SQLite errors with another code or a nonexact sentinel message', () => {
  const sqlite = openDatabase(path);
  try {
    for (const statement of [
      'SELECT absent_column',
      "INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES ('a','dev',1)",
    ]) {
      let observed: SQLiteError | undefined;
      try {
        sqlite.run(statement);
      } catch (failure) {
        if (!(failure instanceof SQLiteError)) throw failure;
        observed = failure;
        if (statement.startsWith('SELECT')) failure.message = 'step_blockage_inactive';
        else failure.message = 'prefix step_blockage_inactive';
        expect(translateStepBlockageFailure(failure)).toBe(failure);
      }
      expect(observed).toBeInstanceOf(SQLiteError);
    }
  } finally {
    sqlite.close();
  }
});
