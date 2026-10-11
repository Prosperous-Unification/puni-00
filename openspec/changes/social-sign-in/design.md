## Context

The durable identity key is `(issuer, subject)` (`users.idp_issuer/idp_sub` and, after organization
activation, `external_identity`). Auth0 mints `sub` as `{connection}|{id}` and keeps identities
separate by default, so Google, GitHub and the email code are three subjects for one person. Before
this change one user could hold only one pair, and a second subject whose verified email another
account already holds resolved to `null`, which the callback answered with an empty 409.

## D2. Methods are configuration over a closed catalogue

`AUTH_METHODS` in `@wbs/contracts` maps our ids to Auth0's default connection names and labels:
`google → google-oauth2`, `github → github`, `email → email`, `apple → apple`, in that order.
The `AUTH_METHODS` env is required in `AUTH_MODE=oidc`: a comma list of ids or the literal `none`;
missing, empty, unknown, repeated or mixed with `none` fails boot (R5: no default). Local mode
ignores it and its `/api/auth/methods` answers an empty list, so fe-01 shows the chooser link alone.

`GET /api/auth/login?method=<id>` validates the id at the boundary (closed query), refuses a
catalogue id that is not enabled with `400 invalid_query` before a transaction or binding exists,
and otherwise passes `connection` to `/authorize`. No `method` keeps the chooser. The swap
preflight requires `AUTH_METHODS` in `be-01.env` and mirrors the value rule; the k8s overlays set
`none` until organization activation.

## D4. The collision is a rendered redirect

`resolveOidcIdentity` returning `null` (unmapped pair, verified email held elsewhere) answers
`302 /?auth_error=account_exists`, clearing the consumed binding and issuing no session. The
location names no provider or method. fe-01 says: "An account already uses this email address with
a different sign-in method. Sign in the way you did before, then add this method under Account."
The person has just proven the address at the provider, so admitting that an account exists for it
discloses nothing they could not learn by trying the other method.

## D6. One user, several verified pairs

WBS-side linking only; Auth0 account linking is never used (it rewrites the secondary `sub`, is
plan-gated and needs Management API credentials).

`users.idp_issuer/idp_sub` is the account's **first** pair (null for password accounts);
`external_identity` holds every pair, the first included. Invariants:

1. A pair maps to at most one user (unique index).
2. If a user has its own pair, that pair is mapped to that user.
3. A user's verified email is held by no other user as email or email-shaped username.
4. Login resolves mapping → owner; an owner whose own pair violates 2 is corrupt trusted state and
   throws.
5. Explicit link: a new pair may join an account that already has a different own pair iff the own
   pair satisfies 2 and the new pair is unmapped. An already-mapped pair on the same account answers
   `linked` without a second row; on another account `identity_collision`. Rule 3 stays.

The link start accepts either session kind. A password session still proves a fresh password under
the throttle. An OIDC session sends no password (a supplied one is `400 invalid_body`); its access
token is re-verified with the shared verifier and resolved to its user through the existing mapping
only. `prompt=login` makes Auth0 re-authenticate the identity being added, and the callback still
requires the same access cookie value that started the link. Outcomes are unchanged:
`linked | refused | inactive | collision | unavailable | failed`. Unlinking is out of scope.

`GET /api/auth/me` gains `linkedMethods`: catalogue ids whose connection prefix appears on any
mapped subject of the account (a deployment has one issuer), derived from the store, never from
token claims. The field is optional in the contract so older fixtures stay valid; be-01 always sends it. fe-01 offers
"Add <method>" for each enabled method not yet linked.

## Risks

- Boot now needs `AUTH_METHODS`: dev's shared OIDC env and prod's `be-01.env` must carry it before
  a release that contains this change starts; the swap preflight refuses a prod env without it.
- A new Google or GitHub user without `wbs_groups` has no scopes until the tenant's post-login
  Action grants default groups (operator work, outside the repository).
