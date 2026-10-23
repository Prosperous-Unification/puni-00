import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CredentialPin, PlanCommand, ResourceAccess, Scope } from '@wbs/core';
import { clockOf, CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { ClaimLeaseSweep } from '@wbs/core/module/plan-commands/claim-lease-sweep';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { CLAIM_LEASE_MS } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { ConsentCredentialRepository } from './consent-credential';
import { MachineCredentialAdministrationRepository } from './machine-credential-administration';
import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const DEFAULTS = {
  maxAgentPersons: 50,
  maxConcurrentClaims: 200,
  maxCapacityUnitsPerResource: 10_000,
};
const T = 1_000_000_000;
const MINUTE = 60_000;
const SLOT = 'resource-slot';

const admin: ResourceAccess = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'dany', role: 'admin' },
};
const pinned = (personId: string): CredentialPin => ({ personId });

let directory: string;
let source: SqliteSource;
let now = T;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'claim-lease-'));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, folder);
  source = openSqliteSource({ dbPath, organizationDefaultLimits: DEFAULTS });
  now = T;
});

afterEach(async () => {
  await source.close();
  rmSync(directory, { recursive: true, force: true });
});

/**
 * Organization A (claims cap `cap`), Dany its admin, agents `codex` and
 * `claire` and the human `ann`, one project of A with a parent over two
 * leaves and three root leaves, and an exclusive slot of capacity 1 that the
 * first two root leaves each demand. The clock is `now`, moved by the test.
 */
async function seeded(cap = 40) {
  source.db.run(sql`INSERT INTO users (id, username, created_at) VALUES ('dany', 'dany', 1)`);
  source.db.run(sql`INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)`);
  source.db.run(
    sql`INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'dany', 'admin', 1)`,
  );
  source.db.run(
    sql`INSERT INTO organization_limits (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at) VALUES ('org-a', 50, ${cap}, 10000, 1)`,
  );
  for (const [id, kind] of [
    ['codex', 'agent'],
    ['claire', 'agent'],
    ['ann', 'person'],
  ] as const) {
    source.db.run(
      sql`INSERT INTO person (id, name, kind, account_id) VALUES (${id}, ${id}, ${kind}, 'dany')`,
    );
    source.db.run(
      sql`INSERT INTO person_organization (resource_id, organization_id, name) VALUES (${id}, 'org-a', ${id})`,
    );
  }
  source.db.run(
    sql`INSERT INTO resource (id, name, kind, unit_label) VALUES (${SLOT}, 'slot', 'exclusive', '')`,
  );
  source.db.run(
    sql`INSERT INTO resource_organization (resource_id, organization_id, name) VALUES (${SLOT}, 'org-a', 'slot')`,
  );
  const clock = clockOf({ now: () => now, newId: () => crypto.randomUUID() });
  const broadcast = recordingBroadcaster();
  const options = { admission: CREATOR_ADMISSION, clock, broadcast, scheduler: fastScheduler };
  const graph = servicesOver(source.stores, options);
  const created = await graph.projects.create('Leases', 'dany');
  const projectId = created.project.id;
  source.db.run(
    sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${projectId}, 'org-a')`,
  );
  const runner = createPlanCommandRunner({
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, { ...options, broadcast: announcements }),
  });
  /** One batch by Dany's account, under an agent's credential or a session (null). */
  const run = (commands: PlanCommand[], credential: CredentialPin | null) =>
    runner.runWithin(projectId, 'dany', commands, admin, credential);
  const plan = await run(
    [
      { kind: 'createWorkItem', ref: 'parent', name: 'Parent', parentId: null, afterId: null },
      { kind: 'createWorkItem', ref: 'one', name: 'One', parentId: null, afterId: null },
      { kind: 'createWorkItem', ref: 'two', name: 'Two', parentId: null, afterId: null },
      { kind: 'createWorkItem', ref: 'three', name: 'Three', parentId: null, afterId: null },
      { kind: 'setResourceCapacity', resourceId: SLOT, units: 1 },
      { kind: 'setDemand', workItemRef: 'one', resourceId: SLOT, units: 1 },
      { kind: 'setDemand', workItemRef: 'two', resourceId: SLOT, units: 1 },
    ],
    null,
  );
  if (!plan.ok) throw new Error(`the plan was refused: ${JSON.stringify(plan)}`);
  const [parent, one, two, three] = plan.results.map(({ id }) => id ?? '');
  const nested = await run(
    [{ kind: 'createWorkItem', name: 'Inner', parentId: parent, afterId: null }],
    null,
  );
  if (!nested.ok) throw new Error(`the inner leaf was refused: ${JSON.stringify(nested)}`);
  const inner = nested.results[0]?.id ?? '';
  const [firstStep] = created.steps.map(({ id }) => id);
  /** A claim of a leaf's first step, or of a non-leaf's subtree. */
  const claim = (workItemId: string, personId: string, extra: { parentClaim?: string } = {}) =>
    ({
      kind: 'claimWorkItem',
      workItemId,
      personId,
      runId: `run-${personId}`,
      ...(workItemId === parent ? {} : { steps: [firstStep] }),
      ...extra,
    }) as PlanCommand;
  const leases = () =>
    source.db.all<{ person_id: string; work_item_id: string; lease: number | null }>(
      sql`SELECT person_id, work_item_id, lease_expires_at AS lease FROM claim ORDER BY person_id, work_item_id`,
    );
  const count = (query: ReturnType<typeof sql>) => source.db.get<{ n: number }>(query).n;
  return {
    projectId,
    runner,
    run,
    claim,
    leases,
    items: { parent, inner, one, two, three },
    claims: () => count(sql`SELECT count(*) AS n FROM claim`),
    occupancy: () => count(sql`SELECT count(*) AS n FROM claim_occupancy`),
    stackEntries: () => count(sql`SELECT count(*) AS n FROM command_journal`),
    history: () =>
      source.db.all<{ kind: string; label: string; user_id: string }>(
        sql`SELECT kind, label, user_id FROM plan_event WHERE label LIKE '%(%' ORDER BY created_at, id`,
      ),
  };
}

/** The claim ids a one-claim batch answered. */
function claimIdsOf(outcome: Awaited<ReturnType<Awaited<ReturnType<typeof seeded>>['run']>>) {
  if (!outcome.ok) throw new Error(JSON.stringify(outcome));
  const applied = outcome.results.at(0);
  if (applied?.kind !== 'claimWorkItem') throw new Error('the batch claimed nothing');
  return applied.claimIds;
}

/** A machine credential of org A pinned to `personId`, issued by Dany; answers its id. */
function credential(personId: string, source_ = 'api_key', family: string | null = null): string {
  const id = crypto.randomUUID();
  source.db.run(
    sql`INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, mcp_family_id, created_at, created_by) VALUES (${id}, 'org-a', ${personId}, 'dany', ${source_}, ${id}, ${family}, 1, 'dany')`,
  );
  return id;
}

function activate(): void {
  source.db.run(
    sql`UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1`,
  );
}

describe('which claims carry a lease', () => {
  it("leases an agent's claim for itself and nobody else's", async () => {
    const { run, claim, items, leases } = await seeded();
    expect(await run([claim(items.one, 'codex')], pinned('codex'))).toMatchObject({ ok: true });
    expect(await run([claim(items.three, 'ann')], null)).toMatchObject({ ok: true });
    // A superagent's subtree claim is leased; what it delegates to another
    // person is not, and goes with the subtree claim (L1, L15).
    const subtree = await run([claim(items.parent, 'codex')], pinned('codex'));
    const [parentClaim] = claimIdsOf(subtree);
    const delegated = await run([claim(items.inner, 'claire', { parentClaim })], pinned('codex'));
    if (!delegated.ok) throw new Error(JSON.stringify(delegated));
    expect(leases()).toEqual(
      [
        { person_id: 'ann', work_item_id: items.three, lease: null },
        { person_id: 'claire', work_item_id: items.inner, lease: null },
        { person_id: 'codex', work_item_id: items.one, lease: T + CLAIM_LEASE_MS },
        { person_id: 'codex', work_item_id: items.parent, lease: T + CLAIM_LEASE_MS },
      ].sort(
        (left, right) =>
          left.person_id.localeCompare(right.person_id) ||
          (left.work_item_id < right.work_item_id ? -1 : 1),
      ),
    );
  });
});

describe('renewal', () => {
  // Proof: with the batch's renewal skipped, `renews an agent's lease on every
  // committed write` read the old expiry; watched 2026-10-23.
  it("renews an agent's lease on every committed write, and not on a refused one", async () => {
    const { run, claim, items, leases } = await seeded();
    await run([claim(items.one, 'codex')], pinned('codex'));
    now = T + 10 * MINUTE;
    const refused = await run([claim(items.two, 'codex')], pinned('codex'));
    // The slot is held by codex's first leaf: the batch is refused whole.
    expect(refused).toMatchObject({ ok: false, reason: 'resources_exhausted' });
    expect(leases()[0]?.lease).toBe(T + CLAIM_LEASE_MS);
    expect(
      await run(
        [{ kind: 'patchWorkItem', workItemId: items.one, patch: { name: 'One, renamed' } }],
        pinned('codex'),
      ),
    ).toMatchObject({ ok: true });
    expect(leases()[0]?.lease).toBe(T + 10 * MINUTE + CLAIM_LEASE_MS);
    // A session's write by the same account renews nothing: nobody is pinned.
    now = T + 12 * MINUTE;
    await run([{ kind: 'patchWorkItem', workItemId: items.one, patch: { name: 'One' } }], null);
    expect(leases()[0]?.lease).toBe(T + 10 * MINUTE + CLAIM_LEASE_MS);
  });

  it('answers a heartbeat within the minute while a batch holds the write turn', async () => {
    const { run, claim, items, runner } = await seeded();
    await run([claim(items.one, 'codex')], pinned('codex'));
    let release: () => void = () => undefined;
    const held = source.gate.enter(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    now = T + 30_000;
    expect(await runner.renewLeases('codex')).toEqual({
      leases: 1,
      leaseExpiresAt: T + CLAIM_LEASE_MS,
    });
    // Two minutes on, the lease is due: the heartbeat waits for the turn.
    now = T + 2 * MINUTE;
    let settled = false;
    const due = runner.renewLeases('codex').then((standing) => {
      settled = true;
      return standing;
    });
    await Bun.sleep(20);
    expect(settled).toBe(false);
    release();
    await held;
    expect(await due).toEqual({ leases: 1, leaseExpiresAt: T + 2 * MINUTE + CLAIM_LEASE_MS });
  });
});

describe('release by the coordinator', () => {
  it('releases at exactly the expiry and not one millisecond before', async () => {
    const { run, claim, items, runner, projectId, claims, occupancy, stackEntries, history } =
      await seeded();
    await run([claim(items.one, 'codex')], pinned('codex'));
    const entries = stackEntries();
    now = T + CLAIM_LEASE_MS - 1;
    expect(await runner.releaseExpiredLeases(projectId)).toBe(0);
    expect(claims()).toBe(1);
    now = T + CLAIM_LEASE_MS;
    expect(await runner.releaseExpiredLeases(projectId)).toBe(1);
    expect(claims()).toBe(0);
    expect(occupancy()).toBe(0);
    expect(history()).toEqual([
      { kind: 'release', label: 'release “One” (lease expired)', user_id: 'dany' },
    ]);
    // On nobody's stack (L10).
    expect(stackEntries()).toBe(entries);
  });

  it('never reaps a human claim', async () => {
    const { run, claim, items, runner, projectId, claims } = await seeded();
    await run([claim(items.one, 'ann')], null);
    now = T + 10 * 24 * 60 * MINUTE;
    expect(await runner.releaseExpiredLeases(projectId)).toBe(0);
    expect(claims()).toBe(1);
  });

  it('releases the claims delegated under an expired subtree claim', async () => {
    const { run, claim, items, runner, projectId, claims } = await seeded();
    const subtree = await run([claim(items.parent, 'codex')], pinned('codex'));
    const [parentClaim] = claimIdsOf(subtree);
    await run([claim(items.inner, 'claire', { parentClaim })], pinned('codex'));
    now = T + CLAIM_LEASE_MS;
    expect(await runner.releaseExpiredLeases(projectId)).toBe(2);
    expect(claims()).toBe(0);
  });

  it('frees the claim-cap place and the slot, and admits a waiting agent on retry', async () => {
    const { run, claim, items, runner, claims } = await seeded(1);
    expect(await run([claim(items.one, 'codex')], pinned('codex'))).toMatchObject({ ok: true });
    expect(await run([claim(items.two, 'claire')], pinned('claire'))).toMatchObject({
      ok: false,
      reason: 'resources_exhausted',
    });
    now = T + CLAIM_LEASE_MS;
    const ticks: (() => void)[] = [];
    const sweep = new ClaimLeaseSweep({
      runner,
      claims: source.stores.claims,
      now: () => now,
      intervals: {
        every: (_ms, callback) => {
          ticks.push(callback);
          return () => undefined;
        },
      },
      intervalMs: 30_000,
      projectsPerTick: 50,
      onError: (error) => {
        throw error;
      },
    });
    sweep.start();
    await sweep.settled();
    expect(claims()).toBe(0);
    expect(await run([claim(items.two, 'claire')], pinned('claire'))).toMatchObject({ ok: true });
    await sweep.stop();
  });

  it('refuses the holder’s undo after a reap, and redoes a claim with a fresh lease', async () => {
    const { run, claim, items, runner, projectId, claims, leases } = await seeded();
    await run([claim(items.one, 'codex')], pinned('codex'));
    // Undo and redo by the claim's writing account put it back with a lease
    // from the redo's instant (L11).
    now = T + MINUTE;
    expect(await runner.undoWithin(projectId, 'dany', admin)).toMatchObject({ ok: true });
    now = T + 5 * MINUTE;
    expect(await runner.redoWithin(projectId, 'dany', admin)).toMatchObject({ ok: true });
    expect(leases()).toEqual([
      { person_id: 'codex', work_item_id: items.one, lease: T + 5 * MINUTE + CLAIM_LEASE_MS },
    ]);
    now = T + 5 * MINUTE + CLAIM_LEASE_MS;
    expect(await runner.releaseExpiredLeases(projectId)).toBe(1);
    expect(await runner.undoWithin(projectId, 'dany', admin)).toMatchObject({ ok: false });
    expect(claims()).toBe(0);
  });
});

describe('revocation', () => {
  const at = { stamp: { at: T + MINUTE, by: 'dany' }, actor: 'dany', auditId: 'audit' };

  it('keeps the leases when one of two keys is revoked, and ends them with the last', async () => {
    const { run, claim, items, runner, projectId, leases, history } = await seeded();
    activate();
    const first = credential('codex');
    const second = credential('codex');
    await run([claim(items.one, 'codex')], pinned('codex'));
    const credentials = new MachineCredentialAdministrationRepository(source.db, source.gate);
    expect(await credentials.revoke('org-a', 'dany', first, { ...at, auditId: 'a1' })).toBe(
      'revoked',
    );
    expect(leases()[0]?.lease).toBe(T + CLAIM_LEASE_MS);
    now = T + MINUTE;
    expect(await credentials.revoke('org-a', 'dany', second, { ...at, auditId: 'a2' })).toBe(
      'revoked',
    );
    expect(leases()[0]?.lease).toBe(T + MINUTE);
    // A revoked lease is never renewed, even by a write that still gets through.
    now = T + MINUTE + 1;
    expect(await runner.renewLeases('codex')).toEqual({ leases: 0, leaseExpiresAt: null });
    expect(await runner.releaseExpiredLeases(projectId)).toBe(1);
    expect(history()).toEqual([
      { kind: 'release', label: 'release “One” (credential revoked)', user_id: 'dany' },
    ]);
  });

  it('ends the leases when an MCP consent was the last live credential', async () => {
    const { run, claim, items, leases } = await seeded();
    activate();
    const consent = credential('codex', 'mcp_consent', 'family-1');
    await run([claim(items.one, 'codex')], pinned('codex'));
    const consents = new ConsentCredentialRepository(source.db, source.gate);
    expect(await consents.end(consent, 'family-1', at)).toBe('revoked');
    expect(leases()[0]?.lease).toBe(T + MINUTE);
  });
});
