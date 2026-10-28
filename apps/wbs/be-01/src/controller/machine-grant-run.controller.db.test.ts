import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { CLAIM_LEASE_MS } from '@wbs/domain';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { importMachineGrantKeys, type MachineGrantKeys } from '../runtime/machine-grant';
import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/** mcp-01's dedicated secret in these tests. */
const SECRET = 'm'.repeat(32);
const AUTHORIZATION_SERVER = 'https://wbs.example/mcp/oauth';
/** A real-epoch instant (2026-10-27), so a grant's `exp` is judged as in production. */
const T = 1_793_000_000_000;
const MINUTE = 60_000;

let keys: MachineGrantKeys;
let now = T;
let h: OrganizationHarness;
let projectId: string;
let steps: string[];
let claireKey: string;
let claireCredentialId: string;
let workerKey: string;
let pushes: string[];

beforeAll(async () => {
  keys = await importMachineGrantKeys({
    current: 'grant-key-g-0123456789abcdefghijklmn',
    previous: null,
  });
});

/**
 * A machine grant's principal and its opted-in run (`wbs-mcp-agent-surface`
 * tasks 1.4 and 1.6, design M6, M15) over be-01's production composition and
 * real SQLite, with the services clock held at `now`. A grant is fetched as
 * mcp-01 fetches it and presented with the dedicated secret; a raw key is
 * presented on `/api` as the test-only composition seam does (M9).
 */
async function openMachineFixture(connected = false) {
  now = T;
  pushes = [];
  h = OrganizationHarness.openComposedWith({
    ...(connected
      ? {
          syntheticExternalCommands: true as const,
          pushFetch: (request: string) => {
            pushes.push(request);
            return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
          },
        }
      : {}),
    now: () => now,
    machineGrants: { secret: SECRET, keys, authorizationServer: AUTHORIZATION_SERVER },
  });
  await h.register('dany');
  h.organization('org-a');
  h.member('org-a', 'dany', 'super_admin');
  h.bind('dany', 'org-a');
  h.activate();
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Plan of A' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  projectId = (created.body as { project: { id: string } }).project.id;
  steps = h.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id = ? ORDER BY position')
    .all(projectId)
    .map(({ id }) => id);
  if (steps.length < 2) throw new Error(`the project holds ${String(steps.length)} steps`);
  addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
  addAgentPerson(h.sqlite, 'claire-worker', 'org-a', h.userId('dany'));
  const claireCredential = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'claire',
    issuedBy: h.userId('dany'),
  });
  claireKey = claireCredential.key;
  claireCredentialId = claireCredential.id;
  workerKey = (
    await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'claire-worker',
      issuedBy: h.userId('dany'),
    })
  ).key;
}

beforeEach(() => openMachineFixture());

afterEach(async () => {
  await h.closeComposed();
});

/** A grant for `key`, as mcp-01 asks for one, opted into `run` when given. */
async function grantFor(key: string, run?: string): Promise<string> {
  const response = await h.request('/internal/mcp/machine-grants', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [MCP_INTERNAL_SECRET_HEADER]: SECRET },
    body: JSON.stringify({
      issuer: AUTHORIZATION_SERVER,
      credential: { kind: 'api_key', key },
      expiresAt: Math.floor(now / 1000) + 12 * 60 * 60,
      ...(run === undefined ? {} : { run }),
    }),
  });
  const text = await response.text();
  if (response.status !== 200) throw new Error(`grant refused: ${String(response.status)} ${text}`);
  return (JSON.parse(text) as { grant: string }).grant;
}

/** One call as mcp-01 makes it: the grant as Bearer, the dedicated secret beside it. */
function withGrant(grant: string, method: string, path: string, body?: unknown): Promise<Answer> {
  return h.callWith(grant, method, path, body, { [MCP_INTERNAL_SECRET_HEADER]: SECRET });
}

function commands(bearer: (path: string, body: unknown) => Promise<Answer>, list: unknown[]) {
  return bearer(`/api/projects/${projectId}/commands`, { commands: list });
}

function asGrant(grant: string) {
  return (path: string, body: unknown) => withGrant(grant, 'POST', path, body);
}

function asKey(key: string) {
  return (path: string, body: unknown) => h.callWith(key, 'POST', path, body);
}

/** Root leaves, or children of `parentId`, by id in creation order. */
async function workItems(names: string[], parentId: string | null = null): Promise<string[]> {
  const created = await h.call('dany', 'POST', `/api/projects/${projectId}/commands`, {
    commands: names.map((name) => ({ kind: 'createWorkItem', parentId, name })),
  });
  if (created.status !== 200) throw new Error(`rows refused: ${JSON.stringify(created)}`);
  const workItemIds = (created.body as { results: { id: string }[] }).results.map(({ id }) => id);
  // Lease/run cases continue already-running later-step work; Dev remains normally runnable.
  expectApplied(
    await h.call('dany', 'POST', `/api/projects/${projectId}/commands`, {
      commands: workItemIds.flatMap((workItemId) =>
        steps
          .slice(1)
          .map((stepId) => ({ kind: 'setProgress', workItemId, stepId, state: 'in_progress' })),
      ),
    }),
  );
  return workItemIds;
}

interface ClaimRow {
  readonly workItemId: string;
  readonly stepId: string | null;
  readonly personId: string;
  readonly runId: string | null;
  readonly leaseExpiresAt: number | null;
}

function claimRows(): ClaimRow[] {
  return h.sqlite
    .query<ClaimRow, []>(
      `SELECT work_item_id AS workItemId, step_id AS stepId, person_id AS personId,
              run_id AS runId, lease_expires_at AS leaseExpiresAt
         FROM claim ORDER BY work_item_id, step_id`,
    )
    .all();
}

/** The distinct work items claims sit on, in claim order. */
function claimedItems(): string[] {
  return [...new Set(claimRows().map(({ workItemId }) => workItemId))];
}

function expectApplied(answer: Answer): void {
  if (answer.status !== 200) throw new Error(`refused: ${JSON.stringify(answer)}`);
}

function capClaims(maxConcurrentClaims: number): void {
  h.sqlite.run(
    `INSERT INTO organization_limits
       (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at)
     VALUES ('org-a', 50, ?, 10000, 1)`,
    [maxConcurrentClaims],
  );
}

describe('a machine grant yields the API-key principal (task 1.4)', () => {
  // Proof: with `personId` left out of the grant principal's authentication
  // (`machinePrincipalOf`), this case failed at the grant's claim: with no
  // pinned person it took no lease and its default claimant was refused
  // person_required (#758 reads the same person); watched 2026-10-27.
  it('parity with a raw key: one person, leased, renewed, and the same cap', async () => {
    const [byGrant, byKey, third] = await workItems(['By grant', 'By key', 'Third']);
    const grant = await grantFor(claireKey);
    capClaims(2);
    expectApplied(await commands(asGrant(grant), [{ kind: 'claimWorkItem', workItemId: byGrant }]));
    expectApplied(await commands(asKey(claireKey), [{ kind: 'claimWorkItem', workItemId: byKey }]));
    const held = claimRows();
    expect(new Set(held.map(({ personId }) => personId))).toEqual(new Set(['claire']));
    expect(new Set(held.map(({ runId }) => runId))).toEqual(new Set([null]));
    expect(held.map(({ leaseExpiresAt }) => leaseExpiresAt)).toEqual(
      held.map(() => T + CLAIM_LEASE_MS),
    );
    now = T + 2 * MINUTE;
    expect(await withGrant(grant, 'POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leases: held.length, leaseExpiresAt: now + CLAIM_LEASE_MS },
    });
    now = T + 4 * MINUTE;
    expect(await h.callWith(claireKey, 'POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leases: held.length, leaseExpiresAt: now + CLAIM_LEASE_MS },
    });
    const third_ = [{ kind: 'claimWorkItem', workItemId: third }];
    const refusedGrant = await commands(asGrant(grant), third_);
    const refusedKey = await commands(asKey(claireKey), third_);
    expect(refusedGrant).toMatchObject({ body: { error: 'claim_limit', cap: 2, current: 2 } });
    expect(refusedKey).toEqual(refusedGrant);
  });
});

describe('run scoping through wbs_run (task 1.6)', () => {
  // Proof: with the verifier defaulting a grant's run to its `jti`
  // (`machine-grant.ts` parseClaims), the re-claim after the re-fetch was
  // refused already_claimed against claire's own claim; watched 2026-10-27.
  it('re-fetching without wbs_run orphans nothing', async () => {
    const [leaf] = await workItems(['Leaf']);
    const first = await grantFor(claireKey);
    expectApplied(await commands(asGrant(first), [{ kind: 'claimWorkItem', workItemId: leaf }]));
    now = T + 5 * MINUTE;
    const refetched = await grantFor(claireKey);
    const again = await commands(asGrant(refetched), [{ kind: 'claimWorkItem', workItemId: leaf }]);
    expect(again).toMatchObject({ status: 200, body: { results: [{ alreadyHeld: true }] } });
    // That batch renewed the claim's leases, as the heartbeat now reports.
    expect(await withGrant(refetched, 'POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leases: 2, leaseExpiresAt: now + CLAIM_LEASE_MS },
    });
  });

  it('stamps the run on a claim for its own person, the default claimant included', async () => {
    const [named, defaulted] = await workItems(['Named', 'Defaulted']);
    const grant = await grantFor(claireKey, 'a');
    expectApplied(
      await commands(asGrant(grant), [
        { kind: 'claimWorkItem', workItemId: named, personId: 'claire', runId: 'a' },
        { kind: 'claimWorkItem', workItemId: defaulted },
      ]),
    );
    expect(new Set(claimRows().map(({ runId }) => runId))).toEqual(new Set(['a']));
  });

  // Proof: with the heartbeat renewing by person alone (`pin.runId` dropped in
  // claim-lease.routes.ts), process B's lease moved on A's heartbeat; watched
  // 2026-10-27.
  it('two processes on one credential: only the heartbeating one keeps its leases', async () => {
    const [forA, forB] = await workItems(['For A', 'For B']);
    const processA = await grantFor(claireKey, 'a');
    const processB = await grantFor(claireKey, 'b');
    expectApplied(await commands(asGrant(processA), [{ kind: 'claimWorkItem', workItemId: forA }]));
    expectApplied(await commands(asGrant(processB), [{ kind: 'claimWorkItem', workItemId: forB }]));
    now = T + 5 * MINUTE;
    expect(await withGrant(processA, 'POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leaseExpiresAt: now + CLAIM_LEASE_MS },
    });
    const byRun = new Set(
      claimRows().map(({ runId, leaseExpiresAt }) => `${String(runId)} ${String(leaseExpiresAt)}`),
    );
    expect(byRun).toEqual(
      new Set([`a ${String(now + CLAIM_LEASE_MS)}`, `b ${String(T + CLAIM_LEASE_MS)}`]),
    );
  });

  // Proof: with `null` for the run in the batch renewal
  // (plan-commands.feature.ts), run b's lease moved on run a's write;
  // watched 2026-10-27.
  it('a run-scoped write renews only its run', async () => {
    const [forA, forB, later] = await workItems(['For A', 'For B', 'Later']);
    const processA = await grantFor(claireKey, 'a');
    const processB = await grantFor(claireKey, 'b');
    expectApplied(await commands(asGrant(processA), [{ kind: 'claimWorkItem', workItemId: forA }]));
    expectApplied(await commands(asGrant(processB), [{ kind: 'claimWorkItem', workItemId: forB }]));
    now = T + 5 * MINUTE;
    expectApplied(
      await commands(asGrant(processA), [{ kind: 'claimWorkItem', workItemId: later }]),
    );
    const leases = claimRows().map(({ workItemId, leaseExpiresAt }) => [
      workItemId,
      leaseExpiresAt,
    ]);
    expect(Object.fromEntries(leases)).toEqual({
      [forA]: now + CLAIM_LEASE_MS,
      [forB]: T + CLAIM_LEASE_MS,
      [later]: now + CLAIM_LEASE_MS,
    });
  });

  it('a no-run heartbeat renews every run', async () => {
    const [forA, forB] = await workItems(['For A', 'For B']);
    expectApplied(
      await commands(asGrant(await grantFor(claireKey, 'a')), [
        { kind: 'claimWorkItem', workItemId: forA },
      ]),
    );
    expectApplied(
      await commands(asGrant(await grantFor(claireKey, 'b')), [
        { kind: 'claimWorkItem', workItemId: forB },
      ]),
    );
    now = T + 5 * MINUTE;
    expect(await withGrant(await grantFor(claireKey), 'POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leases: 4, leaseExpiresAt: now + CLAIM_LEASE_MS },
    });
  });

  // Proof: with a run's renewal kept to its own run (the no-run half dropped
  // from `ClaimRepository.renewLeases`), the pre-opt-in lease stayed at
  // T + 15 min; watched 2026-10-27.
  it('a run renews its person’s pre-opt-in lease', async () => {
    const [leaf] = await workItems(['Leaf']);
    expectApplied(
      await commands(asGrant(await grantFor(claireKey)), [
        { kind: 'claimWorkItem', workItemId: leaf },
      ]),
    );
    now = T + 5 * MINUTE;
    expect(
      await withGrant(await grantFor(claireKey, 'a'), 'POST', '/api/claims/renew'),
    ).toMatchObject({
      status: 200,
      body: { leases: 2, leaseExpiresAt: now + CLAIM_LEASE_MS },
    });
    expect(new Set(claimRows().map(({ leaseExpiresAt }) => leaseExpiresAt))).toEqual(
      new Set([now + CLAIM_LEASE_MS]),
    );
  });

  it('re-claims its own pre-opt-in claim as alreadyHeld, the run not restamped', async () => {
    const [leaf] = await workItems(['Leaf']);
    expectApplied(
      await commands(asGrant(await grantFor(claireKey)), [
        { kind: 'claimWorkItem', workItemId: leaf },
      ]),
    );
    const again = await commands(asGrant(await grantFor(claireKey, 'a')), [
      { kind: 'claimWorkItem', workItemId: leaf },
    ]);
    expect(again).toMatchObject({ status: 200, body: { results: [{ alreadyHeld: true }] } });
    expect(new Set(claimRows().map(({ runId }) => runId))).toEqual(new Set([null]));
  });

  // Proof: with `input.runId` in place of the stamped run in the bound-claim
  // check, the second step was refused claim_limit (cap 1, current 1); with it
  // in the alreadyHeld filter, the repeat answered no claim ids; watched
  // 2026-10-27.
  it('counts a run’s second step on a held leaf as no new bound claim', async () => {
    const [leaf] = await workItems(['Leaf']);
    const [impl, review] = steps;
    capClaims(1);
    const processA = await grantFor(claireKey, 'a');
    expectApplied(
      await commands(asGrant(processA), [
        { kind: 'claimWorkItem', workItemId: leaf, steps: [impl] },
      ]),
    );
    expectApplied(
      await commands(asGrant(processA), [
        { kind: 'claimWorkItem', workItemId: leaf, steps: [review] },
      ]),
    );
    // Repeating a held step answers the claims the run holds on the leaf.
    expect(
      await commands(asGrant(processA), [
        { kind: 'claimWorkItem', workItemId: leaf, steps: [impl] },
      ]),
    ).toMatchObject({
      status: 200,
      body: {
        results: [{ alreadyHeld: true, claimIds: [expect.any(String), expect.any(String)] }],
      },
    });
    expect(
      claimRows()
        .map(({ stepId, runId }) => [stepId, runId])
        .sort(),
    ).toEqual(
      [
        [impl, 'a'],
        [review, 'a'],
      ].sort(),
    );
  });

  it('a re-fetch with the same wbs_run keeps the run', async () => {
    const [leaf] = await workItems(['Leaf']);
    expectApplied(
      await commands(asGrant(await grantFor(claireKey, 'a')), [
        { kind: 'claimWorkItem', workItemId: leaf },
      ]),
    );
    now = T + 5 * MINUTE;
    const refetched = await grantFor(claireKey, 'a');
    expect(await withGrant(refetched, 'POST', '/api/claims/renew')).toMatchObject({
      status: 200,
      body: { leaseExpiresAt: now + CLAIM_LEASE_MS },
    });
  });

  it('a forged run id is refused run_mismatch, for a claim and a release', async () => {
    const [leaf, other] = await workItems(['Leaf', 'Other']);
    const processA = await grantFor(claireKey, 'a');
    const forged = await commands(asGrant(processA), [
      { kind: 'claimWorkItem', workItemId: leaf, runId: 'b' },
    ]);
    expect(forged).toMatchObject({ status: 403, body: { error: 'run_mismatch' } });
    expect(claimRows()).toEqual([]);
    expectApplied(
      await commands(asGrant(await grantFor(claireKey, 'b')), [
        { kind: 'claimWorkItem', workItemId: other },
      ]),
    );
    const before = claimRows();
    const release = await commands(asGrant(processA), [
      { kind: 'releaseWorkItem', workItemId: other },
    ]);
    expect(release).toMatchObject({ status: 403, body: { error: 'run_mismatch' } });
    expect(claimRows()).toEqual(before);
  });

  it('a leaf held under two runs loses only the caller’s run’s claim', async () => {
    const [leaf] = await workItems(['Leaf']);
    const [impl, review] = steps;
    const processA = await grantFor(claireKey, 'a');
    expectApplied(
      await commands(asGrant(processA), [
        { kind: 'claimWorkItem', workItemId: leaf, steps: [impl] },
      ]),
    );
    expectApplied(
      await commands(asGrant(await grantFor(claireKey, 'b')), [
        { kind: 'claimWorkItem', workItemId: leaf, steps: [review] },
      ]),
    );
    expectApplied(
      await commands(asGrant(processA), [{ kind: 'releaseWorkItem', workItemId: leaf }]),
    );
    expect(claimRows().map(({ stepId, runId }) => [stepId, runId])).toEqual([[review, 'b']]);
  });

  it("a lead writes a worker's delegated claim with the worker's run, and releases it", async () => {
    const [parent] = await workItems(['Package']);
    const [first, second] = await workItems(['First', 'Second'], parent);
    const lead = await grantFor(claireKey, 'a');
    const subtree = await commands(asGrant(lead), [{ kind: 'claimWorkItem', workItemId: parent }]);
    expectApplied(subtree);
    const parentClaim = (subtree.body as { results: { claimIds: string[] }[] }).results[0]
      ?.claimIds[0];
    const delegate = (workItemId: string) => ({
      kind: 'claimWorkItem',
      workItemId,
      personId: 'claire-worker',
      runId: 'b',
      parentClaim,
    });
    expectApplied(await commands(asGrant(lead), [delegate(first), delegate(second)]));
    const delegated = claimRows().filter(({ personId }) => personId === 'claire-worker');
    expect(new Set(delegated.map(({ workItemId }) => workItemId))).toEqual(
      new Set([first, second]),
    );
    expect(new Set(delegated.map(({ runId }) => runId))).toEqual(new Set(['b']));
    // The worker releases one under its own run; the lead releases the other.
    const worker = await grantFor(workerKey, 'b');
    expectApplied(
      await commands(asGrant(worker), [{ kind: 'releaseWorkItem', workItemId: first }]),
    );
    expectApplied(
      await commands(asGrant(lead), [
        { kind: 'releaseWorkItem', workItemId: second, personId: 'claire-worker' },
      ]),
    );
    expect(claimRows().map(({ workItemId, personId }) => [workItemId, personId])).toEqual([
      [parent, 'claire'],
    ]);
  });

  it("undo stays per person: run a undoes its person's latest entry, whichever run wrote it", async () => {
    const [forA, forB] = await workItems(['For A', 'For B']);
    const processA = await grantFor(claireKey, 'a');
    expectApplied(await commands(asGrant(processA), [{ kind: 'claimWorkItem', workItemId: forA }]));
    expectApplied(
      await commands(asGrant(await grantFor(claireKey, 'b')), [
        { kind: 'claimWorkItem', workItemId: forB },
      ]),
    );
    expectApplied(await withGrant(processA, 'POST', `/api/projects/${projectId}/undo`));
    expect(claimedItems()).toEqual([forA]);
    // The human's latest entry is the later-step progress setup, which the
    // agents' claims have since changed: no agent entry is on that stack.
    expect(await h.call('dany', 'POST', `/api/projects/${projectId}/undo`)).toMatchObject({
      status: 409,
      body: { error: 'stale_undo', detail: '“For A” has changed since then.' },
    });
    expect(claimedItems()).toEqual([forA]);
  });
});

/** A mounted connected batch whose predecessor is readable but editable only by its owner. */
async function connectedBatch() {
  await h.closeComposed();
  await openMachineFixture(true);
  seedDependencyAuthority(h.databasePath());
  await h.register('owner');
  h.member('org-a', 'owner', 'member');
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Restricted predecessor' });
  expectApplied(created);
  const predecessorProjectId = (created.body as { project: { id: string } }).project.id;
  const rows = await h.call('dany', 'POST', `/api/projects/${predecessorProjectId}/commands`, {
    commands: [{ kind: 'createWorkItem', name: 'Readable predecessor' }],
  });
  expectApplied(rows);
  const predecessorWorkItemId = (rows.body as { results: { id: string }[] }).results.at(0)?.id;
  if (predecessorWorkItemId === undefined) throw new Error('predecessor row missing');
  const [successor, forA, forB, beforeOptIn] = await workItems([
    'Successor',
    'For A',
    'For B',
    'Before opt-in',
  ]);
  const processA = await grantFor(claireKey, 'a');
  for (const [grant, workItemId] of [
    [processA, forA],
    [await grantFor(claireKey, 'b'), forB],
    [await grantFor(claireKey), beforeOptIn],
  ] as const)
    expectApplied(await commands(asGrant(grant), [{ kind: 'claimWorkItem', workItemId }]));
  h.sqlite.run('UPDATE project SET owner_id=?, restricted=1 WHERE id=?', [
    h.userId('owner'),
    predecessorProjectId,
  ]);
  h.sqlite.run(
    "UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id=?",
    [h.userId('dany')],
  );
  now = T + 5 * MINUTE;
  const predecessor = {
    projectId: predecessorProjectId,
    workItemId: predecessorWorkItemId,
    scope: 'whole',
  };
  const successorEndpoint = { projectId, workItemId: successor, scope: 'whole' };
  return { processA, predecessor, successor, successorEndpoint };
}

/** Every persisted table, including claims, history and publication sequencing. */
function connectedTables() {
  return h.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({
      name,
      rows: h.sqlite
        .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    }));
}

/** Exact due-authentication bookkeeping from an immutable complete pre-request snapshot. */
function captureConnectedTouch() {
  const credentialId = claireCredentialId;
  const at = T + 5 * MINUTE;
  expect(now).toBe(at);
  const before = Object.freeze(
    connectedTables().map((table) =>
      Object.freeze({
        name: table.name,
        rows: Object.freeze([...table.rows]),
      }),
    ),
  );
  const credentials = before.filter(({ name }) => name === 'machine_credential');
  if (credentials.length !== 1) throw new Error('credential table missing or duplicated');
  const table = credentials.at(0);
  if (table === undefined) throw new Error('credential table missing');
  // Test boundary: these are our complete SQLite rows serialized by connectedTables.
  const rows = table.rows.map((row) => JSON.parse(row) as Record<string, unknown>);
  const presented = rows.filter((row) => row['id'] === credentialId);
  if (presented.length !== 1) throw new Error('issued credential missing or duplicated');
  expect(presented[0]).toMatchObject({
    id: credentialId,
    person_id: 'claire',
    organization_id: 'org-a',
    source: 'api_key',
    last_used_at: T,
    updated_at: T,
  });
  const tables = before.map((snapshot) => ({
    name: snapshot.name,
    rows:
      snapshot.name === 'machine_credential'
        ? rows
            .map((row, index) =>
              row['id'] === credentialId
                ? JSON.stringify({ ...row, last_used_at: at, updated_at: at })
                : table.rows[index],
            )
            .sort()
        : [...snapshot.rows],
  }));
  return { credentialId, at, tables };
}

/** Require the presented credential's exact touch and every other persisted value unchanged. */
function expectConnectedTouch(expected: ReturnType<typeof captureConnectedTouch>) {
  expect(
    h.sqlite
      .query<{ id: string; last_used_at: number; updated_at: number }, [string]>(
        'SELECT id, last_used_at, updated_at FROM machine_credential WHERE id=?',
      )
      .get(expected.credentialId),
  ).toEqual({
    id: expected.credentialId,
    last_used_at: expected.at,
    updated_at: expected.at,
  });
  expect(connectedTables()).toEqual(expected.tables);
}

describe('run admission through mounted connected dependency batches', () => {
  it('adds a successor-owned link and renews due A and pre-opt-in leases, leaving B unchanged', async () => {
    const { processA, predecessor, successorEndpoint } = await connectedBatch();
    const touch = captureConnectedTouch();
    const predecessorBefore = h.sqlite
      .query<Record<string, unknown> & { revision: number; updated_at: number }, [string]>(
        'SELECT * FROM work_item WHERE id=?',
      )
      .get(predecessor.workItemId);
    if (predecessorBefore === null) throw new Error('fixture predecessor missing');
    expect(predecessorBefore).toMatchObject({ revision: 0, updated_at: T });
    expect(now).toBe(T + 5 * MINUTE);
    // The link bumps both incident rows; the predecessor's authored fields stay exact.
    const expectedPredecessor = {
      ...predecessorBefore,
      revision: predecessorBefore.revision + 1,
      updated_at: now,
    };
    const sent = [...pushes];
    expect(
      await withGrant(processA, 'POST', `/api/projects/${predecessor.projectId}/commands`, {
        commands: [
          { kind: 'patchWorkItem', workItemId: predecessor.workItemId, patch: { name: 'Denied' } },
        ],
      }),
    ).toMatchObject({ status: 403, body: { error: 'forbidden' } });
    expectConnectedTouch(touch);
    expect(pushes).toEqual(sent);
    expectApplied(
      await commands(asGrant(processA), [
        {
          kind: 'addTypedDependency',
          predecessor,
          successor: successorEndpoint,
          type: 'FS',
        },
      ]),
    );
    expect(h.sqlite.query('SELECT id FROM external_dependency').all()).toHaveLength(1);
    expect(
      h.sqlite.query('SELECT * FROM work_item WHERE id=?').get(predecessor.workItemId),
    ).toEqual(expectedPredecessor);
    expect(claimRows()).toHaveLength(6);
    expect(
      new Set(claimRows().map(({ runId, leaseExpiresAt }) => [runId, leaseExpiresAt].join(':'))),
    ).toEqual(
      new Set([
        `a:${String(now + CLAIM_LEASE_MS)}`,
        `:${String(now + CLAIM_LEASE_MS)}`,
        `b:${String(T + CLAIM_LEASE_MS)}`,
      ]),
    );
    expect(pushes.length).toBeGreaterThan(sent.length);
  });

  for (const fault of ['absent-project', 'foreign-row'] as const)
    it(`conceals ${fault} after an earlier mutation and rolls back leases and publications`, async () => {
      const { processA, predecessor, successor, successorEndpoint } = await connectedBatch();
      const touch = captureConnectedTouch();
      const sent = [...pushes];
      const concealed =
        fault === 'absent-project'
          ? { ...predecessor, projectId: 'absent-project' }
          : { ...predecessor, workItemId: successor };
      expect(
        await commands(asGrant(processA), [
          { kind: 'patchWorkItem', workItemId: successor, patch: { name: 'Must roll back' } },
          {
            kind: 'addTypedDependency',
            predecessor: concealed,
            successor: successorEndpoint,
            type: 'FS',
          },
        ]),
      ).toEqual({ status: 404, body: { error: 'not_found', at: 1, kind: 'addTypedDependency' } });
      expectConnectedTouch(touch);
      expect(pushes).toEqual(sent);
    });
});
