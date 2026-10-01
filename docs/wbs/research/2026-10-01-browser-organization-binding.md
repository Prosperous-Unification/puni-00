# Browser organization binding: WBS 010.5.2 decision packet

Status: **coordinator-selected defaults for implementation planning, 2026-10-01**.
The user authorized any action that is not deliberately explicitly harmful. These
defaults are recorded as coordinator decisions, not attributed to Dany. This updates
the OpenSpec planning contract only; it does not authorize production activation,
credential handling or host access.

## Intent and evidence

Finish explicit browser organization selection without allowing a different login,
refresh session or stale tab to change the organization a write reaches. Keep current
membership and role authoritative; preserve pre-activation behavior. Do not activate
tenancy, change login providers, implement gateway leases, or silently introduce a
durable browser-session subsystem.

The shared checkout is `main` at `4bb71e5fd`; source and current artifact review also
used the clean local integration candidate `8c05be86`, based on cached main
`72ec365d2`. The newer organization artifacts include slices 39e/39f, so the older
members-list/link-recovery blockers must not be carried forward. No remote refresh
was performed. The separately reviewed 080.08 candidate changes plan reread outcomes;
reconcile its runtime changes when choosing the implementation base.

Evidence:

- [Task 2.4 and coordinated 4.6](../../../openspec/changes/organization-ownership-and-access/tasks.md): selection preview exists; browser binding remains open. Explicit selection even with one membership is the recorded design recommendation.
- [Access requirements](../../../openspec/changes/organization-ownership-and-access/specs/organization-access/spec.md): current membership, typed refusal, organization switch and cleared previous state.
- [Onboarding requirements](../../../openspec/changes/organization-ownership-and-access/specs/organization-onboarding/spec.md): existing members may select without verified email; delegated onboarding is refused. Selecting a viewer membership must remain possible.
- [Design](../../../openspec/changes/organization-ownership-and-access/design.md) and [verification slices 17/27](../../../openspec/changes/organization-ownership-and-access/verify.md): browser refresh storage is in memory; durable browser-session storage is a non-goal. Direct bearer context issuance is a separate, production-inert mechanism.
- `apps/wbs/be-01/src/boot.ts` still wires `NO_BOUND_ORGANIZATION`. `SqliteOrganizationAccess` takes a user-only callback today; it cannot distinguish two sessions of the same user. It already rechecks activation and membership per resolution.
- `libs/wbs/application/core/src/ports/oidc-verifier.ts` returns identity, without verified credential expiry. `apps/wbs/be-01/src/runtime/bearer-context.ts` already demonstrates strict credential-carrier parsing and native expiry checks; the general `cookiesIn` map overwrites duplicate cookie names.
- `apps/wbs/be-01/src/controller/auth-oidc-endpoints.ts` refreshes by correlation; `libs/wbs/adapters/auth/src/oidc-store.ts` stores refresh token and expiry, without a local-user/access-credential binding. Correlation existence alone is not proof that an organization selection belongs to that refresh session.
- `apps/wbs/fe-01/src/runtime/session-runtime.ts` keys its runtime by user alone. Project withdrawal and bounded retirement already exist in `project-runtime.ts`. Onboarding currently lists memberships without selecting one.

## Proposed slices and readiness

| Slice                                               | Bounded implementation packet                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Readiness / exclusions                                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.4A — verified selection**                       | Add verified credential evidence: kind, stable local user, exact credential digest, verified expiry and native token identity. Issue fresh native `jti` values. Preserve existing authentication callers through an adapter. Add explicit membership-list and active-selection endpoints and a purpose-specific signed `__Host-wbs_organization` cookie. Carry verified selection on the request principal into `OrganizationAccess`; never store active organization by user alone. | Ready for an inert implementation after its delta/acceptance review. Ephemeral test keys suffice. Do not replace production refusal wiring or claim activation readiness.                                               |
| **2.4B — credential lifecycle**                     | Clear organization selection on logout, new login and access-credential replacement; require reselection by default. Preserve selection across refresh only after a separately reviewed proof of continuity.                                                                                                                                                                                                                                                                         | Clearing/reselection paths are independently implementable. Seamless continuity and immediate server-side invalidation depend on D1/D2 below. Do not label browser cookie clearing as revocation of copied credentials. |
| **2.4C — switcher and runtime ownership, with 4.6** | Render selection and switching; scope client state to user plus organization and a local runtime lifetime. Withdraw old state before retiring resources; clear organization queries/catalog/directory/project state and close the old socket. Ignore late responses/events. Add expected-organization preconditions to browser resource writes.                                                                                                                                      | Runtime/switcher work can be built against an explicit test contract. Final wire behavior needs D3. Actual gateway authorization/revocation still belongs to 6.1–6.3, not this slice.                                   |

For 2.4A, recommend browser selection through exactly one access cookie, with no
simultaneous Authorization carrier. Bearer clients retain their separate context
exchange. Require exact configured Origin for selection mutations; missing, `null`
and foreign Origin refuse. Reject duplicate access/organization cookies before
decoding, including identical duplicates and valid-plus-malformed pairs. Do not
change every legacy authentication caller's carrier policy incidentally.

The organization cookie is HttpOnly, Secure, SameSite=Lax, Path=/, without Domain;
its expiry cannot exceed verified access-credential expiry. Use a distinct signing
key/purpose and fixed token type/version, so an organization cookie cannot also be
accepted as a native access token. It binds user, organization and exact verified
credential digest, not email, role or raw headers. Missing expiry is not replaced
with a guessed TTL. Return non-secret selection metadata for the UI, never the
cookie or credential digest. Selection responses, including refusals, are no-store.

Selection permits every current membership, including viewer and unverified-email
members; it grants no additional resource permission. Zero memberships stays in
onboarding; one or many requires explicit choice. Reject delegated selection.
Recheck current membership at selection and on protected requests, preserving
existing write-transaction authorization. Broken trusted marker/role/key state
throws; it never becomes legacy access or an empty membership list.

## Decisions adopted for implementation planning

| Decision to resolve                                                                                                                             | Recommended answer                                                                                                                                                  | Consequence / alternative                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1: Must the first browser-binding release preserve organization selection across refresh?**                                                  | **No: require explicit reselection after access-credential replacement.**                                                                                           | Smallest safe release. Seamless refresh needs verified old/new user identity, a server-owned refresh-session binding to that user and prior selection, successful rotation, a fresh expiry/digest, and current membership. Same email, user ID alone, or a correlation cookie alone is insufficient. Expired access plus expired organization cookie cannot authorize renewal just because they were once valid.                                                                                                                                                                                                                      |
| **D2: Must logout or organization rotation immediately invalidate a copied old credential/cookie pair on every server?**                        | **Require explicit resolution before production activation; recommend immediate invalidation if these operations are promised as revocation.**                      | Stateless signed cookies cannot provide this. Clearing a cookie removes the browser copy; changing its digest binding rejects old-cookie/new-token substitution, but does not reject an intact old pair. Same-token organization switching also leaves an older signed selection cryptographically valid. Immediate invalidation needs shared server-side session/selection version or revocation authority and a separately approved design; this conflicts with silently retaining the durable-session non-goal. The alternative is an explicitly accepted old-pair lifetime bounded by expiry, with no immediate-revocation claim. |
| **D3: Should every browser organization-resource mutation refuse when the tab's expected organization differs from verified cookie authority?** | **Yes, require the precondition on all such writes; missing/mismatch returns proposed typed `409 organization_context_changed`, with no write or automatic retry.** | Include directory commands, project creation and import, not only project-ID routes. The header/body field narrows authority; it never selects an organization. Recommend organization-ID equality as the narrow initial contract. If stale visits must also be refused after A→B→A, require a separately agreed selection-version precondition; organization equality alone does not prove that stronger promise.                                                                                                                                                                                                                    |

D1's conservative path does not settle D2. D3's expected organization also does
not revoke a replayed signed pair. Treat these as three distinct decisions.
Accepted answers belong in the existing OpenSpec access/design/tasks artifacts,
not in the glossary or an implicitly accepted ADR. Existing glossary terms suffice.

## Exact negative acceptance matrix

These are required future proofs, **not tests run by this planning pass**. Each
new guard needs a watched production-path fault and adjacent `Proof:`; pure helper
tests alone do not establish mounted authorization or browser isolation.

| Slice | Scenario and expected refusal/invariant                                                                                                                                                                                                                                | Fault that must make the proof fail                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Zero memberships gets onboarding; one/many lists candidates but sets no active cookie until explicit selection. Viewer/unverified-email member may select; viewer resource write remains 403.                                                                          | Auto-pick first membership; treat selection as member authority; require verified email for an existing membership.                                |
| A     | Foreign, missing or removed membership selection gives the same typed 403 and no selection change. Revoke/demote after selection: the next protected write refuses under the current role.                                                                             | Skip either membership lookup or use a cookie-cached role.                                                                                         |
| A     | Wrong signature/key/purpose, expired binding, missing verified expiry, different user, or same user's different access credential cannot authorize a protected route. Native logins in one clock second produce distinct credentials; swapping their selections fails. | Remove purpose/expiry/digest/user guard or fresh native `jti`. Also present the org cookie as an access token: refuse.                             |
| A     | Duplicate access/selection cookies in either order, malformed encoding, cookie plus Authorization, foreign/missing/null Origin on selection, and delegated selection refuse without state changes. Forged org headers cannot widen resource reads.                     | Accept first/last decoded cookie, fall back to bearer, skip exact Origin or delegation admission.                                                  |
| A     | All new endpoint success/refusal responses are no-store. Pre-activation production remains inert; absent/unreadable/malformed marker and malformed membership role remain server faults.                                                                               | Remove cache header, enable composition by key presence alone, or default broken trusted state.                                                    |
| B     | Logout/new login/credential replacement clears the browser selection; old selection with the new credential refuses. Provider logout failure is visible and cannot leave locally published org state usable.                                                           | Omit clearing/retirement on one path or suppress provider failure as success.                                                                      |
| B     | Under D1's default, refresh returns no selected organization. Under an approved continuity mode, user/session substitution, absent/restarted refresh state, failed rotation, revoked membership and expired prior proof cannot carry selection forward.                | Copy the org ID whenever correlation exists, match user/email alone, or renew before successful rotation.                                          |
| B     | D2's chosen policy is tested with the **entire old access-token plus old organization-cookie pair**, including another BE instance and process restart.                                                                                                                | For immediate invalidation, omit shared version/revocation lookup; for expiry-bounded policy, omit expiry. A mixed old/new pair is not this proof. |
| C     | Same user switches A→B: no A projects, directory rows, admin panels, history, presence or query results remain. Same project ID does not preserve an old runtime. Late A response/socket frames cannot update B, including rapid A→B→A.                                | Key by user/project alone or bypass the withdrawn-runtime check.                                                                                   |
| C     | Retirement rejection/timeout renders the fatal state and never publishes B; a superseded switch builds no obsolete runtime.                                                                                                                                            | Catch-and-continue cleanup failure or publish before retirement completes.                                                                         |
| C     | Two real browser tabs share cookies. Tab 1 selects B; stale tab 2 submits A directory creation, project creation/import and an A project command. Every request refuses the expected-context mismatch and both organizations remain unchanged; no auto-retry under B.  | Omit the server precondition or replace captured expected A with the browser's newly read B. Test missing precondition too.                        |
| C     | Membership removal makes the switcher/admin/project state show lost access, not cached content; switch uses a new socket.                                                                                                                                              | Retain scoped cache or reuse old socket. Server's five-second revocation/replay proof remains separately owed by 6.1–6.3.                          |

An already dispatched A write may finish under its captured, still-valid A
authority; it must never be retargeted to B. Retiring the client is not a server
transaction cancellation guarantee. The UI must not automatically replay uncertain
writes after refresh or a context conflict.

## Assignment and release sequence

1. Give Sol 2.4A as an isolated inert slice, with mounted native/OIDC credential
   evidence and carrier tests. Preserve existing auth callers through the adapter;
   update OpenSpec with the reviewed endpoint/refusal details before implementation.
2. Resolve D1–D3. Implement B's chosen lifecycle and C's expected-context contract;
   browser tests use the real chooser and two tabs sharing one cookie jar. Coordinate
   4.6's switcher, existing members/domain panels and session/project model tests.
3. Re-run the authorization, auth/OIDC/password, organization, runtime and browser
   matrices on the selected integration SHA. Record the actual faults/results in
   `verify.md`; run contracts/typechecks, OpenSpec validation and the required host gate.
4. Keep 010.5.2 open: production identity/rights inventory, key provisioning,
   delegation/gateway/MCP enforcement, activation and rollback gates remain separate.
   This packet grants no authority to change production or mark those checks done.
