import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DependencyRuntimeCapability } from '@wbs/contracts/dependency-runtime';
import type { Scope, TransactionalStores } from '@wbs/core';
import { permitsExternalDependencies } from '@wbs/core/ports/external-dependency-authoring';
import { afterEach, expect, test } from 'bun:test';

import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';
import { seedDependencyAuthority } from './testing/dependency-activation';

const incapable = {
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'backend',
  semantics: [],
} as const;
const capable = { ...incapable, semantics: ['cross-project-dependencies-v1'] } as const;
const opened: { source: SqliteSource; directory: string }[] = [];
afterEach(async () => {
  for (const { source, directory } of opened.splice(0)) {
    await source.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(dependencyCapability: DependencyRuntimeCapability) {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-source-capability-'));
  const path = join(directory, 'source.db');
  runMigrations(path, new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname);
  const source = openSqliteSource({ dbPath: path, dependencyCapability });
  opened.push({ source, directory });
  return { source, path };
}

for (const descriptor of [
  undefined,
  null,
  {},
  { ...capable, version: 2 },
  { ...capable, semantics: ['unknown'] },
  { ...capable, extra: true },
])
  test(`refuses missing or malformed binary descriptor before opening SQLite: ${JSON.stringify(descriptor)}`, () => {
    expect(() =>
      openSqliteSource({
        dbPath: 'must-not-open.db',
        dependencyCapability: descriptor as DependencyRuntimeCapability,
        openConnection: () => {
          throw new Error('opened before capability validation');
        },
      }),
    ).toThrow('invalid dependency runtime capability');
  });

for (const role of ['gateway', 'mcp'] as const)
  test(`refuses ${role} descriptor before opening a backend writer`, () => {
    expect(() =>
      openSqliteSource({
        dbPath: 'must-not-open.db',
        dependencyCapability: { ...capable, role },
        openConnection: () => {
          throw new Error('opened before capability validation');
        },
      }),
    ).toThrow('SQLite source requires backend dependency runtime capability');
  });

test('capable binary remains inactive on disabled authority and admits enabled authority from its writer', async () => {
  const { source, path } = fixture(capable);
  await source.uow.run((scope) => {
    expect(permitsExternalDependencies(scope.stores.externalDependencyAuthoring)).toBe(false);
    return Promise.resolve({ commit: true as const, value: undefined });
  });
  seedDependencyAuthority(path);
  await source.uow.run((scope) => {
    expect(permitsExternalDependencies(scope.stores.externalDependencyAuthoring)).toBe(true);
    return Promise.resolve({ commit: true as const, value: undefined });
  });
});

test('captures binary support once so mutation cannot grant incapable source permission', async () => {
  const descriptor: DependencyRuntimeCapability = { ...incapable, semantics: [] };
  const { source, path } = fixture(descriptor);
  Object.assign(descriptor, { semantics: capable.semantics });
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

test('captured capable support survives caller descriptor mutation', async () => {
  const descriptor: DependencyRuntimeCapability = { ...capable, semantics: [...capable.semantics] };
  const { source, path } = fixture(descriptor);
  Object.assign(descriptor, { semantics: [] });
  seedDependencyAuthority(path);
  await source.uow.run((scope) => {
    expect(permitsExternalDependencies(scope.stores.externalDependencyAuthoring)).toBe(true);
    return Promise.resolve({ commit: true as const, value: undefined });
  });
});

test('one operation reads durable authority once on its admitted writer', async () => {
  const { source, path } = fixture(capable);
  seedDependencyAuthority(path);
  const read = source.db.all.bind(source.db);
  let observations = 0;
  source.db.all = (...queries: Parameters<typeof source.db.all>) => {
    const query = queries[0];
    if (
      typeof query === 'string' &&
      query.includes('SELECT id,state FROM cross_project_dependency_activation')
    )
      observations++;
    return read(...queries);
  };
  await source.uow.run((scope) => {
    expect(permitsExternalDependencies(scope.stores.externalDependencyAuthoring)).toBe(true);
    expect(observations).toBe(1);
    return Promise.resolve({ commit: true as const, value: undefined });
  });
});

test('repair catalog cannot borrow an authoring reader after rollback', async () => {
  const { source, path } = fixture(capable);
  seedDependencyAuthority(path);
  await source.uow.run((scope) => {
    expect(permitsExternalDependencies(scope.stores.externalDependencyAuthoring)).toBe(true);
    return Promise.resolve({
      commit: false as const,
      value: undefined,
      afterRollback: (repair: Scope<TransactionalStores>) => {
        expect(() =>
          permitsExternalDependencies(repair.stores.externalDependencyAuthoring),
        ).toThrow('external dependency authority requires an admitted writer');
        return Promise.resolve();
      },
    });
  });
});
