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
"every sealed DI module has a pilot registration": discovering an unregistered module is also out
of scope. Whether an index block's `moduleId` names the same label its module's own `buildModule`
call seals its bag under is explicitly **not** checked by task 7.5: four review rounds against a
machine-checked version of that specific claim each found a new bypass, so it is deferred to a
later change with its own design (040.6 packet D's "Deferred: label agreement").
