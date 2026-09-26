## 1. Inventory and additive foundation

- [ ] 1.1 Inventory production SHA, sanitized auth mode/issuer, Dany's stable user ID, existing users' effective rights, resource roots, indirect references and global unique keys; write a reviewed manifest — test: fixture inventory reports every root and role mapping; negative: inject two Dany candidates or an unmapped root and watch activation preflight fail.
- [ ] 1.2 Add stable external-identity mapping and backfill while preserving user IDs and local password accounts — test: identity migration round trip and issuer/subject lookup; negative: inject duplicate issuer/subject mapping and watch the mounted resolver refuse it without email merge.
- [ ] 1.3 Add organization and membership storage with atomic first super-admin creation and final-owner protection — test: concurrent organization creation and membership transaction; negative: remove final-owner guard and watch demotion/removal test fail.
- [ ] 1.4 Add paired additive `migration.sql` and `down.sql` for ownership and onboarding records, including compatible catalog name transition — test: migration lint, old/new reader overlap and paired rollback on production-shaped fixture; negative: omit an ownership mapping or make rollback lose a legacy relation and watch preflight/round-trip fail.

## 2. Ownership and backend authorization

- [ ] 2.1 Backfill one legacy organization with Dany as super-admin and inventoried user memberships; bridge every old writer and reconcile after drain — test: mixed-version create during backfill retains every relation and effective permission; negative: disable bridge write or add a late old write and watch zero-unmapped activation assertion fail.
- [ ] 2.2 Carry active organization in WBS session and signed bearer context, and validate it against current membership — test: mounted auth routes for zero, one and multiple memberships; negative: forge organization header or revoke membership with a live token and watch protected route tests fail with the check removed.
- [ ] 2.3 Scope project, directory, saved-plan, external-system, export/import, schedule, history, event and batch service paths and references — test: mounted cross-organization list/detail/write/batch matrix with typed 401/403/404; negative: remove the organization predicate or cross-reference check and watch read/write tests expose the foreign fixture.
- [ ] 2.4 Enforce viewer/member/admin/super-admin matrix, restricted-project creator rule, recovery override and last-super-admin invariant — test: role-action matrix and restricted-project recovery; negative: bypass role or final-owner check and watch unauthorized mutation test fail.

## 3. Onboarding and domains

- [ ] 3.1 Implement verified-email onboarding, organization creation, invitation issue/accept/revoke and join-request approve/deny — test: mounted matched-domain, unmatched-domain, invite expiry, address mismatch and concurrent approval cases; negative: remove single-use consumption and watch invite replay test create a second effect.
- [ ] 3.2 Implement DNS challenge, maintained public-domain policy, exact matching, atomic claim, re-verification and release — test: DNS fixture for TXT success, timeout, rotated token, concurrent claims and grace expiry; negative: remove public-domain refusal or uniqueness guard and watch claim tests fail.
- [ ] 3.3 Build frontend onboarding, organization switcher, members page and domain settings with loading, empty, failure and lost-access states — test: component flow for signup, switch, invite, role change and domain verification; negative: retain stale organization cache and watch removed-member/switch test reveal old content.

## 4. Realtime and MCP

- [ ] 4.1 Bind gateway identity and organization to subscription, presence, event routing, replay and forwarded commands — test: live-socket cross-organization subscribe/replay/forward matrix; negative: remove subscription or replay authorization and watch B event reach A socket.
- [ ] 4.2 Invalidate gateway authorization on role/membership change and enforce five-second lease when notification is lost — test: timed socket revocation during queued replay and dropped invalidation; negative: remove lease or queued-replay recheck and watch post-revocation delivery test fail.
- [ ] 4.3 Bind MCP organization selection to consent, authorization code, grant, refresh family and signed be-01 delegation — test: end-to-end MCP tool call with A/B grants and switched organization; negative: drop or forge delegation organization during upstream credential translation and watch be-01 refusal test fail.
- [ ] 4.4 Recheck current membership and audience on every MCP tool call and refresh, including direct upstream-token path — test: removed-member live token, wrong audience and unbound upstream token; negative: bypass membership recheck and watch removed member call succeed in the fault injection.

## 5. Activation and verification

- [ ] 5.1 Add deployment activation marker and rollback preflight that refuse organization-unaware routing or schema reversal after activation — test: actual swap abort with second-organization content and after its deletion; negative: bypass marker check and watch rollback expose cross-organization content.
- [ ] 5.2 Run targeted unit, mounted API, socket, MCP, migration and browser tests; record each observed injected-fault failure beside its production-path guard as `Proof:`; run migration lint, OpenSpec validation, formatting and `bin/h2puni-gate.sh <sha>` on the committed implementation SHA — test: every required command output and failure-proof table in `verify.md`.
