import { rejects } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { ActualRepository } from './actual';
import { openConnection, openDatabase, openDrizzle } from './db';
import { EstimateRepository } from './estimate';
import { OPEN, WriteCoordinator } from './gate';
import { MeasureEstimateRepository } from './measure-estimate';
import { StepCatalogueRepository } from './step-catalogue';
import { StepMeasureRepository } from './step-measure';
import { StepProgressRepository } from './step-progress';
import { seedCurrentProjectFixture } from './testing/current-project-fixture';
import { seedPackageParent } from './testing/legacy-package-parent';
import { WorkItemRepository } from './work-item';
import { WorkItemBudgetRepository } from './work-item-budget';
import { WorkPackageRepository } from './work-package';

const custody = { hasUnknownOwner: false };
const OWNER = 'targeted-owner';
const WORK_PACKAGE = 'targeted-work-package';
const FOREIGN_WORK_PACKAGE = 'targeted-foreign-work-package';
const STEP = 'targeted-step';
const FOREIGN_STEP = 'targeted-foreign-step';
const ORGANIZATION = 'fixture-legacy-org';
const PROJECT = 'fixture-project';
const ROW = 'targeted-row';
const STAMP: WriteStamp = { at: 1, by: OWNER };

let directory: string;
let path: string;
let estimates: EstimateRepository;
let actuals: ActualRepository;
let progress: StepProgressRepository;
let measures: StepMeasureRepository;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-targeted-readers-'));
  path = join(directory, 'test.db');
  custody.hasUnknownOwner = false;
  await seedCurrentProjectFixture(
    {
      path,
      directory,
      organizationId: ORGANIZATION,
      projectId: PROJECT,
      stamp: STAMP,
      definitions: [
        {
          id: STEP,
          code: 'build',
          name: 'Build',
          position: 10,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
      ],
    },
    custody,
  );
  const db = openDrizzle(path);
  estimates = new EstimateRepository(db, OPEN);
  actuals = new ActualRepository(db, OPEN);
  progress = new StepProgressRepository(db, OPEN);
  measures = new StepMeasureRepository(db, OPEN);
  await new WorkPackageRepository(db, OPEN).create(
    workPackageRow({ id: WORK_PACKAGE, projectId: PROJECT }),
    [],
    STAMP,
  );
  await new WorkItemRepository(db, OPEN).insert(
    workItemRow({ id: ROW, workPackageId: WORK_PACKAGE }),
    [],
    STAMP,
  );
});

afterEach(() => {
  if (!custody.hasUnknownOwner) rmSync(directory, { recursive: true, force: true });
});

async function seedSatellites(): Promise<void> {
  await estimates.set(
    { workItemId: ROW, stepId: STEP, optimistic: 1, realistic: 2, pessimistic: 3 },
    STAMP,
  );
  await actuals.set({ workItemId: ROW, stepId: STEP, days: 1, recordedAt: 1 }, STAMP);
  await progress.set({ workItemId: ROW, stepId: STEP, state: 'in_progress', statedAt: 1 }, STAMP);
  await measures.set(
    {
      workItemId: ROW,
      stepId: STEP,
      metric: 'token_estimate',
      value: 1,
      recordedAt: 1,
    },
    STAMP,
  );
}

function corrupt(statements: readonly string[], ignoreChecks = false): void {
  const sqlite = openDatabase(path);
  try {
    sqlite.run('PRAGMA foreign_keys = OFF');
    if (ignoreChecks) sqlite.run('PRAGMA ignore_check_constraints = ON');
    for (const statement of statements) sqlite.run(statement);
  } finally {
    sqlite.close();
  }
}

it('retains the measure trio, money basis and audit stamp before its writer turn', async () => {
  const connection = openConnection(path);
  try {
    const trios = new MeasureEstimateRepository(connection.db, new WriteCoordinator());
    const stamp = { ...STAMP, at: 7 };
    const trio = {
      workItemId: ROW,
      stepId: STEP,
      key: 'cost',
      optimistic: 2,
      realistic: 3,
      pessimistic: 4,
      singlePoint: false,
      basis: { currency: 'USD', rateCardDigest: 'original-card' },
    };
    const original = structuredClone(trio);
    const pending = trios.set(trio, stamp);
    trio.basis.rateCardDigest = 'later-card';
    trio.realistic = 4;
    stamp.at = 8;
    expect(await pending).toBe('written');
    expect(await trios.listByWorkPackage(WORK_PACKAGE)).toEqual([original]);
    expect(connection.db.all('SELECT created_at FROM measure_estimate')).toEqual([
      { created_at: 7 },
    ]);
  } finally {
    connection.close();
  }
});

it('classifies missing and unbound measure estimate steps at the writer without changing stored facts or revision', async () => {
  const connection = openConnection(path);
  try {
    const gate = new WriteCoordinator();
    const trios = new MeasureEstimateRepository(connection.db, gate);
    const trio = {
      workItemId: ROW,
      stepId: STEP,
      key: 'tokens',
      optimistic: 2,
      realistic: 2,
      pessimistic: 2,
      singlePoint: true,
    };
    expect(await trios.set(trio, STAMP)).toBe('written');
    const snapshot = () => ({
      trios: connection.db.all('SELECT * FROM measure_estimate'),
      legacy: connection.db.all('SELECT * FROM step_measure'),
      revisions: connection.db.all('SELECT id,revision FROM work_item'),
    });
    const before = snapshot();
    expect(before.trios).toHaveLength(1);
    expect(before.legacy).toHaveLength(1);
    expect(await trios.set({ ...trio, stepId: 'missing-step' }, STAMP)).toBe('unknown_step');
    expect(snapshot()).toEqual(before);

    const unbind = gate.enter(() => {
      connection.db.run("DELETE FROM step_binding WHERE step_id='targeted-step'");
      return Promise.resolve();
    });
    const pending = trios.set(
      { ...trio, optimistic: 1, pessimistic: 3, singlePoint: false },
      STAMP,
    );
    await unbind;
    expect(await pending).toBe('step_not_resolved');
    expect(snapshot()).toEqual(before);
  } finally {
    connection.close();
  }
});

describe('targeted SQLite readers reject malformed stored state', () => {
  it('seeks one immediate predecessor instead of aggregating the work package prefix', async () => {
    const sqlite = openDatabase(path);
    try {
      sqlite.run(`
        WITH RECURSIVE sequence(n) AS (
          SELECT 0
          UNION ALL
          SELECT n + 1 FROM sequence WHERE n < 9999
        )
        INSERT INTO work_item (id, work_package_id, position)
        SELECT printf('row-%05d', n), '${WORK_PACKAGE}', n + 1 FROM sequence
      `);
    } finally {
      sqlite.close();
    }

    const statements: { sql: string; parameters: unknown[] }[] = [];
    const db = openDrizzle(path, {
      logQuery(sql, parameters) {
        statements.push({ sql, parameters });
      },
    });
    const repository = new WorkItemRepository(db, OPEN);
    expect(await repository.listPlacements(WORK_PACKAGE, ['row-09999'])).toEqual([
      { id: 'row-09999', afterId: 'row-09998' },
    ]);
    const read = statements.at(0);
    if (read === undefined) throw new Error('placement reader emitted no SQL statement');
    const parameters = read.parameters.map((parameter) => {
      if (typeof parameter !== 'string' && typeof parameter !== 'number' && parameter !== null) {
        throw new Error('placement query emitted an unsupported SQLite binding');
      }
      return parameter;
    });
    const explain = openDatabase(path);
    try {
      const opcodes = explain
        .query<{ opcode: string }, (string | number | null)[]>(`EXPLAIN ${read.sql}`)
        .all(...parameters)
        .map(({ opcode }) => opcode);
      // Proof: restoring the self-join/MAX production query adds AggStep and
      // walks the 9,999-row predecessor prefix instead of stopping after one seek.
      expect(opcodes).not.toContain('AggStep');
      expect(opcodes).toContain('SeekLT');
      expect(opcodes).toContain('DecrJumpZero');
    } finally {
      explain.close();
    }
  });

  it('seeks one populated predecessor for each value placement reader', async () => {
    const sqlite = openDatabase(path);
    try {
      sqlite.run(`
        WITH RECURSIVE sequence(n) AS (
          SELECT 0 UNION ALL SELECT n + 1 FROM sequence WHERE n < 9999
        )
        INSERT INTO work_item (id, work_package_id, position)
        SELECT printf('row-%05d', n), '${WORK_PACKAGE}', n + 1 FROM sequence
      `);
      sqlite.run(`INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic)
        SELECT id, '${STEP}', 1, 2, 3 FROM work_item WHERE id LIKE 'row-%'`);
      sqlite.run(`INSERT INTO actual (work_item_id, step_id, days, recorded_at)
        SELECT id, '${STEP}', 1, 1 FROM work_item WHERE id LIKE 'row-%'`);
      sqlite.run(`INSERT INTO step_progress (work_item_id, step_id, state, stated_at)
        SELECT id, '${STEP}', 'done', 1 FROM work_item WHERE id LIKE 'row-%'`);
      sqlite.run(`INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at)
        SELECT id, '${STEP}', 'token_actual', 1, 1 FROM work_item WHERE id LIKE 'row-%'`);
    } finally {
      sqlite.close();
    }

    const statements: { sql: string; parameters: unknown[] }[] = [];
    const db = openDrizzle(path, {
      logQuery: (sql, parameters) => statements.push({ sql, parameters }),
    });
    const repositories = [
      new EstimateRepository(db, OPEN),
      new ActualRepository(db, OPEN),
      new StepProgressRepository(db, OPEN),
      new StepMeasureRepository(db, OPEN),
    ] as const;
    for (const repository of repositories) {
      expect(await repository.listPlacements(WORK_PACKAGE, ['row-09999'])).toEqual([
        { id: 'row-09999', afterId: 'row-09998' },
      ]);
    }
    expect(statements).toHaveLength(4);
    const explain = openDatabase(path);
    try {
      for (const read of statements) {
        const parameters = read.parameters.map((parameter) => {
          if (
            typeof parameter !== 'string' &&
            typeof parameter !== 'number' &&
            parameter !== null
          ) {
            throw new Error('value placement query emitted an unsupported SQLite binding');
          }
          return parameter;
        });
        const opcodes = explain
          .query<{ opcode: string }, (string | number | null)[]>(`EXPLAIN ${read.sql}`)
          .all(...parameters)
          .map(({ opcode }) => opcode);
        // Proof: replacing the correlated descending seek with MAX adds AggStep
        // and scans the populated 9,999-group prefix before answering one ID.
        expect(opcodes).not.toContain('AggStep');
        expect(opcodes).toContain('SeekLT');
        expect(opcodes).toContain('DecrJumpZero');
      }
    } finally {
      explain.close();
    }
  });

  it('names missing work-item owners in all four families', async () => {
    await seedSatellites();
    corrupt([
      `UPDATE estimate SET work_item_id = 'missing-owner' WHERE work_item_id = '${ROW}'`,
      `UPDATE actual SET work_item_id = 'missing-owner' WHERE work_item_id = '${ROW}'`,
      `UPDATE step_progress SET work_item_id = 'missing-owner' WHERE work_item_id = '${ROW}'`,
      `UPDATE step_measure SET work_item_id = 'missing-owner' WHERE work_item_id = '${ROW}'`,
    ]);

    // Proof: inner joins hid all four missing owners; the left-join readers name them.
    await rejects(
      estimates.listByWorkItems(WORK_PACKAGE, ['missing-owner']),
      /work item is absent from its captured package/,
    );
    await rejects(
      actuals.listByWorkItems(WORK_PACKAGE, ['missing-owner']),
      /work item is absent from its captured package/,
    );
    await rejects(
      progress.listByWorkItems(WORK_PACKAGE, ['missing-owner']),
      /work item is absent from its captured package/,
    );
    await rejects(
      measures.listByWorkItems(WORK_PACKAGE, ['missing-owner']),
      /work item is absent from its captured package/,
    );
  });

  it('names missing step references in all four families', async () => {
    await seedSatellites();
    corrupt([
      `UPDATE estimate SET step_id = 'missing-step' WHERE work_item_id = '${ROW}'`,
      `UPDATE actual SET step_id = 'missing-step' WHERE work_item_id = '${ROW}'`,
      `UPDATE step_progress SET step_id = 'missing-step' WHERE work_item_id = '${ROW}'`,
      `UPDATE step_measure SET step_id = 'missing-step' WHERE work_item_id = '${ROW}'`,
    ]);

    // Proof: inner joins hid missing steps; each targeted left join now names its broken row.
    await rejects(
      estimates.listByWorkItems(WORK_PACKAGE, [ROW]),
      /not leaf-resolved: unknown_step/,
    );
    await rejects(actuals.listByWorkItems(WORK_PACKAGE, [ROW]), /not leaf-resolved: unknown_step/);
    await rejects(progress.listByWorkItems(WORK_PACKAGE, [ROW]), /not leaf-resolved: unknown_step/);
    await rejects(measures.listByWorkItems(WORK_PACKAGE, [ROW]), /not leaf-resolved: unknown_step/);
  });

  it('names foreign-work-package step references in all four families', async () => {
    const db = openDrizzle(path);
    const project = 'foreign-project';
    seedPackageParent(path, ORGANIZATION, project);
    expect(
      await new StepCatalogueRepository(db, OPEN, 'owned').defineAndBindStep(
        ORGANIZATION,
        {
          id: FOREIGN_STEP,
          code: 'foreign',
          name: 'Foreign',
          position: 10,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
        {
          bindingId: 'foreign-binding',
          scopeKind: 'project',
          scopeId: project,
          workItemTypeId: null,
          position: 10,
        },
        STAMP,
      ),
    ).toMatchObject({ ok: true });
    await new WorkPackageRepository(db, OPEN).create(
      workPackageRow({ id: FOREIGN_WORK_PACKAGE, projectId: project }),
      [],
      STAMP,
    );
    await seedSatellites();
    corrupt([
      `UPDATE estimate SET step_id = '${FOREIGN_STEP}' WHERE work_item_id = '${ROW}'`,
      `UPDATE actual SET step_id = '${FOREIGN_STEP}' WHERE work_item_id = '${ROW}'`,
      `UPDATE step_progress SET step_id = '${FOREIGN_STEP}' WHERE work_item_id = '${ROW}'`,
      `UPDATE step_measure SET step_id = '${FOREIGN_STEP}' WHERE work_item_id = '${ROW}'`,
    ]);

    // Proof: checking only step existence admitted four references owned by another work package.
    await rejects(
      estimates.listByWorkItems(WORK_PACKAGE, [ROW]),
      /not leaf-resolved: step_not_resolved/,
    );
    await rejects(
      actuals.listByWorkItems(WORK_PACKAGE, [ROW]),
      /not leaf-resolved: step_not_resolved/,
    );
    await rejects(
      progress.listByWorkItems(WORK_PACKAGE, [ROW]),
      /not leaf-resolved: step_not_resolved/,
    );
    await rejects(
      measures.listByWorkItems(WORK_PACKAGE, [ROW]),
      /not leaf-resolved: step_not_resolved/,
    );
  });

  it('rejects malformed values representable by SQLite dynamic typing', async () => {
    await seedSatellites();
    corrupt(
      [
        `UPDATE estimate SET optimistic = 'broken' WHERE work_item_id = '${ROW}'`,
        `UPDATE actual SET days = 'broken' WHERE work_item_id = '${ROW}'`,
        `UPDATE step_progress SET state = 'broken' WHERE work_item_id = '${ROW}'`,
        `UPDATE step_measure SET value = 'broken' WHERE work_item_id = '${ROW}'`,
      ],
      true,
    );

    // Proof: unchecked typed projections returned all four malformed values.
    await rejects(estimates.listByWorkItems(WORK_PACKAGE, [ROW]), /malformed day value/);
    await rejects(actuals.listByWorkItems(WORK_PACKAGE, [ROW]), /malformed day value/);
    await rejects(progress.listByWorkItems(WORK_PACKAGE, [ROW]), /malformed state/);
    await rejects(measures.listByWorkItems(WORK_PACKAGE, [ROW]), /invalid value/);
  });

  it('rejects malformed measure metrics after constraint-bypassing corruption', async () => {
    await seedSatellites();
    corrupt([`UPDATE step_measure SET metric = 'broken' WHERE work_item_id = '${ROW}'`], true);

    // Proof: without the reader check a constraint-bypassing metric projected as typed state.
    await rejects(measures.listByWorkItems(WORK_PACKAGE, [ROW]), /invalid metric/);
  });

  it('rejects a stored budget policy outside the two after constraint-bypassing corruption', () => {
    corrupt(
      [
        `INSERT INTO work_item_budget (work_item_id, measure_key, cap, policy) VALUES ('${ROW}', 'tokens', 10, 'firm')`,
      ],
      true,
    );
    expect(
      new WorkItemBudgetRepository(openDrizzle(path), OPEN).listByWorkPackage(WORK_PACKAGE),
    ).rejects.toThrow(`budget ${ROW}/tokens holds policy firm`);
  });

  it('rejects a stored figure carrying half a money basis after constraint-bypassing corruption', async () => {
    await seedSatellites();
    expect(
      await measures.set(
        { workItemId: ROW, stepId: STEP, metric: 'token_actual', value: 1, recordedAt: 1 },
        STAMP,
      ),
    ).toBe('written');
    const trios = new MeasureEstimateRepository(openDrizzle(path), OPEN);
    expect(
      await trios.set(
        {
          workItemId: ROW,
          stepId: STEP,
          key: 'tokens',
          optimistic: 1,
          realistic: 2,
          pessimistic: 3,
          singlePoint: false,
        },
        STAMP,
      ),
    ).toBe('written');
    corrupt(
      [
        `UPDATE step_measure SET currency = 'USD' WHERE work_item_id = '${ROW}' AND metric = 'token_actual'`,
        `UPDATE measure_estimate SET rate_card_digest = 'sha256:a' WHERE work_item_id = '${ROW}'`,
      ],
      true,
    );
    const half = 'a stored money figure carries half a basis';
    expect(measures.listByWorkPackage(WORK_PACKAGE)).rejects.toThrow(half);
    expect(measures.listByWorkItems(WORK_PACKAGE, [ROW])).rejects.toThrow(half);
    expect(
      new MeasureEstimateRepository(openDrizzle(path), OPEN).listByWorkPackage(WORK_PACKAGE),
    ).rejects.toThrow(half);
  });

  it('rejects a stored fact naming neither a metric nor a definition after constraint-bypassing corruption', async () => {
    await seedSatellites();
    corrupt(
      [`UPDATE step_measure SET metric = NULL, measure_id = NULL WHERE work_item_id = '${ROW}'`],
      true,
    );
    expect(measures.listByWorkPackage(WORK_PACKAGE)).rejects.toThrow(
      `measure ${ROW}/${STEP} names no metric and no definition`,
    );
  });

  it('refuses to write a single-point trio that is not an equal tokens trio, writing nothing', async () => {
    const trios = new MeasureEstimateRepository(openDrizzle(path), OPEN);
    const trio = {
      workItemId: ROW,
      stepId: STEP,
      key: 'tokens',
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
      singlePoint: true,
    };
    expect(trios.set(trio, STAMP)).rejects.toThrow(
      `measure estimate ${ROW}/${STEP}/tokens is not a single point`,
    );
    expect(await trios.listByWorkPackage(WORK_PACKAGE)).toEqual([]);
    expect(await measures.listByWorkPackage(WORK_PACKAGE)).toEqual([]);
  });

  it('rejects non-finite numeric values and timestamps SQLite can store', async () => {
    await seedSatellites();
    corrupt([
      `UPDATE estimate SET pessimistic = 9e999 WHERE work_item_id = '${ROW}'`,
      `UPDATE actual SET recorded_at = 9e999 WHERE work_item_id = '${ROW}'`,
      `UPDATE step_progress SET stated_at = -9e999 WHERE work_item_id = '${ROW}'`,
      `UPDATE step_measure SET recorded_at = 9e999 WHERE work_item_id = '${ROW}'`,
    ]);

    // Proof: without finite-number checks SQLite's infinities reached all four answers.
    await rejects(estimates.listByWorkItems(WORK_PACKAGE, [ROW]), /malformed day value/);
    await rejects(actuals.listByWorkItems(WORK_PACKAGE, [ROW]), /malformed recorded time/);
    await rejects(progress.listByWorkItems(WORK_PACKAGE, [ROW]), /malformed stated time/);
    await rejects(measures.listByWorkItems(WORK_PACKAGE, [ROW]), /invalid recorded time/);
  });

  it('records the constraints that prevent malformed closed sets and bound NaN', async () => {
    await seedSatellites();
    const sqlite = openDatabase(path);
    try {
      // Proof: these failures identify schema prevention; they are not reader proofs.
      expect(() =>
        sqlite.run(`UPDATE step_progress SET state = 'broken' WHERE work_item_id = '${ROW}'`),
      ).toThrow(/CHECK constraint failed: role_progress_state/);
      expect(() =>
        sqlite.run(`UPDATE step_measure SET metric = 'broken' WHERE work_item_id = '${ROW}'`),
      ).toThrow(/CHECK constraint failed: role_measure_metric/);
      expect(() =>
        sqlite
          .query(`UPDATE estimate SET optimistic = ? WHERE work_item_id = '${ROW}'`)
          .run(Number.NaN),
      ).toThrow(/NOT NULL constraint failed: estimate.optimistic/);
    } finally {
      sqlite.close();
    }
  });
});
