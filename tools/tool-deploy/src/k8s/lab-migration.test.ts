import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'bun:test';

import {
  assertRestoredSchema,
  LAB_MIGRATION,
  LAB_OLDER_MIGRATION,
  summarizeWriterObservation,
  watchWriters,
} from './lab';

const ROOT = resolve(import.meta.dir, '../../../..');

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
  const baseline = {
    columns: ['id', 'title'],
    migrations: [{ name: '20261005110000_add_shared_people', hash: 'a'.repeat(64) }],
    tables: ['__drizzle_migrations', 'project', 'work_item'],
    projects: [{ id: 'project-1', name: 'f8-row-before' }],
  };
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
    assertRestoredSchema({ ...baseline, projects: [] }, baseline);
  }).toThrow('project sentinel rows');
  expect(() => {
    assertRestoredSchema(
      { ...baseline, projects: [{ id: 'project-2', name: 'f8-row-before' }] },
      baseline,
    );
  }).toThrow('project sentinel rows');
});

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
