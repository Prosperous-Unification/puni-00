## Context

WBS 080.19 first implementation packet. Baseline
`c5f16573afab47065bd8b6d4dba40755544ca8e3`; isolated planning branch
`plan/board-dash-boundaries`. The coordinator adopts the in-repository facade
under standing delegation. This combined brainstorming/grilling/domain-modeling
record distinguishes architecture decisions from facts still needed for live
migration; it claims no fresh human interview or host inspection.

Existing production paths:

- `tools/tool-fleet/src/entrypoint.ts` dispatches `plan` to `cli.ts::runPlan`.
  That path decodes exact flags, reads supplied fleet/observation, checks lab
  isolation and enrollment identity, calls `plan.ts::planOperation`, writes a
  new mode-0600 file exclusively, then prints summary/digest. Do not bypass it
  with `planOperation` alone: enrollment and lab checks also live above it.
- `cli.ts::runApply` and `production-apply.ts` own mutation; the facade must not
  offer their invocation in this slice. `cli.ts` currently imports some shared
  production-apply helpers; import presence alone does not prove an effect.
  Test actual dispatches and filesystem state, not just module-name absence.
- Burokrat `src/admission/authority-store.ts::openAuthorityStore` can initialize
  missing state; `resolveAuthorityDatabasePath` and schema
  `module-wiki-authority.v5` bind a common-Git authority. Do not open it for this
  planning command.
- `tools/tool-deploy/src/k8s/release.ts`, `execute.ts` and `journal.ts` retain
  release identity, lease, write fencing, migration and rollback state.
  `bin/h2puni-gate.sh` retains the host heavy lock.

## Goals / Non-Goals

Add one useful Dash entrypoint that preserves a working fleet contract. No new
plan envelope, duplicated digest, runtime journal, trust store, server or
persistent authority. This does not complete 080.19's authority relocation.

## Decisions

| Design branch challenged                | Adopted answer                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Command alias or full dispatcher first? | A narrow typed CLI adapter for enrollment planning only; no generic argv forwarding.                    |
| Build/fleet/deploy in one first packet? | One existing production planning path. Build/deploy need separately reviewed capability packets.        |
| Does a plan authorize apply?            | No; preserve the existing plan contract and later apply admission.                                      |
| Should missing authority initialize?    | This command never opens authority. Later adoption must refuse absence; explicit bootstrap is separate. |
| One universal lease?                    | No; repository generations, fleet lease, release lease and heavy lock retain independent owners.        |
| Multi-host authority?                   | Excluded by existing ADR 0021; no new network contract.                                                 |
| Live caller compatibility?              | Inventory before extraction; no migration diagnostic or compatibility promise is invented now.          |

Create `apps/twilight-structure/twilight-dash/cli` with Nx project name
`twilight-dash`, following repository Bun application/TypeScript/ESLint conventions.
Keep production routing in `src/cli.ts::runDash(argv)` and execution in
`src/entrypoint.ts`. Accept only `plan-enrollment` and the exact eight existing
fleet flags (`--fleet`, `--observation`, `--output`, `--node`, `--cluster`,
`--inventory-sha256`, `--ansible-variables-sha256`, `--known-hosts-sha256`). Normalize validated named values into the fixed fleet invocation;
never spread unchecked argv. Delegate through an in-process adapter importing
`runPlan`, not a shell. The implementation must follow existing import-boundary
rules; if a narrow fleet public export is required, expose the existing function
without changing its implementation or widening global lint policy.

Only caller-supplied planning documents and digests are accepted. The CLI has no
credential flags or adapter/executable selectors. A failure exits nonzero with required-file context. Schema errors and YAML/JSON
parser diagnostics expose no input values or raw causes; YAML warnings fail closed
with only their code and position, without printing source lines. YAML-to-object
conversion runs with error-only library logging and only after a recursive node
check requires every mapping key to be a literal scalar string; collection,
alias and object-valued scalar keys refuse before conversion can stringify them. Documentation states the plan is prepared, not applied, and
points execution users to the existing fleet procedure.

## Risks / Trade-offs

Delegating to the production CLI path preserves its guards but imports a module
with other capabilities. Strict dispatch tests and observed canaries prove the
reachable behavior; optional later mechanical extraction needs its own evidence.
No existing command may change behavior to make the wrapper easier to test.
Do not use real enrollment inputs or tokens in checked-in fixtures.

## Migration Plan

No migration in this packet. Later 080.19 packets must inventory actual stores,
callers and binaries before extracting claims/generations/submission/integration/
publication cohesively. Preserve common-Git DB path, schema, generation/packet
identities and publication markers. Rehearse backup, stopped writers, crash
recovery before/after Git publication and rollback. Fence old binaries through
a verified launcher; if that cannot be proved, design a versioned writer fence
before cutover. Never copy active leases into an empty store or dual-write.

Build/fleet/deploy apply additions later need stable effect IDs, durable intent,
exact plan/target/verdict binding, and observe-before-retry after lost responses.
Existing adapter journals remain authoritative. No blindly repeated remote call.

## Open Questions

None for this planning-only command. Live authority activation, installed caller
inventory, permissible pause and old-writer retirement are evidence prerequisites
for future migration, not a reason to stall the local facade. No authority
activation or deployment is authorized by these artifacts alone.
