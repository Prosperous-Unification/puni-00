import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { workItemTree } from '@wbs/contracts';
import {
  decodeConnectedSuccess,
  encodeConnectedStage,
} from '@wbs/contracts/solver/connected-durable';
import { clockOf } from '@wbs/core';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { canonicalConnectedStageInput } from '@wbs/domain';
import { createLogger } from '@wbs/observability';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import {
  openSqliteSource,
  SqliteOrganizationAccess,
  type SqliteSource,
  userBoundOrganizationOf,
} from '@wbs/store-sqlite';
import { hashConnectedBytes } from '@wbs/store-sqlite/connected-question-identity';
import { openDatabase, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';
import { sql } from 'drizzle-orm';

import type {
  ReservedSolverTerminal,
  ReservedSpawnRequest,
} from '../src/module/optimization/contract';
import { solverSupervisorSpawner } from '../src/module/solver-supervisor/solver-supervisor-spawner';
import { BACKEND_DEPENDENCY_CAPABILITY } from '../src/runtime/dependency-support';
import { type BeServices, buildServices } from '../src/services';
import { composeTestApp } from '../src/testing/app-composition-fixture';
import { testLocalAuthService } from '../src/testing/auth-fixture';

export const TARGET_WORK_PACKAGE_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_WORK_PACKAGE_ID = '22222222-2222-4222-8222-222222222222';

const installed = { solverVersion: '0.4.0', budgetMs: 30_000 };
const access = {
  principal: { id: 'ada' },
  kind: 'scoped',
  scope: { cap: null, organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;

/**
 * Synthetic authority is confined to this newly migrated disposable database.
 * This packaging fixture neither activates a deployment nor proves participant compatibility.
 */
export async function openComposedImageFixture(folder: string): Promise<string> {
  const path = await openSpaceDatabase(folder);
  seedDependencyAuthority(path);
  const setup = openSqliteSource({
    dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
  });
  try {
    for (const [id, code] of [
      [TARGET_WORK_PACKAGE_ID, 'a1'],
      [FOREIGN_WORK_PACKAGE_ID, 'a2'],
    ] as const) {
      const projectId = `composed-image-${code}`;
      setup.db.run(
        sql`INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES(${projectId},'org-a',${code},1,'ada')`,
      );
      const created = await setup.stores.workPackages.createInOrganization(
        workPackageRow({ id, name: id, projectId }),
        [],
        { at: 1, by: 'ada' },
        'org-a',
        { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
      );
      assert.equal(typeof created, 'object', 'disposable image work package creation refused');
      const defined = await setup.stores.stepCatalogue.defineAndBindStep(
        'org-a',
        {
          id: `${code}-s`,
          code: `${code}-s`,
          name: `${code} Build`,
          position: 0,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        {
          bindingId: `composed-image-${code}-s`,
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position: 0,
        },
        { at: 1, by: 'ada' },
      );
      // Proof: the duplicate-code test fails with a later estimate FK error when this
      // guard is removed; restoring it recovers the precise code_taken refusal.
      if (!defined.ok)
        throw new Error(`disposable image step authoring refused: ${defined.reason}`);
    }
  } finally {
    await setup.close();
  }
  const sqlite = openDatabase(path);
  try {
    sqlite.run("UPDATE organization_activation SET state='activated',activated_at=1");
    sqlite.run("UPDATE work_package SET estimate_rounding='exact',start_date='2026-10-05'");
    sqlite.run("UPDATE organization SET shared_people=0 WHERE id='org-a'");
    sqlite.run(
      "UPDATE work_package SET schedule_engine='optimized',optimization_enabled=1,schedule_objective='pri' WHERE id=?",
      [TARGET_WORK_PACKAGE_ID],
    );
    for (const [workPackageId, workPackage] of [
      [TARGET_WORK_PACKAGE_ID, 'a1'],
      [FOREIGN_WORK_PACKAGE_ID, 'a2'],
    ] as const) {
      sqlite.run('INSERT INTO service_team(id,name) VALUES(?,?)', [workPackage, workPackage]);
      sqlite.run(
        "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES(?,'org-a',?)",
        [workPackage, workPackage],
      );
      sqlite.run(
        'INSERT INTO work_package_team_capacity(work_package_id,service_team_id,size) VALUES(?,?,1)',
        [workPackageId, workPackage],
      );
      for (const [position, suffix] of (workPackage === 'a1'
        ? ['long', 'short']
        : ['foreign']
      ).entries()) {
        const id = workPackage + '-' + suffix;
        const days = suffix === 'long' ? 2 : 1;
        sqlite.run(
          'INSERT INTO work_item(id,work_package_id,position,name,priority) VALUES(?,?,?,?,1)',
          [id, workPackageId, position, id],
        );
        sqlite.run('INSERT INTO work_item_team(work_item_id,team_id) VALUES(?,?)', [
          id,
          workPackage,
        ]);
        sqlite.run(
          'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES(?,?,?,?,?)',
          [id, workPackage + '-s', days, days, days],
        );
      }
    }
    for (const suffix of ['long', 'short']) {
      sqlite.run(
        "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES(?,'org-a',?,?,'a2-foreign',?,'whole','whole','FS')",
        ['edge-' + suffix, FOREIGN_WORK_PACKAGE_ID, TARGET_WORK_PACKAGE_ID, 'a1-' + suffix],
      );
    }
  } finally {
    sqlite.close();
  }
  return path;
}

/**
 * Observes real read-transaction settlement in this disposable packaging fixture.
 * Idle physical readers may remain pooled until source.close. Borrowed-handle expiry
 * is proved separately by the owning SQLite source/pool tests, not this counter.
 */
export function trackComposedImageReaders(open = openReadOnlyConnection) {
  let physicalReaders = 0;
  let begun = 0;
  let settled = 0;
  const active = new Set<ReturnType<typeof open>>();
  const unobserved = new Set<ReturnType<typeof open>>();
  return {
    openConnection: (filename: string) => {
      let statement = '';
      const connection = open(filename, {
        logQuery(query) {
          statement = query;
        },
      });
      physicalReaders++;
      const run = connection.db.run.bind(connection.db);
      const db = new Proxy(connection.db, {
        get(target, key, receiver): unknown {
          if (key === 'run')
            return (...parameters: Parameters<typeof run>) => {
              statement = '';
              const executed = run(...parameters);
              // Proof: omitting this refusal hid missing instrumentation on the second
              // physical reader in connected-composed-image-scenario.db.test.ts (2026-10-28).
              if (statement === '') {
                unobserved.add(connection);
                throw new Error('fixture read statement was not observed');
              }
              // Drizzle logs before execution: only a successful original run settles state.
              // Proof: moving settlement into logQuery made the logger-rejected COMMIT
              // test accept an unsettled transaction (2026-10-28).
              const control = statement.trim().toUpperCase();
              if (control === 'BEGIN DEFERRED') {
                begun++;
                active.add(connection);
              } else if (control === 'COMMIT' || control === 'ROLLBACK') {
                settled++;
                active.delete(connection);
              }
              return executed;
            };
          const member: unknown = Reflect.get(target, key, receiver);
          return member;
        },
      });
      return {
        db,
        close: () => {
          connection.close();
          physicalReaders--;
          active.delete(connection);
        },
      };
    },
    assertSettled: () => {
      // Proof: omitting this admission invariant hid active/overlapping transactions
      // and missing instrumentation in the owning DB suite (2026-10-28).
      assert.ok(begun > 0, 'fixture read transaction was not observed');
      assert.equal(unobserved.size, 0, 'fixture read statement observation was lost');
      assert.equal(active.size, 0, 'installed admission retained an active read transaction');
      assert.equal(settled, begun, 'fixture read transaction settlement was not observed');
    },
    assertClosed: () => {
      // Proof: omitting this check made the idle-pooled-reader owning test accept
      // an open physical connection before source.close (2026-10-28).
      assert.equal(physicalReaders, 0, 'source retained a physical read connection');
    },
  };
}

/**
 * Joins installed service composition and durable publication to authenticated Python children.
 * Pri and Time use the smoke host's explicit two-container allowance, preserving real admission.
 * The caller-owned inventory records each actual admission token before any host request.
 */
export async function runComposedImageScenario(options: {
  readonly unix: string;
  readonly callerId: string;
  readonly inventoryPath: string;
}): Promise<void> {
  const folder = mkdtempSync(join(tmpdir(), 'wbs-connected-image-'));
  const readers = trackComposedImageReaders();
  let services: BeServices | undefined;
  let source: SqliteSource | undefined;
  let sqlite: ReturnType<typeof openDatabase> | undefined;
  const timeout = setTimeout(() => {
    console.error('[solver-image-smoke] composed scenario exceeded 180 seconds');
    process.exit(1);
  }, 180_000);
  try {
    const path = await openComposedImageFixture(folder);
    sqlite = openDatabase(path);
    const errors: string[] = [];
    const launched: ReservedSpawnRequest[] = [];
    let bound: ReturnType<SqliteSource['bindLivePlans']> | undefined;
    source = openSqliteSource({
      dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
      openReadOnlyConnection: readers.openConnection,
    });
    const spawn = solverSupervisorSpawner({
      unix: options.unix,
      callerId: options.callerId,
      searchWorkers: 2,
      memoryLimitMb: 512,
    });
    const terminals: ReservedSolverTerminal[] = [];
    const compose = (liveSource: SqliteSource): BeServices => {
      const bind = liveSource.bindLivePlans.bind(liveSource);
      return buildServices({
        createWorkPackageObservation: (configured) =>
          configured.createWorkPackageObservation({
            activeOrganizationOf: () => userBoundOrganizationOf(() => Promise.resolve('org-a')),
            now: Date.now,
          }),
        createSpaceRead: (configured) =>
          configured.createSpaceRead({
            activeOrganizationOf: () => userBoundOrganizationOf(() => Promise.resolve('org-a')),
            now: Date.now,
          }),
        projectRead: liveSource.createProjectRead({
          activeOrganizationOf: () => userBoundOrganizationOf(() => Promise.resolve('org-a')),
          now: Date.now,
        }),
        source: {
          ...liveSource,
          bindLivePlans: (configuration) => {
            const live = bind(configuration);
            bound = live;
            return live;
          },
        },
        commandAccess: localCommandAccess,
        clock: clockOf({ now: Date.now, newId: () => crypto.randomUUID() }),
        logger: createLogger({
          service: 'be-01',
          destination: { write: (line: string) => errors.push(line) },
        }),
        jwtKey: 'k'.repeat(32),
        gwUrl: 'http://gw.invalid',
        internalAuthSecret: 's'.repeat(32),
        pushFetch: () => Promise.resolve(Response.json({ delivered_to_sockets: 0 })),
        optimizer: {
          ...installed,
          spawn: async (asked) => {
            readers.assertSettled();
            assert.equal(asked.kind, 'connected');
            assert.equal(launched.length < 2, true, 'same question launched an extra attempt');
            appendFileSync(options.inventoryPath, `${asked.admission.attemptToken}\n`);
            launched.push(asked);
            const child = await spawn(asked);
            assert.ok(child.terminal, 'supervisor omitted terminal evidence');
            const terminal = child.terminal.then((evidence) => {
              terminals.push({
                exitCode: evidence.exitCode,
                deadlineKilled: evidence.deadlineKilled,
                oomKilled: evidence.oomKilled,
              });
              return evidence;
            });
            return { ...child, terminal };
          },
        },
      });
    };
    const readTree = async () => {
      assert.ok(services);
      assert.ok(source);
      const app = composeTestApp(services.workItems, {
        ...services,
        writes: services,
        auth: testLocalAuthService({ id: 'ada', username: 'ada', scopes: ['read', 'write'] }),
        organizations: new SqliteOrganizationAccess(
          source.db,
          userBoundOrganizationOf(() => Promise.resolve('org-a')),
          Date.now,
        ),
      });
      const response = await app.handle(
        new Request(`http://localhost/api/work-packages/${TARGET_WORK_PACKAGE_ID}/work-items`, {
          headers: { 'X-WBS-Expected-Organization': 'org-a' },
        }),
      );
      assert.equal(response.status, 200);
      return workItemTree.assert(await response.json());
    };
    const placement = async () => {
      assert.ok(bound);
      const observed = await bound.stores.livePlans?.read(TARGET_WORK_PACKAGE_ID, access);
      if (observed?.kind !== 'connected') throw new Error('connected projection absent');
      const placed = observed.projection.placement;
      const placementDiagnosis = `complete connected placement required: ${placed.kind}${'reason' in placed ? `:${placed.reason}` : ''}`;
      assert.ok(placed.kind === 'scheduled', placementDiagnosis);
      return placed;
    };
    const ledger = () => {
      assert.ok(sqlite);
      const database = sqlite;
      return [
        'optimization_generation',
        'solver_queue',
        'solver_slot',
        'optimized_schedule_cache',
        'event_log',
      ].map((table) => database.query(`SELECT * FROM ${table}`).all());
    };
    services = compose(source);
    const baseline = await placement();
    assert.deepEqual(
      [...baseline.combined.slices].map(([key, slice]) => [key, slice.earliestStart]),
      [
        ['a1-long\u0000a1-s', 1],
        ['a1-short\u0000a1-s', 3],
        ['a2-foreign\u0000a2-s', 0],
      ],
    );
    await readTree();
    assert.ok(services.optimizer);
    await services.optimizer.drain();
    assert.deepEqual(terminals, [
      { exitCode: 0, deadlineKilled: false, oomKilled: false },
      { exitCode: 0, deadlineKilled: false, oomKilled: false },
    ]);
    assert.deepEqual(
      launched.map((asked) => asked.objective),
      ['pri', 'time'],
    );
    const stored = sqlite
      .query<{ objective: string; status: string; result_json: string }, []>(
        'SELECT objective,status,result_json FROM optimized_schedule_cache ORDER BY objective',
      )
      .all();
    assert.deepEqual(
      stored.map(({ objective, status }) => [objective, status]),
      [
        ['pri', 'ok'],
        ['time', 'ok'],
      ],
    );
    for (const row of stored) {
      const decoded = decodeConnectedSuccess(JSON.parse(row.result_json), hashConnectedBytes);
      const asked = launched.find((attempt) => attempt.objective === row.objective);
      if (asked?.kind !== 'connected') throw new Error('connected attempt evidence missing');
      const { stageBytes, ...identity } = asked.question;
      assert.deepEqual(decoded.identity, identity);
      assert.equal(canonicalConnectedStageInput(decoded.stage), stageBytes);
      assert.deepEqual(encodeConnectedStage(decoded.stage), encodeConnectedStage(asked.stage));
      assert.equal(decoded.outcome.kind, 'ok');
      if (row.objective === 'pri') {
        assert.equal(decoded.outcome.decision.chosen, 'optimized');
        assert.ok(
          decoded.outcome.decision.optimizedValues.priority <
            decoded.outcome.decision.baselineValues.priority,
        );
      }
    }
    const selected = await placement();
    assert.deepEqual(
      [...selected.combined.slices].map(([key, slice]) => [
        key,
        slice.earliestStart,
        slice.earliestFinish,
      ]),
      [
        ['a1-long\u0000a1-s', 2, 4],
        ['a1-short\u0000a1-s', 1, 2],
        ['a2-foreign\u0000a2-s', 0, 1],
      ],
    );
    assert.equal(
      selected.stages.find((stage) => stage.stage.workPackageId === TARGET_WORK_PACKAGE_ID)?.chosen
        ?.chosen,
      'optimized',
    );
    assert.deepEqual(sqlite.query('SELECT * FROM solver_slot').all(), []);
    assert.deepEqual(sqlite.query('SELECT * FROM solver_queue').all(), []);
    assert.equal(
      sqlite.query("SELECT * FROM event_log WHERE message LIKE '%schedule_optimized%'").all()
        .length,
      2,
    );
    const settled = ledger();
    const ready = await readTree();
    assert.ok(ready.optimization);
    assert.equal(ready.optimization.variants.pri.state, 'ready');
    assert.equal(ready.optimization.variants.time.state, 'ready');
    assert.deepEqual(
      ready.slices.map((slice: { id: string; earliestStart: number; earliestFinish: number }) => [
        slice.id,
        slice.earliestStart,
        slice.earliestFinish,
      ]),
      [
        ['a1-long\u0000a1-s', 2, 4],
        ['a1-short\u0000a1-s', 1, 2],
      ],
    );
    await readTree();
    assert.deepEqual(ledger(), settled);
    await services.optimizer.stop();
    await source.close();
    readers.assertClosed();
    source = openSqliteSource({
      dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
    });
    services = compose(source);
    assert.deepEqual(await readTree(), ready);
    assert.deepEqual(await placement(), selected);
    assert.ok(services.optimizer);
    await services.optimizer.drain();
    assert.deepEqual(ledger(), settled);
    assert.equal(launched.length, 2);
    assert.deepEqual(errors, []);
    console.log(
      '[solver-image-smoke] composed installed Python published improved Pri, durable ready evidence and recomposed read reuse',
    );
  } finally {
    await services?.optimizer?.stop();
    await source?.close();
    sqlite?.close();
    rmSync(folder, { recursive: true, force: true });
    clearTimeout(timeout);
    readers.assertClosed();
  }
}
