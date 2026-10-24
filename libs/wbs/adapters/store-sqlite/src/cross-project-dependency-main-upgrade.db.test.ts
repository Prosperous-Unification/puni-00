import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders } from './migrate-down';
import { parseMigrationSetCapture } from './migration-set';

const MAIN = 'b6b021dfb744eb9a9b9e1a4d6583d46791e5e176';
const REPOSITORY = new URL('../../../../../', import.meta.url).pathname;
const APP = join(REPOSITORY, 'apps/wbs/be-01');
const ADDED = [
  '20261022210000_add_project_abbreviations',
  '20261022211000_add_external_dependencies',
  '20261022212000_add_cross_project_dependency_activation',
  '20261022213000_add_optimization_boundary_certificates',
];

function gitBytes(...arguments_: string[]): Buffer {
  const child = Bun.spawnSync(['git', ...arguments_], {
    cwd: REPOSITORY,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
  expect(child.stderr.toString()).toBe('');
  expect(child.exitCode).toBe(0);
  return child.stdout;
}

/** Reproduce the tracked main tree itself, including each original blob identity. */
function copyMainMigrations(destination: string): void {
  const entries = gitBytes('ls-tree', '-r', MAIN, '--', 'apps/wbs/be-01/drizzle')
    .toString()
    .trim()
    .split('\n');
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    const match =
      /^100644 blob ([a-f0-9]{40})\t(apps\/wbs\/be-01\/drizzle\/[a-z0-9_]+\/(?:(?:migration|down)\.sql|snapshot\.json))$/.exec(
        entry,
      );
    if (match === null) throw new Error(`unexpected frozen main migration entry: ${entry}`);
    const [, blob, path] = match;
    const bytes = gitBytes('cat-file', 'blob', blob);
    expect(
      createHash('sha1')
        .update(`blob ${String(bytes.length)}\0`)
        .update(bytes)
        .digest('hex'),
    ).toBe(blob);
    const relative = path.slice('apps/wbs/be-01/drizzle/'.length);
    const target = join(destination, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
}

function ledgerAt(dbPath: string) {
  const db = openDatabase(dbPath);
  try {
    return db
      .query<{ id: number; name: string; hash: string; created_at: number }, []>(
        'SELECT id,name,hash,created_at FROM __drizzle_migrations ORDER BY created_at,name',
      )
      .all();
  } finally {
    db.close();
  }
}

function schemaAt(dbPath: string) {
  const db = openDatabase(dbPath);
  try {
    return db
      .query<{ type: string; name: string; tbl_name: string; sql: string | null }, []>(
        'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name',
      )
      .all();
  } finally {
    db.close();
  }
}

function mainValuesAt(dbPath: string) {
  const db = openDatabase(dbPath);
  try {
    return {
      project: db.query("SELECT * FROM project WHERE id='main-plan'").all(),
      organization: db.query("SELECT * FROM organization WHERE id='main-org'").all(),
      definitions: db
        .query("SELECT * FROM measure WHERE organization_id='main-org' ORDER BY key")
        .all(),
      estimates: db.query('SELECT * FROM estimate ORDER BY work_item_id,step_id').all(),
      facts: db
        .query('SELECT * FROM step_measure ORDER BY work_item_id,step_id,measure_id,metric')
        .all(),
      trios: db
        .query('SELECT * FROM measure_estimate ORDER BY work_item_id,step_id,measure_key')
        .all(),
      budgets: db.query('SELECT * FROM work_item_budget ORDER BY work_item_id,measure_key').all(),
    };
  } finally {
    db.close();
  }
}

function seedMain(dbPath: string): void {
  const db = openDatabase(dbPath);
  try {
    db.run(
      "INSERT INTO users(id,username,password_hash,created_at) VALUES ('main-owner','main-owner','x',1)",
    );
    db.run(
      "INSERT INTO organization(id,name,created_at) VALUES ('main-org','Main organization',11)",
    );
    db.run(
      "INSERT INTO project(id,name,owner_id,created_at,budget_factor) VALUES ('main-plan','Main plan','main-owner',12,2.75)",
    );
    db.run(
      "INSERT INTO project_organization(resource_id,organization_id) VALUES ('main-plan','main-org')",
    );
    db.run(
      "INSERT INTO step(id,project_id,name,position) VALUES ('main-dev','main-plan','Development',10)",
    );
    db.run(
      "INSERT INTO work_item(id,project_id,name,position,revision) VALUES ('main-work','main-plan','Retained work',1,0)",
    );
    db.run(
      "UPDATE measure SET name='Main priced cost',show_by_default=1 WHERE organization_id='main-org' AND key='cost'",
    );
    db.run(
      "INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES ('main-work','main-dev',1.25,2.5,7.5)",
    );
    db.run(`INSERT INTO step_measure(work_item_id,step_id,metric,measure_id,value,recorded_at,currency,rate_card_digest)
      SELECT 'main-work','main-dev',NULL,id,1700000,21,'USD','main-card' FROM measure WHERE organization_id='main-org' AND key='cost'`);
    db.run(`INSERT INTO measure_estimate(work_item_id,step_id,measure_key,measure_id,optimistic,realistic,pessimistic,currency,rate_card_digest)
      SELECT 'main-work','main-dev','cost',id,1000000,2000000,5000000,'USD','main-card' FROM measure WHERE organization_id='main-org' AND key='cost'`);
    db.run(`INSERT INTO work_item_budget(work_item_id,measure_key,measure_id,cap,policy,hold_per_attempt)
      SELECT 'main-work',key,id,9900,'strict',330 FROM measure WHERE organization_id='main-org' AND key='tokens'`);
    db.run(`INSERT INTO work_item_budget(work_item_id,measure_key,measure_id,cap,policy,hold_per_attempt)
      SELECT 'main-work',key,id,6500000,'advisory',500000 FROM measure WHERE organization_id='main-org' AND key='cost'`);
  } finally {
    db.close();
  }
}

async function runCli(root: string, dbPath: string, file: string, arguments_: readonly string[]) {
  const child = Bun.spawn([process.execPath, 'run', join(APP, 'src', file), ...arguments_], {
    cwd: root,
    env: { ...process.env, DB_PATH: dbPath },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(stderr).toBe('');
  expect(exitCode).toBe(0);
  return stdout;
}

test('upgrades the exact main measure database with four older dependency identities and restores only those additions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wbs-main-dependency-upgrade-'));
  try {
    const mainMigrations = join(root, 'main-drizzle');
    const candidateRoot = join(root, 'candidate');
    const candidateMigrations = join(candidateRoot, 'drizzle');
    const dbPath = join(root, 'main.db');
    copyMainMigrations(mainMigrations);
    cpSync(join(APP, 'drizzle'), candidateMigrations, { recursive: true });
    runMigrations(dbPath, mainMigrations);
    seedMain(dbPath);
    const baseline = ledgerAt(dbPath);
    const values = mainValuesAt(dbPath);
    const schema = schemaAt(dbPath);
    expect(baseline.at(-1)?.name).toBe('20261023170000_add_work_item_budget');
    expect(baseline.filter(({ name }) => name.startsWith('20261023'))).toHaveLength(5);
    expect(values.project).toMatchObject([{ budget_factor: 2.75 }]);
    expect(values.definitions).toHaveLength(5);
    expect(values.definitions).toContainEqual(
      expect.objectContaining({ key: 'cost', name: 'Main priced cost' }),
    );
    expect(values.estimates).toMatchObject([
      { optimistic: 1.25, realistic: 2.5, pessimistic: 7.5 },
    ]);
    expect(values.facts).toMatchObject([
      { value: 1700000, currency: 'USD', rate_card_digest: 'main-card' },
    ]);
    expect(values.trios).toMatchObject([
      {
        optimistic: 1000000,
        realistic: 2000000,
        pessimistic: 5000000,
        currency: 'USD',
        rate_card_digest: 'main-card',
      },
    ]);
    expect(values.budgets).toMatchObject([
      { measure_key: 'cost', cap: 6500000, policy: 'advisory', hold_per_attempt: 500000 },
      { measure_key: 'tokens', cap: 9900, policy: 'strict', hold_per_attempt: 330 },
    ]);
    const identity = {
      target: 'main-upgrade',
      attempt: 'exact-main',
      candidate: 'combined-dependencies',
    };
    const identityFlags = Object.entries(identity).map(([key, value]) => `--${key}=${value}`);
    const captureBytes = await runCli(candidateRoot, dbPath, 'migrate-status-cli.ts', [
      '--capture',
      ...identityFlags,
    ]);
    const captured: unknown = JSON.parse(captureBytes);
    const capture = parseMigrationSetCapture(captured, identity);
    expect(capture.applied).toEqual(baseline.map(({ name, hash }) => ({ name, hash })));
    expect(capture.pending).toEqual(
      readMigrationFolders(candidateMigrations)
        .filter(({ name }) => ADDED.includes(name))
        .map(({ name, hash, downHash }) => ({ name, hash, downHash })),
    );
    expect(capture.pending.map(({ name }) => name)).toEqual(ADDED);
    expect(capture.pending.every(({ name }) => name < '20261023100000_add_claim_lease')).toBe(true);
    const capturePath = join(root, 'capture.json');
    writeFileSync(capturePath, captureBytes);
    const captureHash = createHash('sha256').update(readFileSync(capturePath)).digest('hex');
    expect(await runCli(candidateRoot, dbPath, 'migrate-cli.ts', [])).toBe('migrations applied\n');
    const upgraded = ledgerAt(dbPath);
    expect(upgraded.filter(({ name }) => !ADDED.includes(name))).toEqual(baseline);
    expect(
      upgraded.filter(({ name }) => ADDED.includes(name)).map(({ name, hash }) => ({ name, hash })),
    ).toEqual(capture.pending.map(({ name, hash }) => ({ name, hash })));
    expect(upgraded).toHaveLength(baseline.length + 4);
    expect(
      schemaAt(dbPath)
        .filter(
          ({ type, name }) =>
            type === 'table' &&
            !schema.some((entry) => entry.type === 'table' && entry.name === name),
        )
        .map(({ name }) => name),
    ).toEqual([
      'cross_project_dependency_activation',
      'cross_project_dependency_activation_receipt',
      'external_dependency',
      'optimization_boundary_certificate',
      'project_abbreviation',
      'project_abbreviation_counter',
    ]);
    expect(mainValuesAt(dbPath)).toEqual(values);
    expect(
      await runCli(candidateRoot, dbPath, 'migrate-down-cli.ts', [
        `--capture-file=${capturePath}`,
        `--capture-sha256=${captureHash}`,
        ...identityFlags,
      ]),
    ).toBe(`restored captured migration set: ${[...ADDED].reverse().join(', ')}\n`);
    expect(ledgerAt(dbPath)).toEqual(baseline);
    expect(schemaAt(dbPath)).toEqual(schema);
    expect(mainValuesAt(dbPath)).toEqual(values);
    expect(
      await runCli(candidateRoot, dbPath, 'migrate-down-cli.ts', [
        `--capture-file=${capturePath}`,
        `--capture-sha256=${captureHash}`,
        ...identityFlags,
      ]),
    ).toBe('restored captured migration set: (already restored)\n');
    expect(ledgerAt(dbPath)).toEqual(baseline);
    expect(schemaAt(dbPath)).toEqual(schema);
    expect(mainValuesAt(dbPath)).toEqual(values);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
