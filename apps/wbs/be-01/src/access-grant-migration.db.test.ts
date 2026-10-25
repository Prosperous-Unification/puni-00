import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type AccessObjectKind,
  BUILT_IN_ROLES,
  isPermission,
  parsePermissionMatrix,
  PERMISSIONS,
  roleMayHold,
} from '@wbs/domain';
import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { rollbackTo } from '@wbs/store-sqlite/migrate-down';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

const FOLDER = new URL('../drizzle', import.meta.url).pathname;
const MIGRATION = '20261025100000_add_access_grants';
const BASELINE = '20261023170000_add_work_item_budget';
const MATRIX = parsePermissionMatrix(
  readFileSync(
    new URL('../../../../openspec/changes/wbs-permissions/permission-matrix.md', import.meta.url),
    'utf8',
  ),
);
const TABLES = [
  'access_grant',
  'access_group',
  'access_group_member',
  'access_role',
  'access_role_permission',
];
const credentialId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let dir: string;
let path: string;
let db: Database;

/**
 * A store at {@link BASELINE} shaped like dev. `org-a`: sam super_admin, ada
 * admin, mo member, vi viewer; `org-b`: bo member, ada viewer; `out` belongs
 * nowhere. Projects: `p-mo` (mo, org-a), `p-out` (out, org-a), `p-ada` (ada,
 * org-a), `p-loose` (mo, no organization), `p-bo` (bo, org-b), `p-mo-b` (mo,
 * org-b, where mo is not a member). Credentials in org-a bound through agent
 * persons to ada, mo (one live, one revoked), vi and out, and one unbound.
 */
function seedBaseline(): void {
  for (const user of ['sam', 'ada', 'mo', 'vi', 'bo', 'out'])
    db.run(
      `INSERT INTO users (id, username, password_hash, created_at) VALUES ('${user}', '${user}', 'x', 1)`,
    );
  db.run(
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
  );
  db.run(
    `INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES
     ('org-a', 'sam', 'super_admin', 1), ('org-a', 'ada', 'admin', 1), ('org-a', 'mo', 'member', 1),
     ('org-a', 'vi', 'viewer', 1), ('org-b', 'bo', 'member', 1), ('org-b', 'ada', 'viewer', 1)`,
  );
  db.run(
    `INSERT INTO project (id, name, owner_id, revision, created_at) VALUES
     ('p-mo', 'Mo', 'mo', 0, 1), ('p-out', 'Out', 'out', 0, 1), ('p-ada', 'Ada', 'ada', 0, 1),
     ('p-loose', 'Loose', 'mo', 0, 1), ('p-bo', 'Bo', 'bo', 0, 1), ('p-mo-b', 'Mo B', 'mo', 0, 1)`,
  );
  db.run(
    `INSERT INTO project_organization (resource_id, organization_id) VALUES
     ('p-mo', 'org-a'), ('p-out', 'org-a'), ('p-ada', 'org-a'), ('p-bo', 'org-b'), ('p-mo-b', 'org-b')`,
  );
  db.run(
    `INSERT INTO person (id, name, kind, account_id) VALUES
     ('agent-ada', 'Agent Ada', 'agent', 'ada'), ('agent-mo', 'Agent Mo', 'agent', 'mo'),
     ('agent-vi', 'Agent Vi', 'agent', 'vi'), ('agent-out', 'Agent Out', 'agent', 'out'),
     ('agent-none', 'Agent None', 'agent', NULL)`,
  );
  const credentials: [number, string, string | null][] = [
    [1, 'agent-ada', null],
    [2, 'agent-mo', null],
    [3, 'agent-mo', '5'],
    [4, 'agent-vi', null],
    [5, 'agent-out', null],
    [6, 'agent-none', null],
  ];
  for (const [n, person, revokedAt] of credentials)
    db.run(
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, revoked_at, created_at)
       VALUES ('${credentialId(n)}', 'org-a', '${person}', 'sam', 'api_key', 'key-${String(n)}', ${revokedAt ?? 'NULL'}, 1)`,
    );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-access-grants-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([MIGRATION]);
  db = openDatabase(path);
  seedBaseline();
  db.close();
  runMigrations(path, FOLDER);
  db = openDatabase(path);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

interface GrantRow {
  organization_id: string;
  scope_kind: string;
  scope_id: string;
  subject_kind: string;
  subject_id: string;
  role_id: string;
}

function grantsOf(subjectKind: string): GrantRow[] {
  return db
    .query<GrantRow, [string]>(
      `SELECT organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id
       FROM access_grant WHERE subject_kind = ?
       ORDER BY organization_id, subject_id, scope_kind, scope_id`,
    )
    .all(subjectKind);
}

const tablesLeft = () =>
  db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'access_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => name);

const customRole = (id: string, name: string, organizationId = 'org-a') =>
  db.run(
    `INSERT INTO access_role (id, name, object_kind, organization_id, created_at) VALUES ('${id}', '${name}', 'project', '${organizationId}', 1)`,
  );

const grant = (id: string, origin: string, subjectKind = 'user', subjectId = 'mo') =>
  db.run(
    `INSERT INTO access_grant (id, organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id, origin, created_at)
     VALUES ('${id}', 'org-a', 'work_package', 'p-ada', '${subjectKind}', '${subjectId}', 'package-viewer', '${origin}', 1)`,
  );

/** Rolls back to {@link BASELINE} on a closed handle, reopening after either way. */
function rollBack(): string[] {
  db.close();
  try {
    return rollbackTo(path, FOLDER, BASELINE);
  } finally {
    db = openDatabase(path);
  }
}

describe(MIGRATION, () => {
  describe('the catalogue', () => {
    // Proof: one seed cell flipped in migration.sql (`package-contributor`'s
    // `package.write` row removed) failed this case on that cell; watched
    // 2026-10-25.
    it('seeds every built-in role with exactly its permission-matrix.md column', () => {
      const seeded = new Map<string, Set<string>>();
      for (const { role_id, permission } of db
        .query<{ role_id: string; permission: string }, []>(
          'SELECT role_id, permission FROM access_role_permission',
        )
        .all())
        seeded.set(role_id, (seeded.get(role_id) ?? new Set()).add(permission));
      expect([...seeded.keys()].sort()).toEqual([...MATRIX.roles.keys()].sort());
      for (const [roleId, held] of MATRIX.roles)
        for (const permission of MATRIX.permissions)
          expect({
            roleId,
            permission,
            seeded: seeded.get(roleId)?.has(permission) ?? false,
          }).toEqual({ roleId, permission, seeded: held.has(permission) });
      expect([...MATRIX.permissions].sort()).toEqual(PERMISSIONS.map(({ id }) => id).sort());
    });

    it('seeds the nine built-ins with their kind and display level, and every row satisfies CP7', () => {
      expect(
        db
          .query(
            'SELECT id, name, object_kind, level, organization_id, created_by FROM access_role ORDER BY level DESC, id',
          )
          .all(),
      ).toEqual(
        [...BUILT_IN_ROLES]
          .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))
          .map(({ id, objectKind, level }) => ({
            id,
            name: id,
            object_kind: objectKind,
            level,
            organization_id: null,
            created_by: null,
          })),
      );
      const rows = db
        .query<{ object_kind: AccessObjectKind; permission: string }, []>(
          'SELECT r.object_kind, p.permission FROM access_role_permission p JOIN access_role r ON r.id = p.role_id',
        )
        .all();
      for (const { object_kind, permission } of rows) {
        if (!isPermission(permission)) throw new Error(`seeded unknown permission ${permission}`);
        expect({ object_kind, permission, holds: roleMayHold(object_kind, permission) }).toEqual({
          object_kind,
          permission,
          holds: true,
        });
      }
    });

    // Proof: both reserved-name triggers removed from migration.sql made this
    // case insert a custom role named `org-admin`; watched 2026-10-25.
    it('refuses a custom role named after a built-in', () => {
      expect(() => customRole('01JCUSTOM', 'org-admin')).toThrow('reserved_name');
      customRole('01JCUSTOM', 'Budget keepers');
      expect(() =>
        db.run("UPDATE access_role SET name = 'package-viewer' WHERE id = '01JCUSTOM'"),
      ).toThrow('reserved_name');
      customRole('01JOTHER', 'Budget keepers', 'org-b');
      expect(() => customRole('01JTWIN', 'Budget keepers')).toThrow('UNIQUE constraint failed');
    });

    // Proof: `access_role_built_in_or_custom` made `CHECK (1)` made this case
    // store a custom role with a level; the object kind's CHECK made
    // `CHECK (1)` made it store the kind `space`; watched 2026-10-25.
    it('refuses a role that is neither built-in nor custom, and an unknown kind', () => {
      expect(() =>
        db.run(
          "INSERT INTO access_role (id, name, object_kind, level, organization_id, created_at) VALUES ('01JLEVEL', 'Levelled', 'project', 3, 'org-a', 1)",
        ),
      ).toThrow('CHECK constraint failed');
      expect(() =>
        db.run(
          "INSERT INTO access_role (id, name, object_kind, created_at) VALUES ('nobody', 'nobody', 'project', 1)",
        ),
      ).toThrow('CHECK constraint failed');
      expect(() =>
        db.run(
          "INSERT INTO access_role (id, name, object_kind, organization_id, created_at) VALUES ('01JSPACE', 'Space', 'space', 'org-a', 1)",
        ),
      ).toThrow('CHECK constraint failed');
    });

    // Proof: `access_role_built_in_name` made `CHECK (1)` in migration.sql made
    // this case store a built-in whose name differs from its id; watched 2026-10-25.
    it('refuses a built-in role whose name is not its id', () => {
      expect(() =>
        db.run(
          "INSERT INTO access_role (id, name, object_kind, level, created_at) VALUES ('package-auditor', 'Package auditor', 'work_package', 1, 1)",
        ),
      ).toThrow('CHECK constraint failed: access_role_built_in_name');
      expect(() => db.run("UPDATE access_role SET name = 'Admin' WHERE id = 'org-admin'")).toThrow(
        'CHECK constraint failed: access_role_built_in_name',
      );
      customRole('01JCUSTOM', 'Package auditor');
    });

    it('takes a deleted role’s permission rows with it, and keeps a role a grant names', () => {
      customRole('01JCUSTOM', 'Readers');
      db.run(
        "INSERT INTO access_role_permission (role_id, permission) VALUES ('01JCUSTOM', 'project.read')",
      );
      db.run("DELETE FROM access_role WHERE id = '01JCUSTOM'");
      expect(
        db.query("SELECT * FROM access_role_permission WHERE role_id = '01JCUSTOM'").all(),
      ).toEqual([]);
      expect(() => db.run("DELETE FROM access_role WHERE id = 'package-manager'")).toThrow(
        'FOREIGN KEY constraint failed',
      );
    });
  });

  describe('the backfill', () => {
    it('writes one organization-scope grant per membership, mapped by E8', () => {
      expect(grantsOf('user').filter(({ scope_kind }) => scope_kind === 'organization')).toEqual(
        [
          ['org-a', 'ada', 'org-admin'],
          ['org-a', 'mo', 'project-contributor'],
          ['org-a', 'sam', 'org-super-admin'],
          ['org-a', 'vi', 'project-viewer'],
          ['org-b', 'ada', 'project-viewer'],
          ['org-b', 'bo', 'project-contributor'],
        ].map(([organization, user, role]) => ({
          organization_id: organization,
          scope_kind: 'organization',
          scope_id: organization,
          subject_kind: 'user',
          subject_id: user,
          role_id: role,
        })),
      );
      const memberships = db.query('SELECT COUNT(*) AS n FROM organization_membership').get();
      const organizationGrants = db
        .query(
          "SELECT COUNT(*) AS n FROM access_grant WHERE subject_kind = 'user' AND scope_kind = 'organization'",
        )
        .get();
      expect(organizationGrants).toEqual(memberships);
    });

    // Proof: the EXISTS on `organization_membership` removed from the owner
    // INSERT made this case grant `out` and `mo` (in org-b) package-manager;
    // watched 2026-10-25.
    it('writes package-manager for owners who are current members only', () => {
      expect(grantsOf('user').filter(({ scope_kind }) => scope_kind === 'work_package')).toEqual(
        [
          ['org-a', 'ada', 'p-ada'],
          ['org-a', 'mo', 'p-mo'],
          ['org-b', 'bo', 'p-bo'],
        ].map(([organization, user, project]) => ({
          organization_id: organization,
          scope_kind: 'work_package',
          scope_id: project,
          subject_kind: 'user',
          subject_id: user,
          role_id: 'package-manager',
        })),
      );
      expect(
        db.query("SELECT COUNT(*) AS n FROM access_grant WHERE scope_kind = 'project'").get(),
      ).toEqual({ n: 0 });
    });

    // Proof: the copy's CASE replaced by `g.role_id` made this case give ada's
    // credential `org-admin` and `package-manager`; watched 2026-10-25.
    it('copies a bound account’s rows to its live credentials capped at contributor', () => {
      expect(grantsOf('machine_credential')).toEqual(
        (
          [
            [1, 'organization', 'org-a', 'project-contributor'],
            [1, 'work_package', 'p-ada', 'package-contributor'],
            [2, 'organization', 'org-a', 'project-contributor'],
            [2, 'work_package', 'p-mo', 'package-contributor'],
            [4, 'organization', 'org-a', 'project-viewer'],
          ] as const
        ).map(([n, scopeKind, scopeId, role]) => ({
          organization_id: 'org-a',
          scope_kind: scopeKind,
          scope_id: scopeId,
          subject_kind: 'machine_credential',
          subject_id: credentialId(n),
          role_id: role,
        })),
      );
    });

    it('marks every row as the backfill’s, with no creator', () => {
      expect(
        db
          .query(
            'SELECT origin, created_by, COUNT(*) AS n FROM access_grant GROUP BY origin, created_by',
          )
          .all(),
      ).toEqual([{ origin: 'backfill', created_by: null, n: 14 }]);
    });
  });

  describe('the grant tables', () => {
    // Proof: both organization-members triggers removed from migration.sql
    // made this case store a grant whose subject named org-b; watched
    // 2026-10-25.
    it('refuses an organization-members grant naming another organization', () => {
      expect(() => grant('g-1', 'route', 'organization_members', 'org-b')).toThrow(
        'organization_members grant names its own organization',
      );
      grant('g-1', 'route', 'organization_members', 'org-a');
      expect(() => db.run("UPDATE access_grant SET subject_id = 'org-b' WHERE id = 'g-1'")).toThrow(
        'organization_members grant names its own organization',
      );
    });

    // Proof: `access_grant_organization_scope` made `CHECK (1)` in
    // migration.sql made this case store an org-a grant scoped to org-b;
    // watched 2026-10-25.
    it('refuses an organization-scope grant naming another organization', () => {
      const organizationGrant = (id: string, scopeId: string) =>
        db.run(
          `INSERT INTO access_grant (id, organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id, origin, created_at)
           VALUES ('${id}', 'org-a', 'organization', '${scopeId}', 'user', 'vi', 'org-viewer', 'route', 1)`,
        );
      expect(() => organizationGrant('g-b', 'org-b')).toThrow(
        'CHECK constraint failed: access_grant_organization_scope',
      );
      organizationGrant('g-a', 'org-a');
      expect(() => db.run("UPDATE access_grant SET scope_id = 'org-b' WHERE id = 'g-a'")).toThrow(
        'CHECK constraint failed: access_grant_organization_scope',
      );
    });

    // Proof: each of the scope, subject and origin CHECKs made `CHECK (1)`
    // alone, and the six-column UNIQUE removed, made this case store the row
    // it refuses; watched 2026-10-25.
    it('refuses a grant outside the vocabularies and a duplicate', () => {
      const row = (scopeKind: string, subjectKind: string, origin: string) =>
        db.run(
          `INSERT INTO access_grant (id, organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id, origin, created_at)
           VALUES (lower(hex(randomblob(8))), 'org-a', '${scopeKind}', 'p-mo', '${subjectKind}', 'vi', 'package-viewer', '${origin}', 1)`,
        );
      expect(() => row('space', 'user', 'route')).toThrow('CHECK constraint failed');
      expect(() => row('work_package', 'team', 'route')).toThrow('CHECK constraint failed');
      expect(() => row('work_package', 'user', 'operator')).toThrow('CHECK constraint failed');
      row('work_package', 'user', 'route');
      expect(() => row('work_package', 'user', 'invitation')).toThrow('UNIQUE constraint failed');
    });

    // Proof: the composite group key replaced by `group_id REFERENCES
    // access_group(id)` made this case store bo in org-a's group under org-b;
    // watched 2026-10-25.
    it('refuses a group member from another organization or outside it', () => {
      db.run(
        "INSERT INTO access_group (id, organization_id, name, created_at) VALUES ('grp', 'org-a', 'Leads', 1)",
      );
      const member = (organizationId: string, userId: string) =>
        db.run(
          `INSERT INTO access_group_member (organization_id, group_id, user_id, created_at) VALUES ('${organizationId}', 'grp', '${userId}', 1)`,
        );
      expect(() => member('org-a', 'bo')).toThrow('FOREIGN KEY constraint failed');
      expect(() => member('org-b', 'bo')).toThrow('FOREIGN KEY constraint failed');
      member('org-a', 'mo');
      db.run("DELETE FROM access_group WHERE id = 'grp'");
      expect(db.query('SELECT * FROM access_group_member').all()).toEqual([]);
    });
  });

  describe('the rollback', () => {
    it('rolls back over the backfill and the built-ins, dropping the five tables', () => {
      expect(tablesLeft()).toEqual(TABLES);
      expect(rollBack()).toEqual([MIGRATION]);
      expect(tablesLeft()).toEqual([]);
      expect(db.query('SELECT COUNT(*) AS n FROM organization_membership').get()).toEqual({ n: 6 });
    });

    it('refuses rollback over one route-origin grant, keeping it', () => {
      grant('g-route', 'route');
      expect(rollBack).toThrow('access grants written after the backfill exist');
      expect(db.query("SELECT id, origin FROM access_grant WHERE id = 'g-route'").all()).toEqual([
        { id: 'g-route', origin: 'route' },
      ]);
      expect(tablesLeft()).toEqual(TABLES);
    });

    it('refuses rollback over an ungranted custom role, keeping it and its rows', () => {
      customRole('01JCUSTOM', 'Readers');
      db.run(
        "INSERT INTO access_role_permission (role_id, permission) VALUES ('01JCUSTOM', 'project.read')",
      );
      expect(rollBack).toThrow('custom access roles exist');
      expect(
        db
          .query(
            "SELECT role_id, permission FROM access_role_permission WHERE role_id = '01JCUSTOM'",
          )
          .all(),
      ).toEqual([{ role_id: '01JCUSTOM', permission: 'project.read' }]);
    });

    it('refuses rollback over one access group', () => {
      db.run(
        "INSERT INTO access_group (id, organization_id, name, created_at) VALUES ('grp', 'org-a', 'Leads', 1)",
      );
      expect(rollBack).toThrow('access groups exist');
      expect(db.query('SELECT id FROM access_group').all()).toEqual([{ id: 'grp' }]);
    });

    it('refuses rollback over a permission row of no built-in role', () => {
      db.run('PRAGMA foreign_keys = OFF');
      db.run(
        "INSERT INTO access_role_permission (role_id, permission) VALUES ('01JGONE', 'package.read')",
      );
      db.run('PRAGMA foreign_keys = ON');
      expect(rollBack).toThrow('permission rows of no built-in role exist');
      expect(
        db.query("SELECT role_id FROM access_role_permission WHERE role_id = '01JGONE'").all(),
      ).toEqual([{ role_id: '01JGONE' }]);
    });
  });
});
