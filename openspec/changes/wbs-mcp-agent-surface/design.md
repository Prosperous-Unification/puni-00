## Context

Read on 2026-10-25 at `origin/main` 277fdf03c. Amended the same day after the Fable review of
24dcae0a5 (items S1-1 to S3, mapped in verify.md).

| Need                              | Exists today                                                                                                                                                                                                                                                                                                                                                                                                                          | Missing                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Admitting a caller at `/mcp`      | `caller-auth.ts` `authenticateCaller`. Standalone mode first tries an mcp-01 JWT (`verifyLocal`, session row by `jti`). If that fails, `McpOAuthServer.verify` and `callerSessionFor` (`oauth.ts` 362–381) fall back to `verifyUpstream`, whose audience is be-01's `AUTH_AUDIENCE` (`token-verifier.ts` 81). `bearerFor` with a null session then forwards that raw token (`oauth.ts` 446). Gateway mode decodes the JWT unverified. | **mcp-01 already accepts and passes through a be-01-audience Auth0 token.** Nothing admits a machine. |
| mcp-01's authorization server     | `oauth.ts` `McpOAuthServer`: `authorization_code` and `refresh_token`, public clients (`none`), 1 h access TTL, families and sessions in `McpSessionStore`. `credentialEpoch()` reads SQLite on every use (`session-store.ts` 151–153). `sourceOf` trusts the leftmost `X-Forwarded-For` (`oauth.ts` 1879–1882).                                                                                                                      | a grant with no human; a trustworthy source address                                                   |
| Verifying a machine credential    | be-01 `authentication.feature.ts`: `parseMachineKey`, `authenticateMachineKey` → `admitMachineCredential`, the trusted-issuer path (A13 step 3, A25), `machinePrincipalOf`, `organizationRoleOf` (A23). A groups-less configured-issuer token still resolves through an operator link (the `!identity.groupsClaimed` branch, line 294) until #731 lands.                                                                              | a route mcp-01 can ask; refusal on `/api`                                                             |
| be-01 learning who an MCP call is | `/internal/mcp/delegation`: a single-use `wbs-be-01/via-mcp-01` delegation, at most `MOST_DELEGATION_SECONDS` = 300 (`delegation.ts` 12, 286), no `kid` and no previous key, with one consume write per use. `directAudienceOf` (`identity.ts` 164–172) sends every non-`direct` audience to the via-mcp-01 verifier.                                                                                                                 | a separately keyed, separately verified per-call bearer                                               |
| The service secret                | `x-internal-auth`. It is shared with gw-01, tool-smoke and tool-devsync, and compared with `===` (`identity.ts` 35, 42, 71).                                                                                                                                                                                                                                                                                                          | a dedicated, constant-time-compared mcp-01↔be-01 secret                                               |
| Tool path values                  | `wbs-client.ts` 199–212 encodes each value with `encodeURIComponent`, which leaves `.` and `..` intact, so `/api/projects/{..}/claims` normalises to `/api/claims`.                                                                                                                                                                                                                                                                   | a refusal of dot segments                                                                             |
| Leases                            | `claim-lease.routes.ts` 30 `renewLeases(pin.personId)`: one heartbeat renews every lease of the **person**.                                                                                                                                                                                                                                                                                                                           | a stated rule for one person serving several processes                                                |
| Account-keyed state               | `command_journal` (undo) is keyed by `(project_id, user_id)` (`command-journal.ts` 27, 75). A12 makes a machine act as its person's **account**.                                                                                                                                                                                                                                                                                      | per-person undo once one account serves many persons                                                  |
| Docs                              | `docs/auth-integration.md` "Fleets and the MCP endpoint" and `docs/local-dev.md` (PR #738) tell fleets to use HTTP.                                                                                                                                                                                                                                                                                                                   | their reversal                                                                                        |

**MCP authorization (2025-11-25, read from modelcontextprotocol.io on 2026-10-25).**

- Servers "MUST validate that access tokens were issued specifically for them as the intended
  audience" and "MUST NOT accept or transit any other tokens".
- The token used upstream "is a separate token", and a server "MUST NOT pass through" the
  client's token.
- "The MCP server's authorization server" means any authorization server listed in the
  RFC 9728 protected-resource metadata. WBS lists exactly one, `<MCP_PUBLIC_URL>/oauth`, and
  that server and be-01's credential store are one deployment.

**OAuth Client Credentials extension** (`modelcontextprotocol/ext-auth`, stable 2026-07-28,
read the same day). It defines the `client_credentials` grant with two client authentication
methods: an RFC 7523 JWT assertion, which is RECOMMENDED, or a client secret.

**MCP TypeScript SDK 1.31.0** (in `node_modules`).

- `ClientCredentialsProvider` defaults to `client_secret_basic`.
- `StaticPrivateKeyJwtProvider` sends a pre-made `client_assertion`. Its `addClientAuthentication`
  path omits `client_id` (`auth.js` 852–854).
- Both re-fetch a token on 401 (verified by the reviewer).
- `PrivateKeyJwtProvider` signs with the client's own key, which a federated profile can never
  verify.

**Anthropic clients**, read 2026-10-25 by the coordinator:

- **Claude Code** (https://code.claude.com/docs/en/mcp.md):
  - Static `headers` work, with `${VAR}` expansion.
  - `headersHelper` prints a header map. It runs fresh at each connection, and on a 401 or 403
    it re-runs and retries once, with a 10 s timeout.
  - The helper is trust-gated: in `claude -p` or SDK sessions without folder trust, only
    static headers are used.
  - OAuth is authorization-code only; there is no `client_credentials`. With static headers, a
    401 fails the connection.
  - Claude Code "stores OAuth sign-ins per endpoint", so two entries on one URL likely share
    one consent.
- **Agent SDK** (https://code.claude.com/docs/en/agent-sdk/mcp.md): static headers only. It
  "doesn't open a browser or run an interactive OAuth flow", and refreshing headers mid-run is
  not documented.
- **Messages API MCP connector**
  (https://platform.claude.com/docs/en/agents-and-tools/mcp-connector.md): `authorization_token`
  is a static bearer per request, and the "consumer handles the OAuth flow and refreshes as
  needed".
- **claude.ai custom connectors** (https://support.claude.com/en/articles/11175166): OAuth in
  three modes, plus "Request headers", which are fixed credentials sent with every request.

**What follows from these facts.**

- No Anthropic client runs `client_credentials` itself. A helper or orchestrator fetches the
  token.
- Fixed headers are first-class in every Anthropic client.
- Per-endpoint sign-in storage means a headless identity must come from a machine credential,
  not from consent.

**From memory, not re-read:**

- RFC 6749 §4.4.3: no refresh token for client credentials.
- RFC 7523 §2.2: `iss = sub = client_id`.

## Goals / Non-Goals

**Goals:**

- A headless agent reaches `/mcp` as its credential's agent person, in every client Dany uses,
  with no human per session.
- `/mcp` accepts only tokens issued for the MCP resource, and passes none of them through.
- One principal, one set of leases, one cap and one tool list, whichever way an agent arrived.
- Machine calls cost be-01 no write per call. mcp-01 holds no machine rows.
- A swarm's N identities take one admin act.
- be-01's `/api` stops being an agent surface.

**Non-Goals:** consent changes; wildcard subjects; machines minting credentials;
organization-configurable rate limits; REST deprecation windows; OIDC agent pools (M7).

## Decisions

Every decision is **assumed, awaiting Dany**, and each can be overruled by its id. Task 0.1
(client facts) is done above, and was done before Dany reads these decisions.

**M1. Two admission forms at `/mcp`, both for the MCP resource only.**

- **(i) `client_credentials`** at `<MCP_PUBLIC_URL>/oauth/token` (M2). It answers an
  mcp-01-signed access token for SDK clients, Claude Code `headersHelper`, orchestrators and
  OIDC workloads.
- **(ii) The raw `wbs_mk_` key as an opaque bearer on `/mcp`**, for fixed-header clients:
  claude.ai "Request headers", Claude Code static `headers`, the Agent SDK, and the Messages API
  `authorization_token`.

Form (ii) is conformant because, after M9, a `wbs_mk_` key is valid at no resource except the
MCP resource. It is issued by the deployment whose authorization server the metadata lists, for
this resource. mcp-01 validates it through be-01 and never forwards it: be-01 receives a machine
grant (M3) instead. That reading of "issued specifically for them" is the contestable point,
and it is Dany's to accept.

Consent (A8, A20) is unchanged and remains how a human, or a human-consented agent, connects.

|                               | (i) client credentials                                              | (ii) raw key                                                                           | (a) forward the raw key (rejected) | (d) HTTP only (rejected)  |
| ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------- |
| Client config                 | helper or orchestrator fetches the token; the SDK re-fetches on 401 | one static header, in every Anthropic client                                           | one static header                  | a separate HTTP client    |
| Long-lived secret on the wire | once per token (≤ 24 h)                                             | every request                                                                          | every request, and to be-01        | every request             |
| Spec conformance              | literal                                                             | by the reading above                                                                   | token passthrough, forbidden       | not MCP                   |
| be-01 load                    | one verification per token, plus a grant reread per call            | one verification per request (cached ≤ 60 s per replica), plus a grant reread per call | one verification per call          | one verification per call |
| Revocation                    | next tool call                                                      | next tool call                                                                         | next call                          | next call                 |
| OIDC workload identity        | yes                                                                 | no (keys only)                                                                         | no                                 | yes                       |

_Alternatives:_ (i) only, which leaves every fixed-header client without a path, because no
Anthropic client runs the grant; (ii) only, which gives no OIDC workloads and puts the
long-lived secret on every request; RFC 8693 token exchange (from memory), which no listed
client speaks.

**M2. Token-endpoint presentation.**

- _API key._ `client_secret` is the whole key, sent by HTTP Basic (the SDK's default) or in
  the body. Both together is `invalid_request`. `client_id` is optional, because the key
  carries its id; when it is sent it must equal that id. A 401 `invalid_client` carries
  `WWW-Authenticate: Basic`.
- _OIDC._ A `client_assertion` of type `jwt-bearer` holds the workload token. The credential is
  identified by `(iss, aud, sub)` per A25. `client_id`, when sent, must equal the matched
  credential's id. The SDK omits `client_id` here.
- _A WBS-unique audience._ A trusted-issuer registration's audience must start with the
  canonical `MCP_PUBLIC_URL` (for example `<MCP_PUBLIC_URL>/org/<organizationId>`). This
  amends A25's recommended `wbs:org:<id>` into a rule, so that an assertion minted for WBS is
  never also valid at another relying party that chose a generic audience.
- _The WBS federated assertion profile._ It is published in `docs/auth-integration.md`. The
  assertion's issuer is a trusted issuer, never the client. A self-signed assertion is
  `invalid_client`.
- _What is advertised._ `private_key_jwt` is advertised with that profile, and
  `StaticPrivateKeyJwtProvider` works with it. `PrivateKeyJwtProvider` does not, and the docs
  say so. `token_endpoint_auth_signing_alg_values_supported` is `["RS256", "ES256"]`. `none`
  stays for public consent clients, so hosted connectors keep working; a dev check covers that.
- _Requests._
  - `resource` must be present once and must equal the canonical `MCP_PUBLIC_URL`, compared
    against the same canonical value `oauth.ts` 270 derives. A missing, wrong or repeated
    `resource` is `invalid_target`.
  - An absent `scope` means `wbs:read wbs:write`. Anything beyond that is `invalid_scope`.
- _Failures._ Every credential failure is the same `401 invalid_client`. A failed machine
  verification never falls through to `verifyUpstream`.
- _Registration._ Dynamic client registration refusing `client_credentials` is **new**
  behaviour, with its own test: a machine is an admin-created credential, never a
  self-registered client.

_Alternatives:_ the RFC 7523 §2.1 JWT-bearer grant (a second grant type); not advertising
`private_key_jwt` yet (then OIDC sources have no conformant method); strict per-credential
registered keys (a third secret kind).

**M3. The machine grant has its own key, type, verifier and cap.**

- _Issue._ be-01 issues the grant at `POST /internal/mcp/machine-grants` (M14's secret) from the
  presented key or assertion. The grant is a JWT:
  - `typ wbs-machine-grant+jwt`, `aud wbs-be-01/machine-grant`;
  - `kid` from **`WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT`/`_PREVIOUS`**, never the delegation
    key;
  - `sub` the credential, plus person, organization and source.
- _One owner of the lifetime._ be-01 caps `exp` at
  `min(requested, now + MOST_MACHINE_GRANT_SECONDS, assertion.exp)`, with a 24 h + 60 s cap.
  mcp-01 sets its own token `exp` 60 s before the grant's, which absorbs clock skew.
- _Verifier._ A dedicated verifier admits only that `typ`, that `aud` and those keys.
  `directAudienceOf` dispatches on exact audiences, and any other audience is `invalid_token`.
  A 3,600 s `via-mcp-01` delegation is still refused.
- _Admission._ It needs M14's secret. It rereads the credential through a new
  `PresentedMachineProof` variant inside `admitMachineCredential`, so revocation, binding,
  membership and pool expiry (M7) are judged in one place.
- _Scopes._ They are derived **only** from the reread credential (`read`, `write`), never from
  the token or the metadata's `scopes_supported`. `http.ts` 63 still advertises `wbs:editor`
  for consent.
- _Failures._ A refused grant is `401 unknown_identity` (A5; there is no `credential_revoked`
  here). mcp-01 turns it into HTTP `401 invalid_token` on `/mcp`, so a helper or SDK client
  re-fetches, then meets `invalid_client`.
- _Cost._ The grant is multi-use until `exp`. Its only write is the coarse last-use touch.
- _Optional replay guard._ An OIDC assertion's `jti` is consumed once at issuance, which is one
  write per issuance and none per call.
- _Audit._ Every issuance writes one `machine_token_issued` audit row, naming the credential,
  person, source and grant `exp`, and never a secret.

_Alternatives:_ a single-use delegation per call (one write per call); the delegation key with
a new audience (rejected: no `kid` and no rotation, and the 300 s cap would be bent); naming
the credential under the service secret alone.

**M4. Lifetimes follow the client.**

- Helper and SDK clients re-fetch on 401, so short tokens cost them nothing.
- Fixed-header clients use the raw key (M1 ii) and never expire, except when the credential
  does.
- `client_credentials` tokens default to **12 h**, capped at **24 h** by M3, with `exp` lowered
  by a uniform 0–10% jitter so a pool does not re-fetch in one burst.
- An OIDC token never outlives its assertion.
- Why 24 h is acceptable: revocation does not depend on the token lifetime, because every call
  rereads the credential. The lifetime bounds only how long a stolen token stays useful while
  its credential is live, which is the same exposure a raw key has, forever.
- At `exp`, `/mcp` answers HTTP 401 `invalid_token` with `WWW-Authenticate`. Claude Code's
  `headersHelper` re-runs, the SDK providers re-fetch, and an orchestrator re-issues.
- Pool expiry (M7) is refused at admission. Leases held under an expired credential lapse at
  their own 15-minute lease end, because nothing can renew them; the release reason is
  `lease expired`.

_Alternative:_ a 1 h cap, which breaks any orchestrator that hands out a token per run.

**M5. Machine admission reads no mcp-01 store.**

- be-01 refuses to issue a grant before activation (`409 not_activated`). So machine tokens
  carry no epoch claim and skip `credentialEpoch()`.
- The machine path verifies by signature, `aud` and `exp` only, and never calls
  `familyForSession` or `credentialEpoch`.
- Replicas share keys, M14's secret and `WBS_API_URL`. The consent path keeps its shared store.
- For a raw key (M1 ii), the grant may be cached in replica memory under `SHA-256(key)` for at
  most 60 s. That cache is an optimisation, not state: a cold replica asks be-01.
- A machine token at `/refresh` is `invalid_grant`, and at `/revoke` it is
  `unsupported_token_type`.

**M6. Parity, with no per-principal tool list or descriptions.** A grant yields
`{ kind: 'machine', credentialId, personId }`, which is the API-key principal byte for byte.
A23, A24, L1, the claim pin and the caps apply. `postApiClaimsRenew` is the heartbeat. Refusals
a principal can meet are stated once in the description.

_Alternatives:_ per-principal filtering, or descriptions per principal (two contracts).

**M7. Agent pools: API-key bulk issuance, re-keyable, delivered once.**

- _Creation._ An admin's browser session posts `{ name, size ≤ 100, expiresAt? }`. In one
  transaction this creates `size` agent persons bound to the admin's account, through
  **`addPerson`'s own agent-person cap check**, and one API key each.
- _Delivery._ fe-01 shows the keys once, as a single download (`pool-<id>.keys.json`), never
  stored server-side. Dash imports it with `twilight-dash pool import <file>` into its secret
  store, verifies every key by issuing one token each, and tells the admin to delete the file.
- _Re-keying._ `POST …/agent-pools/:id/rekey` revokes every key and issues fresh ones for the
  **same** persons, so `agent_person_limit` is not consumed again and a leaked file is answered
  without recreating the swarm.
- _Fixed after creation._ A pool never gains a person or a right. A machine, a delegation or a
  grant can never reach the pool routes.
- _Blast radius, stated honestly._ Dash holds all N keys. A compromised Dash is all N agents,
  each capped at `member`, until the pool is revoked or re-keyed. Agents themselves see only
  their 12 h token, or one key when they run as fixed-header clients.
- _OIDC pools are not in v1._ A GitHub `sub` is per repository and ref, and a Kubernetes `sub`
  is per service account, so one workload cannot be N identities without seat selection.

_Alternatives:_ (a) one pool credential with a seat per token request (amends A2, but it is
the only way OIDC workloads give N identities; reopen it for OIDC); (b) machines minting
children (laundering, rejected); (c) subject patterns (deferred); (d) one admin act per key.

**M8. Human-only is an endpoint policy.**

- A `humanOnly` policy on endpoint shapes excludes them from tools for every principal. The
  covered set is the one listed in the spec.
- `EXCLUDED_PATHS` keeps auth, internal, smoke and `/api/organization/active`.
- The capacity report becomes a tool.
- A `humanOnly` shape matching nothing fails startup.

_Alternatives:_ the path list; admin tools for consented humans.

**M9. be-01 refuses every machine bearer on `/api`.**

- The refusal is `401 machine_bearer_not_accepted`, which names `/mcp`, for `wbs_mk_` keys,
  trusted-issuer tokens and **groups-less configured-issuer tokens**.
- **Precondition: #731 merged.** It retires operator links, so the groups-less branch admits
  nobody.
- There is no environment switch. Tests that need raw-key `/api` behaviour use a test-only
  composition seam in `src/testing`, which `production-entrypoint.test.ts` keeps unreachable
  from `main.ts`.

_Alternatives:_ keep accepting (two surfaces in fact); a deprecation header period.

**M10. Limits at mcp-01, per replica.**

- _Source address._ It is the `X-Forwarded-For` entry `MCP_TRUSTED_PROXY_HOPS` from the right
  (1 behind Caddy); with 0, the socket address. A spoofed leftmost entry changes nothing.
- _Failure counting._ Failed authentications are counted per `(client_id, IP)` and per IP.
  Successful issuances are limited per credential, separately, so a stranger who knows a
  public `client_id` cannot lock it out.

| Limit                                 | Default          | Sized for                                                                           |
| ------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| Failed auth per `(client_id, IP)`     | 5 / min          | guessing one id                                                                     |
| Failed auth per IP                    | 30 / min         | a scanner                                                                           |
| Successful issuances per credential   | 6 / min, burst 3 | helper re-runs                                                                      |
| Successful issuances per IP           | 300 / min        | one orchestrator re-keying a pool of 100                                            |
| Tool calls per credential             | 10 / s, burst 20 | counted per JSON-RPC `tools/call`, not per HTTP request (a batch of 100 counts 100) |
| In-flight tool calls per organization | 64               | a 100-agent pool at about 2 calls/s with 300 ms be-01 latency                       |

- Every refusal is HTTP `429` with `Retry-After`. The token endpoint uses the same status, with
  error `temporarily_unavailable`.
- The authoritative fences stay be-01's transactional caps.

_Alternatives:_ a shared limiter (exact across replicas); per-organization limits (later).

**M11. Gateway mode has no machine admission.** `client_credentials` is
`unsupported_grant_type`, metadata omits it, and on `/mcp` both a `token_use: machine` JWT and
a raw `wbs_mk_` key are 401 and never decoded.

**M12. Docs and the REST surface's status.**

- PR #738's sections are reversed, and the WBS federated profile is published.
- `docs/import-with-ai.md` gains a headless section with the dated client facts above:
  - Claude Code: `headersHelper` calling the token endpoint, or a static `wbs_mk_` header;
  - the SDK and the Messages API: an app-fetched token or the raw key;
  - claude.ai: Request headers with the raw key.
- The OpenAPI document is an internal contract artifact.
- `report-capacity.ts` becomes an MCP client.

**M13. After activation, `/mcp` stops accepting upstream tokens.** `verify` and
`callerSessionFor` no longer fall back to `verifyUpstream` once the credential epoch is
activated, and `bearerFor` with a null session throws instead of forwarding. Before activation,
the pre-activation forwarding path stays as it is: no compatibility burden, and one code path
fewer once prod activates. An Auth0 token on `/mcp` after activation is 401, and be-01 sees no
request.

_Alternative:_ keep the fallback (today's passthrough; non-conformant).

**M14. A dedicated mcp-01↔be-01 secret, a constant-time compare, and safe paths.**

- `MCP_BE_INTERNAL_SECRET` is used only for `/internal/mcp/*` and for grant admission. It is
  compared by `timingSafeEqual` over SHA-256 digests. `x-internal-auth` stays for gw-01 and the
  tools, and gets the same constant-time compare.
- mcp-01 refuses a path value equal to `.` or `..` as `ToolInputRefused`. The `..` value,
  encoded, would have normalised `/api/projects/{..}/claims` to `/api/claims`.
- _The property, stated honestly._ The secret alone acts as no machine. The secret together
  with any client's still-valid token (which carries its grant) acts as that credential until
  the grant's `exp`.

_Alternative:_ mTLS between mcp-01 and be-01 (stronger, but needs a CA on every host).

**M15. One process per credential is a stated invariant.**

- Leases renew per person, so two processes sharing one credential renew each other's leases.
- The docs and the pool import say: one credential, one running agent. A test pins today's
  behaviour, where a second process's heartbeat renews the first's leases, so the invariant is
  documented rather than silently assumed.

_Alternative:_ a run nonce in the grant, with renewal scoped to `(person, run)`, recorded for
when a pool needs several processes per person.

**M16. State keyed by account, not person.** A pool's N persons share the admin's account
(A12). Each such check is listed here with its decision.

- Undo and redo (`command_journal`, keyed by `(project, user)`): a pinned principal's entries
  carry `person_id`, through an additive nullable column. Undo and redo pop only
  `(user, person)` entries, so one agent never undoes another.
- Membership and the A23 role cap: per account, intended.
- `created_by` and audit actors: these name the account, and the person is in the claim and
  audit detail. Accepted.
- Project-opened and recents: shared, harmless.
- Claim cap: keyed by person, unaffected.

Task 6.0 greps every `userId` key and adds any check missing from this list before slice 6.

_Alternative:_ refuse undo to machine principals.

## Risks / Trade-offs

- **M1 (ii) rests on an interpretation** of the audience rule. If Dany rejects it,
  fixed-header clients need a helper, and the Agent SDK and claude.ai have none, so they would
  depend on an app-fetched token.
- **Dash concentrates N keys (M7).** Re-keying is the recovery path.
- **M9 and M13 break HTTP fleets and Auth0 bearers on `/mcp` at the swap.** Fleets go straight
  to MCP (slice 7 is gated on claire fleets observed on MCP on dev).
- **Per-replica limits are approximate.** be-01's caps are the fences.
- **The consent path still costs one consume write per call.** This change does not alter it.
