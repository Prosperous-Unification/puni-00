# Portable workflow identities implementation plan

> For agentic workers: use subagent-driven-development task by task. This tasks.md
> is the implementation plan; the sdd-lean schema forbids a separate plan.md.

**Goal:** Generate stable UUID workflow runs and make SQLite preserve every admitted ID.

**Architecture:** A flat validated run-record constructor generates an ID once, outside
storage retries. A canonical private key codec and additive format5 preserve opaque IDs;
explicit4↔5 transition retains predecessor tables and guards used downgrade.

**Tech stack:** Bun1.4.4, TypeScript, bun:sqlite, ArkType through @shared/validation, Nx.

**Spec:** [workflow identities](specs/workflow-identities/spec.md), [design](design.md).

## Global constraints

- Work only in /tmp/puni-agentic-runtime-dispatch-20261026, based on9ac25dc61.
- Preserve every0001–0004 forward/down byte and genuine format3/4 identities.
- Preserve the complete accepted ID domain, payload bytes, digests and JSON scope tuples.
- No main merge, operator-store migration, production activation, credentials or other owners.
- Run focused tests with Bun and the tools/test/scratch/preload.ts preloader. No new runner.
- Every new check needs an actual removed-check/broken-dependency production-path negative
  and adjacent truthful Proof comment. Keep original failure and restored output.
- Prior9ac CI/canonical results do not certify this change. Final acceptance needs new reviews,
  required CI and exact-source canonical host gate under its heavy lock.

## Task 1: Generate a workflow-run record once

Files: create runs/create-run.ts and runs/create-run.test.ts under
apps/twilight-structure/twilight-dash/cli/src. Record scoped evidence in this task's report;
final verify.md follows complete implementation.
Read Run, RunCodec, the memory fixture and existing payload-bound createRun tests first.

Produces the following production interface; storage createRun is unchanged:

```ts
export type RunCreation = Pick<Run, 'projectId' | 'workItemId' | 'manifestDigest' | 'maxAttempts'>;
export function createRun(input: RunCreation): Run;
```

- [x] 1.1 TDD: constructor returns distinct random UUIDv4 run IDs for separate creations,
      version1/revision0 and exact separate project/work-item/manifest/budget fields. Its
      flat returned Run is frozen. Use the real randomUUID; no injectable generator or new
      retry framework. Test: create-run.test.ts, generated identity and immutable snapshot cases.

Implementation shape:

```ts
return Object.freeze(
  decodeRun({
    version: 1,
    runId: randomUUID(),
    revision: 0,
    projectId: input.projectId,
    workItemId: input.workItemId,
    manifestDigest: input.manifestDigest,
    maxAttempts: input.maxAttempts,
  }),
);
```

- [x] 1.2 TDD: submit that same constructed record twice through the real memory RunStore,
      including after read; compare exact run identity and returned original payload. Test:
      create-run.test.ts retained-creation retry. Do not imply coordinator CLI/restart exists.
- [x] 1.3 Test the constructor's actual validation boundary with invalid project/work-item,
      manifest and retry-budget values. Independently bypass its decodeRun dependency, watch
      the negative lose refusal, then restore; record the actual command and add a Proof
      comment naming that fault. Run the new test file and existing admission.test.ts once
      healthy. Format/lint only named files. Commit only Task1-owned files; never --no-verify.

## Task 2: Freeze predecessor descriptors before appending a format

Files: runs/sqlite/{format,schema,migrate-recovery}.ts and focused
format/predecessor tests in runs/sqlite/recovery-migration.db.test.ts.

Consumes existing complete format3/4 identities. Produces named FORMAT3 and FORMAT4
descriptors; CURRENT_FORMAT still selects4 in this task. No new active format yet.

- [x] 2.1 Freeze complete format4 identity to exactly migrations0..3, independent
      of future entries. Build FORMAT3_IDENTITY from slice(0,3) and FORMAT4_IDENTITY from
      slice(0,4); preserve observed pre-change bundle identities exactly. Test: named
      complete predecessor identity assertions in recovery-migration.db.test.ts. This is
      mechanical preparation: use existing genuine tests rather than new alias/export tests;
      the real appended-artifact preservation case is exercised with Task3's actual0005.
- [x] 2.2 Replace transition use of mutable CURRENT_FORMAT/PREDECESSOR_FORMAT aliases
      with explicit named format3/4 descriptors. Leave runtime recovery dispatch unchanged
      until actual format5 has production-path coverage in Task3. Test: existing
      genuine3↔4 populated migration, current4 open and recovery cases. Actual version5
      recovery coverage follows in Task3. Preserve old guards and pinned code fixture bytes.

Required selection shape:

```ts
export const FORMAT3 = describeFormat(FORMAT3_IDENTITY, MIGRATIONS.slice(0, 3));
export const FORMAT4 = describeFormat(FORMAT4_IDENTITY, MIGRATIONS.slice(0, 4));
export const PREDECESSOR_FORMAT = FORMAT3;
export const CURRENT_FORMAT = FORMAT4;
```

Commit this independently passing preparation. Any changed safety dependency gets its
own actual production-path negative; unchanged comparisons retain inherited proof context.

## Task 3: Preserve IDs through complete format5 persistence and transitions

Files: new runs/sqlite/identity-key.ts; new migrations/0005-identity-keys/{migration,down}.sql;
new migrate-identities.ts and identity-keys.db.test.ts; modify format/schema/open-stores,
run-store, row-codecs, runtime-store, recovery-store and all read-{history,executions,
outcomes,signals,runtime,recovery}.ts consumers as the finite key inventory requires.
Read the finite key/family inventory in design.md before editing. The source-intake report
is retained separately as investigation evidence and is not a second normative policy.

Consumes explicit immutable predecessor descriptors. Produces FORMAT5_IDENTITY, FORMAT5,
CURRENT_FORMAT5, canonical encodeKey/decodeKey and explicit preserving4↔5 API. Existing
upgradeSqliteStores/downgradeUnusedSqliteStores retain3↔4 targets. New APIs:

```ts
export async function upgradeSqliteIdentityKeys(
  options: SqliteOptions,
): Promise<SqliteFormatTransition>;
export async function downgradeUnusedSqliteIdentityKeys(
  options: SqliteOptions,
): Promise<SqliteFormatTransition>;
```

- [x] 3.1 TDD public-port regression: actual SQLite save/read/retry/reopen preserves
      D800/D801/DC00/FFFD/literal escape/NUL/astral IDs, including distinct records; memory
      is the passing comparison. Watch the original SQLite failure before repair. Test:
      identity-keys.db.test.ts. Implement exactly JSON.stringify(rawId) including quotes;
      decode to unknown, parse a string and require exact re-encoding equality. Keep domain
      validation in its existing codecs. Canonical and physical/logical mismatch checks get
      independent public-path negatives with inherited comparisons left installed.
- [x] 3.2 Add complete additive parallel keyed execution/runtime/recovery family with
      its own count markers and usage marker. Enumerate finite table/key mapping; never
      rewrite arbitrary SQL. Update every producer, lookup, reader, FK counterpart and
      history validator to select the right compiled format and decode before comparing.
      Generalize runtime recovery dispatch with an actual format5 recovery-history test;
      version5 must not silently take format3's empty-recovery branch.
      Preserve digest/scope/payload encodings and decoded/numeric ordering. Test: cross-family
      public read/write/retry and populated ordering comparisons in identity-keys.db.test.ts.
- [x] 3.3 Add explicit4↔5 migration under BEGIN IMMEDIATE: validate genuine4, copy exact
      payload bytes with only raw keys encoded, audit successor then publish version/full
      bundle atomically. Preserve old tables and all0001–0004 bytes. Fresh bootstrap creates
      valid5; ordinary open rejects4 unchanged. Test: populated genuine4, absent/unreadable,
      corrupt predecessor, late abort/cleanup fault, reopen and unused round trip.
      Both explicit transition pairs share the narrow format-transition.ts lifecycle;
      migration owners retain explicit used checks, finite SQL and statement ordering.
- [x] 3.4 Persist semantic-use marker atomically with successful new-format mutations;
      direct down SQL independently guards exact unused marker before destructive statements.
      Missing/corrupt markers refuse; prove absent/invalid marker update cannot silently affect
      zero rows. Test: used API down, used raw down and separate API/SQL/marker faults.
      Preserve documented immutable-artifact/refusal-clock exceptions without restoring a
      lower observed clock or changing execution ownership/history under mismatch.
- [x] 3.5 Prove actual already-open, queued and BUSY genuine format4 writers refuse after
      publication. Pin the reviewed genuine source rather than emulating it. Preserve original
      format3/4 compatibility tests with explicit predecessor targets and all inherited guards.
      A narrow shared test-only archive/IPC/close host may serve both wrappers; preserve the
      genuine BB14 pin, archived producer, worker/protocol bytes and typed format3 behavior.
      Reverify all direct/transitive lifecycle, provenance and construction consumers after
      extraction; every new load-bearing host check requires an owned boundary fault.
      An in-process predecessor bridge must retain source through uncertain native open/close;
      test actual open/close faults, worker/pipes drain despite retention, and restored closure.
      Bound ordinary in-process fixtures to one verified b3b source per Bun test process,
      with separate native-store leases and independent worker archives. Controlled native
      fault proofs retain explicitly isolated verified imports and exact connection-close
      witnesses. Keep the original format3 control immutable; the version-specific worker
      fork's disposition and cost are recorded in design.md. Implement the sole Dash lifetime
      preload and project-command oracle; test actual multi-file lifetime/reuse/teardown and
      missing-owner refusal before shared allocation. Pooled teardown precedes generic scratch
      removal, retaining both on unknown closure. Preserve30s hook/60s target budgets.
      Test: format4 compatibility group, actual contention/concurrency cases and original
      physical-schema/history corruption suites. New checks require independent negatives.

No partial format activation or claimed ID repair is acceptable. If this integrated task
needs smaller passing commits, keep CURRENT_FORMAT4 until the complete successor paths
and transition are ready, recording the exact dependency ordering in the ledger.

## Task 4: Accept the complete identity change

Files: shared runs/testing contracts as needed; change verify.md only after implementation;
task-scoped ledger/review packets under the unique portable-workflow-identities workspace.

- [x] 4.1 Complete shared identity/reference cases across all memory/SQLite key families,
      including bounded-edge and finite unbounded-key controls. Verify actual completion
      collisions and decoded attempt/numeric revision ordering. No domain narrowing.
- [x] 4.2 Reverify migration hashes, every new check's actual fault/restored evidence, native
      close/cleanup outcomes, affected static checks and task review findings. Use a task
      review after each implementation task, then one whole-change review.
- [x] 4.3 Commit/push the reviewed feature candidate and run required CI and canonical
      bin/h2puni-gate.sh on its actual final SHA in a clean isolated h2/h4 gate tree. Record
      executed target coverage, failures/skips and complete terminal receipts. No raw full
      host Nx gate, foreign cleanup, force/admin merge or production action.
- [x] 4.4 Invoke openspec-verify-change and write verify.md from actual outputs/proof table;
      keep unverified tasks open. Re-read WBS after notes/status updates, preserving old notes.
      Keep architectural main merge/operator stores/prod held and the wider foundation open.
