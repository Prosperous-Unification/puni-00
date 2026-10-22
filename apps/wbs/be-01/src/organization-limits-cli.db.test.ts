import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';

setDefaultTimeout(30_000);

const cli = new URL('./organization-limits-cli.ts', import.meta.url).pathname;
const migrations = new URL('../drizzle', import.meta.url).pathname;
const DEFAULTS = {
  ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: '50',
  ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: '200',
  ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: '10000',
};

let directory: string;
let path: string;

/** An activated store with organizations A and B, A holding 12 agents and a human. */
const FIXTURE = [
  "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u-ada', 'ada', 'x', 1)",
  "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)",
  "INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)",
  "INSERT INTO person (id, name, kind) VALUES ('human', 'Ada', 'person')",
  "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('human', 'org-a', 'Ada')",
  ...Array.from({ length: 12 }, (_, n) => [
    `INSERT INTO person (id, name, kind) VALUES ('bot-${String(n)}', 'Bot ${String(n)}', 'agent')`,
    `INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('bot-${String(n)}', 'org-a', 'Bot ${String(n)}')`,
  ]).flat(),
  "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'organization-limits-cli-'));
  path = join(directory, 'plan.db');
  runMigrations(path, migrations);
  sqlite(FIXTURE);
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

function rows<T>(query: string): T[] {
  const db = openDatabase(path);
  try {
    return db.query<T, []>(query).all();
  } finally {
    db.close();
  }
}

const limitsRows = () =>
  rows<{
    organization_id: string;
    max_agent_persons: number;
    max_concurrent_claims: number;
    max_capacity_units_per_resource: number;
  }>(
    'SELECT organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource FROM organization_limits ORDER BY organization_id',
  );

const auditRows = () =>
  rows<{
    actor_id: string;
    action: string;
    subject_kind: string;
    subject_id: string;
    detail: string;
  }>(
    'SELECT actor_id, action, subject_kind, subject_id, detail FROM organization_audit ORDER BY created_at, id',
  ).map((row) => ({ ...row, detail: JSON.parse(row.detail) as unknown }));

/** Runs the CLI with the defaults set, FORCE_COLOR as Nx sets it in the gate. */
function run(args: readonly string[], env: Record<string, string | undefined> = {}) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key !== 'DB_PATH' && !key.startsWith('ORGANIZATION_DEFAULT_'),
    ),
  );
  const merged: Record<string, string | undefined> = {
    ...inherited,
    FORCE_COLOR: '1',
    DB_PATH: path,
    ...DEFAULTS,
    ...env,
  };
  // `--no-env-file`: a checkout's `.env` would otherwise supply DB_PATH and the defaults.
  const spawned = Bun.spawnSync([process.execPath, '--no-env-file', cli, ...args], {
    // An `undefined` in `env` unsets that variable.
    env: Object.fromEntries(
      Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: spawned.exitCode,
    stdout: spawned.stdout.toString(),
    stderr: spawned.stderr.toString(),
  };
}

/** The refusal a run wrote: stderr must be exactly one JSON line and stdout empty. */
function refusalOf(outcome: ReturnType<typeof run>): unknown {
  expect(outcome.stdout).toBe('');
  const lines = outcome.stderr.split('\n').filter((line) => line !== '');
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? '');
}

const operator = `operator:${userInfo().username}`;

describe('organization-limits-cli show', () => {
  it('prints the defaults with their source and usage beside each cap', () => {
    const shown = run(['show', '--organization', 'org-a']);
    expect(shown.exitCode).toBe(0);
    expect(JSON.parse(shown.stdout)).toEqual({
      command: 'show',
      organizationId: 'org-a',
      source: 'default',
      limits: { maxAgentPersons: 50, maxConcurrentClaims: 200, maxCapacityUnitsPerResource: 10000 },
      caps: [
        { name: 'maxAgentPersons', cap: 50, usage: 12 },
        { name: 'maxConcurrentClaims', cap: 200, usage: 0 },
        { name: 'maxCapacityUnitsPerResource', cap: 10000, usage: [] },
      ],
      warnings: [],
    });
    expect(shown.stderr).toBe('');
  });

  it("prints the organization's own row once one exists", () => {
    sqlite([
      "INSERT INTO organization_limits (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at) VALUES ('org-a', 20, 40, 64, 1)",
    ]);
    const shown = JSON.parse(run(['show', '--organization=org-a']).stdout) as { source: string };
    expect(shown.source).toBe('organization');
  });
});

describe('organization-limits-cli set', () => {
  it('writes a complete row from the defaults, audited before and after', () => {
    const applied = run([
      'set',
      '--organization',
      'org-a',
      '--max-concurrent-claims',
      '40',
      '--apply',
    ]);
    expect(applied.exitCode).toBe(0);
    expect(limitsRows()).toEqual([
      {
        organization_id: 'org-a',
        max_agent_persons: 50,
        max_concurrent_claims: 40,
        max_capacity_units_per_resource: 10000,
      },
    ]);
    const printed = JSON.parse(applied.stdout) as Record<string, unknown>;
    expect(printed).toMatchObject({
      command: 'set',
      mode: 'applied',
      change: 'set',
      before: { source: 'default' },
      after: {
        source: 'organization',
        limits: {
          maxAgentPersons: 50,
          maxConcurrentClaims: 40,
          maxCapacityUnitsPerResource: 10000,
        },
      },
      caps: [
        { name: 'maxAgentPersons', cap: 50, usage: 12 },
        { name: 'maxConcurrentClaims', cap: 40, usage: 0 },
        { name: 'maxCapacityUnitsPerResource', cap: 10000, usage: [] },
      ],
    });
    expect(auditRows()).toEqual([
      {
        actor_id: operator,
        action: 'organization_limits_changed',
        subject_kind: 'organization_limits',
        subject_id: 'org-a',
        detail: {
          beforeSource: 'default',
          afterSource: 'organization',
          beforeMaxAgentPersons: 50,
          afterMaxAgentPersons: 50,
          beforeMaxConcurrentClaims: 200,
          afterMaxConcurrentClaims: 40,
          beforeMaxCapacityUnitsPerResource: 10000,
          afterMaxCapacityUnitsPerResource: 10000,
        },
      },
    ]);
  });

  it("starts from the organization's own row when one exists", () => {
    run(['set', '--organization', 'org-a', '--max-agent-persons', '20', '--apply']);
    run(['set', '--organization', 'org-a', '--max-concurrent-claims', '30', '--apply']);
    expect(limitsRows()).toEqual([
      {
        organization_id: 'org-a',
        max_agent_persons: 20,
        max_concurrent_claims: 30,
        max_capacity_units_per_resource: 10000,
      },
    ]);
    expect(auditRows().map((row) => row.detail)).toEqual([
      expect.objectContaining({ beforeSource: 'default', afterMaxAgentPersons: 20 }),
      expect.objectContaining({
        beforeSource: 'organization',
        beforeMaxAgentPersons: 20,
        afterMaxAgentPersons: 20,
        beforeMaxConcurrentClaims: 200,
        afterMaxConcurrentClaims: 30,
      }),
    ]);
  });

  it('rehearses without --apply, printing the change and writing nothing', () => {
    const rehearsed = run(['set', '--organization', 'org-a', '--max-agent-persons', '8']);
    expect(rehearsed.exitCode).toBe(0);
    expect(JSON.parse(rehearsed.stdout)).toMatchObject({ mode: 'dry_run', change: 'set' });
    expect(limitsRows()).toEqual([]);
    expect(auditRows()).toEqual([]);
  });

  it('writes nothing for a set the row already holds, and says so', () => {
    run(['set', '--organization', 'org-a', '--max-agent-persons', '20', '--apply']);
    const again = run(['set', '--organization', 'org-a', '--max-agent-persons', '20', '--apply']);
    expect(again.exitCode).toBe(0);
    expect(JSON.parse(again.stdout)).toMatchObject({ change: 'unchanged' });
    expect(auditRows()).toHaveLength(1);
  });

  it('warns, never refuses, when a cap lands below usage', () => {
    const lowered = run(['set', '--organization', 'org-a', '--max-agent-persons', '8', '--apply']);
    expect(lowered.exitCode).toBe(0);
    expect(lowered.stderr).toBe('warning: 12 agent persons exceed maxAgentPersons 8\n');
    expect(JSON.parse(lowered.stdout)).toMatchObject({
      warnings: ['12 agent persons exceed maxAgentPersons 8'],
    });
    expect(limitsRows()[0]?.max_agent_persons).toBe(8);
  });

  it('accepts the bounds 0 and 1,000,000 themselves', () => {
    const bounds = run([
      'set',
      '--organization',
      'org-b',
      '--max-agent-persons',
      '0',
      '--max-concurrent-claims',
      '1000000',
      '--apply',
    ]);
    expect(bounds.exitCode).toBe(0);
    expect(limitsRows()).toEqual([
      {
        organization_id: 'org-b',
        max_agent_persons: 0,
        max_concurrent_claims: 1000000,
        max_capacity_units_per_resource: 10000,
      },
    ]);
  });

  it('writes nothing and exits non-zero naming the failure when the audit cannot be written', () => {
    sqlite([
      "CREATE TRIGGER audit_down BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit store down'); END",
    ]);
    const failed = run(['set', '--organization', 'org-a', '--max-agent-persons', '8', '--apply']);
    expect(limitsRows()).toEqual([]);
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain('audit store down');
  });
});

describe('organization-limits-cli reset', () => {
  it('deletes the row so the defaults apply again, audited', () => {
    run(['set', '--organization', 'org-a', '--max-agent-persons', '20', '--apply']);
    const reset = run(['reset', '--organization', 'org-a', '--apply']);
    expect(reset.exitCode).toBe(0);
    expect(JSON.parse(reset.stdout)).toMatchObject({
      change: 'reset',
      before: { source: 'organization', limits: { maxAgentPersons: 20 } },
      after: { source: 'default', limits: { maxAgentPersons: 50 } },
    });
    expect(limitsRows()).toEqual([]);
    expect(auditRows().at(-1)?.detail).toEqual({
      beforeSource: 'organization',
      afterSource: 'default',
      beforeMaxAgentPersons: 20,
      afterMaxAgentPersons: 50,
      beforeMaxConcurrentClaims: 200,
      afterMaxConcurrentClaims: 200,
      beforeMaxCapacityUnitsPerResource: 10000,
      afterMaxCapacityUnitsPerResource: 10000,
    });
  });

  it('rehearses a reset without --apply, keeping the row', () => {
    run(['set', '--organization', 'org-a', '--max-agent-persons', '20', '--apply']);
    expect(run(['reset', '--organization', 'org-a']).exitCode).toBe(0);
    expect(limitsRows()).toHaveLength(1);
    expect(auditRows()).toHaveLength(1);
  });

  it('refuses a reset where no row exists', () => {
    const refused = run(['reset', '--organization', 'org-a', '--apply']);
    expect(refused.exitCode).toBe(7);
    expect(refusalOf(refused)).toEqual({ refusal: 'no_row', organizationId: 'org-a' });
    expect(auditRows()).toEqual([]);
  });
});

describe('organization-limits-cli refusals', () => {
  it('refuses an unknown organization, writing nothing', () => {
    const refused = run(['set', '--organization', 'org-z', '--max-agent-persons', '8', '--apply']);
    expect(refused.exitCode).toBe(4);
    expect(refusalOf(refused)).toEqual({
      refusal: 'unknown_organization',
      organizationId: 'org-z',
    });
    expect(run(['show', '--organization', 'org-z']).exitCode).toBe(4);
    expect(limitsRows()).toEqual([]);
  });

  it('refuses before activation', () => {
    // The marker refuses reverting, so a second store that was never activated.
    path = join(directory, 'legacy.db');
    runMigrations(path, migrations);
    sqlite(["INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)"]);
    const refused = run(['show', '--organization', 'org-a']);
    expect(refused.exitCode).toBe(3);
    expect(refusalOf(refused)).toEqual({ refusal: 'inactive', organizationId: 'org-a' });
  });

  it.each([['-1'], ['1000001'], ['99999999999999999999']])(
    'refuses the out-of-bound value %s before opening the database',
    (value) => {
      const refused = run(
        ['set', '--organization', 'org-a', `--max-agent-persons=${value}`, '--apply'],
        {
          DB_PATH: join(directory, 'absent.db'),
        },
      );
      expect(refused.exitCode).toBe(5);
      expect(refusalOf(refused)).toEqual({
        refusal: 'out_of_bound',
        flag: '--max-agent-persons',
        value,
        least: 0,
        most: 1000000,
      });
    },
  );

  it('refuses a set naming no cap', () => {
    const refused = run(['set', '--organization', 'org-a', '--apply']);
    expect(refused.exitCode).toBe(6);
    expect(refusalOf(refused)).toMatchObject({ refusal: 'no_cap' });
  });

  it.each([
    [['set', '--organization', 'org-a', '--max-agent-persons', '8.5']],
    [['set', '--organization', 'org-a', '--max-agents', '8']],
    [['set', '--max-agent-persons', '8']],
    [['show', '--organization', 'org-a', '--apply']],
    [['reset', '--organization', 'org-a', '--max-agent-persons', '8']],
    [['grow', '--organization', 'org-a']],
    [['--organization', 'org-a']],
    [['show', 'extra', '--organization', 'org-a']],
  ])('refuses the malformed invocation %j', (args) => {
    const refused = run(args);
    expect(refused.exitCode).toBe(2);
    expect(refusalOf(refused)).toMatchObject({ refusal: 'malformed' });
    expect(limitsRows()).toEqual([]);
  });

  it('throws without the deployment defaults rather than assuming any', () => {
    const failed = run(['show', '--organization', 'org-a'], {
      ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: undefined,
    });
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain('ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS');
  });

  it('throws without DB_PATH or a database', () => {
    expect(run(['show', '--organization', 'org-a'], { DB_PATH: undefined }).stderr).toContain(
      'DB_PATH must be set',
    );
    const absent = run(['show', '--organization', 'org-a'], {
      DB_PATH: join(directory, 'absent.db'),
    });
    expect(absent.exitCode).toBe(1);
  });
});
