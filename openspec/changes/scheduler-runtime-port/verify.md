# Verification

## Starting state

- Work began from clean `8214af98` on 2026-09-09; `origin/main` was `5516d453`
  and already an ancestor.
- The inspected two-schedule/cue baseline `aca7a5c9` and its `5375cf5f` follow-up
  are both ancestors of this branch. The current interface carries both optimized
  schedules and Fast's seventh deadline argument.

## Slice 1.1 — scheduler value port

- `bun test` in `libs/runtime-portable`: **13 pass / 0 fail**. The scheduler cases
  cover both engines, both objectives, enabled and disabled reads, absent and installed
  adapters, live and capture readers, all seven optimization states, ready-with-null,
  unexpected adapter failure and a domain cycle.
- Five existing optimizer/read files in `be-01`: **56 pass / 0 fail**.
- Core, runtime-portable and `be-01` typechecks: clean, including spec projects.
- ESLint over core, runtime-portable and every touched `be-01` file: clean.
- Removing the selected missing-adapter guard returned a scheduled Fast plan instead of
  `engine_unavailable`; the test failed before its zero-Fast-call assertion.
- Dropping Fast's seventh argument removed the literal `Map { "leaf" => 9 }` deadline
  from every recorded call.
- Removing the ready-schedule invariant returned `kind: scheduled` with a null PRI
  schedule instead of throwing.
