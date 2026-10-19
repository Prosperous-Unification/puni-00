## 0. Verification of the load-bearing assumptions

- [x] 0.1 Dany's design interview on D1 to D8 and the `CONTEXT.md` terms (2026-10-19; three
      items marked assumed in design.md remain open for his review).
- [x] 0.2 Verified 2026-10-19 (verify.md): the dev tenant has no machine-to-machine
      application and its groups Action is post-login only, so an M2M token would carry no
      `wbs_groups`. Open decision for Dany: Auth0 credentials-exchange Action, or be-01 scopes
      a linked credential from its account (recommended). Blocks 2.5, not 2.1 to 2.4.
- [x] 0.3 Read 2026-10-19 (verify.md): v6 carries `people.teamIds` and per-item `assignees`
      keyed by step reference; the branch rule needs no v7; claims would need a v7 field, out
      of scope here.

## 1. The claim record and its decision

- [ ] 1.1 Migration `add_claim`: table `claim` (id, work_item_id, step_id nullable, person_id,
      run_id nullable, parent_claim_id nullable self-FK, audit columns), unique on
      (work_item_id, step_id) and a partial unique on work_item_id where step_id is null, with
      `down.sql` that refuses while any claim exists — test: `migration-cli.db.test.ts` forward
      and back and the refusal with one row; negative: drop the guard and the rollback silently
      deletes claims; watched.
- [ ] 1.2 Red: `claim.test.ts` in `@wbs/domain` for the pure decision over a leaf's status, its
      steps' progress, the claims in force on it and its ancestors, the caller's account and
      credential pin, and the claimant: answer the rows to write and the progress to state, or
      `alreadyHeld`, or one refusal in the spec's order — test: one case per refusal, one per
      success, a property that no step with a claim is ever taken, and the subtree
      overlap cases (ancestor, descendant, nested delegated claim).
- [ ] 1.3 Green: implement the decision. Negatives: remove the order and the
      `already_claimed before inside_subtree_claim` case reddens; remove the parent-claim
      account check and the foreign delegated claim passes. Adjacent `Proof:` comments.
- [ ] 1.4 Red: `work-item.resource` tests for `claimWorkItem` and `releaseWorkItem` in a
      batch: rows, progress stated, single journal entry, revision bump, undo removes exactly
      the rows and progress it wrote, `alreadyHeld` writes nothing, cascade release — test:
      `claim-command.test.ts` on the memory store and SQLite through the conformance suite.
- [ ] 1.5 Red: two concurrent batches from two accounts on one step — test:
      `claim-race.db.test.ts` with the write coordinator, one winner, the loser's refusal names
      the winner. Negative: bypass the coordinator and both win; watched, then restored.
- [ ] 1.6 Registry entries, descriptions, refusal shapes in `@wbs/contracts`; MCP tool list
      snapshot moves by zero (the batch tool carries the new kinds) — test: the registry shape
      tests plus the OpenAPI emit diff.
- [ ] 1.7 fe-01: a claimed step shows its holder and run beside the assignee cell, a subtree
      claim shows on the parent row; no new control — test: the table's rendering tests with a
      claim-shaped tree.

## 2. Binding and credentials

- [ ] 2.1 Migration `add_person_account` (nullable `account_id`, FK `users.id`, index) and
      `add_external_identity_person` (nullable `person_id`, FK `person.id`), each with a
      guarded `down.sql` — test: forward and back and both refusals; negatives watched.
- [ ] 2.2 `patchPerson.accountId` admin-only; person read shows it; export does not — test:
      directory command tests for admin, member, viewer; export golden unchanged.
- [ ] 2.3 `person_not_bound` and `credential_not_for_person` in claim and release, with the
      admin bypass for the first only — test: the spec's cases; negative: remove the role check
      and the stranger's claim passes; remove the pin check and the cross-fleet claim passes.
- [ ] 2.4 `link-credential-cli.ts` with `--unlink`: one row, pinned when asked; refuses unknown
      account, linked pair, unbound person — test: `link-credential-cli.db.test.ts` for each;
      negative: remove the pair check and a second link steals the credential; watched.
- [ ] 2.5 Dev proof: a request bearing Claire's machine token lists Dany's organizations'
      projects and applies a `claimWorkItem` batch as `claire`; a claim as another person is
      refused; recorded in verify.md with the token redacted.

## 3. Startable read

- [ ] 3.1 Red: `startable.test.ts` in core: filter by team, no team, claimed-apart list,
      subtree holder shown, frozen number over derived, unfinished predecessors — test: the
      spec's scenarios on the memory store; negative: swap `statusOf` for the stored readiness
      and the blocked-by-proxy scenario reddens.
- [ ] 3.2 Descriptor, route, policy (viewer may read), MCP tool by derivation — test: route
      tests for viewer, member, stranger; the MCP tool count moves by one.

## 4. Dispatch of the live plan (operator, not code)

- [ ] 4.1 Directory: one team per fleet, persons of kind `agent` for each superagent and
      worker bound to Dany's account, one linked and pinned credential per fleet,
      `setCapacity` per fleet on the project — recorded as the applied batch and its answer.
- [ ] 4.2 Label the subtrees each fleet works in (advisory); each superagent claims its
      subtree; claim the 42 orphan in-progress steps for their known holders from puni-plan.
- [ ] 4.3 Replace the branch-prefix contract with the WBS-native one (puni-plan,
      `fleets/coordination-contract-v2.md`) and tell both fleets.
