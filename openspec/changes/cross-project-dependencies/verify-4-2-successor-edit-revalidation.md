# Task 4.2 successor edit revalidation packet — 2026-10-23

Base: `018427f8e`. This packet adds a test suite and its verification evidence.
Production external authoring remains inactive. The mounted tests alone select
`openFixture({ syntheticExternalCommands: true })`. Task 4.2 remains open for
complete matrix review; this packet changes no production predicate or contract.

The parameterized add/update/remove cases demote the actor to a current member
and give the unrestricted successor to a different member. Authenticated qualified
predecessor lookup succeeds. Each actual operation succeeds first through mounted
HTTP, with real service dispatch, project and row evidence reads, publication and
persisted relationship outcomes checked. Update changes FS to SS; remove deletes
an existing link and reseeds it before the refusal case.

For each refusal, the test holds the composed writer, observes request admission
and actual writer enqueue, then changes the successor to restricted through a
separate SQLite connection. After release, the entire two-command request answers
exactly `403 { error: 'forbidden' }`, with no per-command envelope. The test checks
zero authoring dispatch and project/row evidence reads, and compares every table
and publication against snapshots taken after the restriction. A preceding local
rename cannot survive. Existing external links survive refused update/removal.

## Independent R5 proof

Only the production branch
`if (admitted === 'forbidden') return 'forbidden';` in
`AdmittedScope.refuseOutsideScope` was removed. Request authority resolution,
endpoint evidence, service admission and storage guards remained installed.
All three tests failed because queued add/update/remove incorrectly answered
HTTP 200 instead of whole-request 403: **0 pass, 3 fail**. This is unsafe admission,
not a downstream exception or constraint failure. The original source was restored
in a `finally` block; the suite then passed **3 tests, 100 assertions**.
The adjacent test `Proof:` comment names this exact fault and observed failure.

Raw evidence: [mutation](evidence/successor-edit-revalidation/forbidden-branch-mutation.log),
[restored suite](evidence/successor-edit-revalidation/restored.log),
[combined focused suite](evidence/successor-edit-revalidation/focused.log).

## Verification

- `bun test apps/wbs/be-01/src/controller/cross-project-dependency-command-access.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-dependency-commands.controller.db.test.ts --timeout=20000`: **16 pass, 0 fail, 301 assertions** after final formatting and signal-helper edit.
- New-file ESLint: **exit 0**. Nx module-boundary rule explicitly skipped because
  this fresh isolated clone has no cached ProjectGraph; configured Nx lint remains
  pending the coordinator's serialized local heavy slot.
- New-file Prettier: **passed**.
- Configured backend typecheck and broad Nx verification: **pending** the same
  coordinator slot; no whole-repository gate is claimed by this packet.
- Normal Lefthook hooks are installed; the commit runs the configured hooks.

This evidence covers synthetic mounted successor admission only. It does not
establish production activation, direct-service policy parity, or completion of
the parent task's access/shape matrix.
