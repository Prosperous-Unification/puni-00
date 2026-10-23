import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { OrganizationLimitsReading } from '@wbs/domain';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
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
    expect(() => new OrganizationLimitsRepository(open(), absent)).toThrow(
      'organization limits of the deployment default are missing',
    );
  });

  it('refuses deployment defaults outside the bounds', () => {
    expect(
      () => new OrganizationLimitsRepository(open(), { ...DEFAULTS, maxConcurrentClaims: -1 }),
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
    expect(await new OrganizationLimitsRepository(open(), DEFAULTS).read('org-a', 'dany')).toBe(
      'inactive',
    );
  });

  it('answers caps and usage to an admin and a super-admin, and forbidden to everyone else', async () => {
    activate();
    personIn('org-a', 'claire', 'agent');
    const limits = new OrganizationLimitsRepository(open(), DEFAULTS);
    const reading: OrganizationLimitsReading = {
      source: 'default',
      limits: DEFAULTS,
      usage: { agentPersons: 1, concurrentClaims: 0, capacityUnits: [] },
    };
    expect(await limits.read('org-a', 'dany')).toEqual(reading);
    expect(await limits.read('org-a', 'bea')).toEqual(reading);
    for (const actor of ['mo', 'vi']) expect(await limits.read('org-a', actor)).toBe('forbidden');
    // dany is only a member of B.
    expect(await limits.read('org-b', 'dany')).toBe('forbidden');
  });
});
