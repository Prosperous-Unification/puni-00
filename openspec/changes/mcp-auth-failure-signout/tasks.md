## 1. Characterize current behavior (red first)

- [ ] 1.1 In `apps/wbs/mcp-01/src/server.test.ts`, drive a tool call through the real HTTP handler with a stub be-01 answering 401 (no challenge). Assert HTTP 401 + `error="invalid_token"` and that the same token is refused next. Must fail today (current: 200 with tool error).
- [ ] 1.2 In `oauth.test.ts`, drive authorize → callback where the stub provider yields a token without `wbs:read`. Assert 302 to the client redirect URI with `error=access_denied` and original `state`. Must fail today (current: JSON 400).
- [ ] 1.3 Add the same redirect assertion for provider `error=` query, exchange throw, and upstream verification throw.

## 2. End the session on a rejected upstream token

- [ ] 2.1 Give `wbs-client.ts` a typed `UpstreamTokenRejected` outcome for 401-without-challenge; keep the edge-gate branch unchanged. Negative: collapse the two branches; the edge-gate test must fail.
- [ ] 2.2 In `http.ts`/`server.ts`, map that outcome to session deletion (`InMemoryMcpOAuth.endSession(jti)`) and HTTP 401 with `error="invalid_token"`. `Proof:` comment naming the removed deletion and the failing "refused next" assertion.
- [ ] 2.3 Add `error="invalid_token"` to the existing 401 when a token was presented; keep it absent when none was.

## 3. Return failed logins to the client

- [ ] 3.1 Refactor `callback` so every failure after `pendingAuthorizations.consume` succeeds goes through one `failLogin(pending, code)` that redirects with `error` + `state` and clears the cookie. Unmatched/expired paths keep local errors. Negative: redirect on an unmatched callback; the unmatched test must fail.
- [ ] 3.2 Record the failed login against the browser binding (bounded, TTL = pending TTL) so the next `authorize` adds `prompt=login` upstream. Test via the real authorize URL.
- [ ] 3.3 If discovery exposes `end_session_endpoint`, `failLogin` goes through it with `post_logout_redirect_uri` = the client error redirect. Stub-provider test for both "advertised" and "absent".

## 4. Close

- [ ] 4.1 `CONTEXT.md`: add **MCP session**.
- [ ] 4.2 Gate with `bin/h2puni-gate.sh <sha>`; record results and every `Proof:` in `verify.md`.
- [ ] 4.3 Manual check against dev with Claude's connector: revoke upstream (sign out at the provider), make one call, and confirm Claude re-prompts sign-in without removing the connector.
