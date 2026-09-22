import type { WbsScope } from './oidc-identity';

/**
 * Who a request is, once a session token has been read and believed.
 *
 * It lives in the contracts library rather than beside the authentication
 * service because four use cases — the command batch, the replay, the save and
 * the retention sweep — admit on it without being about authentication. A type
 * exported from the service makes each of them import a sibling feature, which
 * rule K6 of `docs/superpowers/specs/2026-09-19-code-organization-design.md`
 * forbids; every relevant backend kind may import Contracts.
 *
 * `scopes` is what the token carried, not what the account may ever hold: an
 * older token keeps the scopes it was minted with until it expires.
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  scopes: readonly WbsScope[];
}

/**
 * The gateway or another trusted process, admitted by the internal adapter.
 *
 * It carries no id on purpose. An internal caller acts for the deployment, not
 * for a person, and a field to put a person in would be one somebody fills.
 */
export interface InternalIdentity {
  kind: 'internal';
}
