import type { CredentialAuthentication } from '@wbs/contracts';
import { openConnection } from '@wbs/store-sqlite/db';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { OrganizationLimitsRepository } from '@wbs/store-sqlite/organization-limits';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { generateKeyPair, SignJWT } from 'jose';

import { DELEGATION_TOKEN_TYPE } from '../runtime/delegation';
import {
  addAgentPerson,
  grantCredential,
  issueApiKey,
} from '../testing/machine-credential-fixture';
import { OrganizationHarness } from '../testing/organization-harness';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from '../testing/organization-limits-fixture';

const PATH = '/api/organization/limits';

let h: OrganizationHarness;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;

beforeEach(async () => {
  keys = await generateKeyPair('RS256');
  h = OrganizationHarness.open({ delegationKey: keys.publicKey });
  for (const username of ['sue', 'adam', 'mia', 'vic', 'bob']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'sue', 'super_admin');
  h.member('org-a', 'adam', 'admin');
  h.member('org-a', 'mia', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'bob', 'admin');
  for (const username of ['sue', 'adam', 'mia', 'vic']) h.bind(username, 'org-a');
  h.bind('bob', 'org-b');
});

afterEach(() => {
  h.close();
});

function run(sql: string, params: (string | number | null)[] = []): void {
  h.sqlite.run(sql, params);
}

function project(organizationId: string, id: string): void {
  run('INSERT INTO project (id, name, owner_id, created_at) VALUES (?, ?, ?, 1)', [
    id,
    id,
    h.userId('sue'),
  ]);
  run('INSERT INTO project_organization (resource_id, organization_id) VALUES (?, ?)', [
    id,
    organizationId,
  ]);
}

function personIn(organizationId: string, id: string, kind: 'person' | 'agent'): void {
  run('INSERT INTO person (id, name, kind) VALUES (?, ?, ?)', [id, id, kind]);
  run('INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)', [
    id,
    organizationId,
    id,
  ]);
}

let claims = 0;
/** A leaf of `steps` steps in `projectId`, every step claimed by `personId` under `runId`. */
function claimedLeaf(
  projectId: string,
  id: string,
  personId: string,
  runId: string | null,
  steps = 1,
): void {
  run('INSERT INTO work_item (id, project_id, name, position, revision) VALUES (?, ?, ?, 1, 0)', [
    id,
    projectId,
    id,
  ]);
  for (let n = 1; n <= steps; n++) {
    const stepId = `${id}-s${String(n)}`;
    run('INSERT INTO step (id, project_id, name) VALUES (?, ?, ?)', [stepId, projectId, stepId]);
    claims += 1;
    run('INSERT INTO claim (id, work_item_id, step_id, person_id, run_id) VALUES (?, ?, ?, ?, ?)', [
      `c${String(claims)}`,
      id,
      stepId,
      personId,
      runId,
    ]);
  }
}

function resourceIn(organizationId: string, id: string, name: string, unitLabel: string): void {
  run("INSERT INTO resource (id, name, kind, unit_label) VALUES (?, ?, 'divisible', ?)", [
    id,
    id,
    unitLabel,
  ]);
  run('INSERT INTO resource_organization (resource_id, organization_id, name) VALUES (?, ?, ?)', [
    id,
    organizationId,
    name,
  ]);
}

function state(projectId: string, resourceId: string, units: number): void {
  run('INSERT INTO project_resource_capacity (project_id, resource_id, units) VALUES (?, ?, ?)', [
    projectId,
    resourceId,
    units,
  ]);
}

/** A holds 7 agents, 12 bound claims over two projects and 48 GB stated; B holds more of each. */
function seedSevenOfEight(): void {
  project('org-a', 'pa1');
  project('org-a', 'pa2');
  project('org-b', 'pb');
  for (let n = 1; n <= 7; n++) personIn('org-a', `agent-${String(n)}`, 'agent');
  personIn('org-a', 'kat', 'person');
  for (let n = 1; n <= 30; n++) personIn('org-b', `b-agent-${String(n)}`, 'agent');
  // One four-step leaf under one run is one bound claim; eleven more leaves
  // across both projects make twelve.
  claimedLeaf('pa1', 'w0', 'agent-1', 'r1', 4);
  for (let n = 1; n <= 11; n++)
    claimedLeaf(
      n % 2 === 0 ? 'pa1' : 'pa2',
      `w${String(n)}`,
      `agent-${String((n % 7) + 1)}`,
      `r${String(n)}`,
    );
  for (let n = 1; n <= 5; n++) claimedLeaf('pb', `wb${String(n)}`, 'b-agent-1', null);
  resourceIn('org-a', 'ram', 'h2puni ram', 'GB');
  resourceIn('org-b', 'b-ram', 'b ram', 'GB');
  state('pa1', 'ram', 32);
  state('pa2', 'ram', 16);
  state('pb', 'b-ram', 64);
}

const SEVEN_OF_EIGHT = {
  agentPersons: 7,
  concurrentClaims: 12,
  capacityUnits: [{ resourceId: 'ram', name: 'h2puni ram', unitLabel: 'GB', units: 48 }],
};

/** `organization-limits` "An admin reads caps with usage beside each", over real SQLite. */
describe(PATH, () => {
  it('answers an admin and a super-admin the default caps with A’s usage only', async () => {
    h.activate();
    seedSevenOfEight();
    for (const username of ['sue', 'adam'])
      h.grantPermissions('org-a', username, ['organization.read']);
    h.grantPermissions('org-b', 'bob', ['organization.read']);
    for (const username of ['sue', 'adam'])
      expect(await h.call(username, 'GET', PATH)).toEqual({
        status: 200,
        body: {
          source: 'default',
          limits: TEST_ORGANIZATION_DEFAULT_LIMITS,
          usage: SEVEN_OF_EIGHT,
        },
      });
    expect(await h.call('bob', 'GET', PATH)).toEqual({
      status: 200,
      body: {
        source: 'default',
        limits: TEST_ORGANIZATION_DEFAULT_LIMITS,
        usage: {
          agentPersons: 30,
          concurrentClaims: 5,
          capacityUnits: [{ resourceId: 'b-ram', name: 'b ram', unitLabel: 'GB', units: 64 }],
        },
      },
    });
  });

  it('answers the organization’s own row whatever the defaults are', async () => {
    h.activate();
    h.grantPermissions('org-a', 'adam', ['organization.read']);
    h.grantPermissions('org-b', 'bob', ['organization.read']);
    seedSevenOfEight();
    run(
      "INSERT INTO organization_limits (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at) VALUES ('org-a', 8, 40, 64, 1)",
    );
    expect(await h.call('adam', 'GET', PATH)).toEqual({
      status: 200,
      body: {
        source: 'organization',
        limits: { maxAgentPersons: 8, maxConcurrentClaims: 40, maxCapacityUnitsPerResource: 64 },
        usage: SEVEN_OF_EIGHT,
      },
    });
    expect((await h.call('bob', 'GET', PATH)).body).toMatchObject({ source: 'default' });
  });

  // Proof: with the store's role test answering null, this answered 200 with
  // A's usage to the member (4 pass, 1 fail); watched 2026-10-22.
  it('answers a member and a viewer 403 forbidden with no usage in the body', async () => {
    h.activate();
    seedSevenOfEight();
    for (const username of ['mia', 'vic'])
      expect(await h.call(username, 'GET', PATH)).toEqual({
        status: 403,
        body: { error: 'forbidden', permission: 'organization.read' },
      });
  });

  // Proof: with the route's legacy refusal removed, this answered 500 instead
  // of 403 (4 pass, 1 fail); watched 2026-10-22.
  it('refuses before activation', async () => {
    seedSevenOfEight();
    expect(await h.call('sue', 'GET', PATH)).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
  });

  // Proof: with the route's delegation guard removed, this answered 200 with
  // A's usage (4 pass, 1 fail); watched 2026-10-22.
  it('refuses a delegation even of a super-admin', async () => {
    run(
      'INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES (?, ?, ?, ?, 1)',
      ['sue-map', h.userId('sue'), 'https://idp.test', 'sue-sub'],
    );
    h.activate();
    seedSevenOfEight();
    h.grantPermissions('org-a', 'sue', ['organization.read']);
    expect((await h.call('sue', 'GET', PATH)).status).toBe(200);
    const token = await new SignJWT({
      username: 'sue',
      org: 'org-a',
      client: 'client-1',
      grant: 'family-1',
      scope: 'read write',
      upstream_iss: 'https://idp.test',
      upstream_sub: 'sue-sub',
    })
      .setProtectedHeader({ alg: 'RS256', typ: DELEGATION_TOKEN_TYPE })
      .setIssuer('wbs')
      .setSubject(h.userId('sue'))
      .setAudience('wbs-be-01/via-mcp-01')
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(keys.privateKey);
    expect(await h.callWith(token, 'GET', PATH)).toEqual({
      status: 403,
      body: { error: 'insufficient_scope' },
    });
  });
});

it('uses a minimal organization.read grant for limits despite a viewer membership label', async () => {
  h.activate();
  h.grantPermissions('org-a', 'vic', ['organization.read']);
  const answer = await h.call('vic', 'GET', PATH);
  expect(answer.status).toBe(200);
  expect(answer.body).toMatchObject({
    source: 'default',
    limits: TEST_ORGANIZATION_DEFAULT_LIMITS,
    usage: { agentPersons: 0, concurrentClaims: 0, capacityUnits: [] },
  });
});
it('names organization.read when a role-only super-admin requests limits', async () => {
  h.activate();
  expect(await h.call('sue', 'GET', PATH)).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.read' },
  });
});

for (const changed of ['id', 'authentication', 'delegation'] as const) {
  it('retains the limits route principal before organization resolution: ' + changed, async () => {
    h.activate();
    h.grantPermissions('org-a', 'vic', ['organization.read']);
    const observer = spyOn(SqliteOrganizationAccess.prototype, 'resolve');
    const resolve = observer.getMockImplementation();
    if (resolve === undefined) throw new Error('resolver implementation absent');
    let substitutions = 0;
    observer.mockImplementation(async function (this: SqliteOrganizationAccess, principal) {
      const resolved = await resolve.call(this, principal);
      if (changed === 'id') Object.assign(principal, { id: h.userId('sue') });
      if (changed === 'authentication')
        Object.assign(principal, {
          authentication: { kind: 'machine', credentialId: 'replacement', personId: 'agent' },
        });
      if (changed === 'delegation')
        Object.assign(principal, { delegation: { organizationId: 'org-a' } });
      substitutions += 1;
      return resolved;
    });
    try {
      expect((await h.call('vic', 'GET', PATH)).status).toBe(200);
      expect(substitutions).toBe(1);
    } finally {
      observer.mockRestore();
    }
  });
}

it('retains queued limits machine authentication and its contributor cap despite account read authority', async () => {
  h.activate();
  h.grantPermissions('org-a', 'vic', ['organization.read']);
  const accountId = h.userId('vic');
  addAgentPerson(h.sqlite, 'limits-agent', 'org-a', accountId);
  const credential = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'limits-agent',
    issuedBy: accountId,
  });
  grantCredential(h.sqlite, 'org-a', credential.id, 'org-admin', 'organization', 'org-a');
  const connection = openConnection(h.sqlite.filename);
  const gate = new WriteCoordinator();
  const limits = new OrganizationLimitsRepository(
    connection.db,
    TEST_ORGANIZATION_DEFAULT_LIMITS,
    gate,
  );
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const blocker = gate.enter(async () => {
    entered.resolve(undefined);
    await held.promise;
  });
  await entered.promise;
  const authentication: CredentialAuthentication = {
    kind: 'machine',
    credentialId: credential.id,
    personId: 'limits-agent',
  };
  const principal: { id: string; authentication?: CredentialAuthentication } = {
    id: accountId,
    authentication,
  };
  const pending = limits.read('org-a', principal);
  delete principal.authentication;
  held.resolve(undefined);
  await blocker;
  try {
    expect(await pending).toEqual({ kind: 'forbidden', permission: 'organization.read' });
  } finally {
    connection.close();
  }
});

it('uses the composed limits gate before admitting a current organization read', async () => {
  h.close();
  h = OrganizationHarness.openComposed();
  await h.register('reader');
  h.organization('org-a');
  h.member('org-a', 'reader', 'viewer');
  h.bind('reader', 'org-a');
  h.grantPermissions('org-a', 'reader', ['organization.read']);
  h.activate();
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const blocker = h.holdWriteTurn(held.promise, () => {
    entered.resolve(undefined);
  });
  await entered.promise;
  let settled = false;
  const pending = h.call('reader', 'GET', PATH).finally(() => {
    settled = true;
  });
  try {
    await Bun.sleep(20);
    expect(settled).toBe(false);
    h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [h.userId('reader')]);
  } finally {
    held.resolve(undefined);
    await blocker;
  }
  expect(await pending).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.read' },
  });
});
