## Context

`proveBrowserPredecessor` deliberately refuses an unverifiable or ambiguous credential before replacement issuance. Password login maps that refusal to `unauthenticated`; fe-01 advises reload although reload preserves HttpOnly cookies. SSO currently performs the same proof before consuming its transaction and returns an empty 401 on refusal. Public dev probes reproduced both paths using an invalid diagnostic access cookie; no real user code or credentials were replayed.

The user approved implementation and merge of this explicit reset design on 2026-11-02.

## Goals / Non-Goals

**Goals:** one explicit recovery action from either sign-in failure, preserving existing credential retirement and logout guarantees.

**Non-Goals:** changing authentication admission, persistent refresh material, provider configuration, background retry, or global sign-out.

## Decisions

Add a shared shape for `POST /api/auth/reset` with exact Origin admission and no body/query. Mount its dependency-free cookie-clearing binding in both native and OIDC compositions. Reject Authorization and `x-wbs-token` before clearing. Return three independent Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age=0 cookie headers and no-store. The reset binding receives no auth, provider or lifecycle service, so it cannot infer or revoke identity. Outstanding OIDC binding cookies need not be cleared; they are bounded and expire after five minutes, and a new flow already manages their capacity.

For the existing OIDC callback, consume and check the state/browser-binding transaction before the predecessor proof. A modeled predecessor refusal then returns a fixed relative recovery redirect, expiring only its settled binding. Missing or mismatched transactions and duplicate/method checks retain their existing refusal paths. Storage errors continue to throw. Provider exchange remains after predecessor admission.

The sign-in card recognizes the password refusal and the fixed callback error as the same recoverable UI state. Its reset action uses the shared client and reports pending, success, refusal and transport/contract failure explicitly. Successful clearing invites a new sign-in; it neither retries passwords nor calls the signed-in callback. Ordinary logout stays on the durable logout endpoint.

## Risks / Trade-offs

Local clearing cannot prove a durable session ended. It is offered as recovery, not logout, and never rewrites server authority. Exact Origin admission prevents another site from driving reset through a form or navigation. Callback recovery is state-bound so a forged callback cannot redirect an unrelated browser to recovery or clear its session cookies. An expired in-flight login remains a separate refusal.

## Migration Plan

No database or environment migration. Backend and frontend use an additive endpoint; older frontends retain manual cookie-clearing recovery until refreshed. Dev runs merged main through its existing poller. No deployment or merge is implied by drafting this design.

## Open Questions

None. The approved interaction uses explicit local reset; merge and dev verification are authorized.
