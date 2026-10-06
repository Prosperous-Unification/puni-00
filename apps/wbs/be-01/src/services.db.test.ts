import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import type { EditAdmission } from '@wbs/core';
import { subscriptionFor } from '@wbs/core';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { SavedPlanService } from '@wbs/core/service/saved-plan.service';
import { contractVersionOf, schedule, sliceKey } from '@wbs/domain';
import { createLogger } from '@wbs/observability';
import { openSqliteSource, type SqliteSource } from '@wbs/store-sqlite';
import { beginOptimizationDrain } from '@wbs/store-sqlite/optimization-drain';
import { afterEach, describe, expect, it } from 'bun:test';
// Test-only SQL snapshots and fault setup require raw queries across store tables.
// eslint-disable-next-line no-restricted-imports
import { sql } from 'drizzle-orm';

import type { ReservedSpawner, ReservedSpawnRequest } from './module/optimization/contract';
import type { OptimizationCoordinator } from './module/optimization/optimization.feature';
import { readRuntimeSolverVersion } from './module/solver-launcher/solver-launcher.repository';
import { openConnection, openDatabase, type openDrizzle } from './repository/db';
import { DrizzleEventLogStore } from './repository/event-log';
import { OPEN } from './repository/gate';
import { runMigrations } from './repository/migrate';
import { allocateGeneration } from './repository/optimization-generation';
import { ProjectRepository } from './repository/project';
import { SavedPlanRepository } from './repository/saved-plan';
import { SavedPlanCaptureRepository } from './repository/saved-plan-capture';
import { scheduleInputHash } from './repository/schedule-input-hash';
import {
  optimizationGeneration,
  optimizedScheduleCache,
  solverQueue,
  solverSlot,
} from './repository/schema';
import { UserRepository } from './repository/user';
import { WorkItemRepository } from './repository/work-item';
import { nodeDigest } from './runtime/bun-runtime';
import { buildServices, type ServicesOptions } from './services';
import { projectRow } from './testing/project-fixture';

const FOLDER = new URL('../drizzle', import.meta.url).pathname;

const dirs: string[] = [];
const sources: SqliteSource[] = [];
const optimizers: OptimizationCoordinator[] = [];

function signal(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve = (): void => {
    throw new Error('signal resolved before construction');
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function rejectedMessage(promise: Promise<unknown>): Promise<string> {
  const [settled] = await Promise.allSettled([promise]);
  if (settled.status !== 'rejected') throw new Error('expected lifecycle operation to reject');
  const reason: unknown = settled.reason;
  if (!(reason instanceof Error)) throw new Error('expected Error rejection');
  return reason.message;
}

afterEach(async () => {
  for (const optimizer of optimizers.splice(0)) await optimizer.stop();
  for (const source of sources.splice(0)) await source.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function bootstrap(
  optimizer?: {
    solverVersion: string;
    budgetMs: number;
    spawn: ReservedSpawner;
  },
  onFanoutCapture?: (organizationId: string) => void,
  pushFetch?: ServicesOptions['pushFetch'],
  omitFanoutCapture = false,
  afterOptimizerTurn?: (answer: unknown, db: ReturnType<typeof openDrizzle>) => void,
) {
  const pushUrls: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), 'wbs-services-'));
  dirs.push(dir);
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const source = openSqliteSource({ dbPath: path, onFanoutCapture });
  sources.push(source);
  const db = source.db;
  if (afterOptimizerTurn !== undefined) {
    const originalEnter = source.gate.enter.bind(source.gate);
    source.gate.enter = async <T>(work: () => Promise<T>): Promise<T> => {
      const answer = await originalEnter(work);
      const observed =
        typeof answer === 'object' && answer !== null && 'decision' in answer
          ? answer.decision
          : answer;
      afterOptimizerTurn(observed, db);
      return answer;
    };
  }
  const installedSource = omitFanoutCapture
    ? {
        ...source,
        bindLivePlans(options: Parameters<typeof source.bindLivePlans>[0]) {
          const bound = source.bindLivePlans(options);
          return {
            ...bound,
            uow: {
              run: <T>(act: Parameters<typeof bound.uow.run<T>>[0]) =>
                bound.uow.run((scope) => act({ ...scope, fanoutCapture: undefined })),
            },
          };
        },
      }
    : source;
  const services = buildServices({
    source: installedSource,
    logger: createLogger({ service: 'be-01' }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    // Proof: replacing this stub with `globalThis.fetch` made the two wiring
    // cases below time out after 5000ms in the parallel workspace gate while
    // `PushClient` retried the deliberately unreachable gateway.
    pushFetch:
      pushFetch ??
      ((url) => {
        pushUrls.push(url);
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      }),
    optimizer,
  });
  if (services.optimizer !== undefined) optimizers.push(services.optimizer);
  return { db, path, services, pushUrls };
}

async function seedProject(db: ReturnType<typeof openDrizzle>): Promise<{
  projectId: string;
  ownerId: string;
}> {
  const ownerId = crypto.randomUUID();
  await new UserRepository(db, OPEN).create(
    {
      id: ownerId,
      username: 'owner',
      passwordHash: 'x',
      createdAt: 1,
    },
    { at: 1, by: ownerId },
  );
  const projectId = crypto.randomUUID();
  const project = await new ProjectRepository(db, OPEN).create(
    projectRow({
      id: projectId,
      ownerId,
    }),
    [
      {
        id: crypto.randomUUID(),
        projectId,
        name: 'Dev',
        position: 10,
        code: 'dev',
        allowancePercent: 0,
      },
    ],
    { at: 1, by: ownerId },
  );
  return { projectId: project.id, ownerId };
}

function seedSharedLifecycle(
  path: string,
  activate = true,
  omitOwnershipFor?: string,
  threeProjects = false,
): void {
  const seed = openDatabase(path);
  try {
    seed.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('ada', 'ada', 'x', 1)",
    );
    seed.run(
      "INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-a', 'A', 1, 1)",
    );
    if (activate)
      seed.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
    seed.run("INSERT INTO person (id, name) VALUES ('ana', 'Ana')");
    seed.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Ana')",
    );
    for (const [index, projectId] of ['A', 'B', ...(threeProjects ? ['C'] : [])].entries()) {
      seed.run(
        `INSERT INTO project (id, name, owner_id, restricted, revision, created_at, start_date, estimate_rounding)
         VALUES (?, ?, 'ada', 0, 0, 1, '2026-10-05', 'exact')`,
        [projectId, projectId],
      );
      if (projectId !== omitOwnershipFor) {
        seed.run(
          "INSERT INTO project_organization (resource_id, organization_id) VALUES (?, 'org-a')",
          [projectId],
        );
        seed.run(
          "INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES (?, 'org-a', ?, 1, 'ada')",
          [projectId, index * 10],
        );
      }
      seed.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, 10)', [
        `${projectId}-step`,
        projectId,
        `${projectId}-step`,
      ]);
      seed.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
        projectId,
        projectId,
        projectId,
      ]);
      seed.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
        [projectId, `${projectId}-step`],
      );
      seed.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
        projectId,
        `${projectId}-step`,
        'ana',
      ]);
    }
  } finally {
    seed.close();
  }
}

function seedAnotherSharedPair(
  path: string,
  organizationId = 'org-z',
  projectIds: readonly [string, string] = ['C', 'D'],
  personId = 'zoe',
): void {
  const seed = openDatabase(path);
  try {
    seed.run('INSERT INTO organization (id, name, created_at, shared_people) VALUES (?, ?, 1, 1)', [
      organizationId,
      organizationId,
    ]);
    seed.run('INSERT INTO person (id, name) VALUES (?, ?)', [personId, personId]);
    seed.run(
      'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
      [personId, organizationId, personId],
    );
    for (const [index, projectId] of projectIds.entries()) {
      seed.run(
        `INSERT INTO project (id, name, owner_id, restricted, revision, created_at, start_date, estimate_rounding)
         VALUES (?, ?, 'ada', 0, 0, 1, '2026-10-05', 'exact')`,
        [projectId, projectId],
      );
      seed.run('INSERT INTO project_organization (resource_id, organization_id) VALUES (?, ?)', [
        projectId,
        organizationId,
      ]);
      seed.run(
        "INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES (?, ?, ?, 1, 'ada')",
        [projectId, organizationId, index * 10],
      );
      seed.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, 10)', [
        `${projectId}-step`,
        projectId,
        `${projectId}-step`,
      ]);
      seed.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
        projectId,
        projectId,
        projectId,
      ]);
      seed.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
        [projectId, `${projectId}-step`],
      );
      seed.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
        projectId,
        `${projectId}-step`,
        personId,
      ]);
    }
  } finally {
    seed.close();
  }
}

function lifecycleTables(
  db: ReturnType<typeof openDrizzle>,
): readonly (readonly [string, readonly string[]])[] {
  const tables = [
    'users',
    'organization',
    'person',
    'person_organization',
    'project',
    'project_organization',
    'project_rank',
    'project_access',
    'step',
    'work_item',
    'estimate',
    'assignment',
    'dependency',
    'typed_dependency',
    'actual',
    'step_progress',
    'step_measure',
    'command_journal',
    'plan_event',
    'saved_plan',
    'saved_plan_body',
    'calendar_marker',
    'optimization_generation',
    'optimized_schedule_cache',
    'solver_slot',
    'solver_queue',
    'event_log',
    'event_sequencer',
  ];
  return tables.map((table) => [
    table,
    db
      .all(sql.raw(`SELECT * FROM "${table}"`))
      .map((row) => JSON.stringify(row))
      .sort(),
  ]);
}

async function seedReadyRetirement(
  db: ReturnType<typeof openDrizzle>,
  services: ReturnType<typeof buildServices>,
  offset: number,
): Promise<{
  contractVersion: string;
  generation: number;
  inputHash: string;
  fastStart: number | undefined;
  selectedStart: number | undefined;
}> {
  const contractVersion = contractVersionOf('0.2.0');
  db.run(
    sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = 'A'`,
  );
  const captured = await services.workItems.optimizationInput('A');
  if (captured.kind !== 'scheduled') throw new Error('shared retirement input unavailable');
  const input = captured.input;
  const inputHash = scheduleInputHash(input);
  const fast = schedule(
    input.rows,
    input.edges,
    input.slices,
    input.notBefore,
    input.poolSizes,
    input.reach,
    input.deadlines,
    input.typed,
    undefined,
    input.elsewhere,
  );
  const selected = schedule(
    input.rows,
    input.edges,
    input.slices,
    new Map([['A', offset]]),
    input.poolSizes,
    input.reach,
    input.deadlines,
    input.typed,
    undefined,
    input.elsewhere,
  );
  const generation = allocateGeneration(db, 'A', contractVersion, inputHash, 1);
  db.insert(optimizedScheduleCache)
    .values({
      projectId: 'A',
      inputHash,
      objective: 'pri',
      contractVersion,
      budgetMs: 1000,
      generation,
      status: 'ok',
      failureReason: null,
      createdAt: 1,
      resultJson: JSON.stringify(
        encodeOptimizedResult({
          publication: 'solver',
          objectiveValues: {
            makespan: { value: 9, stageValue: 9, bound: 9, status: 'optimal' },
            priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
            movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
          },
          schedule: selected,
        }),
      ),
    })
    .run();
  return {
    contractVersion,
    generation,
    inputHash,
    fastStart: fast.slices.get(sliceKey('A', 'A-step'))?.earliestStart,
    selectedStart: selected.slices.get(sliceKey('A', 'A-step'))?.earliestStart,
  };
}

function seedLifecycleSlot(
  db: ReturnType<typeof openDrizzle>,
  contractVersion = contractVersionOf('0.2.0'),
  generation = allocateGeneration(db, 'A', contractVersion, 'release-input', 1),
) {
  const slot = {
    projectId: 'A',
    contractVersion,
    generation,
    objective: 'pri' as const,
    budgetMs: 1000,
    attemptToken: 'release-A',
  };
  db.insert(solverSlot)
    .values({
      ...slot,
      ownerId: 'own-1',
      lifecycle: 'running',
      pid: 4242,
      startedAt: 1,
      heartbeatAt: 1,
      cancelRequestedAt: null,
      admittedDeadlineAt: 1001,
    })
    .run();
  return slot;
}

function seedOtherLifecycleSlot(
  db: ReturnType<typeof openDrizzle>,
  projectId: string,
  admittedDeadlineAt: number,
): void {
  const contractVersion = contractVersionOf('0.2.0');
  const generation = allocateGeneration(db, projectId, contractVersion, `${projectId}-input`, 1);
  db.insert(solverSlot)
    .values({
      projectId,
      contractVersion,
      generation,
      objective: 'pri',
      budgetMs: 1000,
      ownerId: `own-${projectId}`,
      attemptToken: `release-${projectId}`,
      lifecycle: 'running',
      pid: 4243,
      startedAt: 1,
      heartbeatAt: 1,
      cancelRequestedAt: null,
      admittedDeadlineAt,
    })
    .run();
}

describe('buildServices', () => {
  it('records a victim shared-person event when initial admission reclaims its last expired slot', async () => {
    let launches = 0;
    const { db, path, services } = bootstrap({
      solverVersion: '0.2.0',
      budgetMs: 1000,
      spawn: () => {
        launches += 1;
        return Promise.reject(new Error('preflight refusal reached launcher'));
      },
    });
    seedSharedLifecycle(path);
    const expired = seedLifecycleSlot(db);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    const requester = await seedProject(db);
    db.run(
      sql`INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-x', 'X', 1, 1)`,
    );
    db.run(
      sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${requester.projectId}, 'org-x')`,
    );
    db.run(
      sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ${requester.projectId}`,
    );
    const captured = await services.workItems.optimizationInput('B');
    if (captured.kind !== 'scheduled') throw new Error('victim comparison input unavailable');
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    await optimizer.readPlan({
      projectId: requester.projectId,
      objective: 'pri',
      input: { ...captured.input, notBefore: new Map([['B', 50_000_000]]) },
      enabled: true,
    });
    await optimizer.drain();
    expect(launches).toBe(0);
    expect(
      db
        .select()
        .from(solverSlot)
        .where(sql`attempt_token = ${expired.attemptToken}`)
        .all(),
    ).toEqual([]);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
  });

  it('refuses initial reclaim without the borrowed capture capability before deleting its victim', async () => {
    const { db, path, services, pushUrls } = bootstrap(
      {
        solverVersion: '0.2.0',
        budgetMs: 1000,
        spawn: () => Promise.reject(new Error('missing capture reached launcher')),
      },
      undefined,
      undefined,
      true,
    );
    seedSharedLifecycle(path);
    seedLifecycleSlot(db);
    expect(beginOptimizationDrain(db, 'A', { at: 2, by: 'ada' })).toBe(1);
    const requester = await seedProject(db);
    db.run(
      sql`INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-x', 'X', 1, 1)`,
    );
    db.run(
      sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${requester.projectId}, 'org-x')`,
    );
    db.run(
      sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ${requester.projectId}`,
    );
    const captured = await services.workItems.optimizationInput('B');
    if (captured.kind !== 'scheduled') throw new Error('victim comparison input unavailable');
    const before = lifecycleTables(db);
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    expect(
      await rejectedMessage(
        optimizer.readPlan({
          projectId: requester.projectId,
          objective: 'pri',
          input: captured.input,
          enabled: true,
        }),
      ),
    ).toContain('initial reservation lacks borrowed ownership and capture');
    expect(lifecycleTables(db).filter(([table]) => table !== 'optimization_generation')).toEqual(
      before.filter(([table]) => table !== 'optimization_generation'),
    );
    expect(pushUrls).toEqual([]);
  });

  it('captures two foreign victim organizations before initial reservation reclaims either', async () => {
    let launches = 0;
    const { db, path, services } = bootstrap({
      solverVersion: '0.2.0',
      budgetMs: 1000,
      spawn: () => {
        launches += 1;
        return Promise.reject(new Error('preflight refusal reached launcher'));
      },
    });
    seedSharedLifecycle(path);
    seedAnotherSharedPair(path);
    seedAnotherSharedPair(path, 'org-f', ['E', 'F'], 'fei');
    seedLifecycleSlot(db);
    seedOtherLifecycleSlot(db, 'C', 1001);
    const futureDeadline = Date.now() + 1_000_000;
    seedOtherLifecycleSlot(db, 'E', futureDeadline);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    expect(await services.optimizationLifecycle.beginDrain('C', { at: 2, by: 'ada' })).toBe(1);
    expect(await services.optimizationLifecycle.beginDrain('E', { at: 2, by: 'ada' })).toBe(1);
    const requester = await seedProject(db);
    db.run(
      sql`INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-x', 'X', 1, 1)`,
    );
    db.run(
      sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${requester.projectId}, 'org-x')`,
    );
    db.run(
      sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ${requester.projectId}`,
    );
    const captured = await services.workItems.optimizationInput('B');
    if (captured.kind !== 'scheduled') throw new Error('victim comparison input unavailable');
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    await optimizer.readPlan({
      projectId: requester.projectId,
      objective: 'pri',
      input: { ...captured.input, notBefore: new Map([['B', 50_000_000]]) },
      enabled: true,
    });
    await optimizer.drain();
    expect(launches).toBe(0);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id IN ('A', 'C')"))).toEqual([]);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'E'"))).toEqual([{ id: 'E' }]);
    expect(
      db
        .select({ admittedDeadlineAt: solverSlot.admittedDeadlineAt })
        .from(solverSlot)
        .where(sql`project_id = 'E'`)
        .all(),
    ).toEqual([{ admittedDeadlineAt: futureDeadline }]);
    const events = new DrizzleEventLogStore(db, OPEN);
    for (const [recipient, cause] of [
      ['B', 'A'],
      ['D', 'C'],
    ])
      expect(
        (await events.rangeSince(`project:${recipient}`, -1)).map(({ seq, message }) => [
          seq,
          message,
        ]),
      ).toEqual([[0, { type: 'elsewhere_changed', projectId: recipient, causeProjectId: cause }]]);
    expect(
      (await events.rangeSince(`project:${requester.projectId}`, -1)).filter(
        ({ message }) =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'elsewhere_changed',
      ),
    ).toEqual([]);
    expect(await events.rangeSince('project:F', -1)).toEqual([]);
  });

  it('addresses a selected contract retired by initial global reclaim without deleting its project', async () => {
    let launches = 0;
    const { db, path, services } = bootstrap({
      solverVersion: '0.2.0',
      budgetMs: 1000,
      spawn: () => {
        launches += 1;
        return Promise.reject(new Error('selected retirement fixture reached launcher'));
      },
    });
    seedSharedLifecycle(path);
    const { contractVersion, generation, fastStart, selectedStart } = await seedReadyRetirement(
      db,
      services,
      1,
    );
    expect([fastStart, selectedStart]).toEqual([0, 1]);
    seedLifecycleSlot(db, contractVersion, generation);
    expect(
      await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' }, contractVersion),
    ).toBe(1);
    const requester = await seedProject(db);
    db.run(
      sql`INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-x', 'X', 1, 1)`,
    );
    db.run(
      sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${requester.projectId}, 'org-x')`,
    );
    db.run(
      sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ${requester.projectId}`,
    );
    const captured = await services.workItems.optimizationInput('B');
    if (captured.kind !== 'scheduled') throw new Error('victim comparison input unavailable');
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    await optimizer.readPlan({
      projectId: requester.projectId,
      objective: 'pri',
      input: { ...captured.input, notBefore: new Map([['B', 50_000_000]]) },
      enabled: true,
    });
    await optimizer.drain();
    expect(launches).toBe(0);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([{ id: 'A' }]);
    expect(
      db
        .select()
        .from(solverSlot)
        .where(sql`project_id = 'A'`)
        .all(),
    ).toEqual([]);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
  });

  it('commits reclaimed victim fan-out when the requester closes before reservation', async () => {
    const requesterRef: { projectId?: string } = {};
    let closed = false;
    let launches = 0;
    const { db, path, services } = bootstrap(
      {
        solverVersion: '0.2.0',
        budgetMs: 1000,
        spawn: () => {
          launches += 1;
          return Promise.reject(new Error('closed reservation reached launcher'));
        },
      },
      undefined,
      undefined,
      false,
      (answer, sourceDb) => {
        if (typeof answer !== 'object' || answer === null || !('kind' in answer)) return;
        if (answer.kind === 'observed' && requesterRef.projectId !== undefined)
          sourceDb.run(
            sql`UPDATE project SET optimization_enabled = 0 WHERE id = ${requesterRef.projectId}`,
          );
        if (answer.kind === 'closed') closed = true;
      },
    );
    seedSharedLifecycle(path);
    seedLifecycleSlot(db);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    const requester = await seedProject(db);
    requesterRef.projectId = requester.projectId;
    db.run(
      sql`INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-x', 'X', 1, 1)`,
    );
    db.run(
      sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${requesterRef.projectId}, 'org-x')`,
    );
    db.run(
      sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ${requesterRef.projectId}`,
    );
    const captured = await services.workItems.optimizationInput('B');
    if (captured.kind !== 'scheduled') throw new Error('victim comparison input unavailable');
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    await optimizer.readPlan({
      projectId: requesterRef.projectId,
      objective: 'pri',
      input: captured.input,
      enabled: true,
    });
    await optimizer.drain();
    expect(closed).toBe(true);
    expect(launches).toBe(0);
    expect(db.select().from(solverSlot).all()).toEqual([]);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
  });

  for (const fault of ['after-capture', 'event-insert'] as const) {
    it(`restores initial reclaim and the whole populated victim when ${fault} fails`, async () => {
      const requesterRef: { projectId?: string } = {};
      let before: ReturnType<typeof lifecycleTables> | undefined;
      let armed = false;
      let victimCaptures = 0;
      let launches = 0;
      const { db, path, services, pushUrls } = bootstrap(
        {
          solverVersion: '0.2.0',
          budgetMs: 1000,
          spawn: () => {
            launches += 1;
            return Promise.reject(new Error('failed reservation reached launcher'));
          },
        },
        (organizationId) => {
          if (fault === 'after-capture' && armed && organizationId === 'org-a') {
            victimCaptures += 1;
            if (victimCaptures === 2) throw new Error('initial after-capture fault');
          }
        },
        undefined,
        false,
        (answer, sourceDb) => {
          if (
            before === undefined &&
            requesterRef.projectId !== undefined &&
            typeof answer === 'object' &&
            answer !== null &&
            'kind' in answer &&
            answer.kind === 'observed'
          ) {
            before = lifecycleTables(sourceDb);
            if (fault === 'event-insert')
              sourceDb.run(
                sql.raw(
                  "CREATE TRIGGER fail_initial_event BEFORE INSERT ON event_log WHEN NEW.subscription = 'project:D' AND (SELECT count(*) FROM event_log WHERE subscription = 'project:B') = 1 BEGIN SELECT RAISE(ABORT, 'initial event-insert fault after first victim'); END",
                ),
              );
            armed = true;
          }
        },
      );
      seedSharedLifecycle(path);
      seedLifecycleSlot(db);
      expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
      if (fault === 'event-insert') {
        seedAnotherSharedPair(path);
        seedOtherLifecycleSlot(db, 'C', 1001);
        expect(await services.optimizationLifecycle.beginDrain('C', { at: 2, by: 'ada' })).toBe(1);
      }
      const requester = await seedProject(db);
      requesterRef.projectId = requester.projectId;
      db.run(
        sql`INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-x', 'X', 1, 1)`,
      );
      db.run(
        sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${requesterRef.projectId}, 'org-x')`,
      );
      db.run(
        sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ${requesterRef.projectId}`,
      );
      const captured = await services.workItems.optimizationInput('B');
      if (captured.kind !== 'scheduled') throw new Error('victim comparison input unavailable');
      const optimizer = services.optimizer;
      if (optimizer === undefined) throw new Error('optimizer was not installed');
      const ask = {
        projectId: requesterRef.projectId,
        objective: 'pri' as const,
        input: { ...captured.input, notBefore: new Map([['B', 50_000_000]]) },
        enabled: true,
      };
      expect(await rejectedMessage(optimizer.readPlan(ask))).toContain(
        fault === 'after-capture' ? 'initial after-capture fault' : 'INSERT INTO event_log',
      );
      if (before === undefined) throw new Error('initial admission observation was not reached');
      expect(lifecycleTables(db)).toEqual(before);
      expect(launches).toBe(0);
      expect(pushUrls).toEqual([]);
      armed = false;
      if (fault === 'event-insert') db.run(sql.raw('DROP TRIGGER fail_initial_event'));
      await optimizer.readPlan(ask);
      await optimizer.drain();
      const events = new DrizzleEventLogStore(db, OPEN);
      expect(
        (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
      ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
      if (fault === 'event-insert')
        expect(
          (await events.rangeSince('project:D', -1)).map(({ seq, message }) => [seq, message]),
        ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'D', causeProjectId: 'C' }]]);
    });
  }

  it('hands off real reclaimed-victim envelopes before held transport and keeps launched tokens', async () => {
    const deliveryEntered = signal();
    const releaseDelivery = signal();
    const launches: { request: ReservedSpawnRequest; finish: () => void }[] = [];
    const emptyStream = (): ReadableStream<Uint8Array> =>
      new ReadableStream<Uint8Array>({
        start: (controller) => {
          controller.close();
        },
      });
    const { db, path, services, pushUrls } = bootstrap(
      {
        solverVersion: '0.2.0',
        budgetMs: 1000,
        spawn: (request) => {
          let finish: (code: number) => void = () => {
            throw new Error('child completion was not bound');
          };
          const exited = new Promise<number>((resolve) => {
            finish = resolve;
          });
          launches.push({
            request,
            finish: () => {
              finish(1);
            },
          });
          return Promise.resolve({
            pid: 4100 + launches.length,
            stdout: emptyStream(),
            stderr: emptyStream(),
            exited,
            verdict: () => undefined,
            kill: () => {
              finish(1);
            },
          });
        },
      },
      undefined,
      (url) => {
        pushUrls.push(url);
        deliveryEntered.resolve();
        return releaseDelivery.promise.then(() => new Response('gateway refused', { status: 400 }));
      },
    );
    seedSharedLifecycle(path);
    seedLifecycleSlot(db);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    const requester = await seedProject(db);
    db.run(
      sql`INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-x', 'X', 1, 1)`,
    );
    db.run(
      sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${requester.projectId}, 'org-x')`,
    );
    db.run(
      sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ${requester.projectId}`,
    );
    const captured = await services.workItems.optimizationInput('B');
    if (captured.kind !== 'scheduled') throw new Error('victim comparison input unavailable');
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    const reading = optimizer.readPlan({
      projectId: requester.projectId,
      objective: 'pri',
      input: captured.input,
      enabled: true,
    });
    try {
      await Promise.race([
        deliveryEntered.promise,
        Bun.sleep(500).then(() => {
          throw new Error('real victim delivery did not start');
        }),
      ]);
      await Promise.race([
        reading,
        Bun.sleep(500).then(() => {
          throw new Error('initial committed decision waited for transport');
        }),
      ]);
      expect(launches).toHaveLength(2);
      const liveTokens = db
        .select({ attemptToken: solverSlot.attemptToken })
        .from(solverSlot)
        .where(sql`project_id = ${requester.projectId}`)
        .all()
        .map(({ attemptToken }) => attemptToken)
        .sort();
      expect(launches.map(({ request }) => request.admission.attemptToken).sort()).toEqual(
        liveTokens,
      );
      const second = openDatabase(path);
      try {
        second.run('PRAGMA busy_timeout = 50');
        second.run("UPDATE project SET name = 'second writer entered' WHERE id = 'B'");
      } finally {
        second.close();
      }
      expect(db.all(sql.raw("SELECT name FROM project WHERE id = 'B'"))).toEqual([
        { name: 'second writer entered' },
      ]);
      expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
      const events = new DrizzleEventLogStore(db, OPEN);
      const replay = await events.rangeSince('project:B', -1);
      expect(replay.map(({ seq, message }) => [seq, message])).toEqual([
        [0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }],
      ]);
      expect(pushUrls).toHaveLength(1);
      releaseDelivery.resolve();
      for (const { finish } of launches) finish();
      await optimizer.stop();
      expect(await events.rangeSince('project:B', -1)).toEqual(replay);
    } finally {
      releaseDelivery.resolve();
      for (const { finish } of launches) finish();
    }
  });

  it('installs direct optimization lifecycle without a solver runtime', () => {
    const { services } = bootstrap();
    expect(services.optimizationLifecycle).toBeDefined();
    expect(services.optimizer).toBeUndefined();
  });

  it('finishes a marked shared project with its old bridge and surviving cause', async () => {
    const { db, path, services, pushUrls } = bootstrap();
    seedSharedLifecycle(path);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(0);
    expect(await events.rangeSince('project:B', -1)).toEqual([]);
    expect(await services.optimizationLifecycle.finishDrain('A')).toBe('finished');
    const downstream = await events.rangeSince('project:B', -1);
    expect(downstream.map(({ seq, message }) => [seq, message])).toEqual([
      [0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }],
    ]);
    expect(await events.rangeSince('project:A', -1)).toEqual([]);
    expect(pushUrls).toHaveLength(1);
    expect(await services.optimizationLifecycle.finishDrain('A')).toBe('absent');
    expect(await events.rangeSince('project:B', -1)).toEqual(downstream);
    expect(pushUrls).toHaveLength(1);
  });

  it('releases the last counted child through the installed owner and records the old cause', async () => {
    const { db, path, services, pushUrls } = bootstrap();
    seedSharedLifecycle(path);
    const slot = seedLifecycleSlot(db);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    expect(
      await services.optimizationLifecycle.releaseSlot({ ...slot, attemptToken: 'stale-A' }),
    ).toEqual({ released: false, retirement: 'waiting', deletion: 'waiting' });
    expect(await new DrizzleEventLogStore(db, OPEN).rangeSince('project:B', -1)).toEqual([]);
    expect(await services.optimizationLifecycle.releaseSlot(slot)).toEqual({
      released: true,
      retirement: 'finished',
      deletion: 'finished',
    });
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
    expect(pushUrls).toHaveLength(1);
  });

  it('routes a terminal optimizer child through the composed release owner', async () => {
    const bound = signal();
    let finishChild: (code: number) => void = () => {
      throw new Error('solver child was never spawned');
    };
    const exited = new Promise<number>((resolve) => {
      finishChild = resolve;
    });
    const emptyStream = (): ReadableStream<Uint8Array> =>
      new ReadableStream<Uint8Array>({
        start: (controller) => {
          controller.close();
        },
      });
    const { db, path, services } = bootstrap({
      solverVersion: '0.2.0',
      budgetMs: 1000,
      spawn: () =>
        Promise.resolve({
          pid: 4242,
          stdout: emptyStream(),
          stderr: emptyStream(),
          exited,
          verdict: () => {
            bound.resolve();
          },
          kill: () => undefined,
        }),
    });
    seedSharedLifecycle(path);
    await seedReadyRetirement(db, services, 1);
    const captured = await services.workItems.optimizationInput('A');
    if (captured.kind !== 'scheduled') throw new Error('shared input was not scheduled');
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    await optimizer.readPlan({
      projectId: 'A',
      objective: 'time',
      input: captured.input,
      enabled: true,
    });
    await bound.promise;
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    finishChild(1);
    await optimizer.drain();
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
  });

  it('routes a cancelled child through the composed release only after kill and exit', async () => {
    const bound = signal();
    const killedChild = signal();
    let finishChild: (code: number) => void = () => {
      throw new Error('solver child was never spawned');
    };
    const exited = new Promise<number>((resolve) => {
      finishChild = resolve;
    });
    const emptyStream = (): ReadableStream<Uint8Array> =>
      new ReadableStream<Uint8Array>({
        start: (controller) => {
          controller.close();
        },
      });
    let killed = false;
    const { db, path, services } = bootstrap({
      solverVersion: '0.2.0',
      budgetMs: 1000,
      spawn: () =>
        Promise.resolve({
          pid: 4242,
          stdout: emptyStream(),
          stderr: emptyStream(),
          exited,
          verdict: () => {
            bound.resolve();
          },
          kill: () => {
            killed = true;
            killedChild.resolve();
          },
        }),
    });
    seedSharedLifecycle(path);
    await seedReadyRetirement(db, services, 1);
    const captured = await services.workItems.optimizationInput('A');
    if (captured.kind !== 'scheduled') throw new Error('shared input was not scheduled');
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    await optimizer.readPlan({
      projectId: 'A',
      objective: 'time',
      input: captured.input,
      enabled: true,
    });
    await bound.promise;
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([{ id: 'A' }]);
    await killedChild.promise;
    expect(db.select().from(solverSlot).all()).toHaveLength(1);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([{ id: 'A' }]);
    finishChild(143);
    await optimizer.drain();
    expect(killed).toBe(true);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
  }, 12000);

  it('restores the exact last slot and populated graph when release event recording fails', async () => {
    const { db, path, services, pushUrls } = bootstrap();
    seedSharedLifecycle(path);
    const slot = seedLifecycleSlot(db);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    const before = lifecycleTables(db);
    const failure = openDatabase(path);
    try {
      failure.run(
        `CREATE TRIGGER fail_release_event BEFORE INSERT ON event_log
         WHEN NEW.subscription = 'project:B'
         BEGIN SELECT RAISE(ABORT, 'last-slot event failed'); END`,
      );
    } finally {
      failure.close();
    }
    expect(await rejectedMessage(services.optimizationLifecycle.releaseSlot(slot))).toContain(
      'project:B',
    );
    expect(lifecycleTables(db)).toEqual(before);
    expect(pushUrls).toEqual([]);
    const restored = openDatabase(path);
    try {
      restored.run('DROP TRIGGER fail_release_event');
    } finally {
      restored.close();
    }
    expect(await services.optimizationLifecycle.releaseSlot(slot)).toEqual({
      released: true,
      retirement: 'finished',
      deletion: 'finished',
    });
    expect(
      (await new DrizzleEventLogStore(db, OPEN).rangeSince('project:B', -1)).map(
        ({ seq, message }) => [seq, message],
      ),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
  });

  it('retires only the selected contract after its exact last-slot release', async () => {
    const { db, path, services, pushUrls } = bootstrap({
      solverVersion: '0.2.0',
      budgetMs: 1000,
      spawn: () => Promise.reject(new Error('retirement fixture must not launch')),
    });
    seedSharedLifecycle(path);
    const { contractVersion, generation, fastStart, selectedStart } = await seedReadyRetirement(
      db,
      services,
      1,
    );
    expect([fastStart, selectedStart]).toEqual([0, 1]);
    const slot = seedLifecycleSlot(db, contractVersion, generation);
    expect(
      await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' }, contractVersion),
    ).toBe(1);
    expect(await services.optimizationLifecycle.releaseSlot(slot)).toEqual({
      released: true,
      retirement: 'finished',
      deletion: 'open',
    });
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([{ id: 'A' }]);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
    expect(pushUrls).toHaveLength(1);
  });

  it('commits last-slot deletion before held delivery and replays after transport refusal', async () => {
    const deliveryEntered = signal();
    const releaseDelivery = signal();
    const calls: string[] = [];
    const { db, path, services } = bootstrap(undefined, undefined, (url) => {
      calls.push(url);
      deliveryEntered.resolve();
      return releaseDelivery.promise.then(() => new Response('gateway refused', { status: 400 }));
    });
    seedSharedLifecycle(path);
    const slot = seedLifecycleSlot(db);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    let settled = false;
    const releasing = services.optimizationLifecycle.releaseSlot(slot).then((outcome) => {
      settled = true;
      return outcome;
    });
    await deliveryEntered.promise;
    const events = new DrizzleEventLogStore(db, OPEN);
    const replay = await events.rangeSince('project:B', -1);
    expect(replay.map(({ seq, message }) => [seq, message])).toEqual([
      [0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }],
    ]);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
    expect(settled).toBe(false);
    const second = openDatabase(path);
    let writerFailure: unknown;
    try {
      second.run('PRAGMA busy_timeout = 50');
      second.run("UPDATE project SET name = 'writer entered' WHERE id = 'B'");
    } catch (cause) {
      writerFailure = cause;
    } finally {
      second.close();
      releaseDelivery.resolve();
    }
    expect(writerFailure).toBeUndefined();
    expect(await releasing).toEqual({
      released: true,
      retirement: 'finished',
      deletion: 'finished',
    });
    expect(calls).toHaveLength(1);
    expect(await events.rangeSince('project:B', -1)).toEqual(replay);
    expect(await services.optimizationLifecycle.releaseSlot(slot)).toEqual({
      released: false,
      retirement: 'absent',
      deletion: 'absent',
    });
    expect(await events.rangeSince('project:B', -1)).toEqual(replay);
  });

  it('rolls back last-slot deletion and token when after-capture fails', async () => {
    let captures = 0;
    let failRelease = false;
    const { db, path, services, pushUrls } = bootstrap(undefined, () => {
      if (failRelease && ++captures === 2) throw new Error('release after-capture failed');
    });
    seedSharedLifecycle(path);
    const slot = seedLifecycleSlot(db);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    const before = lifecycleTables(db);
    captures = 0;
    failRelease = true;
    expect(await rejectedMessage(services.optimizationLifecycle.releaseSlot(slot))).toContain(
      'release after-capture failed',
    );
    expect(lifecycleTables(db)).toEqual(before);
    expect(pushUrls).toEqual([]);
    failRelease = false;
    expect(await services.optimizationLifecycle.releaseSlot(slot)).toEqual({
      released: true,
      retirement: 'finished',
      deletion: 'finished',
    });
  });

  it('uses the installed release for an initial preflight refusal after reservation', async () => {
    let armed = true;
    const { db, path, services, pushUrls } = bootstrap(
      {
        solverVersion: '0.2.0',
        budgetMs: 1000,
        spawn: () => Promise.reject(new Error('preflight refusal reached launcher')),
      },
      undefined,
      undefined,
      false,
      (answer, sourceDb) => {
        if (
          armed &&
          typeof answer === 'object' &&
          answer !== null &&
          'kind' in answer &&
          answer.kind === 'reserved' &&
          'startedAt' in answer
        ) {
          armed = false;
          if (beginOptimizationDrain(sourceDb, 'A', { at: 2, by: 'ada' }) !== 1)
            throw new Error('preflight slot was not counted before drain');
        }
      },
    );
    seedSharedLifecycle(path);
    db.run(
      sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = 'A'`,
    );
    const captured = await services.workItems.optimizationInput('A');
    if (captured.kind !== 'scheduled') throw new Error('shared input was not scheduled');
    const input = { ...captured.input, notBefore: new Map([['A', 50_000_000]]) };
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    await optimizer.readPlan({ projectId: 'A', objective: 'pri', input, enabled: true });
    await optimizer.drain();
    expect(armed).toBe(false);
    expect(db.select().from(solverSlot).all()).toEqual([]);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
    expect(pushUrls).toHaveLength(1);
  });

  it('uses the installed release for a Retry preflight refusal after admission', async () => {
    let armed = true;
    const { db, path, services, pushUrls } = bootstrap(
      {
        solverVersion: '0.2.0',
        budgetMs: 1000,
        spawn: () => Promise.reject(new Error('Retry preflight refusal reached launcher')),
      },
      undefined,
      undefined,
      false,
      (answer, sourceDb) => {
        if (
          armed &&
          typeof answer === 'object' &&
          answer !== null &&
          'kind' in answer &&
          answer.kind === 'accepted' &&
          'admission' in answer &&
          answer.admission !== null
        ) {
          armed = false;
          if (beginOptimizationDrain(sourceDb, 'A', { at: 2, by: 'ada' }) !== 1)
            throw new Error('Retry slot was not counted before drain');
        }
      },
    );
    seedSharedLifecycle(path);
    db.run(
      sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = 'A'`,
    );
    const captured = await services.workItems.optimizationInput('A');
    if (captured.kind !== 'scheduled') throw new Error('shared input was not scheduled');
    const input = { ...captured.input, notBefore: new Map([['A', 50_000_000]]) };
    const contractVersion = contractVersionOf('0.2.0');
    const inputHash = scheduleInputHash(input);
    const generation = allocateGeneration(db, 'A', contractVersion, inputHash, 1);
    db.insert(optimizedScheduleCache)
      .values({
        projectId: 'A',
        inputHash,
        objective: 'pri',
        contractVersion,
        budgetMs: 1000,
        generation,
        status: 'failed',
        resultJson: null,
        failureReason: 'timeout',
        createdAt: 1,
      })
      .run();
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    const decision = await optimizer.retry({ projectId: 'A', objective: 'pri', inputHash, input });
    expect(decision.kind).toBe('accepted');
    await optimizer.drain();
    expect(armed).toBe(false);
    expect(db.select().from(solverSlot).all()).toEqual([]);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
    expect(pushUrls).toHaveLength(1);
  });

  it('uses the installed release for a stale queued seat before another dequeue', async () => {
    let armed = true;
    const { db, path, services, pushUrls } = bootstrap(
      {
        solverVersion: '0.2.0',
        budgetMs: 1000,
        spawn: () => Promise.reject(new Error('stale queued seat reached launcher')),
      },
      undefined,
      undefined,
      false,
      (answer, sourceDb) => {
        if (
          armed &&
          typeof answer === 'object' &&
          answer !== null &&
          'kind' in answer &&
          answer.kind === 'reserved' &&
          'entry' in answer &&
          'admission' in answer
        ) {
          armed = false;
          if (beginOptimizationDrain(sourceDb, 'A', { at: 2, by: 'ada' }) !== 1)
            throw new Error('queued seat was not counted before drain');
        }
      },
    );
    seedSharedLifecycle(path);
    db.run(
      sql`UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = 'A'`,
    );
    const contractVersion = contractVersionOf('0.2.0');
    const generation = allocateGeneration(db, 'A', contractVersion, 'stale-queue-input', 1);
    db.insert(solverQueue)
      .values({
        projectId: 'A',
        contractVersion,
        generation,
        objective: 'pri',
        budgetMs: 1000,
        admittedCancelEpoch: 0,
        enqueuedAt: 1,
      })
      .run();
    const optimizer = services.optimizer;
    if (optimizer === undefined) throw new Error('optimizer was not installed');
    optimizer.start();
    await optimizer.stop();
    expect(armed).toBe(false);
    expect(db.select().from(solverQueue).all()).toEqual([]);
    expect(db.select().from(solverSlot).all()).toEqual([]);
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
    expect(pushUrls).toHaveLength(1);
  });

  it('removes a populated project graph while retaining shared and bystander rows', async () => {
    const { db, path, services } = bootstrap();
    seedSharedLifecycle(path);
    const seeded = openDatabase(path);
    try {
      seeded.run(
        "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('A-child', 'A', 'A', 10, 'child')",
      );
      seeded.run(
        "INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('A-child', 'A-step', 2, 2, 2)",
      );
      seeded.run(
        "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('A-child', 'A-step', 'ana')",
      );
      seeded.run(
        "INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES ('A-edge', 'A', 'A', 'A-child')",
      );
      seeded.run(
        "INSERT INTO typed_dependency (id, project_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('A-typed-edge', 'A', 'A', 'whole', 'A-child', 'whole', 'FS')",
      );
      seeded.run(
        "INSERT INTO project_access (user_id, project_id, last_opened_at) VALUES ('ada', 'A', 2)",
      );
      seeded.run(
        "INSERT INTO project_access (user_id, project_id, last_opened_at) VALUES ('ada', 'B', 2)",
      );
      seeded.run(
        "INSERT INTO actual (work_item_id, step_id, days, recorded_at) VALUES ('A-child', 'A-step', 2, 2)",
      );
      seeded.run(
        "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES ('A', 'A-step', 'in_progress', 2)",
      );
      seeded.run(
        "INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at) VALUES ('A-child', 'A-step', 'hours_actual', 4, 2)",
      );
      seeded.run(
        "INSERT INTO command_journal (id, project_id, user_id, seq, kind, payload, inverse, preconditions, created_at) VALUES ('A-command', 'A', 'ada', 1, 'fixture', '{}', '{}', '{}', 2)",
      );
      seeded.run(
        "INSERT INTO plan_event (id, project_id, user_id, kind, label, before, after, created_at) VALUES ('A-history', 'A', 'ada', 'fixture', 'saved', '{}', '{}', 2)",
      );
      seeded.run(
        "INSERT INTO saved_plan (id, project_id, name, created_by, created_by_id, created_at, input_schema_version, input_bytes, input_sha256, schedule_absent_reason) VALUES ('A-saved', 'A', 'saved', 'ada', 'ada', 2, 1, 2, 'hash', 'unavailable')",
      );
      seeded.run(
        "INSERT INTO saved_plan_body (saved_plan_id, kind, bytes) VALUES ('A-saved', 'input', '{}')",
      );
      seeded.run(
        "INSERT INTO calendar_marker (id, project_id, date, name, created_at) VALUES ('A-marker', 'A', '2026-10-05', 'marker', 2)",
      );
      seeded.run(
        "INSERT INTO project_priority_band (project_id, rank, starts_at, label, default_value) VALUES ('A', 0, 1, 'Critical', 1)",
      );
      seeded.run(
        "INSERT INTO space (id, organization_id, name, revision, created_at, created_by) VALUES ('space-a', 'org-a', 'Space', 0, 2, 'ada')",
      );
      seeded.run(
        "INSERT INTO space_project (space_id, project_id, organization_id, position, created_at, created_by) VALUES ('space-a', 'A', 'org-a', 10, 2, 'ada')",
      );
      seeded.run("INSERT INTO service_team (id, name) VALUES ('team-a', 'Team A')");
      seeded.run("INSERT INTO service (id, name) VALUES ('service-a', 'Service A')");
      seeded.run("INSERT INTO tag (id, name) VALUES ('tag-a', 'Tag A')");
      seeded.run("INSERT INTO work_item_type (id, name) VALUES ('type-a', 'Type A')");
      seeded.run("INSERT INTO external_system (id, name) VALUES ('system-a', 'System A')");
      for (const [table, resourceId, name] of [
        ['service_team_organization', 'team-a', 'Team A'],
        ['service_organization', 'service-a', 'Service A'],
        ['tag_organization', 'tag-a', 'Tag A'],
        ['work_item_type_organization', 'type-a', 'Type A'],
        ['external_system_organization', 'system-a', 'System A'],
      ]) {
        seeded.run(
          `INSERT INTO ${table} (resource_id, organization_id, name) VALUES (?, 'org-a', ?)`,
          [resourceId, name],
        );
      }
      seeded.run("INSERT INTO work_item_team (work_item_id, team_id) VALUES ('A-child', 'team-a')");
      seeded.run(
        "INSERT INTO work_item_service (work_item_id, service_id) VALUES ('A-child', 'service-a')",
      );
      seeded.run("INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('A-child', 'tag-a')");
      seeded.run(
        "INSERT INTO work_item_work_item_type (work_item_id, type_id) VALUES ('A-child', 'type-a')",
      );
      seeded.run(
        "INSERT INTO work_item_external_ref (id, work_item_id, system_id, url, position) VALUES ('A-ref', 'A-child', 'system-a', 'https://example.invalid/a', 10)",
      );
      seeded.run(
        "INSERT INTO project_team_capacity (project_id, service_team_id, size) VALUES ('A', 'team-a', 1)",
      );
      seeded.run(
        "INSERT INTO project_solution (project_id, organization_id, slug, url) VALUES ('A', 'org-a', 'a', 'https://example.invalid/a')",
      );
      seeded.run(
        "INSERT INTO organization_audit (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at) VALUES ('audit-a', 'org-a', 'ada', 'restricted_project_recovery', 'project', 'A', '{}', 2)",
      );
    } finally {
      seeded.close();
    }
    const retainedTables = [
      'users',
      'organization',
      'person',
      'person_organization',
      'space',
      'service_team',
      'service',
      'tag',
      'work_item_type',
      'external_system',
      'service_team_organization',
      'service_organization',
      'tag_organization',
      'work_item_type_organization',
      'external_system_organization',
      'organization_audit',
    ];
    const retained = retainedTables.map((table) => [
      table,
      db.all(sql.raw(`SELECT * FROM "${table}"`)),
    ]);
    const bystander = [
      'project',
      'project_access',
      'step',
      'work_item',
      'estimate',
      'assignment',
    ].map((table) => [
      table,
      db.all(
        sql.raw(
          `SELECT * FROM "${table}" WHERE ${table === 'project' ? 'id' : table === 'step' || table === 'work_item' || table === 'project_access' ? 'project_id' : 'work_item_id'} = 'B'`,
        ),
      ),
    ]);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(0);
    expect(await services.optimizationLifecycle.finishDrain('A')).toBe('finished');
    for (const table of [
      'project',
      'project_access',
      'step',
      'work_item',
      'estimate',
      'assignment',
      'dependency',
      'typed_dependency',
      'actual',
      'step_progress',
      'step_measure',
      'command_journal',
      'plan_event',
      'saved_plan',
      'saved_plan_body',
      'calendar_marker',
      'project_priority_band',
      'space_project',
      'work_item_team',
      'work_item_service',
      'work_item_tag',
      'work_item_work_item_type',
      'work_item_external_ref',
      'project_team_capacity',
      'project_solution',
    ]) {
      const column =
        table === 'project'
          ? 'id'
          : table === 'saved_plan_body'
            ? 'saved_plan_id'
            : table === 'estimate' ||
                table === 'assignment' ||
                table === 'actual' ||
                table === 'step_progress' ||
                table === 'step_measure' ||
                table === 'work_item_team' ||
                table === 'work_item_service' ||
                table === 'work_item_tag' ||
                table === 'work_item_work_item_type' ||
                table === 'work_item_external_ref'
              ? 'work_item_id'
              : 'project_id';
      const scope =
        column === 'work_item_id'
          ? "IN ('A', 'A-child')"
          : table === 'saved_plan_body'
            ? "= 'A-saved'"
            : "= 'A'";
      expect(db.all(sql.raw(`SELECT * FROM "${table}" WHERE ${column} ${scope}`))).toEqual([]);
    }
    expect(
      retainedTables.map((table) => [table, db.all(sql.raw(`SELECT * FROM "${table}"`))]),
    ).toEqual(retained);
    expect(
      ['project', 'project_access', 'step', 'work_item', 'estimate', 'assignment'].map((table) => [
        table,
        db.all(
          sql.raw(
            `SELECT * FROM "${table}" WHERE ${table === 'project' ? 'id' : table === 'step' || table === 'work_item' || table === 'project_access' ? 'project_id' : 'work_item_id'} = 'B'`,
          ),
        ),
      ]),
    ).toEqual(bystander);
    expect(db.all(sql.raw('PRAGMA foreign_key_check'))).toEqual([]);
  });

  it('rolls back earlier populated cleanup when a later step removal fails', async () => {
    const { db, path, services, pushUrls } = bootstrap();
    seedSharedLifecycle(path);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(0);
    const before = lifecycleTables(db);
    const failure = openDatabase(path);
    try {
      failure.run(
        `CREATE TRIGGER fail_after_work_items BEFORE DELETE ON step
         WHEN OLD.project_id = 'A'
           AND NOT EXISTS (SELECT 1 FROM work_item WHERE project_id = 'A')
         BEGIN SELECT RAISE(ABORT, 'step cleanup after work items failed'); END`,
      );
    } finally {
      failure.close();
    }
    expect(await rejectedMessage(services.optimizationLifecycle.finishDrain('A'))).toContain(
      'delete from "step"',
    );
    expect(lifecycleTables(db)).toEqual(before);
    expect(pushUrls).toEqual([]);
    expect(db.all(sql.raw('PRAGMA foreign_key_check'))).toEqual([]);
  });

  it('keeps another project’s empty plan rows when a populated neighbor finishes', async () => {
    const { db, path, services } = bootstrap();
    seedSharedLifecycle(path);
    const bystander = openDatabase(path);
    try {
      bystander.run("DELETE FROM estimate WHERE work_item_id = 'B'");
    } finally {
      bystander.close();
    }
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(0);
    expect(await services.optimizationLifecycle.finishDrain('A')).toBe('finished');
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'B'"))).toHaveLength(1);
    expect(db.all(sql.raw("SELECT id FROM work_item WHERE id = 'B'"))).toHaveLength(1);
    expect(db.all(sql.raw("SELECT id FROM step WHERE id = 'B-step'"))).toHaveLength(1);
    expect(db.all(sql.raw('PRAGMA foreign_key_check'))).toEqual([]);
  });

  it('restores populated deletion when a later recipient event insert fails', async () => {
    const { db, path, services, pushUrls } = bootstrap();
    seedSharedLifecycle(path, true, undefined, true);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(0);
    const before = lifecycleTables(db);
    const failure = openDatabase(path);
    try {
      failure.run(
        `CREATE TRIGGER fail_later_populated_event BEFORE INSERT ON event_log
         WHEN NEW.subscription = 'project:C'
         BEGIN SELECT RAISE(ABORT, 'later populated event failed'); END`,
      );
    } finally {
      failure.close();
    }
    expect(await rejectedMessage(services.optimizationLifecycle.finishDrain('A'))).toContain(
      'project:C',
    );
    expect(lifecycleTables(db)).toEqual(before);
    expect(pushUrls).toEqual([]);
    const restored = openDatabase(path);
    try {
      restored.run('DROP TRIGGER fail_later_populated_event');
    } finally {
      restored.close();
    }
    expect(await services.optimizationLifecycle.finishDrain('A')).toBe('finished');
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      (await events.rangeSince('project:B', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([[0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }]]);
    expect(
      (await events.rangeSince('project:C', -1)).map(({ seq, message }) => [seq, message]),
    ).toEqual([
      [0, { type: 'elsewhere_changed', projectId: 'C', causeProjectId: 'A' }],
      [1, { type: 'elsewhere_changed', projectId: 'C', causeProjectId: 'B' }],
    ]);
  });

  it('restores populated deletion when after-capture fails', async () => {
    let captures = 0;
    let failFinish = false;
    const { db, path, services, pushUrls } = bootstrap(undefined, () => {
      if (failFinish && ++captures === 2) throw new Error('populated after-capture fault');
    });
    seedSharedLifecycle(path, true, undefined, true);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(0);
    const before = lifecycleTables(db);
    failFinish = true;
    expect(await rejectedMessage(services.optimizationLifecycle.finishDrain('A'))).toContain(
      'populated after-capture fault',
    );
    expect(captures).toBe(2);
    expect(lifecycleTables(db)).toEqual(before);
    expect(pushUrls).toEqual([]);
    expect(db.all(sql.raw('PRAGMA foreign_key_check'))).toEqual([]);
  });

  it('releases the writer before held populated deletion delivery and preserves replay', async () => {
    const deliveryEntered = signal();
    const releaseDelivery = signal();
    const { db, path, services, pushUrls } = bootstrap(undefined, undefined, (url) => {
      pushUrls.push(url);
      deliveryEntered.resolve();
      return releaseDelivery.promise.then(() => new Response('gateway refused', { status: 400 }));
    });
    seedSharedLifecycle(path);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(0);
    const finishing = services.optimizationLifecycle.finishDrain('A');
    await deliveryEntered.promise;
    const second = openDatabase(path);
    let writerFailure: unknown;
    try {
      second.run('PRAGMA busy_timeout = 50');
      second.run("UPDATE project SET name = 'writer entered' WHERE id = 'B'");
    } catch (cause) {
      writerFailure = cause;
    } finally {
      second.close();
      releaseDelivery.resolve();
    }
    expect(await finishing).toBe('finished');
    expect(writerFailure).toBeUndefined();
    expect(db.all(sql.raw("SELECT id FROM project WHERE id = 'A'"))).toEqual([]);
    expect(pushUrls).toHaveLength(1);
    const events = new DrizzleEventLogStore(db, OPEN);
    const replay = await events.rangeSince('project:B', -1);
    expect(replay.map(({ seq, message }) => [seq, message])).toEqual([
      [0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }],
    ]);
    expect(await services.optimizationLifecycle.finishDrain('A')).toBe('absent');
    expect(await events.rangeSince('project:B', -1)).toEqual(replay);
    expect(db.all(sql.raw('PRAGMA foreign_key_check'))).toEqual([]);
  });

  it('keeps absent and open lifecycle outcomes silent', async () => {
    const { db, path, services, pushUrls } = bootstrap();
    seedSharedLifecycle(path);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(await services.optimizationLifecycle.beginDrain('missing', { at: 2, by: 'ada' })).toBe(
      0,
    );
    expect(await services.optimizationLifecycle.finishDrain('missing')).toBe('absent');
    expect(await services.optimizationLifecycle.finishDrain('A')).toBe('open');
    expect(await events.rangeSince('project:B', -1)).toEqual([]);
    expect(pushUrls).toEqual([]);
  });

  it('keeps an unranked-project drain begin silent without displayed displacement', async () => {
    const { db, path, services, pushUrls } = bootstrap();
    seedSharedLifecycle(path);
    db.run(sql`DELETE FROM project_rank WHERE project_id = 'A'`);
    const before = lifecycleTables(db);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(0);
    expect(await new DrizzleEventLogStore(db, OPEN).rangeSince('project:B', -1)).toEqual([]);
    expect(pushUrls).toEqual([]);
    expect(lifecycleTables(db).find(([table]) => table === 'event_sequencer')).toEqual(
      before.find(([table]) => table === 'event_sequencer'),
    );
  });

  for (const mode of ['legacy', 'isolated'] as const) {
    it(`keeps ${mode} direct lifecycle changes silent`, async () => {
      const { db, path, services, pushUrls } = bootstrap();
      seedSharedLifecycle(path, mode !== 'legacy');
      const settings = openDatabase(path);
      try {
        if (mode === 'isolated')
          settings.run("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
      } finally {
        settings.close();
      }
      const contractVersion = '7+0.2.0';
      db.run(sql`UPDATE project SET optimization_enabled = 1 WHERE id = 'A'`);
      allocateGeneration(db, 'A', contractVersion, 'mode-silence', 1);
      const events = new DrizzleEventLogStore(db, OPEN);
      expect(
        await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' }, contractVersion),
      ).toBe(0);
      expect(await services.optimizationLifecycle.finishDrain('A', contractVersion)).toBe(
        'finished',
      );
      expect(await events.rangeSince('project:B', -1)).toEqual([]);
      expect(pushUrls).toEqual([]);
    });
  }

  it('refuses a present active project with missing ownership before capture or drain writes', async () => {
    const captures: string[] = [];
    const { db, path, services, pushUrls } = bootstrap(undefined, (organizationId) => {
      captures.push(organizationId);
    });
    seedSharedLifecycle(path, true, 'A');
    const before = db.all<{ optimization_delete_pending_at: number | null }>(
      sql`SELECT optimization_delete_pending_at FROM project WHERE id = 'A'`,
    );
    expect(before).toHaveLength(1);
    expect(
      await rejectedMessage(services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })),
    ).toContain('active project A lacks organization ownership');
    expect(captures).toEqual([]);
    expect(
      db.all<{ optimization_delete_pending_at: number | null }>(
        sql`SELECT optimization_delete_pending_at FROM project WHERE id = 'A'`,
      ),
    ).toEqual(before);
    expect(await new DrizzleEventLogStore(db, OPEN).rangeSince('project:B', -1)).toEqual([]);
    expect(pushUrls).toEqual([]);
  });

  it('throws for a trusted owner mapping to a missing organization before capture', async () => {
    const captures: string[] = [];
    const { db, path, services, pushUrls } = bootstrap(undefined, (organizationId) => {
      captures.push(organizationId);
    });
    seedSharedLifecycle(path, true, 'A');
    const corrupt = openDatabase(path);
    try {
      corrupt.run('PRAGMA foreign_keys = OFF');
      corrupt.run(
        "INSERT INTO project_organization (resource_id, organization_id) VALUES ('A', 'missing-org')",
      );
    } finally {
      corrupt.close();
    }
    const before = lifecycleTables(db);
    expect(
      await rejectedMessage(services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })),
    ).toContain('project A has malformed organization ownership');
    expect(captures).toEqual([]);
    expect(lifecycleTables(db)).toEqual(before);
    expect(pushUrls).toEqual([]);
  });

  it('cannot store conflicting organization ownership for one project', () => {
    const { path } = bootstrap();
    seedSharedLifecycle(path);
    const duplicate = openDatabase(path);
    try {
      duplicate.run("INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)");
      expect(() =>
        duplicate.run(
          "INSERT INTO project_organization (resource_id, organization_id) VALUES ('A', 'org-b')",
        ),
      ).toThrow();
    } finally {
      duplicate.close();
    }
  });

  it('rejects missing installed capture before observing or writing a lifecycle change', async () => {
    const captures: string[] = [];
    const { db, path, services, pushUrls } = bootstrap(
      undefined,
      (organizationId) => {
        captures.push(organizationId);
      },
      undefined,
      true,
    );
    seedSharedLifecycle(path);
    const before = lifecycleTables(db);
    expect(
      await rejectedMessage(services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })),
    ).toContain('optimization lifecycle lacks borrowed ownership and capture');
    expect(captures).toEqual([]);
    expect(lifecycleTables(db)).toEqual(before);
    expect(pushUrls).toEqual([]);
  });

  it('rolls back the marker when the after-capture fails', async () => {
    let captures = 0;
    const { db, path, services, pushUrls } = bootstrap(undefined, () => {
      captures += 1;
      if (captures === 2) throw new Error('after-capture fault');
    });
    seedSharedLifecycle(path);
    const before = lifecycleTables(db);
    expect(
      await rejectedMessage(services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })),
    ).toContain('after-capture fault');
    expect(captures).toBe(2);
    expect(lifecycleTables(db)).toEqual(before);
    expect(pushUrls).toEqual([]);
  });

  it('retires a selected ready contract at an unchanged shared input hash', async () => {
    const { db, path, services, pushUrls } = bootstrap({
      solverVersion: '0.2.0',
      budgetMs: 1000,
      spawn: () => Promise.reject(new Error('retirement fixture must not launch')),
    });
    seedSharedLifecycle(path);
    const { contractVersion, inputHash, fastStart, selectedStart } = await seedReadyRetirement(
      db,
      services,
      1,
    );
    expect(fastStart).toBe(0);
    expect(selectedStart).toBe(1);
    const events = new DrizzleEventLogStore(db, OPEN);
    const siblingVersion = contractVersionOf('0.3.0');
    allocateGeneration(db, 'A', siblingVersion, inputHash, 1);
    expect(
      await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' }, siblingVersion),
    ).toBe(0);
    expect(await services.optimizationLifecycle.finishDrain('A', siblingVersion)).toBe('finished');
    expect(await events.rangeSince('project:B', -1)).toEqual([]);
    expect(
      await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' }, contractVersion),
    ).toBe(0);
    expect(await events.rangeSince('project:B', -1)).toEqual([]);
    expect(await services.optimizationLifecycle.finishDrain('A', contractVersion)).toBe('finished');
    expect((await events.rangeSince('project:B', -1)).map(({ message }) => message)).toEqual([
      { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' },
    ]);
    const after = await services.workItems.optimizationInput('A');
    if (after.kind !== 'scheduled') throw new Error('retirement removed the project');
    expect(scheduleInputHash(after.input)).toBe(inputHash);
    expect(pushUrls).toHaveLength(1);
  });

  it('keeps equal-display selected retirement silent', async () => {
    const { db, path, services, pushUrls } = bootstrap({
      solverVersion: '0.2.0',
      budgetMs: 1000,
      spawn: () => Promise.reject(new Error('equal-display fixture must not launch')),
    });
    seedSharedLifecycle(path);
    const { contractVersion, fastStart, selectedStart } = await seedReadyRetirement(
      db,
      services,
      0,
    );
    expect(selectedStart).toBe(fastStart);
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(
      await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' }, contractVersion),
    ).toBe(0);
    expect(await services.optimizationLifecycle.finishDrain('A', contractVersion)).toBe('finished');
    expect(await events.rangeSince('project:B', -1)).toEqual([]);
    expect(pushUrls).toEqual([]);
  });

  it('rolls back a later recipient event failure with selected contract retirement', async () => {
    const { db, path, services, pushUrls } = bootstrap({
      solverVersion: '0.2.0',
      budgetMs: 1000,
      spawn: () => Promise.reject(new Error('rollback fixture must not launch')),
    });
    seedSharedLifecycle(path, true, undefined, true);
    const { contractVersion, fastStart, selectedStart } = await seedReadyRetirement(
      db,
      services,
      1,
    );
    expect([fastStart, selectedStart]).toEqual([0, 1]);
    expect(
      await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' }, contractVersion),
    ).toBe(0);
    const before = lifecycleTables(db);
    const failure = openDatabase(path);
    try {
      failure.run(
        `CREATE TRIGGER fail_later_lifecycle_event BEFORE INSERT ON event_log
         WHEN NEW.subscription = 'project:C'
         BEGIN SELECT RAISE(ABORT, 'later lifecycle event failed'); END`,
      );
    } finally {
      failure.close();
    }
    expect(
      await rejectedMessage(services.optimizationLifecycle.finishDrain('A', contractVersion)),
    ).toContain('project:C');
    expect(lifecycleTables(db)).toEqual(before);
    expect(pushUrls).toEqual([]);
    const restored = openDatabase(path);
    try {
      restored.run('DROP TRIGGER fail_later_lifecycle_event');
    } finally {
      restored.close();
    }
    expect(await services.optimizationLifecycle.finishDrain('A', contractVersion)).toBe('finished');
    const events = new DrizzleEventLogStore(db, OPEN);
    expect((await events.rangeSince('project:B', -1)).map(({ message }) => message)).toEqual([
      { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' },
    ]);
    expect((await events.rangeSince('project:C', -1)).map(({ message }) => message)).toEqual([
      { type: 'elsewhere_changed', projectId: 'C', causeProjectId: 'A' },
    ]);
  });

  it('releases the writer before held event delivery', async () => {
    const deliveryEntered = signal();
    const releaseDelivery = signal();
    const calls: string[] = [];
    const { db, path, services } = bootstrap(
      {
        solverVersion: '0.2.0',
        budgetMs: 1000,
        spawn: () => Promise.reject(new Error('held-delivery fixture must not launch')),
      },
      undefined,
      (url) => {
        calls.push(url);
        deliveryEntered.resolve();
        return releaseDelivery.promise.then(() => Response.json({ delivered_to_sockets: 0 }));
      },
    );
    seedSharedLifecycle(path);
    const { contractVersion } = await seedReadyRetirement(db, services, 1);
    expect(
      await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' }, contractVersion),
    ).toBe(0);
    const finishing = services.optimizationLifecycle.finishDrain('A', contractVersion);
    await deliveryEntered.promise;
    const second = openDatabase(path);
    let writerFailure: unknown;
    try {
      second.run('PRAGMA busy_timeout = 50');
      second.run("UPDATE project SET name = 'writer entered' WHERE id = 'B'");
    } catch (cause) {
      writerFailure = cause;
    } finally {
      second.close();
      releaseDelivery.resolve();
    }
    expect(await finishing).toBe('finished');
    expect(writerFailure).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('keeps the committed event replayable after transport refusal', async () => {
    const { db, path, services } = bootstrap(
      {
        solverVersion: '0.2.0',
        budgetMs: 1000,
        spawn: () => Promise.reject(new Error('replay fixture must not launch')),
      },
      undefined,
      () => Promise.resolve(new Response('gateway refused', { status: 400 })),
    );
    seedSharedLifecycle(path);
    const { contractVersion } = await seedReadyRetirement(db, services, 1);
    expect(
      await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' }, contractVersion),
    ).toBe(0);
    expect(await services.optimizationLifecycle.finishDrain('A', contractVersion)).toBe('finished');
    const events = new DrizzleEventLogStore(db, OPEN);
    const replay = await events.rangeSince('project:B', -1);
    expect(replay.map(({ seq, message }) => [seq, message])).toEqual([
      [0, { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }],
    ]);
    expect(db.all<{ id: string }>(sql`SELECT id FROM project WHERE id = 'A'`)).toHaveLength(1);
    expect(
      db.all<{ project_id: string }>(
        sql`SELECT project_id FROM optimization_generation WHERE project_id = 'A' AND contract_version = ${contractVersion}`,
      ),
    ).toEqual([]);
    expect(await services.optimizationLifecycle.finishDrain('A', contractVersion)).toBe('absent');
    expect(await events.rangeSince('project:B', -1)).toEqual(replay);
  });

  it('retains the old shared bridge while an admitted child still holds the drain', async () => {
    const { db, path, services, pushUrls } = bootstrap();
    seedSharedLifecycle(path);
    const seed = openDatabase(path);
    try {
      seed.run(
        "INSERT INTO optimization_generation (project_id, contract_version, generation, input_hash, updated_at) VALUES ('A', '15+0.2.0', 1, 'old', 1)",
      );
      seed.run(
        `INSERT INTO solver_slot
         (project_id, contract_version, generation, objective, budget_ms, owner_id,
          attempt_token, lifecycle, pid, started_at, heartbeat_at, admitted_deadline_at)
         VALUES ('A', '15+0.2.0', 1, 'pri', 60000, 'worker', 'token', 'running', 4242, 1, 1, 60001)`,
      );
    } finally {
      seed.close();
    }
    const events = new DrizzleEventLogStore(db, OPEN);
    expect(await services.optimizationLifecycle.beginDrain('A', { at: 2, by: 'ada' })).toBe(1);
    expect(await services.optimizationLifecycle.finishDrain('A')).toBe('waiting');
    expect(
      db.all<{ id: string }>(sql`SELECT id FROM project WHERE id = 'A'`).map(({ id }) => id),
    ).toEqual(['A']);
    expect(
      db.all<{ project_id: string }>(
        sql`SELECT project_id FROM project_rank WHERE project_id = 'A'`,
      ),
    ).toHaveLength(1);
    expect(
      db.all<{ resource_id: string }>(
        sql`SELECT resource_id FROM project_organization WHERE resource_id = 'A'`,
      ),
    ).toHaveLength(1);
    expect(await events.rangeSince('project:B', -1)).toEqual([]);
    expect(pushUrls).toEqual([]);
  });

  for (const direction of ['execute', 'undo', 'redo'] as const) {
    it(`expires the scoped ${direction} grant after commit while delivery is held`, async () => {
      const { db, path, services } = bootstrap();
      const { ownerId } = await seedProject(db);
      const projects = new ProjectRepository(db, OPEN);
      const upstream = 'grant-upstream';
      const downstream = 'grant-downstream';
      const stepId = 'grant-step';
      const raw = openDatabase(path);
      raw.run(
        "INSERT INTO organization (id, name, created_at, shared_people) VALUES ('grant-org', 'Grant', 1, 1)",
      );
      raw.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
      raw.run(
        "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('grant-org', ?, 'member', 1)",
        [ownerId],
      );
      for (const [position, projectId] of [upstream, downstream].entries()) {
        await projects.createInOrganization(
          projectRow({ id: projectId, ownerId, name: projectId }),
          [
            {
              id: `${stepId}-${projectId}`,
              projectId,
              name: 'Step',
              position: 10,
              code: 'step',
              allowancePercent: 0,
            },
          ],
          { at: 1, by: ownerId },
          'grant-org',
        );
        raw.run(
          'INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES (?, ?, ?, 1, ?)',
          [projectId, 'grant-org', position * 10, ownerId],
        );
        raw.run(
          "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
          [projectId],
        );
        raw.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
          projectId,
          projectId,
          projectId,
        ]);
        raw.run(
          'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
          [projectId, `${stepId}-${projectId}`],
        );
      }
      raw.run("INSERT INTO person (id, name) VALUES ('grant-ana', 'Ana')");
      raw.run(
        "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('grant-ana', 'grant-org', 'Ana')",
      );
      for (const projectId of [upstream, downstream])
        raw.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
          projectId,
          `${stepId}-${projectId}`,
          'grant-ana',
        ]);
      const project = await projects.findById(upstream);
      if (project === null) throw new Error('upstream grant fixture disappeared');
      const retained: { admission?: EditAdmission } = {};
      let hold = false;
      let release!: () => void;
      let entered!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const deliveryEntered = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const runner = createPlanCommandRunner({
        uow: services.uow,
        publicServices: services,
        announcements: services.announcements,
        batchServices: (scope, broadcast, admission) => {
          retained.admission = admission;
          return services.batch(scope, broadcast, admission);
        },
        committedFanout: {
          now: () => 100,
          deliverCommitted: async () => {
            if (!hold) return;
            const writer = openDatabase(path);
            try {
              writer.run('UPDATE project SET name = ? WHERE id = ?', ['writer entered', upstream]);
            } finally {
              writer.close();
            }
            entered();
            await held;
          },
        },
      });
      const access = {
        kind: 'scoped' as const,
        scope: { organizationId: 'grant-org', userId: ownerId, role: 'member' as const },
      };
      const command = {
        kind: 'setEstimate' as const,
        workItemId: upstream,
        stepId: `${stepId}-${upstream}`,
        days: { optimistic: 3, realistic: 3, pessimistic: 3 },
      };
      if (direction !== 'execute') {
        expect((await runner.runWithin(upstream, ownerId, [command], access)).ok).toBe(true);
        if (direction === 'redo')
          expect((await runner.undoWithin(upstream, ownerId, access)).ok).toBe(true);
      }
      hold = true;
      const pending =
        direction === 'execute'
          ? runner.runWithin(upstream, ownerId, [command], access)
          : direction === 'undo'
            ? runner.undoWithin(upstream, ownerId, access)
            : runner.redoWithin(upstream, ownerId, access);
      await deliveryEntered;
      try {
        // Proof: awaiting post-commit delivery before runner.finally expired the
        // grant let this retained batch admission authorize writes after release.
        expect(retained.admission?.admits(project, ownerId)).toBe(false);
      } finally {
        release();
      }
      expect((await pending).ok).toBe(true);
      raw.close();
    });
  }
  it('saves an idle optimized capture without admitting solver state', async () => {
    const { db, path, services } = bootstrap({
      solverVersion: '2.4',
      budgetMs: 12_345,
      spawn: () => {
        throw new Error('captured scheduling admitted a solver process');
      },
    });
    const { projectId, ownerId } = await seedProject(db);
    await new ProjectRepository(db, OPEN).update(
      projectId,
      { optimizationEnabled: true, scheduleEngine: 'optimized', scheduleObjective: 'pri' },
      { at: 2, by: ownerId },
    );
    await new WorkItemRepository(db, OPEN).insert(
      {
        id: 'captured-work',
        projectId,
        parentId: null,
        position: 10,
        name: 'Captured work',
        notes: '',
        frozenNumber: null,
        priority: null,
        startNoEarlierThan: null,
        startNoEarlierThanReason: null,
        deadline: null,
        factStart: null,
        factEnd: null,
        readiness: null,
        hold: null,
        serviceTeamId: null,
        serviceId: null,
        maxParallel: 1,
        revision: 0,
      },
      [],
      { at: 2, by: ownerId },
    );
    const state = () => ({
      generations: db.select().from(optimizationGeneration).all(),
      slots: db.select().from(solverSlot).all(),
      queue: db.select().from(solverQueue).all(),
    });
    const before = state();
    const savedPlans = new SavedPlanService({
      scheduler: services.scheduler,
      digest: nodeDigest,
      capture: new SavedPlanCaptureRepository({ openConnection: () => openConnection(path) }),
      plans: new SavedPlanRepository({ openConnection: () => openConnection(path) }),
      newId: () => 'saved-idle',
      now: () => 3,
    });

    const saved = await savedPlans.save({
      projectId,
      name: 'idle optimized capture',
      createdBy: 'owner',
      createdById: ownerId,
    });

    expect(saved.outcome).toBe('saved');
    if (saved.outcome !== 'saved') return;
    expect(saved.record.schedule).toEqual({ present: false, absentReason: 'pending' });
    // Proof: routing capture through the live coordinator allocated generation 1
    // before save returned, instead of leaving all three admission tables empty.
    expect(state()).toEqual(before);
  });

  it('gives the broadcaster and the replay orchestrator the same buffer', async () => {
    // The wiring, not the classes. `GatewayBroadcaster` filling a buffer and
    // `ReplayOrchestrator` reading one were each proven in isolation, and both
    // proofs would have survived this file handing them two different buffers:
    // replay would still work, silently, off the database on every reconnect.
    //
    // Proof: `buffer: replayBuffer` in `services.ts` replaced with a freshly
    // constructed `new ReplayBuffer(...)` and only this test failed.
    const { db, services, pushUrls } = bootstrap();
    const { projectId, ownerId } = await seedProject(db);

    // Delivery is accepted by the injected transport; the assertion below
    // proves recording fills the shared buffer independently of gateway I/O.
    await services.workItems.create(projectId, ownerId, {
      parentId: null,
      afterId: null,
      name: 'Strip',
    });
    expect(pushUrls).toEqual(['http://gw.invalid/internal/push']);

    const subscription = `project:${projectId}`;
    const fromBuffer = await services.replay.replay({ [subscription]: -1 });
    expect(fromBuffer[subscription]).toMatchObject({ status: 'replaying' });

    // Emptying the log leaves the replay intact, which it could only do if the
    // event is in the buffer the orchestrator was handed.
    await new DrizzleEventLogStore(db, OPEN).pruneBeyond(0);
    expect(await services.replay.replay({ [subscription]: -1 })).toEqual(fromBuffer);
  });

  it('announces a marker write through the shared broadcaster', async () => {
    // The wiring again, and this one is why it is worth a second case.
    // `CalendarMarkerServiceOptions.broadcast` is optional and `announce` calls
    // it through `?.`, so a service built without one publishes nothing and
    // refuses nothing: every marker route test, service test and HTTP assertion
    // stayed green for two slices while the deployed process announced no
    // marker change at all (TASK-279, found by browser QA on deployed head
    // 4051512c). A test that deleted the argument and re-ran the marker suites
    // would have stayed green too — only a real `buildServices` driven through
    // a real write can tell.
    //
    // Proof: `broadcast: announcements` deleted from `services.ts` and only
    // this test and the sequence case below failed.
    const { db, services } = bootstrap();
    const { projectId, ownerId } = await seedProject(db);

    const subscription = `project:${projectId}`;
    const log = new DrizzleEventLogStore(db, OPEN);
    const before = await log.latestSeq(subscription);

    const written = await services.calendarMarkers.create(projectId, ownerId, {
      date: '2026-03-02',
      name: 'Freeze',
    });
    expect(written.ok).toBe(true);

    // Read back off the recorded stream rather than off a spy, because the
    // recording is what a reconnecting client is served and a spy would pass
    // for a service publishing into a broadcaster nothing else holds.
    expect(await services.replay.replay({ [subscription]: before })).toEqual({
      [subscription]: {
        status: 'replaying',
        events: [{ seq: before + 1, message: { type: 'calendar_markers_changed' } }],
      },
    });
  });

  it('advances the project sequence once per successful marker write and not at all for a refused one', async () => {
    // The other half of the defect. An event is a client's instruction to
    // re-read and the project's `seq` is what a resuming client counts from, so
    // a write that advanced it twice would make a second reader replay a change
    // it already has, and one that advanced it on a refusal would make every
    // reader refetch a list nothing touched.
    const { db, services } = bootstrap();
    const { projectId, ownerId } = await seedProject(db);

    const subscription = `project:${projectId}`;
    const log = new DrizzleEventLogStore(db, OPEN);
    const seq = () => log.latestSeq(subscription);
    const start = await seq();

    const markerId = crypto.randomUUID();
    expect(
      (
        await services.calendarMarkers.create(projectId, ownerId, {
          id: markerId,
          date: '2026-03-02',
          name: 'Freeze',
        })
      ).ok,
    ).toBe(true);
    expect(await seq()).toBe(start + 1);

    expect((await services.calendarMarkers.rename(projectId, markerId, ownerId, 'Thaw')).ok).toBe(
      true,
    );
    expect(await seq()).toBe(start + 2);

    expect(
      (await services.calendarMarkers.recolor(projectId, markerId, ownerId, '#3366cc')).ok,
    ).toBe(true);
    expect(await seq()).toBe(start + 3);

    // Refused *after* the project gate passed, which is the interesting half:
    // the store decides a marker's existence inside its own transaction, and
    // the announcement is downstream of that answer rather than of the gate.
    expect(
      await services.calendarMarkers.rename(projectId, crypto.randomUUID(), ownerId, 'Nobody'),
    ).toEqual({ ok: false, reason: 'not_found', about: 'marker' });
    expect(await seq()).toBe(start + 3);

    expect((await services.calendarMarkers.remove(projectId, markerId, ownerId)).ok).toBe(true);
    expect(await seq()).toBe(start + 4);

    // Exactly four events in that window and every one of them a marker change:
    // a count alone would survive a write that announced somebody else's event.
    expect(await services.replay.replay({ [subscription]: start })).toEqual({
      [subscription]: {
        status: 'replaying',
        events: [start + 1, start + 2, start + 3, start + 4].map((at) => ({
          seq: at,
          message: { type: 'calendar_markers_changed' },
        })),
      },
    });
  });

  it('changes nothing but seq in the work-items answer, once per marker write', async () => {
    // TASK-279 AC #4, and the assertion the browser QA finding needs to stay
    // fixed in both directions.
    //
    // A marker write must move the project's `seq` — that is the whole defect
    // this task was filed for, and the case above proves the event is recorded.
    // But `seq` is read inside `tree()` beside the plan the client is about to
    // redraw, so making it move is only half a fix: an implementation that
    // reordered work items, recomputed a schedule, or dropped a field on the
    // way through would also make `seq` advance, and every marker-side test
    // would stay green while the client redrew a different plan on an
    // annotation change.
    //
    // So the payload is compared **whole** with only `seq` deleted, and the
    // deletion is by name: anything else that moved fails here, including a
    // field this test does not know about, because nothing enumerates the keys.
    // `toEqual` catches a changed value, and a reordered array — it compares
    // arrays by position. What it does not see is a changed **key** order
    // inside an object, which is the same object to `toEqual` and a different
    // response to a client diffing text or hashing the body; `JSON.stringify`
    // is here for that one.
    const { db, services } = bootstrap();
    const { projectId, ownerId } = await seedProject(db);

    // **Three items, not one.** An empty tree is equal to itself whatever the
    // marker writes did, and a one-item tree is equal to itself under any
    // reordering there is — so the claim above about a reordered tree would be
    // untrue of a fixture with fewer than two rows. A parent and two children
    // give both a sibling order and a depth to lose (round-3 Gemini review).
    const strip = await services.workItems.create(projectId, ownerId, {
      parentId: null,
      afterId: null,
      name: 'Strip',
    });
    expect(strip.ok).toBe(true);
    const parentId = strip.ok ? strip.value.id : null;
    for (const name of ['Sand', 'Prime']) {
      expect(
        (await services.workItems.create(projectId, ownerId, { parentId, afterId: null, name })).ok,
      ).toBe(true);
    }

    // `tree` answers `null` for a project it cannot find. Narrowed here rather
    // than asserted away, because a `null` slipping through would make every
    // equality below hold vacuously — the one way this case could pass while
    // reading nothing at all.
    type Tree = Exclude<
      Awaited<ReturnType<typeof services.workItems.tree>>,
      { kind: 'engine_unavailable' } | null
    >;
    const treeOf = async (): Promise<Tree> => {
      const tree = await services.workItems.tree(projectId);
      expect(tree).not.toBeNull();
      if (tree === null || 'kind' in tree) throw new Error('the seeded project answered no tree');
      return tree;
    };

    // `delete` on a copy rather than a rest destructure, which lint reads as an
    // unused binding — and `delete` is what keeps the surviving keys in their
    // original order, which the `JSON.stringify` assertion below depends on.
    const withoutSeq = (tree: Tree): Record<string, unknown> => {
      const rest: Record<string, unknown> = { ...tree };
      delete rest['seq'];
      return rest;
    };

    const unchangedExceptSeq = (after: Tree, before: Tree): void => {
      expect(withoutSeq(after)).toEqual(withoutSeq(before));
      expect(JSON.stringify(withoutSeq(after))).toBe(JSON.stringify(withoutSeq(before)));
      // Exactly one, not "more than before": a write announced twice makes
      // every other reader replay a change it already has.
      expect(after.seq).toBe(before.seq + 1);
    };

    // All four writes, in the order a composer makes them, each compared with
    // the read before it rather than with the baseline — an equality that only
    // held across the whole run would pass for two mutations that cancelled.
    const markerId = crypto.randomUUID();
    const baseline = await treeOf();

    expect(
      (
        await services.calendarMarkers.create(projectId, ownerId, {
          id: markerId,
          date: '2026-03-02',
          name: 'Freeze',
        })
      ).ok,
    ).toBe(true);
    const created = await treeOf();
    unchangedExceptSeq(created, baseline);

    expect((await services.calendarMarkers.rename(projectId, markerId, ownerId, 'Thaw')).ok).toBe(
      true,
    );
    const renamed = await treeOf();
    unchangedExceptSeq(renamed, created);

    expect(
      (await services.calendarMarkers.recolor(projectId, markerId, ownerId, '#3366cc')).ok,
    ).toBe(true);
    const recoloured = await treeOf();
    unchangedExceptSeq(recoloured, renamed);

    expect((await services.calendarMarkers.remove(projectId, markerId, ownerId)).ok).toBe(true);
    unchangedExceptSeq(await treeOf(), recoloured);
  });

  it('returns engine unavailable from the real service graph without an optimizer adapter', async () => {
    const { db, services } = bootstrap();
    const { projectId, ownerId } = await seedProject(db);
    await services.workItems.create(projectId, ownerId, {
      parentId: null,
      afterId: null,
      name: 'Must not receive Fast dates',
    });
    await new ProjectRepository(db, OPEN).update(
      projectId,
      { optimizationEnabled: true, scheduleEngine: 'optimized' },
      { at: 2, by: ownerId },
    );

    const tree = await services.workItems.tree(projectId);

    expect(tree).toEqual({
      kind: 'engine_unavailable',
      error: 'engine_unavailable',
      engine: 'optimized',
    });
    expect(tree === null || 'slices' in tree).toBe(false);
  });

  it('commits a batch and durably announces one unavailable plan without a Fast tree', async () => {
    const { db, services } = bootstrap();
    const { projectId, ownerId } = await seedProject(db);
    await new ProjectRepository(db, OPEN).update(
      projectId,
      { optimizationEnabled: true, scheduleEngine: 'optimized' },
      { at: 1, by: ownerId },
    );
    const runner = createPlanCommandRunner({
      batchServices: services.batch,
      publicServices: services,
      uow: services.uow,
      announcements: services.announcements,
    });

    const applied = await runner.run(projectId, ownerId, [
      {
        kind: 'createWorkItem',
        ref: 'created',
        parentId: null,
        afterId: null,
        name: 'Committed before publication',
      },
    ]);

    expect(applied.ok).toBe(true);
    expect(
      (await new WorkItemRepository(db, OPEN).listByProject(projectId)).map((row) => row.name),
    ).toEqual(['Committed before publication']);
    expect(await services.workItems.tree(projectId)).toEqual({
      kind: 'engine_unavailable',
      error: 'engine_unavailable',
      engine: 'optimized',
    });
    const events = await new DrizzleEventLogStore(db, OPEN).rangeSince(
      subscriptionFor(projectId),
      -1,
    );
    expect(events.map((event) => event.message)).toEqual([
      { type: 'plan_unavailable', error: 'engine_unavailable', engine: 'optimized' },
    ]);
    expect(
      events.some((event) => (event.message as { type?: unknown }).type === 'tree_replaced'),
    ).toBe(false);

    const refused = await runner.run(projectId, ownerId, [
      {
        kind: 'setEstimate',
        workItemId: 'missing',
        stepId: 'missing',
        days: { optimistic: 1, realistic: 1, pessimistic: 1 },
      },
    ]);
    expect(refused.ok).toBe(false);
    expect(
      await new DrizzleEventLogStore(db, OPEN).rangeSince(subscriptionFor(projectId), -1),
    ).toHaveLength(1);
  });

  it('builds one available optimizer whose first enabled read launches both release-keyed variants', async () => {
    // This is the process graph, not an OptimizationCoordinator unit test. The
    // child process is the external boundary; SQLite admission, project gating,
    // plan reading and request composition are real. Proof: leave
    // `optimizerWiring(undefined)` in services.ts and the setting write refuses
    // `optimizer_unavailable`; wire availability without the reader and no
    // launch arrives here.
    const spawned: ReservedSpawnRequest[] = [];
    const { db, services } = bootstrap({
      solverVersion: '0.2.0',
      budgetMs: 60_000,
      spawn: (request) => {
        spawned.push(request);
        const empty = () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.close();
            },
          });
        return Promise.resolve({
          pid: 10_000 + spawned.length,
          stdout: empty(),
          stderr: empty(),
          exited: Promise.resolve(1),
          verdict: () => undefined,
          kill: () => undefined,
        });
      },
    });
    const { projectId, ownerId } = await seedProject(db);
    await services.workItems.create(projectId, ownerId, {
      parentId: null,
      afterId: null,
      name: 'Rewire',
    });

    expect(
      await services.projects.update(projectId, ownerId, {
        optimizationEnabled: true,
        scheduleEngine: 'fast',
      }),
    ).toHaveProperty('ok', true);
    await services.workItems.tree(projectId);
    await services.optimizer?.drain();

    expect(spawned.map((request) => request.objective)).toEqual(['pri', 'time']);
    expect(
      spawned.map((request) => [
        request.request.solverVersion,
        request.request.contractVersion,
        request.request.budgetMs,
      ]),
    ).toEqual([
      // The current solver release composes with the current scheduler contract.
      ['0.2.0', '15+0.2.0', 60_000],
      ['0.2.0', '15+0.2.0', 60_000],
    ]);
  });

  it('starts current solves instead of reading a pre-fix failed pair', async () => {
    const legacyContract = '7+0.2.0';
    const currentSolver = readRuntimeSolverVersion('development');
    const spawned: ReservedSpawnRequest[] = [];
    const { db, services } = bootstrap({
      solverVersion: currentSolver,
      budgetMs: 60_000,
      spawn: (request) => {
        spawned.push(request);
        const empty = () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.close();
            },
          });
        return Promise.resolve({
          pid: 20_000 + spawned.length,
          stdout: empty(),
          stderr: empty(),
          exited: Promise.resolve(1),
          verdict: () => undefined,
          kill: () => undefined,
        });
      },
    });
    const { projectId, ownerId } = await seedProject(db);
    await services.workItems.create(projectId, ownerId, {
      parentId: null,
      afterId: null,
      name: 'Rewire',
    });
    const input = await services.workItems.scheduleInput(projectId);
    if (input === null) throw new Error('seeded project has no schedule input');
    const inputHash = scheduleInputHash(input);
    const generation = allocateGeneration(db, projectId, legacyContract, inputHash, 1);
    db.insert(optimizedScheduleCache)
      .values(
        (['pri', 'time'] as const).map((objective) => ({
          projectId,
          inputHash,
          objective,
          contractVersion: legacyContract,
          budgetMs: 60_000,
          generation,
          status: 'failed' as const,
          resultJson: null,
          failureReason: 'internal-error' as const,
          createdAt: 1,
        })),
      )
      .run();

    expect(
      await services.projects.update(projectId, ownerId, {
        optimizationEnabled: true,
        scheduleEngine: 'fast',
      }),
    ).toHaveProperty('ok', true);
    await services.workItems.tree(projectId);
    await services.optimizer?.drain();

    expect(currentSolver).toBe('0.2.0');
    // Proof: hard-coding `services.ts`'s coordinator key to `7+0.2.0` read the
    // seeded failed pair and failed here with `Expected ["pri", "time"] /
    // Received []`; watched 2026-09-07.
    expect(spawned.map(({ objective }) => objective)).toEqual(['pri', 'time']);
    expect(spawned.map(({ key }) => key.contractVersion)).toEqual(['15+0.2.0', '15+0.2.0']);
    expect(
      db
        .select({ contractVersion: optimizedScheduleCache.contractVersion })
        .from(optimizedScheduleCache)
        .all()
        .filter(({ contractVersion }) => contractVersion === legacyContract),
    ).toHaveLength(2);
  });

  it('returns a live plan read while its newly admitted solver is still unresolved', async () => {
    const entered = signal();
    const release = signal();
    const { db, services } = bootstrap({
      solverVersion: readRuntimeSolverVersion('development'),
      budgetMs: 60_000,
      spawn: async () => {
        entered.resolve();
        await release.promise;
        const empty = () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.close();
            },
          });
        return {
          pid: 31_001,
          stdout: empty(),
          stderr: empty(),
          exited: Promise.resolve(1),
          verdict: () => undefined,
          kill: () => undefined,
        };
      },
    });
    const { projectId, ownerId } = await seedProject(db);
    await services.workItems.create(projectId, ownerId, {
      parentId: null,
      afterId: null,
      name: 'Rewire',
    });
    expect(
      await services.projects.update(projectId, ownerId, {
        optimizationEnabled: true,
        scheduleEngine: 'optimized',
      }),
    ).toHaveProperty('ok', true);

    const treePromise = services.workItems.tree(projectId);
    await entered.promise;
    let tree: Awaited<typeof treePromise>;
    try {
      // Proof: keeping the spawned solver unresolved while awaiting this read fails by test timeout
      // if the read waits for solver completion.
      tree = await treePromise;
    } finally {
      release.resolve();
    }
    expect(tree).not.toBeNull();
    await services.optimizer?.drain();
  });
});
