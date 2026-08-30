<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

The capacity program ran as four changes — C1 `capacity-engine` (#48), C2
`capacity-write-paths` (#53), C3 `capacity-ui` (#57), C5 `capacity-per-project`
(#58) — and each named **C4** in its non-goals. This is C4, written last on
purpose so it could cover C5, which reversed part of what C1 wrote.

Nothing in this repo tells a reader what capacity is. `CONTEXT.md` is the domain
glossary and holds not one of the program's terms, against a rule
(`openspec/config.yaml`) that says to write them there as they resolve. Four
live requirements still describe the global `service_team.size` model C5
retired. And `Service team`, `Priority`, `Binding floor` and `Resource leveling`
each say something the engine has stopped doing.

## What Changes

**The priority sentence, which is C4 by name.** C1's D7: a priority-1 block
needing 3 slots is overtaken by a priority-2 block needing 1, because the narrow
one fits a hole the wide one cannot use. `priority-column` wrote _"placed first
and starts earlier"_. Placed first, yes. MODIFIED, with a scenario for the
overtake.

**Four requirements describing a model nothing runs.** C5 ADDED its per-project
requirements beside C1's, C2's and C3's global ones rather than superseding
them, so the spec now says both. RENAMED, MODIFIED and REMOVED, each with its
reason.

**The glossary.** Nine terms the program resolved and never wrote down, and four
existing terms it made wrong.

**`docs/capacity.md`** — what the number does to a plan's dates, where it is
typed since C5 moved it out of the directory onto the plan's toolbar, and the
chart's sentence read word by word. Linked from `LLM_README.md` and from the
JSDoc of the symbol it explains.

**Two of C3's six recorded P3s**, both copy: `and 1 others` for a set of two,
and `ExportSlice`'s docstring crediting three fields where one does the work.

## Non-goals

The other four P3s and C5's deferred list — each is a behaviour, not a sentence.
Dropping `serviceTeam.size`. The cloud regression. Any new capacity behaviour:
every date this change produces is the date `f2d021b` produces.
