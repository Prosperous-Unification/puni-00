import { doesNotReject, rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterAll, describe, expect, it } from 'bun:test';

import { lintMigration } from './migration-lint';

const WORKSPACE = new URL('../../../../', import.meta.url);
const RUN_MIGRATIONS = 'apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/migrations';

describe('explicit SC14 catalogue window', () => {
  const name = '20261115130000_add_step_catalogue';
  const source = new URL(`apps/wbs/be-01/drizzle/${name}/`, WORKSPACE);
  const sql = readFileSync(new URL('migration.sql', source), 'utf8');
  const down = readFileSync(new URL('down.sql', source), 'utf8');
  function fixture(folder = name, gate = true) {
    const root = scratchSync('catalogue-window-lint-');
    const directory = join(root, 'apps/wbs/be-01/drizzle', folder);
    mkdirSync(directory, { recursive: true });
    const file = join(directory, 'migration.sql');
    writeFileSync(file, sql);
    writeFileSync(join(directory, 'down.sql'), down);
    if (gate) {
      mkdirSync(join(root, 'bin'));
      writeFileSync(
        join(root, 'bin/assert-rename-window.ts'),
        'throw Error("presence fixture only");\n',
      );
    }
    return { root, directory, file };
  }

  it('admits the complete catalogue transition only with its explicit window gate', async () => {
    const selected = fixture();
    expect(await lintMigration(selected.file, selected.root)).toBeNull();
  });

  it('refuses the complete catalogue transition without its window gate', async () => {
    const selected = fixture(name, false);
    expect((await lintMigration(selected.file, selected.root))?.reason).toContain(
      'assert-rename-window.ts',
    );
  });

  it('keeps the complete catalogue transition closed under another folder name', async () => {
    const selected = fixture(`${name}-unapproved`);
    expect((await lintMigration(selected.file, selected.root))?.reason).toContain('DROP TABLE');
  });

  it('keeps unrelated forbidden statements closed in the catalogue window', async () => {
    const selected = fixture();
    writeFileSync(selected.file, `${sql}\nTRUNCATE TABLE unrelated;\n`);
    expect((await lintMigration(selected.file, selected.root))?.reason).toContain('TRUNCATE');
  });

  it('requires the complete catalogue rollback script beside its forward transition', async () => {
    const selected = fixture();
    rmSync(join(selected.directory, 'down.sql'));
    expect((await lintMigration(selected.file, selected.root))?.reason).toContain('down.sql');
  });
});

it('routes only run-store migration SQL through the production staged hook', async () => {
  const config = Bun.YAML.parse(await Bun.file(new URL('lefthook.yml', WORKSPACE)).text()) as {
    'pre-commit': { commands: Record<string, { run: string; glob?: string }> };
  };
  const routes = (path: string) =>
    Object.entries(config['pre-commit'].commands)
      .filter(
        ([, command]) =>
          command.run ===
            'bun run tools/tool-git-hooks/src/hooks/migration-lint.ts {staged_files}' &&
          command.glob !== undefined &&
          new Bun.Glob(command.glob).match(path),
      )
      .map(([name]) => name);
  for (const script of ['migration.sql', 'down.sql'])
    expect(routes(`${RUN_MIGRATIONS}/0001-run-store/${script}`)).toEqual([
      'run-store-migration-lint',
    ]);
  for (const path of [
    'apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/fixtures/migration.sql',
    'apps/twilight-structure/twilight-dash/cli/src/runs/testing/migrations/example/migration.sql',
    `${RUN_MIGRATIONS}/0001-run-store/notes.md`,
  ])
    expect(routes(path)).toEqual([]);
});

describe('run-store migration registration', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  function migration(up: string, down?: string, relative = RUN_MIGRATIONS) {
    const root = scratchSync('runs-migration-lint-');
    roots.push(root);
    const folder = join(root, relative, 'fixture');
    mkdirSync(folder, { recursive: true });
    const forward = join(folder, 'migration.sql');
    writeFileSync(forward, up);
    expect(existsSync(forward)).toBe(true);
    if (down !== undefined) writeFileSync(join(folder, 'down.sql'), down);
    return { root, forward };
  }
  it('accepts the real run-store forward and destructive down scripts', async () => {
    const root = new URL('.', WORKSPACE).pathname.replace(/\/$/, '');
    for (const script of ['migration.sql', 'down.sql']) {
      const path = join(root, RUN_MIGRATIONS, '0001-run-store', script);
      expect(existsSync(path)).toBe(true);
      await doesNotReject(async () => {
        expect(await lintMigration(path, root)).toBeNull();
      });
    }
  });
  it('requires a run-store down script', async () => {
    // Proof: bypassing down-script validation returned no issue and failed this assertion.
    const { root, forward } = migration('CREATE TABLE example (id TEXT);');
    expect((await lintMigration(forward, root))?.reason).toMatch(/no down\.sql/);
  });
  it('refuses destructive run-store forward scripts', async () => {
    // Proof: bypassing destructive-statement validation returned no issue and failed this assertion.
    const { root, forward } = migration('DROP TABLE example;', 'SELECT 1;');
    expect((await lintMigration(forward, root))?.reason).toMatch(/DROP TABLE/);
  });
  it('refuses run-store provider paths outside the exact migrations root', async () => {
    for (const relative of [
      'apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/fixtures',
      'apps/twilight-structure/twilight-dash/cli/src/runs/testing/migrations',
      `${RUN_MIGRATIONS}-shadow`,
    ]) {
      const { root, forward } = migration(
        'CREATE TABLE example (id TEXT);',
        'DROP TABLE example;',
        relative,
      );
      await rejects(lintMigration(forward, root), /does not own migration/);
    }
  });
});

it('routes staged SQL from lefthook through the moved migration root', async () => {
  const config: unknown = Bun.YAML.parse(await Bun.file(new URL('lefthook.yml', WORKSPACE)).text());
  expect(config).toHaveProperty(
    'pre-commit.commands.migration-lint.glob',
    'apps/wbs/{be-01,mcp-01}/drizzle/**/*.sql',
  );
  expect(config).toHaveProperty(
    'pre-commit.commands.website-migration-lint.glob',
    'libs/website/adapters/store-sqlite/src/**',
  );
});

it('hashes the external lefthook route into the Nx test cache key', async () => {
  const manifest: unknown = await Bun.file(
    new URL('tools/tool-git-hooks/project.json', WORKSPACE),
  ).json();
  // Proof: after warming the real Nx cache, injecting the legacy migration glob in
  // lefthook.yml made `nx test tool-git-hooks` execute again and fail this suite.
  expect(manifest).toHaveProperty(
    'targets.test.inputs',
    expect.arrayContaining(['{workspaceRoot}/lefthook.yml']),
  );
});

describe('down script rules', () => {
  const root = scratchSync('wbs-migration-lint-');
  const dir = join(root, 'apps', 'wbs', 'be-01', 'drizzle');

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function migration(name: string, up: string, down?: string): string {
    const folder = join(dir, name);
    mkdirSync(folder, { recursive: true });
    const upPath = join(folder, 'migration.sql');
    writeFileSync(upPath, up);
    if (down !== undefined) writeFileSync(join(folder, 'down.sql'), down);
    return upPath;
  }

  it('fails a migration with no down.sql', async () => {
    const file = migration('20260101000000_no_down', 'CREATE TABLE t (id text);');
    const issue = await lintMigration(file, root);
    expect(issue?.reason).toMatch(/no down\.sql/);
  });

  it('passes a migration that ships one', async () => {
    const file = migration(
      '20260101000001_with_down',
      'CREATE TABLE t (id text);',
      'DROP TABLE IF EXISTS t;',
    );
    expect(await lintMigration(file, root)).toBeNull();
  });

  // The forward migration must stay additive so blue and green can share one
  // database mid-swap. The down script is destructive by definition, and is
  // the file that quarantines that.
  it('allows DROP TABLE in a down script', async () => {
    migration('20260101000002_drops', 'CREATE TABLE t (id text);', 'DROP TABLE t;');
    const down = join(dir, '20260101000002_drops', 'down.sql');
    expect(await lintMigration(down, root)).toBeNull();
  });

  it('still rejects DROP TABLE in a forward migration', async () => {
    const file = migration('20260101000003_bad', 'DROP TABLE users;', 'SELECT 1;');
    const issue = await lintMigration(file, root);
    expect(issue?.reason).toMatch(/DROP TABLE/);
  });

  // The statement that looks additive and is not. SQLite refuses `ADD COLUMN
  // ... NOT NULL` with no default against a table that already holds rows, and
  // it refuses it on the deploy that runs it rather than here — which is why the
  // lint has to be the thing that says no. Every table in this schema holds rows
  // in dev and prod.
  it('rejects a NOT NULL column added with no default', async () => {
    const file = migration(
      '20260101000010_not_null_add',
      'ALTER TABLE `tag` ADD `created_by` text NOT NULL;',
      'ALTER TABLE `tag` DROP COLUMN `created_by`;',
    );
    const issue = await lintMigration(file, root);
    expect(issue?.reason).toMatch(/NOT NULL/);
  });

  // With a default the statement is genuinely additive: SQLite can fill the rows
  // that are already there. This is the case `add_estimate_weights_and_rounding`
  // ships four of, so a pattern that refused it would fail the tree it is in.
  it('allows a NOT NULL column that carries a default', async () => {
    const file = migration(
      '20260101000011_not_null_default',
      "ALTER TABLE `project` ADD `estimate_rounding` text DEFAULT 'ceil' NOT NULL;",
      'ALTER TABLE `project` DROP COLUMN `estimate_rounding`;',
    );
    expect(await lintMigration(file, root)).toBeNull();
  });

  // And the audit columns this rule was written for: nullable, no default, so a
  // row older than the migration keeps a null author rather than a made-up one.
  it('allows the nullable audit columns', async () => {
    const file = migration(
      '20260101000012_audit_columns',
      'ALTER TABLE `tag` ADD `created_at` integer;--> statement-breakpoint\n' +
        'ALTER TABLE `tag` ADD `created_by` text REFERENCES `users`(`id`);',
      'ALTER TABLE `tag` DROP COLUMN `created_by`;',
    );
    expect(await lintMigration(file, root)).toBeNull();
  });

  it('allows an explicitly guarded same-name compatibility rebuild', async () => {
    const unguarded = migration(
      '20260101000004_unguarded',
      '-- migration-lint: compatible-table-rebuild\nDROP TABLE users;',
      'SELECT 1;',
    );
    expect((await lintMigration(unguarded, root))?.reason).toMatch(/DROP TABLE/);

    const file = migration(
      '20260101000005_rebuild',
      `-- migration-lint: compatible-table-rebuild
       -- foreign-keys-off-rebuild
       CREATE TABLE users_new (id text PRIMARY KEY);
       DROP TABLE users;
       ALTER TABLE users_new RENAME TO users;
       CREATE TEMP TABLE fk_guard (violations integer CHECK (violations = 0));
       INSERT INTO fk_guard SELECT COUNT(*) FROM pragma_foreign_key_check;`,
      'SELECT 1;',
    );
    expect(await lintMigration(file, root)).toBeNull();
  });
});

/**
 * The waiver that lets `20260831120000_rename_role_to_step` carry a
 * `RENAME COLUMN`, and the condition it is waived on.
 *
 * The folders here are built at the real depth —
 * `<root>/apps/wbs/be-01/drizzle/<folder>/migration.sql` — because that is what
 * the lint validates against the workspace root before resolving
 * `bin/assert-no-prod-release.sh`. A shallower fixture would test a path the
 * hook never walks.
 */
describe('the role -> step rename waiver', () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const RENAME = '20260831120000_rename_role_to_step';
  const RENAME_SQL = 'ALTER TABLE `estimate` RENAME COLUMN `role_id` TO `step_id`;';

  /** A checkout-shaped tree, with the gate script present only when asked for. */
  function checkout(
    folder: string,
    up: string,
    opts: { gate: boolean },
  ): { file: string; root: string } {
    const root = scratchSync('wbs-rename-waiver-');
    roots.push(root);
    const migrationDir = join(root, 'apps', 'wbs', 'be-01', 'drizzle', folder);
    mkdirSync(migrationDir, { recursive: true });
    writeFileSync(join(migrationDir, 'migration.sql'), up);
    writeFileSync(join(migrationDir, 'down.sql'), 'SELECT 1;');
    if (opts.gate) {
      mkdirSync(join(root, 'bin'), { recursive: true });
      writeFileSync(join(root, 'bin', 'assert-no-prod-release.sh'), '#!/usr/bin/env bash\n');
    }
    return { file: join(migrationDir, 'migration.sql'), root };
  }

  it('lets the rename migration through while its gate script is in the tree', async () => {
    const { file, root } = checkout(RENAME, RENAME_SQL, { gate: true });
    expect(await lintMigration(file, root)).toBeNull();
  });

  // Proof: the `existsSync(gateScriptPath(...))` requirement removed from
  // `lintMigration`, watched failing here on
  // `Received value must be a string: undefined` — the lint returned no issue
  // at all for a rename migration with no gate script beside it.
  // Observed 2026-08-31.
  it('refuses the rename migration when its gate script is absent', async () => {
    const { file, root } = checkout(RENAME, RENAME_SQL, { gate: false });
    const issue = await lintMigration(file, root);
    expect(issue?.reason).toMatch(/assert-no-prod-release\.sh/);
    expect(issue?.reason).toMatch(/rests on nothing/);
  });

  // The waiver lifts one label and no others. A rename migration that also
  // dropped a table would be a different change with a different argument.
  it('still refuses a DROP TABLE inside the waived migration', async () => {
    const { file, root } = checkout(RENAME, `${RENAME_SQL}\nDROP TABLE role;`, { gate: true });
    const issue = await lintMigration(file, root);
    expect(issue?.reason).toMatch(/DROP TABLE/);
  });

  // Proof that the waiver is keyed on the folder and not on the statement:
  // any other migration writing the same SQL is refused, gate script or not.
  it('refuses the same RENAME COLUMN in any other migration', async () => {
    const { file, root } = checkout('20260901000000_some_other_change', RENAME_SQL, {
      gate: true,
    });
    const issue = await lintMigration(file, root);
    expect(issue?.reason).toMatch(/RENAME COLUMN/);
  });

  it('refuses a workspace root that does not own the migration path', () => {
    const { file } = checkout(RENAME, RENAME_SQL, { gate: true });
    const unrelatedRoot = scratchSync('wbs-unrelated-root-');
    roots.push(unrelatedRoot);

    expect(lintMigration(file, unrelatedRoot)).rejects.toThrow(/workspace root.*migration/);
  });

  it('lints a lab migration under the lab root by the same rules', async () => {
    const root = scratchSync('wbs-lab-migration-');
    roots.push(root);
    const migrationDir = join(root, 'deploy', 'k8s', 'wbs', 'lab', 'migrations', '20260918_lab');
    mkdirSync(migrationDir, { recursive: true });
    const file = join(migrationDir, 'migration.sql');
    writeFileSync(join(migrationDir, 'down.sql'), 'SELECT 1;');
    // Proof: with the lab root absent from MIGRATION_ROOTS this additive lab migration was refused
    // with `does not own migration`, which is how the CI step failed on 2026-09-18.
    writeFileSync(file, 'ALTER TABLE `work_item` ADD `lab_marker` text;');
    expect(await lintMigration(file, root)).toBeNull();
    writeFileSync(file, 'DROP TABLE work_item;');
    expect((await lintMigration(file, root))?.reason).toMatch(/DROP TABLE/);
  });

  it('lints the rollback-fault lab migration under its own root only', async () => {
    const root = scratchSync('wbs-lab-rollback-fault-');
    roots.push(root);
    const lab = join(root, 'deploy', 'k8s', 'wbs', 'lab');
    const allowed = join(lab, 'rollback-fault', 'migrations', '29991231010000_lab_fault');
    const outside = join(lab, 'rollback-fault', 'fixtures', '29991231010000_lab_fault');
    mkdirSync(allowed, { recursive: true });
    mkdirSync(outside, { recursive: true });
    const forward = join(allowed, 'migration.sql');
    writeFileSync(join(allowed, 'down.sql'), 'DROP TABLE lab_rollback_control;');
    writeFileSync(forward, 'CREATE TABLE lab_rollback_control (id integer);');
    // Proof: with this root absent from MIGRATION_ROOTS the CI `Migration lint` step on
    // fb548469e refused the tracked fixture with `does not own migration` (2026-10-11).
    expect(await lintMigration(forward, root)).toBeNull();
    writeFileSync(forward, 'DROP TABLE work_item;');
    expect((await lintMigration(forward, root))?.reason).toMatch(/DROP TABLE/);
    const unrelated = join(outside, 'migration.sql');
    writeFileSync(join(outside, 'down.sql'), 'SELECT 1;');
    writeFileSync(unrelated, 'CREATE TABLE lab_rollback_control (id integer);');
    // Proof: widening this root to deploy/k8s/wbs/lab/rollback-fault accepted the
    // sibling fixtures migration instead of refusing its path.
    let rejection: unknown;
    try {
      await lintMigration(unrelated, root);
    } catch (error) {
      rejection = error;
    }
    expect(String(rejection)).toMatch(/does not own migration/);
  });

  it('lints website migrations only under the SQLite adapter source root', async () => {
    const root = scratchSync('website-migration-lint-');
    roots.push(root);
    const allowed = join(
      root,
      'libs',
      'website',
      'adapters',
      'store-sqlite',
      'src',
      'migrations',
      '002',
    );
    const outside = join(root, 'libs', 'website', 'adapters', 'portability-fixture');
    mkdirSync(allowed, { recursive: true });
    mkdirSync(outside, { recursive: true });
    const forward = join(allowed, 'migration.sql');
    writeFileSync(join(allowed, 'down.sql'), 'DROP TABLE example;');
    writeFileSync(forward, 'CREATE TABLE example (id TEXT);');
    expect(await lintMigration(forward, root)).toBeNull();
    writeFileSync(forward, 'DROP TABLE example;');
    expect((await lintMigration(forward, root))?.reason).toMatch(/DROP TABLE/);
    const unrelated = join(outside, 'migration.sql');
    writeFileSync(unrelated, 'CREATE TABLE example (id TEXT);');
    // Proof: widening the website migration root to libs/website/adapters accepted
    // the injected portability-fixture migration instead of refusing its path.
    let rejection: unknown;
    try {
      await lintMigration(unrelated, root);
    } catch (error) {
      rejection = error;
    }
    expect(String(rejection)).toMatch(/does not own migration/);
  });

  it('refuses a relative workspace root', () => {
    const { file } = checkout(RENAME, RENAME_SQL, { gate: true });

    expect(lintMigration(file, '.')).rejects.toThrow(/workspace root must be an absolute/);
  });
});

describe('the enterprise SSO audit rebuild', () => {
  // The real forward script, linted where it lives: its single DROP TABLE is
  // admitted only because the rebuild ships the foreign-key guard.
  // Proof: replacing `CHECK (violations = 0)` in that script with `CHECK (1)` made this report
  // `contains destructive statement: DROP TABLE`; watched 2026-10-12.
  it('accepts the enterprise SSO audit rebuild', async () => {
    const root = new URL('.', WORKSPACE).pathname.replace(/\/$/, '');
    const file = join(
      root,
      'apps/wbs/be-01/drizzle/20261012090200_widen_organization_audit/migration.sql',
    );
    expect(await lintMigration(file, root)).toBeNull();
  });
});

describe('the organization limits audit rebuild', () => {
  // Proof: replacing `CHECK (violations = 0)` in that script with `CHECK (1)` made this report
  // `contains destructive statement: DROP TABLE`; watched 2026-10-22.
  it('accepts the organization limits audit rebuild', async () => {
    const root = new URL('.', WORKSPACE).pathname.replace(/\/$/, '');
    const file = join(
      root,
      'apps/wbs/be-01/drizzle/20261022130100_widen_organization_audit_organization_limits/migration.sql',
    );
    expect(await lintMigration(file, root)).toBeNull();
  });
});

describe('the machine credential audit rebuild', () => {
  // Proof: replacing `CHECK (violations = 0)` in that script with `CHECK (1)` made this report
  // `contains destructive statement: DROP TABLE`; watched 2026-10-22.
  it('accepts the machine credential audit rebuild', async () => {
    const root = new URL('.', WORKSPACE).pathname.replace(/\/$/, '');
    const file = join(
      root,
      'apps/wbs/be-01/drizzle/20261022110000_widen_organization_audit_machine_credentials/migration.sql',
    );
    expect(await lintMigration(file, root)).toBeNull();
  });
});

describe('the compute provider audit rebuild', () => {
  // Proof: replacing `CHECK (violations = 0)` in that script with `CHECK (1)` made this report
  // `contains destructive statement: DROP TABLE`; watched 2026-10-22.
  it('accepts the compute provider audit rebuild', async () => {
    const root = new URL('.', WORKSPACE).pathname.replace(/\/$/, '');
    const file = join(
      root,
      'apps/wbs/be-01/drizzle/20261022140100_widen_organization_audit_compute_providers/migration.sql',
    );
    expect(await lintMigration(file, root)).toBeNull();
  });
});

describe('the directory capacity audit rebuild', () => {
  // Proof: replacing `CHECK (violations = 0)` in that script with `CHECK (1)` made this report
  // `contains destructive statement: DROP TABLE`; watched 2026-10-25.
  it('accepts the directory capacity audit rebuild', async () => {
    const root = new URL('.', WORKSPACE).pathname.replace(/\/$/, '');
    const file = join(
      root,
      'apps/wbs/be-01/drizzle/20261101100000_widen_organization_audit_directory_capacity/migration.sql',
    );
    expect(await lintMigration(file, root)).toBeNull();
  });
});

describe('the access audit rebuild', () => {
  it('accepts the guarded current-vocabulary access audit rebuild', async () => {
    const root = new URL('.', WORKSPACE).pathname.replace(/\/$/, '');
    const file = join(
      root,
      'apps/wbs/be-01/drizzle/20261102130000_widen_organization_audit_access/migration.sql',
    );
    expect(await lintMigration(file, root)).toBeNull();
  });
});

describe('work-package window full SQL shapes', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  const cases = [
    ['20261110100000_rename_project_to_work_package', 'rename-project-to-work-package', 1],
    ['20261110110000_add_project', 'add-project', 1],
    ['20261110120000_add_setting_value', 'add-setting-value', 2],
    ['20261110120100_space_holds_projects_people_teams', 'space-holds-projects-people-teams', 2],
  ] as const;
  function readShape(file: string): string {
    return readFileSync(
      new URL('./fixtures/window-migrations/' + file + '.sql', import.meta.url),
      'utf8',
    );
  }
  function checkout(folder: string, sql: string, gate: boolean) {
    const root = scratchSync('wbs-window-full-shape-');
    roots.push(root);
    const migration = join(root, 'apps/wbs/be-01/drizzle', folder);
    mkdirSync(migration, { recursive: true });
    const file = join(migration, 'migration.sql');
    writeFileSync(file, sql);
    writeFileSync(
      join(migration, 'down.sql'),
      'CREATE TEMP TABLE window_restore_required (violations INTEGER CHECK (violations = 0)); INSERT INTO window_restore_required VALUES (1);',
    );
    if (gate) {
      mkdirSync(join(root, 'bin'));
      writeFileSync(
        join(root, 'bin/assert-rename-window.ts'),
        '#!/usr/bin/env bun\nthrow new Error("presence fixture only");\n',
      );
    }
    return { root, file };
  }
  it('pins complete historical 110-ledger schema provenance and every full SQL footprint', () => {
    const inventory = JSON.parse(
      readFileSync(new URL('./fixtures/window-migrations/inventory.json', import.meta.url), 'utf8'),
    ) as {
      sourceCommit: string;
      ledger: { name: string; hash: string }[];
      counts: {
        tables: number;
        columns: number;
        exactProjectIdColumns: number;
        indexes: number;
        triggers: number;
        views: number;
        triggerBodies: number;
      };
      fixtures: { folder: string; file: string; sha256: string }[];
      tables: string[];
      columns: { tableName: string; columnName: string }[];
      indexes: string[];
      triggers: string[];
      views: string[];
    };
    expect(inventory.sourceCommit).toBe('b0d2df4eb608827a4933f0840b05300e06158d8a');
    expect(inventory.ledger).toHaveLength(110);
    expect(inventory.ledger.at(-1)?.name).toBe('20261103110000_add_initial_access_offers');
    expect(inventory.counts).toEqual({
      tables: 13,
      columns: 28,
      exactProjectIdColumns: 26,
      indexes: 23,
      triggers: 13,
      views: 1,
      triggerBodies: 25,
    });
    for (const identity of inventory.ledger) {
      const bytes = readFileSync(
        new URL('apps/wbs/be-01/drizzle/' + identity.name + '/migration.sql', WORKSPACE),
      );
      expect(createHash('sha256').update(bytes).digest('hex'), identity.name).toBe(identity.hash);
    }
    for (const fixture of inventory.fixtures)
      expect(createHash('sha256').update(readShape(fixture.file)).digest('hex'), fixture.file).toBe(
        fixture.sha256,
      );
    const rename = readShape('rename-project-to-work-package');
    expect([...rename.matchAll(/ALTER TABLE\s+\S+\s+RENAME COLUMN/g)]).toHaveLength(28);
    const quote = (name: string) => String.fromCharCode(96) + name + String.fromCharCode(96);
    for (const table of inventory.tables)
      expect(rename).toContain(
        'ALTER TABLE ' +
          quote(table) +
          ' RENAME TO ' +
          quote(table.replaceAll('project', 'work_package')),
      );
    for (const index of inventory.indexes) expect(rename).toContain('DROP INDEX ' + quote(index));
    for (const trigger of inventory.triggers)
      expect(rename).toContain('DROP TRIGGER ' + quote(trigger));
    expect(rename).toContain('DROP VIEW ' + quote('project_abbreviation_candidate'));
    expect(rename).toContain('CREATE VIEW work_package_abbreviation_candidate');
    for (const [, file, drops] of cases)
      expect([...readShape(file).matchAll(/DROP TABLE/g)], file).toHaveLength(drops);
  });
  for (const [folder, name] of cases) {
    it('admits the complete ' + folder + ' shape only with its exact waiver and gate', async () => {
      const fixture = checkout(folder, readShape(name), true);
      expect(await lintMigration(fixture.file, fixture.root)).toBeNull();
    });
    it('refuses complete ' + folder + ' shape when its Bun gate is absent', async () => {
      const fixture = checkout(folder, readShape(name), false);
      expect((await lintMigration(fixture.file, fixture.root))?.reason).toContain(
        'assert-rename-window.ts',
      );
    });
    it('refuses the complete ' + folder + ' shape under an unwaived folder name', async () => {
      const fixture = checkout(folder + '-not-waived', readShape(name), true);
      expect((await lintMigration(fixture.file, fixture.root))?.reason).toMatch(
        /DROP TABLE|RENAME COLUMN/,
      );
    });
    it('keeps unrelated forbidden statements closed inside ' + folder, async () => {
      const fixture = checkout(
        folder,
        readShape(name) + '\nTRUNCATE TABLE directory_control;',
        true,
      );
      expect((await lintMigration(fixture.file, fixture.root))?.reason).toContain('TRUNCATE');
    });
  }
  for (const [folder, name, drops] of cases.filter(([, , drops]) => drops === 2)) {
    it(
      'refuses full two-drop ' + folder + ' shape pretending to be a compatible rebuild',
      async () => {
        expect(drops).toBe(2);
        const fixture = checkout(
          folder + '-not-waived',
          '-- migration-lint: compatible-table-rebuild\n' + readShape(name),
          true,
        );
        expect((await lintMigration(fixture.file, fixture.root))?.reason).toContain('DROP TABLE');
      },
    );
  }
  it('keeps complete audit CHECK widening unwaived in compatible rebuild form', async () => {
    const fixture = checkout(
      '20261110110100_widen_organization_audit_projects',
      readShape('widen-organization-audit-projects'),
      false,
    );
    expect(await lintMigration(fixture.file, fixture.root)).toBeNull();
  });
});
