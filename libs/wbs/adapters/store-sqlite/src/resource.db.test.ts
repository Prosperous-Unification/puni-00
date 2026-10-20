import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Connection, openConnection } from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { DemandRepository, ResourceCapacityRepository } from './resource';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const stamp = { at: 5, by: 'u' };
let directory: string;
let connection: Connection;
let demands: DemandRepository;
let capacities: ResourceCapacityRepository;
let resources: DirectoryRepository;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'resource-db-'));
  const path = join(directory, 'plan.db');
  runMigrations(path, folder);
  connection = openConnection(path);
  for (const statement of [
    "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','u','x',1)",
    "INSERT INTO project (id,name,owner_id,revision,created_at) VALUES ('p','Plan','u',0,1),('q','Other','u',0,1)",
    "INSERT INTO work_item (id,project_id,name,position,revision) VALUES ('w','p','Build',1,0),('v','q','Ship',1,0)",
    "INSERT INTO resource (id,name,kind,unit_label) VALUES ('ram','h2puni ram','divisible','GB'),('stage','staging','exclusive','env')",
  ])
    connection.db.run(statement);
  demands = new DemandRepository(connection.db, OPEN);
  capacities = new ResourceCapacityRepository(connection.db, OPEN);
  resources = new DirectoryRepository(connection.db, OPEN);
});

afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

const revisionOf = (id: string): number | undefined =>
  connection.db.all<{ revision: number }>(`SELECT revision FROM work_item WHERE id = '${id}'`).at(0)
    ?.revision;

describe('DemandRepository', () => {
  // Proof: with `bumpWorkItems` removed from `set`, this read revision 0 after the
  // first write; watched 2026-10-20.
  it('moves the work item’s revision on every demand write, a clear included', async () => {
    expect(await demands.set('w', 'ram', 4, stamp)).toBe('written');
    expect(revisionOf('w')).toBe(1);
    expect(await demands.set('w', 'ram', 6, stamp)).toBe('written');
    expect(await demands.set('w', 'ram', null, stamp)).toBe('written');
    expect(revisionOf('w')).toBe(3);
    expect(revisionOf('v')).toBe(0);
  });

  it('refuses an absent work item or resource without moving anything', async () => {
    expect(await demands.set('nothing', 'ram', 1, stamp)).toBe('unknown_work_item');
    expect(await demands.set('w', 'nothing', 1, stamp)).toBe('unknown_resource');
    expect(revisionOf('w')).toBe(0);
    expect(await demands.listByProject('p')).toEqual([]);
  });
});

describe('ResourceCapacityRepository', () => {
  it('moves no work item revision: a capacity is the project’s fact', async () => {
    expect(await capacities.set('p', 'ram', 32, stamp)).toEqual({ ok: true });
    expect(revisionOf('w')).toBe(0);
    expect(await capacities.listFor('p')).toEqual([{ resourceId: 'ram', units: 32 }]);
  });
});

describe('the resource directory over SQLite', () => {
  // Proof: with `bumpWorkItems` removed from `removeResource`, the demanding row
  // read revision 1 after the cascade instead of 2; watched 2026-10-20.
  it('moves the revision of every row a cascaded removal takes a demand from', async () => {
    await demands.set('w', 'ram', 4, stamp);
    await capacities.set('q', 'ram', 8, stamp);
    expect(await resources.removeResource('ram', true, stamp)).toEqual({
      ok: true,
      removal: { workItemIds: ['w'], projectIds: ['p', 'q'] },
    });
    expect(revisionOf('w')).toBe(2);
    expect(await demands.listByProject('p')).toEqual([]);
    expect(await capacities.listFor('q')).toEqual([]);
  });

  it('answers the projects whose demands or capacities name a renamed resource', async () => {
    await demands.set('w', 'ram', 4, stamp);
    await capacities.set('q', 'ram', 8, stamp);
    expect(await resources.patchResource('ram', { name: 'h2puni memory' }, stamp)).toEqual({
      ok: true,
      resource: { id: 'ram', name: 'h2puni memory', kind: 'divisible', unitLabel: 'GB' },
      projectIds: ['p', 'q'],
    });
    expect(revisionOf('w')).toBe(1);
  });

  it('lists an organization’s resources under their local names, and names foreign reach', async () => {
    for (const statement of [
      "INSERT INTO organization (id,name,created_at) VALUES ('a','A',1),('b','B',1)",
      "INSERT INTO project_organization (resource_id,organization_id) VALUES ('p','a'),('q','b')",
    ])
      connection.db.run(statement);
    await resources.mapInOrganization('resources', 'ram', 'a', 'Build host RAM');
    expect(await resources.listInOrganization('resources', 'a')).toEqual([
      { id: 'ram', name: 'Build host RAM', kind: 'divisible', unitLabel: 'GB' },
    ]);
    expect(await resources.listInOrganization('resources', 'b')).toEqual([]);
    await demands.set('w', 'ram', 4, stamp);
    expect(await resources.foreignReferencesTo('resources', 'ram', 'a')).toEqual([]);
    expect(
      await resources.renameInOrganization('resources', 'ram', 'a', 'Host RAM', stamp),
    ).toEqual({ ok: true, projectIds: ['p'] });
    // Organization B's project reaching A's resource, as a bug would leave it.
    await demands.set('v', 'ram', 1, stamp);
    await capacities.set('q', 'ram', 2, stamp);
    // Proof: with the two resource arms removed from `foreignReferencesTo`, this
    // answered []; watched 2026-10-20.
    expect((await resources.foreignReferencesTo('resources', 'ram', 'a')).sort()).toEqual([
      'project_resource_capacity:q',
      'work_item_resource_demand:v',
    ]);
    expect(
      resources.renameInOrganization('resources', 'ram', 'a', 'Host RAM again', stamp),
    ).rejects.toThrow('named by a foreign project');
  });
});
