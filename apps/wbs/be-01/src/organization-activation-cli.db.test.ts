import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { OWNED_ROOT_KINDS } from '@wbs/store-sqlite/organization-ownership';
import { afterEach, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';

import { TEST_MACHINE_GRANT_ENV } from './testing/machine-grant-fixture';
import { writeMcpStoreFixture } from './testing/mcp-store-fixture';

setDefaultTimeout(30_000);

const cli = new URL('./organization-activation-cli.ts', import.meta.url).pathname;
const migrations = new URL('../drizzle', import.meta.url).pathname;

/** be-01's machine grant settings, which activation requires beside it (exit 8 without). */
const GRANT_SETTINGS: Record<string, string> = { ...TEST_MACHINE_GRANT_ENV };

let directory: string;
let path: string;
/** An mcp-01 store whose credential epoch has advanced, as activation requires. */
let mcpStore: string;

/** Three users, Dany with a legacy Auth0 pair, and roots of every kind with their links. */
const FIXTURE = [
  "INSERT INTO users (id, username, idp_issuer, idp_sub, created_at) VALUES ('u-dany', 'dany', 'https://auth0.test/', 'auth0|dany', 1)",
  "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u-ada', 'ada', 'x', 1)",
  "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u-grace', 'grace', 'x', 1)",
  "INSERT INTO project (id, name, owner_id, created_at) VALUES ('p-1', 'Launch', 'u-dany', 1)",
  "INSERT INTO project (id, name, owner_id, created_at, solution_slug, solution_url) VALUES ('p-2', 'Billing', 'u-ada', 1, 'billing', 'https://solutions.test/billing')",
  "INSERT INTO project (id, name, owner_id, created_at) VALUES ('p-3', 'Hiring', 'u-grace', 1)",
  "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-1', 'p-1', NULL, 0, 'Root')",
  "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-2', 'p-1', 'w-1', 0, 'Child')",
  "INSERT INTO step (id, project_id, name, position) VALUES ('st-1', 'p-1', 'Build', 0)",
  "INSERT INTO person (id, name) VALUES ('pe-1', 'Ada Lovelace')",
  "INSERT INTO person (id, name) VALUES ('pe-2', 'Grace Hopper')",
  "INSERT INTO service_team (id, name) VALUES ('tm-1', 'Platform')",
  "INSERT INTO service_team (id, name) VALUES ('tm-2', 'Payments')",
  "INSERT INTO service (id, name) VALUES ('sv-1', 'Ledger')",
  "INSERT INTO tag (id, name) VALUES ('tg-1', 'urgent')",
  "INSERT INTO work_item_type (id, name) VALUES ('ty-1', 'Spike')",
  "INSERT INTO external_system (id, name) VALUES ('es-1', 'Jira')",
  "INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES ('d-1', 'p-1', 'w-1', 'w-2')",
  "INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w-1', 'tg-1')",
  "INSERT INTO work_item_team (work_item_id, team_id) VALUES ('w-1', 'tm-1')",
  "INSERT INTO work_item_external_ref (id, work_item_id, system_id, url, name, position) VALUES ('x-1', 'w-1', 'es-1', 'https://jira.test/X-1', 'X-1', 0)",
  "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('w-1', 'st-1', 'pe-1')",
  "INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-1', 'tm-1')",
  "INSERT INTO team_service (team_id, service_id) VALUES ('tm-1', 'sv-1')",
  "INSERT INTO project_team_capacity (project_id, service_team_id, size) VALUES ('p-1', 'tm-1', 2)",
  "INSERT INTO event_sequencer (subscription, next_seq) VALUES ('project:p-1', 1)",
  "INSERT INTO event_log (subscription, seq, message, created_at) VALUES ('project:p-1', 0, '{}', 1)",
  `INSERT INTO saved_plan (id, project_id, name, created_by, created_at, input_schema_version, input_bytes, input_sha256, schedule_absent_reason)
   VALUES ('sp-1', 'p-1', 'Baseline', 'u-dany', 1, 1, 0, 'x', 'not-scheduled')`,
  `INSERT INTO saved_plan (id, project_id, name, created_by, created_at, input_schema_version, input_bytes, input_sha256, schedule_absent_reason)
   VALUES ('sp-2', 'p-2', 'Baseline', 'u-ada', 1, 1, 0, 'x', 'not-scheduled')`,
];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'organization-activation-cli-'));
  path = join(directory, 'plan.db');
  runMigrations(path, migrations);
  sqlite(FIXTURE);
  mcpStore = join(directory, 'mcp-session.sqlite');
  writeMcpStoreFixture(mcpStore, 1);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function sqlite(statements: readonly string[]): void {
  const db = openDatabase(path);
  try {
    for (const statement of statements) db.run(statement);
  } finally {
    db.close();
  }
}

function rows(query: string): unknown[] {
  const db = openDatabase(path);
  try {
    return db.query(query).all();
  } finally {
    db.close();
  }
}

function count(table: string): number {
  const found = (rows(`SELECT COUNT(*) AS n FROM ${table}`) as { n: number }[]).at(0);
  if (found === undefined) throw new Error(`no count for ${table}`);
  return found.n;
}

/**
 * Runs the CLI with `DB_PATH` set to `dbPath`, or unset when it is null, and `--mcp-store`
 * naming the advanced fixture unless `args` names one or `isWithoutMcpStore`.
 */
function run(
  args: readonly string[],
  dbPath: string | null = path,
  isWithoutMcpStore = false,
  grantSettings: Record<string, string> = GRANT_SETTINGS,
) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key !== 'DB_PATH' && !Object.hasOwn(GRANT_SETTINGS, key),
    ),
  );
  const store = isWithoutMcpStore || args.includes('--mcp-store') ? [] : ['--mcp-store', mcpStore];
  const spawned = Bun.spawnSync([process.execPath, cli, ...store, ...args], {
    // FORCE_COLOR as Nx sets it in the gate, so terminal styling on either stream fails here.
    env:
      dbPath === null
        ? { ...inherited, ...grantSettings, FORCE_COLOR: '1' }
        : { ...inherited, ...grantSettings, FORCE_COLOR: '1', DB_PATH: dbPath },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: spawned.exitCode,
    stdout: spawned.stdout.toString(),
    stderr: spawned.stderr.toString(),
  };
}

/**
 * The refusal JSON a CLI run wrote: stderr must be exactly one JSON line, so anything else an
 * environment adds (escapes, logger lines, warnings) fails here, named, instead of being parsed.
 */
function refusalOf(stderr: string): unknown {
  const lines = stderr.split('\n').filter((line) => line !== '');
  expect(lines).toHaveLength(1);
  const line = lines.at(0) ?? '';
  expect(line).toMatch(/^\{.*\}$/);
  return JSON.parse(line);
}

const APPLY = ['--name', 'default', '--super-admin', 'dany', '--apply'];

/** Everything activation may write, so a refusal can be shown to have written none of it. */
function writable(): Record<string, unknown> {
  return {
    organizations: rows('SELECT * FROM organization'),
    memberships: rows('SELECT * FROM organization_membership'),
    identities: rows('SELECT * FROM external_identity'),
    solutions: rows('SELECT * FROM project_solution'),
    legacySolutions: rows('SELECT id, solution_slug, solution_url FROM project ORDER BY id'),
    marker: rows('SELECT * FROM organization_activation'),
    mappings: OWNED_ROOT_KINDS.map((kind) => count(`${kind}_organization`)),
  };
}

const PRE_ACTIVATION = [{ singleton: 1, state: 'pre_activation', activated_at: null }];

describe('organization-activation-cli', () => {
  it('rehearses without --apply, printing the plan and writing nothing', () => {
    const before = writable();
    const bytes = readFileSync(path);

    const rehearsed = run(['--name', 'default', '--super-admin', 'dany']);

    expect(rehearsed.stderr).toBe('');
    expect(rehearsed.exitCode).toBe(0);
    const plan = JSON.parse(rehearsed.stdout) as Record<string, unknown>;
    expect(Object.keys(plan).toSorted()).toEqual([
      'activatedAt',
      'externalIdentities',
      'mappedRoots',
      'members',
      'mode',
      'organization',
      'prunedStreams',
      'solutionLinks',
      'superAdmin',
    ]);
    expect(plan).toMatchObject({
      mode: 'dry_run',
      organization: { name: 'default' },
      superAdmin: { id: 'u-dany', username: 'dany' },
      activatedAt: null,
    });
    expect(plan['members']).toEqual([
      { id: 'u-ada', username: 'ada', role: 'member' },
      { id: 'u-dany', username: 'dany', role: 'super_admin' },
      { id: 'u-grace', username: 'grace', role: 'member' },
    ]);
    expect(plan['externalIdentities']).toEqual([
      { userId: 'u-dany', issuer: 'https://auth0.test/', subject: 'auth0|dany' },
    ]);
    expect(plan['solutionLinks']).toEqual([
      { projectId: 'p-2', slug: 'billing', url: 'https://solutions.test/billing' },
    ]);
    expect(plan['prunedStreams']).toEqual([]);
    expect(plan['mappedRoots']).toEqual(
      Object.fromEntries(OWNED_ROOT_KINDS.map((kind) => [kind, count(kind)])),
    );
    expect(writable()).toEqual(before);
    expect(before['marker']).toEqual(PRE_ACTIVATION);
    expect(readFileSync(path)).toEqual(bytes);
  });

  it('applies: one legacy organization, roles, every mapping, moved pairs and the marker', () => {
    const applied = run(APPLY);

    expect(applied.stderr).toBe('');
    expect(applied.exitCode).toBe(0);
    const report = JSON.parse(applied.stdout) as {
      organization: { id: string };
      activatedAt: number;
    };
    expect(report).toMatchObject({ mode: 'applied', prunedStreams: [] });
    const id = report.organization.id;
    expect(rows('SELECT id, name, legacy FROM organization')).toEqual([
      { id, name: 'default', legacy: 1 },
    ]);
    expect(
      rows('SELECT organization_id, user_id, role FROM organization_membership ORDER BY user_id'),
    ).toEqual([
      { organization_id: id, user_id: 'u-ada', role: 'member' },
      { organization_id: id, user_id: 'u-dany', role: 'super_admin' },
      { organization_id: id, user_id: 'u-grace', role: 'member' },
    ]);
    for (const kind of OWNED_ROOT_KINDS) {
      expect(count(`${kind}_organization`)).toBe(count(kind));
      expect(count(`${kind}_organization WHERE organization_id != '${id}'`)).toBe(0);
    }
    expect(rows('SELECT project_id, organization_id, slug, url FROM project_solution')).toEqual([
      {
        project_id: 'p-2',
        organization_id: id,
        slug: 'billing',
        url: 'https://solutions.test/billing',
      },
    ]);
    expect(count('project WHERE solution_slug IS NOT NULL OR solution_url IS NOT NULL')).toBe(0);
    expect(rows('SELECT user_id, issuer, subject FROM external_identity')).toEqual([
      { user_id: 'u-dany', issuer: 'https://auth0.test/', subject: 'auth0|dany' },
    ]);
    expect(rows('SELECT * FROM organization_activation')).toEqual([
      { singleton: 1, state: 'activated', activated_at: report.activatedAt },
    ]);
  });

  it('refuses a second apply before touching the store', () => {
    expect(run(APPLY).exitCode).toBe(0);
    const after = writable();

    const second = run(APPLY);

    // Proof: 2026-10-20, with the marker check in `activateLegacyOrganization` removed this
    // answered exit 4 `organization_exists` instead.
    expect(second.exitCode).toBe(3);
    expect(refusalOf(second.stderr)).toEqual({ refusal: 'already_activated' });
    expect(second.stdout).toBe('');
    expect(writable()).toEqual(after);
  });

  it('refuses an activated marker even when no organization exists', () => {
    sqlite([
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    ]);
    const before = writable();

    const refused = run(APPLY);

    expect(refused.exitCode).toBe(3);
    expect(refusalOf(refused.stderr)).toEqual({ refusal: 'already_activated' });
    expect(writable()).toEqual(before);
  });

  it('throws on a malformed marker instead of treating it as pre-activation', () => {
    sqlite(['DELETE FROM organization_activation']);

    const refused = run(APPLY);

    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('organization activation marker is malformed');
    expect(count('organization')).toBe(0);
  });

  it('refuses when an organization already exists', () => {
    sqlite(["INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)"]);
    const before = writable();

    const refused = run(APPLY);

    expect(refused.exitCode).toBe(4);
    expect(refusalOf(refused.stderr)).toEqual({
      refusal: 'organization_exists',
      organizations: 1,
    });
    expect(writable()).toEqual(before);
  });

  it('refuses a super-admin that names no user or two users', () => {
    const before = writable();
    const unknown = run(['--name', 'default', '--super-admin', 'dan', '--apply']);
    expect(unknown.exitCode).toBe(5);
    expect(refusalOf(unknown.stderr)).toEqual({
      refusal: 'super_admin_unresolved',
      candidates: [],
    });

    // A username equal to another account's id: the argument names both.
    sqlite(["INSERT INTO users (id, username, created_at) VALUES ('u-impostor', 'u-dany', 1)"]);
    const ambiguous = run(['--name', 'default', '--super-admin', 'u-dany', '--apply']);

    expect(ambiguous.exitCode).toBe(5);
    expect(refusalOf(ambiguous.stderr)).toMatchObject({ refusal: 'super_admin_unresolved' });
    expect((refusalOf(ambiguous.stderr) as { candidates: string[] }).candidates.toSorted()).toEqual(
      ['u-dany', 'u-impostor'],
    );
    expect(writable()).toEqual({ ...before });
  });

  it('refuses and rolls back over a root planted after the backfill', () => {
    // A rebuilt `tag` table loses its bridge trigger; the planted trigger then
    // writes a tag after the ownership backfill, inside the activation itself.
    sqlite([
      'DROP TRIGGER tag_organization_bridge',
      `CREATE TRIGGER plant_orphan AFTER INSERT ON organization_membership WHEN NEW.role = 'super_admin'
       BEGIN INSERT INTO tag (id, name) VALUES ('orphan', 'orphan'); END`,
    ]);
    const before = writable();

    const refused = run(APPLY);

    // Proof: 2026-10-20, with the reconciliation check in `activateLegacyOrganization` removed
    // this exited 0 and committed the marker with the `orphan` tag unmapped.
    expect(refused.exitCode).toBe(6);
    expect(refusalOf(refused.stderr)).toEqual({
      refusal: 'reconciliation_failed',
      unmappedRoots: [{ kind: 'tag', id: 'orphan' }],
      catalogNameDrift: [],
      ownershipConflicts: [],
    });
    expect(writable()).toEqual(before);
    expect(count("tag WHERE id = 'orphan'")).toBe(0);
  });

  it('refuses an event stream that resolves to no project', () => {
    sqlite(["INSERT INTO event_sequencer (subscription, next_seq) VALUES ('project:gone', 1)"]);
    const before = writable();

    const refused = run(APPLY);

    expect(refused.exitCode).toBe(6);
    expect(refusalOf(refused.stderr)).toMatchObject({
      refusal: 'reconciliation_failed',
      unmappedRoots: [],
      ownershipConflicts: [{ kind: 'event_stream', id: 'project:gone' }],
    });
    expect(writable()).toEqual(before);
  });

  it('throws on a half legacy solution pair, writing nothing', () => {
    sqlite(["UPDATE project SET solution_url = 'https://solutions.test/x' WHERE id = 'p-3'"]);
    const before = writable();

    const refused = run(APPLY);

    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('NOT NULL');
    expect(writable()).toEqual(before);
  });

  it("prunes a deleted project's retained stream only with --apply", () => {
    sqlite([
      "INSERT INTO event_sequencer (subscription, next_seq) VALUES ('project:gone', 1)",
      "INSERT INTO event_log (subscription, seq, message, created_at) VALUES ('project:gone', 0, '{}', 1)",
    ]);
    const before = writable();
    const rehearsed = run(['--name', 'default', '--super-admin', 'dany']);
    expect(rehearsed.exitCode).toBe(6);
    expect(refusalOf(rehearsed.stderr)).toMatchObject({
      ownershipConflicts: [{ kind: 'event_stream', id: 'project:gone' }],
    });

    const refused = run(['--name', 'default', '--super-admin', 'dany', '--prune-retained-streams']);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('usage');
    expect(writable()).toEqual(before);

    const applied = run([...APPLY, '--prune-retained-streams']);
    expect(applied.stderr).toBe('');
    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({ prunedStreams: ['project:gone'] });
    expect(rows('SELECT subscription FROM event_sequencer ORDER BY subscription')).toEqual([
      { subscription: 'project:p-1' },
    ]);
    expect(rows('SELECT DISTINCT subscription FROM event_log')).toEqual([
      { subscription: 'project:p-1' },
    ]);
  });

  it('refuses without --mcp-store before opening the database', () => {
    const before = writable();

    const refused = run(APPLY, path, true);

    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('--mcp-store');
    expect(writable()).toEqual(before);
  });

  for (const [label, args, dbPath] of [
    ['no DB_PATH', APPLY, null],
    ['an empty --mcp-store', ['--mcp-store', '', ...APPLY], undefined],
    ['an empty DB_PATH', APPLY, ''],
    ['no --name', ['--super-admin', 'dany'], undefined],
    ['a blank --name', ['--name', ' ', '--super-admin', 'dany'], undefined],
    ['no --super-admin', ['--name', 'default'], undefined],
    ['a positional argument', [...APPLY, 'extra'], undefined],
    ['an unknown flag', [...APPLY, '--undo'], undefined],
    [
      'pruning without --apply',
      ['--name', 'default', '--super-admin', 'dany', '--prune-retained-streams'],
      undefined,
    ],
  ] as const) {
    it(`refuses ${label} before opening the database`, () => {
      const before = writable();

      const refused = dbPath === undefined ? run(args) : run(args, dbPath);

      expect(refused.exitCode).toBe(1);
      expect(refused.stdout).toBe('');
      expect(writable()).toEqual(before);
    });
  }

  it('refuses activation while the MCP epoch is 0, writing nothing', () => {
    const before = writable();
    const pending = join(directory, 'pending-mcp.sqlite');
    writeMcpStoreFixture(pending, 0);

    const refused = run(['--mcp-store', pending, ...APPLY]);

    expect(refused.exitCode).toBe(7);
    expect(refused.stdout).toBe('');
    expect(refusalOf(refused.stderr)).toEqual({
      refusal: 'mcp_epoch_not_advanced',
      path: pending,
      reason: 'epoch_0',
    });
    expect(writable()).toEqual(before);
    expect(rows('SELECT * FROM organization_activation')).toEqual(PRE_ACTIVATION);
  });

  it('refuses activation without the machine grant settings, naming them, writing nothing', () => {
    const before = writable();
    const refused = run(APPLY, path, false, {
      WBS_MCP_AUTHORIZATION_SERVER: GRANT_SETTINGS['WBS_MCP_AUTHORIZATION_SERVER'] ?? '',
    });
    expect(refused.exitCode).toBe(8);
    expect(refused.stdout).toBe('');
    expect(refusalOf(refused.stderr)).toEqual({
      refusal: 'machine_grant_settings_missing',
      missing: ['MCP_BE_INTERNAL_SECRET', 'WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT'],
    });
    expect(writable()).toEqual(before);
    expect(rows('SELECT * FROM organization_activation')).toEqual(PRE_ACTIVATION);
  });

  it('refuses activation with a weak grant key or secret, naming it', () => {
    for (const [name, message] of [
      ['WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT', 'WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT must hold'],
      ['MCP_BE_INTERNAL_SECRET', 'MCP_BE_INTERNAL_SECRET must hold'],
    ] as const) {
      const refused = run(APPLY, path, false, { ...GRANT_SETTINGS, [name]: 'g'.repeat(32) });
      expect(refused.exitCode).toBe(8);
      expect(refusalOf(refused.stderr)).toEqual({
        refusal: 'machine_grant_settings_invalid',
        invalid: [expect.stringContaining(message)],
      });
    }
    expect(rows('SELECT * FROM organization_activation')).toEqual(PRE_ACTIVATION);
  });

  it('rehearses without the machine grant settings, then reports the refusal', () => {
    const rehearsed = run(['--name', 'default', '--super-admin', 'dany'], path, false, {});
    expect(rehearsed.exitCode).toBe(8);
    expect(JSON.parse(rehearsed.stdout)).toMatchObject({ mode: 'dry_run', activatedAt: null });
    expect(refusalOf(rehearsed.stderr)).toMatchObject({
      refusal: 'machine_grant_settings_missing',
    });
  });

  it('rehearses while the MCP epoch is 0, then reports the refusal', () => {
    const before = writable();
    const pending = join(directory, 'pending-mcp.sqlite');
    writeMcpStoreFixture(pending, 0);

    const rehearsed = run(['--mcp-store', pending, '--name', 'default', '--super-admin', 'dany']);

    expect(rehearsed.exitCode).toBe(7);
    expect(JSON.parse(rehearsed.stdout)).toMatchObject({ mode: 'dry_run', activatedAt: null });
    expect(refusalOf(rehearsed.stderr)).toMatchObject({ reason: 'epoch_0' });
    expect(writable()).toEqual(before);
  });

  it('refuses an absent MCP store, writing nothing', () => {
    const before = writable();
    const absent = join(directory, 'absent-mcp.sqlite');

    const refused = run(['--mcp-store', absent, ...APPLY]);

    expect(refused.exitCode).toBe(7);
    expect(refusalOf(refused.stderr)).toEqual({
      refusal: 'mcp_epoch_not_advanced',
      path: absent,
      reason: 'absent',
    });
    expect(existsSync(absent)).toBe(false);
    expect(writable()).toEqual(before);
  });

  it('refuses an MCP store without the epoch migration', () => {
    const before = writable();
    const baseline = join(directory, 'baseline-mcp.sqlite');
    const db = openDatabase(baseline);
    db.run('CREATE TABLE mcp_family (family_id TEXT PRIMARY KEY)');
    db.close();

    const refused = run(['--mcp-store', baseline, ...APPLY]);

    expect(refused.exitCode).toBe(7);
    expect(refusalOf(refused.stderr)).toMatchObject({ reason: 'unmigrated' });
    expect(writable()).toEqual(before);
  });

  it('throws on a malformed MCP epoch, writing nothing', () => {
    const before = writable();
    const malformed = join(directory, 'malformed-mcp.sqlite');
    writeMcpStoreFixture(malformed, 'one');

    const refused = run(['--mcp-store', malformed, ...APPLY]);

    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('MCP credential epoch');
    expect(writable()).toEqual(before);
  });

  it('refuses a missing database file without creating it', () => {
    const missing = join(directory, 'missing.db');

    const refused = run(APPLY, missing);

    expect(refused.exitCode).toBe(1);
    expect(existsSync(missing)).toBe(false);
  });
});
