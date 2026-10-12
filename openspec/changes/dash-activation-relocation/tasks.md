Slices follow `batch-10/wave-7/080-activation-relocation.md` (WBS a81d93a0). Each slice runs
RED, then GREEN, then a watched omission of the check, then GREEN again, and records the results
in verify.md.

## 1. Split the invocation journal judge (S0)

- [x] 1.1 `review/invocation-journal.ts` takes the journal records, the reconcilers, `readInvocationJournal` and `validateReviewProvenance`; `cli.ts` and `review/index.ts` import from it.
- [x] 1.2 The facade grows by exactly the names the moving modules import, and they reach Burokrat only through it. `judge-facade.test.ts` pins the surface and scans the new reachable modules; the scan allows `bun:sqlite` only for in-memory parsers.
- [x] 1.3 The controller-dependent exhaustive-coverage case becomes `exhaustive-coverage.integration.test.ts`.

## 2. Move to Dash (S1)

- [x] 2.1 This change's proposal, design, spec, tasks and verify, plus a pointer in `automatic-trusted-activation/tasks.md`.
- [x] 2.2 `git mv` the controller to `activation/`, its test helpers to `activation/testing/`, the invoker runtime to `review/`, and the units to `activation/units/`. The alias imports, the Dash lint override and the boundaries oracle `Dash activation reaches only the judge alias` come with it.
- [x] 2.3 The Burokrat clock guard keeps only the two `prepare-*` entries; `names.md` is updated; the bundle test `the validator and executable bundles carry no activation runtime` is added.
- [x] 2.4 The `gate_twilight` shard, workspace and h2puni exclusions, and the `gate_mode` membership for either project, with their oracles and `docs/findings/ci-gate-duration.md`.

## 3. Clocks (S2)

- [x] 3.1 `src/clock.ts` provides `wallClock()` and `monotonicClock()`. `Monotonic` is threaded through the controller's 28 sites and `WallClock` through the invoker's 10.
- [x] 3.2 The shared AST detector moves to `tools/test/clock-reads`. Dash scans every production module, and the two load-sensitive tests drive a scripted `Monotonic`.

## 4. Observation store (S3)

- [x] 4.1 `bootstrap-observation` and `migrate-observation` with typed refusals and a mutation canary.
- [x] 4.2 Golden v10 and Burokrat-written v10 fixtures, checked by `schema-golden.test.ts`.

## 5. Launcher and units (S4)

- [x] 5.1 `twilight-dash:build` bundles `observation-service.mjs` and prints its SHA-256. The launcher marker test is added.
- [x] 5.2 The `render-observation-units` command, renamed units, and a `systemd-analyze verify` run that throws when the tool is absent.

## 6. Rollback and documents (S5)

- [ ] 6.1 A vendored `pre-relocation-activation.tar`, declared in the three policies, for the old-opens-new proof.
- [ ] 6.2 ADR 0051, `names.md`, `LLM_README.md`, `CONTEXT.md`, the READMEs and the runbook pointer.
