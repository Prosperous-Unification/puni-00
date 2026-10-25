## Context

Read on 2026-10-25 at `origin/main` 277fdf03c:

| Need                              | Exists today                                                                                                                                                                                                                                                     | Missing                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Admitting a caller at `/mcp`      | `caller-auth.ts` `authenticateCaller`: standalone verifies an mcp-01 JWT (`verifyLocal`, session row by `jti`) or falls back to the upstream issuer; gateway decodes the JWT unverified because the gateway verified it. A `wbs_mk_` key fails both: `401`       | a machine path that does not accept a foreign token         |
| mcp-01's authorization server     | `oauth.ts` `McpOAuthServer`: `authorization_code` and `refresh_token` only, public clients (`token_endpoint_auth_methods_supported: ['none']`), 1 h access TTL, families and sessions in `McpSessionStore` (`sessionLimit` 1,000)                                | a grant with no human                                       |
| Verifying a machine credential    | be-01 `authentication.feature.ts`: `parseMachineKey`, `authenticateMachineKey` (PK read, constant-time digest, coarse `touchLastUsed`), the trusted-issuer path (A13 step 3, A25), `machinePrincipalOf`, `organizationRoleOf` (A23)                              | a route mcp-01 can ask without forwarding the key on `/api` |
| be-01 learning who an MCP call is | `/internal/mcp/delegation` (`x-internal-auth` plus the human's upstream token): a single-use, at most five-minute `wbs-be-01/via-mcp-01` delegation; one `(issuer, jti)` consume write per use (`SqliteDelegationUse`)                                           | a per-call bearer that does not cost a write                |
| Per-request statelessness         | `http.ts` `mcpFetchHandler`: a fresh `Server` and transport per request, `enableJsonResponse`, no `Mcp-Session-Id`, no standalone SSE stream                                                                                                                     | nothing                                                     |
| The tool list                     | `openapi-tools.ts`: every operation except `EXCLUDED_PATHS`. Today that list holds auth, internal and smoke routes, plus credential, issuer, provisioning and compute-provider routes. Other admin routes stay listed and answer `403` to every delegated caller | a policy, not a path list, for what is human-only           |
| Leases and caps                   | `wbs-claim-leases` L1: a claim is leased when it is taken under a credential pinned to its claimant. `wbs-organization-limits`: agent-person, claim and capacity caps. Neither one depends on the transport                                                      | nothing                                                     |
| Docs                              | `docs/auth-integration.md` "Fleets and the MCP endpoint" and `docs/local-dev.md` "These agents use HTTP only" (PR #738) tell fleets to use HTTP                                                                                                                  | their reversal                                              |

**MCP authorization, read 2026-10-25 from modelcontextprotocol.io (2025-11-25 revision):**

- The server "MUST validate that access tokens were issued specifically for them as the
  intended audience".
- "MCP clients MUST NOT send tokens to the MCP server other than ones issued by the MCP
  server's authorization server", and "MCP servers MUST NOT accept or transit any other tokens".
- The token an MCP server uses upstream "is a separate token" and it "MUST NOT pass through
  the token it received from the MCP client".
- Clients include RFC 8707 `resource` in token requests.

The stable **OAuth Client Credentials** extension (`modelcontextprotocol/ext-auth`, 2026-07-28,
read the same day) defines the `client_credentials` grant for machine-to-machine use. It allows
two client authentication methods: an RFC 7523 JWT assertion (RECOMMENDED) or a client secret
in the body. The authorization server's metadata lists `private_key_jwt` and/or
`client_secret_basic` in `token_endpoint_auth_methods_supported`. The text and examples put the
secret in the body, while the metadata names `client_secret_basic`; the extension does not
reconcile the two. **From memory, not re-read:** RFC 6749 §4.4.3 says a client-credentials
response should not carry a refresh token. Azure-style workload identity federation passes an
external OIDC token as `client_assertion` for a known `client_id`. Claude Code accepts static
`headers` for a remote MCP server. The Anthropic Messages API MCP connector takes an
`authorization_token`. Hosted claude.ai connectors run only the authorization-code flow. Before
M2 and M12 are built, re-read each of these and record it in verify.md.

## Goals / Non-Goals

**Goals:**

- A headless agent reaches `/mcp` as its credential's agent person, without a human per
  session and without mcp-01 accepting or forwarding a token its own server did not issue.
- One principal, one set of leases, one cap and one tool list, whichever way the agent arrived.
- A machine session costs mcp-01 no store row and be-01 no write per call.
- A swarm's N identities take one admin act.
- be-01's `/api` stops being an agent surface.

**Non-Goals:** consent changes; hosted-connector machine sign-in; wildcard subjects; machines
minting credentials; organization-configurable rate limits; REST deprecation windows.

## Decisions

Every decision below is **assumed, awaiting Dany**, and each can be overruled by its id. "From
memory" marks a claim that this draft did not re-read.

**M1. Admission is the OAuth client credentials grant at mcp-01's own token endpoint.** A
machine `POST`s `grant_type=client_credentials` with `resource=<MCP_PUBLIC_URL>` and
`scope=wbs:read wbs:write` to `/mcp/oauth/token`, authenticated by its credential (M2).
mcp-01 asks be-01 to verify that credential (M3) and answers with an mcp-01-signed access token
whose `aud` is the MCP resource. `/mcp` then sees only its own tokens, as the spec requires.
The authorization server metadata gains `client_credentials` in `grant_types_supported`, and
`client_secret_post`, `client_secret_basic` and `private_key_jwt` in
`token_endpoint_auth_methods_supported`. Dynamic client registration still refuses every
grant type except `authorization_code` and `refresh_token`: a machine is a credential an admin
created, never a self-registered client. Hosted connectors keep the authorization-code consent
(A8, A20). That path is how a claude.ai connector acts as a human or as a consented agent, and
nothing about it changes.

_Alternatives:_

- (a) Accept `wbs_mk_` at `/mcp` and forward it raw to be-01. This is the token passthrough the
  spec forbids, and every replica would handle the long-lived secret on every request.
- (b) Accept `wbs_mk_` at `/mcp`, verify it through be-01, and do not forward it. This is the
  simplest client configuration (one static header), but `/mcp` would still accept a token its
  own server did not issue, and the long-lived secret would travel on every request. **This is
  the alternative Dany is most likely to prefer for ergonomics.** It can be added later as a
  thin adapter in front of M1 if he overrules.
- (c) RFC 8693 token exchange (from memory). The same shape as M1, but it is not the
  extension's grant, and fewer clients speak it.
- (d) Keep HTTP for headless agents. This keeps two surfaces, which is the thing Dany rejected.

**M2. How each source authenticates at the token endpoint.**

- _API key:_ `client_id` is the credential id, and `client_secret` is the whole key
  `wbs_mk_<id>.<secret>`, sent in the body or by HTTP Basic (both, because of the extension's
  ambiguity). Sending the whole key keeps one boundary parser (A22). A `client_id` that differs
  from the key's id is `invalid_client`.
- _OIDC (trusted issuer):_ `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`,
  with `client_assertion` set to the workload's token (GitHub Actions, a Kubernetes projected
  service-account token) and `client_id` set to the credential id. be-01 verifies the assertion
  exactly as A13 step 3 and A25 do (registration chosen by `(iss, aud)`, credential by
  `(registration, sub)`), and requires the matched credential's id to equal `client_id`. This
  departs from RFC 7523 §2.2, which wants `iss = sub = client_id` (from memory). The workload
  token's issuer is the compute provider, which is the point of federation.
- _Consent:_ not a source here. A consent family keeps its refresh grant.

Every failure, whether an unknown id, a wrong secret, a revoked credential or an unverifiable
assertion, answers the same `401 invalid_client`, so the endpoint is no oracle for which ids
exist.

_Alternatives:_ the RFC 7523 §2.1 JWT-bearer authorization grant for OIDC (a second grant type
to support); only the client-secret form for API keys (refuses Basic-only clients); a strictly
conformant `private_key_jwt` with keys registered per credential (a third secret kind, with
nothing gained over A25's audience scoping).

**M3. The machine grant: be-01 signs who the machine is; mcp-01 carries it.** At issuance
mcp-01 calls a new `POST /internal/mcp/machine-grants` with `x-internal-auth` and the presented
key or assertion, which is never logged. be-01 runs its existing verification and answers a
**machine grant**. That grant is a JWT signed with `WBS_DELEGATION_SIGNING_KEY`, carrying:

- `aud wbs-be-01/machine-grant`;
- `sub` set to the credential id, plus the person, the organization and the source;
- `scope read write`;
- `exp` set to issuance plus the machine token lifetime (M4).

mcp-01 embeds the grant as a claim of the access token it returns, so it keeps nothing. On
every be-01 call, mcp-01 sends the grant as `Authorization: Bearer` together with
`x-internal-auth`. be-01 admits a grant only when **both** are present. It verifies signature,
audience and `exp`, then **rereads the credential** (unrevoked, person still bound, account
still a member) and yields exactly `machinePrincipalOf`'s principal. A grant is not single-use.
It costs no consume write, only the coarse `last_used_at` touch be-01 already makes.

Two consequences follow:

- A client that extracts the grant from its own token cannot call `/api` with it: it has no
  `x-internal-auth`.
- A stolen `INTERNAL_AUTH_SECRET` alone cannot act as any machine: it also needs a grant that
  be-01 signed after seeing a valid secret. This keeps today's property that mcp-01 cannot act
  without the caller's proof.

_Alternatives:_

- (a) A single-use delegation per call, as consent families use. This is uniform, but it costs
  one SQLite write under the write coordinator per tool call, and swarms are where call rates
  are highest.
- (b) mcp-01 names the credential id under `x-internal-auth` alone. A leaked service secret
  would then be every machine.
- (c) Keep the grant in mcp-01's memory, keyed by token `jti`. Replicas would then need sticky
  routing or a shared store, which works against M5.

**M4. Lifetimes and revocation.**

- The machine access token and its grant last `MCP_MACHINE_TOKEN_TTL`: default 3,600 s (the
  consent access TTL), refused at boot when it is under 60 s or over 3,600 s. No refresh token
  is issued; the client asks again.
- Revocation is effective at the next tool call, because be-01 rereads the credential behind
  every grant. `tools/list` and `initialize` need no be-01 call, so they stay answerable until
  `exp`. Neither discloses data, and both are stated in the spec.
- A stolen access token is a bearer until `exp` while its credential is live. Revoking the
  credential ends it at once.
- Revoking a person's last live credential still ends that person's leases in the revoke's own
  transaction (L8). mcp-01 has no family to sweep.
- The consent end callback (A20 _End_) is unchanged.

_Alternatives:_ a 15-minute TTL, which suits a refresh-capable orchestrator but breaks a
static-header Claude Code session mid-run; a per-credential TTL, which is quota-shaped and a
non-goal.

**M5. A machine session is stateless in mcp-01.**

- Verifying a machine token is signature, `aud`, `exp`, and the activated credential epoch.
  There is no `familyForSession` read and no session row. `sessionLimit` and the family tables
  do not see machines.
- Replicas share only `MCP_SIGNING_KEY_CURRENT`/`PREVIOUS`, `INTERNAL_AUTH_SECRET` and
  `WBS_API_URL`, so the machine path scales horizontally behind any balancer. The consent path
  keeps its shared SQLite store, and with it its scaling limit. That limit is unchanged and
  recorded here.
- Machine tokens carry a `token_use: machine` claim. `verifyLocal` dispatches on it and refuses
  a machine token presented to the refresh or revoke endpoints.

_Alternative:_ store a row per machine token, which gives revocable tokens at a write each and
adds nothing that M3's per-call reread does not already give.

**M6. Parity: one principal, one tool list, one set of descriptions.**

- A machine call reaches be-01 as `{ kind: 'machine', credentialId, personId }`, which is the
  API-key principal byte for byte. A23's cap, A24's cascade reach, L1's leases, the claim pin,
  and the agent-person and claim caps all apply unchanged.
- `postApiClaimsRenew` is the heartbeat over MCP.
- Tool descriptions do **not** differ by principal. A refusal a principal can meet, such as
  `createMeasure` for a non-admin, is stated once in the description and answered as a typed
  tool error.

_Alternatives:_ filter `tools/list` per principal, which means smaller context but two
contracts to test and a list that silently changes when a role changes; separate descriptions
for machines, which is the maintenance Dany wants to avoid.

**M7. Agent pools are admin-approved bulk issuance.** An admin or super-admin posts one
`POST /api/organization/agent-pools` with `{ name, size, credentialSource, expiresAt? }`. In
one transaction it creates `size` agent persons bound to the admin's account (A12) and one
`api_key` credential each (or, for `oidc`, one credential per listed subject). It answers every
key once. It is refused `agent_person_limit` when that would cross the cap, and nothing is
created then. The pool row (`agent_pool`) groups the credentials. A pool can be:

- revoked as a unit, with one audit row per credential plus one per pool;
- given an expiry that every key in it shares.

It never gains a member, a person or a right after creation. Enlarging a pool is a new admin
act. A machine (A23), a delegation, or a pool's own credential can never call the pool routes.
The orchestrator (Twilight Dash) holds the N keys in its secret store and exchanges one per
agent run for a 1-hour MCP token, so an agent process sees only its short-lived token, never a
key.

_Alternatives:_

- (a) A pool credential that serves several persons, a seat chosen per token request (for
  example `scope=wbs:seat:<personId>`). This is one secret for N identities and fits workload
  identity, but it amends A2 (one credential, one person) and concentrates the blast radius;
  it is recorded for Dany.
- (b) A machine allowed to mint child credentials. This is permission laundering: a capped
  principal would create principals. Rejected outright.
- (c) OIDC subject patterns, so one registration admits any `sub` matching a pattern. This was
  deferred in `wbs-machine-credentials` (wildcards).
- (d) One key per admin act, as today: a human per agent.

**M8. Human-only is a policy on the endpoint shape, not a path list.** Endpoint shapes gain a
`humanOnly` policy, which `openapi-tools.ts` excludes for every MCP principal. It covers:

- machine credentials, trusted issuers, provisioning tokens, agent pools and compute-provider
  administration;
- memberships, invitations, join requests and domains;
- SSO connections and session policy;
- the limits read, the capacity-mode switch, shared-people restore approvals and onboarding.

be-01 keeps refusing every delegation and machine principal on them. The policy only stops
advertising tools that could answer `403`. `EXCLUDED_PATHS` shrinks to auth, internal, smoke
and browser organization selection. The capacity report `PUT /api/compute-providers/:id/report`
becomes a tool (P6: machine only), so the Dash reporter moves to MCP. The startup check that
every exclusion still matches something carries over to the policy: a `humanOnly` shape that
matches no document operation throws.

_Alternatives:_ keep the path list (a new admin route is exposed until someone remembers it);
keep advertising admin tools to consented humans (pre-activation forwarding sessions could use
them, but the browser app is where humans administer).

**M9. be-01 refuses machine bearers on `/api`.** After this change, a `wbs_mk_` key or a
trusted-issuer token presented on any `/api` route is refused
`401 { error: 'machine_bearer_not_accepted' }`. The body names the MCP endpoint. The
verification code stays: `/internal/mcp/machine-grants` calls the same functions. The browser
app (cookie sessions) and mcp-01 (delegations, grants) are the only `/api` callers. This is the
forcing function that keeps one agent surface.

_Alternatives:_ keep accepting machine bearers on `/api`, undocumented (two surfaces in fact,
whatever the docs say); a deprecation header period (a compatibility window with no external
users to protect).

**M10. Limits, per replica, at mcp-01.**

| Limit                          | Default per replica   | Answer                        |
| ------------------------------ | --------------------- | ----------------------------- |
| Token requests per `client_id` | 6 a minute, burst 3   | `429 slow_down`               |
| Token requests per source IP   | 60 a minute           | `429 slow_down`               |
| `/mcp` requests per credential | 10 a second, burst 20 | HTTP `429` with `Retry-After` |
| In-flight tool calls per org   | 32                    | HTTP `429` with `Retry-After` |

The per-IP limit applies before be-01 is asked. The `/mcp` limits key on the grant's `sub` and
organization.

- The limits are deployment configuration, not organization rows (`wbs-organization-limits`
  made HTTP rate limiting a non-goal). With R replicas, the effective limit is R times the
  configured one. The authoritative fences stay be-01's caps on agent persons, claims and
  capacity, which hold in the batch transaction whatever the request rate.
- Request size keeps the SDK's 4 MiB body and 100-message batch caps.
- There is no long-lived stream to bound: a stateless server answers JSON.
- be-01's load per tool call is one grant verification, one credential primary-key read, the
  routed work, and at most one `last_used_at` write a minute per credential. Each token
  issuance is one internal call per agent per TTL.

_Alternatives:_ a shared limiter (a Redis or SQLite table, exact across replicas, one more
store); per-organization configurable limits (billing-shaped, later); no limits (one runaway
agent saturates be-01's single writer).

**M11. Gateway mode offers no machine admission.** `MCP_AUTH_MODE=gateway` exists for a
gateway that verified an upstream token. It is not deployed. Machine tokens are mcp-01's own,
so in gateway mode the token endpoint answers `unsupported_grant_type` for
`client_credentials`, the metadata omits it, and a JWT carrying `token_use: machine` is refused
`401` rather than decoded as gateway claims. Standalone (deployed) mode is where M1 lives.

_Alternatives:_ teach the gateway to run the grant (a second implementation); trust a machine
token's claims in gateway mode (decoded, unverified: a forgery path).

**M12. Docs and the REST surface's new status.** The following change:

- `docs/auth-integration.md` "Fleets and the MCP endpoint" and `docs/local-dev.md` "These
  agents use HTTP only" (PR #738) are rewritten: headless agents use MCP with
  `client_credentials`.
- `docs/import-with-ai.md` gains a headless section: Claude Code `headers`, the Agent SDK, and
  the Messages API connector token, each checked against the vendor's docs on the day of the
  write.
- The stale Auth0 "Fleet credentials" section goes with PR #731.
- The OpenAPI document becomes an internal contract artifact. It is still emitted and still
  the source of the tools, but no doc tells an agent to call `/api`. The tool descriptions are
  the agent contract.
- `apps/wbs/mcp-01/README.md` lists both admission paths.
- Twilight Dash's `report-capacity.ts` becomes an MCP client.

_Alternative:_ document both (the cost Dany named).

## Risks / Trade-offs

- **Client support for `client_credentials` is unverified.** If Claude Code or the Agent SDK
  cannot run the grant, the orchestrator runs it and hands the agent a static `Authorization`
  header for the run. That is why M4 defaults to 1 hour. A client with neither option needs M1
  alternative (b).
- **The grant is multi-use (M3).** A leaked access token is usable until `exp` while its
  credential is live. Mitigations: TLS only, the 1-hour cap, instant revoke, and per-credential
  rate limits. A single-use alternative exists at one write per call.
- **M9 breaks every HTTP fleet at the swap.** Dev first, then PUNI's own fleets move to MCP
  before prod. Being the first tenant is the test.
- **Per-replica limits are approximate (M10).** The fences that matter are transactional and
  in be-01.
- **The consent path already costs one delegation consume write per tool call.** This change
  does not alter that. A swarm on consent sessions pays it; a swarm on machine grants does not.
- **A pool's keys all share the issuing admin's account (A12).** Removing that admin is refused
  while the pool's credentials are live (A12's `in_use`), as for any credential.
