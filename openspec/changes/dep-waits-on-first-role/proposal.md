<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

A dependency today holds the successor until the predecessor's **last** slice
finishes: 030 waits for 020's QA. Dany's call (2026-08-11): 030 needs 020's
**dev** — the rule his own pre-wbs scheduler applied ("deps retarget the DEV
task; nothing ever waits on QA"). The wait belongs to the predecessor's
**first slice in role order** — its _anchor slice_ — and its later roles run
in parallel with the successor.

Asked "first role in role order, or a per-project handoff flag?", Dany chose
**first-in-order**. A richer per-edge model (an edge naming which slice it
waits on) is wanted _in theory, later_; this change picks the default that
model would fall back to, and adds no schema for it.

## What Changes

**Engine.** The expanded edge joins the predecessor's **first** slice to the
successor's first, instead of last-to-first. Parent ends still expand to
leaves: every predecessor leaf's anchor finishes before any successor leaf
starts. Successor-side attachment, floors, cycle detection at the write, and
the item-anchored arithmetic are untouched.

**Gantt arrows.** An arrow drawn from the predecessor's projection finish can
now point backwards in time (successor starts while the predecessor's QA
runs). Arrows leave the anchor instead — selected from the slices already on
the wire, no payload change.

**Identity tests rescoped.** The oracle parity ("no plan that exists today
changes") survives only where the rule is the same: plans with no
dependencies, and single-role plans (first slice _is_ last). Multi-role plans
with dependencies move **by design**; new tests pin the new rule, and the
captured live-plan fixture is re-derived where it moves.

**Glossary.** `CONTEXT.md` gains **anchor slice**; **Dependency** is reworded.

## Non-Goals

- The nuanced model: per-edge anchor choice ("030 needs 020·qa"), lag/lead,
  start-to-start. The default rule here is what those would fall back to.
- A per-project handoff-role flag — considered, not chosen.
- Any UI for choosing anchors; the dep picker, chips, hover card and the
  cycle rule are untouched.
- No migration, no API shape change.
