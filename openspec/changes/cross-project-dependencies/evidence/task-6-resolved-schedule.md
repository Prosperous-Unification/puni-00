# Resolved schedule foundation 6.1a handoff

Worktree: `/tmp/puni-cross-resolved-schedule`
Branch: `feat/cross-project-resolved-schedule`
Base HEAD: `3980e0bb5064361433709275625190e843c6a44e`
No commits, pushes, core/runtime edits, or WBS changes performed.

## Implemented contract

- `ResolvedScheduleInput` uses the exact architecture shape, including `order.kind = local | connected` and required empty-capable maps.
- `resolveScheduleInput` preserves the historical tuple and derives its graph through the original tree/group/leaf-expansion/typed resolution helpers. Canonical serialization remains untouched.
- Public `schedule` adapts and delegates to `scheduleResolved`. The existing graph-to-node, weighted CP, eligible heap, leveller, resources, backwards pass and projection implementations remain shared; no second capacity engine.
- Fast prepends rank and bytewise project ID inside the eligible comparator. Incoming dependency counts still determine eligibility. Local comparator and pinned chronological/topological replay remain intact.
- Resolved graph validation rejects missing, extra, duplicated or wrong-meaning nodes and invalid supplied endpoints against actual grouped slices. It does not invent or reconstruct authored edges: the supplied graph is authoritative, and completeness of authored resolution belongs to preparation.
- `validateResolvedRealBoundaries` validates actual strict real FS/SS/FF boundaries from the supplied graph. The old validator adapts its local tuple and delegates.
- Domain barrel exports the new seam. Runtime capability remains for the integrator.

## Verification

All commands ran from the worktree above; output logs listed below.

1. Initial TDD red: `bun test libs/wbs/domain/domain/src/schedule-connected.test.ts` failed because the new input module did not exist (`/tmp/puni-resolved-red.log`).
2. Singleton ownership/rank tests red before their guards: 17 pass / 3 fail (`/tmp/puni-resolved-order-red.log`).
3. Final connected suite: same Bun command, 23 pass / 0 fail / 26 assertions (`/tmp/puni-resolved-green.log`).
4. Focused regression command below: 285 pass / 0 fail / 52,082 assertions across 18 files (`/tmp/puni-resolved-regressions.log`). Includes unchanged local golden corpus, canonical hash input tests, pinned paths, weighted/typed/priority/deadline/resource suites.
5. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:typecheck` exited 0 and printed actual named target execution and success (`/tmp/puni-resolved-typecheck.log`).
6. `bunx tsc --project libs/wbs/domain/domain/tsconfig.lib.json --noEmit` and spec config equivalent exited 0 (`/tmp/puni-resolved-domain-typecheck.log`, `/tmp/puni-resolved-spec-typecheck.log`). The repository's tsc binary is `@typescript/native`.
7. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:lint --outputStyle=stream` exited 0 with named target success (`/tmp/puni-resolved-lint.log`).
8. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/puni-resolved-nx-graph.json` exited 0 and produced the graph (`/tmp/puni-resolved-nx-graph.log`).
9. Named five-file `bunx prettier --check ...` exited 0, all matched files formatted (`/tmp/puni-resolved-format-check.log`). `git diff --check` exited 0.

Initial Nx without the environment flags exited 0 after socket-refusal messages and did not execute its task; this was explicitly rejected as evidence and rerun correctly. Initial lint failures were import/export ordering, optional-chain preference, numeric template expressions, and a void callback; all corrected before final verification.

Focused regression command:

```sh
bun test libs/wbs/domain/domain/src/schedule.test.ts libs/wbs/domain/domain/src/schedule-connected.test.ts libs/wbs/domain/domain/src/schedule-weighted.test.ts libs/wbs/domain/domain/src/schedule-typed-dependency.test.ts libs/wbs/domain/domain/src/schedule-priority.test.ts libs/wbs/domain/domain/src/schedule-deadline-order.test.ts libs/wbs/domain/domain/src/schedule-lateness.test.ts libs/wbs/domain/domain/src/schedule-placement-order.test.ts libs/wbs/domain/domain/src/schedule-joint-capacity.test.ts libs/wbs/domain/domain/src/schedule-resources.test.ts libs/wbs/domain/domain/src/schedule-resource-corpus.test.ts libs/wbs/domain/domain/src/schedule-shapes.test.ts libs/wbs/domain/domain/src/fast-golden-corpus.test.ts libs/wbs/domain/domain/src/schedule-elsewhere.test.ts libs/wbs/domain/domain/src/canonical-schedule-input.test.ts libs/wbs/domain/domain/src/schedule-algorithm-id.test.ts libs/wbs/domain/domain/src/schedule-identity.test.ts libs/wbs/domain/domain/src/workday.property.test.ts
```

## Production mutation proofs

Harness: `/tmp/puni-resolved-proofs.py`; summary `/tmp/puni-resolved-proofs.log`; individual outputs `/tmp/puni-resolved-proof-<name>.log`. Each mutation runs exactly one matching test and restores original source in `finally`. All thirteen selected mutations exited 1 with exactly one selected failing test. Sources restored; final connected suite green. Adjacent Proof comments added only after observation.

- `node-identity`: bypass step meaning equality; `refuses step` unexpectedly receives a schedule.
- `node-extra`: bypass foreign node recognition; `refuses extra` unexpectedly receives a schedule.
- `node-duplicate`: bypass positional uniqueness; `refuses duplicate` unexpectedly receives a schedule.
- `node-missing`: bypass exact-set remainder guard; `refuses missing graph facts` unexpectedly receives a schedule.
- `edge-endpoint`: bypass positional endpoint guard; `refuses endpoint graph facts` instead receives a dependency-cycle error. **Diagnostic-only proof:** the malformed graph remains refused downstream; this does not establish unsafe acceptance without that guard.
- `ownership`: break ownership lookup by supplying project A for a missing owner; singleton ownership test unexpectedly receives a schedule. Removing only the ownership throw remains refused by missing-rank guard; that redundant rejection is not misrepresented as unsafe acceptance.
- `rank`: remove rank presence/finite check; singleton missing rank is silently admitted.
- `rank-nonfinite`: remove only finite check; singleton NaN rank is silently admitted.
- `rank-comparator`: remove rank comparison; bytewise ID wins incorrectly on shared person. Original fixture did not distinguish these; mutation revealed that gap and fixture was corrected before final proof.
- `id-comparator`: remove project ID tie-break; local tree/priority ordering picks wrong project on shared person.
- `FS-real`, `SS-real`, `FF-real`: exempt each type independently from strict real-boundary check; corresponding actual resolved materialization validator admits the early slice.

## Limits and integration ownership

No full host gate, full workspace gate, build, runtime/capture/core/calendar/readiness integration tests, or host tests were run. Root owns integration, WBS state, commit with normal hooks, Astra High review, and host gate. Connected capacities and per-project preparation are upstream facts of this domain seam, not implemented here. Historical canonical bytes and local scheduling are covered by existing corpus/regression tests. Dedicated bounded common-engine slice is reviewable; the overall 6.1/connected feature is not claimed complete.

## Explicit path manifest and final SHA-256

- `libs/wbs/domain/domain/src/resolved-schedule-input.ts` — `b836296bd8fe596aa393dbfea0e6cccaceffc46034b27d0e0df8c3c44ad0b9f7`
- `libs/wbs/domain/domain/src/schedule-connected.test.ts` — `7f443bfbc548e00e19ef5881b7e1eaf141c43b6a1990d51d06ae6874cfdf713a`
- `libs/wbs/domain/domain/src/schedule.ts` — `f8c8a33e421d8f87f3925c760fea93c1388a9af866d9d2fef617dc553e984dd2`
- `libs/wbs/domain/domain/src/real-boundaries.ts` — `c7614af40cdd7b576c6cf3c4292cec03b85b147a901490a2f5524bdbe72c0c96`
- `libs/wbs/domain/domain/src/index.ts` — `1b89c0516b782fe38d658abee0a2d2a684bbdb5a5253802db09b69035915e36f`

## Root evidence correction

Independent Astra review and root inspection of `/tmp/puni-resolved-regressions.log` confirm **285 pass / 0 fail / 52,082 assertions**, not the earlier handoff total of 52,088. The named output is authoritative; this corrects the count without changing test/source evidence.

## Bounded P3 review follow-up

Astra approved production commit `2f70f34f5` (`/tmp/puni-resolved-schedule-review.md`). Corrected the primary regression assertion count above to **52,082**, matching the exact authoritative log; retained root's correction note.

Promoted reviewer's temporary empty-component probe to durable `empty connected component accepts required empty maps` in `schedule-connected.test.ts`. The fixture explicitly supplies empty ownership and rank maps and verifies empty slice/work-item projections and zero person/capacity wait counts. Only that test file changed after the approved commit; no production changes.

Fresh verification:

- `bun test libs/wbs/domain/domain/src/schedule-connected.test.ts`: **24 pass / 0 fail / 30 assertions** (`/tmp/puni-resolved-empty-test.log`).
- `bunx tsc --project libs/wbs/domain/domain/tsconfig.spec.json --noEmit`: exit 0 (`/tmp/puni-resolved-empty-typecheck.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx eslint libs/wbs/domain/domain/src/schedule-connected.test.ts`: exit 0 (`/tmp/puni-resolved-empty-lint.log`).
- `bunx prettier --check libs/wbs/domain/domain/src/schedule-connected.test.ts`: exit 0, formatted (`/tmp/puni-resolved-empty-format-check.log`).
- `git diff --check`: exit 0; status showed exactly the one expected test file modified.

Full 285-test regression set, production typecheck and host gates were not repeated for this test-only follow-up, as directed. Root owns commit and final review disposition. Sources frozen again.

Follow-up manifest: `libs/wbs/domain/domain/src/schedule-connected.test.ts`
SHA-256: `e3154cf609b4b228b52da4e1961d8dc92eecaf549dc2027003ab0a4f9080cd75`
