import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { sliceKey } from '@wbs/domain';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { createLivePlanStore } from './chain-snapshot';
import { openDatabase, openReadOnlyConnection } from './db';
import { openSpaceDatabase } from './testing/space-database';

let folder: string;
let path: string;
const access = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;
function write(statement: string) {
  const client = openDatabase(path);
  try {
    client.run(statement);
  } finally {
    client.close();
  }
}
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'connected-live-'));
  path = await openSpaceDatabase(folder);
  write("UPDATE organization_activation SET state = 'activated', activated_at = 1");
  write(
    "INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a','ada','member',1)",
  );
  for (const id of ['a1', 'a2']) {
    write(
      `INSERT INTO work_item (id,project_id,position,name,readiness) VALUES ('${id}','${id}',10,'${id}','ready')`,
    );
    write(`INSERT INTO step (id,project_id,name,position) VALUES ('${id}-s','${id}','Build',10)`);
  }
  write(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('edge','org-a','a2','a1','a2','a1','whole','whole','FS')",
  );
});
afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});
const reader = () =>
  createLivePlanStore({
    kind: 'owned',
    openConnection: () => openReadOnlyConnection(path),
    schedulerOf: () => fastScheduler,
  });

async function failureOf(pending: Promise<unknown>): Promise<Error> {
  try {
    await pending;
  } catch (failure) {
    if (failure instanceof Error) return failure;
    throw failure;
  }
  throw new Error('expected refusal');
}

test('actual isolated live route captures remote readiness without a calendar', async () => {
  const observed = await reader().read('a1', access);
  expect(observed.kind).toBe('connected');
  if (observed.kind !== 'connected') throw new Error('expected connected live route');
  expect(observed.projection.placement.kind).toBe('dependency_calendar_missing');
  expect(observed.readiness.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(false);
  expect([...observed.metadataByProject.keys()]).toEqual(['a1', 'a2']);
  write(
    "INSERT INTO step_progress (work_item_id,step_id,state,stated_at) VALUES ('a2','a2-s','done',1)",
  );
  const next = await reader().read('a1', access);
  if (next.kind !== 'connected') throw new Error('expected connected live route');
  expect(next.readiness.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(true);
  expect(observed.readiness.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(false);
});

test('connected export refuses instead of returning an incomplete document', async () => {
  expect((await failureOf(reader().readExport('a1', access))).message).toContain(
    'connected export is unsupported',
  );
});

test('remote hold changes the connected proxy reading in the next observation', async () => {
  const before = await reader().read('a1', access);
  if (before.kind !== 'connected') throw new Error('expected connected live route');
  write("UPDATE work_item SET hold = 'on_hold' WHERE id = 'a2'");
  const after = await reader().read('a1', access);
  if (after.kind !== 'connected') throw new Error('expected connected live route');
  expect(before.readiness.statuses.get('a1')).not.toBe('blocked_by_proxy');
  expect(after.readiness.statuses.get('a1')).toBe('blocked_by_proxy');
  expect(after.readiness.nodes.readings.get('a1')?.['a1-s']).toBe('blocked_by_proxy');
});

test('shared aggregate refuses a connected component instead of returning rank-only plans', async () => {
  write("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  expect((await failureOf(reader().readAggregate('ada', access))).message).toContain(
    'connected aggregate is unsupported',
  );
});
