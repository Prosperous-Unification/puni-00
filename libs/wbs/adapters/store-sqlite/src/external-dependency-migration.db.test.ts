import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StoredTypedDependency } from '@wbs/core';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openConnection, openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';
import { SavedPlanCaptureRepository } from './saved-plan-capture';
import { TypedDependencyRepository } from './typed-dependency';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION = '20261022211000_add_external_dependencies';
let dir: string;
let path: string;
const stamp = { at: 2, by: 'u' };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-external-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  // Historical storage contract predates semantic admission; never used by application boot.
  rollbackTo(path, FOLDER, MIGRATION);
  const sqlite = openDatabase(path);
  try {
    sqlite.run(
      "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
    );
    sqlite.run(
      "INSERT INTO organization (id,name,created_at) VALUES ('org','Org',1),('foreign','Foreign',1)",
    );
    for (const id of ['a', 'b', 'c']) {
      sqlite.run("INSERT INTO project(id,name,owner_id,created_at) VALUES (?,?, 'u',1)", [id, id]);
      sqlite.run('INSERT INTO project_organization(resource_id,organization_id) VALUES (?,?)', [
        id,
        id === 'c' ? 'foreign' : 'org',
      ]);
      sqlite.run('INSERT INTO work_item(id,project_id,position,name,revision) VALUES (?,?,1,?,0)', [
        id,
        id,
        id,
      ]);
      sqlite.run('INSERT INTO step(id,project_id,name,code) VALUES (?,?,?,?)', [id, id, id, id]);
    }
    sqlite.run(
      "INSERT INTO work_item(id,project_id,position,name,revision) VALUES ('b2','b',2,'B2',0)",
    );
  } finally {
    sqlite.close();
  }
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function link(id = 'external'): StoredTypedDependency {
  return {
    id,
    projectId: 'b',
    predecessor: { projectId: 'a', scope: 'whole', workItemId: 'a' },
    successor: { projectId: 'b', scope: 'whole', workItemId: 'b' },
    type: 'FS',
  };
}
async function rejection(write: Promise<unknown>): Promise<string> {
  try {
    await write;
    return '(resolved)';
  } catch (cause) {
    return String(cause);
  }
}
function repository(): TypedDependencyRepository {
  return new TypedDependencyRepository(openDrizzle(path), OPEN);
}
function stored(sql: string): unknown[] {
  const sqlite = openDatabase(path);
  try {
    return sqlite.query(sql).all();
  } finally {
    sqlite.close();
  }
}

it('combines local and external rows and lists both incident directions once', async () => {
  const repo = repository();
  const local = {
    ...link('local'),
    predecessor: { projectId: 'b', scope: 'whole' as const, workItemId: 'b2' },
  };
  await repo.add(local, stamp);
  await repo.add(link(), stamp);
  expect(await repo.listByProject('b')).toEqual([link(), local]);
  expect(await repo.listByProject('a')).toEqual([]);
  expect(await repo.listIncident(['b', 'a', 'b'])).toEqual([link(), local]);
  expect(await repo.listIncident(['a'])).toEqual([link()]);
  expect(await repo.listIncident([])).toEqual([]);
});

it('representation move preserves identity, creation audit and endpoint revisions in both directions', async () => {
  const repo = repository();
  const local = {
    ...link(),
    predecessor: { projectId: 'b', scope: 'whole' as const, workItemId: 'b2' },
  };
  await repo.add(local, stamp);
  const sqlite = openDatabase(path);
  try {
    sqlite.run("UPDATE typed_dependency SET created_at=NULL,created_by=NULL WHERE id='external'");
  } finally {
    sqlite.close();
  }
  await repo.update(link(), { ...stamp, at: 3 });
  expect(stored('SELECT id,created_at,created_by,updated_at FROM external_dependency')).toEqual([
    { id: 'external', created_at: null, created_by: null, updated_at: 3 },
  ]);
  expect(stored('SELECT id FROM typed_dependency')).toEqual([]);
  expect(
    stored("SELECT id,revision FROM work_item WHERE id IN ('a','b','b2') ORDER BY id"),
  ).toEqual([
    { id: 'a', revision: 1 },
    { id: 'b', revision: 2 },
    { id: 'b2', revision: 2 },
  ]);
  await repo.update(local, { ...stamp, at: 4 });
  expect(stored('SELECT id FROM external_dependency')).toEqual([]);
  expect(stored('SELECT id,created_at,created_by,updated_at FROM typed_dependency')).toEqual([
    { id: 'external', created_at: null, created_by: null, updated_at: 4 },
  ]);
  expect(
    stored("SELECT id,revision FROM work_item WHERE id IN ('a','b','b2') ORDER BY id"),
  ).toEqual([
    { id: 'a', revision: 2 },
    { id: 'b', revision: 3 },
    { id: 'b2', revision: 3 },
  ]);
});

it('rejects cross-project mismatched endpoints and foreign organizations', async () => {
  const repo = repository();
  expect(await rejection(repo.add({ ...link(), projectId: 'a' }, stamp))).toContain('successor');
  expect(
    await rejection(
      repo.add({ ...link(), predecessor: { ...link().predecessor, projectId: 'b' } }, stamp),
    ),
  ).toContain('outside project');
  expect(
    await rejection(
      repo.add(
        { ...link(), predecessor: { projectId: 'a', scope: 'node', workItemId: 'a', stepId: 'b' } },
        stamp,
      ),
    ),
  ).toContain('outside project');
  expect(
    await rejection(
      repo.add(
        { ...link(), predecessor: { projectId: 'c', scope: 'whole', workItemId: 'c' } },
        stamp,
      ),
    ),
  ).toContain('organization');
  expect(await repo.listByProject('b')).toEqual([]);
});

it('protects surviving external successors and permits deleting both ends', async () => {
  const repo = repository();
  await repo.add(link(), stamp);
  expect(await rejection(repo.removeAllFor(['a'], stamp))).toContain('surviving successor');
  expect(await repo.listByProject('b')).toEqual([link()]);
  expect(await repo.removeAllFor(['a', 'b'], stamp)).toEqual([link()]);
});

it('project persistence refuses a referenced predecessor and permits its deletion after link removal', async () => {
  const repo = repository();
  await repo.add(link(), stamp);
  const before = {
    project: stored('SELECT id FROM project ORDER BY id'),
    links: stored('SELECT id FROM external_dependency ORDER BY id'),
    rows: stored('SELECT id,revision FROM work_item ORDER BY id'),
  };
  const sqlite = openDatabase(path);
  try {
    expect(() => sqlite.run("DELETE FROM project WHERE id='a'")).toThrow();
  } finally {
    sqlite.close();
  }
  expect(stored('SELECT id FROM project ORDER BY id')).toEqual(before.project);
  expect(stored('SELECT id FROM external_dependency ORDER BY id')).toEqual(before.links);
  expect(stored('SELECT id,revision FROM work_item ORDER BY id')).toEqual(before.rows);
  const predecessor = openDatabase(path);
  try {
    expect(() => predecessor.run("DELETE FROM work_item WHERE id='a'")).toThrow();
  } finally {
    predecessor.close();
  }
  expect(stored('SELECT id,revision FROM work_item ORDER BY id')).toEqual(before.rows);
  await repo.remove('external', { ...stamp, at: 3 });
  const unlinked = openDatabase(path);
  try {
    unlinked.run("DELETE FROM step WHERE project_id='a'");
    unlinked.run("DELETE FROM work_item WHERE id='a'");
    unlinked.run("DELETE FROM project WHERE id='a'");
  } finally {
    unlinked.close();
  }
  expect(stored("SELECT id FROM project WHERE id='a'")).toEqual([]);
});

it('refuses missing work-item and organization evidence on reads', async () => {
  const repo = repository();
  await repo.add(link(), stamp);
  const sqlite = openDatabase(path);
  try {
    sqlite.run('PRAGMA foreign_keys=OFF');
    sqlite.run('DROP TRIGGER project_organization_frozen_delete');
    sqlite.run("DELETE FROM project_organization WHERE resource_id='a'");
    expect(await rejection(repo.listByProject('b'))).toContain('organization');
    sqlite.run("INSERT INTO project_organization(resource_id,organization_id) VALUES ('a','org')");
    sqlite.run("DELETE FROM work_item WHERE id='a'");
    expect(await rejection(repo.listIncident(['a']))).toContain('outside project');
  } finally {
    sqlite.close();
  }
});

it('down refuses external rows and preserves local rows and their audit when empty', async () => {
  const repo = repository();
  const local = {
    ...link('local'),
    predecessor: { projectId: 'b', scope: 'whole' as const, workItemId: 'b2' },
  };
  await repo.add(local, stamp);
  await repo.add(link(), stamp);
  const baseline = readMigrationFolders(FOLDER)
    .filter(({ name }) => name < MIGRATION)
    .at(-1);
  if (baseline === undefined) throw new Error('missing migration baseline');
  const ledger = stored('SELECT * FROM __drizzle_migrations ORDER BY id');
  expect(() => rollbackTo(path, FOLDER, baseline.name)).toThrow('external dependencies remain');
  expect(stored('SELECT * FROM __drizzle_migrations ORDER BY id')).toEqual(ledger);
  await repo.remove('external', stamp);
  const before = stored('SELECT * FROM typed_dependency');
  expect(rollbackTo(path, FOLDER, baseline.name)).toEqual([MIGRATION]);
  expect(stored('SELECT * FROM typed_dependency')).toEqual(before);
  runMigrations(path, FOLDER);
  // Historical storage contract predates semantic admission; never used by application boot.
  rollbackTo(path, FOLDER, MIGRATION);
  expect(stored('SELECT * FROM typed_dependency')).toEqual(before);
  expect(await repo.listByProject('b')).toEqual([local]);
});

it('refuses external rows in the historical single-project capture', async () => {
  await repository().add(link(), stamp);
  const capture = new SavedPlanCaptureRepository({ openConnection: () => openConnection(path) });
  expect(await rejection(capture.readPlanInput('b'))).toContain('external');
  expect(await rejection(capture.readPlanInput('a'))).toContain('external');
});

it('duplicates refuse across representations on insert and relevant update in both tables', () => {
  const sqlite = openDatabase(path);
  const local = (id: string, predecessor = 'a', successor = 'b') =>
    sqlite.run(
      "INSERT INTO typed_dependency(id,project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,'b',?,'whole',?,'whole','FS')",
      [id, predecessor, successor],
    );
  const external = (id: string, successor = 'b') =>
    sqlite.run(
      "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES (?,'org','a','b','a','whole',?,'whole','FS')",
      [id, successor],
    );
  try {
    for (const target of ['typed_dependency', 'external_dependency']) {
      for (const operation of ['insert', 'update']) {
        for (const kind of ['identity', 'endpoints']) {
          sqlite.run('DELETE FROM typed_dependency');
          sqlite.run('DELETE FROM external_dependency');
          const writesExternal = target === 'external_dependency';
          if (writesExternal) local('source');
          else external('source');
          if (operation === 'update') {
            if (writesExternal) external('destination', 'b2');
            else local('destination', 'b2');
          }
          const write = () => {
            if (operation === 'insert') {
              if (writesExternal)
                external(
                  kind === 'identity' ? 'source' : 'destination',
                  kind === 'identity' ? 'b2' : 'b',
                );
              else
                local(
                  kind === 'identity' ? 'source' : 'destination',
                  kind === 'identity' ? 'b2' : 'a',
                );
            } else {
              const assignment =
                kind === 'identity'
                  ? "id='source'"
                  : writesExternal
                    ? "successor_work_item_id='b'"
                    : "predecessor_work_item_id='a'";
              sqlite.run(`UPDATE ${target} SET ${assignment} WHERE id='destination'`);
            }
          };
          expect(write, `${target} ${operation} ${kind}`).toThrow(
            `duplicate unified dependency ${kind}`,
          );
        }
      }
    }
  } finally {
    sqlite.close();
  }
});

it('enforces endpoint and organization foreign keys and referenced ownership updates', async () => {
  await repository().add(link(), stamp);
  const sqlite = openDatabase(path);
  try {
    for (const sql of [
      "DELETE FROM work_item WHERE id='a'",
      "DELETE FROM work_item WHERE id='b'",
      "UPDATE work_item SET project_id='b' WHERE id='a'",
      "UPDATE external_dependency SET predecessor_project_id='c',predecessor_work_item_id='c'",
      "UPDATE external_dependency SET successor_project_id='c',successor_work_item_id='c'",
      "UPDATE external_dependency SET predecessor_work_item_id='b2'",
      "UPDATE external_dependency SET successor_work_item_id='a'",
      "UPDATE external_dependency SET predecessor_scope='node',predecessor_step_id='b'",
      "UPDATE external_dependency SET successor_scope='node',successor_step_id='a'",
    ])
      expect(() => sqlite.run(sql), sql).toThrow('FOREIGN KEY constraint failed');
    sqlite.run(
      "UPDATE external_dependency SET predecessor_scope='node',predecessor_step_id='a',successor_scope='node',successor_step_id='b'",
    );
    for (const sql of [
      "DELETE FROM step WHERE id='a'",
      "DELETE FROM step WHERE id='b'",
      "UPDATE step SET project_id='b' WHERE id='a'",
    ])
      expect(() => sqlite.run(sql), sql).toThrow('FOREIGN KEY constraint failed');
  } finally {
    sqlite.close();
  }
});

it('enforces external discriminants, step nullability, distinct projects, identity and duplicate keys', async () => {
  await repository().add(link(), stamp);
  const sqlite = openDatabase(path);
  try {
    for (const assignment of [
      "predecessor_scope='other',predecessor_step_id='a'",
      "successor_scope='other',successor_step_id='b'",
      "type='SF'",
      "predecessor_step_id='a'",
      "successor_step_id='b'",
      "predecessor_scope='node'",
      "successor_scope='node'",
      "predecessor_project_id='b',predecessor_work_item_id='b2'",
    ])
      expect(() => sqlite.run(`UPDATE external_dependency SET ${assignment}`), assignment).toThrow(
        'CHECK constraint failed',
      );
    expect(() => sqlite.run('UPDATE external_dependency SET id=NULL')).toThrow(
      'NOT NULL constraint failed',
    );
    expect(() =>
      sqlite.run(
        "INSERT INTO external_dependency SELECT 'duplicate',organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type,created_at,updated_at,created_by FROM external_dependency",
      ),
    ).toThrow('UNIQUE constraint failed');
  } finally {
    sqlite.close();
  }
});

it('rolls back a representation move when its destination insert or revision update fails', async () => {
  const repo = repository();
  const local = {
    ...link(),
    predecessor: { projectId: 'b', scope: 'whole' as const, workItemId: 'b2' },
  };
  await repo.add(local, stamp);
  const before = stored('SELECT * FROM typed_dependency');
  const revisions = stored('SELECT id,revision FROM work_item ORDER BY id');
  const sqlite = openDatabase(path);
  try {
    sqlite.run(
      "CREATE TRIGGER fail_destination BEFORE INSERT ON external_dependency BEGIN SELECT RAISE(ABORT,'injected destination failure'); END",
    );
    expect(await rejection(repo.update(link(), stamp))).toContain('Failed query');
    expect(stored('SELECT * FROM typed_dependency')).toEqual(before);
    expect(stored('SELECT * FROM external_dependency')).toEqual([]);
    expect(stored('SELECT id,revision FROM work_item ORDER BY id')).toEqual(revisions);
    sqlite.run('DROP TRIGGER fail_destination');
    sqlite.run(
      "CREATE TRIGGER fail_revision BEFORE UPDATE OF revision ON work_item WHEN NEW.id='a' BEGIN SELECT RAISE(ABORT,'injected revision failure'); END",
    );
    expect(await rejection(repo.update(link(), stamp))).toContain('Failed query');
    expect(stored('SELECT * FROM typed_dependency')).toEqual(before);
    expect(stored('SELECT * FROM external_dependency')).toEqual([]);
    expect(stored('SELECT id,revision FROM work_item ORDER BY id')).toEqual(revisions);
  } finally {
    sqlite.close();
  }
});

it('keeps a coherent union while a rival commits a representation move between component reads', async () => {
  const local = {
    ...link(),
    predecessor: { projectId: 'b', scope: 'whole' as const, workItemId: 'b2' },
  };
  await repository().add(local, stamp);
  let moved = false;
  const db = openDrizzle(path, {
    logQuery(query) {
      if (moved || !query.startsWith('select') || !query.includes('from "external_dependency"'))
        return;
      moved = true;
      const sqlite = openDatabase(path);
      try {
        sqlite.transaction(() => {
          sqlite.run("DELETE FROM typed_dependency WHERE id='external'");
          sqlite.run(
            "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES ('external','org','a','b','a','whole','b','whole','FS')",
          );
        })();
      } finally {
        sqlite.close();
      }
    },
  });
  const repo = new TypedDependencyRepository(db, OPEN);
  expect(await repo.listByProject('b')).toEqual([local]);
  expect(moved).toBe(true);
  expect(await repository().listByProject('b')).toEqual([link()]);
});

it('refuses a duplicated physical identity instead of deduplicating corrupt rows', async () => {
  const local = {
    ...link(),
    predecessor: { projectId: 'b', scope: 'whole' as const, workItemId: 'b2' },
  };
  await repository().add(local, stamp);
  const sqlite = openDatabase(path);
  try {
    sqlite.run('DROP TRIGGER external_dependency_cross_identity_insert');
    sqlite.run(
      "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES ('external','org','a','b','a','whole','b','whole','FS')",
    );
  } finally {
    sqlite.close();
  }
  expect(await rejection(repository().listByProject('b'))).toContain(
    'duplicate unified dependency',
  );
  expect(await rejection(repository().update(link(), stamp))).toContain(
    'duplicate unified dependency',
  );
});

it('refuses missing steps and mismatched recorded organization evidence on reads', async () => {
  const repo = repository();
  await repo.add(
    { ...link(), predecessor: { projectId: 'a', scope: 'node', workItemId: 'a', stepId: 'a' } },
    stamp,
  );
  const sqlite = openDatabase(path);
  try {
    sqlite.run('PRAGMA foreign_keys=OFF');
    sqlite.run("UPDATE external_dependency SET organization_id='foreign'");
    expect(await rejection(repo.listByProject('b'))).toContain('inconsistent organization');
    sqlite.run("UPDATE external_dependency SET organization_id='org'");
    sqlite.run("DELETE FROM step WHERE id='a'");
    expect(await rejection(repo.listIncident(['b']))).toContain('step a outside project a');
  } finally {
    sqlite.close();
  }
});

it('refuses duplicate trusted endpoint keys even when physical uniqueness is corrupted', async () => {
  const local = {
    ...link('first'),
    predecessor: { projectId: 'b', scope: 'whole' as const, workItemId: 'b2' },
  };
  await repository().add(local, stamp);
  const sqlite = openDatabase(path);
  try {
    sqlite.run('DROP INDEX typed_dependency_endpoints');
    sqlite.run(
      "INSERT INTO typed_dependency SELECT 'second',project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type,created_at,updated_at,created_by FROM typed_dependency",
    );
  } finally {
    sqlite.close();
  }
  expect(await rejection(repository().listIncident(['b']))).toContain(
    'duplicate unified dependency',
  );
});

it('refuses external writes without real organization ownership on either project', async () => {
  const sqlite = openDatabase(path);
  try {
    sqlite.run('DROP TRIGGER project_organization_frozen_delete');
    sqlite.run("DELETE FROM project_organization WHERE resource_id='a'");
    expect(await rejection(repository().add(link(), stamp))).toContain('organization');
    sqlite.run("INSERT INTO project_organization(resource_id,organization_id) VALUES ('a','org')");
    sqlite.run("DELETE FROM project_organization WHERE resource_id='b'");
    expect(await rejection(repository().add(link(), stamp))).toContain('organization');
  } finally {
    sqlite.close();
  }
});

it('restricts deletion and reassignment of external project ownership rows', async () => {
  await repository().add(link(), stamp);
  const sqlite = openDatabase(path);
  try {
    sqlite.run('DROP TRIGGER project_organization_frozen_delete');
    sqlite.run('DROP TRIGGER project_organization_frozen_update');
    for (const projectId of ['a', 'b']) {
      expect(() =>
        sqlite.run('DELETE FROM project_organization WHERE resource_id=?', [projectId]),
      ).toThrow('FOREIGN KEY constraint failed');
      expect(() =>
        sqlite.run(
          "UPDATE project_organization SET organization_id='foreign' WHERE resource_id=?",
          [projectId],
        ),
      ).toThrow('FOREIGN KEY constraint failed');
    }
  } finally {
    sqlite.close();
  }
});

it('adds the complete incident index set without changing local rows', () => {
  const names = stored("SELECT name FROM sqlite_master WHERE type='index'").map((row) => {
    if (typeof row !== 'object' || row === null || !('name' in row))
      throw new Error('missing index name');
    return row.name;
  });
  for (const direction of ['predecessor', 'successor']) {
    for (const field of ['project', 'work_item', 'step'])
      expect(names).toContain(`external_dependency_by_${direction}_${field}`);
  }
  expect(names).toContain('work_item_id_project');
  expect(names).toContain('step_id_project');
});

it.each(['owned-a', 'owned-b', 'incident-a', 'remove-a', 'remove-b2'] as const)(
  'refuses a physical identity hidden by the %s filter before any mutation',
  async (query) => {
    const local = {
      ...link('same-id'),
      predecessor: { projectId: 'b', scope: 'whole' as const, workItemId: 'b2' },
    };
    await repository().add(local, stamp);
    const sqlite = openDatabase(path);
    try {
      sqlite.run('DROP TRIGGER external_dependency_cross_identity_insert');
      sqlite.run(
        "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES ('same-id','org','b','a','b','whole','a','whole','FS')",
      );
    } finally {
      sqlite.close();
    }
    const localBefore = stored('SELECT * FROM typed_dependency ORDER BY id');
    const externalBefore = stored('SELECT * FROM external_dependency ORDER BY id');
    const revisionsBefore = stored('SELECT id,revision,updated_at FROM work_item ORDER BY id');
    const repo = repository();
    const read =
      query === 'owned-a'
        ? repo.listByProject('a')
        : query === 'owned-b'
          ? repo.listByProject('b')
          : query === 'incident-a'
            ? repo.listIncident(['a'])
            : repo.removeAllFor([query === 'remove-a' ? 'a' : 'b2'], { ...stamp, at: 3 });
    expect(await rejection(read)).toContain('duplicate unified dependency same-id');
    expect(stored('SELECT * FROM typed_dependency ORDER BY id')).toEqual(localBefore);
    expect(stored('SELECT * FROM external_dependency ORDER BY id')).toEqual(externalBefore);
    expect(stored('SELECT id,revision,updated_at FROM work_item ORDER BY id')).toEqual(
      revisionsBefore,
    );
  },
);

it('incident detach and restore preserve null creation audit and bump the completed endpoint union once', async () => {
  const repo = repository();
  const original: StoredTypedDependency = {
    ...link(),
    predecessor: { projectId: 'a', workItemId: 'a', scope: 'node', stepId: 'a' },
  };
  await repo.add(original, stamp);
  const sqlite = openDatabase(path);
  try {
    sqlite.run('UPDATE external_dependency SET created_at=NULL,created_by=NULL');
    const before = stored('SELECT id,revision FROM work_item ORDER BY id');
    const receipt = await repo.incidents.capture(original.id);
    expect(receipt).toEqual({ dependency: original, createdAt: null, createdBy: null });
    await repo.incidents.detach(receipt);
    expect(stored('SELECT id,revision FROM work_item ORDER BY id')).toEqual(before);
    sqlite.run(
      "INSERT INTO work_item(id,project_id,parent_id,position,name,revision) VALUES ('child','a','a',1,'child',0)",
    );
    const mapped = { ...original, predecessor: { ...original.predecessor, workItemId: 'child' } };
    await repo.incidents.restore({ ...receipt, dependency: mapped }, original, { at: 4, by: 'u' });
    expect(await repo.listIncident(['a'])).toEqual([mapped]);
    expect(stored('SELECT created_at,created_by,updated_at FROM external_dependency')).toEqual([
      { created_at: null, created_by: null, updated_at: 4 },
    ]);
    expect(stored('SELECT id,revision FROM work_item ORDER BY id')).toEqual([
      { id: 'a', revision: 2 },
      { id: 'b', revision: 2 },
      { id: 'b2', revision: 0 },
      { id: 'c', revision: 0 },
      { id: 'child', revision: 1 },
    ]);
    const inverse = await repo.incidents.capture(original.id);
    await repo.incidents.detach(inverse);
    sqlite.run("DELETE FROM work_item WHERE id='child'");
    await repo.incidents.restore(receipt, mapped, { at: 5, by: 'u' });
    expect(await repo.listIncident(['a'])).toEqual([original]);
    expect(stored('SELECT created_at,created_by,updated_at FROM external_dependency')).toEqual([
      { created_at: null, created_by: null, updated_at: 5 },
    ]);
  } finally {
    sqlite.close();
  }
});

it('incident detach refuses changed relationship evidence before deleting it', async () => {
  const repo = repository();
  await repo.add(link(), stamp);
  const receipt = await repo.incidents.capture('external');
  const sqlite = openDatabase(path);
  try {
    sqlite.run("UPDATE external_dependency SET type='SS'");
  } finally {
    sqlite.close();
  }
  const before = stored('SELECT * FROM external_dependency');
  expect(await rejection(repo.incidents.detach(receipt))).toContain('incident receipt changed');
  expect(stored('SELECT * FROM external_dependency')).toEqual(before);
});

for (const fault of ['identity', 'owner'] as const)
  it(`incident restore refuses changing ${fault} before writing any row`, async () => {
    const repo = repository();
    const original = link();
    await repo.add(original, stamp);
    const receipt = await repo.incidents.capture(original.id);
    await repo.incidents.detach(receipt);
    const dependency =
      fault === 'identity'
        ? { ...original, id: 'replacement' }
        : {
            ...original,
            projectId: 'a',
            predecessor: original.successor,
            successor: original.predecessor,
          };
    const before = stored('SELECT id,revision FROM work_item ORDER BY id');
    expect(
      await rejection(
        repo.incidents.restore({ ...receipt, dependency }, original, { at: 5, by: 'u' }),
      ),
    ).toContain('incident restoration cannot change identity or owner');
    expect(stored('SELECT * FROM external_dependency')).toEqual([]);
    expect(stored('SELECT id,revision FROM work_item ORDER BY id')).toEqual(before);
  });

it('incident restore refuses a reused physical identity before writing revisions', async () => {
  const repo = repository();
  const original = link();
  await repo.add(original, stamp);
  const receipt = await repo.incidents.capture(original.id);
  await repo.incidents.detach(receipt);
  await repo.add({ ...original, type: 'SS' }, { at: 3, by: 'u' });
  const before = stored('SELECT * FROM external_dependency');
  const revisions = stored('SELECT id,revision FROM work_item ORDER BY id');
  expect(await rejection(repo.incidents.restore(receipt, original, { at: 4, by: 'u' }))).toContain(
    'incident dependency external already exists',
  );
  expect(stored('SELECT * FROM external_dependency')).toEqual(before);
  expect(stored('SELECT id,revision FROM work_item ORDER BY id')).toEqual(revisions);
});
