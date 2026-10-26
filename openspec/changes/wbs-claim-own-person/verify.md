## Scope

Base `origin/main` `dacf0f10f`. Plan-command claim and release person resolution, the
`person_required` refusal, and the two command descriptions. No migration, wire-shape or
runtime-channel change. Tests run with `env -u CLAUDECODE`, Bun 1.4.4, 2026-10-26.

## Red first

- `claim-own-person.controller.db.test.ts` on the base: 1 pass, 3 fail. The agent cases
  answered `400 missing_id`; the session case answered `missing_id`, not `person_required`.
  The `credential_not_for_person` case already passed and stays as a regression guard.

## R5 proofs (fault injected, then restored)

Each fault was run against all four suites that carry a no-person case: be-01
`claim-own-person.controller.db.test.ts`, core `claim-command.test.ts`, mcp-01
`organization-delegation.boot.test.ts` (booted be-01) and mcp-01 `openapi-tools.test.ts`.

| Fault                                                                     | Observed                                                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CommandContext.claimant` without the acting-person default               | be-01 2 pass / 2 fail (400 `person_required`); core 24 / 1; mcp-01 boot 14 / 1 (consent claim HTTP 400 `person_required`): 4 fails                |
| `claimant` also falling back to the actor id (sessions defaulted)         | be-01 3 / 1 (session 404 `unknown_person`); core 24 / 1 (`unknown_person`); mcp-01 boot 14 / 1 (human session HTTP 404 `unknown_person`): 3 fails |
| `applyAll` handed `null` instead of `actingPersonId`                      | be-01 2 / 2; core 24 / 1; mcp-01 boot 14 / 1 (consent claim HTTP 400 `person_required`): 4 fails                                                  |
| `person_required` dropped from the batch 400 arm in `work-item-shapes.ts` | mcp-01 `openapi-tools` 33 / 1 (400 lacks the code); be-01 session case answered 500 (response backstop)                                           |
| `definitions.ts` put back to the base, or to the first PR wording         | mcp-01 `openapi-tools` 33 / 1 each (`calling agent’s own person`, then `machine credential` missing)                                              |

The scoped reference check (`command-references.ts`) keeps resolving the named person only:
routing it through `claimant` too produced no failing negative, so it was left unchanged. A
defaulted claimant is the credential's own agent, in the organization by issuance and the
immutable-ownership trigger (comment there).

## Checks

- `nx run-many -t typecheck lint -p wbs-core wbs-contracts wbs-be-01 wbs-mcp-01 wbs-fe-01 --skip-nx-cache`: exit 0.
- `nx run-many -t test -p wbs-core wbs-contracts wbs-be-01 wbs-mcp-01 --skip-nx-cache --parallel=1`
  after the review round: exit 0. wbs-contracts 605 pass; wbs-core 1370 pass; wbs-be-01 3703
  pass, 3 skip; wbs-mcp-01 552 pass. In the first round be-01's
  `organization-selection.controller.db.test.ts` "a committed revocation refuses the old
  browser pair…" timed out (`no such table: browser_credential_revocations`). It failed the
  same way on the base with this change stashed, and it passed in this run, so it is
  intermittent and was not caused by this change.
- `openspec validate wbs-claim-own-person --strict`: valid; `openspec validate --all --json`:
  297 of 297 pass.
- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`: exit 0.
- Prettier on every changed file: clean.

## Not run

- The h2puni host gate, browser `e2e` and hosted CI (CI runs on the PR).
