import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AccessTarget, ScopedPrincipal } from '@wbs/core';
import {
  CONTRIBUTOR_CAP,
  EmptyRoleSet,
  may,
  PermissionKindRow,
  UnknownPermissionRow,
} from '@wbs/domain';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { AccessDecisionRepository } from './access-decisions';
import { openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { openSqliteSource } from './source';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ORG = 'org-a';
const READ_ONLY = ['organization.navigate', 'package.read', 'project.read'];
const CONTRIBUTOR = ['organization.navigate', 'package.read', 'package.write', 'project.read'];

let dir: string;
let path: string;
let sqlite: Database;
let decisions: AccessDecisionRepository;
let statements: { sql: string; bindings: unknown[] }[];

/**
 * `org-a` with members ada, bea, cy, dee and mo, and `org-b` with bo. Work
 * packages (today's `project` rows): `wp-open` and `wp-two` unrestricted,
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
    `INSERT INTO project (id, name, owner_id, restricted, created_at) VALUES
     ('wp-open', 'Open', 'ada', 0, 1), ('wp-two', 'Two', 'ada', 0, 1),
     ('wp-closed', 'Closed', 'mo', 1, 1), ('wp-b', 'B', 'bo', 0, 1)`,
  );
  sqlite.run(
    `INSERT INTO project_organization (resource_id, organization_id) VALUES
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-access-decisions-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  sqlite = openDatabase(path);
  seed();
  statements = [];
  decisions = new AccessDecisionRepository(
    openDrizzle(path, {
      logQuery(sql, bindings) {
        statements.push({ sql, bindings });
      },
    }),
  );
});

afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
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

async function packageTarget(workPackageId: string): Promise<AccessTarget> {
  const target = await decisions.packageTargetOf(workPackageId);
  if (target === null) throw new Error(`no package ${workPackageId}`);
  return target;
}

async function permissionsOn(
  principal: ScopedPrincipal,
  workPackageId: string,
): Promise<string[] | null> {
  const effective = await decisions.effectiveRoleAt(principal, await packageTarget(workPackageId));
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

describe('the interim package target', () => {
  it('reads the organization and restriction from the package rows, null when absent', async () => {
    expect(await decisions.packageTargetOf('wp-closed')).toEqual({
      kind: 'work_package',
      chain: { level: 'work_package', organizationId: ORG, workPackageId: 'wp-closed' },
      restricted: true,
    });
    expect(await decisions.packageTargetOf('missing')).toBeNull();
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

  it('a project role holds package permissions on every package beneath it', async () => {
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

  it('org-viewer, project and package roles at organization scope and the members subject are skipped', async () => {
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
    for (const workPackageId of ['wp-open', 'wp-two', 'wp-closed'])
      expect(await permissionsOn(person('cy'), workPackageId)).toBeNull();
    expect(await listed(person('cy'))).toEqual([]);
    const atOrganization = await decisions.effectiveRoleAt(person('cy'), organization);
    expect(may(atOrganization, 'project.manage_budgets')).toBe(true);
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
        [() => decisions.effectiveRoleAt(principal, target), 'sqlite_autoindex_access_grant_2'],
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
    const source = openSqliteSource({ dbPath: path });
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
        for (const workPackageId of packages)
          if ((await permissionsOn(principal, workPackageId)) !== null)
            readable.push(workPackageId);
        expect(
          await listed(principal),
          `fixture ${String(fixture)}: ${[...written].join(', ')}`,
        ).toEqual(readable);
      }
    }
  });
});
