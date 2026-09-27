## Context

`compose.ts` hand-builds the graph; `bootBe01` owns the only bag. The 040.6 map settles ownership
but leaves the composition shape open, and the shape is not obvious: the core has two lifetimes in
one function, the process graph and the per-admission graph, and a naive module installation would
collapse them.

## Composition shape

Three layers, and only the third sees a bag.

1. `contract.ts` — the module's exported service types and the requirements a host supplies. It
   imports repository ports and domain types, never another module's implementation.
2. `module.ts` — `DiBag.createBuilder().register(...).buildModule([...exports], { label })`. Every
   collaborator that is not in the contract's exports stays unselected and therefore private to each
   installation. The label is the wiki module identifier without its `module.` prefix.
3. `check.ts` — the one function that installs the module over supplied requirements, builds the
   bag and returns the contract's exports. Callers receive services; nobody else builds a bag.

The label in step 2 is the module identifier without its `module.` prefix. A library module is
`module.<ring>.<name>`; a module under an app is `module.<runtime>.<name>` with the runtime taken
from the app it lives under, so Optimization, the Local solver launcher and the Supervisor are
`module.backend.*` while Plan history in the portable core is `module.application.plan-history`.

Layer 3 is the one that has to be tested rather than typed. An object carrying an extra property
still satisfies the exports interface when it is returned through a variable, so the type checker
does not refuse a returned bag; the module's tests enumerate the returned surface instead.

## Two lifetimes

- **Process modules** (Plan history, Realtime, Bounded replay sweep, Saved plans, Plan import,
  Authentication, Optimization) are installed once, where `composeServices` runs.
- **Per-admission modules** (the seven resource responsibilities and Plan commands) are installed
  by `servicesOver`, once per supplied scope. The map is explicit that a singleton here would leak
  staged stores and announcement collectors between transactions, so the scope is an input to the
  installation, never a value resolved from a process bag.

Because `buildServices` closes over the optimizer coordinator, the loud read-before-composition
error stays; the optimizer is not resolved lazily from a bag inside services.

## Disposal

Core modules register disposers only for resources they create. Today none of the core
responsibilities creates one: the source, the retention timer, the optimizer runtime and the
listener are all acquired and released by `bootBe01` in a tested order, and a nested
`withDisposal` inside a core module would double-close or reorder that shutdown.

## What sealing does not fix

Sealing declares a dependency; it does not relayer one. A feature-service that reads a repository
port still violates K3 after extraction, and delivery that reaches a resource-service directly
still violates K2. Both are recorded per module rather than hidden behind a module boundary, and
closing them needs resource-services and feature owners no accepted change supplies.

## Order of work

The map's eight no-sideways preparations come first, because every one of them removes an import a
module move would otherwise have to keep. `canEdit` and the `broadcast.ts` split are the two that
unblock the most modules. Each responsibility then moves with `git mv`, keeping its former path as
a compatibility re-export; `docs/code-organization/kinds.json` keeps one row per retained unsuffixed
shim and none for a file whose name declares its kind by suffix, because
`tools/tool-devsync/src/service-kinds.test.ts` refuses both the missing row and the duplicate one.

## Not decided here

The K2 feature owners for the resources delivery reaches directly remain outside this change's
claim. Wiki registration of each new module, by contrast, is adopted scope, but only its
pilot-mapping half: task 7.5 requires a `module-index` block naming every module file, and full
membership in the wiki's content-review pilot — both a `modules.json` row and a matching
`policy.json` boundary, required together (`trust.ts:1224-1230` refuses a mapped module without
exactly one matching boundary) — keeping a declared registration's mapping row, boundary and index
mutually consistent, checked by the pilot's own production `lint()` call. That is narrower than
"every sealed DI module has a pilot registration". Whether an index block's `moduleId` names the
same label its module's own `buildModule` call seals its bag under is **not** checked by task 7.5:
four review rounds against a source-reading version of that claim each found a new bypass (040.6
packet D's "Deferred: label agreement"). Task 7.6 checks it instead, as the next section says.

## Label agreement

`tools/tool-devsync/src/module-labels.test.ts` derives each module's identifier from where it lives
(`module.application.<name>` under the core's `src/module`, `module.backend.<name>` under be-01's)
and requires everything that names the module to agree with it. The label is read from the running
library, never from source: `module.ts` must export exactly one value, which is installed into an
empty builder, and every private binding `inspectGraph()` reports — a binding with no public key —
must be named `<label>/<identifier>`, so every module keeps at least one private binding by
convention. That defeats both of packet D's cut cases: a decoy export is a second exported value,
and an exported key containing a slash is not a private binding. The README must hold exactly one
HTML comment (in prose, a code span or a fence alike), its index line in the one spelling the check
reads, with no code fence opening above it, and that line must carry the identifier. The wiki reads
any comment containing `module-index`, so the check and the wiki read the same identifier or the
check refuses: a block inside a fence is refused, and a block the wiki reads across several lines is
refused as not a module-index line. A `modules.json` row and a `policy.json` boundary must both name
the module and its directory, or neither exists and the module is named by the check as
unregistered (Plan document, Plan import, Plan event and Event log; the latter two were added by
040.10 because the frozen pilot has no predecessor for their new directories). Every `kinds.json` shim row that names a
module must name one whose files export every value the shim re-exports, by identity; any other row
mentioning a shim must be one of the three library-forwarding forms on a be-01 path, and a forwarded
core service file must exist.

Three limits are stated rather than chased. di-bag 0.4.0 exposes a label only as the prefix of
private binding names, so a module that drops its label and either spells `<label>/<key>` into a
private key or installs an inner module sealed under that label reads as labelled; a library-exposed
label, the di-bag migration's, closes it. A be-01 owner row rewritten into the `@wbs/core directly`
or `@wbs/runtime-portable directly` form is skipped until forwarding rows are compared by identity
against the library's index; the kind rules own the wording. The frontend's
`apps/wbs/fe-01/src/modules` is outside this change and carries no index block yet.

Amended 2026-09-25 by `migrate-di-bag`: di-bag 0.5.0 still exposes a label only as that prefix —
`buildModule`'s `moduleLabel` (0.4.0's `label`) is write-only, held in a private `WeakMap` — so the
first limit stands, tracked as WBS 040.13; `inspectGraph()` is now `graphSnapshot()`, whose private
bindings carry an empty `serviceKeys` and a `bindingLabel`.

Amended 2026-09-26 by `di-bag-label-surface`: di-bag 0.5.1 exposes each sealed module's exact
label through its read-only `moduleLabel` getter. The label-agreement check reads the scanned
module itself, closing the forged-prefix and borrowed-inner limit above. Its private-binding
convention is no longer needed for label agreement. `graphSnapshot().moduleInstallations`
records empty and unlabelled installations with identity and parentage; bindings carry
`moduleInstallationId`, so a container-only consumer need not parse slash-delimited labels.
Capacity's own private-binding and failure-label tests retain their separate contract.

## Layering debt ledger

Task 7.4, per module: the obligations sealing leaves open, each stated in that module's
`contract.ts` or, for Authentication and Saved plans, in tasks 3.5 and 3.3, and who closes them.
"Feature owners" is the K2 closure this change declares outside its claim; "resource-services" is a
K3 follow-up needing a resource-service over the store named; task 6.1 moves the application-ring
support a resource still imports.

| Module               | K2 left open                                                                     | K3 left open                                 | Closed by                          |
| -------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------- |
| Plan history         | none stated                                                                      | none (closed by 040.10)                      | Plan event and Project resources   |
| Bounded replay sweep | none stated                                                                      | none (closed by 040.10)                      | Event log and Plan event resources |
| Realtime             | none stated                                                                      | none (closed by 040.10)                      | Event log resource                 |
| Saved plans          | rename and delete publish in `http/saved-plan.routes.ts` (task 3.3)              | none (closed by 040.10)                      | Saved plan persistence resource    |
| Plan import          | none stated                                                                      | the direct store writes inside its `uow` run | resource-services                  |
| Authentication       | throttle orchestration stays in delivery                                         | none (closed by 040.10)                      | Account resource                   |
| Optimization         | none stated                                                                      | feature depends on a repository port         | resource-services follow-up (7.4)  |
| Plan commands        | be-01 constructs `PlanCommandRunner`; routes take `WorkItemService`              | none                                         | feature owners                     |
| Plan document        | `http/project.routes.ts` installs it (a composition export changes `AppOptions`) | none                                         | Plan document composition export   |
| Calendar marker      | routes take `CalendarMarkerService`                                              | none                                         | feature owners                     |
| Capacity             | Plan commands and delivery name `CapacityService`                                | none                                         | feature owners                     |
| Directory            | routes, Plan import and Plan commands name `DirectoryService`                    | none (K4 support: task 6.1)                  | feature owners; task 6.1           |
| Priority band        | Plan commands and delivery name `PriorityBandService`                            | none                                         | feature owners                     |
| Project              | routes and Saved plans name `ProjectService`                                     | none                                         | feature owners                     |
| Step                 | `http/step.routes.ts` takes `StepService`                                        | none (K4 support: task 6.1)                  | feature owners; task 6.1           |
| Work item            | routes, Plan commands, Plan import and Saved plans name it                       | none (K4 support: task 6.1)                  | feature owners; task 6.1           |
| Solver launcher      | none                                                                             | none                                         | —                                  |
| Solver supervisor    | none                                                                             | none (K5 by the map's carve-out)             | —                                  |

## Optimization attempts and repository ports

The coordinator owns asynchronous orchestration; the proposed repository ports own durable observations and atomic decisions. This slice records the model and tests the current implementation before extraction.

| Concept        | Identity                                                                             |
| -------------- | ------------------------------------------------------------------------------------ |
| Generation     | `(projectId, contractVersion)` with generation, input hash, cancel epoch             |
| Solver slot    | `(projectId, contractVersion, generation, objective, budgetMs)`                      |
| Attempt        | Slot identity plus attempt token; owner ID identifies its coordinator                |
| Queue entry    | `(projectId, contractVersion, objective, budgetMs)` with generation and cancel epoch |
| Cached outcome | `(projectId, inputHash, objective, contractVersion, budgetMs)` with generation       |

Queued work is not an attempt. Dequeue reserves one; a queue entry can coexist with a matching retained slot. An attempt has independent **phase** (`reserved`, `binding`, `running`, `stopping`, `settling`, `finished`, `unobserved`), **ownership** (`held`, `released`, `reclaimed`), and **validity** (`current`, `cancelled`, `superseded`). These are model states, not new columns; persisted slot lifecycle remains `starting` or `running`. Publication is a separate result: stored, superseded, already recorded, or not attempted.

| Event                         | Transition and durable effect                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enabled plan read             | Allocate/reuse generation; read both outcomes; admit misses only.                                                                                                |
| Capacity refusal              | Queue objective; do not launch.                                                                                                                                  |
| Admission/dequeue             | Reserve counted `starting` slot with token, epoch, and deadlines; dequeue also removes the validated FIFO entry atomically.                                      |
| Preflight failure             | Record fenced failure and event, then release separately.                                                                                                        |
| Launcher/bind                 | Bind exact token and PID; send `bound` only on successful bind, otherwise abort and await exit.                                                                  |
| Generation change/OFF         | Supersede/cancel attempts but retain slots; allocation evicts old cache/queue, while OFF advances epochs and deletes queued work. ON cannot revive old attempts. |
| Heartbeat live/cancelled      | Refresh, or request kill and retain slot until exit and both streams complete.                                                                                   |
| Normal exit                   | Process fenced outcome while slot is held; release in a separate transaction, including on outcome failure.                                                      |
| Transport failure/owner crash | Without terminal evidence retain the slot; replacement owner does not adopt it.                                                                                  |
| Stored deadline               | Admission reclaims expired slots globally; reconciliation reclaims closed targets and finishes their drains.                                                     |
| Retry                         | Check stale input, retryability, liveness and admission in one immediate transaction; retain marker until replacement.                                           |

Current behavior: bind checks slot identity, token and `starting`, but does not recheck generation or cancel epoch. A cancellation during spawn may bind; heartbeat and commit fencing still prevent publication. A normal exit after cancellation may return lifecycle `exited`; its outcome transaction must reject the write.

- **I1 Admission/capacity:** every spawn follows reservation and every bound verdict follows exact-token bind. All retained slots count; limits are four per project and sixteen globally. Another coordinator cannot acquire an occupied slot.
- **I2 Ownership:** an old token cannot bind, refresh, publish through, or release a replacement slot.
- **I3 Publication:** at commit the attempt holds its owner/token, generation and cancel epoch, and the project is enabled. Rejection changes neither cache nor durable outcome events.
- **I4 Release:** kill alone cannot release capacity; terminal evidence or admitted-deadline reclamation is required. Preflight failure has no child to await.
- **I5 Recovery:** restart does not adopt or duplicate attempts. Blocked FIFO work remains queued and starts after release/reclaim plus pump. Releasing the last closed-target slot attempts drain completion atomically.
- **I6 Reads/Retry:** only misses auto-admit; failed/corrupt markers persist until Retry, which checks stale input before retryability, then liveness and capacity.
- **I7 Events:** one successful outcome write records one durable event atomically; live push starts after commit. Rejected writes add no event.

The slice 1 proposal was `SolverSlotRepository` (`refreshSlot`, `releaseSlot`) and `OptimizationRepository` (generation allocation, pair/liveness reads, reservation, bind, queue enqueue/dequeue, Retry admission, outcome recording and drain reconciliation). Slices 2–5 now supply these contracts from the SQLite adapter; the transaction units below remain the review map.

| Port operation                      | Current implementation                                 | Transaction boundary to preserve                                                          |
| ----------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `allocateGeneration`                | `allocateEnabledGeneration`                            | One immediate transaction.                                                                |
| `readPair` / `readLiveness`         | `readOptimizedPairAndSpawn` / `optimizedVariantIsLive` | Existing reads; no enclosing transaction; read before callback.                           |
| `reserveSlot` / `bindSlot`          | `reserveSolverSlot` / `bindSolverSlot`                 | Reservation transaction with expiry reclaim / atomic bind update.                         |
| `enqueueRequest` / `dequeueRequest` | `enqueueSolverRequest` / `dequeueSolverRequest`        | Separate enqueue transaction / validation, reserve and removal together.                  |
| `admitRetry`                        | Coordinator Retry body                                 | Entire immediate transaction, including token creation.                                   |
| `refreshSlot` / `releaseSlot`       | `heartbeatSolverSlot` / `releaseSolverSlot`            | Refresh and cancellation observation together / token delete and drain finishes together. |
| `recordOutcome`                     | `storeOptimizedOutcomeAndRecord`                       | Fences, cache and durable event in one transaction; release stays separate.               |
| `reconcileDrains`                   | `reconcileOptimizationDrains`                          | Scan and one transaction per target, not one enclosing pass.                              |
