# Twilight Structure — review

Reviewer identity for A28: this session runs as `claude-fable-5-1`. The review was performed locally on the working tree (base `1e87500c` plus uncommitted/untracked files); no export, no network, no commands, no edits.

## 1. Verdict

**Actionable with corrections.** No P0. The plan is internally consistent enough to start Task 1 today. Three P1 corrections gate later slices (Task 3's identity mechanism, one spec scenario that overpromises multi-coordinator behavior, and an M2 entry criterion that points at an event the repo's own records say has largely already happened). Nothing found blocks Task 1–2. **No blocking findings remain for the first slice.**

## 2. Findings (severity order)

### P1-1 — Task 3 needs a caller-identity decision that no task owns · **blocks Task 3 (not Task 1–2)**

- `openspec/changes/twilight-control-plane/tasks.md:134` ("Derive actor from verified auth"), `:224-226` (human decision token vs agent MCP token), `design.md:78`, `design.md:160-163`, `design.md:48-52` ("Reuse existing shared auth … only after reading its callers/tests"); `docs/twilight-structure/spec.md` says reuse of existing authentication is "still to be evaluated".
- Failure: an implementer reaches Task 3, must distinguish interactive human provenance from a service token, and there is no chosen identity provider, no decision on reusing `libs/auth` JWT/OIDC, and no assumption row. Either they invent a local stub (which Task 5's "agent MCP token cannot approve" then tests against a fake) or they stall.
- Smallest fix: add an assumption (A30) choosing one of: reuse `libs/auth` after reading callers (name the file), or M1 dev-only local identity with cloud OIDC moved to Task 13. Add a one-line sub-item under Task 3 that records the choice and its negative test (a bare service token calling `decide_approval` → 403).

### P1-2 — Spec scenario promises two coordinators; design promises one · **blocks spec sync, not implementation**

- `specs/twilight/control-plane/spec.md:117-120` "WHEN two coordinators request the same final provider/workspace slot" vs `design.md:186-190` "one active coordinator … No promise of active horizontal coordinators until leases and transactional admission pass races." Task 4 tests "barrier-synchronized concurrent requests" (`tasks.md:185`), i.e. concurrent requests inside one process.
- Failure: Task 4 passes its in-process race test, the scenario is marked satisfied, and the archived main spec asserts a multi-coordinator guarantee nobody tested. That is exactly the "check that could pass without proving promised behavior" class.
- Smallest fix: reword the scenario to "two concurrent admission requests within one coordinator"; add a second scenario, marked deferred to Task 11/13, for multi-coordinator leases.

### P1-3 — M2 entry gate refers to an undefined event · **blocks M2 start, not M1**

- `tasks.md:345-347` "Entry: named `wbs-tool-v1` refactor commit … This fact is not yet available and is not guessed"; `client-repositories.md:126`; `docs/twilight-structure/spec.md:52` (TS-24). But `README.md:1` shows `wbs-tool-v1` is this repository, and `docs/2026-09-02-refactoring-handoff.md:11-44` says every wave row is Done/Refused/Deferred except W4-4 (FE `WbsTable` split), W4-3's command registry (moves command vocabulary into `libs/contracts`, changes mcp-01's surface), W2-1's write half, and the spec-project typecheck (218 errors outside every gate).
- Failure: Task 9 waits indefinitely for a "landing" nobody has defined, while the only open items that actually affect a planning adapter are W4-3 (vocabulary a codec must consume) and the be-01 spec typecheck (Task 9's "full WBS gate" entry is not honest until test files compile). Cron/TS-04 and Task 11's WBS-origin scheduling inherit the same undated wait (`tasks.md:405`).
- Smallest fix: replace "named refactor commit" with the concrete gate: W4-3 registry landed (or explicitly refused for M2) and be-01 spec-project typecheck in CI; state that the repository layer (`apps/be-01/src/repository/*`) is already the interface and Task 9's spike may start against it now.

### P2-1 — Trial evidence record for the doc cap cannot show its own check · nonblocking

- `openspec/changes/twilight-sdlc-pilot/verify.md:41` "Initially failed on 152 lines; after repair passed at 150", but the `docCap` entry in `evidence/scoped-checks.json` has `exit_code 0`, empty output; `verify.md:110` says Nx is unavailable (EROFS), so "existing doc-cap command" is unidentified. All `wall_time_seconds` values in `final-checks.json:13,22,30` are microseconds — they measure a cached chunk read, not the command.
- Fix: name the command and paste its output, or downgrade the row to "not run; manual line count". Note the wall-time field's meaning in the receipt schema.

### P2-2 — Self-growth parity on the schema default is unstated · nonblocking

- `openspec/config.yaml:1` `schema: sdd-lean`; 39 existing changes use it; clients receive `twilight-v1` (A24, `sdlc-stages.md`). The user requirement "identical puni self-growth" (`pilot/verify.md:16-17`) has no task that switches puni-00's default or states that parity means template version, not default.
- Fix: one line in Task 8 or 10: "puni-00 sets `schema: twilight-v1` at M1 acceptance; existing changes keep per-change `.openspec.yaml`." Or record the opposite as an assumption.

### P2-3 — Task 1 and Task 5 are single checkboxes over several independent oracles · nonblocking

- `tasks.md:45-81` (Nx/tsconfig setup + compiler + contracts + Bun/LangGraph durability experiment with its own stop condition, 4–8h) and `:209-244` (four FE routes, MCP server, config publish/CAS race, focus view, a11y, e2e, 12–24h). `templates/tasks.md:5` asks one checkbox per deliverable.
- Failure: the durability go/no-go (the one experiment that could change runtime language) is invisible in progress until the compiler is also done; the 4–8h estimate is not credible for that bundle.
- Fix: split 1.1 checkpointer spike (go/no-go, record decision) / 1.2 compiler; split 5 into MCP+contracts, runs/approval UI, publish/CAS, focus view.

### P2-4 — Acceptance checks that could pass vacuously · nonblocking

- `tasks.md:106` "fresh fixture needs no home skills": passes trivially if `HOME` is the developer's machine with skills installed. Require an empty `HOME`/`XDG` and a positive control (fixture referencing `~/.claude/skills/x` must fail).
- `tasks.md:327-328` "no puni-specific content, personal paths": needs a canary list (`/Users/danylofedorov`, `h2puni`, `wbs-tool-v1`) and a run where an injected canary is observed failing.
- `tasks.md:153-157`: `startedActivityCount === 0` is also 0 when nothing can start anything (no worker exists until Task 6). Add the positive control: approving `revision-b` produces one admitted activity record.

### P2-5 — Backlog native tools vs broker authority left implicit · nonblocking (M2)

- `research/backlog-patterns.md:192-195` requires bidirectional visibility; `client-repositories.md:82-91` makes outside edits "input, not accepted mutation"; authority is `refs/heads/twilight-planning` (`:64-91`) while Backlog CLI/MCP write the working checkout. TS-24 "Backlog.md hosted per client repository" (`spec.md:52`) is ambiguous given the researched 127.0.0.1 unauthenticated browser server.
- Fix: state explicitly that native Backlog tools operate on a materialized view, import is mandatory, and the Backlog web UI is not hosted (WBS is the UI). ID reuse + dropped unknown frontmatter already push extension data to `backlog/wbs/` — say the UUID map is authoritative.

### P2-6 — Task 11 couples role/hook/cron expansion to the Backlog cutover · nonblocking

- `tasks.md:405` "Depends on: M1; Task 10 for WBS-origin scheduling"; cron (TS-04) first appears in Task 11. Combined with P1-3, TS-04 has no reachable date.
- Fix: split Task 11 so roles/hooks/cron on OpenSpec-origin plans depend on M1 only.

### P3-1 — Parity rule is asymmetric by design but not stated as a rule

- `design.md:160-163`, `:226-227`: `decide_approval` via MCP needs a UI-issued decision token; `resolve_effect` is exposed on both. Write the parity rule once in the spec: "every operation is available on FE and MCP; human-provenance operations require a token only the interactive flow issues." Also note twilight-mcp is Streamable HTTP while mcp-01 is stdio; say this is intentional.

### P3-2 — Focus profile untested by the trial

- Pilot spec scenario "Focus view keeps obligations" has no row in `pilot/verify.md`; the trial produced no focus brief; TS-18/22 are prose only (`product-experience.md:73-78`). Fix: mark the scenario unrun in verify.md; optionally produce one focus brief for this handoff as the sample.

### P3-3 — Pilot status rows are now stale

- `pilot/tasks.md:60-67`, `pilot/verify.md:4,117`, `evidence/plan-review.md:33-49` describe the DNS-failed attempt. Update per A28 with this review's date and model identity; Task 7 remains open until the P1 dispositions are recorded.

Non-findings worth stating: the two-store non-atomicity (Twilight SQLite + LangGraph checkpointer) is acknowledged and has a scheduled kill-between-writes test (`tasks.md:164-165`, `design.md:192-198`); interrupt-replay dedup is handled (`design.md:200-204`); unknown-usage-not-zero and fencing have named tests (`tasks.md:185-197`). These are prerequisites already scheduled as experiments, not design blockers.

## 3. Missing requirements / assumptions to make explicit

1. Caller identity provider for twilight-be (P1-1).
2. Who hosts client Git remotes and how "unauthorized direct accepted-ref push refused" (`tasks.md:361-362`) is enforced — server-side hook on a self-hosted remote, GitHub branch protection, or broker-only credentials. It is not implementable without naming one.
3. Cloud-browser provider for TS-11/Task 13 is unnamed.
4. `agy` identity and ACP protocol version remain unpinned (A09 says unverified; fine, but Task 6 should say "second provider = Codex or Claude, whichever fails first pin" rather than leaving it open).
5. Where worker-side provider credentials live (Claude CLI auth, Codex keys) and their retention relationship to A17.
6. Multi-tenant is deferred (A02) — say whether "organization" in policy precedence is a single hard-coded org in M1.
7. Parity meaning for the schema default (P2-2).

## 4. First slice and route to end state

Task 1 is the right first slice: it front-loads the only experiment that could change the runtime language (LangGraph JS + checkpointer under Bun with a SIGKILL resume test), forbids the in-memory saver in acceptance, and produces the compiler that later tasks consume. Its negative (swap durable saver for memory, watch restart test fail) is a genuine failure proof. Split it (P2-3) so the go/no-go is visible on its own.

M1 (Tasks 1–8) is an executable route: dependencies are acyclic, each task names owned files, produced interfaces and injected faults, and Task 8 closes the loop on a clean client fixture. The 60–124h / 1–3M token aggregate is plausible only after the splits; Tasks 1 and 5 are under-estimated as bundled.

M2 (Tasks 9–10) is well-designed (CAS, no dual writers, drop-a-field cutover refusal, rollback-by-replay) but its entry is undefined (P1-3). M3–M4 are coverage ledgers rather than plans; that is acceptable if Task 11 is decoupled from Task 10 (P2-6). Requirement coverage TS-01–26 is complete on paper; TS-04, TS-11, TS-24 have no reachable date until P1-3 and the cloud-browser assumption are resolved.

## 5. Files inspected / checks not run

**Inspected (read-only):** `LLM_README.md`, `AGENTS.md`, `README.md:1`, `openspec/config.yaml`, `docs/twilight-structure/{README,spec,assumptions,sdlc-stages,product-experience,client-repositories,knowledge,CONTEXT,research,discovery,sdd-proposal}.md`, `research/{backlog-patterns,runtime-patterns,knowledge-patterns,local-workflow-observations}.md`, `evidence/{plan-review.md,final-checks.json,scoped-checks.json,content-manifest.json,cli-probes.json}`, `docs/wiki/README.md`, `CONTEXT-MAP.md`, `docs/adr/0014`, `docs/adr/0015`, `openspec/changes/twilight-control-plane/{proposal,design,tasks}.md` + both delta specs + `.openspec.yaml`, `openspec/changes/twilight-sdlc-pilot/{proposal,design,tasks,verify}.md` + both delta specs, `openspec/schemas/twilight-v1/schema.yaml` and templates `proposal/tasks/verify.md` (spec/design templates: existence only), `docs/2026-09-02-refactoring-plan.md` (lines 1–368 plus greps), `docs/2026-09-02-refactoring-handoff.md:1-80`, `apps/be-01/src/repository/` (listing only), grep of `design.md` for auth terms.

**Not inspected:** `apps/mcp-01/README.md`, `docs/capacity.md`, root `CONTEXT.md`, `sdd-sources.md`, `research/initial-inspection.md`, `docs/2026-09-06-openspec-upgrade.md`, `HUMAN_README.md`, `.github/workflows/ci.yml`, the modified `.agents/.claude` skill files, any be-01 source contents, credentials or `.env`.

**Checks not run:** no OpenSpec/Nx/Bun/git commands; no re-execution of the recorded CLI probes; no retrieval of upstream sources (Backlog.md, LangGraph, i-have-adhd, OpenHands, OpenClaw, Claw Patrol, MCP spec) — upstream claims are taken from the repo's research notes as recorded, not verified by me.
