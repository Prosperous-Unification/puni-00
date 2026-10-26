## 1. Tests first

- [x] 1.1 be-01 `claim-own-person.controller.db.test.ts`: an API key claims and releases
      with no person (rows, lease, journal, undo); implicit equals explicit; a session gets
      `person_required` for both kinds; naming another agent stays
      `credential_not_for_person`. Watched red (3 fail, 1 pass) on `dacf0f10f`.
- [x] 1.2 core `claim-command.test.ts`: the same default and refusal through legacy access,
      where the binding resolves the claimant without the scoped reference check.
- [x] 1.3 mcp-01 `openapi-tools.test.ts`: both variant descriptions name the default and
      `person_required`; the batch 400 declares it.

## 2. Implementation

- [x] 2.1 `CommandContext.claimant` (named id or ref, else acting person, else
      `person_required`); `applyAll` passes the acting person it already received.
- [x] 2.2 `person_required` in `CommandRefusalCode`, `PlainReason`, the batch 400 arm, the
      route switch and fe-01's refusal copy.
- [x] 2.3 `claimWorkItem` and `releaseWorkItem` descriptions.

## 3. Proofs and checks

- [x] 3.1 R5 proofs recorded in `verify.md` with adjacent `Proof:` comments.
- [x] 3.2 Typecheck, lint, tests, OpenSpec validation, Burokrat indexes, Prettier.
