# Twilight control-plane verification

Scope: current proposed requirements, design, execution profile and delivery plan,
through 2026-09-08. This is a planning revision, not a factory implementation. Canonical
files describe the current contract; historical review receipts are not instructions.
Product tasks remain unchecked. Specifications are not synchronized or archived.

## Wayfinding reconciliation checks (2026-09-08)

The personal/customer phase reconciliation added assistant interaction and delivery
environment specs, made staging and publication separate ordered stages, expanded
Tasks 13, 15 and 16, and resolved the Wayfinder map through documented assumptions.

| Command / inspection                                                                                                             | Observed result                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                                                                                     | Passed with no formatting differences.                                                                                                                                                              |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                         | All 40 changes valid; existing informational archive notices remained non-failing.                                                                                                                  |
| `bunx @fission-ai/openspec@1.12.0 schema validate twilight-v1 --json`                                                            | Experimental command reported the artifact schema valid with no issues.                                                                                                                             |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t test check --projects=tool-workflows --parallel=2 --skip-nx-cache` | 25 tests passed; 40 generated workflow variants checked. The first invocation without the documented in-process settings failed while Nx plugin workers initialized and established no test result. |
| Temporary Bun structural inspection of `execution.yaml`                                                                          | Revision 4: 13 unique acyclic stages, 16 unique activities, complete maps for all three profiles, all eight activity floors enabled, and every quality observer declared.                           |
| Temporary changed-document inspection                                                                                            | 145 local links resolved; all 44 task IDs were unique and unchecked; proposal 398 words; `LLM_README.md` 150 lines.                                                                                 |

The new assistant and environment files contain explicit Given, When and Then in
every new scenario. The 80 inherited control-plane/repository-planning scenarios
predate TS-32 and currently use When/Then form. Task 1.0 is therefore the first
implementation prerequisite: it must add non-vacuous Given context and complete the
normal/failure/boundary/recovery coverage ledger. Current OpenSpec CLI validation
does not establish that semantic exhaustiveness.

An exact Claude Fable 5.1 review of the current diff was attempted with read-only
tools. The sandboxed call ended with `ENOTFOUND`; escalation was automatically
rejected because it would send uncommitted internal planning documents to Anthropic
without explicit approval for that payload. No current external-review verdict is
claimed. The 2026-09-06 review below applies only to its named earlier revision.

## Earlier observed checks (2026-09-06)

Environment: `pop-os`, Bun 1.4.0, OpenSpec 1.12.0. Nx commands use
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false`: isolated plugin startup failed before
checks, while the repository-documented in-process setting succeeded. The raw Bun
package-cache CLI could not resolve its installation without a temporary write;
the complete existing installation below reported 1.12.0 and ran the CLI checks.

`OPENSPEC_CLI` names
`/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js`.
This is the observed local installation, not a portable path to copy into clients.

| Command / inspection                                                         | Observed result                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t test check --projects=tool-workflows --parallel=2`      | 25 tests passed, zero failed; 40 generated workflow variants checked                                                                                                                          |
| `bunx nx run tool-workflows:integration` with the pinned `OPENSPEC_CLI`      | 3 tests passed, zero failed; the real CLI preserves artifact readiness                                                                                                                        |
| `bun "$OPENSPEC_CLI" validate --all --json` with telemetry disabled          | 40 changes passed, zero failed                                                                                                                                                                |
| `bun "$OPENSPEC_CLI" schema validate twilight-v1 --json`                     | Valid artifact schema, no issues                                                                                                                                                              |
| `bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache` | All targets passed for 23 projects and one dependency; Nx reported five suites as flaky because an earlier sandboxed invocation could not bind loopback ports                                 |
| Temporary structural inspection of `execution.yaml`                          | Revision 3: 11 acyclic stages, 13 unique activities, complete thorough/balanced/economy maps, enabled floors, candidate-scoped acceptance oracle, benchmark ceilings supporting eight workers |

Structural inspection establishes document consistency only. It does not execute
scoped stages, enforce an envelope, allocate workers or demonstrate speedup.

Additional observed checks: repository-wide `bunx nx format:check --all` and
`git diff --check` passed. Local navigation inspection across the Twilight docs,
change artifacts and ADR 0016 resolved 186 relative links with none missing; the
proposal contains 393 words, `LLM_README.md` remains at 150 lines, and all 36
product task IDs are unique and unchecked. The worker-pool research records only
source-backed capabilities and explicitly leaves runtime, isolation and throughput
claims unverified.

`bin/h2puni-gate.sh` exited 70 before running checks because this machine is
`pop-os` and the wrapper's `/home/puni1/.cache` host-lock directory is absent.
The wrapper's exact Nx command was run directly. Its first sandboxed invocation
failed only suites that bind loopback servers with `EPERM`; the rerun with loopback
binding permitted passed, as recorded above.

## Review disposition

An independent reviewer inspected the working diff for consistency and task coverage.
The reviewed contracts now place evaluation before acceptance/publication, order
speculation after its evaluator, prioritize aged work before new critical chains,
authorize the benchmark's actual concurrency, and distinguish exact planning
conflicts from authorized disjoint reconciliation. The follow-up review found one
remaining aging-scenario ambiguity; the scenario and task fixture now explicitly
stay below the aging window when asserting critical-path ordering.

## Failure-proof status

No runtime safety check was implemented in this revision, and no new runtime
`Proof:` claim was written. The production-path negatives belong to these slices;
all remain **unrun**, including their positive controls and injected faults.

| Contract                         | Planned fault and observation                                                                                | Owner         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------- |
| Execution envelope               | Unconditional reapproval prevents an authorized launch; removed range guard permits an unauthorized launch   | Task 3        |
| Feasible scheduling and fairness | Head-only selection blocks backend work behind a browser; chain-first ordering starves an aged task          | Task 4.4      |
| Coordinator capacity             | Await remote response inside serialized dispatch; unrelated dispatch misses its budget                       | Task 4.5      |
| Deliverable pipeline             | Restore run-wide stage join; finished sibling cannot complete review while another is held                   | Task 7.3      |
| Integration acceptance           | Publish before held oracle completes or reuse branch greens; source ref/combined assertion exposes the error | Task 7.3      |
| Speculation                      | Select first failing answer or let a losing worker publish; wrong candidate/forbidden effect is observed     | Task 7.4      |
| Fixed-quality scaling            | Advertise eight workers but execute one; speedup budget fails without changing task denominator or quality   | Task 8.4      |
| Planning concurrency             | Remove broker-derived cross-plan predicate; a forbidden reconciled command is accepted                       | Task 9        |
| K3s duplicate start              | Start two programs for one attempt; independent effect receiver and workspace counters observe duplication   | Tasks 6, 8    |
| K3s worker loss and drain        | Drain or abruptly lose an agent; capacity and scheduling observations retain holds and stop new placement    | Tasks 5, 6, 8 |
| Worker privilege boundary        | Request cluster, host, engine and deployment authority; live canaries and host inspection observe denial     | Task 6        |
| K3s observation loss             | Stop API or telemetry access; FE, MCP and `h3mon` show unknown/unavailable rather than empty or zero         | Tasks 5, 6    |
| K3s server reconstruction        | Rebuild from pinned inputs; recorded attempts reconcile before any replacement and durable records remain    | Tasks 6, 8    |

Browser/deployment checks, live ACP calls, coordinator load, scaling benchmarks and
all runtime fault injections, including K3s installation and multi-host execution,
were not run: this revision changes documents and proposed workflow configuration
only. Speedup thresholds are proposed acceptance budgets, not measured capability.
M1 cannot be declared complete from these document checks and the application gate.
