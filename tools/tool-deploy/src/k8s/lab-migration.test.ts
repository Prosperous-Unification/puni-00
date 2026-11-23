import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';

import { scratchSync } from '@tools/test-scratch';
import { Database } from 'bun:sqlite';
import { expect, it } from 'bun:test';

import {
  assertRestoredSchema,
  LAB_MIGRATION,
  LAB_OLDER_MIGRATION,
  type LabSchema,
  prepareLabBootstrap,
  SCHEMA_FACTS_SCRIPT,
  summarizeWriterObservation,
  watchWriters,
} from './lab';

const ROOT = resolve(import.meta.dir, '../../../..');

const BASELINE: LabSchema = {
  columns: ['id', 'title'],
  migrations: [{ name: '20261005110000_add_shared_people', hash: 'a'.repeat(64) }],
  tables: ['__drizzle_migrations', 'work_item', 'work_package'],
  workPackages: [
    { id: 'package-1', name: 'f8-row-before' },
    { id: 'package-2', name: 'f8-row-second' },
  ],
};

const LAB_BACKEND = 'kind: Deployment\nmetadata:\n  name: wbs-backend\nspec:\n  replicas: 1\n';

it('applies the first k3s rehearsal backend at zero replicas', () => {
  const mcp = 'kind: Deployment\nmetadata:\n  name: wbs-mcp\nspec:\n  replicas: 2\n';
  expect(JSON.parse(prepareLabBootstrap(LAB_BACKEND + '---\n' + mcp))).toEqual({
    apiVersion: 'v1',
    kind: 'List',
    items: [
      { kind: 'Deployment', metadata: { name: 'wbs-backend' }, spec: { replicas: 0 } },
      { kind: 'Deployment', metadata: { name: 'wbs-mcp' }, spec: { replicas: 2 } },
    ],
  });
});

it('refuses a missing, malformed or duplicated initial rehearsal backend', () => {
  expect(() => prepareLabBootstrap('kind: ConfigMap\n')).toThrow('Deployment is absent');
  expect(() => prepareLabBootstrap('kind: Deployment\nmetadata: [\n')).toThrow(/flow sequence/i);
  expect(() => prepareLabBootstrap(LAB_BACKEND + '---\n' + LAB_BACKEND)).toThrow('duplicated');
  expect(() => prepareLabBootstrap('kind: Deployment\nmetadata:\n  name: wbs-backend\n')).toThrow(
    'has no spec',
  );
});

it('executes the actual schema expression against current SQLite evidence with sorted sentinels', () => {
  const path = resolve(scratchSync('lab-schema-current-'), 'fixture.sqlite');
  const writer = new Database(path, { create: true });
  try {
    writer.run(`
      CREATE TABLE work_item (id TEXT, work_package_id TEXT, name TEXT);
      CREATE TABLE __drizzle_migrations (name TEXT, hash TEXT, created_at INTEGER);
      CREATE TABLE work_package (id TEXT, name TEXT);
      CREATE TABLE project (id TEXT, name TEXT);
      INSERT INTO work_package VALUES ('wp-z', 'current-zeta'), ('wp-a', 'current-alpha');
      INSERT INTO project VALUES ('decoy', 'unrelated legacy table');
    `);
    const insert = writer.prepare('INSERT INTO __drizzle_migrations VALUES (?, ?, ?)');
    insert.run('003_tied', 'c'.repeat(64), 20);
    insert.run('001_first', 'a'.repeat(64), 10);
    insert.run('002_second', 'b'.repeat(64), 20);
  } finally {
    writer.close();
  }
  const readers: Database[] = [];
  const output: string[] = [];
  try {
    new Script(SCHEMA_FACTS_SCRIPT).runInNewContext({
      require(module: string) {
        expect(module).toBe('bun:sqlite');
        return {
          Database: class extends Database {
            constructor(filename: string, options: { readonly: true }) {
              expect(filename).toBe('/data/wbs.sqlite');
              expect(options).toEqual({ readonly: true });
              super(path, options);
              readers.push(this);
            }
          },
        };
      },
      console: { log: (encoded: string) => output.push(encoded) },
    });
    expect(readers).toHaveLength(1);
    expect(output).toHaveLength(1);
    const encoded = output.at(0);
    if (encoded === undefined) throw new Error('schema script did not emit its evidence');
    const observed: unknown = JSON.parse(encoded);
    expect(observed).toEqual({
      columns: ['id', 'work_package_id', 'name'],
      migrations: [
        { name: '001_first', hash: 'a'.repeat(64) },
        { name: '002_second', hash: 'b'.repeat(64) },
        { name: '003_tied', hash: 'c'.repeat(64) },
      ],
      tables: ['__drizzle_migrations', 'project', 'work_item', 'work_package'],
      workPackages: [
        { id: 'wp-a', name: 'current-alpha' },
        { id: 'wp-z', name: 'current-zeta' },
      ],
    });
  } finally {
    for (const reader of readers) reader.close();
  }
});

/** Drizzle's `created_at` for a migration folder: its numeric prefix. */
function stampOf(folder: string): number {
  return Number.parseInt(folder.split('_')[0] ?? '', 10);
}

it('ships the older candidate and the existing additive migration in the upgrade image', () => {
  expect(readdirSync(resolve(ROOT, 'deploy/k8s/wbs/lab/migrations')).sort()).toEqual([
    LAB_OLDER_MIGRATION,
    LAB_MIGRATION,
  ]);
  const dockerfile = resolve(ROOT, 'deploy/k8s/wbs/lab/backend-upgrade.Dockerfile');
  const source = readFileSync(dockerfile, 'utf8');
  expect(source).toContain(`COPY migrations/${LAB_OLDER_MIGRATION} `);
  expect(source).toContain(`COPY migrations/${LAB_MIGRATION} `);
});

it('stamps the separate older candidate below the newer pre-applied shared-people baseline', () => {
  expect(stampOf(LAB_OLDER_MIGRATION)).toBeLessThan(stampOf('20261005110000_add_shared_people'));
  expect(readdirSync(resolve(ROOT, 'apps/wbs/be-01/drizzle')).includes(LAB_OLDER_MIGRATION)).toBe(
    false,
  );
});

it('keeps the blocked-down migration isolated in the final-scenario image', () => {
  const name = '29991231010000_lab_rollback_failure';
  expect(readdirSync(resolve(ROOT, 'deploy/k8s/wbs/lab/rollback-fault/migrations'))).toEqual([
    name,
  ]);
  const dockerfile = readFileSync(
    resolve(ROOT, 'deploy/k8s/wbs/lab/backend-rollback-fault.Dockerfile'),
    'utf8',
  );
  expect(dockerfile).toContain(`COPY rollback-fault/migrations/${name} `);
  const down = readFileSync(
    resolve(ROOT, 'deploy/k8s/wbs/lab/rollback-fault/migrations', name, 'down.sql'),
    'utf8',
  );
  expect(down).toContain('CHECK (`allowed` = 1)');
});

// The original F8 ordering fixture remains pinned: under the old timestamp cutoff, an
// overtaken lab stamp made the induced-failure scenario end `rollback-failed`
// (CI run 36296199037). The separate older candidate exercises exact-set selection.
it('stamps the lab migration after every committed backend migration', () => {
  const committed = readdirSync(resolve(ROOT, 'apps/wbs/be-01/drizzle'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => stampOf(entry.name));
  expect(committed.length).toBeGreaterThan(0);
  expect(stampOf(LAB_MIGRATION)).toBeGreaterThan(Math.max(...committed));
});

it('refuses a changed baseline hash or retained older candidate schema after rollback', () => {
  const baseline = BASELINE;
  expect(() => {
    assertRestoredSchema(baseline, baseline);
  }).not.toThrow();
  expect(() => {
    assertRestoredSchema(
      { ...baseline, migrations: [{ ...baseline.migrations[0], hash: 'b'.repeat(64) }] },
      baseline,
    );
  }).toThrow('complete migration ledger');
  expect(() => {
    assertRestoredSchema(
      { ...baseline, tables: [...baseline.tables, 'lab_older_candidate'] },
      baseline,
    );
  }).toThrow('complete table schema');
  expect(() => {
    assertRestoredSchema({ ...baseline, columns: ['id'] }, baseline);
  }).toThrow('work-item columns');
  expect(() => {
    assertRestoredSchema({ ...baseline, workPackages: [] }, baseline);
  }).toThrow('work-package sentinel rows');
  expect(() => {
    assertRestoredSchema(
      { ...baseline, workPackages: [{ id: 'replacement', name: 'f8-row-before' }] },
      baseline,
    );
  }).toThrow('work-package sentinel rows');
});

for (const [changed, workPackages] of [
  ['missing row', [{ id: 'package-1', name: 'f8-row-before' }]],
  [
    'replaced row',
    [
      { id: 'replacement', name: 'f8-row-before' },
      { id: 'package-2', name: 'f8-row-second' },
    ],
  ],
  [
    'changed name',
    [
      { id: 'package-1', name: 'changed' },
      { id: 'package-2', name: 'f8-row-second' },
    ],
  ],
  [
    'reordered rows',
    [
      { id: 'package-2', name: 'f8-row-second' },
      { id: 'package-1', name: 'f8-row-before' },
    ],
  ],
] as const) {
  it('refuses current work-package sentinel evidence with a ' + changed, () => {
    expect(() => {
      assertRestoredSchema({ ...BASELINE, workPackages: [...workPackages] }, BASELINE);
    }).toThrow('work-package sentinel rows');
  });
}

it('refuses a broken writer observer instead of accepting missing samples', async () => {
  const watcher = watchWriters(() => Promise.reject(new Error('kubectl writer read failed')));
  const failure = await watcher.stop().then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('writer failure was not preserved');
  expect(failure.message).toBe('kubectl writer read failed');
});

it('refuses a writer observation gap after one successful sample', async () => {
  const signal: { second: () => void } = { second: () => undefined };
  const secondRead = new Promise<void>((resolve) => {
    signal.second = resolve;
  });
  let reads = 0;
  const watcher = watchWriters(() => {
    reads++;
    if (reads === 1) return Promise.resolve([]);
    signal.second();
    return Promise.reject(new Error('second kubectl writer read failed'));
  });
  await secondRead;
  const failure = await watcher.stop().then(
    () => null,
    (cause: unknown) => cause,
  );
  if (!(failure instanceof Error)) throw new Error('writer observation gap was not reported');
  expect(failure.message).toBe('second kubectl writer read failed');
});

it('requires at least one writer observation before claiming a maximum', async () => {
  const watcher = watchWriters(() => Promise.resolve([]));
  expect(await watcher.stop()).toEqual({ max: 0, worst: [], samples: 1 });
  expect(() => summarizeWriterObservation(0, [], 0)).toThrow('writer observer recorded no samples');
});
