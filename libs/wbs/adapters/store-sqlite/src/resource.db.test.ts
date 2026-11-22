import { rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Connection, openConnection } from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import { DemandRepository, ResourceCapacityRepository } from './resource';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';

const stamp = { at: 5, by: 'u' };
let directory: string;
let connection: Connection;
let opened: Connection | undefined;
let custody = { hasUnknownOwner: false };
let demands: DemandRepository;
let capacities: ResourceCapacityRepository;
let resources: DirectoryRepository;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'resource-db-'));
  const path = join(directory, 'plan.db');
  opened = undefined;
  custody = { hasUnknownOwner: false };
  migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, custody);
  custody.hasUnknownOwner = true;
  connection = openConnection(path);
  opened = connection;
  custody.hasUnknownOwner = false;
  for (const statement of [
    "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','u','x',1)",
    "INSERT INTO organization (id,name,created_at) VALUES ('a','A',1),('b','B',1)",
    "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES ('parent-a','a','Parent A',1,'u'),('parent-b','b','Parent B',1,'u')",
    "INSERT INTO work_package (id,project_id,name,created_by,revision,created_at) VALUES ('p','parent-a','Plan','u',0,1),('q','parent-b','Other','u',0,1)",
    "INSERT INTO work_package_organization (resource_id,organization_id) VALUES ('p','a'),('q','b')",
    "INSERT INTO work_item (id,work_package_id,name,position,revision) VALUES ('w','p','Build',1,0),('v','q','Ship',1,0)",
    "INSERT INTO resource (id,name,kind,unit_label) VALUES ('ram','h2puni ram','divisible','GB'),('stage','staging','exclusive','env')",
  ])
    connection.db.run(statement);
  demands = new DemandRepository(connection.db, OPEN);
  capacities = new ResourceCapacityRepository(connection.db, OPEN);
  resources = new DirectoryRepository(connection.db, OPEN);
});

afterEach(() => {
  opened?.close();
  if (custody.hasUnknownOwner)
    throw new Error('uncertain resource fixture owner; retained ' + directory);
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
    expect(await demands.listByWorkPackage('p')).toEqual([]);
  });
});

describe('ResourceCapacityRepository', () => {
  it('moves no work item revision: a capacity is the work package’s fact', async () => {
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
      removal: { workItemIds: ['w'], workPackageIds: ['p', 'q'] },
    });
    expect(revisionOf('w')).toBe(2);
    expect(await demands.listByWorkPackage('p')).toEqual([]);
    expect(await capacities.listFor('q')).toEqual([]);
  });

  it('answers the work packages whose demands or capacities name a renamed resource', async () => {
    await demands.set('w', 'ram', 4, stamp);
    await capacities.set('q', 'ram', 8, stamp);
    expect(await resources.patchResource('ram', { name: 'h2puni memory' }, stamp)).toEqual({
      ok: true,
      resource: { id: 'ram', name: 'h2puni memory', kind: 'divisible', unitLabel: 'GB' },
      workPackageIds: ['p', 'q'],
    });
    expect(revisionOf('w')).toBe(1);
  });

  it('lists an organization’s resources under their local names, and names foreign reach', async () => {
    await resources.mapInOrganization('resources', 'ram', 'a', 'Build host RAM', stamp);
    expect(await resources.listInOrganization('resources', 'a')).toEqual([
      { id: 'ram', name: 'Build host RAM', kind: 'divisible', unitLabel: 'GB' },
    ]);
    expect(await resources.listInOrganization('resources', 'b')).toEqual([]);
    await demands.set('w', 'ram', 4, stamp);
    expect(await resources.foreignReferencesTo('resources', 'ram', 'a')).toEqual([]);
    expect(
      await resources.renameInOrganization('resources', 'ram', 'a', 'Host RAM', stamp),
    ).toEqual({ ok: true, workPackageIds: ['p'] });
    // Organization B's work package reaching A's resource, as a bug would leave it.
    await demands.set('v', 'ram', 1, stamp);
    await capacities.set('q', 'ram', 2, stamp);
    // Proof: with the two resource arms removed from `foreignReferencesTo`, this
    // answered []; watched 2026-10-20.
    expect((await resources.foreignReferencesTo('resources', 'ram', 'a')).sort()).toEqual([
      'work_item_resource_demand:v',
      'work_package_resource_capacity:q',
    ]);
    await rejects(
      resources.renameInOrganization('resources', 'ram', 'a', 'Host RAM again', stamp),
      /named by a foreign work package/,
    );
  });
});
