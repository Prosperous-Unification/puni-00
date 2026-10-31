import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AuthenticatedUser } from '@wbs/contracts';
import type { CredentialPin, PlanCommand, ResourceAccess } from '@wbs/core';
import { clockOf, CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { CLAIM_LEASE_MS, LEASE_RENEWAL_RESOLUTION_MS } from '@wbs/domain';
import { afterEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import fc from 'fast-check';

import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';
import { CAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const DEFAULTS = {
  maxAgentPersons: 50,
  maxConcurrentClaims: 200,
  maxCapacityUnitsPerResource: 10_000,
};
const T = 1_000_000_000;
const SEED = 20261027;
const LEAVES = 4;
const AGENT = 'codex';
/** The runs one credential's processes opt into; null is a process without `wbs_run`. */
const RUNS = ['a', 'b', null] as const;
type Run = (typeof RUNS)[number];
const admin: ResourceAccess = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'dany', role: 'admin' },
};

/** Verified-principal fixture: preserve the same person's optional run in command admission. */
function principalOf(pin: CredentialPin | null): AuthenticatedUser {
  return {
    id: 'dany',
    username: 'dany',
    scopes: ['write'],
    ...(pin === null
      ? {}
      : {
          authentication: {
            kind: 'machine' as const,
            credentialId: 'fixture-credential',
            personId: pin.personId,
            ...(pin.runId === undefined ? {} : { runId: pin.runId }),
          },
        }),
  };
}

let directory: string | null = null;
let source: SqliteSource | null = null;

afterEach(async () => {
  await source?.close();
  if (directory !== null) rmSync(directory, { recursive: true, force: true });
  source = null;
  directory = null;
});

/** A fresh store: organization A, Dany its admin, the agent `codex`, and `LEAVES` root leaves. */
async function openWorld(clock: { now: number }) {
  await source?.close();
  if (directory !== null) rmSync(directory, { recursive: true, force: true });
  directory = mkdtempSync(join(tmpdir(), 'claim-run-lease-'));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, folder);
  const opened = openSqliteSource({
    dbPath,
    dependencyCapability: CAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    organizationDefaultLimits: DEFAULTS,
  });
  source = opened;
  opened.db.run(sql`INSERT INTO users (id, username, created_at) VALUES ('dany', 'dany', 1)`);
  opened.db.run(sql`INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)`);
  opened.db.run(
    sql`INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'dany', 'admin', 1)`,
  );
  opened.db.run(
    sql`INSERT INTO person (id, name, kind, account_id) VALUES (${AGENT}, ${AGENT}, 'agent', 'dany')`,
  );
  opened.db.run(
    sql`INSERT INTO person_organization (resource_id, organization_id, name) VALUES (${AGENT}, 'org-a', ${AGENT})`,
  );
  const options = {
    admission: CREATOR_ADMISSION,
    clock: clockOf({ now: () => clock.now, newId: () => crypto.randomUUID() }),
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
    dependencyContext: createLocalDependencyContext(opened.stores),
  };
  const graph = servicesOver(opened.stores, options);
  const created = await graph.projects.create('Runs', 'dany');
  if (typeof created === 'string') throw new Error(`run fixture project refused: ${created}`);
  const projectId = created.project.id;
  const firstStep = created.steps.at(0);
  if (firstStep === undefined) throw new Error('run fixture first step missing');
  opened.db.run(
    sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${projectId}, 'org-a')`,
  );
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: opened.uow,
    announcements: options.broadcast,
    publicServices: graph,
    batchServices: (scope, announcements, admission, context) =>
      servicesOver(scope.stores, {
        ...options,
        broadcast: announcements,
        admission,
        dependencyContext: { kind: 'bound', context },
      }),
  });
  /** The pin a grant of `codex` carries: its run when the process opted in. */
  const pinOf = (run: Run): CredentialPin =>
    run === null ? { personId: AGENT } : { personId: AGENT, runId: run };
  const run = (commands: PlanCommand[], pin: CredentialPin | null) =>
    runner.runWithin(
      projectId,
      principalOf(pin),
      // Model claims use the first runnable step; later steps retain their workflow prerequisites.
      commands.map((command) =>
        command.kind === 'claimWorkItem' ? { ...command, steps: [firstStep.id] } : command,
      ),
      admin,
    );
  const plan = await run(
    Array.from({ length: LEAVES }, (_, n): PlanCommand => ({
      kind: 'createWorkItem',
      ref: `leaf-${String(n)}`,
      name: `Leaf ${String(n)}`,
      parentId: null,
      afterId: null,
    })),
    null,
  );
  if (!plan.ok) throw new Error(`the plan was refused: ${JSON.stringify(plan)}`);
  opened.db.run(
    sql`UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1`,
  );
  const leafIds = plan.results.map(({ id }) => id ?? '');
  return { db: opened.db, projectId, runner, run, pinOf, leafIds };
}

type World = Awaited<ReturnType<typeof openWorld>>;

/** Per leaf, the run `codex` holds it under and its lease expiry. */
interface Model {
  readonly held: Map<number, { run: Run; expiresAt: number }>;
  readonly clock: { now: number };
}

interface Real {
  readonly world: World;
}

/**
 * A renewal at the model's instant by `run`: its own leases and the person's
 * no-run ones; null renews every lease of the person (M15).
 */
function renewIn(model: Model, run: Run): void {
  const at = model.clock.now;
  for (const lease of model.held.values()) {
    if (run !== null && lease.run !== run && lease.run !== null) continue;
    if (at < lease.expiresAt && lease.expiresAt < at + CLAIM_LEASE_MS - LEASE_RENEWAL_RESOLUTION_MS)
      lease.expiresAt = at + CLAIM_LEASE_MS;
  }
}

/** The model's claim by `run` on `leaf`: the outcome it expects, applied when it succeeds. */
function claimIn(model: Model, leaf: number, run: Run): 'ok' | 'already_claimed' {
  const held = model.held.get(leaf);
  // A run adopts its person's no-run claim as held, never restamping it.
  if (held !== undefined && held.run !== run && !(run !== null && held.run === null))
    return 'already_claimed';
  renewIn(model, run);
  if (held === undefined)
    model.held.set(leaf, { run, expiresAt: model.clock.now + CLAIM_LEASE_MS });
  return 'ok';
}

/** The model's release by `run` of `leaf`, under M15's release rule. */
function releaseIn(model: Model, leaf: number, run: Run): 'ok' | 'not_claimed_by' | 'run_mismatch' {
  const held = model.held.get(leaf);
  if (held === undefined) return 'not_claimed_by';
  if (run !== null && held.run !== run && held.run !== null) return 'run_mismatch';
  const kept = [...model.held].filter(([each]) => each !== leaf);
  model.held.clear();
  for (const [each, lease] of kept) model.held.set(each, lease);
  renewIn(model, run);
  return 'ok';
}

function sweepIn(model: Model): void {
  const kept = [...model.held].filter(([, lease]) => lease.expiresAt > model.clock.now);
  model.held.clear();
  for (const [each, lease] of kept) model.held.set(each, lease);
}

function claimCommand(world: World, leaf: number): PlanCommand {
  return { kind: 'claimWorkItem', workItemId: world.leafIds.at(leaf) ?? '', personId: AGENT };
}

/** After every command the store holds exactly the model's claims, runs and expiries. */
function expectStoreMatches(model: Model, world: World): void {
  const stored = world.db.all<{ w: string; r: string | null; e: number | null }>(
    sql`SELECT DISTINCT work_item_id AS w, run_id AS r, lease_expires_at AS e FROM claim`,
  );
  const expected = [...model.held].map(([leaf, lease]) => ({
    w: world.leafIds.at(leaf) ?? '',
    r: lease.run,
    e: lease.expiresAt,
  }));
  const byItem = (left: { w: string }, right: { w: string }) => (left.w < right.w ? -1 : 1);
  expect(stored.sort(byItem)).toEqual(expected.sort(byItem));
}

const counts = { races: 0, mismatches: 0, otherRunRenewals: 0, noRunRenewals: 0 };

class Claim implements fc.AsyncCommand<Model, Real> {
  constructor(
    readonly leaf: number,
    readonly under: Run,
  ) {}
  check = () => true;
  async run(model: Model, real: Real): Promise<void> {
    const expected = claimIn(model, this.leaf, this.under);
    const outcome = await real.world.run(
      [claimCommand(real.world, this.leaf)],
      real.world.pinOf(this.under),
    );
    expect(outcome).toMatchObject(
      expected === 'ok' ? { ok: true } : { ok: false, reason: expected },
    );
    expectStoreMatches(model, real.world);
  }
  toString = () => `claim(${String(this.leaf)}, ${String(this.under)})`;
}

class Release implements fc.AsyncCommand<Model, Real> {
  constructor(
    readonly leaf: number,
    readonly under: Run,
  ) {}
  check = () => true;
  async run(model: Model, real: Real): Promise<void> {
    const expected = releaseIn(model, this.leaf, this.under);
    if (expected === 'run_mismatch') counts.mismatches += 1;
    const outcome = await real.world.run(
      [
        {
          kind: 'releaseWorkItem',
          workItemId: real.world.leafIds.at(this.leaf) ?? '',
          personId: AGENT,
        },
      ],
      real.world.pinOf(this.under),
    );
    expect(outcome).toMatchObject(
      expected === 'ok' ? { ok: true } : { ok: false, reason: expected },
    );
    expectStoreMatches(model, real.world);
  }
  toString = () => `release(${String(this.leaf)}, ${String(this.under)})`;
}

class Heartbeat implements fc.AsyncCommand<Model, Real> {
  constructor(readonly under: Run) {}
  check = () => true;
  async run(model: Model, real: Real): Promise<void> {
    if (
      [...model.held.values()].some(
        (lease) => this.under === null && lease.run !== null && lease.expiresAt > model.clock.now,
      )
    )
      counts.otherRunRenewals += 1;
    if (
      [...model.held.values()].some(
        (lease) => this.under !== null && lease.run === null && lease.expiresAt > model.clock.now,
      )
    )
      counts.noRunRenewals += 1;
    renewIn(model, this.under);
    await real.world.runner.renewLeases(AGENT, this.under);
    expectStoreMatches(model, real.world);
  }
  toString = () => `heartbeat(${String(this.under)})`;
}

class Advance implements fc.AsyncCommand<Model, Real> {
  constructor(readonly ms: number) {}
  check = () => true;
  async run(model: Model, real: Real): Promise<void> {
    model.clock.now += this.ms;
    await Promise.resolve();
    expectStoreMatches(model, real.world);
  }
  toString = () => `advance(${String(this.ms)})`;
}

class Sweep implements fc.AsyncCommand<Model, Real> {
  check = () => true;
  async run(model: Model, real: Real): Promise<void> {
    sweepIn(model);
    await real.world.runner.releaseExpiredLeases(real.world.projectId);
    expectStoreMatches(model, real.world);
  }
  toString = () => 'sweep';
}

/**
 * A heartbeat of one run racing a claim of another (or the same) run at one
 * instant, queued in either order. Both renew only leases in force and due at
 * that instant, and a fresh claim's lease is never due, so the outcome is the
 * model's in either order. (A sweep is not raced here: a claim queued before
 * it would meet a lease the sweep then takes, which is an order, not a race
 * outcome; `claim-lease-race.db.test.ts` races the sweep.)
 */
class Race implements fc.AsyncCommand<Model, Real> {
  constructor(
    readonly heartbeatRun: Run,
    readonly leaf: number,
    readonly claimRun: Run,
    readonly heartbeatFirst: boolean,
  ) {}
  check = () => true;
  async run(model: Model, real: Real): Promise<void> {
    counts.races += 1;
    renewIn(model, this.heartbeatRun);
    const expected = claimIn(model, this.leaf, this.claimRun);
    const heartbeat = () => real.world.runner.renewLeases(AGENT, this.heartbeatRun);
    const claim = () =>
      real.world.run([claimCommand(real.world, this.leaf)], real.world.pinOf(this.claimRun));
    const [, claimed] = this.heartbeatFirst
      ? await Promise.all([heartbeat(), claim()])
      : (await Promise.all([claim(), heartbeat()])).reverse();
    expect(claimed).toMatchObject(
      expected === 'ok' ? { ok: true } : { ok: false, reason: expected },
    );
    expectStoreMatches(model, real.world);
  }
  toString = () =>
    `race(heartbeat ${String(this.heartbeatRun)}, claim ${String(this.leaf)} ${String(this.claimRun)}, ${this.heartbeatFirst ? 'heartbeat' : 'claim'} first)`;
}

const leafArb = fc.integer({ min: 0, max: LEAVES - 1 });
const runArb = fc.constantFrom<Run>(...RUNS);
const claimArb = fc.tuple(leafArb, runArb).map(([leaf, run]) => new Claim(leaf, run));
const releaseArb = fc.tuple(leafArb, runArb).map(([leaf, run]) => new Release(leaf, run));
// Claims and releases twice over, so runs hold leaves often enough to refuse.
const commandArbs = [
  claimArb,
  claimArb,
  releaseArb,
  releaseArb,
  runArb.map((run) => new Heartbeat(run)),
  fc
    .constantFrom(30_000, 2 * 60_000, 14 * 60_000, CLAIM_LEASE_MS - 1, CLAIM_LEASE_MS)
    .map((ms) => new Advance(ms)),
  fc.constant(new Sweep()),
  fc
    .tuple(runArb, leafArb, runArb, fc.boolean())
    .map(([heartbeatRun, leaf, claimRun, first]) => new Race(heartbeatRun, leaf, claimRun, first)),
];

describe('run-scoped leases as a model (wbs-mcp-agent-surface M15)', () => {
  /**
   * One credential's processes under runs `a` and `b`, and one without a run,
   * claim, release and heartbeat while the clock moves and sweeps run, and a
   * heartbeat races a claim in either order. After every
   * command the store holds exactly the model's claims, runs and expiries: a
   * run renews its own leases and the person's no-run ones (by heartbeat or
   * by any committed batch), no run renews every lease of the person, a run
   * adopts its person's no-run claim as held, a release under a run takes
   * only that run's or a no-run claim, and nothing depends on which turn came
   * first.
   *
   * Proof, each watched 2026-10-27 with this generator and seed: with the
   * run filter dropped from `ClaimRepository.renewLeases`, fast-check shrank
   * to `race(heartbeat a, claim 0 b), advance(840000), heartbeat(a)` (run
   * a's heartbeat moved run b's lease); with its no-run half dropped, to
   * `claim(0, a), race(…, claim 1 null), advance(899999), release(0, a)`
   * (run a's release left the no-run lease where it was); with `null` for the
   * run in the batch renewal (plan-commands.feature.ts), to `race(…, claim 1
   * null), claim(0, a), advance(899999), release(1, b)`; with
   * `isNull(claim.runId)` for a null run, to `claim(0, a), advance(120000),
   * claim(1, null)`; with the adoption dropped from `decideClaim`, to
   * `claim(1, null), claim(1, a)` (refused already_claimed naming itself).
   */
  it('holds exactly the model’s runs and leases, whatever the turn order', async () => {
    counts.races = 0;
    counts.mismatches = 0;
    counts.otherRunRenewals = 0;
    counts.noRunRenewals = 0;
    await fc.assert(
      fc.asyncProperty(fc.commands(commandArbs, { maxCommands: 24 }), async (commands) => {
        const clock = { now: T };
        const world = await openWorld(clock);
        await fc.asyncModelRun(
          () => ({ model: { held: new Map(), clock }, real: { world } }),
          commands,
        );
      }),
      { numRuns: 100, seed: SEED },
    );
    // The runs reached the races, the refusals and the cross-run renewals.
    expect({
      races: counts.races > 40,
      mismatches: counts.mismatches > 5,
      otherRunRenewals: counts.otherRunRenewals > 5,
      noRunRenewals: counts.noRunRenewals > 5,
    }).toEqual({ races: true, mismatches: true, otherRunRenewals: true, noRunRenewals: true });
  }, 240_000);
});
