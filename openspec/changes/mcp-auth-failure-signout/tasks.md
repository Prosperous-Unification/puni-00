## 0. Before any code

- [ ] 0.1 Client compatibility check on dev, server-side evidence only. Temporarily log (method, path, status, `grant_type`, registration `grant_types`, no tokens) for mcp-01 OAuth routes. With the client Dany actually uses (Claude connector or Claude Code), record: the `grant_types` its `/register` requests; whether, after a revoked session's `401 invalid_token`, it calls `/authorize` again unprompted. Record in `verify.md`. If it does not re-authorize, stop and re-plan with Dany.
- [ ] 0.2 Design interview; add **MCP session** and **Reauthentication marker** to `CONTEXT.md`.

## 1. Session identity in the request

- [ ] 1.1 `authenticateCaller` returns `extra.mcpSessionId` (local `jti`, or `null` for upstream-direct tokens). Test through `mcpFetchHandler` that a tool handler receives it.

## 2. End the session on upstream rejection

- [ ] 2.1 Red first in `server.test.ts`: stub be-01 answers 401 (no challenge); assert the tool result says the session ended and the next request is HTTP 401 with `error="invalid_token"`. Fails today.
- [ ] 2.2 `wbs-client.ts`: typed `UpstreamRejected` vs `EdgeGate`, where only the configured `WBS_BASIC_AUTH` Basic challenge is `EdgeGate`. Negative with `Proof:`: treat any challenge as edge; the Bearer-challenge case must fail.
- [ ] 2.3 Tool handler calls `oauth.endSession`; `http.ts` adds `error="invalid_token"` when a token was presented. Negative: skip `endSession`; the next-request assertion must fail.

## 3. Failed logins

- [ ] 3.1 Red first in `oauth.test.ts`, one per table row plus unmatched: assert redirect, `error`, `state`, cleared cookie. Missing `wbs:read` fails today with JSON 400; exchange throw fails with an exception.
- [ ] 3.2 Single `failLogin(pending, cause)` implementing the table; revoke a returned provider refresh token (stub asserts one `revoke`). Negative: redirect on unmatched; must fail.
- [ ] 3.3 Reauthentication marker cookie + `prompt` in `BrowserOidcClient.authorizationUrl`. Tests: marker → `prompt=login` once; tampered marker ignored. Negative: accept unsigned marker; tamper test fails.

## 4. Close

- [ ] 4.1 Gate with `bin/h2puni-gate.sh <sha>`; `verify.md` with every `Proof:`.
- [ ] 4.2 Dev check with Dany's client: revoke the session server-side, make one call, confirm the client re-authorizes without the connector being removed.
