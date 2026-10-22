## Verification record

Drafted 2026-10-22 as an OpenSpec proposal only; nothing is implemented. A1 and the owner's
gap-2 decision (caps on agent persons, concurrent claims and declared capacity; typed
refusals; billing later) are fixed; L1 to L16 in design.md are assumed until Dany reads
them. Sources read on 2026-10-22 on `main` at `d504c9eae`: `wbs-team-claims` (D1 to D8, the
`plan-command-registry` delta, `claim-race.db.test.ts`), `wbs-resources` (R1 to R8, the
`resource-occupancy` and `resource-directory` deltas, `occupancy.ts`),
`wbs-machine-credentials` on `plan/wbs-machine-credentials` (A23, slice 2 as built, the
`20261022110000` audit rebuild), `organization-enterprise-sso` (session policy design,
`organization-session-policy` and `organization-audit` specs), `schema.ts` (`person`,
`claim`, `project_resource_capacity`, `organization_membership`, `organization_audit`,
`organization_session_policy`, the `<root>_organization` side tables), `gate.ts`,
`sqlite-unit-of-work.ts`, `claims.ts`, `claim.ts`, `capacity.resource.ts`,
`directory.resource.ts` (`addPersonWithin`), `command-bindings.ts`, `definitions.ts`
(`createPerson`, `patchPerson`), `session-policy.routes.ts`, `session-policies.ts`,
`session-policy.ts`, `config.ts`, `organization-page.tsx`, `session-policy-panel.tsx`,
`refusal.ts` (`Quota`), issue #632.

Term collisions checked in `CONTEXT.md`: **Resource capacity** lists _quota_ and _limit_
under its avoided names, so the cap is **Organization limits**, never a quota or a
capacity; `Quota` in `refusal.ts` stays the per-request body and plan-size refusal and is
named a non-goal; **Allowance** is an estimate term and is avoided; **Claim** is unchanged
and the counted unit is a **Bound claim**.

`openspec validate --all --json`: run before each push, result in the PR.

## What must be observed before any slice is called done

- Slice 1: a deployment missing one default variable does not boot and names it; a row with
  a null cap is refused by the CHECK; the rollback refuses over one row; B's agents never
  count for A; a four-step leaf under one run counts one bound claim; a member's read is
  `403 forbidden` and reads no usage.
- Slice 2: two concurrent promotions at 7 of 8 land one; renaming an agent at the cap is
  not refused; an import of three agents at 6 of 8 writes nothing; the legacy store admits
  without a read.
- Slice 3: `claim_limit` is answered only after every plan reason clears; two racing claims
  at 39 of 40 land one and the loser names 40; a redo at the cap is `stale_undo` with the
  `claim_limit:` detail; the second step of a held leaf under the same run adds nothing;
  the count's time on 1,000 claims is recorded.
- Slice 4: re-stating a project's own 48 of 64 is applied; `worktrees` are not refused for
  `h2puni ram`'s units; a re-import at 64 of 64 is applied; lowering under a lowered cap is
  applied.
- Slice 5: the failing audit write leaves no row; the widened table refuses an unknown
  action and its rollback refuses over one row; the lint names the destructive statement
  with the guard removed; a one-cap `set` on an organization without a row starts from the
  defaults; a cap set below usage warns and exits 0.
- Slice 6: the member's page renders no panel after one refused read; a switch of
  organization never shows the previous organization's numbers; every refusal message
  carries the body's numbers and no other.

## Failure proofs

| Check                                         | Fault injected                                   | Observed failing test | Result  |
| --------------------------------------------- | ------------------------------------------------ | --------------------- | ------- |
| `down.sql` guard of `add_organization_limits` | guard removed                                    | (slice 1)             | pending |
| cap CHECKs                                    | one CHECK removed                                | (slice 1)             | pending |
| required default variables                    | a default given in `BeConfig`                    | (slice 1)             | pending |
| `refuseLimit` comparison                      | `>` replaced by `>=`                             | (slice 1)             | pending |
| usage scoped to the organization              | `person_organization` join dropped               | (slice 1)             | pending |
| bound claim is a triple                       | rows counted instead of triples                  | (slice 1)             | pending |
| read's role check                             | role check skipped                               | (slice 1)             | pending |
| agent cap inside the transaction              | count read before the transaction, gate bypassed | (slice 2)             | pending |
| agent cap only on `agent`                     | kind predicate dropped                           | (slice 2)             | pending |
| import counts the total                       | per-person check instead of the total            | (slice 2)             | pending |
| claim cap is last                             | check moved before `already_claimed`             | (slice 3)             | pending |
| claim race                                    | unit of work over the open gate                  | (slice 3)             | pending |
| redo re-checks                                | re-check skipped on redo                         | (slice 3)             | pending |
| `declared` excludes the own project           | own units included                               | (slice 4)             | pending |
| per-resource sum                              | per-resource predicate dropped                   | (slice 4)             | pending |
| re-import excludes the replaced project       | replaced project counted                         | (slice 4)             | pending |
| audit widening rollback guard                 | guard replaced by `CHECK (1)` or trigger dropped | (slice 5)             | pending |
| audit in the same transaction                 | audit written outside it                         | (slice 5)             | pending |
| `set` starts from the defaults                | `set` started from zeros                         | (slice 5)             | pending |
| panel never shows a stale organization        | late-reply fence removed                         | (slice 6)             | pending |

## Gate output

Pending. To be recorded per slice with `bin/h2puni-gate.sh <sha>` (or h4claw) output, and
locally with `env -u CLAUDECODE` on the named test files.
