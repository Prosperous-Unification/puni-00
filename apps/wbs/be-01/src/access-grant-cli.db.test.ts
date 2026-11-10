import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';

setDefaultTimeout(30_000);

const cli = new URL('./access-grant-cli.ts', import.meta.url).pathname;
const migrations = new URL('../drizzle', import.meta.url).pathname;
const CREDENTIAL = '00000000-0000-4000-8000-000000000001';

let directory: string;
let path: string;

/**
 * `org-a`: sam a member holding `org-super-admin` directly, ada a member
 * holding `org-viewer` at the organization (a second organization-scope role
 * the revoke must leave alone), an agent of ada's holding credential
 * {@link CREDENTIAL}; `out` belongs to `org-b` only.
 */
const FIXTURE = [
  ...['sam', 'ada', 'out'].map(
    (user) =>
      `INSERT INTO users (id, username, password_hash, created_at) VALUES ('${user}', '${user}', 'x', 1)`,
  ),
  "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
  `INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES
   ('org-a', 'sam', 'super_admin', 1), ('org-a', 'ada', 'member', 1), ('org-b', 'out', 'member', 1)`,
  `INSERT INTO access_grant (id, organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id, origin, created_at, created_by)
   VALUES ('g-sam', 'org-a', 'organization', 'org-a', 'user', 'sam', 'org-super-admin', 'route', 1, 'sam'),
          ('g-ada-viewer', 'org-a', 'organization', 'org-a', 'user', 'ada', 'org-viewer', 'route', 1, 'sam')`,
  "INSERT INTO person (id, name, kind, account_id) VALUES ('agent-ada', 'Agent Ada', 'agent', 'ada')",
  "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('agent-ada', 'org-a', 'Agent Ada')",
  `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, created_at)
   VALUES ('${CREDENTIAL}', 'org-a', 'agent-ada', 'sam', 'api_key', 'key-1', 1)`,
];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'access-grant-cli-'));
  path = join(directory, 'plan.db');
  runMigrations(path, migrations);
  const db = openDatabase(path);
  try {
    for (const statement of FIXTURE) db.run(statement);
  } finally {
    db.close();
  }
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

interface GrantRow {
  organization_id: string;
  subject_id: string;
  role_id: string;
  origin: string;
  created_by: string | null;
}

/** Every grant, ordered by organization then subject. */
function grantRows(): GrantRow[] {
  const db = openDatabase(path);
  try {
    return db
      .query<GrantRow, []>(
        'SELECT organization_id, subject_id, role_id, origin, created_by FROM access_grant ORDER BY organization_id, subject_id, role_id',
      )
      .all();
  } finally {
    db.close();
  }
}

const auditCount = () => {
  const db = openDatabase(path);
  try {
    return db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM organization_audit').get()?.n;
  } finally {
    db.close();
  }
};

const SAM: GrantRow = {
  organization_id: 'org-a',
  subject_id: 'sam',
  role_id: 'org-super-admin',
  origin: 'route',
  created_by: 'sam',
};
const ADA_VIEWER: GrantRow = { ...SAM, subject_id: 'ada', role_id: 'org-viewer' };
/** The fixture's grants, as {@link grantRows} orders them. */
const FIXTURE_GRANTS = [ADA_VIEWER, SAM];

/** Runs the CLI against `dbPath` (`null` unsets DB_PATH), FORCE_COLOR as Nx sets it in the gate. */
function run(args: readonly string[], dbPath: string | null = path) {
  const env: Record<string, string | undefined> = { ...process.env, FORCE_COLOR: '1' };
  delete env['DB_PATH'];
  if (dbPath !== null) env['DB_PATH'] = dbPath;
  // `--no-env-file`: a checkout's `.env` would otherwise supply DB_PATH.
  const spawned = Bun.spawnSync([process.execPath, '--no-env-file', cli, ...args], {
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: spawned.exitCode,
    stdout: spawned.stdout.toString(),
    stderr: spawned.stderr.toString(),
  };
}

/** The refusal a run wrote: stderr exactly one JSON line, stdout empty. */
function refusalOf(outcome: ReturnType<typeof run>): unknown {
  expect(outcome.stdout).toBe('');
  const lines = outcome.stderr.split('\n').filter((line) => line !== '');
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? '');
}

/** The success document a run printed: one JSON line on stdout, stderr empty, exit 0. */
function documentOf(outcome: ReturnType<typeof run>): unknown {
  expect(outcome.stderr).toBe('');
  expect(outcome.exitCode).toBe(0);
  const lines = outcome.stdout.split('\n').filter((line) => line !== '');
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? '');
}

const grant = (organization: string, user: string) => [
  'grant-super-admin',
  `--organization=${organization}`,
  `--user=${user}`,
];
const revoke = (organization: string, user: string) => [
  'revoke-super-admin',
  '--organization',
  organization,
  '--user',
  user,
];

const ACTOR = `operator:${userInfo().username}`;

describe('grant-super-admin', () => {
  it('grants a current member with origin operator and no creator, and prints the count', () => {
    const printed = documentOf(run(grant('org-a', 'ada'))) as Record<string, unknown>;
    expect(printed['grantId']).toBeString();
    expect(printed).toEqual({
      command: 'grant-super-admin',
      organizationId: 'org-a',
      userId: 'ada',
      grantId: printed['grantId'],
      roleId: 'org-super-admin',
      origin: 'operator',
      actor: ACTOR,
      audit: 'recorded',
      superAdminCount: 2,
    });
    expect(grantRows()).toEqual([
      {
        organization_id: 'org-a',
        subject_id: 'ada',
        role_id: 'org-super-admin',
        origin: 'operator',
        created_by: null,
      },
      ADA_VIEWER,
      SAM,
    ]);
    expect(auditCount()).toBe(1);
    expect(readAccessAudits()).toMatchObject([
      {
        organization_id: 'org-a',
        actor_id: ACTOR,
        action: 'access_granted',
        subject_kind: 'access_grant',
        subject_id: printed['grantId'],
        detail: {
          roleId: 'org-super-admin',
          scopeKind: 'organization',
          scopeId: 'org-a',
          subjectKind: 'user',
          subjectId: 'ada',
          origin: 'operator',
        },
      },
    ]);
  });

  it('refuses a user who is not a current member, writing nothing', () => {
    const outcome = run(grant('org-a', 'out'));
    expect(refusalOf(outcome)).toEqual({
      refusal: 'not_a_member',
      organizationId: 'org-a',
      userId: 'out',
    });
    expect(outcome.exitCode).toBe(7);
    expect(grantRows()).toEqual(FIXTURE_GRANTS);
  });

  it("refuses a machine credential's id, writing nothing", () => {
    const outcome = run(grant('org-a', CREDENTIAL));
    expect(refusalOf(outcome)).toEqual({
      refusal: 'machine_credential',
      organizationId: 'org-a',
      userId: CREDENTIAL,
    });
    expect(outcome.exitCode).toBe(6);
    expect(grantRows()).toEqual(FIXTURE_GRANTS);
  });

  it('refuses a user who holds the role directly already', () => {
    const outcome = run(grant('org-a', 'sam'));
    expect(refusalOf(outcome)).toEqual({
      refusal: 'already_granted',
      organizationId: 'org-a',
      userId: 'sam',
    });
    expect(outcome.exitCode).toBe(8);
    expect(grantRows()).toEqual(FIXTURE_GRANTS);
  });
});

describe('revoke-super-admin', () => {
  it('revokes after a hand-over and prints the count left', () => {
    documentOf(run(grant('org-a', 'ada')));
    expect(documentOf(run(revoke('org-a', 'sam')))).toEqual({
      command: 'revoke-super-admin',
      organizationId: 'org-a',
      userId: 'sam',
      grantId: 'g-sam',
      roleId: 'org-super-admin',
      origin: 'operator',
      actor: ACTOR,
      audit: 'recorded',
      superAdminCount: 1,
    });
    expect(readAccessAudits()).toMatchObject([
      { actor_id: ACTOR, action: 'access_granted', detail: { origin: 'operator' } },
      {
        actor_id: ACTOR,
        action: 'access_revoked',
        subject_id: 'g-sam',
        detail: { roleId: 'org-super-admin', subjectId: 'sam', origin: 'operator' },
      },
    ]);
    expect(grantRows().map((row) => [row.subject_id, row.role_id])).toEqual([
      ['ada', 'org-super-admin'],
      ['ada', 'org-viewer'],
    ]);
  });

  it('revokes only the super-admin grant of a user who also holds another organization role', () => {
    documentOf(run(grant('org-a', 'ada')));
    expect(documentOf(run(revoke('org-a', 'ada')))).toMatchObject({
      userId: 'ada',
      roleId: 'org-super-admin',
      superAdminCount: 1,
    });
    expect(grantRows()).toEqual(FIXTURE_GRANTS);
  });

  it('refuses revoking the last direct human super-admin, writing nothing', () => {
    const outcome = run(revoke('org-a', 'sam'));
    expect(refusalOf(outcome)).toEqual({
      refusal: 'last_super_admin',
      organizationId: 'org-a',
      userId: 'sam',
    });
    expect(outcome.exitCode).toBe(10);
    expect(grantRows()).toEqual(FIXTURE_GRANTS);
  });

  it('refuses a user who holds no direct grant', () => {
    const outcome = run(revoke('org-a', 'ada'));
    expect(refusalOf(outcome)).toEqual({
      refusal: 'not_granted',
      organizationId: 'org-a',
      userId: 'ada',
    });
    expect(outcome.exitCode).toBe(9);
    expect(grantRows()).toEqual(FIXTURE_GRANTS);
  });
});

describe('both commands', () => {
  it('refuse an unknown organization, writing nothing', () => {
    for (const args of [grant('org-x', 'ada'), revoke('org-x', 'sam')]) {
      const outcome = run(args);
      expect(refusalOf(outcome)).toEqual({
        refusal: 'unknown_organization',
        organizationId: 'org-x',
      });
      expect(outcome.exitCode).toBe(5);
    }
    expect(grantRows()).toEqual(FIXTURE_GRANTS);
  });

  it('refuse a missing database without creating it', () => {
    const missing = join(directory, 'absent.db');
    for (const args of [grant('org-a', 'ada'), revoke('org-a', 'sam')]) {
      const outcome = run(args, missing);
      expect(refusalOf(outcome)).toMatchObject({ refusal: 'missing_database', path: missing });
      expect(outcome.exitCode).toBe(3);
    }
    expect(existsSync(missing)).toBe(false);
  });

  it('refuse an unreadable database, writing nothing', () => {
    // A root process reads a mode-0 file, so this case cannot hold there.
    if (process.getuid?.() === 0)
      throw new Error('unreadability proof needs a nonprivileged runner');
    const before = readFileSync(path);
    chmodSync(path, 0);
    try {
      for (const args of [grant('org-a', 'ada'), revoke('org-a', 'sam')]) {
        const outcome = run(args);
        expect(refusalOf(outcome)).toMatchObject({ refusal: 'unreadable_database', path });
        expect(outcome.exitCode).toBe(4);
      }
    } finally {
      chmodSync(path, 0o600);
    }
    expect(readFileSync(path)).toEqual(before);
    expect(grantRows()).toEqual(FIXTURE_GRANTS);
  });

  it('refuse a malformed invocation before opening the database', () => {
    const missing = join(directory, 'absent.db');
    for (const args of [
      [],
      ['promote', '--organization=org-a', '--user=ada'],
      ['grant-super-admin', '--user=ada'],
      ['grant-super-admin', '--organization=org-a'],
      ['revoke-super-admin', '--organization=org-a', '--user='],
      ['grant-super-admin', '--organization=org-a', '--user=ada', '--force'],
      ['grant-super-admin', 'extra', '--organization=org-a', '--user=ada'],
    ]) {
      const outcome = run(args, missing);
      expect(refusalOf(outcome)).toMatchObject({ refusal: 'malformed' });
      expect(outcome.exitCode).toBe(2);
    }
    expect(existsSync(missing)).toBe(false);
  });

  it('throws without DB_PATH', () => {
    const outcome = run(grant('org-a', 'ada'), null);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('DB_PATH must be set');
    expect(grantRows()).toEqual(FIXTURE_GRANTS);
  });
});

function readAccessAudits() {
  const db = openDatabase(path);
  try {
    return db
      .query<
        {
          id: string;
          organization_id: string;
          actor_id: string;
          action: string;
          subject_kind: string;
          subject_id: string;
          detail: string;
          created_at: number;
        },
        []
      >('SELECT * FROM organization_audit ORDER BY created_at,rowid')
      .all()
      .map((row) => ({ ...row, detail: JSON.parse(row.detail) as unknown }));
  } finally {
    db.close();
  }
}

for (const command of ['grant', 'revoke'] as const) {
  it(
    'rolls the operator ' +
      command +
      ' back and prints no success when its access audit cannot be written',
    () => {
      const db = openDatabase(path);
      try {
        if (command === 'revoke')
          db.run(
            "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at,created_by) VALUES ('g-ada-admin','org-a','organization','org-a','user','ada','org-super-admin','route',1,'sam')",
          );
        db.run(
          "CREATE TRIGGER reject_operator_access_audit BEFORE INSERT ON organization_audit WHEN NEW.action='" +
            (command === 'grant' ? 'access_granted' : 'access_revoked') +
            "' BEGIN SELECT RAISE(ABORT,'injected operator access audit failure'); END",
        );
      } finally {
        db.close();
      }
      const before = grantRows();
      const audits = readAccessAudits();
      const outcome = run(command === 'grant' ? grant('org-a', 'ada') : revoke('org-a', 'sam'));
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stdout).toBe('');
      expect(outcome.stderr).toContain('injected operator access audit failure');
      expect(grantRows()).toEqual(before);
      expect(readAccessAudits()).toEqual(audits);
    },
  );
}
