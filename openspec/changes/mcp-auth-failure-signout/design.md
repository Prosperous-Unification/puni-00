## Context

`authenticateCaller` returns `authInfo` whose token is the upstream access token
(`oauth.upstreamTokenFor`); the MCP `jti` is not retained. `createServer`
converts every tool failure into a successful MCP result, and
`transport.handleRequest` has already committed an HTTP 200 by the time a tool
runs, so a tool cannot produce HTTP 401.

## Decisions

1. **Carry identity.** `authInfo.extra = { mcpSessionId: jti | null }`; bearer
   tokens verified upstream-direct (no local session) carry `null` and cannot be
   ended locally.
2. **End on use, refuse on next request.** On an upstream rejection the tool
   handler calls `oauth.endSession(mcpSessionId)` before returning its error.
   Next request: `sessionOf` fails, `http.ts` answers 401 with
   `error="invalid_token"`. Any 401 carrying a Basic challenge counts as the
   deployment edge gate, including when `WBS_BASIC_AUTH` is missing or wrong;
   a missing challenge or Bearer challenge is an upstream rejection.
3. **Callback failure table** (after `consume` matched):

   | Cause                       | `error`                                             |
   | --------------------------- | --------------------------------------------------- |
   | provider returned `error=`  | same code if RFC 6749 §4.1.2.1, else `server_error` |
   | exchange threw              | `server_error`                                      |
   | upstream verification threw | `access_denied`                                     |
   | no `wbs:read`               | `access_denied`                                     |

   A refused login that yielded a provider refresh token revokes it before
   redirecting.

4. **Reauthentication marker.** The browser-binding cookie is cleared on
   failure, so the marker is its own cookie: HMAC-signed with a per-process key,
   `Max-Age=300`, no identity inside, single-use, and held in a bounded server
   store. `authorize` reserves it while obtaining the provider URL, restores it
   if that lookup fails, and otherwise passes `prompt=login` through
   `BrowserOidcClient.authorizationUrl`.

## Risks

A client that ignores `invalid_token` keeps failing; task 0.1 finds that before
any code ships.
