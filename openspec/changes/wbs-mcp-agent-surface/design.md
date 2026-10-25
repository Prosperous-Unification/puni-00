## Context

Read on 2026-10-25 at `origin/main` 277fdf03c. Amended after the Fable reviews of 24dcae0a5
and 58e0cea79 (every item is mapped in verify.md).

| Need                              | Exists today                                                                                                                                                                                                                                                                                                                                                                                                                          | Missing                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Admitting a caller at `/mcp`      | `caller-auth.ts` `authenticateCaller`. Standalone mode first tries an mcp-01 JWT (`verifyLocal`, session row by `jti`). If that fails, `McpOAuthServer.verify` and `callerSessionFor` (`oauth.ts` 362–381) fall back to `verifyUpstream`, whose audience is be-01's `AUTH_AUDIENCE` (`token-verifier.ts` 81). `bearerFor` with a null session then forwards that raw token (`oauth.ts` 446). Gateway mode decodes the JWT unverified. | **mcp-01 already accepts and passes through a be-01-audience Auth0 token.** Nothing admits a machine. |
| mcp-01's authorization server     | `oauth.ts` `McpOAuthServer`: `authorization_code` and `refresh_token`, public clients (`none`), 1 h access TTL, families and sessions in `McpSessionStore`. `credentialEpoch()` reads SQLite on every use (`session-store.ts` 151–153). `sourceOf` trusts the leftmost `X-Forwarded-For` (`oauth.ts` 1879–1882).                                                                                                                      | a grant with no human; a trustworthy source address                                                   |
| Verifying a machine credential    | be-01 `authentication.feature.ts`: `parseMachineKey`, `authenticateMachineKey` → `admitMachineCredential`, the trusted-issuer path (A13 step 3, A25), `machinePrincipalOf`, `organizationRoleOf` (A23). A groups-less configured-issuer token still resolves through an operator link (the `!identity.groupsClaimed` branch, line 294) until #731 lands.                                                                              | a route mcp-01 can ask; refusal on `/api`                                                             |
| be-01 learning who an MCP call is | `/internal/mcp/delegation`: a single-use `wbs-be-01/via-mcp-01` delegation, at most `MOST_DELEGATION_SECONDS` = 300 (`delegation.ts` 12, 286), no `kid` and no previous key, with one consume write per use. `directAudienceOf` (`identity.ts` 164–172) sends every non-`direct` audience to the via-mcp-01 verifier.                                                                                                                 | a separately keyed, separately verified per-call bearer                                               |
| The service secret                | `x-internal-auth`. It is shared with gw-01, tool-smoke and tool-devsync, and compared with `===` (`identity.ts` 35, 42, 71).                                                                                                                                                                                                                                                                                                          | a dedicated, constant-time-compared mcp-01↔be-01 secret                                               |
| Tool path values                  | `wbs-client.ts` 199–212 encodes each value with `encodeURIComponent`, which leaves `.` and `..` intact, so `/api/projects/{..}/claims` normalises to `/api/claims`.                                                                                                                                                                                                                                                                   | a refusal of dot segments                                                                             |
| Leases                            | `claim-lease.routes.ts` 30 `renewLeases(pin.personId)`: one heartbeat renews every lease of the **person**.                                                                                                                                                                                                                                                                                                                           | a stated rule for one person serving several processes                                                |
| Account-keyed state               | `command_journal` (undo) is keyed by `(project_id, user_id)` (`command-journal.ts` 27, 75). A12 makes a machine act as its person's **account**. A separate bug-fix PR makes undo per person (M16).                                                                                                                                                                                                                                   | per-person undo once one account serves many persons                                                  |
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
- **Agent SDK** (https://code.claude.com/docs/en/agent-sdk/mcp.md): an app passes headers and
  fetches its own tokens; it "doesn't open a browser or run an interactive OAuth flow". The
  Claude Code docs (lines ~1226–1229 of mcp.md) add two points. `headersHelper` runs in
  `claude -p` and SDK sessions, subject to folder trust. An SDK session can also reuse an
  interactive session's stored sign-in. Corrected after the second review.
- **Messages API MCP connector**
  (https://platform.claude.com/docs/en/agents-and-tools/mcp-connector.md): `authorization_token`
  is a static bearer per request, and the "consumer handles the OAuth flow and refreshes as
  needed".
- **claude.ai custom connectors** (https://support.claude.com/en/articles/11175166): OAuth in
  three modes, plus "Request headers", which are fixed credentials sent with every request.

**What follows from these facts.**

- No Anthropic client runs `client_credentials` itself. A `headersHelper`, an app or an
  orchestrator fetches the token, and every Anthropic client except claude.ai has one of
  those.
- So a raw key at `/mcp` would serve only claude.ai Request headers, and those are shared
  across a Team or Enterprise organization (M1).
- Per-endpoint sign-in storage means a headless identity must come from a machine credential,
  not from consent.

**From memory, not re-read:**

- RFC 6749 §4.4.3: no refresh token for client credentials.
- RFC 7523 §2.1: the JWT-bearer grant, with optional client authentication.
- RFC 7523 §3: when the JWT authenticates the client, `sub` MUST be the `client_id`. (The
  reviewer cited this; the first draft wrongly attributed `iss = sub = client_id` to §2.2,
  when it comes from OIDC Core §9.)

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

**M1. One admission form in v1, token grants; the raw key is Dany's option only.**

**(i) Token grants at `<MCP_PUBLIC_URL>/oauth/token`.** Two grants are accepted there (M2):
`client_credentials` with an API key, and the RFC 7523 §2.1 JWT-bearer grant with a workload
token. Each answers an mcp-01-signed access token. Every Anthropic client can use it:

- Claude Code, interactively, and in `claude -p`/SDK sessions where folder trust allows it,
  through `headersHelper` calling the token endpoint (a refresh on 401 comes free);
- Agent SDK and Messages API apps, which fetch and refresh tokens themselves, which is what
  those docs expect the consumer to do;
- MCP SDK clients, through `ClientCredentialsProvider`;
- orchestrators such as Twilight Dash.

**(ii) The raw `wbs_mk_` key as an opaque bearer on `/mcp`. Not in v1.** Its only remaining
benefit is claude.ai's "Request headers" for an individual Pro or Max account.

If Dany chooses (ii), it is restricted three ways:

- **Individual Pro or Max only.** In a Team or Enterprise organization, a custom connector's
  request header is one credential every member uses. That would launder one WBS agent
  identity to people outside WBS, bypass consent (A8) and break the run scoping (M15) by
  construction. WBS cannot tell the plans apart on the wire, so the restriction is documented
  and the key is the admin's to withhold. Team and Enterprise connectors stay consent-only.
- **A documented deviation.** It departs from the client-side rule "MUST NOT send tokens …
  other than ones issued by the MCP server's authorization server". The server-side reading
  (a key valid only at the MCP resource) holds **only after M9**, so (ii) would ship after
  slice 7, never before it.
- **The M5 and M10 terms below.**

Consent (A8, A20) is unchanged. It is how a human, a human-consented agent, and any claude.ai
Team or Enterprise connector connects.

|                               | (i) token grants                                   | (ii) raw key (Dany's option)                                  | forward the raw key (rejected) | HTTP only (rejected) |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ | -------------------- |
| Who needs it                  | every client listed under (i)                      | only claude.ai Pro/Max Request headers                        | —                              | —                    |
| Long-lived secret on the wire | once per token                                     | every request                                                 | every request, and to be-01    | every request        |
| Conformance                   | literal                                            | deviation, and only after M9                                  | passthrough, forbidden         | not MCP              |
| Shared-identity risk          | none                                               | Team/Enterprise headers are shared                            | same                           | same                 |
| be-01 load                    | one verification per token, plus a reread per call | one verification per 60 s per replica, plus a reread per call | one per call                   | one per call         |

_Alternatives:_ (ii) for every client (see the table); RFC 8693 token exchange (no client
speaks it).

**M2. Token-endpoint presentation.**

- _API key: `client_credentials`._ `client_secret` is the whole key, sent by HTTP Basic (the
  SDK's default) or in the body.
  - `client_id` is optional and must equal the key's id when sent.
  - Two client authentication methods in one request (Basic plus body, or either one plus a
    `client_assertion`) are `invalid_request` (RFC 6749 §2.3).
  - A 401 `invalid_client` carries `WWW-Authenticate: Basic`.
- _OIDC: the RFC 7523 §2.1 JWT-bearer authorization grant._
  - The request is `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` with the workload
    token as `assertion`, and client authentication is optional.
  - be-01 identifies the credential by `(iss, aud, sub)` per A25. The assertion's `sub` is the
    workload subject, which is what §2.1 means by the principal.
  - This is conformant, unlike the client-assertion profile of the first draft. RFC 7523 §3
    requires `sub` to be the `client_id` when the JWT authenticates the client. The
    `iss = sub = client_id` shape comes from OIDC Core §9. So a workload token used as a
    `client_assertion` would be a WBS deviation.
  - That client-assertion profile is the recorded alternative, as a documented deviation.
- _A fresh workload token per request._ `StaticPrivateKeyJwtProvider` fixes its assertion at
  construction (SDK 1.31.0 `auth-extensions.js` 237–254), so a run outliving the workload
  token would die. WBS documents a `WorkloadJwtBearerProvider`, which Dash ships and which a
  `headersHelper` script can mirror. Its token request reads a fresh workload token every
  time: from the GitHub Actions token URL, or by rereading the projected service-account
  token file.
- _Metadata._ It advertises:
  - `grant_types_supported`: `client_credentials` and the JWT-bearer URN, beside the consent
    grants;
  - `token_endpoint_auth_methods_supported`: `none`, `client_secret_basic` and
    `client_secret_post`.

  `private_key_jwt` is **not** advertised, because no WBS client authenticates with its own
  key.

- _Resource and scope._ `resource` must appear exactly once and equal the canonical
  `MCP_PUBLIC_URL`, as derived at `oauth.ts` 270; otherwise the answer is `invalid_target`. An
  absent `scope` means `wbs:read wbs:write`; anything wider is `invalid_scope`.
- _Failures._
  - Every API-key credential failure is the same `401 invalid_client`.
  - Every assertion failure is the same `400 invalid_grant` (§2.1's error).
  - A failed machine verification never falls through to `verifyUpstream`.
- _Registration._ Dynamic client registration refusing `client_credentials` and the
  JWT-bearer grant is new behaviour, with its own test.
- _A WBS-unique audience (amends A25; see the machine-credentials delta)._ be-01 gains
  `WBS_MCP_RESOURCE_URL`, boot-checked to be a canonical HTTPS URL and set to the same value
  as mcp-01's `MCP_PUBLIC_URL`.
  - A registration's audience, and any credential-level narrowing (A25 (a)), must **equal**
    that URL or start with that URL followed by `/`. A bare prefix would admit
    `https://<host>.evil.example`.
  - Existing `wbs:org:<id>` rows are not rewritten, because the IdP side must change too.
    Each one is refused at use (`invalid_grant`) until an admin re-registers it.
  - `bun run src/trusted-issuer-audience-check-cli.ts` is a dry run by default. It lists every
    registration and credential the rule, or a changed `WBS_MCP_RESOURCE_URL`, would break.
    The deploy preflight runs it and refuses a swap that would break any, unless
    `--accept-breaking=<ids>` names them (Dany's list-what-breaks rule).
  - Changing `MCP_PUBLIC_URL` is therefore a breaking change for every OIDC registration, and
    the preflight shows which ones.

_Alternatives:_ the federated client-assertion profile (a documented deviation from RFC 7523
§3, but it fits the extension's `client_credentials`); `private_key_jwt` with keys
registered per credential (a third secret kind); keeping A25's free-form audience (an
assertion minted for WBS could also be valid elsewhere).

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
  the token or the metadata's `scopes_supported`. `http.ts` still advertises `wbs:editor` for
  consent (`MCP_SCOPES` at line 11, used at lines 40 and 56).
- _Failures._ A refused grant is `401 unknown_identity` (A5; there is no `credential_revoked`
  here). mcp-01 turns it into HTTP `401 invalid_token` on `/mcp`, so a helper or SDK client
  re-fetches, then meets `invalid_client` or `invalid_grant`.
- _Cost._ The grant is multi-use until `exp`. Its only write is the coarse last-use touch.
- _Assertion replay guard._ When an assertion carries a `jti`, be-01 consumes `(iss, jti)` once
  in the existing delegation-use table, held until the assertion's `exp`; a replay is
  `invalid_grant`. An assertion without a `jti` is admitted, because the guard is optional by
  RFC 7523. GitHub and Kubernetes tokens carry one. That is one write per issuance and none
  per call.
- _Audit._ Each grant issued through a token grant (M1 (i)) writes one `machine_token_issued`
  audit row. It names the credential, person, source and grant `exp`, never a secret. That is
  about 2 rows per agent per day at the 12 h default.
- _Keys absent at activation._ be-01 boot requires `WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT` once
  the activation marker is set. The activation runbook's preflight lists the missing key and
  refuses to activate. A process that is already running when activation happens without the
  key answers the grant route with a reported server fault (`500`), never a default, and the
  next boot refuses.

_Alternatives:_ a single-use delegation per call (one write per call); the delegation key with
a new audience (rejected: no `kid` and no rotation, and the 300 s cap would be bent); naming
the credential under the service secret alone.

**M4. Lifetimes follow the client.**

- Helper, app and SDK clients re-fetch on 401, so short tokens cost them nothing.
- The raw key, if Dany chooses (ii), carries no expiry of its own; its grants last 60 s
  (M5).
- `client_credentials` tokens default to **12 h**, capped at **24 h** by M3, with `exp` lowered
  by a uniform 0–10% jitter so a pool does not re-fetch in one burst.
- An OIDC token never outlives its assertion.
- Why 24 h is acceptable: revocation does not depend on the token lifetime, because every call
  rereads the credential. The lifetime bounds only how long a stolen token stays useful while
  its credential is live.
- At `exp`, `/mcp` answers HTTP 401 `invalid_token` with `WWW-Authenticate`. Claude Code's
  `headersHelper` re-runs, the SDK providers re-fetch, and an orchestrator re-issues.
- Pool expiry (M7) is refused at admission. Leases held under an expired credential lapse at
  their own 15-minute lease end, because nothing can renew them; the release reason is
  `lease expired`.

_Alternative:_ a 1 h cap, which breaks any orchestrator that hands out a token per run.

**M5. Machine admission reads no mcp-01 store.**

- be-01 refuses to issue a grant before activation (`409 not_activated`). Machine tokens
  carry no epoch claim, skip `credentialEpoch()`, and are verified by signature, `aud` and
  `exp` only. The machine path never calls `familyForSession`.
- Replicas share the signing keys, M14's secret and `WBS_API_URL`. The consent path keeps its
  shared store.
- A machine token at `/refresh` is `invalid_grant`, and at `/revoke` it is
  `unsupported_token_type`.
- _If Dany chooses (ii):_
  - a raw-key grant lives 60 s (be-01 caps it);
  - a replica caches it under `SHA-256(key)` for at most that long, and the cache is never
    the authority, because be-01's reread is;
  - raw-key failures count in M10's failure buckets;
  - a raw-key grant writes **no** `machine_token_issued` row. One per cache miss would be
    about 144,000 rows a day per replica for 100 agents, which is the event-log bloat shape
    this repo has already had. `last_used_at` is its trace.

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
  It gives each agent process its own `wbs_run` (M15).
- _Re-keying._ `POST …/agent-pools/:id/rekey` revokes every key and issues fresh ones for the
  **same** persons, so `agent_person_limit` is not consumed again and a leaked file is answered
  without recreating the swarm.
- _Fixed after creation._ A pool never gains a person or a right. A machine, a delegation or a
  grant can never reach the pool routes.
- _Cleanup._ A revoked pool's persons still count toward `agent_person_limit`. Revoking with
  `removePersons: true`, or a later `DELETE …/agent-pools/:id/persons`, removes them through
  the existing `deletePerson` cascade (A24: an admin's reach). That releases the cap, while
  the claims history keeps their names.
- _Blast radius, stated honestly._ Dash holds all N keys. A compromised Dash is all N agents,
  each capped at `member`, until the pool is revoked or re-keyed. Agents themselves see only
  their 12 h token.
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
- _Failures and successes are counted apart._ Failed authentications, at the token endpoint
  and for any raw key on `/mcp`, are counted per `(client_id, IP)` and per IP. Successful
  issuances are limited per credential, separately, so a stranger who knows a public id cannot
  lock it out.

| Limit                                 | Default per replica | Sized for                                                                  |
| ------------------------------------- | ------------------- | -------------------------------------------------------------------------- |
| Failed auth per `(client_id, IP)`     | 5 / min             | guessing one id                                                            |
| Failed auth per IP                    | 30 / min            | a scanner                                                                  |
| Successful issuances per credential   | 6 / min, burst 3    | helper re-runs                                                             |
| Successful issuances per IP           | 300 / min           | one orchestrator re-keying a pool of 100                                   |
| `tools/call` messages per credential  | 10 / s, burst 20    | a batch of 100 counts 100                                                  |
| In-flight tool calls per organization | 128                 | about 60 at the design load (100 agents × 2 calls/s × 300 ms); 2× headroom |

- With R replicas, the effective organization in-flight limit is 128 × R. These are
  per-replica fences; the authoritative fences are be-01's transactional caps.
- `/mcp` refusals are HTTP `429` with `Retry-After`. A token-endpoint refusal is HTTP `429`
  with error `invalid_request` and `error_description: "rate_limited"`, plus `Retry-After`.
  RFC 6749 §5.2 has no rate-limit error, so WBS invents no error code.

_Alternatives:_ a shared limiter (exact across replicas); per-organization limits (later).

**M11. Gateway mode has no machine admission.** Both machine grants answer
`unsupported_grant_type`, and the metadata omits them. On `/mcp`, a bearer starting
`wbs_mk_` (detected by prefix, before any JWT parse) and a JWT carrying `token_use: machine`
are both 401, and **neither is ever forwarded** to be-01.

**M12. Docs and the REST surface's status.**

- PR #738's sections are reversed.
- `docs/import-with-ai.md` gains a headless section with the dated client facts above:
  - Claude Code: `headersHelper` calling the token endpoint;
  - Agent SDK and Messages API apps: tokens they fetch themselves;
  - claude.ai Team and Enterprise: consent only. A Request header there is shared by every
    member and must never carry a machine credential.
- `WorkloadJwtBearerProvider` is published as the OIDC client.
- The OpenAPI document becomes an internal contract artifact.
- `report-capacity.ts` becomes an MCP client.

**M13. After activation, `/mcp` stops accepting upstream tokens.**

- `verify` and `callerSessionFor` stop falling back to `verifyUpstream`, and `bearerFor` with
  a null session throws instead of forwarding.
- Before activation, the forwarding path stays as it is.
- After activation, an Auth0 token on `/mcp` is 401 and be-01 sees no request.
- _Which marker._ mcp-01 reads its credential epoch, and be-01's `not_activated` reads its
  activation marker. The activation runbook moves both in one procedure.
- _A mismatch is a fault, not a mode._ If be-01 answers `activated` while mcp-01's epoch is
  still 0, mcp-01 reports a configuration fault and refuses the request.
- _The test._ It boots the shared activation fixture, which sets both markers, and checks the
  mismatched case separately.

_Alternative:_ keep the fallback (today's passthrough; non-conformant).

**M14. A dedicated mcp-01↔be-01 secret, a constant-time compare, and safe paths.**

- _The secret._ `MCP_BE_INTERNAL_SECRET` is used only for `/internal/mcp/*` and for grant
  admission. It is compared by `timingSafeEqual` over SHA-256 digests. `x-internal-auth`
  stays for gw-01 and the tools, and gets the same constant-time compare.
- _Cutover across colours._
  - Release N's be-01 accepts either secret on `/internal/mcp/*`. Swap be-01 first, then
    mcp-01, which sends only the new secret.
  - Release N+1's be-01 drops `x-internal-auth` there.
  - Grant admission accepts only the new secret from the start, because no older mcp-01
    sends grants.
- _Safe paths._
  - mcp-01 refuses an empty path value, `.` or `..` as `ToolInputRefused`.
  - After expansion, it asserts that `new URL(path).pathname` equals the expanded template,
    so no value changes the route.
  - A proxy between mcp-01 and be-01 may still normalise paths. The assertion is on what
    mcp-01 sends, and be-01 routing is the second line.
- _The property, stated honestly._ The secret alone acts as no machine. The secret plus any
  client's still-valid token (which carries its grant) acts as that credential until the
  grant's `exp`.

_Alternative:_ mTLS between mcp-01 and be-01 (stronger, but needs a CA on every host).

**M15. Leases and the claim cap are scoped to a trusted run.** "One process per credential"
cannot be enforced, so this is adopted now rather than stated.

- _Where the run comes from._ A token request may carry `wbs_run`, an opaque value of 1 to
  128 characters chosen per agent process. Without it, the run is the token's `jti`. be-01
  signs the run into the grant, so on the wire it is trusted; only the credential's own
  holder chooses it.
- _Why not the MCP session id._ mcp-01 is stateless and issues no `Mcp-Session-Id`.
- _Continuity._ A re-fetching client sends the same `wbs_run`, which keeps its leases.
- _Claims._ A claim taken under a grant gets `runId` = the grant's run. A different `runId`
  in the command is refused `run_mismatch`.
- _Renewal._ For a grant principal, `postApiClaimsRenew` and batch renewal renew only
  `(person, run)` leases.
- _The cap._ The claim cap already counts `(work item, person, run)`.
- _Unchanged._ API-key and consent principals keep today's per-person renewal.

_Alternative:_ the stated invariant of the previous draft (unenforceable).

**M16. State keyed by account, not person.** A pool's N persons share the admin's account
(A12), and so do any agents bound to one account today.

| State                                                | Keyed by             | Decision                                                                                                                                       |
| ---------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Undo and redo (`command_journal`, `(project, user)`) | account              | **Fixed by a separate bug-fix PR from another worker**, so that undo is per acting person. This change depends on it and slice 6 waits for it. |
| Membership and the A23 role cap                      | account              | intended                                                                                                                                       |
| `created_by` and audit actors                        | account              | accepted; the person is in the claim and audit detail                                                                                          |
| Project-opened and recents                           | account              | shared, harmless                                                                                                                               |
| Claim cap and leases                                 | person and run (M15) | unaffected                                                                                                                                     |

Task 6.0 greps every `userId` key and adds any check missing from this table before slice 6.

## Risks / Trade-offs

- **claude.ai Team and Enterprise Request headers are shared credentials.** (ii) is withheld
  from v1 for that reason, and is restricted to individual Pro or Max if Dany wants it. A
  machine credential in a shared header would act for people WBS never admitted.
- **Dash concentrates N keys (M7).** Re-keying is the recovery path.
- **M2's audience rule breaks existing OIDC registrations** until they are re-registered. The
  preflight lists them; prod likely has none.
- **M9 and M13 break HTTP fleets and Auth0 bearers on `/mcp` at the swap.** Fleets go straight
  to MCP (slice 7 is gated on claire fleets observed on MCP on dev).
- **Per-replica limits are approximate.** be-01's caps are the fences.
- **The consent path still costs one consume write per call.** This change does not alter it.
