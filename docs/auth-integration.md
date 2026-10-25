# OIDC authentication integration

WBS uses standard OIDC discovery, Authorization Code + PKCE, RS256/JWKS token
verification, and provider-neutral claims. The provider is configuration, not
code: Keycloak is the local acceptance provider, Auth0 is the dev provider, and
the historical Okta setup uses the same contract.

## Shared provider contract

`AUTH_ISSUER_DISCOVERY_URL` is the **issuer URL** passed to OIDC discovery (the
name is historical). It is not the literal `/.well-known/openid-configuration`
URL. The issuer must be HTTPS; the OIDC client rejects plain HTTP, including
localhost, so be-01 and gw-01 refuse to start with any other scheme or an
unparsable value (`issuerUrlFromEnv` in `@wbs/auth`). When password sessions
are on, a native session never reads the OIDC verifier, in authentication or in
be-01's per-route credential evidence, so it keeps working while discovery
fails; an OIDC token still answers 500 then. A failed discovery is retried after
a short cooldown rather than held until restart.

The provider must supply:

- Authorization Code flow for a confidential client, with PKCE S256.
- RS256 access tokens with issuer, expiry, subject, and `AUTH_AUDIENCE` in `aud`.
- `email` and `email_verified=true` in the ID token for first-login linking.
- A string-array groups claim (default `wbs_groups`) containing environment-
  prefixed values such as `dev:wbs:read`, `dev:wbs:write`, and
  `dev:wbs:editor`.
- Refresh tokens when `offline_access` is requested (the default scope).

The registered redirect URI must match byte-for-byte and its path must be
`/api/auth/okta/callback`. Browser cookies are `Secure`, `HttpOnly`,
`SameSite=Lax`, `Path=/`, and `__Host-` prefixed, so browser acceptance also
requires an HTTPS application origin.

## Keycloak acceptance provider

The verified acceptance used Keycloak 26.3 behind an HTTPS reverse proxy. The
proxy terminates TLS for both `https://localhost:3443` (WBS) and
`https://localhost:38443` (Keycloak), and forwards the latter to Keycloak on
`127.0.0.1:38080`. Start Keycloak with forwarded-header processing so discovery
publishes the HTTPS issuer:

```sh
docker run --rm --name wbs-keycloak -p 127.0.0.1:38080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=change-me \
  -e KC_PROXY_HEADERS=xforwarded \
  quay.io/keycloak/keycloak:26.3 start-dev
```

Create this realm configuration in Keycloak:

1. Realm: `wbs`; Require SSL: `None` only because TLS terminates at the local
   proxy.
2. Confidential client: `wbs-client`; Standard flow enabled; client
   authentication enabled; valid redirect
   `https://localhost:3443/api/auth/okta/callback`; web origin
   `https://localhost:3443`.
3. Audience mapper: included client audience `wbs-api`; add it to access and ID
   tokens. Group-membership mapper: claim `wbs_groups`, full group path off;
   add it to access and ID tokens.
4. Add optional client scope `offline_access`. Assign the realm role
   `offline_access` to the acceptance user; without both, Keycloak refuses the
   code exchange with `Offline tokens not allowed for the user or client`.
5. Create groups `dev:wbs:read`, `dev:wbs:write`, and `dev:wbs:editor`, then add
   the acceptance user to all three. Give the user a verified email plus first
   and last name so Keycloak does not interrupt the flow with Verify Profile.

Verify discovery before starting WBS:

```sh
curl -fsS https://localhost:38443/realms/wbs/.well-known/openid-configuration \
  | jq -r '.issuer, .jwks_uri'
```

Both URLs must use `https://localhost:38443`. Processes that call this local
issuer must trust the proxy CA; for a Caddy `tls internal` acceptance proxy,
set `NODE_EXTRA_CA_CERTS` to its exported root certificate.

### WBS environment for Keycloak

Use this shared block for be-01, gw-01, and standalone mcp-01:

```dotenv
NODE_ENV=development
AUTH_ISSUER_DISCOVERY_URL=https://localhost:38443/realms/wbs
AUTH_CLIENT_ID=wbs-client
AUTH_CLIENT_SECRET=<Keycloak client secret>
AUTH_SCOPE=openid profile email offline_access
AUTH_AUDIENCE=wbs-api
AUTH_GROUPS_CLAIM=wbs_groups
```

be-01 and gw-01 additionally use (be-01 also requires `AUTH_METHODS`, `none` here):

```dotenv
AUTH_MODE=oidc
AUTH_REDIRECT_URI=https://localhost:3443/api/auth/okta/callback
# be-01 only; required, no default (see the runbook's environment files).
BROWSER_SESSION_AUTHORITY=disabled
AUTH_METHODS=none
```

Standalone mcp-01 uses:

```dotenv
MCP_AUTH_MODE=standalone
WBS_API_URL=http://localhost:3100
MCP_PUBLIC_URL=http://localhost:3300/mcp
```

The browser-facing frontend and gateway remain same-origin behind the HTTPS
proxy: `/api/*` goes to be-01, `/ws*` to gw-01, and everything else to fe-01.

### Acceptance trace

Drive the flow through fe-01, not directly through the callback:

1. Open the HTTPS WBS origin and choose the SSO button (**Continue with Okta** at the
   2026-08-24 verification, **Continue with SSO** today).
2. Sign in at Keycloak and confirm the browser returns to `/` with no token in
   JavaScript storage.
3. Confirm `GET /api/projects` returns 200 with the HttpOnly cookie and a
   `wss://<app-origin>/ws` connection opens.
4. Read the access cookie from the automation browser's privileged cookie jar
   (not page JavaScript) and send it as `Authorization: Bearer` to standalone
   mcp-01; an MCP `initialize` request must return 200.

Verified on h2puni, 2026-08-24, against Keycloak 26.3 and branch
`change/okta-auth-identity` at `649cc3a`: fe-01 signed in, cookie API 200,
WebSocket open, and standalone MCP initialize 200.

## Auth0 mapping

No provider-specific code is required. The dev tenant is
`dev-fzwagvg246jhid6a.us.auth0.com`; configure discovery from that tenant and
preserve the exact issuer, including its trailing slash:
`https://dev-fzwagvg246jhid6a.us.auth0.com/`.

Pass the issuer URL itself, not the literal
`/.well-known/openid-configuration` endpoint. That keeps the discovery
metadata's issuer-equality check enabled.

```dotenv
NODE_ENV=development
AUTH_MODE=oidc
BROWSER_SESSION_AUTHORITY=disabled
AUTH_ISSUER_DISCOVERY_URL=https://dev-fzwagvg246jhid6a.us.auth0.com/
AUTH_CLIENT_ID=<WBS Tool (dev) client ID>
AUTH_CLIENT_SECRET=<WBS Tool (dev) client secret>
AUTH_REDIRECT_URI=https://dev.wbs.bulletpoints.club/api/auth/okta/callback
AUTH_SCOPE=openid profile email offline_access
AUTH_AUDIENCE=https://wbs.bulletpoints.club/api
AUTH_GROUPS_CLAIM=wbs_groups
AUTH_METHODS=google,github,email
```

`AUTH_METHODS` is required by be-01 in this mode; see [Sign-in methods](#sign-in-methods).
`AUTH_SCOPE` and `AUTH_GROUPS_CLAIM` are optional — the code defaults to
exactly the values shown, and the deployed dev env omits both. Set them only to
override, and never to a different groups claim than the Action emits.

The Auth0 application is a Regular Web Application with Authorization Code +
PKCE and rotating refresh-token grants. Its callback remains
`https://dev.wbs.bulletpoints.club/api/auth/okta/callback`; `okta` is a
historical route name, not a provider dependency. Request `offline_access` and
the audience `https://wbs.bulletpoints.club/api`. Without that audience Auth0
returns an opaque user-info token instead of the RS256 JWT that WBS verifies.

The post-login Action maps Auth0 roles into the environment-prefixed group
claims WBS consumes. For example, `wbs-editor` becomes `dev:wbs:editor`:

```js
exports.onExecutePostLogin = async (event, api) => {
  const groups = (event.authorization?.roles ?? []).map((r) => 'dev:' + r.replace(/-/g, ':'));
  api.idToken.setCustomClaim('wbs_groups', groups);
  api.accessToken.setCustomClaim('wbs_groups', groups);
  api.idToken.setCustomClaim('studio_groups', groups);
  api.accessToken.setCustomClaim('studio_groups', groups);
};
```

This is the dev tenant's deployed Action, so `dev:` is intentional. A production
tenant must emit `prod:` instead; WBS matches the environment prefix exactly and
would otherwise issue a session with no scopes. The Action writes the same role
array to both claims; each app ignores values for the other app segment.

A scopeless session is not a rejected one. The prefix mismatch is silent at
sign-in: the OIDC callback still issues the `__Host-` cookies, and reading is
open to every authenticated account by design, so the user lands on a working
board and can list and open their own projects and receive WebSocket events.
Only the scope-guarded routes refuse them: mutations return
`403 insufficient_scope`, and so do the routes that ask for `read` explicitly
(the solution reader and the project export route). A wrong prefix
therefore reads as "the app is up but nothing saves", not as a login failure —
check the emitted group values before chasing a write bug.

Assign the WBS roles to each user and require `email_verified=true` before
first-login linking. Real dev credentials live only in
`/home/puni1/wbs-dev/oidc-dev.env` on the deployment host (mode 600). The Okta
trial expired on 2026-09-22 and its backup was deleted on 2026-10-22; only the
[historical Okta mapping](#historical-okta-mapping) remains.

Prod's swap reads its provider settings from `/home/puni1/wbs/oidc.env` (mode
600), with the same five-key allowlist. No prod tenant or client is configured
yet. The keys, the `prod:` group prefix and the deploy-time checks are in
`docs/runbook-prod-deploy.md#first-product-deploy`.

As of 2026-08-24, discovery and the real Auth0 Universal Login page are verified.
Credentialed callback acceptance (`/api/auth/me`, WebSocket, MCP, and the emitted
editor scope) remains pending TASK-110's password-login path.

`GET /api/auth/me` is also the explicit signed-out probe: no presented
credential returns `200 {"user":null}`, while a rejected access cookie, Bearer
header, or retired `x-wbs-token` carrier returns `401 invalid_token`. Every arm
sets `Cache-Control: no-store` and `Vary: Cookie, Authorization, X-WBS-Token`; session identity
must never be replayed across callers by an intermediary. Credential presence
and token extraction are one boundary in `middleware/authenticated.ts`, where
the retired header is deliberately counted as presented but never extracted.

### Auth0-backed MCP on dev

`mcp-01` reuses the WBS Auth0 client and secret. Its deployment-only keys live
in `/home/puni1/wbs-dev/src/apps/wbs/mcp-01/.env` (mode 600):

```dotenv
PORT=3300
MCP_AUTH_MODE=standalone
WBS_API_URL=http://localhost:3100
MCP_PUBLIC_URL=https://dev.wbs.bulletpoints.club/mcp
```

Add this byte-exact Auth0 callback without replacing the browser callback:
`https://dev.wbs.bulletpoints.club/mcp/oauth/callback`. Dynamic registration
accepts only the reviewed hosted callbacks in `HOSTED_REDIRECTS`
(`apps/wbs/mcp-01/src/oauth.ts`: Claude, VS Code web and Perplexity) as exact
strings, or a literal `localhost`/`127.0.0.1`/`[::1]`
HTTP(S) loopback callback at any valid port for tools such as MCP Inspector.
Authorization responses carry the RFC 9207 `iss`. ChatGPT (stable or callback-ID
URI), Cursor and Copilot Studio callbacks each need their own reviewed entry
there, added once a connection is seen displaying that exact URI. Unproven clients
expire after 10 minutes of DCR inactivity. Starting authorization can extend an
unproven client only to an absolute 20-minute lifetime, and a new flow is
refused with 429 when that ceiling cannot cover the browser and code-exchange
window. A successful code exchange promotes the client to proven, and each
code exchange or successful refresh renews it to 30 days after that use
(`PROVEN_CLIENT_TTL_MS`), so it outlives its refresh families (14-day idle,
30-day absolute) and a connector that caches its `client_id`, such as Claude
Code, can still start a fresh authorization after a family lapses. Registered
clients live in the MCP store (`MCP_STORE_PATH`), so restarts and deploys keep
them and their lifetimes; authorization with an unknown or expired `client_id`
answers `400 invalid_client` to the browser with an `error_description` asking
for a new registration (automatic re-registration by clients is unobserved),
while other malformed authorization requests stay `invalid_request`. A stored
client's redirect is re-checked against `HOSTED_REDIRECTS` and the loopback
rule at every authorization, so removing a callback takes effect at deploy. Registration is
capped at 20 unproven and 100 proven clients per forwarding source plus 1,000
globally; pending authorization is capped at five per client and 1,000 globally;
unredeemed grants and live sessions are each capped at 1,000 globally. New
requests at capacity return 429 and never evict another connector's state. A
session-capacity refusal preserves the valid grant for retry until its five-
minute expiry. Claude users share Anthropic's forwarding egress, so a burst
above the per-source limits can return 429 until the oldest state expires;
a proven client holds its per-source slot for 30 days after its last use.
Revoking a family does not free its client's slot, and the 100-client proven
per-source cap is shared by every claude.ai user behind one Anthropic egress
address. A client unused for 30 days answers `invalid_client`, as do clients
swept before the 30-day lifetime shipped once their families lapse; the remedy
is to remove and re-add the connector, which registers a new client.

Before prod or outside users, choose how the proven cap scales: a per-subject
cap, evicting proven clients with no live family least recently used first,
releasing a client when its last family is revoked, or not counting proven
clients in the per-source check. Tombstones that keep an expired client's id,
source and redirect URIs, so authorization can re-admit it through the caps,
would make that step unnecessary (follow-up).

Before cutover, the absent `/home/puni1/wbs-dev/state/mcp-exposure` marker makes
the MCP public probe skip. Cutover atomically writes `enabled` to that mode-600
marker. Every later deploy reads it before snapshotting devsync and must pass
the semantic MCP probe; malformed or unreadable state fails the deploy.
The probe requires Bun and verifies both RFC 9728 resource-metadata locations,
the RFC 8414 authorization-server metadata, and the unauthenticated challenge.

Cut over in this order:

1. Before merging, seed `/home/puni1/wbs-dev/src/apps/wbs/mcp-01/.env` with the
   four settings above plus `MCP_SIGNING_KEY_CURRENT`, `MCP_STORE_KEY_CURRENT`,
   `MCP_STORE_PATH=/data/mcp-session.sqlite`, and `MCP_ACCESS_TOKEN_TTL=3600`,
   and set mode 600. The store path is inside `wbs-dev-src` and is backed by
   `/home/puni1/wbs-dev/data` on the host. Both manual deploy and the automatic
   poller block before moving the checkout when this durable path is absent.
2. Merge the reviewed PR and let devsync start `mcp-01`; verify port 3300.
3. Add the exact Auth0 callback above.
4. Back up the live Caddy file, install the reviewed candidate, and validate it
   with the running Caddy version before reload.
5. Reload, then persist the successful cutover before its health check:
   `printf 'enabled\n' | install -m 600 /dev/stdin /home/puni1/wbs-dev/state/mcp-exposure`.
6. Run `bin/dev-deploy.sh` and verify the four MCP discovery/resource paths
   plus the existing app/API/WS probes. Do not pass a one-run environment flag;
   the persistent marker is the assertion.
7. If validation, reload, or any probe fails, restore the Caddy backup, reload,
   move the marker out of the state path, verify the original app/API/WS routes,
   and remove the added Auth0 callback.

### MCP organization delegation

After organization activation be-01 refuses a raw upstream Bearer for
organization resources (`403 no_active_organization`): it binds no
organization. mcp-01 therefore binds every consent to one organization and
calls be-01 with a WBS-signed delegation instead
(`openspec/changes/organization-ownership-and-access`, tasks 2.5, 6.4, 6.6).

- mcp-01 needs be-01's `INTERNAL_AUTH_SECRET` in its own environment, and be-01
  needs the dedicated RSA pair `WBS_DELEGATION_SIGNING_KEY` (PKCS#8 PEM) and
  `WBS_DELEGATION_VERIFY_KEY` (SPKI PEM). Without the secret mcp-01 keeps
  forwarding the upstream token; without the pair be-01 answers
  `403 delegation_inactive` after activation, and consent fails. Before
  activation access is unchanged, but consent now asks be-01 once (so a
  first-time user's account is resolved at consent, and a be-01 outage fails
  the consent rather than the first tool call).
- Consent asks be-01 (`POST /internal/mcp/organizations`, service secret plus
  the user's upstream token) for the user's admitted memberships. One is bound
  implicitly; several show a choice page. The organization, local user and
  upstream issuer are stored on the code, refresh family and session. Changing
  organization means connecting again.
- Each tool call asks `POST /internal/mcp/delegation` for a single-use,
  at most five-minute `wbs-be-01/via-mcp-01` token naming that user,
  organization, OAuth client, family and narrowed scopes, bound to the
  upstream pair; be-01 rechecks membership and credential rules when it issues
  and again when the token is used. On a be-01 401 mcp-01 refreshes upstream
  and asks again; it never forwards the raw token for a bound session.
- Every MCP request rereads the family's authority
  (`POST /internal/mcp/authority`); a removed member is refused with 401 and
  cannot refresh. An organization enforcing SSO admits only a delegation whose
  upstream subject carries that connection; one with a session policy refuses
  every MCP delegation until trusted grant-lifecycle evidence exists.
- Sessions consented before activation stay unbound and are refused after it
  (task 6.5 will revoke them at the cutover).
- A consent may act as one of the signed-in account's agent persons instead
  (`openspec/changes/wbs-machine-credentials`, design A20): the organizations
  answer lists each membership's `agents`, `POST /internal/mcp/credentials`
  mints the `mcp_consent` machine credential before the code is issued, the
  delegation then names `credentialId` and is pinned to the agent with `read`
  and `write` and `member` reach, and `POST /internal/mcp/credentials/ended`
  (service secret only) is how mcp-01 reports a family it ended so be-01
  revokes the credential. mcp-01's README, "Consent as an agent person", has
  the flow.
- Deploy order: be-01 before mcp-01. This mcp-01 refuses an organizations
  answer without `agents` (its parser requires it) and calls the two new
  credential routes, so during a swap the be-01 serving it must already be
  this release; an mcp-01 started against an older be-01 fails every consent
  after activation as a deployment defect.

## Sign-in methods

WBS offers named sign-in buttons for a closed catalogue (`AUTH_METHODS` in
`libs/wbs/domain/contracts/src/auth-methods.ts`): `google` (Auth0 connection
`google-oauth2`), `github` (`github`), `email` (`email`, the passwordless email
one-time code; Auth0 does not support magic links in Universal Login) and
`apple` (`apple`). The connection names are the Auth0 tenant defaults.

- be-01 requires `AUTH_METHODS` in `AUTH_MODE=oidc`: a comma list of method ids,
  or the literal `none` for the Auth0 chooser only. A missing, empty, unknown or
  repeated id fails boot. Local mode ignores it. The prod swap preflight requires
  it in `be-01.env` and checks the same shape.
- `GET /api/auth/methods` (public, no cookie) lists the enabled methods with
  their labels; fe-01 renders one button per entry and keeps
  **Continue with SSO** (the chooser) last.
- `GET /api/auth/login?method=<id>` sends the method's connection to Auth0 as
  the `/authorize` `connection` parameter. A method that is not enabled answers
  `400 invalid_query` before any transaction is saved.
- Every enabled connection must be enabled on the WBS Auth0 application. The
  mcp-01 consent uses the same application, so the connector sees the same
  connections in Universal Login without an mcp-01 setting.
- Apple is deferred: its connection needs a paid Apple Developer Program
  membership, Team ID, Services ID and signing key. Adding `apple` to
  `AUTH_METHODS` once the connection exists needs no release.
- The post-login Action must emit `<env>:wbs:read` and `<env>:wbs:write` for
  every user of the WBS application regardless of connection; `editor` stays an
  explicit grant. A user without groups has no scopes and is refused at every
  mutating route and at MCP consent.

Auth0 mints a distinct `sub` per connection (`google-oauth2|…`, `github|…`,
`email|…`), and WBS never uses Auth0 account linking. A first sign-in whose
verified email another WBS account already holds is refused with
`/?auth_error=account_exists`; the person signs in the way they did before and
adds the new method from that session (`POST /api/auth/link/auth0` with a
`method`). One WBS user may hold several verified `(issuer, subject)` pairs; the
rules are in `openspec/changes/social-sign-in/design.md`.

## Fleet credentials

A fleet (an agent harness such as Claire's) calls be-01 with an Auth0
machine-to-machine access token for the WBS audience. Such a token carries no
`wbs_groups` claim: the groups Action runs only at login. be-01 treats any
verified token **without** that claim as a machine credential
(`openspec/changes/wbs-team-claims/design.md` D6, D6b):

- It acts only as the account a host operator linked its `(issuer, subject)`
  to, and it never creates or changes an account (no email refresh either).
- Its scopes come from that account's organization roles: `viewer` reads,
  `member` reads and writes, `admin` and `super_admin` also edit. The
  per-organization role checks then apply as for any session of the account.
- An unlinked token is refused `401 unknown_identity`, and no account is
  minted. A token that carries the claim keeps the browser login path.

Link a credential with `link-credential-cli.ts`, inside the live be-01
container like the other host CLIs ([prod runbook](runbook-prod-deploy.md#fleet-credential-links)):

```sh
docker exec be-01-<colour> bun run src/link-credential-cli.ts \
  --issuer=https://<tenant>/ --subject=<client id>@clients \
  --account=<account id or username> [--person=<agent person id>]
docker exec be-01-<colour> bun run src/link-credential-cli.ts --unlink \
  --issuer=https://<tenant>/ --subject=<client id>@clients
```

- `--issuer` is the exact token issuer, trailing slash included; an Auth0
  machine-to-machine `sub` is `<client id>@clients`.
- `--person` pins the credential to one agent person, which must already be
  bound to the same account (`patchPerson` with `accountId`, an organization
  admin's act). A pinned credential claims only as that person or under its
  claims; anything else is `credential_not_for_person`.
- The CLI writes one `external_identity` row and prints it. It refuses before
  organization activation (logins do not read `external_identity` yet), an
  unknown or ambiguous account, a pair already linked, an account's own sign-in
  pair, and a person bound to another account or to none.
- `--unlink` deletes the row: the next token for the pair is
  `401 unknown_identity`, and the account's other credentials keep working.
- Removing a person a credential is pinned to is refused `in_use` naming the
  count; the confirmed removal revokes (deletes) those credentials with the
  person rather than unpinning them.

### Fleets and the MCP endpoint

A headless fleet calls be-01 over HTTP, with an API key (`wbs_mk_…`, minted by
`POST /api/organization/machine-credentials`) or with a linked OIDC credential
as above. Neither works on mcp-01's `/mcp`: mcp-01 accepts only a JWT its own
OAuth server issued (standalone, the deployed mode) or its trusted gateway
verified, so a `wbs_mk_` key there is `401
invalid_token` (observed in the 2026-10-25 swarm rehearsal). An MCP agent
exists only through a human's consent: the human signs in to the connector and
picks an agent bound to their account, which mints an `mcp_consent` credential
([MCP organization delegation](#mcp-organization-delegation)). Neither local
stack completes that consent ([local development](local-dev.md#an-activated-organization-with-api-key-agents)).

## Historical Okta mapping

Okta used the same contract with no code change. Its block differed from the Auth0 one above only
in `AUTH_ISSUER_DISCOVERY_URL=https://<okta-org>/oauth2/<authorization-server-id>`,
`AUTH_AUDIENCE=<access-token audience configured on that authorization server>`, its own client ID
and secret, and no `AUTH_METHODS`. Do not use the org authorization server if it cannot mint the
custom audience and the `wbs_groups` claim (in both ID and access tokens) that WBS requires.
Group values keep the environment prefix: `prod:wbs:*` in production, `dev:wbs:*` in development.

The archived dev values were deleted from the deployment host on 2026-10-22 after the
trial expired; no copy exists in the repository, logs, tests or issue text.

## Local bypass

For ordinary local development without an IdP, use `AUTH_MODE=local` with
`NODE_ENV=development`. It supplies the fixed local identity and issues no OIDC
cookie. Startup refuses `AUTH_MODE=local` when `NODE_ENV=production`.

## Password login

Password login runs inside `AUTH_MODE=oidc`; it is a second route to the same
session, not a separate identity mechanism. A successful `POST /api/auth/login`
issues the same hardened `__Host-wbs_access` HttpOnly cookie as the OIDC
callback. `/api/auth/me` and gw-01 WebSocket upgrades therefore see the same
identity kind regardless of the sign-in route.

Both flags parse strictly as literal `true` or `false`:

```dotenv
AUTH_PASSWORD_LOGIN=true
AUTH_PASSWORD_REGISTER=false
```

`AUTH_PASSWORD_LOGIN` defaults to `true`; production may set it to `false`.
`AUTH_PASSWORD_REGISTER` defaults to `false`, so `POST /api/auth/register`
continues to return 404 in OIDC mode unless registration is explicitly enabled.
Startup refuses registration enabled while password login is disabled, because
that combination would create a session cookie the application then rejects.

The users table has no per-user role or scope column. Password identities
therefore receive the same scopes as `AUTH_MODE=local`: `read`, `write`, and
`editor`. No separate role system is implied.

Failed logins use bounded fixed-window counters keyed separately by normalized
username and client IP. Either key blocks after five failures for 60 seconds.
The bounded counter fails closed when it reaches capacity instead of evicting a
live lock. Enabled registration counts every attempt against the same IP limit
because password hashing is expensive even when registration succeeds.

Password verification uses the same bounded Argon2 cost for unknown,
OIDC-only, oversized, and wrong-password cases; they return the same
`invalid_credentials` response. In OIDC mode, password session creation also
requires the exact application `Origin` and the trusted edge's
`X-Forwarded-For` value. Session JWTs stay only in the hardened HttpOnly cookie,
including when registration is explicitly enabled.

### OIDC migration downgrade

Rolling back through `20260824010000_add_oidc_identity` keeps every user and
dependent row. Because the older four-column users table requires a password,
the down migration stores email, issuer, subject, and original password
nullability in `oidc_identity_downgrade`; passwordless accounts receive the
legacy login path's non-guessable dummy Argon2 digest. They remain present but
cannot use password login while the old release is active. Password accounts
retain their original hashes.

After the forward scripts re-apply, the migrator restores the saved identity
fields and changes originally passwordless accounts back to NULL. The recovery
table is retained for later downgrade cycles; its rows are consumed only after
an exact restore. A saved identity without its user, or any field that fails to
restore exactly, aborts startup without discarding the recovery state.

QA credentials live only in `/home/puni1/wbs-dev/qa-accounts.env` on the
deployment host, with mode 600, as `QA_USER` and `QA_PASS`. Never copy their
values into the repository, logs, tests, or issue text.
