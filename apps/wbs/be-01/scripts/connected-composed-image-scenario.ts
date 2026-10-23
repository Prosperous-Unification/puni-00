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
import { projectRow } from '@wbs/store-memory/project-fixture';
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

import type {
  ReservedSolverTerminal,
  ReservedSpawnRequest,
} from '../src/module/optimization/contract';
import { solverSupervisorSpawner } from '../src/module/solver-supervisor/solver-supervisor-spawner';
import { type BeServices, buildServices } from '../src/services';
import { testApp } from '../src/testing/app-fixture';
import { testLocalAuthService } from '../src/testing/auth-fixture';

export const TARGET_PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_PROJECT_ID = '22222222-2222-4222-8222-222222222222';

const installed = { solverVersion: '0.4.0', budgetMs: 30_000 };
const access = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;

/**
 * Synthetic authority is confined to this newly migrated disposable database.
 * This packaging fixture neither activates a deployment nor proves participant compatibility.
 */
export async function openComposedImageFixture(folder: string): Promise<string> {
  const path = await openSpaceDatabase(folder);
  seedDependencyAuthority(path);
  const setup = openSqliteSource({ dbPath: path });
  try {
    for (const id of [TARGET_PROJECT_ID, FOREIGN_PROJECT_ID]) {
      const created = await setup.stores.projects.createInOrganization(
        projectRow({ id, name: id, ownerId: 'ada' }),
        [],
        { at: 1, by: 'ada' },
        'org-a',
      );
      assert.equal(typeof created, 'object', 'disposable image project creation refused');
    }
  } finally {
    await setup.close();
  }
  const sqlite = openDatabase(path);
  try {
    sqlite.run("UPDATE organization_activation SET state='activated',activated_at=1");
    sqlite.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','ada','member',1)",
    );
    sqlite.run("UPDATE project SET estimate_rounding='exact',start_date='2026-10-05'");
    sqlite.run("UPDATE organization SET shared_people=0 WHERE id='org-a'");
    sqlite.run(
      "UPDATE project SET schedule_engine='optimized',optimization_enabled=1,schedule_objective='pri' WHERE id=?",
      [TARGET_PROJECT_ID],
    );
    for (const [projectId, project] of [
      [TARGET_PROJECT_ID, 'a1'],
      [FOREIGN_PROJECT_ID, 'a2'],
    ] as const) {
      sqlite.run('INSERT INTO service_team(id,name) VALUES(?,?)', [project, project]);
      sqlite.run(
        "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES(?,'org-a',?)",
        [project, project],
      );
      sqlite.run(
        'INSERT INTO project_team_capacity(project_id,service_team_id,size) VALUES(?,?,1)',
        [projectId, project],
      );
      sqlite.run('INSERT INTO step(id,project_id,name,position) VALUES(?,?,?,0)', [
        project + '-s',
        projectId,
        'Build',
      ]);
      for (const [position, suffix] of (project === 'a1'
        ? ['long', 'short']
        : ['foreign']
      ).entries()) {
        const id = project + '-' + suffix;
        const days = suffix === 'long' ? 2 : 1;
        sqlite.run(
          'INSERT INTO work_item(id,project_id,position,name,priority) VALUES(?,?,?,?,1)',
          [id, projectId, position, id],
        );
        sqlite.run('INSERT INTO work_item_team(work_item_id,team_id) VALUES(?,?)', [id, project]);
        sqlite.run(
          'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES(?,?,?,?,?)',
          [id, project + '-s', days, days, days],
        );
      }
    }
    for (const suffix of ['long', 'short']) {
      sqlite.run(
        "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES(?,'org-a',?,?,'a2-foreign',?,'whole','whole','FS')",
        ['edge-' + suffix, FOREIGN_PROJECT_ID, TARGET_PROJECT_ID, 'a1-' + suffix],
      );
    }
  } finally {
    sqlite.close();
  }
  return path;
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
    let borrowedReaders = 0;
    let bound: ReturnType<SqliteSource['bindLivePlans']> | undefined;
    source = openSqliteSource({
      dbPath: path,
      openReadOnlyConnection: (filename) => {
        const connection = openReadOnlyConnection(filename);
        borrowedReaders++;
        return {
          ...connection,
          close: () => {
            connection.close();
            borrowedReaders--;
          },
        };
      },
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
            assert.equal(borrowedReaders, 0, 'installed admission retained its capture reader');
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
      const app = testApp({
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
        new Request(`http://localhost/api/projects/${TARGET_PROJECT_ID}/work-items`, {
          headers: { 'X-WBS-Expected-Organization': 'org-a' },
        }),
      );
      assert.equal(response.status, 200);
      return workItemTree.assert(await response.json());
    };
    const placement = async () => {
      assert.ok(bound);
      const observed = await bound.stores.livePlans?.read(TARGET_PROJECT_ID, access);
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
      selected.stages.find((stage) => stage.stage.projectId === TARGET_PROJECT_ID)?.chosen?.chosen,
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
    source = openSqliteSource({ dbPath: path });
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
  }
}
