import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'bun:test';

import { type Drizzle, openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import {
  beginOptimizationDrain,
  finishOptimizationDrain,
  reclaimExpiredSolverSlotsIn,
  releaseSolverSlot,
} from './optimization-drain';
import { allocateGeneration } from './optimization-generation';
import { optimizedScheduleCache, solverSlot } from './schema';

const migrations = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const contractVersion = '7+1.0.0';
const stamp = { at: 20, by: 'owner' };
let directory: string;
let filename: string;
let db: Drizzle;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-drain-step-parallel-'));
  filename = join(directory, 'test.db');
  runMigrations(filename, migrations);
  const sqlite = openDatabase(filename);
  try {
    sqlite.run(
      "INSERT INTO users (id,username,password_hash,created_at) VALUES ('owner','owner','hash',1)",
    );
    for (const projectId of ['target', 'bystander']) {
      sqlite.run(
        'INSERT INTO project (id,name,owner_id,restricted,revision,created_at) VALUES (?,?,?,0,0,1)',
        [projectId, projectId, 'owner'],
      );
      sqlite.run(
        'INSERT INTO work_item (id,project_id,name,position,revision) VALUES (?,?,?,1,0)',
        [projectId, projectId, projectId],
      );
      for (const suffix of ['dev', 'qa'])
        sqlite.run('INSERT INTO step (id,project_id,name,position) VALUES (?,?,?,?)', [
          `${projectId}-${suffix}`,
          projectId,
          suffix,
          suffix === 'dev' ? 10 : 20,
        ]);
      sqlite.run(
        'INSERT INTO estimate (work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,1,2,3)',
        [projectId, `${projectId}-dev`],
      );
      sqlite.run('INSERT INTO project_access (user_id,project_id,last_opened_at) VALUES (?,?,2)', [
        'owner',
        projectId,
      ]);
    }
    sqlite.run(
      "INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES ('target','target-dev',1),('target','target-qa',4),('bystander','bystander-dev',3)",
    );
  } finally {
    sqlite.close();
  }
  db = openDrizzle(filename);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function seedSlot(): void {
  allocateGeneration(db, 'target', contractVersion, 'input', 10);
  db.insert(optimizedScheduleCache)
    .values({
      projectId: 'target',
      inputHash: 'input',
      objective: 'pri',
      contractVersion,
      budgetMs: 60,
      generation: 1,
      status: 'ok',
      resultJson: '{}',
      failureReason: null,
      createdAt: 1,
    })
    .run();
  db.insert(solverSlot)
    .values({
      projectId: 'target',
      contractVersion,
      generation: 1,
      objective: 'time',
      budgetMs: 60,
      ownerId: 'worker',
      attemptToken: 'token',
      lifecycle: 'running',
      pid: 4242,
      startedAt: 1,
      heartbeatAt: 1,
      cancelRequestedAt: null,
      admittedDeadlineAt: 100,
    })
    .run();
}

const paths = ['finish', 'last-release', 'expired-reclaim'] as const;
type DrainPath = (typeof paths)[number];

function runDrain(path: DrainPath) {
  if (path === 'finish') return finishOptimizationDrain(db, 'target');
  if (path === 'last-release')
    return releaseSolverSlot(db, {
      projectId: 'target',
      contractVersion,
      generation: 1,
      objective: 'time',
      budgetMs: 60,
      attemptToken: 'token',
    });
  return db.transaction((tx) => reclaimExpiredSolverSlotsIn(tx, 100, { projectId: 'target' }));
}

function snapshot(sparseTable = 'step_parallel'): unknown[] {
  const sqlite = openDatabase(filename);
  try {
    return [
      'project',
      'work_item',
      'step',
      sparseTable,
      'optimization_generation',
      'solver_slot',
      'solver_queue',
      'optimized_schedule_cache',
      'project_access',
      'estimate',
      'command_journal',
      'event_log',
      'event_sequencer',
    ]
      .filter((table) => table !== '')
      .map((table) => sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
  } finally {
    sqlite.close();
  }
}

for (const path of paths) {
  it(`${path} deletes valid equal-default and unequal sparse facts only at terminal project deletion`, () => {
    if (path !== 'finish') seedSlot();
    const sqlite = openDatabase(filename);
    try {
      const bystander = sqlite
        .query("SELECT * FROM step_parallel WHERE work_item_id = 'bystander'")
        .all();
      expect(beginOptimizationDrain(db, 'target', stamp)).toBe(path === 'finish' ? 0 : 1);
      expect(
        sqlite
          .query(
            "SELECT max_parallel FROM step_parallel WHERE work_item_id = 'target' ORDER BY step_id",
          )
          .all(),
      ).toEqual([{ max_parallel: 1 }, { max_parallel: 4 }]);
      expect(runDrain(path)).toEqual(
        path === 'finish'
          ? 'finished'
          : path === 'last-release'
            ? { released: true, retirement: 'finished', deletion: 'finished' }
            : { reclaimed: 1, finished: 1, waiting: 0 },
      );
      expect(sqlite.query("SELECT id FROM project WHERE id = 'target'").all()).toEqual([]);
      expect(sqlite.query('SELECT * FROM step_parallel').all()).toEqual(bystander);
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
}

const faults = [
  'target-owner-foreign-step',
  'foreign-owner-target-step',
  'missing-owner',
  'missing-step',
  'parent',
  'zero',
  'fraction',
  'too-large',
  'absent',
  'unreadable',
  'cleanup-order',
] as const;
for (const path of paths) {
  for (const fault of faults) {
    it(`${path} throws on ${fault} sparse evidence and rolls back the graph and slot transaction`, () => {
      if (path !== 'finish') seedSlot();
      beginOptimizationDrain(db, 'target', stamp);
      const sqlite = openDatabase(filename);
      let sparseTable = 'step_parallel';
      const isReferenceFault =
        fault === 'target-owner-foreign-step' ||
        fault === 'foreign-owner-target-step' ||
        fault === 'missing-owner' ||
        fault === 'missing-step';
      const ownerTrigger = isReferenceFault
        ? (sqlite
            .query(
              "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'step_parallel_owner_insert'",
            )
            .get() as { sql: string } | null)
        : null;
      if (isReferenceFault && ownerTrigger === null)
        throw new Error('sparse insert trigger absent before corruption setup');
      try {
        sqlite.run('PRAGMA foreign_keys = OFF');
        sqlite.run('PRAGMA ignore_check_constraints = ON');
        // Corruption injection must bypass the independent ownership trigger;
        // disabling foreign keys/checks alone cannot store cross-project evidence.
        if (isReferenceFault) sqlite.run('DROP TRIGGER step_parallel_owner_insert');
        if (fault === 'target-owner-foreign-step')
          sqlite.run(
            "INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES ('target','bystander-dev',1)",
          );
        if (fault === 'foreign-owner-target-step')
          sqlite.run(
            "INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES ('bystander','target-dev',1)",
          );
        if (fault === 'missing-owner')
          sqlite.run(
            "INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES ('missing','target-dev',1)",
          );
        if (fault === 'missing-step')
          sqlite.run(
            "INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES ('target','missing',1)",
          );
        if (fault === 'parent')
          sqlite.run(
            "INSERT INTO work_item (id,project_id,parent_id,name,position,revision) VALUES ('child','target','target','Child',1,0)",
          );
        if (
          fault === 'zero' ||
          fault === 'fraction' ||
          fault === 'too-large' ||
          fault === 'cleanup-order'
        )
          sqlite.run(
            "UPDATE step_parallel SET max_parallel = ? WHERE work_item_id = 'target' AND step_id = 'target-dev'",
            [fault === 'zero' ? 0 : fault === 'fraction' ? 1.5 : 1001],
          );
        if (fault === 'cleanup-order')
          sqlite.run(
            "CREATE TRIGGER witness_first_cleanup BEFORE DELETE ON estimate WHEN OLD.work_item_id = 'target' BEGIN SELECT RAISE(ABORT, 'cleanup reached before sparse validation'); END",
          );
        if (fault === 'absent') {
          sqlite.run('DROP TABLE step_parallel');
          sparseTable = '';
        }
        if (fault === 'unreadable') {
          sqlite.run('ALTER TABLE step_parallel RENAME TO retained_step_parallel');
          sqlite.run(
            "CREATE VIEW step_parallel AS SELECT work_item_id,step_id,max_parallel FROM retained_step_parallel WHERE json_extract('malformed', '$') IS NULL",
          );
          sparseTable = 'retained_step_parallel';
        }
      } finally {
        if (ownerTrigger !== null) sqlite.run(ownerTrigger.sql);
        sqlite.run('PRAGMA ignore_check_constraints = OFF');
        sqlite.run('PRAGMA foreign_keys = ON');
        sqlite.close();
      }
      const before = snapshot(sparseTable);
      if (fault === 'absent' || fault === 'unreadable') {
        expect(() => runDrain(path)).toThrow();
      } else {
        const diagnostics = {
          'target-owner-foreign-step': 'step parallelism project mismatch',
          'foreign-owner-target-step': 'step parallelism project mismatch',
          'missing-owner': 'step parallelism has an invalid work-item reference',
          'missing-step': 'step parallelism has an invalid step reference',
          parent: 'step parallelism owner is not a leaf',
          zero: 'step parallelism must be an integer from 1 to 1000',
          fraction: 'step parallelism must be an integer from 1 to 1000',
          'too-large': 'step parallelism must be an integer from 1 to 1000',
          'cleanup-order': 'step parallelism must be an integer from 1 to 1000',
        };
        // A later foreign-key failure cannot stand in for this sparse guard.
        expect(() => runDrain(path)).toThrow(diagnostics[fault]);
      }
      expect(snapshot(sparseTable)).toEqual(before);
    });
  }
}

for (const state of [
  'absent',
  'open',
  'waiting',
  'contract-only',
  'dependency-refusal',
  'typed-dependency-refusal',
] as const) {
  it(`${state} keeps existing precedence before unreadable sparse evidence`, () => {
    if (state === 'waiting') seedSlot();
    if (
      state === 'waiting' ||
      state === 'dependency-refusal' ||
      state === 'typed-dependency-refusal'
    )
      beginOptimizationDrain(db, 'target', stamp);
    if (state === 'contract-only') {
      allocateGeneration(db, 'target', contractVersion, 'input', 10);
      beginOptimizationDrain(db, 'target', stamp, contractVersion);
    }
    const sqlite = openDatabase(filename);
    try {
      sqlite.run('DROP TABLE step_parallel');
      if (state === 'dependency-refusal')
        sqlite.run(
          "INSERT INTO dependency (id,project_id,predecessor_id,successor_id) VALUES ('cross','bystander','target','bystander')",
        );
      if (state === 'typed-dependency-refusal')
        sqlite.run(
          "INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES ('cross-typed','bystander','target','whole','bystander','whole','FS')",
        );
      if (state === 'dependency-refusal' || state === 'typed-dependency-refusal') {
        expect(() => finishOptimizationDrain(db, 'target')).toThrow('cross-project');
      } else {
        expect(
          finishOptimizationDrain(
            db,
            state === 'absent' ? 'missing' : 'target',
            state === 'contract-only' ? contractVersion : undefined,
          ),
        ).toBe(state === 'contract-only' ? 'finished' : state);
      }
      expect(sqlite.query("SELECT id FROM project WHERE id = 'target'").all()).toEqual([
        { id: 'target' },
      ]);
    } finally {
      sqlite.close();
    }
  });
}

for (const path of paths) {
  it(`${path} keeps nonincident corrupt bystander policy byte-equal without validating it`, () => {
    if (path !== 'finish') seedSlot();
    beginOptimizationDrain(db, 'target', stamp);
    const sqlite = openDatabase(filename);
    try {
      sqlite.run('PRAGMA ignore_check_constraints = ON');
      sqlite.run("UPDATE step_parallel SET max_parallel = 1001 WHERE work_item_id = 'bystander'");
      sqlite.run('PRAGMA ignore_check_constraints = OFF');
      const bystander = sqlite
        .query("SELECT * FROM step_parallel WHERE work_item_id = 'bystander'")
        .all();
      expect(runDrain(path)).toEqual(
        path === 'finish'
          ? 'finished'
          : path === 'last-release'
            ? { released: true, retirement: 'finished', deletion: 'finished' }
            : { reclaimed: 1, finished: 1, waiting: 0 },
      );
      expect(sqlite.query('SELECT * FROM step_parallel').all()).toEqual(bystander);
    } finally {
      sqlite.close();
    }
  });
}
