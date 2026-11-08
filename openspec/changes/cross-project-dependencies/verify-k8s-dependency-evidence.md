# Detached Kubernetes dependency evidence verification

Scope: the pure versioned codec and recovery classifier described in
[the bounded architecture](architecture/k8s-dependency-evidence.md). No release,
cluster, storage, activation or participant-fencing integration is included.
Parent tasks 10.1/10.2 remain open.

## Focused evidence

`bun test tools/tool-deploy/src/k8s/dependency-evidence.test.ts`:
78 passed, 0 failed, 131 assertions after restoration of every fault. The initial
codec stub failed the round-trip test with `evidence codec not implemented` before
implementation. Tests call the exported production codec/classifier directly;
no mocks, cluster or filesystem fixture is involved.

The original 28 faults below were injected individually against the original
72-test suite in the production module. Each
focused run exited 1; each change was restored before the next fault. Counts are
failed tests, not assertions or inferred coverage.

| Injected production fault                               | Failed tests |
| ------------------------------------------------------- | -----------: |
| Remove object boundary                                  |            1 |
| Remove exact closed field set                           |            2 |
| Remove nonempty text boundary                           |            1 |
| Remove literal format/protocol/version/state validation |            9 |
| Remove array boundary                                   |            1 |
| Remove enum choice validation                           |            1 |
| Remove integer/timestamp validation                     |            2 |
| Remove SHA256 format validation                         |            1 |
| Remove digest-pinned image validation                   |            1 |
| Remove canonical equality comparisons                   |           25 |
| Remove independent invocation identity check            |            5 |
| Remove nonempty command check                           |            1 |
| Remove duplicate identity check                         |            2 |
| Remove foreign unresolved-obligation check              |            1 |
| Remove missing unresolved-obligation check              |            2 |
| Remove foreign-role check                               |            1 |
| Remove required-role coverage check                     |            1 |
| Remove foreign participant-claim boundary               |            1 |
| Remove B2 interval time-order check                     |            1 |
| Ignore activation progress in recovery                  |            1 |
| Ignore exposure progress in recovery                    |            1 |
| Route lost/uncertain evidence to dormant admission      |            1 |
| Omit receipt activation ID substitution                 |            1 |
| Omit receipt database identity substitution             |            1 |
| Omit receipt candidate image substitution               |            1 |
| Omit receipt retained/rollback image substitution       |            1 |
| Omit receipt participant evidence hash substitution     |            1 |
| Omit receipt migration capture hash substitution        |            1 |

The equality fault catches modified bytes/hash/projection, resealed foreign source,
swapped equal-digest attribution, invocation command hash mismatch, proof bytes and
command/readback receipt disagreement. Nine receipt fields each have missing-field
negatives and separate command/readback disagreement negatives. Protocol/version
and invalid timestamp faults exercise the other three receipt boundaries.

The first foreign-role and missing-role fault attempts survived because another
roster guard also rejected their fixtures. Independent extra-role and uncovered
policy-role fixtures were added; both faults then failed separately. This corrects
the proof rather than claiming layered rejection proves either guard alone.

## Sparse-array review correction

Astra review reproduced a sparse semantics array accepted by the exported unknown
boundary. `Array.map` skipped the missing slot, so the sealed projection retained
length 1 while canonical bytes represented `[]`; decoding changed the length to 0.
Six new production-boundary tests for sparse semantics, command, policy roles,
roster, entries and unresolved obligations failed before the fix (72 passed,
6 failed). They exercise both sealing and persisted projection decoding.

The list decoder now visits every integer index, requires an own element and
appends each decoded value to a dense array. Two additional watched production
faults each exited 1 with 6 failed tests: removing the own-index guard lost the
named `dense array required` boundary error; replacing the dense decoder with the
original `Array.map` implementation restored sparse-semantics acceptance. The
former proves the explicit dense-input diagnostic; the latter proves rejection of
the original round-trip defect. Restored suite: 78 passed, 0 failed, 131 assertions.
The original 28 fault counts above remain the observed original-suite receipts.

The closed-field fault admitted extra fields, while other guards continued to
refuse missing progress. The duplicate fault admitted duplicate roster/entry IDs,
while obligation guards continued to refuse absent claims. Adjacent proof comments
now state those narrower observations.

## Checks and limits

Final scoped check results are recorded below before commit. The full canonical
host gate is not run by this packet; the integrating owner must gate its reviewed
SHA. Live Kubernetes acceptance, durable checkpoint crash/restart, continuous B2
fencing, complete participant exclusion, real activation/readback, release
recovery, rollback, restoration and exposure ordering remain unverified.

Final local checks (2026-10-23):

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:typecheck`:
  passed, fresh uncached target.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:lint`:
  passed, fresh uncached target over all tool-deploy sources.
- `bunx prettier --check` over the four packet files: passed.
- `bunx openspec validate --all --json`: 271 passed, 0 failed
  (253 changes and 18 specs).
- `bunx openspec validate cross-project-dependencies --strict --json`: exited 1
  on existing requirement-length warnings in unchanged delta specs; no schema
  errors were reported. This stricter advisory check remains unsuccessful.
- `git diff --check`: passed.

The initial Nx invocation without the environment switches printed socket-denial
fallback diagnostics and exited without a task receipt. It was not counted as
verification; the explicit target runs above printed completed target receipts.
The worktree uses the existing locked dependency installation through a local
ignored `node_modules` symlink; no dependency install/frozen-lock claim is made.
