## 0. Dany reads A9 to A20

- [ ] 0.1 Dany confirms or amends design.md A9 to A20, in particular A12 (the credential
      acts as the pinned person's bound account, scopes capped), A10 (headless machines
      outside the credential rules) and A20 (how a consent credential is minted, carried
      and ended). Slice 1 may proceed on A9, A13, A14 and A15; slice 2 waits for A12; slice
      3 waits for A20; slice 5 waits for A16. A21 (no Auth0 source, no link migration) is
      Dany's and fixed. A23 (machine principals are members, from the slice 1 review) is
      the coordinator's assumption and waits for his confirmation.

## 1. Schema and the verification path, API keys first

- [x] 1.1 Migration `add_machine_credential`: `machine_credential`,
      `machine_credential_secret`, `organization_trusted_issuer` with the per-source CHECKs,
      the partial unique pair index, the unique digest, indexes by organization and person,
      the `issued_by` and `mcp_family_id` columns,
      and a `down.sql` refusing while any credential or trusted issuer exists — test:
      `machine-credential-migration.db.test.ts` forward, back and the refusal with one row;
      negative: drop the guard and the rollback silently deletes credentials; watched.
- [x] 1.2 Red: `machine-credential.test.ts` in `@wbs/domain` for the pure admission decision
      over a presented token kind (`api_key` id and secret, trusted-issuer pair,
      delegation with a credential), the matching rows, now, revocation and secret expiry: answer the principal
      (account, capped scopes, organization, pin) or `unknown_identity` — test: one case per
      refusal and per source, a property that a revoked credential is never admitted
      whatever its secrets' expiries, and the two-organizations-one-issuer case.
- [x] 1.3 Green: store port `MachineCredentials` (SQLite and memory, conformance suite):
      `byId` with its live secrets, `byPair`, `touchLastUsed` (coarse to 60 s); the
      constant-time digest comparison in `@wbs/domain`. Negatives: remove the
      `revoked_at IS NULL` predicate from `byId` and the revoked-key case passes; compare
      with `===` and the timing proof (`oauth-timing-safe.proof.ts` precedent) reddens;
      watched, restored, `Proof:` adjacent.
- [x] 1.4 Verification path step 1 (A13, A22) in `middleware/authenticated.ts` and
      `authentication.feature.ts`: `wbs_mk_<id>.<secret>` is parsed once at the boundary,
      routes to `byId` and never to the JWT verifier, a malformed key or a secret under
      another credential's id is `unknown_identity`, a key in a custom header is
      unauthenticated; the principal carries the direct organization context; `resolve`
      scopes it — test: `machine-credential.controller.db.test.ts` admits a live key to its
      organization's projects only, refuses a revoked key `401 unknown_identity`, and
      `GET /api/organization/members` answers `403 insufficient_scope`; negative: let a
      `wbs_mk_` token fall through to the JWT verifier and the mounted test observes a JWT
      parse error instead of `unknown_identity`; watched.
- [x] 1.5 Credential rules (A10): a machine principal passes enforced SSO and the session
      policy — test: `organization-credential-rules.controller.db.test.ts` admits a machine
      key under an enforcing organization and under a session policy; negative: feed the
      machine principal through the upstream rule and the enforcing case answers
      `sso_required`; watched.
- [x] 1.6 Claim pin and account: the admitted principal's `pinnedPersonId` reaches
      `decideClaim`, `person.account_id` is the actor — test: the claims controller test
      with a machine key: accepted for the pinned person and a delegated claim under its
      subtree claim, `credential_not_for_person` otherwise; negative: drop the pin from the
      principal and the cross-person claim passes; watched.

Slice 1 as built (2026-10-22, PR into `plan/wbs-machine-credentials`): A22 replaces the
digest lookup with `findById` on the credential id the key carries, then a constant-time
comparison against that credential's secrets; the revocation and expiry checks therefore
live in the pure decision (1.2), which is where their negatives were watched, not in a
store predicate (1.3). Not built in slice 1: the memory twin and conformance suite of the
port (the SQLite port is the only one, as for `ProvisioningTokens`), and `byPair`, which
slice 5 adds with its first caller. The `wbs_mk_` pattern of the `plaintext-secrets` hook
(4.2) landed here because A22 changed the key's shape. See `verify.md`.

## 2. Admin routes and audit

- [x] 2.1 Audit vocabulary widening: migration `widen_organization_audit_machine_credentials`
      (compatible table rebuild, precedent `20261012090200`), `ORGANIZATION_AUDIT_ACTIONS`
      and subject kinds, `down.sql` refusing while a new-action row exists — test:
      `machine-credential-audit-migration.db.test.ts` forward, the outgoing release's
      `restricted_project_recovery` write, an unknown action refused, rollback refused over
      one row; negative: replace the guard CHECK with `CHECK (1)` and `migration-lint.test.ts`
      reports the destructive statement; watched.
- [x] 2.2 Red: endpoint shapes in `@wbs/contracts` (`/api/organization/machine-credentials`
      list with `?personId=`, create, `:id/rotate`, `DELETE :id`) with the member policy of
      A7 and refusal bodies; OpenAPI
      emit diff; MCP tool count moves by four — test: the shape tests and the emit golden.
- [x] 2.3 Green: create and list for `api_key` in `@wbs/core` and store-sqlite, one
      transaction with the audit row naming the issuer, secret returned once, digest stored,
      `name_taken`, `unknown_person`, `person_not_bound`, `account_not_member`, a member
      accepted for their own agent and `403 forbidden` for a stranger's, a member's list
      narrowed to their own agents, viewer `403 forbidden`, pre-activation
      `no_active_organization` — test: `machine-credential-admin.controller.db.test.ts` for
      each; negatives: write the audit row outside the transaction and the "audit cannot be
      written" scenario stores a credential; drop the own-account predicate and the
      stranger's-agent case creates; watched.
- [x] 2.4 Rotate and revoke (A11, A15, A22), members for their own agents only: second
      secret under the unchanged credential id, previous `expires_at = now + 24 h`,
      `rotation_in_progress`, `rotation_at_issuer`, revoke ends both, `404 not_found` on a
      stranger's or revoked credential — test: the two-secrets-then-one scenario with an
      injected clock, revoke mid-window; negative: replace the secret-expiry predicate of
      `matchesProof` (`@wbs/domain` `machine-credential.ts`) with `true` and the T0 + 25 h case
      admits the old secret; watched.
- [x] 2.5 Person usage: `pinnedCredentials` becomes `machineCredentials`; `deletePerson`
      `in_use` and cascade; `patchPerson` unbind/rebind refused `in_use` — test: the
      directory conformance cases updated and the rebind case added; negative: skip the
      usage read on `patchPerson` and a bound person with a live credential is unbound;
      watched. Since A23 (slice 1 review) a machine principal cannot `patchPerson` at all,
      so this guard covers human admins; it is no longer the only guard against a key
      rebinding its own person.
      Slice 2 must also mint every credential id with `crypto.randomUUID()`:
      `parseMachineKey` accepts only the lowercase UUID shape, while the table's id CHECK
      admits any 36 characters of `[0-9a-f-]`. Slice 2 may tighten that CHECK in its own
      migration.
- [x] 2.6 Last use: `touchLastUsed` once per minute per credential in the request path,
      listed as `lastUsedAt` — test: two requests twenty seconds apart write once;
      negative: make the write swallow its error and the "store read-only" case answers 200
      with a stale list instead of a server error; watched.

Slice 2 as built (2026-10-22, PR into `plan/wbs-machine-credentials`, stacked on slice 1):

- 2.1 admits all five actions and both subject kinds of A17 in one rebuild
  (`20261022110000_widen_organization_audit_machine_credentials`), so slice 5's trusted-issuer
  acts need no second rebuild. The task-2.5 id note is met by
  `20261022110100_check_machine_credential_id`: two triggers holding the id to the lowercase
  UUID shape, additive where a tightened CHECK would need a table rebuild.
- 2.2 keeps the four routes out of the MCP tools (mcp-01 `EXCLUDED_PATHS`, like provisioning
  tokens): every delegation is refused `insufficient_scope` on them, so the tool count does not
  move. The create body accepts `source: 'api_key'` only until slice 5 adds `oidc`.
- 2.3 refuses a viewer `403 forbidden` on every route (the spec sentence now says so). The
  administration port is `MachineCredentialAdministration`, SQLite only, like `MachineCredentials`.
- 2.4 ends every secret on revoke (`expires_at = now`) besides `revoked_at`.
- 2.5 adds `machineCredentials` beside `pinnedCredentials` (both optional on the wire) instead of
  renaming it: operator pins still exist until slice 4 removes them and their count. The
  cascade writes one `machine_credential_revoked` row per live credential and deletes every
  credential row of the person, revoked ones included, because `person_id` has no `ON DELETE`.
- 2.6 was built and its negatives observed in slice 1; slice 2 lists `lastUsedAt`.
- Review fixes (A24, assumed): a cascade removing machine credentials needs the revoke route's
  reach (admin, a member for their own agent, never a delegation or a machine credential), else
  `forbidden`. A kind change of a person with a live credential is refused `in_use`. A
  secret-shaped name is refused `400 invalid_body`, and no audit detail carries the name.

See `verify.md`, "Slice 2 record".

## 3. The MCP consent source (A8, A20)

- [x] 3.1 mcp-01 store migration `mcp_family_person`: nullable `act_as_person_id` and
      `credential_id` on family and session, guarded `down.sql` refusing while any family
      names a person — test: `store-migrations.test.ts` forward, back and the refusal;
      negative: drop the guard and the rollback silently strips the person from live
      families; watched.
- [x] 3.2 be-01 `POST /internal/mcp/organizations` answers `agents` per membership;
      `POST /internal/mcp/credentials` mints an `mcp_consent` credential with its audit row
      and refuses `person_not_bound` and `not_a_member`; shapes in `@wbs/contracts` — test:
      `mcp-delegation.boot.db.test.ts` cases: agents listed only for the token's account,
      a mint for a bound agent, a stranger's agent refused, a human person refused;
      negative: drop the `account_id = userId` predicate and the stranger's agent mints;
      watched.
- [x] 3.3 mcp-01 consent: the choice page offers "yourself" and each agent, shows for one
      organization when agents exist, mints through 3.2 before the code, answers
      `access_denied` on refusal and creates no family; the code, family and sessions
      carry person and credential — test: `organization-delegation.test.ts` and
      `oauth.test.ts`: choice rendered, agent chosen, refusal leaves no family, pre-activation
      unchanged; negative: issue the code before the mint and the refused case redirects
      with a code; watched.
- [x] 3.4 Delegation carries the person: `POST /internal/mcp/delegation` takes
      `credentialId`, checks unrevoked, family match, bound, member, issues
      `pinnedPersonId` with scopes narrowed to `read`/`write`; `POST /internal/mcp/authority`
      answers revoked; A13 step 4 admits the delegation; mcp-01 ends the family on revoked
      — test: `organization-delegation.boot.test.ts` end to end: a claim as the agent
      accepted, another person `credential_not_for_person`, revoke then `401` and refresh
      refused, `GET /api/organization/members` `403 insufficient_scope`; negative: skip the
      revocation check at delegation issue and the revoked family's next call succeeds;
      watched.
- [ ] 3.5 Dev proof (not code): Dany signs in at the dev consent page with Google, chooses
      `claire`, a tool call claims a step as `claire`, the credential is revoked on the
      people page and the next tool call is refused; recorded in verify.md.

Slice 3 as built (2026-10-22, PR into `plan/wbs-machine-credentials`, base `412c62038`):

- 3.1 is `20261022130000_mcp_family_person`. Beyond the two columns it adds
  `consent_ended_reported_at` on the family and the table `mcp_consent_pending`, both for the
  end report below. The `down.sql` preflight refuses while a consent family's end is
  unacknowledged or a consent is pending (not "while any family names a person": a reported,
  dead family is purged, so a rollback is possible once every end reached be-01). The CHECKs
  spell "set" as `coalesce(length(x), 0) > 0`: migration lint reads any `NOT NULL` inside an
  `ADD COLUMN` as a required column.
- 3.2: `person_not_bound` carries `personId` (the shared refusal code's detail). mcp-01, not
  be-01, mints the credential id and the family id, so it can record the pending consent first.
  A malformed id or a client label that is not a host is `400 invalid_body`. The port is
  `ConsentCredentials` (`ports/machine-credentials.ts`), SQLite only
  (`consent-credential.ts`).
- 3.3: the agent buttons post an index into the offered agents, never ids. Choosing yourself
  keeps posting `organizationId` as before.
- 3.4: the delegation carries `credential_id` and `person_id`; the verifier rereads the
  credential at every use (A13 step 4), and a consent principal's `authentication` is a new
  kind `consent` (pin, credential rules and A23 cap read it). A delegation refusal is
  `403 credential_revoked`, read by mcp-01 as an ended family. The authority read answers
  `denied` for a revoked credential, and mcp-01 then revokes a consent family at once (a
  human's own family is still kept on denial, as before) and refuses every use and refresh.
- Added beyond 3.1–3.4 (brief deliverables 2 and 3): the mcp-01 → be-01 end report,
  `POST /internal/mcp/credentials/ended`, swept once a minute from mcp-01's main
  (`McpOAuthServer.reportEndedConsents`), durable until acknowledged; it covers the epoch CLI
  (a retired family is an ended family) and codes never exchanged. Decision: a callback with a
  durable outbox, not an on-read reconciliation (design A20, _End_).
- A second consent for the same agent mints a second credential (one family each).
- 3.5 (the dev proof) is not done: nothing ran on dev.

See `verify.md`, "Slice 3 record".

## 4. Retirement of the operator links (A18, A21)

- [x] 4.1 The verification path refuses every groups-less token of the configured issuer
      `401 unknown_identity` with no credential lookup and no link read;
      `readExistingOidcIdentity` and the pinned-row admission are deleted — test:
      `fleet-credential.controller.db.test.ts` rewritten: a pinned `external_identity` row
      admits nothing, the owner's row stays byte for byte, a browser token keeps its groups;
      negative: restore the link read and the pinned-row case is admitted; watched.
- [x] 4.2 Delete `link-credential-cli.ts`, `credential-link.ts` and their tests; rewrite
      `docs/auth-integration.md` "Fleet credentials" and `docs/runbook-prod-deploy.md`
      "Fleet credential links" to the settings page and the swap window of A18; add the
      `wbs_mk_<id>.` form to the `plaintext-secrets` hook — test: the hook's test with a
      staged `wbs_mk_<id>.<secret>` literal exits 1; Burokrat `check-indexes` clean; no production
      reader of `external_identity.person_id` remains (grep in the test).
- [ ] 4.3 Operator (not code): before the swap, an admin issues one API-key credential per
      fleet agent person on dev through the panel (slice 2) and each fleet harness holds
      it; laptop Claude Code authorizes its agent at the consent page (slice 3); after the
      swap, confirm every fleet writes and record the applied state in puni-plan without
      secrets. The Auth0 machine-to-machine applications are deleted in the dashboard.

Slice 4 as built (2026-10-25, PR into `main`, held until 4.3's pre-swap step):

- 4.1: `authenticateOrRefuse` answers `unknown_identity` for a groups-less token of the
  configured issuer before any read; `organizationCredentialEvidence` answers no evidence for
  one. `readExistingOidcIdentity` itself stays: browser refresh and `sessionUser` read an
  existing pair through it (never minting); only its use as a machine admission is deleted,
  with `scopesOfRoles` and `membershipRolesOf`, which only that admission read.
- 4.1, the pin: `credentialPinOf` answers null for an upstream pair, `CredentialPin` is
  `{ personId }` only, and `DirectoryStore.credentialPinOf`, the memory pins
  (`pinCredential`) and the two conformance cases `directory.credentialPinOf:unlinked` and
  `directory.removePerson:pinned-credential` are removed.
- 4.2, the usage: `pinnedCredentials` leaves the usage rows, the wire and fe-01; the remove
  confirmation names `machineCredentials` ("N machine credentials of X are revoked"). A
  person's inert pinned rows no longer refuse an unconfirmed removal and are deleted with the
  person (`external_identity.person_id` has no `ON DELETE`): that delete is the column's only
  remaining production use, and the grep test allows exactly it.
- 4.2, the hook: the `wbs_mk_` pattern landed in slice 1; this slice adds the staged-file
  exit-code test. The swarm rehearsal issues its fleets' API keys through the admin route and
  its last step revokes one, instead of the CLI.
- Not changed: `20261019130100_add_external_identity_person/down.sql` still names the retired
  CLI in its refusal (a frozen migration); the runbook says to delete the pinned rows instead.

## 5. The OIDC source and trusted issuers

- [x] 5.1 Red: trusted issuer routes (admin only) (`/api/organization/trusted-issuers` list, create,
      `DELETE :id`) with discovery at registration (A16): `issuer_unreachable`,
      `issuer_mismatch`, `issuer_reserved`, `issuer_not_oidc`, `sso_connection_unproven`,
      `issuer_taken`, `in_use` on delete, audit rows — test:
      `trusted-issuer.controller.db.test.ts` against a local discovery stub for each;
      negative: skip the issuer-equality check and the disagreeing document registers;
      watched.
- [x] 5.2 Verification path step 3 (A13): per-issuer cached JWKS verifier keyed by URL,
      audience from the credential or the issuer's default, pair lookup within the trusted
      issuer, `invalid_token` on a stranger issuer or an unfetchable key set, no fallback —
      test: `oidc-credential.controller.db.test.ts` with a local signing issuer: admitted,
      wrong audience refused, unknown subject `unknown_identity`, stranger issuer
      `invalid_token` with zero fetches, JWKS 503 refused; negative: let a stranger `iss`
      reach the configured verifier and the zero-fetch case fetches; watched. Property:
      two organizations trusting one URL never admit each other's subjects.
- [x] 5.2a Recorded by the slice 1 review: no constraint ties
      `machine_credential.organization_id` to its `organization_trusted_issuer`'s
      organization. 5.2's verifier selects the trusted issuer within the credential's
      organization, or 5.3 adds a composite foreign key. Either way a test refuses a
      credential pointing at another organization's trusted issuer.
- [x] 5.3 Create for `source: 'oidc'` (`trustedIssuerId`, `subject`, `audience`,
      `unknown_trusted_issuer`, `subject_taken`); `rotation_at_issuer` — test: the admin
      controller test cases; negative: drop the organization predicate from the trusted
      issuer read and B's issuer serves A; watched.
- [ ] 5.4 Dev proof (not code): a GitHub Actions workflow of a puni repository obtains an
      OIDC token for audience `wbs`, is admitted on dev as its credential, and a claim as the
      pinned person is accepted; recorded in verify.md with the subject redacted.

Slice 5 as built (2026-10-22, PR into `plan/wbs-machine-credentials`, stacked on slice 2):

- No migration: `20261022100000_add_machine_credential` already holds
  `organization_trusted_issuer`, and slice 2's audit rebuild admits both acts.
- 5.2a takes the verifier route: `findByPair` joins the trusted issuer on its id, the
  credential's own organization and the credential's issuer URL, so a row naming another
  organization's trusted issuer reads as none (`unknown_identity`). No composite foreign key.
- Order of the verification path: the unverified `iss` routes (configured issuer → today's
  path; no trusted issuer of that URL → `invalid_token`, no fetch); the credential is read
  by the unverified pair only to choose the key set and the audience; then the token is
  verified, and only a verified token reaches the admission decision. With no credential
  the URL's first key set verifies the token, so a forged token for an unknown subject is
  `invalid_token` and a genuine one `unknown_identity`.
- An OIDC principal carries `authentication: { kind: 'machine' }` like an API key, not
  `upstream` as A10 drafted, so A23's role cap and the machine credential rule apply to it.
- Removing a trusted issuer whose credentials are all revoked deletes those revoked rows
  with it (their audit rows stay), as a person's removal does in slice 2: an `oidc` row must
  name a trusted issuer and `trusted_issuer_id` has no `ON DELETE`.
- A connection of another organization (or none) as the gate is `404
unknown_sso_connection`, a code the spec did not name.
- `OidcRouteOptions.issuer` (from the configured verifier's discovery) is the configured
  Issuer Identifier both checks read; `AUTH_ISSUER_DISCOVERY_URL` as written is never
  compared.
- 5.4 (the GitHub Actions dev proof) is not done: nothing ran on dev.

See `verify.md`, "Slice 5 record".

Slice 5 review (Fable, 2026-10-22: merge after fixes) and A25, built on the same branch:

- [x] 5.5 A25: required `audience` on trusted issuers (`audience` replaces `defaultAudience`
      on the wire), `(issuer, audience)` unique (`audience_taken`), subjects unique per
      registration, selection by `(iss, aud)` then `(registration, sub)`; migration
      `20261022120000_scope_trusted_issuer_audience` with `down.sql` refusing while two
      organizations bind one subject — tests: `trusted-issuer-audience-migration.db.test.ts`,
      the two-organizations and two-audiences cases in `oidc-credential.controller.db.test.ts`.
- [x] 5.6 Negatives for the algorithm allow-list, the non-empty `sub`, `exp` required and
      the one-hour lifetime, the `jwks_uri` length, a non-200 key set, both fetch timeouts,
      both body caps (64 KB, 256 KB), the per-organization cap of eight, the 30 s failure
      cooldown and the public-host filter at both URL checks — `trusted-issuer.test.ts` and
      the controller tests.

## 6. The settings panel and the people page

- [x] 6.1 `machine-credentials-panel.tsx` composed by `organization-page.tsx` on
      `@ui/core-01`/`@ui/saas-01`: loading, empty, rows, transport failure, modeled refusal,
      secret-shown-once with dismiss, copy warning and focusable field, exact-id revoke,
      serialized writes, no rotate control on `oidc`/`mcp_consent`, a member's
      rows narrowed to their own agents, withdrawn with the page —
      test: the panel's rendering tests mirrored from `provisioning-tokens-panel`; negative:
      keep the secret in state across refresh and the "secret shown once, then gone" case
      finds it rendered; watched.
- [x] 6.2 Trusted issuers section inside the same panel, admins only: register, list, remove with
      `in_use` shown — test: rendering tests; eye review per the UI acceptance rule.
- [x] 6.3 People page: an agent row's credential count, the list with revoke under exact-id
      confirmation, a member offered only their own agents' lists — test: the people page
      rendering tests with an agent holding one consent credential; negative: offer the list
      on a stranger's agent and the member case observes the request; watched.
- [x] 6.4 A viewer's page renders no panel and sends no credentials request — test: the
      organization page test with a viewer role; negative: render the panel on the list
      refusal and the case observes the request; watched.

Slice 6 as built (2026-10-22, PR into `plan/wbs-machine-credentials`, stacked on slice 5):

- fe-01 learns the caller's role from `GET /api/organization/active` (`organization-role.ts`,
  `useOrganizationRole`), read once per page through the captured runtime scope; a reply
  naming another organization gives the page up as `no_organization`. A legacy runtime (no
  organization) sends no role read and draws no credentials surface. The role only decides
  what is drawn and asked; be-01 decides every read and write.
- 6.1: the panel lists credentials as rows (no table primitive exists in `@ui/saas-01`; seven
  columns do not fit the page's `max-w-3xl` column), creates in a `Modal`, and shows the key
  above the list with copy (optional, said in place when the clipboard is absent) and
  dismiss. Rotate is drawn on live `api_key` rows only, disabled with its window end while
  one is open; `oidc` and `mcp_consent` rows state why they rotate elsewhere. "Issued by"
  shows "You" or the account id: no account names are readable by members.
- 6.1: a member is offered `api_key` only. The OIDC source needs a trusted issuer, whose list
  is an admin read.
- 6.2: the trusted issuers section reads its own list and the SSO connections (a
  super-admin read; refused, the optional connection picker is left out with a sentence).
  The audience field is required and prefilled with `wbs:org:<organizationId>` (A25);
  `audience_taken` and `trusted_issuer_limit` have their own sentences.
- 6.3: the people page gets `credentialsOf` beside `loadOf`; each reachable agent row has a
  "Show credentials" toggle that mounts the same panel narrowed by `personId`. No count is
  drawn before the toggle opens: a count for every agent row would be a credentials request
  per row, or one page-wide list read, which the "no credentials request" scenario forbids
  for rows the member does not reach. The delta spec's people page requirement was amended to match
  (slice 6 review, S2-2).
- 6.4: a viewer's page mounts no panel and sends neither a credentials nor a trusted-issuer
  request.

See `verify.md`, "Slice 6 record".
