import type { EffectiveRole } from '@wbs/domain';
import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';

import type { AccessDecisions, AccessTarget, ScopedPrincipal } from '../ports/access-decisions';
import { authorize } from './authorize';

const principal: ScopedPrincipal = { id: 'ada' };
const target: AccessTarget = {
  kind: 'work_package',
  chain: { level: 'work_package', organizationId: 'org-a', workPackageId: 'wp-a' },
  restricted: false,
};

/** The boundary verdict, independent of the helper's permission/refusal policy. */
function createDecisions(effective: EffectiveRole | null): AccessDecisions {
  return {
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
      effectiveRoleAt: () => Promise.reject(fault),
      readablePackageIds: () => Promise.resolve(new Set()),
    };
    expect(await rejectionOf(authorize(decisions, principal, target, 'package.write'))).toBe(fault);
  });
});
