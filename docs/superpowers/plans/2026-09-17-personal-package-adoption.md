# Personal package adoption implementation plan

> **For agentic workers:** Use `executing-plans` to implement the approved slices below. Use `subagent-driven-development` only when delegation is authorized. Checkboxes describe future implementation, not work already completed.

**Goal:** Adopt `caught-object-report-json`, `application-exception`, and `di-bag` throughout this repository according to each project's responsibilities.

**Architecture:** Keep exception definitions beside the operations that fail, share a small framework-free reporting policy, and use DI Bag in backend, portable-core, and resource-owning tool composition. The React frontend retains props, ordinary factories, hooks, and typed React/router context. Existing ports, typed refusal results, transaction admission, and public protocols remain authoritative.

**Tech stack:** Bun, Nx, TypeScript, Elysia, React/Vite, Pino, SQLite, and the three published packages.

**Spec:** The proposed behavior is defined below. Existing constraints come from [core extraction](../../../openspec/specs/core-lib-extraction/spec.md), [HTTP endpoint contracts](../../../openspec/specs/http-endpoint-port/spec.md), and [AGENTS.md](../../../AGENTS.md). Create the OpenSpec implementation packets in slice 1 before changing behavior.

**Status:** Proposed plan, requested on 2026-09-17; implementation has not started. “All projects” means complete coverage by role, including explicit dispositions where a package does not apply. User scope amendment: do not adopt DI Bag in the React frontend for now; retain frontend reporting work. Other proposed designs remain subject to review.

## Amendment, 2026-09-19: read before executing

This plan was written against older package versions and an older scope. It is kept as the
record of that day. Rewrite slices 1 and 2 before executing anything; the facts below replace
the matching statements further down.

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
- **Browser proof is partial.** The Vite 8.2.2 bundle built and ran in a Node sandbox with
  Node's globals hidden. It has not run in Chromium.

## Intent

**Problem.** The workspace has 34 Nx projects, hand-built service graphs, and several unrelated ways to turn caught values into text. Its WBS logger accepts only `Error`; its serialized error shape and declared log schema disagree. The three owner-maintained packages are published but absent from workspace dependencies.

**Outcome.** Every runtime boundary has a deliberate reporting policy; failures that need typed context use owner-local exception kinds; backend, portable-core, and resource-owning tool graphs use DI Bag with explicit ownership. React keeps its current dependency-passing and lifecycle mechanisms. Every Nx project has a recorded adoption disposition, including the Python solver and pure libraries. New projects cannot silently escape that accounting.

**Non-goals.** Do not move or republish the three package repositories, vendor their implementations, replace Pino/ArkType/React, invent a new HTTP or WebSocket error protocol, turn normal refusal results into exceptions, replace the transaction coordinator, or add an agent execution framework. Publishing package fixes and deploying this repo are separate actions.

**Constraints.** Consume exact published versions through Bun. Preserve the architectural rings, browser execution, deployment rollback, and existing response/exit contracts. Prove new safety checks through the real production path with injected faults and observed mutation failures. A runtime incompatibility requires a package fix and published release before that adoption slice proceeds.

## Published baseline and compatibility

Inspected on 2026-09-17 against workspace commit `c02944ffb7aaf2caa95676ca53a3cd4a7da4353c`. Versions below came from the public registry, then their exact archives were inspected; GitHub `main` is not the installation source.

| Package                                                                                 | Exact baseline | Verified surface                                                                                                                                              | Consequence for this repo                                                                                                                                                |
| --------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [caught-object-report-json](https://registry.npmjs.org/caught-object-report-json/9.0.1) | `9.0.1`        | `makeCorj`, `CorjMaker`, `restoreExpectedValues`; unknown caught values, nested causes, depth/child/size limits                                               | Use for diagnostic serialization. Compact reports can omit `message` and constructor fields; consumers must understand that representation.                              |
| [application-exception](https://registry.npmjs.org/application-exception/0.3.0)         | `0.3.0`        | `defineException`, `isTypedException`, `toDiagnosticReport`, `toPublicReport`, `decodePublicReport`                                                           | Own typed failures locally. Public policies select disclosed content; diagnostics contain substantially more information. Depends on CORJ `^9.0.1` and `nanoid ^3.3.19`. |
| [di-bag](https://registry.npmjs.org/di-bag/0.3.0)                                       | `0.3.0`        | `createBuilder`, `register`, `build`, `buildModule`, `verifyGraph`, `fromFactory`, `withDisposal`, `buildAndStart`, `resolve`, `fork`, `createScope`, `close` | Compose explicit factories, preserve resource lifetimes, and use portable acquisition modes. Zero runtime dependencies.                                                  |

Primary documentation: [CORJ](https://github.com/dany-fedorov/caught-object-report-json), [application-exception](https://github.com/dany-fedorov/application-exception), [DI Bag](https://github.com/dany-fedorov/di-bag). The package archive README and declarations were used to check the signatures in this plan.

Compatibility work precedes production adoption:

- DI Bag documents classic TypeScript **6.0.3** as its floor and tests native **7.0.2**. This repo already uses native 7.0.2 for `tsc`, but exposes classic 6.0.2 to compiler-API consumers through `typescript: npm:@typescript/typescript6@6.0.2`. Move that alias to 6.0.3 and verify ESLint and wiki extraction/release fixtures. Do not replace the two-compiler arrangement.
- CORJ and application-exception publish CommonJS. Verify Bun import interoperability and the actual Vite/browser bundle, including nanoid's browser resolution. A Bun import does not prove browser execution.
- Use `di-bag`, not `di-bag/node`, in portable code. Browsers have no automatic native-Promise classifier: register synchronous providers with `acquisitionMode: 'raw'` and asynchronous providers with `acquisitionMode: 'nativePromise'`. An async provider still exposes a `Promise<T>` to its consumers.
- `build()` does not eagerly run every provider or establish readiness. Explicitly acquire required startup services before reporting ready. A synchronous provider that partially acquires resources must clean them up itself if it throws before returning an owned value.
- `verifyGraph() satisfies void` is a compile-time composition check, not runtime proof that every dependency exists or that no cycle can execute. Exercise runtime graph failures too. `di-bag-graph` is a separate package and is outside this three-package plan.
- For primitive throws, two report calls otherwise produce separate occurrence IDs. Create the diagnostic once and pass its `occurrence_id` to `toPublicReport`.
- CORJ's size bound covers its report. Application-exception adds context and reporting failures outside that budget; impose and test a bound on the final serialized record as well.

## Proposed integration contract

### Reporting

Add `libs/shared/domain/failures` as `shared-failures`, alias `@shared/failures`, tagged `scope:shared`, `ring:domain`, `runtime:isomorphic`, `product:shared`. Like `shared-validation`, it contains framework-free transformations, not a logger, process hook, container, or product-specific exception catalogue. It introduces one additional project; the migration inventory must then cover 35.

Its public surface is:

```ts
import type { DiagnosticReport, PublicReport } from 'application-exception';

export interface FailureReports {
  readonly diagnostic: DiagnosticReport;
  readonly public: PublicReport;
}

export interface ReportPolicy {
  readonly redactValues: readonly string[];
}

export function reportFailure(caught: unknown, policy: ReportPolicy): FailureReports;
```

This is a proposed interface, not existing code. `reportFailure` calls `toDiagnosticReport` once, applies the policy, and correlates `toPublicReport` using that diagnostic's occurrence ID. Use CORJ's exported types/default restoration for consumers and its serializer for standalone diagnostic-only boundaries; do not serialize the same caught value repeatedly just to use both packages.

Reporting requirements:

1. Configure diagnostic traversal to 16,384 UTF-8 bytes, depth 4, and 16 children. Cap the final diagnostic JSON at 32,768 UTF-8 bytes, including occurrence ID and any package reporting errors. After projection/redaction, drop optional diagnostic fields and children in a deterministic order until within the cap, setting `truncated: true`; preserve `v` and `occurrence_id`. Validate the final object against the installed diagnostic schema. Do not slice JSON text.
2. Redact sensitive keys recursively, case-insensitively: `authorization`, `cookie`, `set-cookie`, `password`, `token`, `access_token`, `refresh_token`, `secret`, `jwtKey`, and `internalAuthSecret`. Also replace non-empty configured secret values wherever they appear in strings, including stacks, `as_string`, `as_json`, and reporting-error text. Callers supply the secrets they own; never attach whole config, requests, or environment objects. Unknown embedded secrets cannot be guaranteed detectable, so arbitrary request payloads are excluded by construction.
3. Send only selected public reports to user/agent audiences. Apply the secret policy to the selected public fields too, then validate the public schema; a mistaken public-details selector must not bypass redaction. Unknown exceptions use the package's generic public policy. Browser consoles and agent transcripts are disclosure boundaries too; server diagnostics go only to the operator sink. There is no new browser telemetry endpoint in this plan.
4. Expected inspection failures become the package's visible `reporting_errors`/truncation fields. This models diagnostic loss, not successful execution of the failed operation. Reporter configuration errors and sink failures must not become silent success. Preserve the original failure if reporting also fails, using a minimal fixed terminal message and a failing outcome without recursively invoking the reporter.
5. Report an unexpected failure once at its owning boundary. Lower layers may add typed context and rethrow; they do not each emit a duplicate record. Keep cancellation and normal loading/empty/refusal states in their existing control flow.

The logging migration retains the Pino envelope (`level`, `time`, `msg`, service and correlation fields) and changes `err` to the sanitized diagnostic report. Update `log-schema.ts` in the same slice. Do not manufacture legacy `name/message/stack` fields from possibly omitted compact values.

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
| `wiki-cli`                       | `apps/wiki/cli`                                | R/E/D at CLI dispatch/resource ownership; preserve stdout formats, trusted closure, and release/activation refusals.                       |
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
| `tool-git-hooks`                 | `tools/tool-git-hooks`                         | R/E at hook/install exits; use command-local D where there are injected IO resources, keep tiny checks ordinary functions.                 |
| `tool-workflows`                 | `tools/tool-workflows`                         | R/E at generation/check CLI; pure generation stays ordinary functions, D at IO boundary only.                                              |
| `tool-observability-stack`       | `tools/tool-observability-stack`               | R/E at validator boundary and update consumers of `err`; YAML dashboards are not DI graphs.                                                |
| `tool-dagger`                    | `tools/tool-dagger`                            | R/E/D at Dagger client/command boundary; preserve executor outputs and cleanup.                                                            |
| `tool-test-scratch`              | `tools/test/scratch`                           | Preserve fixture allocation/preload lifecycle; propagate failures to tests, no autonomous logger or container.                             |

This table is an audit baseline, not permission to ignore future projects. The implementation inventory must classify every source boundary within these roots, including `.mjs`, generated command entrypoints, standalone bundles, and non-Nx shell scripts under `bin/`. Shell/Python processes keep their native contracts and are reported by Bun callers; do not introduce JavaScript runtime dependencies into them.

## Ordered implementation slices

Complete each slice with a focused failing test, minimal implementation, passing target, and a commit containing only that slice. For safety checks, also remove/break the production check and observe the named negative failing before restoring it. Record actual observations in the owning `verify.md`; do not copy proposed proofs into `Proof:` comments.

### 1. Freeze scope, package versions, and executable acceptance criteria

**Files:** `package.json`, `bun.lock`, `tools/tool-devsync/src/toolchain-pins.test.ts`; new `tools/tool-devsync/src/package-adoption.ts` and `package-adoption.test.ts`; relevant wiki compiler fixtures in `apps/wiki/cli/src/policy/{release.test.ts,relocation-fixtures.ts}`. Inventory reading uses existing `tools/tool-devsync/workspace-projects.mjs`.

- [ ] Create three ordered `sdd-lean` OpenSpec packets: `adopt-failure-reporting` (slices 1–3), `adopt-di-composition` (slices 4–6), and `complete-package-adoption` (slices 7–8). Each has `proposal.md` (intent ≤400 words), delta `specs/`, `tasks.md`, `verify.md`, and `design.md` for its technical shape. Use the design interview to resolve any objections to this proposal. This planning-only document does not itself change behavior and uses R4's docs exemption.
- [ ] Encode scenarios for all requirements above: unknown/primitive failures, secret exclusion, limits, protocol preservation, portable graph execution, readiness, ownership, transaction isolation, tool exits, and complete project coverage. Keep general programming terms out of `CONTEXT.md`; the glossary format excludes them. Any newly resolved product term belongs there immediately.
- [ ] Add an inventory keyed by Nx project name with three dispositions: `direct`, `via-caller` (naming the owning boundary), or `not-applicable` (with reason). The test compares exact project sets using `readProjects`; a new project, stale entry, or missing package disposition fails. This measures coverage, not successful adoption: completion additionally needs each boundary's behavioral evidence.
- [ ] Prove the inventory check by adding an unclassified fixture project and by removing its set comparison. Test unreadable/malformed inventory separately from missing project disposition. Include inventory inputs in `tool-devsync`'s Nx cache inputs.
- [ ] Install the exact versions and supported classic compiler alias using Bun:

```sh
bun add --exact caught-object-report-json@9.0.1 application-exception@0.3.0 di-bag@0.3.0
bun add --dev --exact 'typescript@npm:@typescript/typescript6@6.0.3'
bunx nx run tool-devsync:test --skip-nx-cache
bunx nx run twilight-bureaucrat:typecheck
```

- [ ] Verify the lock resolves a compatible CORJ for application-exception and one application-exception identity per bundle; a duplicate package copy can invalidate `isTypedException`/constructor assumptions. Keep npm registry URLs and the `npm:` alias syntax; never run npm as a task runner.

**Deliverable:** three reviewable OpenSpec packets, locked dependencies, supported compiler tooling, and exhaustive project accounting. Package changes needing upstream work remain blocked by a named required release; never vendor a workaround silently.

### 2. Build and prove the shared reporting policy

**Create:** `libs/shared/domain/failures/{project.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json}`, `src/{index.ts,report-failure.ts,report-failure.test.ts}`; alias in `tsconfig.base.json`. Mirror `shared-validation`'s project structure and test/typecheck/lint targets. Put symbol behavior and limits in JSDoc.

- [ ] Implement the `FailureReports`/`ReportPolicy` interface above. Keep report transformation free of Pino, Node/Bun globals, network, and filesystem access. Require secret policy explicitly; an empty list is appropriate only where the caller owns no secrets.
- [ ] Start with this acceptance case, then add policy/limit tests through the same production function:

```ts
import { expect, test } from 'bun:test';
import { reportFailure } from './report-failure';

test('correlates primitive failure without publishing its contents', () => {
  const reports = reportFailure('private-marker', { redactValues: ['private-marker'] });
  expect(reports.public.occurrence_id).toBe(reports.diagnostic.occurrence_id);
  expect(reports.public.code).toBe('INTERNAL_ERROR');
  expect(JSON.stringify(reports)).not.toContain('private-marker');
});
```

- [ ] Cover `Error.cause`, ordered `AggregateError`, circular objects, `undefined`, `null`, BigInt, throwing getters/proxies, long Unicode strings, sensitive nested keys, secrets inside stack/message strings, and package inspection failures. Validate diagnostic/public schemas after redaction and truncation. Never claim output bounds isolate a nonterminating getter or hook.
- [ ] Add integration tests for secret-bearing config/HTTP/CLI fixtures at their actual call sites in later slices. Remove redaction, correlation, and the final-size check separately; record which production test fails for each mutation.
- [ ] Verify with `bunx nx run shared-failures:test --skip-nx-cache`, `shared-failures:typecheck`, and `shared-failures:lint`. Add a browser execution fixture to the portable test path; Vite build success alone is insufficient.

**Deliverable:** one reporting policy reusable by WBS, wiki, and infrastructure without cross-product imports.

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
- [ ] Populate every inventory disposition with implementation paths and tests, including retained native/control-flow error types. No entry may say merely “audited” or “later”. Run the touched projects' existing `test`, `typecheck`, and `lint` targets, and `build` only where declared. Use `wiki-cli:lint:source` for source lint; preserve the separate trusted wiki lint gate.

**Deliverable:** all 34 baseline projects plus `shared-failures` have complete dispositions backed by code and behavioral tests; packaged tools remain standalone and fail correctly.

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
