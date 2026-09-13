import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Project, Step, WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { ActualRepository } from './actual';
import { openDatabase, openDrizzle } from './db';
import { EstimateRepository } from './estimate';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { StepMeasureRepository } from './step-measure';
import { StepProgressRepository } from './step-progress';
import { UserRepository } from './user';
import { WorkItemRepository } from './work-item';

const MIGRATIONS = new URL('../../../apps/be-01/drizzle', import.meta.url).pathname;
const OWNER = 'targeted-owner';
const PROJECT = 'targeted-project';
const STEP = 'targeted-step';
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
  runMigrations(path, MIGRATIONS);
  const db = openDrizzle(path);
  estimates = new EstimateRepository(db, OPEN);
  actuals = new ActualRepository(db, OPEN);
  progress = new StepProgressRepository(db, OPEN);
  measures = new StepMeasureRepository(db, OPEN);
  await new UserRepository(db, OPEN).create(
    { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
    STAMP,
  );
  const project: Project = projectRow({ id: PROJECT, ownerId: OWNER });
  const steps: Step[] = [{ id: STEP, projectId: PROJECT, name: 'Build', position: 10 }];
  await new ProjectRepository(db, OPEN).create(project, steps, STAMP);
  await new WorkItemRepository(db, OPEN).insert(
    workItemRow({ id: ROW, projectId: PROJECT }),
    [],
    STAMP,
  );
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('targeted SQLite readers reject malformed stored state', () => {
  it('throws for invalid values and a broken step instead of hiding them', async () => {
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

    const sqlite = openDatabase(path);
    try {
      sqlite.run('PRAGMA foreign_keys = OFF');
      sqlite.run('PRAGMA ignore_check_constraints = ON');
      sqlite.run(`UPDATE estimate SET step_id = 'missing-step' WHERE work_item_id = '${ROW}'`);
      sqlite.run(`UPDATE actual SET days = 'broken' WHERE work_item_id = '${ROW}'`);
      sqlite.run(`UPDATE step_progress SET state = 'broken' WHERE work_item_id = '${ROW}'`);
      sqlite.run(`UPDATE step_measure SET value = 'broken' WHERE work_item_id = '${ROW}'`);
    } finally {
      sqlite.close();
    }

    // Proof: inner joins hid the broken estimate, and unchecked projections
    // returned the other three malformed values; each promise then resolved.
    expect(estimates.listByWorkItems(PROJECT, [ROW])).rejects.toThrow(/invalid step reference/);
    expect(actuals.listByWorkItems(PROJECT, [ROW])).rejects.toThrow(/invalid day value/);
    expect(progress.listByWorkItems(PROJECT, [ROW])).rejects.toThrow(/invalid state/);
    expect(measures.listByWorkItems(PROJECT, [ROW])).rejects.toThrow(/invalid value/);
  });
});
