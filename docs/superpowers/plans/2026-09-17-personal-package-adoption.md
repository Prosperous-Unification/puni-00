# Personal package adoption implementation plan

> **For agentic workers:** Use `executing-plans` to implement the approved slices below. Use `subagent-driven-development` only when delegation is authorized. Checkboxes describe future implementation, not work already completed.

**Goal:** Adopt `caught-object-report-json`, `application-exception`, and `di-bag` throughout this repository according to each project's responsibilities.

**Architecture:** Keep exception definitions beside the operations that fail, share a small framework-free reporting policy, and use DI Bag in backend, portable-core, and resource-owning tool composition. The React frontend retains props, ordinary factories, hooks, and typed React/router context. Existing ports, typed refusal results, transaction admission, and public protocols remain authoritative.

**Tech stack:** Bun, Nx, TypeScript, Elysia, React/Vite, Pino, SQLite, and the three published packages.

**Spec:** The proposed behavior is defined below. Existing constraints come from [core extraction](../../../openspec/specs/core-lib-extraction/spec.md), [HTTP endpoint contracts](../../../openspec/specs/http-endpoint-port/spec.md), and [AGENTS.md](../../../AGENTS.md). Create each OpenSpec change before its first implementation: reporting in slice 2, composition in slice 4, and completion in slice 7. Slice 1 installs dependencies and corrects this document and opens none.

**Status:** Proposed plan, requested on 2026-09-17; implementation has not started. “All projects” means complete coverage by role, including explicit dispositions where a package does not apply. User scope amendment: do not adopt DI Bag in the React frontend for now; retain frontend reporting work. Other proposed designs remain subject to review.

## Amendment, 2026-09-25: the report libraries moved together

Work item 140.1–140.2 (OpenSpec change `migrate-report-libraries`) moved
`caught-object-report-json` from 11.0.1 to 13.0.0 and `application-exception` from 0.5.0 to
0.7.0 in one step. Where this and the 2026-09-19 amendment below disagree, this one holds.

- **The two move together or not at all.** application-exception 0.5.0 depends on the report
  library at `^11.0.1`, 0.6.0 at `^12.0.0`, 0.7.0 at `^13.0.0`. Moving the report library alone
  installed a nested 11.0.1 copy under application-exception. The pins suite now proves that the
  root and application-exception resolve one installed copy.
- **Renamed API.** `toReports` is `makeReportPair`, `createRedactionPolicy` is
  `makeRedactionPolicy`, `CapturedReports` is `ReportPair`, a public policy's `details` is
  `detailsSelector`, and a redaction context's `key` is `reportKey`. The byte budget left the
  `corj` bag: it is the diagnostic bag's top-level `maxReportBytes`
  (`FAILURE_REPORT_MAX_BYTES`), and the public bag takes none.
- **No maker cache.** application-exception 0.7.0 snapshots its option bags on every call.
  "Build options once" still holds, but no longer because of a cache.
- **Report format `corj/v0.15`.** Reporting-error rows name `reportKey` and `sourceProperty`.
  Fingerprints are unchanged, and the log schema accepts records of any `corj/` version.
- **The wrapper is still required.** A revoked Proxy as a cause still makes reporting throw on
  13.0.0; the report library's issue 217 is open.

## Amendment, 2026-09-19: read before executing

This plan was written against older package versions and an older scope. It is kept as the
record of that day. Slices 1 and 2, the published baseline, the reporting contract and the
project inventory were rewritten on 2026-09-20 by work item 020.1; the rest of the plan below
still predates this amendment, and the facts here replace the matching statements in it.

- **Versions.** The registry now carries `di-bag` 0.4.0, `application-exception` 0.5.0 and
  `caught-object-report-json` 11.0.1. A probe on Bun 1.4.2 against those registry artifacts
  passed, and both repository compilers type-checked it. Bun installs a single copy of the
  report library.
- **The shared reporting module shrinks.** The libraries now provide what this plan had the
  repository build: one call returns both reports under one occurrence identifier, redaction
  is a reusable policy of key and pattern rules, and one byte budget bounds the whole
  diagnostic report, context included. The `ReportPolicy` interface and the deterministic
  drop-order requirement below are obsolete. The module keeps four things: the limits, the
  sensitive key list, a policy builder from caller-owned secrets, and a never-throw wrapper.
- **The wrapper is still required.** A revoked Proxy as a cause still makes reporting throw on
  11.0.1, reproduced through the two-report call. Redaction transforms receive raw containers,
  so use key and pattern rules only.
- **Build options once.** The library caches one report maker per options object and policy.
  Create both as module constants, never per call.
- **Reports carry a fingerprint now.** Add it to the log schema in the same change as the
  serializer.
- **DI Bag gained what this plan worked around.** Sync and async factory helpers replace the
  acquisition-mode options in the examples below, and a factory can hand partially acquired
  resources to the bag, which removes the caveat that a throwing factory cleans up after
  itself.
- **The frontend exclusion is reversed.** Dany decided on 2026-09-19 that the frontend gets a
  service layer and three DI Bag lifetimes. The
  [code organization design](../specs/2026-09-19-code-organization-design.md) and its
  [rollout plan](2026-09-19-code-organization-rollout.md) own that work; the "user scope
  amendment" in the status line below no longer holds.
- **The compiler prerequisite is already met.** The pinned classic compiler alias resolves an
  actual 6.0.3 compiler.
- **The project inventory is stale.** The workspace has 35 projects; the fleet tool is missing
  from the coverage table.
- **Recommended order.** Reporting first as one vertical: the observability serializer and log
  schema, the backend's unexpected-error boundary, then the MCP server. Then backend startup
  ownership. Defer the portable core rewiring and the all-tools sweep until the report format
  has held for a release or two; it changed twice in two days.
- **The browser proof is a check now.** Work item 040.1 added a probe of the three libraries
  built through `apps/wbs/fe-01/vite.config.ts`: `apps/wbs/fe-01/browser-packages.test.ts`
  holds the build property — no module is externalized for the browser, and nanoid keeps its
  browser entry — and `apps/wbs/fe-01/e2e/browser-packages.spec.ts` runs that bundle in the
  layout gate's Chromium. Import `di-bag`, never `di-bag/node`: Vite answers a Node built-in in
  browser code with a warning and a stub that throws at page load, and inside `vitest` that
  warning is not even delivered, so the module identities are what the check reads. Neither
  check says anything about what application code imports, and neither gives `@shared/failures`
  the browser fixture this plan's slice 2 asks for; both remain open.

## Intent

**Problem.** The workspace has 35 Nx projects, hand-built service graphs, and several unrelated ways to turn caught values into text. Its WBS logger accepts only `Error`; its serialized error shape and declared log schema disagree. The three owner-maintained packages are published but absent from workspace dependencies.

**Outcome.** Every runtime boundary has a deliberate reporting policy; failures that need typed context use owner-local exception kinds; backend, portable-core, and resource-owning tool graphs use DI Bag with explicit ownership. React keeps its current dependency-passing and lifecycle mechanisms. Every Nx project has a recorded adoption disposition, including the Python solver and pure libraries. New projects cannot silently escape that accounting.

**Non-goals.** Do not move or republish the three package repositories, vendor their implementations, replace Pino/ArkType/React, invent a new HTTP or WebSocket error protocol, turn normal refusal results into exceptions, replace the transaction coordinator, or add an agent execution framework. Publishing package fixes and deploying this repo are separate actions.

**Constraints.** Consume exact published versions through Bun. Preserve the architectural rings, browser execution, deployment rollback, and existing response/exit contracts. Prove new safety checks through the real production path with injected faults and observed mutation failures. A runtime incompatibility requires a package fix and published release before that adoption slice proceeds.

## Published baseline and compatibility

Inspected on 2026-09-19 against the published registry artifacts and their exact archives, whose README, CHANGELOG, `docs/agent/api-card.md` and type declarations were read; GitHub `main` is not the installation source. The 2026-09-17 inspection of 9.0.1 / 0.3.0 / 0.3.0 is recorded under "Evidence gathered while writing this plan" and is superseded here.

| Package                                                                                  | Exact baseline | Verified surface                                                                                                                                                                                                                                                       | Consequence for this repo                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [caught-object-report-json](https://registry.npmjs.org/caught-object-report-json/11.0.1) | `11.0.1`       | `makeCorj`, `makeCorjArray`, `CorjMaker`, `restoreExpectedValues`; report format `corj/v0.14`, `occurrence_id` and `fingerprint` on by default, one `maxReportSize` over the whole report                                                                              | Use for diagnostic serialization. Compact reports can omit `message` and constructor fields; consumers must understand that representation. No runtime dependencies.                    |
| [application-exception](https://registry.npmjs.org/application-exception/0.5.0)          | `0.5.0`        | `defineException`, `isTypedException`, `isTrustedException`, `createTrustRealm`, `createRedactionPolicy`, `toDiagnosticReport`, `toPublicReport`, `toReports`, `decodePublicReport`                                                                                    | Own typed failures locally. Public policies select disclosed content; diagnostics contain substantially more. Depends on CORJ `^11.0.1` and `nanoid ^3.3.19`; `nanoid` moves to 3.3.19. |
| [di-bag](https://registry.npmjs.org/di-bag/0.4.0)                                        | `0.4.0`        | `DiBag.createBuilder`, `register`, `build`, `buildModule`, `installModule`, `verifyGraph`, `fromFactory`, `fromSyncFactory`, `fromAsyncFactory`, `withDisposal`, `withLifetime`, `buildAndStart`, `resolve`, `fork`, `createScope`, `close`; `factoryCtx.pushDisposer` | Compose explicit factories and preserve resource lifetimes with portable factory helpers. Zero runtime dependencies.                                                                    |

Primary documentation: [CORJ](https://github.com/dany-fedorov/caught-object-report-json), [application-exception](https://github.com/dany-fedorov/application-exception), [DI Bag](https://github.com/dany-fedorov/di-bag).

Compatibility work precedes production adoption:

- The classic compiler prerequisite is already met. DI Bag documents classic TypeScript **6.0.3** as its floor and tests native **7.0.2**. This repo uses native 7.0.2 for `tsc` and exposes the compiler API through `typescript: npm:@typescript/typescript6@6.0.2`, whose `require('typescript').version` is **6.0.3**. Do not bump the alias and do not replace the two-compiler arrangement.
- CORJ and application-exception publish CommonJS. Verify Bun import interoperability and the actual Vite/browser bundle, including nanoid's browser resolution. A Bun import does not prove browser execution.
- Use `di-bag`, not `di-bag/node`, in portable code. Register synchronous providers with `DiBag.fromSyncFactory` and asynchronous ones with `DiBag.fromAsyncFactory`: both fix the acquisition mode by name, so a graph built from them runs on a host without `process.getBuiltinModule` and needs no classifier. An async provider still exposes a `Promise<T>` to its consumers, and a Promise that is itself the service keeps `fromFactory(create, { acquisitionMode: 'raw' })`.
- `build()` does not eagerly run every provider or establish readiness. Explicitly acquire required startup services before reporting ready. A factory that acquires a resource before it can return hands it to the bag with `factoryCtx.pushDisposer`; pushed disposers run exactly once, last first, at once if the factory throws.
- `verifyGraph() satisfies void` is a compile-time composition check, not runtime proof that every dependency exists or that no cycle can execute. Exercise runtime graph failures too. `di-bag-graph` is a separate package and is outside this three-package plan.
- Capture both reports with one `toReports` call. It resolves the occurrence id once and shares it, so `diagnostic.occurrence_id === public.occurrence_id` holds for thrown primitives too, and it validates every option bag before building either report rather than returning half a pair.
- `corj: { maxReportSize }` bounds the whole diagnostic report, `context` and `reporting_errors` included: over budget CORJ drops `context` whole and sets `context_omitted: 'max_size'`, then drops `reporting_errors`, and only then trims error content, never `occurrence_id`, `fingerprint` or `v`. One budget replaces the two this plan used to specify; the floor is 512 bytes.
- Redaction is one reusable policy. `keys` and `paths` skip properties, so an excluded getter never runs but its text survives elsewhere; `patterns` and `transform` scrub text wherever it appears. Use key and pattern rules only: a `transform` receives raw containers, and a 0.4-era `transform` keyed on `path` or `stage` silently matches nothing on 0.5.
- Reporting can still throw. A revoked `Proxy` as a cause made `toReports` throw on 11.0.1, observed through the two-report call, so every production reporting call sits behind the never-throw wrapper below.
- Build the options and the policy once, as module constants. The library caches one report maker per options object and policy; creating either per call throws that away.

## Proposed integration contract

### Reporting

Add `libs/shared/domain/failures` as `shared-failures`, alias `@shared/failures`, tagged `scope:shared`, `ring:domain`, `runtime:isomorphic`, `product:shared`. Like `shared-validation`, it contains framework-free transformations, not a logger, process hook, container, or product-specific exception catalogue. It introduces one additional project; the migration inventory must then cover 36.

The libraries now do what this plan once had the repository build: one call returns both reports under one occurrence identifier, redaction is a reusable policy of key and pattern rules, and one byte budget bounds the whole diagnostic report, context included. The module therefore keeps only the four things the libraries cannot decide for this repository — the limits, the sensitive key list, a policy builder over caller-owned secrets, and a never-throw wrapper.

Its public surface is:

```ts
import type { AppexCorjOptions, CapturedReports, RedactionPolicy } from 'application-exception';

/** The one options bag every reporting call shares. Built once; never per call. */
export const FAILURE_REPORT_LIMITS: AppexCorjOptions;

/** Property names skipped in both reports, matched case-insensitively wherever they appear. */
export const SENSITIVE_KEYS: readonly string[];

/** A reusable policy over the secrets the calling boundary owns. Built once at startup. */
export function createFailureRedaction(secrets: readonly string[]): RedactionPolicy;

/**
 * Both reports of one failure, or a visible refusal when reporting itself failed.
 * Reporting loss is modeled, never silent, and never a successful operation.
 */
export type FailureReporting =
  | { readonly reported: true; readonly reports: CapturedReports }
  | { readonly reported: false; readonly occurrenceId: string; readonly reason: string };

export function reportFailure(
  caught: unknown,
  options: { readonly redact: RedactionPolicy; readonly context?: unknown },
): FailureReporting;
```

This is a proposed interface, not existing code. `reportFailure` makes one `toReports` call with `FAILURE_REPORT_LIMITS` as each bag's `corj` and the given policy as each bag's `redact`, and returns `reported: false` with a fixed terminal reason if that call throws, without invoking the reporter again.

Reporting requirements:

1. `FAILURE_REPORT_LIMITS` is `{ maxReportSize: 32_768, maxDepth: 4, maxChildren: 16, inspection: 'no-invoke' }`. The single budget covers the whole report including `occurrence_id`, `fingerprint`, context and reporting errors; there is no second final-size pass and nothing slices JSON text. `inspection: 'no-invoke'` is what keeps a throwing getter from running during a report. Validate the final object against the installed diagnostic schema.
2. `SENSITIVE_KEYS` is `authorization`, `cookie`, `set-cookie`, `password`, `token`, `access_token`, `refresh_token`, `secret`, `jwtKey`, `internalAuthSecret`, passed as the policy's `keys`. Keys skip properties, which hides the value but not its text elsewhere, so `createFailureRedaction` additionally compiles each caller-owned secret into a global `patterns` rule that scrubs it from messages, stacks, `as_string`, `as_json`, `context` and `reporting_errors`. Callers supply only the secrets they own; never attach whole config, request or environment objects. Unknown embedded secrets cannot be guaranteed detectable, so arbitrary request payloads are excluded by construction. A policy that throws fails closed: the value becomes the replacement and the diagnostic report records a `stage: 'redact'` reporting error.
3. Send only selected public reports to user/agent audiences. The policy applies to the public report too, and it sees only what the kind's `public.details` selector returned, so a mistaken selector cannot bypass redaction; validate the public schema after it. Unknown exceptions get `INTERNAL_ERROR` and a generic message. Browser consoles and agent transcripts are disclosure boundaries too; server diagnostics go only to the operator sink. There is no new browser telemetry endpoint in this plan.
4. Expected inspection failures become the package's visible `reporting_errors` and truncation fields. This models diagnostic loss, not successful execution of the failed operation. Reporter configuration errors and sink failures must not become silent success. `reported: false` preserves the original failure and reports the loss; it never retries reporting and never becomes a success.
5. Report an unexpected failure once at its owning boundary. Lower layers may add typed context and rethrow; they do not each emit a duplicate record. Keep cancellation and normal loading/empty/refusal states in their existing control flow.

The logging migration retains the Pino envelope (`level`, `time`, `msg`, service and correlation fields) and changes `err` to the sanitized diagnostic report. Update `log-schema.ts` in the same slice, adding `fingerprint` beside `occurrence_id`: both reports carry one now, and a schema that omits it drops a retry signal. Do not manufacture legacy `name/message/stack` fields from possibly omitted compact values.

### Typed failures

Use `defineException` for failures whose callers need a stable identity, typed diagnostic context, or an explicit public policy. Define each kind in its owning feature, not a global enum. A definition pattern is:

```ts
import { defineException } from 'application-exception';

export const BackendUnavailable = defineException({
  tag: 'wbs/BackendUnavailable',
  message: ({ operation }: { operation: string }) => `Backend unavailable during ${operation}`,
  public: { code: 'backend_unavailable', message: 'The backend is temporarily unavailable.' },
});
```

Retain original `cause` when wrapping. Check a known constructor before consuming its details. Do not trust a `_tag` received over HTTP, WS, MCP, or a child process as a local exception. Use the existing boundary validators; call `decodePublicReport` only at a boundary that actually adopts that report contract.

Preserve `Refusal`, `ServiceRefusal`, `HttpReply`, WS `ErrorCode`, and solver outcome unions. In particular, do not automatically replace `CommandRefused`, `ValidationError`, `SavedPlanWriteError`, `ReleaseRefusal`, or `RelocationRefusal`: first enumerate their `instanceof` consumers and their extra fields, then either migrate the definition and every consumer together or retain the type as an explicit exception to the new convention. Native programmer assertions and standard abort errors also remain legitimate.

Existing HTTP status/body pairs and WS frames remain unchanged. HTTP unexpected failures remain generic 500s; safe correlation can be logged without forcing a new response field. MCP preserves its result envelope and useful messages for modeled bad tool inputs, while unexpected failures receive selected generic public content. No blanket mapping from every typed exception to a 4xx.

### Composition and ownership

Place `DiBag` builders in core `compose.ts`, backend `services.ts`/`boot.ts`, gateway and MCP startup, wiki CLI dispatch, and resource-owning tools. Do not add a DI Bag root to `apps/wbs/fe-01` or the browser realtime adapter. Providers return ordinary interfaces. Services, repositories, React components, and pure algorithms do not receive a bag or call `resolve` internally.

For the frontend, use props and function arguments first; use focused React context or the existing typed TanStack Router context where dependencies need to reach multiple descendants. Keep subscriptions and cleanup in their owning hooks. A container would add another lifetime model without removing React's state/subscription requirements. The [frontend composition research](../../research/2026-09-17-react-dependency-composition.md) records the primary sources and current code evidence. Revisit only if a substantial framework-independent browser runtime, such as an offline core with workers/storage/synchronization, develops a demonstrated composition need.

Use modules where an existing feature has private wiring and an exported contract; do not put every function in its own module. Keep `composeServices`' accountful/accountless overloads and returned service interfaces. A small provider in its existing core graph can look like this:

```ts
import { DiBag } from 'di-bag';
import type { Clock } from './ports/clock';
import type { Broadcaster } from './service/broadcast';
import { DirectoryService } from './service/directory.service';
import type { PlanTransactionalStores } from './ports/stores';

const directoryModule = DiBag.createBuilder()
  .register({
    directory: DiBag.fromFactory(
      ({
        clock,
        stores,
        broadcast,
      }: {
        clock: Clock;
        stores: PlanTransactionalStores;
        broadcast: Broadcaster;
      }) => new DirectoryService({ clock, directory: stores.directory, broadcast }),
      { acquisitionMode: 'raw' },
    ),
  })
  .buildModule(['directory']);
```

The host installs the module alongside providers satisfying `clock`, `stores`, and `broadcast`; it resolves the service and passes the ordinary value onward. Keep this module private unless another composition actually needs it.

Resource rules:

- Only `withDisposal` transfers ownership. Borrowed source/runtime/test fixtures must not be closed by a service graph that did not open them.
- Root-owned SQLite connections, servers, timers, sockets, subscriptions, and child processes have one owner. Close dependents before dependencies, propagate cleanup failures, and make stop idempotent.
- Preserve the backend's sequence: stop accepting work, stop optimizer and retention, then close the source. Model those dependencies explicitly or retain a single tested lifecycle owner; do not assume reverse registration order provides it.
- `servicesOver(scope.stores, ...)` must continue receiving the admitted transaction stores and the batch's own announcement collector. A DI scope is not a transaction. Keep the unit-of-work coordinator and commit/rollback/afterRollback ordering.
- Never share a request's identity or batch stores through root providers. Close explicitly created scopes and forks; a fork is independently owned. Avoid introducing scopes where direct borrowed arguments already express the lifetime.
- The portable core's browser conformance graph uses explicit acquisition modes; this does not require adoption in the React frontend. Frontend resource setup/cleanup remains in its owning effects, including StrictMode setup-cleanup-setup behavior. Preserve project/session lifetimes and existing HMR behavior.
- Shutdown timeouts bound waiting; they do not prove that a disposer stopped. Failed or incomplete teardown remains visible and prevents a clean-shutdown claim.

## Coverage of every current project

`R` means use shared reporting at the project's own terminal boundary; `E` means use local typed exceptions where operational context is needed; `D` means migrate its dependency composition. “Via caller” is an explicit propagation policy, not an omitted audit. Roots below are existing paths.

| Nx project                       | Root                                           | Adoption and proof                                                                                                                         |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `wbs-be-01`                      | `apps/wbs/be-01`                               | R/E/D: boot, HTTP failure boundary, migration CLIs; keep readiness and transactional behavior.                                             |
| `wbs-gw-01`                      | `apps/wbs/gw-01`                               | R/E/D: startup, backend failures, socket/presence ownership; preserve WS codes.                                                            |
| `wbs-mcp-01`                     | `apps/wbs/mcp-01`                              | R/E/D: tool-call boundary and startup; preserve tool envelopes and caller identity.                                                        |
| `wbs-fe-01`                      | `apps/wbs/fe-01`                               | R/E: safe fault reporting and existing refusal states. D not applicable now; keep props, factories, hooks, and typed React/router context. |
| `twilight-burokrat`              | `apps/wiki/cli`                                | R/E/D at CLI dispatch/resource ownership; preserve stdout formats, trusted closure, and release/activation refusals.                       |
| `wbs-core`                       | `libs/wbs/application/core`                    | E/D at typed operational failures and `compose.ts`; R via injected logger/caller, no global sink.                                          |
| `wbs-conformance`                | `libs/wbs/application/conformance`             | Exercise D replacements/ownership and E propagation in conformance; no production reporter.                                                |
| `wbs-observability`              | `libs/wbs/adapters/observability`              | R: replace serializer and log schema together; logger construction supplied by application D roots.                                        |
| `wbs-config`                     | `libs/wbs/adapters/config`                     | E for invalid/unreadable config; R at startup caller, loaded before serving. Never disclose secret values.                                 |
| `wbs-auth`                       | `libs/wbs/adapters/auth`                       | E for unexpected adapter failures; preserve modeled authentication rejection; R/D at caller.                                               |
| `wbs-store-sqlite`               | `libs/wbs/adapters/store-sqlite`               | E for operational context; caller owns D disposal and R. Preserve rollback and driver-specific classification.                             |
| `wbs-store-memory`               | `libs/wbs/adapters/store-memory`               | D fixture/provider use; E only for genuine adapter failures, preserve modeled outcomes and unsupported-operation contracts.                |
| `wbs-runtime-portable`           | `libs/wbs/adapters/runtime-portable`           | Portable providers and E at transport failures; R/D at caller, bounded retries unchanged.                                                  |
| `wbs-realtime`                   | `libs/wbs/adapters/realtime`                   | Browser E/R policy through caller; caller/hook owns socket and listener cleanup. No DI Bag migration; preserve reconnect/replay.           |
| `wbs-solver-supervisor-protocol` | `libs/wbs/adapters/solver-supervisor-protocol` | Preserve validated wire records; E only for local decode/configuration failure, R/D at process caller.                                     |
| `wbs-solver-py`                  | `libs/wbs/adapters/solver-py`                  | Python does not import npm packages. Its validated failures enter E/R through the Bun supervisor; D owns the host process lifecycle.       |
| `wbs-domain`                     | `libs/wbs/domain/domain`                       | Pure algorithms remain package-free unless a specific typed invariant needs E. No reporting sink or DI graph.                              |
| `wbs-contracts`                  | `libs/wbs/domain/contracts`                    | Preserve protocol unions and validators; audit local client exceptions for E. No container or diagnostic payload in DTOs.                  |
| `wbs-validation`                 | `libs/wbs/domain/validation`                   | Preserve validation boundary and existing exception identity; R/D through consumers.                                                       |
| `shared-validation`              | `libs/shared/domain/validation`                | Preserve `ValidationError` and parse behavior; no forced package dependency or bag.                                                        |
| `harness-example`                | `tools/harness-example`                        | R/E/D: ACP node/process failures and client graph; selected public feedback to agents, diagnostics to operator sink.                       |
| `tool-deploy`                    | `tools/tool-deploy`                            | R/E/D around deploy dependencies; preserve dry-run, health checks, rollback and nonzero exit.                                              |
| `tool-remote-scripts`            | `tools/tool-remote-scripts`                    | R/E/D at swap/supervisor ownership; preserve shell output contracts and manual rollback guidance.                                          |
| `tool-smoke`                     | `tools/tool-smoke`                             | R/E/D at network-check composition; a failed probe remains a failing command.                                                              |
| `tool-bootstrap`                 | `tools/tool-bootstrap`                         | R/E in Bun push boundary; D for injected process/filesystem dependencies, shell scripts retain their contracts.                            |
| `tool-secrets`                   | `tools/tool-secrets`                           | R/E/D at CLI process boundary; plaintext and subprocess secret output never enter reports.                                                 |
| `tool-compose`                   | `tools/tool-compose`                           | R/E at command boundary; rendering stays pure, D only in command IO composition.                                                           |
| `tool-dev-setup`                 | `tools/dev`                                    | R/E/D at setup/solver command wiring; preserve explicit configuration failures.                                                            |
| `tool-devsync`                   | `tools/tool-devsync`                           | R/E/D at sync process ownership; also owns project coverage and import-policy proofs.                                                      |
| `tool-fleet`                     | `tools/tool-fleet`                             | R/E/D at fleet command and host-connection boundaries; a host it cannot reach is a failing command, never a skipped one.                   |
| `tool-git-hooks`                 | `tools/tool-git-hooks`                         | R/E at hook/install exits; use command-local D where there are injected IO resources, keep tiny checks ordinary functions.                 |
| `tool-workflows`                 | `tools/tool-workflows`                         | R/E at generation/check CLI; pure generation stays ordinary functions, D at IO boundary only.                                              |
| `tool-observability-stack`       | `tools/tool-observability-stack`               | R/E at validator boundary and update consumers of `err`; YAML dashboards are not DI graphs.                                                |
| `tool-dagger`                    | `tools/tool-dagger`                            | R/E/D at Dagger client/command boundary; preserve executor outputs and cleanup.                                                            |
| `tool-test-scratch`              | `tools/test/scratch`                           | Preserve fixture allocation/preload lifecycle; propagate failures to tests, no autonomous logger or container.                             |

This table is an audit baseline, not permission to ignore future projects. The implementation inventory must classify every source boundary within these roots, including `.mjs`, generated command entrypoints, standalone bundles, and non-Nx shell scripts under `bin/`. Shell/Python processes keep their native contracts and are reported by Bun callers; do not introduce JavaScript runtime dependencies into them.

## Ordered implementation slices

Complete each slice with a focused failing test, minimal implementation, passing target, and a commit containing only that slice. For safety checks, also remove/break the production check and observe the named negative failing before restoring it. Record actual observations in the owning `verify.md`; do not copy proposed proofs into `Proof:` comments.

### 1. Freeze scope, package versions, and executable acceptance criteria

**Files:** `package.json`, `bun.lock`, `tools/tool-devsync/src/toolchain-pins.test.ts`; new `tools/tool-devsync/src/package-adoption.ts` and `package-adoption.test.ts`. Inventory reading uses existing `tools/tool-devsync/workspace-projects.mjs`.

- [ ] Install the exact versions using Bun. There is no compiler alias bump: the installed alias already answers the compiler API with 6.0.3.

```sh
bun add --exact di-bag@0.4.0 application-exception@0.5.0 caught-object-report-json@11.0.1
NX_DAEMON=false bunx nx run tool-devsync:typecheck
NX_DAEMON=false bunx nx run twilight-burokrat:build
```

- [ ] Hold the pins in `toolchain-pins.test.ts`, asserting the exact manifest versions and that `bun.lock` carries exactly one `caught-object-report-json` key at 11.0.1. Prove both by mutation: a caret on one pin, a lockfile-only edit of that version, and installing `application-exception` 0.4.0, whose `caught-object-report-json ^10` cannot share the pinned copy.
- [ ] Prove the installation as well as the lockfile text, with two separate probes so that each failure is reachable: one asserts the three resolved versions and imports them, the other asserts that the root and `application-exception` resolve the same `caught-object-report-json` path. A duplicate copy invalidates `isTypedException` and constructor assumptions, and a lockfile key cannot say what the runtime loaded. Keep npm registry URLs and the `npm:` alias syntax; never run npm as a task runner.
- [ ] Add an inventory keyed by Nx project name with three dispositions: `direct`, `via-caller` (naming the owning boundary), or `not-applicable` (with reason). The test compares exact project sets using `readProjects`; a new project, stale entry, or missing package disposition fails. This measures coverage, not successful adoption: completion additionally needs each boundary's behavioral evidence. The set is the 35 current projects plus `shared-failures`, which is 36 once slice 2 lands.
- [ ] Prove the inventory check by adding an unclassified fixture project and by removing its set comparison. Test unreadable/malformed inventory separately from missing project disposition. Confirm `tool-devsync`'s Nx cache inputs cover the inventory file behaviourally, by mutating it under a warm cache; that proof needs a passing run of the whole target, so it belongs to whoever can stage files.
- [ ] Encode scenarios for all requirements above: unknown/primitive failures, secret exclusion, limits, protocol preservation, portable graph execution, readiness, ownership, transaction isolation, tool exits, and complete project coverage. Keep general programming terms out of `CONTEXT.md`; the glossary format excludes them. Any newly resolved product term belongs there immediately.
- [ ] Create no OpenSpec change in this slice. Installing unused dependencies, holding pins and correcting this document change no observable behavior, contract, migration, deploy safety or architecture, and use R4's docs exemption. Each change is created at the start of the slice that first implements under it, as the opening "Spec" paragraph now says: `adopt-failure-reporting` at the start of slice 2, because that slice adds an Nx project, an alias and an exported contract; `adopt-di-composition` at the start of slice 4; `complete-package-adoption` at the start of slice 7. Each has `proposal.md` (intent ≤400 words), delta `specs/`, `tasks.md`, `verify.md`, and `design.md` for its technical shape.

**Deliverable:** locked dependencies at 0.4.0 / 0.5.0 / 11.0.1, a proved single resolved copy of the report library, and exhaustive project accounting. No OpenSpec change is owed by this slice; slices 2, 4 and 7 each open their own. Package changes needing upstream work remain blocked by a named required release; never vendor a workaround silently.

### 2. Build and prove the shared reporting policy

**Create:** `libs/shared/domain/failures/{project.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json}`, `src/{index.ts,report-failure.ts,report-failure.test.ts}`; alias in `tsconfig.base.json`. Mirror `shared-validation`'s project structure and test/typecheck/lint targets. Put symbol behavior and limits in JSDoc.

- [x] Open the `adopt-failure-reporting` OpenSpec change before writing any file of this slice. It covers slices 2 and 3: a new Nx project, a new alias and a new exported reporting contract are architecture and contract under R4, whether or not an application caller has adopted them yet. Its delta spec states the reporting behaviour this slice and the next must exhibit, and its `verify.md` collects both slices' observations.
- [x] Start with these two acceptance cases, watch them fail against an empty module, then implement `FAILURE_REPORT_LIMITS`, `SENSITIVE_KEYS`, `createFailureRedaction` and `reportFailure` as the contract above defines them:

```ts
import { expect, test } from 'bun:test';

import { createFailureRedaction, reportFailure } from './report-failure';

test('correlates a primitive failure without publishing its contents', () => {
  const redact = createFailureRedaction(['private-marker']);
  const reporting = reportFailure('private-marker leaked', { redact });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  const { diagnostic, public: disclosed } = reporting.reports;
  expect(disclosed.occurrence_id).toBe(diagnostic.occurrence_id);
  expect(disclosed.code).toBe('INTERNAL_ERROR');
  expect(JSON.stringify(reporting.reports)).not.toContain('private-marker');
});

test('a cause that cannot be inspected is reported as reporting loss, not as a throw', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  const reporting = reportFailure(new Error('boom', { cause: proxy }), {
    redact: createFailureRedaction([]),
  });

  // `toReports` throws on a revoked Proxy: `Array.isArray cannot be called on a Proxy that
  // has been revoked`. The boundary must still learn that the operation failed.
  expect(reporting.reported).toBe(false);
});
```

- [x] Keep report transformation free of Pino, Node/Bun globals, network, and filesystem access. Require the secret policy explicitly; an empty list is appropriate only where the caller owns no secrets.
- [x] Build `FAILURE_REPORT_LIMITS` and each boundary's policy as constants, never per call: the library caches one report maker per options object and policy.
- [x] Cover `Error.cause`, ordered `AggregateError`, circular objects, `undefined`, `null`, BigInt, throwing getters, revoked proxies, long Unicode strings, sensitive nested keys, secrets inside stack and message strings, and package inspection failures. Assert the budget behaviour by its visible fields — `context_omitted`, `reporting_errors_omitted`, `truncated` — rather than by byte arithmetic. Validate diagnostic and public schemas after redaction and truncation. Never claim output bounds isolate a nonterminating getter or hook.
- [ ] Add integration tests for secret-bearing config/HTTP/CLI fixtures at their actual call sites in later slices. Remove the key rules, the pattern rules, the shared `toReports` call and the never-throw wrapper separately; record which production test fails for each mutation in the change's `verify.md`.
- [x] Verify with `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`,
      `shared-failures:typecheck`, and `shared-failures:lint`.
- [ ] Add a browser execution fixture for `@shared/failures` to the portable test path; Vite
      build success alone is insufficient. **Unassigned:** packet 040.1 proves the three
      libraries in Chromium and never imports this module, so nothing in batch 2 discharges
      this.

**Deliverable:** one reporting policy reusable by WBS, wiki, and infrastructure without cross-product imports, under an OpenSpec change opened before its first file.

### 3. Adopt reporting and selected typed failures in WBS

**Modify:** `libs/wbs/adapters/observability/src/{serializers.ts,logger.ts,log-schema.ts,logger.test.ts}`; `apps/wbs/be-01/src/{app.ts,http/elysia/mount.ts,main.ts}`; gateway `app.ts` and `service/backend-request.ts`; MCP `src/{server.ts,server.test.ts,wbs-client.ts,wbs-client.test.ts}`; frontend `src/components/chrome/{fault-boundary.tsx,app-fault.test.tsx}`. Define new exception kinds beside their respective transport/config operations. Review all migration CLI entrypoints under backend `src/` too.

- [ ] First extend `logger.test.ts` to emit `logger.error({ err: thrown }, 'operation failed')`, parse the actual output with `LogRecord`, and assert nested-cause/correlation/secret behavior. The current tests only exercise records without `err`; they do not cover the existing `type` versus `name` mismatch.
- [ ] Route Pino's serializer through the shared policy and change the schema in the same commit. Choose one path for already-reported exceptions so the logger never wraps a `DiagnosticReport` as a new caught value. Keep child request/connection fields.
- [ ] Include `mcp-01` in `ServiceName` and `LogRecord` when wiring its Pino logger; currently both enumerate only backend, gateway, and frontend. Test a real MCP record against the schema. Tool and wiki reporters use the shared policy directly rather than importing the WBS logger.
- [ ] Give the mounted backend unexpected-error boundary access to its logger and safe policy. Extend `apps/wbs/be-01/src/http/elysia/` tests with an injected store failure: response remains generic 500 and the operator receives one correlated report. Preserve modeled auth/parser/refusal responses.
- [ ] Make MCP bad-input failures distinguishable from unexpected transport/decoder faults. Keep correctable input messages; remove raw unexpected cause text from agent-facing content. Gateway failures retain their existing frame codes and reconnect behavior.
- [ ] Frontend boundaries render selected safe text while preserving reset keys, reload actions, and Error Boundary semantics. Add a render test with a secret-bearing failure; neither DOM nor console receives raw diagnostics. Do not replace normal query/refusal UI with exceptions.
- [ ] Run focused targets for `wbs-observability`, `wbs-be-01`, `wbs-gw-01`, `wbs-mcp-01`, and `wbs-fe-01`. Inspect `tools/tool-observability-stack/src/{promtail,grafana}` for log-field consumers and verify any changed dashboard/ingestion queries. Add regression cases before changing any consumer.

**Deliverable:** real application paths use the new reporting contract; public protocols and modeled outcomes keep their existing behavior.

### 4. Adopt DI Bag inside the portable core composition

**Modify:** `libs/wbs/application/core/src/{compose.ts,compose.test.ts}` and `testing/{portable-composition.ts,portable-composition.spec.ts}`. Preserve callers in backend `services.ts` and core tests. Add compile fixtures under core `testing/` and a test invoking the supported compiler on positive and negative fixtures.

- [ ] Add tests asserting existing accountful/accountless return types, single shared throttle/replay instances, fresh compositions with different clocks/stores, and identical command/save/replay/retention behavior.
- [ ] Register existing services with explicit typed dependencies and portable acquisition modes; use private feature modules only where they reduce the root's wiring. Resolve ordinary service values before returning the existing public service object. Core graphs borrow resources, so they acquire no hidden disposer obligations.
- [ ] Keep `servicesOver` over admitted stores. Extend `service/plan-commands.test.ts` and backend `service/plan-commands.db.test.ts` to prove separate batches cannot share stores/collectors, rollbacks publish nothing, and repair uses the surviving admitted state. A root provider substitution must make the relevant production test fail.
- [ ] Compile fixtures must reject a missing registration and an incompatible factory contract; first prove an equivalent valid fixture compiles. Remove the erroneous dependency from each negative and observe it compile, proving that the expected rejection is specific. Exercise runtime cycles/unavailable dependencies without unsafe production casts.
- [ ] Run `bunx nx run wbs-core:test --skip-nx-cache`, `wbs-core:typecheck`, and `wbs-core:test:portable`. The browser fixture must execute without Bun, Node shims, backend traffic, or an ambient automatic classifier.

**Deliverable:** the portable core uses DI Bag while callers keep existing ports and overloads. Passing unit tests cannot substitute for Chromium execution.

### 5. Transfer backend startup and resource ownership

**Modify:** `apps/wbs/be-01/src/{services.ts,services.db.test.ts,boot.ts,boot.db.test.ts,main.ts,production-entrypoint.test.ts}`; source/runtime adapters only where their public ownership contract requires it.

- [ ] Extend boot tests before editing the root: occupied port, source-open failure, service-construction failure, optimizer-start failure, retention already running, repeated stop, and a disposer that rejects. Record which resources opened and which closed, not just the process exit code.
- [ ] Move owned resources into DI providers with explicit disposers. Startup must acquire and validate the entire readiness-critical graph before advertising health. If an async lifecycle requires changing `bootBe01`'s signature, make the contract change explicit in this packet and update every caller/test together; otherwise retain its current synchronous public API.
- [ ] Preserve the single `LoginThrottle` identity and backend shutdown ordering. Register cleanup immediately after acquisition. `buildAndStart` rollback covers managed acquisitions; an individual throwing factory remains responsible for its own partially acquired resource.
- [ ] Inject startup failure after the database opens and prove the database/timer/process are released. Break a disposer and prove stop fails while the remaining cleanup is attempted. For every new readiness/ownership check, run the production mutation negative and add the observed `Proof:` comment.
- [ ] Run `bunx nx run wbs-be-01:test --skip-nx-cache`, `wbs-be-01:typecheck`, plus both store conformance targets and `wbs-core:test:portable` if portable composition changed.

**Deliverable:** DI Bag owns backend resources with verified startup rollback and shutdown. Database migrations still run only through the existing deployment contract.

### 6. Adopt gateway and MCP composition

**Modify:** gateway `src/{main.ts,app.ts}` and its socket/presence tests; MCP `src/{main.ts,http.ts,http.test.ts,server.ts,server.test.ts}`. **Create:** gateway/MCP app-local `composition.ts` and `composition.test.ts` where entrypoints embed wiring. This slice does not change frontend composition or add a frontend container.

- [ ] Gateway: compose config, logger, backend transport, presence, subscription map, socket writer, and server as ordinary dependencies. Two application instances must not share presence or sockets; shutdown drains/closes once. Preserve deadline/cancellation tests.
- [ ] MCP: compose config, OpenAPI tool catalogue, OAuth/verifier, backend client, and HTTP server. Per-call credentials remain call arguments/request scope, never root cached state. Prove concurrent callers use different credentials and an unexpected failure produces one safe tool error plus an operator report.
- [ ] Preserve the frontend's existing dependency seams and resource ownership while adapting reporting in slice 3. Use `src/app-router.tsx`, `src/components/wbs/use-plan-read.ts`, and `src/lib/project-stream.ts` as the actual integration points; the generic realtime scaffold is not the live project stream. Keep mount/unmount/remount, project switching, and cleanup tests as the lifecycle oracle.
- [ ] Test failed startup and failed cleanup through gateway/MCP entry boundaries. Run those applications' `test`, `typecheck`, and `build` targets, then `bunx nx run wbs-fe-01:e2e` for login, write, reconnect/replay, and fault recovery across the changed servers. New composition tests must exercise exported production factories, not parallel fixture graphs.

**Deliverable:** backend, gateway, and MCP have explicit DI composition and ownership; the React frontend retains its existing composition and passes cross-application regression checks.

### 7. Complete wiki, harness, and tool adoption

**Entrypoints:** wiki `src/cli.ts` and `src/policy/{release-cli.ts,prepare-activation-cli.ts,prepare-relocation-activation-cli.ts}`; harness `src/{main.ts,harness.ts,acp.ts,log.ts}`; tools listed below. Add root-local `composition.ts`/`failures.ts` only when that root needs them, with adjacent tests.

| Root under `tools/`        | Files to start from                                                            | Required production-path negative                                                                 |
| -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `tool-deploy`              | `src/{deploy.ts,migrations.ts,remote-state.ts}`                                | Failed health or rollback remains a failed deploy with manual completion command.                 |
| `tool-remote-scripts`      | `src/{swap.ts,solver-supervisor.ts,install.ts}` and supervisor runtime/service | Malformed solver output/start failure/cleanup rejection cannot report successful service or swap. |
| `tool-smoke`               | `src/main.ts`                                                                  | Unreachable target exits nonzero and names the failed probe.                                      |
| `tool-bootstrap`           | `src/{push.ts,lib/secrets.ts}`                                                 | Missing secret or rejected remote command remains failure without revealing its content.          |
| `tool-secrets`             | `src/cli/{shared.ts,decrypt.ts,encrypt.ts,push.ts,updatekeys.ts}`              | Rejected subprocess containing a secret prints no secret and cannot exit successfully.            |
| `tool-compose`             | `src/{index.ts,render.ts}`                                                     | Malformed required render input does not produce a usable compose file.                           |
| `dev`                      | `setup.ts`, `solver-setup-cli.ts`                                              | Missing/unreadable required config remains distinct and failing.                                  |
| `tool-devsync`             | `src/sync.ts` and solver lifecycle helpers                                     | Failed preparation cannot launch dependent services; partial resources close.                     |
| `tool-git-hooks`           | `src/install.ts`, `src/hooks/*.ts`                                             | A real violating input still blocks the hook; reporting never swallows its exit.                  |
| `tool-workflows`           | `src/generate.ts`, `src/cli.integration.test.ts`                               | Invalid workflow/check mismatch remains nonzero; stdout is not mixed with diagnostics.            |
| `tool-observability-stack` | `src/validate.ts`                                                              | Malformed stack config remains a failing validator.                                               |
| `tool-dagger`              | `src/{main.ts,main.test.ts}`                                                   | Dagger client failure cleans up and preserves executor failure.                                   |
| `test/scratch`             | `index.ts`, `preload.ts`                                                       | Allocation/cleanup errors still fail their owning test; no extra logging runtime.                 |

- [ ] Work one command family at a time; take its existing tests as the compatibility oracle. Keep machine-readable stdout separate from diagnostic stderr and preserve documented exit codes. Audit shell callers before changing stderr text that a caller parses.
- [ ] Migrate wiki and harness operational exception kinds with their classifiers. Wiki report/attestation JSON and trust checks stay unchanged. Harness diagnostics must not become raw model input, authorize retries, or count as a successful agent run.
- [ ] Prove the wiki's rebuilt standalone bundle runs without the workspace dependency tree using its release tests. Update trusted module closure only where the actual bundler leaves runtime imports; do not assume adding a root dependency makes it available to an activation bundle. Do not release/activate as part of this implementation test.
- [ ] Keep Python solver wire schemas unchanged; its Bun host wraps local process/parse failures, records diagnostics, and preserves solver refusal/cancellation dispositions. Run `wbs-solver-py:test` and the supervisor tests for this boundary.
- [ ] Populate every inventory disposition with implementation paths and tests, including retained native/control-flow error types. No entry may say merely “audited” or “later”. Run the touched projects' existing `test`, `typecheck`, and `lint` targets, and `build` only where declared. Use `twilight-burokrat:lint:source` for source lint; preserve the separate trusted wiki lint gate.

**Deliverable:** all 35 baseline projects plus `shared-failures` have complete dispositions backed by code and behavioral tests; packaged tools remain standalone and fail correctly.

### 8. Enforce, verify, and hand off

**Modify:** `tools/tool-devsync/src/{package-adoption.test.ts,eslint-boundaries.test.ts,product-constraints.test.ts}`, owning lint policies, and Nx target inputs. Update behavior JSDoc beside changed symbols and the three OpenSpec `verify.md` files.

- [ ] Add narrow import checks: `di-bag/node` cannot reach browser/isomorphic production code, business services cannot import a composition root or obtain a global bag, and reporting code cannot pull product-specific logger adapters into shared libraries. Positive imports must pass. Do not blanket-ban all native `Error`, `console.error`, or expected-result unions.
- [ ] Inject forbidden imports into production-path lint fixtures and remove each rule to see its negative fail. Prove Nx sees policy/inventory changes after a warm cache. A regex scan alone is not evidence that the compiled graph or logger path uses a policy.
- [ ] Re-enumerate projects with `readProjects` and reconcile the inventory. Re-run the actual reporting, startup, transaction, portable-browser, CLI-exit, and release-bundle cases. Review any grep remnants by semantics instead of mechanically replacing every throw/catch.
- [ ] Run the release verification below. For each failed/unavailable check, name the exact gap and keep its slice incomplete. A published-package bug is a required upstream release, not a reason to relax the acceptance test.
- [ ] Commit each approved slice with hooks enabled. Archive/sync OpenSpec only after implementation evidence satisfies its requirements. Deployment and publishing the personal packages are not implied by completion of this plan.

## Required implementation verification

| Guarantee                                        | Test/fault to run                                                                                                         | Evidence required in `verify.md`                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Reports protect secrets and preserve correlation | Real logger/HTTP/MCP/React/CLI paths with secret-bearing primitive and nested failures; bypass redaction or ID forwarding | Observed negative failure, restored passing output, schema validation and final byte counts.       |
| Size/inspection limits are visible               | Oversized Unicode/context and throwing property access; remove final record cap                                           | Bounded valid JSON with truncation/inspection indication; no false operation success.              |
| Refusals are preserved                           | Existing auth, command batch, WS and MCP outcomes; inject unexpected storage/decoder failure                              | Existing status/body/frame and expected failure classification, without raw diagnostic disclosure. |
| Composition is checked and portable              | Positive/negative compile fixtures; real core browser probe with explicit acquisition modes                               | Compiler diagnostic for the intended error and successful browser use cases.                       |
| Resources have one owner                         | Occupied listener, partial startup, rejecting disposer, repeated stop, independent forks                                  | Exact acquisition/disposal events and failing incomplete shutdown.                                 |
| Transaction lifetime is preserved                | Batch isolation, rollback, afterRollback repair; replace admitted store with root store                                   | Behavioral test fails on the mutation; no event escape or deadlock.                                |
| Tools remain fail-closed                         | Missing/unreadable files, failed remote commands, malformed solver output, standalone wiki bundle                         | Process exit plus asserted output/effects; absence and unreadability tested distinctly.            |
| Policy coverage cannot silently shrink           | New project, deleted disposition, forbidden import, warm-cache policy change                                              | Real inventory/lint target rejects the fault and reruns when an input changes.                     |

Commands for the eventual implementation, not commands claimed to have passed during planning:

```sh
bunx @fission-ai/openspec@1.12.0 validate --all --json
bunx nx run wbs-core:test:portable
bunx nx run wbs-fe-01:e2e
```

On **h2puni**, commit the candidate and use `bin/h2puni-gate.sh <candidate-sha>`; do not check that SHA out first or run raw full Nx gates there. Record the printed `h2puni gate: running on <sha>` and the actual exit/output. Exit 65 requires resolving the named dirty files; never an unattended clean. Read the [concurrent gate audit](../../2026-08-30-agent-loop-audit.md) before gating alongside other agents.

On another authorized build host, the full equivalent includes `bunx nx format:check --all` and the repository's test/lint/typecheck/build gate. CI additionally requires secrets and migration lint. The separate browser/portable tests above are required because a normal build does not prove browser execution. No schema migration is intended by this adoption.

Roll back a failed slice through its ordinary source commit and lockfile together, rerunning its tests. Do not leave partially migrated error classifiers, mixed log schemas, or two owners for one resource. Release/deploy rollback continues to use the existing runbooks; package adoption does not rewrite that machinery.

## Evidence gathered while writing this plan

- Worktree was clean at initial inspection. `readProjects(process.cwd())` returned **34** projects; their names are covered individually above. Root manifest/source search found no current adoption of the three packages.
- Public registry metadata and exact archive declarations verified **9.0.1 / 0.3.0 / 0.3.0**. A temporary Bun install outside the repo installed those three plus nanoid; workspace dependencies were not changed.
- A temporary probe on Bun **1.4.2** verified typed-error public/diagnostic correlation, explicit primitive correlation, public cause exclusion, CORJ's configured 4,096-byte bound, explicit-mode DI construction, and dependent-before-source disposal. Output: `PASS: typed and primitive correlation, public cause exclusion, CORJ byte bound, explicit-mode DI construction and dependent-first disposal`.
- Native TypeScript **7.0.2** compiled that probe, including `builder.verifyGraph() satisfies void`, with strict checking and exit **0**. The first invocation used an unavailable `bun` type-library name; the corrected probe uses the installed `node` types and passed. This was a small API check, not repository integration or browser verification.
- Initial sandbox registry DNS access failed; public registry reads and the temporary install succeeded with approved network access. The first probe emitted host dconf warnings; rerunning with `GSETTINGS_BACKEND=memory` produced the clean output above.
- Initial planning checks passed: all 34 current project names appeared exactly once in the coverage table; all local Markdown links resolved; intent and index were within their line/word limits; both changed Markdown files passed Prettier; `git diff --check` and `bunx nx format:check --all` exited 0. The index links to this plan.
- Browser compatibility, production migrations, all implementation negatives, application tests, and the full host gate have **not** been run for this proposed adoption. The `openspec` executable was absent from PATH; the pinned Bun invocation above must be available before implementation artifact validation. No OpenSpec change or runtime behavior is introduced by this planning-only edit.
