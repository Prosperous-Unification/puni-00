# MCP unexpected tool-failure reporting implementation plan

> **For agentic workers:** Use `executing-plans` to implement this plan task by task. Checkboxes
> describe future work. Run one mutation at a time and retain its red output, patch, byte restore,
> and green rerun.

**Work item:** WBS 040.8, `4ad30250-f7b1-4969-aa00-066174e80899`.

**Goal:** An unexpected failure during an MCP tool call produces exactly one sanitized diagnostic
operator record and one correlated generic tool error. Correctable tool input, declared be-01 4xx
refusals, authentication/session outcomes, unknown-tool protocol errors, and successful tool
results retain their current protocol and useful text.

**Architecture:** Classify correctable local input failures at their source in `wbs-client.ts`.
Keep modeled branches ahead of one catch boundary in the SDK `tools/call` handler. That boundary
calls one application-local reporter which makes one `reportFailure` call, registers the resulting
outcome for the Pino serializer, logs once, and returns only a public disclosure to the agent.
`main.ts` constructs one logger/policy and passes the reporter into every per-request SDK server.
Do not catch around the whole Streamable HTTP transport: malformed JSON-RPC and SDK protocol
errors belong to the SDK and a broad catch would silently replace its protocol.

**Authority:**

- `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`, amended 2026-09-19, especially
  rules 3 and 5 and slice 3.
- `openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md` and task 2.1.
- The accepted 040.7 backend packet for the one-call reporting/serializer provenance pattern.
- Live MCP behavior in `apps/wbs/mcp-01/src/{wbs-client,server,http,main}.ts` and their tests.

## Established behavior and boundary choice

Source-inspected on batch integration `5b52590f`:

- `createServer` installs the low-level SDK `CallToolRequestSchema` handler. An in-memory linked
  transport already tests this exact production factory and the client-observed tool envelope.
- Unknown names throw `McpError(ErrorCode.InvalidParams, ...)`. They remain JSON-RPC protocol
  errors and must not become tool content or operator incidents.
- `callTool` returns every be-01 non-2xx as `ToolTextResult.isError`, but currently throws plain
  `Error` for local request construction, fetch rejection, body-read rejection, and malformed
  successful JSON. `server.ts` catches all of them together and exposes `cause.message`.
- `UpstreamRejected` and `EdgeGate` are modeled authentication/deployment outcomes with explicit
  recovery text. The former may end an MCP OAuth session. Preserve both branches exactly.
- Declared be-01 4xx bodies carry correction vocabulary such as `number_is_derived`, batch `at`
  and `kind`, and directory usage. Preserve those result envelopes and body text. A 5xx, redirect,
  fetch rejection, unreadable body, or non-JSON 2xx is an unexpected upstream/decoder failure;
  none may send its raw body or exception text to the agent.
- `mcpHttpResponse` owns routing and 401 challenge behavior, then awaits the SDK transport. It is
  not the tool-call failure boundary. Health, metadata, OAuth routes, malformed JSON-RPC, and SDK
  lifecycle errors are outside this packet.
- The integrated observability serializer already accepts a registered `FailureReporting` and
  writes only its diagnostic report. `ServiceName` and `LogRecord.service` still omit `mcp-01`.
- mcp-01's process-owned tool-path secret is `WBS_BASIC_AUTH`. Caller bearer tokens are request
  scope and must never be copied into report context. Do not pass config, request, headers,
  `AuthInfo`, URL, arguments, response, or environment as reporting context.

## Exact public behavior

Preserve these existing forms:

- unknown tool: rejected JSON-RPC request with `InvalidParams` and current `tools/list` guidance;
- local correctable input: `isError: true`, one text part containing the current specific message;
- `UpstreamRejected` and `EdgeGate`: current `isError: true` recovery text and session behavior;
- declared be-01 4xx: current `isError: true` status/code/body text;
- success: unchanged body/no-content result.

For an unexpected call failure, return exactly the existing MCP result envelope:

```ts
{
  content: [{
    type: 'text',
    text: `${tool.name} could not be called: ${disclosure.sentence}. Reference ${disclosure.occurrenceId}.`,
  }],
  isError: true,
}
```

For a successful report, `sentence` is the public report's generic `Something went wrong` and
`occurrenceId` is its `AE_…` identifier. For reporting loss, use fixed sentence
`the failure could not be described` and the returned `UNREPORTED_…` handle. Do not include the
diagnostic report, stack, cause, thrown string, upstream body, fingerprint, request arguments,
caller identity, or bearer token. The correlation handle is intentionally agent-visible; the
operator record carries the same occurrence.

## File ownership

Create:

- `apps/wbs/mcp-01/src/unexpected-tool-failure.ts`
- `apps/wbs/mcp-01/src/unexpected-tool-failure.test.ts`
- `apps/wbs/mcp-01/src/main.test.ts`

Modify behavior:

- `apps/wbs/mcp-01/src/wbs-client.ts`
- `apps/wbs/mcp-01/src/wbs-client.test.ts`
- `apps/wbs/mcp-01/src/server.ts`
- `apps/wbs/mcp-01/src/server.test.ts`
- `apps/wbs/mcp-01/src/main.ts`
- `libs/wbs/adapters/observability/src/logger.ts`
- `libs/wbs/adapters/observability/src/log-schema.ts`
- `libs/wbs/adapters/observability/src/logger.test.ts`

Modify records:

- `openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md`
- `openspec/changes/adopt-failure-reporting/tasks.md`
- `openspec/changes/adopt-failure-reporting/verify.md`

Explicitly unowned: `http.ts`, OAuth behavior, caller authentication, shared failure-reporting
implementation, backend/gateway/frontend code, DI Bag composition, OpenAPI derivation, package
versions, deployment configuration, and tool-devsync files.

Sequence this packet after 040.7, or rebase before starting: both packets update the same OpenSpec
task/verification files. The MCP implementation has no technical dependency on the backend
boundary, but concurrent edits there create needless evidence and merge ambiguity.

## Interfaces

Add one modeled local exception next to request construction. Use the accepted `defineException`
convention because the SDK boundary consumes its stable owner-local identity. Its details describe
only the rejected construction fact; they never retain the whole input, arguments object, request,
config, or a secret:

```ts
import { defineException } from 'application-exception';

type ToolInputRefusalDetails =
  | {
      readonly kind: 'undeclared_input';
      readonly toolName: string;
      readonly inputName: string;
      readonly declaredNames: readonly string[];
    }
  | {
      readonly kind: 'missing_path';
      readonly toolName: string;
      readonly parameterName: string;
      readonly path: string;
    }
  | {
      readonly kind: 'non_scalar_url';
      readonly toolName: string;
      readonly parameterName: string;
      readonly location: 'path' | 'query';
      readonly receivedType: string;
    };

/** A tool input mcp-01 can explain and the caller can correct. */
export const ToolInputRefused = defineException({
  tag: 'wbs/mcp/ToolInputRefused',
  message: (details: ToolInputRefusalDetails) => toolInputRefusalMessage(details),
});
```

Implement `toolInputRefusalMessage` as an exhaustive switch that returns the three current
sentences exactly. For `undeclared_input`, derive the current `no inputs`/comma-joined declaration
text from `declaredNames`; for `non_scalar_url`, retain the location twice and `receivedType`; for
`missing_path`, retain the original template path. An unreachable discriminant throws. Do not add
a public policy to this kind.

Use it for all three local input families: undeclared input, missing path parameter, and
non-scalar path/query value. Do not classify `SyntaxError`, `TypeError`, every `Error`, an SDK
`McpError`, or a remotely supplied `_tag` as modeled. Construct it with
`new ToolInputRefused({ details: ... })` at those three owner-local sites and keep the current
sentences byte-for-byte.

The application-local reporting contract is:

```ts
import type { Logger } from '@wbs/contracts';

export interface UnexpectedToolDisclosure {
  readonly sentence: string;
  readonly occurrenceId: string;
}

export type UnexpectedToolFailureReporter = (caught: unknown) => UnexpectedToolDisclosure;

export function createUnexpectedToolFailureReporter(
  logger: Logger,
  secrets: readonly string[],
): UnexpectedToolFailureReporter;
```

Its implementation calls `reportFailure` once. It logs exactly once with:

```ts
logger.error({ err: registerReportedFailure(reporting) }, 'unexpected MCP tool failure');
```

It then selects only `reports.public.message` and `reports.public.occurrence_id`, or the fixed
reporting-loss sentence and local handle. Never return `FailureReporting` to the SDK handler.

Make the reporter required in `ServerDeps`:

```ts
readonly reportUnexpectedToolFailure: UnexpectedToolFailureReporter;
```

Tests and production must state the dependency; do not add an optional default or module-global
logger.

## Task 0: Rebase and preflight

- [ ] Start only after batch 3 and 040.5 are present; preferably after 040.7. Record `git rev-parse HEAD` in the attempt report. Re-read all owned files because line numbers and test totals are
      observations, not requirements.
- [ ] Confirm `@shared/failures` exports `createFailureRedaction`, `FailureReporting`, and
      `reportFailure`; confirm `@wbs/observability` exports `createLogger`, `LogRecord`, and
      `registerReportedFailure`.
- [ ] Confirm `createServer` still owns the `CallToolRequestSchema` handler, `server.test.ts` still
      uses `InMemoryTransport.createLinkedPair`, and `mcpHttpResponse` still delegates `/mcp` to
      the SDK transport after auth. Stop if any is false and revise the boundary from live code.
- [ ] Record focused baselines:

```sh
cd apps/wbs/mcp-01
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/wbs-client.test.ts src/server.test.ts src/http.test.ts
cd ../../..
NX_DAEMON=false bunx nx run wbs-observability:test --skip-nx-cache
```

## Task 1: Specify the MCP boundary and classify modeled input

**Files:** failure-reporting delta spec, `wbs-client.ts`, `wbs-client.test.ts`.

- [ ] Append this requirement to the existing delta spec before production edits:

```markdown
### Requirement: An unexpected MCP tool failure is reported once and disclosed generically

The MCP tool-call boundary SHALL preserve its tool-result envelope, SHALL disclose only a generic
public sentence and correlation handle for an unexpected call failure, and SHALL write exactly
one correlated sanitized diagnostic operator record. Correctable local input failures, declared
upstream 4xx refusals, authentication/session outcomes and unknown-tool protocol errors SHALL keep
their existing classification and useful public text and SHALL NOT write an unexpected-failure
record.

#### Scenario: A local tool input is invalid

- **GIVEN** a known tool call has an undeclared input, a missing path parameter or a non-scalar URL value
- **WHEN** mcp-01 handles the call
- **THEN** it returns the existing correctable `isError` tool content
- **AND** no unexpected-failure operator record is written

#### Scenario: be-01 returns a declared refusal

- **GIVEN** be-01 returns a 4xx refusal carrying its correction code and details
- **WHEN** mcp-01 handles the call
- **THEN** the existing `isError` tool content retains the status, code and useful body
- **AND** no unexpected-failure operator record is written

#### Scenario: a tool transport or successful-response decoder fails

- **GIVEN** fetch rejects, response-body reading rejects, a non-4xx response fails, or a successful body is not JSON
- **WHEN** the SDK tool-call boundary handles the failure
- **THEN** it returns one `isError` text result containing the generic public sentence and reference
- **AND** the agent receives no content read from the caught value or upstream body
- **AND** one operator record carries the sanitized diagnostic report under the same occurrence identifier

#### Scenario: reporting cannot inspect an unexpected failure

- **GIVEN** an unexpected call failure the report library cannot inspect
- **WHEN** the tool-call boundary handles it
- **THEN** it returns fixed loss text with a local correlation handle without throwing
- **AND** one operator record visibly records the reporting loss
```

- [ ] Add test-first assertions that all three `buildRequest` refusal cases are
      `ToolInputRefused`, carry the expected minimal discriminated details, retain their exact
      complete messages, and make no fetch call.
- [ ] Define `ToolInputRefused` with `defineException` and replace only the three named construction
      throws. Preserve all current messages. Do not migrate the pre-existing `UpstreamRejected` or
      `EdgeGate` classes in this packet.
- [ ] Change response classification: statuses 400–499 continue through `refusal`; every other
      non-2xx status throws an unexpected response error. Its diagnostic may name tool, status,
      method/path, and carry the raw body as its cause, but it has no public policy. Do not put the
      request URL, headers, token, or arguments in it.
- [ ] Keep malformed successful JSON throwing. Add tests for a secret-bearing 500 body and a
      secret-bearing malformed 200 body; at this layer both reject, and neither is yet converted
      into agent content.
- [ ] Replay one owner-identity fault before committing: replace one family (use non-scalar URL)
      with plain `Error`. Its named test must show that this family is no longer
      `ToolInputRefused` while the undeclared-input and missing-path cases remain modeled. Restore
      byte-for-byte, rerun green, and add the adjacent `Proof:` comment.
- [ ] Run `wbs-client.test.ts`; record actual totals. Run typecheck and lint before commit.
- [ ] Commit: `refactor(wbs-mcp): classify correctable tool inputs`.

## Task 2: Add mcp-01 to the operator log contract and build the one-call reporter

**Files:** observability logger/schema/test; new unexpected reporter and test.

- [ ] Extend `ServiceName` and `LogRecord.service` with exactly `'mcp-01'`. Add a real
      `createLogger({ service: 'mcp-01', secrets, destination })` test and validate its parsed line
      with `LogRecord`. Do not widen service to arbitrary `string`.
- [ ] Write `unexpected-tool-failure.test.ts` first. Use the real logger and a private destination,
      plus an overload-safe delegating `Logger` that captures the exact `err` object and forwards
      once. For `new Error('fetch exposed boundary-secret')`, assert:
  - one logger call and one line;
  - no secret in the line or disclosure;
  - registered input is `FailureReporting` with `reported: true`;
  - public and diagnostic occurrence ids agree;
  - disclosure is `Something went wrong` plus that same id;
  - parsed `LogRecord.err` carries the diagnostic occurrence and fingerprint.
- [ ] Add a reporting-loss case using an `Error` whose cause is a revoked proxy. Assert no throw,
      one line, fixed sentence, `UNREPORTED_…` handle, and parsed `{ reported:false, occurrence_id, reason }`.
- [ ] Observe the missing-module red, implement the exact interface, rerun both tests, then run:

```sh
NX_DAEMON=false bunx nx run wbs-observability:test --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-observability:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-observability:lint --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-mcp-01:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-mcp-01:lint --skip-nx-cache
```

- [ ] Commit: `feat(wbs-mcp): compose unexpected tool reports`.

## Task 3: Route the real SDK tool handler without changing modeled outcomes

**Files:** `server.ts`, `server.test.ts`; mechanical updates to direct `createServer` test callers.

- [ ] Extend the existing `connected` helper with a required reporter argument or a local default
      no-op used only by tests that do not fail. The production `ServerDeps` member remains
      required.
- [ ] Add tests through the linked SDK client before changing the handler:
  1. undeclared input returns the current specific `isError` text and reporter calls remain zero;
  2. declared 409 batch refusal retains code, `at`, and `kind`, reporter zero;
  3. `UpstreamRejected` retains session end/re-authorize behavior, reporter zero;
  4. `EdgeGate` retains its remedy, reporter zero;
  5. unknown tool remains a rejected `InvalidParams` protocol error, reporter zero;
  6. fetch rejects with `Error('connect alice@example.com boundary-secret')`: result is exactly
     one `isError` text part with `Something went wrong` and the reporter's reference, contains
     neither secret nor email, reporter exactly once;
  7. a 500 body carrying the same markers follows the same generic path;
  8. a malformed 200 body carrying the same markers follows the same generic path;
  9. a 302 response with a marker-bearing body follows the same generic path rather than the
     declared-refusal path;
  10. a `Response` subclass whose overridden `text()` rejects with a marker-bearing error follows
      the same generic path; the report receives that exact rejection and agent content contains
      none of its text;
  11. reporter returning the fixed loss disclosure still yields one tool result and does not reject.
- [ ] Run the modeled cases first as green controls and the unexpected cases as red. Zero tests or
      any changed modeled assertion is a stop.
- [ ] In the handler catch, branch in this order: `UpstreamRejected`, `EdgeGate`,
      `ToolInputRefused`, then unexpected. Preserve the first two blocks byte-for-byte apart from
      movement needed by imports. The `ToolInputRefused` branch uses its current message. The final
      branch calls the reporter once and formats the exact public text declared above.
- [ ] Do not catch the unknown-tool `McpError`: it is thrown before the `try`. Do not move the try
      around the whole request handler or transport.
- [ ] Watch the two newly classified failure paths separately. First retain the old refusal path
      for 3xx and require the linked-SDK 302 case to expose the marker/skip the reporter. Restore.
      Then catch `response.text()` rejection in `callTool` and return it as raw error text; require
      the unreadable-body case to leak/skip the reporter instead of returning one generic
      correlated result. Restore exact bytes, rerun green, and add adjacent `Proof:` comments.
- [ ] Run `server.test.ts`, then the focused trio from Task 0, followed by MCP typecheck and lint.
      Record actual totals.
- [ ] Commit: `feat(wbs-mcp): report unexpected tool-call failures`.

## Task 4: Wire the production entrypoint and prove its composition

**Files:** `main.ts`, new `main.test.ts`.

- [ ] Refactor `main.ts` just enough to export `startMcpApplication(deps = productionDeps)` and
      guard the side effect with `if (import.meta.main)`. The dependency record supplies the
      existing config/document/OAuth/start functions plus `createLogger` and the existing optional
      `FetchLike` seam; production leaves `fetchImpl` undefined so `callTool` uses global `fetch`.
      Defaults are the real imports. Do not introduce DI Bag, a second server factory, or a cached
      caller credential.
- [ ] Keep every production operation inside that function: load config, derive tools, create the
      logger/policy, create OAuth, choose verifier, call `startHttpServer`, and emit the startup
      record. The returned value may expose only `{ port, toolCount }` for the test; it must not
      expose secrets or the reporter.
- [ ] Build the secrets list once from nonempty process-owned values. For this packet that is
      `config.WBS_BASIC_AUTH`; include another value only if the live refactored config explicitly
      owns it. Never include the caller bearer token or the whole environment.
- [ ] Construct one logger:

```ts
const logger = makeLogger({ service: 'mcp-01', secrets });
const reportUnexpectedToolFailure = createUnexpectedToolFailureReporter(logger, secrets);
```

Use the logger for the existing OAuth audit and startup line as structured records. Preserve
their facts; do not log config values or credentials. Every per-request `createServer` closure
receives the same reporter.

- [ ] `main.test.ts` calls the exported production function with fakes and no bound port. Its fake
      `startHttpServer` captures the real server factory. Assert the logger factory receives
      `service: 'mcp-01'` and the exact Basic credential list. Invoke the captured factory and
      connect it to the existing in-memory SDK pair. Do **not** provide the test-only
      `callerTokenOf`: this case must exercise the production `extra.authInfo.token` path.
- [ ] Give the client side of that pair complete transport authentication metadata before connect:

```ts
const authInfo: AuthInfo = {
  token: 'production-upstream-token',
  clientId: 'production-wiring-test',
  scopes: [],
};
const send = clientTransport.send.bind(clientTransport);
clientTransport.send = (message, options) => send(message, { ...options, authInfo });
```

      This uses `InMemoryTransport.send`'s installed `authInfo` option, which becomes the SDK
      handler's `extra.authInfo`; it does not add a production seam. Make the injected fetch count
      calls, assert exactly one, and assert its `authorization` header is exactly
      `Bearer production-upstream-token`. Then reject with one retained `Error` whose message has a
      non-secret sentinel plus the Basic credential. Assert the captured registered diagnostic is
      for that sentinel-bearing rejection (with the credential redacted), one sanitized logger
      line is written, and the generic tool result carries the same occurrence. A missing-auth
      failure before fetch must therefore fail the call-count/header/diagnostic assertions rather
      than satisfy the public-envelope assertions vacuously. This is the production wiring proof;
      a parallel hand-built `createServer` graph is insufficient.

- [ ] Replay the production-auth fault: remove the transport `authInfo` injection (or drop token
      forwarding in `server.ts`) and require the production-wiring case to fail on fetch count zero
      and the absent authorization header. Restore exact bytes and rerun green before recording the
      adjacent proof.
- [ ] Add a second production-wiring case with `WBS_BASIC_AUTH` absent and assert `secrets: []`.
      Assert OAuth audit and startup records do not use raw `console.error`.
- [ ] Run the named production test red before wiring, then the whole file and MCP static/build
      checks:

```sh
cd apps/wbs/mcp-01
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/main.test.ts -t 'reports one unexpected production tool failure under its shared occurrence'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/main.test.ts
cd ../../..
NX_DAEMON=false bunx nx run wbs-mcp-01:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-mcp-01:lint --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-mcp-01:build --skip-nx-cache
```

- [ ] Commit: `feat(wbs-mcp): wire the tool failure boundary`.

## Task 5: Replay safety faults and close only MCP adoption

Save passing bytes before each fault. Apply one mutation, save its patch and output, require the
named test to fail for the named fact, restore with `cmp`, rerun green, then add an adjacent
`Proof:` comment. Do not leave injected faults or combine them.

| ID  | Production fault                                                                                | Named observation                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Change the `ToolInputRefused` catch to the final unexpected branch                              | correctable undeclared input becomes generic and writes one operator record instead of preserving its message with zero records |
| M2  | Let a 500 response pass through `refusal`                                                       | secret-bearing 500 body reaches agent content and reporter count is zero                                                        |
| M3  | In the unexpected branch, format `cause.message`/`String(cause)`                                | secret-bearing fetch failure reaches the tool result                                                                            |
| M4  | Delete the reporter call                                                                        | unexpected SDK round trip receives no public disclosure/reference or operator record                                            |
| M5  | Call the reporter twice                                                                         | reporter/logger count is two; proves log-once rather than at-least-once                                                         |
| M6  | Remove `registerReportedFailure` before logging                                                 | parsed operator occurrence differs from the public disclosure occurrence, proving the serializer made a second report           |
| M7  | Build reporter redaction with `[]`                                                              | process-owned Basic credential survives in the diagnostic line                                                                  |
| M8  | Remove `mcp-01` from `LogRecord.service` after leaving the logger union widened                 | real MCP log line fails schema validation                                                                                       |
| M9  | In production composition pass `() => ({ sentence: 'x', occurrenceId: 'x' })` to `createServer` | `main.test.ts` sees no sanitized operator line from the captured real server factory                                            |
| M10 | Move the `McpError` unknown-tool branch inside the unexpected catch                             | unknown tool becomes an `isError` result/operator incident instead of the existing rejected `InvalidParams` protocol error      |
| M11 | Replace the non-scalar `ToolInputRefused` construction with plain `Error`                       | only the non-scalar family loses its modeled constructor/details while the other two remain modeled                             |
| M12 | Send 3xx through the old `refusal` branch                                                       | linked-SDK 302 case exposes its marker and records no unexpected failure                                                        |
| M13 | Convert `response.text()` rejection directly to raw tool error content                          | linked-SDK unreadable-body case leaks/reports zero instead of returning one generic correlated result                           |
| M14 | Remove authenticated transport metadata or drop production caller-token forwarding              | captured production factory makes zero fetch calls or omits the exact Bearer header                                             |

- [ ] Record every red diagnostic, patch, restore status, green status, and actual totals in
      `openspec/changes/adopt-failure-reporting/verify.md`.
- [ ] Add adjacent proof comments at the exact checks: M1 beside `ToolInputRefused` routing; M2
      beside 4xx classification; M3/M4/M5 beside unexpected reporting/formatting; M6 in reporter;
      M7 in production secret composition; M8 at log schema; M9 at main's server factory; M10
      before unknown-tool protocol throw; M11 beside the non-scalar modeled construction; M12
      beside redirect classification; M13 beside body consumption; M14 beside the production
      authenticated transport proof.
- [ ] Update task 2.1 without erasing backend history. If 040.7 and this packet complete all three
      named adoption parts (serializer/schema, backend, MCP), tick 2.1. Otherwise split its ledger
      text and leave the remaining part unchecked. Do not tick browser task 3.1 or frontend 4.1.
- [ ] Run final focused gates:

```sh
cd apps/wbs/mcp-01
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test \
  src/wbs-client.test.ts src/server.test.ts src/http.test.ts \
  src/unexpected-tool-failure.test.ts src/main.test.ts
cd ../../..
NX_DAEMON=false bunx nx run wbs-mcp-01:test --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-mcp-01:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-mcp-01:lint --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-mcp-01:build --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-observability:test --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-observability:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-observability:lint --skip-nx-cache
GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all
```

- [ ] Run the exact focused strict OpenSpec command and require its JSON result to report zero
      failures:

```sh
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate adopt-failure-reporting --strict --json
```

      If the installed CLI rejects that focused syntax, stop in preflight, record `--help`, and
      amend this packet with the supported focused equivalent rather than skipping validation.
      The final batch gate's `openspec validate --all --json` remains required and does not replace
      this focused check. Stage the OpenSpec files before any whole `tool-devsync:test` command
      because its committed/staged contract does not certify unstaged bytes.

- [ ] Run `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache` only under the host heavy reservation. Do not run a raw full Nx gate.
- [ ] Commit verification records: `docs(openspec): record the MCP failure boundary proofs`.
- [ ] After independent review, the integration owner runs `bin/h2puni-gate.sh <sha>` under its
      canonical lock. The lane does not check out the gate SHA or run raw full host gates.

## Review checklist

- Every unexpected tool failure makes one `reportFailure` call and one operator log line.
- The public reference and diagnostic record share one occurrence identifier.
- No raw caught value, 5xx body, stack, cause, arguments, request, config, identity, or token enters
  agent content.
- `ToolInputRefused`, 4xx refusals, `UpstreamRejected`, `EdgeGate`, unknown tools, and successful
  results retain their existing distinct behavior.
- Only statuses 400–499 use the existing refusal passthrough; redirects and 5xx are unexpected.
- The SDK's JSON-RPC/parser behavior is untouched because no broad HTTP transport catch was added.
- `mcp-01` log lines validate against the closed service union.
- Production `main` wiring is exercised through the captured real server factory, not inferred
  from a unit-only reporter graph.
- Caller credentials remain request scoped. The root owns no cached Bearer token.

## Unresolved decision notes

- **No blocking SDK uncertainty remains for the tool boundary.** The installed low-level SDK
  handler and linked in-memory transport provide a real, tested seam for returning `CallToolResult`.
  This packet intentionally does not claim ownership of exceptions thrown before the tool handler
  (SDK JSON-RPC parsing, connect/close, or OAuth/HTTP routing).
- Confirm the live base after 040.7 before implementation. If 040.7 already adds `mcp-01` to the
  observability service union or changes task 2.1 wording, treat those lines as satisfied and do
  not duplicate them.
- The packet fixes the unexpected agent text to generic sentence plus reference. Changing that to
  serialized public-report JSON would be a new agent protocol decision and requires an explicit
  spec amendment; do not improvise it during implementation.
