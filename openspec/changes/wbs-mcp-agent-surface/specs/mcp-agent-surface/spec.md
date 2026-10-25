## ADDED Requirements

### Requirement: A machine credential obtains an MCP access token through the client credentials grant

mcp-01's token endpoint SHALL accept `grant_type=client_credentials` in standalone mode from a
live `api_key` machine credential of an activated deployment, verified only through be-01's
`POST /internal/mcp/machine-grants`. It SHALL answer an mcp-01-signed access token for the
canonical `MCP_PUBLIC_URL` that carries the machine grant, and no refresh token.

#### Scenario: The token's shape

- **WHEN** a live key gets a token
- **THEN** the token has `aud` = the canonical `MCP_PUBLIC_URL`, `token_use: machine`, the
  scopes be-01 returned in the grant, the grant as a claim, and `exp` 60 s before the grant's

#### Scenario: An SDK client gets a token and lists tools

- **WHEN** the MCP SDK's `ClientCredentialsProvider` is configured with a live key as
  `clientSecret` and connects to `/mcp`
- **THEN** the token request uses HTTP Basic, the answer is `200` with no `refresh_token`, and
  `tools/list` answers the same names and descriptions as a consented session's

#### Scenario: Before activation nothing is issued

- **WHEN** a `client_credentials` request and a JWT-bearer request arrive before organization
  activation
- **THEN** be-01 answers `409 not_activated`, and mcp-01 answers `401 invalid_client` and
  `400 invalid_grant` respectively

#### Scenario: A read-only credential cannot write

- **WHEN** a key whose person is bound to a `viewer` account gets a token and calls a write
  tool
- **THEN** the token's scope is `wbs:read`, and mcp-01 refuses the write as `insufficient_scope`
  without asking be-01

#### Scenario: An assertion is not client authentication

- **WHEN** a `client_credentials` request carries only a `client_assertion` and no secret
- **THEN** the answer is `401 invalid_client`

### Requirement: A workload obtains an MCP access token through the JWT-bearer grant

The token endpoint SHALL accept `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` with
an `assertion` from a trusted issuer, without client authentication. It SHALL identify the
`oidc` credential by `(iss, aud, sub)` per A25, SHALL NOT consume the assertion's `jti`, and
SHALL answer every assertion failure with the same `400 invalid_grant`.

#### Scenario: A GitHub Actions workload

- **WHEN** `WorkloadJwtBearerProvider` sends a GitHub Actions token carrying a registered
  audience and the credential's subject
- **THEN** the answer is `200` with a token naming that credential, whose `exp` is at most the
  assertion's `exp` minus 60 s

#### Scenario: A run outlives its workload token

- **WHEN** a run's access token expires after the first workload token has expired
- **THEN** the provider reads a fresh workload token for the next token request, and the run's
  next tool call succeeds

#### Scenario: A reused Kubernetes token

- **WHEN** three processes present the same projected service-account token, with the same
  `jti`, within one minute
- **THEN** all three answer `200`

### Requirement: The JWT-bearer grant never authenticates a client

A `client_id` sent on the JWT-bearer grant, in the body or by Basic, SHALL equal the matched
credential's id and SHALL never be looked up in the registered-client store. A Basic secret on
this grant SHALL be `400 invalid_request`. An assertion whose `typ` is neither absent nor `JWT`
SHALL be `400 invalid_grant`.

#### Scenario: A client_id the registered-client store has never seen

- **WHEN** the provider sends `client_id` equal to the credential id with the assertion
- **THEN** the answer is `200`, and the registered-client store was not read

#### Scenario: An ID-JAG assertion

- **WHEN** an assertion with `typ: oauth-id-jag+jwt` is presented
- **THEN** the answer is `400 invalid_grant` naming ID-JAG as unsupported

### Requirement: Token requests are parsed strictly

`resource` SHALL appear exactly once and equal the canonical `MCP_PUBLIC_URL`, else
`400 invalid_target`. An absent `scope` SHALL mean `wbs:read wbs:write`, and a broader one
`400 invalid_scope`. Two client authentication methods in one request (Basic and body, or either with a
`client_assertion`) SHALL be `400 invalid_request`. A `client_id` that is sent SHALL equal the credential's id.

#### Scenario: Resource and scope

- **WHEN** a live key asks with a missing `resource`, a foreign `resource`, two `resource`
  parameters, and `scope=wbs:editor` in turn
- **THEN** the first three answer `400 invalid_target`, the last `400 invalid_scope`, and be-01
  is asked none of them

#### Scenario: Two authentication methods

- **WHEN** a request carries the key in HTTP Basic and again as `client_secret`, or in HTTP
  Basic together with a `client_assertion`
- **THEN** both answer `400 invalid_request`

### Requirement: Token endpoint refusals reveal nothing and never fall through

An unknown id, a wrong secret, a mismatched `client_id`, a revoked or expired credential and a
`mcp_consent` credential SHALL all answer the same `401 invalid_client` with
`WWW-Authenticate: Basic`. A failed machine verification SHALL never
be retried against the upstream issuer.

#### Scenario: Failures are indistinguishable

- **WHEN** the endpoint is asked with an id naming no credential, a revoked credential's correct
  key, and a live credential's wrong secret
- **THEN** all three answer the same `401 invalid_client` body and header, and the upstream
  verifier is called zero times

### Requirement: The authorization server advertises machine clients and refuses to register them

The metadata SHALL list the grants `client_credentials` and
`urn:ietf:params:oauth:grant-type:jwt-bearer`, and the methods `none`, `client_secret_basic`
and `client_secret_post`, but not `private_key_jwt`. Dynamic client registration SHALL refuse
a client that asks for either machine grant (new behaviour).

#### Scenario: Registration refuses a machine

- **WHEN** a dynamic registration that would otherwise be accepted (auth method `none`, a valid
  loopback redirect URI) asks for `grant_types: ['client_credentials']`
- **THEN** it is refused `400 invalid_client_metadata` and no client is stored

#### Scenario: Consent clients still register

- **WHEN** a public client registers for `authorization_code` with auth method `none`
- **THEN** it is registered as before

### Requirement: mcp-01 accepts no upstream token after activation

After activation, `/mcp` SHALL refuse a token of the configured upstream issuer
`401 invalid_token` and SHALL forward nothing. A request with no mcp-01 session SHALL never be
given the caller's raw token as its be-01 bearer.

#### Scenario: An Auth0 token on /mcp

- **WHEN** a valid be-01-audience Auth0 access token is sent to `/mcp` in the shared activation
  fixture, which sets be-01's marker and mcp-01's epoch
- **THEN** the answer is `401 invalid_token` and be-01 receives no request

#### Scenario: Markers disagree

- **WHEN** be-01 answers `activated` while mcp-01's credential epoch is 0
- **THEN** mcp-01 reports a configuration fault and refuses the request

### Requirement: be-01 admits a machine grant only from mcp-01 and rereads its credential at every use

be-01 SHALL admit a bearer of `typ wbs-machine-grant+jwt` and `aud wbs-be-01/machine-grant`,
signed by a current or previous machine-grant key named by `kid`, only with a constant-time
valid `MCP_BE_INTERNAL_SECRET`. It SHALL then reread the credential through
`admitMachineCredential` (unrevoked, unexpired pool, person bound, account a member), and
otherwise answer `401 unknown_identity`. A grant SHALL be reusable until `exp` and SHALL cost no
write other than the coarse last-use touch.

#### Scenario: A grant without the secret

- **WHEN** a client extracts the grant from its token and calls `GET /api/projects` with it
  and no `MCP_BE_INTERNAL_SECRET`
- **THEN** the answer is `401 invalid_token`

#### Scenario: Revocation at the next call

- **WHEN** an admin revokes a credential while its token still has 10 hours to run
- **THEN** the next tool call answers the tool error `machine_credential_refused` (be-01
  answered `unknown_identity`), the next HTTP request with that token to the same replica is
  `401 invalid_token`, and the next token request is `401 invalid_client`

#### Scenario: Revocation inside a batch

- **WHEN** a JSON-RPC batch of three tool calls meets the refusal at its second call
- **THEN** the first call's result stands, and the second and third answer
  `machine_credential_refused`, the third without any be-01 request

#### Scenario: No write per call

- **WHEN** a machine token makes 100 tool reads within one minute
- **THEN** the delegation-use table gains no row and `last_used_at` changes at most once

### Requirement: The machine grant is verified apart from delegations

be-01 SHALL route a direct bearer by exact audience. A grant's cap SHALL be
`MOST_MACHINE_GRANT_SECONDS`, independent of `MOST_DELEGATION_SECONDS`. A grant SHALL never be
signed with or verified by the delegation key.

#### Scenario: A long delegation stays refused

- **WHEN** a `wbs-be-01/via-mcp-01` delegation with a lifetime of 3,600 s is presented
- **THEN** it is refused, as before this change

#### Scenario: A grant signed with the delegation key

- **WHEN** a grant-shaped token is signed with `WBS_DELEGATION_SIGNING_KEY`
- **THEN** it is `401 invalid_token`

### Requirement: A machine grant yields the API-key principal

An admitted grant SHALL yield `authentication.kind` `machine`, the pinned person, the grant's
run when one was opted in, scopes derived from the reread credential alone, and the A23 role
cap.

#### Scenario: Parity with a raw key

- **WHEN** the same credential claims a step through a grant, and through its raw key on `/api`
  in the test-only composition seam
- **THEN** both claims carry the same person, are leased, are renewed by `postApiClaimsRenew`,
  and meet the same `claim_limit` refusal, given no `wbs_run`

### Requirement: Machine token lifetimes have one owner

be-01 SHALL cap a grant's `exp` at `min(requested, now + MOST_MACHINE_GRANT_SECONDS,
assertion exp)`. mcp-01 SHALL request `MCP_MACHINE_TOKEN_TTL` (default 12 h, refused at boot
outside 60 s to 24 h) lowered by a uniform 0–10 % jitter. An expired token on `/mcp` SHALL
answer HTTP `401 invalid_token` with `WWW-Authenticate`.

#### Scenario: An OIDC token does not outlive its assertion

- **WHEN** a workload assertion expiring in 5 minutes is exchanged
- **THEN** the access token's `exp` is at most the assertion's `exp` minus 60 s

#### Scenario: Re-fetch at expiry

- **WHEN** an SDK client's token expires mid-run
- **THEN** its next request gets `401`, the provider requests a new token, and the call succeeds

### Requirement: Machine admission reads no mcp-01 store

Verifying a machine token SHALL read neither `familyForSession` nor
`credentialEpoch` and SHALL write no row. A machine token SHALL be refused `400 invalid_grant`
at the refresh endpoint and `400 unsupported_token_type` at `/revoke`.

#### Scenario: A second replica

- **WHEN** replica A issues a token and replica B, sharing only keys and secret, receives a tool
  call with it
- **THEN** B answers it, and a store spy on both records zero reads and writes for it

### Requirement: Every MCP principal sees one tool list without human-only tools

`tools/list` SHALL answer the same names and descriptions for a consented human, a consented
agent and a machine token. A shape with the `humanOnly` policy SHALL never be a tool,
and a `humanOnly` shape matching no operation SHALL fail startup.

#### Scenario: Administration is absent

- **WHEN** any MCP principal calls `tools/list`
- **THEN** no tool reaches machine credentials, trusted issuers, agent pools, provisioning
  tokens, memberships, invitations, join requests, domains, SSO connections, session policy,
  the limits read, the capacity-mode switch, restore approvals or onboarding

#### Scenario: The capacity report is a tool

- **WHEN** a provider reporter's machine token calls the capacity report tool
- **THEN** be-01 records it; a consented agent gets `not_an_agent_principal`

### Requirement: Tool path values cannot traverse

mcp-01 SHALL refuse a path parameter that is empty, `.` or `..` as a tool input refusal before
any be-01 request. It SHALL also refuse when the pathname it would send differs from the
expanded template.

#### Scenario: A dot-dot project id

- **WHEN** `getApiProjectsByIdClaims` is called with `id: '..'`
- **THEN** the tool answers `ToolInputRefused` and be-01 receives nothing; `id: ''` is refused
  the same way

### Requirement: mcp-01 bounds machine traffic from trusted source addresses

The source address SHALL be the `X-Forwarded-For` entry `MCP_TRUSTED_PROXY_HOPS` from the right.
Failed authentications SHALL be limited per `(client_id, address)` and per address, successful
issuances per credential and per address, `tools/call` messages per credential, and in-flight
tool calls per organization (128 per replica by default). A `/mcp` refusal SHALL be HTTP `429`
with `Retry-After`. A token-endpoint refusal SHALL be HTTP `429` with error `invalid_request`
and `Retry-After`.

#### Scenario: A spoofed header

- **WHEN** a client behind one proxy sends `X-Forwarded-For: 1.2.3.4, <real address>` with
  rotating first entries and wrong secrets
- **THEN** all failures count against the real address, and it is refused `429` after 30

#### Scenario: A stranger cannot lock out a credential

- **WHEN** another address sends 100 wrong secrets for a credential's public id
- **THEN** that credential's own issuance from its orchestrator still answers `200`

#### Scenario: A batch counts per call

- **WHEN** one HTTP request carries 30 `tools/call` messages for one credential
- **THEN** the calls beyond the burst of 20 answer `429`-shaped tool errors and the rest run

#### Scenario: A pool of 100 re-keys from one address

- **WHEN** an orchestrator issues 100 tokens from one address within a minute
- **THEN** every issuance succeeds

### Requirement: Gateway mode offers no machine admission

With `MCP_AUTH_MODE=gateway`, both machine grants SHALL be `400 unsupported_grant_type` and
the metadata SHALL omit them. On `/mcp`, a JWT carrying `token_use: machine` SHALL be
`401 invalid_token` and SHALL never be forwarded.

#### Scenario: A machine token in gateway mode

- **WHEN** gateway-mode mcp-01 receives a validly signed machine token on `/mcp`
- **THEN** it answers `401 invalid_token`, and be-01's fake records no request

### Requirement: Secrets never reach logs or reports

No API key, base64 Basic form of it, workload assertion, machine grant or access token SHALL
appear in route evidence, unexpected-failure reports, audit details, error bodies, or the
`toString`/`toJSON` of their carriers. `machine_token_issued` SHALL be written at most once per credential,
run and UTC day, without them.

#### Scenario: A failing token request

- **WHEN** be-01's machine-grant route throws during a Basic-authenticated token request
- **THEN** the report, route evidence and audit row contain neither the key, nor
  `base64(id:key)`, nor the assertion, checked with the `plaintext-secrets` pattern and by
  exact substring

### Requirement: Run scoping is opt-in through wbs_run

A token request MAY carry `wbs_run` (1 to 256 characters), which be-01 SHALL sign into the
grant. Without it, a grant SHALL carry no run, and renewal and `runId` SHALL behave as for an
API key today. A run SHALL never be defaulted from the token's `jti`.

#### Scenario: Re-fetching without wbs_run orphans nothing

- **WHEN** a `ClientCredentialsProvider` client claims a step, its token expires, it re-fetches
  and heartbeats
- **THEN** the claim is renewed, and claiming the same step again answers `alreadyHeld`

### Requirement: An opted-in run scopes renewal, claims and release

With a run, a claim SHALL take that run as its `runId`. A command naming another `runId`, or a
`releaseWorkItem` of another run's claim, SHALL be refused `run_mismatch`. Renewal, by
`postApiClaimsRenew` or by a committed batch, SHALL renew only that person's leases of that
run. Undo SHALL stay per person.

#### Scenario: Two processes on one credential

- **WHEN** processes A and B share one credential with runs `a` and `b`, and only A heartbeats
- **THEN** A's leases are renewed and B's lapse at their lease end with reason `lease expired`

#### Scenario: A re-fetch keeps the run

- **WHEN** a process re-fetches its token with the same `wbs_run`
- **THEN** its next heartbeat renews the leases it took under the previous token

#### Scenario: A forged run id

- **WHEN** a grant principal with run `a` sends `claimWorkItem` with `runId: 'b'`, or releases
  run `b`'s claim
- **THEN** each is refused `run_mismatch` and nothing is applied

### Requirement: A pinned principal claims only under its own or its human's parent claims

`parent_claim_foreign` SHALL refuse a pinned principal whose parent claim was written by
another pinned person, even of the same account. A parent written by the same person, or by
the account unpinned, SHALL be admitted.

#### Scenario: Two pool agents

- **WHEN** pool agent B claims under agent A's subtree claim
- **THEN** the claim is refused `parent_claim_foreign`; under the admin's own unpinned subtree
  claim it is admitted
