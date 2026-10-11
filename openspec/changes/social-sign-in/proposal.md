## Why

WBS signs people in with a WBS password or one generic "Continue with SSO" link. People expect to choose Google, GitHub or an emailed code on our own page. Auth0 mints a distinct subject per connection, so a person who signs in a second way with an email another account holds gets an empty 409 and no explanation, and one WBS user cannot hold more than one provider identity.

## What Changes

**Sign-in methods**

- From: one chooser link
- To: a closed catalogue (Google, GitHub, email one-time code, Apple), enabled by the required `AUTH_METHODS`; `GET /api/auth/methods` lists the enabled ones and `GET /api/auth/login?method=<id>` sends that connection to the provider
- Impact: be-01 refuses to boot in `AUTH_MODE=oidc` without `AUTH_METHODS`; every oidc environment must set it (`none` keeps the chooser only)

**Email collision**

- From: empty `409` from the callback
- To: `302 /?auth_error=account_exists` with a rendered sentence; nothing is written
- Impact: contract drops the 409

**Several verified identities per user**

- From: one `(issuer, subject)` pair per user; linking only from a password session
- To: a user may hold several mapped pairs; an OIDC session may add a method through the existing link flow without a password
- Impact: identity store invariants change; no migration

**Unverified provider email**

- From: the onboarding verification step offers only the email challenge
- To: an OIDC session also sees "verify this address with your sign-in provider and sign in again"

## Non-Goals

Apple connection setup, unlinking or changing the first pair, Auth0 account linking, organization-bound MCP consent, enterprise SSO, an Auth0 database connection, passkeys, renaming the callback path.

## Constraints

Email never merges accounts. Identity stays issuer-bound. Auth0 does not support magic links in Universal Login, so "magic link" ships as the email one-time code. Linking still requires organization activation. Tenant configuration (connections, SMTP, groups Action) is operator work outside this change.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `federated-authentication`: method catalogue and hint, `account_exists`, several pairs per user, OIDC-started link.
- `organization-onboarding`: unverified-provider hint.

## Domain Terms

none

## Decisions Recorded

none (no ADR; see design.md D6)

## Impact

`@wbs/contracts` (catalogue, shapes), `@wbs/auth` (`connection`), be-01 auth endpoints and options, store-sqlite and store-memory identity linking, fe-01 sign-in card, onboarding and link renderers, swap preflight and k8s overlays (`AUTH_METHODS`), `docs/auth-integration.md`.
