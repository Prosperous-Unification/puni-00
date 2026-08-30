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

## 1. The one testable thing, red first

- [x] 1.1 `capacityFloorWords`' count agrees in number with what it counts.
      `counts the rest of the blocking set rather than naming every one of it`
      re-pinned to `and 1 other`, watched failing on the shipped string before
      the expression changed. **Negative for the fix itself:** a second case,
      `keeps the plural where more than one other bar was holding the pool`,
      with the `s` dropped from the plural arm and watched failing — without it
      the singular fix could have been "never say `others`". Both faults and
      both failures are R5 rows 1 and 2 in `verify.md`.

## 2. The spec, which is the half of C4 the proposals named

- [x] 2.1 `specs/wbs-domain/spec.md`: C1's `A team may be sized...` RENAMED to
      `A team's capacity bounds how much of its work runs at once on one plan`
      and MODIFIED — its three scenarios kept, the two-projects-share-a-team
      paragraph replaced by the per-project fact, a fourth scenario added for
      the pair.
- [x] 2.2 The priority requirement MODIFIED — the edit C1's D7 assigned by name:
      a third paragraph separating placement from start, and a scenario for the
      overtake, `a narrow block overtakes a wider one of higher priority`.
- [x] 2.3 Three REMOVED, each with Reason and Migration naming where every
      surviving rule went: C2's combined size/parallelism write, C2's
      `Sizing a team tells every project whose dates it moves`, C3's directory
      size box. The parallelism half restated whole under ADDED so the `0` and
      `1001` refusals stay specified.
- [x] 2.4 Two ADDED requirements for what this change itself owes: the prose
      surface, and the pool wait's grammar.
- [x] 2.5 `priority-column/proposal.md` loses `and starts earlier` — three
      words, no addition, because that file is already over the schema's word
      cap. design.md D2.

## 3. The glossary

- [x] 3.1 Nine terms into `CONTEXT.md`: capacity, pool, slot, maximum
      parallelism, width, block, blocking set, display referent, remembered
      capacity. Terms only — no route, no file, no decision, per R3.
- [x] 3.2 Four corrections: `Service team` (a capacity is stated against it),
      `Binding floor` (six things, not five), `Priority` (placed is not
      started), `Resource leveling` (`capacity planning` leaves its `_Avoid_`
      list, because it is now a neighbouring term). Each checked against the
      symbol that implements it — verify.md's citation table.

## 4. The prose nobody could find

- [x] 4.1 `docs/capacity.md`: what a capacity is a fact about, where it is
      typed since C5 moved it to the plan's toolbar, effort ÷ width as one
      indivisible block, the clamp and the named-person collapse, the chart's
      sentence read in four pieces, the three states, and capacity versus
      priority. Every number and rule in it cited in verify.md against the line
      it was read from.
- [x] 4.2 `LLM_README.md` gains one row in the doc index. 147 → 148 against the
      150-line cap the `gate` job enforces; `doc-caps.ts` run to say so rather
      than counted by eye.
- [x] 4.3 `schema.ts`'s `serviceTeamId` stops spending the label through the
      retired `{@link serviceTeam.size}` and links the new page.

## 5. The second folded P3

- [x] 5.1 `ExportSlice`'s docstring stops crediting `effort` and `duration` with
      work the CSV does not ask them for, and says what is true instead: `width`
      is what `Ran at` reads, the other two are carried and unread, and deleting
      them is the export's shape rather than its words.

## 6. The gate

- [x] 6.1 Format, both suites, lint, typecheck and `openspec validate` on
      **h2puni over plain ssh** — h1claw denies builds and autotests
      (`bin/block-local-builds.sh`). Numbers in `verify.md`.
- [x] 6.2 CI green on the PR head: `gate` and `pixels`, run id in `verify.md`.
