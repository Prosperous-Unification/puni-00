import type { Clock, ProvisioningTokens, ScimUsers } from '@wbs/core';

/**
 * SCIM provisioning (`organization-scim`): token administration and the
 * Users subset over the shared stores, and the clock both stamp and judge
 * token lifetimes and admission with. Production wires the SQLite stores,
 * which stay inert until organization activation.
 */
export interface Provisioning {
  readonly tokens: ProvisioningTokens;
  readonly users: ScimUsers;
  readonly clock: Pick<Clock, 'now'>;
  /** The canonical SCIM `userName`: the same form a sign-in's email takes. */
  readonly canonicalUserName: (raw: string) => string | null;
}

const inactive = () => Promise.resolve({ kind: 'inactive' } as const);

/**
 * Provisioning for an app composed without it (tests that are not about
 * SCIM): administration answers `no_active_organization`, no token
 * authenticates, and the Users store is never reached. `boot.db.test.ts`
 * proves production does not fall back to it.
 */
export const REFUSE_PROVISIONING: Provisioning = {
  tokens: {
    list: () => Promise.resolve('inactive'),
    issue: inactive,
    rotate: inactive,
    revoke: () => Promise.resolve('inactive'),
    authenticate: () => Promise.resolve(null),
  },
  users: {
    list: unreachable,
    find: unreachable,
    provision: unreachable,
    update: unreachable,
    remove: unreachable,
    activate: () => Promise.resolve([]),
  },
  clock: { now: () => Date.now() },
  canonicalUserName: unreachable,
};

/** No token authenticates, so no SCIM request reaches the Users store. */
function unreachable(): never {
  throw new Error('SCIM users reached without an authenticated provisioning token');
}
