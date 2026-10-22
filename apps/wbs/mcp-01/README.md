# mcp-01

Streamable HTTP MCP server over be-01. Tools are derived from
the shared HTTP descriptors in `@wbs/contracts`; auth, internal, operational, and browser organization-selection routes are excluded.
Before organization activation every tool call forwards the caller's upstream
Bearer token to be-01, so the same issuer, identity, scope, journal, and owner
rules govern MCP and browser calls. After it, a session is bound at consent to
one organization and each be-01 call carries a single-use signed delegation for
that binding; see [Organizations](#organizations).

## Writing is two tools

Since `plan-commands` every plan edit is one tool, `postApiProjectsByIdCommands`:
an ordered list of typed commands (create, patch, move, estimate, dependency,
capacity, directory entries…) applied all or none, recorded as **one undo**, and
answering the id each `ref` became. A later command names what an earlier one
created by its ref. The directory has no project, so its edits alone have
`postApiDirectoryCommands`. Step edits may address a node with `stepNodeId` from
a work-item read instead of the `workItemId`/`workItemRef` and `stepId` pair.

87 tools in all:

- the reads (the timezone list among them), the work-item page and single work-item reads;
- bounded project discovery, project-qualified dependency endpoint lookup and address resolution;
- the startable read (`getApiProjectsByIdStartable`: which steps a team may claim, and which are
  claimed);
- the by-person read (`getApiProjectsByIdPeopleByPersonIdWork`: one person's assignments and
  claims in a project);
- the project resource read (`getApiProjectsByIdResources`: the directory's resources, the
  project's capacities and demands);
- the two person-load reads, the project rank read and move;
- the organization's capacity-mode read and switch (the switch refuses every delegated caller and
  so answers an MCP client with 403);
- the shared people restore-approval route;
- the two batches, undo, redo, the project and step routes, the export, the import;
- the six saved-plan routes: the five that create, list, read, rename and delete a snapshot, plus
  `getApiProjectsByIdSaved-plansCompare`, which answers what changed between two of them;
- the four calendar-marker routes that list, add, edit and delete a dated annotation on a
  project's axis;
- the three membership routes that list, promote or demote, and remove members of the active
  organization (which, like the onboarding routes, refuse every delegated caller and so answer an
  MCP client with 403);
- three invitation administration routes, three join-request administration routes, the
  organization domain-claim routes, the four enterprise SSO connection routes and the two
  session-policy routes (which refuse every delegated caller and so answer an MCP client with
  403);
- six onboarding routes, which refuse every delegated caller and so answer an MCP client with 403;
- the ten space routes that list, create, read, rename and delete a space, add, remove and move
  its projects, and read its projects' roll-ups and the work in progress across it;
- one call that retries a failed or corrupt optimized variant; Retry is a project lifecycle action
  with no plan-command equivalent.

`postApiOrganizationSharedPeopleRestoreApprovals` is discoverable but refuses every delegated
caller with `403 insufficient_scope`. A personally authenticated super-admin can use its HTTP
route to record approval for one operation and backup digest in the active organization;
approval alone restores no modes or ranks. The marker and space writes are not batched with the rest: neither is a plan edit, so no `commands`
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

With `INTERNAL_AUTH_SECRET` set to be-01's own value, consent after activation
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
A direct upstream token (not an mcp-01 session) and a session consented before
activation reach be-01 unbound and are refused with `no_active_organization`.
Unset, mcp-01 forwards the upstream token as before. Contract and deployment
keys: `docs/auth-integration.md`, "MCP organization delegation".

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
only when its schema is exactly the first migration's. The store also holds the
credential epoch; this release starts only at epoch 0. Reverse with
`rollbackMcpStore` while mcp-01 is stopped: it refuses while a bound credential
is still usable or the epoch has advanced.

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
bun apps/wbs/mcp-01/src/main.ts
```

The build bundles the shared HTTP descriptors; no separate OpenAPI file is needed. The server
refuses to boot when the generated document cannot produce an unambiguous tool table.
