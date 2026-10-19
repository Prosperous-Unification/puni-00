## 0. Spec and verification of the two load-bearing assumptions

- [ ] 0.1 Dany's design interview on design.md D1 to D6 and the four `CONTEXT.md` terms;
      amend or confirm. `openspec validate --all --json` green.
- [ ] 0.2 Verify on dev that an Auth0 machine-to-machine token for the WBS audience carries
      the groups claim and is accepted by be-01's verifier — test: a recorded request against
      dev with the token's claims (redacted) in verify.md. If it is not, record the Auth0
      action change needed before slice 3.
- [ ] 0.3 Read the plan document v6 and confirm it carries `assignees` keyed by frozen step
      reference and a person's teams; record what the Burokrat branch rule can read without a
      v7.

## 1. Claim and release in `@wbs/domain`, core and the registry

- [ ] 1.1 Red: `claim.test.ts` in `@wbs/domain` for the pure decision: given a leaf's status,
      its assignments, its effective team set and the claimant's teams, answer `claim` with
      the steps to assign, `alreadyHeld`, or one of `not_a_leaf`, `not_startable`,
      `already_claimed`, `outside_allotment` in that order — test: one case per refusal,
      one per success, a property that the decision never assigns an assigned step.
- [ ] 1.2 Green: implement the decision. Negatives: remove the order and the
      `already_claimed before outside_allotment` case reddens; remove the team-set emptiness
      test and the unlabelled-leaf case reddens. Adjacent `Proof:` comments.
- [ ] 1.3 Red: `work-item.resource` tests for `claimWorkItem` and `releaseWorkItem` in a
      batch: writes, single journal entry, revision bump, undo removes exactly the written
      rows, `alreadyHeld` writes nothing — test: `claim-command.test.ts` against the memory
      store and the SQLite store through the conformance suite.
- [ ] 1.4 Red: two concurrent batches from two accounts — test: `claim-race.db.test.ts`
      with the write coordinator, one winner, the loser's refusal names the winner. Negative:
      bypass the coordinator and both win; watched, then restored.
- [ ] 1.5 Registry entries, descriptions, refusal shapes in `@wbs/contracts`; MCP tool list
      snapshot moves by zero (the batch tool carries the new kinds) — test: the existing
      registry shape tests plus the OpenAPI emit diff.
- [ ] 1.6 fe-01: a claimed row shows its holder where the assignee cell already draws people;
      no new control — test: the table's assignment rendering tests with a claim-shaped tree.

## 2. Account binding

- [ ] 2.1 Migration `add_person_account` (nullable `account_id`, FK `users.id`, index) with
      `down.sql` that refuses over bound rows — test: `migration-cli.db.test.ts` forward and
      back, and the refusal with one bound row; negative: drop the guard and the rollback
      silently unbinds; watched.
- [ ] 2.2 `patchPerson.accountId` admin-only; person read shows it; export does not — test:
      directory command tests for admin, member, viewer; export golden unchanged.
- [ ] 2.3 `person_not_bound` in claim and release, with the admin bypass — test: the four
      cases of the spec; negative: remove the role check and the stranger's claim passes.

## 3. A fleet that can write

- [ ] 3.1 `grant-membership-cli.ts`: account, mapping, membership in one transaction;
      idempotent; refuses `super_admin`, unknown organization, mapped subject of another
      issuer — test: `grant-membership-cli.db.test.ts` for each; negative: remove the
      transaction and a failed membership insert leaves an orphan account; watched.
- [ ] 3.2 Dev proof: a request bearing the machine token lists the organization's projects
      and applies a `claimWorkItem` batch; recorded in verify.md with the token redacted.

## 4. Startable read

- [ ] 4.1 Red: `startable.test.ts` in core: filter by team, no team, claimed-apart list,
      frozen number over derived, predecessors — test: the spec's four scenarios on the memory
      store; negative: swap `statusOf` for the stored readiness and the blocked-by-proxy
      scenario reddens.
- [ ] 4.2 Descriptor, route, policy (viewer may read), MCP tool by derivation — test: route
      tests for viewer, member, stranger; the MCP tool count moves by one.

## 5. Dispatch of the live plan (operator, not code)

- [ ] 5.1 Directory: one team per fleet, persons of kind `agent` for each superagent and
      worker, memberships, `setCapacity` per fleet on the project — recorded as the applied
      batch and its answer.
- [ ] 5.2 Label the subtrees each fleet owns; `setStatus ready` on each dispatched parent;
      assign the 42 in-progress steps' holders by hand where known from puni-plan.
- [ ] 5.3 Replace the branch-prefix contract with the WBS-native one (puni-plan,
      `fleets/coordination-contract-v2.md`) and tell both fleets.
