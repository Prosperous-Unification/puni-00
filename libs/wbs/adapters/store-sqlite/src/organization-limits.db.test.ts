import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { OrganizationLimitsReading } from '@wbs/domain';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { AccessDecisionRepository } from './access-decisions';
import { openDatabase, openDrizzle } from './db';
import { WriteCoordinator } from './gate';
import { runMigrations } from './migrate';
import {
  countAgentPersons,
  countBoundClaims,
  OrganizationLimitsRepository,
  readCapacityUsage,
  readEffectiveLimits,
  sumStatedCapacity,
} from './organization-limits';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const DEFAULTS = {
  maxAgentPersons: 50,
  maxConcurrentClaims: 200,
  maxCapacityUnitsPerResource: 10_000,
};

let dir: string;
let path: string;
let sqlite: Database;
let db: ReturnType<typeof openDrizzle>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-organization-limits-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  sqlite = openDatabase(path);
  for (const statement of [
    "INSERT INTO users (id, username, created_at) VALUES ('dany', 'dany', 1), ('bea', 'bea', 1), ('mo', 'mo', 1), ('vi', 'vi', 1)",
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
    "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'dany', 'super_admin', 1), ('org-a', 'bea', 'admin', 1), ('org-a', 'mo', 'member', 1), ('org-a', 'vi', 'viewer', 1), ('org-b', 'dany', 'member', 1)",
    "INSERT INTO project (id, name, owner_id, created_at) VALUES ('pa1', 'A one', 'dany', 1), ('pa2', 'A two', 'dany', 1), ('pb', 'B one', 'dany', 1)",
    "INSERT INTO project_organization (resource_id, organization_id) VALUES ('pa1', 'org-a'), ('pa2', 'org-a'), ('pb', 'org-b')",
  ])
    sqlite.run(statement);
});

afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

function open(): ReturnType<typeof openDrizzle> {
  db = openDrizzle(path);
  return db;
}

function activate(): void {
  sqlite.run(
    "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
  );
}

function personIn(organizationId: string, id: string, kind: 'person' | 'agent'): void {
  sqlite.run('INSERT INTO person (id, name, kind) VALUES (?, ?, ?)', [id, id, kind]);
  sqlite.run(
    'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
    [id, organizationId, id],
  );
}

/** A leaf of `steps` steps in `projectId`, its steps named `<id>-s<n>`. */
function leaf(projectId: string, id: string, steps = 1): string[] {
  sqlite.run(
    'INSERT INTO work_item (id, project_id, name, position, revision) VALUES (?, ?, ?, 1, 0)',
    [id, projectId, id],
  );
  const stepIds: string[] = [];
  for (let n = 1; n <= steps; n++) {
    const stepId = `${id}-s${String(n)}`;
    sqlite.run('INSERT INTO step (id, project_id, name) VALUES (?, ?, ?)', [
      stepId,
      projectId,
      stepId,
    ]);
    stepIds.push(stepId);
  }
  return stepIds;
}

let claims = 0;
function claimStep(
  workItemId: string,
  stepId: string | null,
  personId: string,
  runId: string | null,
): void {
  claims += 1;
  sqlite.run(
    "INSERT INTO claim (id, work_item_id, step_id, person_id, run_id, created_by) VALUES (?, ?, ?, ?, ?, 'dany')",
    [`c${String(claims)}`, workItemId, stepId, personId, runId],
  );
}

function resourceIn(organizationId: string, id: string, unitLabel: string): void {
  sqlite.run("INSERT INTO resource (id, name, kind, unit_label) VALUES (?, ?, 'divisible', ?)", [
    id,
    id,
    unitLabel,
  ]);
  sqlite.run(
    'INSERT INTO resource_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
    [id, organizationId, `${id} local`],
  );
}

function state(projectId: string, resourceId: string, units: number): void {
  sqlite.run(
    'INSERT INTO project_resource_capacity (project_id, resource_id, units) VALUES (?, ?, ?)',
    [projectId, resourceId, units],
  );
}

describe('effective limits', () => {
  it('are the deployment defaults while the organization holds no row', () => {
    expect(readEffectiveLimits(open(), 'org-a', DEFAULTS)).toEqual({
      source: 'default',
      limits: DEFAULTS,
    });
  });

  it('are the row whatever the defaults are', () => {
    sqlite.run(
      "INSERT INTO organization_limits (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at) VALUES ('org-a', 8, 40, 64, 1)",
    );
    expect(readEffectiveLimits(open(), 'org-a', DEFAULTS)).toEqual({
      source: 'organization',
      limits: { maxAgentPersons: 8, maxConcurrentClaims: 40, maxCapacityUnitsPerResource: 64 },
    });
    expect(readEffectiveLimits(open(), 'org-b', DEFAULTS).source).toBe('default');
  });

  it('refuses absent deployment defaults, naming them', () => {
    // An untyped caller is the only way to reach this; the cast is that caller.
    const absent = undefined as unknown as typeof DEFAULTS;
    expect(() => new OrganizationLimitsRepository(open(), absent, new WriteCoordinator())).toThrow(
      'organization limits of the deployment default are missing',
    );
  });

  it('refuses deployment defaults outside the bounds', () => {
    expect(
      () =>
        new OrganizationLimitsRepository(
          open(),
          { ...DEFAULTS, maxConcurrentClaims: -1 },
          new WriteCoordinator(),
        ),
    ).toThrow('organization limits of the deployment default are malformed');
  });
});

describe('usage', () => {
  it('counts only A’s agents, never its humans or B’s agents', () => {
    for (const id of ['claire', 'codex']) personIn('org-a', id, 'agent');
    personIn('org-a', 'kat', 'person');
    for (const id of ['b1', 'b2', 'b3']) personIn('org-b', id, 'agent');
    expect(countAgentPersons(open(), 'org-a')).toBe(2);
    expect(countAgentPersons(open(), 'org-b')).toBe(3);
  });

  it('counts a four-step leaf under one run once, and a second person on another leaf as one more', () => {
    personIn('org-a', 'claire', 'agent');
    personIn('org-a', 'codex', 'agent');
    const steps = leaf('pa1', 'w1', 4);
    for (const stepId of steps) claimStep('w1', stepId, 'claire', 'r1');
    expect(countBoundClaims(open(), 'org-a')).toBe(1);
    const [other = ''] = leaf('pa2', 'w2', 2);
    claimStep('w2', other, 'codex', null);
    expect(countBoundClaims(open(), 'org-a')).toBe(2);
  });

  it('counts two persons on one leaf as two, and one person under two runs as two', () => {
    personIn('org-a', 'claire', 'agent');
    personIn('org-a', 'codex', 'agent');
    const [impl = '', review = '', test = ''] = leaf('pa1', 'w1', 3);
    claimStep('w1', impl, 'claire', 'r1');
    claimStep('w1', review, 'codex', 'r2');
    claimStep('w1', test, 'claire', 'r3');
    expect(countBoundClaims(open(), 'org-a')).toBe(3);
  });

  it('counts two run-less claims of one person on one leaf as one', () => {
    personIn('org-a', 'kat', 'person');
    const [impl = '', review = ''] = leaf('pa1', 'w1', 2);
    claimStep('w1', impl, 'kat', null);
    claimStep('w1', review, 'kat', null);
    expect(countBoundClaims(open(), 'org-a')).toBe(1);
  });

  it('counts only A’s bound claims', () => {
    personIn('org-a', 'claire', 'agent');
    personIn('org-b', 'bert', 'agent');
    const [mine = ''] = leaf('pa1', 'w1');
    claimStep('w1', mine, 'claire', 'r1');
    for (const id of ['wb1', 'wb2']) {
      const [theirs = ''] = leaf('pb', id);
      claimStep(id, theirs, 'bert', 'r1');
    }
    expect(countBoundClaims(open(), 'org-a')).toBe(1);
    expect(countBoundClaims(open(), 'org-b')).toBe(2);
  });

  it('sums stated capacity per resource over A’s projects only, in resource-id order', () => {
    resourceIn('org-a', 'ram', 'GB');
    resourceIn('org-a', 'disk', 'GB');
    resourceIn('org-a', 'unstated', 'slots');
    resourceIn('org-b', 'b-ram', 'GB');
    state('pa1', 'ram', 32);
    state('pa2', 'ram', 16);
    state('pa1', 'disk', 0);
    state('pb', 'b-ram', 64);
    // A foreign project stating A's resource is not A's statement (L16).
    state('pb', 'ram', 100);
    expect(readCapacityUsage(open(), 'org-a')).toEqual([
      { resourceId: 'disk', name: 'disk local', unitLabel: 'GB', units: 0 },
      { resourceId: 'ram', name: 'ram local', unitLabel: 'GB', units: 48 },
    ]);
    expect(readCapacityUsage(open(), 'org-b')).toEqual([
      { resourceId: 'b-ram', name: 'b-ram local', unitLabel: 'GB', units: 64 },
    ]);
  });

  it('sums another project’s units, never the one being written', () => {
    resourceIn('org-a', 'ram', 'GB');
    resourceIn('org-a', 'worktrees', 'worktrees');
    state('pa1', 'ram', 48);
    state('pa2', 'ram', 32);
    state('pa2', 'worktrees', 10);
    state('pb', 'ram', 7);
    expect(sumStatedCapacity(open(), 'org-a', 'ram', 'pa1')).toBe(32);
    expect(sumStatedCapacity(open(), 'org-a', 'ram', 'pa2')).toBe(48);
    expect(sumStatedCapacity(open(), 'org-a', 'worktrees', 'pa2')).toBe(0);
  });
});

describe('sumStatedCapacity and readCapacityUsage', () => {
  it('never sums a resource the organization does not own', () => {
    resourceIn('org-b', 'b-ram', 'GB');
    // A's projects stating B's resource: not A's statement, by either reader.
    state('pa1', 'b-ram', 40);
    state('pa2', 'b-ram', 8);
    expect(sumStatedCapacity(open(), 'org-a', 'b-ram', 'pa1')).toBe(0);
    expect(readCapacityUsage(open(), 'org-a')).toEqual([]);
  });
});

describe('OrganizationLimitsRepository.read', () => {
  it('answers inactive before activation', async () => {
    expect(
      await new OrganizationLimitsRepository(open(), DEFAULTS, new WriteCoordinator()).read(
        'org-a',
        { id: 'dany' },
      ),
    ).toBe('inactive');
  });

  it('answers caps and usage to explicit read grants and names missing read permission', async () => {
    activate();
    for (const userId of ['dany', 'bea'])
      sqlite.run(
        "INSERT INTO access_grant (id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES (?,'org-a','organization','org-a','user',?,'org-viewer','route',1)",
        ['read-' + userId, userId],
      );
    personIn('org-a', 'claire', 'agent');
    const limits = new OrganizationLimitsRepository(open(), DEFAULTS, new WriteCoordinator());
    const reading: OrganizationLimitsReading = {
      source: 'default',
      limits: DEFAULTS,
      usage: { agentPersons: 1, concurrentClaims: 0, capacityUnits: [] },
    };
    expect(await limits.read('org-a', { id: 'dany' })).toEqual(reading);
    expect(await limits.read('org-a', { id: 'bea' })).toEqual(reading);
    for (const actor of ['mo', 'vi'])
      expect(await limits.read('org-a', { id: actor })).toEqual({
        kind: 'forbidden',
        permission: 'organization.read',
      });
    // dany is only a member of B.
    expect(await limits.read('org-b', { id: 'dany' })).toEqual({
      kind: 'forbidden',
      permission: 'organization.read',
    });
  });
});

for (const operation of ['inspect', 'set', 'reset'] as const) {
  it('serializes limits ' + operation + ' behind an awaited personal grant decision', async () => {
    activate();
    sqlite.run(
      "INSERT INTO access_grant (id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES ('read-grant','org-a','organization','org-a','user','dany','org-admin','route',1)",
    );
    const gate = new WriteCoordinator();
    const limits = new OrganizationLimitsRepository(open(), DEFAULTS, gate);
    await limits.set(
      'org-a',
      { maxAgentPersons: 8 },
      { actor: 'operator:original', at: 30, auditId: 'original' },
      'apply',
    );
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const observer = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
    const original = observer.getMockImplementation();
    if (original === undefined) throw new Error('limits decision spy lost the real implementation');
    observer.mockImplementation(async function (this: AccessDecisionRepository, principal, target) {
      entered.resolve(undefined);
      await held.promise;
      return original.call(this, principal, target);
    });
    const read = limits.read('org-a', { id: 'dany' });
    let operationSettled = false;
    let pending: Promise<unknown> | undefined;
    try {
      await Promise.race([
        entered.promise,
        Bun.sleep(100).then(() => {
          throw new Error('personal grant decision never entered');
        }),
      ]);
      pending = (
        operation === 'inspect'
          ? limits.inspect('org-a')
          : operation === 'set'
            ? limits.set(
                'org-a',
                { maxAgentPersons: 9 },
                { actor: 'operator:later', at: 40, auditId: 'later' },
                'apply',
              )
            : limits.reset('org-a', { actor: 'operator:later', at: 40, auditId: 'later' }, 'apply')
      ).finally(() => {
        operationSettled = true;
      });
      await Bun.sleep(10);
      expect(operationSettled).toBe(false);
    } finally {
      held.resolve(undefined);
      observer.mockRestore();
    }
    expect(await read).toMatchObject({ source: 'organization', limits: { maxAgentPersons: 8 } });
    expect(await pending).toMatchObject(
      operation === 'inspect'
        ? { source: 'organization', limits: { maxAgentPersons: 8 } }
        : { change: operation },
    );
    expect(await limits.inspect('org-a')).toMatchObject({
      limits: { maxAgentPersons: operation === 'reset' ? 50 : operation === 'set' ? 9 : 8 },
    });
  });
}

it('releases a failed limits read before the queued operator commit', async () => {
  activate();
  const limits = new OrganizationLimitsRepository(open(), DEFAULTS, new WriteCoordinator());
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const observer = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt').mockImplementation(
    async () => {
      entered.resolve(undefined);
      await held.promise;
      throw new Error('injected limits grant failure');
    },
  );
  const read = limits.read('org-a', { id: 'dany' }).then(
    () => {
      throw new Error('failed grant read resolved');
    },
    (failure: unknown) => failure,
  );
  await entered.promise;
  const written = limits.set(
    'org-a',
    { maxAgentPersons: 7 },
    { actor: 'operator:repair', at: 50, auditId: 'repair' },
    'apply',
  );
  held.resolve(undefined);
  try {
    expect(await read).toMatchObject({ message: 'injected limits grant failure' });
    expect(await written).toMatchObject({
      change: 'set',
      after: { limits: { maxAgentPersons: 7 } },
    });
    expect(sqlite.query('SELECT id,actor_id,created_at FROM organization_audit').all()).toEqual([
      { id: 'repair', actor_id: 'operator:repair', created_at: 50 },
    ]);
  } finally {
    observer.mockRestore();
  }
});

for (const operation of ['set', 'reset'] as const) {
  it('retains queued limits ' + operation + ' operator provenance and requested caps', async () => {
    activate();
    const gate = new WriteCoordinator();
    const limits = new OrganizationLimitsRepository(open(), DEFAULTS, gate);
    if (operation === 'reset')
      await limits.set(
        'org-a',
        { maxAgentPersons: 9 },
        { actor: 'operator:setup', at: 1, auditId: 'setup' },
        'apply',
      );
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const change = { maxAgentPersons: 7 };
    const act = { actor: 'operator:original', at: 60, auditId: 'original' };
    const pending =
      operation === 'set'
        ? limits.set('org-a', change, act, 'apply')
        : limits.reset('org-a', act, 'apply');
    change.maxAgentPersons = 21;
    act.actor = 'operator:substitute';
    act.at = 99;
    act.auditId = 'substitute';
    held.resolve(undefined);
    await blocker;
    expect(await pending).toMatchObject({
      change: operation,
      after: { limits: { maxAgentPersons: operation === 'set' ? 7 : 50 } },
    });
    expect(
      sqlite
        .query("SELECT id,actor_id,created_at FROM organization_audit WHERE id <> 'setup'")
        .all(),
    ).toEqual([{ id: 'original', actor_id: 'operator:original', created_at: 60 }]);
  });
}

it('rechecks the retained queued limits principal after its read grant is revoked', async () => {
  activate();
  sqlite.run(
    "INSERT INTO access_grant (id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES ('grant-a','org-a','organization','org-a','user','dany','org-admin','route',1),('grant-b','org-a','organization','org-a','user','bea','org-admin','route',1)",
  );
  const gate = new WriteCoordinator();
  const limits = new OrganizationLimitsRepository(open(), DEFAULTS, gate);
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const blocker = gate.enter(async () => {
    entered.resolve(undefined);
    await held.promise;
  });
  await entered.promise;
  const principal = { id: 'dany' };
  const pending = limits.read('org-a', principal);
  principal.id = 'bea';
  sqlite.run("DELETE FROM access_grant WHERE id='grant-a'");
  held.resolve(undefined);
  await blocker;
  expect(await pending).toEqual({ kind: 'forbidden', permission: 'organization.read' });
  expect(sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
});

for (const failure of ['missing-grants', 'corrupt-permission'] as const) {
  it('throws before limits usage on ' + failure + ' trusted authority', async () => {
    activate();
    sqlite.run(
      "INSERT INTO access_grant (id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES ('grant-a','org-a','organization','org-a','user','dany','org-admin','route',1)",
    );
    if (failure === 'missing-grants')
      sqlite.run('ALTER TABLE access_grant RENAME TO unreadable_access_grant');
    else {
      sqlite.run('PRAGMA ignore_check_constraints=ON');
      try {
        sqlite.run(
          "UPDATE access_role_permission SET permission='unknown.permission' WHERE role_id='org-admin' AND permission='organization.read'",
        );
      } finally {
        sqlite.run('PRAGMA ignore_check_constraints=OFF');
      }
    }
    const limits = new OrganizationLimitsRepository(open(), DEFAULTS, new WriteCoordinator());
    const before = sqlite.query('SELECT * FROM organization_audit').all();
    const rejected = await limits.read('org-a', { id: 'dany' }).then(
      () => null,
      (failure: unknown) => failure,
    );
    expect(rejected).toBeInstanceOf(Error);
    if (!(rejected instanceof Error)) throw new Error('trusted grant failure did not throw');
    expect(rejected.message).toMatch(
      failure === 'missing-grants' ? /access_grant/ : /unknown.permission|permission/,
    );
    expect(sqlite.query('SELECT * FROM organization_audit').all()).toEqual(before);
  });
}

it('keeps the limits grant decision inside its immediate transaction', async () => {
  activate();
  const limits = new OrganizationLimitsRepository(open(), DEFAULTS, new WriteCoordinator());
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const observer = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
  const original = observer.getMockImplementation();
  if (original === undefined) throw new Error('limits decision spy lost the real implementation');
  observer.mockImplementation(async function (this: AccessDecisionRepository, principal, target) {
    entered.resolve(undefined);
    await held.promise;
    return original.call(this, principal, target);
  });
  const pending = limits.read('org-a', { id: 'dany' });
  await entered.promise;
  sqlite.run('PRAGMA busy_timeout=0');
  try {
    expect(() => sqlite.run("UPDATE organization SET name='concurrent' WHERE id='org-a'")).toThrow(
      /locked|busy/,
    );
  } finally {
    held.resolve(undefined);
    observer.mockRestore();
  }
  expect(await pending).toEqual({ kind: 'forbidden', permission: 'organization.read' });
  expect(sqlite.query("SELECT name FROM organization WHERE id='org-a'").get()).toEqual({
    name: 'A',
  });
});

it('refuses a delegated personal read grant at the direct limits owner', async () => {
  activate();
  sqlite.run(
    "INSERT INTO access_grant (id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES ('read-grant','org-a','organization','org-a','user','dany','org-viewer','route',1)",
  );
  const limits = new OrganizationLimitsRepository(open(), DEFAULTS, new WriteCoordinator());
  expect(await limits.read('org-a', { id: 'dany' })).toMatchObject({ source: 'default' });
  expect(
    await limits.read('org-a', {
      id: 'dany',
      delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
    }),
  ).toEqual({ kind: 'forbidden', permission: 'organization.read' });
});
