# B4 producer-backed HTTP 409 reconciliation packet — 2026-10-23

## Scope

`connected-optimization-integration.test.tsx` now composes the real producer,
generated response decoder, `httpProjectApi`, project runtime/writer and mounted
table/cards with a plain API adapter. The controlled transport records every
method, path, JSON request body and GET count. Retry returns an actual JSON
`Response` with HTTP 409 and `{code:'not-retryable',state:'boundary-infeasible'}`;
its subsequent authoritative GET is held independently.

Six cases cover desktop width 1024 and card width 390:

- Failed Pri Q1 submits `q1`. While the refusal's GET is held, the complete old
  cue remains byte-for-byte equal, with failed Pri, existing terminal Time and
  unchanged fractional Fast dates. Only the released failed Pri Q2 tree replaces
  identity; the next explicit Retry submits `q2`.
- Terminal Pri Q2 evidence appears only after that GET. Pri remains disabled
  across click, Enter, Space and reopen; neither Retry nor settings PATCH is
  issued for that terminal question.
- A delayed refusal after same-project API/runtime replacement causes no old or
  new GET, no toast and no replacement cue mutation. A second delayed refusal
  after a project change on the same replacement API independently has the same
  effect; the replacement ready Time tree stays intact.

The fractional producer fixture additionally supports genuine terminal Pri,
prepared through `buildConnectedSolverRequest` and
`prepareConnectedBoundaryOutcome` independently of terminal Time, with objective
`pri` and question hash `q2-pri` rather than a relabeled Time certificate. Both
retain B's real start 0.2 and finish 1.2 with no deadlines. Controlled hashes
prove client identity replacement; they do not prove production hash derivation.
The replacement C fixture is the existing mixed-engine producer fixture.

## Red and fault receipts

The added core fixture test initially failed: terminal Pri without its own
certificate threw at `validateObservation` reading `state.certificate.question`.
After extending only the fixture, the same core file passed 34/34. No production
runtime behavior change was necessary: all six new HTTP cases initially passed
against the existing implementation.

Every fault below was injected independently into actual production code in
`/tmp/puni-connected-http-409`, then restored in a `finally` block. The selected
mounted command (run from `apps/wbs/fe-01`) was:

```sh
TZ=UTC bunx vitest run src/components/wbs/connected-optimization-integration.test.tsx -t '<case>' --no-file-parallelism --maxWorkers=1
```

`<case>` is the exact title `reconciles producer Q1 through HTTP 409 and held Q2
failed at width 1024`, its `boundary-infeasible` sibling, or `ignores delayed
producer HTTP 409 after runtime and project replacement at width 1024`.

| Independent production fault                                                           | Watched outcome                                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove writer's typed Retry tree obligation                                            | Failed Q2 case fails: GET count 1 instead of 2; exit 1, 1 failed / 28 skipped.                                                                                                                 |
| Replace generated refusal's `WbsRequestError` with ordinary `Error`                    | Same case fails: GET count 1 instead of 2; exit 1, 1 failed / 28 skipped.                                                                                                                      |
| Catch Retry and manufacture Pri terminal evidence from retained Time before rethrowing | Same case fails on full old cue equality before held GET release; exit 1, 1 failed / 28 skipped.                                                                                               |
| Retain initial input hash in cue Retry callback with `useRef`                          | Same case fails: second POST submits `q1`, expected `q2`; exit 1, 1 failed / 28 skipped.                                                                                                       |
| Admit boundary-infeasible Pri in retryable objectives                                  | Terminal Q2 case fails: unexpected `Retry Pri` menu action; exit 1, 1 failed / 28 skipped.                                                                                                     |
| Remove writer catch's retired-owner guard                                              | Mounted replacement case **SURVIVED**: 1 passed / 28 skipped, exit 0. Existing retired channel/feed guards mask this single fault. This is not claimed as a mounted proof of the writer guard. |

The same retired-owner fault was isolated through the existing real writer test,
without bypassing any other guard:

```sh
TZ=UTC bunx vitest run src/modules/plan-writer/plan-writer.test.ts -t 'a retired writer does not publish or reread a typed terminal Retry refusal' --no-file-parallelism --maxWorkers=1
```

It failed on an unexpected terminal refusal publication, expected `[]`: exit 1,
1 failed / 24 skipped. This is a writer-boundary proof with an internal typed
refusal fixture, not producer/HTTP mounted coverage. No production safety check
was added or changed by this packet; existing adjacent `Proof:` comments remain.

Scratch receipts: `/tmp/b4-fixture-{red,green}.log`,
`/tmp/b4-fault-{tree-obligation,typed-refusal,optimistic-terminal,stale-callback,retired-owner}.log`
and `/tmp/b4-fault-final-{retired-owner,terminal-retry}.log`.

## Verification

Restored commands (repository root unless stated otherwise):

| Command                                                                                                                                                                                                                                                                               | Result                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| From `apps/wbs/fe-01`: `TZ=UTC bunx vitest run src/components/wbs/connected-optimization-integration.test.tsx src/components/wbs/optimization-retry-reconciliation.test.tsx src/lib/wbs-api.test.ts src/modules/plan-writer/plan-writer.test.ts --no-file-parallelism --maxWorkers=1` | 4 files, 145 passed, 0 failed.                                    |
| `bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts`                                                                                                                                                                                                  | 34 passed, 0 failed, 325 assertions.                              |
| `NX_DAEMON=false bunx nx run wbs-core:typecheck`                                                                                                                                                                                                                                      | Passed, including module checks.                                  |
| `NX_DAEMON=false bunx nx run wbs-core:lint`                                                                                                                                                                                                                                           | Passed.                                                           |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                                                                                                                                                                                                                     | Passed, including module checks.                                  |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                                                                                                                                                                                                                          | Passed on isolated rerun (1m44s, no cache).                       |
| `bunx openspec validate cross-project-dependencies --json`                                                                                                                                                                                                                            | Passed, existing long-requirement warnings.                       |
| `bunx openspec validate --all --json`                                                                                                                                                                                                                                                 | 271 items passed, 0 failed.                                       |
| `bunx prettier --check` with the six changed paths                                                                                                                                                                                                                                    | Passed.                                                           |
| `git diff --check`                                                                                                                                                                                                                                                                    | Passed.                                                           |
| `bunx lefthook run pre-commit` over the six staged paths                                                                                                                                                                                                                              | Passed after correcting test-only async/void-arrow lint findings. |

After those test-only lint corrections, the integration file was run again from
`apps/wbs/fe-01` with `TZ=UTC bunx vitest run
src/components/wbs/connected-optimization-integration.test.tsx
--no-file-parallelism --maxWorkers=1`: **29 passed, 0 failed**. An invocation from
the repository root using the frontend config found no files; it is not counted
as verification. The correct frontend working directory above was used for the
passing run.

The first full frontend lint target ended with exit 1 after 4m48s and no ESLint
diagnostic, only Nx's nonzero-child warning; its cause is unestablished. Its
isolated rerun is recorded in the table above. Staged hook lint passed. Tool Wiki
hook reports `inactive`, `certified:false`, because its external activation root
is not provisioned; that is not activation certification. Migration lint,
website migration lint and documentation cap hooks had no matching staged
paths and were explicitly skipped.

Nx reported denied plugin-worker sockets and ran plugins in the main process;
these targets completed under that supported fallback. Vitest reported the
existing Vite `__dirname` native-loader warning. Scratch final logs are
`/tmp/b4-restored-{vitest,core}.log`, `/tmp/b4-{core,fe}-{typecheck,lint}.log`,
`/tmp/b4-openspec{,-all}.log`, `/tmp/b4-format.log`,
`/tmp/b4-restored-integration-final.log`, `/tmp/b4-fe-lint-final.log` and
`/tmp/b4-hooks-final.log`.

## Boundaries

This packet does not establish backend Retry admission, real solver launch,
production connected hash derivation, activation, session-owner transition,
browser HintLayer/focus/phone geometry, Kubernetes/deploy safety, required CI or
an exact-SHA isolated host gate. Existing internal reconciliation tests remain
regression coverage for corrupt/ready variants and stale-stream recovery. The
mounted HTTP cases here deliberately cover failed/terminal Pri, existing Time
terminal evidence, tree authority and runtime/project replacement only. The
worktree borrows the existing workspace `node_modules` by symlink; a fresh frozen
installation is not claimed. No solver version, deploy or activation file changes
are included. Parent tasks 7.3/7.4/9.2 and full Slice B remain unchecked.
