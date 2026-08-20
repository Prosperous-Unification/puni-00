<!--
Only for a non-trivial technical shape. Do not restate an ADR's rationale.
-->

## Context

R10-B, and the third of the three answers R10's brief §6 ranked. The design is
R2-5 verbatim (`notes/wbs-brief-2026-08-13-r2-team-service.md` §3/§5/§6) with
`service` renamed to `tag` — that document designed a second label dimension in
full, `notes/decisions.md:85` dropped it pointing at R10, and this change builds
it.

The technical shape is not "add a table". It is that **this repo already has one
label dimension**, and a second one is either a copy of the first or a
generalisation of it. A copy is how an inheritance rule drifts, and this repo has
shipped the stored-versus-effective form of that bug twice. So most of what
follows is about where the two dimensions share a line and where they must not.

The other half is the **defining absence**. A team is a pool the scheduler spends;
a tag decides nothing. Every decision below that looks like an omission — no
capacity column, no `capacity_released` effect, no `No tags` line on an untagged
bar, no colour — is that absence made visible on purpose, and each one is
asserted rather than left to be noticed.

## Decisions

### D1 — Two tables, the tag global, both sides of the join cascading

`tag (id, name)` with a unique index on `name`, and
`work_item_tag (work_item_id, tag_id)` keyed on the pair, **both columns
`ON DELETE CASCADE`**.

Global rather than per-project, mirroring `service_team`: a vocabulary that
restarts per project cannot answer "every regulatory item across the deployment",
which is the question a tag exists for. Nothing about the table is per-project, so
nothing about it takes a project column.

Both sides cascade, and that is a deliberate difference from `role_progress`,
where `role_id` **does not**: an actual logged against a role is work somebody
really did, and losing it to a directory edit loses a week nobody can retype
(`migrate.test.ts:1595` watches exactly that). A tag row records only that a label
was applied. Deleting the label should take the labelling with it, and the
alternative — nulling in the application — is `removeTeam`'s job only because
`work_item.service_team_id` is a column with no cascade. There is no column here,
so there is nothing to null.

The unique index is what lets a rename answer `taken` rather than silently making
two tags with one name, and it is watched: weaken it to a plain `CREATE INDEX` and
the migration test reds.

The stamp, `20260819120000_add_tag`, was checked against every existing directory
**before** it was written. #60 and #61 both stamped `20260814100000`;
`migrationsToRollback` filters on a strict `created_at >`, so `rollbackTo`
reversed nothing, silently, with both tables still standing.

### D2 — One walk, two dimensions — and the wrap is called once per stating row

`effective-label.ts` holds the inheritance walk once. `effectiveTeamsOf` and
`effectiveTagsOf` are each a row shape, a result shape and a cycle error over it.

The alternative was a second copy of `effective-team.ts` with the nouns changed,
which is faster to write and is how the two rules come apart at the third change
that touches only one of them. Two copies of an inheritance rule is the mechanism
of the stored-versus-effective bug, not an unrelated risk.

**The first form of the shared walk was wrong and the memoisation test caught
it.** It built a generic result and converted it to each dimension's shape
afterwards — which allocates a fresh object per entry and breaks the object
identity the memoisation test asserts, so a chain of unlabelled rows would answer
equal-but-not-same. `effectiveLabelsOf` now takes a `wrap` callback invoked **once
per stating row**, and the memoised value is the wrapped one. Both dimensions'
memoisation reds are watched; the tag one was watched deepest-first, because in
tree order every row is already in the map and the fault is invisible (F11).

### D3 — The empty-diff claim is `service/schedule.ts`, not `libs/domain`

The proposal originally asserted an empty diff across `libs/domain/**`. That was
wrong, and it is corrected in the proposal rather than quietly narrowed here:
`effectiveTeamsOf` lives in `libs/domain/src/effective-team.ts` and **both apps
import it**, so the tag reading has to live beside it or fe-01 cannot render an
inherited tag at all. The inheritance rule *is* a rule the two apps share.

What a tag is not is anything the **scheduler** reads. So the assertion is
narrowed to what it was always about — `service/schedule.ts` and everything under
`slicesOf` — and it is asserted by a fault rather than by a file list: wire the
scheduler to read a tag as if it were a team and `tag-empty-diff.test.ts` goes
**1 pass / 2 fail**, taking its own control with it (F9).

That control matters more than the assertion. The first version of this test used
`inMemoryCapacity()` with nothing seeded, so no pool existed, so **no label
decided anything**, and the injected fault passed green. It is now real SQLite, a
real `CapacityRepository`, and a control that proves the plan's dates answer to a
label at all. A green fault injection means the test is not measuring.

### D4 — The journal carries the whole prior set, because the row is the only place it exists

`revertTo`'s `before` had to become a `LabelledWorkItem`: `work_item` has no
column for a tag, so a patch's prior set exists only on the row the plan read gave
back. A scalar `before.tagId` is representable and wrong, and it is wrong
*silently* — the undo reports done and leaves one of the two labels standing.
That is the one seam where a scalar habit loses data without a refusal, so it gets
its own watched red (F5).

The nothing-to-write guard is the same seam from the other side, and it shipped
broken until the tests caught it: the guard listed every patch field and not
`tagIds`, so a patch naming **only** tags took the early-return branch, wrote
nothing, and answered `ok` with the row it had found — every face reporting a
successful write that never happened. All six undo cases failed on it (F4).

### D5 — `unknown_tag` is its own refusal

Not folded into `unknown_team`. The refusal shape is identical, and the name is
the entire value: a client that gets `unknown_team` back from a patch carrying
both dimensions reopens the wrong picker. Decided inside the write's own
transaction, the way `WorkItemRepository.patch`'s `unknown_team` read is, so the
check and the write cannot be pulled apart by a delete landing between them.

### D6 — The wire may omit the set; a row above the boundary may not

`WorkItemView.tagIds` is **optional on the wire** and defaulted once in `toTree`;
`TreeRow.tagIds` is **required**.

It was declared required on the wire first, and that was a real bug rather than a
tidiness point: blue and green run together during a swap, so an fe-01 carrying
this change can be served a tree by the **outgoing** be-01, which has never heard
of the field. Every card threw `Cannot read properties of undefined`.

Lint is what forced the honest version — it rejected the `?? []` as unnecessary
*because the type claimed the field was always there*. The type was lying and the
defaulting was the tell.

The same shape appeared one layer up, in storage rather than on the wire: a saved
view stored by #83 between 2026-08-19 and this change has no `tagIds`, and
`filterWords` threw on it. Requiring the field there would have made
`rememberedSavedViews` **delete** those views — the tool binning somebody's
filters because a feature they never asked for shipped. A facet added later is
treated as absent, and normalised through `NO_FILTER` at the storage boundary.

### D7 — The tag column is conditional, and the width budget is exempted by name

`table-width-budget` says a new column pays for itself. This one cannot: the
folded table has **29px of slack at 1280** (measured 2026-08-14,
`layout.spec.ts`) and the column costs **120**. On screen in every state it would
put a horizontal scrollbar under every two-phase plan on a laptop.

The alternatives were all worse than an exemption. Narrowing an existing column
takes width from a fact everybody reads to give it to one some deployments never
use; a horizontal scrollbar is the thing the budget exists to prevent; and
dropping the column leaves the phone card showing a dimension the desktop table
does not.

So `CONDITIONAL_COLUMNS` in `table-frame.ts` keeps `tag` out of `FIXED_COLUMNS`:
`foldedTableMinWidth` answers **exactly the number it did before this change**,
and the column renders only where the deployment has a tag vocabulary at all. A
deployment that never makes a tag pays nothing. The exemption is a named list, not
a comment — a budget with an unwritten exception is a budget nobody can check.

### D8 — The directory's tag section has no capacity column and no membership chips

A sibling section, not a second tab of the Teams one. A reader who sees no
capacity column and no member chips learns the model rule without being told it,
and the absence is **asserted** rather than left to be noticed: the tag row's own
test reads for `member` and for a number box and finds neither (F13).

`directoryUsageOfTag` has a `label_removed` effect per item and **no
`capacity_released` arm and no date effect** — the same 409-then-`?cascade=1`
shape as `removeTeam`, one effect kind shorter, because there is nothing to
release.

And a tag removal **deliberately does not name inherited rows**, where a team
removal does. An inherited pool moves a row's dates, so a reader confirming a team
deletion needs to see the rows that will move; an inherited tag moves nothing, so
naming them is a confirmation dialog padded with rows nothing happens to.
Asserted both ways.

### D9 — The chart says what kind of work a bar is and places nothing from it

`GanttRow.tags` and `GanttBar.tags` reach the hover text through `tagWords`, and
**nothing is passed to `floorWordsOf`** — that sentence says what is holding a bar
up, and a tag has never held anything up. `barColorOf` is unchanged: a bar already
carries a person as a colour and a priority as a cap, and a third meaning on one
small rectangle stops it meaning anything.

**The tag line is absent on an untagged row where the team line still says
`No team`.** Deliberately, and it is the same bargain the priority line strikes
two lines below it: a team is the pool the dates were computed against, so its
absence explains the schedule; a tag decides nothing, so `No tags` on every bar of
every plan nobody has tagged is furniture. Asserted both ways — the tagged surface
names them, the untagged one has no `Tags` line **and still says `No team`**, so
the test is about the tag line and not about a surface that stopped printing
absences.

The "places nothing" claim carries its own control, per D3's lesson: the
invariance test compares the whole `GanttGeometry` — bars, brackets, arrows,
links, flags, horizon — tagged against untagged, and a fourth test shifts one
slice by a workday to prove that same comparison catches a real move. Without the
control the assertion passes on a build that lays out nothing.

### D10 — Both spec deltas go in `wbs-domain`, and `wbs-api` is not created

`tasks.md` §8.3 asked for a `wbs-api` delta beside the `wbs-domain` one. **There
is no `wbs-api` capability in this repo**: 66 of the 68 change folders put their
delta in `wbs-domain`, and that includes `directory-crud`, which shipped the
directory routes, their 409 shapes and their cascade semantics as `wbs-domain`
requirements. Creating a second capability for one change would split the
directory's rules across two files by which release happened to add them.

So the routes and the payload are stated as `wbs-domain` requirements beside the
dimension's, and the task is ticked with this deviation named rather than a new
capability invented to satisfy the wording.

## Risks

- **The two dimensions drift anyway.** Sharing the walk removes the copy but not
  the possibility: a future change that adds a third state ("deliberately none")
  to one dimension has to decide it for both. Mitigated only by the shared file
  being the obvious place to make the change, and by both dimensions' reds sitting
  in the same two test files.
- **A tag becomes a scheduling input by accident.** The empty-diff test is the
  guard and it watches one fault. A future change that reads tags in
  `slicesOf` through a path the test's plan does not exercise would pass. What
  keeps this honest is the control, not the assertion.
- **The conditional column hides a regression.** A deployment with no tag
  vocabulary never renders the cell, so the cell's own tests are the only thing
  that sees it. They run against a plan that has one; `pixels` does not.
- **`No tags` is a decision a reader may disagree with.** D9 is a judgement about
  furniture, not a derived rule, and it is the one thing in this change most
  likely to come back as "why does the hover not say it has none". It is recorded
  here so the answer is not re-derived.
