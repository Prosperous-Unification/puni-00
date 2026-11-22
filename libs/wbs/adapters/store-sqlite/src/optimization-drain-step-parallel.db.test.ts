import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'bun:test';

import { type Drizzle, openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import {
  beginOptimizationDrain,
  finishOptimizationDrain,
  reclaimExpiredSolverSlotsIn,
  releaseSolverSlot,
} from './optimization-drain';
import { allocateGeneration } from './optimization-generation';
import { optimizedScheduleCache, solverSlot } from './schema';
import { StepCatalogueRepository } from './step-catalogue';
import {
  type CatalogueFixtureCustody,
  migrateEmptyCatalogueFixture,
} from './testing/catalogue-database';

const contractVersion = '7+1.0.0';
const stamp = { at: 20, by: 'owner' };
let directory: string;
let filename: string;
let db: Drizzle;
let custody: CatalogueFixtureCustody;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-drain-step-parallel-'));
  filename = join(directory, 'test.db');
  custody = { hasUnknownOwner: false };
  migrateEmptyCatalogueFixture({ path: filename, directory, reportedAt: 1 }, custody);
  const sqlite = openDatabase(filename);
  try {
    sqlite.run(
      "INSERT INTO users (id,username,password_hash,created_at) VALUES ('owner','owner','hash',1)",
    );
    sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org','Org',1)");
    for (const workPackageId of ['target', 'bystander']) {
      sqlite.run('INSERT INTO project(id,organization_id,name,created_at) VALUES(?,?,?,1)', [
        workPackageId + '-parent',
        'org',
        workPackageId,
      ]);
      sqlite.run(
        'INSERT INTO work_package (id,name,project_id,created_by,restricted,revision,created_at) VALUES (?,?,?,?,0,0,1)',
        [workPackageId, workPackageId, workPackageId + '-parent', 'owner'],
      );
      sqlite.run('INSERT INTO work_package_organization(resource_id,organization_id) VALUES(?,?)', [
        workPackageId,
        'org',
      ]);
      sqlite.run(
        'INSERT INTO work_item (id,work_package_id,name,position,revision) VALUES (?,?,?,1,0)',
        [workPackageId, workPackageId, workPackageId],
      );
      sqlite.run(
        'INSERT INTO work_package_access (user_id,work_package_id,last_opened_at) VALUES (?,?,2)',
        ['owner', workPackageId],
      );
    }
  } finally {
    sqlite.close();
  }
  db = openDrizzle(filename);
  const catalogue = new StepCatalogueRepository(db, OPEN, 'owned');
  for (const owner of ['target', 'bystander']) {
    for (const suffix of ['dev', 'qa']) {
      const id = `${owner}-${suffix}`;
      expect(
        (
          await catalogue.defineAndBindStep(
            'org',
            {
              id,
              code: id,
              name: id,
              defaultEstimateUnit: 'workdays',
              defaultAllowancePercent: 0,
              position: suffix === 'dev' ? 10 : 20,
            },
            {
              bindingId: id + '-binding',
              scopeKind: id === 'target-dev' ? 'organization' : 'project',
              scopeId: id === 'target-dev' ? 'org' : owner + '-parent',
              workItemTypeId: null,
              position: suffix === 'dev' ? 10 : 20,
            },
            stamp,
          )
        ).ok,
      ).toBe(true);
    }
  }
  const facts = openDatabase(filename);
  try {
    facts.run(
      "INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES('target','target-dev',1,2,3),('bystander','bystander-dev',1,2,3)",
    );
    facts.run(
      "INSERT INTO step_parallel(work_item_id,step_id,max_parallel) VALUES('target','target-dev',1),('target','target-qa',4),('bystander','bystander-dev',3)",
    );
  } finally {
    facts.close();
  }
});

afterEach(() => {
  // Proof: real helper close returned before an injected lost-close-authority throw.
  // Removing this guard deleted the fixture namespace and lost its required diagnostic;
  // exact restoration retained both (drain custody controls, v322). No FD-leak claim.
  if (custody.hasUnknownOwner)
    throw new Error('SQLite fixture has unknown native custody; retained ' + directory);
  rmSync(directory, { recursive: true, force: true });
});

function seedSlot(): void {
  allocateGeneration(db, 'target', contractVersion, 'input', 10);
  db.insert(optimizedScheduleCache)
    .values({
      workPackageId: 'target',
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
      workPackageId: 'target',
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
      workPackageId: 'target',
      contractVersion,
      generation: 1,
      objective: 'time',
      budgetMs: 60,
      attemptToken: 'token',
    });
  return db.transaction((tx) => reclaimExpiredSolverSlotsIn(tx, 100, { workPackageId: 'target' }));
}

function snapshot(sparseTable = 'step_parallel'): unknown[] {
  const sqlite = openDatabase(filename);
  try {
    return [
      'work_package',
      'work_item',
      'step_definition',
      'step_binding',
      'step_retirement',
      'work_package_step',
      sparseTable,
      'optimization_generation',
      'solver_slot',
      'solver_queue',
      'optimized_schedule_cache',
      'work_package_access',
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
  it(`${path} deletes valid equal-default and unequal sparse facts only at terminal work package deletion`, () => {
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
      expect(sqlite.query("SELECT id FROM work_package WHERE id = 'target'").all()).toEqual([]);
      expect(sqlite.query('SELECT * FROM step_parallel').all()).toEqual(bystander);
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
}

const faults = [
  'target-owner-foreign-step',
  'missing-package-values',
  'blob-maximum',
  'foreign-organization',
  'missing-definition-organization',
  'missing-package-organization',
  'mismatched-parent-organization',
  'malformed-package-values',
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
        fault === 'missing-package-values' ||
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
      const authorityTriggerName =
        fault === 'missing-package-organization'
          ? 'work_package_organization_frozen_delete'
          : fault === 'mismatched-parent-organization'
            ? 'project_work_package_organization_update'
            : null;
      const authorityTrigger =
        authorityTriggerName === null
          ? null
          : sqlite
              .query<{ sql: string }, [string]>(
                "SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?",
              )
              .get(authorityTriggerName);
      if (authorityTriggerName !== null) expect(authorityTrigger).not.toBeNull();
      try {
        sqlite.run('PRAGMA foreign_keys = OFF');
        sqlite.run('PRAGMA ignore_check_constraints = ON');
        // Corruption injection must bypass the independent ownership trigger;
        // disabling foreign keys/checks alone cannot store cross-work-package evidence.
        if (isReferenceFault) sqlite.run('DROP TRIGGER step_parallel_owner_insert');
        if (authorityTriggerName !== null) sqlite.run(`DROP TRIGGER ${authorityTriggerName}`);
        if (fault === 'target-owner-foreign-step')
          sqlite.run(
            "INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES ('target','bystander-dev',1)",
          );
        if (fault === 'missing-package-values')
          sqlite.run(
            "DELETE FROM work_package_step WHERE work_package_id='target' AND step_id='target-dev'",
          );
        if (fault === 'blob-maximum')
          sqlite.run(
            "UPDATE step_parallel SET max_parallel=x'01' WHERE work_item_id='target' AND step_id='target-dev'",
          );
        if (fault === 'missing-owner')
          sqlite.run(
            "INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES ('missing','target-dev',1)",
          );
        if (fault === 'missing-step')
          sqlite.run(
            "INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES ('target','missing',1)",
          );
        if (fault === 'foreign-organization' || fault === 'mismatched-parent-organization')
          sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('foreign','Foreign',1)");
        if (fault === 'foreign-organization' || fault === 'missing-definition-organization')
          sqlite.run("UPDATE step_definition SET organization_id=? WHERE id='target-dev'", [
            fault === 'foreign-organization' ? 'foreign' : 'missing',
          ]);
        if (fault === 'missing-package-organization')
          sqlite.run("DELETE FROM work_package_organization WHERE resource_id='target'");
        if (fault === 'mismatched-parent-organization')
          sqlite.run("UPDATE project SET organization_id='foreign' WHERE id='target-parent'");
        if (fault === 'malformed-package-values')
          sqlite.run(
            "UPDATE work_package_step SET estimate_unit=x'01' WHERE work_package_id='target' AND step_id='target-dev'",
          );
        if (fault === 'parent')
          sqlite.run(
            "INSERT INTO work_item (id,work_package_id,parent_id,name,position,revision) VALUES ('child','target','target','Child',1,0)",
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
        if (authorityTrigger !== null) sqlite.run(authorityTrigger.sql);
        sqlite.run('PRAGMA ignore_check_constraints = OFF');
        sqlite.run('PRAGMA foreign_keys = ON');
        sqlite.close();
      }
      const before = snapshot(sparseTable);
      if (fault === 'absent' || fault === 'unreadable') {
        expect(() => runDrain(path)).toThrow();
      } else {
        const diagnostics = {
          'target-owner-foreign-step': 'has no explicit values for step',
          'missing-package-values': 'has no explicit values for step',
          'blob-maximum': 'step parallelism has an invalid maximum',
          'foreign-organization': 'drain step definition organization is absent or foreign',
          'missing-definition-organization':
            'drain step definition organization is absent or foreign',
          'missing-package-organization': 'settings organization mapping is absent or malformed',
          'mismatched-parent-organization':
            'settings target parent is absent, malformed or foreign',
          'malformed-package-values': 'catalogue package estimate unit is malformed',
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
          "INSERT INTO dependency (id,work_package_id,predecessor_id,successor_id) VALUES ('cross','bystander','target','bystander')",
        );
      if (state === 'typed-dependency-refusal')
        sqlite.run(
          "INSERT INTO typed_dependency (id,work_package_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES ('cross-typed','bystander','target','whole','bystander','whole','FS')",
        );
      if (state === 'dependency-refusal' || state === 'typed-dependency-refusal') {
        expect(() => finishOptimizationDrain(db, 'target')).toThrow('cross-work-package');
      } else {
        expect(
          finishOptimizationDrain(
            db,
            state === 'absent' ? 'missing' : 'target',
            state === 'contract-only' ? contractVersion : undefined,
          ),
        ).toBe(state === 'contract-only' ? 'finished' : state);
      }
      expect(sqlite.query("SELECT id FROM work_package WHERE id = 'target'").all()).toEqual([
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
      sqlite.run(
        "UPDATE step_parallel SET step_id='target-dev',max_parallel = 1001 WHERE work_item_id = 'bystander'",
      );
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

for (const path of paths) {
  for (const missingValues of [false, true]) {
    it(`${path} retains a shared definition and B-owned fact when B values are ${missingValues ? 'missing' : 'present'}`, () => {
      if (path !== 'finish') seedSlot();
      beginOptimizationDrain(db, 'target', stamp);
      const sqlite = openDatabase(filename);
      try {
        sqlite.run("UPDATE step_parallel SET step_id='target-dev' WHERE work_item_id='bystander'");
        if (missingValues) {
          sqlite.run('PRAGMA foreign_keys=OFF');
          sqlite.run(
            "DELETE FROM work_package_step WHERE work_package_id='bystander' AND step_id='target-dev'",
          );
          sqlite.run('PRAGMA foreign_keys=ON');
        }
        const retained = () => [
          sqlite.query('SELECT * FROM step_definition ORDER BY id').all(),
          sqlite.query('SELECT * FROM step_binding ORDER BY id').all(),
          sqlite.query('SELECT * FROM step_retirement ORDER BY step_id').all(),
          sqlite
            .query(
              "SELECT * FROM work_package_step WHERE work_package_id='bystander' ORDER BY step_id",
            )
            .all(),
          sqlite.query("SELECT * FROM step_parallel WHERE work_item_id='bystander'").all(),
        ];
        const before = retained();
        expect(runDrain(path)).toEqual(
          path === 'finish'
            ? 'finished'
            : path === 'last-release'
              ? { released: true, retirement: 'finished', deletion: 'finished' }
              : { reclaimed: 1, finished: 1, waiting: 0 },
        );
        expect(retained()).toEqual(before);
        expect(
          sqlite.query("SELECT * FROM work_package_step WHERE work_package_id='target'").all(),
        ).toEqual([]);
        if (missingValues) {
          beginOptimizationDrain(db, 'bystander', stamp);
          expect(() => finishOptimizationDrain(db, 'bystander')).toThrow(
            'has no explicit values for step',
          );
        } else expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
      } finally {
        sqlite.close();
      }
    });
  }
}
