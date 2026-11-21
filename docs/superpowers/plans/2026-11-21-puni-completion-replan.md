# PUNI completion implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to execute the existing OpenSpec slices in the order below after the user resumes implementation. Steps use checkboxes for tracking. This plan does not resume the paused goal.

**Goal:** Finish the original WBS entity scope, unified PUNI CLI and Bun script migration, with demonstrated product behavior and reviewed delivery.

**Architecture:** Preserve the existing WBS domain, storage, API and UI boundaries and the Navigator/Burokrat/Dash provider facades. Use the four existing OpenSpec changes as subsystem plans; this document sets their completion order and acceptance gates rather than adding another implementation layer.

**Tech Stack:** Bun, Nx, TypeScript, SQLite/Drizzle, Elysia, React, Playwright and the agreed Optique 1.3.6 CLI parser.

**Spec:** `openspec/changes/wbs-work-packages/`, `openspec/changes/wbs-step-catalogue/`, `openspec/changes/puni-cli/`, `openspec/changes/bun-scripts/`.

## Global constraints

- Implementation is paused after the bounded Nx repair. Nothing below has started by writing this plan.
- Preserve all original requirements, unrelated changes, canonical checkout and historical signed/digested artifacts. Do not reset or clean input worktrees.
- Use Bun and Nx. Current first-party executable script logic must migrate to Bun; client operations belong under PUNI.
- Public spellings: `puni navigator`, `puni nav`, `puni n`, `puni burokrat`, `puni bur`, `puni b`, `puni dash`, `puni d`.
- Preserve authority, cancellation, typed failure, migration rollback, historical integrity and manual-runtime boundaries. Each changed safety check needs its own observed production-path negative under R5.
- Astra must review tricky areas. Its recorded availability is 2026-11-22 10:09 AM, timezone unspecified; availability must be established before scheduling that review.
- Local controlled fixtures, an installed alias test and a successful build do not establish real product, host or deployment acceptance.
- Full h2 checks run through `bin/h2puni-gate.sh <sha>` from a clean isolated gate tree under its canonical lock. Never use the live poller tree or raw full Nx checks on h2.

## Current stopping point

The private integration tree is `/tmp/puni-combined-proposal-v1/tree`, branch `proposal/puni-entities-integrated-v1`. The bounded seven-file repair adds missing Nx test inputs, local E2E agent-output settings and an equivalent representation of two frontend-relative paths in a test. Its combined regression is **79 pass, 0 fail, 331 assertions**; changed-test lint and scoped TypeScript checks exit 0.

The frozen frontend configuration selection separately reports **22 failures during setup**. An isolated baseline with all seven edits absent reproduces `frontend fixture inputs unsupported`. The fixture has two frontend configuration tuples crossed with five package/lock epochs; its preparation also reads the current repository inputs before admitting a tuple. No frozen profile, capture, pin or assertion was widened. Repairing that coupling is a separate task below.

The last execution-site discovery has **803 sites, 583 unresolved**. It is not an accepted exhaustive inventory. The protected `env -S` Bun helper still needs static runtime classification. Formal Astra review, actual four-Nx/product acceptance, full host gates and delivery remain open. No percentage or ETA is justified by these counts.

## 1. Reconcile requirements and evidence before coding

**Files:** Read the four changes' `proposal.md`, `design.md`, `tasks.md`, `specs/` and `verify.md`; update their existing tasks and verification records. Read `docs/platform-map.md` as an orientation snapshot, not current acceptance evidence.

**Produces:** One requirement-to-task/evidence matrix identifying complete, failing, unverified and deferred work without counting the same evidence twice.

- [ ] Audit all original requirements: entity names/projects/settings/spaces; full catalogue SC1–SC25; all 13 current fact families and 15 historical columns; storage writer/read closure; API/OpenAPI/MCP/UI authority; ownership/history/manual-runtime safety; all eight CLI spellings; complete Bun/client inventory; full checks and authorized delivery.
- [ ] For each unchecked slice, distinguish missing implementation from missing acceptance. Preserve V120's successful Memory/SQLite/core runs and V122's import-lifetime repair as scoped evidence; do not reintroduce superseded failures or rerun unaffected suites without a reason.
- [ ] Select the smallest remaining product slice with a concrete failing acceptance case. Use its existing OpenSpec TDD steps; record the exact command and intended behavior before edits. Do not create another broad infrastructure subsystem to avoid an unresolved product case.

**Acceptance:** Every original requirement maps to an existing slice and explicit acceptance evidence or a named gap. A green subset must never close its parent scope.

## 2. Finish WBS entities and catalogue as product behavior

**Files:** `openspec/changes/wbs-work-packages/tasks.md`, `openspec/changes/wbs-step-catalogue/tasks.md`; their named production/tests under `libs/wbs/`, `apps/wbs/be-01/`, `apps/wbs/mcp-01/` and `apps/wbs/fe-01/`.

**Consumes:** The requirement matrix and the existing migration/history fixtures. **Produces:** Verified current domain behavior and actual API/UI authority, with historical reads still intact.

- [ ] Execute the remaining work-package/project/settings/space slices in their dependency order. Verify required project selection for create/import, moves, settings provenance, project budgets and directory behavior through their real callers.
- [ ] Execute the remaining catalogue slices: definitions and scoped bindings, current package values and every fact family, preview/refusal and leaf ordering, missing-state behavior and history/save/import/export. Preserve migration-window admission and complete ledger rollback.
- [ ] Close actual writer/read paths in both Memory and SQLite, including reconciliation, package birth, measures, assignments, claims, search and optimization. Use the production conformance owners named by each slice.
- [ ] Verify mounted routes, generated contracts/OpenAPI/MCP tools and settings/leaf UI together. Remove obsolete live mutation paths only when the replacement authority is demonstrated.
- [ ] Run the affected Nx targets after each behavior change, then the actual entity/catalogue application acceptance. Record R5 negatives adjacent to changed checks; do not infer all 13 fact proofs from one omnibus refusal.

**Acceptance:** Every entity/catalogue requirement has current behavior evidence. Historical bytes and identities remain unchanged, and real API/UI requests exercise the intended authority.

## 3. Finish PUNI and Bun conversion by coherent client families

**Files:** `openspec/changes/puni-cli/tasks.md`, `openspec/changes/bun-scripts/tasks.md`, `openspec/changes/bun-scripts/script-inventory.md`; the existing `apps/puni/cli/`, three provider CLIs, `tools/tool-devsync/src/scripts/` and the callers identified by the inventory.

**Consumes:** Existing typed grammars, protected startup, package producer and retained installation evidence. **Produces:** A complete owned inventory and working installed clients with Bun execution.

- [ ] Finish inventory discovery/classification, including protected `env -S`, generated/inline, CI, container, Kubernetes/Ansible, remote and runbook execution. Each entry needs an owner, callers, runtime, replacement and verification. Resolve unknowns explicitly rather than exempting them.
- [ ] Finish one family at a time with its callers: development and deployment/probes; installed browser/performance/Forge; gates/locks/refresh/queues; release/bootstrap/remote operations. Use the current OpenSpec ordering and keep historical decoders separate from new producer identities.
- [ ] Run the real packaged installation outside removed producer checkout/output roots using `bun test --preload ./tools/test/scratch/preload.ts ./apps/puni/cli/src/packaging/build.test.ts --timeout 600000`. Use sufficient owned temporary storage; preserve frozen physical dependencies and distinguish controlled fixtures from real service acceptance.
- [ ] Exercise all eight public spellings through actual installed provider operations. Finish delegated Burokrat requests, helper generation and current public naming/default cutover before marking installation or client-surface parents complete.
- [ ] With an explicitly admitted source-toolkit environment, run these actual clients uncached: `bunx nx run wbs-fe-01:test:performance:level --skip-nx-cache`, `bunx nx run wbs-fe-01:test:browser:ordinary:level --skip-nx-cache`, `bunx nx run wbs-fe-01:test:browser:packaged:level --skip-nx-cache`, `bunx nx run wbs-core:test:browser:portable:level --skip-nx-cache`. These depend on the real WBS services, native ownership and independent judging required by their specs.

**Acceptance:** No unclassified owned execution surface remains, current first-party scripts execute with Bun, client operations are embedded in PUNI, and installed/default/real application callers pass their specified acceptance.

## 4. Resolve remaining integration failures and obtain Astra review

**Files:** `tools/tool-remote-scripts/src/lib/source-frontend-http.test.ts`, `tools/tool-remote-scripts/src/fixtures/source-frontend-profile.ts`, `tools/tool-remote-scripts/src/lib/source-frontend-profile.ts`; frontend error-reporting tests and their production callers identified in the retained V124 evidence.

**Consumes:** The baseline fixture refusal and retained hostile-error-accessor failure. **Produces:** Understood, corrected integration behavior and independently reviewed tricky changes.

- [ ] Reproduce the frozen-frontend refusal with `bun test --preload ./tools/test/scratch/preload.ts tools/tool-remote-scripts/src/lib/source-frontend-http.test.ts --test-name-pattern 'modeled frontend configuration|frontend (materializer|producer) configuration boundary' --timeout=60000`. Separate current-root admission from historical fixture materialization in the design before changing either contract. Preserve old captures and require the existing historical assertions to reach their intended checks.
- [ ] Establish the exact Bun/Vitest interaction behind the hostile `message` getter assertion. Preserve the zero-getter assertion and production reporter until the cause is understood; any fixture repair must still fail if the actual Gantt selector reads `thrown.message`.
- [ ] Request Astra review when available for history/authority and migration safety, import/cancellation lifetimes, startup/install/delegation, gate composition and the accessor repair. Address concrete findings with their affected regression and negative controls.
- [ ] Run `bun test tools/tool-devsync/src/workspace-targets.test.ts tools/tool-devsync/src/be-probe.test.ts tools/tool-devsync/src/be-probe-adapter.test.ts tools/tool-devsync/src/be-probe-caller.test.ts --timeout=30000` after relevant caller/config changes. Do not replace real acceptance with this 79-test subset.

**Acceptance:** Integration failures are repaired with reached assertions, Astra findings are resolved, and remaining verification limits are explicit.

## 5. Gate and deliver the reviewed result

**Files:** The four changes' `verify.md`; `docs/runbook-dev-deploy.md`, `docs/runbook-prod-deploy.md`, `docs/infra/gate-hosts.md` and existing PR #917.

**Consumes:** Complete requirement evidence and reviewed integrated source. **Produces:** A gated immutable revision and observed delivery under the user's standing authorization.

- [ ] Run required format, lint, typecheck, tests, build, OpenSpec, secrets and migration checks. Record exact commands and failures; format the full intended scope with `--all` where required.
- [ ] Prepare a clean isolated h2 or enrolled h4 gate tree and run `bin/h2puni-gate.sh <reviewed-sha>`. Confirm its printed running SHA, full terminal result and checkout-under-lock behavior. Preserve dirty/unreadable refusals and never bypass hooks or safety gates.
- [ ] Update the PR title and description around the final scope and actual verification; push, merge and deploy only the concrete reviewed/gated revision under the existing authorization. Preserve separately required operator inputs for irreversible migrations or activation.
- [ ] Observe the running revision and complete required product smoke checks. Close each original requirement with evidence before marking the goal complete.

**Acceptance:** Full gates pass for the delivered SHA, the running revision is observed, and no original requirement remains open. Until then, report the specific remaining scope rather than a completion percentage.
