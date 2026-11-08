# Task 4.3 foundation review

Verdict: **APPROVE the foundation slice**. No actionable correctness or spec-compliance findings in the reviewed delta. This does not complete task 4.3, authorize external authoring, or establish a full feature/gate result.

Reviewed `/tmp/puni-cross-graph` at `cb6f4c45acf7ab0ca933caa59453ffb32994b1db`, range `6463cff37..cb6f4c45a` (commits `3eb04c86c` and `cb6f4c45a`, nine changed files). Fresh read-only checks found a clean worktree, matching hashes for all nine frozen manifest paths, and no whitespace errors in the commit range. No code, index, HEAD, or repository documentation was changed. This review file is the only written artifact.

The review used AGENTS.md, LLM_README.md, the assigned foundation brief, the binding capture/graph architecture ruling, the latest integration design D4 and task 4.3, relevant delta scenarios, actual implementation/tests, and the implementation report and proof logs. The requested foundation boundary is appropriate: concrete source bindings, existing facade replacement, structural callers and transaction rollback tests belong to the subsequent integration lane.

## Findings

None requiring a fix in this slice. No severity-rated issue is being deferred under the approval.

## Foundation compliance

- `libs/wbs/domain/domain/src/connected-step-node.ts:49` combines the already prepared local nodes and edges without changing node identity. Ownership maps include parent and leaf work items; duplicate project/work-item ownership and conflicting relationship meanings refuse. Local and external classifications are checked separately, and local supplied contexts still validate endpoint evidence.
- `libs/wbs/domain/domain/src/connected-step-node.ts:119` supplies each external endpoint's own project context to the shared expansion helper. `libs/wbs/domain/domain/src/slice-edges.ts:297` is the extracted common authored loop; the original endpoint resolver continues to define whole/node/descendant-step selection and FS/SS/FF boundaries. All expanded pairs retain authored provenance and relationship IDs. Existing local graph behavior remains on that same helper.
- `libs/wbs/application/core/src/service/dependency-graph.ts:81` exposes the local preparation while retaining the original graph-returning wrapper. Each project keeps its own tree, ordered steps, estimate-presence anchors and reach. Preparation remains unreduced and does not invoke scheduling, calendars, cache, solver admission or hold reduction.
- `libs/wbs/application/core/src/service/connected-dependency-graph.ts:259` delegates cycle decisions to the existing node-cycle algorithm. The tests distinguish valid A.design → B.build → A.test from reverse cycles, self-node pairs, cycles through different tasks, stepless cycles and held authored cycles.
- `libs/wbs/application/core/src/service/connected-dependency-graph.ts:163` retains old and proposed endpoint seeds, replaces the changed owner's complete typed set, and traverses effective incident edges in both directions. This includes newly joined components and disconnected old components without treating an owned-empty set as proof of isolation. Per-evaluation incident and project fact reads are bounded to one per reached project; there is no reader-wide graph cache.
- Stored identity consistency is checked before overlay removal, independently of effective proposed/retained consistency. Explicit empty overrides clear facts, while absent overrides preserve them. Missing/mismatched projects, foreign work-item rows, malformed owners and unrelated incident rows refuse. `findStepReferences` matches both project and step identity over incident closure.

## Integration interface assessment

The exported value and reader interfaces are sufficient for the planned integration. Complete project overrides can represent tree, steps/removal, estimates, legacy links, reach and successor-owned typed changes. After-write checks can consume the staged transaction directly. Full plan capture can adapt its local graph facts to the same resolver without depending on the graph reader's observation owner.

`ConnectedGraphReadAuthority` and `ConnectedDependencyGraphReads` deliberately require admitted ownership/read permission and a shared observation lifetime. These are contracts to be implemented by the concrete source; the unit fixture is not evidence that SQLite, organization authorization, or irreversible transaction expiry already satisfies them. In particular, read implementations must themselves reject expired use as documented at `connected-dependency-graph.ts:35`, and the production authority must check current same-organization/read access rather than mere existence. The latest D4 requirement for fresh adapter-owned scope per unit of work and non-revivable retained callbacks remains applicable to that integration.

The current `DependencyGraphGuard` facade, including its owned-empty local shortcut, is intentionally unchanged. It must be bound/replaced before external authoring is activated. Its unchanged behavior is not presented here as connected support. Direct/batch/replay/structural callers, per-command atomic rollback, admission, other-project write isolation and real SQLite lifetime/concurrency proofs remain required integration work, not omissions in this foundation verdict.

## R5 evidence assessment

I inspected the named failure output across all 40 fault logs, the targeted test assertions, mutation descriptions/runners, and selected restored logs. The failure assessment is based on received values/read traces and graph differences, not exit status alone.

- The isolated duplicate-empty-project proof really accepts duplicate contexts when its check is removed. The earlier duplicate-project attempt still failed downstream on duplicate work-item ownership and is correctly superseded.
- The isolated local predecessor/successor checks really accept foreign-scoped local relationships when each corresponding equality is removed. Their earlier non-isolated attempts only changed the downstream diagnostic and are correctly identified as weaker evidence.
- Missing project/work-item/slice diagnostics, including the core missing-project case, still throw downstream with the check removed. They prove diagnostic specificity, not unsafe acceptance, as the report states.
- Empty-slice, identity-conflict, classification, ownership, unrelated-incident, foreign-row and effective/stored-conflict faults produce actual accepted graphs or resolved reads. Separate stored-conflict coverage with an owner-removal override prevents the effective-state check from masking it.
- The expanded-pair fault omits A2→B1 and A2→B2 from the literal four-pair assertion. Wrong-context injection throws for BP in project a; it proves a valid remote expansion is broken, not an unconstrained successful graph. Project-level cycle injection wrongly rejects the valid interleaving fixture.
- Incoming and outgoing traversal faults lose different required project sets. Removing old seeds loses b while retaining the proposed c/d component. Stale incidents and stale captures return no cycle where the staged-link/estimate-anchor fixtures require one. Wrong-project reach changes B's legacy predecessor position from 1 to 0.
- Lifetime faults 1 and 5 return successfully when rejection is required. Faults 2–4 still encounter later expiry checks, but their assertions expose the intervening forbidden incident/project/row reads. These are meaningful continuation-boundary tests rather than a later refusal masking the removed check. Concrete adapter non-revival remains unproved in this lane.

## Verification scope

Existing evidence inspected: `/tmp/puni-graph-final-tests.log` records 146 passing tests, zero failures and 346 assertions across nine suites. The subsequent test/comment-only correction has `/tmp/puni-graph-final-domain-followup.log`, recording 14 passing domain tests and zero failures. The report records successful domain/core typechecks and changed-path ESLint; their final logs are empty of diagnostics. The final formatting log reports all checked paths formatted. Empty logs alone are not treated as independently recorded exit-code proof.

Reviewer-run checks were read-only: current SHA/status, frozen SHA-256 manifest comparison, commit-range diff/whitespace inspection, source/test/design inspection and fault-log inspection. A search for nested AGENTS.md files under the reviewed library paths returned no matches (rg exit 1); the subsequently skipped chained diff was run separately. No behavioral probe was necessary because no concrete unresolved correctness doubt emerged.

I did not rerun the implementation test/type/lint/format suites or mutate production checks during review, per the assigned read-only/no-broad-rerun scope. I did not run full Nx gates, h2/h4 gates, mounted backend/source tests, browser tests, module-specific checker, secrets/migration checks or OpenSpec validation. This review claims neither final command integration, release readiness nor feature completion.
