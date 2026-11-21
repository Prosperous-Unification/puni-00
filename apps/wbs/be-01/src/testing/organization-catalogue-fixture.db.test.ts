import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

import type { SqliteSource } from '@wbs/store-sqlite';
import * as sqlite from '@wbs/store-sqlite/db';
import { expect, spyOn, test } from 'bun:test';

import { migrateOrganizationCatalogueFixture } from './organization-catalogue-fixture';
import { OrganizationHarness } from './organization-harness';

for (const composed of [false, true])
  test(`default ${composed ? 'composed' : 'standalone'} organization fixture uses the actual current catalogue migration`, async () => {
    const harness = composed
      ? OrganizationHarness.openComposedWith({})
      : OrganizationHarness.open();
    try {
      expect(
        harness.sqlite
          .query("SELECT name FROM sqlite_master WHERE type='table' AND name='step'")
          .all(),
      ).toEqual([]);
      expect(harness.sqlite.query('SELECT id FROM step_definition').all()).toEqual([]);
      expect(harness.sqlite.query('SELECT id FROM step_binding').all()).toEqual([]);
      expect(
        harness.sqlite
          .query('SELECT name FROM __drizzle_migrations ORDER BY name DESC LIMIT 1')
          .all(),
      ).toEqual([{ name: '20261118210000_add_step_retirements' }]);
      expect(harness.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      await harness.closeComposed();
    }
  });

test('current uncomposed organization fixture closes its actual application writer before removal', () => {
  const open = sqlite.openConnection;
  let writer: sqlite.Connection | undefined;
  const observed = spyOn(sqlite, 'openConnection').mockImplementation((...args) => {
    const connection = open(...args);
    writer = connection;
    return connection;
  });
  let harness: OrganizationHarness | undefined;
  let closed = false;
  try {
    harness = OrganizationHarness.open({ migrate: migrateOrganizationCatalogueFixture });
    if (writer === undefined) throw new Error('fixture application writer was not acquired');
    const actual = writer;
    expect(actual.db.all('SELECT 1 AS value')).toEqual([{ value: 1 }]);
    const directory = dirname(harness.databasePath());
    harness.close();
    closed = true;
    expect(() => actual.db.all('SELECT 1 AS value')).toThrow();
    expect(existsSync(directory)).toBe(false);
  } finally {
    observed.mockRestore();
    if (harness !== undefined && !closed) harness.close();
  }
});

test('current composed organization fixture retains its directory until actual Source close succeeds', async () => {
  const harness = OrganizationHarness.openComposedWith({
    migrate: migrateOrganizationCatalogueFixture,
  });
  // This test selects the actual private owner solely to inject its close failure.
  const source = (harness as unknown as { composedSource: SqliteSource }).composedSource;
  const directory = dirname(harness.databasePath());
  const failure = new Error('injected organization fixture Source close failure');
  const close = spyOn(source, 'close').mockRejectedValue(failure);
  let caught: unknown;
  try {
    try {
      await harness.closeOwned();
    } catch (cause: unknown) {
      caught = cause;
    }
    expect(caught).toBe(failure);
    expect(existsSync(directory)).toBe(true);
    expect(harness.sqlite.query('SELECT 1 AS value').all()).toEqual([{ value: 1 }]);
  } finally {
    close.mockRestore();
    await harness.closeOwned();
  }
  expect(existsSync(directory)).toBe(false);
});
