## 0. Before any code

- [x] 0.1 Record the client evidence available without Dany in `verify.md`: the dev registration's `grant_types`, the MCP 401 recovery contract, the explicit reauthorization assumption, and its live falsifier. Per the 2026-09-20 unblock decision, the live client behavior is the close check in 4.2.
  - Proof: omitting the assumption or its falsifier makes `verify.md` unable to distinguish evidence from the unobserved client behavior.
- [x] 0.2 Design interview; add **MCP session** and **Reauthentication marker** to `CONTEXT.md`.
  - Proof: deleting either term leaves the change's two state boundaries unnamed.

## 1. Session identity in the request

- [x] 1.1 `authenticateCaller` returns `extra.mcpSessionId` (local `jti`, or `null` for upstream-direct tokens). Test through `mcpFetchHandler` that a tool handler receives it.
  - Proof: replacing the combined caller/session resolver with the old token-only resolver drops the tested session id.

## 2. End the session on upstream rejection

- [x] 2.1 A production-path test stubs be-01 at 401, asserts the tool result says the session ended, and asserts the next request receives `401 invalid_token`.
  - Proof: skipping `endSession` leaves the second request at HTTP 200.
- [x] 2.2 `wbs-client.ts`: typed `UpstreamRejected` vs `EdgeGate`, where only the configured `WBS_BASIC_AUTH` Basic challenge is `EdgeGate`.
  - Proof: treating any challenge as edge makes the Bearer-challenge test return `EdgeGate` instead of `UpstreamRejected`.
- [x] 2.3 Tool handler calls `oauth.endSession`; `http.ts` adds `error="invalid_token"` when a token was presented.
  - Proof: skip `endSession` and the next-request assertion fails; omit the presented-token branch and the challenge loses `invalid_token`.

## 3. Failed logins

- [x] 3.1 `oauth.test.ts` covers each failure-table row and unmatched callback safety: redirect, `error`, `state`, and cookie replacement.
  - Proof: returning exchange and scope failures locally makes their validated-redirect assertions fail.
- [x] 3.2 Single `failLogin(pending, cause)` implements the table and revokes a returned provider refresh token.
  - Proof: skipping revocation leaves the test's revoke list empty; redirecting an unmatched callback violates the existing no-`Location` case.
- [x] 3.3 Reauthentication marker cookie + `prompt` in `BrowserOidcClient.authorizationUrl`. Tests: marker → `prompt=login` once; tampered marker ignored.
  - Proof: accepting an unsigned or modified marker makes the tamper assertion observe `prompt=login`.

## 4. Close

- [ ] 4.1 Gate with `bin/h2puni-gate.sh <sha>`; `verify.md` with every `Proof:`.
- [ ] 4.2 Dev check with Dany's client: revoke the session server-side, make one call, confirm the client re-authorizes without the connector being removed.
