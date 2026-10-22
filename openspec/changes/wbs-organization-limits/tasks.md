## 0. Dany reads L1 to L16

- [ ] 0.1 Dany confirms or amends design.md L1 to L16, in particular L5 (a bound claim is a
      distinct work item, person, run triple), L7 (defaults from three required environment
      variables), L12 (CLI is the only writer) and L2 (the capacity cap applies per resource
      to the sum over projects). Slice 1 may proceed on L6, L7 and L8; slice 2 waits for L9;
      slice 3 waits for L5 and L10; slice 4 waits for L2; slice 5 waits for L12 and L13;
      slice 6 waits for L14.

## 1. Schema, defaults and the read

- [x] 1.1 Migration `add_organization_limits`: table `organization_limits` with the three
      `NOT NULL` integer columns, their 0 to 1,000,000 CHECKs and audit columns, and a
      `down.sql` refusing while any row exists — Red: `organization-limits-migration.db.test.ts`
      forward, back, the refusal with one row, a row with a null or out-of-bound cap refused
      by the CHECK. R5 fault: drop the `down.sql` guard and the rollback silently deletes a
      tenant's caps; drop one CHECK and the null-cap case stores a row the read cannot
      explain; watched.
- [x] 1.2 `BeConfig` gains the three required `ORGANIZATION_DEFAULT_*` variables within the
      bound; compose, Kubernetes manifests, `.env.example`, the dev host's environment and
      `docs/runbook-organization-activation.md` gain them — Red: `config.test.ts` refuses an
      absent, fractional, negative and over-bound value naming the variable, and
      `boot.db.test.ts` boots with all three. R5 fault: give one variable a default in the
      schema and the absent case boots; watched. Built 2026-10-22: compose (`configure.sh`,
      the swap preflight in `docker.ts`), Kubernetes overlays, both `.env.example` files and
      the runbook carry the three. The dev host's own `.env` is outside the repository: the
      coordinator seeded it on 2026-10-22 (with a backup), and `assertBeEnv` in tool-devsync
      now refuses a dev deploy whose be-01 `.env` lacks any key be-01 requires.
- [x] 1.3 Red: `organization-limits.test.ts` in `@wbs/domain`: `refuseLimit({ cap, current,
added })` answers null under the cap, the refusal at and over it, and a property that
      `current + added <= cap` never refuses and `>` always does. R5 fault: compare with
      `>=`; the "exactly at the cap after the add" case flips; watched.
- [ ] 1.4 Green: port `OrganizationLimits` in `@wbs/core` (`effectiveLimitsOf`, `usageOf`,
      `countAgentPersons`, `countBoundClaims`, `sumStatedCapacity(resourceId,
exceptProjectId)`, `set`, `reset`) over SQLite with a memory twin and a conformance
      suite; `effectiveLimitsOf` answers the row or the injected defaults with `source` —
      Red: the conformance cases for a row, no row, the three usage counts over two
      organizations (the foreign rows never counted), the triple count over a four-step leaf
      and two agents on one leaf. R5 fault: drop the `person_organization` join and B's agents
      count for A; count claim rows instead of triples and the four-step leaf answers 4;
      watched. Slice 1 (2026-10-22) built the read side over SQLite: `OrganizationLimits.read`
      and the store readers `readEffectiveLimits`, `countAgentPersons`, `countBoundClaims`,
      `readCapacityUsage`, `sumStatedCapacity` (`organization-limits.ts` in store-sqlite), each
      with its negative. Still open here: `set` and `reset` (they need the audit widening of
      slice 5 to be written whole). Slice 3 (2026-10-22) added the memory twin of the gauge
      (`organization-limits-fixture.ts`) and two conformance cases both sources certify.
- [x] 1.5 `GET /api/organization/limits` in `@wbs/contracts` and `@wbs/core`
      (`organization-limits.routes.ts` beside `session-policy.routes.ts`), limits and usage
      in one transaction, OpenAPI emit, MCP tool count moves by one — Red:
      `organization-limits.controller.db.test.ts`: admin and super-admin read, member and
      viewer `403 forbidden`, delegation `403 insufficient_scope`, pre-activation
      `403 no_active_organization`, usage of A only, `source` for both cases. R5 fault: skip
      the role check and the member case answers 200; watched.

## 2. The agent-person cap

- [x] 2.1 `patchPerson { kind: 'agent' }` and the directory add with kind `agent` refuse
      `agent_person_limit { cap, current, added: 1 }` from inside the directory store's
      transaction under the gate, under scoped access only; `agent → person` never consults
      it — Red: `directory-command-organization.controller.db.test.ts`: the ninth agent
      refused, demote then promote applied, legacy access applied without a read. R5 fault:
      read the count before the transaction and two concurrent promotions at 7 of 8 both
      land (observed with the gate bypassed, then restored); drop the `kind === 'agent'`
      predicate and renaming an agent at the cap is refused; watched. Built 2026-10-22: the
      check is `DirectoryService.refuseAgentPersons` over a new store port
      `OrganizationLimitGauge` that only the catalogs a unit of work admits carry, so the
      count is read in the batch's `BEGIN IMMEDIATE` under its turn; the red cases live in
      `agent-person-limit.controller.db.test.ts` (be-01) and the race in
      `agent-person-limit-race.db.test.ts` (store-sqlite), not in the directory controller
      test. `createPerson` carries no kind on the wire, so the add with kind `agent` is
      reachable only through the import; it is checked in `addPersonWithin` all the same
      (`directory.resource.test.ts`). With the gate bypassed SQLite refuses the second
      `BEGIN IMMEDIATE`, so "both land" was observed through a stale count instead.
- [x] 2.2 Plan import counts the agents it would create and refuses the whole import with
      `added` — Red: `plan-import-organization.controller.db.test.ts`: three agents over the
      cap write nothing, three under it import. R5 fault: check per person instead of the
      total and an import of three at 6 of 8 writes two; watched. Built 2026-10-22 in
      `agent-person-limit.controller.db.test.ts`; the import is all or none, so with the
      whole-import check removed the per-person check of `addPersonWithin` answered 500 and
      wrote nothing rather than writing two; an agent the organization already holds by name
      counts nothing.
- [x] 2.3 Refusal shape in `@wbs/contracts` (`agent_person_limit` on the command refusal
      union with its detail), described for the MCP batch tool — Red: the refusal fixture
      type test and the OpenAPI emit diff. Built 2026-10-22: `agent_person_limit` with
      `LimitRefusalDetail` in `refusal.ts` (batch arm with its position, import arm without),
      409 arms in the batch and import shapes, the `patchPerson` command description; no
      OpenAPI document is checked in, so the emit is proven by `import-shapes.test.ts` and
      the mounted tests answering 500 with either arm removed.

## 3. The claim cap

- [x] 3.1 `decideClaim`'s caller in `claims.ts` reads `countBoundClaims` inside the batch's
      transaction, decides `refuseLimit` last, after `overlaps_subtree_claim` and the
      occupancy refusals, and only when the claim adds a triple; `alreadyHeld` and release
      never consult it; two claims of one batch count each other — Red:
      `claim-command.test.ts` (memory and SQLite through the conformance suite): the
      forty-first refused, the plan's reasons first (`already_claimed`, then
      `inside_subtree_claim`, then `claim_limit` once each clears), the second step of a held
      leaf under the same run adds nothing, two claims in one batch at 39 of 40 refuse the
      second. R5 fault: move the check before `already_claimed` and the "plan's reasons
      first" case reddens; count rows and the second-step case refuses; watched.
- [x] 3.2 Race: the 39-of-40 case, two accounts, two leaves, both orders; exactly one
      applied, the loser `claim_limit` with `current: 40`. Built in
      `libs/wbs/adapters/store-sqlite/src/claim-limit-race.db.test.ts` (not
      `claim-race.db.test.ts`), beside a fast-check model with the cap as invariant. R5
      faults, watched: a count read before the batches queued lands both (41 of 40); a unit
      of work over the open gate fails the queued `BEGIN IMMEDIATE` ("cannot start a
      transaction within a transaction"), as the 2026-10-19 precedent did.
- [x] 3.3 Undo and redo: a redo of a claim and an undo of a release re-check and answer
      `stale_undo` with detail `claim_limit: cap n, current n.`; claims moving on a split or a
      promotion are not re-checked — Red: the replay cases (redo of a claim, undo of a
      release, undo of a delete) and the hand-down case at the cap, built in
      `apps/wbs/be-01/src/controller/claim-limit.controller.db.test.ts` (not
      `claim-race.db.test.ts`). R5 fault: skip the re-check in the `add_claims` replay and
      all three replays put the claim back over the cap; watched.
- [x] 3.4 Refusal shape `claim_limit` in `@wbs/contracts`, position in the batch, status 409
      like `already_claimed`; MCP batch description — Red: the shape tests and the emit diff.
- [x] 3.5 Measure: time of `countBoundClaims` on a store with 1,000 claims over 200 leaves,
      recorded in verify.md; if above 5 ms per claim, file the counter-column follow-up (the
      meaning of L5 does not change). Built 2026-10-22: the claim check sits after
      `decideClaim` in `WorkItemService.claim` (work-item.resource.ts), not in `claims.ts`;
      the behaviour cases are `claim-limit.controller.db.test.ts` (be-01, SQLite) rather than
      `claim-command.test.ts`, because the memory batch runner has no scoped claim path; the
      race and a fast-check model with the cap as invariant are `claim-limit-race.db.test.ts`;
      the gauge's memory twin is certified by the conformance suite. 3.5: 0.29 ms at 1,000
      claims, 2.85 ms at 10,000, no scan of `claim`; no index added and no follow-up filed.

## 4. The capacity cap

- [x] 4.1 `setForResource` passes `sumStatedCapacity(resourceId, exceptProjectId)` through
      `refuseLimit` inside the capacity store's transaction for non-null `units`; null and
      lowering never consult it; team `setCapacity` untouched — Red: `resource-command.test.ts`
      and the organization controller test: two projects sharing 64, lowering under a lowered
      cap, another resource another sum, legacy access applied. R5 fault: include the project's
      own stated units in `declared` and re-stating 48 of 64 with nothing else refuses; drop
      the per-resource predicate and `worktrees` are refused for `h2puni ram`'s units; watched.
      Built 2026-10-22: the decision is `refuseCapacityStatement` in `@wbs/domain` (a statement
      not above the project's own units never refuses), the sum is the gauge's new
      `readCapacityCap(organizationId, resourceId, exceptProjectId)` read in the batch's
      `BEGIN IMMEDIATE`; the red cases are `capacity-limit.controller.db.test.ts` (be-01,
      through `POST /api/projects/:id/commands`) rather than `resource-command.test.ts`, whose
      memory batch runner has no scoped path; the race and a fast-check model are
      `capacity-limit-race.db.test.ts`; the memory twin is certified by
      `organizationLimits.readCapacityCap:per-resource-except-project`. The gauge is read for
      every non-null statement under scoped access (lowering included) and refuses only a raise.
      `setResourceCapacity` is not journalled, so no undo or redo re-check exists (a case says so).
- [x] 4.2 Plan import checks every capacity it writes against the sum excluding its own
      project and refuses whole — Red: `plan-import-organization.controller.db.test.ts`: 70 GB
      under 64 writes nothing, a re-import of the same project at 64 of 64 is applied. R5
      fault: count the project being replaced and the re-import refuses; watched. Built
      2026-10-22, amended: no import replaces a project; every import creates a new one,
      which states nothing, so the exclusion is empty and a re-import of an export beside its
      still-stating source counts the source (`declared: 64, asked: 64`, refused) and is
      applied once the source clears. The red cases are in `capacity-limit.controller.db.test.ts`;
      the R5 fault is the other projects' sum read as 0, watched.
- [x] 4.3 Refusal shape `capacity_limit { resourceId, cap, declared, asked }` in
      `@wbs/contracts`; MCP batch description — Red: the shape tests and the emit diff.

## 5. The operator CLI and the audit

- [ ] 5.1 Audit vocabulary widening for `organization_limits_changed` /
      `organization_limits` by the mechanism `main` holds when this slice is built (rebuild as
      `20261012090200`, or the trigger pair if #632 landed), `down.sql` refusing while a row of
      the action exists; `ORGANIZATION_AUDIT_ACTIONS` and the subject kinds — Red:
      `organization-limits-audit-migration.db.test.ts` forward, the outgoing release's
      `session_policy_changed` write, an unknown action refused, rollback refused over one
      row. R5 fault: replace the guard with `CHECK (1)` (or drop the trigger) and
      `migration-lint.test.ts` names the destructive statement; watched. Rebase on whatever
      rebuild `wbs-machine-credentials` has merged first (L13).
- [ ] 5.2 `OrganizationLimits.set` and `reset` write the row and the audit row in one
      immediate transaction, actor `operator:<os login>`, flat before and after detail,
      unchanged `set` writes nothing — Red: the conformance cases and the "audit cannot be
      written" case through a failing audit store. R5 fault: write the audit outside the
      transaction and the failing-audit case leaves a row; watched.
- [ ] 5.3 `organization-limits-cli.ts`: `show`, `set` (defaults for caps not given, row values
      when one exists), `reset`; refusals for an unknown organization, an out-of-bound value,
      no cap named, `reset` without a row; usage printed beside each cap; the below-usage
      warning without refusal — Red: `organization-limits-cli.db.test.ts` for each, the
      warning case at 12 agents over 8 exiting 0. R5 fault: let `set` start from zeros instead
      of the defaults and the one-cap `set` writes 0, 40, 0; watched.
- [ ] 5.4 Operator section in `docs/runbook-organization-activation.md` (how to show, set and
      reset; where the defaults live), and `LLM_README.md` routes to it in one line.

## 6. The organization page and the refusal copy

- [x] 6.1 `LimitsPanel` after the session policy panel: loading, failure with reload, ready
      with one row per cap and one line per listed resource, exceeded marking, "deployment
      default" when `source` is `default`; `forbidden` renders the panel absent — Red:
      `limits-panel.test.tsx`: the three states, 7 of 8, 40 over 10 marked exceeded, the
      member's page sends the read once and renders no panel, no edit control exists. R5
      fault: render usage from the previous organization after a switch (the session-policy
      panel's late-reply fence removed) and the scoped test observes B's numbers under A;
      watched. Built 2026-10-22 (`limits-panel.tsx`), amended: the page reads the caller's
      role from `GET /api/organization/active` first (`organization-role.ts`, the
      machine-credentials pattern), so a member or viewer sends no limits request at all
      rather than one refused read; a `forbidden` read (a role lost between the two reads)
      still renders the panel absent. A count at its cap is marked "At the cap", one over it
      "Exceeded". The panel offers "Refresh organization limits" and no edit control. The
      fence fault was observed as org-a's late 7 of 8 replacing org-b's 1 of 8.
- [x] 6.2 Refusal copy: the table and startable surfaces for `claim_limit`, the people page
      for `agent_person_limit`, project settings for `capacity_limit`, each naming the numbers
      from the refusal body — Red: the rendering tests with each refusal body; the copy never
      invents a number the body lacks. Built 2026-10-22: the sentences are
      `lib/organization-limit-words.ts`; `refusalSentence` (every plan surface's batch
      refusal) words all three from the body through `limitSentence`, the people page
      (`/directory`, the kind select) carries `agent_person_limit` as its own
      `DirectoryRefusal` arm, and the import dialog's capacity sentence now names the
      resource. fe-01 has no startable surface, sends no `claimWorkItem` and no
      `setResourceCapacity`, and has no project-settings resources section yet, so those
      refusals reach the reader only through `refusalSentence`; the resource is named by id
      (`resource <id>`) because no fe-01 surface reads the resource directory.
- [ ] 6.3 UI acceptance by eye on dev (`ui-work-acceptance`): the panel at 7 of 8 and at 40
      over 10; a refused claim's message in the table; recorded in verify.md with screenshots.
