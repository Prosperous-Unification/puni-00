# Gateway Unexpected-Failure Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Work item:** WBS 040.9, `3943ec6d-7c00-4ac8-a2b3-5268981b61fe`.

**Goal:** A live gateway connection whose backend forward or resume fails keeps its exact existing wire behavior and writes exactly one redacted, bounded, correlated diagnostic record, while connection cancellation and modeled gateway outcomes remain silent.

**Architecture:** Keep `requestBackend`, `ForwardClient`, and `ResumeClient` as throwing transport adapters. The existing `handleWsMessage` catches remain the single owning boundary. Compose one reporter per `buildApp` from the gateway logger and all secrets that composition owns; invoke it after the existing abort guard and before the existing metric/frame behavior. The reporter makes one `reportFailure` call, registers that exact outcome, and writes it through the 040.5 serializer with connection, user, and operation fields.

**Tech Stack:** Bun 1.4.x, TypeScript, Elysia WebSocket/Bun adapter, Pino, ArkType, `@shared/failures`, `@wbs/observability`, Nx, OpenSpec.

**Spec:** `openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md`, its task 2.1, and amended `docs/superpowers/plans/2026-09-17-personal-package-adoption.md` slice 3.

## Global constraints

- Execute only on an integrated head containing 040.5 (`registerReportedFailure`, the guarded serializer, diagnostic/loss log schema, and logger-owned secret policy). Re-read live files before editing; source locations here were inspected at immutable `7641f5a2`.
- Preserve forward failure bytes exactly: `{"type":"error","code":"backend_unavailable","retry_after":5}`. Do not add an occurrence id, message, detail, or alternate error code to the frame.
- Preserve resume failure ordering and bytes: one `resume_denied` with reason `unavailable` per requested subscription in request key order, then `{"type":"resume_ack","replayed":{}}`. Do not turn it into `backend_unavailable`, disconnect, or replay partial data.
- Preserve successful forwarding, replay event order, `out_of_range`, reconnect accounting, ping-after-failure, and the open socket.
- Preserve controlled cancellation: once the connection signal is aborted, a late forward/resume rejection produces no report, metric, or frame. Close still aborts before awaiting join and performs subscription/presence cleanup in its existing order.
- Preserve invalid payload, unknown subscription, auth/origin/token refusal, identity-recheck close, health response, internal-push validation, socket-drop, and normal success paths. They do not call this WebSocket backend-failure reporter.
- Report each live forward/resume rejection exactly once at `handleWsMessage`; lower transport layers rethrow and do not log it. Do not add reporting to `requestBackend`, `ForwardClient`, or `ResumeClient`.
- Never attach the inbound frame, resume map, request, headers, cookies, URL, config, verifier, or environment as report context. Only the fixed operation name enters diagnostic context. Connection/user identifiers remain established structured log fields.
- The gateway composition owns `internalAuthSecret`, `jwtKey`, and optional `previousJwtKey`; pass their values to both `createLogger` and the reporter. Never put the secrets themselves into log fields or context.
- Build one redaction policy per application composition, not per failure. Call `reportFailure` once and log only `registerReportedFailure(reporting)` as `err`.
- Keep the existing health-probe log. Its caught failure continues through the same safe serializer but is outside the new WebSocket reporter and its one-record assertions.
- Do not create typed exception kinds, change WS/domain contracts, change retry/deadline policy, add client-visible public reports, change metrics, introduce DI Bag, or touch MCP/backend/frontend/personal-package code.
- Every new safety assertion needs a watched production-path negative, byte restoration, green rerun, and adjacent `Proof:` comment naming the injected fault and observed test.
- Bun and Nx only. A filtered command that discovers zero tests is a failure, not evidence.

Review dispositions: the production WebSocket oracle below retains literal `MessageEvent.data` strings and compares the four accepted failure bytes directly, with a property-order-only builder mutation that parsed equality cannot detect. The existing foreign-origin and expired-token real-upgrade refusals also receive fresh private logger destinations, zero-report assertions, and separate production-branch mutations. These are executable proof details within the accepted behavior; they require no new product or protocol decision.

## Established evidence and implementation inference

Source-inspected at `7641f5a2`:

- `apps/wbs/gw-01/src/controller/ws.controller.ts:91-102` catches every forward rejection, tests `signal.aborted`, increments `backendUnavailable`, and sends the fixed error frame. It currently discards the caught value.
- The same file at `118-141` catches every resume rejection, tests `signal.aborted`, sends the ordered unavailable denials and empty acknowledgement, and currently discards the caught value. It intentionally does not increment the forward-only unavailable metric.
- `app.ts:263-332` is the sole production caller. It already supplies `connectionId`, authenticated `clientId`, the connection signal, transport functions, and metric callbacks.
- `app.ts:334-350` aborts synchronously on close before join/subscription/presence cleanup. `ws-cancellation.test.ts` and the real streaming cases in `request-deadline.integration.test.ts` prove late failure frames and metrics are suppressed.
- `requestBackend` makes one bounded attempt, propagates parent cancellation into fetch and response consumption, rejects non-2xx before parsing, and rejects malformed trusted success bodies. Those distinct causes deliberately converge only at the controller's existing wire mapping.
- `app.ts:103-105` creates a gateway logger without any `secrets`; the integration must correct that for all three secret values the composition owns.
- 040.5's logger serializer safely reports an unregistered caught value, but this boundary must explicitly call `reportFailure` and register its outcome so the boundary owns one occurrence and tests can prove provenance/correlation rather than infer it from Pino.
- `LogRecord` admits `connection_id`, `user_id`, and additional structured fields. No schema edit is needed for `backend_operation`.
- Direct `handleWsMessage` callers exist only in `app.ts`, `ws.controller.test.ts`, and `ws-cancellation.test.ts` at this snapshot. Confirm that with `rg` on the execution head.

Implementation inference, to be established by red/green tests: a logger factory passed as a second `buildApp` argument can create the real logger with a private destination while preserving all one-argument production/current-test callers. Bun's WebSocket handler awaits `handleWsMessage`, and Pino's injected destination receives the reporter line before the controller sends its failure frames. Assertions must wait for both events rather than depend on their relative scheduling.

## File ownership

Create:

- `apps/wbs/gw-01/src/controller/unexpected-backend-failure.ts` — application-local reporter and its input contract.
- `apps/wbs/gw-01/src/controller/unexpected-backend-failure.test.ts` — real reporter/serializer tests for correlation, redaction, structured fields, exactly once, and reporting loss.
- `apps/wbs/gw-01/src/failure-reporting.integration.test.ts` — real `buildApp` + Bun WebSocket production-path coverage for forward, resume, modeled frames, continuity, secret safety, and real secret wiring.

Modify behavior:

- `apps/wbs/gw-01/src/controller/ws.controller.ts` — require the reporter and invoke it in both catches only after the abort guard.
- `apps/wbs/gw-01/src/app.ts` — pass owned secrets to `createLogger`, compose the reporter once, supply it to the controller, and expose only the optional logger-factory composition seam.

Modify existing tests:

- `apps/wbs/gw-01/src/controller/ws.controller.test.ts` — supply no-op reporters to unrelated calls; assert forward/resume caught values and metadata reach the reporter once; assert modeled control/refusal paths never report.
- `apps/wbs/gw-01/src/controller/ws-cancellation.test.ts` — assert both canceled failure kinds report zero times.
- `apps/wbs/gw-01/src/request-deadline.integration.test.ts` — capture real logger output in its existing live/closed transport matrix; live deadlines report once, closed transports report zero times, and existing transport/frame/metric assertions remain.
- `apps/wbs/gw-01/src/ws-auth.integration.test.ts` — in the existing identity-recheck failure case, inject the private logger destination and assert the deliberate policy close produces no backend-failure record.

Modify records:

- `openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md` — add the accepted gateway behavior below.
- `openspec/changes/adopt-failure-reporting/tasks.md` — retain the original task 2.1 text and negative clauses, and add a gateway progress subtask without marking backend or MCP work complete unless their own packets landed.
- `openspec/changes/adopt-failure-reporting/verify.md` — record actual commands, counts, and every observed mutation failure.

Explicitly unowned: `apps/wbs/gw-01/src/{main.ts,ws-wire.ts}`, `service/{backend-request,forward-client,resume-client,socket-writer}.ts`, gateway metrics, shared failures, observability serializer/schema, WS contracts, backend, MCP, frontend, deployment, DI composition, and package versions.

## Interfaces and exact production shape

Create the following application-local contract:

```ts
import type { Logger } from '@wbs/contracts';

export type GatewayBackendOperation = 'forward' | 'resume';

export interface UnexpectedBackendFailure {
  readonly caught: unknown;
  readonly operation: GatewayBackendOperation;
  readonly connectionId: string;
  readonly clientId: string;
}

/** Reports one live backend rejection owned by the gateway WebSocket boundary. */
export type UnexpectedBackendFailureReporter = (failure: UnexpectedBackendFailure) => void;

export function createUnexpectedBackendFailureReporter(
  logger: Logger,
  secrets: readonly string[],
): UnexpectedBackendFailureReporter;
```

The implementation is deliberately small:

```ts
import { createFailureRedaction, reportFailure } from '@shared/failures';
import type { Logger } from '@wbs/contracts';
import { registerReportedFailure } from '@wbs/observability';

export function createUnexpectedBackendFailureReporter(
  logger: Logger,
  secrets: readonly string[],
): UnexpectedBackendFailureReporter {
  const redact = createFailureRedaction(secrets);
  return (failure) => {
    const reporting = reportFailure(failure.caught, {
      redact,
      context: { operation: failure.operation },
    });
    logger.error(
      {
        err: registerReportedFailure(reporting),
        connection_id: failure.connectionId,
        user_id: failure.clientId,
        backend_operation: failure.operation,
      },
      'gateway backend request failed',
    );
  };
}
```

Add one required member to `HandleWsMessageArgs`:

```ts
reportUnexpectedBackendFailure: UnexpectedBackendFailureReporter;
```

Change only the two catches:

```ts
} catch (caught) {
  if (args.signal?.aborted === true) return;
  args.reportUnexpectedBackendFailure({
    caught,
    operation: 'forward',
    connectionId: args.connectionId,
    clientId: args.clientId,
  });
  args.onBackendUnavailable?.();
  args.socket.send(wsError('backend_unavailable', { retry_after: 5 }));
}
```

and, before the existing resume denial loop:

```ts
} catch (caught) {
  if (args.signal?.aborted === true) return;
  args.reportUnexpectedBackendFailure({
    caught,
    operation: 'resume',
    connectionId: args.connectionId,
    clientId: args.clientId,
  });
  for (const subscription of Object.keys(points)) {
    args.socket.send(wsResumeDenied(subscription, 'unavailable'));
  }
  args.socket.send(wsResumeAck({}));
  return;
}
```

Do not move the reporter above the abort test and do not wrap reporter plus existing mapping in a new broad catch.

Give `buildApp` the same narrow test seam used by the accepted backend packet:

```ts
export function buildApp(opts: AppOptions, makeLogger: typeof createLogger = createLogger) {
  const secrets = [
    opts.internalAuthSecret,
    opts.jwtKey,
    ...(opts.previousJwtKey === undefined ? [] : [opts.previousJwtKey]),
  ];
  const logger = makeLogger({ service: 'gw-01', version: opts.version, secrets });
  const reportUnexpectedBackendFailure = createUnexpectedBackendFailureReporter(logger, secrets);
```

Pass that reporter unchanged in the sole `handleWsMessage` call. Production and every existing caller keep the one-argument default. Do not put a logger, destination, reporter, or secret array into `AppOptions`.

## Task 1: Specify and implement the gateway reporter

**Files:** Create `controller/unexpected-backend-failure.ts` and `.test.ts`; modify the failure-reporting delta spec.

**Consumes:** `createFailureRedaction`, `reportFailure`, `registerReportedFailure`, `Logger`, `createLogger`, `LogRecord`.

**Produces:** `GatewayBackendOperation`, `UnexpectedBackendFailure`, `UnexpectedBackendFailureReporter`, and `createUnexpectedBackendFailureReporter` with the exact signatures above.

- [ ] **Step 1: Append the accepted delta requirement before code.**

```markdown
### Requirement: A live gateway backend failure is reported once without changing its frame

The gateway WebSocket boundary SHALL write exactly one correlated diagnostic operator record for
each live forward or resume failure, SHALL keep the existing failure frames and open connection,
and SHALL disclose no caught-value content through those frames. A rejection caused by connection
cancellation SHALL write no record and no frame.

#### Scenario: A live forward fails

- **GIVEN** an authenticated live socket whose backend forward rejects with a caller-owned secret
- **WHEN** the gateway handles the rejection
- **THEN** it sends the existing `backend_unavailable` frame with `retry_after: 5`
- **AND** it writes one redacted diagnostic record correlated by occurrence and connection
- **AND** the socket remains usable

#### Scenario: A live resume fails

- **GIVEN** an authenticated live socket whose backend resume rejects
- **WHEN** the gateway handles the rejection
- **THEN** it sends one existing unavailable denial per requested subscription followed by the existing empty resume acknowledgement
- **AND** it writes one redacted diagnostic record for the whole rejected resume attempt
- **AND** it sends no replay event from the failed attempt

#### Scenario: Connection close cancels backend work

- **GIVEN** a forward or resume request is pending for a connection
- **WHEN** close aborts that connection and the request rejects
- **THEN** the gateway writes no failure record, increments no unavailable metric and sends no late frame

#### Scenario: A modeled gateway outcome occurs

- **GIVEN** invalid input, an authentication or origin refusal, a declared subscription refusal, a successful replay, or an identity-recheck policy close
- **WHEN** the gateway handles that outcome
- **THEN** it writes no unexpected-backend-failure record
```

- [ ] **Step 2: Write reporter tests first.** Use a real `createLogger` with a private string destination and an overload-preserving delegating `Logger` that captures structured `error` fields before forwarding. For a forward failure containing all three owned secrets, assert exactly one call and one JSON line; `LogRecord(line)` is valid; `msg`, `connection_id`, `user_id`, and `backend_operation` are exact; no secret occurs in serialized output; `err` is the registered `FailureReporting`; and when `reported === true`, its public and diagnostic occurrence ids equal the emitted diagnostic occurrence id. Assert its diagnostic context contains only the fixed operation.
- [ ] **Step 3: Add the reporting-loss case.** Revoke a proxy used as `Error.cause`, invoke the reporter, and assert it does not throw and writes one schema-valid loss with `reported: false`, a nonempty occurrence id, fixed reason, connection/user/operation fields, and no raw caught-value text.
- [ ] **Step 4: Run the red test.**

```bash
cd apps/wbs/gw-01
bun test src/controller/unexpected-backend-failure.test.ts
```

Expected: fail because the module/export does not exist. Zero discovered tests blocks progress.

- [ ] **Step 5: Implement only the exact reporter above and rerun until green.** Add JSDoc for behavior, the one-report invariant, owned-secret requirement, and the fact that sink failure is not converted into successful handling.
- [ ] **Step 6: Prove three local mutations separately:** replace `secrets` with `[]` and observe the secret assertion fail; replace `registerReportedFailure(reporting)` with `failure.caught` and observe provenance/occurrence correlation fail; invoke `logger.error` twice and observe exact-one fail. Restore exact bytes after each with `git diff`/`cmp`, rerun green, and add adjacent dated `Proof:` comments.
- [ ] **Step 7: Commit the independently reviewable reporter/spec slice.**

## Task 2: Make the controller boundary own one report

**Files:** Modify `ws.controller.ts`, `ws.controller.test.ts`, and `ws-cancellation.test.ts`.

**Consumes:** required `UnexpectedBackendFailureReporter`.

**Produces:** caught-value delivery after cancellation classification and before unchanged live failure mapping.

- [ ] **Step 1: Add a required recorder to the existing forward and resume rejection unit cases.** Forward must capture the exact thrown object once plus `{operation:'forward', connectionId:'c-1', clientId:'u-1'}` and keep the exact frame. Resume must capture its exact object once with operation `resume` and keep its exact three-frame sequence.
- [ ] **Step 2: Strengthen cancellation tests before production edits.** For both forward and resume, record reporter calls separately from `onBackendUnavailable`; after abort and rejection assert frames `[]`, failure metric calls `0`, and reports `[]`.
- [ ] **Step 3: Prove modeled paths remain silent.** Supply a reporter that increments the existing `dispatched` sentinel in every malformed-frame case, and explicit zero-call recorders for unknown subscription and successful forward/resume. Keep current frame, dispatch, subscription, replay-order, and acknowledgement assertions.
- [ ] **Step 4: Run controller tests red.**

```bash
cd apps/wbs/gw-01
bun test src/controller/ws.controller.test.ts src/controller/ws-cancellation.test.ts
```

Expected: required callback absent and/or rejection assertions receive no report.

- [ ] **Step 5: Add the required field and exact catch changes above.** Update every unrelated direct test call with `reportUnexpectedBackendFailure: () => undefined`; do not make the field optional and do not put a default inside the controller.
- [ ] **Step 6: Exhaustively inspect callers, then typecheck.**

```bash
rg -n "handleWsMessage\(" apps/wbs/gw-01/src
NX_DAEMON=false bunx nx run wbs-gw-01:typecheck --skip-nx-cache
```

Every call must visibly supply the required reporter. Expected: only `app.ts`, `ws.controller.test.ts`, and `ws-cancellation.test.ts` callers; typecheck passes.

- [ ] **Step 7: Watch four controller mutations separately:** omit the forward report; omit the resume report; move each report above the abort guard; pass a substitute error instead of `caught`. The relevant exact-one/exact-object or cancellation test must fail. Restore and add adjacent `Proof:` comments naming each observed failure.
- [ ] **Step 8: Commit the independently reviewable controller slice.**

## Task 3: Wire real secrets and prove the real WebSocket path

**Files:** Modify `app.ts`; create `failure-reporting.integration.test.ts`.

**Consumes:** reporter factory and optional `makeLogger` function argument.

**Produces:** one process reporter wired into the sole production controller call and a private-destination production integration oracle.

- [ ] **Step 1: Build a private logger harness in the new integration test.** The factory must record the exact `CreateLoggerOptions`, call the real `createLogger({...options,destination})`, and return an overload-preserving delegating logger whose `error(fields,message)` captures the registered `err` while forwarding. Do not replace `process.stdout.write` and do not mock the observability module.
- [ ] **Step 2: Write table cases for `forward` and `resume`, retaining raw events.** Build the real app with `localIdentity:'report-test'`, three distinct secrets, and `fetchImpl` that rejects the selected `/internal/forward` or `/internal/resume` request with one `Error` whose message/cause contain all three. Listen on port 0, open a real socket, retain each `MessageEvent.data` string before parsing it, wait for the parsed initial presence only as the readiness barrier, clear or index past that barrier, send the real frame, and wait for both the required raw operation frames and one log line. Never reconstruct expected bytes with `JSON.stringify` or discard raw strings after parsing.
- [ ] **Step 3: Assert production composition, safety, and correlation.** Factory options equal `{service:'gw-01', version, secrets:[internal,current,previous]}`. One structured logger call and one output line exist. The schema-valid record has the same nonempty occurrence id as the captured registered diagnostic/public pair, the live connection id, `user_id:'report-test'`, and the correct operation. Search the original raw log line and every original raw frame string for each of the three owned secrets and the raw error sentence; all must be absent. Parsed copies additionally prove the expected semantics and absence of data frames.
- [ ] **Step 4: Assert literal wire bytes and continuity.** The raw forward operation-frame array is exactly `['{"type":"error","code":"backend_unavailable","retry_after":5}']`. Resume uses the fixed project id `00000000-0000-4000-8000-000000000001` and points `{presence:3,'project:00000000-0000-4000-8000-000000000001':8}`; its raw operation-frame array is exactly, in order, `['{"type":"resume_denied","subscription":"presence","reason":"unavailable"}','{"type":"resume_denied","subscription":"project:00000000-0000-4000-8000-000000000001","reason":"unavailable"}','{"type":"resume_ack","replayed":{}}']`. Parse those same strings to assert the expected objects and no data frame. For both cases, send ping after failure, receive the literal `{"type":"pong"}`, and assert the socket remains open. Close socket and stop the app in `finally`.
- [ ] **Step 5: Add modeled production-path silence in the same app harness.** On a fresh real socket, send malformed JSON, unknown subscription, a successful forward, and a successful empty resume; preserve their existing exact frames/effects and assert no reporter record. Use a separate app/fetch behavior from the failure cases so a stale line cannot satisfy the assertion.
- [ ] **Step 6: Run the new integration test red.**

```bash
cd apps/wbs/gw-01
bun test src/failure-reporting.integration.test.ts
```

Expected: fail because `buildApp` ignores the second factory argument at runtime and the controller has no production reporter.

- [ ] **Step 7: Implement the exact `buildApp` composition above.** Pass the reporter to `handleWsMessage`. Do not change `AppOptions`, main, transport clients, controller frames, metric callbacks, or lifecycle hooks.
- [ ] **Step 8: Watch seven production mutations separately:** no-op the reporter supplied by `buildApp`; omit `internalAuthSecret` from reporter secrets; omit it from logger options; omit current or previous JWT key; log the caught value rather than the registered outcome; append the caught message to either frame; and temporarily reorder `wsResumeAck`'s object properties to `JSON.stringify({replayed,type:'resume_ack'})` without changing its parsed object. The composition, correlation, literal-byte, or secret assertions must fail for each mutation. The `wsResumeAck` edit is a proof-only mutation of the otherwise unowned shared builder and must not be committed. Restore exact bytes after each, rerun green, and add adjacent `Proof:` comments; the byte-only comment belongs beside the raw resume-array equality.
- [ ] **Step 9: Commit the independently reviewable composition/production-proof slice.**

## Task 4: Preserve deadlines, cancellation, auth, and replay behavior

**Files:** Modify `request-deadline.integration.test.ts` and `ws-auth.integration.test.ts`; no production file change is expected.

- [ ] **Step 1: Extend the existing real transport matrix with a private logger destination.** In every live deadline case, assert exactly one schema-valid reporter line with the correct forward/resume operation while keeping the existing one-call, transport-aborted, exact failure-frame, and ping assertions. In every close case, assert zero reporter lines while keeping no late frames, zero unavailable metric, zero dropped frame, transport abort, and shutdown assertions.
- [ ] **Step 2: Preserve success-shaped 503 mapping.** Add output capture to the existing resume-503 real-socket case; assert the exact unavailable denial plus empty ack remains, no replay is sent, and exactly one resume report is written. This is one failed backend attempt and therefore one record, even though two wire frames are sent for one subscription.
- [ ] **Step 3: Preserve pre-upgrade origin/token refusals through the real logger seam.** Refactor only the test harness as needed so the existing `refuses a valid cookie presented by a foreign origin` and `refuses an expired access cookie during the upgrade` cases each build a fresh real app with the same private logger factory/destination used above. Retain each real WebSocket's current refusal oracle (the socket never opens and emits the refusal error), retain the existing origin and verifier proof, and assert the captured output contains zero `gateway backend request failed` records. Use a fresh destination per case and wait through refusal completion before the zero-line assertion; a stale record from another app must not satisfy or contaminate it.
- [ ] **Step 4: Preserve identity failure as a controlled policy close.** Add private logger capture to `closes a socket whose identity fails the recheck instead of serving it as anon`; retain code 1008 and no received frames, and assert no `gateway backend request failed` line. Do the same for the in-flight-frame identity recheck case if its existing harness shares no destination.
- [ ] **Step 5: Run the lifecycle group.**

```bash
cd apps/wbs/gw-01
bun test src/request-deadline.integration.test.ts src/ws-auth.integration.test.ts src/controller/ws-cancellation.test.ts
```

Expected: all pass; timeout cases log once, close, foreign-origin, expired-token, and identity cases never log, and all pre-existing lifecycle assertions stay green.

- [ ] **Step 6: Watch real-path negatives separately:** move reporting above the abort guard and observe closed transport cases log; remove close abort and observe the existing real cancellation timing fail; route resume rejection through forward's frame and observe exact resume assertions fail; report identity-recheck rejection and observe the policy-close zero-log assertion fail; report once per resume subscription and observe the one-record assertion fail. Separately inject `logger.error({},'gateway backend request failed')` into the foreign-origin refusal branch and then the invalid/expired-token catch in `beforeHandle`; each corresponding real-upgrade zero-line assertion must fail while the refusal remains otherwise unchanged. These two direct logger calls are proof-only mutations because the final pre-upgrade branches do not own the backend reporter. Restore exact bytes after every mutation, rerun green, and add adjacent `Proof:` comments beside the zero-line assertions for origin, expired token, and identity recheck.
- [ ] **Step 7: Commit the lifecycle regression slice.**

## Task 5: Record evidence and close only gateway scope

**Files:** Modify `openspec/changes/adopt-failure-reporting/tasks.md` and `verify.md`.

- [ ] **Step 1: Preserve task 2.1's authoritative wording.** Do not replace or shorten its focused-target and negative obligations. Remove only a stale ownership suffix if it still exists. Add a granular checked gateway subtask that names the real WebSocket forward/resume cases, exact frames, secret/correlation proof, and cancellation negatives. Leave backend and MCP subtasks at their actual state.
- [ ] **Step 2: Record evidence in `verify.md`.** Include immutable implementation SHA, command, exit, discovered/pass counts, and one row per mutation with the changed production expression, named failing test, observed mismatch, restoration method, and green rerun. Do not mark a mutation watched from a proposed expectation.
- [ ] **Step 3: Run focused verification.**

```bash
cd apps/wbs/gw-01
bun test src/controller/unexpected-backend-failure.test.ts src/controller/ws.controller.test.ts src/controller/ws-cancellation.test.ts src/failure-reporting.integration.test.ts src/request-deadline.integration.test.ts src/ws-auth.integration.test.ts
cd ../../..
NX_DAEMON=false bunx nx run wbs-gw-01:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-gw-01:lint --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-gw-01:build --skip-nx-cache
bunx openspec validate adopt-failure-reporting --strict --json
```

- [ ] **Step 4: Run the whole gateway target once after focused green.**

```bash
NX_DAEMON=false bunx nx run wbs-gw-01:test --skip-nx-cache
```

This is the regression oracle for fan-out, ingress decoding, auth, presence races, replay, deadlines, socket writing, and internal push. Record exact results. Do not substitute it for the named focused tests or mutation observations.

- [ ] **Step 5: Inspect downstream log consumers without editing them unless an actual incompatibility appears.**

```bash
rg -n "occurrence_id|fingerprint|connection_id|user_id|backend_operation|err\." tools/tool-observability-stack deploy docs --glob '!**/node_modules/**'
```

The new field is additive and `LogRecord` already permits it. If a consumer enumerates fields exhaustively, stop and amend ownership rather than silently widening this packet.

- [ ] **Step 6: Run the repository gate only at final integrated batch closure.** Use `bin/h2puni-gate.sh <immutable-sha>` under the canonical host lock; do not run a raw full Nx gate. Record any skipped/unavailable check exactly.

## Required production-path negatives

| Guarantee                        | Injected fault                                                                                                                       | Test that must fail                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| One owned occurrence             | Skip reporter or log raw caught value                                                                                                | Real forward/resume correlation case                               |
| Exactly once                     | Call reporter twice or once per resume subscription                                                                                  | One-line/one-call assertions                                       |
| Secret safety                    | Empty reporter policy; omit each owned secret; append cause to frame                                                                 | Real secret-bearing WebSocket case                                 |
| Forward wire compatibility       | Change code, retry field, type, add detail, reorder keys, or add whitespace                                                          | Literal raw forward-byte equality plus parsed semantic assertion   |
| Resume wire/replay compatibility | Change denial reason/order, omit ack, emit data, use forward frame, or reorder `wsResumeAck` keys without changing its parsed object | Literal raw resume-sequence equality plus parsed no-data assertion |
| Open socket behavior             | Close after mapped failure or omit ping handling                                                                                     | Ping-after-failure/open-state assertion                            |
| Cancellation silence             | Report above `signal.aborted` guard                                                                                                  | Unit and real close cases                                          |
| Shutdown cancellation            | Remove `conn.cancellation.abort(...)`                                                                                                | Existing real transport cancellation timing                        |
| Origin refusal is modeled        | Emit the reporter message directly from the foreign-origin `beforeHandle` branch                                                     | Real refused-upgrade/no-log origin case                            |
| Expired-token refusal is modeled | Emit the reporter message directly from the invalid-token `beforeHandle` catch                                                       | Real refused-upgrade/no-log expired-token case                     |
| Identity recheck is modeled      | Report identity recheck failure                                                                                                      | 1008/no-log auth integration case                                  |
| Invalid input is modeled         | Invoke reporter before/for schema refusal                                                                                            | Malformed-frame zero-report case                                   |
| Real composition                 | Pass no-op reporter or ignore logger factory                                                                                         | Real `buildApp` case                                               |
| Secret wiring                    | Omit logger/reporter secret values                                                                                                   | Factory-options and leak assertions                                |
| Reporting loss visible           | Bypass guarded report/registration                                                                                                   | Revoked-cause reporter case                                        |

## Dependencies, conflicts, and decisions

- **Hard dependency:** 040.5 must be integrated. This packet consumes the exact serializer provenance registry and log schema; duplicating either in gw-01 is forbidden.
- **No dependency on 040.7 or 040.8:** gateway production files are disjoint. If 040.7 has landed, mirror its tested logger-factory and delegating-logger helper shape rather than introducing a shared runtime abstraction.
- **Record conflict with 040.8:** both packets append to `adopt-failure-reporting` spec/tasks/verify. Land or rebase them serially, preserve both requirements and all original task 2.1 clauses, and rerun strict OpenSpec validation. Do not resolve by marking the other boundary complete.
- **Future gateway/MCP DI work:** this reporter is an ordinary function dependency and can later be registered by 040.6/050.7-adjacent composition work. This packet does not introduce a bag or move transport ownership.
- **Resolved routine choice:** report every live rejection that reaches the existing forward/resume catch (network, timeout, non-2xx, malformed trusted body, or other thrown value). The public wire already models all of them as unavailable; the accepted reporting rule requires the owning boundary to retain the diagnostic cause. Cancellation is distinguished by the existing connection signal and remains silent.
- **Resolved routine choice:** one resume attempt produces one report even when it produces multiple unavailable denial frames. Correlation is by diagnostic occurrence plus `connection_id`; `user_id` and fixed `backend_operation` aid operator search. No occurrence crosses the WS disclosure boundary.
- **Unresolved user/design decisions:** none. Any proposal to disclose an occurrence id to clients, classify transport errors into new frame codes, retry forwards, log authentication failures, or report socket send drops changes accepted runtime behavior and requires a separate design decision rather than expansion of 040.9.

## Completion criteria

040.9 is complete only when both real forward and resume paths emit one schema-valid redacted record through the actual reporter and serializer, exact legacy frames and replay ordering remain, live sockets still ping, real close cancellation emits nothing and aborts transport, modeled input/auth outcomes emit nothing, every new guard has a watched production mutation recorded, focused checks and the whole gateway target pass, and the OpenSpec ledger closes only gateway scope. The final host gate remains batch-closure evidence, not a substitute for these proofs.
