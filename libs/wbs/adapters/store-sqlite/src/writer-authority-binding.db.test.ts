import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { permitsExternalDependencies } from '@wbs/core/ports/external-dependency-authoring';
import { afterEach, expect, test } from 'bun:test';

import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';
import { seedDependencyAuthority } from './testing/dependency-activation';

const opened: { source: SqliteSource; directory: string }[] = [];
afterEach(async () => {
  for (const { source, directory } of opened.splice(0)) {
    await source.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-writer-authority-'));
  const path = join(directory, 'source.db');
  runMigrations(path, new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname);
  const source = openSqliteSource({ dbPath: path });
  opened.push({ source, directory });
  return { source, path };
}

test('public catalog cannot lend writer authority', () => {
  const { source } = fixture();
  expect(() => permitsExternalDependencies(source.stores.externalDependencyAuthoring)).toThrow(
    'external dependency authority requires an admitted writer',
  );
});

test('borrowed authority sees staged writer state and expires after settlement', async () => {
  const { source } = fixture();
  let retained = source.stores.externalDependencyAuthoring;
  await source.uow.run((scope) => {
    retained = scope.stores.externalDependencyAuthoring;
    expect(permitsExternalDependencies(retained)).toBe(false);
    source.db.run('DELETE FROM cross_project_dependency_activation');
    expect(() => permitsExternalDependencies(retained)).toThrow(
      'invalid dependency activation marker',
    );
    return Promise.resolve({ commit: false as const, value: undefined });
  });
  expect(() => permitsExternalDependencies(retained)).toThrow('closed');
  await source.uow.run((scope) => {
    expect(permitsExternalDependencies(scope.stores.externalDependencyAuthoring)).toBe(false);
    return Promise.resolve({ commit: true as const, value: undefined });
  });
});

test('enabled authority refuses unsupported production semantics even with no edges', async () => {
  const { source, path } = fixture();
  seedDependencyAuthority(path);
  const failure: unknown = await source.uow
    .run((scope) => {
      permitsExternalDependencies(scope.stores.externalDependencyAuthoring);
      return Promise.resolve({ commit: true as const, value: undefined });
    })
    .then(
      () => null,
      (cause: unknown) => cause,
    );
  expect(failure).toMatchObject({ message: 'external dependency semantic runtime is unsupported' });
});

test('borrowed authorities remain bound to their source when another writer is admitted', async () => {
  const first = fixture().source;
  const second = fixture().source;
  await first.uow.run(async (firstScope) => {
    first.db.run('DELETE FROM cross_project_dependency_activation');
    await second.uow.run((secondScope) => {
      expect(permitsExternalDependencies(secondScope.stores.externalDependencyAuthoring)).toBe(
        false,
      );
      expect(() =>
        permitsExternalDependencies(firstScope.stores.externalDependencyAuthoring),
      ).toThrow('invalid dependency activation marker');
      return Promise.resolve({ commit: true as const, value: undefined });
    });
    return Promise.resolve({ commit: false as const, value: undefined });
  });
});

for (const [fault, statement, message] of [
  [
    'missing ledger',
    "DELETE FROM __drizzle_migrations WHERE name='20261022212000_add_cross_project_dependency_activation'",
    'missing dependency activation migration',
  ],
  [
    'malformed authority',
    "UPDATE cross_project_dependency_activation SET state='ENABLED'",
    'enabled dependency authority has no exact receipt',
  ],
  [
    'missing receipt schema',
    'DROP TABLE cross_project_dependency_activation_receipt',
    'invalid dependency activation schema',
  ],
] as const)
  test(`borrowed authority refuses ${fault} after an earlier successful read`, async () => {
    const { source } = fixture();
    await source.uow.run((scope) => {
      expect(permitsExternalDependencies(scope.stores.externalDependencyAuthoring)).toBe(false);
      source.db.run(statement);
      expect(() => permitsExternalDependencies(scope.stores.externalDependencyAuthoring)).toThrow(
        message,
      );
      return Promise.resolve({ commit: false as const, value: undefined });
    });
  });
