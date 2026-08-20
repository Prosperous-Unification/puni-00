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

## 1. The choice

- [x] 1.1 `SectionMode` (`'outline' | 'phase' | 'assignee'`) and
      `DEFAULT_SECTION_MODE` (`'outline'`) exported from `plan-mermaid.ts`.
      `planToMermaid`/`planToMermaidDocument` both take an optional
      `sectionMode` parameter defaulting to it. Test: `defaults to outline —
a caller passing nothing draws exactly what M1 always drew`.

## 2. Grouping by phase and by assignee

- [x] 2.1 `sectionOf` returns both the section's sort order and its label for
      a slice, per mode. `phase` reads `slice.roleId` against `plan.roles`'
      own order; `assignee` reads `slice.personId` against `plan.people`'s.
      Both put the ungrouped case (`no phase` / `unassigned`) last rather than
      interleaved.
- [x] 2.2 `tasksOf`'s sort gains the section's order as its primary key, ahead
      of row order — otherwise a role or a person shared by two rows draws as
      two non-contiguous `section` bands, which is not a section at all. Row
      order and role order remain the tie-break inside a shared section. Test:
      `groups by phase, gathering a role's slices into one section wherever
their rows sit, unnamed last` asserts both the section list and the exact
      task order inside the shared `QA` section.
- [x] 2.3 `assignee` grouping. Test: `groups by assignee, in the roster order
the app already lists people in, unassigned last`.
- [x] 2.4 Phase and person names are free text and go through the same
      `mermaidPhrase` escaping a row's name already gets. Test: `escapes a
phase's or a person's own name the same way a row's is escaped`.

## 3. The document

- [x] 3.1 `planToMermaidDocument`'s `sectionMode` passes straight through to
      `planToMermaid`; the table beneath the fence is unaffected, since
      `markdownTableLines` has no section concept. Test: `passes the choice
through to the bundled document (M2), same fence either way`.

## 4. The record

- [x] 4.1 `proposal.md`, this file, the delta spec, `verify.md`. **No
      `design.md`** and no citation table: PoC-mode contract, 2026-08-14.
- [ ] 4.2 **Not done here: a toolbar control to reach `phase`/`assignee` at
      all.** `wbs-table.tsx` is two other agents' file tonight and this change
      was told not to touch it. Ships with the `outline` default; the other
      two modes exist in the writer and are tested, but nothing in the app can
      ask for them. The exact gap M1 and M2 both left the same way — and which
      went unwired for a day and cost a P1 in the 2026-08-15 cloud regression
      (`notes/wbs-cloud-regression-2026-08-15.md` §5). `verify.md` names the
      shape of the control this owes (a picker beside the two Copy buttons,
      remembered per browser on the `wbs.ganttDetail` pattern). Left unticked
      deliberately: M3 is not reachable from the app until it lands.
