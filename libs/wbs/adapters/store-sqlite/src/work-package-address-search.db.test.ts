import type { WorkPackageAddressSnapshot } from '@wbs/core';
import { seedCurrentClaimObservation } from '@wbs/core/testing/current-claim-observation';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openDatabase, openReadOnlyConnection } from './db';
import { userBoundOrganizationOf } from './organization-access';
import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';
import { WorkPackageAddressSearchRepository } from './work-package-address-search';
let fixture: Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
let path: string;
let closes: number;
let statements: string[];
beforeEach(async () => {
  fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  await seedCurrentClaimObservation(fixture.source, fixture.seed);
  const databases = fixture.source.db.all<{ name: string; file: string }>('PRAGMA database_list');
  const main = databases.find((database) => database.name === 'main');
  if (main === undefined || main.file === '') throw new Error('Address fixture path is absent');
  path = main.file;
  closes = 0;
  statements = [];
});
afterEach(async () => {
  await fixture.close();
});
function repository(organizationId: string | null = fixture.seed.organizationId) {
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
    now: () => 100,
  });
}
it('closes success modeled refusal and throws and rejects retained reader capabilities', async () => {
  let retained: WorkPackageAddressSnapshot | undefined;
  expect(
    await repository().withSnapshot({ id: 'catalogue-author' }, (reader) => {
      retained = reader;
      return reader.capture(fixture.seed.workPackageId)?.workPackage.workPackageId;
    }),
  ).toEqual({ ok: true, value: fixture.seed.workPackageId });
  expect(closes).toBe(1);
  if (retained === undefined) throw new Error('reader not captured');
  const captured = retained;
  expect(() => captured.capture(fixture.seed.workPackageId)).toThrow('snapshot is closed');
  expect(() => captured.access).toThrow('snapshot is closed');
  expect(
    repository().withSnapshot({ id: 'catalogue-author' }, () => {
      throw new Error('injected failure');
    }),
  ).rejects.toThrow('injected failure');
  await Promise.resolve();
  expect(closes).toBe(2);
  expect(
    await repository(null).withSnapshot({ id: 'catalogue-author' }, () => {
      throw new Error('must not read after refusal');
    }),
  ).toEqual({ ok: false, refusal: 'no_active_organization' });
  expect(closes).toBe(3);
});
it('holds authorization metadata and selected placements in one snapshot across rival writes', async () => {
  const writer = openDatabase(path);
  try {
    const observed = await repository().withSnapshot({ id: 'catalogue-author' }, (reader) => {
      const first = reader.capture(fixture.seed.workPackageId);
      writer.run("UPDATE work_package SET name='Changed' WHERE id='catalogue-empty-package'");
      writer.run(
        "INSERT INTO work_item(id,work_package_id,position,name) VALUES('late','catalogue-empty-package',10,'late')",
      );
      writer.run(
        "UPDATE work_item_work_item_type SET type_id='catalogue-second-type' WHERE work_item_id='claim-first'",
      );
      const second = reader.capture(fixture.seed.workPackageId);
      expect(second).toEqual(first);
      return second;
    });
    expect(observed.ok).toBe(true);
    const fresh = await repository().withSnapshot({ id: 'catalogue-author' }, (reader) =>
      reader.capture(fixture.seed.workPackageId),
    );
    if (!fresh.ok) throw new Error('fresh admission refused');
    expect(fresh.value?.workPackage.name).toBe('Changed');
    expect(fresh.value?.placements.map((placement) => placement.id)).toContain('late');
    expect(
      fresh.value?.placements
        .find((row) => row.id === 'claim-first')
        ?.steps?.map((step) => step.stepId),
    ).toEqual(['claim-step-a-qa', 'claim-step-z-dev']);
  } finally {
    writer.close();
  }
});
it('uses bounded metadata SQL without work item trees and captures only selected work package facts', async () => {
  await repository().withSnapshot({ id: 'catalogue-author' }, (reader) => {
    expect(reader.searchWorkPackages('catalogue', null, 2).length).toBe(2);
  });
  expect(statements.some((statement) => statement.includes('work_item'))).toBe(false);
  expect(statements.filter((statement) => statement.includes('from "work_package"')).length).toBe(
    2,
  );
  statements = [];
  await repository().withSnapshot({ id: 'catalogue-author' }, (reader) => {
    expect(reader.capture(fixture.seed.workPackageId)?.workPackage.workPackageId).toBe(
      fixture.seed.workPackageId,
    );
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
      "UPDATE step_binding SET position=9007199254740992 WHERE id='claim-step-z-dev:first'",
    );
  } finally {
    writer.close();
  }
  await repository()
    .withSnapshot({ id: 'catalogue-author' }, (reader) =>
      reader.capture(fixture.seed.workPackageId),
    )
    .then(
      () => {
        throw new Error('capture admitted malformed step evidence');
      },
      (cause: unknown) => {
        expect(cause).toEqual(new Error('catalogue step binding has a malformed position'));
      },
    );
});

it('rejects malformed trusted placement evidence at capture before returning detached facts', async () => {
  const writer = openDatabase(path);
  try {
    writer.run(
      "INSERT INTO work_item(id,work_package_id,position,name,frozen_number) VALUES('broken','catalogue-empty-package',10,'broken','bad')",
    );
  } finally {
    writer.close();
  }
  await repository()
    .withSnapshot({ id: 'catalogue-author' }, (reader) =>
      reader.capture(fixture.seed.workPackageId),
    )
    .then(
      () => {
        throw new Error('capture admitted malformed placement evidence');
      },
      (cause: unknown) => {
        expect(cause).toEqual(new Error('malformed work package address placement'));
      },
    );
});
