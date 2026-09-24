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
- `delivered-plan-store.ts` is the **store** the feed publishes into: every publication folded
  into the one snapshot a screen selects from, with the connection the stream last reported.
- `presence-store.ts` is the **store** of who else has the project open and whether the socket
  saying so is up. The page owns it today and the project's stream writes into it.

Both stores are plain TypeScript over `modules/channel.ts`, keep their snapshot the same object
until a member changes, tell each listener once per change, and never throw a lifecycle refusal.
Their model tests, `delivered-plan-store.model.test.ts` and `presence-store.model.test.ts`, run
them against reference models under scheduler-ordered deliveries and re-entrant listeners.

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
owner's own, whose snapshot object is rebuilt only when something in it changed — is the feed's
own. Beside it, each publication is a **delivery**: what changed since the last one, computed
from that same snapshot and the generations already applied. The composition writes every
delivery into the reader's delivered plan, and the table selects from that store with
`useSyncExternalStore`; nothing the feed is built with is a React setter. What a delivery settles
beyond the values on screen — the hover card, drafts for a step that went — the table does from
the delivered plan's own notification.

## Relationships

There is no `module.ts`: DI Bag 0.4.0 is installed but nothing in this application is composed
through it yet, which is the rollout's lifetimes task, so `composition.ts` is a function, as
`modules/directory-management/composition.ts` is. Its one caller today is
`apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, which also wires this feed to the plan writer
module beside it: the writer compares the owner's identity and sends its rereads back through the
hook. The same hook builds the delivered plan once per table mount, and `project-page.tsx` builds
the presence store once per page mount; the project runtime of OpenSpec task 10 builds both
instead.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suites are
`plan-feed.resource.test.ts`, `plan-feed.feature.test.ts` and the two store model tests. The behaviour this extraction
preserves is proved by the plan table's and the project page's own suites, which run in the `test`
target of the same project.
