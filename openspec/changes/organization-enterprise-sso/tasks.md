## 0. Preconditions

- [ ] 0.1 Rebase the plan onto `main` after #330 (browser authority wired into production boot) and #326 (`social-sign-in`: `connection` on `/authorize`, several pairs per user, the OIDC-started link) have merged. Red: none. This is a dependency gate; any slice below that starts before both merge is refused at review.

## 1. Tables and stores

- [x] 1.1 Add the additive migrations and their `down.sql`:
  - `organization_sso_connection`, `organization_scim_token`, `organization_scim_user` and `organization_session_policy`;
  - the nullable `opened_at` and `reauthenticated_at` on `browser_auth_lifecycle`;
  - the `organization_audit` CHECK widening as a `compatible-table-rebuild`.

  Each stamp must sort after every stamp on `main` and in the batch queue.

  Red: an up/down round trip on a production-shaped copy; a partial unique proven `auth0_connection`; one connection per claim; a unique token digest; a unique `user_name` per organization; the binding columns set all together or not at all; rollback refused over any row; an old-release `restricted_project_recovery` insert during the swap; the append-only triggers refuse UPDATE and DELETE; a search proves that no current writer updates or deletes `organization_audit` rows.

  Fault: drop the partial unique index and observe the concurrent-proof test fail. Separately, drop the audit rebuild's `CHECK (violations = 0)` guard and observe migration lint fail. Restore both and add `Proof:` comments.

- [x] 1.2 Add store ports `EnterpriseConnections`, `ProvisioningTokens`, `ScimUsers`, `SessionPolicies` and the widened `OrganizationAudit`. Every write takes the audit row in the same unit of work.

  Red: audit insertion failure rolls back each write; missing tables, unreadable state and malformed rows throw.

  Fault: write the audit row after commit, and observe the "audit cannot be written" store test fail. Restore and add `Proof:`.

## 2. Connection administration and routing

- [x] 2.1 Add the connection routes (create, update, delete, list), restricted to super-admins and refused before activation, with refusal codes `domain_not_verified`, `sso_connection_exists`, `provisioning_active` and `sso_connection_unproven`. Domain release is refused while a connection exists.

  Red: the mounted scenarios of `organization-sso` "records one enterprise connection", including the suspended claim and the foreign claim answering 404.

  Fault: drop the claim-status recheck inside the transaction, and observe the suspended-claim test fail. Restore and add `Proof:`.

- [x] 2.2 `GET /api/auth/login` takes exactly one of `organization`, `email` and `method`. A slug or a verified-domain email routes with `connection=`, and a session policy adds `prompt=login` and `max_age`.

  Red: slug, email, unrouted, suspended, ambiguous, malformed and unknown cases; no transaction is saved on refusal.

  Fault: route by a suspended claim and observe the suspended-email test fail. Then accept two hints and observe the ambiguity test fail. Restore and add `Proof:`.

- [x] 2.3 Prove a connection through the routed explicit link, recording the mismatch time and `sso_prefix_mismatch`.

  Red: the fixture subject `samlp|acme-saml|alice@acme.test` proves the connection. `samlp|other|…`, `samlp|acme-saml-2|…`, `samlp|alice@acme.test` and `google-oauth2|1` do not. A non-super-admin cannot prove. Two organizations proving the same name end with one winner and `sso_connection_taken`.

  Fault: compare the prefix without its trailing `|`, and observe the `acme-saml-2` test fail. Restore and add `Proof:`.

- [x] 2.4 Enterprise email trust: honour `email_verified` only for a proven prefix on the connection's canonical domain.

  Red: the `organization-sso` email-trust scenarios. A foreign-domain email gives no `account_exists` and holds no verified address; an unproven connection's email is unverified; the canonical comparison activates.

  Fault: honour `email_verified` for every enterprise identity, and observe the foreign-domain test fail. Restore and add `Proof:`.

- [x] 2.5 Add the organization page's Company sign-in setup panel: list server connection state; create on a verified unused domain; refresh after create, conflicts and explicit request; start one routed proof form with its server login slug. Super-admin refusal hides setup controls; shared authority loss replaces the whole page. Editing, deletion, SCIM and enforcement controls are deferred to later slices; session-policy has its own slice.

  Red: missing page composition and empty component scaffold; verified and unused domain filtering separately; exact create fields; held duplicate create; conflicts and refresh; forbidden/failure controls; shared access loss; server proof/enforcement/mismatch labels; distinct row slugs; one held proof; 1280/375px drawing and Tab traversal.

  Fault: remove each domain predicate, eligibility or pending admission, use a wrong claim id, skip refresh, ignore forbidden/create authority loss, replace the row slug with its connection id, or fail to freeze the pending proof. Watch the production component negative fail, restore and record adjacent `Proof:` comments and `verify.md` evidence.

- [x] 2.7 Add Company sign-in enforcement controls for proven/enforced rows using typed PATCH `{enforced}`. Serialize setup, proof, refresh and enforcement; render server state, modeled refusals and the lockout login link. Fence stale reads after mutation and effect cleanup.

  Red: mounted selected-id/body/header, unproven gating, pending, refusal and StrictMode delayed-GET cases, plus same-render Enable→proof and Refresh→proof submissions. Browser 1280/375px controls and keyboard traversal.

  Fault: replace selected id, boolean or scoped client; bypass proof or pending guard, including the open child form's synchronous owner check; remove read generation, cleanup or mutation admission; retain controls on forbidden or publish stale rows. Watch each mounted negative fail and record `Proof:` beside the check and in `verify.md`.

## 3. Enforcement

- [x] 3.1 Add one `EnforcedSso` rule inside `OrganizationAccess`, applied at selection, binding resolution, direct context and delegation verification. The rule uses the pair that authenticated this credential. The refusal is typed `403 sso_required` in contracts. Membership listing marks such organizations.

  Red: the `organization-sso` enforcement scenarios. They are SSO admitted; `google-oauth2|7` refused in A but admitted in B; a linked SSO pair not lending authority; a password refused; enforcement applying at once to an existing binding and a gateway lease; and an MCP delegation with `github|9` refused.

  Fault: replace the prefix check with a membership-only check and observe the mounted selection test fail. Then check any linked pair of the user instead of the authenticating pair, and observe the linked-pair test fail. Restore and add `Proof:`.

- [x] 3.2 Add the lockout guard `enforcement_would_lock_out_actor`, and render `sso_required` in fe-01 as a state with SSO sign-in and link actions, plus a locked entry in the switcher.

  Red: the guard refusal. fe-01 component tests cover the refusal state, the locked switcher entry and a failed membership read. The company-link form explicitly selects provider or WBS password, posts the refusal URL's slug with a password only for password sign-in, prevents duplicate starts, and renders callback company outcomes without granting SSO authority.

  Fault (company link): remove pending admission, current-sign-in selection, fresh-password or URL-query checks; use organization id instead of slug; leak a password into provider mode; retain the password across mode changes; accept an insecure authorization target. Observe each production component negative fail before restoring it.

  Fault: drop the guard and observe the guard test fail. Restore and add `Proof:`.

## 4. SCIM

- [x] 4.1 Add provisioning-token issue, rotate, revoke and list for super-admins: digest only, at most two live, a 24-hour rotation overlap, and the secret shown once.

  Red: the `organization-scim` token scenarios.

  Fault: store the raw token, and observe the storage assertion fail. Then permit a third live token and observe `token_limit` fail. Restore and add `Proof:`.

- [x] 4.2 Add SCIM authentication: an identical `401` body for every bad token, per-token admission returning `429` with `Retry-After`, and the organization selected by the token alone.

  Red: revoked-token replay on every verb; unknown, expired and malformed tokens all give byte-identical bodies; the 301st request in the window gets 429 with no effect.

  Fault: look up revoked tokens as live, and observe the replay test fail. Restore and add `Proof:`.

- [x] 4.3 Add the Users subset (GET with filter, POST, GET by id, PATCH, DELETE) and `501` for everything else, with RFC 7644 errors.

  Red: POST creating a pending membership; off-domain `invalidValue`; duplicate `uniqueness`; cross-organization PATCH answering 404 with nothing changed; PUT answering 501.

  Fault: drop the organization predicate from the id lookup, and observe the cross-organization PATCH test fail. Restore and add `Proof:`.

- [x] 4.4 Activate pending memberships in the login callback and the link callback, using the prefix and the connection-attested email.

  Red: SSO sign-in activates even with `email_verified` false; a `google-oauth2` sign-in with the same email does not; an existing member binds without a role change; `account_exists` followed by a link activates.

  Fault: activate on email alone, and observe the non-SSO test fail. Restore and add `Proof:`.

- [x] 4.5 Add transactional deprovisioning: membership deleted, the organization's browser bindings revoked and the audit row written together; the last super-admin refused; reactivation creating a pending membership only.

  Red: the `organization-scim` deprovisioning scenarios across browser, gateway lease and MCP tool call; the audit failure rolling back; B unaffected.

  Fault: commit the membership deletion before the audit row, and observe the rollback test fail. Then drop the last-super-admin guard and observe its test fail. Restore and add `Proof:`.

- [ ] 4.6 Run the first customer's IdP (Dany's test tenant) against the subset. Record each request the IdP makes that the subset refuses, and either extend the subset under this change or record why not. Red: the recorded transcript. This task is blocked on Dany-only items 2 and 3.

## 5. Session policy and audit completion

- [x] 5.1 Add the policy routes for super-admins with validation, plus the lifecycle `opened_at` and `reauthenticated_at` writes, all in ms. `reauthenticated_at` comes from a verified `auth_time` under `max_age`, or else the narrow same-pair callback-time fallback; never from a link callback or from `prompt=login` alone. Refresh preserves `opened_at`.

  Red: the `organization-session-policy` setting scenarios; refresh keeping `opened_at`.

  Fault: reset `opened_at` on refresh and observe the session-bound test fail. Then set `reauthenticated_at` on a link callback, and observe the link-callback test fail. Restore and add `Proof:`.

- [x] 5.2 Add one `SessionPolicy` rule at selection, resolution, direct context and delegation verification, with typed `reauthentication_required`. An unknown time is refused, and a delegation is refused until it carries `authenticated_at`. fe-01 renders the refusal as a state.

  Red: a fake injected `now()` pins equality admitted and +1 ms refused for both bounds; the policy is read in the existing lifecycle and revocation query (query count unchanged); a link callback does not reauthenticate; a different connection does not reauthenticate; the prompted sign-in is admitted; an unknown time refused; a delegation refused; another organization unaffected; the cleared policy.

  Fault: treat a null `opened_at` as now, and observe the unknown-time test fail. Restore and add `Proof:`.

- [x] 5.3 Audit completeness: for every act in `organization-audit`, a mounted test asserts exactly one row, a refused act writes none, and no detail contains a token, a digest or a full subject.

  Fault: skip the audit write for `sso_connection_proven`, and observe the completeness test fail. Restore and add `Proof:`.

- [ ] 5.4 Write `verify.md` with the commands, observed outputs and a failure-proof table for every fault above. Run the gate on the exact SHA.

- [x] 5.5 Add a scoped session-policy administration panel to the organization page. Render absent/configured/loading/failure/refusal; validate optional bounds, serialize mutation, use returned policy, and withdraw on context or credential loss. Mounted tests include delayed responses across runtime withdrawal.

  Red: panel import absent, then focused mounted cases for validation, authority, pending, scoping, reconciliation and late response.

  Fault: relax the minimum, drop authority withdrawal, remove both pending admission guards, change the expected-organization header, and trust the submitted value. On review, hold an older same-runtime GET across a PUT and inject broken read/effect versioning, then remove mutation admission; separately break inline field naming and association. Each observed failure and restoration is recorded in `verify.md`.

## 6. Browser provisioning token administration

- [ ] 6.1 Compose a separate scoped provisioning-token panel with list/revoke, explicit states, exact ID confirmation, serialized mutations, stale-read fencing and shared authority withdrawal. Watch production-path negatives for wrong ID, missing scoped client, duplicate writes, stale reads and omitted composition.
- [ ] 6.2 Add issue/rotate with ephemeral dismissible secrets, server previousExpiresAt and modeled refusals. Watch production-path negatives for retained secrets and late secret publication after runtime withdrawal.
- [ ] 6.3 After connection deletion lands, prove issue/list/rotate/revoke and deletion blocker release against the mounted browser/API fixture. No real IdP acceptance is claimed.
