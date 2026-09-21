# Adoption tail ownership and dependency map

**Inventory basis.** Read-only inspection of clean `batch-4-planning` at
`ee079f394b8cc4ce2f130aed68d8aa650b09186e` on 2026-09-21. The only production-independent additions
since the earlier inventory basis are the reviewed `040-6-backend-module-map.md` and
`050-7-frontend-lifetime-map.md`; the production trees used below did not change. No tests or builds were
run for this map. “Measured” below means observed in files at that commit; behavioural claims still
require the plan's TDD and R5 proofs.

## Authority and present state

- Accepted scope and ordering: `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`,
  especially “Coverage of every current project” and slices 6–8. Organization handoff:
  `docs/superpowers/plans/2026-09-19-code-organization-rollout.md` Task 9 and
  `docs/superpowers/specs/2026-09-19-twilight-bureaucrat-rules-design.md` B2/B4.
- Current DI planning constraints: `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`
  and `050-7-frontend-lifetime-map.md`. They settle ownership and replacement behavior while reserving
  final runtime identifiers for the pending grammar/collision decision.
- The exact package pins are installed: `di-bag@0.4.0`, `application-exception@0.5.0`, and
  `caught-object-report-json@11.0.1` are in `package.json`/`bun.lock` (measured).
- `openspec/changes/adopt-failure-reporting` exists. `adopt-di-composition` and
  `complete-package-adoption` do not exist (measured). Slice 7 must open the latter before changing
  wiki/harness/tools; slice 6 is still part of the missing DI change.
- No production TypeScript under `apps/wbs/{gw-01,mcp-01}`, `apps/wiki/cli`, or `tools/` imports any
  of the three packages (measured). Therefore none of the tail obligations is implemented merely by
  installing the dependencies. The reporting work planned in 040.8/040.9 must be completed before
  the two server graphs consume its final boundary contracts.
- Slice 7's command-family table accidentally omits `tool-fleet`, although the accepted exhaustive
  coverage table requires `tool-fleet` R/E/D. It remains in scope. “35 current projects plus
  `shared-failures`” is a coverage assertion; the planned `package-adoption.ts` inventory is absent,
  so slice 7 must create/reconcile it rather than infer completion from this map.
- Root's fresh Nx project-set artifact, `/tmp/puni-codex-resume-20260921/batch4-projects.json`
  (`c4a36e24…`), contains exactly 36 unique names and includes `shared-failures`. This proves only the
  current coverage cardinality (35 baseline projects plus that addition); it proves no R/E/D adoption,
  implementation path, behavioral test, or production negative.

## Slice 6: gateway and MCP DI ownership

### Gateway (`apps/wbs/gw-01`), after 040.9

| Owner/lifetime    | Existing production boundary                                       | Required disposition                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Process root      | `src/main.ts`, new `src/composition.ts`                            | Load `src/config.ts`, install one app-local graph, resolve/start the HTTP/WS server, and own one idempotent stop. Startup/cleanup failures cross the 040.9 reporter exactly once.                                                                                              |
| Application root  | `src/app.ts:buildApp`                                              | Provide logger/reporter, verifier, backend request options, `ForwardClient`, `ResumeClient`, `GatewayMetrics`, `Presence`, and `SubscriptionMap`. Two roots must share none of the maps/presence/sockets. Keep the production factory as the composition test seam.            |
| Connection        | `src/app.ts` WS open/message/close; `src/service/socket-writer.ts` | The connection owns its `AbortController`, writer/backpressure state, subscription/presence membership, and join. Closing the app must stop admission, abort/drain connections, then stop the server once; cancellation remains controlled rather than reported as unexpected. |
| Borrowed adapters | `AppOptions.fetch`, timers, injected verifier/metrics              | Supply them to the root; the graph must not dispose values it did not acquire. Keep deadline and replay behaviour in `backend-request.ts`, `forward-client.ts`, and `resume-client.ts`.                                                                                        |

Evidence: `main.ts` calls `loadConfig()`, `buildApp(...)`, and `listen()` directly; `buildApp` constructs
the logger, verifier, clients, metrics, presence, and subscription map directly. The accepted negative
set is failed production startup, partial acquisition, rejecting cleanup, repeated stop, two independent
roots, backend cancellation/deadline, exact WS refusal/frame/reconnect/replay tests, and the FE cross-app
E2E. These are routine implementation choices already fixed by the accepted plan; no new user decision.
Do not give the graph the process-wide counters in `socket-writer.ts` unless an ownership test shows the
root actually acquires them.

### MCP (`apps/wbs/mcp-01`), after 040.8

| Owner/lifetime   | Existing production boundary                               | Required disposition                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process root     | `src/main.ts`, new `src/composition.ts`                    | Load `McpConfig`, read/derive the OpenAPI catalogue, construct OAuth/verifier/backend dependencies, start `src/http.ts:startHttpServer`, and own one idempotent server stop. Startup/cleanup failures use the 040.8 safe reporter once. |
| Application root | `src/oauth.ts:mcpOAuthFromEnv` and verifier selection      | Own OAuth's in-memory client/grant/session/reauth maps for this process. Keep local-vs-gateway verifier selection and route evidence. There is no observed OAuth disposer; do not invent one.                                           |
| Request          | `src/http.ts:mcpFetchHandler`                              | Continue to create one SDK `Server` and streamable HTTP transport per request and close the server in `finally`. Request credentials/caller token stay arguments; they must never enter a root provider/cache.                          |
| Tool call        | `src/server.ts:createServer`, `src/wbs-client.ts:callTool` | Borrow catalogue/config/fetch and the request's caller token. Preserve modeled `UpstreamRejected`/`EdgeGate`, public MCP envelopes, correlation, and concurrent callers with distinct credentials.                                      |

Evidence: `main.ts` currently constructs every root dependency directly; `startHttpServer` owns
`Bun.serve`; `mcpFetchHandler` already closes the per-request SDK server. Required negatives are real
production startup and stop failures, per-request close failure, concurrent credential isolation,
declared OAuth/auth refusals with no unexpected report, and one safe/correlated report for an unexpected
tool failure. Module labels/runtime identifiers use responsibility names until the separately pending ID
grammar preference is answered; that preference does not block graph shape or TDD.

## Slice 7: wiki, harness, and command families

### Wiki and harness

| Root                               | Exact ownership surface                                                                                                | Missing adoption and compatibility oracle                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `twilight-bureaucrat` validator    | `apps/wiki/cli/src/cli.ts:runCli`; admission store opened by `writeAdmissionSubmission`                                | Root-local reporting/typed operational failures; preserve every JSON/text stdout and exit. The store remains owned by the command and closed in `finally`.                                                                                                                                                                                  |
| Packaged dispatcher                | `apps/wiki/cli/src/bin.ts`                                                                                             | Own launcher/validator subprocess invocations and diagnostic stderr; preserve exact pass-through exit/output. This is part of the standalone runtime, not evidence that workspace dependencies are present.                                                                                                                                 |
| Policy/package commands            | `src/policy/{release-cli,prepare-activation-cli,prepare-relocation-activation-cli}.ts`, `src/packaging/release-cli.ts` | Command-local process/filesystem adapters and safe terminal reporting. Preserve trust, committed-candidate, archive, registry and refusal semantics. Rebuild and execute the standalone bundle without the workspace tree; update `src/policy/trusted-modules.ts` only for imports the bundler actually leaves. Do not release or activate. |
| `harness-example` interactive root | `tools/harness-example/src/{main,harness,acp,log}.ts`                                                                  | `main.ts` owns the `AcpAgent`; `acp.ts` owns child process/ACP connection and closes both; `buildHarness` borrows the agent. Operator diagnostics stay out of model input and cannot authorize retry/success. Preserve prompt and line formatting.                                                                                          |
| Harness packaged worker            | `tools/harness-example/src/worker.ts`                                                                                  | Own its synthetic ACP session and close it in `finally`; preserve machine-readable worker stdout. Package/bundle execution is a separate production path.                                                                                                                                                                                   |

### Tool-family ownership inventory

Each row is one independently reviewable task/commit unless the row names a shared boundary. Add a
root `composition.ts` only where it owns multiple acquired resources; pure transforms remain ordinary
functions. Shell/Python keep native contracts and are reported by their Bun caller.

| Project                    | Exact files/services to inventory                                                                                                                                                                                                       | Resource/reporting disposition and required negative                                                                                                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool-deploy`              | `src/{deploy,migrations,remote-state}.ts`; `src/k8s/{deploy-k3s,descriptor-cli,cutover-cli,cutover-rehearsal,lab,backup-lab}.ts` and their server/process adapters                                                                      | Deploy/cutover command owns SSH/git/kubectl processes and temporary fake git/registry servers. Failed health/rollback stays failed and prints the manual completion command.                                                                                                                                                |
| `tool-remote-scripts`      | `src/{swap,solver-supervisor,install,install-solver-supervisor,materialize-solver-supervisor-config}.ts`; `src/lib/solver-supervisor-{runtime,service,lifecycle,listener,peer}.ts`                                                      | Supervisor root owns listener, peer, child/container and cleanup; installers/swap own command resources. Malformed solver output, start failure, or cleanup rejection cannot report success.                                                                                                                                |
| `tool-smoke`               | `src/{main,health,ws-ping}.ts`                                                                                                                                                                                                          | Command owns HTTP/WS probes and sockets. Unreachable target names the failed probe and exits nonzero.                                                                                                                                                                                                                       |
| `tool-bootstrap`           | `src/{push,lib/secrets}.ts`; native `bootstrap.sh`/`configure.sh` via caller                                                                                                                                                            | Bun push owns process/filesystem adapters. Missing secret and rejected remote command fail without disclosing secret material.                                                                                                                                                                                              |
| `tool-secrets`             | `src/cli/{shared,decrypt,encrypt,push,updatekeys}.ts`                                                                                                                                                                                   | Each CLI is a terminal root; shared code is borrowed. Rejected subprocess output containing a secret is redacted and the exit remains nonzero.                                                                                                                                                                              |
| `tool-compose`             | `src/{index,render}.ts`                                                                                                                                                                                                                 | Rendering stays pure; `render.ts` owns command IO only. Malformed required input cannot create a usable output.                                                                                                                                                                                                             |
| `tool-dev-setup`           | `tools/dev/{setup,solver-environment,solver-setup-cli,write-*-golden-corpus*}.ts`                                                                                                                                                       | Setup/solver and corpus-writer CLIs own filesystem/process IO. Missing and unreadable required config remain distinct failures.                                                                                                                                                                                             |
| `tool-devsync`             | `src/sync.ts`, `src/solver-{preparation,binding-host,binding-runtime}.ts`, `src/k3s/*.ts`, `src/scenario-coverage-cli.ts`; `bin/dev*.sh` via caller/native contract                                                                     | Sync root owns spawned services and partial cleanup; inspectors (`service-kinds`, `test-levels`, workspace inventories) stay ordinary unless called by a terminal root. Failed preparation cannot launch dependents and acquired resources close.                                                                           |
| `tool-fleet`               | `src/{entrypoint,cli,controller,apply,production-apply,recover,health,maintenance,maintenance-workers,check-cli,check-faults,backup-sqlite,platform-alerts}.ts` plus plan/discover/replace/retire/upgrade/terraform/terragrunt adapters | **Required despite slice-table omission.** Command/controller roots own host processes/connections; DB helpers close opened SQLite; alert and production apply close spawned/remote resources. An unreachable host is failure, never skip; partial apply/cleanup and secret-bearing remote stderr need real-path negatives. |
| `tool-git-hooks`           | `src/install.ts`, `src/hooks/{ci-gate-annotations,conventional,corpus-version-base,corpus-version-lint,doc-caps,migration-lint,plaintext-secrets}.ts`                                                                                   | Terminal hook/install R/E; tiny checks remain functions and use command-local D only where IO is injected. A real violation still blocks; diagnostics do not turn the exit green.                                                                                                                                           |
| `tool-workflows`           | `src/generate.ts`, `src/cli.integration.test.ts`                                                                                                                                                                                        | Generation stays pure; CLI owns file IO/stdout. Invalid workflow/check mismatch remains nonzero and stdout stays machine-readable.                                                                                                                                                                                          |
| `tool-observability-stack` | `src/validate.ts`                                                                                                                                                                                                                       | Validator terminal boundary only; YAML/dashboard files are not graphs. Malformed config remains nonzero; update consumers of `err` without swallowing failure.                                                                                                                                                              |
| `tool-dagger`              | `src/{main,be-01,gw-01,fe-01}.ts`, `src/lib/{bundle,image,publish}.ts`                                                                                                                                                                  | Each entrypoint owns Dagger client/executor resources; shared main/lib receive dependencies. Client failure cleans up and preserves executor output/failure.                                                                                                                                                                |
| `tool-test-scratch`        | `tools/test/scratch/{index,preload}.ts`                                                                                                                                                                                                 | Fixture/preload owner propagates allocation and cleanup failures to the test; no autonomous reporter/container.                                                                                                                                                                                                             |
| `wbs-solver-py` boundary   | Python solver unchanged; Bun owner in `tool-remote-scripts`/`tool-devsync` supervisor binding                                                                                                                                           | Preserve wire schema/refusal/cancellation. Bun wraps process/parse failure, reports safely, and owns process lifecycle; run solver and supervisor suites.                                                                                                                                                                   |

After every row has code and behavioural tests, slice 8 adds the narrow import rules, warm-cache
inventory/policy proofs, exact 36-project reconciliation, and closes the three OpenSpec verification
records. That enforcement task cannot substitute for per-boundary production negatives.

## Bureaucrat prerequisites before WBS items 090 and 100

The pending WBS update names `7ad9e8a6…` “Run Twilight Bureaucrat … WBS backend” and
`02d9313b…` “… WBS frontend”; both depend on the six-prerequisite parent. The update is **UNSENT**
because its MCP token expired, so these dependencies are prepared evidence, not server state.

| #   | Current evidence                                                                                                                                                                                                                                               | Concrete owner/task                                                                                                                                                                                                                                                          | Decision status                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/wiki/cli/src/relationships/typescript.ts` resolves imports with `ts.resolveModuleName`; ambient `*.css` declarations do not resolve `fe-01/src/main.tsx -> ./styles.css`.                                                                                | Relationship extractor plus production CLI tests: recognize compiler-supported ambient non-code modules without inventing an import edge target; preserve unresolved-real-module refusal. Break the ambient path and observe F1/K2–K6/REL-EXTRACT become unevaluated.        | Accepted requirement; resolution mechanics are routine, no user choice.                                                                                 |
| 2   | `tools/tool-fleet/tsconfig.lib.json` includes `../../infra/local/vm-lab.ts` outside the project; declaration emit can fail with an empty diagnostic list.                                                                                                      | Fix the project/source ownership or config include, and make `typescript.ts` report an emit failure even when TypeScript supplies no diagnostics. Production extraction of the tools scope must evaluate all six rules.                                                      | Routine; do not weaken declaration extraction or ignore the external file.                                                                              |
| 3   | No repository **rule-policy** artifact supplies `RulePolicy.classificationPolicy` for the all-code run. `docs/wiki-policy/policy.json` has a different activation-policy schema and is not that input.                                                         | Add the reviewed repository rule policy (natural durable path: `docs/code-organization/rule-policy.json`), classify every content class/prefix, and exercise `apps/wiki/cli/src/rules/{rule-policy,check}.ts` plus CLI absence/unreadability/malformed negatives.            | Classification judgments require review, but no new product/architecture choice; author and review as data.                                             |
| 4   | `apps/wiki/cli/src/rules/kinds.ts` is suffix-only; backend files are unsuffixed. `tools/tool-devsync/src/service-kinds.ts` alone reads `docs/code-organization/kinds.json`, with backend-only `SERVICE_ROOTS`; hence Bureaucrat's backend kind graph is empty. | Make Bureaucrat resolve the accepted inventory from the selected candidate revision, reconcile suffix and policy declarations, and fail on stale/duplicate/unclassified entries. Extend roots only to the accepted scopes; test non-empty backend graph and K2–K6 mutations. | Accepted direction; candidate-revision plumbing is routine. Do not read the mutable checkout or rename services merely to satisfy suffixes.             |
| 5   | Six current FE module directories exist and all six have ordinary `README.md` files with no `module-index` declaration: `calendar-markers`, `directory-management`, `directory`, `plan-feed`, `plan-writer`, `preferences`.                                    | Add valid wiki module-index declarations for all six and make MOD-LAYOUT consume them through the real index report. Recount at packet cut; current count supersedes the old five/six note.                                                                                  | Content review is routine; no user choice. Existing README prose alone does not discharge the rule.                                                     |
| 6   | Accepted survey: F7 at 400 lines reports 107 files; current policy still has no selected ceiling/adopted set. Source may have moved, so recount after selecting the ceiling.                                                                                   | User selects the ceiling; implementation then records `sizeCeilings` and the exact pinned/adopted debt in the repository rule policy, proves growth/new-overage/removable-pin negatives, and moves the temporary devsync ratchet to Bureaucrat per rollout Task 9.           | **Only unresolved user decision:** the numeric F7 ceiling. The adopted set is mechanically generated/reviewed at that ceiling, not a second preference. |

Prerequisites 1–4 and 6 correct the existing B2 production path owned by
`openspec/changes/twilight-bureaucrat-kind-rules`: its checked tasks already implement adopted-set/F7,
kind resolution/MOD-LAYOUT, K2–K6 and F1. Before code, map each correction to that change's current
requirement and amend its ordered TDD task and `verify.md`; add a focused delta only when the measured
observable contract is not stated there. Prerequisite 5 can remain a documentation/index slice only while
it adds declarations without changing rule behavior. Every Bureaucrat B slice still owes intent, delta
specs, ordered TDD tasks and verification. This is artifact scoping, not a new architecture decision.
Prerequisite 6 waits only for the numeric ceiling. Then run the backend and frontend items separately
against immutable revisions, record all evaluated/unevaluated rules, and fix code/rule defects without
treating `observe` as success. Package publication/activation is a separate operation and is not part of
these runs.

## Executable order and actual blockers

1. Land 040.8 and 040.9 reporting. Open `adopt-di-composition` with its proposal, delta spec, design,
   ordered TDD tasks and verify record before the first remaining DI implementation, then implement MCP
   DI and gateway DI as separate slice-6 commits. Their files are disjoint; both feed that verification
   and cross-app E2E. Final labelled modules wait for the runtime-ID grammar/collision decision.
2. Open `complete-package-adoption`; implement wiki, harness, then the tool rows in small command-family
   commits under its proposal, delta spec, design, ordered TDD tasks and verify record. `tool-fleet` must
   receive an explicit inventory disposition despite the plan-table omission.
3. Complete slice 8 enforcement only after the inventory names implementation and test paths for every
   project. This is the accepted adoption gate, and it leads to the ordered newest-version migrations.
4. On the independent Bureaucrat branch, scope prerequisites 1–4 and 6 through the existing B2 artifact
   as above; prerequisite 5 is the declaration-only slice. Ask once for the F7 numeric ceiling,
   generate/review the corresponding adopted set, then implement prerequisite 6.
5. Send the prepared WBS update after fresh MCP authentication. Items 090/100 depend on the six
   prerequisites, not on package adoption; they may run once those prerequisites land. Avoid parallel
   edits to the wiki CLI/policy files and rerun affected rules after slice 7.
6. Preserve the actual convergence: adoption slice 8 leads to the ordered migrations; the six
   prerequisites lead to WBS 090 and 100. The ordered migrations plus WBS 090 lead to the final Swift
   naming sweep. No accepted edge makes 090 a migration prerequisite or WBS 100 a Swift prerequisite;
   the two branches can proceed independently subject to file ownership.

The accepted architecture and ownership do not need another design interview. R4/OpenSpec artifacts and
TDD packets remain mandatory before implementation: newly discovered observable behavior outside the
accepted deltas stops for its own change; mechanical extraction or a fix restoring a precise existing
requirement uses the existing exemption. Branch-specific blockers are: the F7 ceiling and fresh MCP
authentication for the Bureaucrat/WBS branch, and the runtime segment grammar plus later-collision rule
for final DI labels. The ID choice does not block settled graph shape or prerequisite extraction. Heavy
verification and all R5 mutation observations remain unperformed in this read-only inventory.
