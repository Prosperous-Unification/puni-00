# Sweep E — gw-01, mcp-01, and every lib

File-by-file. Fields: `file | LOC | role | reuse | performance | readability/DDD`.
"none" where there is nothing. Line anchors are `file:line`.
Vocabulary: module / interface / implementation / seam / adapter / depth / leverage / locality.

---

## 1 · apps/gw-01/src

**`apps/gw-01/src/main.ts` | 13**

- role: boot — load config, build the Elysia app, listen.
- reuse: none.
- perf: none.
- DDD: `console.log` at `:13` while the app builds a pino logger at `app.ts:96`. Two
  logging implementations in a 13-line file; be-01's `main.ts:8` passes `cfg.LOG_LEVEL`
  into `createLogger`, gw-01 never does — see `config.ts` below.

**`apps/gw-01/src/config.ts` | 58**

- role: env schema + the OIDC/local branch that produces `wsAuth`.
- reuse: `oidcAppOriginFromEnv` (`:24`) is gw-01's only reader of `AUTH_REDIRECT_URI`;
  be-01's `auth.controller.ts` derives the same origin independently. Small, but it is the
  third place the redirect URI is taken apart.
- perf: none.
- DDD: `LOG_LEVEL` at `:9` is validated and then **never used** — `app.ts:96` calls
  `createLogger({service, version})` and `libs/observability/src/logger.ts:15` falls back to
  reading `process.env['LOG_LEVEL']` itself. A validated value that no caller consumes is a
  check that cannot fail (R5 shape). `loadConfig` returns `GwConfig & { wsAuth?: … }` — the
  optionality is a lie, both arms set it; the type should be `GwConfig & { wsAuth: WsAuthOptions }`.

**`apps/gw-01/src/app.ts` | 319**

- role: the composition root — health probe, `/metrics/snapshot`, and the whole `/ws`
  lifecycle (`beforeHandle`/`open`/`message`/`close`).
- reuse: `cookieValue` (`:25–37`) is a hand-rolled cookie parser; `apps/mcp-01/src/oauth.ts:583`
  has a second one (`cookieOf`) with different escaping semantics. Two implementations of one
  seam, and gw-01's is the correct one (`decodeURIComponent`, refuses a malformed value);
  mcp-01's `part.trim().split('=')[1]` truncates any value containing `=`.
- perf: **the token is verified twice per socket open** — `beforeHandle:181` and again
  `open:207`. Two jose HS256/RS256 verifications for one upgrade; the verified claims from
  the first are discarded rather than carried on `WsAuthCarrier` beside `VERIFIED_TOKEN`.
  **Per-message re-serialise**: `:246` does `typeof data === 'string' ? data : JSON.stringify(data)`
  — when Elysia has already parsed the frame this re-stringifies it, `ws.controller.ts:71`
  re-parses it, and `forward-client.ts:25` stringifies it a third time. Up to four passes over
  every inbound frame. **No backpressure anywhere**: `:197` `send: (payload) => ws.send(payload)`
  discards Bun's return value (-1 = backpressured, 0 = dropped); a slow socket buffers in Bun
  with nothing counting it. `crypto.randomUUID()` per forwarded message (`:255`) and per resume
  (`:266`) for a trace id.
- DDD: `ws.data as unknown as WsConnection` at `:191`, `:233`, `:303` — three double casts through
  `unknown`, each with no adjacent comment naming the seam (R3 requires one). The `joined`
  promise (`:64`, `:201`) is excellent depth — the race is modelled once and its history is on
  the field. `LOCAL_IDENTITY`/`VERIFIED_TOKEN` symbols smuggled through Elysia's `query` object
  (`:20–23`, `:153–186`) is a genuinely surprising channel and the JSDoc at `:222–227` says so.

**`apps/gw-01/src/controller/internal.controller.ts` | 43**

- role: `POST /internal/push` — the be-01 → sockets fan-out adapter.
- reuse: `SocketLike` (`:8`) is a third spelling of the same one-method interface, beside
  `WsSocket` (`ws.controller.ts:7`) and `PresenceSocket` (`presence.ts:1`). Three identical
  interfaces in one app.
- perf: **the fan-out is one stringify, N sends** (`:27–32`) — correct, and the thing to
  protect. `deps.subs.socketsFor` (`subscription-map.ts:21`) hands back the **live internal
  `Set`**, so a caller could mutate the map mid-iteration; a copy or a `ReadonlySet` return
  type would close it. No per-socket send-result check, same as `app.ts`.
- DDD: authentication is a raw `!==` string compare at `:20` — not timing-safe, unlike
  `libs/auth/src/oidc-store.ts:200` which has `sameSecret` for exactly this. `202 Accepted`
  for a synchronous fan-out that has already happened is arguably wrong (200 is the honest code).

**`apps/gw-01/src/controller/ws.controller.ts` | 174**

- role: the frame vocabulary — ping/who/resume/subscribe/unsubscribe/forward.
- reuse: **it does not use `@wbs/contracts` at all.** Every frame it emits is a hand-written
  object literal (`:73`, `:78`, `:85`, `:103`, `:106`, `:113`, `:124`, `:131`, `:139`, `:167`, `:173`)
  while `libs/contracts/src/ws.ts` declares `PingFrame`, `PongFrame`, `ErrorFrame`,
  `ResumeAckFrame`, `ResumeDeniedFrame` and `WsFrame` — and `ResumeDeniedFrame` at
  `contracts/src/ws.ts:20` types `reason` as `'out_of_range'` only, while this file emits
  `reason: 'unavailable'` at `:103`. **The contract and the producer already disagree and
  nothing can see it**, because the producer never imports the contract. `ResumeStatus` at
  `:3–5` is a hand-written duplicate of `InternalResumeResponse`'s value type
  (`contracts/src/internal.ts:44`).
- perf: 11 `JSON.stringify` call sites, each building a fresh literal. The resume replay
  (`:123–125`) stringifies once per event — unavoidable, since each carries a different seq.
- DDD: `msg['type'] === …` string dispatch over `Record<string, unknown>` (`:69–171`) instead
  of parsing once into `WsControlFrame` at the seam — the exact "validate external data once
  at its boundary" rule in CLAUDE.md's failure policy. `projectIdOf`/`isKnownSubscription`
  (`:60`, `:64`) are good depth: one place the `project:` prefix is taken apart.

**`apps/gw-01/src/service/forward-client.ts` | 30**

- role: adapter to be-01's `/internal/forward`.
- reuse: it does **not** parse the response against `InternalForwardResponse`
  (`contracts/src/internal.ts:20`) — `:28` is a bare `as { ack: boolean }` cast, while
  `app.ts:272` correctly does `parseOrThrow(InternalResumeResponse, …)` for the sibling call.
  Two calls to the same backend, two different honesty levels.
- perf: no keep-alive/agent configuration, no timeout — `app.ts:136` uses
  `AbortSignal.timeout` for the health probe but the hot forward path has none, so a hung
  be-01 holds the socket handler open indefinitely.
- DDD: `push_responses?: unknown[]` in the return type (`:16`) is declared and never read.

**`apps/gw-01/src/service/gateway-metrics.ts` | 46**

- role: six in-process counters, served at `app.ts:149 /metrics/snapshot`.
- reuse: **a second metrics implementation inside a process that already mounts
  `observabilityPlugin`** (`app.ts:115`), which serves OTel/Prometheus at `/metrics`. gw-01
  therefore exposes two endpoints, two formats, and the OTel one is empty — nothing in the
  repo ever constructs `libs/observability`'s `Counter`/`Histogram`/`Gauge` (verified: zero
  `new Counter|Histogram|Gauge` anywhere). A scraper pointed at `/metrics` sees nothing.
- perf: none (six integer increments).
- DDD: `export const gwMetrics = new GatewayMetrics()` at `:46` is a **dead module-level
  singleton** — zero references repo-wide. `connectionClosed` (`:25`) guards `> 0` and
  silently absorbs an unbalanced close instead of surfacing it.

**`apps/gw-01/src/service/jwt-auth.ts` | 51**

- role: HS256 password-session verifier with previous-key rotation, delegating non-HS256 to
  the OIDC verifier.
- reuse: **this is a `libs/auth` module living in an app.** `libs/auth/src/token-verifier.ts`
  owns `TokenVerifier`/`JwtClaims`/`JwksTokenVerifier`; this file re-exports those types at
  `:3` and then adds the HS256 half beside them. `apps/be-01/src/service/auth.service.ts:133`
  independently `jwtVerify(token, this.key)` with the same key and no rotation arm — so
  be-01 cannot verify a token gw-01 signed under the previous key. The key-rotation rule
  exists in exactly one of the two processes that share the key.
- perf: `decodeProtectedHeader` (`:45`) parses the JWT header on every verify before the
  verify itself. Cheap, but it is a second parse of the same string.
- DDD: correct and well-argued (`:26–28` on not catching the OIDC outage). Its locality is
  wrong, not its content.

**`apps/gw-01/src/service/presence.ts` | 141**

- role: who is in which project, keyed by connection.
- reuse: none — this is genuinely gw-01's.
- perf: **`broadcast()` is O(connections × distinct projects)**. `:124` iterates every
  connection and, per distinct project, calls `list(projectId)` at `:129`, which at `:86`
  spreads and filters **all** connections again. With C connections in C distinct projects
  that is O(C²) per broadcast — and `app.ts` calls `broadcast()` on every join, subscribe,
  unsubscribe and close, so N sockets joining one project costs O(N²) sends overall. The
  per-project payload memo (`byProject`, `:123`) is the right idea applied one level too
  shallow: a `Map<projectId, Set<connectionId>>` index would make both `list` and `broadcast`
  linear. `rosterFor` (`:98`) copies `NOBODY` per call.
- DDD: exemplary JSDoc — `:23–37` names the live 2026-08-09 fault and the single-replica
  limit explicitly. `enterProject`'s "one project, not a set" argument (`:50–63`) is the kind
  of decision that would otherwise be re-litigated by every reader.

**`apps/gw-01/src/service/subscription-map.ts` | 36**

- role: subscription → sockets, with cleanup.
- reuse: `libs/realtime/src/subscription-tracker.ts` is the client-side counterpart of the
  same concept under a different name; neither knows about the other.
- perf: `removeAll` (`:24`) walks **every** subscription on every socket close — O(total
  subscriptions) per disconnect. A reverse index `Map<Socket, Set<string>>` makes it O(that
  socket's subscriptions). `socketsFor` returns `new Set()` on a miss (`:21`) — an allocation
  per miss on the fan-out path — and the **live** Set on a hit, which is two different
  ownership contracts from one signature.
- DDD: `activeCount()` (`:31`) has no production caller (tests only).

### gw-01 tests (skimmed for interface)

`ws.controller.test.ts` (225) drives `handleWsMessage` purely through its args object — the
callback seam (`onSubscribed`, `roster`) pays off: no `Presence` is wired in any of the 13
cases. `presence.test.ts` (181) asserts the project-scoping rules directly.
`fan-out.integration.test.ts` (285), `presence-race.integration.test.ts` (156) and
`ws-auth.integration.test.ts` (382) all stand up a real Bun server — 823 lines of integration
harness against 319 lines of `app.ts`, which is the cost of the composition root holding the
`/ws` lifecycle inline rather than behind a testable `WsLifecycle` module.

---

## 2 · apps/mcp-01/src

**`apps/mcp-01/src/main.ts` | 32**

- role: entrypoint — read document once, derive tools once, serve.
- reuse: none.
- perf: **the OpenAPI document is read and parsed exactly once, at boot** (`:16`). Correct.
  `tools` is one array shared by every request.
- DDD: the "stdout is the protocol" JSDoc (`:7–13`) is right, and `:30` honours it. The
  gateway-mode verifier at `:20–21` is an inline rejecting stub where a named
  `refusingVerifier` would say what it is.

**`apps/mcp-01/src/config.ts` | 81**

- role: mcp-01's env, read narrowly so a boot failure cannot print secrets.
- reuse: it deliberately does **not** use `@wbs/config`'s `defineConfig`, and `:44–48`
  explains why — `parseOrThrow` puts `JSON.stringify(input)` in the message. That is a real
  defect in `libs/validation/src/core.ts:15` that mcp-01 routes around instead of fixing;
  be-01 and gw-01 still print their whole env on a boot failure.
- perf: none.
- DDD: duplicated comment line at `:58–59` ("An empty string is an unset variable that went
  through a shell, not a" / "An empty shell variable is absent, not a usable configuration
  value") — a half-finished edit. `NAMES`/`EXPECTATIONS` (`:24–39`) restate `McpConfig`'s keys
  a second and third time; a single `Record<key, {schema, expectation}>` would make them one.

**`apps/mcp-01/src/caller-auth.ts` | 40**

- role: one MCP request's Bearer → `AuthInfo`, preserving the caller token for be-01.
- reuse: `oidcIdentityFromClaims` from `@wbs/auth` — correct.
- perf: **`upstreamTokenFor` re-verifies the token the line above already verified.**
  `:28` calls `verifier.verify(token)`, `:32` calls `verifier.upstreamTokenFor(token, claims)` —
  and `oauth.ts:170` declares `upstreamTokenFor(token: string)` with **one parameter**, so the
  `claims` argument is silently dropped and `verifyLocal` runs a second `jwtVerify` (`oauth.ts:172`).
  In the upstream-token path it is worse: `verify` fails local then calls `verifyUpstream`
  (`oauth.ts:164–167`), and `upstreamTokenFor` fails local **again** then calls `verifyUpstream`
  **again** (`:176`) — four verification attempts, two of them JWKS-backed, per tool call.
  The `DownstreamTokenResolver` interface at `:7–9` declares the second parameter that would
  fix it; nothing implements it.
- DDD: the structural `resolvesDownstreamToken` probe (`:11–15`) is a duck-type check where a
  discriminated capability on `TokenVerifier` would be checked by the compiler.

**`apps/mcp-01/src/http.ts` | 172**

- role: the public HTTP surface — health, RFC 9728/8414 metadata, the OAuth hand-off, and the
  per-request stateless MCP transport.
- reuse: `HEALTH_PATHS` (`:9`) duplicates gw-01's `/health` and be-01's health routes as a
  third, unshared shape. `MCP_SCOPES` (`:10`) is the third statement of the scope vocabulary,
  beside `oauth.ts:16 SCOPES` and `libs/auth/src/oidc-identity.ts:17 SCOPES` — the same three
  names spelled `wbs:read` twice and `read` once, converted by string concatenation at
  `oauth.ts:367` and `:441`. That conversion is exactly the kind of thing a shared
  `wbsScopeToOAuth` in `libs/auth` removes.
- perf: **`oauthMetadataResponse` re-parses `MCP_PUBLIC_URL` and rebuilds a `Set` on every
  request** (`:25–32`) for values fixed at boot; `mcpHttpResponse` builds another `URL` at `:79`
  and two more at `:100–101` on the 401 path. Together with `oauth.ts:141–156`'s six `new URL(…)`
  per request, a single MCP call parses ~9 URLs it could have resolved once in a constructor.
  A `Server` + transport are constructed, connected and closed **per request** (`:142–151`) —
  the JSDoc at `:118–130` justifies this as the SDK's stateless contract, which is true of the
  transport but not of `createServer`'s `byName` map (`server.ts:142`, rebuilt from 22 tools
  every call) or of the `describeTool` regex pass in `tools/list` (`server.ts:153`).
- DDD: `startHttpServer` reads `PORT` from `env` (`:167`) while every other variable comes
  through `loadConfig` — one variable outside the schema, with its own hand-written bounds
  check at `:168`. `libs/config/src/env-schemas.ts:3` already declares exactly that `Port` type.

**`apps/mcp-01/src/oauth.ts` | 608**

- role: an in-memory OAuth 2.1 authorization server fronting the upstream IdP — dynamic
  registration, PKCE authorize/callback, token, revoke, JWKS.
- reuse: **this is the biggest duplication in the sweep.** `libs/auth/src/oidc-store.ts`
  already ships `InMemoryOidcTransactionStore` (`:38–86`) and `InMemoryTokenStore` (`:121–194`),
  used by be-01 (`auth.controller.ts:72–73`). `oauth.ts` re-implements the transaction store
  inline — the `transactions` Map (`:89`), the TTL (`:18`), save (`:316`), consume-and-burn
  (`:337–348`) — and it **diverges on two security properties**: `libs/auth` keys the map on
  `sha256(browserBinding)` (`oidc-store.ts:51`, "so the cookie correlation is not kept verbatim
  in memory") and compares state with `timingSafeEqual` (`:70`, `:200`); `oauth.ts:316` stores
  the binding verbatim as the key and compares state with `!==` at `:345`. Two implementations
  of one rule where one of them is the hardened one. `sessions` (`:88`) is likewise a
  narrower `InMemoryTokenStore`. The JWT half duplicates the third time: `SignJWT` at `:440`
  and `jwtVerify` at `:483` beside `be-01/auth.service.ts:171/:133` and
  `gw-01/jwt-auth.ts:31`, none sharing a signer/verifier module — while `libs/auth` owns only
  the RS256/JWKS arm (`token-verifier.ts:27`). `cookieOf` (`:583`) duplicates
  `gw-01/app.ts:25 cookieValue`, less safely.
- perf: `response()` (`:139–159`) builds up to **six `new URL(…)` per request** to compare
  pathnames against strings known at construction time — precompute six path constants in the
  constructor. `cleanup()` (`:501–515`) scans all four maps in full (up to 1,000 + 1,000 +
  1,000 + 1,000 entries) and is called from `register`, `authorize`, `callback` and `token` —
  a full O(n) sweep per OAuth request. `register` does **two** full `[...this.clients.values()].filter()`
  passes (`:234`, `:237`), `authorize` a third (`:303`), `token` a fourth (`:420`); a
  `Map<source, {proven:Set, unproven:Set}>` index makes all four O(1). `generateKeyPairSync('rsa',
{modulusLength: 2048})` at `:123` is a synchronous ~100ms+ RSA keygen **on the constructor**,
  i.e. on the boot path, executed even in gateway mode where the key is never used.
  JWKS caching itself is correct: `libs/auth/src/token-verifier.ts:31` uses
  `createRemoteJWKSet` (jose caches internally) and `:55–59` memoises `discovery()` in a
  promise, so discovery happens once per process.
- DDD: 608 lines, one class, 13 methods, 12 tunables (`Options`, `:64–80`) and 14 private
  fields — the module has no seams inside it. The three concerns are separable and
  independently testable: **client registry** (register/promotion/source partitioning),
  **transaction store** (which `libs/auth` already owns), **token issuance** (sign/verify/revoke/JWKS).
  `verify` (`:162`) uses `try { local } catch { upstream }` — control flow by exception for a
  modelled two-arm decision, and it swallows the local error so a genuinely malformed local
  token is indistinguishable from an upstream one. Every `oauthError('invalid_request')` at
  `:292` collapses ~10 distinct refusals (`:280–291`) into one code with no field naming which
  one — the opposite of `wbs-client.ts`'s carefully-preserved be-01 codes one file over.

**`apps/mcp-01/src/openapi-tools.ts` | 304**

- role: OpenAPI document → `DerivedTool[]`, refusing rather than guessing.
- reuse: `OpenApiDocument`/`OpenApiOperation`/`OpenApiParameter` (`:48–78`) are a hand-written
  partial OpenAPI type. be-01 emits the document from typebox, so the two ends of one contract
  are typed twice and only `openapi-document.test.ts` joins them.
- perf: pure, runs once at boot. `exclusionFor` (`:108`) is a linear scan of 5 patterns per
  path — 27 paths × 5, irrelevant. `toolsFromDocument` is O(paths × methods).
- DDD: the best module in mcp-01 and the only one whose JSDoc states its refusals as a set
  (`:3–17`). Two live drifts: the comment at `:199` says "40 of be-01's 51 operations carry no
  prose" — the committed document today holds **27 paths / 30 operations / 27 with no prose**
  (measured), so the number in the code is stale by a factor. And `apps/mcp-01/README.md`
  says "Twenty tools in all" while `openapi-tools.test.ts:249` asserts **22** — the README's
  count is the one thing its own drift test (`:371 'the README names the tools that exist'`)
  does not check, because that test only checks one direction (no tool named that isn't derived).

**`apps/mcp-01/src/server.ts` | 207**

- role: the MCP `Server` — `tools/list`, `tools/call`, and the D9 re-read warning.
- reuse: `resolveDocumentFile` (`:79`) is the second half of `openapi-tools.ts`'s
  `OPENAPI_DOCUMENT_FILE` (`:289`) living in a different module — the two together answer one
  question ("where is the document") and are split across the seam that reads it.
- perf: `byName` (`:142`) is rebuilt per request because `createServer` is per request
  (`http.ts:142`); the tool array is shared but the index is not. `describeTool` runs the
  `SAYS_IT_ALREADY` regex (`:49`) over 22 descriptions on every `tools/list`. Both are
  microseconds, but both are per-request work over a boot-time-constant input.
- DDD: `asCallToolResult` (`:118–123`) and its JSDoc explaining the SDK's union-fallthrough
  error is exactly R3 done right. The D5 deprecation argument (`:125–139`) is the model for
  how to justify a lint suppression. `callerTokenOf === undefined ? (() => {…})() : …` at
  `:183–189` is an IIFE inside a ternary in an argument position — the one genuinely hard-to-read
  expression in the file.

**`apps/mcp-01/src/wbs-client.ts` | 220**

- role: one tool call → one HTTP request to be-01, and the refusal vocabulary back.
- reuse: none needed — this is mcp-01's own adapter and it is deep.
- perf: **exactly one HTTP hop per tool call** (`:197`) — the hop count is minimal. `bodyText`
  is read whole (`:203`) then `JSON.parse`'d only to validate and **thrown away** (`:210`), and
  the original string is returned (`:219`); one parse of a potentially large plan payload
  purely as a shape check, which the comment at `:217` defends (re-serialising would reorder
  keys). Fine, but it means a 5MB tree read is parsed and discarded. `new TextEncoder()`
  is not used here; `Buffer.from(…).toString('base64')` at `:115` re-encodes the basic-auth
  credential on every request instead of once at construction.
- DDD: the strongest DDD in mcp-01. `refusal` (`:143–179`) distinguishes the deployment gate's
  401 from be-01's own via `WWW-Authenticate` and names the fe-01 incident that taught it
  (`:138–141`). `buildRequest`'s `Object.hasOwn` comment (`:79–81`) names the exact tsconfig
  reason. Nothing to change.

### mcp-01 tests (skimmed for interface)

`oauth.test.ts` (714) is **larger than `oauth.ts` itself** and its 24 cases are almost all
capacity/partition/expiry cases — evidence that the resource-limit concern inside
`InMemoryMcpOAuth` is a module wanting to be extracted. `openapi-tools.test.ts` (446) drives
both a fixture document and the committed one, and `:371–439` asserts the README against the
derived tools — the only README-as-test in the sweep. `wbs-client.test.ts` (235) exercises
`buildRequest` as a pure function, which is why that module reads so cleanly.

---

## 3 · libs

There are **no per-lib `package.json` files** — every lib is Nx-only, and the "exports /
subpaths" are entries in `tsconfig.base.json`'s `paths`. That is the single place a subpath
is declared, and it is the reason two of the checks below are possible at all.

### 3.1 `libs/auth` — **earns its keep** (3 apps, 5 modules, 2 shipped stores)

**`libs/auth/src/index.ts` | 5** — barrel over all five. reuse: fine. perf: none.
DDD: no subpath aliases exist for `@wbs/auth/*`, so every consumer pulls `openid-client` and
`jose` transitively even when it only wants `authModeOf` (`apps/be-01/src/config.ts:1`,
`apps/mcp-01/src/config.ts:1`). `@wbs/domain` proves the subpath pattern works.

**`libs/auth/src/auth-mode.ts` | 55** — role: the three env-mode reads with no permissive
default. reuse: `authModeOf` used by be-01 + gw-01, `mcpAuthModeOf` by mcp-01, `booleanFlagOf`
by gw-01 — all three land. perf: none. DDD: the `Proof:` comments (`:23`, `:31`, `:46`) are
R5-compliant. `booleanFlagOf`'s JSDoc (`:7`) says "without accepting misspellings as policy",
which is the whole rule in seven words.

**`libs/auth/src/oidc-client.ts` | 98** — role: the browser authorization-code adapter over
`openid-client`. reuse: be-01's `auth.controller.ts:64` and mcp-01's `oauth.ts:523` both build
one — real leverage. perf: `discovery()` memoised in a promise at `:42`, so one network round
trip per process. DDD: `required` (`:94`) is a byte-identical duplicate of `token-verifier.ts:73`
in the same lib — two copies of a five-line helper, both with the message
`"is required in AUTH_MODE=oidc"`, which is wrong for mcp-01 (there is no `AUTH_MODE=oidc`
there; mcp-01 uses `MCP_AUTH_MODE`).

**`libs/auth/src/oidc-identity.ts` | 56** — role: verified claims → the one WBS identity shape.
reuse: be-01, gw-01 (via be-01's verifier) and mcp-01 (`caller-auth.ts:29`, `oauth.ts:361`) all
read it — the highest-leverage module in the lib. perf: `SCOPES.filter(…has…)` at `:49` over 3
elements; nothing. DDD: the environment-prefix argument (`:20–23`) is a decision worth the
prose. `normalizeEmail` returns `string | null` but is typed into `email: string | null` at
`:35` via a ternary that can produce `null` twice for two different reasons (no claim / bad
format) — one absence, two causes, no way to tell them apart downstream.

**`libs/auth/src/oidc-store.ts` | 203** — role: the two in-memory stores (OIDC transactions,
refresh rotation with replay detection). reuse: be-01 only — and **mcp-01 re-implements the
first one badly** (see `oauth.ts` above). This is the single highest-value reuse target in the
sweep. perf: `cleanupExpired` is a full scan called from every `save` (`:50`, `:130`) — O(n) per
write, same shape as `oauth.ts:501`. `sameSecret` (`:200`) digests both sides on every call.
DDD: five `Proof:` comments naming the exact test each guard fails without (`:60`, `:66`, `:69`,
`:142`, `:161`, `:167`) — the reference for how a security guard should be documented in this repo.

**`libs/auth/src/token-verifier.ts` | 77** — role: `TokenVerifier`/`JwtClaims` interfaces plus
the RS256/JWKS implementation. reuse: the interface is imported by all three apps; the
implementation only by the OIDC path. perf: **JWKS caching is correct** — `createRemoteJWKSet`
at `:31` caches keys with jose's own cooldown, and `:55–59` memoises the discovery promise, so
a cold start costs one discovery + one JWKS fetch and steady state costs zero.
DDD: the lib owns the **RS256** verifier and none of the **HS256** one, which is why
`gw-01/jwt-auth.ts` and `be-01/auth.service.ts:133` each grew their own. The missing module is
`HsTokenVerifier` with the previous-key rotation arm.

**`libs/auth/project.json` | 27** — the **only** lib whose typecheck runs
`tsc --build --force` on the lib project plus `--noEmit` on the spec project (`:23`). Every
other lib runs `tsc --noEmit -p …/tsconfig.json`, which is the solution-style-config fault
CLAUDE.md records as having shipped **twice** (be-01's and gw-01's). Worth checking whether
`domain`, `contracts`, `realtime`, `validation`, `config`, `scripts`, `observability` are
compiling anything at all — same shape, same blind spot.

### 3.2 `libs/config` — **fails the deletion test**

**`libs/config/src/index.ts` | 3** | barrel.
**`libs/config/src/define-config.ts` | 8** — role: `parseOrThrow(schema, process.env)`.
reuse: 2 consumers (`be-01/config.ts`, `gw-01/config.ts`). perf: none.
DDD: it is a one-line wrapper around `@wbs/validation`'s `parseOrThrow` that adds a default
argument. **mcp-01 deliberately refuses to use it** (`mcp-01/config.ts:44–48`) because it leaks
the whole env into the thrown message — so the abstraction is one line long and one third of
its potential callers reject it on security grounds.
**`libs/config/src/env-schemas.ts` | 11** — role: `Port`, `LogLevel`, `JwtKey`,
`InternalAuthSecret`. reuse: **`Port` has 1 consumer, the other three have zero** — be-01 and
gw-01 both re-declare `'string.integer.parse'`, the log-level union and `'string>=32'` inline
(`gw-01/config.ts:8–13`). A vocabulary module nobody speaks.
**`libs/config/src/sops-loader.ts` | 23** — role: shell out to `sops`, parse dotenv.
reuse: **zero consumers repo-wide.** perf: n/a. DDD: it is also the one place in the sweep
that would benefit from `libs/scripts`' `$` and does not use it.
**verdict**: 42 lines of source, one 8-line function with two callers. Delete the lib; move
`defineConfig` into `@wbs/validation` (where `parseOrThrow` lives), fix the message leak there
so mcp-01 can use it too, and delete `env-schemas.ts` and `sops-loader.ts` or find them a caller.

### 3.3 `libs/contracts` — **earns its keep, but half of it is unenforced**

**`libs/contracts/src/index.ts` | 3** | barrel.
**`libs/contracts/src/errors.ts` | 9** — `ErrorCode` const object. reuse: **zero consumers.**
`gw-01/ws.controller.ts` writes the literals `'invalid_payload'`, `'backend_unavailable'`,
`'unknown_subscription'` by hand at `:73`, `:141`, `:167`; the only `ErrorCode` import in the
repo is the MCP SDK's, in `mcp-01/server.ts:6`. A shared enum nobody shares.
**`libs/contracts/src/internal.ts` | 51** — the be-01 ↔ gw-01 wire. reuse: `InternalPushRequest`
(be-01 `push-client.ts:1`, gw-01 `internal.controller.ts:1`) and `InternalResumeResponse`
(gw-01 `app.ts:1`) are genuinely shared and genuinely parsed — this is the lib earning its
keep. `InternalPushResponse` and `InternalForwardResponse` have **zero consumers**;
`forward-client.ts:28` casts instead. perf: `parseOrThrow` runs per `/internal/push`, i.e. per
be-01 broadcast — the one validation on a hot path in gw-01. DDD: the `InternalResumeResponse`
JSDoc (`:35–43`) explaining why the replaying arm carries events rather than a count is a
decision that would otherwise be reversed by the next reader.
**`libs/contracts/src/ws.ts` | 41** — the browser ↔ gw-01 wire. reuse: **`WsFrame` and
`WsControlFrame` have exactly one consumer, `libs/realtime`, which itself has zero consumers**
(below). So the client-facing half of the contracts lib is transitively dead, while the
producer (`gw-01/ws.controller.ts`) and the real consumer (`fe-01/lib/project-stream.ts:118–124`)
each hand-write the frame shapes. And they already disagree: `ResumeDeniedFrame.reason` is
`'out_of_range'` at `:23`, gw-01 emits `'unavailable'` at `ws.controller.ts:103`.
**`libs/contracts/project.json` | 29** — typecheck is `tsc --noEmit -p libs/contracts/tsconfig.json`
(solution-config risk, above).

### 3.4 `libs/domain` — the good lib, with two hot spots

**`libs/domain/src/index.ts` | 15** — barrel. DDD: the comment at `:4–5` explaining why
`effective-label` is _not_ exported ("it is the walk the three dimensions share, not a fourth
thing to read a plan with") is a one-sentence architecture decision in exactly the right place.
Subpath gap: `tsconfig.base.json` declares aliases for `workday`, `assumed-duration`,
`effective-{team,tag,service}`, `label-mismatch`, `priority-band`, `dependency-reach`,
`external-system` — but **not** for `estimate`, `progress`, `capacity` or `not-before`, so a
browser bundle wanting `finalDays` must pull the whole barrel (and with it `@wbs/validation`
→ arktype, via `estimate.ts:1`).

**`libs/domain/src/assumed-duration.ts` | 27** — one constant. reuse: be-01 `schedule.ts:1`
and fe-01's gantt geometry — the two-reader argument at `:19–23` is the justification.
perf: none. DDD: 26 lines of JSDoc for one number, and every line earns its place.

**`libs/domain/src/capacity.ts` | 25** — `MOST_PEOPLE_AT_ONCE`. reuse: 8 consumer files.
perf: none. DDD: `:19–23` explains why the _floor_ is deliberately **not** here — an argument
for what a shared module should refuse to hold, which is rarer and more useful than the
opposite.

**`libs/domain/src/dependency-reach.ts` | 30** — enum + guard. reuse: 8 files. perf: `.includes`
over 2 elements. DDD: ties to ADR 0010 at `:14`.

**`libs/domain/src/effective-label.ts` | 172** — the shared **overriding** walk.
reuse: two dimensions (`effective-team.ts:106`, `effective-service.ts:108`) — this is the model
the audit names, and it is. perf: memoised via `found` + `walked` (`:123`, `:168`), so the whole
plan is one linear pass; the identity-preserving `wrap`-once contract (`:53–56`) is asserted by
a test. **No O(n²).** DDD: three `Proof:` comments (`:135`, `:148`, `:162`) each naming the
injected fault, the failing test and the date. ADR 0008 is cited at `:14–22` with the reason
the tag walk forked. Nothing to change.

**`libs/domain/src/effective-tag.ts` | 234** — the **accumulating** walk (ADR 0008).
reuse: 5 files. perf: **the one real O(n²) in `libs/domain`.** `accumulate` (`:215–234`)
allocates a fresh array of length `|stated| + |carried|` for **every stating row**, so a chain
of D rows each stating one tag costs `1+2+…+D` = O(D²) work **and** O(D²) retained memory,
since every level holds its own distinct array. The `settled` memo (`:128`) removes the
re-walking, not the re-copying; the early return at `:220` only helps rows that state nothing.
The answer's _size_ is inherently O(D) per deep row (ADR 0008 says so: "what is now unbounded
is a reading"), but the _work_ need not be — a persistent cons-list or a shared-prefix array
with a per-row `claimed` overlay makes it O(D). Depth is small today; this is the line that
bites when somebody tags every level of a 30-deep tree. DDD: five `Proof:` comments naming
four distinct injected faults (`:149`, `:186`, `:194`, `:205`, `:209`). The `unsettled.reverse()`
comment (`:160–162`) explains a `noUncheckedIndexedAccess` workaround at the point of use.

**`libs/domain/src/effective-team.ts` | 112** and **`effective-service.ts` | 114** — one
function each over the shared walk. reuse: 5 files each. perf: inherits `effective-label`'s
linearity. DDD: both are ~95% JSDoc over a 7-line body, and the JSDoc is the domain model —
`effective-service.ts:76–82` records that the store is still one nullable column and the caller
folds it into a singleton, which is the kind of in-flight-migration fact that is invisible
everywhere else.

**`libs/domain/src/estimate.ts` | 235** — the estimate vocabulary, ADR 0011's arithmetic.
reuse: be-01 `roll-up.ts:1`, `project.service.ts:1`, `work-item.service.ts:1`, fe-01.
perf: `combinedDays`/`finalDays` are O(1); `roundDays` (`:209`) calls `snapWorkdays` once.
No issue. DDD: **the only file in `libs/domain` that imports `@wbs/validation`** (`:1`), which
is why it has no subpath alias and why pulling `finalDays` into a browser bundle pulls arktype.
Splitting the two ArkType schemas (`ThreePointEstimate`, `PertWeights`) into
`libs/contracts` — where the ArkType schemas live — would leave `estimate.ts` runtime-free.
`isEstimateRounding`'s JSDoc says "one of the three" (`:140`) for a four-member set (`:137`).

**`libs/domain/src/external-system.ts` | 114** — URL → canonical system name.
reuse: 11 consumer files, the widest in the lib. perf: `segmentsOf` (`:36`) re-splits the
pathname inside **each** pattern's `claims`, so a slack URL costs 5 splits; hoisting the split
out of the `find` at `:113` makes it one. Trivial in absolute terms, but this runs per external
ref on a write. DDD: `:5–9` binds the list to the migration's seed and names the test that
holds them together — the pattern more of this repo's enums should follow. The
"runs at the write and its answer is stored" argument (`:85–92`) is a genuine
irreversible-by-accident decision recorded at the point of use rather than in an ADR.

**`libs/domain/src/label-mismatch.ts` | 183** — the two mismatch signals.
reuse: `builtByNonOwner` 7 files, `assignedOutsideTeam` 4. perf: both use nested `.some` with
`.includes` (`:117–119`, `:179–182`) — O(S × T × |owned|) and O(A × T*person × T_row) per row,
and the JSDoc at `:98–102` and `:159–163` \_recommends* calling them once per member to answer
"which one", making it O(n²) by design at the call site. With sets of 1–3 this is faster than
`Set` construction; it is worth a comment saying so, because it reads as an oversight.
DDD: the two "statement of the rule rather than load-bearing code" comments (`:109–115`,
`:170–177`) — one of which records `watched 2026-08-21 — 114 pass, 0 fail` for a guard that
provably protects nothing — are the honest way to keep a redundant line. Exemplary.

**`libs/domain/src/not-before.ts` | 52** — the reason's length cap and the orphan rule.
reuse: 4 files. perf: none. DDD: `isOrphanedNotBeforeReason` (`:47`) is a two-term boolean with
30 lines of JSDoc arguing why the pair is refused rather than tidied — and it is the argument,
not the code, that stops the next reader "fixing" it by nulling the reason.

**`libs/domain/src/priority-band.ts` | 224** — the ladder, its rank rule, and its validator.
reuse: 21 subpath consumers — the most-imported subpath in the repo. perf: `priorityBandRankOf`
is O(5); `priorityLadderProblem` is two O(5) passes. Nothing. DDD: the **two-pass ordering**
argument (`:165–173`) records a shipped check-that-could-not-fail and why the passes must be
separate — this is R5 archaeology inside a function body and it is exactly where it belongs.
`ORDINARY_BAND_RANK`'s "a rank, not the constant 50" argument (`:72–87`) is the same shape.

**`libs/domain/src/progress.ts` | 95** — `StepState`/`ItemState`, `agree`, `stateOf`.
reuse: be-01 `roll-up.ts`, `compensating.ts:1`, `plan-command.ts:1`. perf: `stateOf` is one
pass. DDD: `agree` (`:77`) is a one-line associative/commutative/idempotent fold and the JSDoc
proves those three properties are why a parent can be folded from children rather than leaves —
a genuinely deep 2-line function. `ItemState` is on the audit's D7 banned-noun list; the
domain name is closer to _step progress_ / _item progress_ (CONTEXT.md "progress").

**`libs/domain/src/workday.ts` | 279** — the calendar/workday arithmetic and the drift snap.
reuse: 8 subpath consumers across be-01 and fe-01. perf: **the hottest thing in `libs/domain`
and the one place a real algorithm is missing.** `addWorkdays` (`:246`) loops **once per
workday**, allocating a `Date` per iteration plus up to 2 more skipping a weekend — a slice
150 workdays out costs ~200 `Date` allocations, and the scheduler calls it per slice.
`workdaysBetween` (`:268`) loops **once per calendar day** between the two dates — an 18-month
plan costs ~550 allocations per call. Both are closed-form: `weeks×5 + remainder` with a
weekday offset, O(1). Underneath, `toUtc` (`:23`) calls `isIsoDate`, which itself constructs a
`Date` and calls `toISOString().slice()` (`:18–19`) — so **every** date operation costs a regex,
two `Date` constructions and an ISO serialisation; `calendarDaysBetween` (`:80`) pays that
twice, and the Gantt's calendar axis calls `addCalendarDays` once per drawn cell.
DDD: the best-documented file in the repo. `DRIFT` (`:99–109`) argues its magnitude against
both the smallest real estimate and the largest plausible accumulated error; `snapWorkdays`
(`:111–132`), `firstWorkdayOf`, `lastWorkdayOf` and `wholeDaysCovering` each carry a `Proof:`
naming the injected fault, the failing test in **each tier**, and the wrong dates it produced.
Nothing here should change except the two loops.

**`libs/domain/project.json` | 29** — typecheck is `tsc --noEmit -p libs/domain/tsconfig.json`
(solution-config risk).

### 3.5 `libs/observability` — half dead

**`src/index.ts` | 3** — barrel over `log-schema`, `logger`, `metrics` (not `serializers`).
**`src/logger.ts` | 32** — role: pino factory. reuse: be-01 (4 files) + gw-01 (1). perf: none.
DDD: `ServiceName` (`:5`) is `'be-01' | 'gw-01' | 'fe-01'` — **`mcp-01` is not in the union**,
which is why mcp-01 uses `console.error` (`main.ts:30`) and produces no structured logs at all.
`:15` reads `process.env['LOG_LEVEL']` directly, bypassing every app's validated config.
**`src/log-schema.ts` | 22** — `LogRecord` ArkType schema. reuse: **zero consumers.** Nothing
validates a log record anywhere; the schema and `logger.ts`'s actual output can disagree freely
(and do: `LogRecord` has no `service: 'mcp-01'` arm either).
**`src/metrics.ts` | 39** — `Counter`, `Histogram`, `Gauge` over OTel. reuse: **zero
instantiations repo-wide.** gw-01 wrote `GatewayMetrics` instead; be-01 exposes nothing.
So `observabilityPlugin` mounts a `/metrics` endpoint that serves an empty registry in both
apps, and its own fallback string (`otel-plugin.ts:45`, "no metrics registered yet") is what
production actually returns.
**`src/serializers.ts` | 11** — `errSerializer`. reuse: 1, internal (`logger.ts:3`); not
exported from the barrel. Fine as an implementation detail.
**`src/server/index.ts` | 2** and **`src/server/otel-plugin.ts` | 56** — role: the Elysia
metrics route. reuse: be-01 `app.ts:2` + gw-01 `app.ts:3`. perf: `reader.collect()` +
`serializer.serialize` per scrape — correct. DDD: module-level mutable `started`/`sharedReader`
(`:13–14`) plus `__resetForTests()` (`:53`) is process-global state with a test-only escape
hatch; a `MeterProviderHandle` passed into the plugin would remove both. The subpath split
(`@wbs/observability/server`) is the right seam — it keeps Elysia out of anything isomorphic.
**verdict**: the logger and the plugin earn their keep; `log-schema.ts` and `metrics.ts` (61
lines) are dead and should go or acquire the caller they were written for.

### 3.6 `libs/realtime` — **dead; delete it**

**`src/index.ts` | 3**, **`src/reconnecting-ws.ts` | 136**, **`src/subscription-tracker.ts` | 26**,
**`src/tanstack-adapter.ts` | 16** — role: the browser realtime client (backoff, heartbeat,
envelope discrimination, last-seq persistence, TanStack bridge).

- reuse: **`@wbs/realtime` has zero importers in the entire repo.** The real client is
  `apps/fe-01/src/lib/project-stream.ts` (232 lines), which independently implements
  reconnection with backoff+jitter (`:107–112` vs `reconnecting-ws.ts:24–28`), the resume
  handshake (`:196–201` vs `:88`), envelope-vs-control discrimination (`:118–124` vs `:92–107`)
  and last-seq tracking (`seen`, `:213` vs `SubscriptionTracker.update`, `:15`). Two
  implementations, and only the dead one uses `@wbs/contracts`. Where they differ, fe-01's is
  the shipped behaviour and the better-argued one: it deliberately does **not** advance the
  sequence on a frame (`project-stream.ts:157–160`), while `reconnecting-ws.ts:97` advances on
  every frame — a divergence that would corrupt resume if the dead lib were ever adopted.
  `tanstack-adapter.ts` names a library (TanStack DB) that nothing in the repo uses.
  `libs/realtime` is also the sole consumer of `WsFrame`/`WsControlFrame`, so deleting it makes
  `libs/contracts/src/ws.ts` dead too — unless gw-01 and fe-01 are made to import them, which
  is the better move.
- perf: `reconnecting-ws.ts` has no `pongTimer` clear on close-before-pong other than
  `clearHeartbeat` (fine), and `EnvelopeGuard` (`:30`) runs a full ArkType parse **per inbound
  frame** in a browser — the one place validation would be on a hot path.
- DDD: the heartbeat (`:66–73`) is the only ping/pong implementation in the repo; gw-01 answers
  `pong` (`ws.controller.ts:78`) and **nothing sends `ping`** — fe-01's client has no heartbeat
  at all. So gw-01's pong handler is currently a branch no production client reaches.
- **verdict**: three ways out. (a) delete the lib and accept that fe-01 owns the client;
  (b) delete `project-stream.ts` and adopt the lib, after porting fe-01's seq rule and its
  `settle()` distinction between "open" and "synchronised" (`:162–174`) — which the lib lacks
  and which the JSDoc there says prevents a reconnect storm; (c) keep the lib but move
  `project-stream.ts`'s **rules** into it and leave fe-01 with the React wiring. (c) is the only
  one that also makes `libs/contracts/src/ws.ts` load-bearing.

### 3.7 `libs/scripts` — **fails the deletion test outright**

**`src/index.ts` | 4**, **`src/dagger-args.ts` | 17**, **`src/readers.ts` | 13**,
**`src/shell.ts` | 44**, **`src/ssh.ts` | 27** — role: shell/ssh/dagger/file helpers for
deploy scripts.

- reuse: **zero consumers repo-wide.** The single grep hit is a _comment string_ in
  `tools/tool-secrets/src/cli/push.ts:11` — "will be wired to `@wbs/scripts` ssh helpers once a
  real age key is configured". Every exported symbol (`daggerArgs`, `readJson`, `readYaml`,
  `$`, `ShellError`, `buildSshCommand`, `buildScpCommand`) has zero callers.
- perf: n/a.
- DDD: `shell.test.ts` (64) tests `$` against real commands, so the lib has more test lines
  than callers. `ssh.ts`'s `DEFAULT_OPTS` includes `StrictHostKeyChecking=accept-new` — a
  deploy-security decision sitting in a module nothing runs.
- **verdict**: 105 lines of source, 0 consumers, 1 aspirational comment. Delete, or make
  `tools/tool-remote-scripts` and `deploy/` actually use it. As it stands it is a fourth
  shelling convention beside `bun $`, `Bun.spawn` and the shell scripts in `deploy/`.

### 3.8 `libs/validation` — **earns its keep at ~40%**

**`src/index.ts` | 3** | barrel.
**`src/core.ts` | 24** — `type`, `Type`, `parseOrThrow`, `defineSchema`, `InferSchema`.
reuse: `parseOrThrow`/`type` are imported by 29 files — the widest-used lib in the repo and
unambiguously load-bearing. **`defineSchema` and `InferSchema` have zero consumers.**
perf: `parseOrThrow` is on gw-01's `/internal/push` path (per broadcast) and on
`InternalResumeResponse` — both fine. DDD: **`:15` puts `JSON.stringify(input)` into the error
message**, which is the leak `mcp-01/config.ts:44–48` refuses `defineConfig` over. For be-01
and gw-01 this prints the whole environment — including `JWT_SIGNING_KEY_CURRENT` and
`INTERNAL_AUTH_SECRET` — into a boot-failure log. That is a security defect in the most-imported
function in the workspace, and one app has already worked around it silently.
**`src/branded.ts` | 14** — `Branded`, `brandedString`. reuse: **zero consumers.** perf: n/a.
DDD: carries an eslint-disable and a TODO-shaped comment (`:6`) for a feature nothing uses.
**`src/errors.ts` | 10** — `ValidationError`. reuse: `gw-01/internal.controller.ts:2`,
`core.ts:3`. Load-bearing. DDD: the `override readonly cause` comment (`:3–5`) is right.
**`src/fixtures/clock.ts` | 14** — `injectedClock`. reuse: **zero consumers.** be-01 and
gw-01 inject `now: () => number` by hand everywhere (`oidc-store.ts:26`, `oauth.ts:67`).
**`src/fixtures/db.ts` | 16** — `makeTestDb`. reuse: 4 be-01 test files. Earns its keep.
**`src/fixtures/frame.ts` | 17** — `makeFrame` + its own `WsFrame` **interface**. reuse:
**zero consumers**, and the `WsFrame` at `:1–5` is a fourth declaration of the envelope beside
`contracts/src/ws.ts:3`, `realtime/src/reconnecting-ws.ts:30` and
`fe-01/project-stream.ts:118`. Also holds `let globalSeq` (`:7`) — module-level mutable state
in a fixture, which the fixtures README's own rule 1 ("factories, never shared mutable
fixtures") forbids.
**`src/fixtures/README.md` | 19** — the only lib README with content. It states five
conventions; rule 1 and rule 2 are both violated by `frame.ts` and by every hand-rolled clock.
**verdict**: keep `core.ts` (fix the message leak), `errors.ts`, `fixtures/db.ts`. Delete
`branded.ts`, `fixtures/frame.ts`, and either delete `fixtures/clock.ts` or make the four
hand-rolled `now` injections use it.

### 3.9 Lib READMEs

`contracts`, `domain`, `realtime`, `scripts`, `validation`, `observability`, `config` all carry
the identical stub _"This library was generated with [Nx](https://nx.dev)."_ Seven READMEs, zero
information. The two that are not stubs — `libs/validation/src/fixtures/README.md` and
`apps/mcp-01/README.md` — are the two documents an agent can actually orient from.

---

## 4 · Which be-01 `service/` files can move to `libs/domain` today

Measured by what each file imports from `../repository` and which **fields** it actually reads.

**Move today, zero row-type imports (239 LOC):**

| file                        | LOC | repository imports | why it moves                                                                                     |
| --------------------------- | --- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `service/derive-numbers.ts` | 174 | **none**           | already declares its own structural `WorkItemPlacement` (`:2–8`). One `import`-free pure module. |
| `service/place-sibling.ts`  | 65  | **none**           | already declares its own `Sibling` (`:4–7`).                                                     |

Both are pure, both are already domain vocabulary (CONTEXT.md **work item number**, **position**,
**repadding**), and `deriveNumbers` is imported by three service files plus `directory-usage.ts`.
Nothing blocks these but the decision.

**Move after naming one small domain type (76 LOC):**

| file                          | LOC | needs                                     | mapping                                                                                                                                                                                     |
| ----------------------------- | --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service/assumed-assignee.ts` | 76  | `Assignment` (`repository/index.ts:1207`) | 3 fields: `{workItemId, stepId, personId}`. Declare `StepAssignment` in `libs/domain`; `Assignment` becomes `extends`/structurally compatible. CONTEXT.md already has **assumed assignee**. |

**Move after naming one domain row type (2,272 LOC — the big win):**

| file                          | LOC   | needs                                                                                                           | mapping                                                                                                                                                                                                                                                                      |
| ----------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/domain/src/schedule.ts` | 2,212 | `WorkItem` — but reads only **`.id` (9), `.parentId` (4), `.priority` (5)** (measured)                          | declare `PlannedRow { id: string; parentId: string \| null; priority: number \| null }`. That is the **whole** mapping for the 2,212-line engine. Everything else it needs (`Slice`, `DependencyEdge`, `PoolSizes`, `ScheduleFloor`) it already declares itself at `:7–281`. |
| `service/dependency.ts`       | 60    | `StoredDependency` (4 fields) + `WorkItem` (`.id`/`.parentId` only) + `hasCycle`/`indexTree` from `schedule.ts` | moves **with** `schedule.ts`, or takes `TreeIndex` as an argument. `DependencyEdge` (`schedule.ts:7`) is already the domain shape; `StoredDependency` adds only `id`/`projectId`.                                                                                            |

`schedule.ts` is the single highest-leverage move in the repo: 2,212 lines of pure rules whose
entire coupling to storage is three field names. CONTEXT.md already carries the whole vocabulary
(**slice**, **block**, **pool**, **slot**, **width**, **binding floor**, **blocking set**,
**eligible slice**, **anchor slice**, **projection**, **resource leveling**), and `libs/domain`
already holds the two constants it imports (`ASSUMED_SLICE_WORKDAYS`, `snapWorkdays`,
`DependencyReach`).

**Needs a real row → domain mapping first (347 LOC):**

| file                 | LOC | needs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service/roll-up.ts` | 347 | five types: `StoredEstimate` (`:857`), `StoredActual` (`:895`), `StoredProgress` (`:953`), `StoredMeasure` (`:1015`), `MeasureMetric` (`schema.ts`), plus `WorkItem` (`.id`/`.parentId` only). Each is a `{workItemId, stepId, …value}` triple; the domain names are **estimate**, **recorded days**, **progress**, **measure**/**metric** — all already in CONTEXT.md. Declare `EstimateOf`, `ActualOf`, `ProgressOf`, `MeasureOf` in `libs/domain` and the file moves. `Days` (`:20`) is already a domain type living in the wrong place — `estimate.ts` should own it. |

**Needs a decomposed aggregate (387 LOC):**

| file                         | LOC | needs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `service/directory-usage.ts` | 387 | `DirectoryUsageRows` (`repository/index.ts:1299`) is an 8-field read-model aggregate (`workItems`, `projects`, `assignments`, `steps`, `people`, `members`, per-project capacities…). It is a **query result**, not a row type — it belongs in `libs/domain` as `DirectoryUsageInput` with be-01's repository assembling it. Also needs `LabelledWorkItem`'s `teamIds`/`tagIds`, which `libs/domain`'s `TeamsLabelled`/`TagsLabelled` already describe. Medium effort; the rules themselves are pure (CONTEXT.md **directory usage**, **step usage**). |

**Should probably stay in be-01 (492 LOC):**

| file                      | LOC | why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `service/compensating.ts` | 492 | imports **16** repository types (`ActualKey`, `EstimateKey`, `MeasureKey`, `ProgressKey`, `FrozenNumber`, `Reparented`, `WorkItemPatch`, `StoredDependency`, `StoredActual/Estimate/Measure/Progress`, `Assignment`, `MeasureMetric`, `WorkItem`) at `:3–19`. It is the **journal** — it is _about_ stored rows by definition (ADR 0007's outer transaction). Its `readCommand`/`readPayload`/`readPreconditions` parsers (`:317–372`) belong in `libs/contracts` beside the other ArkType schemas; the rest is storage. |

**Total that could move with ≤ one new domain type each: 2,587 lines** (`derive-numbers`,
`place-sibling`, `assumed-assignee`, `schedule`, `dependency`). That takes `libs/domain` from
~1,911 to ~4,500 lines and turns the audit's D2 from "no domain layer" into "a domain layer
plus a journal".

---

## 5 · The four specific questions

**Do `libs/realtime` and gw-01 duplicate envelope/heartbeat logic?**
Not each other — **`libs/realtime` and fe-01 do**, and gw-01 is a third party that shares the
wire with neither. Four declarations of the envelope (`contracts/src/ws.ts:3`,
`realtime/src/reconnecting-ws.ts:30`, `validation/src/fixtures/frame.ts:1`,
`fe-01/project-stream.ts:118`), two reconnect/backoff implementations
(`reconnecting-ws.ts:24` and `project-stream.ts:107`), one heartbeat implementation
(`reconnecting-ws.ts:66`) whose peer handler in gw-01 (`ws.controller.ts:77`) no live client
reaches, and one contract mismatch already shipped (`resume_denied.reason`:
contract says `'out_of_range'`, gw-01 sends `'unavailable'`).

**Do `libs/auth` and mcp-01's `oauth.ts` duplicate JWT/JWKS handling?**
JWKS: **no** — `libs/auth/src/token-verifier.ts:31` is the only `createRemoteJWKSet` in the
repo and mcp-01 reaches it through `oidcTokenVerifierFromEnv` (`oauth.ts:526`). Caching is
correct and single. JWT signing/verifying: **yes, three times** —
`be-01/auth.service.ts:133/:171`, `gw-01/jwt-auth.ts:31`, `mcp-01/oauth.ts:440/:483` — each with
its own key material and none of the three in `libs/auth`. **Transaction/token storage: yes,
and dangerously** — `oauth.ts`'s inline transaction map (`:89`, `:316`, `:337–348`) is a
weaker re-implementation of `libs/auth/src/oidc-store.ts:38–86`, which be-01 already uses:
verbatim binding key instead of a digest, `!==` instead of `timingSafeEqual`.

**Do `libs/validation`, `libs/config`, `libs/scripts` pass the deletion test?**

- `libs/validation`: **partly.** `core.ts` (`type`, `parseOrThrow`) has 29 consumer files and is
  the workspace's spine; `errors.ts` and `fixtures/db.ts` are used. `branded.ts`, `defineSchema`,
  `InferSchema`, `fixtures/clock.ts`, `fixtures/frame.ts` have **zero** consumers.
- `libs/config`: **no.** 42 source lines; one function with two callers; `sops-loader.ts`,
  `LogLevel`, `JwtKey`, `InternalAuthSecret` have zero consumers; and the third potential
  caller (mcp-01) explicitly refuses it. Fold `defineConfig` into `@wbs/validation`.
- `libs/scripts`: **no.** 105 source lines, **zero** consumers, one aspirational comment
  (`tools/tool-secrets/src/cli/push.ts:11`). Delete or wire.

---

## 6 · Performance axis, consolidated

**gw-01**

- Broadcast fan-out is **one stringify, N sends** (`internal.controller.ts:27–32`) — correct.
- Presence broadcast is **N stringifies for N projects and O(C×P) scanning**
  (`presence.ts:86`, `:121–139`), fired on every join/subscribe/unsubscribe/close.
- Per inbound message: up to **four** JSON passes (Elysia parse → `app.ts:246` stringify →
  `ws.controller.ts:71` parse → `forward-client.ts:25` stringify).
- **No backpressure handling at all**: `ws.send`'s return is discarded at `app.ts:197`,
  `presence.ts:135`, `internal.controller.ts:32`. No per-socket buffer, no drop counter, no
  `activeConnections`-aware shedding.
- Token verified twice per upgrade (`app.ts:181`, `:207`).
- `subs.removeAll` is O(all subscriptions) per disconnect (`subscription-map.ts:24`).
- No timeout on the hot forward (`forward-client.ts:17`) though the health probe has one.

**mcp-01**

- OpenAPI document: **parsed once at boot** (`main.ts:16`). Correct.
- Tool call → **exactly one HTTP hop** to be-01 (`wbs-client.ts:197`). Correct.
- Token verification: **2 local verifications per request minimum** (`caller-auth.ts:28` +
  `oauth.ts:172` via `upstreamTokenFor`), and **4 attempts / 2 JWKS verifications** on the
  upstream-token path — because `caller-auth.ts:32` passes claims that `oauth.ts:170` does not
  accept.
- JWKS/discovery: cached once per process (`libs/auth/src/token-verifier.ts:31`, `:55–59`).
- ~9 `new URL(…)` per request over boot-constant strings (`http.ts:25/:79/:100–101`,
  `oauth.ts:141–156`).
- `oauth.ts:501 cleanup()` full-scans four maps on every register/authorize/callback/token;
  four separate O(clients) filters at `:234`, `:237`, `:303`, `:420`.
- `generateKeyPairSync('rsa', 2048)` on the constructor (`oauth.ts:123`), on the boot path,
  even in gateway mode.
- Per request: a new `Server`, a new transport, a new `byName` map of 22 tools
  (`http.ts:142–147`, `server.ts:142`).

**libs/domain**

- `effective-label.ts`: memoised, **linear**. No O(n²).
- `effective-tag.ts`: **O(depth²)** work and retained memory via the per-level array rebuild in
  `accumulate` (`:215–234`).
- `workday.ts`: `addWorkdays` (`:246`) O(workdays), `workdaysBetween` (`:268`) O(calendar days),
  both with a `Date` allocation per iteration; both are closed-form O(1). Every date op pays a
  regex + 2 `Date` + a `toISOString` through `toUtc`/`isIsoDate` (`:14–26`).
- `label-mismatch.ts`: nested `.some`/`.includes` (`:117`, `:179`), and the documented "which
  one" idiom makes it O(n²) at the call site by design.
- No roll-ups live in `libs/domain` — they are all in `be-01/service/roll-up.ts`.

---

## Deepening candidates (this area)

### 1 — Move the schedule engine into `libs/domain` behind one row type

- **Files**: `apps/libs/domain/src/schedule.ts` (2,212), `dependency.ts` (60),
  `derive-numbers.ts` (174), `place-sibling.ts` (65), `assumed-assignee.ts` (76) →
  `libs/domain/src/`; new `libs/domain/src/planned-row.ts`.
- **Problem**: 2,587 lines of pure planning rules sit under `service/` behind an
  `import type { WorkItem } from '../repository'` that they barely use — `schedule.ts` reads
  three fields of it (`.id` ×9, `.parentId` ×4, `.priority` ×5). Two of the five files import
  nothing at all. `libs/domain` holds ~30% of the domain while the engine that decides every
  date is on the other side of a storage barrel.
- **Solution**: declare `PlannedRow { id; parentId: string|null; priority: number|null }` and
  `StepAssignment { workItemId; stepId; personId }` in `libs/domain`; make
  `repository/index.ts`'s `WorkItem`/`Assignment` structurally satisfy them (they already do —
  no adapter code, just a type import direction flip); move the five files; add
  `@wbs/domain/schedule` and `@wbs/domain/place-sibling` subpaths to `tsconfig.base.json`.
- **Benefits**: _locality_ — the scheduler sits beside `ASSUMED_SLICE_WORKDAYS`,
  `snapWorkdays`, `DependencyReach` and `finalDays`, which it already imports across the seam.
  _leverage_ — fe-01's Gantt currently re-derives geometry from be-01's output; with the engine
  shared it can compute a preview locally. _tests_ — `schedule*.test.ts` (≈3,800 lines across
  seven files) become library tests with no repository fixtures; the audit's measured cost
  ("`undo.test.ts` is 1,891 lines and wires 12 real repositories") is the same disease.
- **Effort**: M (mechanical move + 2 type declarations; the risk is `hasCycle`/`indexTree`
  being imported back by `work-item.service.ts:78–85`, which is fine — apps may import libs).
- **Risk**: low. No behaviour changes; `nx typecheck` catches every miss.
- **Deletion test**: passes emphatically — five modules, six consumer sites in be-01, and
  fe-01 gains a consumer it cannot have today.
- **ADR conflicts**: none. ADR 0010 (dependency reach) already lives in `libs/domain`;
  ADR 0011's `finalDays` is already there. Touching neither 0008 nor 0009.

### 2 — Give mcp-01's OAuth server its seams, and reuse `libs/auth`'s stores

- **Files**: `apps/mcp-01/src/oauth.ts` (608), `apps/mcp-01/src/oauth.test.ts` (714),
  `libs/auth/src/oidc-store.ts` (203), `apps/mcp-01/src/caller-auth.ts` (40).
- **Problem**: one 608-line class holds three concerns (client registry, transaction store,
  token issuance) with 12 tunables and no internal seams; its transaction store re-implements
  `InMemoryOidcTransactionStore` **less safely** (verbatim binding key at `:316` vs the digest
  at `oidc-store.ts:51`; `!==` at `:345` vs `timingSafeEqual` at `:70`); and its test file is
  larger than the module, 24 of whose cases are capacity-limit cases — the shape of a module
  that wants to be three.
- **Solution**: (a) replace `this.transactions` with `InMemoryOidcTransactionStore` from
  `@wbs/auth`, extended with the `{clientId, codeChallenge, redirectUri, scope, state}` payload;
  (b) extract `DynamicClientRegistry` (register / promotion / per-source partitioning /
  expiry) as its own module with a `Map<source, {proven, unproven}>` index, which also removes
  the four O(clients) filters; (c) extract `LocalTokenIssuer` (sign / verify / revoke / JWKS)
  and make the RSA keypair injected rather than generated in the constructor; (d) fix
  `upstreamTokenFor` to accept the already-verified claims its caller already passes
  (`caller-auth.ts:32` vs `oauth.ts:170`), halving the per-request verification count.
- **Benefits**: _locality_ — the security rule that a browser binding is stored digested lives
  in one module for both apps. _leverage_ — `libs/auth` gains its second consumer for
  `oidc-store`, which is what makes the hardening it already has worth having. _tests_ — the
  capacity cases move to the registry's own suite; `oauth.test.ts` shrinks to the protocol flow.
- **Effort**: M–L (608 lines, 714 test lines, security-sensitive).
- **Risk**: medium — it is the auth path. Every extraction is behaviour-preserving except the
  two intentional hardenings, each of which needs an R5 negative watched failing.
- **Deletion test**: `oidc-store.ts` goes from one consumer to two; nothing is deleted, but
  a divergence is.
- **ADR conflicts**: none.

### 3 — Decide the realtime client: one module, one envelope

- **Files**: `libs/realtime/**` (181), `apps/fe-01/src/lib/project-stream.ts` (232),
  `libs/contracts/src/ws.ts` (41), `apps/gw-01/src/controller/ws.controller.ts` (174),
  `libs/validation/src/fixtures/frame.ts` (17).
- **Problem**: four declarations of the frame envelope, two reconnect implementations, one
  heartbeat nothing sends, and a **shipped contract mismatch** — `contracts/src/ws.ts:23` types
  `resume_denied.reason` as `'out_of_range'` while `ws.controller.ts:103` sends `'unavailable'`,
  invisible because the producer never imports the contract. `@wbs/realtime` has zero importers.
- **Solution**: make `libs/contracts/src/ws.ts` the single envelope (add the `'unavailable'`
  arm, add `presence`, `subscribe`, `unsubscribe`, `who`); have `gw-01/ws.controller.ts` build
  every outbound frame through it and parse every inbound one through `WsControlFrame` at the
  seam (replacing the `msg['type'] === …` chain); move `project-stream.ts`'s **rules** —
  backoff, the "open ≠ synchronised" `settle()` distinction, the deliberate no-advance-on-frame
  seq rule — into `libs/realtime`, delete `reconnecting-ws.ts`'s conflicting seq handling
  (`:97`), delete `tanstack-adapter.ts` and `fixtures/frame.ts`.
- **Benefits**: _locality_ — the wire vocabulary in one file that both ends import.
  _leverage_ — `libs/contracts` stops being half-dead; a frame added once is typed at both ends.
  _tests_ — `reconnecting-ws.property.test.ts` (52) and `project-stream.test.ts` cover one
  module instead of two, and the contract mismatch becomes a compile error.
- **Effort**: M.
- **Risk**: low–medium (fe-01's stream is load-bearing and well-tested; the port must keep its
  seq rule, which is the one the dead lib got wrong).
- **Deletion test**: `tanstack-adapter.ts`, `fixtures/frame.ts` and `contracts/src/errors.ts`
  all go; `libs/realtime` either gains its first real consumer or disappears entirely.
- **ADR conflicts**: none.

### 4 — `workday.ts`: closed-form the two loops

- **Files**: `libs/domain/src/workday.ts` (`:246`, `:268`, `:14–26`), `workday.test.ts` (254).
- **Problem**: `addWorkdays` allocates a `Date` per workday and `workdaysBetween` one per
  calendar day; every date operation pays a regex + two `Date` constructions + a
  `toISOString()` through `toUtc`→`isIsoDate`. The scheduler calls these per slice and the
  Gantt's calendar axis calls `addCalendarDays` per drawn cell.
- **Solution**: closed-form both (`weeks × 5 + remainder` against the weekday offset); split
  `toUtc` into a validating boundary entry and an internal non-validating one, so an internal
  chain validates once. Keep every `snapWorkdays` call exactly where it is.
- **Benefits**: _leverage_ — this is the arithmetic under every date in the product, shared by
  be-01 and fe-01. _tests_ — `workday.test.ts` (254) is already the oracle; a property test
  asserting the closed form equals the loop for 0..500 workdays across every start weekday is
  the natural addition.
- **Effort**: S.
- **Risk**: medium **only because the JSDoc proofs must survive** — `firstWorkdayOf`,
  `lastWorkdayOf`, `wholeDaysCovering` and `addWorkdays` each carry a watched `Proof:` naming
  the injected fault and the failing test in each tier; those must be re-watched, not assumed.
- **Deletion test**: n/a (no module removed).
- **ADR conflicts**: **ADR 0011** — `snapWorkdays` runs _before_ the rounding
  (`estimate.ts:214`) and the ADR names that ordering explicitly ("the drift snap moved into
  the arithmetic"). Do not touch the snap's position.

### 5 — `effective-tag.ts`: stop rebuilding the carried list per level

- **Files**: `libs/domain/src/effective-tag.ts:215–234`, `effective-tag.test.ts` (238).
- **Problem**: `accumulate` allocates a fresh `TagInForce[]` for every stating row, so a chain
  of D tag-stating rows is O(D²) work and O(D²) retained memory. ADR 0008 already notes the
  _answer_ grows with depth; the _work_ need not.
- **Solution**: a shared-prefix representation — keep `carried` as the tail and prepend only the
  row's own new tags, materialising a flat array once per row that is actually asked for; or a
  persistent cons-list with a `claimed` Set threaded down the walk.
- **Benefits**: _leverage_ — five consumers, and the export path and the facet both read it
  over whole plans. _tests_ — the existing object-identity assertions (`:181–189`) are exactly
  the oracle for "the memo still holds"; the fix must keep them passing.
- **Effort**: S–M.
- **Risk**: medium. The five `Proof:` comments at `:149`, `:186`, `:194`, `:205`, `:209` each
  name a distinct fault (dropped inheritance, duplicate tag, wrong provenance, lost memo);
  all five must be re-watched.
- **Deletion test**: n/a.
- **ADR conflicts**: **ADR 0008 directly.** The order (own tags first, then ancestors nearest
  first, `:46–51`), the "nearer statement wins the provenance" rule (`:84–87`) and the per-tag
  `fromId` shape (`:31–37`) are all ADR-mandated and drive the Tags cell's ✕. Any change must
  preserve all three exactly. **ADR 0009** is the neighbouring trap: there is deliberately no
  `effectiveTypesOf`, and its absence is load-bearing — do not "generalise" this walk into one
  that a type dimension could reuse.

### 6 — Fold `libs/config` and `libs/scripts` in, and fix the message leak

- **Files**: `libs/config/**` (42), `libs/scripts/**` (105), `libs/validation/src/core.ts:15`,
  `apps/mcp-01/src/config.ts:41–48`.
- **Problem**: two libs with, respectively, one function and two callers, and zero callers.
  Meanwhile `parseOrThrow` — the most-imported function in the workspace — puts
  `JSON.stringify(input)` in its thrown message, so be-01's and gw-01's boot failures print
  `JWT_SIGNING_KEY_CURRENT` and `INTERNAL_AUTH_SECRET`; mcp-01 already refuses `defineConfig`
  over exactly this and says so at `config.ts:44–48`.
- **Solution**: give `parseOrThrow` an options argument (`{ describeInput?: (input) => string }`)
  or a sibling `parseOrDescribe` that names paths and never values; move `defineConfig` into
  `@wbs/validation` using it; delete `libs/config` (`sops-loader.ts` and the three unused
  env schemas go with it, or acquire callers); delete `libs/scripts` or wire
  `tools/tool-secrets` and `deploy/` to it — its own comment says it is waiting.
- **Benefits**: _locality_ — one validation module. _leverage_ — mcp-01 stops maintaining a
  parallel config reader (`config.ts:24–39`'s `NAMES`/`EXPECTATIONS` restate its own schema
  twice). _tests_ — one negative asserting no env value appears in a boot-failure message,
  watched failing against today's `core.ts:15`.
- **Effort**: S.
- **Risk**: low.
- **Deletion test**: **two libs removed**, 147 source lines, and a security defect closed.
- **ADR conflicts**: none.

### 7 — gw-01: one metrics system, one socket write path

- **Files**: `apps/gw-01/src/service/gateway-metrics.ts` (46),
  `libs/observability/src/metrics.ts` (39), `apps/gw-01/src/app.ts:115/:149/:197`,
  `presence.ts:121`, `controller/internal.controller.ts:32`,
  `libs/observability/src/log-schema.ts` (22), `libs/observability/src/logger.ts:5`.
- **Problem**: gw-01 mounts `observabilityPlugin` (an OTel `/metrics` that is **always empty**,
  because nothing in the repo ever constructs `Counter`/`Histogram`/`Gauge`) **and** serves its
  own `/metrics/snapshot` from a hand-rolled counter class with a dead singleton at
  `gateway-metrics.ts:46`. Separately, every `ws.send` in the app discards Bun's return value,
  so backpressure and dropped frames are invisible — including on the fan-out path the
  `messageFanoutTotal` counter claims to measure.
- **Solution**: make `GatewayMetrics` construct `libs/observability`'s `Counter`s (giving that
  module its first caller and `/metrics` real content), delete `/metrics/snapshot` and the
  `gwMetrics` singleton; introduce one `SocketWriter` seam that owns `send`, checks the return,
  and increments `dropped`/`backpressured`; add `'mcp-01'` to `ServiceName`
  (`logger.ts:5`) and `LogRecord.service` so mcp-01 can stop using `console.error`; delete
  `log-schema.ts` if nothing will validate a log record.
- **Benefits**: _locality_ — one place a frame is written and one place it is counted.
  _leverage_ — the first real OTel counters in the repo. _tests_ — a negative that a
  backpressured socket increments a counter, which nothing can express today.
- **Effort**: S–M.
- **Risk**: low (metrics), medium (touching the send path — needs the fan-out integration
  tests re-watched).
- **Deletion test**: `gwMetrics`, `/metrics/snapshot`, `log-schema.ts` go;
  `libs/observability/src/metrics.ts` stops being dead.
- **ADR conflicts**: none.

### Not a candidate, flagged: **ADR 0004** (`the signed-in region gets a router`)

Nothing in this sweep touches fe-01's routing. Recording it only because candidate 3 moves
`project-stream.ts`'s rules out of fe-01 — the stream is mounted **inside** the signed-in
region, below the auth gate, and the extracted module must not acquire any knowledge of routes
or of the gate. It takes a URL and a subscription; keep it that way.

---

## Agentic-workflow notes

**What makes these cheap for an LLM to edit safely**

- **`libs/domain` is the cheapest area in the repo.** Every module is pure, every file is one
  concept, and the JSDoc states the _decision_ and its _proof_ — `workday.ts:174–191` names the
  injected fault, the test in each tier, and the wrong dates it produced. An agent editing
  `lastWorkdayOf` cannot fail to learn what breaks. The `Proof:` convention converts "don't
  touch this" into a runnable instruction.
- **The absence-as-documentation pattern**: `libs/domain/src/index.ts:4–5` says why
  `effective-label` is _not_ exported; ADR 0009 says why there is no `effectiveTypesOf`;
  `capacity.ts:19–23` says why the floor is _not_ in the constant. An agent's most expensive
  mistake is "generalising" two similar walks into one — and this repo has pre-emptively
  answered that in three places.
- **`wbs-client.ts`, `openapi-tools.ts`, `place-sibling.ts`, `derive-numbers.ts`** are all
  pure-function modules with structural inputs. They are edit-and-test in one file.

**What makes them expensive**

- **`app.ts` (gw-01, 319) and `oauth.ts` (mcp-01, 608)** are composition roots with no internal
  seams. `app.ts`'s `/ws` block is 168 lines of four interleaved handlers sharing a
  triple-cast `ws.data`; any change needs 823 lines of integration harness to verify.
  `oauth.ts` has 13 methods over 4 shared maps and 12 tunables — an agent cannot change the
  client-expiry rule without reading the capacity rule, the promotion rule and the transaction
  rule, because they mutate the same records.
- **Dead code that reads as live.** `libs/realtime`, `libs/scripts`, `libs/observability`'s
  `metrics.ts`/`log-schema.ts`, `contracts/src/errors.ts`, `validation/src/branded.ts` and
  `fixtures/{clock,frame}.ts` all _look_ like the shared implementation. An agent told to "fix
  the reconnect backoff" will edit `libs/realtime/src/reconnecting-ws.ts` — the correct-looking,
  contract-typed, property-tested module — and ship nothing, because the live client is
  `fe-01/src/lib/project-stream.ts`. That is the single most expensive trap in this area.
- **Stale numbers in comments.** `openapi-tools.ts:199` says "40 of be-01's 51 operations";
  the document holds 30 operations, 27 without prose. `apps/mcp-01/README.md` says "Twenty
  tools" against a test asserting 22. An agent that trusts either will reason from a document
  that no longer exists — and neither number is covered by the drift test that sits right
  beside them (`openapi-tools.test.ts:371` checks names, not counts).
- **Duplicate names across implementations.** `SocketLike` / `WsSocket` / `PresenceSocket` are
  three identical interfaces in gw-01; four `WsFrame` declarations exist across three libs and
  an app. Grep, an agent's primary tool, returns the wrong one first.
- **The typecheck blind spot.** Only `libs/auth/project.json:23` runs `tsc --build --force`
  against the lib project; every other lib runs `tsc --noEmit -p <solution config>`, which is
  the exact fault CLAUDE.md records as having shipped twice and hidden a dead scaffold file in
  gw-01. An agent's `nx typecheck` may be compiling nothing in six libs.

**Why `apps/mcp-01/README.md` is the good example, and what the others lack**

- **It is oriented to the reader's next action, not to the file tree.** "Writing is two tools"
  is a heading that answers the question an agent actually has. `libs/*/README.md` × 7 say
  _"This library was generated with Nx"_, which answers no question anybody has.
- **It carries a worked example in real fields** — the `postApiProjectsByIdCommands` batch with
  `ref`/`parentRef`/`afterRef` — and that example is **executable documentation**:
  `openapi-tools.test.ts:399` asserts the example spells the fields the commands tool actually
  declares, and `:375` asserts the README names no tool the document does not derive. A README
  that a test can fail is the only kind that stays true. Nothing else in the repo has one.
- **It states the refusals, not just the capabilities**: "There is no `WBS_TOKEN`: caller
  authority is never replaced with a process-wide account"; `WBS_BASIC_AUTH` "is sent as
  `Proxy-Authorization` so it cannot displace the caller's Bearer header"; "The server refuses
  to boot if neither the source document nor that bundle copy exists." An agent learns what it
  must not do, which is the information a code reading gives up last.
- **It names the failure mode with the recovery**: "A refused command refuses the whole batch
  with `{ error, at, kind }` and nothing is applied; fix that command and resend."
- **It has an addressable surface list** — every endpoint and probe path, the port, the two
  auth modes with their required variables — so an agent can act without reading `http.ts`.
- **What it still lacks, and what a `libs/domain/README.md` should add**: a map from domain
  noun to module. `libs/domain` has 15 modules and the only way to find "where does tag
  inheritance live" is to grep. Four lines — _tags accumulate → `effective-tag.ts` (ADR 0008);
  teams/services override → `effective-team.ts`/`effective-service.ts` over
  `effective-label.ts`; types do not inherit at all → nowhere, deliberately (ADR 0009); dates
  → `workday.ts`; the charged figure → `estimate.ts` (ADR 0011)_ — would save an agent the
  three wrong guesses that ADR 0009 exists to prevent.
