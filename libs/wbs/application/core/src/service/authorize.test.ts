import type { EffectiveRole } from '@wbs/domain';
import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';

import type { AccessDecisions, AccessTarget, ScopedPrincipal } from '../ports/access-decisions';
import { authorize, authorizePackage, authorizePackageSettings } from './authorize';

const principal: ScopedPrincipal = { id: 'ada' };
const target: AccessTarget = {
  kind: 'work_package',
  chain: {
    level: 'work_package',
    organizationId: 'org-a',
    spaceId: null,
    projectId: 'project-a',
    workPackageId: 'wp-a',
  },
  restricted: false,
};

/** The boundary verdict, independent of the helper's permission/refusal policy. */
function createDecisions(effective: EffectiveRole | null): AccessDecisions {
  return {
    packageTargetOf: () =>
      Promise.reject(new Error('this evaluator-only test reads no package target')),
    effectiveRoleAt: (actor, scope) => {
      expect(actor).toBe(principal);
      expect(scope).toBe(target);
      return Promise.resolve(effective);
    },
    readablePackageIds: () => Promise.resolve(new Set()),
  };
}

/** Returns the rejection itself; a fulfilled decision fails the test. */
async function rejectionOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (cause) {
    return cause;
  }
  throw new Error('expected the authorization to reject');
}

describe('authorize', () => {
  it('answers not_found for an invisible work package', async () => {
    expect(await authorize(createDecisions(null), principal, target, 'package.write')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('names the missing permission on a visible work package', async () => {
    const effective: EffectiveRole = { permissions: new Set(['package.read']), via: [] };
    expect(await authorize(createDecisions(effective), principal, target, 'package.write')).toEqual(
      {
        ok: false,
        reason: 'forbidden',
        permission: 'package.write',
      },
    );
  });

  it('returns the effective permissions and provenance when permitted', async () => {
    const effective: EffectiveRole = {
      permissions: new Set(['package.read', 'package.write']),
      via: [
        {
          scopeKind: 'work_package',
          scopeId: 'wp-a',
          subjectKind: 'user',
          subjectId: 'ada',
          roleId: 'package-contributor',
        },
      ],
    };
    expect(await authorize(createDecisions(effective), principal, target, 'package.write')).toEqual(
      {
        ok: true,
        effective,
      },
    );
  });

  it('answers forbidden for an organization with no grant', async () => {
    const decisions: AccessDecisions = {
      packageTargetOf: () =>
        Promise.reject(new Error('this evaluator-only test reads no package target')),
      effectiveRoleAt: () => Promise.resolve({ permissions: new Set(), via: [] }),
      readablePackageIds: () => Promise.resolve(new Set()),
    };
    expect(
      await authorize(
        decisions,
        principal,
        { kind: 'organization', organizationId: 'org-a' },
        'organization.read',
      ),
    ).toEqual({
      ok: false,
      reason: 'forbidden',
      permission: 'organization.read',
    });
  });

  it('throws when an organization decision violates its non-null contract', async () => {
    const decisions: AccessDecisions = {
      packageTargetOf: () =>
        Promise.reject(new Error('this evaluator-only test reads no package target')),
      effectiveRoleAt: () => Promise.resolve(null),
      readablePackageIds: () => Promise.resolve(new Set()),
    };
    expect(
      String(
        await rejectionOf(
          authorize(
            decisions,
            principal,
            { kind: 'organization', organizationId: 'org-a' },
            'organization.read',
          ),
        ),
      ),
    ).toMatch(/organization.*null/);
  });

  it('throws when a memory catalog carries no access decisions', async () => {
    const source = openMemorySource();
    try {
      expect(
        String(
          await rejectionOf(
            source.uow.run(async ({ stores }) => {
              const decision = await authorize(
                stores.accessDecisions,
                principal,
                target,
                'package.write',
              );
              return { commit: decision.ok, value: decision };
            }),
          ),
        ),
      ).toMatch(/access decisions/);
    } finally {
      await source.close();
    }
  });

  it('propagates unreadable trusted state', async () => {
    const fault = new Error('permission store unreadable');
    const decisions: AccessDecisions = {
      packageTargetOf: () =>
        Promise.reject(new Error('this evaluator-only test reads no package target')),
      effectiveRoleAt: () => Promise.reject(fault),
      readablePackageIds: () => Promise.resolve(new Set()),
    };
    expect(await rejectionOf(authorize(decisions, principal, target, 'package.write'))).toBe(fault);
  });
});

describe('required current parent forwarding', () => {
  it('forwards the actual parent in both package and settings decisions', async () => {
    const observed: AccessTarget[] = [];
    const currentTarget: Extract<AccessTarget, { readonly kind: 'work_package' }> = {
      kind: 'work_package',
      chain: {
        level: 'work_package',
        organizationId: 'org-a',
        spaceId: 'actual-space',
        projectId: 'actual-parent',
        workPackageId: 'wp-a',
      },
      restricted: true,
    };
    const decisions: AccessDecisions = {
      packageTargetOf: (id, organizationId) => {
        expect([id, organizationId]).toEqual(['wp-a', 'org-a']);
        return Promise.resolve(currentTarget);
      },
      effectiveRoleAt: (_principal, scope) => {
        observed.push(scope);
        const effective: EffectiveRole = {
          permissions: new Set(['package.read', 'package.write', 'package.manage_settings']),
          via: [],
        };
        return Promise.resolve(effective);
      },
      readablePackageIds: () => Promise.resolve(new Set()),
    };
    const current = { id: 'wp-a', projectId: 'actual-parent', restricted: true };
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: 'ada', cap: null },
      principal,
    };
    expect((await authorizePackage(decisions, access, current, 'ada', 'package.write')).ok).toBe(
      true,
    );
    expect(
      (await authorizePackageSettings(decisions, principal, currentTarget, { name: 'Renamed' })).ok,
    ).toBe(true);
    expect(observed).toEqual(
      [0, 1].map(() => ({
        kind: 'work_package',
        chain: {
          level: 'work_package',
          organizationId: 'org-a',
          spaceId: 'actual-space',
          projectId: 'actual-parent',
          workPackageId: 'wp-a',
        },
        restricted: true,
      })),
    );
  });
});
