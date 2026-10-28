import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JwksTokenVerifier } from '@wbs/auth';
import { readOrganizationActivation } from '@wbs/store-sqlite';
import { openExistingConnection } from '@wbs/store-sqlite/db';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { TEST_MACHINE_GRANT_ENV } from './testing/machine-grant-fixture';
import { writeMcpStoreFixture } from './testing/mcp-store-fixture';
import { type Answer, OrganizationHarness } from './testing/organization-harness';

/**
 * The swarm rehearsal: `wbs-team-claims` and `wbs-resources` working together for two fleets
 * of agents on be-01's production composition over a fresh SQLite file, migrated, activated and
 * credentialed through the operator's own CLIs, with every plan write and read over the real
 * routes. Machine tokens are signed as an Auth0 machine-to-machine token is issued (no
 * `wbs_groups`, no email) and select their organization exactly as a browser does.
 *
 * The tests share one store and run in order; each names the requirement it demonstrates.
 */
setDefaultTimeout(120_000);

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const ISSUER = 'https://idp.test';
const AUDIENCE = 'api://wbs';
const RAM_CAPACITY = 16;
/** The one leaf outside both fleets' subtrees. */
const HOTFIX = 'H';

type Fleet = 'claire' | 'claude';

/** One leaf of the rehearsal plan: its fleet, its demand and the worker run that claims it. */
interface LeafPlan {
  readonly key: string;
  readonly fleet: Fleet;
  readonly ram: number;
  readonly needsStaging: boolean;
  readonly worker: string;
  readonly runId: string;
  /** Whether the first swarm round fires a claim for it. */
  readonly isRaced: boolean;
}

/**
 * Three 6 GB leaves and four 4 GB staging leaves race for 16 GB and one staging slot: in every
 * admission order two 6 GB leaves and one staging leaf fit, so the outcome's shape is fixed
 * while which leaves win is the coordinator's to decide.
 */
const LEAVES: readonly LeafPlan[] = [
  ['A1', 'claire', 4, true, 'claire-w1', 1, true],
  ['A2', 'claire', 6, false, 'claire-w2', 1, true],
  ['A3', 'claire', 4, true, 'claire-w1', 2, true],
  ['A4', 'claire', 6, false, 'claire-w2', 2, true],
  ['B1', 'claude', 4, true, 'claude-w1', 1, true],
  ['B2', 'claude', 6, false, 'claude-w2', 1, true],
  ['B3', 'claude', 4, true, 'claude-w3', 1, true],
  ['B4', 'claude', 8, false, 'claude-w1', 2, false],
].map(([key, fleet, ram, needsStaging, worker, run, isRaced]) => ({
  key: String(key),
  fleet: fleet === 'claire' ? 'claire' : 'claude',
  ram: Number(ram),
  needsStaging: needsStaging === true,
  worker: String(worker),
  runId: `agent:${String(worker)}:subagent:${String(run)}`,
  isRaced: isRaced === true,
}));

const SUPERAGENTS: Record<Fleet, string> = { claire: 'claire', claude: 'claude' };
const SUBJECTS: Record<Fleet, string> = {
  claire: 'claire-fleet@clients',
  claude: 'claude-fleet@clients',
};
const AGENTS = [
  'claire',
  'claude',
  'claire-w1',
  'claire-w2',
  'claude-w1',
  'claude-w2',
  'claude-w3',
];

let signing: CryptoKeyPair;
let jwks: ReturnType<typeof Bun.serve>;
let h: OrganizationHarness;
/** Armed while a swarm round is in flight: counts requests past organization access. */
let onResolved: (() => void) | undefined;

/** Ids minted by the operator's setup, by the names the rehearsal gives them. */
const ids = {
  projectId: '',
  organizationId: '',
  steps: { dev: '', qa: '', review: '' },
  resources: { ram: '', disk: '', staging: '' },
  teams: { claire: '', claude: '' } as Record<Fleet, string>,
  persons: new Map<string, string>(),
  leaves: new Map<string, string>(),
  subtrees: { claire: '', claude: '' } as Record<Fleet, string>,
  subtreeClaims: { claire: '', claude: '' } as Record<Fleet, string>,
};
/** Request headers per actor once its organization is selected. */
const sessions = new Map<string, Record<string, string>>();

function cli(script: string, args: readonly string[], dbPath = h.databasePath()) {
  const run = Bun.spawnSync([process.execPath, 'run', join(APP_ROOT, 'src', script), ...args], {
    cwd: APP_ROOT,
    env: { ...process.env, ...TEST_MACHINE_GRANT_ENV, DB_PATH: dbPath },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: run.exitCode, stdout: run.stdout.toString(), stderr: run.stderr.toString() };
}

beforeAll(async () => {
  signing = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(signing.publicKey);
  jwks = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'swarm', use: 'sig' }] }),
  });
  h = OrganizationHarness.openComposedWith({
    sessionBinding: true,
    afterResolve: () => onResolved?.(),
    upstreamCredential: {
      verifier: new JwksTokenVerifier({
        audience: AUDIENCE,
        issuer: ISSUER,
        jwksUri: new URL(`http://127.0.0.1:${String(jwks.port)}/jwks`),
      }),
      groupPrefix: 'dev',
      groupsClaim: 'wbs_groups',
    },
    // From an empty file through the operator's migration CLI, as a host's first deploy does.
    migrate: (dbPath) => {
      const migrated = cli('migrate-cli.ts', [], dbPath);
      if (migrated.exitCode !== 0) throw new Error(`migrate-cli.ts failed: ${migrated.stderr}`);
    },
  });
});

afterAll(async () => {
  h.close();
  await jwks.stop(true);
});

/** A machine token for `subject`: no groups claim and no email, as Auth0 issues one. */
function machineToken(subject: string): Promise<string> {
  const seconds = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'swarm' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(subject)
    .setJti(crypto.randomUUID())
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + 3600)
    .sign(signing.privateKey);
}

async function send(
  headers: Record<string, string>,
  method: string,
  path: string,
  body?: unknown,
): Promise<Answer & { cookie: string | null }> {
  const response = await h.request(path, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { origin: 'http://localhost' }),
      ...headers,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    // Every be-01 answer the rehearsal reads is JSON; anything else is kept as text to fail on.
    body: text.startsWith('{') ? (JSON.parse(text) as unknown) : text,
    cookie: response.headers.get('set-cookie'),
  };
}

/** `token`'s headers after selecting the organization, as the browser and a fleet both do. */
async function select(token: string, organizationId: string): Promise<Record<string, string>> {
  const bearer = { authorization: `Bearer ${token}` };
  const selected = await send(bearer, 'POST', '/api/organization/active', { organizationId });
  const pair = selected.cookie?.split(';')[0];
  if (selected.status !== 200 || pair === undefined)
    throw new Error(`selection refused: ${JSON.stringify(selected)}`);
  return { ...bearer, cookie: pair, 'X-WBS-Expected-Organization': organizationId };
}

/** `list[index]` (negative from the end); a missing entry is a broken answer, so it throws. */
function nth<T>(list: readonly T[], index: number): T {
  const found = list.at(index);
  if (found === undefined) throw new Error(`no entry ${String(index)} in ${JSON.stringify(list)}`);
  return found;
}

function sessionOf(actor: string): Record<string, string> {
  const found = sessions.get(actor);
  if (found === undefined) throw new Error(`${actor} has no session`);
  return found;
}

function personOf(name: string): string {
  const found = ids.persons.get(name);
  if (found === undefined) throw new Error(`no person ${name}`);
  return found;
}

function leafOf(key: string): string {
  const found = ids.leaves.get(key);
  if (found === undefined) throw new Error(`no leaf ${key}`);
  return found;
}

function planOf(key: string): LeafPlan {
  const found = LEAVES.find((each) => each.key === key);
  if (found === undefined) throw new Error(`no plan for leaf ${key}`);
  return found;
}

function keyOf(workItemId: string): string {
  for (const [key, id] of ids.leaves) if (id === workItemId) return key;
  throw new Error(`no leaf has id ${workItemId}`);
}

const commandsAs = (actor: string, commands: unknown[]) =>
  send(sessionOf(actor), 'POST', `/api/projects/${ids.projectId}/commands`, { commands });

const directoryAs = (headers: Record<string, string>, commands: unknown[]) =>
  send(headers, 'POST', '/api/directory/commands', { commands });

function mintedIds(answer: Answer): string[] {
  if (answer.status !== 200) throw new Error(`refused: ${JSON.stringify(answer)}`);
  return (answer.body as { results: { id?: string }[] }).results.map((each, index) => {
    if (each.id === undefined) throw new Error(`command ${String(index)} minted no id`);
    return each.id;
  });
}

/** The claim a worker of `fleet` fires for `leaf`: Dev and QA, delegated under the subtree. */
function workerClaim(leaf: LeafPlan) {
  return {
    kind: 'claimWorkItem',
    workItemId: leafOf(leaf.key),
    personId: personOf(leaf.worker),
    runId: leaf.runId,
    parentClaim: ids.subtreeClaims[leaf.fleet],
    steps: [ids.steps.dev, ids.steps.qa],
  };
}

interface ClaimAnswer {
  claimIds: string[];
  acquired: { resourceId: string; units: number }[];
  assignedStepIds: string[];
}

function claimAnswerOf(answer: Answer): ClaimAnswer {
  const first = (answer.body as { results: ClaimAnswer[] }).results.at(0);
  if (first === undefined) throw new Error(`no claim answer: ${JSON.stringify(answer)}`);
  return first;
}

interface ExhaustedRefusal {
  error: string;
  resourceId: string;
  asked: number;
  free: number;
  holders: { personId: string; workItemId: string; runId: string | null }[];
}

/** Occupied units per resource, read from the store the app writes. */
function occupied(): Record<string, number> {
  const rows = h.sqlite
    .query<{ resource_id: string; units: number }, []>(
      // A leaf's occupancy is its largest standing copy (`resource-occupancy`).
      `SELECT resource_id, SUM(units) AS units FROM (
         SELECT c.work_item_id, o.resource_id, MAX(o.units) AS units
         FROM claim_occupancy AS o JOIN claim AS c ON c.id = o.claim_id
         GROUP BY c.work_item_id, o.resource_id)
       GROUP BY resource_id`,
    )
    .all();
  return Object.fromEntries(rows.map((row) => [row.resource_id, row.units]));
}

/** The leaves holding a step claim, by plan key. */
function claimedLeafKeys(): string[] {
  return h.sqlite
    .query<{ work_item_id: string }, []>(
      'SELECT DISTINCT work_item_id FROM claim WHERE step_id IS NOT NULL',
    )
    .all()
    .map((row) => keyOf(row.work_item_id))
    .toSorted();
}

/** A leaf a worker won in the first round, preferring fleet B's (fleet A's gets a reviewer). */
function heldLeaf(): LeafPlan {
  const held = claimedLeafKeys();
  const found =
    LEAVES.find((each) => each.fleet === 'claude' && held.includes(each.key)) ??
    LEAVES.find((each) => held.includes(each.key));
  if (found === undefined) throw new Error('no worker holds a leaf');
  return found;
}

function usersTable(): unknown[] {
  return h.sqlite.query('SELECT * FROM users ORDER BY id').all();
}

/**
 * Fires every batch at once while the composed write turn is held, waits until each request
 * has passed organization access (so all are in flight, queued on the coordinator), then
 * releases the turn: the coordinator alone decides the order.
 */
async function race(batches: { actor: string; commands: unknown[] }[]): Promise<Answer[]> {
  const release = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const held = h.holdWriteTurn(release.promise, () => {
    entered.resolve(undefined);
  });
  await entered.promise;
  const resolved = Promise.withResolvers<undefined>();
  let pending = batches.length;
  onResolved = () => {
    pending -= 1;
    if (pending === 0) resolved.resolve(undefined);
  };
  const answers = Promise.all(batches.map((each) => commandsAs(each.actor, each.commands)));
  await resolved.promise;
  onResolved = undefined;
  release.resolve(undefined);
  await held;
  return answers;
}

interface StartableRead {
  leaves: { workItemId: string; stepIds: string[]; fits: boolean; subtreeClaim: unknown }[];
  claimed: {
    workItemId: string;
    stepId: string;
    holder: { personId: string };
    assignee: { personId: string } | null;
    runId: string | null;
    parentClaimId: string | null;
  }[];
  subtreeClaims: { workItemId: string; holder: { personId: string }; claimId: string }[];
  doesNotFit: {
    workItemId: string;
    stepIds: string[];
    exhausted: { resourceId: string; shortfall: number };
  }[];
  resources: { resourceId: string; capacity: number; occupied: number; free: number }[];
  occupancyScope: string;
}

async function startableFor(actor: string, fleet: Fleet): Promise<StartableRead> {
  const answer = await send(
    sessionOf(actor),
    'GET',
    `/api/projects/${ids.projectId}/startable?team=${ids.teams[fleet]}`,
  );
  if (answer.status !== 200) throw new Error(`startable refused: ${JSON.stringify(answer)}`);
  return answer.body as StartableRead;
}

/** What the startable read must say for `fleet`, derived from the store and the plan. */
function expectStartableAgrees(read: StartableRead, fleet: Fleet): void {
  const usage = occupied();
  const capacities = new Map([
    [ids.resources.ram, RAM_CAPACITY],
    [ids.resources.disk, 100],
    [ids.resources.staging, 1],
  ]);
  // A resource no claim occupies has no occupancy row: zero units held, not an unknown.
  const freeOf = (resourceId: string): number => {
    const capacity = capacities.get(resourceId);
    if (capacity === undefined) throw new Error(`no capacity was stated for ${resourceId}`);
    return capacity - (usage[resourceId] ?? 0);
  };
  expect(read.occupancyScope).toBe('project');
  expect(
    read.resources.map(({ resourceId, capacity, occupied: units, free: left }) => ({
      resourceId,
      capacity,
      occupied: units,
      free: left,
    })),
  ).toEqual(
    [...capacities]
      .map(([resourceId, capacity]) => ({
        resourceId,
        capacity,
        occupied: usage[resourceId] ?? 0,
        free: freeOf(resourceId),
      }))
      .toSorted((a, b) => a.resourceId.localeCompare(b.resourceId)),
  );
  const claimedSteps = h.sqlite
    .query<{ work_item_id: string; step_id: string }, []>(
      'SELECT work_item_id, step_id FROM claim WHERE step_id IS NOT NULL',
    )
    .all();
  const fits: string[] = [];
  const unfit: string[] = [];
  for (const leaf of LEAVES.filter((each) => each.fleet === fleet)) {
    const workItemId = leafOf(leaf.key);
    const held = claimedSteps.filter((row) => row.work_item_id === workItemId);
    const isFitting =
      held.length > 0 ||
      (freeOf(ids.resources.ram) >= leaf.ram &&
        freeOf(ids.resources.disk) >= 10 &&
        (!leaf.needsStaging || freeOf(ids.resources.staging) >= 1));
    (isFitting ? fits : unfit).push(leaf.key);
  }
  expect({ fits: read.leaves.map((each) => keyOf(each.workItemId)).toSorted() }).toEqual({
    fits: fits.toSorted(),
  });
  expect(read.leaves.every((each) => each.fits)).toBe(true);
  expect({ unfit: read.doesNotFit.map((each) => keyOf(each.workItemId)).toSorted() }).toEqual({
    unfit: unfit.toSorted(),
  });
  // Every leaf listed apart names a resource it is actually short of.
  for (const apart of read.doesNotFit) {
    const leaf = planOf(keyOf(apart.workItemId));
    const asked =
      apart.exhausted.resourceId === ids.resources.ram
        ? leaf.ram
        : apart.exhausted.resourceId === ids.resources.staging
          ? 1
          : 10;
    expect(apart.exhausted.shortfall).toBe(asked - freeOf(apart.exhausted.resourceId));
    expect(apart.exhausted.shortfall).toBeGreaterThan(0);
  }
  const fleetLeafIds = new Set(
    LEAVES.filter((each) => each.fleet === fleet).map((each) => leafOf(each.key)),
  );
  expect(read.claimed.map((each) => `${each.workItemId}/${each.stepId}`).toSorted()).toEqual(
    claimedSteps
      .filter((row) => fleetLeafIds.has(row.work_item_id))
      .map((row) => `${row.work_item_id}/${row.step_id}`)
      .toSorted(),
  );
  const subtreeRows = h.sqlite
    .query<{ id: string }, []>('SELECT id FROM claim WHERE step_id IS NULL')
    .all();
  expect(read.subtreeClaims.map((each) => each.claimId).toSorted()).toEqual(
    subtreeRows.map((row) => row.id).toSorted(),
  );
}

describe('a swarm of two fleets on one plan', () => {
  test('1. the operator plans, activates organizations and credentials the fleets', async () => {
    for (const username of ['dany', 'ada']) await h.register(username);
    const local = { authorization: `Bearer ${h.token('dany')}` };
    const project = await send(local, 'POST', '/api/projects', { name: 'Swarm rehearsal' });
    expect(project.status).toBe(200);
    ids.projectId = (project.body as { project: { id: string } }).project.id;
    const review = await send(local, 'POST', `/api/projects/${ids.projectId}/steps`, {
      name: 'Review',
    });
    expect(review.status).toBe(200);
    const read = await send(local, 'GET', `/api/projects/${ids.projectId}`);
    const steps = (read.body as { steps: { id: string; name: string }[] }).steps;
    const stepNamed = (name: string) => {
      const found = steps.find((each) => each.name === name);
      if (found === undefined) throw new Error(`the project has no step ${name}`);
      return found.id;
    };
    ids.steps = { dev: stepNamed('Dev'), qa: stepNamed('QA'), review: stepNamed('Review') };
    expect(Object.values(ids.steps).every((id) => id !== '')).toBe(true);

    // `resource-directory`: resources are directory entities with a kind and a unit.
    const directory = mintedIds(
      await directoryAs(local, [
        {
          kind: 'createResource',
          name: 'h2puni ram',
          resourceKind: 'divisible',
          unitLabel: 'GB',
        },
        {
          kind: 'createResource',
          name: 'h2puni tmp disk',
          resourceKind: 'divisible',
          unitLabel: 'GB',
        },
        { kind: 'createResource', name: 'staging', resourceKind: 'exclusive', unitLabel: 'env' },
        { kind: 'createTeam', ref: 'claire', name: 'Claire fleet' },
        { kind: 'createTeam', ref: 'claude', name: 'Claude Code fleet' },
        ...[...AGENTS, 'ada-agent', 'kat'].map((name) => ({
          kind: 'createPerson',
          name,
          ...(name.startsWith('claire') ? { teamRefs: ['claire'] } : {}),
          ...(name.startsWith('claude') ? { teamRefs: ['claude'] } : {}),
        })),
      ]),
    );
    ids.resources = { ram: nth(directory, 0), disk: nth(directory, 1), staging: nth(directory, 2) };
    ids.teams = { claire: nth(directory, 3), claude: nth(directory, 4) };
    for (const [index, name] of [...AGENTS, 'ada-agent', 'kat'].entries())
      ids.persons.set(name, nth(directory, index + 5));

    // The plan: one subtree per fleet, labelled by team (inherited by its four leaves), every
    // step estimated so no leaf folds to `done`, a demand on each leaf and the project's
    // capacities (`resource-directory`, `schedule-resources`).
    const tree = mintedIds(
      await send(local, 'POST', `/api/projects/${ids.projectId}/commands`, {
        commands: [
          { kind: 'createWorkItem', ref: 'claire', parentId: null, name: 'Claire fleet work' },
          { kind: 'createWorkItem', ref: 'claude', parentId: null, name: 'Claude Code fleet work' },
          ...LEAVES.map((leaf) => ({
            kind: 'createWorkItem',
            ref: leaf.key,
            parentRef: leaf.fleet,
            name: `Leaf ${leaf.key}`,
          })),
          // Outside both allotments: another account's hotfix, which step 4 uses to take units.
          { kind: 'createWorkItem', parentId: null, name: 'Hotfix' },
        ],
      }),
    );
    ids.subtrees = { claire: nth(tree, 0), claude: nth(tree, 1) };
    for (const [index, leaf] of LEAVES.entries()) ids.leaves.set(leaf.key, nth(tree, index + 2));
    ids.leaves.set(HOTFIX, nth(tree, -1));
    const planned = await send(local, 'POST', `/api/projects/${ids.projectId}/commands`, {
      commands: [
        ...(['claire', 'claude'] as const).flatMap((fleet) => [
          {
            kind: 'patchWorkItem',
            workItemId: ids.subtrees[fleet],
            patch: { teamIds: [ids.teams[fleet]] },
          },
          { kind: 'setCapacity', teamId: ids.teams[fleet], size: fleet === 'claire' ? 2 : 3 },
        ]),
        { kind: 'setResourceCapacity', resourceId: ids.resources.ram, units: RAM_CAPACITY },
        { kind: 'setResourceCapacity', resourceId: ids.resources.disk, units: 100 },
        { kind: 'setResourceCapacity', resourceId: ids.resources.staging, units: 1 },
        // QA and review are ongoing work whose claims continue existing execution. New
        // unfinished successors still refuse admission; the companion prerequisite test
        // proves that boundary (`local all-step claims keep atomic meaning` in
        // cross-project-startable.controller.db.test.ts).
        ...[HOTFIX, ...LEAVES.map((leaf) => leaf.key)].flatMap((key) =>
          [ids.steps.qa, ids.steps.review].map((stepId) => ({
            kind: 'setProgress',
            workItemId: leafOf(key),
            stepId,
            state: 'in_progress',
          })),
        ),
        ...Object.values(ids.steps).map((stepId) => ({
          kind: 'setEstimate',
          workItemId: leafOf(HOTFIX),
          stepId,
          days: { optimistic: 1, realistic: 1, pessimistic: 1 },
        })),
        { kind: 'setDemand', workItemId: leafOf(HOTFIX), resourceId: ids.resources.ram, units: 1 },
        ...LEAVES.flatMap((leaf) => [
          ...Object.values(ids.steps).map((stepId) => ({
            kind: 'setEstimate',
            workItemId: leafOf(leaf.key),
            stepId,
            days: { optimistic: 1, realistic: 2, pessimistic: 3 },
          })),
          {
            kind: 'setDemand',
            workItemId: leafOf(leaf.key),
            resourceId: ids.resources.ram,
            units: leaf.ram,
          },
          {
            kind: 'setDemand',
            workItemId: leafOf(leaf.key),
            resourceId: ids.resources.disk,
            units: 10,
          },
          ...(leaf.needsStaging
            ? [
                {
                  kind: 'setDemand',
                  workItemId: leafOf(leaf.key),
                  resourceId: ids.resources.staging,
                  units: 1,
                },
              ]
            : []),
        ]),
      ],
    });
    expect(planned.status).toBe(200);

    // `organization-activation-cli.ts` without --apply rehearses and rolls back: nothing written.
    const snapshot = () =>
      ['organization', 'organization_membership', 'organization_activation', 'external_identity']
        .map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all())
        .concat([
          h.sqlite.query('SELECT count(*) AS n FROM resource_organization').all(),
          h.sqlite.query('SELECT count(*) AS n FROM person_organization').all(),
        ]);
    const before = snapshot();
    const mcpStore = `${h.databasePath()}-mcp.sqlite`;
    writeMcpStoreFixture(mcpStore, 1);
    const rehearsed = cli('organization-activation-cli.ts', [
      '--mcp-store',
      mcpStore,
      '--name',
      'default',
      '--super-admin',
      'dany',
    ]);
    expect(rehearsed.stderr).toBe('');
    expect(rehearsed.exitCode).toBe(0);
    expect(JSON.parse(rehearsed.stdout)).toMatchObject({ mode: 'dry_run', activatedAt: null });
    // Proof: 2026-10-20, an organization row inserted between the two snapshots failed here.
    expect(snapshot()).toEqual(before);
    const activation = () => {
      const connection = openExistingConnection(h.databasePath());
      try {
        return readOrganizationActivation(connection.db);
      } finally {
        connection.close();
      }
    };
    expect(activation()).toBe('pre_activation');

    const applied = cli('organization-activation-cli.ts', [
      '--mcp-store',
      mcpStore,
      '--name',
      'default',
      '--super-admin',
      'dany',
      '--apply',
    ]);
    expect(applied.stderr).toBe('');
    expect(applied.exitCode).toBe(0);
    const activated = JSON.parse(applied.stdout) as {
      mode: string;
      organization: { id: string };
      members: { username: string; role: string }[];
      mappedRoots: Record<string, number>;
    };
    expect(activated).toMatchObject({ mode: 'applied', mappedRoots: { project: 1, resource: 3 } });
    expect(activated.members.map(({ username, role }) => [username, role]).toSorted()).toEqual([
      ['ada', 'member'],
      ['dany', 'super_admin'],
    ]);
    expect(activation()).toBe('activated');
    ids.organizationId = activated.organization.id;
    sessions.set('dany', await select(h.token('dany'), ids.organizationId));
    sessions.set('ada', await select(h.token('ada'), ids.organizationId));

    // `fleet-credentials`: an admin binds every agent person to the operator's account.
    const bound = await directoryAs(sessionOf('dany'), [
      ...AGENTS.map((name) => ({
        kind: 'patchPerson',
        personId: personOf(name),
        patch: { kind: 'agent', accountId: h.userId('dany') },
      })),
      {
        kind: 'patchPerson',
        personId: personOf('ada-agent'),
        patch: { kind: 'agent', accountId: h.userId('ada') },
      },
    ]);
    expect(bound.status).toBe(200);

    // `fleet-credentials`: each fleet's machine pair is linked to that account, pinned to its
    // superagent, and its token then selects the organization like any credential of the account.
    const usersBefore = usersTable();
    for (const fleet of ['claire', 'claude'] as const) {
      const linked = cli('link-credential-cli.ts', [
        `--issuer=${ISSUER}`,
        `--subject=${SUBJECTS[fleet]}`,
        '--account=dany',
        `--person=${personOf(SUPERAGENTS[fleet])}`,
      ]);
      expect({ fleet, exitCode: linked.exitCode, stderr: linked.stderr }).toEqual({
        fleet,
        exitCode: 0,
        stderr: '',
      });
      sessions.set(fleet, await select(await machineToken(SUBJECTS[fleet]), ids.organizationId));
    }
    expect(usersTable()).toEqual(usersBefore);
  });

  const raced: { leaf: LeafPlan; answer: Answer }[] = [];

  test('2. superagents claim their subtrees and seven workers race for the leaves', async () => {
    // `startable-work`: before anything is claimed every leaf of a team is startable and fits,
    // except B4, which alone asks 8 GB of 16 and still fits.
    for (const fleet of ['claire', 'claude'] as const)
      expectStartableAgrees(await startableFor(fleet, fleet), fleet);

    // `plan-command-registry` (team claims): a superagent claims a subtree, acquiring nothing.
    for (const fleet of ['claire', 'claude'] as const) {
      const answer = await commandsAs(fleet, [
        {
          kind: 'claimWorkItem',
          workItemId: ids.subtrees[fleet],
          personId: personOf(SUPERAGENTS[fleet]),
          runId: `agent:${fleet}:main`,
        },
      ]);
      expect(answer.status).toBe(200);
      const claimed = claimAnswerOf(answer);
      expect(claimed.claimIds).toHaveLength(1);
      expect(claimed.acquired).toEqual([]);
      ids.subtreeClaims[fleet] = nth(claimed.claimIds, 0);
    }

    // `resource-occupancy`: seven delegated claims at once through the write coordinator.
    const contenders = LEAVES.filter((leaf) => leaf.isRaced);
    const answers = await race(
      contenders.map((leaf) => ({ actor: leaf.fleet, commands: [workerClaim(leaf)] })),
    );
    for (const [index, leaf] of contenders.entries())
      raced.push({ leaf, answer: nth(answers, index) });

    const won = raced.filter((each) => each.answer.status === 200);
    const lost = raced.filter((each) => each.answer.status !== 200);
    // In every admission order two 6 GB leaves and one staging leaf fit 16 GB and one slot.
    // Proof: 2026-10-20, with `decideClaim` ignoring `refuseOccupancy`'s answer, four staging
    // leaves were admitted here (length 4, not 1) and step 4 found 2 GB free instead of >= 6.
    expect(won.filter((each) => each.leaf.needsStaging)).toHaveLength(1);
    expect(won.filter((each) => !each.leaf.needsStaging)).toHaveLength(2);
    const acquired = won.flatMap((each) => claimAnswerOf(each.answer).acquired);
    const unitsOf = (resourceId: string) =>
      acquired
        .filter((each) => each.resourceId === resourceId)
        .reduce((sum, each) => sum + each.units, 0);
    expect(unitsOf(ids.resources.ram)).toBe(16);
    expect(unitsOf(ids.resources.staging)).toBe(1);
    expect(unitsOf(ids.resources.disk)).toBe(30);
    expect(occupied()).toEqual({
      [ids.resources.ram]: 16,
      [ids.resources.disk]: 30,
      [ids.resources.staging]: 1,
    });
    // Every loser is refused resources_exhausted naming holders that really hold the units.
    const winners = new Set(won.map((each) => leafOf(each.leaf.key)));
    for (const { leaf, answer } of lost) {
      const refusal = answer.body as ExhaustedRefusal;
      expect({ leaf: leaf.key, status: answer.status, error: refusal.error }).toEqual({
        leaf: leaf.key,
        status: 409,
        error: 'resources_exhausted',
      });
      expect([ids.resources.ram, ids.resources.staging]).toContain(refusal.resourceId);
      expect(refusal.asked).toBe(refusal.resourceId === ids.resources.ram ? leaf.ram : 1);
      expect(refusal.free).toBeLessThan(refusal.asked);
      expect(refusal.holders.length).toBeGreaterThan(0);
      for (const holder of refusal.holders) expect(winners.has(holder.workItemId)).toBe(true);
    }
    // `plan-command-registry`: each delegated claim names its parent and its run.
    for (const { leaf } of won) {
      const rows = h.sqlite
        .query<{ person_id: string; run_id: string; parent_claim_id: string }, [string]>(
          'SELECT person_id, run_id, parent_claim_id FROM claim WHERE work_item_id = ?',
        )
        .all(leafOf(leaf.key));
      expect(rows).toEqual(
        [ids.steps.dev, ids.steps.qa].map(() => ({
          person_id: personOf(leaf.worker),
          run_id: leaf.runId,
          parent_claim_id: ids.subtreeClaims[leaf.fleet],
        })),
      );
    }
  });

  test('2b. the fences between fleets hold', async () => {
    const before = h.sqlite.query('SELECT * FROM claim ORDER BY id').all();
    const held = heldLeaf();
    const holder = SUPERAGENTS[held.fleet];
    const stranger = held.fleet === 'claude' ? 'claire' : 'claude';
    const strangerWorker = held.fleet === 'claude' ? 'claire-w1' : 'claude-w1';
    // Review of a held leaf: a second claim on it acquires nothing (its occupancy is shared),
    // so the occupancy checks, which precede the subtree fence, pass and the fence answers.
    const review = (personId: string) => ({
      kind: 'claimWorkItem',
      workItemId: leafOf(held.key),
      personId,
      steps: [ids.steps.review],
    });
    // `plan-command-registry`: the other fleet's superagent, inside a claimed subtree.
    expect(await commandsAs(stranger, [review(personOf(stranger))])).toMatchObject({
      status: 409,
      body: { error: 'inside_subtree_claim', holder: { personId: personOf(holder) } },
    });
    // The operator's unpinned session, as the other fleet's worker with no parent claim.
    expect(await commandsAs('dany', [review(personOf(strangerWorker))])).toMatchObject({
      status: 409,
      body: { error: 'inside_subtree_claim', holder: { personId: personOf(holder) } },
    });
    // `fleet-credentials`: a credential claiming as the other fleet's superagent, and as one of
    // its own fleet's workers with no parent claim, is refused by its pin before anything else.
    for (const [fleet, person] of [
      [stranger, holder],
      [stranger, strangerWorker],
    ] as const) {
      const pinned = await commandsAs(fleet, [review(personOf(person))]);
      expect({ fleet, person, ...pinned }).toEqual({
        fleet,
        person,
        status: 403,
        body: { error: 'credential_not_for_person', at: 0, kind: 'claimWorkItem' },
        cookie: null,
      });
    }
    expect(h.sqlite.query('SELECT * FROM claim ORDER BY id').all()).toEqual(before);

    // `startable-work` + `wbs-resources` R6: the read agrees with the store for both teams.
    for (const fleet of ['claire', 'claude'] as const) {
      const read = await startableFor(fleet, fleet);
      expectStartableAgrees(read, fleet);
      // A claimed leaf's Review step is still startable, and fits: it already holds its units.
      for (const leaf of read.leaves.filter((each) =>
        claimedLeafKeys().includes(keyOf(each.workItemId)),
      ))
        expect(leaf.stepIds).toEqual([ids.steps.review]);
      // Each startable row names the subtree claim in force above it, with its holder.
      for (const row of read.leaves)
        expect(row.subtreeClaim).toMatchObject({
          claimId: ids.subtreeClaims[fleet],
          holder: { personId: personOf(SUPERAGENTS[fleet]) },
        });
      for (const step of read.claimed) {
        const leaf = planOf(keyOf(step.workItemId));
        expect(step).toMatchObject({
          holder: { personId: personOf(leaf.worker) },
          assignee: null,
          runId: leaf.runId,
          parentClaimId: ids.subtreeClaims[fleet],
        });
      }
      expect(read.subtreeClaims.map((each) => each.holder.personId).toSorted()).toEqual(
        [personOf('claire'), personOf('claude')].toSorted(),
      );
    }
  });

  test('3. the operator assigns a subtree for review and a worker claims with assign', async () => {
    // `assignee-management`: one command assigns Review on every leaf of fleet A's subtree.
    const assigned = await commandsAs('dany', [
      {
        kind: 'assignSubtree',
        workItemId: ids.subtrees.claire,
        stepId: ids.steps.review,
        personId: personOf('kat'),
      },
    ]);
    expect(assigned.status).toBe(200);
    const work = (person: string) =>
      send(
        sessionOf('dany'),
        'GET',
        `/api/projects/${ids.projectId}/people/${personOf(person)}/work`,
      );
    const kat = await work('kat');
    expect(kat.status).toBe(200);
    const katWork = kat.body as {
      assignments: { workItemId: string; stepId: string }[];
      claims: unknown[];
    };
    expect(
      katWork.assignments.map((each) => `${keyOf(each.workItemId)}/${each.stepId}`).toSorted(),
    ).toEqual(['A1', 'A2', 'A3', 'A4'].map((key) => `${key}/${ids.steps.review}`));
    expect(katWork.claims).toEqual([]);

    // `assignee-management`: a worker's by-person read lists its claims with run and parent.
    const winner = raced.find((each) => each.answer.status === 200);
    if (winner === undefined) throw new Error('no worker won a leaf');
    const mine = await work(winner.leaf.worker);
    const claims = (
      mine.body as {
        claims: { workItemId: string; stepId: string; runId: string; parentClaimId: string }[];
      }
    ).claims.filter((each) => each.workItemId === leafOf(winner.leaf.key));
    expect(
      claims.map(({ stepId, runId, parentClaimId }) => ({ stepId, runId, parentClaimId })),
    ).toEqual(
      [ids.steps.dev, ids.steps.qa].map((stepId) => ({
        stepId,
        runId: winner.leaf.runId,
        parentClaimId: ids.subtreeClaims[winner.leaf.fleet],
      })),
    );

    // `assignee-management` + `resource-occupancy`: a worker claims Review of a held leaf with
    // assign: the leaf's occupancy is shared, so nothing more is acquired.
    const held = heldLeaf();
    // Never the leaf's own worker: its by-person read would list its dev and qa claims too.
    // Proof: with the fixed `claude-w3`, a race that left B3 as fleet B's only held leaf
    // read `[dev, qa, review]` here (h2puni gate on 15fd22d7e, 2026-10-26); `===` for `!==`
    // below reproduces it on every run.
    const reviewer = AGENTS.find(
      (agent) => agent.startsWith(`${held.fleet}-w`) && agent !== held.worker,
    );
    if (reviewer === undefined) throw new Error(`no second ${held.fleet} worker to review`);
    const before = occupied();
    const claimed = await commandsAs(held.fleet, [
      {
        kind: 'claimWorkItem',
        workItemId: leafOf(held.key),
        personId: personOf(reviewer),
        runId: `agent:${reviewer}:review`,
        parentClaim: ids.subtreeClaims[held.fleet],
        steps: [ids.steps.review],
        assign: true,
      },
    ]);
    expect(claimed.status).toBe(200);
    expect(claimAnswerOf(claimed)).toMatchObject({
      assignedStepIds: [ids.steps.review],
      acquired: [],
    });
    expect(occupied()).toEqual(before);
    const reviewing = (await work(reviewer)).body as {
      assignments: { workItemId: string; stepId: string }[];
      claims: { workItemId: string; stepId: string }[];
    };
    const onHeld = (rows: { workItemId: string; stepId: string }[]) =>
      rows.filter((each) => each.workItemId === leafOf(held.key)).map((each) => each.stepId);
    expect(onHeld(reviewing.assignments)).toEqual([ids.steps.review]);
    expect(onHeld(reviewing.claims)).toEqual([ids.steps.review]);
    // `startable-work`: the claimed step keeps its assignee in view beside its holder.
    const review = (await startableFor(held.fleet, held.fleet)).claimed.find(
      (each) => each.workItemId === leafOf(held.key) && each.stepId === ids.steps.review,
    );
    expect(review).toMatchObject({
      holder: { personId: personOf(reviewer) },
      assignee: { personId: personOf(reviewer) },
      parentClaimId: ids.subtreeClaims[held.fleet],
    });

    // Undo of that claim removes the claim and the assignment together.
    const undone = await send(sessionOf(held.fleet), 'POST', `/api/projects/${ids.projectId}/undo`);
    expect(undone.status).toBe(200);
    const after = (await work(reviewer)).body as typeof reviewing;
    expect(onHeld(after.assignments)).toEqual([]);
    expect(onHeld(after.claims)).toEqual([]);
    expect(occupied()).toEqual(before);
  });

  test('4. releasing a subtree cascades, frees the units and a second round fits more', async () => {
    const claireLeafIds = LEAVES.filter((each) => each.fleet === 'claire').map((each) =>
      leafOf(each.key),
    );
    const heldByA = claimedLeafKeys().filter((key) => key.startsWith('A'));
    const before = occupied();
    const freedRam = LEAVES.filter((each) => heldByA.includes(each.key)).reduce(
      (sum, each) => sum + each.ram,
      0,
    );
    // `plan-command-registry` (release): superagent A releases its subtree claim.
    const released = await commandsAs('claire', [
      { kind: 'releaseWorkItem', workItemId: ids.subtrees.claire, personId: personOf('claire') },
    ]);
    expect(released.status).toBe(200);
    // Every delegated claim under it is gone with it; fleet B's claims stand.
    const remaining = h.sqlite
      .query<{ work_item_id: string }, []>('SELECT work_item_id FROM claim')
      .all()
      .map((row) => row.work_item_id);
    expect(
      remaining.filter((id) => claireLeafIds.includes(id) || id === ids.subtrees.claire),
    ).toEqual([]);
    expect(remaining).toContain(ids.subtrees.claude);
    // `resource-occupancy`: the release of a leaf's last claim frees its units.
    const usage = occupied();
    expect(usage[ids.resources.ram] ?? 0).toBe((before[ids.resources.ram] ?? 0) - freedRam);
    // `startable-work`: fleet A's leaves read startable again, with fit against the freed units.
    const readA = await startableFor('claire', 'claire');
    expectStartableAgrees(readA, 'claire');
    expect(readA.claimed).toEqual([]);
    expect(readA.subtreeClaims.map((each) => each.holder.personId)).toEqual([personOf('claude')]);

    // Another account takes every freed unit of RAM on the hotfix (a claim may ask more than
    // the declared 1 GB, `resource-occupancy`), so undoing the release cannot re-acquire. A
    // leaf the release freed would refuse the undo as changed instead, never reaching the check.
    const freeRam = RAM_CAPACITY - (usage[ids.resources.ram] ?? 0);
    expect(freeRam).toBeGreaterThan(0);
    const taken = await commandsAs('ada', [
      {
        kind: 'claimWorkItem',
        workItemId: leafOf(HOTFIX),
        personId: personOf('ada-agent'),
        runId: 'agent:ada:taker',
        steps: [ids.steps.dev],
        resources: [{ resourceId: ids.resources.ram, units: freeRam }],
      },
    ]);
    expect(taken.status).toBe(200);
    expect(occupied()[ids.resources.ram]).toBe(RAM_CAPACITY);
    // `resource-occupancy`: undo of a multi-leaf release re-acquires all or nothing.
    const occupiedBeforeUndo = occupied();
    const claimsBeforeUndo = h.sqlite.query('SELECT * FROM claim ORDER BY id').all();
    const undone = await send(sessionOf('dany'), 'POST', `/api/projects/${ids.projectId}/undo`);
    expect(undone).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
    expect((undone.body as { detail: string }).detail).toStartWith('resources_exhausted:');
    expect(occupied()).toEqual(occupiedBeforeUndo);
    expect(h.sqlite.query('SELECT * FROM claim ORDER BY id').all()).toEqual(claimsBeforeUndo);
    expect(
      (
        await commandsAs('ada', [
          {
            kind: 'releaseWorkItem',
            workItemId: leafOf(HOTFIX),
            personId: personOf('ada-agent'),
          },
        ])
      ).status,
    ).toBe(200);

    // A second round: superagent A claims again and its workers race for every free A leaf.
    const reclaimed = await commandsAs('claire', [
      {
        kind: 'claimWorkItem',
        workItemId: ids.subtrees.claire,
        personId: personOf('claire'),
        runId: 'agent:claire:main:2',
      },
    ]);
    expect(reclaimed.status).toBe(200);
    ids.subtreeClaims.claire = nth(claimAnswerOf(reclaimed).claimIds, 0);
    const roundTwo = LEAVES.filter((each) => each.fleet === 'claire');
    const fitting = (await startableFor('claire', 'claire')).leaves.length;
    const answers = await race(
      roundTwo.map((leaf) => ({ actor: 'claire', commands: [workerClaim(leaf)] })),
    );
    const accepted = answers.filter((each) => each.status === 200).length;
    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThanOrEqual(fitting);
    for (const answer of answers.filter((each) => each.status !== 200))
      expect(answer).toMatchObject({ status: 409, body: { error: 'resources_exhausted' } });
    const total = occupied();
    expect(total[ids.resources.ram] ?? 0).toBeLessThanOrEqual(RAM_CAPACITY);
    expect(total[ids.resources.staging] ?? 0).toBeLessThanOrEqual(1);
    expect(claimedLeafKeys().length).toBeGreaterThan(
      claimedLeafKeys().filter((key) => key.startsWith('B')).length,
    );
    expectStartableAgrees(await startableFor('claire', 'claire'), 'claire');
  });

  /** Test 5's leaf, its claims before the split and the occupancy before it. */
  const promotion: {
    key: string;
    parent: string;
    child: string;
    held: string[];
    occupied: Record<string, number>;
  } = { key: '', parent: '', child: '', held: [], occupied: {} };

  test('5. a claimed, demanded leaf split and promoted keeps its claim and its demand', async () => {
    const key = nth(claimedLeafKeys(), 0);
    const parent = leafOf(key);
    const plan = planOf(key);
    const claimsOn = (workItemId: string) =>
      h.sqlite
        .query<{ id: string }, [string]>('SELECT id FROM claim WHERE work_item_id = ? ORDER BY id')
        .all(workItemId)
        .map((row) => row.id);
    const demandsOn = async (workItemId: string) => {
      const answer = await send(
        sessionOf('dany'),
        'GET',
        `/api/projects/${ids.projectId}/resources`,
      );
      return (
        answer.body as { demands: { workItemId: string; resourceId: string; units: number }[] }
      ).demands
        .filter((each) => each.workItemId === workItemId)
        .map(({ resourceId, units }) => ({ resourceId, units }))
        .toSorted((a, b) => a.resourceId.localeCompare(b.resourceId));
    };
    const held = claimsOn(parent);
    const demanded = await demandsOn(parent);
    expect(held.length).toBeGreaterThan(0);
    expect(demanded).toContainEqual({ resourceId: ids.resources.ram, units: plan.ram });

    // `plan-command-registry` + `resource-directory`: the first child takes claim and demand.
    const split = async () => {
      const child = nth(
        mintedIds(
          await commandsAs('dany', [
            { kind: 'createWorkItem', parentId: parent, afterId: null, name: `Split of ${key}` },
          ]),
        ),
        0,
      );
      expect(claimsOn(child)).toEqual(held);
      expect(claimsOn(parent)).toEqual([]);
      expect(await demandsOn(child)).toEqual(demanded);
      expect(await demandsOn(parent)).toEqual([]);
      return child;
    };
    const occupiedBefore = occupied();
    await split();
    expect(occupied()).toEqual(occupiedBefore);

    // Undoing the first child moves claim and demand back to the parent.
    expect(
      (await send(sessionOf('dany'), 'POST', `/api/projects/${ids.projectId}/undo`)).status,
    ).toBe(200);
    expect(claimsOn(parent)).toEqual(held);
    expect(await demandsOn(parent)).toEqual(demanded);
    expect(occupied()).toEqual(occupiedBefore);

    // A move of other work under the claimed leaf is refused, naming the holders.
    const other = LEAVES.find((each) => !claimedLeafKeys().includes(each.key));
    if (other === undefined) throw new Error('every leaf is claimed');
    const moved = await commandsAs('dany', [
      { kind: 'moveWorkItem', workItemId: leafOf(other.key), parentId: parent, afterId: null },
    ]);
    expect(moved).toMatchObject({ status: 409, body: { error: 'destination_claimed' } });
    const holders = (moved.body as { holders: { personId: string }[] }).holders;
    expect(holders.length).toBeGreaterThan(0);
    expect(holders.every((each) => each.personId === personOf(plan.worker))).toBe(true);

    // `resource-directory`: deleting the only child promotes the parent and the demand returns.
    const child = await split();
    const deleted = await commandsAs('dany', [{ kind: 'deleteWorkItem', workItemId: child }]);
    expect(deleted.status).toBe(200);
    expect(await demandsOn(parent)).toEqual(demanded);
    Object.assign(promotion, { key, parent, child, held, occupied: occupiedBefore });
  });

  // The 2026-10-20 rehearsal's finding, closed: the delete used to remove the child's claims,
  // leaving the leaf unclaimed and its occupancy freed without a release.
  test('5b. deleting the only child of a claimed leaf returns the claims and occupancy to the parent', async () => {
    const { key, parent, child, held } = promotion;
    const plan = planOf(key);
    const claimsOn = (workItemId: string) =>
      h.sqlite
        .query<{ id: string }, [string]>('SELECT id FROM claim WHERE work_item_id = ? ORDER BY id')
        .all(workItemId)
        .map((row) => row.id);
    const occupancyOn = (workItemId: string) =>
      h.sqlite
        .query<{ claim_id: string; resource_id: string; units: number }, [string]>(
          `SELECT o.claim_id, o.resource_id, o.units FROM claim_occupancy AS o
           JOIN claim AS c ON c.id = o.claim_id WHERE c.work_item_id = ?
           ORDER BY o.claim_id, o.resource_id`,
        )
        .all(workItemId);
    expect(held.length).toBeGreaterThan(0);
    // `plan-command-registry`: the delete that promoted the parent handed the claims up, and the
    // occupancy rows followed them by claim id.
    expect(claimsOn(parent)).toEqual(held);
    const occupancy = occupancyOn(parent);
    expect(occupancy.length).toBeGreaterThan(0);
    expect(occupied()).toEqual(promotion.occupied);

    // Undo hands them back down to the restored child; redo hands them up again. A delete's
    // entry journals its blockage facts, and a database whose blockage authority was never
    // activated refuses replaying it `step_blockage_inactive` whatever the claims do, so the
    // authority is enabled here as the attended activation would.
    activateTestStepBlockages(h.databasePath());
    const undo = () => send(sessionOf('dany'), 'POST', `/api/projects/${ids.projectId}/undo`);
    const redo = () => send(sessionOf('dany'), 'POST', `/api/projects/${ids.projectId}/redo`);
    expect((await undo()).status).toBe(200);
    expect(claimsOn(child)).toEqual(held);
    expect(claimsOn(parent)).toEqual([]);
    expect(occupancyOn(child)).toEqual(occupancy);
    expect(occupied()).toEqual(promotion.occupied);
    expect((await redo()).status).toBe(200);
    expect(claimsOn(parent)).toEqual(held);
    expect(occupancyOn(parent)).toEqual(occupancy);
    expect(occupied()).toEqual(promotion.occupied);

    // The worker releases the leaf normally, which frees exactly its units.
    const released = await commandsAs(plan.fleet, [
      { kind: 'releaseWorkItem', workItemId: parent, personId: personOf(plan.worker) },
    ]);
    expect(released.status).toBe(200);
    expect(claimsOn(parent)).toEqual([]);
    const freed: Record<string, number> = {};
    for (const row of occupancy)
      freed[row.resource_id] = Math.max(freed[row.resource_id] ?? 0, row.units);
    const after = occupied();
    for (const [resourceId, units] of Object.entries(promotion.occupied))
      expect(after[resourceId] ?? 0).toBe(units - (freed[resourceId] ?? 0));
  });

  test('6. an unlinked fleet credential is refused and mints no account', async () => {
    const before = usersTable();
    const unlinked = cli('link-credential-cli.ts', [
      '--unlink',
      `--issuer=${ISSUER}`,
      `--subject=${SUBJECTS.claude}`,
    ]);
    expect({ exitCode: unlinked.exitCode, stderr: unlinked.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });
    // `fleet-credentials`: its very next request, with the selection it already holds.
    expect(
      await send(sessionOf('claude'), 'GET', `/api/projects/${ids.projectId}/startable`),
    ).toMatchObject({ status: 401, body: { error: 'unknown_identity' } });
    expect(usersTable()).toEqual(before);
    // The account's other credential still works.
    expect((await startableFor('claire', 'claire')).occupancyScope).toBe('project');
  });
});
