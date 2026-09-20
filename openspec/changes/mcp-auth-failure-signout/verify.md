## Client compatibility assumption

The evidence available without Dany's client is recorded before the implementation:

- Dev route evidence from 2026-09-19 shows his client registered with
  `grant_types ["authorization_code","refresh_token"]`, then completed authorize,
  callback, and an authorization-code token exchange.
- MCP Authorization revision 2026-07-28 requires clients to parse
  `WWW-Authenticate` and respond to HTTP 401. Its recovery flow is 401 → protected
  resource metadata discovery → authorization → retry, but it does not require a
  client to restart interactive authorization after every 401.
- Local MCP access tokens and their server-side sessions expire after 300 seconds;
  the token endpoint accepts only `authorization_code` and publishes no refresh-token
  grant. Dany's client therefore already has to reauthorize periodically rather than
  silently refreshing a long-lived connector credential.
- **Assumption:** Dany's Claude connector or Claude Code follows that recovery flow
  when a live MCP token receives `401 error="invalid_token"`.
- **Falsifier:** after server-side session revocation, his next tool call does not
  lead to authorization without removing and recreating the connector. If observed,
  file the client-specific follow-up; the server-side logout still prevents the old
  credential from looping silently.

## Verification

- PR: https://github.com/Prosperous-Unification/puni-00/pull/19
- Exact-head CI: PR #19's `gate` check is the hard code gate; the separate h2puni run was unavailable as recorded below.
- The separate repository-lint workflow is red because the three immutable Tool Wiki
  activation variables are unset; this is the existing repository configuration
  blocker, not a result from this diff.
- h2puni gate was not started manually: its capacity monitor reported `/` at 98%
  (limit 85%). CI owns the code gate for this run.

## Proof negatives

- `caller-auth.test.ts`: replacing the combined caller/session resolver with the old
  token-only resolver drops `extra.mcpSessionId`.
- `http.test.ts`: skipping `endSession` leaves the verifier live, so the next request
  stays HTTP 200 instead of receiving `401 invalid_token`; omitting the presented-token
  challenge branch removes `error="invalid_token"`.
- `wbs-client.test.ts`: treating any `WWW-Authenticate` challenge as the deployment
  gate misclassifies a Bearer challenge; a Basic challenge is `EdgeGate` even when the
  missing `WBS_BASIC_AUTH` setting caused it.
- `oauth.test.ts`: returning provider failures locally loses the validated redirect,
  client state, and server-side single-use `prompt=login`; accepting a modified marker
  makes the tamper assertion fail; skipping refresh-token revocation leaves the
  recorded revoke list empty, while propagating a revoke outage loses the redirect.

## Remaining live check

After merge and dev deployment, revoke the MCP session server-side, ask Dany to make
one tool call, and confirm his client reauthorizes without the connector being removed.
