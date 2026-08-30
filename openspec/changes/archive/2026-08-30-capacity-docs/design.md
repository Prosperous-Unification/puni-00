# design — `capacity-docs`

C4 of the capacity program, and the only one of the five that ships no
behaviour. It exists because four changes each wrote "C4" in their non-goals and
none of them wrote down what C4 was.

## D1 — the scope is derived, not declared

Nothing states C4's contents. What states them is what C1, C2, C3 and C5
deferred, so every item below is here with the line that put it here.

| Scope                                                 | Where it came from                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The priority sentence                                 | Named `(C4)` in all four proposals' non-goals as "the delta spec's priority edit". `capacity-engine/design.md` D7: _"Editing it is C4's task, with a new scenario for the overtake."_                                                                                                                                                                                     |
| Four requirements describing the retired global model | Read C5's delta against C1's, C2's and C3's: C5 used `ADDED` for requirements that reverse theirs and `MODIFIED` for exactly one. The contradictions are in the tree, not in a note.                                                                                                                                                                                      |
| `CONTEXT.md`                                          | `openspec/config.yaml`, intent rules: _"Write resolved domain terms to CONTEXT.md as they resolve"_ and _"Use CONTEXT.md's terms exactly. If you need a term it lacks... add it to CONTEXT.md before using it."_ `grep -rc CONTEXT openspec/changes/capacity-*/ \| grep -v :0` is empty — the string does not appear in any of the four.                                  |
| `docs/capacity.md`                                    | Nothing outside the change folders explains capacity — verified by grepping `README.md`, `HUMAN_README.md`, `LLM_README.md`, `CONTEXT.md`, `AGENTS.md`, `docs/` and every `libs/*/README.md`. The nearest hit is `docs/plans/2026-08-09-resource-planning.md`, a dated plan. C5's own deferred list names **discoverability** as what its three unconstrained cases need. |
| `schema.ts`'s `serviceTeamId`                         | C5 corrected every other sentence in that file and left this one spending the label through `{@link serviceTeam.size}`.                                                                                                                                                                                                                                                   |
| Two of C3's P3s                                       | `capacity-ui/verify.md`, "Recorded and not applied". D6 below is the rule that took two of six.                                                                                                                                                                                                                                                                           |

Deliberately **not** derived from the wave-6 scope note
(`notes/wbs-scope-2026-08-13-wave6.md` in the workspace). That note says the
capacity program owes "C4 docs + full cloud regression" and nothing more
specific; it sequences work rather than specifying it.

## D2 — the priority edit is a spec edit, and the proposal loses three words

D7 says the sentence to fix is `priority-column`'s _"the smaller number is
placed first and starts earlier"_. It appears twice: in that change's
`proposal.md` and, in a milder form, in its delta spec's first requirement,
which says "placed" throughout and simply never mentions that placed is not
started.

The delta spec is the target — the four proposals call it "the **delta spec's**
priority edit" — so the requirement is restated whole under `MODIFIED` with a
third paragraph and an overtake scenario.

`priority-column/proposal.md` is a merged record of intent, and rewriting one is
a bad habit to start. It loses three words instead: "and starts earlier" is
struck, which leaves a true sentence and makes the file shorter. That file is
423 words against the schema's 400-word cap already, so a footnote explaining
the strike would make an existing violation worse; the explanation lives here.

## D3 — three requirements are REMOVED, one is RENAMED and MODIFIED

C5's delta ADDED `A team's capacity is a fact about one project, and there is no
global number behind it` beside C1's `A team may be sized...`, and `The plan
states its own capacities, and the directory states none` beside C3's `A team's
size can be stated in the directory...`. Both pairs are live and contradictory.
The repo has the mechanism for this — `REMOVED Requirements` with Reason and
Migration, used by `unfolding-may-scroll` and `gantt-declutter` — and it was not
reached for.

Removal versus amendment, decided per requirement by whether anything of it
survives:

- **C1's `A team may be sized...`** — everything survives except its last
  paragraph, which says two projects sharing a team each get its full size. The
  body is the engine's rule and the engine did not change. RENAMED (the header
  carries "sized", the retired verb) and MODIFIED, keeping its three scenarios
  and adding a fourth for the two-project case.
- **C2's `A team's size and a work item's parallelism may be written...`** — the
  parallelism half survives intact and the size half names a deleted route.
  REMOVED, with the parallelism half restated whole under `ADDED`. Splitting it
  is what lets the removal be honest: `MODIFIED` would have left the header
  promising a team-size route.
- **C2's `Sizing a team tells every project whose dates it moves`** — nothing
  survives. The route is gone and the announcement rule inverted. REMOVED.
- **C3's `A team's size can be stated in the directory...`** — nothing survives
  as written; every rule inside it that still applies (empty means unstated, a
  non-finite draft is refused locally, a refusal is a sentence) was carried
  forward verbatim by C5's replacement. REMOVED, and the Migration names where
  each rule went.

The alternative was to leave them and let the archive sort it out. Rejected: the
delta folders are what `openspec validate` reads and what the next change's
author greps, and four of them currently answer "how does capacity work?" with
the model that was replaced.

## D4 — `docs/capacity.md` is a new file, not lines in an existing one

R1 caps `LLM_README.md` at 150 lines and it stands at 147. R3 puts knowledge
that spans files in `docs/` and links it from the JSDoc. `HUMAN_README.md` is
about operating the deployment and `README.md` is about the repo; neither has a
"what the product does" section for this to join.

So: one page, one row in `LLM_README.md`'s doc index (148 lines), and one link
from `schema.ts`'s `serviceTeamId` — the field a reader lands on when they go
looking for where the number lives.

Not an ADR. `docs/adr/` is for decisions hard to reverse, surprising, and with
real alternatives; this page records no decision. The decisions it summarises
already have homes — C1's D7, C5's D1 and D5 — and it links rather than copies.

## D5 — the glossary gains nine terms and corrects four

Nine because the four changes used all nine as though they were defined:
capacity, pool, slot, block, width, blocking set, display referent, maximum
parallelism, and the unnamed third state that becomes **remembered capacity**.

Four corrections, each a sentence the engine stopped honouring:

| Term                | What was wrong                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Service team`      | Read as if a team were only a label. It still is, about **who**; it is now also what a capacity is stated against.                                                                     |
| `Binding floor`     | Listed five things a start can be set by. There are six — `capacity` was added by C1, ordered after `person`.                                                                          |
| `Priority`          | "Decides which of two slices competing for one **person** is placed first" — the competition is now also for slots, and placed is not started.                                         |
| `Resource leveling` | Its `_Avoid_` list said "capacity planning", which is now a real neighbouring term rather than a word to steer away from. Leveling stays per person; the per-team bound is a capacity. |

`Remembered capacity` is the one term here that names a defect rather than a
feature. It earns an entry anyway: C5 recorded the state and observed that no
artifact had named it, and a state with no name is a state nobody can report.

## D6 — the rule that took two of C3's six P3s, and none of C5's

**A P3 is C4's if fixing it changes words. It is not C4's if fixing it changes
what the tool does.** A docs change that quietly repairs behaviour is a change
whose diff nobody can review against its title.

Taken:

- **`and 1 others`** — copy, on the commonest non-trivial blocking set, with a
  test pinning the wrong string. One expression, two tests.
- **`ExportSlice`'s docstring** — it credits `effort` and `duration` with work
  the CSV does not ask them for. The docstring is corrected and the two fields
  stay: deleting them changes the payload three files build, which is the
  export's shape rather than its words.

Left, with the reason:

- **`commitRename` drops an unsent size draft** — a behaviour, and a fix means
  splitting `forgetDraft`.
- **The chart never says the size clamped the width** — a new sentence in a
  place the plan's §4.3 letter lists three and not this one. `docs/capacity.md`
  states the gap in prose, which is as far as words reach.
- **The `∥` cell mutes per row where be-01 collapses per slice** — a behaviour,
  and the fix is a per-slice read the table does not have.
- **The over-bar `{team} ×{n}` label reaches every team-labelled plan** — a
  visual to compare a screenshot against, not a sentence.

C5's deferred list contributes nothing to the diff, and its two doc-shaped
entries were judged as follows. **`CapacityService.set`'s unread response body**
— the JSDoc there argues for the body and is true about it; what is unstated is
that `listFor`'s SQLite collation and `tree()`'s `localeCompare` cannot disagree
only because team ids are lowercase-hex UUIDs. That is a JSDoc on a repository
method, and C5's own entry says "left as it is: nothing is broken". Adding a
sentence about a latent ordering assumption to a file this change otherwise does
not touch is scope creep dressed as tidiness. **The capacity that survives its
last label** — taken, as `CONTEXT.md`'s `Remembered capacity` and a section of
`docs/capacity.md`, because that entry's own complaint was that no artifact
named it.

## D7 — one thing here is testable, so one thing here is proved red-first

`and 1 others` is the only claim in this change a test can hold. It gets two:
the existing two-blocker case, edited to the string it should have been, and a
new three-blocker case so that "always say `other`" cannot pass. Both faults
were injected and watched — `verify.md`'s R5 table.

Everything else is prose, and prose has no negative test. What it has instead is
a grep: every factual claim in `docs/capacity.md` and every corrected term in
`CONTEXT.md` was checked against the symbol that implements it, and `verify.md`
lists the file and line each was checked at. A documentation change's
equivalent of a watched red is a citation somebody else can re-run.
