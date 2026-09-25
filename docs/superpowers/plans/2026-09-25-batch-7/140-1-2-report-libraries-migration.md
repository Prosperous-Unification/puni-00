# 140.1–140.2 — the two report libraries move together

|             |                                                                                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work items  | 140.1 "caught-object-report-json 11.0.1 to the newest release" (WBS `3de7a5d2-15e8-4d8c-9c8d-e9ecd210d79f`) and 140.2 "application-exception 0.5.0 to the newest release" (WBS `dcf17f2c-8c42-440e-a4ab-ff2159cef86f`), **merged into this one packet by the planner on 2026-09-25** (section 1.1)            |
| Size class  | M — four slices, each one executor attempt                                                                                                                                                                                                                                                                    |
| Moves       | `caught-object-report-json` (called **CORJ** below) 11.0.1 → **13.0.0**, `application-exception` 0.5.0 → **0.7.0**, in one lockfile edit. `di-bag` stays 0.4.0.                                                                                                                                               |
| Schema      | New OpenSpec change `migrate-report-libraries` (`sdd-lean`): one new capability, `report-libraries`, with two requirements and four scenarios; three tasks, each ticked by the slice that meets it. One dated sentence added to `adopt-failure-reporting/design.md`, whose cache claim this move makes false. |
| Authored on | Stand-in base `ad0451da9` (`batch-6/integration`, whose tree is main after PR #62). The planner reruns section 9.1 with `REAL_BASE=<planning sha>` before the first dispatch.                                                                                                                                 |
| Rehearsal   | `rehearse/140-1-2-r1`: `7238c37aa` (slice 1), `276368515` (slice 2), `400deded9` (slice 3), `3075cd97a` (slice 4), each committed with the hooks on.                                                                                                                                                          |

## 1. Goal, non-goals, and the cut

**Goal.** The repository runs the newest CORJ and the newest application-exception, and it runs
**one** copy of CORJ — the copy application-exception itself loads — and a test says so about the
installed tree, not only about lockfile keys. Every boundary keeps its behaviour: the backend's
generic 500, the gateway's frames, the MCP tool result, the frontend's fault disclosure and the
operator's log record. Only the diagnostic report's format version (`corj/v0.14` → `corj/v0.15`)
and the field names of a reporting-error row change, and records written before the move stay
valid under the log schema.

### 1.1 Intent: why 140.1 and 140.2 are one packet

**The precondition failed.** The batch-7 brief (point 6) asked first whether application-exception
0.5.0 accepts CORJ 13. It does not. Observed on 2026-09-25 from the registry and the lockfile:

```text
application-exception 0.5.0 {"nanoid":"^3.3.19","caught-object-report-json":"^11.0.1"}
application-exception 0.6.0 {"nanoid":"^3.3.19","caught-object-report-json":"^12.0.0"}
application-exception 0.7.0 {"nanoid":"^3.3.19","caught-object-report-json":"^13.0.0"}
```

`bun.lock` on the base says the same of the installed 0.5.0 (`"application-exception":
["application-exception@0.5.0", "", { "dependencies": { "caught-object-report-json": "^11.0.1", … } }`).
Each application-exception release accepts exactly one CORJ major, and each pair was published
together (CORJ 12.0.0 and application-exception 0.6.0 on 2026-09-20 at 19:08 and 19:42 UTC; CORJ
13.0.0 and 0.7.0 at 20:52 and 21:08 UTC).

**What moving CORJ alone does**, rehearsed on the stand-in with `bun add --exact
caught-object-report-json@13.0.0`: `bun.lock` gained a second key,
`"application-exception/caught-object-report-json": ["caught-object-report-json@11.0.1", …]`, and
`node_modules/application-exception/node_modules/caught-object-report-json/package.json` said
`"version": "11.0.1"`. application-exception would have kept writing every operator report in the
11 format through its own copy while the repository's direct imports loaded 13 — the one outcome
the WBS note ("check the report format version against the log schema and the fingerprint") exists
to prevent. Restoring `package.json` and `bun.lock` and running `bun install --frozen-lockfile`
left that nested copy **in place** until the next install that changed application-exception: a
stale tree the lock-key test cannot see. Slice 2's new test sees it.

**Planner decision (2026-09-25).** 140.1 and 140.2 merge into this one packet, which moves CORJ
11.0.1 → 13.0.0 together with application-exception 0.5.0 → 0.7.0 in the same slice, with one CORJ
copy in the tree before and after. The two-step route through CORJ 12 and application-exception
0.6.0 was rejected: it would migrate every boundary twice, to intermediate versions. The WBS notes
of both items record the merge.

### 1.2 Non-goals

- No new boundary, exception kind, limit, telemetry endpoint or **public** byte budget. 0.6.0
  made a public `maxReportBytes` available; the public report keeps what it had on 0.5.0, the
  library's fixed message and details caps (section 3.3).
- No change to the log schema's rule. It already accepts any `corj/` version; slice 2 adds the
  test that says so on purpose and slice 3 its negative.
- No change to the never-throw wrapper: CORJ issue 217 is still open on 13.0.0 (section 3.4).
- No `di-bag` move (140.3 waits for a release newer than 0.4.0).
- Historical `Proof:` comments that quote observed 0.5.0 text (`corj/v0.14`, `toReports`) in
  `serializers.ts`, `browser-packages.spec.ts` and the gate test stay as written: they are dated
  records of what was seen. Historical packets under `docs/superpowers/plans/2026-09-*` stay too.

### 1.3 The cut, and why four slices

1. **Intent** — the OpenSpec change, documents only. R4 puts intent before the change.
2. **The move** — both pins in one lockfile edit, `@shared/failures` adapted to the renamed API,
   the version literals the boundary tests assert, the browser probe, the stale "maker cache"
   sentences, the new one-copy test and the older-record test. Red on the test side, green after
   the production side and `bun install --frozen-lockfile`. Network: the registry probe and, if
   the Bun cache lacks them, two tarballs.
3. **The new negatives** — the one-copy check's two clauses (each also run with its clause
   disabled), the moved byte budget and the log schema's acceptance of an older record, with
   their `Proof:` comments.
4. **The old proofs, observed again, and the records** — the nine faults the existing
   `@shared/failures` `Proof:` comments name, run on the new libraries, then the adoption plan's
   dated amendment and the other change's design sentence.

## 2. Read first

| File                                                                                                                                                 | Why                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                                                         | Rules R1–R5 and the routing index.                                                                                                           |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                                                                                | "Execution contract" and "Standard blocks every packet uses": the strict OpenSpec block, the patch-saving form, creating an OpenSpec change. |
| `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`, its 2026-09-19 amendment                                                           | The reporting contract this packet keeps; slice 4 adds a 2026-09-25 amendment above it.                                                      |
| `openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md`, `openspec/changes/log-failure-records/specs/failure-log-records/spec.md` | The behaviour every boundary must keep; none of their requirements changes.                                                                  |
| `libs/shared/domain/failures/src/report-failure.ts` and its test                                                                                     | The one module that calls application-exception's reporting API.                                                                             |
| `tools/tool-devsync/src/toolchain-pins.test.ts`, `describe('the owner-maintained libraries')`                                                        | The pins and the lock-key test this packet extends.                                                                                          |

## 3. Design

### 3.1 Every release after the pins, read in full

The CORJ tarballs ship no changelog; the repository's `CHANGELOG.md` at tag `v13.0.0` does, and
the diffs of commits `b8f4d2e` (12.0.0) and `5c219c9` (13.0.0) were read beside it. The
application-exception tarball ships its `CHANGELOG.md`; `git diff v0.5.0 v0.7.0 -- src` was read
beside it.

| Release                     | Breaking change                                                                                                                                                                                                                                                                                                                                                                                | What it touches here                                                                                                                                                        | Handled by                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| CORJ 12.0.0                 | `makeCorj`/`makeCorjArray`/`makeReportObject` → `makeReport`/`makeReportArray`/`CorjMaker.makeReport`; free-function options and call values in one bag                                                                                                                                                                                                                                        | `apps/wbs/fe-01/e2e/browser-packages-probe.ts:2,75` (`makeCorj`)                                                                                                            | Slice 2: `Corj.makeReport('a plain string', { maxReportSize: 1024 })`                                                                            |
| CORJ 12.0.0                 | `CorjReportChild` → `CorjReportNode`; `onError` → `onReportingError`; source entry `field` → `sourceProperty`                                                                                                                                                                                                                                                                                  | Nothing in this repository names them                                                                                                                                       | —                                                                                                                                                |
| CORJ 12.0.0                 | Context `key`/`prop` → `reportKey`/`sourceProperty`, in callbacks and in `reporting_errors` rows                                                                                                                                                                                                                                                                                               | `report-failure.test.ts:262` (`context.key === 'as_json'` in a throwing transform)                                                                                          | Slice 2: `context.reportKey`. The compiler catches the old spelling; the rows' new names reach the operator record (section 3.2).                |
| CORJ 12.0.0                 | Report schemas `corj/v0.14` → `corj/v0.15`                                                                                                                                                                                                                                                                                                                                                     | Five test literals, the browser marker, the e2e expectation; the log schema's `v` rule                                                                                      | Slice 2 moves the literals; the log schema's `/^corj\//` already accepts both (section 3.2)                                                      |
| CORJ 13.0.0                 | Stateless utilities only on the frozen `Corj` object; `resolveCorjRedactPolicy` → `Corj.resolveRedactPolicy`                                                                                                                                                                                                                                                                                   | The same probe line                                                                                                                                                         | Slice 2 (`Corj.makeReport`). `CorjMaker`, constants and types stay named exports; schemas stay `corj/v0.15`.                                     |
| application-exception 0.6.0 | `toReports` → `makeReportPair`, `toDiagnosticReport`/`toPublicReport` → `make…`, `createRedactionPolicy` → `makeRedactionPolicy`, `createTrustRealm` → `makeTrustRealm`; types `CapturedReports` → `ReportPair`, `ToReportsOptions` → `ReportPairOptions`, `PublicOverride` → `PublicPolicyOverride`, `AppexCorjOptions` → `DiagnosticReportCorjOptions`/`PublicReportCorjOptions`; no aliases | `report-failure.ts:1-7,94,113,151`, `report-failure.test.ts:2,42…`, `browser-packages-probe.ts:1,25,64`                                                                     | Slice 2                                                                                                                                          |
| application-exception 0.6.0 | The byte budget left the `corj` bag: diagnostic `maxReportBytes` top level (≥ 512 or `null`); `corj.maxReportSize` refused as `APPEX_INVALID_OPTIONS`                                                                                                                                                                                                                                          | `FAILURE_REPORT_LIMITS.maxReportSize` (`report-failure.ts:28`), the probe's `REPORT_LIMITS`                                                                                 | Slice 2: `FAILURE_REPORT_MAX_BYTES = 32_768`, passed as the diagnostic bag's `maxReportBytes`; slice 3 proves it (`b1`)                          |
| application-exception 0.6.0 | A public `corj` bag takes only `inspection`, `maxDepth`, `maxChildren`, `childrenSources`, `fingerprintParts`, `onReportingError`; a public `maxReportBytes` is opt-in                                                                                                                                                                                                                         | `reportFailure`'s public bag was `{ redact, corj: FAILURE_REPORT_LIMITS }`, which carried `maxReportSize`                                                                   | Slice 2: `FAILURE_REPORT_LIMITS` is typed `PublicReportCorjOptions` and keeps only the three inspection limits, so one constant serves both bags |
| application-exception 0.6.0 | Public policy `details` → `detailsSelector`, per-call `public` → `policyOverride`; unknown policy keys refused (`APPEX_INVALID_PUBLIC_POLICY`)                                                                                                                                                                                                                                                 | `report-failure.test.ts:90` (`SignInFailed`); no production kind declares a public policy                                                                                   | Slice 2. `apps/wbs/mcp-01/src/wbs-client.ts:96`'s `ToolInputRefused` declares no `public` and compiles unchanged.                                |
| application-exception 0.6.0 | Option bags snapshotted per call; nothing frozen or cached by identity                                                                                                                                                                                                                                                                                                                         | Six sentences claim a maker cache: `report-failure.ts:11,82`, `logger.ts:26`, `fault-disclosure.ts:11`, the failures README (`:33`), `adopt-failure-reporting/design.md:13` | Slice 2 rewrites the code comments and the README; slice 4 adds a dated sentence to the design and to the adoption plan                          |
| application-exception 0.6.0 | Diagnostic schema `diagnostic-report-v6.json` (`corj/v0.15`)                                                                                                                                                                                                                                                                                                                                   | `report-failure.test.ts:3` imports `diagnostic-report-v5.json`                                                                                                              | Slice 2 imports v6; `public-report-v4.json` is unchanged                                                                                         |
| application-exception 0.7.0 | Re-exports CORJ's frozen `Corj`; the standalone `restoreExpectedValues` export removed; dependency `caught-object-report-json ^13.0.0`                                                                                                                                                                                                                                                         | Nothing imports `restoreExpectedValues`; the range is section 1.1                                                                                                           | Slice 2 moves both pins together                                                                                                                 |

Also read and found harmless: CORJ 11.0.1's own fix (no-invoke never touches an accessor's stack)
is kept; 12.0.0's validation messages now say `sourceProperty`. application-exception 0.6.0 and
0.7.0 made no change to `defineException`'s constructor, `isTypedException`, `occurrence_id` or
`fingerprint` minting beyond the renames above.

### 3.2 The format version, the log schema and the fingerprint

- **The version.** Probed on the installed 13.0.0/0.7.0 (slice 2, step 7): the diagnostic `v` is
  `corj/v0.15`, the public `v` stays `appex/public/v4`.
- **The log schema** (`libs/wbs/adapters/observability/src/log-schema.ts:38`) matches `err.v`
  against `/^corj\//`: records written before and after the move both validate. That was implicit;
  slice 2 adds `accepts a failure record written before the report format moved` to
  `logger.test.ts`, and slice 3 proves it by narrowing the rule to the current version (`s1`).
- **The fingerprint is unchanged.** CORJ 11.0.1's and 13.0.0's `CorjMaker` gave the same `fp1_…`
  value for the same five inputs in one process (a `TypeError`, an error with that cause, a string,
  a number and an object), observed 2026-09-25: `true fp1_36dac7ddfc269e0f9a62423d8767433d
fp1_36dac7ddfc269e0f9a62423d8767433d corj/v0.14 corj/v0.15`, and four more `true` lines. The only
  change to `src/fingerprint.ts` between the tags is the `field` → `sourceProperty` rename of the
  label's source; the `field:` label text is kept. Operators' fingerprint queries survive the move.
- **Reporting-error rows** now name `reportKey` and `sourceProperty` instead of `key` and `prop`
  (schema diff `v0.14` → `v0.15`: exactly those two property names and one description). Slice
  4's `r6` shows a live row: `{ stage: "as_json", path: "$", reportKey: "as_json", error: "Error:
ran" }`.

### 3.3 The whole-report budget

0.5.0's `corj: { maxReportSize: 32_768 }` bounded the diagnostic report; the same bag on the public
report bounded nothing but inspection (0.5.0's `publicReportOf` capped details with its own
`PUBLIC_DETAILS_MAX_BYTES`). 0.7.0 refuses `maxReportSize` inside `corj`, so the budget becomes
`FAILURE_REPORT_MAX_BYTES`, passed only to the diagnostic bag as `maxReportBytes`. Probed: a
40,000-character `é` message reports in **32,767 bytes** with `truncated: true` and
`context_omitted: 'max_size'`; `maxReportBytes: 256` is refused with `APPEX_INVALID_OPTIONS:
maxReportBytes must be null or a safe integer of at least 512`. The public report keeps no
byte budget, exactly as before; `both reports validate against the installed schemas after
redaction and truncation` still sees `public.truncated === true` from the fixed details cap.

### 3.4 Issue 217

CORJ issue 217, "A revoked Proxy as a cause makes makeReportObject throw", is **open** (read with
`gh issue view 217`, 2026-09-25; no linked fix in 12.0.0 or 13.0.0). Probed on 13.0.0/0.7.0:
`makeReportPair(new Error('boom', { cause: revoked }))` and `new CorjMaker({}).makeReport(…)` both
throw `TypeError: Array.isArray cannot be called on a Proxy that has been revoked`. The never-throw
wrapper in `reportFailure` therefore stays load-bearing, and slice 4's `r7` observes it again.
The backend, gateway and MCP "visible loss" tests keep passing because 217 is open; if a later
release fixes it, those tests will fail on `reported: false` and the wrapper's test must be given
another unreportable value — named for the next migration in section 12.

### 3.5 OpenSpec: required, and why

R4 requires OpenSpec for observable behaviour and contracts. This move changes what every
operator log record carries (`v`, the reporting-error row's field names) and adds a guarantee
about the installed tree. So: a new `sdd-lean` change, `migrate-report-libraries`, with one new
capability, `report-libraries`. It does **not** modify `failure-reporting` or
`failure-log-records`: both still live in open changes, their requirements hold word for word, and
a second change adding requirements to a capability another open change owns would collide at
archive. No CONTEXT.md term and no ADR: nothing here is hard to reverse (a pin moves back), and the
one alternative (two steps) is recorded in section 1.1 and the proposal.

### 3.6 Decisions

- **One constant for both bags.** `FAILURE_REPORT_LIMITS` is typed `PublicReportCorjOptions` —
  the narrower type — so the compiler refuses anything a public bag would reject at run time.
  Observed on 2026-09-25: a `PublicReportCorjOptions` literal with `maxReportSize: 32_768` failed
  `tsc` 7.0.2 with `TS2353: Object literal may only specify known properties, and
'maxReportSize' does not exist in type 'PublicReportCorjOptions'`.
- **The one-copy test resolves, it does not list directories.** Both resolutions go through
  `createRequire(...).resolve('caught-object-report-json/package.json')` (CORJ exports
  `./package.json`), so a nested copy, a hoisting change or a stale tree all show as two different
  files. Its version is read from the copy the root resolves.
- **The test lives in `tool-devsync`,** beside the lock-key test, where the planner's whole-suite
  run already goes. Nx keys that suite's cache on `bun.lock` (a shared global in `nx.json`), not
  on `node_modules`, which it cannot hash: a drifted install is seen by an uncached run
  (`--skip-nx-cache`, which every block here uses) and by every fresh install. The JSDoc says so.

## 4. Verified facts

### 4.1 CORJ inventory on the base

| Where                                                                                                                                                                | What                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json:48`, `bun.lock:24,1193`                                                                                                                                | The pin `11.0.1` and its one lock key                                                                                                     |
| `tools/tool-devsync/src/toolchain-pins.test.ts:505-545`                                                                                                              | `OWNER_PACKAGES`, `are pinned to exact versions in the root manifest`, `resolve to one copy of the report library, at the pinned version` |
| `apps/wbs/fe-01/e2e/browser-packages-probe.ts:2,75`                                                                                                                  | The one direct import in code: `makeCorj`                                                                                                 |
| `apps/wbs/fe-01/browser-packages.test.ts:20`, `apps/wbs/fe-01/e2e/browser-packages.spec.ts:66`                                                                       | The bundle marker and the Chromium expectation `corj/v0.14`                                                                               |
| `libs/wbs/adapters/observability/src/log-schema.ts:38`                                                                                                               | The log schema's `v: '/^corj\\//'`                                                                                                        |
| `libs/wbs/adapters/observability/src/{logger,serializers}.test.ts:120; 20,37,82`                                                                                     | Four `corj/v0.14` assertions; `serializers.test.ts:55` is a forged value and keeps its text                                               |
| The backend, gateway and MCP boundary tests (`…:64`, `…:90`, `…:78`)                                                                                                 | One `v: 'corj/v0.14'` each                                                                                                                |
| `LLM_README.md:126`, `bin/h2puni-gate.test.sh:717`, `docs/findings/checks-that-cannot-fail-puni-00.md:54`, `openspec/changes/host-gate-locked-install/proposal.md:5` | Names only; no version, no change                                                                                                         |

### 4.2 application-exception inventory on the base

Eleven tracked files import it: six historical plans under `docs/superpowers/plans/2026-09-1*` and
`2026-09-2*`, which stay as written, and the five below. Twelve tracked files outside `bun.lock`
and those plans name it: the five, plus `LLM_README.md`, `package.json`,
`tools/tool-devsync/src/toolchain-pins.test.ts`, `bin/h2puni-gate.test.sh`,
`apps/wbs/fe-01/browser-packages.test.ts` (a test title),
`docs/findings/checks-that-cannot-fail-puni-00.md` and
`openspec/changes/host-gate-locked-install/proposal.md` — names only, no version, no change but
the pins test's.

| File                                                         | Import                                                                                         | This packet                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| `libs/shared/domain/failures/src/report-failure.ts:1-7`      | `AppexCorjOptions`, `CapturedReports`, `createRedactionPolicy`, `RedactionPolicy`, `toReports` | Renamed (section 3.1)                  |
| `libs/shared/domain/failures/src/report-failure.test.ts:2-4` | `createRedactionPolicy`, `defineException`, `toReports`, two schemas                           | Renamed; schema v6                     |
| `libs/wbs/adapters/observability/src/serializers.ts:2`       | `type DiagnosticReport, RedactionPolicy`                                                       | Unchanged: both types kept their names |
| `apps/wbs/mcp-01/src/wbs-client.ts:1,96`                     | `defineException` for `ToolInputRefused`, no public policy                                     | Unchanged                              |
| `apps/wbs/fe-01/e2e/browser-packages-probe.ts:1`             | `createRedactionPolicy`, `defineException`, `toReports`                                        | Renamed                                |

**The four boundaries** all report through `@shared/failures`, never through the library:

| Boundary                    | Code                                                                                                     | Test that pins the record                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unexpected-endpoint | `apps/wbs/be-01/src/http/elysia/unexpected-failure.ts:15,17` (`createFailureRedaction`, `reportFailure`) | `unexpected-failure.test.ts` (`v` at :64, the revoked-Proxy loss), `src/app.test.ts`                                                                                       |
| MCP tool-call               | `apps/wbs/mcp-01/src/unexpected-tool-failure.ts:26,28`                                                   | `unexpected-tool-failure.test.ts` (`v` at :78), `src/main.test.ts`                                                                                                         |
| Gateway backend WebSocket   | `apps/wbs/gw-01/src/controller/unexpected-backend-failure.ts:30,32`                                      | `unexpected-backend-failure.test.ts` (`v` at :90), `src/failure-reporting.integration.test.ts`                                                                             |
| Frontend fault boundary     | `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts:14,90` (`FAULT_REDACTION`, `discloseFault`)    | `app-fault.test.tsx`, `lifetime-fault.test.tsx`, `gantt-panel.test.tsx`, `main.test.tsx`, `application-bootstrap{,.model}.test.tsx`; Chromium `e2e/fault-boundary.spec.ts` |

The observability logger builds its policy at `logger.ts:28` and serializes at `serializers.ts:72,131`.
The public report's shape (`appex/public/v4`, `code`, `message`, `occurrence_id`, `fingerprint`,
`as_json`) did not change between 0.5.0 and 0.7.0, so no boundary's response, frame or tool result
changes; the green runs of slice 2 are the evidence.

### 4.3 Probed library behaviour (Bun 1.4.2, 2026-09-25)

Every claim in section 3 was probed on the installed versions: the `v` values, the fingerprint
equality across 11.0.1 and 13.0.0, the refusal of `corj.maxReportSize` (`APPEX_INVALID_OPTIONS:
unknown corj option "maxReportSize"; known options: maxContextSize, omitExpectedValues, …`), the
refusal of a public policy's `details` (`APPEX_INVALID_PUBLIC_POLICY: unknown public policy option
"details"; known options: code, message, detailsSelector`), the budget at 32,767 bytes, issue 217,
`Object.keys(Corj)` = `makeReport,makeReportArray,restoreExpectedValues,resolveRedactPolicy` and
`Object.isFrozen(Corj) === true`. Slice 2's step 7 reruns the core of it on Bun and both compilers.

## 5. File plan

| Slice   | Path                                                                                                                                                      | Change                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1       | `openspec/changes/migrate-report-libraries/.openspec.yaml`                                                                                                | Create, by the OpenSpec command                                                  |
| 1       | `openspec/changes/migrate-report-libraries/{proposal.md,specs/report-libraries/spec.md,tasks.md,verify.md}`                                               | Create (7.1)                                                                     |
| 2       | `package.json`, `bun.lock`                                                                                                                                | Both pins, one edit (7.3)                                                        |
| 2       | `libs/shared/domain/failures/src/{report-failure.ts,index.ts}`, `README.md`                                                                               | Renamed API, the budget constant, the cache sentences (7.3)                      |
| 2       | `libs/wbs/adapters/observability/src/logger.ts`                                                                                                           | The cache sentence (7.3)                                                         |
| 2       | `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`, `apps/wbs/fe-01/e2e/browser-packages-probe.ts`                                                | The cache sentence; the probe's renamed API (7.3)                                |
| 2       | Nine test files (7.2)                                                                                                                                     | Pins, the one-copy test, the renamed API, `corj/v0.15`, the older-record test    |
| 2, 3, 4 | `openspec/changes/migrate-report-libraries/{tasks.md,verify.md}`                                                                                          | Tick 2.1, 3.1, 3.2 (7.3, 7.4, 7.5); each slice appends its own `verify.md` entry |
| 3       | `tools/tool-devsync/src/toolchain-pins.test.ts`, `libs/shared/domain/failures/src/report-failure.ts`, `libs/wbs/adapters/observability/src/log-schema.ts` | `Proof:` comments only                                                           |
| 4       | `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`, `openspec/changes/adopt-failure-reporting/design.md`                                    | One dated amendment each (7.5)                                                   |

No new source file under `apps/wiki/cli`, so the Twilight Burokrat validator identity does not
move. No module README with a `module-index` block is touched. `bun.lock` and `package.json` move
here, as the batch-7 brief's point 6 assigns them to this item; `di-bag` is not touched. The suite directory move (the other batch-7 lane) had no packet when this one was written; on
the stand-in no owned path lies under `apps/wiki`. The owned file most likely to be shared is
`tools/tool-devsync/src/toolchain-pins.test.ts`, which asserts on `ci.yml` text (`tool_wiki`,
`GATE_TOOL_WIKI`): check it against the suite-move packet once that is written.

## 6. Slices

Each slice is one executor attempt and ends at a checkpoint: the executor stops and reports, and
the planner reviews and commits before the next slice is dispatched. Every block below is real
`sh`, run from the repository root unless it says `cd`. Bun commands run under `env -u CLAUDECODE
-u AGENT`, Vitest under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`, multi-file Vitest serially,
and lint and typecheck with `--skip-nx-cache`.

### Step 0 — at the start of **every** slice

**0a. The starting state.** Replace `<the SHA named in this attempt's slice note>` with the
40-character hash the slice note gives (`reviewed base <sha>`); unreplaced, the block dies on the
unterminated quote.

```sh
set -euo pipefail
mkdir -p "${TMPDIR:?}/evidence"
base=$(git rev-parse HEAD)
echo "base=$base" | tee "$TMPDIR/evidence/base.txt"
reviewed=<the SHA named in this attempt's slice note>
test "$base" = "$reviewed"
git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-before.txt"
test ! -s "$TMPDIR/evidence/status-before.txt"
```

Expected: `base=` equal to the slice note's hash, and an **empty** `status-before.txt`.

**0b. Three helpers, the patches and the fault patches**, written into `$TMPDIR` with `>` so a
rerun in the same `$TMPDIR` rewrites rather than doubles them.

````sh
set -euo pipefail
cat > "$TMPDIR/run-check.sh" <<'EOF'
#!/usr/bin/env bash
# Runs one check into $TMPDIR/evidence/<name>.log, appends its own exit status,
# and prints the summary lines. Never fails itself: the status line is the result.
set -uo pipefail
name=$1
shift
log="$TMPDIR/evidence/$name.log"
if "$@" > "$log" 2>&1; then status=0; else status=$?; fi
echo "status=$status" >> "$log"
test -f "$log"
if summary=$(grep -E "^ *[0-9]+ (pass|fail)$|Test Files|Tests  |Successfully ran|Failed tasks|^status=" "$log"); then
  printf '%s | %s\n' "$name" "$(printf '%s' "$summary" | tr '\n' ' ')"
else
  rc=$?
  test "$rc" -eq 1
fi
EOF
cat > "$TMPDIR/expect-status.sh" <<'EOF'
#!/usr/bin/env bash
# Fails unless the named check's recorded status is exactly the expected one.
set -euo pipefail
log="$TMPDIR/evidence/$1.log"
test -f "$log"
last=$(tail -n 1 "$log")
test "$last" = "status=$2"
EOF
cat > "$TMPDIR/suites.sh" <<'EOF'
#!/usr/bin/env bash
# Runs the seven focused suites this packet reads, each into its own evidence log named
# <prefix>-<suite>, and prints one summary line per suite. Statuses are asserted by the caller.
set -euo pipefail
prefix=$1
run="$TMPDIR/run-check.sh"
test -f "$run"
bash "$run" "$prefix-pins" env -u CLAUDECODE -u AGENT bash -c \
  'cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts ./src/toolchain-pins.test.ts'
bash "$run" "$prefix-failures" env -u CLAUDECODE -u AGENT bash -c \
  'cd libs/shared/domain/failures && bun test ./src'
bash "$run" "$prefix-observability" env -u CLAUDECODE -u AGENT bash -c \
  'cd libs/wbs/adapters/observability && bun test ./src'
bash "$run" "$prefix-backend" env -u CLAUDECODE -u AGENT bash -c \
  'cd apps/wbs/be-01 && bun test ./src/http/elysia/unexpected-failure.test.ts ./src/app.test.ts'
bash "$run" "$prefix-gateway" env -u CLAUDECODE -u AGENT bash -c \
  'cd apps/wbs/gw-01 && bun test ./src/controller/unexpected-backend-failure.test.ts ./src/failure-reporting.integration.test.ts'
bash "$run" "$prefix-mcp" env -u CLAUDECODE -u AGENT bash -c \
  'cd apps/wbs/mcp-01 && bun test ./src/unexpected-tool-failure.test.ts ./src/main.test.ts'
bash "$run" "$prefix-frontend" env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT TZ=UTC bash -c \
  'cd apps/wbs/fe-01 && bunx vitest run --no-file-parallelism --maxWorkers=1 browser-packages.test.ts src/main.test.tsx src/components/chrome/app-fault.test.tsx src/components/chrome/lifetime-fault.test.tsx src/components/wbs/gantt-panel.test.tsx src/runtime/application-bootstrap.test.tsx src/runtime/application-bootstrap.model.test.tsx'
EOF
packet=docs/superpowers/plans/2026-09-25-batch-7/140-1-2-report-libraries-migration.md
test -f "$packet"
mkdir -p "$TMPDIR/patches" "$TMPDIR/mutations"
# Section 7's fenced diffs, in document order, as 01.diff … 05.diff. awk's `>` empties each file
# the first time this run writes it and appends after that.
awk -v out="$TMPDIR/patches" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print > f }
' "$packet"
count=$(find "$TMPDIR/patches" -name '*.diff' | wc -l)
echo "patches=$count"
test "$count" -eq 5
# Section 8's fault patches, each named by the heading "#### Proof <id>" above it.
awk -v out="$TMPDIR/mutations" '
  /^## 8\. Proofs$/ { inside=1; next }
  /^## 9\. Verification$/ { inside=0 }
  inside && /^#### Proof / { id=$3; next }
  inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print > f }
' "$packet"
count=$(find "$TMPDIR/mutations" -name '*.diff' | wc -l)
echo "mutations=$count"
test "$count" -eq 13
````

Expected: `patches=5`, `mutations=13`, exit 0, on a first run and on any rerun in the same
`$TMPDIR`. **Applying section 7.N** always means exactly this, never a hand edit:

```sh
set -euo pipefail
git apply --check "$TMPDIR/patches/NN.diff"
git apply "$TMPDIR/patches/NN.diff"
```

`git apply` without `--index` writes only the working tree. 7.1 is `01.diff`, 7.2 `02`, 7.3 `03`,
7.4 `04`, 7.5 `05`.

**0c. The strict OpenSpec baseline**, in every slice, with the README's block (section 9.2), plus
the totals line:

```sh
set -euo pipefail
report=$(mktemp "$TMPDIR/evidence/openspec-base.XXXXXX.json")
env -u CLAUDECODE -u AGENT OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json > "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
jq -c '.summary.totals' "$report" | tee "$TMPDIR/evidence/openspec-base-totals.txt"
```

Record `items` as **O**. Rehearsed: 114 before slice 1, 115 from slice 1 on. Every later count in a
slice is that slice's own step-0 number plus what the slice adds, never an absolute.

### Slice 1 — the intent

Owns (5 paths), all under `openspec/changes/migrate-report-libraries/`: `.openspec.yaml`,
`proposal.md`, `specs/report-libraries/spec.md`, `tasks.md`, `verify.md`.

- [ ] 1. Step 0 (0a, 0b, 0c). Stop if `openspec/changes/migrate-report-libraries` already exists.
- [ ] 2. Create the change with the README's standard block:

  ```sh
  set -euo pipefail
  test ! -e openspec/changes/migrate-report-libraries
  env -u CLAUDECODE -u AGENT OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change migrate-report-libraries --schema sdd-lean
  grep -n "schema: sdd-lean" openspec/changes/migrate-report-libraries/.openspec.yaml
  ```

  Expected: `Created change 'migrate-report-libraries'`, then `1:schema: sdd-lean`. The file's
  second line is `created: <the observed date>`; leave it as the command wrote it.

- [ ] 3. Apply section 7.1.
- [ ] 4. The strict OpenSpec block again, as step 0c with `openspec-s1` for `openspec-base`.
      Expected: exit 0, `items` = **O + 1**, `passed` = `items`, `failed` 0; and
      `jq -c '.items[] | select(.id == "migrate-report-libraries") | .valid'` on the report prints
      `true`. Rehearsed: `{"items":115,"passed":115,"failed":0}`.
- [ ] 5. Append this slice's `verify.md` entry (section "Verification record entries"), then
      Prettier over the five owned paths and the hand-over:

  ```sh
  set -euo pipefail
  d=openspec/changes/migrate-report-libraries
  printf '%s\n' "$d/.openspec.yaml" "$d/proposal.md" "$d/specs/report-libraries/spec.md" \
    "$d/tasks.md" "$d/verify.md" > "$TMPDIR/owned.txt"
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  sort "$TMPDIR/owned.txt" > "$TMPDIR/evidence/owned-sorted.txt"
  diff "$TMPDIR/evidence/owned-sorted.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: `All matched files use Prettier code style!`, and the `diff` prints nothing: five `??`
  paths.

Planner commit subject: `docs(openspec): intent and spec for moving the two report libraries together`.

### Slice 2 — both libraries move, in one lockfile edit

Owns (19 paths): `package.json`, `bun.lock`; the nine test files of 7.2
(`tools/tool-devsync/src/toolchain-pins.test.ts`,
`libs/shared/domain/failures/src/report-failure.test.ts`,
`libs/wbs/adapters/observability/src/{logger,serializers}.test.ts`,
`apps/wbs/be-01/src/http/elysia/unexpected-failure.test.ts`,
`apps/wbs/gw-01/src/controller/unexpected-backend-failure.test.ts`,
`apps/wbs/mcp-01/src/unexpected-tool-failure.test.ts`, `apps/wbs/fe-01/browser-packages.test.ts`,
`apps/wbs/fe-01/e2e/browser-packages.spec.ts`); the six production files of 7.3
(`libs/shared/domain/failures/src/{report-failure.ts,index.ts}`,
`libs/shared/domain/failures/README.md`, `libs/wbs/adapters/observability/src/logger.ts`,
`apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`,
`apps/wbs/fe-01/e2e/browser-packages-probe.ts`); and the change's `tasks.md` and `verify.md`.

**Network: on**, for `registry.npmjs.org` only — step 2 reads package metadata, and step 5's
install fetches the two tarballs if the Bun cache lacks them. Nx also contacts its analytics host
on every Nx command, as everywhere on this machine. Nothing else.

- [ ] 1. Step 0, then the baselines, before any edit:

  ```sh
  set -euo pipefail
  test ! -e node_modules/application-exception/node_modules/caught-object-report-json
  bash "$TMPDIR/suites.sh" base
  bash "$TMPDIR/run-check.sh" base-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t typecheck \
    -p shared-failures wbs-observability wbs-be-01 wbs-gw-01 wbs-mcp-01 wbs-fe-01 tool-devsync --skip-nx-cache
  for check in base-pins base-failures base-observability base-backend base-gateway base-mcp \
    base-frontend base-typecheck; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected, each `status=0`; rehearsed: pins `19 pass`, failures `20 pass`, observability `28
pass`, backend `5 pass`, gateway `5 pass`, mcp `4 pass`, frontend `Test Files 7 passed (7)`
  `Tests 288 passed (288)`, typecheck `Successfully ran target typecheck for 7 projects and 1 task they depend on`. Record
  each as that suite's **N**. A nested copy already present is a stop (section 10).

- [ ] 2. **The registry, read again** (network):

  ```sh
  set -euo pipefail
  env -u CLAUDECODE -u AGENT bun -e '
  for (const name of ["caught-object-report-json", "application-exception"]) {
    const meta = await (await fetch("https://registry.npmjs.org/" + name)).json();
    console.log(name, "latest", meta["dist-tags"].latest);
  }
  const appex = await (await fetch("https://registry.npmjs.org/application-exception")).json();
  for (const v of ["0.5.0", "0.6.0", "0.7.0"]) {
    console.log("application-exception", v, JSON.stringify(appex.versions[v].dependencies));
  }
  ' | tee "$TMPDIR/evidence/registry.txt"
  ```

  Expected, exactly these five lines (observed 2026-09-25):

  ```text
  caught-object-report-json latest 13.0.0
  application-exception latest 0.7.0
  application-exception 0.5.0 {"nanoid":"^3.3.19","caught-object-report-json":"^11.0.1"}
  application-exception 0.6.0 {"nanoid":"^3.3.19","caught-object-report-json":"^12.0.0"}
  application-exception 0.7.0 {"nanoid":"^3.3.19","caught-object-report-json":"^13.0.0"}
  ```

  A newer `latest` of either package is a stop: this packet's diffs pin 13.0.0 and 0.7.0.

- [ ] 3. Apply section 7.2, the test side. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/suites.sh" red
  bash "$TMPDIR/run-check.sh" red-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t typecheck \
    -p shared-failures wbs-observability wbs-be-01 wbs-gw-01 wbs-mcp-01 wbs-fe-01 tool-devsync --skip-nx-cache
  for check in red-pins red-failures red-observability red-backend red-gateway red-mcp red-frontend; do
    bash "$TMPDIR/expect-status.sh" "$check" 1
  done
  log="$TMPDIR/evidence/red-typecheck.log"
  test -f "$log"
  test "$(tail -n 1 "$log")" != "status=0"
  # tsc colours its output; strip the escapes before counting.
  sed 's/\x1b\[[0-9;]*m//g' "$log" > "$TMPDIR/evidence/red-typecheck.plain.log"
  test "$(grep -c 'report-failure.test.ts:[0-9]*:[0-9]* - error TS' "$TMPDIR/evidence/red-typecheck.plain.log")" -eq 10
  test "$(grep -c ' - error TS' "$TMPDIR/evidence/red-typecheck.plain.log")" -eq 10
  ```

  Expected, and rehearsed on the stand-in:

  | Suite         | Red                                                                          | The fact it fails on                                                                                                                                                                                                                                      |
  | ------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | pins          | N−2 pass, 3 fail (rehearsed 17·3)                                            | the manifest test and the lock-key test (`- Expected - 2` / `- Expected - 1`), and the new `installs one copy …` on `Expected: "13.0.0"` `Received: "11.0.1"` — the one copy resolves, at the old version                                                 |
  | failures      | `0 pass`, `1 fail`                                                           | `error: Cannot find module 'application-exception/schemas/diagnostic-report-v6.json'` — the file cannot load                                                                                                                                              |
  | observability | N−3 pass, 4 fail (rehearsed 25·4, of 29)                                     | `Expected: "corj/v0.15"` `Received: "corj/v0.14"` in `logs a failure as the diagnostic report …`, `writes the diagnostic report of a raw caught value`, `never writes the public report …` and one more serializer case; the new older-record case passes |
  | backend       | N−1 pass, 1 fail                                                             | `logs one registered, redacted report under its original occurrence`, `toMatchObject` on `v`                                                                                                                                                              |
  | gateway       | N−1 pass, 1 fail                                                             | `logs one registered forward failure with owned secrets redacted`, the same                                                                                                                                                                               |
  | mcp           | N−1 pass, 1 fail                                                             | `returns one public disclosure and logs its registered diagnostic occurrence`, the same                                                                                                                                                                   |
  | frontend      | `1 failed \| 6 passed (7)`, `1 failed \| 287 passed (288)`                   | `bundles di-bag, application-exception and caught-object-report-json`: `expected [ 'corj/v0.15' ] to deeply equal []`                                                                                                                                     |
  | typecheck     | non-zero (rehearsed `status=1`), `Failed tasks: - shared-failures:typecheck` | ten diagnostics, all in `report-failure.test.ts`: TS2724 and TS2305 on `makeRedactionPolicy`/`makeReportPair`, TS2307 on the v6 schema, TS2724 on `FAILURE_REPORT_MAX_BYTES`, TS2769 on `detailsSelector`, and five follow-on TS7031/TS2322/TS7006        |

- [ ] 4. Apply section 7.3, the production side (both pins, `@shared/failures`, the probe, the
      three cache sentences, task 2.1 ticked).
- [ ] 5. **Install the moved lockfile**, and prove the tree holds one copy:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" install env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory \
    bun install --frozen-lockfile
  bash "$TMPDIR/expect-status.sh" install 0
  test ! -e node_modules/application-exception/node_modules/caught-object-report-json
  grep -h '"version"' node_modules/caught-object-report-json/package.json \
    node_modules/application-exception/package.json | tee "$TMPDIR/evidence/installed.txt"
  git diff --stat -- package.json bun.lock
  ```

  Expected: `install | … status=0` (rehearsed `2 packages installed`), no nested copy, then
  `"version": "13.0.0",` and `"version": "0.7.0",`, then `2 files changed, 6 insertions(+), 6
deletions(-)`: `--frozen-lockfile` refused nothing and rewrote neither file beyond 7.3's edit.

- [ ] 6. **Green checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/suites.sh" green
  bash "$TMPDIR/run-check.sh" green-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t typecheck \
    -p shared-failures wbs-observability wbs-be-01 wbs-gw-01 wbs-mcp-01 wbs-fe-01 tool-devsync --skip-nx-cache
  bash "$TMPDIR/run-check.sh" green-lint env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t lint \
    -p shared-failures wbs-observability wbs-be-01 wbs-gw-01 wbs-mcp-01 wbs-fe-01 tool-devsync --skip-nx-cache
  for check in green-pins green-failures green-observability green-backend green-gateway \
    green-mcp green-frontend green-typecheck green-lint; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere, with pins = **N + 1** (the one-copy test; rehearsed 20),
  observability = **N + 1** (the older-record test; 29), failures, backend, gateway, mcp and
  frontend = **N** (20, 5, 5, 4 and 7·288): the boundaries' behaviour did not move. Typecheck
  `Successfully ran target typecheck for 7 projects and 1 task they depend on`, lint
  `Successfully ran target lint for 7 projects`. A lint finding that is only
  `simple-import-sort` or `prettier/prettier` is fixed with `bunx eslint --fix <file>` (preamble
  rule 17).

- [ ] 7. **The registry probe on Bun and both compilers.** The probe lives under `$TMPDIR`, beside a
      symbolic link to this clone's `node_modules`, so it resolves exactly what the repository
      installed and adds nothing to the working tree. **Strip the two-space list indent** before
      running it: an indented `EOF` does not end a heredoc, and bash would swallow the rest of the
      block. The `test -s` lines catch that:

  ```sh
  set -euo pipefail
  probe="$TMPDIR/registry-probe"
  mkdir -p "$probe"
  ln -sfn "$PWD/node_modules" "$probe/node_modules"
  cat > "$probe/tsconfig.json" <<'EOF'
  {
    "compilerOptions": {
      "strict": true,
      "noEmit": true,
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "lib": ["ES2022", "DOM"],
      "types": [],
      "skipLibCheck": false
    },
    "files": ["registry-probe.ts"]
  }
  EOF
  cat > "$probe/registry-probe.ts" <<'EOF'
  import { makeRedactionPolicy, makeReportPair, type ReportPair } from 'application-exception';
  import { Corj, CorjMaker } from 'caught-object-report-json';

  function check(fact: string, holds: boolean): void {
    if (!holds) throw new Error(`probe: ${fact} does not hold`);
    console.log(`ok ${fact}`);
  }

  const redact = makeRedactionPolicy({ keys: [/^password$/i], patterns: [/hunter2/g] });
  const limits = { maxDepth: 4, maxChildren: 16, inspection: 'no-invoke' } as const;
  const pair: ReportPair = makeReportPair(new Error('token hunter2'), {
    diagnostic: { redact, corj: limits, maxReportBytes: 32_768 },
    public: { redact, corj: limits },
  });
  check('diagnostic v is corj/v0.15', pair.diagnostic.v === 'corj/v0.15');
  check('public v is appex/public/v4', pair.public.v === 'appex/public/v4');
  check('one occurrence id', pair.diagnostic.occurrence_id === pair.public.occurrence_id);
  check('fingerprint is fp1', /^fp1_[0-9a-f]{32}$/.test(pair.diagnostic.fingerprint ?? ''));
  check('secret scrubbed', !JSON.stringify(pair).includes('hunter2'));
  const big = makeReportPair(new Error('é'.repeat(40_000)), {
    diagnostic: { redact, corj: limits, maxReportBytes: 32_768, context: { note: 'x' } },
  });
  const bytes = new TextEncoder().encode(JSON.stringify(big.diagnostic)).length;
  check(`budget holds at ${String(bytes)} bytes`, bytes <= 32_768 && big.diagnostic.truncated === true);
  check('context dropped whole over budget', big.diagnostic.context_omitted === 'max_size');
  const same = new TypeError('same');
  check(
    'Corj.makeReport and CorjMaker agree on the fingerprint',
    Corj.makeReport(same).fingerprint === new CorjMaker({}).makeReport(same).fingerprint,
  );
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  let issue217: string;
  try {
    makeReportPair(new Error('boom', { cause: proxy }), { diagnostic: { redact } });
    issue217 = 'fixed: no throw';
  } catch (thrown) {
    issue217 = `open: ${String(thrown)}`;
  }
  console.log(`issue 217 ${issue217}`);
  EOF
  test -s "$probe/tsconfig.json"
  test -s "$probe/registry-probe.ts"
  test "$(tail -n 1 "$probe/registry-probe.ts")" = 'console.log(`issue 217 ${issue217}`);'
  bash "$TMPDIR/run-check.sh" probe-bun env -u CLAUDECODE -u AGENT bun "$probe/registry-probe.ts"
  bash "$TMPDIR/run-check.sh" probe-tsc7 node_modules/.bin/tsc -p "$probe/tsconfig.json"
  bash "$TMPDIR/run-check.sh" probe-tsc6 node_modules/.bin/tsc6 -p "$probe/tsconfig.json"
  node_modules/.bin/tsc --version
  node_modules/.bin/tsc6 --version
  for check in probe-bun probe-tsc7 probe-tsc6; do bash "$TMPDIR/expect-status.sh" "$check" 0; done
  grep -v '^status=' "$TMPDIR/evidence/probe-bun.log"
  ```

  Expected: exit 0; `Version 7.0.2` and `Version 6.0.3`; both compilers silent; and the Bun run
  prints exactly (rehearsed 2026-09-25):

  ```text
  ok diagnostic v is corj/v0.15
  ok public v is appex/public/v4
  ok one occurrence id
  ok fingerprint is fp1
  ok secret scrubbed
  ok budget holds at 32767 bytes
  ok context dropped whole over budget
  ok Corj.makeReport and CorjMaker agree on the fingerprint
  issue 217 open: TypeError: Array.isArray cannot be called on a Proxy that has been revoked
  ```

  `issue 217 fixed: no throw` is a stop (section 10, condition 6): the backend's, the gateway's
  and the MCP server's loss tests would then need another unreportable value.

- [ ] 8. The strict OpenSpec block (step 0c, named `openspec-s2`): `items` = **O**, all passed.
- [ ] 9. Append this slice's `verify.md` entry, then Prettier and the hand-over. `bun.lock` has no
      Prettier parser and is left out of the Prettier list, not out of the path list:

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/be-01/src/http/elysia/unexpected-failure.test.ts \
    apps/wbs/fe-01/browser-packages.test.ts \
    apps/wbs/fe-01/e2e/browser-packages-probe.ts \
    apps/wbs/fe-01/e2e/browser-packages.spec.ts \
    apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts \
    apps/wbs/gw-01/src/controller/unexpected-backend-failure.test.ts \
    apps/wbs/mcp-01/src/unexpected-tool-failure.test.ts \
    libs/shared/domain/failures/README.md \
    libs/shared/domain/failures/src/index.ts \
    libs/shared/domain/failures/src/report-failure.test.ts \
    libs/shared/domain/failures/src/report-failure.ts \
    libs/wbs/adapters/observability/src/logger.test.ts \
    libs/wbs/adapters/observability/src/logger.ts \
    libs/wbs/adapters/observability/src/serializers.test.ts \
    openspec/changes/migrate-report-libraries/tasks.md \
    openspec/changes/migrate-report-libraries/verify.md \
    package.json \
    tools/tool-devsync/src/toolchain-pins.test.ts \
    > "$TMPDIR/prettier.txt"
  test "$(wc -l < "$TMPDIR/prettier.txt")" -eq 18
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/prettier.txt")
  # shellcheck disable=SC2046
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/prettier.txt")
  { cat "$TMPDIR/prettier.txt"; echo bun.lock; } | sort > "$TMPDIR/evidence/owned-sorted.txt"
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  diff "$TMPDIR/evidence/owned-sorted.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: `All matched files use Prettier code style!`, and the `diff` prints nothing: nineteen
  ` M` paths.

Planner commit subject:
`build(deps): move the report library to 13.0.0 and application-exception to 0.7.0 together`.

### Slice 3 — the new negatives

Owns (5 paths): `tools/tool-devsync/src/toolchain-pins.test.ts`,
`libs/shared/domain/failures/src/report-failure.ts`,
`libs/wbs/adapters/observability/src/log-schema.ts` (all three `Proof:` comments only), and the
change's `tasks.md` and `verify.md`.

- [ ] 1. Step 0, then the baselines:

  ```sh
  set -euo pipefail
  test ! -e node_modules/application-exception/node_modules
  grep -h '"version"' node_modules/caught-object-report-json/package.json
  bash "$TMPDIR/suites.sh" base
  for check in base-pins base-failures base-observability base-backend base-gateway base-mcp \
    base-frontend; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected: no nested directory, `"version": "13.0.0",`, every suite `status=0` at slice 2's green
  counts (rehearsed 20, 20, 29, 5, 5, 4, 7·288). **A clone whose `node_modules` still holds 11.0.1**
  (the attempt was resumed without an install) fails the version line: run `env -u CLAUDECODE -u
AGENT bun install --frozen-lockfile` once, record it, and rerun this step. The install must
  succeed offline from the Bun cache (slice 3 has no network); needing the network is a stop.

- [ ] 2. The section 8.1 faults, with section 8's procedure: every fault observed first, each
      restored and compared, then the `Proof:` comments at the sites 8.1 names.
- [ ] 3. Apply section 7.4 (task 3.1 ticked).
- [ ] 4. Rerun `bash "$TMPDIR/suites.sh" final` and the lint and typecheck of the three touched
      projects:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/suites.sh" final
  bash "$TMPDIR/run-check.sh" s3-lint env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t lint \
    -p shared-failures wbs-observability tool-devsync --skip-nx-cache
  bash "$TMPDIR/run-check.sh" s3-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t typecheck \
    -p shared-failures wbs-observability tool-devsync --skip-nx-cache
  for check in final-pins final-failures final-observability final-backend final-gateway \
    final-mcp final-frontend s3-lint s3-typecheck; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected: every suite at its step-1 count, lint and typecheck `status=0`.

- [ ] 5. Append this slice's `verify.md` entry; Prettier over the five owned paths; the hand-over as
      slice 1 step 5 with this list:

  ```sh
  set -euo pipefail
  printf '%s\n' \
    libs/shared/domain/failures/src/report-failure.ts \
    libs/wbs/adapters/observability/src/log-schema.ts \
    openspec/changes/migrate-report-libraries/tasks.md \
    openspec/changes/migrate-report-libraries/verify.md \
    tools/tool-devsync/src/toolchain-pins.test.ts \
    > "$TMPDIR/owned.txt"
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  sort "$TMPDIR/owned.txt" > "$TMPDIR/evidence/owned-sorted.txt"
  diff "$TMPDIR/evidence/owned-sorted.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: five ` M` paths, the `diff` silent.

Planner commit subject:
`test(failures): prove one report library copy, the moved budget and older log records`.

### Slice 4 — the old proofs, observed again, and the records

Owns (4 paths): `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`,
`openspec/changes/adopt-failure-reporting/design.md`, and the change's `tasks.md` and `verify.md`.

- [ ] 1. Step 0, then the failures baseline:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" base-failures env -u CLAUDECODE -u AGENT bash -c \
    'cd libs/shared/domain/failures && bun test ./src'
  bash "$TMPDIR/expect-status.sh" base-failures 0
  ```

  Expected: `20 pass`, `0 fail` (rehearsed).

- [ ] 2. The section 8.2 faults, with section 8's procedure. No `Proof:` comment is written or
      changed in this slice: each existing comment's fault is observed again and recorded in
      `verify.md`, dated with the observed date.
- [ ] 3. Apply section 7.5.
- [ ] 4. The strict OpenSpec block (named `openspec-s4`): `items` = **O**, all passed.
- [ ] 5. Append this slice's `verify.md` entry; Prettier over the four owned paths; the hand-over
      as slice 3 step 5 with this list:

  ```sh
  set -euo pipefail
  printf '%s\n' \
    docs/superpowers/plans/2026-09-17-personal-package-adoption.md \
    openspec/changes/adopt-failure-reporting/design.md \
    openspec/changes/migrate-report-libraries/tasks.md \
    openspec/changes/migrate-report-libraries/verify.md \
    > "$TMPDIR/owned.txt"
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  sort "$TMPDIR/owned.txt" > "$TMPDIR/evidence/owned-sorted.txt"
  diff "$TMPDIR/evidence/owned-sorted.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: four ` M` paths, the `diff` silent.

Planner commit subject:
`docs(plans): record the report libraries' move and observe the reporting proofs again`.

### Verification record entries

Each slice appends one entry to `openspec/changes/migrate-report-libraries/verify.md`, headed
`## Packet 140.1–140.2, slice N — <what the slice did>`, containing only its own observations: the
attempt id and starting hash; step 0's baselines as numbers; every command's status; the red
checkpoint's diagnostics (slice 2); the green counts; the registry lines and the probe's output
(slice 2); every fault of that slice with its observed diagnostic, and for slice 3 both runs of
each clause-disabled pair; and what stayed **pending planner verification** (section 9.4).
Evidence references are basenames relative to that attempt's evidence directory, never absolute
paths. Dates are the executor's own observed dates.

### Dispatch

One attempt per slice, from the reviewed packet, driven by a Claude subagent. The base of slice 1
is planning with this plan branch's commits since `ad0451da9` **cherry-picked in order** (never
the rehearsal branch). Before the first dispatch the planner runs section 9.1's script with
`REAL_BASE=<reviewed-base-sha>`; its `fill=real` output is the dispatch evidence. This block holds
the only absolute paths in this document.

```sh
# Slice 1, from the reviewed base.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  140-1-2-report-libraries-migration 1 <reviewed-base-sha> \
  --driver claude \
  --batch batch-7 --batch-dir docs/superpowers/plans/2026-09-25-batch-7 \
  --slice-note 'reviewed base <reviewed-base-sha>' \
  --preserve evidence

# Slice 2, into the same clone once slice 1 is committed as P1. Network for the registry only.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  140-1-2-report-libraries-migration 2 P1 \
  --driver claude \
  --batch batch-7 --batch-dir docs/superpowers/plans/2026-09-25-batch-7 \
  --resume --require-ancestor P1 --network \
  --slice-note 'reviewed base P1' \
  --preserve evidence

# Slices 3 and 4 the same way from P2 and P3, without --network.
```

**A `fill=real` failure is a planner stop**, never a waiver: rebase the rehearsal on the new base
and re-rehearse the affected slices before dispatch. The first path to check against the suite-move
packet is `tools/tool-devsync/src/toolchain-pins.test.ts` (section 5).

No `--seed`: no slice reads another attempt's evidence. `--slice-note` is load-bearing: step 0a
reads the reviewed SHA from it. Slice 2's install changes the clone's `node_modules`, which
`--resume` keeps for slices 3 and 4 (their step 1 checks it).

## 7. The code

Five fenced diffs, in slice order. Step 0b extracts them as `01.diff` … `05.diff`, and section 9.1
applies all of them, in order, to a tree extracted from the stand-in base and proves the result
equal to the rehearsal's final commit. No diff adds a `Proof:` comment; the executor writes those
after observing its own faults. `bun.lock`'s hunk is Bun's own output of `bun add --exact
caught-object-report-json@13.0.0 application-exception@0.7.0`, including the integrity hashes.
The dates in 7.5 ("Amendment, 2026-09-25", "Amended 2026-09-25") are the planner's decision date
for this move, not observed dates: the executor keeps them as written.

### 7.1 The OpenSpec change — slice 1

```diff
diff --git a/openspec/changes/migrate-report-libraries/proposal.md b/openspec/changes/migrate-report-libraries/proposal.md
new file mode 100644
index 000000000..a24ec5457
--- /dev/null
+++ b/openspec/changes/migrate-report-libraries/proposal.md
@@ -0,0 +1,62 @@
+## Why
+
+The repository pins `caught-object-report-json` 11.0.1 and `application-exception` 0.5.0; the
+registry carries 13.0.0 and 0.7.0, each release breaking. The two cannot move one at a time:
+application-exception 0.5.0 depends on the report library at `^11.0.1`, 0.6.0 at `^12.0.0` and
+0.7.0 at `^13.0.0`. Moving the report library alone installs a second, nested copy at 11.0.1,
+and application-exception keeps writing the operator's reports in the old format through it.
+
+## What Changes
+
+**Report libraries**
+
+- From: report library 11.0.1 and application-exception 0.5.0, one installed copy, held only by
+  lockfile keys.
+- To: 13.0.0 and 0.7.0 moved together in one step, and a test that proves the installed tree
+  resolves one copy — the one application-exception loads — at the pinned version.
+- Impact: internal. Every boundary keeps reporting through `@shared/failures`.
+
+**Operator failure records**
+
+- From: diagnostic reports carry `v: "corj/v0.14"`; a reporting-error row names `key` and `prop`.
+- To: `v: "corj/v0.15"`; a row names `reportKey` and `sourceProperty`. The fingerprint of a
+  failure is unchanged, and the log schema still accepts records written before the move.
+- Impact: contractual for anything reading WBS log lines. HTTP, WebSocket and MCP responses and
+  the public report (`appex/public/v4`) are unchanged.
+
+## Non-Goals
+
+No new boundary, exception kind, limit or public byte budget; no `di-bag` move; no telemetry
+endpoint. A revoked `Proxy` as a cause still makes the report library throw (its issue 217 is
+open on 13.0.0), so the never-throw wrapper stays exactly as it is.
+
+## Constraints
+
+Exact pins through Bun, one lockfile edit. Every changed safety check carries a watched
+production-path negative under R5, and the proofs the byte budget moved away from are observed
+again on the new versions.
+
+## Capabilities
+
+### New Capabilities
+
+- `report-libraries`: One installed report library serves every report, and operator records
+  written before and after a report-format change stay readable.
+
+### Modified Capabilities
+
+None.
+
+## Domain Terms
+
+None.
+
+## Decisions Recorded
+
+None.
+
+## Impact
+
+`package.json`, `bun.lock`, `libs/shared/domain/failures`, the pins suite in `tools/tool-devsync`,
+the version literals in the observability, backend, gateway and MCP boundary tests, and the
+frontend's browser package probe.
diff --git a/openspec/changes/migrate-report-libraries/specs/report-libraries/spec.md b/openspec/changes/migrate-report-libraries/specs/report-libraries/spec.md
new file mode 100644
index 000000000..6079a0941
--- /dev/null
+++ b/openspec/changes/migrate-report-libraries/specs/report-libraries/spec.md
@@ -0,0 +1,34 @@
+## ADDED Requirements
+
+### Requirement: One report library copy serves every report
+
+The installed dependency tree SHALL resolve `caught-object-report-json` from the repository root
+and from `application-exception` to the same installed copy, and that copy SHALL be the version
+the root manifest pins.
+
+#### Scenario: The pins agree
+
+- **WHEN** the pins suite resolves the report library from the root and from application-exception
+- **THEN** both resolutions name the same file
+- **AND** that copy's version is the pinned one
+
+#### Scenario: A second copy is installed beside application-exception
+
+- **WHEN** a copy of the report library is nested under application-exception
+- **THEN** the pins suite fails on the two resolutions
+
+### Requirement: Operator records stay readable across a report-format change
+
+The log schema SHALL accept a diagnostic record of any `corj/` report version, so that records
+written before a report-format change validate after it, and every boundary's diagnostic record
+SHALL carry the version the installed report library writes.
+
+#### Scenario: A record written before the move is read
+
+- **WHEN** a failure record carrying `v: "corj/v0.14"` is validated against the log schema
+- **THEN** it is accepted
+
+#### Scenario: A boundary logs a failure after the move
+
+- **WHEN** the backend, gateway or MCP boundary logs an unexpected failure
+- **THEN** its record carries `v: "corj/v0.15"` and validates against the log schema
diff --git a/openspec/changes/migrate-report-libraries/tasks.md b/openspec/changes/migrate-report-libraries/tasks.md
new file mode 100644
index 000000000..01d9bbde2
--- /dev/null
+++ b/openspec/changes/migrate-report-libraries/tasks.md
@@ -0,0 +1,21 @@
+## 1. Intent
+
+- [x] 1.1 Record the intent and the delta spec — test: strict `openspec validate --all --json`
+
+## 2. Move the two report libraries together
+
+- [ ] 2.1 Move the report library to 13.0.0 and application-exception to 0.7.0 in one lockfile
+      edit, adapt `@shared/failures` and every caller of a renamed API, and move the version
+      literals the boundary tests assert — test: the pins suite, `shared-failures`,
+      `wbs-observability`, the backend, gateway and MCP boundary tests, the frontend fault
+      suites and browser package build, and the registry probe on Bun, TypeScript 7 and
+      TypeScript 6
+
+## 3. Negatives
+
+- [ ] 3.1 Prove the one-copy check, the moved byte budget and the log schema's acceptance of an
+      older record — test: the named tests; negative: a copy nested under application-exception,
+      the installed copy's version edited, the byte budget dropped from the diagnostic bag, and
+      the schema narrowed to the current version, each also run with its clause disabled
+- [ ] 3.2 Observe again, on the new versions, every fault the `@shared/failures` proofs name —
+      test: the named `report-failure.test.ts` cases; negative: each proof's own fault
diff --git a/openspec/changes/migrate-report-libraries/verify.md b/openspec/changes/migrate-report-libraries/verify.md
new file mode 100644
index 000000000..c51e21f0c
--- /dev/null
+++ b/openspec/changes/migrate-report-libraries/verify.md
@@ -0,0 +1,7 @@
+# Verification Report
+
+**Change**: `migrate-report-libraries`
+
+Each slice of packet 140.1–140.2 appends its own entry below: the attempt, its starting hash, its
+baselines, every command's status, the red and green counts, every fault observed, and what stayed
+pending planner verification.
```

### 7.2 The test side — slice 2

```diff
diff --git a/apps/wbs/be-01/src/http/elysia/unexpected-failure.test.ts b/apps/wbs/be-01/src/http/elysia/unexpected-failure.test.ts
index 9b6e6d8df..313e14722 100644
--- a/apps/wbs/be-01/src/http/elysia/unexpected-failure.test.ts
+++ b/apps/wbs/be-01/src/http/elysia/unexpected-failure.test.ts
@@ -61,7 +61,7 @@ test('logs one registered, redacted report under its original occurrence', () =>
   expect(captured.reports.public.code).toBe('INTERNAL_ERROR');
   expect(JSON.stringify(captured.reports.public)).not.toContain(secret);
   expect(emitted.err).toMatchObject({
-    v: 'corj/v0.14',
+    v: 'corj/v0.15',
     occurrence_id: captured.reports.diagnostic.occurrence_id,
     fingerprint: captured.reports.diagnostic.fingerprint,
   });
diff --git a/apps/wbs/fe-01/browser-packages.test.ts b/apps/wbs/fe-01/browser-packages.test.ts
index 629f91e15..b315e09e8 100644
--- a/apps/wbs/fe-01/browser-packages.test.ts
+++ b/apps/wbs/fe-01/browser-packages.test.ts
@@ -17,7 +17,7 @@ import { type BrowserProbeBundle, buildBrowserProbeBundle } from './e2e/browser-
  * What it is really for is vacuity: without it, a bundle that contained nothing at all
  * would satisfy every other case in this file.
  */
-const LIBRARY_MARKERS = ['DI_BAG_CLASSIFIER_REQUIRED', 'appex/public/v4', 'corj/v0.14'];
+const LIBRARY_MARKERS = ['DI_BAG_CLASSIFIER_REQUIRED', 'appex/public/v4', 'corj/v0.15'];

 /** nanoid's own top-level files, as `modules` names them: not `url-alphabet/index.js`. */
 const NANOID_ENTRY = /\/nanoid\/[^/]+$/;
diff --git a/apps/wbs/fe-01/e2e/browser-packages.spec.ts b/apps/wbs/fe-01/e2e/browser-packages.spec.ts
index c14a30dc6..c9e83ac18 100644
--- a/apps/wbs/fe-01/e2e/browser-packages.spec.ts
+++ b/apps/wbs/fe-01/e2e/browser-packages.spec.ts
@@ -63,7 +63,7 @@ test('the three libraries run in Chromium from this app’s Vite build', async (
     correlated: true,
     publicCode: 'PROBE_FAILED',
     disclosesTheSecret: false,
-    reportVersion: 'corj/v0.14',
+    reportVersion: 'corj/v0.15',
   });

   // The bounded settle before the request assertion, and the reason it is not
diff --git a/apps/wbs/gw-01/src/controller/unexpected-backend-failure.test.ts b/apps/wbs/gw-01/src/controller/unexpected-backend-failure.test.ts
index 281df9398..36c29f2c7 100644
--- a/apps/wbs/gw-01/src/controller/unexpected-backend-failure.test.ts
+++ b/apps/wbs/gw-01/src/controller/unexpected-backend-failure.test.ts
@@ -87,7 +87,7 @@ test('logs one registered forward failure with owned secrets redacted', () => {
   expect(reporting.reports.diagnostic.context).toEqual({ operation: 'forward' });
   expect(reporting.reports.public.occurrence_id).toBe(reporting.reports.diagnostic.occurrence_id);
   expect(emitted.err).toMatchObject({
-    v: 'corj/v0.14',
+    v: 'corj/v0.15',
     occurrence_id: reporting.reports.diagnostic.occurrence_id,
   });
 });
diff --git a/apps/wbs/mcp-01/src/unexpected-tool-failure.test.ts b/apps/wbs/mcp-01/src/unexpected-tool-failure.test.ts
index fd98acddf..a71cfc31d 100644
--- a/apps/wbs/mcp-01/src/unexpected-tool-failure.test.ts
+++ b/apps/wbs/mcp-01/src/unexpected-tool-failure.test.ts
@@ -75,7 +75,7 @@ test('returns one public disclosure and logs its registered diagnostic occurrenc
   });
   const emitted = parseOrThrow(LogRecord, JSON.parse(lines[0]) as Record<string, unknown>);
   expect(emitted.err).toMatchObject({
-    v: 'corj/v0.14',
+    v: 'corj/v0.15',
     occurrence_id: reporting.reports.diagnostic.occurrence_id,
     fingerprint: reporting.reports.diagnostic.fingerprint,
   });
diff --git a/libs/shared/domain/failures/src/report-failure.test.ts b/libs/shared/domain/failures/src/report-failure.test.ts
index fc4938c9b..73870ff56 100644
--- a/libs/shared/domain/failures/src/report-failure.test.ts
+++ b/libs/shared/domain/failures/src/report-failure.test.ts
@@ -1,23 +1,24 @@
 import Ajv2020 from 'ajv/dist/2020';
-import { createRedactionPolicy, defineException, toReports } from 'application-exception';
-import diagnosticSchema from 'application-exception/schemas/diagnostic-report-v5.json';
+import { defineException, makeRedactionPolicy, makeReportPair } from 'application-exception';
+import diagnosticSchema from 'application-exception/schemas/diagnostic-report-v6.json';
 import publicSchema from 'application-exception/schemas/public-report-v4.json';
 import { expect, test } from 'bun:test';

 import {
   createFailureRedaction,
   FAILURE_REPORT_LIMITS,
+  FAILURE_REPORT_MAX_BYTES,
   reportFailure,
   SENSITIVE_KEYS,
 } from './report-failure';

 test('bounds the whole report and refuses to run the caught value', () => {
   expect(FAILURE_REPORT_LIMITS).toEqual({
-    maxReportSize: 32_768,
     maxDepth: 4,
     maxChildren: 16,
     inspection: 'no-invoke',
   });
+  expect(FAILURE_REPORT_MAX_BYTES).toBe(32_768);
 });

 test('names every property both reports skip', () => {
@@ -39,8 +40,8 @@ test('skips a sensitive property whatever its capitalisation', () => {
   const failure = new Error('header rejected');
   Object.assign(failure, { Authorization: 'Bearer live-token', password: 'p' });
   const redact = createFailureRedaction([]);
-  const { diagnostic } = toReports(failure, {
-    diagnostic: { redact, corj: FAILURE_REPORT_LIMITS },
+  const { diagnostic } = makeReportPair(failure, {
+    diagnostic: { redact, corj: FAILURE_REPORT_LIMITS, maxReportBytes: FAILURE_REPORT_MAX_BYTES },
     public: { redact, corj: FAILURE_REPORT_LIMITS },
   });

@@ -49,8 +50,13 @@ test('skips a sensitive property whatever its capitalisation', () => {

 test('scrubs a caller-owned secret from message and stack, not only from its property', () => {
   const redact = createFailureRedaction(['hunter2']);
-  const { diagnostic } = toReports(new Error('token was hunter2'), {
-    diagnostic: { redact, context: { note: 'hunter2' }, corj: FAILURE_REPORT_LIMITS },
+  const { diagnostic } = makeReportPair(new Error('token was hunter2'), {
+    diagnostic: {
+      redact,
+      context: { note: 'hunter2' },
+      corj: FAILURE_REPORT_LIMITS,
+      maxReportBytes: FAILURE_REPORT_MAX_BYTES,
+    },
     public: { redact, corj: FAILURE_REPORT_LIMITS },
   });

@@ -61,8 +67,8 @@ test('scrubs a caller-owned secret from message and stack, not only from its pro
 test('treats a secret as literal text, not as a pattern', () => {
   const secret = 'a.b*c+(d)[e]';
   const redact = createFailureRedaction([secret]);
-  const { diagnostic } = toReports(new Error(`leaked ${secret} here`), {
-    diagnostic: { redact, corj: FAILURE_REPORT_LIMITS },
+  const { diagnostic } = makeReportPair(new Error(`leaked ${secret} here`), {
+    diagnostic: { redact, corj: FAILURE_REPORT_LIMITS, maxReportBytes: FAILURE_REPORT_MAX_BYTES },
     public: { redact, corj: FAILURE_REPORT_LIMITS },
   });

@@ -73,8 +79,8 @@ test('an empty secret list leaves the key rules in force', () => {
   const failure = new Error('x');
   Object.assign(failure, { cookie: 'a=b' });
   const redact = createFailureRedaction([]);
-  const { diagnostic } = toReports(failure, {
-    diagnostic: { redact, corj: FAILURE_REPORT_LIMITS },
+  const { diagnostic } = makeReportPair(failure, {
+    diagnostic: { redact, corj: FAILURE_REPORT_LIMITS, maxReportBytes: FAILURE_REPORT_MAX_BYTES },
     public: { redact, corj: FAILURE_REPORT_LIMITS },
   });

@@ -87,7 +93,7 @@ const SignInFailed = defineException({
   public: {
     code: 'SIGN_IN_FAILED',
     message: 'Sign-in failed.',
-    details: ({ user }) => ({ user }),
+    detailsSelector: ({ user }) => ({ user }),
   },
 });

@@ -257,9 +263,9 @@ test('drops the context whole when the report is over budget', () => {
 test('drops the reporting errors after the context when both cannot fit', () => {
   // A policy that throws is the only way to make reporting errors under `no-invoke`; it is a
   // test fixture, never a production policy.
-  const throwing = createRedactionPolicy({
+  const throwing = makeRedactionPolicy({
     transform: (value, context) => {
-      if (context.key === 'as_json') throw new Error('nope');
+      if (context.reportKey === 'as_json') throw new Error('nope');
       return value;
     },
   });
diff --git a/libs/wbs/adapters/observability/src/logger.test.ts b/libs/wbs/adapters/observability/src/logger.test.ts
index ea43f5b71..a5d7a4a6a 100644
--- a/libs/wbs/adapters/observability/src/logger.test.ts
+++ b/libs/wbs/adapters/observability/src/logger.test.ts
@@ -117,7 +117,7 @@ describe('createLogger', () => {

     const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
     const failure = parsed.err as { occurrence_id: string; fingerprint?: string; v: string };
-    expect(failure.v).toBe('corj/v0.14');
+    expect(failure.v).toBe('corj/v0.15');
     expect(failure.occurrence_id).toMatch(/^AE_/);
     expect(failure.fingerprint).toMatch(/^fp1_/);
     expect(parsed.request_id).toBe('req-9');
@@ -193,6 +193,22 @@ describe('createLogger', () => {
     expect(() => parseOrThrow(LogRecord, publicReport)).toThrow(/\^corj\//);
   });

+  it('accepts a failure record written before the report format moved', () => {
+    const olderRecord = {
+      level: 'error',
+      time: 1,
+      msg: 'operation failed',
+      service: 'be-01',
+      err: {
+        v: 'corj/v0.14',
+        occurrence_id: 'AE_1',
+        fingerprint: 'fp1_00000000000000000000000000000000',
+        stack: ['Error: stored before the move'],
+      },
+    };
+    expect(parseOrThrow(LogRecord, olderRecord).err).toMatchObject({ v: 'corj/v0.14' });
+  });
+
   it('refuses a reporting loss that names no reason', () => {
     const halfLoss = {
       level: 'error',
diff --git a/libs/wbs/adapters/observability/src/serializers.test.ts b/libs/wbs/adapters/observability/src/serializers.test.ts
index e557a93c0..bc33d06a4 100644
--- a/libs/wbs/adapters/observability/src/serializers.test.ts
+++ b/libs/wbs/adapters/observability/src/serializers.test.ts
@@ -17,7 +17,7 @@ describe('createFailureSerializer', () => {
     const record = serialize(new Error('db unavailable')) as Record<string, unknown>;
     expect(record['occurrence_id']).toMatch(/^AE_/);
     expect(record['fingerprint']).toMatch(/^fp1_/);
-    expect(record['v']).toBe('corj/v0.14');
+    expect(record['v']).toBe('corj/v0.15');
     expect(JSON.stringify(record)).toContain('db unavailable');
   });

@@ -34,7 +34,7 @@ describe('createFailureSerializer', () => {

   it('never writes the public report in place of the diagnostic one', () => {
     const record = serialize(new Error('db unavailable')) as Record<string, unknown>;
-    expect(record['v']).toBe('corj/v0.14');
+    expect(record['v']).toBe('corj/v0.15');
     expect(record['code']).toBeUndefined();
     expect(JSON.stringify(record)).not.toContain('Something went wrong');
   });
@@ -79,7 +79,7 @@ describe('createFailureSerializer', () => {
     });
     const record = serialize(hostile) as Record<string, unknown>;
     expect(accessorRuns).toBe(0);
-    expect(record['v']).toBe('corj/v0.14');
+    expect(record['v']).toBe('corj/v0.15');
   });

   it('keeps a genuine reporting loss from the shared module', () => {
diff --git a/tools/tool-devsync/src/toolchain-pins.test.ts b/tools/tool-devsync/src/toolchain-pins.test.ts
index 1891df299..7b1c52e00 100644
--- a/tools/tool-devsync/src/toolchain-pins.test.ts
+++ b/tools/tool-devsync/src/toolchain-pins.test.ts
@@ -504,8 +504,8 @@ describe('the CI gate scope', () => {
  */
 const OWNER_PACKAGES = {
   'di-bag': '0.4.0',
-  'application-exception': '0.5.0',
-  'caught-object-report-json': '11.0.1',
+  'application-exception': '0.7.0',
+  'caught-object-report-json': '13.0.0',
 } as const;

 // Proof: `"di-bag": "^0.4.0"` failed `are pinned to exact versions in the root manifest` on the
@@ -540,6 +540,30 @@ describe('the owner-maintained libraries', () => {
         );
       return entry === null ? [] : [`${entry[1]}@${entry[2]}`];
     });
-    expect(copies).toEqual(['caught-object-report-json@11.0.1']);
+    expect(copies).toEqual(['caught-object-report-json@13.0.0']);
+  });
+
+  /**
+   * What the runtime loads, which the lock keys above cannot say.
+   *
+   * application-exception builds its reports with the copy of the report library it resolves
+   * itself. A second copy beside it — nested under `node_modules/application-exception`, left
+   * behind by an install over an older tree, or installed because the two pins stopped agreeing
+   * — writes the operator's reports in that copy's format while this repository's own imports
+   * load the other. So both resolutions must land on the same file, and that file's package must
+   * be the pinned version.
+   *
+   * Nx keys this suite's cache on `bun.lock`, not on `node_modules`, which it cannot hash: an
+   * installed tree that drifts without a lockfile change is seen by an uncached run and by every
+   * fresh install, not by a cached answer.
+   */
+  it('installs one copy of the report library, the one application-exception loads', () => {
+    const fromRoot = createRequire(new URL('package.json', WORKSPACE));
+    const rootCopy = fromRoot.resolve('caught-object-report-json/package.json');
+    const fromApplicationException = createRequire(fromRoot.resolve('application-exception'));
+    const loadedCopy = fromApplicationException.resolve('caught-object-report-json/package.json');
+    expect(loadedCopy).toBe(rootCopy);
+    const { version } = fromRoot(rootCopy) as { version: string };
+    expect(version).toBe(OWNER_PACKAGES['caught-object-report-json']);
   });
 });
```

### 7.3 The production side — slice 2

```diff
diff --git a/apps/wbs/fe-01/e2e/browser-packages-probe.ts b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
index 6ae18d1d2..b5a3018ac 100644
--- a/apps/wbs/fe-01/e2e/browser-packages-probe.ts
+++ b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
@@ -1,5 +1,5 @@
-import { createRedactionPolicy, defineException, toReports } from 'application-exception';
-import { makeCorj } from 'caught-object-report-json';
+import { defineException, makeRedactionPolicy, makeReportPair } from 'application-exception';
+import { Corj } from 'caught-object-report-json';
 import { DiBag } from 'di-bag';

 /**
@@ -18,11 +18,11 @@ export interface BrowserPackagesProof {
   readonly reportVersion: string | undefined;
 }

-/** One options bag, built once, as the adoption plan's reporting contract requires. */
-const REPORT_LIMITS = { maxReportSize: 32_768, maxDepth: 4, maxChildren: 16 } as const;
+/** The inspection limits both reports take; the byte budget is the diagnostic report's alone. */
+const REPORT_LIMITS = { maxDepth: 4, maxChildren: 16 } as const;

 /** The one secret this probe owns, scrubbed wherever its text appears in either report. */
-const redact = createRedactionPolicy({ patterns: [/probe-secret/g] });
+const redact = makeRedactionPolicy({ patterns: [/probe-secret/g] });

 const ProbeFailed = defineException({
   tag: 'probe/ProbeFailed',
@@ -37,7 +37,7 @@ const ProbeFailed = defineException({
  * Every call here is one the adoption plan says browser code must be able to make:
  * `fromSyncFactory` and `fromAsyncFactory` fix the acquisition mode by name, so the
  * graph needs no `process.getBuiltinModule` classifier — a browser has none — and one
- * `toReports` call correlates the operator's report with the disclosed one under a
+ * `makeReportPair` call correlates the operator's report with the disclosed one under a
  * single occurrence identifier.
  *
  * @returns What the run observed, for an assertion made outside the page.
@@ -61,8 +61,8 @@ async function proveTheThreeLibraries(): Promise<BrowserPackagesProof> {
   await services.close();

   const options = { corj: REPORT_LIMITS, redact } as const;
-  const reports = toReports(new ProbeFailed({ details: { step: 'probe-secret' } }), {
-    diagnostic: options,
+  const reports = makeReportPair(new ProbeFailed({ details: { step: 'probe-secret' } }), {
+    diagnostic: { ...options, maxReportBytes: 32_768 },
     public: options,
   });

@@ -72,7 +72,7 @@ async function proveTheThreeLibraries(): Promise<BrowserPackagesProof> {
     correlated: reports.diagnostic.occurrence_id === reports.public.occurrence_id,
     publicCode: reports.public.code,
     disclosesTheSecret: JSON.stringify(reports).includes('probe-secret'),
-    reportVersion: makeCorj('a plain string', { maxReportSize: 1024 }).v,
+    reportVersion: Corj.makeReport('a plain string', { maxReportSize: 1024 }).v,
   };
 }

diff --git a/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts b/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts
index d0f6bb736..00be69dba 100644
--- a/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts
+++ b/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts
@@ -8,8 +8,8 @@ import { createFailureRedaction, reportFailure } from '@shared/failures';
  * pattern rule. The key rules of `@shared/failures` are still in force — an `authorization`
  * property on a caught fetch failure is skipped whatever this list says.
  *
- * A module constant because the library caches one report maker per policy; building one per
- * caught fault would throw that cache away on the one path that is already in trouble.
+ * A module constant because building a policy is work a caught fault should not repeat on the
+ * one path that is already in trouble.
  */
 const FAULT_REDACTION = createFailureRedaction([]);

diff --git a/bun.lock b/bun.lock
index 60be3e0dd..b20f8f60d 100644
--- a/bun.lock
+++ b/bun.lock
@@ -19,9 +19,9 @@
         "@sinclair/typebox": "^0.34.52",
         "@tanstack/react-router": "^1.170.24",
         "ajv": "8.20.0",
-        "application-exception": "0.5.0",
+        "application-exception": "0.7.0",
         "arktype": "^2.2.3",
-        "caught-object-report-json": "11.0.1",
+        "caught-object-report-json": "13.0.0",
         "di-bag": "0.4.0",
         "drizzle-orm": "1.0.0-rc.4",
         "elysia": "^1.4.30",
@@ -1086,7 +1086,7 @@

     "ansi-styles": ["ansi-styles@4.3.0", "", { "dependencies": { "color-convert": "^2.0.1" } }, "sha512-zbB9rCJAT1rbjiVDb2hqKFHNYLxgtk8NURxZ3IZwD3F6NtxbXZQCnnSi1Lkx+IDohdPlFp222wVALIheZJQSEg=="],

-    "application-exception": ["application-exception@0.5.0", "", { "dependencies": { "caught-object-report-json": "^11.0.1", "nanoid": "^3.3.19" } }, "sha512-pjmlVJQd2rNCkrnPJs6deMi8K0ad9qo9SR2/X2fJYudE6yadIBOHZcwPFUFXaRV+0PyiZgvVuiDFsWYWh8iYdQ=="],
+    "application-exception": ["application-exception@0.7.0", "", { "dependencies": { "caught-object-report-json": "^13.0.0", "nanoid": "^3.3.19" } }, "sha512-kxx0XcOZ2wDcW1/G/s9izPg5ESzuD2SzqAdbZ8wCVMibsGd9IRTvFBZYIi1Z3QGMnJJo41IGQ9/3dqJQ9j9RWA=="],

     "are-docs-informative": ["are-docs-informative@0.1.1", "", {}, "sha512-sqRsNQBwbKLRX0jV5Cu5uzmtflf892n4Vukz7T659ebL4pz3mpOqCMU7lxMoBTFwnp10E3YB5ZcyHM41W5bcDA=="],

@@ -1190,7 +1190,7 @@

     "caniuse-lite": ["caniuse-lite@1.0.30001810", "", {}, "sha512-TITQPUkaz+aVk5GL6NhOdwk1aEaNTSDPsGFWrTuhKGtjTF70jL/Oht2W4c6rXUe5fu7Ie19VIahAXHIIiWWNeg=="],

-    "caught-object-report-json": ["caught-object-report-json@11.0.1", "", {}, "sha512-95Q1AatJ9MbyboeN3fSXcfc2RAwg22r3LLHODDjiviAI7Myh612Kf0vDGqnMFwNNUWSgzBC+Yz3yvnHtY8qtng=="],
+    "caught-object-report-json": ["caught-object-report-json@13.0.0", "", {}, "sha512-iH0UiWMMlAcNWcCQUFH/fEexacjojkd2eXvVG/czarM7MsFLOKeTcmbZPa6X8aWtJh/EhmvstlKeEjfF5L+hAQ=="],

     "ccount": ["ccount@2.0.1", "", {}, "sha512-eyrF0jiFpY+3drT6383f1qhkbGsLSifNAjA61IUjZjmLCWjItY6LB9ft9YhoDgwfmclB2zhu51Lc7+95b8NRAg=="],

diff --git a/libs/shared/domain/failures/README.md b/libs/shared/domain/failures/README.md
index e95151536..7a24302ec 100644
--- a/libs/shared/domain/failures/README.md
+++ b/libs/shared/domain/failures/README.md
@@ -29,11 +29,14 @@ operation.

 ## Landmines

-- The options bag and each caller's policy are long-lived values. Rebuilding
-  either per report discards the reporting library's cached report maker.
+- The limits and each caller's policy are long-lived values, built once.
+  application-exception 0.7.0 snapshots its option bags on every call and
+  caches no report maker, so building them once is about doing the work once,
+  not about a cache.
 - Key matching is case-insensitive because HTTP header names arrive with
   varying capitalisation.
-- The report-size limit includes context and reporting errors. Truncation and
+- The report-size limit, `FAILURE_REPORT_MAX_BYTES`, bounds the diagnostic
+  report only, context and reporting errors included. Truncation and
   omission markers are part of the report rather than a second JSON slicing
   pass.
 - Unit and type checks here do not prove browser execution. This library makes
diff --git a/libs/shared/domain/failures/src/index.ts b/libs/shared/domain/failures/src/index.ts
index ef7b77f60..f0615794f 100644
--- a/libs/shared/domain/failures/src/index.ts
+++ b/libs/shared/domain/failures/src/index.ts
@@ -1,6 +1,7 @@
 export {
   createFailureRedaction,
   FAILURE_REPORT_LIMITS,
+  FAILURE_REPORT_MAX_BYTES,
   type FailureReporting,
   reportFailure,
   SENSITIVE_KEYS,
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
index 5069d6eeb..f4820d598 100644
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -1,31 +1,24 @@
 import {
-  type AppexCorjOptions,
-  type CapturedReports,
-  createRedactionPolicy,
+  makeRedactionPolicy,
+  makeReportPair,
+  type PublicReportCorjOptions,
   type RedactionPolicy,
-  toReports,
+  type ReportPair,
 } from 'application-exception';

 /**
- * The one options bag every reporting call in this repository shares. It is a module constant
- * because the library caches one report maker per options object; building it per call throws
- * that cache away.
+ * The inspection limits every reporting call in this repository shares, for both reports.
  *
- * `maxReportSize` bounds the whole compact diagnostic report in UTF-8 bytes — `occurrence_id`,
- * `fingerprint`, `context` and `reporting_errors` included. Over budget the library drops
- * `context` whole and records `context_omitted: 'max_size'`, then drops `reporting_errors` and
- * records `reporting_errors_omitted`, and only then trims error content; `occurrence_id`,
- * `fingerprint` and `v` are never trimmed. A context that is merely large is truncated instead,
- * by the library's own 16 KiB context cap, and leaves `context_omitted` absent. `maxDepth` stops
- * the cause walk and marks the deepest child `children_omitted: 'max_depth'`; `maxChildren`
- * marks the root `children_omitted: 'max_children'`. `inspection: 'no-invoke'` is what keeps a
- * throwing getter from running while a failure is being reported: such a property is reported as
- * `'[not-inspected]'`.
+ * The type is the public bag's, the narrower of the two: application-exception refuses a public
+ * `corj` bag that carries anything but `inspection`, `maxDepth`, `maxChildren`, `childrenSources`,
+ * `fingerprintParts` and `onReportingError`, and every one of those is also a diagnostic option.
+ * `maxDepth` stops the cause walk and marks the deepest child `children_omitted: 'max_depth'`;
+ * `maxChildren` marks the root `children_omitted: 'max_children'`. `inspection: 'no-invoke'` is
+ * what keeps a throwing getter from running while a failure is being reported: such a property is
+ * reported as `'[not-inspected]'`. The library snapshots the bag on every call and caches nothing,
+ * so a module constant is a single source of the limits, not a cache key.
  */
-export const FAILURE_REPORT_LIMITS: AppexCorjOptions = {
-  // Proof: removing the byte budget left `truncated` undefined in the
-  // long-Unicode-message test (2026-09-20).
-  maxReportSize: 32_768,
+export const FAILURE_REPORT_LIMITS: PublicReportCorjOptions = {
   // Proof: removing the depth limit left `children_omitted` undefined instead of
   // `max_depth` on the deepest child (2026-09-20).
   maxDepth: 4,
@@ -37,6 +30,19 @@ export const FAILURE_REPORT_LIMITS: AppexCorjOptions = {
   inspection: 'no-invoke',
 };

+/**
+ * The whole compact diagnostic report's budget in UTF-8 bytes — `occurrence_id`, `fingerprint`,
+ * `context` and `reporting_errors` included.
+ *
+ * Over budget the library drops `context` whole and records `context_omitted: 'max_size'`, then
+ * drops `reporting_errors` and records `reporting_errors_omitted`, and only then trims error
+ * content; `occurrence_id`, `fingerprint` and `v` are never trimmed. A context that is merely
+ * large is truncated instead, by the library's own 16 KiB context cap, and leaves
+ * `context_omitted` absent. The public report takes no byte budget: application-exception bounds
+ * its message and selected details by its own fixed caps.
+ */
+export const FAILURE_REPORT_MAX_BYTES = 32_768;
+
 /**
  * Property names skipped in both reports, at any depth, whatever their capitalisation.
  *
@@ -79,19 +85,19 @@ const SENSITIVE_KEY_PATTERNS = SENSITIVE_KEYS.map(
 /**
  * A redaction policy over the secrets the calling boundary owns, for both reports of a failure.
  *
- * Build it once at startup and share it: the library caches one report maker per policy. Pass
- * only the secrets the caller actually holds — never a whole configuration, request or
- * environment object, because a secret nobody named cannot be detected. An empty list is correct
- * where the caller owns no secret, and leaves the key rules in force. The policy applies to the
- * public report as well, and it sees only what a kind's disclosure selector returned, so a
- * mistaken selector cannot get past it.
+ * Build it once at startup and share it: compiling the caller's secrets into patterns is work a
+ * report should not repeat. Pass only the secrets the caller actually holds — never a whole
+ * configuration, request or environment object, because a secret nobody named cannot be detected.
+ * An empty list is correct where the caller owns no secret, and leaves the key rules in force. The
+ * policy applies to the public report as well, and it sees only what a kind's disclosure selector
+ * returned, so a mistaken selector cannot get past it.
  *
  * @param secrets Secret values to scrub from messages, stacks, `as_string`, `as_json`, `context`
  *   and `reporting_errors` wherever they appear. Empty strings are ignored.
  * @returns A reusable policy accepted as `redact` by both reports.
  */
 export function createFailureRedaction(secrets: readonly string[]): RedactionPolicy {
-  return createRedactionPolicy({
+  return makeRedactionPolicy({
     // Proof: replacing the key patterns with [] exposed `Bearer live-token` in the
     // capitalisation test (2026-09-20).
     keys: SENSITIVE_KEY_PATTERNS,
@@ -110,7 +116,7 @@ export function createFailureRedaction(secrets: readonly string[]): RedactionPol
  * original failure is unchanged and still the caller's to handle.
  */
 export type FailureReporting =
-  | { readonly reported: true; readonly reports: CapturedReports }
+  | { readonly reported: true; readonly reports: ReportPair }
   | { readonly reported: false; readonly occurrenceId: string; readonly reason: string };

 /** Losses in this process, so two of them never share a correlation handle. */
@@ -120,13 +126,14 @@ let unreportedFailures = 0;
  * Report one caught value to both audiences under this repository's limits and the caller's
  * policy, without ever throwing.
  *
- * One `toReports` call resolves the occurrence id once and shares it, so the operator's record
- * and the answer given to a user or an agent correlate even for a thrown primitive. The same
- * policy and the same limits go to both bags, so the public report is redacted too. Reporting can
- * still fail — a revoked `Proxy` as a cause makes the library throw — and a boundary that is
- * already handling a failure must not be handed a second one, so that outcome comes back as
- * `reported: false` with a local handle and a fixed reason. The reporter is not called again, and
- * nothing is read off the caught value afterwards: reading it is what threw.
+ * One `makeReportPair` call resolves the occurrence id once and shares it, so the operator's record
+ * and the answer given to a user or an agent correlate even for a thrown primitive. The same policy
+ * and the same inspection limits go to both bags, so the public report is redacted too; the byte
+ * budget is the diagnostic report's alone. Reporting can still fail — a revoked `Proxy` as a cause
+ * makes the library throw (caught-object-report-json issue 217, still open on 13.0.0) — and a
+ * boundary that is already handling a failure must not be handed a second one, so that outcome
+ * comes back as `reported: false` with a local handle and a fixed reason. The reporter is not
+ * called again, and nothing is read off the caught value afterwards: reading it is what threw.
  *
  * @param caught The value that was thrown. Any value, including primitives, `null` and hostile
  *   objects.
@@ -148,8 +155,12 @@ export function reportFailure(
       // in the public-details test (2026-09-20).
       // Proof: splitting this shared call produced two different `AE_…` ids in the
       // primitive-correlation test (2026-09-20).
-      reports: toReports(caught, {
-        diagnostic: { ...bag, context: options.context },
+      reports: makeReportPair(caught, {
+        diagnostic: {
+          ...bag,
+          maxReportBytes: FAILURE_REPORT_MAX_BYTES,
+          context: options.context,
+        },
         public: bag,
       }),
     };
diff --git a/libs/wbs/adapters/observability/src/logger.ts b/libs/wbs/adapters/observability/src/logger.ts
index 94dcc44c0..cd7916389 100644
--- a/libs/wbs/adapters/observability/src/logger.ts
+++ b/libs/wbs/adapters/observability/src/logger.ts
@@ -23,8 +23,8 @@ export interface CreateLoggerOptions {

 export function createLogger(opts: CreateLoggerOptions): Logger {
   const level = opts.level ?? process.env['LOG_LEVEL'] ?? 'info';
-  // One policy per logger, built once: `@shared/failures` caches one report maker per policy,
-  // and a policy rebuilt per record would throw that cache away on every failure.
+  // One policy per logger, built once: compiling the caller's secrets into patterns is work no
+  // failure record should repeat.
   const redact = createFailureRedaction(opts.secrets ?? []);
   const base: Record<string, unknown> = { service: opts.service };
   if (opts.version) base['version'] = opts.version;
diff --git a/openspec/changes/migrate-report-libraries/tasks.md b/openspec/changes/migrate-report-libraries/tasks.md
index 01d9bbde2..111f7fe57 100644
--- a/openspec/changes/migrate-report-libraries/tasks.md
+++ b/openspec/changes/migrate-report-libraries/tasks.md
@@ -4,7 +4,7 @@

 ## 2. Move the two report libraries together

-- [ ] 2.1 Move the report library to 13.0.0 and application-exception to 0.7.0 in one lockfile
+- [x] 2.1 Move the report library to 13.0.0 and application-exception to 0.7.0 in one lockfile
       edit, adapt `@shared/failures` and every caller of a renamed API, and move the version
       literals the boundary tests assert — test: the pins suite, `shared-failures`,
       `wbs-observability`, the backend, gateway and MCP boundary tests, the frontend fault
diff --git a/package.json b/package.json
index e23aa9625..150f2683d 100644
--- a/package.json
+++ b/package.json
@@ -43,9 +43,9 @@
     "@sinclair/typebox": "^0.34.52",
     "@tanstack/react-router": "^1.170.24",
     "ajv": "8.20.0",
-    "application-exception": "0.5.0",
+    "application-exception": "0.7.0",
     "arktype": "^2.2.3",
-    "caught-object-report-json": "11.0.1",
+    "caught-object-report-json": "13.0.0",
     "di-bag": "0.4.0",
     "drizzle-orm": "1.0.0-rc.4",
     "elysia": "^1.4.30",
```

### 7.4 Task 3.1 — slice 3

```diff
diff --git a/openspec/changes/migrate-report-libraries/tasks.md b/openspec/changes/migrate-report-libraries/tasks.md
index 111f7fe57..cc7e3e0eb 100644
--- a/openspec/changes/migrate-report-libraries/tasks.md
+++ b/openspec/changes/migrate-report-libraries/tasks.md
@@ -13,7 +13,7 @@

 ## 3. Negatives

-- [ ] 3.1 Prove the one-copy check, the moved byte budget and the log schema's acceptance of an
+- [x] 3.1 Prove the one-copy check, the moved byte budget and the log schema's acceptance of an
       older record — test: the named tests; negative: a copy nested under application-exception,
       the installed copy's version edited, the byte budget dropped from the diagnostic bag, and
       the schema narrowed to the current version, each also run with its clause disabled
```

### 7.5 The records and task 3.2 — slice 4

```diff
diff --git a/docs/superpowers/plans/2026-09-17-personal-package-adoption.md b/docs/superpowers/plans/2026-09-17-personal-package-adoption.md
index e39368b88..16955f813 100644
--- a/docs/superpowers/plans/2026-09-17-personal-package-adoption.md
+++ b/docs/superpowers/plans/2026-09-17-personal-package-adoption.md
@@ -12,6 +12,28 @@

 **Status:** Proposed plan, requested on 2026-09-17; implementation has not started. “All projects” means complete coverage by role, including explicit dispositions where a package does not apply. User scope amendment: do not adopt DI Bag in the React frontend for now; retain frontend reporting work. Other proposed designs remain subject to review.

+## Amendment, 2026-09-25: the report libraries moved together
+
+Work item 140.1–140.2 (OpenSpec change `migrate-report-libraries`) moved
+`caught-object-report-json` from 11.0.1 to 13.0.0 and `application-exception` from 0.5.0 to
+0.7.0 in one step. Where this and the 2026-09-19 amendment below disagree, this one holds.
+
+- **The two move together or not at all.** application-exception 0.5.0 depends on the report
+  library at `^11.0.1`, 0.6.0 at `^12.0.0`, 0.7.0 at `^13.0.0`. Moving the report library alone
+  installed a nested 11.0.1 copy under application-exception. The pins suite now proves that the
+  root and application-exception resolve one installed copy.
+- **Renamed API.** `toReports` is `makeReportPair`, `createRedactionPolicy` is
+  `makeRedactionPolicy`, `CapturedReports` is `ReportPair`, a public policy's `details` is
+  `detailsSelector`, and a redaction context's `key` is `reportKey`. The byte budget left the
+  `corj` bag: it is the diagnostic bag's top-level `maxReportBytes`
+  (`FAILURE_REPORT_MAX_BYTES`), and the public bag takes none.
+- **No maker cache.** application-exception 0.7.0 snapshots its option bags on every call.
+  "Build options once" still holds, but no longer because of a cache.
+- **Report format `corj/v0.15`.** Reporting-error rows name `reportKey` and `sourceProperty`.
+  Fingerprints are unchanged, and the log schema accepts records of any `corj/` version.
+- **The wrapper is still required.** A revoked Proxy as a cause still makes reporting throw on
+  13.0.0; the report library's issue 217 is open.
+
 ## Amendment, 2026-09-19: read before executing

 This plan was written against older package versions and an older scope. It is kept as the
diff --git a/openspec/changes/adopt-failure-reporting/design.md b/openspec/changes/adopt-failure-reporting/design.md
index 32443d957..4378e5277 100644
--- a/openspec/changes/adopt-failure-reporting/design.md
+++ b/openspec/changes/adopt-failure-reporting/design.md
@@ -12,6 +12,8 @@ The three installed reporting libraries already produce diagnostic and public re

 The report options and each caller's redaction policy are constants. The library caches one report maker per options object and policy, so rebuilding either for every call discards that cache.

+Amended 2026-09-25 by `migrate-report-libraries`: application-exception 0.7.0 caches no report maker and snapshots its option bags on every call. The options and the policy stay constants, as the single source of the limits and a policy compiled once.
+
 `SENSITIVE_KEYS` remains a readable string list, but the builder compiles every name into an anchored case-insensitive pattern. Measured string-key matching is case-sensitive while HTTP header names arrive capitalised; anchoring prevents a sensitive name from matching an unrelated substring.

 The loss branch creates a local `UNREPORTED_<n>` correlation handle instead of reading an occurrence identifier from the caught value. Reading the hostile value is what can make reporting throw, and separate losses must remain distinguishable.
diff --git a/openspec/changes/migrate-report-libraries/tasks.md b/openspec/changes/migrate-report-libraries/tasks.md
index cc7e3e0eb..acdf4e097 100644
--- a/openspec/changes/migrate-report-libraries/tasks.md
+++ b/openspec/changes/migrate-report-libraries/tasks.md
@@ -17,5 +17,5 @@
       older record — test: the named tests; negative: a copy nested under application-exception,
       the installed copy's version edited, the byte budget dropped from the diagnostic bag, and
       the schema narrowed to the current version, each also run with its clause disabled
-- [ ] 3.2 Observe again, on the new versions, every fault the `@shared/failures` proofs name —
+- [x] 3.2 Observe again, on the new versions, every fault the `@shared/failures` proofs name —
       test: the named `report-failure.test.ts` cases; negative: each proof's own fault
```

## 8. Proofs

Every fault below was injected for real in the rehearsal on 2026-09-25, on the rehearsal commit of
the slice before the one that owns it, its named test watched failing, the file restored and
compared, the test rerun green, before the next fault. The executor repeats each and writes a
`Proof:` comment **only after observing its own failure**, dated with its own observed date
(`date -u +%F`). Each slice runs **all** of its faults first and writes its comments afterwards, so
every fault patch still applies.

**Applying a fault patch** always uses `git apply --unidiff-zero`: each hunk replaces whole lines it
names, and `git apply` finds them at an offset when a comment of unknown length sits above them
(section 9.1's `fill=1` proves that for slice 4's patches).

**Each slice's git faults are records of four lines** — id, file (from the root), the directory
the test runs in, and the exact `-t` title — in the first `text` block of that slice's subsection.
Bun's `-t` matches describe names and title joined; the titles below are the bare test titles,
unanchored, and each matches exactly one test (the first block proves it). Extract them:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-25-batch-7/140-1-2-report-libraries-migration.md
section=8.1 # 8.1 for slice 3, 8.2 for slice 4
test -f "$packet"
awk -v want="### $section " '
  index($0, want) == 1 { s=1; next }
  s && /^```text$/ { c=1; next }
  c && /^```$/ { exit }
  c { print }
' "$packet" > "$TMPDIR/proofs.txt"
test -s "$TMPDIR/proofs.txt"
test $(( $(wc -l < "$TMPDIR/proofs.txt") % 4 )) -eq 0
wc -l < "$TMPDIR/proofs.txt"
````

Expected: 8 lines for slice 3 (`b1`, `s1`) and 36 for slice 4.

**First, prove every filter selects exactly one test:**

```sh
set -euo pipefail
while IFS= read -r id && IFS= read -r file && IFS= read -r dir && IFS= read -r title; do
  out=$(cd "$dir" && env -u CLAUDECODE -u AGENT bun test ./src -t "$title" 2>&1 < /dev/null)
  if n=$(grep -cE '^\(pass\) ' <<< "$out"); then :; else rc=$?; test "$rc" -eq 1; fi
  printf '%s %s matched | %s\n' "$id" "$n" "$title"
  test "$n" -eq 1
done < "$TMPDIR/proofs.txt"
```

Expected: one `<id> 1 matched` line per record. Slice 4's r1 and r2 share a test: both lines say
`1 matched`. A `0` is a stop.

**Then every git fault, in order** — save the passing bytes, inject, save the patch, run the named
test, restore, compare, and only then assert; then rerun it green:

```sh
set -euo pipefail
while IFS= read -r id && IFS= read -r file && IFS= read -r dir && IFS= read -r title; do
  test -f "$file"
  cp "$file" "$TMPDIR/$id.passing"
  git apply --unidiff-zero --check "$TMPDIR/mutations/$id.diff" < /dev/null
  git apply --unidiff-zero "$TMPDIR/mutations/$id.diff" < /dev/null
  if diff -u "$TMPDIR/$id.passing" "$file" > "$TMPDIR/evidence/$id.patch"
  then echo "$id: nothing was injected" >&2; exit 1; else test $? -eq 1; fi
  if (cd "$dir" && env -u CLAUDECODE -u AGENT bun test ./src -t "$title") \
    > "$TMPDIR/evidence/$id.log" 2>&1 < /dev/null
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/$id.log"
  if (cd "$dir" && env -u CLAUDECODE -u AGENT bun test ./src) \
    > "$TMPDIR/evidence/$id.all.log" 2>&1 < /dev/null
  then allstatus=0; else allstatus=$?; fi
  cp "$TMPDIR/$id.passing" "$file"
  cmp "$file" "$TMPDIR/$id.passing"
  test "$status" -eq 1
  test "$allstatus" -eq 1
  if (cd "$dir" && env -u CLAUDECODE -u AGENT bun test ./src -t "$title") \
    > "$TMPDIR/evidence/$id.green.log" 2>&1 < /dev/null
  then status=0; else status=$?; fi
  test "$status" -eq 0
  printf '%s | %s | all: %s\n' "$id" "$(grep -E '^ *[0-9]+ fail$' "$TMPDIR/evidence/$id.log")" \
    "$(grep -E '^ *[0-9]+ (pass|fail)$' "$TMPDIR/evidence/$id.all.log" | tr '\n' ' ')"
done < "$TMPDIR/proofs.txt"
```

Expected: one line per fault with the counts its table gives, and exit 0. The loop stops at the
first fault whose named test passes, **after** that file was restored and compared — then preamble
rule 20 applies. Every command reads `/dev/null`, so nothing consumes the records. Extra failing
tests are recorded, not a stop.

### 8.1 Slice 3 — the one-copy check, the budget and the older record

The records for `$TMPDIR/proofs.txt`:

```text
b1
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures
bounds a very long Unicode message and marks it truncated
s1
libs/wbs/adapters/observability/src/log-schema.ts
libs/wbs/adapters/observability
accepts a failure record written before the report format moved
```

**The two installed-tree faults come first**, by hand, because `node_modules` is not tracked and
no patch can carry them. Each is run with its clause in place and again with **its clause
disabled** (the `p1c` and `p2c` patches weaken exactly that assertion to a type check), because a
fault that another clause also catches proves neither (brief addendum, point 2).

**`node_modules` files are hard links into `~/.bun/install/cache`** and into every other install on
this host: the reviewer saw a link count of 114 on the installed 11.0.1 `package.json` in a fresh install. Mutate them
only with this block's `sed -i` (which writes a new file and breaks the link, checked by `stat -c
%h` right after it) and `cp -R`, **never with an editor tool, `cat >` or any other in-place
write** — that would rewrite the cached 13.0.0 manifest for every clone on the machine. The block
checks the cache's copy before and after. It refuses to start unless both files are clean, and a
`trap` restores both files and moves any nested copy aside on every exit. **A failure anywhere in
the block is a stop, not a rerun**: report it with the evidence directory as it stands.

```sh
set -euo pipefail
pins() {
  (cd tools/tool-devsync && env -u CLAUDECODE -u AGENT bun test --preload ../test/scratch/preload.ts \
    ./src/toolchain-pins.test.ts "$@") < /dev/null
}
nested=node_modules/application-exception/node_modules
manifest=node_modules/caught-object-report-json/package.json
test_file=tools/tool-devsync/src/toolchain-pins.test.ts
cache="$HOME/.bun/install/cache/caught-object-report-json@13.0.0@@@1/package.json"
test -f "$cache"
grep -h '"version"' "$cache" | tee "$TMPDIR/evidence/cache-before.txt"
grep -q '"version": "13.0.0"' "$cache"
# Clean state before the passing copies are saved: a mutated file must never become "passing".
test ! -e "$nested"
git diff --quiet -- "$test_file"
grep -q '"version": "13.0.0"' "$manifest"
cp "$test_file" "$TMPDIR/pins.passing"
cp "$manifest" "$TMPDIR/corj-manifest.passing"
restore() {
  rc=$?
  if [ -e "$nested" ]; then mv "$nested" "$(mktemp -d "$TMPDIR/p1-nested.XXXXXX")/"; fi
  cp "$TMPDIR/pins.passing" "$test_file"
  cp "$TMPDIR/corj-manifest.passing" "$manifest"
  exit "$rc"
}
trap restore EXIT
# p1: a second copy nested under application-exception.
mkdir -p "$nested"
cp -R node_modules/caught-object-report-json "$nested/"
if pins > "$TMPDIR/evidence/p1.log" 2>&1; then p1=0; else p1=$?; fi
# p1c: the same copy, with the same-file clause weakened.
git apply --unidiff-zero "$TMPDIR/mutations/p1c.diff"
if pins > "$TMPDIR/evidence/p1c.log" 2>&1; then p1c=0; else p1c=$?; fi
cp "$TMPDIR/pins.passing" "$test_file"
cmp "$test_file" "$TMPDIR/pins.passing"
mv "$nested" "$(mktemp -d "$TMPDIR/p1-nested.XXXXXX")/"
test ! -e "$nested"
# p2: the installed copy's own version edited, by sed -i only.
stat -c %h "$manifest" | tee "$TMPDIR/evidence/manifest-links-before.txt"
test "$(grep -c '"version": "13.0.0"' "$manifest")" -eq 1
sed -i 's/"version": "13.0.0"/"version": "12.9.9"/' "$manifest"
test "$(stat -c %h "$manifest")" -eq 1
grep -q '"version": "13.0.0"' "$cache"
if pins > "$TMPDIR/evidence/p2.log" 2>&1; then p2=0; else p2=$?; fi
# p2c: the same edit, with the version clause weakened.
git apply --unidiff-zero "$TMPDIR/mutations/p2c.diff"
if pins > "$TMPDIR/evidence/p2c.log" 2>&1; then p2c=0; else p2c=$?; fi
cp "$TMPDIR/pins.passing" "$test_file"
cp "$TMPDIR/corj-manifest.passing" "$manifest"
cmp "$test_file" "$TMPDIR/pins.passing"
cmp "$manifest" "$TMPDIR/corj-manifest.passing"
grep -h '"version"' "$cache" | tee "$TMPDIR/evidence/cache-after.txt"
grep -q '"version": "13.0.0"' "$cache"
echo "p1=$p1 p1c=$p1c p2=$p2 p2c=$p2c"
test "$p1" -eq 1
test "$p1c" -eq 0
test "$p2" -eq 1
test "$p2c" -eq 0
for id in p1 p1c p2 p2c; do
  printf '%s | %s\n' "$id" "$(grep -E '^\(fail\)|^ *[0-9]+ (pass|fail)$' "$TMPDIR/evidence/$id.log" | tr '\n' ' ')"
done
if pins > "$TMPDIR/evidence/p-green.log" 2>&1; then green=0; else green=$?; fi
test "$green" -eq 0
```

Expected, and rehearsed (round 2, 2026-09-25): the cache's `"version": "13.0.0",` before and after,
a link count above 1 before the edit (2: the cache's file and this clone's in the rehearsal's clone) and exactly 1 after it,
`p1=1 p1c=0 p2=1 p2c=0`, exit 0. The restore is a move of the nested directory into `$TMPDIR`
(nothing is deleted) and two byte copies, each compared; the `trap` repeats the copies on exit, the
same bytes.

| Id    | Fault                                                                                                 | Named test                                                                            | Observed                                                                                                                                                                                                                                               | Comment above                                                        |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `p1`  | `node_modules/caught-object-report-json` copied to `node_modules/application-exception/node_modules/` | pins › `installs one copy of the report library, the one application-exception loads` | `19 pass`, `1 fail`, that test only: `Expected: "<clone>/node_modules/caught-object-report-json/package.json"`, `Received: "<clone>/node_modules/application-exception/node_modules/caught-object-report-json/package.json"`; the lock-key test passed | `expect(loadedCopy).toBe(rootCopy);`                                 |
| `p1c` | `p1` with `p1c.diff` (that assertion → `toBeTypeOf('string')`)                                        | the whole pins file                                                                   | `20 pass`, `0 fail`: no other clause catches a nested copy                                                                                                                                                                                             | —                                                                    |
| `p2`  | the installed copy's `package.json` `"version": "13.0.0"` → `"12.9.9"`                                | the same test                                                                         | `19 pass`, `1 fail`: `Expected: "13.0.0"`, `Received: "12.9.9"`; the lock-key test passed (it reads `bun.lock`)                                                                                                                                        | `expect(version).toBe(OWNER_PACKAGES['caught-object-report-json']);` |
| `p2c` | `p2` with `p2c.diff` (that assertion → `toBeTypeOf('string')`)                                        | the whole pins file                                                                   | `20 pass`, `0 fail`                                                                                                                                                                                                                                    | —                                                                    |
| `b1`  | `maxReportBytes: FAILURE_REPORT_MAX_BYTES,` removed from `reportFailure`'s diagnostic bag             | failures › `bounds a very long Unicode message and marks it truncated`                | `0 pass`, `1 fail`, `Expected: true` `Received: undefined` (the library's 100,000-byte default applied); the whole file `16 pass`, `4 fail` — the three other budget tests                                                                             | `maxReportBytes: FAILURE_REPORT_MAX_BYTES,`                          |
| `s1`  | the log schema's `v: '/^corj\\//'` narrowed to `v: '/^corj\\/v0\\.15$/'`                              | observability › `accepts a failure record written before the report format moved`     | `0 pass`, `1 fail`: `ValidationError: … err.v must be matched by ^corj/v0\.15$ (was "corj/v0.14")`; the whole directory `28 pass`, `1 fail`                                                                                                            | `v: '/^corj\\//',`                                                   |

**Clause isolation for `b1` and `s1`.** Each fault _is_ its clause's removal or narrowing, so "the
fault with the clause disabled" is the fault itself. What the whole-file runs add: under `b1` only
the four tests that read the diagnostic budget fail, none of them through another clause (the
constant's own equality test still passes); under `s1` only the new test fails, and the existing
`refuses a public report where the schema expects a failure record` still passes, so narrowing
does not hide behind the refusal clause.

**The comments.** Written after all six runs, as `//` lines directly above the named line, dated
with the observed date, naming the fault and the fact observed. For example, as rehearsed:

```ts
// Proof: on <observed-date-p1>, a copy of the report library nested under application-exception
// failed this test on the two resolutions, `node_modules/application-exception/node_modules/…`
// received where the root copy was expected, while the lock-key test beside it passed; with this
// assertion weakened to a type check the same nested copy passed the whole suite.
```

`s1`'s line already sits under the schema's block comment above `'err?': [`; the new comment goes
directly above `v: '/^corj\\//',`, inside the object.

#### Proof b1 — the diagnostic budget dropped

```diff
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -161,1 +160,0 @@
-          maxReportBytes: FAILURE_REPORT_MAX_BYTES,
```

#### Proof s1 — the log schema narrowed to the current version

```diff
diff --git a/libs/wbs/adapters/observability/src/log-schema.ts b/libs/wbs/adapters/observability/src/log-schema.ts
--- a/libs/wbs/adapters/observability/src/log-schema.ts
+++ b/libs/wbs/adapters/observability/src/log-schema.ts
@@ -38,1 +38,1 @@
-      v: '/^corj\\//',
+      v: '/^corj\\/v0\\.15$/',
```

#### Proof p1c — the same-file clause weakened (used with the nested copy)

```diff
diff --git a/tools/tool-devsync/src/toolchain-pins.test.ts b/tools/tool-devsync/src/toolchain-pins.test.ts
--- a/tools/tool-devsync/src/toolchain-pins.test.ts
+++ b/tools/tool-devsync/src/toolchain-pins.test.ts
@@ -565,1 +565,1 @@
-    expect(loadedCopy).toBe(rootCopy);
+    expect(loadedCopy).toBeTypeOf('string');
```

#### Proof p2c — the version clause weakened (used with the edited version)

```diff
diff --git a/tools/tool-devsync/src/toolchain-pins.test.ts b/tools/tool-devsync/src/toolchain-pins.test.ts
--- a/tools/tool-devsync/src/toolchain-pins.test.ts
+++ b/tools/tool-devsync/src/toolchain-pins.test.ts
@@ -567,1 +567,1 @@
-    expect(version).toBe(OWNER_PACKAGES['caught-object-report-json']);
+    expect(version).toBeTypeOf('string');
```

### 8.2 Slice 4 — the existing `@shared/failures` proofs, on the new libraries

Nine `Proof:` comments in `report-failure.ts` name faults whose outcome depends on the libraries
this packet moved. Each is observed again; the comments stay as written. The records:

```text
r1
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures
skips a sensitive property whatever its capitalisation
r2
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures
skips a sensitive property whatever its capitalisation
r3
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures
scrubs a caller-owned secret from message and stack, not only from its property
r4
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures
stops the cause walk at the depth limit and says so on the deepest child
r5
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures
stops at the child limit and says so on the root
r6
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures
does not run a throwing getter while reporting
r7
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures
a cause that cannot be inspected is reported as reporting loss, not as a throw
r8
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures
redacts a secret the disclosure policy selected into the public report
r9
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures
correlates a primitive failure without publishing its contents
```

Each exit 1, rehearsed on `rehearse/140-1-2-r1` slice 3's commit:

| Id   | The comment's fault, respelled for 0.7.0                                           | Observed (named test; whole file)                                                                                                  |
| ---- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `r1` | `SENSITIVE_KEY_PATTERNS` built from the plain key strings                          | `+ "Authorization": "Bearer live-token"` against `- "Authorization": "[redacted]"`; `19 pass`, `1 fail`                            |
| `r2` | `keys: []`                                                                         | `Authorization` and `password` both unredacted; `17 pass`, `3 fail`                                                                |
| `r3` | `patterns: []`                                                                     | `Expected: "Error: token was [redacted]"` `Received: "Error: token was hunter2"`; `16 pass`, `4 fail`                              |
| `r4` | `maxDepth: 4,` removed                                                             | `Expected: "max_depth"` `Received: undefined`; `18 pass`, `2 fail`                                                                 |
| `r5` | `maxChildren: 16,` removed                                                         | `Expected: "max_children"` `Received: undefined`; `18 pass`, `2 fail`                                                              |
| `r6` | `inspection: 'no-invoke',` removed                                                 | `toBeUndefined()` received a row `{ stage: "as_json", path: "$", reportKey: "as_json", error: "Error: ran" }`; `18 pass`, `2 fail` |
| `r7` | the catch rethrows instead of modelling the loss (the "bare block" of the comment) | `TypeError: Array.isArray cannot be called on a Proxy that has been revoked`; `18 pass`, `2 fail`                                  |
| `r8` | the public bag without `redact`                                                    | `+ "user": "alice@example.com"` against `- "user": "[redacted]"`; `19 pass`, `1 fail`                                              |
| `r9` | the public report taken from a second `makeReportPair` call                        | `Expected: "AE_…"` `Received:` a different `"AE_…"`; `19 pass`, `1 fail`                                                           |

#### Proof r1 — key rules from plain strings

```diff
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -82,1 +82,1 @@
-  (key) => new RegExp(`^${quoteForPattern(key)}$`, 'i'),
+  (key) => key,
```

#### Proof r2 — no key rules

```diff
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -103,1 +103,1 @@
-    keys: SENSITIVE_KEY_PATTERNS,
+    keys: [],
```

#### Proof r3 — no caller-owned patterns

```diff
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -106,3 +106,1 @@
-    patterns: secrets
-      .filter((secret) => secret.length > 0)
-      .map((secret) => new RegExp(quoteForPattern(secret), 'g')),
+    patterns: [],
```

#### Proof r4 — no depth limit

```diff
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -24,1 +23,0 @@
-  maxDepth: 4,
```

#### Proof r5 — no child limit

```diff
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -27,1 +26,0 @@
-  maxChildren: 16,
```

#### Proof r6 — accessors invoked

```diff
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -30,1 +29,0 @@
-  inspection: 'no-invoke',
```

#### Proof r7 — the wrapper rethrows

```diff
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -172,2 +172,2 @@
-  } catch {
-    unreportedFailures += 1;
+  } catch (thrown) {
+    throw thrown;
```

#### Proof r8 — the public report unredacted

```diff
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -167,1 +167,1 @@
-        public: bag,
+        public: { corj: FAILURE_REPORT_LIMITS },
```

#### Proof r9 — the shared call split

```diff
diff --git a/libs/shared/domain/failures/src/report-failure.ts b/libs/shared/domain/failures/src/report-failure.ts
--- a/libs/shared/domain/failures/src/report-failure.ts
+++ b/libs/shared/domain/failures/src/report-failure.ts
@@ -158,1 +158,1 @@
-      reports: makeReportPair(caught, {
+      reports: ((pair) => ({ ...pair, public: makeReportPair(caught, { public: bag }).public }))(makeReportPair(caught, {
@@ -168,1 +168,1 @@
-      }),
+      })),
```

## 9. Verification

### 9.1 Every fenced diff applies, extracted from this document, in slice order

The requirement: these diffs, as this committed document spells them, apply in slice order,
produce the rehearsal's final tree, and every fault patch applies to the tree its slice leaves — on
the stand-in base, on that base with the executors' own output varied, **and on the real dispatch
base**. Three modes:

- `fill=0` — the stand-in `ad0451da9`; `.openspec.yaml` written as the command wrote it on
  2026-09-25. The result must equal the rehearsal's final commit byte for byte, except the three
  files that carry slice 3's executor-written `Proof:` comments, which must equal it once every
  `//` comment and blank line is stripped and whitespace squeezed.
- `fill=1` — the stand-in with every executor-written text varied: `.openspec.yaml` dated another
  day, a simulated two-line `// Proof:` comment above each of slice 3's four sites (so slice 4's
  patches meet an unknown comment length above `maxReportBytes`), and a simulated entry appended to
  `verify.md` after each slice. Every later diff and fault patch must still apply.
- `fill=real` — the base named by `REAL_BASE`: planning plus this plan branch's commits. The result
  must change exactly the twenty-four paths the diffs own (the twenty-fifth owned path,
  `log-schema.ts`, changes only by slice 3's comment); every TypeScript file must equal the rehearsal's
  final one once comments and blank lines are stripped (the `Proof:` sites are the executor's
  words); the four records another packet may also edit — the adoption plan,
  `adopt-failure-reporting/design.md`, `package.json` and `bun.lock` — must carry exactly this
  packet's delta; and every other path must equal the rehearsal's bytes. Unset, the mode prints that it was skipped and proves
  nothing. **Its output is the dispatch evidence.**

No `node_modules` are needed: every change is a diff.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-25-batch-7/140-1-2-report-libraries-migration.md
base=ad0451da9918ce894faea7bcd70eed0fada0b1d3
final=3075cd97a0e56aba30579324f01da4730b578808
real_base=${REAL_BASE:-}
test -f "$packet"
proof_files="tools/tool-devsync/src/toolchain-pins.test.ts
  libs/shared/domain/failures/src/report-failure.ts
  libs/wbs/adapters/observability/src/log-schema.ts"
# Inserts a two-line comment above the one line whose trimmed text is exactly $2. The anchor
# reaches awk through the environment: `-v` would unescape the backslashes in the schema's line.
fill_above() {
  file=$1
  test -f "$file"
  test "$(ANCHOR=$2 awk '{ t = $0; sub(/^ +/, "", t) } t == ENVIRON["ANCHOR"] { n++ } END { print n + 0 }' "$file")" -eq 1
  ANCHOR=$2 awk '
    BEGIN { a = ENVIRON["ANCHOR"] }
    { t = $0; sub(/^ +/, "", t) }
    t == a {
      match($0, /^ */); ind = substr($0, 1, RLENGTH)
      print ind "// Proof: simulated, standing where an executor writes one; the words are"
      print ind "// not knowable from here."
    }
    { print }
  ' "$file" > "$file.filled"
  mv "$file.filled" "$file"
}
append_entry() {
  printf '\n## Packet 140.1–140.2, slice %s — simulated\n\nObserved 2026-10-01.\n' "$1" \
    >> "$work/tree/openspec/changes/migrate-report-libraries/verify.md"
}
check_faults() {
  for id in "$@"; do git -C "$work/tree" apply --unidiff-zero --check "$work/mutations/$id.diff"; done
}
apply_patch() {
  git -C "$work/tree" apply --check "$work/patches/$1.diff"
  git -C "$work/tree" apply "$work/patches/$1.diff"
}
code_of() { sed -e 's#[[:space:]]*//.*$##' -e '/^[[:space:]]*$/d' "$1" | tr -s '[:space:]' ' '; }
delta_of() {
  if diff -U0 "$1" "$2" > "$work/delta.d"; then :; else test $? -eq 1; fi
  sed -n -e '/^---/d' -e '/^+++/d' -e '/^[-+]/p' "$work/delta.d"
}
for fill in 0 1 real; do
  from=$base
  if [ "$fill" = real ]; then
    if [ -z "$real_base" ]; then echo "fill=real skipped: REAL_BASE unset, not dispatch evidence"; continue; fi
    from=$real_base
  fi
  work=$(mktemp -d "${TMPDIR:?}/extract-XXXXXX")
  mkdir -p "$work/patches" "$work/mutations" "$work/tree" "$work/final"
  awk -v out="$work/patches" '
    /^## 7\. The code$/ { inside=1; next }
    /^## 8\. Proofs$/   { inside=0 }
    inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print > f }
  ' "$packet"
  test "$(find "$work/patches" -name '*.diff' | wc -l)" -eq 5
  awk -v out="$work/mutations" '
    /^## 8\. Proofs$/ { inside=1; next }
    /^## 9\. Verification$/ { inside=0 }
    inside && /^#### Proof / { id=$3; next }
    inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print > f }
  ' "$packet"
  test "$(find "$work/mutations" -name '*.diff' | wc -l)" -eq 13
  echo "fill=$fill extracted 5 patches, 13 fault patches"
  git archive "$from" | tar -x -C "$work/tree"
  git -C "$work/tree" init -q
  git -C "$work/tree" add -A
  git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
  # Slice 1: the command's file, then 01.
  change="$work/tree/openspec/changes/migrate-report-libraries"
  test ! -e "$change"
  mkdir -p "$change"
  day=2026-09-25
  if [ "$fill" = 1 ]; then day=2026-10-01; fi
  printf 'schema: sdd-lean\ncreated: %s\n' "$day" > "$change/.openspec.yaml"
  apply_patch 01
  if [ "$fill" = 1 ]; then append_entry 1; fi
  echo "fill=$fill slice 1 applied"
  # Slice 2.
  apply_patch 02
  apply_patch 03
  if [ "$fill" = 1 ]; then append_entry 2; fi
  check_faults b1 s1 p1c p2c
  echo "fill=$fill slice 2 applied, slice 3's 4 fault patches check"
  # Slice 3: the executor's comments, then 04.
  if [ "$fill" = 1 ]; then
    fill_above "$work/tree/tools/tool-devsync/src/toolchain-pins.test.ts" 'expect(loadedCopy).toBe(rootCopy);'
    fill_above "$work/tree/tools/tool-devsync/src/toolchain-pins.test.ts" "expect(version).toBe(OWNER_PACKAGES['caught-object-report-json']);"
    fill_above "$work/tree/libs/shared/domain/failures/src/report-failure.ts" 'maxReportBytes: FAILURE_REPORT_MAX_BYTES,'
    fill_above "$work/tree/libs/wbs/adapters/observability/src/log-schema.ts" "v: '/^corj\\\\//',"
    test "$(grep -rc 'Proof: simulated' "$work/tree/tools" "$work/tree/libs" | awk -F: '{ s += $2 } END { print s }')" -eq 4
  fi
  apply_patch 04
  if [ "$fill" = 1 ]; then append_entry 3; fi
  check_faults r1 r2 r3 r4 r5 r6 r7 r8 r9
  echo "fill=$fill slice 3 applied, slice 4's 9 fault patches check"
  apply_patch 05
  if [ "$fill" = 1 ]; then append_entry 4; fi
  echo "fill=$fill slice 4 applied"
  git -C "$work/tree" status --porcelain --untracked-files=all | cut -c4- | sort > "$work/changed.txt"
  wc -l < "$work/changed.txt"
  git archive "$final" | tar -x -C "$work/final"
  if [ "$fill" = 0 ]; then
    for f in $proof_files; do
      test "$(code_of "$work/tree/$f")" = "$(code_of "$work/final/$f")"
      cp "$work/final/$f" "$work/tree/$f"
    done
    diff -r --exclude=.git "$work/tree" "$work/final"
    echo "fill=0 tree identical to $final, the three Proof-site files modulo comments"
  elif [ "$fill" = 1 ]; then
    echo "fill=1 simulated comments left: $(grep -rc 'Proof: simulated' "$work/tree/tools" "$work/tree/libs" | awk -F: '{ s += $2 } END { print s }')"
  else
    # log-schema.ts changes only by slice 3's executor comment, which no diff carries.
    git diff --name-only "$base" "$final" | grep -vx 'libs/wbs/adapters/observability/src/log-schema.ts' \
      | sort > "$work/owned.txt"
    test "$(wc -l < "$work/owned.txt")" -eq 24
    diff "$work/owned.txt" "$work/changed.txt"
    echo "fill=real changed exactly the twenty-four paths the diffs own"
    while read -r f; do
      case "$f" in
        package.json | bun.lock | docs/superpowers/plans/2026-09-17-personal-package-adoption.md | \
          openspec/changes/adopt-failure-reporting/design.md)
          git show "$base:$f" > "$work/authored"
          git show "$real_base:$f" > "$work/real"
          mine=$(delta_of "$work/authored" "$work/final/$f")
          landed=$(delta_of "$work/real" "$work/tree/$f")
          test -n "$mine"
          test "$landed" = "$mine"
          ;;
        *.ts | *.tsx) test "$(code_of "$work/tree/$f")" = "$(code_of "$work/final/$f")" ;;
        *) cmp "$work/tree/$f" "$work/final/$f" ;;
      esac
    done < "$work/owned.txt"
    echo "fill=real every owned path equals the rehearsal's: code modulo comments, records by delta"
  fi
done
````

Observed on 2026-09-25, after the final Prettier `--check` of this document, with the packet read
from this working tree and `REAL_BASE=ad0451da9`, the same stand-in as `base` — so `fill=real` here
proves the mode's own checks, not the dispatch base; the planner reruns it on the reviewed base:

```text
fill=0 extracted 5 patches, 13 fault patches
fill=0 slice 1 applied
fill=0 slice 2 applied, slice 3's 4 fault patches check
fill=0 slice 3 applied, slice 4's 9 fault patches check
fill=0 slice 4 applied
24
fill=0 tree identical to 3075cd97a0e56aba30579324f01da4730b578808, the three Proof-site files modulo comments
fill=1 extracted 5 patches, 13 fault patches
fill=1 slice 1 applied
fill=1 slice 2 applied, slice 3's 4 fault patches check
fill=1 slice 3 applied, slice 4's 9 fault patches check
fill=1 slice 4 applied
25
fill=1 simulated comments left: 4
fill=real extracted 5 patches, 13 fault patches
fill=real slice 1 applied
fill=real slice 2 applied, slice 3's 4 fault patches check
fill=real slice 3 applied, slice 4's 9 fault patches check
fill=real slice 4 applied
24
fill=real changed exactly the twenty-four paths the diffs own
fill=real every owned path equals the rehearsal's: code modulo comments, records by delta
```

The number printed after slice 4 is the paths changed against the base: twenty-four from the diffs
alone, twenty-five under `fill=1`, whose simulated comment is `log-schema.ts`'s only change. `git
apply --check` prints nothing on success, which is why the script's own `echo` lines are the
evidence. Under `fill=1` slice 4's nine fault patches applied with a two-line comment above
`maxReportBytes` where the rehearsal had three: the offsets `git apply` finds.

**A failed check stops the run.** The same script with `REAL_BASE=f784dab3c~1`, the commit before
the libraries were first pinned, exited 1 at slice 2's first `git apply --check`
(`error: apps/wbs/be-01/src/http/elysia/unexpected-failure.test.ts: No such file or directory`).

**The packet's own blocks, run as an executor would.** Every `sh` block of section 6 and section 8
was extracted from this document (the packet path replaced by its location, the slice note's hash
filled) and run in order in a second, fresh clone of the stand-in with its own install: slice 1's
step 0 to step 5, slice 2's step 0 to step 9, slice 3's with the section 8.1 blocks, slice 4's with
the section 8.2 blocks, each slice then committed with the hooks on (`71cd354ba`, `f4314605b`,
`59b568f6e`, `2bcedf06a`, local only). Every block exited 0 with the outputs sections 6 and 8
state, and each resulting tree differs from the matching rehearsal commit only in the `verify.md`
entries the run appended. Slice 3's `Proof:` comments in that run were the rehearsal's own.

### 9.2 The strict OpenSpec block, reproduced

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
report=$(mktemp "$TMPDIR/evidence/openspec-validation.XXXXXX.json")
env -u CLAUDECODE -u AGENT OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

Rehearsed: `{"items":114,"passed":114,"failed":0}` on the stand-in, `{"items":115,"passed":115,"failed":0}`
after each slice.

### 9.3 Commands actually run, and what each reported

All on 2026-09-25, by this packet's author, in a scratch clone of the stand-in with its own
`bun install --frozen-lockfile`, each slice committed on `rehearse/140-1-2-r1` with the hooks on
(lefthook's tool-wiki, secrets, format and lint passed): `7238c37aa`, `276368515`, `400deded9`,
`3075cd97a`. Slice 2's red was the slice-1 commit plus `02.diff` only; its green `03.diff` plus
`bun install --frozen-lockfile`; slice 3's and slice 4's faults ran on the previous slice's commit.

| Check                                            | Stand-in `ad0451da9` | After slice 1 | Slice 2 red                                   | After slice 2 | After slices 3 and 4 |
| ------------------------------------------------ | -------------------- | ------------- | --------------------------------------------- | ------------- | -------------------- |
| strict OpenSpec (items · passed · failed)        | 114 · 114 · 0        | 115 · 115 · 0 | —                                             | 115 · 115 · 0 | 115 · 115 · 0        |
| pins file (`toolchain-pins.test.ts`)             | 19 pass              | 19            | 17 pass, 3 fail                               | 20 pass       | 20 pass              |
| `shared-failures` (`bun test ./src`)             | 20 pass              | 20            | 0 pass, 1 fail (the module cannot load)       | 20 pass       | 20 pass              |
| `wbs-observability` (`bun test ./src`)           | 28 pass              | 28            | 25 pass, 4 fail                               | 29 pass       | 29 pass              |
| backend · gateway · MCP focused files            | 5 · 5 · 4            | same          | 4·1 · 4·1 · 3·1 (pass·fail)                   | 5 · 5 · 4     | 5 · 5 · 4            |
| frontend fault set + browser build (7 files)     | 7 · 288              | same          | 1 failed \| 6 passed · 1 failed \| 287 passed | 7 · 288       | 7 · 288              |
| typecheck, 7 projects                            | 0                    | —             | 1: ten errors in `report-failure.test.ts`     | 0             | 0 (3 projects)       |
| lint, 7 projects                                 | —                    | —             | —                                             | 0             | 0 (3 projects)       |
| registry probe: Bun · `tsc` 7.0.2 · `tsc6` 6.0.3 | —                    | —             | —                                             | 0 · 0 · 0     | —                    |
| `tool-devsync:test`, whole (planner-only)        | 371 pass, 0 fail     | —             | —                                             | —             | 372 pass, 0 fail     |
| `nx run-many -t test` on the five Bun projects   | —                    | —             | —                                             | —             | 0                    |
| `nx format:check --all`                          | —                    | —             | —                                             | —             | 0                    |

The last three rows on the right ran on the first cut of slice 4's commit, which differs from
`3075cd97a` only in `logger.ts`'s comment; the whole-devsync base count ran on the stand-in with its
own install. Every fault of section 8 was run on the commit before its slice's own (slice 3's on
`276368515`, slice 4's on `400deded9`), and again from the extracted blocks in the second clone.

Also run by the author on the second clone's final commit, outside any sandbox:
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT CI=1 E2E_PORT_SHIFT=2700 NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- e2e/browser-packages.spec.ts
e2e/fault-boundary.spec.ts` exited 0 with `2 passed` — the three libraries in Chromium from this
app's Vite build, `reportVersion: 'corj/v0.15'`, and the root fault boundary — and
`wbs-fe-01:test:unit --skip-nx-cache` exited 0 with `Test Files 59 passed (59)`, `Tests 737 passed
(737)`. The planner still runs both on the dispatch base (section 9.4).

### 9.4 Planner-only, with the expected relative delta

| Check                                                                                                                                                                               | Why the planner's                                                                              | Expected                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`, after each slice's commit                                                               | Its namespacing test writes Git objects                                                        | Base + 1 test after slice 2, unchanged after the others; rehearsed `372 pass`, `0 fail` on the final commit |
| `check-indexes committed . <commit>` after each commit                                                                                                                              | Writes Git objects (brief addendum 7, point 3)                                                 | exit 0; no module index is touched                                                                          |
| `env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t test -p shared-failures wbs-observability wbs-be-01 wbs-gw-01 wbs-mcp-01 --skip-nx-cache`                           | Whole targets, outside the focused files                                                       | exit 0, each project's base count, observability + 1                                                        |
| `wbs-fe-01:test` and `wbs-fe-01:test:unit`                                                                                                                                          | Three tests spawn `bun` from Node                                                              | unchanged counts                                                                                            |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT CI=1 E2E_PORT_SHIFT=<n> NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- e2e/browser-packages.spec.ts e2e/fault-boundary.spec.ts` | Chromium                                                                                       | both pass; `reportVersion: 'corj/v0.15'` in the first                                                       |
| `env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx format:check --all`                                                                                                             | Repository-wide                                                                                | exit 0                                                                                                      |
| `bin/h2puni-gate.sh <sha>` on the batch's integration commit                                                                                                                        | The host gate. **Its tree must be installed from the new lockfile** (it is: the gate installs) | exit 0                                                                                                      |

**Never install through a linked `node_modules`: it is shared with other lanes.** Run the planner
checks in the executor's clone, or replace the link in that worktree with its own install
(`unlink node_modules`, then `bun install --frozen-lockfile`). For this packet the planner runs
every check in section 9.4 in the executor's lane clone, which has its own install. A worktree
whose `node_modules` still links to an 11.0.1 install fails the new pins test on the installed
version: that is the test doing its job, not a regression.

### 9.5 What none of this proves

- That the dev and prod deploys install the new tree: the dev poller restarts on a lockfile change
  (`LLM_README.md`, "dev — source-run"), and prod builds images from the lockfile; neither is run.
- That log queries in any external tool keyed on `reporting_errors[].key` still work; none is known
  in this repository.
- That a Nx-cached `tool-devsync:test` sees a drifted `node_modules` (section 3.6).

## 10. Stop conditions

1. Step 0a's hash differs, or `status-before.txt` is not empty.
2. `openspec/changes/migrate-report-libraries` exists before slice 1.
3. A nested `node_modules/application-exception/node_modules/caught-object-report-json` exists at
   the start of slice 2 or 3 (step 1), or after slice 2's install.
4. The registry's `latest` for either package differs from 13.0.0 / 0.7.0, or any of the three
   dependency lines differs (slice 2 step 2).
5. A red count or diagnostic of slice 2 step 3 differs in fact from its table — a suite passing,
   the typecheck passing, or diagnostics outside `report-failure.test.ts`.
6. The probe prints `issue 217 fixed: no throw`, or any `ok` line is missing.
7. `bun install --frozen-lockfile` exits non-zero or wants to rewrite `bun.lock`.
8. A green suite's count differs from its N (plus 1 for pins and observability).
9. A named fault test passes after the second try (preamble rule 20), or `p1c`/`p2c` **fails**
   (then another clause catches the fault, and the proof is not this clause's).
10. A file outside the slice's owned list changes, `cmp` reports a difference after a restore, or
    the hand-over `diff` prints anything.
11. Lint or typecheck fails on anything but an autofixable import-order or Prettier finding.

## 11. Out of lane

Every path not in section 5. In particular: `di-bag`'s pin, the log schema's rule (only a comment
is added), `serializers.ts` and every boundary's production file other than the comment in
`logger.ts` and `fault-disclosure.ts`, `apps/wiki/**` (the suite directory move's lane), and
historical packets under `docs/superpowers/plans/2026-09-1*` and `2026-09-2[0-4]*`.

## 12. Hand-over to the next packet

- **140.3 (di-bag)** reruns this packet's registry probe pattern for di-bag and keeps the pins
  suite's shape: add di-bag to the one-copy style check only if a second package ever depends on it.
- **The next report-library migration** must read CORJ issue 217 first. If it is fixed, the
  wrapper's own test (`a cause that cannot be inspected …`) and the backend, gateway, MCP and
  observability loss tests need another value the reporter cannot inspect; the wrapper stays either
  way (R5: a hostile value can always throw).
- **The next report-library migration MODIFIES** `report-libraries`' requirement "Operator
  records stay readable across a report-format change": its scenario "A boundary logs a failure
  after the move" hard-codes `corj/v0.15`.
- A public byte budget (`maxReportBytes` on the public bag) is available and unused; adopting it is
  a behaviour change with its own OpenSpec change.

## 13. Assumptions recorded rather than asked

- **Public report budget unchanged** (section 3.3): 0.5.0's public `maxReportSize` bounded no
  public output, so leaving the public bag without `maxReportBytes` keeps behaviour.
- **Historical `Proof:` comments keep their 0.5.0 wording** (section 1.2): they are dated
  observations. The ones whose faults depend on the moved libraries are observed again in slice 4.
- **`serializers.test.ts:55`'s forged `v: 'corj/v0.14'` stays**: it is attacker data, and its
  value is irrelevant to the test.
- **No ADR, no CONTEXT.md term** (section 3.5).
- **The OpenSpec change's `.openspec.yaml` date is the executor's**; section 9.1 accepts any.
- **Rehearsal commits carry no `verify.md` entries**; the executors write theirs, and section 9.1's
  `fill=1` shows the diffs apply over them.

## 14. The brief, point by point

- **Batch-3 brief:** exact code as diffs; slices each finishable in one attempt; red and green
  rehearsed; counts relative; every fault observed with its diagnostic; planner-only checks named;
  Prettier twice on this file; no absolute paths outside the Dispatch block.
- **Batch-6 addendum:** the red is rehearsed on the unchanged tree (1); prescribed tests pass
  typecheck and lint (2); hand-over lists scoped to owned paths (3); every verification keeps its
  exit status (4); no staged rename (5); `bun test ./dir` paths (14); grep checks gated by `test -f`
  (19); no pipeline under `|| test $? -eq 1`.
- **Batch-7 addendum:** Opus executor and the `env -u` forms (1); each clause its own negative, the
  clause-disabled runs `p1c` and `p2c` (2); index checks the planner's (3); `>` in every extraction
  (4); observed dates are the executor's and `fill=1` varies them (5); the pin moves here, and the
  precondition failed and was escalated (6, section 1.1); stand-in base named (8).

## 15. Ready to commit

| Slice | Subject                                                                                      | Paths |
| ----- | -------------------------------------------------------------------------------------------- | ----- |
| 1     | `docs(openspec): intent and spec for moving the two report libraries together`               | 5     |
| 2     | `build(deps): move the report library to 13.0.0 and application-exception to 0.7.0 together` | 19    |
| 3     | `test(failures): prove one report library copy, the moved budget and older log records`      | 5     |
| 4     | `docs(plans): record the report libraries' move and observe the reporting proofs again`      | 4     |

## 16. Round 1, disposed

Review 1 (READY AFTER FIXES), every finding applied; the planner's decisions are in brackets.

| Finding     | What changed                                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Important 1 | Section 9.4: the reviewer's sentence replaces the install advice — never install through a linked `node_modules`; [planner checks run in the executor's lane clone, which has its own install].                                                                                                                                                                                            |
| Important 2 | Section 8.1: the hard-link warning; clean-state guards (`git diff --quiet`, the manifest's 13.0.0) before the passing copies are saved; `stat -c %h` equal to 1 after `sed -i`; a `trap` restoring both files and moving any nested copy aside on every exit; the Bun cache's 13.0.0 manifest checked before and after; "a failure is a stop, not a rerun". Rehearsed again (section 9.3). |
| Minor 1     | Section 5 no longer claims the suite move's paths; Dispatch says a `fill=real` failure is a planner stop and names `toolchain-pins.test.ts` as the path to check against the suite-move packet.                                                                                                                                                                                            |
| Minor 2     | Slice 2 step 7 says to strip the list indent, and three `test` lines prove both heredocs ended where they should.                                                                                                                                                                                                                                                                          |
| Minor 3     | Slice 2 step 1 expects `… for 7 projects and 1 task they depend on`.                                                                                                                                                                                                                                                                                                                       |
| Minor 4     | Every `bunx nx`, `bunx prettier` and OpenSpec command carries `env -u CLAUDECODE -u AGENT`, and every Vitest and Playwright command also `-u AGENT`; no exemption.                                                                                                                                                                                                                         |
| Minor 5     | Section 3.6 records the observed `TS2353` for `maxReportSize` in a `PublicReportCorjOptions` literal.                                                                                                                                                                                                                                                                                      |
| Minor 6     | The example `Proof:` comment uses `<observed-date-p1>`; section 7 says the 7.5 dates are the planner's decision date.                                                                                                                                                                                                                                                                      |
| Minor 7     | Section 12: the next report-library migration MODIFIES the requirement whose scenario names `corj/v0.15`.                                                                                                                                                                                                                                                                                  |
| Minor 8     | Slice 3 step 1: the fallback install must succeed offline from the Bun cache; needing the network is a stop.                                                                                                                                                                                                                                                                               |
| Minor 9     | Section 2 spells out `openspec/changes/log-failure-records/specs/failure-log-records/spec.md`.                                                                                                                                                                                                                                                                                             |

No section 7 diff and no section 8 fault patch changed, so section 9.1's extraction is unchanged
and the rehearsal stays `rehearse/140-1-2-r1`; only executor blocks and prose changed, and every
changed block was run again (section 9.3, "Round 2 rerun").
