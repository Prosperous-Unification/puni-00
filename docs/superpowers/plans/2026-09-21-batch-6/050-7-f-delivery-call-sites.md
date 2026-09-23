# 050.7 f — delivery call sites onto the runtime's preferences: held

|             |                                                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **seventh packet, held**                                                                                                                                                               |
| Size class  | — a documentation record; no code, no test, no config change; no executor slice                                                                                                                                                                                                   |
| Predecessor | [050.7e](050-7-e-page-lifecycle.md) and the runtime services context of [050.7c](050-7-c-application-context.md); the full packet text lives on branch `plan/batch-6-050-7-f` at `f1b5f423` (3288 lines) and is not dispatched                                                    |
| Status      | **Held by the batch's convergence rule** (brief addendum, lesson 16): three review rounds refused the packet. The next artifact is a state-machine record plus a model-based test for `useTheme()` over the runtime slot, with four sabotage proofs, before any call-site packet. |

## 1. What converged

Round 3 (`puni-plan/reviews-batch-6/050-7-f-delivery-call-sites.round3.md`) reproduced these
runtime behaviours in an independent React probe and they stand as the design for the theme hook:

- `useTheme()` is the hook boundary over `useApplicationServicesState()`; the bare functions
  (`readTheme`, `rememberedTheme`) take a `Remembered<ThemeChoice>` parameter and own no singleton.
- Lifecycle refusal is typed: one `PreferenceStoreLifecycleError` with `kind: 'withdrawn' | 'revoked'`
  thrown from the two existing sites (`preferences.resource.ts`, `browser-storage.repository.ts`)
  with their messages unchanged, and a predicate `isPreferenceStoreLifecycleError`. The hook recovers
  from that error only and rethrows everything else; a live store whose write throws `write denied`
  propagates without changing the displayed choice or the stored bytes.
- The chooser writes first and sets state second. A chooser retained from a superseded runtime is a
  no-op (its store is compared by reference against the store the latest render holds).
- The resynchronisation effect handles withdrawal at its own access boundary: retiring the slot from a
  sibling layout effect before the passive effect runs yields the withdrawn state, not a throw.
- `Theme.persists` is the visible degradation while the runtime is withdrawn; a new OpenSpec
  requirement with three scenarios in `openspec/changes/adopt-frontend-lifetimes` describes it.

## 2. Why the packet is held, not revised again

| Round | Verdict   | New holes that round                                                                                                                                                                     |
| ----- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | NOT READY | six of seven fenced diffs corrupt; `choice` initialised once, so withdrawal and reactivation were not implemented; "never throws" false; silent persistence loss                         |
| 2     | NOT READY | blanket `catch` swallowed arbitrary storage failures; withdrawal between render and the passive effect threw inside the fault boundary; a superseded chooser corrupted the replacement   |
| 3     | NOT READY | the generated property reads its oracle from the production stores (a hook with no persistence and a hook without the superseded guard both pass it); two proof filters match zero tests |

Each round's fixes were real, and each round exposed a new hole in the same place: the interleaving
of chooser calls, effects, notifications and disposal. Lesson 16 names that pattern and its remedy.
Rounds 2 and 3 also repeated packet-form defects (OpenSpec sequencing, relative baselines, durable
wrappers, teardown ordering, the addendum table); they are listed in the round-3 review and are
inherited by whichever packet revives this work.

## 3. What comes next

1. **A state-machine record** for `useTheme()` over the application slot: states (no store; live
   store; withdrawn after live; replaced), the events (render, chooser call, notification, passive
   effect, disposal), the invariants (displayed choice and `persists` as functions of the model; a
   superseded chooser never changes the current runtime's state; unexpected storage errors propagate
   unchanged), and the interleavings that must be covered: a chooser call issued from inside a
   notification callback, a call while a transition is only partially acquired, a controlled disposal
   that stays open while assertions run.
2. **A model-based test** (`fc.asyncModelRun` with a reference model that keeps its own expected bytes,
   and `fc.scheduler()` ordering effects, notifications and disposal), pinned seed and run count,
   with **four sabotage proofs** rehearsed for real and their shrunk counterexamples pasted: remove
   persistence (`write` → `read`), remove the superseded-chooser guard, swallow non-lifecycle errors,
   and skip the effect's withdrawal handling.
3. **Only then** a call-site packet that implements the design of section 1 with the ordinary examples
   and the six independent mutations rehearsed in round 3, on a base recorded at dispatch time (not
   `276c1e36`), owning the OpenSpec specification in the implementation slice.

Task 3 of `openspec/changes/adopt-frontend-lifetimes/tasks.md` stays unchecked. The other four
delivery sites (project-settings modal, project page, `gantt-detail` through `WbsTable`, and the
module-scope `storedMermaidSectionMode` in `lib/remembered.ts`, which must become lazy) wait on the
same precursor.
