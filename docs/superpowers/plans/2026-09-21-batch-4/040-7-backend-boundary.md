# Backend Unexpected-Error Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Work item:** WBS 040.7, `555acf68-b7cf-436a-966c-79b255122730`.

**Goal:** Every unexpected failure owned by the mounted be-01 HTTP boundary returns the existing generic 500 response and writes exactly one redacted, bounded, correlated diagnostic record to the operator logger.

**Architecture:** Build one backend reporter per application composition from the logger and the secrets that composition owns. It calls `reportFailure` once, registers that exact outcome with `registerReportedFailure`, and logs it once; the serializer therefore writes the same diagnostic occurrence instead of reporting the outcome object again. `mountEndpoints` receives that reporter as a required dependency and invokes it only from its selected-request global error hook.

**Tech Stack:** Bun 1.4.x, TypeScript, Elysia, ArkType, `@shared/failures`, `@wbs/observability`, Nx, OpenSpec.

**Spec:** `openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md`, task 2.1, and the amended `docs/superpowers/plans/2026-09-17-personal-package-adoption.md` slice 3.

## Global constraints

- Base execution only after batch 3 is integrated and 040.5 is present. Re-read the live files before editing; cited live locations below describe integration `5b52590f`.
- Preserve `500`, content type, and exact body `Internal Server Error`. Do not add an occurrence header or response field: the accepted design says application adoption does not change public protocols.
- Preserve every modeled 4xx, parser, auth, 404, and declared-refusal path. They are returned outcomes, not unexpected failures, and must not produce this operator record.
- Keep the existing selected-request isolation: errors from unrelated parent routes remain owned by the parent Elysia application.
- Never attach request, headers, environment, config, body, URL query, or principal objects as report context. The reporter receives only the caught value.
- `internalAuthSecret` is the caller-owned secret available at this composition boundary. Sensitive-name rules remain supplied by `@shared/failures`; arbitrary arriving tokens are not copied into context.
- Build one redaction policy when composing the application, never per failure. Call `reportFailure` once per occurrence and pass only `registerReportedFailure(reporting)` as `err`.
- Do not change `FailureReporting`, `Logger`, serializer/schema formats, exception kinds, endpoint shapes, response envelopes, DI composition, gateway behavior, or MCP behavior.
- Every new safety assertion needs a watched production-path negative, byte restoration, a green rerun, and an adjacent `Proof:` comment naming the injected fault and observed failure.
- Bun and Nx only. A focused filter that runs zero tests is a stop, not evidence.

## What is established and what is inferred

Source-inspected on `dab0535e`:

- `mountEndpoints` owns a global `onError` hook isolated by its `WeakMap<Request, Admission>`. It currently ignores the caught error and returns the exact generic 500 response.
- `buildApp` creates the logger once and passes it to endpoint construction, but `mountEndpoints` currently receives only `appOrigin` and `resolveIdentity`.
- `createLogger` builds one redaction policy and the installed serializer calls `reportFailure`; `registerReportedFailure` lets a boundary that already made the two reports reuse the same occurrence.
- `Logger` has `error(fields, message)` and `child`; no logger-interface change is needed.
- `mount.test.ts` already proves unexpected identity, decoder, validator, parser, dispatch, and reply failures remain 500, plus modeled auth/origin/body refusals and unrelated-route isolation.
- Eight test files call `mountEndpoints` directly: `mount.test.ts` and the seven mechanical
  fixtures listed below. Making the reporter required will force every fixture to state whether it
  discards unexpected diagnostics.

Measured in an isolated Elysia probe during revision: malformed JSON on the parent `/legacy` route
returns status 400, body `Bad Request`, and no content-type header. The revised parent-isolation
assertion uses those measured bytes and does not claim a pre-existing body check.

Measured in an isolated command during planning: Pino 10.3.1's default logger synchronously called a replaced `process.stdout.write` for one `logger.error`. This packet does not rely on that global interception because it would be unsafe under a parallel test run; tests inject a destination instead.

Inference to verify during the red test: Elysia supplies the original caught value as the `error` member of this global `onError` callback, including a rejection from `resolveIdentity`. The first test below establishes that rather than assuming it.

## File ownership

Create:

- `apps/wbs/be-01/src/http/elysia/unexpected-failure.ts` — composes the shared reporter and operator logger into one callback.
- `apps/wbs/be-01/src/http/elysia/unexpected-failure.test.ts` — proves one report, provenance reuse, redaction, correlation, and visible reporting loss through the real logger serializer.

Modify behavior:

- `apps/wbs/be-01/src/http/elysia/mount.ts` — requires and invokes the callback from the existing isolated unexpected-error hook.
- `apps/wbs/be-01/src/http/elysia/mount.test.ts` — boundary response, exactly-once call, modeled auth non-reporting, and unrelated-route isolation.
- `apps/wbs/be-01/src/app.ts` — constructs the callback once from the app logger and `internalAuthSecret`, then supplies it to `mountEndpoints`.
- `apps/wbs/be-01/src/app.test.ts` — drives a real protected production route through `buildApp`,
  the mounted hook, reporter, serializer and destination; observes logger-factory inputs.

Mechanical fixture updates only, each supplying a local no-op callback:

- `apps/wbs/be-01/src/http/elysia/auth-oidc.test.ts`
- `apps/wbs/be-01/src/http/elysia/auth-password.test.ts`
- `apps/wbs/be-01/src/http/elysia/calendar-marker.test.ts`
- `apps/wbs/be-01/src/http/elysia/identity.test.ts`
- `apps/wbs/be-01/src/http/elysia/internal.test.ts`
- `apps/wbs/be-01/src/http/elysia/plan-document-boundary.test.ts`
- `apps/wbs/be-01/src/http/elysia/work-item.test.ts`

Modify records:

- `openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md` — add the already accepted backend-boundary behavior and scenarios.
- `openspec/changes/adopt-failure-reporting/tasks.md` — split task 2.1 progress without marking MCP adoption complete.
- `openspec/changes/adopt-failure-reporting/verify.md` — append actual red/green commands and mutation observations.

Explicitly unowned: `libs/shared/domain/failures/**`, `libs/wbs/adapters/observability/**`, `boot.ts`, both process entrypoints, endpoint/controller/service implementations, MCP, gateway, personal library repositories, and package versions.

## Interfaces

Create this exact application-local interface:

```ts
import type { Logger } from '@wbs/contracts';
/** Reports one unexpected backend boundary failure to its operator sink. */
export type UnexpectedFailureReporter = (caught: unknown) => void;
/** Builds one reporter and one reusable redaction policy for an application composition. */
export function createUnexpectedFailureReporter(
  logger: Logger,
  secrets: readonly string[],
): UnexpectedFailureReporter;
```

Its implementation shape is fixed by the accepted contracts:

```ts
import { createFailureRedaction, reportFailure } from '@shared/failures';
import type { Logger } from '@wbs/contracts';
import { registerReportedFailure } from '@wbs/observability';
export type UnexpectedFailureReporter = (caught: unknown) => void;
export function createUnexpectedFailureReporter(
  logger: Logger,
  secrets: readonly string[],
): UnexpectedFailureReporter {
  const redact = createFailureRedaction(secrets);
  return (caught) => {
    const reporting = reportFailure(caught, { redact });
    logger.error({ err: registerReportedFailure(reporting) }, 'unexpected endpoint failure');
  };
}
```

Extend the private mount options exactly once:

```ts
interface MountOptions {
  appOrigin: string;
  resolveIdentity: IdentityResolver;
  reportUnexpectedFailure: UnexpectedFailureReporter;
}
```

The `onError` behavior is:

```ts
app.onError({ as: 'global' }, ({ error, request }) => {
  if (!admissions.has(request)) return undefined;
  options.reportUnexpectedFailure(error);
  return new Response('Internal Server Error', { status: 500 });
});
```

`buildApp` composes it once, beside the logger:

```ts
const secrets = [opts.internalAuthSecret];
const logger = makeLogger({ service: 'be-01', version: opts.version, secrets });
const reportUnexpectedFailure = createUnexpectedFailureReporter(logger, secrets);
// ...
mountEndpoints(endpoints, {
  appOrigin: opts.appOrigin,
  resolveIdentity: identityResolver(opts.auth, opts.internalAuthSecret),
  reportUnexpectedFailure,
});
```

Give `buildApp` one narrow composition seam so the production path is observable without replacing
global stdout or mocking a module:

```ts
export function buildApp(opts: AppOptions, makeLogger: typeof createLogger = createLogger) {
```

Production and every existing caller use the default. The test passes a factory that records the
exact `CreateLoggerOptions`, creates the real logger with a private destination, and returns a
structural delegating logger that captures the registered `err` while forwarding it. No logger is
stored in `AppOptions`, and no runtime behavior or public HTTP contract changes.

Do not return `FailureReporting` from the reporter. The backend response does not consume the public report, and exposing the pair would create a second application contract. The operator log still contains `occurrence_id` and `fingerprint`; internally captured public and diagnostic reports share that occurrence. Future MCP 040.8 needs the public report and will call `reportFailure`/`registerReportedFailure` at its own boundary.

---

### Task 1: Specify and implement the one-call backend reporter

**Files:**

- Create: `apps/wbs/be-01/src/http/elysia/unexpected-failure.ts`
- Create: `apps/wbs/be-01/src/http/elysia/unexpected-failure.test.ts`
- Modify: `openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md`

**Consumes:** `createFailureRedaction`, `reportFailure`, `Logger`, `createLogger`, `LogRecord`, `registerReportedFailure`.

**Produces:** `UnexpectedFailureReporter` and `createUnexpectedFailureReporter(logger, secrets)`.

- [ ] **Step 1: Add the accepted requirement to the delta spec.**
      Append a requirement whose normal scenarios say:

```markdown
### Requirement: The backend reports an unexpected endpoint failure once

The mounted backend endpoint boundary SHALL keep its generic 500 response for an unexpected
failure, SHALL write exactly one diagnostic operator record for that failure, and SHALL NOT
disclose content read from the caught value through the response. The diagnostic and public
reports captured for the occurrence SHALL share one occurrence identifier.

#### Scenario: A store fails behind an admitted request

- **GIVEN** an admitted request whose store operation throws an unknown failure containing a caller-owned secret
- **WHEN** the mounted endpoint boundary handles the failure
- **THEN** the response is status 500 with the existing generic body
- **AND** one operator record carries the redacted diagnostic report, occurrence identifier and fingerprint
- **AND** the response and record contain no caller-owned secret

#### Scenario: Reporting cannot inspect the failure

- **GIVEN** an admitted request fails with a value the report library cannot inspect
- **WHEN** the mounted endpoint boundary handles the failure
- **THEN** the response remains the existing generic 500
- **AND** one operator record carries a visible reporting loss and correlation handle

#### Scenario: A modeled request outcome is returned

- **GIVEN** a request is refused by a declared parser, identity, origin or endpoint rule
- **WHEN** the mounted endpoint boundary returns that modeled 4xx response
- **THEN** no unexpected-failure operator record is written
```

- [ ] **Step 2: Write the reporter tests before creating the implementation.**
      Use a real `createLogger({ service: 'be-01', secrets: [secret], destination })`. Build a complete
      delegating `Logger` around it so `error` captures the exact structured fields and forwards once.
      Define an overload-preserving helper rather than spreading the Pino object:

```ts
import type { LogFields, LogMethod, Logger } from '@wbs/contracts';
function forward(log: LogMethod): LogMethod {
  function forwarded(message: string): void;
  function forwarded(fields: LogFields, message: string): void;
  function forwarded(fieldsOrMessage: LogFields | string, message?: string): void {
    if (typeof fieldsOrMessage === 'string') {
      log(fieldsOrMessage);
      return;
    }
    if (message === undefined) throw new Error('structured log message is required');
    log(fieldsOrMessage, message);
  }
  return forwarded;
}
```

Then assert:

```ts
test('logs one registered, redacted report under its original occurrence', () => {
  const secret = 'boundary-secret';
  const lines: string[] = [];
  const calls: { fields: Record<string, unknown>; message: string }[] = [];
  const sink = createLogger({
    service: 'be-01',
    secrets: [secret],
    destination: { write: (chunk: string) => void lines.push(chunk) },
  });
  function recordError(message: string): void;
  function recordError(fields: LogFields, message: string): void;
  function recordError(fieldsOrMessage: LogFields | string, message?: string): void {
    if (typeof fieldsOrMessage === 'string') {
      sink.error(fieldsOrMessage);
      return;
    }
    if (message === undefined) throw new Error('structured log message is required');
    calls.push({ fields: fieldsOrMessage, message });
    sink.error(fieldsOrMessage, message);
  }
  const logger: Logger = {
    info: forward(sink.info),
    warn: forward(sink.warn),
    error: recordError,
    child: (fields) => sink.child(fields),
  };
  const report = createUnexpectedFailureReporter(logger, [secret]);
  report(new Error(`store failed with ${secret}`));
  expect(calls).toHaveLength(1);
  expect(calls[0]?.message).toBe('unexpected endpoint failure');
  expect(lines).toHaveLength(1);
  expect(lines[0]).not.toContain(secret);
  const line = lines[0];
  if (line === undefined) throw new Error('expected one emitted line');
  const emitted = parseOrThrow(LogRecord, JSON.parse(line) as Record<string, unknown>);
  const captured = calls[0]?.fields['err'] as FailureReporting;
  expect(captured.reported).toBe(true);
  if (!captured.reported) return;
  expect(captured.reports.public.code).toBe('INTERNAL_ERROR');
  expect(JSON.stringify(captured.reports.public)).not.toContain(secret);
  expect(emitted.err).toMatchObject({
    v: 'corj/v0.14',
    occurrence_id: captured.reports.diagnostic.occurrence_id,
    fingerprint: captured.reports.diagnostic.fingerprint,
  });
  expect(captured.reports.public.occurrence_id).toBe(captured.reports.diagnostic.occurrence_id);
});
```

Add a second case with `new Error('boom', { cause: revokedProxy })`. Assert one emitted line, no
throw, and `emitted.err` matches `{ reported: false, occurrence_id: /^UNREPORTED_/, reason: string }`.

- [ ] **Step 3: Run the new file and observe the missing-module red.**
      Run:

```sh
cd apps/wbs/be-01
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/http/elysia/unexpected-failure.test.ts
```

Expected: nonzero because `./unexpected-failure` does not exist. Record the exact diagnostic; zero tests is invalid.

- [ ] **Step 4: Implement the exact interface above and rerun.**
      Expected: both tests pass; the first emitted record uses the captured diagnostic occurrence, proving `registerReportedFailure` prevented a second report.
- [ ] **Step 5: Run focused typecheck/lint for the new surface.**

```sh
NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:lint --skip-nx-cache
```

Expected: both exit 0. Do not weaken the fixture with an unchecked production cast or `!`.

- [ ] **Step 6: Commit the independently reviewable reporter.**

```sh
git add apps/wbs/be-01/src/http/elysia/unexpected-failure.ts \
  apps/wbs/be-01/src/http/elysia/unexpected-failure.test.ts \
  openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md
git commit -m "feat(wbs-be): compose unexpected failure reports"
```

### Task 2: Wire the reporter and prove modeled outcomes stay silent

**Files:**

- Modify: `apps/wbs/be-01/src/http/elysia/mount.ts`
- Modify: `apps/wbs/be-01/src/http/elysia/mount.test.ts`
- Modify mechanically: the seven direct mount test files listed under File ownership.

**Consumes:** `UnexpectedFailureReporter`, `createUnexpectedFailureReporter`.

**Produces:** one reporter invocation for every admitted unexpected error; zero invocations for
representative parser, body, identity, origin, declared-refusal, 404 and parent-route outcomes.

- [ ] **Step 1: Extend the existing auth-outage test to demand exactly one call.**
      Change the local helper without weakening the required production interface:

```ts
function appFor(
  endpoints: readonly BoundEndpoint[],
  reportUnexpectedFailure: UnexpectedFailureReporter = () => undefined,
) {
  return mountEndpoints(endpoints, {
    appOrigin: origin,
    resolveIdentity,
    reportUnexpectedFailure,
  });
}
```

In `refuses anonymous identity and preserves an unexpected account-store failure`, capture unknown
values. Keep the anonymous request and add exact response assertions:

```ts
const failures: unknown[] = [];
const app = appFor(endpoints, (caught) => void failures.push(caught));
const anonymous = await app.handle(request('{'));
expect(anonymous.status).toBe(401);
expect(failures).toEqual([]);
const outage = await app.handle(request('{', { authorization: 'Bearer outage' }));
expect(outage.status).toBe(500);
expect(await outage.text()).toBe('Internal Server Error');
expect(outage.headers.get('content-type')).toBe('text/plain;charset=UTF-8');
expect(failures).toHaveLength(1);
expect(failures[0]).toBeInstanceOf(Error);
expect((failures[0] as Error).message).toBe('account store offline');
```

The guarded `as Error` is allowed in tests only after `toBeInstanceOf`; do not copy it into production.

- [ ] **Step 2: Make every promised modeled family observable.**
      Pass a shared `failures: unknown[]` and capturing reporter into these existing cases, preserving
      all current response assertions, then assert `failures` is empty after the modeled requests:

- `refuses unknown nested request fields and malformed JSON with declared envelopes`: covers body
  validation and malformed mounted JSON/parser handling.
- `blocks missing or foreign cookie origins while admitting bearer-only writes`: covers origin.
- `refuses anonymous identity and preserves an unexpected account-store failure`: assert empty
  immediately after the anonymous 401, before sending the outage that must append exactly one.
- `preserves declared 405, 429, 501 and 503 refusals and their headers`: pass the same reporter to
  every per-refusal `appFor` and assert empty after the loop.
- `admits static and parameter siblings with their own ordered policies`: pass the reporter to its
  one `appFor`, retain the `/missing` 404 assertion, then assert empty after all three requests.

Do not count invalid success/refusal envelopes as modeled outcomes: those existing 500s represent
broken endpoint implementations and must report as unexpected failures after wiring.

- [ ] **Step 3: Make unrelated-route isolation observable with measured bytes.**
      Pass a capturing reporter to the `appFor` inside `leaves an unrelated legacy route parser and error boundary intact`, drive the existing malformed `/legacy` request, and assert the callback count remains zero. Keep its current 400 assertion.

There is no current body assertion. Add the measured contract explicitly:

```ts
expect(response.status).toBe(400);
expect(await response.text()).toBe('Bad Request');
expect(response.headers.get('content-type')).toBeNull();
expect(failures).toEqual([]);
```

- [ ] **Step 4: Update both direct calls inside `mount.test.ts`.**
      The calls in `rejects resolver principal mismatches before handler invocation` (live line 429) and
      `delivers resolved user and internal principals and follows declared policy order` (live line 712)
      do not use `appFor`. Add `reportUnexpectedFailure: () => undefined` to both option objects. These are
      required members, not defaults; include both in the staged-diff checklist.
- [ ] **Step 5: Run the named tests and observe the reporter-demand red.**

```sh
cd apps/wbs/be-01
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/http/elysia/mount.test.ts -t 'refuses anonymous identity and preserves an unexpected account-store failure'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/http/elysia/mount.test.ts -t 'refuses unknown nested request fields and malformed JSON with declared envelopes'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/http/elysia/mount.test.ts -t 'blocks missing or foreign cookie origins while admitting bearer-only writes'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/http/elysia/mount.test.ts -t 'preserves declared 405, 429, 501 and 503 refusals and their headers'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/http/elysia/mount.test.ts -t 'admits static and parameter siblings with their own ordered policies'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/http/elysia/mount.test.ts -t 'leaves an unrelated legacy route parser and error boundary intact'
```

Expected: the first fails because no failure was captured; the five modeled/isolation cases remain
green controls. Each command must report one test, not zero.

- [ ] **Step 6: Require the reporter and invoke it in the existing error hook.**
      Import `UnexpectedFailureReporter` as a type, add the required option, destructure `error`, invoke
      the callback once after the admission guard, then return the unchanged response. Do not add another
      `onError`, catch, request context, or logging call.
- [ ] **Step 7: Update every other direct mount fixture mechanically.**
      Each of the seven files under File ownership supplies `reportUnexpectedFailure: () => undefined`
      beside `appOrigin` and `resolveIdentity`. Together with `appFor` and the two explicit calls above,
      this exhausts all live `mountEndpoints` call sites outside `app.ts`. Use the explicit no-op rather
      than making the option optional. Re-run `rg -n 'mountEndpoints\\(' apps/wbs/be-01/src` and inspect
      every returned option object before typecheck.
- [ ] **Step 8: Run the focused boundary file and every direct caller file.**

```sh
cd apps/wbs/be-01
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test \
  src/http/elysia/mount.test.ts \
  src/http/elysia/auth-oidc.test.ts \
  src/http/elysia/auth-password.test.ts \
  src/http/elysia/calendar-marker.test.ts \
  src/http/elysia/identity.test.ts \
  src/http/elysia/internal.test.ts \
  src/http/elysia/plan-document-boundary.test.ts \
  src/http/elysia/work-item.test.ts
```

Expected: all pass. Record actual counts; do not prestate them because batch 3 may change them.

- [ ] **Step 9: Run the full fast backend tier and static checks.**

```sh
NX_DAEMON=false bunx nx run wbs-be-01:test:unit --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:lint --skip-nx-cache
```

Expected: all exit 0. A changed existing 4xx/500 test is a regression; do not update its expectation.

- [ ] **Step 10: Commit the boundary wiring.**
      Stage only the nine owned source/test paths from this task and inspect `git diff --cached --stat`.

```sh
git add apps/wbs/be-01/src/http/elysia/mount.ts \
  apps/wbs/be-01/src/http/elysia/mount.test.ts \
  apps/wbs/be-01/src/http/elysia/auth-oidc.test.ts \
  apps/wbs/be-01/src/http/elysia/auth-password.test.ts \
  apps/wbs/be-01/src/http/elysia/calendar-marker.test.ts \
  apps/wbs/be-01/src/http/elysia/identity.test.ts \
  apps/wbs/be-01/src/http/elysia/internal.test.ts \
  apps/wbs/be-01/src/http/elysia/plan-document-boundary.test.ts \
  apps/wbs/be-01/src/http/elysia/work-item.test.ts
git commit -m "feat(wbs-be): classify mounted endpoint failures"
```

### Task 3: Prove the production `buildApp` composition

**Files:**

- Modify: `apps/wbs/be-01/src/app.ts`
- Modify: `apps/wbs/be-01/src/app.test.ts`

**Consumes:** `createUnexpectedFailureReporter`, `createLogger`, `CreateLoggerOptions`, `LogRecord`.

**Produces:** the real production composition and an end-to-end in-process proof of its secret,
reporter, mount and serializer wiring.

- [ ] **Step 1: Refactor only the local test options builder.**
      In `app.test.ts`, extract the object currently inside `appWith` into
      `optionsFor(auth: AuthService, internalAuthSecret = TEST_SECRET): AppOptions`; keep `appWith`
      delegating to `buildApp(optionsFor(auth))`. Existing tests must remain byte-for-byte equivalent.
- [ ] **Step 2: Add a production-composition test before the seam exists.**
      Create an auth fixture whose `authenticate` rejects with `new Error(`account lookup exposed
      ${internalAuthSecret}`)`. Send `GET /api/projects` with `authorization: Bearer outage`; this is a
      real shared shape, endpoint binding, identity resolver and mounted hook. Supply a second
      `buildApp` argument `makeLogger` that:

1. records the received `CreateLoggerOptions`;
2. calls the real `createLogger({ ...options, destination })`;
3. returns an overload-safe delegating `Logger`, with `error` also recording its structured fields
   before forwarding once.

Use this concrete fixture, including its local overload-preserving helper:

```ts
function forward(log: LogMethod): LogMethod {
  function forwarded(message: string): void;
  function forwarded(fields: LogFields, message: string): void;
  function forwarded(fieldsOrMessage: LogFields | string, message?: string): void {
    if (typeof fieldsOrMessage === 'string') return log(fieldsOrMessage);
    if (message === undefined) throw new Error('structured log message is required');
    log(fieldsOrMessage, message);
  }
  return forwarded;
}
const internalAuthSecret = 'production-boundary-secret';
const created: CreateLoggerOptions[] = [];
const calls: { fields: LogFields; message: string }[] = [];
const lines: string[] = [];
const makeLogger = (options: CreateLoggerOptions): Logger => {
  created.push(options);
  const sink = createLogger({
    ...options,
    destination: { write: (chunk) => void lines.push(chunk) },
  });
  function recordError(message: string): void;
  function recordError(fields: LogFields, message: string): void;
  function recordError(fieldsOrMessage: LogFields | string, message?: string): void {
    if (typeof fieldsOrMessage === 'string') return sink.error(fieldsOrMessage);
    if (message === undefined) throw new Error('structured log message is required');
    calls.push({ fields: fieldsOrMessage, message });
    sink.error(fieldsOrMessage, message);
  }
  return {
    info: forward(sink.info),
    warn: forward(sink.warn),
    error: recordError,
    child: (fields) => sink.child(fields),
  };
};
const auth = testAuthService(inMemoryUsers());
auth.authenticate = () => Promise.reject(new Error(`account lookup exposed ${internalAuthSecret}`));
const app = buildApp(optionsFor(auth, internalAuthSecret), makeLogger);
const response = await app.handle(
  new Request('http://localhost/api/projects', {
    headers: { authorization: 'Bearer outage' },
  }),
);
```

Assert all of the following in this single test:

```ts
expect(created).toHaveLength(1);
expect(created[0]?.secrets).toEqual([internalAuthSecret]);
expect(response.status).toBe(500);
expect(response.headers.get('content-type')).toBe('text/plain;charset=UTF-8');
expect(await response.text()).toBe('Internal Server Error');
expect(calls).toHaveLength(1);
expect(lines).toHaveLength(1);
expect(lines[0]).not.toContain(internalAuthSecret);
const reporting = calls[0]?.fields['err'] as FailureReporting;
expect(reporting.reported).toBe(true);
if (!reporting.reported) return;
expect(reporting.reports.public.code).toBe('INTERNAL_ERROR');
expect(JSON.stringify(reporting.reports.public)).not.toContain(internalAuthSecret);
expect(reporting.reports.public.occurrence_id).toBe(reporting.reports.diagnostic.occurrence_id);
const line = lines[0];
if (line === undefined) throw new Error('expected one operator line');
const emitted = parseOrThrow(LogRecord, JSON.parse(line) as Record<string, unknown>);
expect(emitted.err).toMatchObject({
  occurrence_id: reporting.reports.diagnostic.occurrence_id,
  fingerprint: reporting.reports.diagnostic.fingerprint,
});
```

The guarded test cast follows this repository's observability-test pattern; production remains
cast-free. Do not intercept stdout or use `mock.module`.

- [ ] **Step 3: Run the new named test red.**

```sh
cd apps/wbs/be-01
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/app.test.ts -t 'reports one redacted unexpected production failure with its shared occurrence'
```

Expected: the extra factory argument is ignored, so the private destination receives zero lines.

- [ ] **Step 4: Add the logger factory seam and compose once.**
      Change `buildApp` to the exact signature in Interfaces. Create one `secrets` array, call
      `makeLogger({ service: 'be-01', version: opts.version, secrets })`, construct one reporter from that
      logger and the same array, and supply it to the production `mountEndpoints` options. Keep that same
      logger for endpoint construction, OIDC, Elysia decoration and the reporter.
- [ ] **Step 5: Run the named production test, all `app.test.ts`, and static checks.**

```sh
cd apps/wbs/be-01
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/app.test.ts -t 'reports one redacted unexpected production failure with its shared occurrence'
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/app.test.ts
cd ../../..
NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:lint --skip-nx-cache
```

- [ ] **Step 6: Commit the production composition.**

```sh
git add apps/wbs/be-01/src/app.ts apps/wbs/be-01/src/app.test.ts
git commit -m "feat(wbs-be): compose unexpected failure reporting"
```

### Task 4: Prove the safety checks and close only the backend progress

**Files:**

- Modify: production and tests above only to add observed `Proof:` comments.
- Modify: `openspec/changes/adopt-failure-reporting/tasks.md`
- Modify: `openspec/changes/adopt-failure-reporting/verify.md`

**Consumes:** the three green commits above.

**Produces:** watched R5 evidence and an honest task ledger that leaves MCP open.

- [ ] **Step 1: Save passing bytes before each fault.**
      Use a fresh `mktemp -d` evidence directory. Copy each mutated file there before applying one fault.
      After the red run, restore with the saved copy and require `cmp` exit 0. Never combine faults.
- [ ] **Step 2: Replay the reporter provenance fault.**
      Fault: in `unexpected-failure.ts`, remove `registerReportedFailure(...)` and pass `reporting` directly as `err`.

Run the named test `logs one registered, redacted report under its original occurrence`.

Expected: one test fails because the emitted `err.occurrence_id` differs from the diagnostic occurrence captured in the logger input. This proves the logger did not generate a second report.

- [ ] **Step 3: Replay both production secret-wiring faults.**
      Fault A: in `buildApp`, pass `[]` rather than `secrets` to `createUnexpectedFailureReporter`.

Fault B: restore, then omit `secrets` from the `makeLogger` options.

Run `reports one redacted unexpected production failure with its shared occurrence` for each.
Expected A: the actual operator line contains the internal secret. Expected B: the captured
`CreateLoggerOptions.secrets` differs from `[internalAuthSecret]`. Also retain the reporter-unit
fault `createFailureRedaction([])`, which must expose `boundary-secret` in its emitted line.

- [ ] **Step 4: Replay the omitted and duplicate-report faults separately.**
      Fault A: delete `options.reportUnexpectedFailure(error)` from `mount.ts`.

Fault B: restore, then duplicate that exact call.

Run `refuses anonymous identity and preserves an unexpected account-store failure` for each.

Expected A: `Expected length: 1`, received zero. Expected B: received length two. These establish exactly once, rather than merely “at least one.”

Also replace `reportUnexpectedFailure` with `() => undefined` only in the production
`mountEndpoints` call in `buildApp` and run the production-composition test. Expected: zero captured
calls/lines. This makes the composition assertion fail independently of the mount unit fixture.

- [ ] **Step 5: Replay public disclosure.**
      Fault A: replace the fixed response with `new Response(String(error), { status: 500 })`.

Fault B: restore, then add `headers: { 'content-type': 'application/json' }` to the fixed response.

Run the same auth-outage test.

Expected A: exact-body assertion receives `Error: account store offline` instead of `Internal Server Error`.
Expected B: the content-type assertion receives `application/json` instead of
`text/plain;charset=UTF-8`. Restore and rerun green after each.

- [ ] **Step 6: Replay every modeled-outcome silence check.**
      Inject one call at a time immediately before the relevant normal return, run the named case, and
      expect its `failures` array to become nonempty:

- identity: before `return renderReply(...identity)`;
- origin: before `return refuse(...)` in the origin policy;
- malformed JSON/parser: inside the `SyntaxError` branch before `classifyFailure`;
- body validation: inside `if (!body.ok)` before `classifyFailure`;
- declared endpoint refusal: after `endpoint.handle`, guarded by `if (!reply.ok)`;
- 404: in the `matched === undefined` branch before returning.

Use a fixed fresh `Error('injected modeled outcome report')`; never pass refusal/request values to
the reporter. Restore and require the focused test green between faults.

- [ ] **Step 7: Replay selected-request isolation.**
      Fault: remove `if (!admissions.has(request)) return undefined;` from `mount.ts`.

Run `leaves an unrelated legacy route parser and error boundary intact`.

Expected: status becomes 500 and/or the callback count becomes one instead of zero; record the
actual decisive assertion. The restored control must again return measured body `Bad Request`.

- [ ] **Step 8: Add adjacent comments only for observed failures.**
      Place comments beside the expressions they prove in `unexpected-failure.ts`, `mount.ts`, and
      `app.ts`. Include date, injected fault, named test, and decisive received-versus-expected fact. Do
      not copy expected wording if observed diagnostics differ.
- [ ] **Step 9: Update the OpenSpec task without claiming MCP complete.**
      Keep parent 2.1 open and record granular progress beneath it:

```markdown
- [ ] 2.1 Adopt the contract in the observability serializer and log schema, the backend unexpected-error boundary and the MCP server — test: focused observability, backend and MCP boundary tests; negatives: bypass redaction, drop occurrence correlation and expose an unexpected cause through each real boundary.
  - [x] 2.1a Observability serializer and log schema — owned by `log-failure-records`.
  - [x] 2.1b Backend unexpected-error boundary — generic 500 and one correlated operator report.
  - [ ] 2.1c MCP server tool-call boundary — owned by WBS 040.8.
```

This retains the authoritative test and negative clauses verbatim and removes only the stale
`owned by nobody in batch 2` suffix. If batch 3 has extended the line, preserve all added wording.
Never mark 2.1 complete before 040.8.

- [ ] **Step 10: Append actual evidence to `verify.md`.**
      Record baseline SHA, exact commands, exit codes/counts, each fault, named test, decisive output, restore `cmp`, green rerun, and skipped checks. State that no response occurrence identifier exists because the public protocol remains unchanged.
- [ ] **Step 11: Run final scoped verification.**

```sh
NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-observability:test --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:test:unit --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:test --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:lint --skip-nx-cache
bunx @fission-ai/openspec@1.12.0 validate --all --json
GSETTINGS_BACKEND=memory bunx nx format:check --all
```

The full backend test target may need the planner's unsandboxed lane because database/process tests
use host facilities. Record any unavailable check explicitly. Do not substitute a cached exit or a
focused pass for it. The repository-level h2puni gate belongs to the later integrated candidate, not
this packet's executor.

- [ ] **Step 12: Commit the proofs and record.**

```sh
git add apps/wbs/be-01/src/http/elysia/unexpected-failure.ts \
  apps/wbs/be-01/src/http/elysia/mount.ts \
  apps/wbs/be-01/src/app.ts \
  openspec/changes/adopt-failure-reporting/tasks.md \
  openspec/changes/adopt-failure-reporting/verify.md
git commit -m "test(wbs-be): prove unexpected failure reporting"
```

## Dependency and conflict notes

- **Batch 3 / 050.4:** frontend fault-boundary work edits `adopt-failure-reporting/tasks.md` and
  `verify.md`. Base this packet after that work lands, re-read its new task numbering, and append;
  do not overwrite its browser/frontend evidence.
- **040.5 serializer:** this packet consumes `registerReportedFailure`, the provenance map, safe
  serializer, and log schema exactly as integrated. No observability file should change. A requested
  serializer change means stop and return to 040.5's contract owner.
- **040.8 MCP:** code ownership is disjoint, but it will finish the same OpenSpec parent task and
  append to the same `verify.md`. Serialize those documentation commits or rebase 040.8 after this
  packet. MCP needs its public report; unlike this backend boundary, it should reuse the registered
  outcome because it actually sends a safe public error.
- **040.9 gateway:** code ownership is disjoint. It preserves WebSocket frame codes and generally
  needs only diagnostic logging; it must independently decide which catches are expected cancellation
  or dropped sockets. Do not generalize this backend reporter into a cross-product helper.
- **040.6 backend module split:** likely disjoint from `http/elysia`, but may move app composition.
  If 040.6 lands first, resolve imports against its module boundaries while retaining this interface
  and behavior.

## Self-review

- Spec coverage: generic 500, no caught-value disclosure, shared occurrence, one operator record,
  reporting loss, and modeled outcomes each map to a test and a watched negative where a new check is introduced.
- Public protocol: unchanged status/body; no headers or envelopes added.
- Type consistency: `UnexpectedFailureReporter` is `(caught: unknown) => void` everywhere; the factory
  consumes `Logger` and `readonly string[]`; `MountOptions` requires the callback.
- Scope: no typed exceptions, request context, telemetry, retry, sink recovery, MCP, gateway,
  library source, or dependency versions; the only composition seam is `buildApp`'s logger factory.
- Placeholder scan: no implementation step uses TODO/TBD or delegates an unspecified error-handling choice.

## Revision dispositions and assumptions

1. **Real composition:** Task 3 now drives a protected production route through `buildApp`, the
   real reporter and serializer, captures the shared occurrence, and proves both reporter and logger
   receive `internalAuthSecret`; separate mutations break each wire.
2. **All callers:** Task 2 names both direct `mount.test.ts` calls at live lines 429 and 712, the
   helper, seven other fixture files, and requires an exhaustive `rg` inspection.
3. **Modeled silence:** parser, body validation, identity, origin, declared refusal and 404 each
   reuse an existing mounted case with a capture assertion and a targeted production mutation.
4. **Response contracts:** the unexpected 500 asserts actual content type; the parent route asserts
   the independently measured `Bad Request` body and absent content-type header.
5. **Authoritative ledger:** the full accepted 2.1 test/negative wording remains on the parent task;
   only its stale owner suffix changes, while 2.1a-c show progress without closing MCP.

Assumptions resolved by tests: Elysia supplies the original caught value; the reporter destination
writes synchronously; and `GET /api/projects` reaches `AuthService.authenticate` before its handler.
The red/green steps reject any of these assumptions if the integrated code behaves differently.

## Blocker disposition

No unresolved user decision blocks 040.7. The accepted documents settle the response, disclosure,
redaction, correlation, and logging behavior. The only start condition is integration of batch 3 so
the packet can preserve 050.4's OpenSpec edits and consume the final 040.5 interface.
