import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WorkPackageAddressSnapshot } from '@wbs/core';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openDatabase, openReadOnlyConnection } from './db';
import { userBoundOrganizationOf } from './organization-access';
import { WorkPackageAddressSearchRepository } from './work-package-address-search';
import { openSpaceDatabase } from './testing/space-database';
let dir: string;
let path: string;
let closes: number;
let statements: string[];
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'address-search-'));
  path = await openSpaceDatabase(dir);
  closes = 0;
  statements = [];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});
function repository(organizationId: string | null = 'org-a') {
  return new WorkPackageAddressSearchRepository({
    openConnection: () => {
      const connection = openReadOnlyConnection(path, {
        logQuery: (query) => statements.push(query),
      });
      return {
        db: connection.db,
        close: () => {
          closes++;
          connection.close();
        },
      };
    },
    activeOrganizationOf: () => userBoundOrganizationOf(() => Promise.resolve(organizationId)),
    now: () => 1,
  });
}
it('closes success modeled refusal and throws and rejects retained reader capabilities', async () => {
  let retained: WorkPackageAddressSnapshot | undefined;
  expect(
    await repository().withSnapshot({ id: 'ada' }, (reader) => {
      retained = reader;
      return reader.capture('a1')?.workPackage.workPackageId;
    }),
  ).toEqual({ ok: true, value: 'a1' });
  expect(closes).toBe(1);
  if (retained === undefined) throw new Error('reader not captured');
  const captured = retained;
  expect(() => captured.capture('a1')).toThrow('snapshot is closed');
  expect(() => captured.access).toThrow('snapshot is closed');
  expect(
    repository().withSnapshot({ id: 'ada' }, () => {
      throw new Error('injected failure');
    }),
  ).rejects.toThrow('injected failure');
  await Promise.resolve();
  expect(closes).toBe(2);
  const writer = openDatabase(path);
  writer.run("UPDATE organization_activation SET state='activated',activated_at=1");
  writer.close();
  expect(
    await repository(null).withSnapshot({ id: 'ada' }, () => {
      throw new Error('must not read after refusal');
    }),
  ).toEqual({ ok: false, refusal: 'no_active_organization' });
  expect(closes).toBe(3);
});
it('holds authorization metadata and selected placements in one snapshot across rival writes', async () => {
  const writer = openDatabase(path);
  try {
    const observed = await repository().withSnapshot({ id: 'ada' }, (reader) => {
      const first = reader.capture('a1');
      writer.run("UPDATE work_package SET name='Changed' WHERE id='a1'");
      writer.run(
        "INSERT INTO work_item(id,work_package_id,position,name) VALUES('late','a1',10,'late')",
      );
      const second = reader.capture('a1');
      expect(second).toEqual(first);
      return second;
    });
    expect(observed.ok).toBe(true);
    const fresh = await repository().withSnapshot({ id: 'ada' }, (reader) => reader.capture('a1'));
    if (!fresh.ok) throw new Error('fresh admission refused');
    expect(fresh.value?.workPackage.name).toBe('Changed');
    expect(fresh.value?.placements.map((placement) => placement.id)).toContain('late');
  } finally {
    writer.close();
  }
});
it('uses bounded metadata SQL without work item trees and captures only selected work package facts', async () => {
  await repository().withSnapshot({ id: 'ada' }, (reader) => {
    expect(reader.searchWorkPackages('a', null, 2).length).toBe(2);
  });
  expect(statements.some((statement) => statement.includes('work_item'))).toBe(false);
  expect(statements.filter((statement) => statement.includes('from "work package"')).length).toBe(
    2,
  );
  statements = [];
  await repository().withSnapshot({ id: 'ada' }, (reader) => {
    expect(reader.capture('a1')?.workPackage.workPackageId).toBe('a1');
  });
  expect(statements.filter((statement) => statement.includes('from "work_item"')).length).toBe(1);
  expect(statements.find((statement) => statement.includes('from "work_item"'))).toContain(
    'where "work_item"."work_package_id" = ?',
  );
});
it('rejects malformed trusted step evidence at capture before returning detached facts', async () => {
  const writer = openDatabase(path);
  try {
    writer.run(
      "INSERT INTO step(id,work_package_id,name,position,code) VALUES('broken','a1','broken','broken',NULL)",
    );
  } finally {
    writer.close();
  }
  await repository()
    .withSnapshot({ id: 'ada' }, (reader) => reader.capture('a1'))
    .then(
      () => {
        throw new Error('capture admitted malformed step evidence');
      },
      (cause: unknown) => {
        expect(cause).toEqual(new Error('malformed work package address step'));
      },
    );
});

it('rejects malformed trusted placement evidence at capture before returning detached facts', async () => {
  const writer = openDatabase(path);
  try {
    writer.run(
      "INSERT INTO work_item(id,work_package_id,position,name,frozen_number) VALUES('broken','a1',10,'broken','bad')",
    );
  } finally {
    writer.close();
  }
  await repository()
    .withSnapshot({ id: 'ada' }, (reader) => reader.capture('a1'))
    .then(
      () => {
        throw new Error('capture admitted malformed placement evidence');
      },
      (cause: unknown) => {
        expect(cause).toEqual(new Error('malformed work package address placement'));
      },
    );
});
