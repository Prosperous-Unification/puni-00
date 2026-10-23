import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AuthenticatedUser } from '@wbs/contracts';
import type {
  ClaimStore,
  CredentialPin,
  ExpiredLease,
  PlanCommand,
  ResourceAccess,
  Scope,
} from '@wbs/core';
import { clockOf, CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { CLAIM_LEASE_MS, LEASE_RENEWAL_RESOLUTION_MS } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import fc from 'fast-check';

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
const SEED = 20261023;
const LEAVES = 4;
const AGENTS = ['codex', 'claire'] as const;
const PEOPLE = [...AGENTS, 'ann'] as const;
const SLOT = 'resource-slot';
const admin: ResourceAccess = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'dany', role: 'admin' },
};

/** Verified-principal fixture; credential pinning remains part of each modeled act. */
function principalOf(pin: CredentialPin | null): AuthenticatedUser {
  return {
    id: 'dany',
    username: 'dany',
    scopes: ['write'],
    ...(pin === null
      ? {}
      : {
          authentication:
            'personId' in pin
              ? {
                  kind: 'machine' as const,
                  credentialId: 'fixture-credential',
                  personId: pin.personId,
                }
              : { kind: 'upstream' as const, issuer: pin.issuer, subject: pin.subject },
        }),
  };
}

/**
 * Where the sweep reads which leases have run out. `turn` is production:
 * inside its own unit of work. `stale` is the sabotage a proof injects: the
 * expired set read before the race was queued, outside any turn.
 */
type ExpiryRead = 'turn' | 'stale';

/** How a racing sweep reads expiry: production's `turn`; a proof flips it. */
const RACE_EXPIRY_READ: ExpiryRead = 'turn';

let directory: string;
let source: SqliteSource;
let now = T;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'claim-lease-race-'));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, folder);
  source = openSqliteSource({ dbPath, organizationDefaultLimits: DEFAULTS });
  now = T;
});

afterEach(async () => {
  await source.close();
  rmSync(directory, { recursive: true, force: true });
});

/** Organization A, Dany its admin, the agents and `ann`, and `LEAVES` root leaves; leaf 0 holds the slot. */
async function seeded(expiry: { read: ExpiryRead; snapshot: ExpiredLease[] }) {
  source.db.run(sql`INSERT INTO users (id, username, created_at) VALUES ('dany', 'dany', 1)`);
  source.db.run(sql`INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)`);
  source.db.run(
    sql`INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'dany', 'admin', 1)`,
  );
  for (const id of PEOPLE) {
    const kind = id === 'ann' ? 'person' : 'agent';
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
  const options = {
    admission: CREATOR_ADMISSION,
    clock,
    broadcast,
    scheduler: fastScheduler,
    dependencyContext: createLocalDependencyContext(source.stores),
  };
  const graph = servicesOver(source.stores, options);
  const created = await graph.projects.create('Race', 'dany');
  if (typeof created === 'string') throw new Error(`lease fixture project refused: ${created}`);
  const projectId = created.project.id;
  source.db.run(
    sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${projectId}, 'org-a')`,
  );
  const sabotaged = (claims: ClaimStore): ClaimStore => ({
    ...claims,
    expiredLeasesOf: (id, at) =>
      expiry.read === 'turn' ? claims.expiredLeasesOf(id, at) : Promise.resolve(expiry.snapshot),
  });
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements, admission, context) =>
      servicesOver(
        { ...scope.stores, claims: sabotaged(scope.stores.claims) },
        {
          ...options,
          broadcast: announcements,
          admission,
          dependencyContext: { kind: 'bound', context },
        },
      ),
  });
  const run = (commands: PlanCommand[], credential: CredentialPin | null) =>
    runner.runWithin(
      projectId,
      principalOf(credential),
      commands.map((command) =>
        command.kind === 'claimWorkItem' ? { ...command, steps: [created.steps[0].id] } : command,
      ),
      admin,
    );
  const plan = await run(
    [
      ...Array.from({ length: LEAVES }, (_, n): PlanCommand => ({
        kind: 'createWorkItem',
        ref: `leaf-${String(n)}`,
        name: `Leaf ${String(n)}`,
        parentId: null,
        afterId: null,
      })),
      { kind: 'setResourceCapacity', resourceId: SLOT, units: 1 },
      { kind: 'setDemand', workItemRef: 'leaf-0', resourceId: SLOT, units: 1 },
    ],
    null,
  );
  if (!plan.ok) throw new Error(`the plan was refused: ${JSON.stringify(plan)}`);
  const leafIds = plan.results.slice(0, LEAVES).map(({ id }) => id ?? '');
  // Organization isolation on, and one live API key per agent, so a revoke act
  // goes through the production revoke and its lease ending (L8).
  source.db.run(
    sql`UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1`,
  );
  const keys = new Map<string, string>();
  for (const agent of AGENTS) {
    const id = crypto.randomUUID();
    keys.set(agent, id);
    source.db.run(
      sql`INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, created_at, created_by) VALUES (${id}, 'org-a', ${agent}, 'dany', 'api_key', ${agent}, 1, 'dany')`,
    );
  }
  const credentials = new MachineCredentialAdministrationRepository(source.db, source.gate);
  const revoke = async (agent: string) => {
    const id = keys.get(agent);
    if (id === undefined) throw new Error(`no key for ${agent}`);
    const outcome = await credentials.revoke('org-a', 'dany', id, {
      stamp: { at: now, by: 'dany' },
      actor: 'dany',
      auditId: crypto.randomUUID(),
    });
    if (outcome !== 'revoked') throw new Error(`revoke of ${agent} answered ${outcome}`);
  };
  return { projectId, runner, run, leafIds, revoke };
}

/** One step the model runs. */
type Act =
  | { kind: 'claim'; leaf: number; person: number }
  | { kind: 'write'; agent: number }
  | { kind: 'heartbeat'; agent: number }
  | { kind: 'release'; leaf: number; person: number }
  | { kind: 'advance'; ms: number }
  | { kind: 'sweep' }
  | { kind: 'revoke'; agent: number }
  | {
      kind: 'race';
      with: 'heartbeat' | 'write' | 'release';
      sweepFirst: boolean;
      leaf: number;
      person: number;
    };

const pick = (max: number) => fc.integer({ min: 0, max: max - 1 });
const actArb: fc.Arbitrary<Act> = fc.oneof(
  {
    arbitrary: fc.record({
      kind: fc.constant('claim' as const),
      leaf: pick(LEAVES),
      person: pick(PEOPLE.length),
    }),
    weight: 4,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('write' as const), agent: pick(AGENTS.length) }),
    weight: 1,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('heartbeat' as const), agent: pick(AGENTS.length) }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('release' as const),
      leaf: pick(LEAVES),
      person: pick(PEOPLE.length),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('advance' as const),
      // The lease's own length and its boundary are weighted in, so a run
      // reaches expiry often enough to race it.
      ms: fc.constantFrom(
        1,
        30_000,
        2 * 60_000,
        14 * 60_000,
        CLAIM_LEASE_MS - 1,
        CLAIM_LEASE_MS,
        CLAIM_LEASE_MS,
        CLAIM_LEASE_MS,
      ),
    }),
    weight: 5,
  },
  { arbitrary: fc.record({ kind: fc.constant('sweep' as const) }), weight: 3 },
  {
    arbitrary: fc.record({ kind: fc.constant('revoke' as const), agent: pick(AGENTS.length) }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('race' as const),
      with: fc.constantFrom('heartbeat' as const, 'write' as const, 'release' as const),
      sweepFirst: fc.boolean(),
      leaf: pick(LEAVES),
      person: pick(PEOPLE.length),
    }),
    weight: 3,
  },
);

/**
 * The model: per leaf, its holder, lease expiry (null for a human's) and
 * whether the holder's last credential was revoked, which ends the lease.
 */
type Model = Map<number, { person: string; expiresAt: number | null; revoked: boolean }>;

/** A renewal at `at` by `person` in the model: every lease in force and due moves (L4, L5). */
function renewIn(model: Model, person: string, at: number): void {
  for (const held of model.values()) {
    if (held.person !== person || held.expiresAt === null || held.revoked) continue;
    if (at < held.expiresAt && held.expiresAt < at + CLAIM_LEASE_MS - LEASE_RENEWAL_RESOLUTION_MS)
      held.expiresAt = at + CLAIM_LEASE_MS;
  }
}

/** The model without the leaves `gone` selects (a Map's own delete trips the drizzle lint rule). */
function forget(model: Model, gone: (leaf: number, held: { expiresAt: number | null }) => boolean) {
  const kept = [...model].filter(([leaf, held]) => !gone(leaf, held));
  model.clear();
  for (const [leaf, held] of kept) model.set(leaf, held);
}

/** The sweep at `at` in the model: every lease run out goes (L5, L6). */
function sweepIn(model: Model, at: number): void {
  forget(model, (_leaf, held) => held.expiresAt !== null && held.expiresAt <= at);
}

describe('a sweep queued behind a release of the same expired claim', () => {
  /**
   * Proof: with `RACE_EXPIRY_READ` 'stale' (the sweep's expired set read
   * before both were queued, outside its turn), the sweep threw "expired
   * claim … is not a claim of …" on the claim the release had already taken
   * (1 pass, 1 fail in this file); watched 2026-10-23.
   */
  it('releases nothing and does not throw', async () => {
    const expiry = { read: 'turn' as ExpiryRead, snapshot: [] as ExpiredLease[] };
    const world = await seeded(expiry);
    const leaf = world.leafIds.at(0) ?? '';
    expect(
      await world.run(
        [{ kind: 'claimWorkItem', workItemId: leaf, personId: 'codex', runId: 'r' }],
        { personId: 'codex' },
      ),
    ).toMatchObject({ ok: true });
    now = T + CLAIM_LEASE_MS;
    expiry.snapshot = await source.stores.claims.expiredLeasesOf(world.projectId, now);
    expect(expiry.snapshot).toHaveLength(1);
    expiry.read = RACE_EXPIRY_READ;
    let open: () => void = () => undefined;
    let holding: () => void = () => undefined;
    const holds = new Promise<void>((resolve) => {
      holding = resolve;
    });
    const held = source.gate.enter(
      () =>
        new Promise<void>((resolve) => {
          open = resolve;
          holding();
        }),
    );
    await holds;
    // Queued in this order behind the held turn: the release takes it first.
    const release = world.run(
      [{ kind: 'releaseWorkItem', workItemId: leaf, personId: 'codex' }],
      null,
    );
    const sweep = world.runner.releaseExpiredLeases(world.projectId);
    open();
    await held;
    expect(await release).toMatchObject({ ok: true });
    expect(await sweep).toBe(0);
  });
});

describe('claim leases as a model', () => {
  /**
   * Random claims, writes, heartbeats, releases, revocations of an agent's
   * only key, clock moves and sweeps, and a sweep racing a heartbeat, a write
   * or a release, in either order. After every step the store holds exactly
   * the model's claims with the model's expiries, the slot is occupied iff
   * leaf 0 is held, the bound claims (what the claim cap counts) equal the
   * model's held leaves, and no step throws: renewal and expiry touch disjoint
   * claims (in force against run out), so the outcome depends on the instant
   * alone, never on which turn came first.
   *
   * Proof, each watched 2026-10-23 with this generator: with the in-force
   * predicate dropped from `ClaimRepository.renewLeases`, fast-check found a
   * write at the expiry reviving a lease the model had run out (1 pass,
   * 1 fail); with `lte` replaced by `lt` in `expiredLeasesOf`, a sweep at
   * exactly the expiry kept the claim (0 pass, 2 fail); with the revoke's
   * `endLeasesOfUncredentialed` call removed, a revoked agent's lease stayed
   * in force (claim, claim, revoke, claim). The stale-read fault is the case
   * below's: random runs reach a release and a sweep wanting one expired
   * claim too rarely to prove it.
   */
  it('holds exactly the claims the model holds, whatever the turn order', async () => {
    let races = 0;
    let reaped = 0;
    let revokes = 0;
    await fc.assert(
      fc.asyncProperty(fc.array(actArb, { minLength: 4, maxLength: 24 }), async (acts) => {
        await source.close();
        rmSync(directory, { recursive: true, force: true });
        directory = mkdtempSync(join(tmpdir(), 'claim-lease-model-'));
        const dbPath = join(directory, 'plan.db');
        runMigrations(dbPath, folder);
        source = openSqliteSource({ dbPath, organizationDefaultLimits: DEFAULTS });
        now = T;
        const expiry = { read: 'turn' as ExpiryRead, snapshot: [] as ExpiredLease[] };
        const world = await seeded(expiry);
        const model: Model = new Map();
        const leafOf = (n: number) => world.leafIds.at(n) ?? '';
        const personOf = (n: number) => PEOPLE.at(n) ?? 'ann';
        const isAgent = (person: string) => person !== 'ann';
        /** Agents whose only key was revoked: they can no longer act. */
        const revoked = new Set<string>();
        const credentialOf = (person: string) => (isAgent(person) ? { personId: person } : null);

        const claim = async (leaf: number, person: string) => {
          if (revoked.has(person)) return;
          const outcome = await world.run(
            [
              {
                kind: 'claimWorkItem',
                workItemId: leafOf(leaf),
                personId: person,
                runId: `run-${person}`,
              },
            ],
            credentialOf(person),
          );
          const held = model.get(leaf);
          if (held !== undefined && held.person !== person) {
            expect(outcome).toMatchObject({ ok: false, reason: 'already_claimed' });
            return;
          }
          expect(outcome).toMatchObject({ ok: true });
          if (isAgent(person)) renewIn(model, person, now);
          if (held === undefined)
            model.set(leaf, {
              person,
              expiresAt: isAgent(person) ? now + CLAIM_LEASE_MS : null,
              revoked: false,
            });
        };
        const write = async (agent: string) => {
          if (revoked.has(agent)) return;
          const outcome = await world.run(
            [{ kind: 'patchWorkItem', workItemId: leafOf(1), patch: { name: `by ${agent}` } }],
            { personId: agent },
          );
          expect(outcome).toMatchObject({ ok: true });
          renewIn(model, agent, now);
        };
        const heartbeat = async (agent: string) => {
          if (revoked.has(agent)) return;
          await world.runner.renewLeases(agent);
          renewIn(model, agent, now);
        };
        /** A session release by the admin: answers whether it released. */
        const release = async (leaf: number, person: string) => {
          const outcome = await world.run(
            [{ kind: 'releaseWorkItem', workItemId: leafOf(leaf), personId: person }],
            null,
          );
          if (outcome.ok) return true;
          expect(outcome).toMatchObject({ ok: false, reason: 'not_claimed_by' });
          return false;
        };
        const sweep = async () => {
          reaped += await world.runner.releaseExpiredLeases(world.projectId);
        };

        for (const act of acts) {
          switch (act.kind) {
            case 'claim':
              await claim(act.leaf, personOf(act.person));
              break;
            case 'write':
              await write(AGENTS[act.agent] ?? 'codex');
              break;
            case 'heartbeat':
              await heartbeat(AGENTS[act.agent] ?? 'codex');
              break;
            case 'release': {
              const person = personOf(act.person);
              const released = await release(act.leaf, person);
              expect(released).toBe(model.get(act.leaf)?.person === person);
              if (released) forget(model, (leaf) => leaf === act.leaf);
              break;
            }
            case 'advance':
              now += act.ms;
              break;
            case 'sweep':
              await sweep();
              sweepIn(model, now);
              break;
            case 'revoke': {
              const agent = AGENTS[act.agent];
              if (revoked.has(agent)) break;
              await world.revoke(agent);
              revokes += 1;
              revoked.add(agent);
              for (const held of model.values()) {
                if (held.person !== agent || held.expiresAt === null || held.revoked) continue;
                held.expiresAt = Math.min(held.expiresAt, now);
                held.revoked = true;
              }
              break;
            }
            case 'race': {
              races += 1;
              expiry.snapshot = await source.stores.claims.expiredLeasesOf(world.projectId, now);
              const agent = isAgent(personOf(act.person)) ? personOf(act.person) : 'codex';
              // A racing release aims at a claim whose lease has run out, when
              // one is held, and names its holder: the case where the release
              // and the sweep both want the same claim.
              const target =
                [...model].find(
                  ([, held]) => held.expiresAt !== null && held.expiresAt <= now,
                )?.[0] ?? act.leaf;
              const releaser = model.get(target)?.person ?? personOf(act.person);
              const other = (): Promise<unknown> =>
                act.with !== 'release' && revoked.has(agent)
                  ? Promise.resolve()
                  : act.with === 'heartbeat'
                    ? world.runner.renewLeases(agent)
                    : act.with === 'write'
                      ? world.run(
                          [
                            {
                              kind: 'patchWorkItem',
                              workItemId: leafOf(1),
                              patch: { name: 'race' },
                            },
                          ],
                          { personId: agent },
                        )
                      : world.run(
                          [
                            {
                              kind: 'releaseWorkItem',
                              workItemId: leafOf(target),
                              personId: releaser,
                            },
                          ],
                          null,
                        );
              expiry.read = RACE_EXPIRY_READ;
              await (act.sweepFirst
                ? Promise.all([sweep(), other()])
                : Promise.all([other(), sweep()]));
              expiry.read = 'turn';
              // Renewal moves only leases in force, the sweep only leases run
              // out, and a release takes the claim either way: the model
              // applies them in either order with one result.
              if (act.with === 'release') {
                if (model.get(target)?.person === releaser)
                  forget(model, (leaf) => leaf === target);
              } else {
                renewIn(model, agent, now);
              }
              sweepIn(model, now);
              break;
            }
          }
          const stored = source.db.all<{ w: string; p: string; e: number | null }>(
            sql`SELECT DISTINCT work_item_id AS w, person_id AS p, lease_expires_at AS e FROM claim`,
          );
          const expected = [...model].map(([leaf, held]) => ({
            w: leafOf(leaf),
            p: held.person,
            e: held.expiresAt,
          }));
          const byItem = (left: { w: string }, right: { w: string }) => (left.w < right.w ? -1 : 1);
          expect(stored.sort(byItem)).toEqual(expected.sort(byItem));
          const occupied = source.db.get<{ n: number }>(
            sql`SELECT count(DISTINCT o.claim_id) > 0 AS n FROM claim_occupancy AS o`,
          ).n;
          expect(occupied === 1).toBe(model.has(0));
          // Every held leaf is one bound claim (one person, one run): what the
          // organization's claim cap counts goes down with every release.
          const bound = source.db.get<{ n: number }>(
            sql`SELECT count(*) AS n FROM (SELECT DISTINCT work_item_id, person_id, run_id FROM claim)`,
          ).n;
          expect(bound).toBe(model.size);
        }
      }),
      { numRuns: 80, seed: SEED },
    );
    // The runs raced and reaped, so the invariant was tested where it bites.
    expect({ races: races > 50, reaped: reaped > 20, revokes: revokes > 10 }).toEqual({
      races: true,
      reaped: true,
      revokes: true,
    });
  }, 180_000);
});
