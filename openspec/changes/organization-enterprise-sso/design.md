## Context

`organization-ownership-and-access` gives WBS organizations, memberships, invitations, join requests and DNS-verified domains (`specs/organization-domains`). It binds the browser's selected organization to the verified access credential with shared revocation, issues short-lived direct contexts and delegations, and writes `organization_audit` rows for super-admin recovery. Identity is `(issuer, subject)`, and an email never merges accounts. `social-sign-in` (PR #326) passes Auth0's `connection` on `/authorize`, lets one user hold several verified pairs, and turns an email collision into `account_exists` with a link path. This change adds enterprise SSO, SCIM provisioning and session policy on top of those. Its decisions are A22 and A23, and veto lines W4–W6 bind it.

## Verified facts

All pages were fetched on 2026-10-11 from Auth0's own documentation, as the `.md` source the docs site serves (`curl -sL <url>.md`). Each quote is verbatim.

- **Enterprise connections and entitlement.** <https://auth0.com/docs/authenticate/enterprise-connections>: "Your Auth0 plan or custom agreement affects the availability of this feature." The strategies it lists include "`oidc` (OpenID Connect)", "`samlp` (SAML)", "`waad` (Microsoft Azure AD)", "`adfs` (ADFS)", "`google-apps` (Google Workspace)" and "`office365`". On billing: "An Enterprise connection is considered active if (during the current month) it has both" been enabled for an application and seen user activity.
- **Pricing.** <https://auth0.com/pricing> is rendered by script. A summarizing fetch on the same day reported B2B Essentials "3 SSO Enterprise Connections" and Professional "5 included", with additional connections at "$100/month … per additional connection (max 30 total)", and B2C Essentials and Professional "Not available". These figures are summarised, unverified — Dany confirms the plan (Dany-only item 1).
- **The `connection` parameter.** <https://auth0.com/docs/api/authentication/authorization-code-flow/authorize-application>: `connection` is "The name of the connection configured for your application." `organization` is "ID of the organization to use when authenticating a user". This change does not use it.
- **`sub` / `user_id` format.** <https://auth0.com/docs/manage-users/user-accounts/identify-users>: the `user_id` is "such as `{identity provider id}|{unique id in the provider}` or `facebook|1234567890`". <https://auth0.com/docs/manage-users/user-accounts/user-profiles/user-profile-structure> shows enterprise examples **without** the connection name: `"user_id": "adfs|john@fabrikam.com"` with `"connection": "auth10.com"`, and `"user_id": "office365|10030000838D23AF@MicrosoftOnline.com"` with `"connection": "foo-onmicrosoft"`. The same ADFS example carries `"email_verified": false`.
- **SAML user id source.** <https://auth0.com/docs/authenticate/protocols/saml/saml-sso-integrations/configure-auth0-saml-service-provider>: if no User ID Attribute is set, "the `user_id` will be retrieved from" `nameidentifier`, then `upn`, then `name`.
- **Home realm discovery.** <https://auth0.com/docs/authenticate/login/auth0-universal-login/identifier-first>: "If the identifier matches the enterprise connection Identity Provider Home Realm domain, the application will redirect the user to the enterprise connection's login page." It works "only with the **New Universal Login Experience** and **Identifier + Password** flows". This change does not depend on it, because WBS routes by `connection=` itself.
- **Auth0 inbound SCIM.** <https://auth0.com/docs/authenticate/protocols/scim/configure-inbound-scim>: "Your Auth0 plan or custom agreement must include Enterprise Connections to use this feature." PATCH with active false "results in the user being blocked in Auth0". "When Auth0 receives a SCIM message to deactivate and block a user, it terminates all Auth0 sessions for the user, revokes refresh tokens, and (if configured) triggers OpenID Connect backchannel logout". "The **Generate New Token** option generates up to two active tokens for this SCIM endpoint, allowing the token used by the SCIM client to be updated without downtime." Changes reach other systems through event streams ("After your event stream and desired destination is configured").
- **SCIM protocol.** RFC 7644 (<https://datatracker.ietf.org/doc/html/rfc7644>): error responses use `urn:ietf:params:scim:api:messages:2.0:Error` with `status` and `scimType`, and `409` with `scimType` `uniqueness` is the duplicate case. After a DELETE, a GET of that resource returns 404. "Bearer tokens MAY be used when combined with TLS and a token framework such as OAuth 2.0."

### Not verified, and what the design does about it

- **Whether an enterprise `sub` carries the connection name.** Auth0's product docs show `{provider}|{id}`, and their enterprise examples have no connection segment. Auth0 community and support answers (search on 2026-10-11) describe SAML ids as `samlp|<CONNECTION_NAME>|<id>`, but no product doc page states it, and nothing at all was found for `oidc`. A strategy-only prefix such as `samlp|` cannot tell two customers' connections apart, so it cannot enforce anything. **The design therefore never derives enforcement from the strategy alone** (see "Subject prefix and proof").
- **Which SCIM operations Okta and Entra require.** For example, whether Okta needs `PUT`, `/ServiceProviderConfig` or `/Schemas`. This was not checked against either vendor. Task 4.6 exercises the first customer's IdP against the subset before that connection is enforced.
- **OIDC `auth_time` from Auth0.** Not checked. Session policy uses a verified `auth_time` when it is present, and otherwise the narrow callback-time fallback in "Session policy".

## Options and reversal cost

| Choice              | Adopted                                                                                                                                                                                     | Rejected                                                                                                                                                                                                                                                                                        | Reversal cost                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSO model (A22, W4) | A WBS `organization_sso_connection` record routed by `connection=`. WBS membership remains the only authority.                                                                              | Auth0 Organizations with `organization=`, an `org_id` claim and Auth0-side membership. This would add a second membership source to reconcile, Management API credentials WBS does not hold, and a plan-gated organization count.                                                               | Moderate. Each record maps one-to-one onto an Auth0 Organization. The enforcement check would move from the subject prefix to `org_id`. No customer-visible URL changes. |
| SCIM host (A23, W5) | WBS serves `/scim/v2/Users`, so a deprovision removes membership and ends access in the same SQLite transaction, and POST can create a pending membership before the person has a WBS user. | Auth0 inbound SCIM plus an event-stream webhook. Auth0 would block the Auth0 user and end its Auth0 sessions, but WBS membership and already-issued WBS credentials would last until an asynchronous delivery is received, verified and applied. WBS would also need a public webhook receiver. | **High.** Each customer configures our SCIM URL and token in their IdP, so moving them is a customer-side change. Hence the ADR.                                         |
| Enforcement key     | The subject prefix `{strategy}\|{connection name}\|`, which must be proven by an observed login before enforcement may be switched on.                                                      | (a) The strategy prefix alone, which cannot separate customers (see "Not verified"). (b) A custom claim from an Auth0 post-login Action naming the connection, which would be a tenant change and a non-goal here; it is the fallback if the proof login fails.                                 | Low. The check lives in one function.                                                                                                                                    |

## Decisions

### Enterprise connection record

New table `organization_sso_connection`:

- `id`
- `organization_id`
- `domain_claim_id`: unique, references `organization_domain_claim`
- `auth0_connection`: the name, `^[A-Za-z0-9-]{1,128}$`
- `strategy`: `samlp` | `oidc`
- `login_slug`: unique, `^[a-z0-9-]{3,63}$`
- `enforced`: 0 | 1
- `proven_at`, `proven_by`: nullable, set together
- audit columns

A partial unique index on `auth0_connection WHERE proven_at IS NOT NULL` means one Auth0 connection backs at most one proven record. An unproven duplicate can exist, so squatting a name blocks no one. Only a current super-admin of an activated organization creates, updates or deletes a record. Creation requires the claim to be `verified` (not `pending` or `suspended`) and owned by the active organization. `enforced` may become 1 only on a proven record. Deleting a record is refused while the organization has a live provisioning token (`409 provisioning_active`). Releasing a domain that has a connection is refused (`409 sso_connection_exists`).

### Subject prefix and proof

The record's subject prefix is `{strategy}|{auth0_connection}|`. A record becomes **proven** when a current super-admin of its organization completes the explicit identity link from `social-sign-in`, routed with `organization=<slug>`. The link must return a pair whose subject starts with that prefix and whose email domain is the record's domain. Proving and adding the pair to that super-admin's account commit in one transaction, and the first proof wins the partial unique index. If a routed link returns a pair without the prefix, WBS records `last_prefix_mismatch_at`, answers `?auth_link=sso_prefix_mismatch`, and leaves the record unproven. That outcome is the evidence that the fallback (a connection claim from an Auth0 Action) is needed. A fixture `sub` of `samlp|acme-saml|alice@acme.test` proves the check, and `samlp|other|alice@acme.test`, `samlp|acme-saml-2|x` and `google-oauth2|1` refuse it. The match is on the whole prefix including its trailing `|`, so `acme-saml-2` does not match `acme-saml`.

### Login routing

- `GET /api/auth/login?organization=<slug>` looks up the record and sends `connection=<auth0_connection>`. If the organization has a session policy, it also sends `prompt=login`, plus `max_age` when `reauthenticate_after_seconds` is set.
- `GET /api/auth/login?email=<address>` canonicalizes the domain with the claim rules. A `verified` claim with a record routes the same way. Any other domain falls through to the ordinary login without `connection`.
- The query takes exactly one of `organization`, `email` and `method` (from `social-sign-in`). Two of them, a malformed email or a malformed slug answer `400 invalid_query` before any transaction is saved. An unknown slug answers `404 sso_connection_not_found`.
- A suspended claim stops email routing. Slug routing and enforcement continue, so suspension never weakens enforcement.
- The routed connection is a hint only. Authority comes from the subject that comes back.
- `GET /api/auth/login?reauthenticate=<organizationId>` is the fourth alternative and the login path a `reauthentication_required` refusal names. It always sends `prompt=login`, sends `max_age` when the organization's policy sets `reauthenticate_after_seconds`, and sends the organization's connection only when SSO is enforced there. An unknown organization gets the bare `prompt=login`, so the path reveals nothing. (Implementation, 2026-10-12.)

### Enforced SSO (W6)

`OrganizationAccess` gains one rule: in an organization with an enforced, proven record, the upstream pair that authenticated **this** credential must start with that record's prefix. A first-party password credential has no pair, and a user's other linked pairs do not count. The rule runs at:

- browser selection (`POST /api/organization/active`)
- every resolution of an existing browser binding, which includes gateway browser access
- direct context issue (`POST /api/auth/context`)
- delegation verification

Refusal is `403 sso_required` with `{ organizationId, login: "/api/auth/login?organization=<slug>", link: true }`. It is typed in contracts. `link: true` means the person's next step is "link your company sign-in, then sign in via SSO", and fe-01 renders that wording as a state, beside a direct "sign in with your company" action. `GET /api/organization/memberships` marks enforced organizations the credential cannot enter, so the switcher shows them as locked instead of failing on click. Other organizations, onboarding and logout are unaffected. Enabling enforcement requires that the acting super-admin's current credential already passes the rule (`409 enforcement_would_lock_out_actor`). Because resolution runs on every request, enabling it takes effect on the next request without a revocation sweep. Gateway sockets close within the existing lease bound.

### Pending membership and activation

`organization_scim_user` has these columns:

- `id`: the SCIM resource id, random
- `organization_id`
- `user_name`: canonical lowercase email, unique per organization
- `external_id`
- `active`: 0 | 1
- `user_id`, `issuer`, `subject`: nullable together; bound at activation
- audit columns

A record that is active and unbound is a **pending membership**.

Activation runs after identity resolution in the login callback and in the link callback. It applies when the authenticating pair starts with the prefix of a proven record in that organization and the identity's email equals `user_name` on that record's domain. It creates a `member` membership, or binds to an existing one without changing its role, binds the pair and writes an audit row in one transaction.

Email trust from enterprise identities (review fix 2) is a separate rule. An identity whose subject starts with an enterprise strategy has its `email_verified` honoured only when its prefix belongs to a proven connection **and** the canonicalized email domain equals that connection's verified domain. Canonicalization is the claim rules': lowercase local part and lowercase ASCII IDNA domain. Any other email from such an identity is treated as unverified. WBS never creates or updates a user holding that address as verified, and identity resolution never answers `account_exists` for it. So connection B's IdP cannot claim `@a.test` addresses, or probe whether they exist. This tightens `social-sign-in`'s resolution for enterprise strategies only. Activation compares the canonicalized email with the canonicalized `user_name`.

The email here is **connection-attested**: the sub prefix proves the organization's own IdP issued it, on a domain the organization verified. So `email_verified` is not required for this one decision; the ADFS example above shows it can be false. It does not verify the email for onboarding or anything else. An email held by another WBS account still yields `account_exists` from `social-sign-in`, and the person links instead; the link callback activates in the same way. A pending membership grants nothing.

### SCIM service

- **Routes.** `/scim/v2/Users`: GET with optional `filter=userName eq "<v>"` or `externalId eq "<v>"`, and POST. `/scim/v2/Users/:id`: GET, PATCH and DELETE. Bodies are `application/scim+json` and errors use RFC 7644's error schema. PUT and any other filter answer `501`. Task 4.6 decides whether PUT is needed after testing against the customer IdP.
- **Authentication.** `Authorization: Bearer wbs_scim_<43 base64url chars>`, a 256-bit random value. Only its SHA-256 is stored in `organization_scim_token` (`id`, `organization_id`, `digest` unique, `created_at`, `created_by`, `expires_at` nullable, `revoked_at` nullable). A missing, malformed, unknown, expired or revoked token gets an identical `401` body that names no organization.
- **Token lifecycle.** At most two live tokens per organization, matching Auth0's rotation model. A super-admin issues one (`409 token_limit` when two are live), rotates (a new token is issued and the old one's `expires_at` becomes now plus 24 hours) and revokes (immediate). The secret is shown once in the issue response and never again. Issuing requires a proven connection.
- **Admission.** After authentication, each token is limited to 300 requests per rolling 60 seconds; beyond that the answer is `429` with `Retry-After`. Counters are per process, so two colours mid-swap admit at most twice the limit.
- **POST** requires `userName` on a domain that has a record in the token's organization (`400 invalid_value` otherwise). A duplicate answers `409 uniqueness`. RFC 7643 §8.7.1 declares `active` `"required" : false`, and §4.1.1 says its "definitive meaning … is determined by the service provider". So WBS treats an absent `active` as true. An inactive POST creates a record with no pending membership.
- **PATCH** supports `replace` of `active`, `externalId` and `userName`. `userName` may change only while the record is unbound. Anything else answers `400 invalid_path`.
- **Deprovisioning.** PATCH `active=false` keeps the record. DELETE removes it, and a later GET answers 404. On a bound record, either one deletes that user's membership in this organization only, revokes that user's browser bindings for this organization, and writes the audit row, all in one transaction. Removing the membership is sufficient because every resolution, delegation verification and gateway lease rechecks it. `active=true` on an inactive bound record creates a pending membership again, which re-activates at the next SSO login. It never restores the old role silently. Deleting the membership has exactly the side effects of a super-admin removing that member: the same store operation, the same binding revocation, gateway lease and MCP refusal paths, and the same final-owner guard. SCIM adds only its own audit row.
- **Last super-admin.** Deprovisioning the organization's last super-admin is refused with `409` (`scimType: mutability`, detail `last_super_admin`) and changes nothing. The detail names the ownerless-organization recovery path in `organization-ownership-and-access/design.md` ("Ownership and roles"). SCIM never creates an ownerless organization.
- **Isolation.** An id belonging to another organization answers 404, the same as an absent one.

### Session policy

`organization_session_policy` (`organization_id` primary key, `max_session_seconds`, `reauthenticate_after_seconds`, audit columns). Each value is null or between 300 and 2,592,000. When both are set, `reauthenticate_after_seconds ≤ max_session_seconds`. A missing row means no policy; this is the modeled optional feature, and it fails closed whenever a row exists.

Two times are needed per credential:

- **`opened_at`**: when this sign-in began.
- **`reauthenticated_at`**: when the person last authenticated interactively. It is never set merely because WBS sent `prompt=login`, since Auth0 need not force the upstream IdP to prompt, and a link callback through a social connection also returns. A login callback sets it:
  1. from the verified ID token's `auth_time`, in seconds and converted to ms, when the transaction sent `max_age=<reauthenticate_after_seconds>` and the claim is present;
  2. failing that, to the callback time, only when the transaction sent `prompt=login` and the returned pair's `{strategy}|{connection}|` equals the authenticating pair of the credential it replaces (or it opens a new lifecycle with no predecessor).

  A link callback never changes it. Whether Auth0 returns `auth_time` is unverified (see "Not verified"). The stated limitation is that `reauthenticated_at` proves an interactive authentication at Auth0, not necessarily a fresh credential entry at the customer's IdP.

For OIDC credentials both times are new nullable columns on `browser_auth_lifecycle`. For native credentials both are the verified `iat`, because typing a password is interactive.

**Clock and units.** Lifecycle times are integer milliseconds since the epoch. The JWT `iat` and `auth_time` are seconds and are multiplied by 1000. Policy values are seconds. The evaluating service uses its injected `now()` ([ADR 0012](../../../docs/adr/0012-a-write-carries-its-actor-as-an-argument.md): the clock is injected per service, never read in a repository). It refuses when `now() - opened_at > max_session_seconds * 1000`, or when `now() - reauthenticated_at > reauthenticate_after_seconds * 1000`; equality is admitted. A fake-clock test pins both edges (5.2). The policy row is read in the same query that resolution already makes for the lifecycle and revocation state, which is one joined read per resolution, so the policy adds no extra query.

The rule runs at the same points as enforcement and refuses with `403 reauthentication_required` and `{ reason: "max_session" | "reauthenticate_after", login }`, where `login` sends `prompt=login` through the organization's route. A null time in an organization with a policy refuses; a lifecycle opened before the migration therefore reauthenticates once. Refresh never resets `opened_at`.

A delegation in an organization with a policy is refused (`reauthentication_required`) until the MCP cutover adds an `authenticated_at` claim from the grant's consent. A direct context carries no authentication facts at all, so in an organization that enforces SSO or has a policy it is refused on use; at issue the rules read the native session's own `iat`. (Implementation, 2026-10-12.) This is deliberately fail-closed at be-01. mcp-01 does not yet evaluate current membership, SSO or session policy on refresh; `mcp-refresh-policy` specifies that prerequisite and its initial inert authority refusal. Organization-aware issuance and cutover remain open in organization-ownership-and-access tasks 6.4–6.6.

### Audit

`organization_audit` keeps its shape. Its `action` and `subject_kind` CHECKs widen through the repository's `compatible-table-rebuild` migration (precedent: `20260824010000_add_oidc_identity`). The old release only writes `restricted_project_recovery`/`project`, so sharing the table with it is safe. The rollback refuses while any new-kind row exists.

New actions:

- `sso_connection_created`, `sso_connection_updated`, `sso_connection_deleted`
- `sso_connection_proven`
- `sso_enforcement_changed`
- `provisioning_token_issued`, `provisioning_token_rotated`, `provisioning_token_revoked`
- `scim_user_provisioned`, `scim_user_updated`, `scim_user_deprovisioned`
- `pending_membership_activated`
- `session_policy_changed`

New subject kinds: `sso_connection`, `provisioning_token`, `scim_user`, `session_policy`.

The table is append-only. The rebuild adds `BEFORE UPDATE` and `BEFORE DELETE` triggers that `RAISE(ABORT)`, and `down.sql` drops them. Task 1.1 proves that no current writer updates or deletes rows. Rows are retained indefinitely: there is no cleanup job, and deleting organizations is out of scope.

`actor_id` is the super-admin's user id, or `scim:<token id>` for SCIM acts. `detail` is JSON that never holds a token, a digest or a full subject; it names the prefix only. Each row is written in its act's transaction, and if it cannot be written the act fails.

## Migration plan

All migrations sort after every stamp on main and in the batch queue at implementation time, and each ships a `down.sql`:

1. Additive `CREATE TABLE`s for the connection, token, SCIM user and session policy tables. Each rollback refuses while any row exists.
2. `ALTER TABLE browser_auth_lifecycle ADD` the two nullable times. Rollback refuses once any row has them set.
3. The audit CHECK rebuild described above.

None of this activates anything. The routes are inert until organization activation, like the rest of the organization surface.

## Risks / Trade-offs

- **Lockout.** If the IdP fails while enforcement is on, the organization cannot get a context. Super-admins cannot switch enforcement off without a context, so recovery is the operator path from `organization-ownership-and-access`. The lockout guard prevents the self-inflicted case only.
- **Connection-attested email** trusts the customer IdP for its own verified domain. A misconfigured IdP could activate a pending membership for the wrong person on that domain. The customer's directory is the authority it chose.
- **Per-process SCIM admission** is approximate across colours. The bound is documented, not hidden.
- **Load-bearing invariant V6: never Auth0 account linking** (`social-sign-in`). If a tenant admin enables Auth0 account linking (an Action or extension), an enterprise sign-in returns the primary identity's `sub`, for example `google-oauth2|…`. Enforcement then fails closed: every linked member of an enforced organization receives `sso_required`. Tenant configuration is Dany-only, and enabling linking requires a new decision.
- **mcp-01 consent UX gap.** mcp-01's consent completes the upstream login through Universal Login without WBS's `organization=`/`email=` routing. A member of an enforced organization must therefore pick the company connection in Auth0's chooser, or be routed there by Auth0's own home realm discovery if Dany enables it. Otherwise the delegation is refused with `sso_required`. Routing consent is left to the MCP cutover.
- **Enterprise strategies outside the record.** Email trust (`isEnterpriseSubject`) and enforcement know only `samlp|` and `oidc|`, the two strategies a connection record may name. If a tenant admin enabled `waad|`, `adfs|`, `google-apps|` or `okta|` connections, those identities would keep social-style email trust (their `email_verified` honoured as for `google-oauth2`) and could never satisfy enforcement. Enabling such a strategy is a tenant change and needs this change extended first.
- **No model-based test (conscious exception).** Activation and deprovisioning, the two writers that race on one SCIM record and membership, each run in one `BEGIN IMMEDIATE` transaction that rereads the record, so SQLite serializes them and no interleaving inside either exists to model; `ScimAdmission` is a deterministic per-process window over the injected clock, pinned by unit tests at both edges. Example-based tests with injected faults cover both.
- **Unverified prefix format.** The proof login turns the unverified prefix format into a per-connection observation instead of an assumption. If no proof can succeed, enforcement stays off and the Action-claim fallback becomes a new decision.

## Open questions

1. **Decided (Fable A29, 2026-10-11):** enforcement trusts `{strategy}|{connection}|` only after a super-admin's routed proof sign-in has returned that prefix, as designed here. The switch to an Auth0 post-login Action adding a connection claim is triggered only when a proof sign-in returns a subject with no connection name (scenario "Proof sign-in without a connection name" in `organization-sso`). Configuring that Action is Dany-only, because it is a tenant change.
2. Does the first customer's IdP need SCIM `PUT` or discovery endpoints? Task 4.6 answers this against Dany's test IdP tenant.

### Browser company-link action (task 3.2)

The shared credential-refusal state owns the server-selected login target. For `sso_required` it validates that target, extracts exactly one valid `organization` slug without competing login hints, and gives the slug to `CompanySignInLink`. It never derives the slug from `organizationId`. The original sign-in anchor retains the whole server URL.

`/api/auth/me` deliberately exposes no credential kind. The form therefore asks whether the current sign-in used an identity provider or a WBS password. Provider mode sends `{organization}`; password mode sends `{organization,password}` after fresh entry. The existing link endpoint verifies the current credential and the choice. An immediate ref blocks duplicate form submissions while awaiting the response and navigation. Mode changes clear the entered password. Shared Auth0 response handling validates the HTTPS target and renders typed refusals, including 429, or transport failure. An unexpected trusted answer reaches the fault boundary.

The link callback remains separate from sign-in. Its existing `auth_link` outcome is displayed and consumed by `OnboardingScreen`, with company-specific copy for prefix mismatch and a taken connection. No client state grants organization access or upgrades the authenticating credential after a link.

### Browser connection setup (task 2.5)

`SsoConnectionsPanel` joins the existing organization page. It reads the typed connection and domain endpoints together and exposes setup only when both reads succeed. It never infers super-admin authority from member rows. Shared credential or membership loss goes to the page's `onAccessLost`; ordinary forbidden makes this panel unavailable. Loading, empty, query failure and no eligible domain are explicit rendered states.

The create form selects a verified domain claim without an existing connection and submits exactly `domainClaimId`, `auth0Connection`, `strategy` and `loginSlug`. A ref admits one pending create. Success and modeled conflicts re-read both lists; an explicit refresh also reads newly verified domains. A write-time forbidden or insufficient scope removes setup controls immediately. No local state invents proof or enforcement.

One selected connection owns one `CompanySignInLink` form, keyed by connection id and given its server `loginSlug`. The existing form reports pending start synchronously so the parent freezes proof target, create and refresh while the one browser link-binding cookie is in use. In the other order, a pending create disables the selected company-link form and refuses its submit event, so create refresh cannot unmount an active proof start. Mode selection, fresh password, validated authorization location and refused starts keep the existing company-link behavior. After returning, refresh reads proof and mismatch timestamps.

The follow-up enforcement control PATCHes only `{ enforced }` to the selected connection id; the login slug is reserved for routing links. Proof state enables the control, but current-credential eligibility belongs to the backend lockout guard. A server-returned row replaces its selected row. Read generations advance on each read, effect cleanup and mutation admission so an earlier same-runtime GET cannot restore stale state after PATCH. Mutation ownership is separate from the read generation so create can perform its own post-success refresh and release pending. Admission refs serialize create, proof, PATCH and refresh, including clicks in the same render before loading appears. An already-open proof form calls the owner's synchronous admission guard before claiming pending and posting a link, because its `disabled` prop can still reflect the prior render. Modeled conflicts re-read both lists without clearing the explanation; lockout offers the selected slug in the existing login route. Forbidden removes panel controls and shared organization loss withdraws the page. The panel also owns one inline configuration editor or explicit removal confirmation. Configuration PATCH carries only name, strategy and slug; it renders the returned row, clears proof and lockout, and explains prefix reset versus slug preservation. DELETE requires the selected confirmation, retains the row until 204, then refreshes both lists. Modeled conflicts reconcile both lists; transport failures retain the action for retry. Edit and removal share the admission refs, read invalidation and lifetime fences above. No SCIM controls or live provider configuration are provided. The session-policy panel is separate.

### Browser provisioning tokens (tasks 6.1–6.3)

A separate panel composes on OrganizationPage, outside company sign-in setup. Its immutable resource client binds all four token shapes. A request generation fences reads and mutation replies; one admission ref owns writes and post-write refresh. Only list metadata survives refresh. Issue and rotation secrets live only in component state, are dismissed explicitly, and clear before refresh or another mutation. Loss and forbidden responses clear panel state before rendering their outcome. Runtime withdrawal cancels replies through the shared client; unmount discards ephemeral state. Rotation reports the server previousExpiresAt. Token IDs are the revoke confirmation boundary; no trimming makes an inexact confirmation valid.

Review refinement: metadata transport and response failures preserve a just-returned issue or rotation secret, since a successful write cannot show it again; the failure still removes mutation controls until refresh. Explicit refresh and authority refusals retain their secret-clearing behavior. A read-only field selects the complete secret when focused, so native keyboard copy needs no clipboard permission in application code. Non-null server expiry identifies a predecessor already in rotation overlap; its row retains revoke and omits rotate, matching the store's existing rule.
