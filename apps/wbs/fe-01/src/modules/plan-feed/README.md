# Plan feed

<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.plan-feed","memberships":[{"kind":"path","path":"composition.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"delivered-plan-store.model.test.ts"},{"kind":"path","path":"delivered-plan-store.ts"},{"kind":"path","path":"plan-feed.feature.test.ts"},{"kind":"path","path":"plan-feed.feature.ts"},{"kind":"path","path":"plan-feed.resource.test.ts"},{"kind":"path","path":"plan-feed.resource.ts"},{"kind":"path","path":"presence-store.model.test.ts"},{"kind":"path","path":"presence-store.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"The anchor rule and the one-stream rule are documented on the resource, and the stores carry their own model tests; the ownership test between feature and resource is described under What the feature owns below."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/project-page.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-read.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/composition.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->

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
- `composition.ts` is where the refresh owner's factory and the feature meet, over the routes the
  refresh owner reads — `PlanReadRoutes` in `apps/wbs/fe-01/src/lib/plan-refresh.ts`, this
  module's private repository port. The project composition root calls it; a screen does not.
- `delivered-plan-store.ts` is the **store** the feed publishes into: every publication folded
  into the one snapshot a screen selects from, with the connection the stream last reported.
- `presence-store.ts` is the **store** of who else has the project open and whether the socket
  saying so is up. The project runtime owns one per selected project, and its stream writes into
  it only while that runtime is current.

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
are said. Gestures belong to the plan writer beside this module. Which presence the header shows is the
page's choice: the current project runtime's, or nobody while none is published.

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
`modules/directory-management/composition.ts` is. Its one caller is the project composition root,
`modules/project/composition.ts`, which hands it the page's one client as its routes. The plan read
runtime, `apps/wbs/fe-01/src/runtime/project-runtime.ts`, opens the feed once per selected project
through the project's services, with the delivered plan and the presence it writes into, and
wires it to the plan writer module beside it: the writer compares the owner's identity and sends
its rereads through the runtime, which reads only while it is current. The runtime gives the feed
back — owner disposed, stream unsubscribed — when the page's project owner retires it.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suites are
`plan-feed.resource.test.ts`, `plan-feed.feature.test.ts` and the two store model tests. The behaviour this extraction
preserves is proved by the plan table's and the project page's own suites, which run in the `test`
target of the same project.

Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
