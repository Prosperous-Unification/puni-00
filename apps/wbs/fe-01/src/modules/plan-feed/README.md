# Plan feed

One project's reading of the plan: the refresh owner of this project and API lifetime, the live
subscription it opens once an anchor exists, the sequence it acknowledges, and the decision about
which part of an owner snapshot the reader has not been given yet.

Two kinds in one module, because the feature exclusively owns the resource. Both are plain
TypeScript and import no React, which is rule F1 of the code organization design in
`docs/superpowers/specs/2026-09-19-code-organization-design.md`, and both expose the one store
contract in `apps/wbs/fe-01/src/modules/store.ts`, which is rule F2.

- `plan-feed.resource.ts` is the **resource**-service: one aggregate — the plan as this browser
  holds it — its staleness, its refresh and its stream replay.
- `plan-feed.feature.ts` is the **feature**-service: the live plan on screen for as long as this
  reader owns it, which is what a screen asks for and the only thing delivery may import (rule
  K2).
- `composition.ts` is where the refresh owner's factory and the feature meet. A screen calls it.

## What the resource owns

- The refresh owner's lifetime: built for one project and one API, closed with them.
- Opening the stream exactly once, when the first anchored read has landed, at that anchor's
  sequence; and never opening a second one during a recovery.
- Acknowledging a covered sequence to the stream, and only ever forwards.
- Routing what a frame said changed: an unsequenced frame asks for a fresh baseline, a named one
  asks for the resources it names.
- The generation ledger: which of the four resources has something the reader has not had, and
  the rule that nothing below the anchor is published before the anchor is.
- What "read again" means when nothing is anchored yet and something is stale.

## What the feature owns

Whether this reader still owns the screen, at the two moments that question has different answers:
the project or the API changing under it, and the screen closing. Everything the resource produces
passes through that one test on its way out — a publication, a refusal of the first read, a
connection change — so a reader that has gone is told nothing.

## What neither owns

Anything React holds, and any sentence. The rows, the chart payload, the vocabularies, the undo
stack, the estimate drafts and the hover card belong to the plan read hook, which applies each
delivery to them; a refusal travels as its **cause**, and the words for it are built where they
are said. Gestures belong to the plan writer beside this module. Presence stays with the page that
renders the header.

## How it is read

Two ways, over one source of truth. The store contract — `subscribe` and `snapshot`, the refresh
owner's own, whose snapshot object is rebuilt only when something in it changed — is what any
future reader selects from. Beside it, the host is handed a **delivery**: what changed since the
last publication, computed from that same snapshot and the generations already applied. Today's
reader is twenty React states and two refs mutated in one pass, so it takes the delta; turning it
into a selected snapshot is the lifetimes task of the rollout plan, not an extraction.

## Relationships

There is no `module.ts`: DI Bag 0.4.0 is installed but nothing in this application is composed
through it yet, which is the rollout's lifetimes task, so `composition.ts` is a function, as
`modules/directory-management/composition.ts` is. Its one caller today is
`apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, which also wires this feed to the plan writer
module beside it: the writer compares the owner's identity and sends its rereads back through the
hook.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suites are
`plan-feed.resource.test.ts` and `plan-feed.feature.test.ts`. The behaviour this extraction
preserves is proved by the plan table's and the project page's own suites, which run in the `test`
target of the same project.
