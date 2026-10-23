import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertStepParallelRefusal } from '@wbs/conformance';
import type { StepRemoved } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { buildStores } from './build-stores';
import { type Connection, openConnection } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { sqliteUnitOfWork } from './sqlite-unit-of-work';
import { StepRepository } from './step';
import { StepParallelRepository } from './step-parallel';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const migration = '20261015110000_add_step_node_parallelism';
const baseline = '20261015100000_add_step_blockage_activation_receipt';
/** Migrations newer than this one, which every rollback to `baseline` reverses first. */
const newer = [
  '20261023110000_key_step_measure',
  '20261023100000_add_measure',
  '20261022130100_widen_organization_audit_organization_limits',
  '20261022130000_add_organization_limits',
  '20261022120000_scope_trusted_issuer_audience',
  '20261022110100_check_machine_credential_id',
  '20261022110000_widen_organization_audit_machine_credentials',
  '20261022100000_add_machine_credential',
  '20261020130000_add_claim_occupancy',
  '20261020120000_add_resources',
  '20261019130100_add_external_identity_person',
  '20261019130000_add_person_account',
  '20261019120000_add_claim',
];
let directory: string;
let path: string;
let connection: Connection;
let store: StepParallelRepository;
const stamp = { at: 10, by: 'u' };
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'parallel-db-'));
  path = join(directory, 'plan.db');
  runMigrations(path, folder);
  connection = openConnection(path);
  connection.db.run(
    "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','u','x',1)",
  );
  connection.db.run(
    "INSERT INTO project (id,name,owner_id,revision,created_at) VALUES ('p','Plan','u',0,1),('foreign','Foreign','u',0,1)",
  );
  connection.db.run(
    "INSERT INTO step (id,project_id,name,position) VALUES ('dev','p','Dev',1),('qa','p','QA',2),('foreign','foreign','Foreign',1)",
  );
  connection.db.run(
    "INSERT INTO work_item (id,project_id,name,position,revision) VALUES ('a','p','A',1,0),('parent','p','Parent',2,0)",
  );
  connection.db.run(
    "INSERT INTO work_item (id,project_id,parent_id,name,position,revision) VALUES ('child','p','parent','Child',1,0)",
  );
  store = new StepParallelRepository(connection.db, OPEN);
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
const insert = (owner = 'a', step = 'dev', value = '2') =>
  connection.db.run(
    `INSERT INTO step_parallel(work_item_id,step_id,max_parallel) VALUES ('${owner}','${step}',${value})`,
  );
describe('sparse parallelism SQL contract', () => {
  for (const value of ['0', '1001', '1.5', 'NULL'])
    it(`SQL rejects range/type ${value}`, () => {
      expect(() => insert('a', 'dev', value)).toThrow();
    });
  it('SQL rejects duplicate pairs', () => {
    insert();
    expect(() => insert()).toThrow();
  });
  for (const [name, owner, step] of [
    ['owner reference', 'absent', 'dev'],
    ['step reference', 'a', 'absent'],
    ['project', 'a', 'foreign'],
    ['leaf', 'parent', 'dev'],
  ]) {
    it(`SQL rejects insert ${name}`, () => {
      expect(() => insert(owner, step)).toThrow();
    });
    it(`SQL rejects update ${name}`, () => {
      insert();
      expect(() =>
        connection.db.run(`UPDATE step_parallel SET work_item_id='${owner}',step_id='${step}'`),
      ).toThrow();
    });
  }
  it('retains original creation audit and updates revisions atomically', async () => {
    await store.set({ workItemId: 'a', stepId: 'dev', maxParallel: 2 }, stamp);
    await store.set({ workItemId: 'a', stepId: 'dev', maxParallel: 3 }, { at: 20, by: 'u' });
    expect(
      connection.db.get<{
        created_at: number;
        updated_at: number;
        created_by: string;
        max_parallel: number;
      }>('SELECT created_at,updated_at,created_by,max_parallel FROM step_parallel'),
    ).toEqual({ created_at: 10, updated_at: 20, created_by: 'u', max_parallel: 3 });
    expect(
      connection.db.get<{ revision: number }>("SELECT revision FROM work_item WHERE id='a'"),
    ).toEqual({ revision: 2 });
    const before = connection.db.all('SELECT * FROM step_parallel');
    connection.db.run(
      "CREATE TRIGGER fail_parallel_revision BEFORE UPDATE OF revision ON work_item BEGIN SELECT RAISE(ABORT,'injected revision failure'); END",
    );
    await assertStepParallelRefusal(
      store.set({ workItemId: 'a', stepId: 'dev', maxParallel: 4 }, stamp),
    );
    expect(connection.db.all('SELECT * FROM step_parallel')).toEqual(before);
  });
  for (const [name, fault] of [
    ['owner', "PRAGMA foreign_keys=OFF; DELETE FROM work_item WHERE id='a'"],
    ['step', "PRAGMA foreign_keys=OFF; DELETE FROM step WHERE id='dev'"],
    ['project', "UPDATE step SET project_id='foreign' WHERE id='dev'"],
    [
      'leaf',
      "INSERT INTO work_item(id,project_id,parent_id,name,position,revision) VALUES('new','p','a','New',1,0)",
    ],
    ['range', 'PRAGMA ignore_check_constraints=ON; UPDATE step_parallel SET max_parallel=1001'],
  ])
    it(`read refuses corrupt ${name} without hiding the retained row`, async () => {
      insert();
      for (const statement of fault.split(';')) connection.db.run(statement);
      expect(connection.db.all('SELECT * FROM step_parallel')).toHaveLength(1);
      await assertStepParallelRefusal(store.listByProject('p'));
      await assertStepParallelRefusal(store.listByWorkItems('p', ['a']));
    });
  it('down refuses retained facts and preserves table and applied ledger', () => {
    insert();
    const before = connection.db
      .all<{ name: string }>('SELECT * FROM __drizzle_migrations')
      .filter(({ name }) => !newer.includes(name));
    expect(() => rollbackTo(path, folder, baseline)).toThrow(/step parallelism overrides exist/);
    expect(connection.db.all('SELECT * FROM step_parallel')).toHaveLength(1);
    expect(connection.db.all('SELECT * FROM __drizzle_migrations')).toEqual(before);
  });
  it('empty down and forward preserve existing work items', () => {
    expect(rollbackTo(path, folder, baseline)).toEqual([...newer, migration]);
    expect(connection.db.get<{ count: number }>('SELECT count(*) AS count FROM work_item')).toEqual(
      { count: 3 },
    );
    runMigrations(path, folder);
    expect(connection.db.all('SELECT * FROM step_parallel')).toEqual([]);
    expect(readFileSync(join(folder, migration, 'migration.sql'), 'utf8')).toContain(
      'CREATE TABLE',
    );
  });
});

for (const [name, owner, value, message] of [
  ['owner', 'absent', 2, 'invalid work-item reference'],
  ['project', 'other', 2, 'project mismatch'],
  ['leaf', 'parent', 2, 'not a leaf'],
  ['range', 'a', 1001, 'integer from 1 to 1000'],
] as const)
  it(`removal throws on corrupt retained SQLite ${name}`, async () => {
    connection.db.run(
      "INSERT INTO work_item (id,project_id,name,position,revision) VALUES ('other','foreign','Other',1,0)",
    );
    connection.db.run('PRAGMA foreign_keys = OFF');
    connection.db.run('PRAGMA ignore_check_constraints = ON');
    connection.db.run('DROP TRIGGER step_parallel_owner_insert');
    insert(owner, 'dev', String(value));
    const before = connection.db.all('SELECT * FROM step_parallel');
    const steps = new StepRepository(connection.db, OPEN);
    await assertStepParallelRefusal(steps.remove('p', 'dev', true, stamp), message);
    expect(await steps.findById('dev')).not.toBeNull();
    expect(connection.db.all('SELECT * FROM step_parallel')).toEqual(before);
  });

for (const cascade of [false, true])
  it(`retains all SQLite state on sparse refusal and mixed rollback (cascade=${String(cascade)})`, async () => {
    const stores = buildStores(connection.db, OPEN);
    const uow = sqliteUnitOfWork(connection.db, OPEN, stores);
    connection.db.run(
      "INSERT INTO work_item (id,project_id,name,position,revision) VALUES ('foreign-owner','foreign','Other',1,0)",
    );
    await stores.stepParallels.set(
      { workItemId: 'foreign-owner', stepId: 'foreign', maxParallel: 3 },
      stamp,
    );
    await stores.stepParallels.set({ workItemId: 'a', stepId: 'dev', maxParallel: 1 }, stamp);
    const tables = [
      'project',
      'work_item',
      'step',
      'step_parallel',
      'command_journal',
      'event_log',
    ];
    const before = tables.map((table) => connection.db.all(`SELECT * FROM ${table}`));
    const refusal = {
      ok: false,
      reason: 'referenced_by_step_parallel',
      nodes: [{ workItemId: 'a', stepId: 'dev' }],
    } satisfies StepRemoved;
    expect(await stores.steps.remove('p', 'dev', cascade, stamp)).toEqual(refusal);
    expect(tables.map((table) => connection.db.all(`SELECT * FROM ${table}`))).toEqual(before);
    await uow.run(async ({ stores }) => {
      await stores.steps.rename('p', 'dev', 'Changed', stamp);
      expect(await stores.steps.remove('p', 'dev', cascade, stamp)).toEqual(refusal);
      await stores.stepParallels.remove('a', 'dev', stamp);
      expect(await stores.steps.remove('p', 'dev', cascade, stamp)).toMatchObject({ ok: true });
      return { commit: false, value: undefined };
    });
    expect(tables.map((table) => connection.db.all(`SELECT * FROM ${table}`))).toEqual(before);
  });

it('preserves retained cascade families before refusing sparse parallelism', async () => {
  const stores = buildStores(connection.db, OPEN);
  await stores.estimates.set(
    { workItemId: 'a', stepId: 'dev', optimistic: 1, realistic: 2, pessimistic: 3 },
    stamp,
  );
  await stores.actuals.set({ workItemId: 'a', stepId: 'dev', days: 1, recordedAt: 1 }, stamp);
  await stores.progress.set(
    { workItemId: 'a', stepId: 'dev', state: 'in_progress', statedAt: 1 },
    stamp,
  );
  await stores.directory.addPerson({ id: 'worker', name: 'Worker' }, [], stamp);
  expect(await stores.directory.assign('a', 'dev', 'worker', stamp)).toEqual({ ok: true });
  await stores.stepParallels.set({ workItemId: 'a', stepId: 'dev', maxParallel: 1 }, stamp);
  const tables = [
    'project',
    'work_item',
    'step',
    'step_parallel',
    'estimate',
    'actual',
    'step_progress',
    'assignment',
    'command_journal',
    'event_log',
  ];
  const before = tables.map((table) => connection.db.all(`SELECT * FROM ${table}`));
  for (const table of ['estimate', 'actual', 'step_progress', 'assignment'])
    expect(connection.db.all(`SELECT * FROM ${table}`)).toHaveLength(1);
  expect(await stores.steps.remove('p', 'dev', true, stamp)).toEqual({
    ok: false,
    reason: 'referenced_by_step_parallel',
    nodes: [{ workItemId: 'a', stepId: 'dev' }],
  });
  expect(tables.map((table) => connection.db.all(`SELECT * FROM ${table}`))).toEqual(before);
});
