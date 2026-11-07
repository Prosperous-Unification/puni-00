## Context

`proveBrowserPredecessor` admits a predecessor before replacement issuance. Before this change it returned `null` whenever the access cookie was absent, even with a correlation whose lifecycle `SqliteBrowserAuthLifecycle.generation` reports active. Callers map `null` to 401 (password) or the recovery redirect (SSO).

## Decisions

- A correlation without access reads `lifecycle.generation(correlation)`. Active: return the `oidc` predecessor with the current tuple's digest, so `retireBrowserPredecessor` closes it and revokes its refresh token exactly as for a presented access cookie. `BrowserLifecycleRefusedError` (absent, closed, revoked): refuse. Other errors propagate. `POST /api/auth/refresh` accepts the correlation alone while the issuing process holds its refresh record; after a restart this proof alone can close an active lifecycle (a bounded denial of service limited to the remaining access-token life, ≤ 3600 s, enforced by revocations), which refresh could not. Cookie theft precondition unchanged (`__Host-`, HttpOnly, Secure, SameSite=Lax, 256-bit random).
- The proof returns a typed refusal `{ kind: 'refused', refusal }` instead of `null`, so the SSO callback can log which check fired. Reasons name branches only.
- `replacedCredentialOf` already yields a null subject when no access bytes are present, so `reauthenticatedAtOf` gives no same-subject credit to a session-only predecessor.

## Alternatives

- fe-01 silent refresh before the access cookie expires: repairs the steady state but not a browser that slept past expiry; it can follow separately.
- Session-cookie Max-Age equal to the token lifetime: signs every user out hourly instead of fixing recovery.
- Access-cookie Max-Age equal to the session lifetime: keeps a 30-day carrier of an expired token, widening exposure without new evidence.

## Risks

A closed lifecycle must not sign in: covered by the closed and foreign correlation negatives and the store's own active-state refusal.
