## Why

Every SSO user on dev and prod is sent to manual **Reset browser session** about an hour after signing in. The access cookie expires with the provider token (3600 s) while the correlation cookie lives 30 days, and fe-01 never refreshes. The next SSO callback finds a correlation without an access cookie, the predecessor proof refuses it, and the callback redirects to `/?auth_error=browser_session_unverified`.

## What Changes

**Sign-in with an expired access cookie**

- From: a correlation cookie without an access cookie is refused as an unverifiable predecessor; password sign-in answers 401 and SSO redirects to browser recovery.
- To: while that correlation's lifecycle is active, sign-in proves the lifecycle's current tuple from the correlation alone, closes it as the replaced predecessor and issues the new session. Absent, closed or revoked lifecycles stay refused.
- Impact: non-breaking; SSO and password users sign in again without reset.

**Recovery redirect observability**

- The `browser_session_unverified` redirect logs at info which refusal check fired, without cookie or token values.

## Non-Goals

Silent refresh in fe-01, changing cookie lifetimes, changing the refresh endpoint, changing the reset endpoint, or accepting any malformed, native-with-correlation or mismatched carrier the proof refuses today.

## Constraints

Adds one bounded authority: `POST /api/auth/refresh` accepts the correlation alone while the issuing process holds its refresh record; after a restart this proof alone can close an active lifecycle (a bounded denial of service limited to the remaining access-token life, ≤ 3600 s, enforced by revocations), which refresh could not. Cookie theft precondition unchanged (`__Host-`, HttpOnly, Secure, SameSite=Lax, 256-bit random). Store faults other than typed lifecycle refusal remain server failures. No migration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `browser-sign-in-recovery`: adds the session-cookie-only predecessor proof and the refusal log; still an unarchived change, so the delta is ADDED.

## Domain Terms

None. Existing browser lifecycle session and credential revocation retain their definitions.

## Decisions Recorded

S-BSR-A1 in `verify.md` (assumed by the delegating session from the 2026-11-07 investigation); no ADR, since the change is easy to reverse.

## Impact

be-01 predecessor proof (`apps/wbs/be-01/src/controller/browser-session.ts`), its OIDC and password callers, mounted auth tests and `docs/auth-integration.md`. Dev and prod receive it only after merge and deploy.
