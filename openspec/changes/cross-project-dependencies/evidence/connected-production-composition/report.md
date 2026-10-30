# Bounded production connected optimizer composition

Base: `b17cd84f0`, isolated clone `/tmp/puni-connected-composition`.

`buildServices` now installs connected captured readers only when its optimizer
runtime exists, using that runtime's solver version/budget and the injected time
source. `SqliteSource.bindLivePlans` accepts that configuration and spreads it
into both owned and borrowed live stores. The installed coordinator receives
`hashConnectedBytes` through the actual `installOptimization` provider and module
forwarding, and calls `workItems.optimizationCapture` for background and queued
work. Existing source-owned reservation, observation, outcome, dequeue and
reconciliation owners remain installed.

The digest required two additional production files beyond source/services:
`module/optimization/check.ts` and `module.ts`. The direct module test's host
fixture now registers the optional digest service as well. No coordinator logic,
history codec, migration, authoring activation or UI changed.

## Production consumers

`apps/wbs/be-01/src/services-connected.db.test.ts` composes actual `buildServices`
over real migrated SQLite. Synthetic persisted dependency authority is seeded
explicitly; production external authoring remains dormant.

- Both isolated/shared modes: mounted upstream `setEstimate` commits trigger the
  recipient optimizer through durable fanout. The launcher observes zero open
  read connections and receives exact captured pre-selection stage bytes,
  input hash and objective-specific question hash.
- Boundary-infeasible child outcomes become visible through mounted tree reads.
  Same-question manual Retry returns typed 409, background notifications launch
  no additional child, and another upstream edit admits the changed question.
- Valid cache-ready answers seeded from an independent real SQLite capture are
  read by mounted public tree, export, shared aggregate and mounted borrowed
  tree inside the installed source UoW. Final target starts equal the retained
  real placement. None of these reads creates a generation, slot or queue, or
  launches a child.
- Startup dequeues persisted Q1, re-captures Q2 after a foreign estimate change,
  releases Q1 and launches only Q2. Missing foreign calendar and malformed trusted
  estimate capture both consume the queued entry and release every slot. The
  latter reaches the installed error sink; all owned read connections close.
- Runtime absence returns explicit `engine_unavailable/adapter_missing`, installs
  no coordinator and allocates no solver state.

## Watched production mutations

Each mutation was applied independently, run with `bun test
apps/wbs/be-01/src/services-connected.db.test.ts -t '<filter>'`, observed failing,
and restored before final checks. `ready tree` selects the two mode cases;
`exact detached` selects the two mounted edit cases. Adjacent `Proof:` comments
refer to these observed failures. Scratch logs are
`/tmp/connected-fault-<fault>.log`.

| Fault                | Production mutation                                                                    | Observed assertion                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing-config`     | Remove services' connected runtime configuration                                       | Both mounted ready trees return unavailable instead of `optimization.variants.time.state: ready`.                                                 |
| `borrowed-config`    | Override `connected: undefined` in source's borrowed live-store construction           | Both mounted borrowed trees disagree with the owned ready tree; borrowed capability is unavailable.                                               |
| `legacy-capture`     | Restore coordinator `captureOf` to `optimizationInput`                                 | Mounted upstream command succeeds, then the error-sink assertion receives `connected optimization input is unsupported` instead of an empty list. |
| `missing-hash`       | Pass `hashConnectedBytes: undefined` from services                                     | Mounted edit error sink receives `connected optimizer lacks installed digest`.                                                                    |
| `dropped-provider`   | Make installer digest provider return undefined                                        | Same mounted edit error-sink failure.                                                                                                             |
| `dropped-forwarding` | Forward undefined from module's options object while preserving destructuring/provider | Same mounted edit error-sink failure.                                                                                                             |
| `wrong-placement`    | Add one day to `translateSpan`'s final `earliestStart`                                 | Mounted slice `a1\u0000a1-s` starts at 2 instead of the retained stage's 1, in both modes.                                                        |

Every recorded mutation run exits 1 with two assertion failures. An initial
module-forwarding experiment accidentally changed destructuring and threw
`ReferenceError` during composition; it was discarded and rerun against the
returned options field. It is not evidence for forwarding behavior.

## Scope limits

The ready candidate in this packet equals the real Fast baseline. The packet
establishes installed ready selection and exact final projection, but does not
re-prove improved optimized displacement, a later stage retaining foreign C=8
while final C=6, every capacity contention, or the complete terminal/restart
matrix. Runtime absence is tested before admission; loss of an engine after a
slot has already been dequeued is not independently covered here. The controlled
launcher returns strict wire-v5 terminal output and does not execute Python or
an installed solver process/image. Broader optimizer acceptance, parent tasks
7.3/7.4/8.3/8.4, production external authoring activation and rollout remain open.

No full Nx repository gate, standalone build, browser suite, host h2/h4 gate,
push, deployment, or independent CI secrets/migration scan was run. Dependencies
are reused through a node_modules symlink; no frozen reinstall is claimed.

## Scoped verification

- `bun test apps/wbs/be-01/src/services-connected.db.test.ts --timeout=10000`:
  **8 passed, 0 failed, 108 assertions** (`/tmp/connected-focused-final.log`).
- Backend services, optimization module and mounted connected Retry regressions,
  using the backend's configured 10-second timeout: **196 passed, 0 failed,
  1,263 assertions** (`/tmp/connected-backend-regression.log`). This run precedes
  the final added question-hash/manual-Retry assertions, which the focused run
  above covers.
- Source, captured scheduler, connected live-plan/cache/reader suites, using the
  adapter's configured 30-second timeout: **94 passed, 0 failed, 436 assertions**
  (`/tmp/connected-adapter-regression.log`).
- Mounted dormant node-authoring refusal: **1 passed, 0 failed, 8 assertions**
  (`/tmp/connected-dormant.log`).
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false`: exit 0.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
wbs-be-01:typecheck:module`: exit 0.
- Changed-file ESLint: exit 0, no diagnostics. The real Nx graph was generated
  first with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show projects`.
- Changed-file Prettier and `git diff --check`: exit 0.
- `node_modules/.bin/openspec validate --all --json`: **270 passed, 0 failed**
  (252 changes, 18 specs; existing long-requirement warnings).
- Normal hook installation through `bunx nx run tool-git-hooks:install`: exit 0.
  The normal commit transcript is `/tmp/connected-commit.log`; no hook bypass is
  authorized or used by this packet.
