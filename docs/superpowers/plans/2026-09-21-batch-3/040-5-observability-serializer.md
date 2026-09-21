# 040.5 Observability serializer and log schema, with the fingerprint

| Field                                      | Value                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item                                  | 040.5 "Observability serializer and log schema, with the fingerprint" in "PUNI platform plan"                                                        |
| Size class                                 | M                                                                                                                                                    |
| Slices                                     | A OpenSpec change, B tests and implementation together, C proofs and documentation                                                                   |
| top-model-high-effort-planning-tokens      | 4000000                                                                                                                                              |
| mid-level-mid-effort-implementation-tokens | 11000000                                                                                                                                             |
| top-model-high-effort-review-tokens        | 5000000                                                                                                                                              |
| Design implemented                         | The "Reporting" contract and ordered slice 3 of `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`, read with its 2026-09-19 amendment |
| Packet format                              | `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                                                                                |

Three slices, all in `libs/wbs/adapters/observability` and one new OpenSpec change. Slice A is
dispatchable as it stands; B and C follow its commit.

## 1. Goal and non-goals

**Goal.** A WBS log line about a failure carries that failure's sanitized diagnostic report from
`@shared/failures` — occurrence id, fingerprint, stacks, cause chain — under `err`, and
`log-schema.ts` declares that record as exactly one of a diagnostic report or a visible reporting
loss. Writing the line never throws, never writes the public report, never writes a raw caught
value, never redacts twice, and never trusts a caught value's own claim to have been reported.

**Non-goals.** No boundary adopts the contract here: work items 040.7 (backend error boundary),
040.8 (MCP tool-call boundary) and 040.9 (gateway) are the callers and are out of scope. This
packet adds no service name (`mcp-01` stays out of `ServiceName` and `LogRecord` until 040.8
wires its logger), no exception kind, no DI Bag composition, no telemetry endpoint, no dashboard
or ingestion query change, and no browser-execution claim. No file outside
`libs/wbs/adapters/observability` and `openspec/changes/log-failure-records` is edited.

**What 040.7, 040.8 and 040.9 will call.** Two things, and nothing else:

- A boundary that has only caught a value keeps writing
  `logger.error({ err: <caught value>, ...fields }, '<message>')`. Nothing changes for it.
- A boundary that already called `reportFailure` — because it needed the public report for its
  response — writes
  `logger.error({ err: registerReportedFailure(reporting), ...fields }, '<message>')`. The
  record then keeps the occurrence id that boundary already disclosed. **Passing the outcome
  unregistered is not a supported path**: it is reported afresh under a second occurrence id,
  which is exactly what an unregistered imitation must get.
- A process that owns secrets passes them once, at `createLogger({ service, secrets })`.

Whatever a boundary puts in `err` becomes a record, `undefined` included: Pino drops an
`undefined` field before any serializer sees it, and a line that silently lost the failure it was
given is exactly the defaulting AGENTS.md refuses, so `createLogger` normalises that one case
before Pino's own check. A log call with no `err` property is untouched.

## 2. Read first

1. `AGENTS.md` and `LLM_README.md`.
2. `docs/superpowers/plans/2026-09-19-batch-1/README.md`, sections "Rules for every executor",
   "Execution contract" and "Standard blocks every packet uses". This packet uses the standard
   blocks **OpenSpec validation**, **Creating an OpenSpec change**, **Saving a mutation patch**,
   **Running one named test**, **Formatting** and **Completion gate** by name; they are not
   copied here except where an exact command is shown.
3. `docs/superpowers/plans/2026-09-19-batch-1/ASSUMPTIONS.md`.
4. `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`, the
   "Proposed integration contract" -> "Reporting" section and ordered slice 3, read with the
   2026-09-19 amendment at the top of the file.
5. `libs/shared/domain/failures/README.md` and `libs/shared/domain/failures/src/report-failure.ts`
   in full. The never-throw wrapper at its lines 139-166 is a dependency this packet's guard is
   proved against.
6. `docs/findings/checks-that-cannot-fail.md`, section "Checks kept without a reachable negative".
   This packet does **not** use that exception; proof 2 reaches its guard by breaking the
   dependency, which R5 allows.

## 3. Verified facts

Every line number is from `batch-3/planning` (main `da8be091`).

### The library today

- `libs/wbs/adapters/observability/src/serializers.ts:7` exports
  `errSerializer = (err: Error) => ({ type, message, stack })`. It is used at
  `libs/wbs/adapters/observability/src/logger.ts:26` as `serializers: { err: errSerializer }` and
  nowhere else; `libs/wbs/adapters/observability/src/index.ts` has four lines and does not export
  `'./serializers'`.
- `libs/wbs/adapters/observability/src/log-schema.ts:15-19` declares
  `'err?': { name: 'string', message: 'string', 'stack?': 'string' }`. The serializer emits
  `type`, the schema requires `name`: **the two disagree today**, and no test noticed, because
  neither test in `src/logger.test.ts` logs an `err` (line 20 logs `{ request_id, user_id }`,
  line 41 a child binding).
- The project's targets live in `libs/wbs/adapters/observability/project.json` — **not** under
  `src/`. Its `test` target is `bun test --coverage --coverage-reporter=lcov` with
  `cwd: libs/wbs/adapters/observability`, so a focused run is
  `cd libs/wbs/adapters/observability && bun test <file>`.
- Baseline for the whole project, observed 2026-09-21 with
  `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test` in `libs/wbs/adapters/observability`:
  `3 pass`, `0 fail`, `8 expect() calls`, `Ran 3 tests across 2 files`. Every count below is
  stated as a delta from a baseline the slice records itself.

### The shared module

- `libs/shared/domain/failures/src/index.ts` exports exactly `createFailureRedaction`,
  `FAILURE_REPORT_LIMITS`, `type FailureReporting`, `reportFailure` and `SENSITIVE_KEYS`.
- `reportFailure` (`report-failure.ts:139`) never throws: the `catch` at line 158 returns
  `{ reported: false, occurrenceId: 'UNREPORTED_<n>', reason: REPORTING_LOST_REASON }`, and the
  counter at line 117 makes two losses distinct. **The serializer's loss record is that outcome,
  not a second counter of its own.**
- `FailureReporting` (`report-failure.ts:112`) is a plain structural union. It carries **no
  runtime provenance**: nothing distinguishes a real outcome from an object with the same shape.
  That single fact is why section 7 uses a `WeakMap` registration rather than a shape test.
- `FAILURE_REPORT_LIMITS` (`report-failure.ts:25`) is `maxReportSize: 32_768`, `maxDepth: 4`,
  `maxChildren: 16`, `inspection: 'no-invoke'`, each with its own recorded `Proof:` comment, so
  the byte budget and the redaction already hold and this packet adds no second pass.
- `createFailureRedaction(secrets)` (`report-failure.ts:93`) is built once and shared, because
  the library caches one report maker per policy.

### Probed library behaviour (installed versions, not documentation)

Installed: `pino` 10.3.1, `application-exception` 0.5.0, `caught-object-report-json` 11.0.1
(`package.json:46,48,55`, versions read back with `node -e "require(...).version"`). Everything
below was observed with `bun -e` or a scratch test in the rehearsal worktree on 2026-09-21.

- **Pino does not catch a throwing serializer.** With
  `serializers: { boomer: () => { throw new Error('serializer exploded'); } }`, the call
  `logger.error({ boomer: {} }, 'bad')` **rethrows** `Error: serializer exploded` into the
  caller and the destination receives **no line at all**.
- **Pino drops an `undefined` field before any serializer.** `pino/lib/tools.js:168` guards the
  field loop with `value !== undefined`, so `logger.error({ err: undefined }, 'probe')` emitted
  `{"level":"error","time":...,"service":"be-01","request_id":"r1","msg":"probe"}` — no `err` at
  all — and `LogRecord` accepts it, because `err` is optional. `formatters.log` runs at
  `tools.js:161-163`, **before** that loop, which is where the normalisation has to sit.
- **`formatters.log` runs before serializers**, so it cannot lift a serialized field to the top
  level: the hook printed `LOGFMT SEES err = {}` for a raw `Error`, while the emitted line
  carried the serializer's output. Occurrence id and fingerprint therefore live **inside** `err`.
- **Serializers apply to child bindings too**, so a request-scoped child logger takes the same
  path.
- **Pino survives hostile values a serializer returns**: a self-referential object came out as
  `"self":"[Circular]"` and a `BigInt` as `1`, no throw.
- **`WeakMap.prototype.get` is safe where a property read is not.** `get` on a revoked `Proxy`
  returned `undefined`, and `get` on an object whose `reported` property is an accessor did not
  run that accessor. A `value.reported` read throws on the first and runs the second.
- **`toReports(caught, { diagnostic, public })` returns** `{ occurrence_id, diagnostic, public }`.
  A diagnostic report of `new Error('db unavailable')` was
  `{"occurrence_id":"AE_...","fingerprint":"fp1_...","stack":[...],"as_string_format":"derived","v":"corj/v0.14"}`
  (459 bytes with a cause and two own properties); its public report was 181 bytes and read
  `{"v":"appex/public/v4","occurrence_id":"AE_...","fingerprint":"fp1_...","code":"INTERNAL_ERROR","message":"Something went wrong"}`.
  `v` is the reliable discriminator, and it is what the schema branches on.
- **`DiagnosticReport` always carries `v`** (`application-exception/report-types.d.ts:23` narrows
  `CorjReport` with a required `v` and a required `occurrence_id`), so requiring `/^corj\//` in
  the schema is safe.
- **The fingerprint field is named `fingerprint`**, matching `/^fp1_[0-9a-f]{32}$/`; the
  occurrence id matches `/^AE_[0-9A-Z]{26}$/` (29 characters).
- **Fingerprint stability, measured.** Two occurrences of one failure thrown from the same
  statement in a loop produced **the same** `fingerprint` and **two different** `occurrence_id`s.
  It is a pure function of the reported content: two `Error`s whose `stack` strings were forced
  equal shared a fingerprint; two created on the same source line but at different _columns_ did
  not.
- **`fingerprint` is optional.** `caught-object-report-json/index.d.ts:67` types it
  `fingerprint?: string`, and `application-exception/reporting.d.ts` says it "is published only
  when backed by real stack frames". A thrown string's _public_ report carried none.
- **A bare revoked `Proxy` is reported successfully**, not lost: `reportFailure` produced a normal
  report for it. The value that actually reaches `reportFailure`'s own loss path is a revoked
  proxy **as a cause** — `new Error('boom', { cause: revoked })` — which is what the tests use.
- **The redaction marker is lowercase `[redacted]`.** A message reading `token was hunter2 twice:
hunter2` came back as `Error: token was [redacted] twice: [redacted]`.

### The ArkType branch, probed in this project

A scratch test in `libs/wbs/adapters/observability` ran the exact `err` schema of section 7 over
five candidates and printed:

```text
diagnostic ACCEPT
publicReport REJECT: reason must be a string (was missing) or v must be matched by ^corj/ (was "appex/public/v4")
bare REJECT: reason must be a string (was missing) or v must be a string (was missing)
halfLoss REJECT: reason must be a string (was missing) or v must be a string (was missing)
loss ACCEPT
```

### The commit hook, reproduced

`lefthook.yml`'s `pre-commit` runs `bunx eslint {staged_files}` and
`bunx prettier --check {staged_files}`, and `eslint.config.js:113` applies
`tseslint.configs.strictTypeChecked` with no unsafe-call or unsafe-assignment relaxation for test
files. **Rehearsed**: committing the test files alone, before the implementation exists, was
refused —

```text
libs/wbs/adapters/observability/src/serializers.test.ts
    6:7   error  Unsafe assignment of an error typed value         @typescript-eslint/no-unsafe-assignment
    6:19  error  Unsafe call of a type that could not be resolved  @typescript-eslint/no-unsafe-call
...
✖ 21 problems (21 errors, 0 warnings)
```

and `git commit` exited 1 with no commit created. That is why the tests and the implementation are
**one** slice: the red run is captured as evidence inside slice B, not as a commit. Committing
slice B complete was rehearsed and passed every hook command (`7 files changed`), and so was
slice A's OpenSpec-only commit (`5 files changed`).

### Callers, and what this change does to them

There are **ten** production sites that put `err` into a log call, not four. All of them pass a
caught value and **keep compiling and behaving**, because the new serializer takes `unknown` and
`secrets` is optional. **Do not edit any of them.**

| Site                                                           | Level                   |
| -------------------------------------------------------------- | ----------------------- |
| `apps/wbs/be-01/src/main.ts:54`                                | error                   |
| `apps/wbs/be-01/src/main.ts:69`                                | error                   |
| `apps/wbs/be-01/src/dev/main.ts:74`                            | error                   |
| `apps/wbs/be-01/src/dev/main.ts:86`                            | error                   |
| `apps/wbs/be-01/src/services.ts:152`                           | error                   |
| `apps/wbs/be-01/src/controller/infrastructure-endpoints.ts:33` | error                   |
| `apps/wbs/be-01/src/controller/auth-oidc-endpoints.ts:267`     | info, warn **or** error |
| `apps/wbs/gw-01/src/app.ts:161`                                | error                   |
| `libs/wbs/application/core/src/compose.ts:186`                 | warn                    |
| `libs/wbs/application/core/src/compose.ts:257`                 | error                   |

The OIDC site is the one worth reading: `err` sits in the `classified` object built at
`auth-oidc-endpoints.ts:266-270` and is handed to `logger?.info`, `logger?.warn` or
`logger?.error` at lines 273-277 depending on `failure.kind`. A serializer runs at **every**
level, so after this change an ordinary OIDC refusal produces a full diagnostic report at `info`.
That is intended — it is the same redacted, bounded record — and it is named here because the
packet's lane forbids changing it. `apps/wbs/be-01/src/http/elysia/auth-oidc.test.ts:212` asserts
`fields: { err: failure }` against a **fake** logger that records fields rather than Pino, so it
is unaffected; that fake is why the real serializer's effect on this caller had to be established
by reading the production file, not by that test.

`createLogger` is called at `apps/wbs/be-01/src/app.ts:193` and `apps/wbs/be-01/src/app.ts:258` —
**two similar call sites in one file** — and in `boot.db.test.ts:69` and `services.db.test.ts:67`.
None is edited. Rehearsed:
`NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-gw-01,wbs-core` passed with the
whole change in place.

`tools/tool-observability-stack/src/{promtail,grafana,loki,prometheus}` contain **no** reference
to `err`, `name`, `message` or `stack` as a log field, so no dashboard or ingestion query reads
the field being changed.

### Whole-suite effects the sandbox cannot see

Two separate checks live in `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, and the
packet's earlier draft confused them:

- `legacySourceOccurrences()` (line 336) collects matches of `LEGACY_ROOT` — pre-extraction paths
  the pre-extraction application and library roots its `LEGACY_ROOT` pattern lists at
  `repo-namespacing-handoff.test.ts:26` — across the scanned families and pins a count and a
  sha256 digest. This packet introduces none of them, so **that digest does not move**. Do not
  quote one as an example in prose either: the second rehearsal of this packet failed with
  `docs/superpowers/plans/2026-09-21-batch-3/040-5-observability-serializer.md:legacy-root`
  because an earlier draft spelled one out to explain the check. It is not the `nx run`
  scanner; that is a separate document check over `nx run <project>:` invocations, and the
  qualified project names this packet names (`wbs-observability`, `wbs-be-01`, `wbs-gw-01`,
  `wbs-core`, `tool-devsync`) all exist.
- `every routed current document resolves its local links and anchors` (line 441) resolves every
  Markdown link in every current document **relative to the document that contains it, including
  links inside fenced code blocks**. **Rehearsed the hard way**: the first draft of this packet
  showed an OpenSpec `tasks.md` containing
  a Markdown link to `../../../docs/superpowers/plans/2026-09-17-personal-package-adoption.md`,
  and `tool-devsync:test` failed with
  `docs/superpowers/plans/2026-09-21-batch-3/040-5-observability-serializer.md -> ../../../docs/superpowers/plans/2026-09-17-personal-package-adoption.md (absent docs/docs/superpowers/plans/2026-09-17-personal-package-adoption.md)`
  and, from the second check, `...040-5-observability-serializer.md:links`. **So the `tasks.md`
  this packet prescribes references the plan as a code-span path, not as a Markdown link**, and no
  listing anywhere in this packet contains Markdown link syntax.
- `tools/tool-devsync/src/workspace-inventory.test.ts:110-111` pins rows and files of
  parent-relative values in `tsconfig*.json` and `project.json`. This packet adds neither and
  changes no target, so it does not move.
- No file is added under `apps/wiki/cli`, so the Twilight Burokrat validator identity is
  unchanged and `apps/wiki/cli/src/packaging/build.test.ts` needs no `ruleModes` entry.
- OpenSpec, rehearsed: baseline `{"items": 107, "passed": 107, "failed": 0}` (95 changes, 12
  specs); with this change, `108 / 108 / 0`, the new change valid with no issues.

After all of the above was fixed, `tool-devsync:test` was rehearsed green with the whole change
staged. Counts are stated relative to the planner's own preceding run in section 12.

## 4. Decisions and assumptions

Recorded rather than asked, per the owner's standing instruction.

- **A1. The record is nested under `err`, not lifted to the top level.** `formatters.log` runs
  before serializers (probed above), so a serializer's output cannot reach the record root, and
  moving the reporting into `formatters.log` would apply it to every field of every line. Queries
  read `err.occurrence_id` and `err.fingerprint`.
- **A2. Provenance is registration, never shape.** `FailureReporting` has no runtime marker
  (`report-failure.ts:112`), so a structural test both trusts forged content and runs the value's
  accessors. A module-private `WeakMap` keyed on the outcome object is the only reading of an
  unknown value that can neither throw nor execute foreign code.
- **A3. There are two loss paths, and the serializer's own has its own counter.** On an intact
  tree a lost report is `reportFailure`'s `UNREPORTED_<n>` outcome, distinct per loss and proved
  in `@shared/failures`. The serializer's fallback, `nextSerializerLoss`, produces
  `UNSERIALIZED_<n>` from a counter of its own and answers only when the shared wrapper itself
  failed. It is not unreachable and it is not untested: proofs 2 and 10 reach it by breaking that
  wrapper, and the two `twoLostReports()` tests in section 8 assert nothing about which layer
  answered, so they hold on both trees and give the fallback's counter and fixed reason a real
  negative.
- **A3b. An explicitly logged `undefined` is reported, not dropped and not refused.** Refusing
  would mean a logger that throws, which the library's README forbids in the one place where
  swallowing is correct. Reporting `undefined` costs one bounded call — `reportFailure(undefined)`
  reads no property of anything — and produces an ordinary record an operator can correlate.
- **A4. A new OpenSpec change and a new capability, `log-failure-records` /
  `failure-log-records`.** No observability or logging capability exists in `openspec/specs` (the
  twelve are authentication, bounded-replay-sweep, core-lib-extraction, dev-deploy,
  gateway-request-deadlines, http-endpoint-port, plan-refresh, project-assignment-reads, realtime,
  scheduler-runtime-port, team-removal-revisions, wbs-table-modules), so nothing can be MODIFIED.
  The open `adopt-failure-reporting` change owns `failure-reporting` and names this work in its
  unowned task 2.1, but 040.7, 040.8 and 040.9 fall under that same task; four packets editing one
  delta spec is a collision. `adopt-failure-reporting` is **not edited**.
- **A5. `err` keeps its name.** Renaming would touch ten call sites and every future query for no
  gain; its contents are what this change defines.
- **A6. Legacy `name`/`message`/`stack` are removed, not kept as aliases.** The plan forbids
  manufacturing them from compact values the report may omit, and the schema's `name` was never
  emitted anyway.
- **A7. No `mcp-01`.** `ServiceName` and the schema's `service` union stay
  `'be-01'|'gw-01'|'fe-01'`; 040.8 adds `mcp-01` when it wires the MCP logger.

## 5. File plan

| Path                                                                     | Action                                                                                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/adapters/observability/src/serializers.ts`                     | Modify: replace `errSerializer`/`SerializedError` with `createFailureSerializer`, `registerReportedFailure`, `SerializedFailure`, `SerializedFailureLoss` |
| `libs/wbs/adapters/observability/src/serializers.test.ts`                | Create                                                                                                                                                    |
| `libs/wbs/adapters/observability/src/logger.ts`                          | Modify: `secrets` option, build the policy once, use the new serializer                                                                                   |
| `libs/wbs/adapters/observability/src/log-schema.ts`                      | Modify: the `err` member and its JSDoc                                                                                                                    |
| `libs/wbs/adapters/observability/src/logger.test.ts`                     | Modify: five tests appended inside the existing `describe('createLogger')`                                                                                |
| `libs/wbs/adapters/observability/src/index.ts`                           | Modify: one added export line                                                                                                                             |
| `libs/wbs/adapters/observability/README.md`                              | Modify: two file bullets and the landmines                                                                                                                |
| `openspec/changes/log-failure-records/.openspec.yaml`                    | Create                                                                                                                                                    |
| `openspec/changes/log-failure-records/proposal.md`                       | Create                                                                                                                                                    |
| `openspec/changes/log-failure-records/specs/failure-log-records/spec.md` | Create                                                                                                                                                    |
| `openspec/changes/log-failure-records/tasks.md`                          | Create                                                                                                                                                    |
| `openspec/changes/log-failure-records/verify.md`                         | Create                                                                                                                                                    |

`libs/shared/domain/failures/src/report-failure.ts` is outside the persistent file plan. Proofs 2
and 10 may temporarily mutate it, with saved patches, observed outputs, restoration from passing
copies and byte-identical `cmp` checks. It must not appear in either handover's diff.

`libs/wbs/adapters/observability/src/serializers.ts` gains `keepAbsentFailure` beside
`createFailureSerializer` and `registerReportedFailure`; `logger.ts` gains a `formatters.log`
hook as well as the `secrets` option.

**Neighbours.** No other batch 2 or batch 3 packet touches these files. 020.2 landed
`@shared/failures` and this packet only imports it. 020.7 and 040.7 touch `apps/wbs/be-01`; 040.4
and 110.1 touch the frontend and project targets; 010.6, 010.7 and 110.6 are Twilight Burokrat
and wiki work; G2 owns tests elsewhere in this project's neighbourhood and is why section 12's
devsync expectation is relative. If a step needs a file outside the table, **stop**.## 6. Steps

Three slices. Each is dispatched on its own, starts from the tree the previous slice's commit
left, records its own baseline, and ends with a commit the planner makes after review. Every
slice's pre-edit checks describe **its** tree, never an earlier one. No slice needs the network;
no test binds a port or spawns a process, so no `--network` at dispatch and no explicit Bun
timeout are required.

**Evidence between slices.** `run-executor.sh` gives every attempt a fresh temporary root, so a
later slice cannot see an earlier one's `$TMPDIR`. Two consequences the executor must follow:

- Every slice writes what it observed into `openspec/changes/log-failure-records/verify.md`
  **before** handing over, and `verify.md` is in every slice's changed-path list. That committed
  file, not `$TMPDIR`, is how a later slice and the planner read earlier results.
- A slice that needs an earlier slice's raw evidence files is dispatched with
  `--seed <that attempt's evidence directory>`, which the launcher merges into
  `$TMPDIR/<basename>`. No slice of this packet needs that, because `verify.md` carries
  everything; say so if you find otherwise instead of improvising.

Evidence references inside `verify.md` are **basenames** relative to the attempt's evidence
directory — never an absolute clone, home or temporary path.

### Slice A — The OpenSpec change

**Pre-edit checks.** All must hold; otherwise stop.

- `libs/wbs/adapters/observability/src/serializers.ts` contains `export const errSerializer`.
- `libs/wbs/adapters/observability/src/log-schema.ts` contains `name: 'string',`.
- `openspec/changes/log-failure-records/` does not exist.

**Step A0 — Baseline.**

```sh
set -uo pipefail
mkdir -p "$TMPDIR/evidence"
(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test) \
  >"$TMPDIR/evidence/a0-observability-baseline.log" 2>&1
echo "status=$?" >>"$TMPDIR/evidence/a0-observability-baseline.log"
tail -6 "$TMPDIR/evidence/a0-observability-baseline.log"
```

`set -e` is deliberately absent from every baseline block in this packet, because one of them
expects a nonzero status. Expected here: `status=0` and a line `Ran N tests across M files`.
Write N, M and the `expect() calls` count down; every later count is a delta from them. The
planner observed `3 pass`, `0 fail`, `8 expect() calls`, `Ran 3 tests across 2 files`.

Record the OpenSpec baseline with the README's **OpenSpec validation** block. The planner observed
`{"items": 107, "passed": 107, "failed": 0}`; call that number `V`.

**Step A1 — Create the change** with the README's **Creating an OpenSpec change** block, name
`log-failure-records`. Then write `proposal.md`, `specs/failure-log-records/spec.md` and
`tasks.md` exactly as section 9 gives them, and create `verify.md` with the heading block of
`openspec/changes/adopt-failure-reporting/verify.md` (change name, date, verifier attempt id).

**Step A2 — Validate.** Run the **OpenSpec validation** block again. Expected: `"items": V+1`,
`"failed": 0`, block exits 0, and the report names `log-failure-records` as valid.

**Step A3 — Record.** Append to `verify.md`: the A0 baseline counts and the two validation
totals, each with its command and exit status.

**Hand over.** Changed paths, all new:

```text
?? openspec/changes/log-failure-records/.openspec.yaml
?? openspec/changes/log-failure-records/proposal.md
?? openspec/changes/log-failure-records/specs/failure-log-records/spec.md
?? openspec/changes/log-failure-records/tasks.md
?? openspec/changes/log-failure-records/verify.md
```

`tasks.md` task 1.1 stays unchecked: nothing is implemented yet. Commit subject for the planner:
`docs(openspec): declare the failure log record contract`. Rehearsed: this commit passes every
lefthook command.

### Slice B — The tests and the implementation, together

The tests are written and watched failing **inside** this slice, and never committed alone. The
repository's pre-commit hook runs `bunx eslint` over staged files under
`tseslint.configs.strictTypeChecked`, and test files importing a not-yet-existing
`createFailureSerializer` produce 21 unsafe-call and unsafe-assignment errors, so a red
checkpoint commit is impossible (rehearsed; see section 3).

**Pre-edit checks.** `openspec/changes/log-failure-records/proposal.md` exists;
`src/serializers.ts` still contains `export const errSerializer`; `src/log-schema.ts` still
contains `name: 'string',`; `src/serializers.test.ts` does not exist. Otherwise stop.

**Step B0 — Baseline.** Rerun step A0's block into `"$TMPDIR/evidence/b0-baseline.log"`.
Expected: `status=0` and A0's counts, which you read from the committed `verify.md`.

**Step B1 — Write `src/serializers.test.ts`**, exactly as section 8 gives it.

**Step B2 — Append section 8's helper and its ten tests to `src/logger.test.ts`.** The helper
block (`interface LoggedLoss` through the closing `}` of `twoLostReports`) goes at module scope,
directly above `describe('createLogger', () => {`. The ten tests go inside that `describe`,
directly after the closing `});` of `it('child logger inherits context', ...)` and before the
file's final `});`.

**Step B3 — Watch them fail, with the status captured.**

```sh
set -uo pipefail
(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test) \
  >"$TMPDIR/evidence/b3-red.log" 2>&1
echo "status=$?" >>"$TMPDIR/evidence/b3-red.log"
grep -E "^status=|error:|Ran " "$TMPDIR/evidence/b3-red.log"
```

Expected: a **nonzero** `status=` line and a failure naming `createFailureSerializer` as missing
from `./serializers`. `status=0` is a stop — the tests are supposed to fail. `0 tests ran` is a
stop. **Do not commit here**; keep `b3-red.log` and quote its decisive lines in `verify.md`.

**Step B4 — Replace `src/serializers.ts`** with section 7's listing. The `Proof:` comments are
written in slice C, after the faults have been observed.

**Step B5 — Replace `src/logger.ts`** with section 7's listing. It is a whole-file replacement
because the change touches the imports, the options interface, the policy construction, the
serializer and the formatters.

**Step B6 — Edit `src/log-schema.ts`.** Replace the whole `'err?': { ... },` member (lines 15-19,
from `'err?': {` through the `},` that closes it) with section 7's `'err?': [ ... ],` member, and
add section 7's JSDoc block directly above `export const LogRecord = type({`.

**Step B7 — Edit `src/index.ts`.** Append `export * from './serializers';` after the
`'./prometheus'` line; `simple-import-sort/exports` fixes the order if it is wrong.

**Step B8 — Green, typed, linted.** This slice re-declares an exported type, so it runs the type
check itself, and the downstream one because ten callers pass values to the changed serializer:

```sh
(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)
NX_DAEMON=false bunx nx run wbs-observability:typecheck
NX_DAEMON=false bunx nx run wbs-observability:lint
NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-gw-01,wbs-core
```

Expected, all status 0: baseline N + 24 tests across baseline M + 1 files — the planner observed
`27 pass`, `0 fail`, `64 expect() calls`, `Ran 27 tests across 3 files`; then
`Successfully ran target typecheck for project wbs-observability`; then
`Successfully ran target lint for project wbs-observability`; then
`Successfully ran target typecheck for 3 projects`. Start each Nx target under the preamble's
status-recording wrapper (rule 19).

A lint failure whose only diagnostics are `simple-import-sort/*` or `prettier/prettier` is fixed
with `bunx eslint --fix` on the named files (preamble rule 17), not a stop. Anything else stops.

**Step B9 — Record.** Append to `verify.md`: the B0 baseline, the B3 red status and its decisive
line, and each B8 command with its status and decisive line.

**Hand over.** Changed paths:

```text
 M libs/wbs/adapters/observability/src/index.ts
 M libs/wbs/adapters/observability/src/log-schema.ts
 M libs/wbs/adapters/observability/src/logger.test.ts
 M libs/wbs/adapters/observability/src/logger.ts
 M libs/wbs/adapters/observability/src/serializers.ts
?? libs/wbs/adapters/observability/src/serializers.test.ts
 M openspec/changes/log-failure-records/verify.md
```

`tasks.md` task 1.1 is still unchecked: its negatives are slice C's. Commit subject:
`feat(observability): log a failure as its diagnostic report`. Rehearsed: this commit passes
every lefthook command.

### Slice C — Negative proofs, documentation, hand-over

**Pre-edit checks.** These describe the tree **after** slice B, and are the opposite of slice A's:
`src/serializers.ts` contains `export function createFailureSerializer` and **no longer** contains
`errSerializer`; `src/log-schema.ts` contains `v: '/^corj\\//',`; the whole-project test run is
green. Otherwise stop.

**Step C0 — Baseline.** Rerun step A0's block. Expected: `status=0` and slice B's counts, which
you read from the committed `verify.md`.

**Step C1 — The ten proofs** of section 11, one at a time, each with the README's
**Saving a mutation patch** form, each restored with `cp` and verified with `cmp` **before** any
assertion on a captured status, each followed by a green rerun of the named test. Proofs 2 and 10
mutate two files and need both restored and both `cmp`-verified.

**Step C2 — Write the `Proof:` comments** at the locations section 11 names, using the
diagnostics you actually saw.

**Step C3 — README.** Apply section 10's edits.

**Step C4 — `verify.md` and `tasks.md`.** Append the ten proofs to `verify.md`, each naming its
fault, the test, the observed line and the restore's `cmp` result. Then tick task 1.1 in
`openspec/changes/log-failure-records/tasks.md`: this slice completes it.

**Step C5 — Format and validate.**

```sh
GSETTINGS_BACKEND=memory bunx prettier --write \
  libs/wbs/adapters/observability/src/serializers.ts \
  libs/wbs/adapters/observability/src/serializers.test.ts \
  libs/wbs/adapters/observability/src/logger.ts \
  libs/wbs/adapters/observability/src/logger.test.ts \
  libs/wbs/adapters/observability/src/log-schema.ts \
  libs/wbs/adapters/observability/src/index.ts \
  libs/wbs/adapters/observability/README.md \
  openspec/changes/log-failure-records/proposal.md \
  openspec/changes/log-failure-records/tasks.md \
  openspec/changes/log-failure-records/verify.md \
  openspec/changes/log-failure-records/specs/failure-log-records/spec.md
NX_DAEMON=false bunx nx run wbs-observability:lint
NX_DAEMON=false bunx nx run wbs-observability:typecheck
(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)
NX_DAEMON=false GSETTINGS_BACKEND=memory bunx nx format:check --all
```

`--all` is required: without it the check can select nothing and pass vacuously. Expected exit 0
from each, and no output from `format:check`. Then run the README's **OpenSpec validation** block
again; expected `"items": V+1`, `"failed": 0`. Prettier reflows the ternary `Proof:` comment of
proof 3; section 11 already shows the post-Prettier form.

**Hand over.** Changed paths:

```text
 M libs/wbs/adapters/observability/README.md
 M libs/wbs/adapters/observability/src/log-schema.ts
 M libs/wbs/adapters/observability/src/logger.ts
 M libs/wbs/adapters/observability/src/serializers.ts
 M openspec/changes/log-failure-records/tasks.md
 M openspec/changes/log-failure-records/verify.md
```

`libs/shared/domain/failures/src/report-failure.ts` must **not** appear: if it does, proof 2 or 10
was not restored. Commit subject: `docs(observability): record the failure record proofs`.

**Cumulative check.** After slice C, `git diff --name-only <the commit slice A started from>`
must list exactly the twelve paths of section 5 and nothing else.

## 7. The code, exactly

### `libs/wbs/adapters/observability/src/serializers.ts` (whole file, post-Prettier)

```ts
import { type FailureReporting, reportFailure } from '@shared/failures';
import type { DiagnosticReport, RedactionPolicy } from 'application-exception';

/**
 * What the operator sink is given when no report of a failure could be built at all.
 *
 * The loss is modelled here rather than propagated, because Pino does not catch a throwing
 * serializer: it rethrows into the `logger.error(...)` call and writes no line whatsoever.
 */
export interface SerializedFailureLoss {
  readonly occurrence_id: string;
  readonly reported: false;
  readonly reason: string;
}

/** The operator-facing record of one failure: the diagnostic report, or the modelled loss. */
export type SerializedFailure = DiagnosticReport | SerializedFailureLoss;

/**
 * Reporting outcomes this process produced itself.
 *
 * A caught value is untrusted data: anything can carry a `reported` property, a
 * `reports.diagnostic` object or a getter, so provenance cannot be read off the value's own
 * shape. Only an outcome a boundary handed to {@link registerReportedFailure} is reused;
 * everything else is reported afresh under the caller's redaction policy. Reading the map neither
 * invokes accessors nor throws on a revoked `Proxy`, which is why it is the first thing the
 * serializer does.
 */
const reportedFailures = new WeakMap<object, FailureReporting>();

/**
 * Mark a reporting outcome as this process's own, so logging it reuses its reports instead of
 * reporting the outcome object itself as a new failure under a second occurrence id.
 *
 * This is the whole interface a boundary that already called `reportFailure` — because it needed
 * the public report for its response — uses:
 * `logger.error({ err: registerReportedFailure(reporting) }, 'operation failed')`.
 *
 * @param reporting An outcome of `reportFailure` from `@shared/failures`.
 * @returns The same outcome, now trusted by {@link createFailureSerializer}.
 */
export function registerReportedFailure(reporting: FailureReporting): FailureReporting {
  reportedFailures.set(reporting, reporting);
  return reporting;
}

/**
 * Replace an explicitly present `err: undefined` with a reported outcome of that very value.
 *
 * Pino drops a property whose value is `undefined` before any serializer sees it
 * (`pino/lib/tools.js:168` tests `value !== undefined` inside the field loop), so a boundary that
 * caught `undefined` and logged `{ err }` would get a line carrying no failure record at all —
 * indistinguishable from a line that was never about a failure. The value is reported here
 * instead of dropped, and the outcome is registered so the serializer reuses it rather than
 * reporting a second occurrence. A record with no `err` property is left exactly as it is.
 *
 * `formatters.log` is where this must happen: Pino calls it on the whole field object before the
 * loop that drops undefined values.
 *
 * @param fields One log record's fields, as Pino assembled them.
 * @param redact The policy of the boundary that owns the logger.
 * @returns The same fields, or a copy whose `err` is a reported outcome.
 */
export function keepAbsentFailure(
  fields: Record<string, unknown>,
  redact: RedactionPolicy,
): Record<string, unknown> {
  if (!('err' in fields) || fields['err'] !== undefined) return fields;
  return { ...fields, err: registerReportedFailure(reportFailure(undefined, { redact })) };
}

/** Fixed text: a thrown message may quote the very value the policy was protecting. */
const SERIALIZER_LOST_REASON = 'the failure could not be read for logging; its reports are lost';

/** Losses inside this serializer, so two of them never share a correlation handle. */
let unserializableFailures = 0;

/** A correlation handle for a failure no report could be built from. */
function nextSerializerLoss(): SerializedFailureLoss {
  unserializableFailures += 1;
  return {
    occurrence_id: `UNSERIALIZED_${String(unserializableFailures)}`,
    reported: false,
    reason: SERIALIZER_LOST_REASON,
  };
}

/**
 * Turn what a boundary logged under `err` into the operator's record of that failure.
 *
 * Only the DIAGNOSTIC report is written. The public report is what a user or an agent is told and
 * is deliberately content-free (`INTERNAL_ERROR`, a generic message); logging it instead would
 * leave the operator with nothing to debug, and the diagnostic report — messages, stacks, every
 * enumerable property — must never travel the other way, out to a user, an agent or a browser
 * console.
 *
 * Redaction and the size budget are applied once, by `@shared/failures`: a value that reaches
 * this serializer unregistered is reported here under `redact`, and a registered outcome was
 * reported under the policy its own boundary holds. Nothing is scrubbed twice and no raw caught
 * value is ever written.
 *
 * Every read of the value, the selection between the two outcomes and the construction of the
 * record sit inside one guard, because each of them can throw for a hostile value and Pino would
 * drop the whole line.
 *
 * @param redact The policy of the boundary that owns the logger, built once at startup.
 * @returns A Pino serializer that never throws, for any value whatsoever.
 */
export function createFailureSerializer(
  redact: RedactionPolicy,
): (value: unknown) => SerializedFailure {
  return (value: unknown): SerializedFailure => {
    try {
      const own =
        typeof value === 'object' && value !== null ? reportedFailures.get(value) : undefined;
      const reporting = own ?? reportFailure(value, { redact });
      return reporting.reported
        ? reporting.reports.diagnostic
        : {
            occurrence_id: reporting.occurrenceId,
            reported: false,
            reason: reporting.reason,
          };
    } catch {
      return nextSerializerLoss();
    }
  };
}
```

### `libs/wbs/adapters/observability/src/logger.ts` (whole file, post-Prettier)

```ts
import { createFailureRedaction } from '@shared/failures';
import type { Logger } from '@wbs/contracts';
import pino, { type LoggerOptions } from 'pino';

import { createFailureSerializer, keepAbsentFailure } from './serializers';

export { type Logger, noopLogger } from '@wbs/contracts';

export type ServiceName = 'be-01' | 'gw-01' | 'fe-01';

export interface CreateLoggerOptions {
  service: ServiceName;
  version?: string;
  level?: string;
  destination?: { write(chunk: string): void };
  /**
   * The secret values this process owns, scrubbed from every failure record as text. Only what
   * the caller actually holds: a secret nobody named cannot be detected, and a whole config,
   * request or environment object is never passed.
   */
  secrets?: readonly string[];
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const level = opts.level ?? process.env['LOG_LEVEL'] ?? 'info';
  // One policy per logger, built once: `@shared/failures` caches one report maker per policy,
  // and a policy rebuilt per record would throw that cache away on every failure.
  const redact = createFailureRedaction(opts.secrets ?? []);
  const base: Record<string, unknown> = { service: opts.service };
  if (opts.version) base['version'] = opts.version;

  const options: LoggerOptions = {
    level,
    base,
    timestamp: () => `,"time":${String(Date.now())}`,
    serializers: { err: createFailureSerializer(redact) },
    formatters: {
      level: (label: string) => ({ level: label }),
      log: (fields: Record<string, unknown>) => keepAbsentFailure(fields, redact),
    },
  };

  return opts.destination ? pino(options, opts.destination) : pino(options);
}
```

### `libs/wbs/adapters/observability/src/log-schema.ts` — the two edits

JSDoc directly above `export const LogRecord = type({`:

```ts
/**
 * The fields a log line may carry, so a query across tiers is written once.
 *
 * `err` is one of exactly two things and nothing else: the sanitized DIAGNOSTIC report of a
 * failure, recognised by its `corj/` version, or the modelled loss that says no report could be
 * built. The public report — `appex/public/v4`, `INTERNAL_ERROR`, a generic message — is what a
 * user or agent is told and is refused here, because an operator reading it would have nothing
 * to debug. `occurrence_id` correlates the record with what that user or agent was told;
 * `fingerprint` is equal for failures of the same kind from the same place and is a retry
 * signal, not a lookup key — the report libraries publish none for a value with no real stack
 * frames, so it is optional. Legacy `name`, `message` and `stack` fields are gone: they would
 * have to be manufactured from compact values the report is allowed to omit.
 */
```

Replacing the `'err?'` member:

```ts
  'err?': [
    {
      v: '/^corj\\//',
      occurrence_id: 'string',
      'fingerprint?': 'string',
      '[string]': 'unknown',
    },
    '|',
    { occurrence_id: 'string', reported: 'false', reason: 'string' },
  ],
```

The `v` value is the TypeScript string literal `'/^corj\\//'`; evaluated, it is the nine-character
ArkType pattern `/^corj\//`. Getting the escape wrong makes the diagnostic branch reject every
real report.## 8. The tests, exactly

### `libs/wbs/adapters/observability/src/serializers.test.ts` (new file, whole)

```ts
import { createFailureRedaction, reportFailure } from '@shared/failures';
import { describe, expect, it } from 'bun:test';

import { createFailureSerializer, registerReportedFailure } from './serializers';

const serialize = createFailureSerializer(createFailureRedaction(['hunter2']));

/** A caught value the report library cannot inspect, so `reportFailure` returns a real loss. */
function unreportableFailure(): unknown {
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  return new Error('boom', { cause: revocable.proxy });
}

describe('createFailureSerializer', () => {
  it('writes the diagnostic report of a raw caught value', () => {
    const record = serialize(new Error('db unavailable')) as Record<string, unknown>;
    expect(record['occurrence_id']).toMatch(/^AE_/);
    expect(record['fingerprint']).toMatch(/^fp1_/);
    expect(record['v']).toBe('corj/v0.14');
    expect(JSON.stringify(record)).toContain('db unavailable');
  });

  it('keeps the whole cause chain of a reported failure', () => {
    const record = serialize(new Error('outer', { cause: new TypeError('inner') })) as Record<
      string,
      unknown
    >;
    const children = record['children'] as { path: string; stack: string[] }[];
    expect(children).toHaveLength(1);
    expect(children[0].path).toBe('$.cause');
    expect(children[0].stack[0]).toBe('TypeError: inner');
  });

  it('never writes the public report in place of the diagnostic one', () => {
    const record = serialize(new Error('db unavailable')) as Record<string, unknown>;
    expect(record['v']).toBe('corj/v0.14');
    expect(record['code']).toBeUndefined();
    expect(JSON.stringify(record)).not.toContain('Something went wrong');
  });

  it('reuses the registered outcome of an already reported failure', () => {
    const reporting = reportFailure(new Error('already reported'), {
      redact: createFailureRedaction([]),
    });
    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    const record = serialize(registerReportedFailure(reporting));
    expect(record).toBe(reporting.reports.diagnostic);
  });

  it('reports an unregistered reporting-shaped value instead of trusting it', () => {
    const forged = {
      reported: true,
      reports: { diagnostic: { occurrence_id: 'forged', v: 'corj/v0.14', password: 'hunter2' } },
    };
    const record = serialize(forged) as Record<string, unknown>;
    expect(JSON.stringify(record)).not.toContain('hunter2');
    expect(record['occurrence_id']).not.toBe('forged');
  });

  it('reports an unregistered loss-shaped value instead of trusting its reason', () => {
    const forged = { reported: false, occurrenceId: 'forged', reason: 'leak hunter2' };
    const record = serialize(forged) as Record<string, unknown>;
    expect(JSON.stringify(record)).not.toContain('hunter2');
    expect(record['reason']).toBeUndefined();
    expect(record['occurrence_id']).not.toBe('forged');
  });

  it('does not invoke an accessor named reported while deciding provenance', () => {
    let accessorRuns = 0;
    const hostile = {};
    Object.defineProperty(hostile, 'reported', {
      enumerable: true,
      get: () => {
        accessorRuns += 1;
        return true;
      },
    });
    const record = serialize(hostile) as Record<string, unknown>;
    expect(accessorRuns).toBe(0);
    expect(record['v']).toBe('corj/v0.14');
  });

  it('keeps a genuine reporting loss from the shared module', () => {
    const reporting = reportFailure(unreportableFailure(), { redact: createFailureRedaction([]) });
    expect(reporting.reported).toBe(false);
    if (reporting.reported) return;
    const record = serialize(registerReportedFailure(reporting)) as Record<string, unknown>;
    expect(record['occurrence_id']).toBe(reporting.occurrenceId);
    expect(record['reason']).toBe(reporting.reason);
    expect(record['reported']).toBe(false);
  });

  it('gives two occurrences of one failure one fingerprint and two occurrence ids', () => {
    const boom = (): never => {
      throw new Error('db unavailable');
    };
    const records: Record<string, unknown>[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        boom();
      } catch (caught) {
        records.push(serialize(caught) as Record<string, unknown>);
      }
    }
    const [first, second] = records;
    expect(first['fingerprint']).toBe(second['fingerprint']);
    expect(first['occurrence_id']).not.toBe(second['occurrence_id']);
  });

  it('scrubs a caller-owned secret without a second redaction pass', () => {
    const record = serialize(new Error('token was hunter2 twice: hunter2')) as Record<
      string,
      unknown
    >;
    const stack = record['stack'] as string[];
    expect(JSON.stringify(record)).not.toContain('hunter2');
    expect(stack[0]).toBe('Error: token was [redacted] twice: [redacted]');
  });

  it('writes a visible loss rather than throwing when no report can be built', () => {
    const record = serialize(unreportableFailure()) as Record<string, unknown>;
    expect(record['reported']).toBe(false);
    expect(String(record['occurrence_id'])).toContain('UNREPORTED_');
    expect(typeof record['reason']).toBe('string');
  });

  it('gives two reporting losses two different handles', () => {
    const first = serialize(unreportableFailure()) as Record<string, unknown>;
    const second = serialize(unreportableFailure()) as Record<string, unknown>;
    expect(first['occurrence_id']).not.toBe(second['occurrence_id']);
  });

  it('serializes a revoked proxy, null, undefined and a primitive without throwing', () => {
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    for (const hostile of [revocable.proxy, null, undefined, 42, 'thrown text']) {
      const record = serialize(hostile) as Record<string, unknown>;
      expect(typeof record['occurrence_id']).toBe('string');
    }
  });

  it('keeps every failure record inside the report byte budget', () => {
    const record = serialize(new Error('x'.repeat(200_000)));
    expect(Buffer.byteLength(JSON.stringify(record), 'utf8')).toBeLessThanOrEqual(32_768);
  });
});
```

Notes the executor needs:

- `const [first, second] = records;` is deliberate: `records[0]!['fingerprint']` fails lint with
  `@typescript-eslint/no-unnecessary-type-assertion` (four diagnostics, observed).
- `unreportableFailure()` is a revoked proxy **as a cause**. A bare revoked proxy is reported
  successfully and would not reach the loss path at all.

### `libs/wbs/adapters/observability/src/logger.test.ts` — one helper and ten tests

Prettier formats a fenced block as a standalone file and strips leading indentation from this
document each time it runs, so both listings are shown at column zero. The helper is already at
module scope; **indent every line of the tests listing by two further spaces** when pasting it
inside `describe`.

Module-scope helper, directly above `describe('createLogger', () => {`:

```ts
interface LoggedLoss {
  readonly occurrence_id: string;
  readonly reported: false;
  readonly reason: string;
}

/**
 * Log two failures no report can be built for and read back both loss records.
 *
 * Asserts nothing about which layer produced the loss, so it holds both on an intact tree, where
 * `@shared/failures` returns it, and under the dependency fault of the guard's proof, where the
 * serializer's own fallback does.
 */
function twoLostReports(): [LoggedLoss, LoggedLoss] {
  const stream: string[] = [];
  const logger = createLogger({
    service: 'be-01',
    destination: {
      write: (chunk: string) => {
        stream.push(chunk);
      },
    },
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    logger.error({ err: new Error('boom', { cause: revocable.proxy }) }, 'report lost');
  }
  const [first, second] = stream
    .slice(-2)
    .map((line) => parseOrThrow(LogRecord, JSON.parse(line) as Record<string, unknown>))
    .map((record) => record.err as LoggedLoss);
  return [first, second];
}
```

The ten tests, inside `describe('createLogger', ...)`:

```ts
it('logs a failure as the diagnostic report and validates against the schema', () => {
  const stream: string[] = [];
  const logger = createLogger({
    service: 'be-01',
    destination: {
      write: (chunk: string) => {
        stream.push(chunk);
      },
    },
  });

  logger.error(
    { err: new Error('outer', { cause: new TypeError('inner') }), request_id: 'req-9' },
    'operation failed',
  );

  const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
  const failure = parsed.err as { occurrence_id: string; fingerprint?: string; v: string };
  expect(failure.v).toBe('corj/v0.14');
  expect(failure.occurrence_id).toMatch(/^AE_/);
  expect(failure.fingerprint).toMatch(/^fp1_/);
  expect(parsed.request_id).toBe('req-9');
});

it('reports an explicitly present undefined failure instead of dropping it', () => {
  const stream: string[] = [];
  const logger = createLogger({
    service: 'be-01',
    destination: {
      write: (chunk: string) => {
        stream.push(chunk);
      },
    },
  });
  const caught: unknown = undefined;

  logger.error({ err: caught, request_id: 'req-u' }, 'operation failed');

  const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
  const failure = parsed.err as { occurrence_id: string; v: string } | undefined;
  expect(failure).toBeDefined();
  expect(failure?.occurrence_id).toMatch(/^AE_/);
});

it('reports the failure it was given, never a substitute', () => {
  const stream: string[] = [];
  const logger = createLogger({
    service: 'be-01',
    destination: {
      write: (chunk: string) => {
        stream.push(chunk);
      },
    },
  });

  logger.error({ err: new Error('the real failure') }, 'operation failed');

  expect(stream.at(-1)!).toContain('Error: the real failure');
});

it('leaves a record that carries no failure alone', () => {
  const stream: string[] = [];
  const logger = createLogger({
    service: 'be-01',
    destination: {
      write: (chunk: string) => {
        stream.push(chunk);
      },
    },
  });

  logger.info({ request_id: 'req-plain' }, 'nothing failed');

  const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
  expect(parsed.err).toBeUndefined();
  expect(parsed.request_id).toBe('req-plain');
});

it('refuses a public report where the schema expects a failure record', () => {
  const publicReport = {
    level: 'error',
    time: 1,
    msg: 'operation failed',
    service: 'be-01',
    err: {
      v: 'appex/public/v4',
      occurrence_id: 'AE_1',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    },
  };
  expect(() => parseOrThrow(LogRecord, publicReport)).toThrow(/\^corj\//);
});

it('refuses a reporting loss that names no reason', () => {
  const halfLoss = {
    level: 'error',
    time: 1,
    msg: 'operation failed',
    service: 'be-01',
    err: { occurrence_id: 'UNREPORTED_1', reported: false },
  };
  expect(() => parseOrThrow(LogRecord, halfLoss)).toThrow(/reason must be a string/);
});

it('scrubs a secret this process owns out of the failure line', () => {
  const stream: string[] = [];
  const logger = createLogger({
    service: 'be-01',
    secrets: ['hunter2'],
    destination: {
      write: (chunk: string) => {
        stream.push(chunk);
      },
    },
  });

  logger.error({ err: new Error('token was hunter2') }, 'operation failed');

  expect(stream.at(-1)!).not.toContain('hunter2');
});

it('writes a line rather than throwing when the failure cannot be read', () => {
  const stream: string[] = [];
  const logger = createLogger({
    service: 'gw-01',
    destination: {
      write: (chunk: string) => {
        stream.push(chunk);
      },
    },
  });
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();

  logger.error({ err: new Error('boom', { cause: revocable.proxy }) }, 'unreadable failure');

  const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
  const failure = parsed.err as { occurrence_id: string; reported: false; reason: string };
  expect(failure.reported).toBe(false);
  expect(failure.occurrence_id).toContain('UNREPORTED_');
});

it('gives two lost reports two different correlation handles', () => {
  const losses = twoLostReports();
  expect(losses[0].reported).toBe(false);
  expect(losses[1].reported).toBe(false);
  expect(losses[0].occurrence_id).not.toBe(losses[1].occurrence_id);
});

it('states one fixed reason on every lost report', () => {
  const losses = twoLostReports();
  expect(losses[0].reason).toBe(losses[1].reason);
  expect(losses[0].reason.length).toBeGreaterThan(0);
});
```

Ten separate tests, not four: schema conformance, the absent-failure normalisation, the
no-substitute rule, the untouched plain record, the public-report refusal, the loss-reason
refusal, the redaction, the never-throw path, the distinct loss handles and the fixed loss reason
are ten checks, and one mutation must not be able to hide another.

`twoLostReports()` deliberately asserts nothing about which layer produced the loss, so the last
two tests hold both on an intact tree, where `@shared/failures` answers with `UNREPORTED_<n>`, and
under proof 2's dependency fault, where the serializer's fallback answers with `UNSERIALIZED_<n>`.
That is what gives the fallback counter a reachable negative.

## 9. OpenSpec

`openspec/changes/log-failure-records/.openspec.yaml` carries `schema: sdd-lean` and
`created: 2026-09-21`.

### `proposal.md` (385 words, under the 400-word limit)

```markdown
## Why

The WBS logger serializes an `err` into `{ type, message, stack }` while the declared log schema says `{ name, message, stack }`, so a query written against the schema reads a field the logger never emits, and no test noticed because no test logs an `err`. `@shared/failures` now produces a redacted, bounded diagnostic report with an occurrence identifier and a fingerprint, and nothing carries it into a log line.

## What Changes

**Failure log records**

- From: the logger renders a caught value itself, into a shape the log schema contradicts, with no correlation handle, no retry signal and no redaction.
- To: the logger writes the sanitized diagnostic report of one failure under `err` — for every value a boundary logged there, `undefined` included — and the log schema declares that record as exactly one of a diagnostic report or a visible reporting loss, so an operator can correlate a line with what a user or agent was told.
- Impact: contractual for anything reading WBS log lines; the Pino envelope, levels and correlation fields are unchanged.

## Non-Goals

No boundary adopts the contract in this change: the backend unexpected-error boundary, the MCP tool-call boundary and the gateway remain as they are. No new service name, no new telemetry endpoint, no dashboard or ingestion query change, no HTTP status, WebSocket frame or MCP envelope change, and no browser-execution claim.

## Constraints

A caught value is untrusted data, so provenance is a registration this process performed, never a shape read off the value. Redaction and the byte budget belong to `@shared/failures` and are not applied a second time. The diagnostic report goes only to the operator sink; the public report is never written in its place. Pino rethrows a throwing serializer and writes no line, so serializing a failure never throws, and every safety check here carries a watched production-path negative under R5.

## Capabilities

### New Capabilities

- `failure-log-records`: What a log line carries about one failure, and what it must never carry.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

`libs/wbs/adapters/observability/src/{serializers.ts,logger.ts,log-schema.ts,index.ts}` and their tests. The ten existing `logger.error`, `logger.warn` and `logger.info` call sites that pass `err` in `apps/wbs/be-01`, `apps/wbs/gw-01` and `libs/wbs/application/core` keep compiling and change only the shape of the `err` field they produce.
```

### `specs/failure-log-records/spec.md`

Every `### Requirement:` heading is followed directly by a normative SHALL sentence, or validation
refuses the file. This exact text was validated: `108 items, 108 passed, 0 failed`.

```markdown
## ADDED Requirements

### Requirement: A failure log record carries the diagnostic report

A log line about a failure SHALL carry that failure's sanitized diagnostic report, with its occurrence identifier, under the record's failure field, and SHALL validate against the declared log schema.

#### Scenario: A boundary logs a caught value

- **GIVEN** a logger built for a service
- **WHEN** a caught value is logged as a failure
- **THEN** the emitted line validates against the declared log schema
- **AND** the failure field carries the occurrence identifier of that failure

#### Scenario: The failure has a cause

- **GIVEN** a caught value whose cause is another failure
- **WHEN** it is logged as a failure
- **THEN** the record reports that cause as a child of the failure

### Requirement: A failure a boundary logged is never dropped

A log call that carries a failure field SHALL produce a failure record even when the caught value has no value at all, that record SHALL report the value the boundary logged rather than a substitute, and a log call carrying no failure field SHALL produce no failure record.

#### Scenario: The caught value has no value

- **GIVEN** a boundary that caught a value with no value and logs it as the failure
- **WHEN** the line is emitted
- **THEN** the line carries a failure record with an occurrence identifier

#### Scenario: The caught value is an ordinary failure

- **GIVEN** a boundary that logs a failure carrying a message
- **WHEN** the line is emitted
- **THEN** the record reports that failure rather than a substitute

#### Scenario: The line is not about a failure

- **GIVEN** a log call carrying no failure field
- **WHEN** the line is emitted
- **THEN** the line carries no failure record

### Requirement: The public report never replaces the diagnostic one

A failure log record SHALL NOT carry the public report of the failure in place of the diagnostic report, and the log schema SHALL refuse a record that carries one.

#### Scenario: An unknown failure is logged

- **GIVEN** a caught value with no disclosure policy
- **WHEN** it is logged as a failure
- **THEN** the emitted line carries the diagnostic report version rather than the public report version
- **AND** the line carries neither the generic public message nor a public code

#### Scenario: A public report is offered as a failure record

- **GIVEN** a candidate log record whose failure field is a public report
- **WHEN** it is validated against the log schema
- **THEN** validation refuses it

### Requirement: Only this process's own reporting outcomes are reused

A reporting outcome SHALL be reused for a log record only when this process registered it, and every other value SHALL be reported afresh under the logger's redaction policy. Deciding this SHALL NOT read any property of the value and SHALL NOT invoke any accessor on it.

#### Scenario: A caught value imitates a reporting outcome

- **GIVEN** an unregistered value shaped like a successful reporting outcome and carrying a secret
- **WHEN** it is logged as a failure
- **THEN** the record is a fresh report of that value
- **AND** the record does not contain the secret

#### Scenario: A caught value imitates a reporting loss

- **GIVEN** an unregistered value shaped like a reporting loss whose reason carries a secret
- **WHEN** it is logged as a failure
- **THEN** the record is a fresh report of that value
- **AND** the record does not contain the secret

#### Scenario: A caught value exposes an accessor with the deciding name

- **GIVEN** a caught value with an accessor named as the reporting outcome's discriminator
- **WHEN** it is logged as a failure
- **THEN** the accessor is not invoked

#### Scenario: A boundary logs its own registered outcome

- **GIVEN** a boundary that reported a failure and registered the outcome
- **WHEN** it logs that outcome
- **THEN** the record is the diagnostic report of that outcome, with the occurrence identifier the boundary already holds

### Requirement: Failure records are redacted once and bounded

A failure log record SHALL be written as the shared reporting module produced it, without a second redaction pass and without the raw caught value, and SHALL stay within the shared report byte budget.

#### Scenario: A failure quotes a secret the process owns

- **GIVEN** a logger holding a caller-owned secret and a failure whose message quotes it twice
- **WHEN** the failure is logged
- **THEN** the emitted line does not contain the secret text
- **AND** each occurrence of it is replaced exactly once

#### Scenario: A failure carries far more content than the budget

- **GIVEN** a failure whose content greatly exceeds the report byte budget
- **WHEN** it is logged
- **THEN** the failure record stays within the budget

### Requirement: A failure record carries the retry signal when there is one

A failure log record SHALL carry the failure's fingerprint when the report libraries published one, and two occurrences of the same failure from the same place SHALL share that fingerprint while carrying distinct occurrence identifiers.

#### Scenario: The same failure occurs twice

- **GIVEN** one throwing operation run twice
- **WHEN** each occurrence is logged as a failure
- **THEN** the two records carry the same fingerprint
- **AND** the two records carry different occurrence identifiers

### Requirement: Logging a failure never throws

Serializing a failure for a log line SHALL NOT throw for any value, and a failure no report could be built for SHALL be recorded as a visible loss carrying a correlation handle and a reason, which the log schema SHALL require together.

#### Scenario: No report can be built for the failure

- **GIVEN** a caught value the report library cannot inspect
- **WHEN** it is logged as a failure
- **THEN** a line is still emitted
- **AND** the failure record states that it was not reported and carries a correlation handle and a reason

#### Scenario: Two failures lose their reports

- **GIVEN** two failures no report can be built for
- **WHEN** both are logged
- **THEN** their records carry different correlation handles
- **AND** both records name the same fixed reason

#### Scenario: A hostile value is logged

- **GIVEN** a revoked proxy, a null, an undefined and a thrown primitive
- **WHEN** each is logged as a failure
- **THEN** each produces a record and none of them throws

#### Scenario: A loss names no reason

- **GIVEN** a candidate log record whose failure field states a loss but names no reason
- **WHEN** it is validated against the log schema
- **THEN** validation refuses it
```

### `tasks.md`

The reference is a code-span path and **not** a Markdown link: see the devsync finding in section 3. Task 1.1 is ticked in slice C, not before.

```markdown
## 1. Failure log records

- [ ] 1.1 Replace the `err` serializer with one built over `@shared/failures`, declare the record in `log-schema.ts` and export both — test: `NX_DAEMON=false bunx nx run wbs-observability:test --skip-nx-cache`, `wbs-observability:typecheck`, `wbs-observability:lint`; negatives: drop the explicitly logged absent failure, substitute a report for a present one, trust an unregistered reporting-shaped value, remove the never-throw guard while the shared wrapper is broken, write the public report instead of the diagnostic one, drop the caller's secrets from the policy, relax the schema's diagnostic version, relax the schema's loss reason, restore the pre-change `err` member and, under the broken shared wrapper, replace the fallback handle counter with a constant

## References

This task implements the observability half of slice 3 of the
package adoption plan at `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`,
which the open `adopt-failure-reporting` change lists as its unowned task 2.1.
```

`verify.md` starts with the heading block of
`openspec/changes/adopt-failure-reporting/verify.md` and is appended to by every slice.

## 10. README edits

In `libs/wbs/adapters/observability/README.md`:

- extend the `log-schema.ts` bullet so it ends
  `written once; \`err\` is a diagnostic report or a visible reporting loss, and nothing else.`
- replace the whole `serializers.ts` bullet with:

```markdown
- **`serializers.ts`** — `createFailureSerializer(redact)`, which turns what a
  boundary logged under `err` into that failure's diagnostic report, and
  `registerReportedFailure`, which a boundary that already reported a failure
  uses so its outcome is reused rather than reported again.
```

- replace the first landmine bullet ("**Never print a secret value.** The serializers exist so
  that ...") with these four:

```markdown
- **A caught value is untrusted data.** Provenance is a registration this
  process performed, held in a `WeakMap`; it is never a `reported` property
  read off the value. A structural check both discloses a forged report's
  contents and runs the value's accessors.
- **Never print a secret value.** `@shared/failures` redacts and bounds the
  report; this library adds no second pass and never writes the raw caught
  value. A logger is given only the secrets its own process owns.
- **Only the diagnostic report is logged.** The public report is what a user or
  an agent is told; writing it here would leave the operator with nothing to
  debug, and the diagnostic report must never travel the other way. The schema
  refuses a public report in the `err` field.
- **Pino does not catch a throwing serializer.** It rethrows into the
  `logger.error(...)` call and writes no line, so the serializer keeps every
  read, selection and record construction inside one guard.
```

The heading "## Five files" stays: the file count does not change.## 11. Negative proofs

All ten were rehearsed by the planner on 2026-09-21 in a worktree of `batch-3/planning`, with Bun
1.4.2, against the section 7 code **before** its `Proof:` comments were added — which is the tree
slice C starts from. Each names the file, the function, the exact expression, the named test and
the **fact** the test fails on, with the fragment the runner actually printed. Extra failing tests
are recorded, never a stop (preamble rules 16 and 20).

### Proof 1 — provenance is registration, not shape

**Location.** `serializers.ts`, the closure returned by `createFailureSerializer`, the two lines

```ts
const own = typeof value === 'object' && value !== null ? reportedFailures.get(value) : undefined;
```

**Fault.** Replace them with a structural read:

```ts
const own =
  typeof value === 'object' &&
  value !== null &&
  (value as { reported?: unknown }).reported !== undefined
    ? (value as FailureReporting)
    : undefined;
```

Three tests, one per facet; run all three under the one fault and record all three.

| Named test                                                                 | Observed                                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `reports an unregistered reporting-shaped value instead of trusting it`    | `Expected to not contain: "hunter2"` / `Received: "{\"occurrence_id\":\"forged\",\"v\":\"corj/v0.14\",\"password\":\"hunter2\"}"`  |
| `reports an unregistered loss-shaped value instead of trusting its reason` | `Expected to not contain: "hunter2"` / `Received: "{\"occurrence_id\":\"forged\",\"reported\":false,\"reason\":\"leak hunter2\"}"` |
| `does not invoke an accessor named reported while deciding provenance`     | `Expected: 0` / `Received: 2`                                                                                                      |

### Proof 2 — the never-throw guard, reached by breaking its dependency

On an intact dependency nothing can make this guard fire, so the fault is injected **one layer
down** and the proof is two runs whose difference is the guard. This is R5's "the check removed or
its dependency broken", which is why the guard is not listed under
`docs/findings/checks-that-cannot-fail.md`.

**Fault A (dependency only).** In `libs/shared/domain/failures/src/report-failure.ts`,
`reportFailure`: turn `try {` into `{` and delete the whole `} catch { ... }` block at lines
158-165, leaving the body's `return` in a bare block.

Run `writes a visible loss rather than throwing when no report can be built` in
`src/serializers.test.ts`. Observed: it fails, but **a record was still written** —

```text
error: expect(received).toContain(expected)
Expected to contain: "UNREPORTED_"
Received: "UNSERIALIZED_1"
```

**Fault B (dependency and the guard).** Keep fault A installed and, in `serializers.ts`, turn the
closure's `try {` into `{` and delete its `} catch { return nextSerializerLoss(); }`. Run the same
test. Observed: no record at all, the raw exception escapes —

```text
TypeError: Array.isArray cannot be called on a Proxy that has been revoked
```

The guard's whole value is the difference between those two diagnostics. Restore **both** files
with `cp` and prove **both** with `cmp` before asserting on anything, then rerun the test green.

### Proof 10 — the fallback's own handle counter

Complete proof 2 first: restore both files, verify both with `cmp`, and rerun its named test green.
For proof 10, save fresh passing copies of both files, then reapply proof 2's fault A to
`libs/shared/domain/failures/src/report-failure.ts`; leave the serializer guard intact. Save this
dependency mutation separately as `proof-10-dependency.patch`. Run step 1, then apply and save the
counter mutation for step 2. Finally restore both files from the passing copies, compare both with
`cmp`, and rerun both named tests green.

**Step 1 (fault A alone).** `gives two lost reports two different correlation handles` and
`states one fixed reason on every lost report` in `src/logger.test.ts` both **pass**: they assert
nothing about which layer produced the loss. Record both passes — that is what shows the fallback
is really the one answering.

**Step 2 (fault A plus a constant counter).** In `serializers.ts`, `nextSerializerLoss`, replace
`unserializableFailures += 1;` with `unserializableFailures = 1;`. Run
`gives two lost reports two different correlation handles`. Observed:

```text
error: expect(received).not.toBe(expected)
Expected: not "UNSERIALIZED_1"
```

Restore both files, `cmp` both, rerun green.

### Proofs 3 to 9

| #   | File, function, exact expression                                                                                                  | Fault                                                                                                               | Named test                                                                 | Observed                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 3   | `serializers.ts`, the returned closure, the ternary's true arm `reporting.reports.diagnostic`                                     | change it to `reporting.reports.public`                                                                             | `never writes the public report in place of the diagnostic one`            | `Expected: "corj/v0.14"` / `Received: "appex/public/v4"`                                                                            |
| 4   | `logger.ts`, `createLogger`, the argument of the single `createFailureSerializer(redact)` call, and the `redact` binding it reads | change the `const redact = createFailureRedaction(opts.secrets ?? []);` initialiser to `createFailureRedaction([])` | `scrubs a secret this process owns out of the failure line`                | `Expected to not contain: "hunter2"`, the received line showing `"stack":["Error: token was hunter2", ...]`                         |
| 5   | `log-schema.ts`, the `err` union's FIRST branch, the member `v: '/^corj\\//',`                                                    | replace it with `'v?': 'string',`                                                                                   | `refuses a public report where the schema expects a failure record`        | `Expected pattern: /\^corj\//` / `Received function did not throw`                                                                  |
| 6   | `log-schema.ts`, the `err` union's SECOND branch, the member `reason: 'string'`                                                   | replace it with `'reason?': 'string'`                                                                               | `refuses a reporting loss that names no reason`                            | `Expected pattern: /reason must be a string/` / `Received function did not throw`                                                   |
| 7   | `log-schema.ts`, the whole `'err?': [ ... ],` member                                                                              | replace it with `'err?': { name: 'string', message: 'string', 'stack?': 'string' },`                                | `logs a failure as the diagnostic report and validates against the schema` | `ValidationError: Validation failed: err.message must be a string (was missing)`                                                    |
| 8   | `logger.ts`, `createLogger`, the `log:` entry of `formatters`                                                                     | delete that one line                                                                                                | `reports an explicitly present undefined failure instead of dropping it`   | `error: expect(received).toBeDefined()` / `Received: undefined`                                                                     |
| 9   | `serializers.ts`, `keepAbsentFailure`, the guard `if (!('err' in fields) \|\| fields['err'] !== undefined) return fields;`        | drop the second disjunct, leaving `if (!('err' in fields)) return fields;`                                          | `reports the failure it was given, never a substitute`                     | `Expected to contain: "Error: the real failure"` / a received line whose `err` reads `"typeof":"undefined","as_string":"undefined"` |

Proofs 5, 6 and 7 touch three different expressions of one member; each has its own test, and none
of the three faults may be installed at the same time as another. Proofs 8 and 9 are the two
halves of the normalisation: one that it happens at all, one that it happens only for the absent
value.

The byte budget and the `no-invoke` inspection rule are **not** proved here: they are checks of
`@shared/failures` with their own watched negatives at
`libs/shared/domain/failures/src/report-failure.ts:26-37`. The budget test in
`serializers.test.ts` is a boundary assertion over this library's output, not a new check.

### Filters for the named tests

Title alone, unanchored; never include Bun's printed `>`.

```sh
cd libs/wbs/adapters/observability
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/serializers.test.ts -t 'reports an unregistered reporting-shaped value instead of trusting it'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/serializers.test.ts -t 'reports an unregistered loss-shaped value instead of trusting its reason'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/serializers.test.ts -t 'does not invoke an accessor named reported while deciding provenance'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/serializers.test.ts -t 'writes a visible loss rather than throwing when no report can be built'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/serializers.test.ts -t 'never writes the public report in place of the diagnostic one'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/logger.test.ts -t 'scrubs a secret this process owns out of the failure line'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/logger.test.ts -t 'refuses a public report where the schema expects a failure record'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/logger.test.ts -t 'refuses a reporting loss that names no reason'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/logger.test.ts -t 'logs a failure as the diagnostic report and validates against the schema'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/logger.test.ts -t 'reports an explicitly present undefined failure instead of dropping it'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/logger.test.ts -t 'reports the failure it was given, never a substitute'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/logger.test.ts -t 'gives two lost reports two different correlation handles'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/logger.test.ts -t 'states one fixed reason on every lost report'
```

Each must report `1 fail` with the rest `filtered out`, except proof 10 step 1, where the two
named tests must report `1 pass`. `0 tests ran` from one of these verbatim filters is a stop.

### The `Proof:` comments to write in step C2

In `serializers.ts`, inside the returned closure, in their post-Prettier form:

```ts
    // Proof: with `@shared/failures`' own never-throw wrapper broken, removing this guard let
    // `TypeError: Array.isArray cannot be called on a Proxy that has been revoked` escape the
    // serializer and write no record at all, failing "writes a visible loss rather than throwing
    // when no report can be built"; with the guard in place and the same dependency broken the
    // test still got a record and failed only on `Received: "UNSERIALIZED_1"` (2026-09-21).
    try {
      // Proof: replacing this lookup with a structural `value.reported !== undefined` read
      // disclosed `hunter2` from a forged outcome — `Received: "{\"occurrence_id\":\"forged\",
      // \"v\":\"corj/v0.14\",\"password\":\"hunter2\"}"` — and ran an accessor named
      // `reported` twice, failing all three provenance tests (2026-09-21).
      const own =
        typeof value === 'object' && value !== null ? reportedFailures.get(value) : undefined;
      const reporting = own ?? reportFailure(value, { redact });
      return reporting.reported
        ? // Proof: writing `reporting.reports.public` here failed "never writes the public report
          // in place of the diagnostic one" on `Expected: "corj/v0.14"` /
          // `Received: "appex/public/v4"` (2026-09-21).
          reporting.reports.diagnostic
```

In `serializers.ts`, `keepAbsentFailure`, directly above its `if`:

```ts
// Proof: dropping `|| fields['err'] !== undefined` substituted a report of `undefined` for
// every logged failure and failed "reports the failure it was given, never a substitute" on
// `Expected to contain: "Error: the real failure"` (2026-09-21).
```

In `serializers.ts`, `nextSerializerLoss`, directly above the increment:

```ts
// Proof: with `@shared/failures`' wrapper broken so this fallback answers, replacing this
// increment with `unserializableFailures = 1` failed "gives two lost reports two different
// correlation handles" on `Expected: not "UNSERIALIZED_1"` (2026-09-21).
```

In `logger.ts`, directly above the `serializers:` line:

```ts
// Proof: passing `createFailureRedaction([])` instead of the caller's secrets printed
// `"stack":["Error: token was hunter2"` and failed "scrubs a secret this process owns out of
// the failure line" (2026-09-21).
```

In `logger.ts`, directly above the `log:` formatter line:

```ts
// Proof: removing this hook dropped an explicitly present `err: undefined` before any
// serializer saw it and failed "reports an explicitly present undefined failure instead of
// dropping it" on `expect(received).toBeDefined()` / `Received: undefined` (2026-09-21).
```

In `log-schema.ts`, directly above `'err?': [`:

```ts
// Proof: relaxing the diagnostic branch's `v` to `'v?': 'string'` accepted a public report and
// failed "refuses a public report where the schema expects a failure record"; making the loss
// branch's `reason` optional accepted a half-written loss and failed "refuses a reporting loss
// that names no reason"; restoring the pre-change `{ name, message, stack? }` member failed
// "logs a failure as the diagnostic report and validates against the schema" with
// `err.message must be a string (was missing)` (2026-09-21).
```

Replace the dates with the day the fault was actually observed if it is not 2026-09-21.

## 12. Verification

### What the executor runs

| Command                                                                         | Expected                                                                                                                                      | Slice      |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Step A0's baseline block                                                        | `status=0`, `Ran N tests across M files`                                                                                                      | A0, B0, C0 |
| The README's **OpenSpec validation** block                                      | block exits 0; `"items": V`, then `V+1`, `"failed": 0`                                                                                        | A0, A2, C5 |
| Step B3's red block                                                             | **nonzero** `status=`, `createFailureSerializer` missing from `./serializers`                                                                 | B3         |
| `(cd libs/wbs/adapters/observability && ... bun test)`                          | status 0, baseline N + 24 tests across M + 1 files — planner observed `27 pass`, `0 fail`, `64 expect() calls`, `Ran 27 tests across 3 files` | B8, C5     |
| `NX_DAEMON=false bunx nx run wbs-observability:typecheck`                       | status 0, `Successfully ran target typecheck for project wbs-observability`                                                                   | B8, C5     |
| `NX_DAEMON=false bunx nx run wbs-observability:lint`                            | status 0, `Successfully ran target lint for project wbs-observability`                                                                        | B8, C5     |
| `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-gw-01,wbs-core` | status 0, `Successfully ran target typecheck for 3 projects`                                                                                  | B8         |
| The thirteen proof filters of section 11                                        | eleven `1 fail`, and proof 10 step 1's two `1 pass`; each restored and green afterwards                                                       | C1         |
| `GSETTINGS_BACKEND=memory bunx prettier --write <the eleven owned text files>`  | status 0                                                                                                                                      | C5         |
| `NX_DAEMON=false GSETTINGS_BACKEND=memory bunx nx format:check --all`           | status 0, no output. `--all` is mandatory: without it the check can select nothing                                                            | C5         |

### What the planner runs afterwards; the executor reports these as pending planner verification

- `GSETTINGS_BACKEND=memory NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`,
  with every file staged (the index checker refuses untracked files). **Compare with the
  planner's own immediately preceding integration run, not with a number in this packet**: G2 owns
  tests in this neighbourhood and other lanes move the total. This packet contributes **zero**
  devsync tests, so the pass count must be unchanged, with no failure naming any file of section 5. Both pins named in section 3 must stay put. Rehearsed green on this exact change.
- `NX_DAEMON=false bunx nx run-many -t test -p wbs-be-01,wbs-gw-01,wbs-core` (SQLite-backed
  `.db.test.ts` files). Expected unchanged against the planner's preceding run; these build real
  loggers but assert nothing about `err`.
- `bin/h2puni-gate.sh <sha>` on the shared build host, after the final commit. The executor never
  runs it and says so.

## 13. Stop conditions

Slice-scoped: each slice's pre-edit checks are in section 6 and are FALSE on that slice's own
starting tree. The conditions below apply to every slice.

1. A step needs a file outside section 5's table, other than
   `libs/shared/domain/failures/src/report-failure.ts` during proofs 2 and 10. — stop.
2. `import { reportFailure } from '@shared/failures'` fails to resolve. It must not: the alias is
   at `tsconfig.base.json:95` and the module at `libs/shared/domain/failures/src/index.ts:5`. —
   stop.
3. `bunx nx run wbs-observability:lint` reports an `@nx/enforce-module-boundaries` diagnostic for
   the `@shared/failures` import. It must not: `wbs-observability` is `ring:adapter`,
   `runtime:bun`, `scope:shared`, `product:wbs`; `shared-failures` is `ring:domain`,
   `runtime:isomorphic`, `scope:shared`, `product:shared`, and every constraint in
   `eslint.config.js:25-42` permits that edge. Rehearsed green. — stop.
4. A named proof test passes under its fault, after you have checked the location once against the
   file, function and expression the row names and redone the edit once. — stop (preamble rule
   20). Two deliberate exceptions: proof 2's fault A must fail the test on
   `Received: "UNSERIALIZED_1"` rather than on a thrown exception, and proof 10's step 1 must
   **pass** — a failure there is the stop.
5. A verbatim `-t` filter from section 11 reports `0 tests ran`. — stop.
6. A lint diagnostic that is not `simple-import-sort/*` or `prettier/prettier`, or one in a file
   you do not own. — stop (preamble rule 17).
7. After a proof, `cmp` reports a difference against the saved copy. — stop; do not continue with
   a mutated tree.
8. Slice B's step B3 exits 0. — stop: the tests were supposed to fail before the implementation.

Not stop conditions: extra tests failing beside a named proof (record them); `rm -f` refused by
the command guard (keep the scratch file, mention it once); `NX Recursive task invocation detected`
after a still-running target (wait, rerun once, then report pending).

## 14. Out of lane

Do not add `mcp-01` anywhere. Do not edit any of the ten caller sites in section 3, nor
`apps/wbs/fe-01`, `apps/wbs/mcp-01`, `tools/tool-observability-stack`,
`openspec/changes/adopt-failure-reporting`, or `libs/shared/domain/failures` other than the
restore-verified mutations of proofs 2 and 10. Do not define an exception kind. Do not introduce DI Bag.
Do not change `metrics.ts` or `prometheus.ts`. Do not run a repository-wide format write. Do not
run `wbs-fe-01:test:unit`, `wbs-fe-01:test`, `tool-devsync:test` or `test:package`.

## Disposition of review 1

Reproduced in the planner's worktree before acting on it; every fix below was rehearsed, not
reasoned.

**Critical 1 — untrusted values bypass reporting and redaction. FIXED.** Confirmed: the old
`isFailureReporting` read `value.reported`, and a forged outcome disclosed `hunter2`. Section 7
now decides provenance with a module-private `WeakMap` and `registerReportedFailure`; section 1
states the interface; section 8 adds three tests (forged success, forged loss, accessor named
`reported`); proof 1 is the watched negative, observed on all three.

**Critical 2 — the never-throw guard ended before the unsafe reads. FIXED.** Confirmed:
`{ reported: true }` threw `TypeError: undefined is not an object`. Section 7 puts the lookup,
the selection and the record construction inside one `try`. Because the WeakMap fix also makes
every read safe, the guard could no longer be reached by input alone, which would have made it a
check that cannot fail; proof 2 therefore reaches it by breaking `@shared/failures`' own wrapper,
and records both diagnostics.

**Critical 3 — later slices could not follow their starting instructions. FIXED.** Baseline
blocks no longer use `set -e`, slices B and C carry an explicitly red baseline with a captured
nonzero status, and the legacy-file preconditions are now per-slice pre-edit checks in section 6:
slice D's are the opposite of slice A's.

**Important 1 — tests followed implementation. FIXED.** Slice B writes both test files and ends
red; slice C implements.

**Important 2 — the schema accepted records the contract excludes. FIXED.** The `err` member is
now a two-branch union requiring `/^corj\//` on the diagnostic branch and `reported: false` with
`occurrence_id` and `reason` on the loss branch. Two refusal tests and proofs 5 and 6 cover it;
section 3 records the five probed candidates and what ArkType printed for each.

**Important 3 — promised invariants had no effective test. FIXED.** Added: diagnostic object
reuse by identity (`toBe`), nested-cause preservation, distinct handles across two losses,
preservation of a genuine `reported: false`, an exact-marker redaction assertion
(`Error: token was [redacted] twice: [redacted]`), and a hostile-input sweep. The serializer's own
loss counter is gone (A3): distinct handles come from `@shared/failures`' counter.

**Important 4 — proof 2's command could not observe both claimed failures. FIXED.** Proof 2 is now
one test in one file, run twice under two nested faults, and the comment records exactly those two
runs.

**Important 5 — the caller inventory was false. FIXED.** Ten sites, tabulated with levels in
section 3, including both `dev/main.ts` sites, `infrastructure-endpoints.ts:33`, the two
`compose.ts` sites and the OIDC site, which is read from the production file and noted as reaching
`info` as well as `error`. `wbs-core` is now in the downstream type check.

**Important 6 — the hand-over listing was impossible. FIXED.** Section 6 gives a per-slice changed
path list and commit subject, with the five OpenSpec files enumerated individually, plus a
cumulative `git diff --name-only` check against the packet's starting commit.

**Important 7 — an absolute shared-suite total. FIXED.** Section 12 compares with the planner's
own preceding integration run and states that this packet contributes zero devsync tests.

**Minor 1 — wrong project configuration path. FIXED.** Section 3 now says
`libs/wbs/adapters/observability/project.json`.

**Minor 2 — the scanner was misdescribed. FIXED.** Section 3 separates `legacySourceOccurrences()`
from the document link and `nx run` checks. The review was right that the old justification was
wrong, and rehearsing it found a real defect the review had not seen: the committed packet's own
`tasks.md` listing contained a Markdown link that the current-document reader resolved relative to
the packet, and `tool-devsync:test` failed on it. The prescribed `tasks.md` now uses a code-span
path, and no listing in this packet contains a Markdown link.

## Disposition of review 2

Every finding was reproduced in the planner's worktree before being acted on, including the two
the review asked to be reproduced rather than argued.

**Critical 1 — slice B could not pass the commit hook. FIXED.** Reproduced: staging only the two
test files and running `git commit` was refused by lefthook's `lint` command with
`✖ 21 problems (21 errors, 0 warnings)`, all `no-unsafe-call` and `no-unsafe-assignment` in
`serializers.test.ts`, and the commit exited 1 with nothing created. Slices B and C of the
previous draft are now one slice B: it writes the tests, captures the red run as evidence in
`$TMPDIR/evidence/b3-red.log` and in `verify.md`, then implements and hands over green. Committing
that merged slice was rehearsed and passed every hook command, as was slice A's.

**Critical 2 — logging `undefined` produced no failure record. FIXED.** Reproduced against the
prescribed implementation: `logger.error({ err: undefined }, 'probe')` emitted
`{"level":"error",...,"request_id":"r1","msg":"probe"}` with no `err`, because
`pino/lib/tools.js:168` guards its field loop with `value !== undefined`. Section 7 adds
`keepAbsentFailure`, wired through `formatters.log` — which `tools.js:161-163` calls before that
loop — so the value is reported and registered rather than dropped; section 3 records the probe;
section 8 adds three logger tests (the absent value is reported, a present failure is not
substituted, a record with no `err` is untouched); proofs 8 and 9 are the two watched negatives.
A1 and A3b record why it is reported rather than refused: refusing means a logger that throws.

**Important 1 — verification evidence could not follow the handovers. FIXED.** Section 6 opens
with an evidence rule: each attempt gets a fresh temporary root, so every slice appends its own
observations to `verify.md` before handing over, and `verify.md` is in every slice's changed-path
list (A3, B9, C4). `--seed` is explained for the case a slice needs raw earlier evidence, with the
statement that none of these three does. `tasks.md` is in slice C's list and task 1.1 is ticked
there, not before.

**Important 2 — the fallback counter had no effective proof. FIXED, and the claim corrected.**
A3 no longer says the counter is gone; it says there are two loss paths and names them. Proof 10
is new: with `@shared/failures`' wrapper broken, `gives two lost reports two different correlation
handles` and `states one fixed reason on every lost report` both pass because `twoLostReports()`
asserts nothing about which layer answered; replacing `unserializableFailures += 1` with
`unserializableFailures = 1` then fails the first on `Expected: not "UNSERIALIZED_1"`. Both runs
were observed.

**Minor 1 — the pattern length was wrong. FIXED.** Section 7 now says nine characters.

**Minor 2 — missing dispatch metadata and an incomplete format command. FIXED.** The header table
carries the size class, the slice list and the three token estimates; section 6 step C5 and
section 12 name `NX_DAEMON=false GSETTINGS_BACKEND=memory bunx nx format:check --all` with its
expected exit status and the reason `--all` is mandatory.

**Dispatchability.** Slice A is dispatchable as it stands. Slice B is dispatchable once slice A is
committed, and slice C once slice B is; both have pre-edit checks that are false on any earlier
tree, so a mis-ordered dispatch stops rather than improvises.
