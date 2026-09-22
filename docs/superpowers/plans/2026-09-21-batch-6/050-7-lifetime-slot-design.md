# The frontend lifetime slot: states, events, invariants

Written 2026-09-22, after three review rounds each found a new race in the same owner. This is the
design the implementation and its model test are held to; the work packet
[050-7-a](050-7-a-frontend-lifetimes-first.md) carries it. Authority for the behaviour is the
[050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md) and
[the DI Bag 0.4.0 research](../../../research/2026-09-21-di-bag-0-4-lifecycle.md); what is new here is
the **ownership rule, stated as invariants the implementation must hold at every point, including
inside callbacks**, and the two decisions that close the races for good. The model test checks those
invariants over a drained run — every request settled, every scheduled promise resolved — plus two
that a fixture can watch continuously: disposal overlap, and the status a disposer sees. The example
tests carry the rest.

## Why a design note at all

Each round found a defect the previous round's tests could not see, and every one was the same shape:
**something happened between two steps of a transition.**

| Round | Race                                                                                                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Two replacements requested in one tick each built and published; one runtime was never closed.                                                                                                                                                            |
| 2     | A replacement requested **while the old runtime was being disposed** passed a fence checked only before that disposal.                                                                                                                                    |
| 3     | A subscriber invoked **synchronously by `publish({ status: 'constructing' })`** requested another replacement before the factory ran; the runtime it then built belonged to nobody. Separately, `open()` bypassed the queue and the transaction entirely. |

Hand-written scenarios kept missing the next interval. So the rule is written down first, and a
model-based test generates the interleavings — including re-entrant requests — rather than a human
imagining them.

## States

Five, and `snapshot()` is correct the instant a request is accepted.

| State          | Meaning                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `empty`        | nothing owned, nothing running                                           |
| `live`         | one runtime owned and published                                          |
| `retiring`     | publication withdrawn; the old runtime's bounded disposal is in flight   |
| `constructing` | nothing published; a factory is running or about to                      |
| `fatal`        | the sanitized public report, plus `terminal`: may this slot build again? |

`terminal` is the honest distinction, not a flag for convenience:

- a **disposal** that rejected or outran its wait may still hold what it was asked to give back — a
  socket, a timer, a lock — so nothing may be published on top of it, ever;
- a **construction** that failed and whose acquisitions were **released** holds nothing, so a later
  request may build. A release that itself fails or times out is terminal again.

## Events

| Event                                       | Where it comes from                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `replace(acquire)`                          | bootstrap (the first publication), identity change, selection change   |
| `retire()`                                  | route unmount, local exit, page hide, hot-reload disposal              |
| retirement settles                          | DI Bag's `close()` resolving                                           |
| retirement rejects                          | `DiBagCleanupError` — a disposer threw                                 |
| retirement outruns its budget               | `DiBagCloseCancelledError` — the wait ended, the disposal did not      |
| construction settles                        | the factory returned a runtime                                         |
| construction throws having acquired         | `PartialAcquisitionError`, carrying the bounded close for what it took |
| construction throws having acquired nothing | any other throw from the factory                                       |
| **re-entrant request from a subscriber**    | a `subscribe` listener calling `replace`/`retire`                      |
| **re-entrant request from a factory**       | an `acquire` calling `replace`/`retire`                                |

There is **no `open`**. A lifetime's first runtime is a `replace` on an empty slot, awaited like any
other: initial acquisition is then bounded, queued and transactional. `open()` beside the queue was
how an initial partial acquisition leaked and how a queued replacement came to overwrite a live
runtime. The page's bootstrap awaits the first `replace` before it creates the React root, which is
what DI Bag's own React guide prescribes anyway.

## Invariants

These hold at **every** observation point — between steps, inside a disposer, inside a factory, and
inside a subscriber:

1. **One live runtime.** At most one runtime is published at a time, and the published one is the last
   that was published.
2. **Ownership is accounted for.** Every runtime a factory handed out is either the live one or has
   had its bounded close **attempted exactly once** — attempted, because a failing disposer may never
   complete, and "was it attempted" is the part the owner controls. This holds in `fatal` too.
3. **No two disposals overlap.** One transition runs at a time.
4. **Withdrawal precedes disposal.** Publication is withdrawn synchronously when a request is
   accepted, before any disposer runs, so no reader can see a runtime the page has given up on.
5. **A superseded request never publishes.** If a newer request existed when a request's factory ran,
   that request does not publish; anything it did acquire is given back.
6. **The latest request wins.** Unless the slot is fatal, the newest request gets what it asked for:
   a replacement publishes, a retirement empties.
7. **Terminal is terminal.** After a disposal failure or a failed partial release, no request
   publishes anything, including requests already queued when the failure happened.
8. **A bounded wait that expires is not a cancellation.** The owner keeps the shared cleanup promise
   and reports how it ended, and never resumes the refused transition when it does.

## The two decisions

### Subscribers never run while the slot is being mutated

**Chosen: publish synchronously, notify from a microtask, coalescing.** `publish()` assigns the state
immediately — invariant 4 needs that, and so does `useSyncExternalStore`, whose `getSnapshot` must be
right the moment the store says it changed — and schedules one microtask that notifies every listener.

Why this rather than "recheck the ordinal after every publish": rechecking is _also_ required (see
below), but it cannot be the whole answer. A synchronous listener can call `replace`, whose `accept()`
withdraws publication and mutates `withdrawn`/`held` **in the middle of another transition's
bookkeeping**; the ordinal check that follows would then be reasoning about a state two requests were
writing at once. Deferring notification removes the class instead of patching one instance: at every
point where the slot mutates itself, no foreign code is on the stack.

The price is that a subscriber is not woken for every intermediate state — `constructing` may be
coalesced away — and the tests say so. What a subscriber is guaranteed is that every state it _does_
read is a committed one, and that it never sees two live runtimes.

### The generation is rechecked after every await **and after the factory returns**

A factory is foreign code that the slot has to run inline, so it can re-enter even with notification
deferred. Therefore:

- after the queue and the disposal, before constructing: a request that was overtaken **does not
  build**;
- after the factory returns: a request that was overtaken **gives back what it built** — it is
  withdrawn, disposed under the same budget, and the request is refused as superseded.

Both fences are kept even though either one alone hides most of the other's symptoms, and each has its
own failing mutation: dropping the first lets a doomed request build a socket for nothing (a build
count proves it); dropping the second leaks that socket (the model test proves it).

## The model test, and its teeth

`apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts` generates command sequences —
`replace` (with a disposal that settles, rejects or never settles; optionally a partial acquisition;
optionally re-entrant from its factory or from a listener), `retire`, and "let one scheduled promise
settle" — and drives them under `fc.scheduler()`, which owns the order in which disposals, releases
and re-entrant requests settle. The **model** is a reference recorder of the ownership rule above: it
does not simulate the slot's schedule (which of two overtaking requests reaches its factory is a
timing fact, and a model that predicted it would be the implementation twice), it records what
happened and asserts the invariants once the run has drained. Two of them it does watch continuously,
because a fixture can: the number of disposals in flight, and the status the slot published as seen
from inside a disposer.

The budget is 1 ms, and a `never` disposer therefore always times out: the instant is not controlled,
but the outcome is, and it is DI Bag's own `DiBagCloseCancelledError` rather than a hand-made
rejection. Seed and run count are pinned so the executor walks the interleavings the planner did.

**A property test is worth only what its sabotages prove.** Six were run; each must fail:

| Sabotage                                  | Fails on                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| remove the serialization wait             | model test: a runtime acquired and never disposed; two example tests                     |
| reject every replacement as superseded    | model test: "the latest request did not win"                                             |
| skip the release of a partial acquisition | model test: a runtime acquired and never disposed, in a `fatal` state                    |
| drop the fence after the factory          | model test: a runtime acquired and never disposed while another is live                  |
| drop the fence after the disposal         | two example tests, on factory-call counts (the model test stays silent)                  |
| notify subscribers synchronously          | the subscriber-reentry example test (and, on the round-2 implementation, the model test) |

The last two rows are the honest limits: the model test does not distinguish "built and given back"
from "never built", and it did not catch synchronous notification on _this_ implementation, though it
caught the same defect on the previous one. Those two checks are therefore proved by example tests
with factory-call counts, not by the property.

**One sabotage was withdrawn as vacuous.** "Skip the disposal when the slot is already fatal" left
every case green because the branch is unreachable: after a terminal failure nothing is ever
published, so nothing is ever withdrawn again. It was replaced by the reachable fatal-state ownership
case — skipping the partial release — which does fail.

## Consequences for the packets after this one

- Composition roots must be **transactional**: retain the bag, then resolve, and on a failure raise
  `PartialAcquisitionError` carrying that bag's bounded close. Measured: DI Bag releases a partially
  acquired graph only through `close()` on the bag that acquired it.
- The bootstrap **awaits** the first `replace` before creating the React root, and renders the
  sanitized fatal state for both flavours of `fatal`.
- A lifetime that ever needs an **asynchronous** construction adds a fence after that await and a
  command to the model test; `Acquire<S>` being synchronous is what makes two fences sufficient today.
