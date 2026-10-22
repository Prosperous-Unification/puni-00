import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { OrganizationLimitGauge, ResourceAccess, Scope } from '@wbs/core';
import { CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const DEFAULTS = {
  maxAgentPersons: 50,
  maxConcurrentClaims: 200,
  maxCapacityUnitsPerResource: 10_000,
};
const SCOPED: ResourceAccess = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'dany', role: 'admin' },
};

let directory: string;
let source: SqliteSource;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'agent-person-limit-race-'));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, folder);
  source = openSqliteSource({ dbPath, organizationDefaultLimits: DEFAULTS });
  for (const statement of [
    sql`INSERT INTO users (id, username, created_at) VALUES ('dany', 'dany', 1)`,
    sql`INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)`,
    sql`INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'dany', 'admin', 1)`,
    sql`INSERT INTO organization_limits (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at) VALUES ('org-a', 8, 200, 10000, 1)`,
  ])
    source.db.run(statement);
  for (let n = 1; n <= 7; n++) person(`bot-${String(n)}`, 'agent');
  person('kat', 'person');
  person('lee', 'person');
});

afterEach(async () => {
  await source.close();
  rmSync(directory, { recursive: true, force: true });
});

function person(id: string, kind: 'person' | 'agent'): void {
  source.db.run(sql`INSERT INTO person (id, name, kind) VALUES (${id}, ${`root-${id}`}, ${kind})`);
  source.db.run(
    sql`INSERT INTO person_organization (resource_id, organization_id, name) VALUES (${id}, 'org-a', ${id})`,
  );
}

function agents(): number {
  return source.db.get<{ n: number }>(sql`SELECT count(*) AS n FROM person WHERE kind = 'agent'`).n;
}

/** Where the first batch's count read waits, holding its write turn, until released. */
interface Hold {
  reached: () => void;
  release: Promise<void>;
  armed: boolean;
}

function runnerWith(hold: Hold) {
  const broadcast = recordingBroadcaster();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  };
  const holding = (gauge: OrganizationLimitGauge | undefined): OrganizationLimitGauge => {
    if (gauge === undefined) throw new Error('the admitted stores carry no limits gauge');
    return {
      readAgentPersonCap: async (organizationId) => {
        const reading = await gauge.readAgentPersonCap(organizationId);
        if (hold.armed) {
          hold.armed = false;
          hold.reached();
          await hold.release;
        }
        return reading;
      },
      readConcurrentClaimCap: (organizationId) => gauge.readConcurrentClaimCap(organizationId),
      readCapacityCap: (organizationId, resourceId, exceptProjectId) =>
        gauge.readCapacityCap(organizationId, resourceId, exceptProjectId),
    };
  };
  return createPlanCommandRunner({
    uow: source.uow,
    announcements: broadcast,
    publicServices: servicesOver(source.stores, options),
    batchServices: (scope: Scope, announcements) =>
      servicesOver(
        { ...scope.stores, organizationLimits: holding(scope.stores.organizationLimits) },
        { ...options, broadcast: announcements },
      ),
  });
}

describe('two concurrent promotions at 7 of 8', () => {
  // Proof: with `source.uow` built over the open gate (the coordinator
  // bypassed), the queued batch failed `BEGIN IMMEDIATE` with "cannot start a
  // transaction within a transaction" instead of agent_person_limit; with the
  // gauge answering the count it first read for every later batch (a count
  // read outside the batch's turn), both promotions landed, 9 agents of 8;
  // each watched 2026-10-22. SQLite's one write lock stands behind the
  // coordinator, so "both land" is reachable only through a stale count.
  it('lands exactly one, the other refused naming the winner in its count', async () => {
    let reached: () => void = () => undefined;
    const queued = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release: () => void = () => undefined;
    const hold: Hold = {
      reached,
      armed: true,
      release: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    const runner = runnerWith(hold);
    const promote = (personId: string) =>
      runner.runDirectoryWithin(
        'dany',
        [{ kind: 'patchPerson', personId, patch: { kind: 'agent' } }],
        SCOPED,
      );

    const first = promote('kat');
    await queued;
    // The first batch holds its turn after reading 7 of 8; the second queues.
    const second = promote('lee');
    await Bun.sleep(20);
    release();
    const [won, lost] = await Promise.all([first, second]);

    expect(won).toMatchObject({ ok: true });
    expect(lost).toEqual({
      ok: false,
      at: 0,
      kind: 'patchPerson',
      reason: 'agent_person_limit',
      detail: { cap: 8, current: 8, added: 1 },
    });
    expect(agents()).toBe(8);
  });
});
