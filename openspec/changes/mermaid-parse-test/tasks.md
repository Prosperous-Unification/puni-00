<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The dependency

- [x] 1.1 `mermaid` added to `package.json` devDependencies, `^11.16.1`. No
      runtime import anywhere under `apps/fe-01/src`.

## 2. Reading a real diagram

- [x] 2.1 `realGantt(text)` helper in `plan-mermaid.test.ts`: loads `mermaid`
      once (`beforeAll`, module-level `let`) rather than per test — the module
      graph is heavy (d3, cytoscape) and paying for it 48 times would be the
      whole cost of this change. Calls `mermaid.mermaidAPI.getDiagramFromText`
      and returns `{ type, db }`, `db` typed by a narrow hand-written
      `RealGanttDb` interface rather than reaching into Mermaid's internal
      gantt module.

## 3. The three pins

- [x] 3.1 §3.2, the excludes-weekends trap: a slice crossing a weekend
      real-parses with `manualEndTime: true` and the exact `startTime`/
      `endTime` the writer declared. Test: `leaves a bar crossing a weekend
exactly where it was told, manualEndTime true`.
- [x] 3.2 A point (unestimated or zero-duration) real-parses as a genuine
      Mermaid `milestone` with `manualEndTime: true`. Test: `still parses a
point (unestimated/zero) as a real milestone with equal dates`.
- [x] 3.3 §3.3, inclusivity: `db.endDatesAreInclusive()` reads `true` off the
      real diagram. Test: `declares inclusiveEndDates, and Mermaid reports
believing it`.
- [x] 3.4 §3.4, escaping: a colon in a name real-parses with the writer's own
      generated id (`s1`) intact. Test: `keeps a colon in a name from moving
the split, once escaped`.
      **Negative test, hand-built text standing in for what the escaping
      refuses to emit**: the same line unescaped real-parses with the split
      moved and the id corrupted — proving the failure mode rather than
      arguing it from `gantt.jison`. Test: `— and unescaped, the real lexer
does silently move the split`.

## 4. All three section modes, real

- [x] 4.1 A two-row, four-slice fixture (two roles, two people, one slice per
      row per role) real-parses clean under `outline`/`phase`/`assignee`, each
      with the section list and task count `sectionOf`'s docstring claims.
      Test: `it.each` over the three modes, `all three section modes #71
added, each a real, error-free gantt`.

## 5. Watched, not merely believed

- [x] 5.1 The colon-escape pin is non-vacuous: `mermaidPhrase`'s
      `.replaceAll(':', RATIO)` struck, real suite watched red — including
      the M5 real-parse test, which fails on a **different** symptom
      (`task.id` reads `'strip - Dev :s1'`, not `'s1'`) than the two
      string-assertion tests it sits beside. Restored, green.
- [x] 5.2 The `inclusiveEndDates` keyword garbled one character
      (`inclusiveEndDatesXXX`), watched red: **every** M5 test throws a real
      Mermaid parse error rather than merely disagreeing on a date — the
      keyword is load-bearing enough that corrupting it does not degrade
      gracefully, it breaks the grammar outright. Restored, green.

## 6. The record

- [x] 6.1 `proposal.md`, this file, `verify.md`. **No `design.md`**, no
      citation table, no spec delta: PoC-mode contract
      (`notes/delivery-modes.md`) — this change adds no requirement and
      changes no runtime behaviour, only test evidence for requirements
      M1–M3 already stated.
