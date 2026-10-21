import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProjectAddressSnapshot } from '@wbs/core';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openDatabase, openReadOnlyConnection } from './db';
import { userBoundOrganizationOf } from './organization-access';
import { ProjectAddressSearchRepository } from './project-address-search';
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
  return new ProjectAddressSearchRepository({
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
  let retained: ProjectAddressSnapshot | undefined;
  expect(
    await repository().withSnapshot({ id: 'ada' }, (reader) => {
      retained = reader;
      return reader.capture('a1')?.project.projectId;
    }),
  ).toEqual({ ok: true, value: 'a1' });
  expect(closes).toBe(1);
  if (retained === undefined) throw new Error('reader not captured');
  expect(() => retained.capture('a1')).toThrow('snapshot is closed');
  expect(() => retained.access).toThrow('snapshot is closed');
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
      writer.run("UPDATE project SET name='Changed' WHERE id='a1'");
      writer.run(
        "INSERT INTO work_item(id,project_id,position,name) VALUES('late','a1',10,'late')",
      );
      const second = reader.capture('a1');
      expect(second).toEqual(first);
      return second;
    });
    expect(observed.ok).toBe(true);
    const fresh = await repository().withSnapshot({ id: 'ada' }, (reader) => reader.capture('a1'));
    if (!fresh.ok) throw new Error('fresh admission refused');
    expect(fresh.value?.project.name).toBe('Changed');
    expect(fresh.value?.placements.map((placement) => placement.id)).toContain('late');
  } finally {
    writer.close();
  }
});
it('uses bounded metadata SQL without work item trees and captures only selected project facts', async () => {
  await repository().withSnapshot({ id: 'ada' }, (reader) => {
    expect(reader.searchProjects('a', null, 2).length).toBe(2);
  });
  expect(statements.some((statement) => statement.includes('work_item'))).toBe(false);
  expect(statements.filter((statement) => statement.includes('from "project"')).length).toBe(2);
  statements = [];
  await repository().withSnapshot({ id: 'ada' }, (reader) => {
    expect(reader.capture('a1')?.project.projectId).toBe('a1');
  });
  expect(statements.filter((statement) => statement.includes('from "work_item"')).length).toBe(1);
  expect(statements.find((statement) => statement.includes('from "work_item"'))).toContain(
    'where "work_item"."project_id" = ?',
  );
});
it('rejects malformed trusted step evidence at capture before returning detached facts', async () => {
  const writer = openDatabase(path);
  try {
    writer.run(
      "INSERT INTO step(id,project_id,name,position,code) VALUES('broken','a1','broken','broken',NULL)",
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
        expect(cause).toEqual(new Error('malformed project address step'));
      },
    );
});

it('rejects malformed trusted placement evidence at capture before returning detached facts', async () => {
  const writer = openDatabase(path);
  try {
    writer.run(
      "INSERT INTO work_item(id,project_id,position,name,frozen_number) VALUES('broken','a1',10,'broken','bad')",
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
        expect(cause).toEqual(new Error('malformed project address placement'));
      },
    );
});
