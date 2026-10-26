## Scope

Base `origin/main` `dacf0f10f`. Plan-command claim and release person resolution, the
`person_required` refusal, and the two command descriptions. No migration, wire-shape or
runtime-channel change. Tests run with `env -u CLAUDECODE`, Bun 1.4.4, 2026-10-26.

## Red first

- `claim-own-person.controller.db.test.ts` on the base: 1 pass, 3 fail. The agent cases
  answered `400 missing_id`; the session case answered `missing_id`, not `person_required`.
  The `credential_not_for_person` case already passed and stays as a regression guard.

## R5 proofs (fault injected, then restored)

| Fault                                                                     | Observed                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `CommandContext.claimant` without the acting-person default               | be-01: 2 pass, 2 fail (agent cases 400 `person_required`); core legacy case: 0 pass, 1 fail (`person_required`) |
| `claimant` also falling back to the actor id (sessions defaulted)         | be-01: 3 pass, 1 fail (session case 404 `unknown_person`); core legacy case: 0 pass, 1 fail (`unknown_person`)  |
| `applyAll` handed `null` instead of `actingPersonId`                      | be-01: 2 pass, 2 fail (agent cases refused)                                                                     |
| `person_required` dropped from the batch 400 arm in `work-item-shapes.ts` | mcp-01: 33 pass, 1 fail (400 lacks the code); be-01 session case answered 500 (response backstop)               |
| `definitions.ts` put back to its base claim and release descriptions      | mcp-01: 33 pass, 1 fail (`calling agent’s own person` missing)                                                  |

The scoped reference check (`command-references.ts`) keeps resolving the named person only:
routing it through `claimant` too produced no failing negative, so it was left unchanged.

## Checks

- `nx run-many -t typecheck lint -p wbs-core wbs-contracts wbs-be-01 wbs-mcp-01 wbs-fe-01 --skip-nx-cache`: exit 0.
- `nx run-many -t test -p wbs-core wbs-contracts wbs-be-01 wbs-mcp-01 --skip-nx-cache --parallel=1`:
  wbs-contracts 605 pass; wbs-core 1370 pass; wbs-mcp-01 551 pass; wbs-be-01 3702 pass,
  3 skip, 1 fail. The failure is
  `organization-selection.controller.db.test.ts` "a committed revocation refuses the old
  browser pair and reselection across the shared store" (timeout, `no such table:
browser_credential_revocations`). It fails the same way on the base with this change
  stashed (7 pass, 1 fail), so this change did not cause it.
- `openspec validate wbs-claim-own-person --strict`: valid; `openspec validate --all --json`:
  297 of 297 pass.
- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`: exit 0.
- Prettier on every changed file: clean.

## Not run

- The h2puni host gate, browser `e2e` and hosted CI (CI runs on the PR).
- An MCP consent end-to-end claim: consent reaches the same `actingPersonOf` branch as the
  machine key (`principal.test.ts`), and that path is not exercised separately here.
