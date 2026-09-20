# 040.5 Observability serializer and log schema, with the fingerprint

Work item 040.5. One executor, four slices, all in `libs/wbs/adapters/observability`.

## 1. Goal and non-goals

**Goal.** A WBS log line about a failure carries that failure's sanitized diagnostic report from
`@shared/failures` — occurrence id, fingerprint, stacks, cause chain — under `err`, and
`log-schema.ts` declares that record so a query across the three tiers is written once. Writing
the line never throws, never writes the public report, never writes the raw caught value and
never redacts a second time.

**Non-goals.** No boundary adopts the contract here: work items 040.7 (backend error boundary),
040.8 (MCP tool-call boundary) and 040.9 (gateway) are the callers and are out of scope. This
packet adds no service name (`mcp-01` stays out of `ServiceName` and `LogRecord` until 040.8
wires its logger), no exception kind, no DI Bag composition, no telemetry endpoint, no dashboard
or ingestion query change, and no browser-execution claim. No file outside
`libs/wbs/adapters/observability` and `openspec/changes/log-failure-records` is touched.

**What 040.7, 040.8 and 040.9 will call.** Nothing new. They keep writing
`logger.error({ err: <caught value>, …fields }, '<message>')`. A boundary that has already called
`reportFailure` — because it needed the public report for its response — instead writes
`logger.error({ err: <the FailureReporting it holds>, … }, '…')`, and the line keeps the
occurrence id that boundary already disclosed. A process that owns secrets passes them once, at
`createLogger({ service, secrets })`. That is the whole interface.

## 2. Read first

1. `AGENTS.md` and `LLM_README.md`.
2. `docs/superpowers/plans/2026-09-19-batch-1/README.md`, sections "Rules for every executor",
   "Execution contract" and "Standard blocks every packet uses". This packet uses the standard
   blocks **OpenSpec validation**, **Creating an OpenSpec change**, **Saving a mutation patch**,
   **Running one named test**, **Formatting** and **Completion gate** by name; they are not
   copied here except where an exact command is shown.
3. `docs/superpowers/plans/2026-09-19-batch-1/ASSUMPTIONS.md`.
4. `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`, the
   "Proposed integration contract" → "Reporting" section and ordered slice 3, read with the
   2026-09-19 amendment at the top.
5. `libs/shared/domain/failures/README.md` and `libs/shared/domain/failures/src/report-failure.ts`.

## 3. Verified facts

Every line number is from `batch-3/planning` (main `da8be091`).

### The library today

- `libs/wbs/adapters/observability/src/serializers.ts:7` exports
  `errSerializer = (err: Error) => ({ type, message, stack })`. It is used at
  `libs/wbs/adapters/observability/src/logger.ts:26` as `serializers: { err: errSerializer }` and
  nowhere else; `src/index.ts` does not export `./serializers` at all (it has four lines, none of
  them `'./serializers'`).
- `libs/wbs/adapters/observability/src/log-schema.ts:15` declares
  `'err?': { name: 'string', message: 'string', 'stack?': 'string' }`. The serializer emits
  `type`, the schema requires `name`: **the two disagree today**, and no test noticed, because
  neither test in `src/logger.test.ts` logs an `err` (it logs `{ request_id, user_id }` at line 20
  and a child binding at line 41).
- `src/logger.test.ts` has 2 tests; `src/prometheus.test.ts` has 1. Baseline for the whole
  project, observed 2026-09-21 with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test` in
  `libs/wbs/adapters/observability`: `3 pass`, `0 fail`, `8 expect() calls`,
  `Ran 3 tests across 2 files`.
- `src/project.json` runs its `test` target as `bun test --coverage --coverage-reporter=lcov`
  with `cwd: libs/wbs/adapters/observability`, so a focused run is
  `cd libs/wbs/adapters/observability && bun test <file>`.

### The shared module

- `libs/shared/domain/failures/src/index.ts` exports exactly `createFailureRedaction`,
  `FAILURE_REPORT_LIMITS`, `type FailureReporting`, `reportFailure` and `SENSITIVE_KEYS`.
- `reportFailure` (`report-failure.ts:139`) never throws: its `catch` at line 158 returns
  `{ reported: false, occurrenceId: 'UNREPORTED_<n>', reason: … }`.
- `FAILURE_REPORT_LIMITS` (`report-failure.ts:25`) is `maxReportSize: 32_768`, `maxDepth: 4`,
  `maxChildren: 16`, `inspection: 'no-invoke'`, each with its own recorded `Proof:` comment. The
  byte budget and the redaction therefore already hold; this packet adds no second pass.
- `createFailureRedaction(secrets)` (`report-failure.ts:93`) is built once and shared, because
  the library caches one report maker per policy.

### Probed library behaviour (installed versions, not documentation)

Installed: `pino` 10.3.1, `application-exception` 0.5.0, `caught-object-report-json` 11.0.1
(`package.json:46,48,55`; versions read back with `node -e "require(...).version"`). Everything
below was observed with `bun -e` in the rehearsal worktree on 2026-09-21.

- **Pino does not catch a throwing serializer.** With
  `serializers: { boomer: () => { throw new Error('serializer exploded'); } }`, the call
  `logger.error({ boomer: {} }, 'bad')` **rethrows** `Error: serializer exploded` into the caller
  and the destination receives **no line at all** (`lines now 1`, the one written before it).
  This is the whole reason the serializer must model its own loss.
- **`formatters.log` runs before serializers**, so it cannot lift a serialized field to the top
  level: the hook printed `LOGFMT SEES err = {}` for a raw `Error`, while the emitted line
  carried the serializer's output. Occurrence id and fingerprint therefore live **inside** `err`,
  not at the record's top level. This is why the schema change is nested.
- **Serializers apply to child bindings too**: `logger.child({ failure: {...} }).info(…)` emitted
  the serialized form, so the `err` path is the same for a request-scoped child logger.
- **Pino survives hostile values a serializer returns**: a self-referential object came out as
  `"self":"[Circular]"` and a `BigInt` as `1`, no throw. A plain report object is safe.
- **`toReports(caught, { diagnostic, public })` returns**
  `{ occurrence_id, diagnostic, public }`. A diagnostic report of
  `new Error('db unavailable')` was
  `{"occurrence_id":"AE_…","fingerprint":"fp1_…","stack":[…],"as_string_format":"derived","v":"corj/v0.14"}`
  — 459 bytes for an error with a cause and two own properties; its public report was 181 bytes
  and read `{"v":"appex/public/v4","occurrence_id":"AE_…","fingerprint":"fp1_…","code":"INTERNAL_ERROR","message":"Something went wrong"}`.
  `v` is the reliable discriminator between the two.
- **The fingerprint field is named `fingerprint`**, its value matches `/^fp1_[0-9a-f]{32}$/`, and
  the occurrence id matches `/^AE_[0-9A-Z]{26}$/` (29 characters).
- **Fingerprint stability, measured.** Two occurrences of one failure thrown from the same
  statement in a loop produced **the same** `fingerprint` and **two different** `occurrence_id`s.
  It is a pure function of the reported content: two `Error`s whose `stack` strings were forced
  equal shared a fingerprint, and two created on the same source line but at different _columns_
  did not. Reporting the **same object** twice returned the same occurrence id as well, so
  re-reporting an already reported value is not merely wasteful, it is a second id.
- **`fingerprint` is optional.** `caught-object-report-json/index.d.ts:67` types it
  `fingerprint?: string`, and `application-exception/reporting.d.ts` says a fingerprint "is
  published only when backed by real stack frames: a stackless value and any recipe without
  `stack` publish none". A thrown string's _public_ report in the probe carried no `fingerprint`
  at all, while its diagnostic report did. The schema must therefore declare it optional.
- `DiagnosticReport` (`application-exception/report-types.d.ts`) narrows `occurrence_id` to a
  required `string`, so that field may be declared required.

### Callers, and what this change does to them

- `apps/wbs/be-01/src/main.ts:54` (`logger.error({ err }, 'be-01 failed to start')`),
  `apps/wbs/be-01/src/main.ts:69` (`logger.error({ err, signal }, 'be-01 did not stop cleanly')`),
  `apps/wbs/be-01/src/services.ts:152` (`options.logger.error({ err: error }, 'optimizer child failed')`)
  and `apps/wbs/gw-01/src/app.ts:161`
  (`logger.error({ err, beUrl: opts.beUrl }, 'health probe could not reach be-01')`) are the four
  production `err` log sites. All four pass a caught value and **keep compiling and working
  unchanged**: the new serializer takes `unknown`. Only the shape of the emitted `err` object
  changes. Do not edit them.
- `apps/wbs/be-01/src/http/elysia/auth-oidc.test.ts:212` asserts `fields: { err: failure }`
  against a **fake** logger that records fields, not Pino, so it is unaffected. Do not edit it.
- `createLogger` is also called at `apps/wbs/be-01/src/app.ts:193` and
  `apps/wbs/be-01/src/app.ts:258` — **two similar call sites in one file** — and in
  `boot.db.test.ts:69` and `services.db.test.ts:67`. None is edited: `secrets` is optional.
  Rehearsed: `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-gw-01` passed with
  the change in place.
- `tools/tool-observability-stack/src/{promtail,grafana,loki,prometheus}` contain **no** reference
  to `err`, `name`, `message` or `stack` as a log field (`grep -rn "err\b"` over that `src/`
  returned nothing). No dashboard or ingestion query reads the field being changed.

### Whole-suite pins, rehearsed

- `tools/tool-devsync/src/workspace-inventory.test.ts:110-111` pins `167` rows over `84` files of
  parent-relative values in `tsconfig*.json` and `project.json`. This packet adds no tsconfig and
  no project.json and changes no target, so **it does not move**.
- `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` pins an occurrence count and a
  sha256 digest over legacy-root strings and `nx run <project>:` invocations found in scanned
  files. No new legacy-root path is introduced, and the packet's own document is the only new
  Markdown file. **Rehearsed**: with every file of this change staged (`git add -A`),
  `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache` exited
  `0` with `301 pass`, `0 fail`, `Ran 301 tests across 24 files`. **No slice moves a pin.**
- No file is added under `apps/wiki/cli`, so the Twilight Bureaucrat validator identity is
  unchanged and `apps/wiki/cli/src/packaging/build.test.ts` needs no `ruleModes` entry.
- OpenSpec baseline, rehearsed: `{"items": 107, "passed": 107, "failed": 0}` (95 changes,
  12 specs). With the new change added: `108 / 108 / 0`, the new change valid with no issues.

## 4. Decisions and assumptions

Recorded rather than asked, per the owner's standing instruction.

- **A1. The record is nested under `err`, not lifted to the top level.** `formatters.log` runs
  before serializers (probed above), so a serializer's output cannot reach the record root, and
  moving the reporting into `formatters.log` would apply it to every field of every line.
  Queries read `err.occurrence_id` and `err.fingerprint`.
- **A2. A new OpenSpec change and a new capability, `log-failure-records` / `failure-log-records`.**
  There is no observability or logging capability anywhere in `openspec/specs` (twelve specs:
  authentication, bounded-replay-sweep, core-lib-extraction, dev-deploy,
  gateway-request-deadlines, http-endpoint-port, plan-refresh, project-assignment-reads,
  realtime, scheduler-runtime-port, team-removal-revisions, wbs-table-modules), so nothing can be
  MODIFIED. The open `adopt-failure-reporting` change owns `failure-reporting` and names this
  work in its unowned task 2.1, but 040.7, 040.8 and 040.9 fall under that same task; four
  packets editing one delta spec is a collision, and what a log line carries is a contract of its
  own. `adopt-failure-reporting` is **not edited**.
- **A3. `err` keeps its name.** Renaming the field would change every call site and every future
  query for no gain; its _contents_ are what this change defines.
- **A4. The serializer accepts both a raw caught value and a `FailureReporting`.** This is the
  plan's "one path for already-reported exceptions so the logger never wraps a `DiagnosticReport`
  as a new caught value". Discrimination is `typeof value === 'object' && value !== null` plus
  `value.reported === true || value.reported === false`; a `DiagnosticReport` has no `reported`
  property, so it can never be mistaken for one.
- **A5. Legacy `name`/`message`/`stack` are removed from the schema, not kept as aliases.** The
  plan forbids manufacturing them from compact values the report may omit, and the schema's
  current `name` was never emitted anyway.
- **A6. The serializer's own loss is counted per process** as `UNSERIALIZED_<n>`, mirroring
  `report-failure.ts:162`'s `UNREPORTED_<n>`, so two losses never share a handle.
- **A7. No `mcp-01`.** `ServiceName` and the schema's `service` union stay `'be-01'|'gw-01'|'fe-01'`;
  040.8 adds `mcp-01` when it wires the MCP logger, and a test of a real MCP record belongs there.

## 5. File plan

| Path                                                      | Action                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `libs/wbs/adapters/observability/src/serializers.ts`      | Modify: replace `errSerializer`/`SerializedError` with `createFailureSerializer`, `SerializedFailure`, `SerializedFailureLoss` |
| `libs/wbs/adapters/observability/src/serializers.test.ts` | Create                                                                                                                         |
| `libs/wbs/adapters/observability/src/logger.ts`           | Modify: `secrets` option, build the policy once, use the new serializer                                                        |
| `libs/wbs/adapters/observability/src/log-schema.ts`       | Modify: the `err` shape and its JSDoc                                                                                          |
| `libs/wbs/adapters/observability/src/logger.test.ts`      | Modify: three tests appended inside the existing `describe('createLogger')`                                                    |
| `libs/wbs/adapters/observability/src/index.ts`            | Modify: one added export line                                                                                                  |
| `libs/wbs/adapters/observability/README.md`               | Modify: the two file bullets and the landmines                                                                                 |
| `openspec/changes/log-failure-records/`                   | Create: `.openspec.yaml`, `proposal.md`, `specs/failure-log-records/spec.md`, `tasks.md`, `verify.md`                          |

**Neighbours.** No other batch 2 or batch 3 packet touches these files. 020.2 landed
`@shared/failures` and this packet only imports it. 020.7 (backend startup) and 040.7 touch
`apps/wbs/be-01`; 040.4 and 110.1 touch the frontend and project targets. 010.6, 010.7 and 110.6
are Twilight Bureaucrat and wiki work. If a step needs a file outside the table, **stop**.

## 6. Steps

### Slice A — Baseline, OpenSpec change, and the failing serializer tests

Dispatch with no network. This slice ends red on purpose.

**Step A0 — Baseline.** Record, do not assume:

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test) \
  >"$TMPDIR/evidence/a0-observability-baseline.log" 2>&1
echo "status=$?" >>"$TMPDIR/evidence/a0-observability-baseline.log"
tail -5 "$TMPDIR/evidence/a0-observability-baseline.log"
```

Expected: status 0 and a line `Ran N tests across M files`. Write N and M down; every later
count in this packet is relative to them. On `batch-3/planning` the planner observed
`3 pass`, `0 fail`, `Ran 3 tests across 2 files`. If N is not 3, continue anyway with your own N.

Record the OpenSpec baseline with the README's **OpenSpec validation** block. The planner observed
`{"items": 107, "passed": 107, "failed": 0}`.

**Step A1 — Create the change.** Use the README's **Creating an OpenSpec change** block with the
name `log-failure-records`. Then write `proposal.md`, `specs/failure-log-records/spec.md` and
`tasks.md` exactly as section 9 gives them, and start `verify.md` with the heading block. Run the
**OpenSpec validation** block again: expected `"items": N+1`, `"failed": 0`, block exits 0.

**Step A2 — Write `src/serializers.test.ts`**, exactly as section 8 gives it. Run:

```sh
(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/serializers.test.ts)
```

Expected: a non-zero status and a failure naming `createFailureSerializer` as missing from
`./serializers`. A run reporting `0 tests` is a stop. Leave it red and hand over.

### Slice B — The serializer, the logger option and the schema

**Step B0 — Baseline.** Rerun the step A0 command and record the current counts.

**Step B1 — Replace `src/serializers.ts`** with section 7's listing, without the `Proof:`
comments (they are written in slice D, after the faults are observed).

**Step B2 — Edit `src/logger.ts`.** Three edits, in this order:

- Replace the import block's first four lines
  (`import type { Logger } from '@wbs/contracts';` … `import { errSerializer } from './serializers';`)
  with section 7's import block.
- Insert the `secrets` member after `destination?: { write(chunk: string): void };` inside
  `CreateLoggerOptions`.
- Replace the single line `    serializers: { err: errSerializer },` inside `createLogger`'s
  `options` object with section 7's `serializers:` line. There is exactly one such line.

**Step B3 — Edit `src/log-schema.ts`.** Replace the five lines of the `'err?': { … },` member
(`'err?': {` through the `},` that closes it, lines 15-19) with section 7's member, and add
section 7's JSDoc block directly above `export const LogRecord = type({`.

**Step B4 — Edit `src/index.ts`.** Append `export * from './serializers';` after the
`'./prometheus'` line. Order matters: `simple-import-sort/exports` sorts these.

**Step B5 — Green and typed.** This slice re-declares an exported type, so it runs the type check
itself:

```sh
(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/serializers.test.ts)
NX_DAEMON=false bunx nx run wbs-observability:typecheck
NX_DAEMON=false bunx nx run wbs-observability:lint
```

Expected: `7 pass`, `0 fail`, `16 expect() calls`, `Ran 7 tests across 1 file`, status 0; then
`Successfully ran target typecheck`, status 0; then `Successfully ran target lint`, status 0.
Start the two Nx targets under the preamble's status-recording wrapper (rule 19).

A lint failure whose only diagnostics are `simple-import-sort/*` or `prettier/prettier` is fixed
with `bunx eslint --fix` on the named files (preamble rule 17), not a stop. Anything else is a
stop.

### Slice C — The logger tests and the downstream type check

**Step C0 — Baseline.** Rerun the step A0 command and record the counts (after slice B the
planner observed `10 pass`, `Ran 10 tests across 3 files`).

**Step C1 — Append section 8's three tests** to `src/logger.test.ts`, inside the existing
`describe('createLogger', …)`, directly after the closing `});` of
`it('child logger inherits context', …)` and before the file's final `});`.

**Step C2 — Run:**

```sh
(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)
NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-gw-01
```

Expected: `13 pass`, `0 fail`, `30 expect() calls`, `Ran 13 tests across 3 files` — that is
baseline-N + 10 tests across baseline-M + 1 files — and
`Successfully ran target typecheck for 2 projects`, status 0. The second command proves the four
existing `logger.error({ err … })` call sites still compile.

**Step C3 — README.** Apply section 10's edits to
`libs/wbs/adapters/observability/README.md`.

### Slice D — Negative proofs, formatting, hand-over

**Step D0 — Baseline.** Rerun the step A0 command; expect the slice C counts.

**Step D1 — The five proofs** of section 11, one at a time, each with the README's
**Saving a mutation patch** form, each restored with `cp` and verified with `cmp` **before** any
assertion on the captured status. Only after observing a failure may you write that proof's
`Proof:` comment.

**Step D2 — Write the `Proof:` comments** at the five locations section 11 names. They are what
makes `serializers.ts`, `logger.ts` and `log-schema.ts` differ from the slice B listings, so they
are part of the hand-over's changed-path list.

**Step D3 — Append to `verify.md`** the commands, statuses and decisive output lines of every
step, and the five proofs. Evidence references are **basenames** relative to this attempt's
evidence directory — never an absolute clone, home or temporary path.

**Step D4 — Format and validate.**

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
```

Then the repository-wide format **check** (never a repository-wide write) and the README's
**OpenSpec validation** block. Prettier moves the ternary `Proof:` comment of proof 1; section 7
already shows the post-Prettier form, so `--write` should report `(unchanged)` for
`serializers.ts` if it was typed as shown.

**Step D5 — Hand over, do not commit.** `git status --short --untracked-files=all` must list
exactly:

```text
 M libs/wbs/adapters/observability/README.md
 M libs/wbs/adapters/observability/src/index.ts
 M libs/wbs/adapters/observability/src/log-schema.ts
 M libs/wbs/adapters/observability/src/logger.test.ts
 M libs/wbs/adapters/observability/src/logger.ts
?? libs/wbs/adapters/observability/src/serializers.test.ts
 M libs/wbs/adapters/observability/src/serializers.ts
?? openspec/changes/log-failure-records/
```

Commit subject for the planner: `feat(observability): log a failure as its diagnostic report`.

## 7. The code, exactly

### `libs/wbs/adapters/observability/src/serializers.ts` (whole file, post-Prettier)

```ts
import { type FailureReporting, reportFailure } from '@shared/failures';
import type { DiagnosticReport, RedactionPolicy } from 'application-exception';

/**
 * What reporting a failure for the operator sink left behind when the serializer could not read
 * the value it was handed.
 *
 * A hostile value can throw from the very property read that decides whether it is already a
 * {@link FailureReporting}: a revoked `Proxy` throws from that read. The loss is modelled here
 * rather than propagated, because Pino does not catch a throwing serializer — it rethrows into
 * the `logger.error(...)` call and writes no line at all.
 */
export interface SerializedFailureLoss {
  readonly occurrence_id: string;
  readonly reported: false;
  readonly reason: string;
}

/** The operator-facing record of one failure: the diagnostic report, or the modelled loss. */
export type SerializedFailure = DiagnosticReport | SerializedFailureLoss;

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
 * Whether `value` is already a {@link FailureReporting}, so that a boundary which has reported a
 * failure is not made to report it a second time under a second occurrence id.
 *
 * Reads exactly one property of an unknown value. The caller runs it inside the serializer's
 * guard, because that single read is what a revoked `Proxy` throws from.
 */
function isFailureReporting(value: unknown): value is FailureReporting {
  if (typeof value !== 'object' || value === null) return false;
  const reported: unknown = (value as { reported?: unknown }).reported;
  return reported === true || reported === false;
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
 * Redaction and the size budget are already applied by `@shared/failures`: the record is not
 * scrubbed again here, and a raw caught value is never written to a line.
 *
 * @param redact The policy of the boundary that owns the logger, built once at startup.
 * @returns A Pino serializer that never throws, for any value whatsoever.
 */
export function createFailureSerializer(
  redact: RedactionPolicy,
): (value: unknown) => SerializedFailure {
  return (value: unknown): SerializedFailure => {
    let reporting: FailureReporting;
    try {
      reporting = isFailureReporting(value) ? value : reportFailure(value, { redact });
    } catch {
      return nextSerializerLoss();
    }
    return reporting.reported
      ? reporting.reports.diagnostic
      : {
          occurrence_id: reporting.occurrenceId,
          reported: false,
          reason: reporting.reason,
        };
  };
}
```

### `libs/wbs/adapters/observability/src/logger.ts` — the three edits

Import block, replacing lines 1-4:

```ts
import { createFailureRedaction } from '@shared/failures';
import type { Logger } from '@wbs/contracts';
import pino, { type LoggerOptions } from 'pino';

import { createFailureSerializer } from './serializers';
```

Added member of `CreateLoggerOptions`, after `destination`:

```ts
  /**
   * The secret values this process owns, scrubbed from every failure record as text. Only what
   * the caller actually holds: a secret nobody named cannot be detected, and a whole config,
   * request or environment object is never passed.
   */
  secrets?: readonly string[];
```

Replacing the one line `    serializers: { err: errSerializer },`:

```ts
    // One policy per logger, built once: `@shared/failures` caches one report maker per policy,
    // and a policy rebuilt per record would throw that cache away on every failure.
    serializers: { err: createFailureSerializer(createFailureRedaction(opts.secrets ?? [])) },
```

### `libs/wbs/adapters/observability/src/log-schema.ts` — the two edits

JSDoc directly above `export const LogRecord = type({`:

```ts
/**
 * The fields a log line may carry, so a query across tiers is written once.
 *
 * `err` is the sanitized DIAGNOSTIC report of one failure, exactly as `@shared/failures` produced
 * it, or the modelled reporting loss. `occurrence_id` correlates the record with what the user or
 * agent was told; `fingerprint` is equal for failures of the same kind from the same place and is
 * a retry signal, not a lookup key — the report libraries publish none for a value with no real
 * stack frames, so it is optional. Legacy `name`, `message` and `stack` fields are gone: they
 * would have to be manufactured from compact values the report is allowed to omit.
 */
```

Replacing the `'err?'` member:

```ts
  'err?': {
    occurrence_id: 'string',
    'fingerprint?': 'string',
    'reported?': 'false',
    'reason?': 'string',
    '[string]': 'unknown',
  },
```

## 8. The tests, exactly

### `libs/wbs/adapters/observability/src/serializers.test.ts` (new file, whole)

```ts
import { createFailureRedaction, reportFailure } from '@shared/failures';
import { describe, expect, it } from 'bun:test';

import { createFailureSerializer } from './serializers';

const serialize = createFailureSerializer(createFailureRedaction(['hunter2']));

describe('createFailureSerializer', () => {
  it('writes the diagnostic report of a raw caught value', () => {
    const record = serialize(new Error('db unavailable')) as Record<string, unknown>;
    expect(record['occurrence_id']).toMatch(/^AE_/);
    expect(record['fingerprint']).toMatch(/^fp1_/);
    expect(record['v']).toBe('corj/v0.14');
    expect(JSON.stringify(record)).toContain('db unavailable');
  });

  it('never writes the public report in place of the diagnostic one', () => {
    const record = serialize(new Error('db unavailable')) as Record<string, unknown>;
    expect(record['v']).not.toBe('appex/public/v4');
    expect(record['code']).toBeUndefined();
    expect(JSON.stringify(record)).not.toContain('Something went wrong');
  });

  it('reuses an already reported occurrence instead of reporting it twice', () => {
    const reporting = reportFailure(new Error('already reported'), {
      redact: createFailureRedaction([]),
    });
    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    const record = serialize(reporting) as Record<string, unknown>;
    expect(record['occurrence_id']).toBe(reporting.reports.occurrence_id);
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

  it('does not redact a second time and never writes the raw caught value', () => {
    const record = serialize(new Error('token was hunter2')) as Record<string, unknown>;
    expect(JSON.stringify(record)).not.toContain('hunter2');
  });

  it('returns a visible loss instead of throwing on an unreadable failure', () => {
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    const record = serialize(revocable.proxy) as Record<string, unknown>;
    expect(record['reported']).toBe(false);
    expect(String(record['occurrence_id'])).toContain('UNSERIALIZED_');
    expect(record['reason']).toBe(
      'the failure could not be read for logging; its reports are lost',
    );
  });

  it('keeps every failure record inside the report byte budget', () => {
    const record = serialize(new Error('x'.repeat(200_000)));
    expect(Buffer.byteLength(JSON.stringify(record), 'utf8')).toBeLessThanOrEqual(32_768);
  });
});
```

The `const [first, second] = records;` destructure is deliberate: `records[0]!['fingerprint']`
fails lint with `@typescript-eslint/no-unnecessary-type-assertion` (observed, four diagnostics).

### `libs/wbs/adapters/observability/src/logger.test.ts` — three appended tests

These three go **inside** the existing `describe('createLogger', …)`, so indent every line of the
listing below by two further spaces when pasting. Prettier formats a fenced block as a standalone
file and strips that indentation from this document each time it runs, which is why the listing
is shown at column zero; the file itself is then formatted by step D4.

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

  const line = stream.at(-1)!;
  const parsed = parseOrThrow(LogRecord, JSON.parse(line) as Record<string, unknown>);
  expect(parsed.err!.occurrence_id).toMatch(/^AE_/);
  expect(parsed.err!.fingerprint).toMatch(/^fp1_/);
  expect(parsed.request_id).toBe('req-9');
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

  logger.error({ err: revocable.proxy }, 'unreadable failure');

  const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
  expect(parsed.err!.reported).toBe(false);
  expect(parsed.err!.occurrence_id).toContain('UNSERIALIZED_');
});
```

Redaction and schema conformance are two checks, so they sit in **two** tests: one mutation must
not be able to hide the other. The `!` assertions are inside a test file, which the repository's
`no-non-null-assertion` policy allows, and `stream.at(-1)!` is the form the two existing tests in
this file already use.

For reference, the real line emitted by the first of these tests (observed, with the redaction
removed so the secret shows):

```text
{"level":"error","time":1789933442418,"service":"be-01","err":{"occurrence_id":"AE_1ASBVXQB473Q7B3GD3EQBRFBPG","fingerprint":"fp1_c15bcafc7080dba9553f9128295e741f","stack":["Error: outer hunter2","    at <anonymous> (…/logger.test.ts:61:18)"],"children":[{"id":"0","path":"$.cause","level":1,"stack":["TypeError: inner","    at <anonymous> (…/logger.test.ts:61:54)"],"as_string_format":"derived"}],"as_string_format":"derived","v":"corj/v0.14"},"request_id":"req-9","msg":"operation failed"}
```

## 9. OpenSpec

Create `openspec/changes/log-failure-records/` with `.openspec.yaml` carrying
`schema: sdd-lean` and `created: 2026-09-21`.

### `proposal.md` (339 words, under the 400-word limit)

```markdown
## Why

The WBS logger serializes an `err` into `{ type, message, stack }` while the declared log schema says `{ name, message, stack }`, so a query written against the schema reads a field the logger never emits, and no test noticed because no test logs an `err`. `@shared/failures` now produces a redacted, bounded diagnostic report with an occurrence identifier and a fingerprint, and nothing carries it into a log line.

## What Changes

**Failure log records**

- From: the logger renders a caught value itself, into a shape the log schema contradicts, with no correlation handle, no retry signal and no redaction.
- To: the logger writes the sanitized diagnostic report of one failure under `err`, and the log schema declares that record, so an operator can correlate a line with what a user or agent was told.
- Impact: contractual for anything reading WBS log lines; the Pino envelope, levels and correlation fields are unchanged.

## Non-Goals

No boundary adopts the contract in this change: the backend unexpected-error boundary, the MCP tool-call boundary and the gateway remain as they are. No new service name, no new telemetry endpoint, no dashboard or ingestion query change, no HTTP status, WebSocket frame or MCP envelope change, and no browser-execution claim.

## Constraints

Redaction and the byte budget belong to `@shared/failures` and are not applied a second time. The diagnostic report goes only to the operator sink; the public report is never written in its place. A logger that threw would turn a reporting problem into a failed request, so serializing a failure never throws, and every safety check here carries a watched production-path negative under R5.

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

`libs/wbs/adapters/observability/src/{serializers.ts,logger.ts,log-schema.ts,index.ts}` and their tests. Existing `logger.error({ err }, …)` call sites in `apps/wbs/be-01` and `apps/wbs/gw-01` keep compiling and change only the shape of the `err` field they produce.
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

### Requirement: The public report never replaces the diagnostic one

A failure log record SHALL NOT carry the public report of the failure in place of the diagnostic report, and the diagnostic report SHALL go only to the operator sink.

#### Scenario: An unknown failure is logged

- **GIVEN** a caught value with no disclosure policy
- **WHEN** it is logged as a failure
- **THEN** the emitted line carries the diagnostic report version rather than the public report version
- **AND** the line carries neither the generic public message nor a public code

### Requirement: A failure record carries the retry signal when there is one

A failure log record SHALL carry the failure's fingerprint when the report libraries published one, and two occurrences of the same failure from the same place SHALL share that fingerprint while carrying distinct occurrence identifiers.

#### Scenario: The same failure occurs twice

- **GIVEN** one throwing operation run twice
- **WHEN** each occurrence is logged as a failure
- **THEN** the two records carry the same fingerprint
- **AND** the two records carry different occurrence identifiers

### Requirement: Failure records are redacted once and bounded

A failure log record SHALL be written as the shared reporting module produced it, without a second redaction pass and without the raw caught value, and SHALL stay within the shared report byte budget.

#### Scenario: A failure quotes a secret the process owns

- **GIVEN** a logger holding a caller-owned secret and a failure whose message quotes it
- **WHEN** the failure is logged
- **THEN** the emitted line does not contain the secret text

#### Scenario: A failure carries far more content than the budget

- **GIVEN** a failure whose content greatly exceeds the report byte budget
- **WHEN** it is logged
- **THEN** the failure record stays within the budget

### Requirement: Logging a failure never throws

Serializing a failure for a log line SHALL NOT throw for any value, and a value that cannot be read SHALL be recorded as a visible reporting loss with a correlation handle and a reason.

#### Scenario: The failure cannot be read at all

- **GIVEN** a caught value that throws when it is read
- **WHEN** it is logged as a failure
- **THEN** a line is still emitted
- **AND** the failure record states that it was not reported and carries a correlation handle and a reason

### Requirement: An already reported failure is not reported twice

A boundary that has already produced a failure's reports SHALL be able to log that reporting outcome directly, and the record SHALL keep the occurrence identifier that boundary already disclosed.

#### Scenario: A boundary logs its own reporting outcome

- **GIVEN** a boundary that has already reported a failure
- **WHEN** it logs that reporting outcome
- **THEN** the failure record carries the occurrence identifier the boundary already holds
```

### `tasks.md`

```markdown
## 1. Failure log records

- [ ] 1.1 Replace the `err` serializer with one built over `@shared/failures`, declare the record in `log-schema.ts` and export it — test: `NX_DAEMON=false bunx nx run wbs-observability:test --skip-nx-cache`, `wbs-observability:typecheck`, `wbs-observability:lint`; negatives: write the public report instead of the diagnostic one, drop the never-throw guard, drop the shared redaction policy, restore the pre-change schema and report an already reported failure a second time

## References

This task implements the observability half of slice 3 of the
[package adoption plan](../../../docs/superpowers/plans/2026-09-17-personal-package-adoption.md),
which the open `adopt-failure-reporting` change lists as its unowned task 2.1.
```

`verify.md` starts with the heading block of `openspec/changes/adopt-failure-reporting/verify.md`
(change name, date, verifier attempt id) and is appended to by every slice.

## 10. README edits

In `libs/wbs/adapters/observability/README.md`, replace the `log-schema.ts` bullet's second line
with `written once, \`err.occurrence_id\` and \`err.fingerprint\` included.`, replace the whole
`serializers.ts` bullet with:

```markdown
- **`serializers.ts`** — `createFailureSerializer(redact)`, which turns what a
  boundary logged under `err` into that failure's diagnostic report.
```

and replace the first landmine bullet with three:

```markdown
- **Never print a secret value.** `@shared/failures` redacts and bounds the
  report; this library adds no second pass and never writes the raw caught
  value. A logger is given only the secrets its own process owns.
- **Only the diagnostic report is logged.** The public report is what a user or
  an agent is told; writing it here would leave the operator with nothing to
  debug, and the diagnostic report must never travel the other way.
- **Pino does not catch a throwing serializer.** It rethrows into the
  `logger.error(...)` call and writes no line, so `createFailureSerializer`
  models an unreadable value as a visible loss instead of throwing.
```

The heading "## Five files" stays: the file count does not change.

## 11. Negative proofs

All five were rehearsed by the planner on 2026-09-21 in a worktree of `batch-3/planning`, with
Bun 1.4.2. Each row names the function, the exact expression, the named test and the **fact** the
test fails on, with the fragment the runner actually printed. Extra failing tests are recorded,
never a stop (preamble rules 16 and 20).

| #   | File, function, exact expression                                                                                                            | Fault                                                                                                                            | Named test                                                                 | Observed                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `serializers.ts`, the returned closure of `createFailureSerializer`, the ternary's true arm `reporting.reports.diagnostic`                  | change it to `reporting.reports.public`                                                                                          | `never writes the public report in place of the diagnostic one`            | `error: expect(received).not.toBe(expected)` / `Expected: not "appex/public/v4"`                                                                                                                                                                                                                                                                                                                |
| 2   | `serializers.ts`, the returned closure, the `try { … } catch { return nextSerializerLoss(); }` wrapper around the assignment to `reporting` | delete the wrapper, assigning `const reporting = isFailureReporting(value) ? value : reportFailure(value, { redact });` directly | `returns a visible loss instead of throwing on an unreadable failure`      | `TypeError: Proxy has already been revoked. No more operations are allowed to be performed on it` thrown from `isFailureReporting`. Also fails `writes a line rather than throwing when the failure cannot be read`, where the same `TypeError` comes out of `pino/lib/proto.js:233` — the production-path evidence that Pino rethrows into `logger.error(...)`. Record both; neither is a stop |
| 3   | `serializers.ts`, the returned closure, the condition `isFailureReporting(value) ? value :`                                                 | drop the branch, leaving `reporting = reportFailure(value, { redact });`                                                         | `reuses an already reported occurrence instead of reporting it twice`      | `error: expect(received).toBe(expected)` with two different `AE_…` ids, e.g. `Expected: "AE_0Z5H8TR1Y29EBFD6XWC3V8K8J1"` / `Received: "AE_K2PZKEYR3MKA5052CGX6M068C9"`                                                                                                                                                                                                                          |
| 4   | `logger.ts`, `createLogger`, the argument `createFailureRedaction(opts.secrets ?? [])` inside the single `serializers:` line                | change it to `createFailureRedaction([])`                                                                                        | `scrubs a secret this process owns out of the failure line`                | `error: expect(received).not.toContain(expected)` / `Expected to not contain: "hunter2"`, with the received line showing `"stack":["Error: token was hunter2", …]`                                                                                                                                                                                                                              |
| 5   | `log-schema.ts`, the `'err?'` member of `LogRecord`                                                                                         | restore the pre-change `name: 'string', message: 'string', 'stack?': 'string'` body                                              | `logs a failure as the diagnostic report and validates against the schema` | `ValidationError: Validation failed: err.message must be a string (was missing)` / `err.name must be a string (was missing)` / `err.stack must be a string (was an object)`                                                                                                                                                                                                                     |

The byte budget and the `no-invoke` inspection rule are **not** proved here: they are checks of
`@shared/failures` and already carry their own watched negatives at
`libs/shared/domain/failures/src/report-failure.ts:26-37`. The budget test in
`serializers.test.ts` is a boundary assertion over this library's output, not a new check.

Filters for the named tests (title alone, unanchored; never include Bun's printed `>`):

```sh
cd libs/wbs/adapters/observability
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/serializers.test.ts -t 'never writes the public report in place of the diagnostic one'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/serializers.test.ts -t 'returns a visible loss instead of throwing on an unreadable failure'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/serializers.test.ts -t 'reuses an already reported occurrence instead of reporting it twice'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/logger.test.ts -t 'scrubs a secret this process owns out of the failure line'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/logger.test.ts -t 'logs a failure as the diagnostic report and validates against the schema'
```

Each must report `1 fail` and the rest `filtered out`. `0 tests ran` from one of these verbatim
filters is a stop.

### The `Proof:` comments to write in step D2

In `serializers.ts`, inside the returned closure, after Prettier has run:

```ts
    let reporting: FailureReporting;
    // Proof: replacing this guard with a bare expression let a revoked Proxy throw
    // `TypeError: Proxy has already been revoked.` out of `logger.error(...)`, failing
    // "returns a visible loss instead of throwing on an unreadable failure" and
    // "writes a line rather than throwing when the failure cannot be read" (2026-09-21).
    try {
      // Proof: dropping the `isFailureReporting(value) ? value :` branch reported an already
      // reported failure again and failed "reuses an already reported occurrence instead of
      // reporting it twice" with two different `AE_…` ids (2026-09-21).
      reporting = isFailureReporting(value) ? value : reportFailure(value, { redact });
    } catch {
      return nextSerializerLoss();
    }
    return reporting.reported
      ? // Proof: writing `reporting.reports.public` here failed "never writes the public report in
        // place of the diagnostic one" on `Expected: not "appex/public/v4"` (2026-09-21).
        reporting.reports.diagnostic
      : {
```

In `logger.ts`, directly above the `serializers:` line:

```ts
// Proof: passing `createFailureRedaction([])` instead of the caller's secrets printed
// `Error: token was hunter2` and failed "scrubs a secret this process owns out of the
// failure line" (2026-09-21).
```

In `log-schema.ts`, directly above `'err?': {`:

```ts
// Proof: restoring the pre-change `{ name, message, stack? }` shape here failed "logs a
// failure as the diagnostic report and validates against the schema" with
// `err.name must be a string (was missing)` (2026-09-21).
```

Replace the dates with the day the fault was actually observed if it is not 2026-09-21.

## 12. Verification

### What the executor runs

| Command                                                                                        | Expected                                                                                                                                      | Slice          |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)` | status 0; baseline `Ran N tests across M files`                                                                                               | A0, B0, C0, D0 |
| The README's **OpenSpec validation** block                                                     | block exits 0; baseline `"items": N`, then `N+1`, `"failed": 0`                                                                               | A0, A1, D4     |
| `… bun test src/serializers.test.ts`                                                           | slice A: non-zero, `createFailureSerializer` missing. Slice B: status 0, `7 pass`, `0 fail`, `16 expect() calls`, `Ran 7 tests across 1 file` | A2, B5         |
| `NX_DAEMON=false bunx nx run wbs-observability:typecheck`                                      | status 0, `Successfully ran target typecheck for project wbs-observability`                                                                   | B5, D4         |
| `NX_DAEMON=false bunx nx run wbs-observability:lint`                                           | status 0, `Successfully ran target lint for project wbs-observability`                                                                        | B5, D4         |
| `(cd libs/wbs/adapters/observability && … bun test)`                                           | status 0, `13 pass`, `0 fail`, `30 expect() calls`, `Ran 13 tests across 3 files`                                                             | C2, D4         |
| `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-gw-01`                         | status 0, `Successfully ran target typecheck for 2 projects`                                                                                  | C2             |
| The five proof filters of section 11                                                           | each `1 fail`, then restored and green                                                                                                        | D1             |
| `GSETTINGS_BACKEND=memory bunx prettier --write <the eleven owned files>`                      | status 0                                                                                                                                      | D4             |
| The repository-wide format **check** (never a write)                                           | status 0                                                                                                                                      | D4             |

Start every Nx target under a status-recording wrapper
(`cmd >"$TMPDIR/evidence/x.log" 2>&1; echo "status=$?" >>"$TMPDIR/evidence/x.log"`) and poll if it
outlives the tool's wait (preamble rule 19). No test here spawns a process or binds a port, so no
explicit Bun timeout and no `--network` at dispatch are needed.

### What the planner runs afterwards; report these as pending planner verification

- `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, with
  every file staged. Expected **unchanged**: `301 pass`, `0 fail`, `Ran 301 tests across 24 files`.
  Rehearsed by the planner on exactly this change; no pin moves.
- `NX_DAEMON=false bunx nx run-many -t test -p wbs-be-01,wbs-gw-01` (SQLite-backed `.db.test.ts`
  files). Expected unchanged; these use the real `createLogger` but assert nothing about `err`.
- `bin/h2puni-gate.sh <sha>` on the shared build host, after the commit. The executor never runs
  it and says so in the report.

## 13. Stop conditions

Each is FALSE on `batch-3/planning` today; a verified fact is cited beside it.

1. `libs/wbs/adapters/observability/src/serializers.ts` does not contain
   `export const errSerializer` (it does, at line 7). — stop, the file is not what this packet
   describes.
2. `libs/wbs/adapters/observability/src/log-schema.ts` does not contain `name: 'string',` inside
   its `'err?'` member (it does, line 16). — stop.
3. `import { reportFailure } from '@shared/failures'` fails to resolve (the alias exists at
   `tsconfig.base.json:95` and the module at `libs/shared/domain/failures/src/index.ts:5`). — stop.
4. `bunx nx run wbs-observability:lint` reports an `@nx/enforce-module-boundaries` diagnostic for
   the `@shared/failures` import. It must not: `wbs-observability` is `ring:adapter`,
   `runtime:bun`, `scope:shared`, `product:wbs`; `shared-failures` is `ring:domain`,
   `runtime:isomorphic`, `scope:shared`, `product:shared`, and every constraint in
   `eslint.config.js:25-42` permits that edge. Rehearsed green. — stop.
5. A step needs a file outside section 5's table. — stop.
6. A named proof test passes under its fault, after you have checked the location once against the
   function and expression the row names and redone the edit once. — stop (preamble rule 20).
7. A verbatim `-t` filter from section 11 reports `0 tests ran`. — stop.
8. A lint diagnostic that is not `simple-import-sort/*` or `prettier/prettier`, or one in a file
   you do not own. — stop (preamble rule 17).

Not stop conditions: extra tests failing beside a named proof (record them); `rm -f` refused by
the command guard (keep the scratch file, mention it once); `NX Recursive task invocation detected`
after a still-running target (wait, rerun once, then report pending).

## 14. Out of lane

Do not add `mcp-01` anywhere. Do not touch `apps/wbs/be-01`, `apps/wbs/gw-01`, `apps/wbs/fe-01`,
`apps/wbs/mcp-01`, `tools/tool-observability-stack`, `libs/shared/domain/failures` or
`openspec/changes/adopt-failure-reporting`. Do not define an exception kind. Do not introduce
DI Bag. Do not change `metrics.ts` or `prometheus.ts`. Do not run a repository-wide format write.
Do not run `wbs-fe-01:test:unit`, `wbs-fe-01:test`, `tool-devsync:test` or `test:package`.
