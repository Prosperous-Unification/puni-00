import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AccessTarget, ScopedPrincipal } from '@wbs/core';
import {
  CONTRIBUTOR_CAP,
  EmptyRoleSet,
  may,
  type Permission,
  PermissionKindRow,
  UnknownPermissionRow,
  type WorkPackageChain,
} from '@wbs/domain';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { AccessDecisionRepository } from './access-decisions';
import { openConnection, openDatabase } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { WorkPackageRepository } from './work-package';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ORG = 'org-a';
const READ_ONLY = ['organization.navigate', 'package.read', 'project.read'];
const CONTRIBUTOR: Permission[] = [
  'organization.navigate',
  'package.read',
  'package.write',
  'project.read',
];

let dir: string;
let path: string;
let sqlite: Database;
let decisions: AccessDecisionRepository;
let packages: WorkPackageRepository;
let statements: { sql: string; bindings: unknown[] }[];

/**
 * `org-a` with members ada, bea, cy, dee and mo, and `org-b` with bo. Work
 * packages (today's `workPackage` rows): `wp-open` and `wp-two` unrestricted,
 * `wp-closed` restricted, all in `org-a`; `wp-b` in `org-b`. Group `g`
 * (`org-a`) holds bea and dee. No grant exists until a case writes one.
 */
function seed(): void {
  for (const user of ['ada', 'bea', 'cy', 'dee', 'mo', 'bo'])
    sqlite.run(`INSERT INTO users (id, username, created_at) VALUES ('${user}', '${user}', 1)`);
  sqlite.run(
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
  );
  for (const user of ['ada', 'bea', 'cy', 'dee', 'mo'])
    sqlite.run(
      `INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', '${user}', 'member', 1)`,
    );
  sqlite.run(
    "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-b', 'bo', 'member', 1)",
  );
  sqlite.run(
    `INSERT INTO project (id, organization_id, name, created_at, created_by) VALUES
     ('proj', 'org-a', 'Primary', 1, 'ada'),
     ('proj-two', 'org-a', 'Sibling', 1, 'ada'),
     ('proj-b', 'org-b', 'Foreign', 1, 'bo')`,
  );
  sqlite.run(
    `INSERT INTO work_package (id, name, project_id, created_by, restricted, created_at) VALUES
     ('wp-open', 'Open', 'proj', 'ada', 0, 1),
     ('wp-two', 'Two', 'proj-two', 'ada', 0, 1),
     ('wp-closed', 'Closed', 'proj', 'mo', 1, 1),
     ('wp-b', 'B', 'proj-b', 'bo', 0, 1)`,
  );
  sqlite.run(
    `INSERT INTO work_package_organization (resource_id, organization_id) VALUES
     ('wp-open', 'org-a'), ('wp-two', 'org-a'), ('wp-closed', 'org-a'), ('wp-b', 'org-b')`,
  );
  sqlite.run(
    "INSERT INTO access_group (id, organization_id, name, created_at) VALUES ('g', 'org-a', 'G', 1)",
  );
  sqlite.run(
    `INSERT INTO access_group_member (organization_id, group_id, user_id, created_at) VALUES
     ('org-a', 'g', 'bea', 1), ('org-a', 'g', 'dee', 1)`,
  );
}

/** Acquired resources only, in reverse order; selected cleanup attempts are consumed once. */
let fixtureCleanup: (() => void)[] = [];

/** Attempts every selected close/removal, preserving a setup primary and all cleanup failures. */
function closeFixture(primary: { readonly cause: unknown } | null = null): void {
  const selected = fixtureCleanup;
  fixtureCleanup = [];
  const failures: unknown[] = [];
  for (const close of selected) {
    try {
      close();
    } catch (failure) {
      failures.push(failure);
    }
  }
  if (primary !== null) {
    if (failures.length === 0) throw primary.cause;
    throw new AggregateError(
      [primary.cause, ...failures],
      'Access-decision fixture setup and cleanup failed',
      { cause: primary.cause },
    );
  }
  if (failures.length > 0)
    throw new AggregateError(failures, 'Access-decision fixture cleanup failed', {
      cause: failures[0],
    });
}

beforeEach(() => {
  try {
    const ownedDirectory = mkdtempSync(join(tmpdir(), 'wbs-access-decisions-'));
    fixtureCleanup.unshift(() => {
      rmSync(ownedDirectory, { recursive: true, force: true });
    });
    dir = ownedDirectory;
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const opened = openDatabase(path);
    fixtureCleanup.unshift(opened.close.bind(opened));
    sqlite = opened;
    seed();
    statements = [];
    const connection = openConnection(path, {
      logQuery(sql, bindings) {
        statements.push({ sql, bindings });
      },
    });
    fixtureCleanup.unshift(connection.close);
    decisions = new AccessDecisionRepository(connection.db);
    packages = new WorkPackageRepository(connection.db, OPEN);
  } catch (cause) {
    closeFixture({ cause });
  }
});

afterEach(() => {
  closeFixture();
});

let grantCount = 0;

/** Inserts one grant row directly (the grant store is task 1.4's). */
function grant(
  scopeKind: 'organization' | 'project' | 'work_package',
  scopeId: string,
  subjectKind: 'user' | 'group' | 'organization_members' | 'machine_credential',
  subjectId: string,
  roleId: string,
  organizationId = ORG,
): void {
  grantCount += 1;
  sqlite.run(
    `INSERT INTO access_grant (id, organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id, origin, created_at)
     VALUES ('grant-${String(grantCount)}', ?, ?, ?, ?, ?, ?, 'route', 1)`,
    [organizationId, scopeKind, scopeId, subjectKind, subjectId, roleId],
  );
}

/** Inserts a custom organization role with exactly `permissions` (empty allowed). */
function customRole(
  id: string,
  objectKind: 'organization' | 'project' | 'work_package',
  permissions: readonly string[],
  reachesRestricted = false,
): void {
  sqlite.run(
    `INSERT INTO access_role (id, name, object_kind, level, reaches_restricted, organization_id, created_at)
     VALUES (?, ?, ?, NULL, ?, 'org-a', 1)`,
    [id, id, objectKind, reachesRestricted ? 1 : 0],
  );
  for (const permission of permissions)
    sqlite.run('INSERT INTO access_role_permission (role_id, permission) VALUES (?, ?)', [
      id,
      permission,
    ]);
}

const person = (id: string): ScopedPrincipal => ({ id });
const machine = (accountId: string, credentialId: string): ScopedPrincipal => ({
  id: accountId,
  authentication: { kind: 'machine', credentialId, personId: `agent-${accountId}` },
});

async function packageTarget(packageId: string): Promise<AccessTarget> {
  const target = await decisions.packageTargetOf(packageId, null);
  if (target === null) throw new Error(`no package ${packageId}`);
  return target;
}

async function permissionsOn(
  principal: ScopedPrincipal,
  packageId: string,
): Promise<string[] | null> {
  const effective = await decisions.effectiveRoleAt(principal, await packageTarget(packageId));
  return effective === null ? null : [...effective.permissions].sort();
}

async function listed(principal: ScopedPrincipal): Promise<string[]> {
  return [...(await decisions.readablePackageIds(principal, ORG))].sort();
}

/** What `pending` rejected with; fails the case when it resolves. */
async function rejectionOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (cause) {
    return cause;
  }
  throw new Error('expected a rejection, the read resolved');
}

const organization: AccessTarget = { kind: 'organization', organizationId: ORG };

/**
 * The name SQLite gave `access_grant`'s six-column UNIQUE key. Autoindex names
 * (`sqlite_autoindex_<table>_<n>`) are SQLite's, numbered by constraint order,
 * so the plan assertion reads the name instead of spelling it.
 */
function grantKeyIndex(): string {
  const unique = sqlite
    .query<{ name: string; origin: string }, []>('PRAGMA index_list(access_grant)')
    .all()
    .filter(({ origin }) => origin === 'u')
    .map(({ name }) => name)
    .filter(
      (name) => sqlite.query<{ name: string }, []>(`PRAGMA index_info(${name})`).all().length === 6,
    );
  if (unique.length !== 1) throw new Error(`expected one six-column key, found ${String(unique)}`);
  return unique[0] ?? '';
}

describe('the current package target (historical interim expectations transitioned together)', () => {
  it('reads the organization and restriction from the package rows, null when absent', async () => {
    expect(await decisions.packageTargetOf('wp-closed', null)).toEqual({
      kind: 'work_package',
      chain: {
        level: 'work_package',
        organizationId: ORG,
        spaceId: null,
        projectId: 'proj',
        workPackageId: 'wp-closed',
      },
      restricted: true,
    });
    expect(await decisions.packageTargetOf('missing', null)).toBeNull();
  });

  it('a project grant reaches its current children in both detail and listing after the parent transition', async () => {
    grant('project', 'proj', 'user', 'ada', 'project-contributor');
    // Historical interim explanation below is retained; current assertions now exercise the coordinated parent branch.
    // A WorkPackageChain is assignable to the interim member; its workPackageId is
    // ignored, as the listing has no work package branch.
    const interim = await packageTarget('wp-open');
    if (interim.kind !== 'work_package') throw new Error('not a package target');
    const chain: WorkPackageChain = { ...interim.chain, spaceId: null, projectId: 'proj' };
    const target: AccessTarget = { kind: 'work_package', chain, restricted: false };
    expect((await decisions.effectiveRoleAt(person('ada'), target))?.permissions).toEqual(
      new Set(CONTRIBUTOR),
    );
    expect(await listed(person('ada'))).toEqual(['wp-closed', 'wp-open']);
  });
});

describe('who a grant reaches', () => {
  it('a direct grant: its set, its provenance, and its package listed', async () => {
    grant('work_package', 'wp-open', 'user', 'ada', 'package-contributor');
    expect(await decisions.effectiveRoleAt(person('ada'), await packageTarget('wp-open'))).toEqual({
      permissions: new Set(['organization.navigate', 'package.read', 'package.write']),
      via: [
        {
          scopeKind: 'work_package',
          scopeId: 'wp-open',
          subjectKind: 'user',
          subjectId: 'ada',
          roleId: 'package-contributor',
        },
      ],
    });
    expect(await permissionsOn(person('ada'), 'wp-two')).toBeNull();
    expect(await listed(person('ada'))).toEqual(['wp-open']);
  });

  it('a group grant reaches its members only', async () => {
    grant('work_package', 'wp-open', 'group', 'g', 'package-viewer');
    const effective = await decisions.effectiveRoleAt(
      person('bea'),
      await packageTarget('wp-open'),
    );
    expect(effective?.via).toEqual([
      {
        scopeKind: 'work_package',
        scopeId: 'wp-open',
        subjectKind: 'group',
        subjectId: 'g',
        roleId: 'package-viewer',
      },
    ]);
    expect(await permissionsOn(person('cy'), 'wp-open')).toBeNull();
    expect(await listed(person('bea'))).toEqual(['wp-open']);
    expect(await listed(person('cy'))).toEqual([]);
  });

  it('the organization-members subject reaches every current member', async () => {
    grant('organization', ORG, 'organization_members', ORG, 'project-viewer');
    expect(await permissionsOn(person('cy'), 'wp-open')).toEqual(READ_ONLY);
    expect(await listed(person('cy'))).toEqual(['wp-open', 'wp-two']);
    expect(await listed(person('bo'))).toEqual([]);
  });

  it('grants add up: the union of every reaching set, each one in via', async () => {
    grant('work_package', 'wp-open', 'user', 'dee', 'package-viewer');
    grant('work_package', 'wp-open', 'group', 'g', 'package-contributor');
    grant('organization', ORG, 'user', 'dee', 'org-viewer');
    const effective = await decisions.effectiveRoleAt(
      person('dee'),
      await packageTarget('wp-open'),
    );
    expect([...(effective?.permissions ?? [])].sort()).toEqual([
      'organization.navigate',
      'organization.read',
      'package.read',
      'package.write',
      'project.read',
    ]);
    expect(effective?.via.map(({ roleId }) => roleId).sort()).toEqual([
      'org-viewer',
      'package-contributor',
      'package-viewer',
    ]);
  });

  it('a grant of another organization reaches nothing here', async () => {
    grant('organization', 'org-b', 'user', 'ada', 'org-admin', 'org-b');
    expect(await permissionsOn(person('ada'), 'wp-open')).toBeNull();
    expect(await listed(person('ada'))).toEqual([]);
  });

  it('the organization target: every grant navigates, organization grants give their set', async () => {
    grant('work_package', 'wp-open', 'user', 'ada', 'package-viewer');
    expect(await decisions.effectiveRoleAt(person('ada'), organization)).toEqual({
      permissions: new Set(['organization.navigate']),
      via: [
        {
          scopeKind: 'work_package',
          scopeId: 'wp-open',
          subjectKind: 'user',
          subjectId: 'ada',
          roleId: 'package-viewer',
        },
      ],
    });
    grant('organization', ORG, 'user', 'ada', 'org-admin');
    const effective = await decisions.effectiveRoleAt(person('ada'), organization);
    expect(may(effective, 'organization.manage_access')).toBe(true);
    expect(await decisions.effectiveRoleAt(person('cy'), organization)).toEqual({
      permissions: new Set(),
      via: [],
    });
  });
});

describe('the kind rule on stored rows', () => {
  it('a package role at organization scope satisfies no project permission', async () => {
    grant('organization', ORG, 'user', 'ada', 'package-manager');
    const project: AccessTarget = {
      kind: 'project',
      chain: { level: 'project', organizationId: ORG, spaceId: null, projectId: 'proj' },
    };
    const atProject = await decisions.effectiveRoleAt(person('ada'), project);
    expect(may(atProject, 'project.manage_settings')).toBe(false);
    expect(may(atProject, 'project.read')).toBe(false);
    expect(may(await decisions.effectiveRoleAt(person('ada'), organization), 'project.grant')).toBe(
      false,
    );
    expect(await permissionsOn(person('ada'), 'wp-open')).toEqual([
      'organization.navigate',
      'package.claim_for_others',
      'package.manage_settings',
      'package.read',
      'package.write',
    ]);
  });

  it('a work package role holds package permissions on every package beneath it', async () => {
    grant('organization', ORG, 'user', 'ada', 'project-contributor');
    expect(await permissionsOn(person('ada'), 'wp-open')).toEqual(CONTRIBUTOR);
  });
});

describe('the restricted rule (P5, CP18)', () => {
  it('org-admin and org-super-admin read a restricted package and never write it', async () => {
    grant('organization', ORG, 'user', 'ada', 'org-admin');
    grant('organization', ORG, 'group', 'g', 'org-super-admin');
    expect(await permissionsOn(person('ada'), 'wp-closed')).toEqual(READ_ONLY);
    expect(await permissionsOn(person('bea'), 'wp-closed')).toEqual(READ_ONLY);
    expect(
      may(
        await decisions.effectiveRoleAt(person('ada'), await packageTarget('wp-open')),
        'package.write',
      ),
    ).toBe(true);
    expect(await listed(person('ada'))).toEqual(['wp-closed', 'wp-open', 'wp-two']);
    expect(await listed(person('bea'))).toEqual(['wp-closed', 'wp-open', 'wp-two']);
  });

  it('org-viewer, work package and package roles at organization scope and the members subject are skipped', async () => {
    grant('organization', ORG, 'user', 'cy', 'org-viewer');
    grant('organization', ORG, 'user', 'dee', 'project-contributor');
    grant('organization', ORG, 'user', 'mo', 'package-manager');
    grant('organization', ORG, 'organization_members', ORG, 'org-admin');
    for (const member of ['cy', 'dee', 'mo', 'bea']) {
      expect(await permissionsOn(person(member), 'wp-closed')).toBeNull();
      expect(await listed(person(member))).toEqual(['wp-open', 'wp-two']);
    }
  });

  it('custom organization roles: closed by default, read-only when they opt in', async () => {
    const adminSet = [
      'organization.navigate',
      'organization.read',
      'organization.manage_access',
      'project.read',
      'package.read',
      'package.write',
    ];
    customRole('custom-closed', 'organization', adminSet);
    customRole('custom-opted', 'organization', adminSet, true);
    grant('organization', ORG, 'user', 'cy', 'custom-closed');
    grant('organization', ORG, 'user', 'dee', 'custom-opted');
    expect(await permissionsOn(person('cy'), 'wp-closed')).toBeNull();
    expect(await permissionsOn(person('dee'), 'wp-closed')).toEqual(READ_ONLY);
    expect(await listed(person('cy'))).toEqual(['wp-open', 'wp-two']);
    expect(await listed(person('dee'))).toEqual(['wp-closed', 'wp-open', 'wp-two']);
  });

  it('a grant naming the restricted package applies unchanged', async () => {
    grant('work_package', 'wp-closed', 'user', 'mo', 'package-manager');
    grant('organization', ORG, 'user', 'mo', 'org-viewer');
    expect(
      may(
        await decisions.effectiveRoleAt(person('mo'), await packageTarget('wp-closed')),
        'package.write',
      ),
    ).toBe(true);
    expect(await listed(person('mo'))).toEqual(['wp-closed', 'wp-open', 'wp-two']);
  });
});

describe('visibility and membership', () => {
  it('an organization role without package.read lists nothing and every detail is invisible', async () => {
    customRole('budgets-only', 'organization', ['project.manage_budgets']);
    grant('organization', ORG, 'user', 'cy', 'budgets-only');
    for (const packageId of ['wp-open', 'wp-two', 'wp-closed'])
      expect(await permissionsOn(person('cy'), packageId)).toBeNull();
    expect(await listed(person('cy'))).toEqual([]);
    const atOrganization = await decisions.effectiveRoleAt(person('cy'), organization);
    expect(may(atOrganization, 'project.manage_budgets')).toBe(true);
    expect(may(atOrganization, 'organization.navigate')).toBe(true);
  });

  it('a removed member keeps no access', async () => {
    grant('work_package', 'wp-open', 'user', 'mo', 'package-manager');
    grant('organization', ORG, 'organization_members', ORG, 'project-viewer');
    expect(await permissionsOn(person('mo'), 'wp-open')).not.toBeNull();
    sqlite.run(
      "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = 'mo'",
    );
    expect(await permissionsOn(person('mo'), 'wp-open')).toBeNull();
    expect(await listed(person('mo'))).toEqual([]);
    expect(await decisions.effectiveRoleAt(person('mo'), organization)).toEqual({
      permissions: new Set(),
      via: [],
    });
  });
});

describe('the machine cap and subject (P12, P17)', () => {
  it('a person is uncapped; a credential holding org-admin reads as contributor', async () => {
    grant('organization', ORG, 'user', 'ada', 'org-admin');
    grant('organization', ORG, 'machine_credential', 'cred-ada', 'org-admin');
    expect(
      may(
        await decisions.effectiveRoleAt(person('ada'), await packageTarget('wp-open')),
        'package.manage_settings',
      ),
    ).toBe(true);
    expect(await permissionsOn(machine('ada', 'cred-ada'), 'wp-open')).toEqual(CONTRIBUTOR);
    const capped = await decisions.effectiveRoleAt(machine('ada', 'cred-ada'), organization);
    expect(
      [...(capped?.permissions ?? [])].every((permission) => CONTRIBUTOR_CAP.has(permission)),
    ).toBe(true);
    expect(may(capped, 'organization.manage_access')).toBe(false);
  });

  it('a machine principal holds only its credential grants', async () => {
    grant('organization', ORG, 'user', 'ada', 'org-admin');
    grant('organization', ORG, 'organization_members', ORG, 'project-viewer');
    grant('work_package', 'wp-open', 'group', 'g', 'package-manager');
    grant('work_package', 'wp-open', 'machine_credential', 'cred-ada', 'package-contributor');
    const agent = machine('ada', 'cred-ada');
    expect(await permissionsOn(agent, 'wp-open')).toEqual([
      'organization.navigate',
      'package.read',
      'package.write',
    ]);
    expect(await permissionsOn(agent, 'wp-two')).toBeNull();
    expect(await listed(agent)).toEqual(['wp-open']);
    expect(await listed(machine('ada', 'cred-other'))).toEqual([]);
    expect(
      (await decisions.effectiveRoleAt(person('ada'), await packageTarget('wp-open')))?.via
        .map(({ subjectKind }) => subjectKind)
        .sort(),
    ).toEqual(['organization_members', 'user']);
  });

  it('a credential whose account left the organization reaches nothing', async () => {
    grant('work_package', 'wp-open', 'machine_credential', 'cred-mo', 'package-contributor');
    sqlite.run(
      "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = 'mo'",
    );
    expect(await permissionsOn(machine('mo', 'cred-mo'), 'wp-open')).toBeNull();
    expect(await listed(machine('mo', 'cred-mo'))).toEqual([]);
  });
});

describe('corrupt role rows throw on both statements (CP9)', () => {
  it('throws UnknownPermissionRow on both statements', async () => {
    grant('work_package', 'wp-open', 'user', 'ada', 'package-viewer');
    sqlite.run(
      "INSERT INTO access_role_permission (role_id, permission) VALUES ('package-viewer', 'package.teleport')",
    );
    expect(await rejectionOf(permissionsOn(person('ada'), 'wp-open'))).toBeInstanceOf(
      UnknownPermissionRow,
    );
    expect(await rejectionOf(listed(person('ada')))).toBeInstanceOf(UnknownPermissionRow);
  });

  it('throws PermissionKindRow on both statements', async () => {
    grant('organization', ORG, 'user', 'ada', 'package-manager');
    sqlite.run(
      "INSERT INTO access_role_permission (role_id, permission) VALUES ('package-manager', 'project.manage_settings')",
    );
    expect(await rejectionOf(permissionsOn(person('ada'), 'wp-open'))).toBeInstanceOf(
      PermissionKindRow,
    );
    expect(
      await rejectionOf(decisions.effectiveRoleAt(person('ada'), organization)),
    ).toBeInstanceOf(PermissionKindRow);
    expect(await rejectionOf(listed(person('ada')))).toBeInstanceOf(PermissionKindRow);
  });

  it('throws EmptyRoleSet on both statements', async () => {
    customRole('empty', 'work_package', []);
    grant('work_package', 'wp-open', 'user', 'ada', 'empty');
    expect(await rejectionOf(permissionsOn(person('ada'), 'wp-open'))).toBeInstanceOf(EmptyRoleSet);
    expect(await rejectionOf(listed(person('ada')))).toBeInstanceOf(EmptyRoleSet);
  });
});

describe('corrupt stored columns throw (R5)', () => {
  // Each column below is bounded by a CHECK (or, for `workPackage.restricted`, by
  // its only writers); the fault is written past the CHECK on purpose.
  it('throws on a reaches_restricted outside 0 and 1, on both statements', async () => {
    grant('work_package', 'wp-open', 'user', 'ada', 'package-viewer');
    sqlite.run('PRAGMA ignore_check_constraints = ON');
    sqlite.run("UPDATE access_role SET reaches_restricted = 2 WHERE id = 'package-viewer'");
    const pattern = /access_role\.reaches_restricted of package-viewer is 2/;
    expect(String(await rejectionOf(permissionsOn(person('ada'), 'wp-open')))).toMatch(pattern);
    expect(String(await rejectionOf(listed(person('ada'))))).toMatch(pattern);
  });

  it('throws on a package restricted flag outside 0 and 1', async () => {
    sqlite.run("UPDATE work_package SET restricted = 2 WHERE id = 'wp-open'");
    expect(String(await rejectionOf(decisions.packageTargetOf('wp-open', null)))).toMatch(
      /restricted of package wp-open is 2/,
    );
  });

  it('throws on a grant scope kind outside its vocabulary, on both statements', async () => {
    grant('organization', ORG, 'user', 'ada', 'org-viewer');
    sqlite.run('PRAGMA ignore_check_constraints = ON');
    sqlite.run("UPDATE access_grant SET scope_kind = 'space', scope_id = 'space-1'");
    const pattern = /stored access_grant\.scope_kind space is outside its vocabulary/;
    expect(
      String(await rejectionOf(decisions.effectiveRoleAt(person('ada'), organization))),
    ).toMatch(pattern);
    expect(String(await rejectionOf(listed(person('ada'))))).toMatch(pattern);
  });
});

describe('one statement per call', () => {
  it('issues exactly one statement for each method, searching access_grant by subject', async () => {
    grant('organization', ORG, 'user', 'ada', 'org-admin');
    grant('work_package', 'wp-open', 'group', 'g', 'package-viewer');
    const target = await packageTarget('wp-closed');
    for (const principal of [person('ada'), machine('ada', 'cred-ada')]) {
      // The package target's scope rows make the six-column unique key exact;
      // the organization target and the listing read the principal's grants
      // through `access_grant_subject`. Neither scans `access_grant`.
      for (const [call, index] of [
        [() => decisions.effectiveRoleAt(principal, target), grantKeyIndex()],
        [() => decisions.effectiveRoleAt(principal, organization), 'access_grant_subject'],
        [() => decisions.readablePackageIds(principal, ORG), 'access_grant_subject'],
      ] as const) {
        statements = [];
        await call();
        expect(statements).toHaveLength(1);
        const statement = statements.at(0);
        if (statement === undefined) throw new Error('no statement recorded');
        // Drizzle's logger exposes unknown[]; this test boundary only receives
        // the scalar parameters the production statement binds.
        const bindings = statement.bindings as (string | number | null)[];
        const grantReads = sqlite
          .query<{ detail: string }, (string | number | null)[]>(
            `EXPLAIN QUERY PLAN ${statement.sql}`,
          )
          .all(...bindings)
          .map(({ detail }) => detail)
          .filter((detail) => /^(?:SCAN|SEARCH) g(?:\s|$)/.test(detail));
        expect(grantReads).toHaveLength(1);
        expect(grantReads.at(0)).toMatch(
          new RegExp(
            `^SEARCH g USING INDEX ${index} \\(organization_id=\\? AND .*subject_kind=\\? AND subject_id=\\?\\)$`,
          ),
        );
      }
    }
  });
});

describe('the admitted turn and the read stores', () => {
  it('both catalogs carry the decisions; a batch sees its own uncommitted grant', async () => {
    const source = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
    });
    try {
      const target = await packageTarget('wp-open');
      const publicDecisions = source.stores.accessDecisions;
      if (publicDecisions === undefined) throw new Error('the read stores carry no decisions');
      const inside = await source.uow.run(async ({ stores }) => {
        const admitted = stores.accessDecisions;
        if (admitted === undefined) throw new Error('the admitted stores carry no decisions');
        // Written on the batch's own connection; the grant store is task 1.4's.
        source.db.run(
          sql`INSERT INTO access_grant (id, organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id, origin, created_at)
              VALUES ('in-batch', 'org-a', 'work_package', 'wp-open', 'user', 'cy', 'package-viewer', 'route', 1)`,
        );
        const value = await admitted.effectiveRoleAt(person('cy'), target);
        return { commit: false, value };
      });
      expect(inside?.via.map(({ roleId }) => roleId)).toEqual(['package-viewer']);
      expect(await publicDecisions.effectiveRoleAt(person('cy'), target)).toBeNull();
    } finally {
      await source.close();
    }
  });
});

/** A deterministic generator (mulberry32) so a failing fixture reproduces by its seed. */
function generator(seedValue: number): () => number {
  let state = seedValue;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

describe('list and detail agree', () => {
  it('on generated fixtures, every listed id is readable in detail and the converse', async () => {
    customRole('budgets-only', 'organization', ['project.manage_budgets']);
    customRole('opted-reader', 'organization', ['organization.read', 'package.read'], true);
    customRole('closed-writer', 'organization', ['package.read', 'package.write']);
    const roles = [
      'org-super-admin',
      'org-admin',
      'org-viewer',
      'project-contributor',
      'project-viewer',
      'package-manager',
      'package-viewer',
      'budgets-only',
      'opted-reader',
      'closed-writer',
    ];
    const subjects: [string, string][] = [
      ['user', 'dee'],
      ['group', 'g'],
      ['organization_members', ORG],
      ['machine_credential', 'cred-dee'],
    ];
    const scopes: [string, string][] = [
      ['organization', ORG],
      ['work_package', 'wp-open'],
      ['work_package', 'wp-two'],
      ['work_package', 'wp-closed'],
    ];
    const packages = ['wp-closed', 'wp-open', 'wp-two'];
    for (let fixture = 1; fixture <= 40; fixture += 1) {
      const next = generator(fixture);
      const pick = <T>(values: readonly T[]): T => {
        const value = values[Math.floor(next() * values.length)];
        if (value === undefined) throw new Error('empty choice');
        return value;
      };
      sqlite.run('DELETE FROM access_grant');
      const written = new Set<string>();
      for (let index = 0; index < 1 + Math.floor(next() * 4); index += 1) {
        const [scopeKind, scopeId] = pick(scopes);
        const [subjectKind, subjectId] = pick(subjects);
        const roleId = pick(
          roles.filter((role) => scopeKind === 'organization' || role.startsWith('package-')),
        );
        const key = `${scopeKind}/${scopeId}/${subjectKind}/${subjectId}/${roleId}`;
        if (written.has(key)) continue;
        written.add(key);
        grant(
          scopeKind as 'organization' | 'work_package',
          scopeId,
          subjectKind as 'user' | 'group' | 'organization_members' | 'machine_credential',
          subjectId,
          roleId,
        );
      }
      for (const principal of [person('dee'), machine('dee', 'cred-dee')]) {
        const readable: string[] = [];
        for (const packageId of packages)
          if ((await permissionsOn(principal, packageId)) !== null) readable.push(packageId);
        expect(
          await listed(principal),
          `fixture ${String(fixture)}: ${[...written].join(', ')}`,
        ).toEqual(readable);
      }
    }
  });
});

describe('selected catalogue state beside independently sufficient authority', () => {
  for (const operation of [
    'organization-effective',
    'package-effective',
    'listing',
    'project-listing',
  ] as const) {
    for (const fault of [
      'orphan-role',
      'unknown-kind',
      'unknown-permission',
      'empty-set',
      'invalid-flag',
    ] as const) {
      it('rejects selected ' + fault + ' beside sufficient grant at ' + operation, async () => {
        grant('organization', ORG, 'user', 'ada', 'org-admin');
        expect(await permissionsOn(person('ada'), 'wp-open')).toContain('package.write');
        expect(await listed(person('ada'))).toEqual(['wp-closed', 'wp-open', 'wp-two']);
        customRole('selected-corrupt', 'organization', ['organization.read']);
        grant('organization', ORG, 'user', 'ada', 'selected-corrupt');
        if (fault === 'orphan-role') {
          sqlite.run('PRAGMA foreign_keys=OFF');
          try {
            sqlite.run("DELETE FROM access_role WHERE id='selected-corrupt'");
          } finally {
            sqlite.run('PRAGMA foreign_keys=ON');
          }
          expect(
            sqlite.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()?.foreign_keys,
          ).toBe(1);
        } else if (fault === 'unknown-kind' || fault === 'invalid-flag') {
          sqlite.run('PRAGMA ignore_check_constraints=ON');
          try {
            sqlite.run(
              fault === 'unknown-kind'
                ? "UPDATE access_role SET object_kind='space' WHERE id='selected-corrupt'"
                : "UPDATE access_role SET reaches_restricted=2 WHERE id='selected-corrupt'",
            );
          } finally {
            sqlite.run('PRAGMA ignore_check_constraints=OFF');
          }
        } else if (fault === 'unknown-permission') {
          sqlite.run(
            "INSERT INTO access_role_permission(role_id,permission) VALUES('selected-corrupt','package.teleport')",
          );
        } else sqlite.run("DELETE FROM access_role_permission WHERE role_id='selected-corrupt'");
        const snapshot = () =>
          [
            'access_role',
            'access_role_permission',
            'access_grant',
            'organization_membership',
            'work_package',
            'command_journal',
            'event_log',
            'organization_audit',
          ].map((table) => sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
        const before = snapshot();
        const pending =
          operation === 'project-listing'
            ? decisions.readableProjectIds(person('ada'), ORG)
            : operation === 'listing'
              ? decisions.readablePackageIds(person('ada'), ORG)
              : decisions.effectiveRoleAt(
                  person('ada'),
                  operation === 'organization-effective'
                    ? organization
                    : await packageTarget('wp-open'),
                );
        const failure = await rejectionOf(pending);
        if (fault === 'unknown-permission') expect(failure).toBeInstanceOf(UnknownPermissionRow);
        else if (fault === 'empty-set') expect(failure).toBeInstanceOf(EmptyRoleSet);
        else
          expect(String(failure)).toContain(
            fault === 'orphan-role'
              ? 'references missing access role selected-corrupt'
              : fault === 'unknown-kind'
                ? 'access_role.object_kind'
                : 'access_role.reaches_restricted',
          );
        expect(snapshot()).toEqual(before);
      });
    }
  }
});

for (const statement of ['effectiveRoleAt', 'readablePackageIds'] as const) {
  for (const corruptRole of ['project-contributor', 'nonreading project role'] as const) {
    it(
      'throws for an incompatible role scope through ' +
        statement +
        ' alongside sufficient valid authority: ' +
        corruptRole,
      async () => {
        grant('organization', ORG, 'user', 'ada', 'org-super-admin');
        expect(await permissionsOn(person('ada'), 'wp-open')).toContain('package.write');
        expect(await listed(person('ada'))).toContain('wp-open');
        const roleId = corruptRole === 'project-contributor' ? corruptRole : 'misbound-budget-role';
        if (corruptRole === 'nonreading project role')
          customRole(roleId, 'project', ['project.manage_budgets']);
        grant('work_package', 'wp-open', 'user', 'ada', roleId);
        const bad = sqlite
          .query<{ id: string }, [string, string]>(
            'SELECT id FROM access_grant WHERE role_id=? AND scope_kind=?',
          )
          .get(roleId, 'work_package');
        if (bad === null) throw new Error('missing incompatible raw grant fixture');
        const pending =
          statement === 'effectiveRoleAt'
            ? decisions.effectiveRoleAt(person('ada'), await packageTarget('wp-open'))
            : decisions.readablePackageIds(person('ada'), ORG);
        const failure = await pending.then(
          () => null,
          (failure: unknown) => failure,
        );
        expect(failure).toBeInstanceOf(Error);
        if (!(failure instanceof Error))
          throw new Error('expected incompatible trusted role scope failure');
        expect(failure.message).toContain(bad.id);
        expect(failure.message).toContain(roleId);
        expect(failure.message).toContain('project');
        expect(failure.message).toContain('work_package');
      },
    );
  }
}

/** Reads the new chain from actual current parent rows; the existing port accepts its structural subtype. */
function readCurrentParentTarget(packageId: string): AccessTarget {
  const recorded = sqlite
    .query<
      {
        organizationId: unknown;
        parentOrganizationId: unknown;
        projectId: unknown;
        restricted: unknown;
      },
      [string]
    >(
      `
    SELECT mapping.organization_id AS organizationId,
           parent.organization_id AS parentOrganizationId,
           package.project_id AS projectId, package.restricted AS restricted
    FROM work_package package
    JOIN work_package_organization mapping ON mapping.resource_id=package.id
    JOIN project parent ON parent.id=package.project_id
    WHERE package.id=?
  `,
    )
    .get(packageId);
  if (
    recorded === null ||
    typeof recorded.organizationId !== 'string' ||
    recorded.organizationId === '' ||
    recorded.parentOrganizationId !== recorded.organizationId ||
    typeof recorded.projectId !== 'string' ||
    recorded.projectId === '' ||
    (recorded.restricted !== 0 && recorded.restricted !== 1)
  )
    throw new Error('current parent fixture has no coherent package target: ' + packageId);
  const chain: WorkPackageChain = {
    level: 'work_package',
    organizationId: recorded.organizationId,
    spaceId: null,
    projectId: recorded.projectId,
    workPackageId: packageId,
  };
  return { kind: 'work_package', chain, restricted: recorded.restricted === 1 };
}

describe('the current parent permission foundation', () => {
  it('a real project grant reaches only its actual children in detail and listing', async () => {
    sqlite.run(
      "INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-b','ada','member',1)",
    );
    expect(
      sqlite
        .query(
          `
      SELECT package.id, package.project_id, mapping.organization_id,
             parent.organization_id AS parent_organization_id
      FROM work_package package
      JOIN work_package_organization mapping ON mapping.resource_id=package.id
      JOIN project parent ON parent.id=package.project_id ORDER BY package.id
    `,
        )
        .all(),
    ).toEqual([
      {
        id: 'wp-b',
        project_id: 'proj-b',
        organization_id: 'org-b',
        parent_organization_id: 'org-b',
      },
      { id: 'wp-closed', project_id: 'proj', organization_id: ORG, parent_organization_id: ORG },
      { id: 'wp-open', project_id: 'proj', organization_id: ORG, parent_organization_id: ORG },
      { id: 'wp-two', project_id: 'proj-two', organization_id: ORG, parent_organization_id: ORG },
    ]);
    expect(
      await decisions.effectiveRoleAt(person('ada'), readCurrentParentTarget('wp-open')),
    ).toBeNull();
    expect(await listed(person('ada'))).toEqual([]);
    grant('project', 'proj', 'user', 'ada', 'project-contributor');
    const open = await decisions.effectiveRoleAt(person('ada'), readCurrentParentTarget('wp-open'));
    const closed = await decisions.effectiveRoleAt(
      person('ada'),
      readCurrentParentTarget('wp-closed'),
    );
    const sibling = await decisions.effectiveRoleAt(
      person('ada'),
      readCurrentParentTarget('wp-two'),
    );
    const foreign = await decisions.effectiveRoleAt(person('ada'), readCurrentParentTarget('wp-b'));
    const visible = await listed(person('ada'));
    const foreignVisible = [...(await decisions.readablePackageIds(person('ada'), 'org-b'))].sort();
    expect({
      openPermissions: open === null ? null : [...open.permissions].sort(),
      closedPermissions: closed === null ? null : [...closed.permissions].sort(),
      openVia: open?.via,
      sibling,
      foreign,
      visible,
      foreignVisible,
    }).toEqual({
      openPermissions: CONTRIBUTOR,
      closedPermissions: CONTRIBUTOR,
      openVia: [
        {
          scopeKind: 'project',
          scopeId: 'proj',
          subjectKind: 'user',
          subjectId: 'ada',
          roleId: 'project-contributor',
        },
      ],
      sibling: null,
      foreign: null,
      visible: ['wp-closed', 'wp-open'],
      foreignVisible: [],
    });
  });

  it('a real parent budget grant contributes budget permission without package.write while organization authority stays read-only', async () => {
    grant('organization', ORG, 'user', 'mo', 'org-admin');
    const organizationOnly = await decisions.effectiveRoleAt(
      person('mo'),
      readCurrentParentTarget('wp-closed'),
    );
    expect(may(organizationOnly, 'package.read')).toBe(true);
    expect(may(organizationOnly, 'project.manage_budgets')).toBe(false);
    expect(may(organizationOnly, 'package.write')).toBe(false);
    customRole('parent-budget-reader', 'project', ['package.read', 'project.manage_budgets']);
    grant('project', 'proj', 'user', 'mo', 'parent-budget-reader');
    const held = await decisions.effectiveRoleAt(
      person('mo'),
      readCurrentParentTarget('wp-closed'),
    );
    const visible = await listed(person('mo'));
    expect({
      reads: may(held, 'package.read'),
      budgets: may(held, 'project.manage_budgets'),
      edits: may(held, 'package.write'),
      hasParent: held?.via.some(
        (via) =>
          via.scopeKind === 'project' &&
          via.scopeId === 'proj' &&
          via.roleId === 'parent-budget-reader',
      ),
      visible,
    }).toEqual({
      reads: true,
      budgets: true,
      edits: false,
      hasParent: true,
      visible: ['wp-closed', 'wp-open', 'wp-two'],
    });
  });

  it('removing actual membership removes a retained parent grant from detail and listing', async () => {
    grant('project', 'proj', 'user', 'ada', 'project-contributor');
    const before = await decisions.effectiveRoleAt(
      person('ada'),
      readCurrentParentTarget('wp-open'),
    );
    const beforeIds = await listed(person('ada'));
    sqlite.run(
      "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='ada'",
    );
    expect(
      sqlite
        .query<{ count: number }, []>(
          "SELECT count(*) AS count FROM access_grant WHERE scope_kind='project' AND scope_id='proj' AND subject_kind='user' AND subject_id='ada'",
        )
        .get(),
    ).toEqual({ count: 1 });
    const after = await decisions.effectiveRoleAt(
      person('ada'),
      readCurrentParentTarget('wp-open'),
    );
    const afterIds = await listed(person('ada'));
    expect({ beforeRead: may(before, 'package.read'), beforeIds, after, afterIds }).toEqual({
      beforeRead: true,
      beforeIds: ['wp-closed', 'wp-open'],
      after: null,
      afterIds: [],
    });
  });
});

describe('current parent trusted-state observation', () => {
  it('reads actual parent on one scoped statement and conceals a foreign package before its malformed content', async () => {
    statements.length = 0;
    expect((await packages.findInOrganization('wp-open', ORG))?.projectId).toBe('proj');
    expect(statements).toHaveLength(1);
    expect(await packages.findInOrganization('missing', ORG)).toBeNull();
    sqlite.run("UPDATE work_package SET restricted=2,estimate_method='invalid' WHERE id='wp-b'");
    expect(await packages.findInOrganization('wp-b', ORG)).toBeNull();
    expect(String(await rejectionOf(packages.findInOrganization('wp-b', 'org-b')))).toContain(
      'restricted of package wp-b is 2',
    );
  });

  it('throws on an owned foreign parent before grants even when no reader exists', async () => {
    // Both rows exist and the actual FK remains enabled; only their organization correspondence is corrupt.
    const readSchema = () =>
      sqlite
        .query<{ type: string; name: string; tbl_name: string; sql: string | null }, []>(
          'SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name',
        )
        .all();
    const schemaBefore = readSchema();
    const trigger = schemaBefore.find(
      (row) => row.type === 'trigger' && row.name === 'work_package_project_organization_update',
    );
    if (trigger === undefined || typeof trigger.sql !== 'string')
      throw new Error('Exact parent-organization update trigger is absent');
    const definition = trigger.sql;
    sqlite.transaction(() => {
      sqlite.run('DROP TRIGGER work_package_project_organization_update');
      sqlite.run("UPDATE work_package SET project_id='proj-b' WHERE id='wp-open'");
      sqlite.run(definition);
    })();
    expect(readSchema()).toEqual(schemaBefore);
    expect(sqlite.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()).toEqual({
      foreign_keys: 1,
    });
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    const diagnostic = 'package wp-open has an absent, malformed or foreign parent';
    expect(String(await rejectionOf(decisions.packageTargetOf('wp-open', null)))).toContain(
      diagnostic,
    );
    expect(String(await rejectionOf(packages.findInOrganization('wp-open', ORG)))).toContain(
      diagnostic,
    );
    statements.length = 0;
    expect(String(await rejectionOf(listed(person('ada'))))).toContain(diagnostic);
    expect(statements).toHaveLength(1);
  });

  it('does not hide an owned missing parent behind a LEFT JOIN or absent grants', async () => {
    const before = sqlite.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get();
    expect(before).toEqual({ foreign_keys: 1 });
    let primary: { readonly cause: unknown } | null = null;
    try {
      sqlite.run('PRAGMA foreign_keys=OFF');
      sqlite.run("UPDATE work_package SET project_id='absent-parent' WHERE id='wp-open'");
    } catch (cause) {
      primary = { cause };
    }
    let restoration: { readonly cause: unknown } | null = null;
    try {
      sqlite.run('PRAGMA foreign_keys=ON');
    } catch (cause) {
      restoration = { cause };
    }
    if (primary !== null) {
      if (restoration !== null)
        throw new AggregateError(
          [primary.cause, restoration.cause],
          'Parent corruptor and FK restoration failed',
          { cause: primary.cause },
        );
      throw primary.cause;
    }
    if (restoration !== null) throw restoration.cause;
    expect(sqlite.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()).toEqual({
      foreign_keys: 1,
    });
    const diagnostic = 'package wp-open has an absent, malformed or foreign parent';
    expect(String(await rejectionOf(decisions.packageTargetOf('wp-open', null)))).toContain(
      diagnostic,
    );
    expect(String(await rejectionOf(packages.findInOrganization('wp-open', ORG)))).toContain(
      diagnostic,
    );
    expect(String(await rejectionOf(listed(person('ada'))))).toContain(diagnostic);
  });

  it('validates a missing owned map through its real parent after restoring the exact protection trigger', async () => {
    const schema = () =>
      sqlite
        .query<{ type: string; name: string; tbl_name: string; sql: string | null }, []>(
          'SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name',
        )
        .all();
    const before = schema();
    const trigger = before.find(
      (row) => row.type === 'trigger' && row.name === 'work_package_organization_frozen_delete',
    );
    if (trigger === undefined || typeof trigger.sql !== 'string')
      throw new Error('missing exact ownership trigger');
    const definition = trigger.sql;
    sqlite.transaction(() => {
      sqlite.run('DROP TRIGGER work_package_organization_frozen_delete');
      sqlite.run("DELETE FROM work_package_organization WHERE resource_id='wp-open'");
      sqlite.run(definition);
    })();
    expect(schema()).toEqual(before);
    expect(sqlite.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()).toEqual({
      foreign_keys: 1,
    });
    const diagnostic = 'package wp-open has an absent or malformed organization mapping';
    expect(String(await rejectionOf(decisions.packageTargetOf('wp-open', null)))).toContain(
      diagnostic,
    );
    expect(String(await rejectionOf(packages.findInOrganization('wp-open', ORG)))).toContain(
      diagnostic,
    );
    expect(String(await rejectionOf(listed(person('ada'))))).toContain(diagnostic);
  });

  it('validates a selected malformed project role beside sufficient package authority in detail and listing', async () => {
    grant('project', 'proj', 'user', 'ada', 'project-contributor');
    grant('work_package', 'wp-open', 'user', 'ada', 'package-manager');
    sqlite.run(
      "INSERT INTO access_role_permission(role_id,permission) VALUES('project-contributor','package.teleport')",
    );
    expect(await rejectionOf(permissionsOn(person('ada'), 'wp-open'))).toBeInstanceOf(
      UnknownPermissionRow,
    );
    expect(await rejectionOf(listed(person('ada')))).toBeInstanceOf(UnknownPermissionRow);
  });
});

describe('batched current project reads', () => {
  const target = (projectId: string): AccessTarget => ({
    kind: 'project',
    chain: { level: 'project', organizationId: ORG, spaceId: null, projectId },
  });

  it('agrees with real detail decisions for account group members and project scopes', async () => {
    grant('project', 'proj', 'user', 'ada', 'project-viewer');
    grant('project', 'proj-two', 'group', 'g', 'project-contributor');
    grant('organization', ORG, 'organization_members', ORG, 'package-viewer');
    customRole('package-read-at-project', 'project', ['package.read']);
    grant('project', 'proj', 'user', 'cy', 'package-read-at-project');
    for (const principal of [person('ada'), person('bea'), person('cy'), person('mo')]) {
      const expected: string[] = [];
      for (const id of ['proj', 'proj-two'])
        if ((await decisions.effectiveRoleAt(principal, target(id))) !== null) expected.push(id);
      expect([...(await decisions.readableProjectIds(principal, ORG))].sort()).toEqual(expected);
    }
    expect([...(await decisions.readableProjectIds(person('cy'), ORG))]).toEqual([]);
    expect(await listed(person('cy'))).toEqual(['wp-closed', 'wp-open', 'wp-two']);
    expect([...(await decisions.readableProjectIds(person('bo'), ORG))]).toEqual([]);
  });

  it('uses one statement for many real projects and observes current membership', async () => {
    for (let index = 0; index < 12; index++)
      sqlite.run('INSERT INTO project(id,organization_id,name,created_at) VALUES(?,?,?,1)', [
        'batch-' + String(index),
        ORG,
        'Batch ' + String(index),
      ]);
    grant('organization', ORG, 'user', 'ada', 'org-viewer');
    statements.length = 0;
    const visible = await decisions.readableProjectIds(person('ada'), ORG);
    expect(visible.size).toBe(14);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain("'project'");
    sqlite.run(
      "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='ada'",
    );
    statements.length = 0;
    expect([...(await decisions.readableProjectIds(person('ada'), ORG))]).toEqual([]);
    expect(statements).toHaveLength(1);
  });

  for (const kind of ['machine', 'consent'] as const) {
    it(kind + ' project batch uses only its credential grants and the existing cap', async () => {
      grant('organization', ORG, 'user', 'ada', 'org-super-admin');
      grant('organization', ORG, 'organization_members', ORG, 'org-viewer');
      grant('project', 'proj-two', 'machine_credential', 'p3-credential', 'project-manager');
      const principal: ScopedPrincipal =
        kind === 'machine'
          ? machine('ada', 'p3-credential')
          : {
              id: 'ada',
              authentication: {
                kind: 'consent',
                credentialId: 'p3-credential',
                personId: 'agent-ada',
                issuer: 'https://issuer.test',
                subject: 'ada',
              },
            };
      expect([...(await decisions.readableProjectIds(principal, ORG))]).toEqual(['proj-two']);
      const effective = await decisions.effectiveRoleAt(principal, target('proj-two'));
      expect(may(effective, 'project.read')).toBe(true);
      expect(may(effective, 'project.manage_settings')).toBe(false);
      expect(await decisions.effectiveRoleAt(principal, target('proj'))).toBeNull();
      expect([
        ...(await decisions.readableProjectIds(machine('ada', 'other-credential'), ORG)),
      ]).toEqual([]);
    });
  }

  it('rejects a selected incompatible project role even beside sufficient organization authority', async () => {
    grant('organization', ORG, 'user', 'ada', 'org-viewer');
    grant('project', 'proj', 'user', 'ada', 'org-admin');
    const before = sqlite.query('SELECT * FROM access_grant ORDER BY id').all();
    const failure = await rejectionOf(decisions.readableProjectIds(person('ada'), ORG));
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('of organization kind cannot be held at project scope');
    expect(sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(before);
  });
});

it('rejects an actual malformed scoped project target before projecting the batch', async () => {
  grant('organization', ORG, 'user', 'ada', 'org-viewer');
  sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at) VALUES(x'0102','org-a','Malformed identity',1)",
  );
  const before = sqlite.query('SELECT * FROM project ORDER BY rowid').all();
  const failure = await rejectionOf(decisions.readableProjectIds(person('ada'), ORG));
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('Expected actual malformed target refusal');
  expect(failure.message).toBe('stored project permission target is malformed');
  expect(sqlite.query('SELECT * FROM project ORDER BY rowid').all()).toEqual(before);
});

it('ignores an actual foreign-organization grant in the scoped project batch', async () => {
  expect(
    sqlite
      .query(
        "SELECT organization_id FROM organization_membership WHERE user_id='ada' ORDER BY organization_id",
      )
      .all(),
  ).toEqual([{ organization_id: 'org-a' }]);
  grant('organization', 'org-b', 'user', 'ada', 'org-viewer', 'org-b');
  const readGrants = () =>
    sqlite
      .query(
        "SELECT organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id FROM access_grant WHERE subject_id='ada' ORDER BY id",
      )
      .all();
  const before = readGrants();
  expect(before).toEqual([
    {
      organization_id: 'org-b',
      scope_kind: 'organization',
      scope_id: 'org-b',
      subject_kind: 'user',
      subject_id: 'ada',
      role_id: 'org-viewer',
    },
  ]);
  expect([...(await decisions.readableProjectIds(person('ada'), ORG))]).toEqual([]);
  expect(readGrants()).toEqual(before);
});

it('ignores nonreaching package catalogue corruption beside an actual project grant', async () => {
  grant('project', 'proj', 'user', 'ada', 'project-viewer');
  expect([...(await decisions.readableProjectIds(person('ada'), ORG))]).toEqual(['proj']);
  customRole('p3-nonreaching-package', 'work_package', ['package.read']);
  grant('work_package', 'wp-open', 'user', 'ada', 'p3-nonreaching-package');
  sqlite.run(
    "INSERT INTO access_role_permission(role_id,permission) VALUES('p3-nonreaching-package','package.teleport')",
  );
  const readPermissions = () =>
    sqlite
      .query(
        "SELECT permission FROM access_role_permission WHERE role_id='p3-nonreaching-package' ORDER BY permission",
      )
      .all();
  const before = readPermissions();
  expect(before).toEqual([{ permission: 'package.read' }, { permission: 'package.teleport' }]);
  expect([...(await decisions.readableProjectIds(person('ada'), ORG))]).toEqual(['proj']);
  expect(readPermissions()).toEqual(before);
});
