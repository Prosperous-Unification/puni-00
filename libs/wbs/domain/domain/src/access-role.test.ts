import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import {
  ACCESS_OBJECT_KINDS,
  BUILT_IN_ROLES,
  combineGrants,
  CONTRIBUTOR_CAP,
  type EffectiveRole,
  type GrantSubjectKind,
  type GrantTarget,
  kindOfPermission,
  may,
  type Permission,
  PERMISSIONS,
  permissionsOnTarget,
  type ReachingGrant,
  READ_ONLY,
  roleMayHold,
} from './access-role';
import { parsePermissionMatrix } from './permission-matrix';

const CHANGE = new URL('../../../../../openspec/changes/wbs-permissions/', import.meta.url);
const MATRIX = parsePermissionMatrix(readFileSync(new URL('permission-matrix.md', CHANGE), 'utf8'));

/**
 * The "Kind" column of design.md's "Permission vocabulary" table, the metadata
 * {@link PERMISSIONS} carries (CP16). Throws on a row it cannot read.
 */
function kindsOfDesign(): ReadonlyMap<string, string> {
  const design = readFileSync(new URL('design.md', CHANGE), 'utf8').split('\n');
  const heading = design.indexOf('## Permission vocabulary');
  const header = design.findIndex(
    (line, index) => index > heading && line.startsWith('| Permission'),
  );
  if (heading === -1 || header === -1) throw new Error('design.md has no vocabulary table');
  const kinds = new Map<string, string>();
  for (const line of design.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const match = /^\| `([^`]+)`[^|]*\| (\S+)\s+\|/.exec(line);
    if (match === null) throw new Error(`unreadable vocabulary row ${line}`);
    kinds.set(match[1], match[2]);
  }
  return kinds;
}

const PERMISSION_IDS: readonly Permission[] = PERMISSIONS.map(({ id }) => id);
const role = (id: string) => {
  const found = BUILT_IN_ROLES.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no built-in ${id}`);
  return found;
};

function grantOf(
  roleId: string,
  overrides: Partial<ReachingGrant> = {},
  subjectKind: GrantSubjectKind = 'user',
): ReachingGrant {
  return {
    scopeKind: 'organization',
    scopeId: 'org-a',
    subjectKind,
    subjectId: subjectKind === 'organization_members' ? 'org-a' : 'dany',
    roleId,
    builtIn: true,
    permissions: new Set(role(roleId).permissions),
    ...overrides,
  };
}

const RESTRICTED: GrantTarget = { kind: 'work_package', restricted: true };
const OPEN: GrantTarget = { kind: 'work_package', restricted: false };

describe('the catalogue against permission-matrix.md', () => {
  it('names the vocabulary of the matrix, ids compared, never a count', () => {
    expect([...PERMISSION_IDS].sort()).toEqual([...MATRIX.permissions].sort());
    expect(BUILT_IN_ROLES.map(({ id }) => id)).toEqual([...MATRIX.roles.keys()]);
  });

  // Proof: flipping one cell of the matrix (`package-contributor` ×
  // `package.write` emptied) failed this case on that cell alone; watched
  // 2026-10-25, the file restored after.
  it('seeds every built-in role with exactly its matrix column, cell by cell', () => {
    for (const [roleId, held] of MATRIX.roles)
      for (const permission of PERMISSION_IDS)
        expect({
          roleId,
          permission,
          held: new Set(role(roleId).permissions).has(permission),
        }).toEqual({ roleId, permission, held: held.has(permission) });
  });

  it('carries the kind of design.md’s vocabulary table for every permission', () => {
    const kinds = kindsOfDesign();
    expect([...kinds.keys()].sort()).toEqual([...PERMISSION_IDS].sort());
    for (const permission of PERMISSION_IDS)
      expect(`${permission}: ${kinds.get(permission) ?? 'missing'}`).toBe(
        `${permission}: ${kindOfPermission(permission)}`,
      );
  });

  // One case per permission: the roles holding it, read from the matrix.
  for (const permission of PERMISSIONS.map(({ id }) => id))
    it(`seeds ${permission} into exactly the roles of its matrix row`, () => {
      const holders = BUILT_IN_ROLES.filter((candidate) =>
        new Set<Permission>(candidate.permissions).has(permission),
      ).map(({ id }) => id);
      const expected = [...MATRIX.roles]
        .filter(([, held]) => held.has(permission))
        .map(([id]) => id);
      expect(holders).toEqual(expected);
      expect(may({ permissions: new Set([permission]), via: [] }, permission)).toBe(true);
    });
});

describe('parsePermissionMatrix', () => {
  const table = (header: string, row: string) =>
    `## Roles and the permissions they imply\n\n${header}\n| --- | --- |\n${row}\n\nafter\n`;

  it('refuses an unknown permission, an unknown role and an unknown cell rather than skip it', () => {
    expect(() =>
      parsePermissionMatrix(table('| Permission | org-admin |', '| `package.launch` | yes |')),
    ).toThrow('unknown permission');
    expect(() =>
      parsePermissionMatrix(table('| Permission | org-owner |', '| `package.read` | yes |')),
    ).toThrow('unknown role org-owner');
    expect(() =>
      parsePermissionMatrix(table('| Permission | org-admin |', '| `package.read` | maybe |')),
    ).toThrow('reads "maybe"');
    expect(() => parsePermissionMatrix('# nothing here\n')).toThrow('no "## Roles');
  });

  it('reads "shell only" as no row and a suffix after the id as the id', () => {
    const matrix = parsePermissionMatrix(
      table(
        '| Permission | package-viewer |',
        '| `project.read` | shell only (P3) |\n| `project.manage_dependencies` (reserved) | yes |',
      ),
    );
    expect(matrix.permissions).toEqual(['project.read', 'project.manage_dependencies']);
    expect([...(matrix.roles.get('package-viewer') ?? [])]).toEqual([
      'project.manage_dependencies',
    ]);
  });
});

describe('roleMayHold', () => {
  it('every seeded row satisfies roleMayHold', () => {
    for (const builtIn of BUILT_IN_ROLES)
      for (const permission of builtIn.permissions)
        expect({
          role: builtIn.id,
          permission,
          holds: roleMayHold(builtIn.objectKind, permission),
        }).toEqual({ role: builtIn.id, permission, holds: true });
  });

  it('never lets a project role hold an organization permission, nor a package role a project one', () => {
    for (const permission of PERMISSION_IDS) {
      const kind = kindOfPermission(permission);
      expect(roleMayHold('project', permission)).toBe(kind !== 'organization');
      expect(roleMayHold('work_package', permission)).toBe(
        kind === 'any' || kind === 'work_package',
      );
      expect(roleMayHold('organization', permission)).toBe(true);
    }
  });

  it('allows navigation in every kind, so a copy of package-manager is a valid package role', () => {
    for (const objectKind of ACCESS_OBJECT_KINDS)
      expect(roleMayHold(objectKind, 'organization.navigate')).toBe(true);
    expect(role('package-manager').permissions.every((p) => roleMayHold('work_package', p))).toBe(
      true,
    );
  });
});

describe('may and the cap', () => {
  it('is set membership, and null is invisible', () => {
    fc.assert(
      fc.property(
        fc.subarray([...PERMISSION_IDS]),
        fc.constantFrom(...PERMISSION_IDS),
        (held, asked) => {
          const effective: EffectiveRole = { permissions: new Set(held), via: [] };
          expect(may(effective, asked)).toBe(held.includes(asked));
          expect(may(null, asked)).toBe(false);
        },
      ),
    );
  });

  it('caps at the union of the two contributor sets, excluding every grant and manage permission', () => {
    expect([...CONTRIBUTOR_CAP].sort()).toEqual([
      'organization.navigate',
      'package.read',
      'package.write',
      'project.read',
    ]);
    for (const permission of PERMISSION_IDS)
      if (/manage|grant|claim_for_others/.test(permission))
        expect({ permission, capped: CONTRIBUTOR_CAP.has(permission) }).toEqual({
          permission,
          capped: false,
        });
  });

  it('a machine principal never manages budgets, whatever its grant', () => {
    for (const roleId of ['org-super-admin', 'org-admin', 'project-manager']) {
      const effective = combineGrants([grantOf(roleId)], OPEN, CONTRIBUTOR_CAP);
      expect(may(effective, 'project.manage_budgets')).toBe(false);
      expect(may(effective, 'package.write')).toBe(true);
    }
    const custom = grantOf('project-manager', {
      roleId: '01JCUSTOMBUDGETS',
      builtIn: false,
      permissions: new Set<Permission>(['project.read', 'project.manage_budgets']),
    });
    expect(may(combineGrants([custom], OPEN, CONTRIBUTOR_CAP), 'project.manage_budgets')).toBe(
      false,
    );
    expect(may(combineGrants([custom], OPEN, null), 'project.manage_budgets')).toBe(true);
  });

  it('a machine principal never claims for others, whatever its grant', () => {
    for (const roleId of [
      'package-manager',
      'package-contributor',
      'project-manager',
      'org-admin',
    ]) {
      const effective = combineGrants(
        [grantOf(roleId, { scopeKind: 'work_package', scopeId: 'wp' })],
        OPEN,
        CONTRIBUTOR_CAP,
      );
      expect({ roleId, claims: may(effective, 'package.claim_for_others') }).toEqual({
        roleId,
        claims: false,
      });
    }
  });

  it('never widens a capped set beyond the cap, for any grants', () => {
    const anyGrant = fc.record({
      roleId: fc.constantFrom(...BUILT_IN_ROLES.map(({ id }) => id)),
      scopeKind: fc.constantFrom(...ACCESS_OBJECT_KINDS),
    });
    fc.assert(
      fc.property(fc.array(anyGrant, { maxLength: 6 }), fc.boolean(), (grants, restricted) => {
        const effective = combineGrants(
          grants.map(({ roleId, scopeKind }) => grantOf(roleId, { scopeKind })),
          { kind: 'work_package', restricted },
          CONTRIBUTOR_CAP,
        );
        for (const permission of effective.permissions)
          expect(CONTRIBUTOR_CAP.has(permission)).toBe(true);
      }),
    );
  });
});

describe('permissionsOnTarget (P5 in sets, CP18)', () => {
  it('leaves every grant unchanged on an unrestricted package, a project and the organization', () => {
    for (const target of [OPEN, { kind: 'project' }, { kind: 'organization' }] as const)
      for (const roleId of ['org-viewer', 'org-admin', 'project-contributor'])
        expect(permissionsOnTarget(grantOf(roleId), target)).toEqual({
          outcome: 'unchanged',
          permissions: new Set(role(roleId).permissions),
        });
  });

  it('leaves a grant naming the package or its project unchanged on a restricted package', () => {
    for (const scopeKind of ['project', 'work_package'] as const)
      expect(permissionsOnTarget(grantOf('package-manager', { scopeKind }), RESTRICTED)).toEqual({
        outcome: 'unchanged',
        permissions: new Set(role('package-manager').permissions),
      });
  });

  it('an org-admin reads a restricted work package and never writes it', () => {
    for (const roleId of ['org-admin', 'org-super-admin'])
      for (const subjectKind of ['user', 'group', 'machine_credential'] as const) {
        expect(permissionsOnTarget(grantOf(roleId, {}, subjectKind), RESTRICTED)).toEqual({
          outcome: 'read_only',
          permissions: READ_ONLY,
        });
        const effective = combineGrants([grantOf(roleId, {}, subjectKind)], RESTRICTED, null);
        expect(may(effective, 'package.read')).toBe(true);
        expect(may(effective, 'package.write')).toBe(false);
        expect(may(effective, 'package.manage_settings')).toBe(false);
      }
  });

  it('skips every other organization-scope grant on a restricted package', () => {
    for (const roleId of ['org-viewer', 'project-manager', 'project-contributor', 'package-viewer'])
      expect(permissionsOnTarget(grantOf(roleId), RESTRICTED)).toEqual({ outcome: 'skipped' });
    expect(
      permissionsOnTarget(grantOf('org-admin', {}, 'organization_members'), RESTRICTED),
    ).toEqual({ outcome: 'skipped' });
    const effective = combineGrants([grantOf('org-viewer')], RESTRICTED, null);
    expect(effective).toEqual({ permissions: new Set(), via: [] });
    expect(may(effective, 'package.read')).toBe(false);
  });

  it('a custom organization role equal to org-admin reads no restricted work package', () => {
    const custom = grantOf('org-admin', { roleId: '01JCUSTOMADMIN', builtIn: false });
    expect(permissionsOnTarget(custom, RESTRICTED)).toEqual({ outcome: 'skipped' });
    expect(may(combineGrants([custom], RESTRICTED, null), 'package.read')).toBe(false);
    expect(may(combineGrants([custom], OPEN, null), 'package.write')).toBe(true);
  });

  it('unions the reaching grants and reports only the ones that contributed', () => {
    const effective = combineGrants(
      [
        grantOf('org-viewer'),
        grantOf('package-contributor', { scopeKind: 'work_package', scopeId: 'wp' }),
      ],
      RESTRICTED,
      null,
    );
    expect([...effective.permissions].sort()).toEqual([
      'organization.navigate',
      'package.read',
      'package.write',
    ]);
    expect(effective.via).toEqual([
      {
        scopeKind: 'work_package',
        scopeId: 'wp',
        subjectKind: 'user',
        subjectId: 'dany',
        roleId: 'package-contributor',
      },
    ]);
  });
});
