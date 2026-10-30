# mcp-01

Streamable HTTP MCP server over be-01. Tools are derived from
the shared HTTP descriptors in `@wbs/contracts`; auth, internal, operational, and browser organization-selection routes are excluded,
and so is every shape tagged `humanOnly`: organization administration and onboarding, which a
person does in the browser (`wbs-mcp-agent-surface` M8). Every principal (a consented human, a
consented agent, a machine token) sees the same list.
Before organization activation every tool call forwards the caller's upstream
Bearer token to be-01, so the same issuer, identity, scope, journal, and owner
rules govern MCP and browser calls. After it, a session is bound at consent to
one organization and each be-01 call carries a single-use signed delegation for
that binding; see [Organizations](#organizations).

## Writing plans

Since `plan-commands` every plan edit is one tool, `postApiProjectsByIdCommands`:
an ordered list of typed commands (create, patch, move, estimate, dependency,
capacity, directory entries…) applied all or none, recorded as **one undo**, and
answering the id each `ref` became. A later command names what an earlier one
created by its ref. The directory has no project, so its edits alone have
`postApiDirectoryCommands`. Step edits may address a node with `stepNodeId` from
a work-item read instead of the `workItemId`/`workItemRef` and `stepId` pair.

79 tools in all:

- the reads (the timezone list among them), the work-item page and single work-item reads;
- bounded project discovery, project-qualified dependency endpoint lookup and address resolution;
- the saved-reference delivery read, which observes public GitHub delivery without changing planning progress;
- the startable read (`getApiProjectsByIdStartable`: which steps a team may claim, and which are
  claimed);
- the budget headroom read (`getApiProjectsByIdBudget-headroom`: per startable and claimed step,
  the tightest budget per measure with what is spent, held and remaining, set with the `setBudget`
  and `clearBudget` batch kinds);
- the by-person read (`getApiProjectsByIdPeopleByPersonIdWork`: one person's assignments and
  claims in a project, each claim with its lease expiry);
- the claims read (`getApiProjectsByIdClaims`: every claim held in a project, with holder, run,
  parent claim, lease expiry and revocation, and the server's read instant);
- the claim history read (`getApiProjectsByIdClaim-history`: a project's newest claims and
  releases, batched ones included, each with holder, items and reason, such as a lease that
  expired);
- the agent heartbeat (`postApiClaimsRenew`: renews every claim lease of the calling agent; a
  claim an agent takes for itself is released 15 minutes after its last write unless renewed; a
  raw HTTP caller sends no body and no query string, either is refused `400` and renews nothing);
- the project resource read (`getApiProjectsByIdResources`: the directory's resources, the
  project's capacities and demands);
- the four conditional runtime tools for coherent state, authority acquisition, exact claim/write
  and accepted-receipt lookup;
- the measure definition read (`getApiMeasures`: the organization's measure definitions, the five
  seeded and any it defined, written with the `createMeasure`, `patchMeasure` and `deleteMeasure`
  directory commands, which only an organization admin or super-admin may send);
- the two person-load reads, the project rank read and move;
- the organization's capacity-mode read;
- the capacity report
  (`putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report`), which only a
  machine token of an agent person may send: a consent session is refused
  `not_an_agent_principal`;
- the two batches, undo, redo, the project and step routes, the export, the import;
- the six saved-plan routes: the five that create, list, read, rename and delete a snapshot, plus
  `getApiProjectsByIdSaved-plansCompare`, which answers what changed between two of them;
- the four calendar-marker routes that list, add, edit and delete a dated annotation on a
  project's axis;
- the ten space routes that list, create, read, rename and delete a space, add, remove and move
  its projects, and read its projects' roll-ups and the work in progress across it;
- one call that retries a failed or corrupt optimized variant; Retry is a project lifecycle action
  with no plan-command equivalent.

`readRuntimeState` returns coherent runtime facts, current authority and the revision basis.
`acquireRuntimeAuthority` pins the ledger and compare-and-swaps the generation;
`applyRuntimeCommands` accepts one exact claim or a restricted claimed write, guarded by that
authority and basis. `lookupRuntimeReceipt` reconciles a command through its immutable receipt.

The marker and space writes are not batched with the rest: neither is a plan edit, so no `commands`
command creates one. One call drafts a plan:

```json
{
  "id": "<projectId>",
  "commands": [
    {
      "kind": "createWorkItem",
      "ref": "epic",
      "parentId": null,
      "afterId": null,
      "name": "Payments v2"
    },
    {
      "kind": "createWorkItem",
      "ref": "a",
      "parentRef": "epic",
      "afterId": null,
      "name": "Schema"
    },
    { "kind": "createWorkItem", "ref": "b", "parentRef": "epic", "afterRef": "a", "name": "API" },
    {
      "kind": "setEstimate",
      "workItemRef": "a",
      "stepId": "<dev>",
      "days": { "optimistic": 1, "realistic": 2, "pessimistic": 4 }
    },
    { "kind": "addDependency", "workItemRef": "b", "predecessorRef": "a" }
  ]
}
```

A refused command refuses the whole batch with `{ "error", "at", "kind" }` and
nothing is applied; fix that command and resend.

Typed dependencies use the same command tool. An omitted endpoint `projectId`
keeps owner-local IDs and exact batch aliases, including `PUNI.080.39`. An explicit
`projectId` requires stable IDs without surrounding whitespace (or the existing
`sn1` node ID), and forbids `workItemRef` even for the owner project. The route's
project owns the successor:

```json
{
  "id": "<successor-project-id>",
  "commands": [
    {
      "kind": "addTypedDependency",
      "predecessor": {
        "projectId": "<predecessor-project-id>",
        "scope": "whole",
        "workItemId": "<predecessor-id>"
      },
      "successor": { "scope": "whole", "workItemId": "<successor-id>" },
      "type": "FS"
    }
  ]
}
```

MCP advertises V1 dependency semantics and forwards that exact claim to the
backend. External authoring also requires durable ENABLED storage authority;
a DISABLED store returns HTTP 409 `external_dependencies_inactive`, carried in
MCP's tool error with its indexed body. Only the deployment owner's complete
participant-exclusion and activation workflow can enable that authority; MCP
does not activate it. Existing local `addDependency`/`removeDependency` and typed
add/update/remove commands continue through the same admission path.
`updateTypedDependency` and `removeTypedDependency` address the stable
`dependencyId`; changing endpoints keeps that identity.

Connecting an AI client and importing a project through it: [docs/import-with-ai.md](../../../docs/import-with-ai.md).

## Endpoint and probes

- MCP: `POST|GET|DELETE /mcp`
- Protected-resource metadata: `GET /.well-known/oauth-protected-resource`
- Authorization-server metadata: `GET /.well-known/oauth-authorization-server/mcp/oauth`
- Liveness: `GET /health/liveness`
- Readiness: `GET /health/readiness`
- ALB readiness: `GET /health/alb-readiness`

The default port is `3300`; set `PORT` to override it.

## Authentication modes

`MCP_AUTH_MODE=standalone` verifies each incoming Bearer token against the
shared OIDC discovery/JWKS contract. Configure `AUTH_ISSUER_DISCOVERY_URL`,
`AUTH_AUDIENCE`, `AUTH_CLIENT_ID`, and `AUTH_CLIENT_SECRET`; optionally set
`AUTH_GROUPS_CLAIM` (default `wbs_groups`).

`MCP_AUTH_MODE=gateway` accepts claims only after a trusted gateway has
verified the token. It refuses to boot unless `MCP_TRUSTED_GATEWAY=true` is
also set. be-01 still verifies the forwarded token, so the gateway must pass
the upstream token for the issuer and audience be-01 trusts.

Both modes require `MCP_TRUSTED_PROXY_HOPS`, the number of trusted proxies in
front of mcp-01 (0 to 9). A request's source address, which registration,
authorization and the machine limits count by, is the `X-Forwarded-For` entry
that many from the right; with 0 it is the socket address. A request with fewer
entries, or one that is no IP address, counts under one shared `unattributed`
source (`src/source-address.ts`). Count only the proxies you can prove: one too
many trusts a header the client wrote; one too few counts every client as the
proxy, which limits more tightly and trusts nothing.

Both modes require `WBS_API_URL` and canonical `MCP_PUBLIC_URL`; OAuth metadata
derives its resource, issuer, and endpoints from the latter rather than trusting
the inbound Host. There is no `WBS_TOKEN`: caller authority is
never replaced with a process-wide account. `WBS_BASIC_AUTH=user:pass` is an
optional legacy proxy credential and is sent as `Proxy-Authorization` so it
cannot displace the caller's Bearer header.

### Which sign-in methods a connector sees

The connector's consent runs the upstream Auth0 code flow with the same OIDC
application as the browser, and sends no `connection`: Universal Login offers
every connection enabled on that application (Google, GitHub, the email code).
There is no mcp-01 setting for this. The grant carries the chosen identity's own
subject (`google-oauth2|…`, `github|…`, `email|…`), and be-01 resolves the
forwarded upstream token to the WBS user that subject is mapped to, so a person
who linked several methods acts as one user whichever one they used.

## Organizations

With `MCP_BE_INTERNAL_SECRET` or `INTERNAL_AUTH_SECRET` set to be-01's own value
(the dedicated one alone is sent, in `x-mcp-internal-auth`, whenever it is set:
the secret cutover of `wbs-mcp-agent-surface` M14), consent after activation
asks be-01 which organizations the user may bind: one is chosen implicitly,
several show a choice page, none refuses with `access_denied`. The
organization, local user and upstream issuer are stored on the code, refresh
family and session (`src/oauth.ts`). Each tool call then gets a fresh
`wbs-be-01/via-mcp-01` delegation from be-01 for exactly that binding and the
access token's scopes (`src/organization-authority.ts`); no tool argument or
header can name another organization, and another organization's project
answers 404. Every request rereads the family's membership; a removed member's
request answers 401 and its refresh `invalid_grant`. A be-01 401 refreshes the
upstream token and asks for a new delegation, never forwarding the raw token.
Once mcp-01's credential epoch is activated, `/mcp` accepts no upstream token
(M13): an Auth0 token is `401 invalid_token` and be-01 is asked nothing. Before
that, a direct upstream token is forwarded only while be-01 says it is not
activated either; be-01 activated beside mcp-01's epoch 0 is a deployment fault,
reported and answered `502 server_error`. Neither secret set, mcp-01 forwards the
upstream token as before. Contract and deployment
keys: `docs/auth-integration.md`, "MCP organization delegation".

### Consent as an agent person

When the signed-in account has agent persons bound to it in an organization,
the choice page (shown then even for one organization) also offers each agent
(`wbs-machine-credentials` A8, A20). Choosing one records a pending consent in
the store, asks be-01 (`/internal/mcp/credentials`) to mint an `mcp_consent`
machine credential issued by the human for that agent, and only then issues
the code; a refusal answers `access_denied` and no family exists. The family
and its sessions carry the agent person and the credential; every tool call's
delegation names the credential, so be-01 pins it to the agent with `read` and
`write` and the agent acts as a `member`. A credential revoked in WBS ends the
family's use at its next request (401) and refresh (`invalid_grant`). The other
way round, a minute-long sweep (`McpOAuthServer.reportEndedConsents`, started
in `src/main.ts`) reports every consent family mcp-01 ended (revoked, expired,
retired by the epoch) and every code never exchanged to
`/internal/mcp/credentials/ended`, keeping each end in the store until be-01
acknowledges it.

### Machine credentials at the token endpoint

With `MCP_BE_INTERNAL_SECRET` set to be-01's own value, in standalone mode,
`/mcp/oauth/token` also answers two machine grants (`wbs-mcp-agent-surface`
M2–M4), and the authorization server metadata lists them with the methods
`client_secret_basic` and `client_secret_post`:

- `client_credentials` with a `wbs_mk_` API key as the client secret, by HTTP
  Basic (the MCP SDK's `ClientCredentialsProvider`) or in the body; a
  `client_id`, when sent, must be the key's credential id;
- `urn:ietf:params:oauth:grant-type:jwt-bearer` with a trusted issuer's
  workload token as `assertion` and no client authentication.

Each request carries `resource` equal to `MCP_PUBLIC_URL`; `scope` defaults to
`wbs:read wbs:write`, and `wbs_run` (1 to 256 characters) opts into run scoping.
The request is parsed in `src/token-request.ts`, and be-01's
`/internal/mcp/machine-grants` alone verifies the key or assertion, called with
the secret in `x-mcp-internal-auth` (`src/machine-grant-client.ts`). The answer
is an access token with `token_use: machine`, the grant's scopes, be-01's grant
as a claim and `exp` 60 s before the grant's, with no refresh token; nothing is
stored. `MCP_MACHINE_TOKEN_TTL` (seconds, 60 to 86400, default 43200) is the
lifetime asked for, lowered by a uniform 0–10 % jitter and capped by be-01 at
the assertion's or rotated secret's end. Every key failure is `401
invalid_client` with a Basic challenge, every assertion failure `400
invalid_grant`, before activation too; nothing falls back to the upstream
verifier. Dynamic registration refuses both grants. Without the secret, or in
gateway mode, both grants answer `unsupported_grant_type`.

### Machine tokens at `/mcp`

`/mcp` admits a machine token by signature, issuer, audience and `exp` alone,
plus this replica's refused set (`src/machine-admission.ts`); no store is read,
so any replica holding the signing keys and the secret serves it (M5). Each
tool call presents be-01's grant from the token with the secret in
`x-mcp-internal-auth`, never the access token, and be-01 rereads the credential
every time. The token's scope is enforced before be-01 is asked. be-01's
refusals map per M3: `unknown_identity` (revoked, expired or unbound) is the tool
error `machine_credential_refused`, after which this replica answers that token
`401 invalid_token`; `unknown_grant_key` and `invalid_token` make the request
`401 invalid_token`, so the client fetches a new token; `internal_unauthorized`
or any other 401 is a deployment fault, reported and answered `502`. That 401 or
502 replaces the whole response, a batch's included, so the answers to calls
be-01 already served (writes too) are not seen: a client that retries after
it must make its writes idempotent under retry. mcp-01 never follows a redirect
from be-01, so the secret and the grant stay there. A machine
token at `/revoke` is `400 unsupported_token_type`, at refresh `invalid_grant`.
In gateway mode a token carrying `token_use: machine` is `401` and never
forwarded (M11). Path values that are empty, `.` or `..`, or that would change
the route once the URL is parsed, are refused before any be-01 request (M14).

### Machine limits

Each replica applies M10's limits in memory (`src/machine-limits.ts`): failed
authentications at the token endpoint, 5 a minute per `client_id` and source
and 30 a minute per source; successful issuances, 300 a minute with a burst of
100, per credential and per source, in buckets apart from the failures, so a
stranger's wrong secrets never lock out a credential (a request reads the failure buckets,
holds one of its source's 100 pending slots and one per-source issuance while be-01 is
asked, and its outcome spends the failures or gives the issuance back; the per-credential
issuance counts once be-01 verified the credential); `tools/call` messages, 10
a second with a burst of 20, per credential, counted per message, so a batch of
30 runs 20; and 128 tool calls in flight per organization. A token-endpoint
refusal is `429 invalid_request` with `error_description: "rate_limited"` and
`Retry-After`. On `/mcp` a limited call is a tool error naming `rate_limited` or
`too_many_in_flight` and its wait; a request whose only answer is such a call is
HTTP `429` with `Retry-After`. With R replicas each limit is R times as wide.
A tool call waits at most 35 s for be-01 (`BE_CALL_TIMEOUT_MS`), then answers a
reported tool error and frees its slot. be-01 may already have applied a call that timed out, so writes
must be idempotent under retry, as after a 401 or 502.

## Durable sessions and key rotation

mcp-01 owns this store because it is the authorization server that creates,
rotates and revokes the families ([ADR 0030](../../../docs/adr/0030-mcp-01-owns-its-refresh-family-store.md)).
`MCP_STORE_PATH` names the SQLite store. It holds registered OAuth clients,
refresh families and sessions, so a restart or deploy keeps every client's
`client_id`; authorization codes, pending logins and organization choices are
minutes-long and stay in memory. An unknown or expired `client_id` at
`/mcp/oauth/authorize` answers `400 invalid_client` to the browser with an
`error_description` asking for a new registration; whether a client re-registers
on its own is unobserved (`src/oauth.ts`). A stored client's redirect must still
be on today's allowlist. On dev it must be
`/data/mcp-session.sqlite`, the path inside `wbs-dev-src` backed by the host's
`/home/puni1/wbs-dev/data` mount; host paths are not visible inside the
container. `MCP_STORE_KEY_CURRENT` is base64 for 32 random bytes.
`MCP_SIGNING_KEY_CURRENT` is an RSA private key as PEM or base64 PKCS8 DER.
`MCP_ACCESS_TOKEN_TTL` is seconds and defaults to 3600 while the live client
refresh behavior remains unproven.

Startup migrates the store before serving (`src/store-migrations.ts`). Paired
`migration.sql`/`down.sql` folders under `drizzle/` are bundled as text and
recorded with their checksums in `mcp_migration`; an edited or unknown migration
refuses. An absent path is created; an existing empty, partial or unreadable file
refuses instead of being reinitialized. A store from before the ledger is adopted
only when its schema is exactly the first migration's. Reverse with
`rollbackMcpStore` while mcp-01 is stopped: it refuses while a bound credential
is still usable or the epoch has advanced, and (reversing
`20261022130000_mcp_family_person`) while a consent family acting as an agent
person has an end be-01 has not acknowledged (`consent_ended_reported_at IS
NULL`) or a row is left in `mcp_consent_pending`. When it refuses for those:
end the live consent families with
`UPDATE mcp_family SET revoked_at = <now in ms> WHERE credential_id IS NOT NULL AND revoked_at IS NULL;`
on the stopped store, wait out the five-minute code lifetime of any pending
consent, start mcp-01 once with be-01 reachable (its startup sweep reports every
end and pending row to `/internal/mcp/credentials/ended`, which revokes those
credentials in WBS), stop it, and retry the rollback.

### Credential epoch

The store holds a credential epoch: 0 before organization activation, 1 after
it. This release starts at either and refuses a newer one. At 1 it also needs
`INTERNAL_AUTH_SECRET`, because every credential must then be bound to an
organization. A code, session or refresh token is honoured only at the epoch
the store holds now, which is read on every use. An advance therefore retires
older credentials in a running process too.

The operator advances it once, with mcp-01 drained, before be-01's activation
(`docs/runbook-organization-activation.md`, step 2b). be-01's activation CLI reads
this store (`--mcp-store`) and refuses until the epoch is 1:

```sh
MCP_STORE_PATH=/data/mcp-session.sqlite bun apps/wbs/mcp-01/src/credential-epoch-cli.ts          # dry run
MCP_STORE_PATH=/data/mcp-session.sqlite bun apps/wbs/mcp-01/src/credential-epoch-cli.ts --apply
```

`--apply` revokes every epoch-0 refresh family, deletes its sessions and sets
epoch 1 in one transaction. The dry run prints the same counts and rolls back.
At epoch 1 the CLI prints `already_activated` and exits 0. While any process
has read or written the store through a still-open connection it exits 3 and
changes nothing (`src/credential-epoch.ts`).
Epoch 1 is one-way: only a backup of the store file returns to 0.

Rotate either key by moving the old current value to its matching `_PREVIOUS`
variable, installing a new current value, and restarting mcp-01. New writes use
current; reads and token verification accept current and previous. After the
longest 30-day refresh-family lifetime, remove previous and restart. Never
remove previous sooner: doing so revokes still-live families or access tokens.
The SQLite file, `-wal`, signing keys, and store keys are credentials; keep them
mode 600 and out of the source checkout.

## Run

```sh
MCP_AUTH_MODE=standalone \
WBS_API_URL=https://dev.wbs.bulletpoints.club \
AUTH_ISSUER_DISCOVERY_URL=https://idp.example/oauth2/default \
AUTH_AUDIENCE=api://wbs AUTH_CLIENT_ID=wbs AUTH_CLIENT_SECRET=… \
bunx nx run wbs-mcp-01:serve
```

`prepare` emits `src/openapi.json` from the same checkout's shared HTTP descriptors before
source serve and tests; build emits `dist/apps/wbs/mcp-01/openapi.json` beside the bundle.
Both MCP Dockerfiles generate and copy that artifact beside the source entrypoint. No
snapshot is committed. Startup reads the required sibling artifact without importing the
HTTP validators, and refuses missing, unreadable, malformed or ambiguous documents.
