## Twilight Structure — correction follow-up review

Reviewer: `claude-fable-5-1`, via the Claude CLI's local Read/Glob/Grep tools; inference ran on Anthropic's service as the user authorized. No commands, edits, or credential reads. Recorded CLI outputs below are attributed evidence from the repository's receipts, not my execution.

### 1. Verdict

**Actionable. No blocking correction remains.** Every disposition in `docs/twilight-structure/evidence/plan-review.md:64-78` is present in the files it names, and the ones that rest on repository facts (auth primitives, refactor state, doc-cap command) check out against the source. One new factual error was introduced by the P3-1 correction (item 3); it is a one-line fix, not a blocker to Task 1.1 or to handoff.

### 2. Dispositions

**P1-1 (caller identity) — closed.** `assumptions.md:51` (A30) names `JwksTokenVerifier` and `browserOidcClientFromEnv`; both exist (`libs/auth/src/token-verifier.ts:27`, `libs/auth/src/oidc-client.ts:35`) and are env-parameterized, so a separate Twilight client/audience is a matter of passing a different env record — a routine implementation decision. The cited callers/tests exist (`apps/be-01/src/controller/oidc.integration.test.ts`, `auth.controller.ts`, `libs/auth/src/token-verifier.test.ts`). Task 3.1 (`tasks.md:133,147-155`) now owns the deliverable with issuer-backed positive control and explicit 403 denials for service and user-delegated tokens; `design.md:166-181` specifies the browser-session-only `POST /api/decision-tokens`; `spec.md:110-133` carries the requirement and both scenarios. The old "still to be evaluated" language in `docs/twilight-structure/spec.md` is gone (`:87-90` now points at the design/assumptions).

**P1-2 (two coordinators) — closed.** `spec.md:142-149` now says "two concurrent admission requests within the single active coordinator" and states explicitly that multi-coordinator operation is a separate storage/lease change; `tasks.md:482-485` and `design.md:209-213` agree.

**P1-3 (refactor entry gate) — closed as an actionable future gate, and honestly stated.** The coordinator's refusal to start the adapter now is correct given the user's ordering, and `tasks.md:402-405` / `client-repositories.md:164-166` say so. The checklist (`client-repositories.md:154-159`) matches the handoff's actual open items exactly: W4-4 not started, W2-7 cell half / W2-11 / W3-3 deferred into it, W4-3 registry open, W2-1 write half open, 218 spec-project errors outside every gate (`docs/2026-09-02-refactoring-handoff.md:14-44`). It is not vacuous: rows 3 and 4 cannot be satisfied by deferral — they require spec-project targets in CI proven with an injected type error, a recorded closure commit, an interface/field/history inventory, and a full gate against that revision. Today `apps/be-01/project.json:58-63` typechecks only the source project and CI runs `run-many -t … typecheck` (`ci.yml:99`), so that row is a real, unmet, dated condition. `client-repositories.md:151-153,158` and A33 explicitly refuse to inherit the historical counts as current evidence. Rows 1–2 permit "explicit recorded decision/deferral", which is legitimate: the adapter needs a _stable_ command vocabulary, not necessarily the W4-3 registry. One honest caveat: the spec-typecheck change is not owned by any Twilight task (the handoff says it "wants an OpenSpec change" of its own), so TS-24's date depends on a workstream outside this plan. That is the consequence of the user's ordering, not a defect in the plan, but whoever picks up Task 9 should know the entry condition is external work.

**Remaining P2/P3 — none prevent handoff.**

- P2-1: `review-doc-cap.json` names `bun run tools/tool-git-hooks/src/hooks/doc-caps.ts`, records exit 1 with the exact message the code emits (`doc-caps.ts:41-42`) at 151 lines and exit 0 restored; `verify.md:75-81` explains the `wall_time_seconds` field. `LLM_README.md` is 150 lines (line 151 is the trailing newline). Attributed, consistent.
- P2-2: `tasks.md:378-382`, `client-repositories.md:39-41`, A35. Closed.
- P2-3: 20 deliverables across 14 groups (counted: 2/1/2/1/4/1/1/1/1/1/2/1/1/1); Task 2 preserves dotted IDs (`tasks.md:105-107`); template asks one checkbox per deliverable (`templates/tasks.md:5`); M1 sums verify (72–148 h, 1.19M–3.46M tokens). Closed.
- P2-4: empty-home container + positive control (`tasks.md:117-121`), canaries with injected-fault requirement (`:373-376`), admitted-record positive control and Task 6 worker-counter repetition (`:180-189`). Closed as planned tests.
- P2-5: `client-repositories.md:97-113`, `tasks.md:421-425`, A31. Closed.
- P2-6: `tasks.md:466-470`. Closed.
- P3-1: parity rule written in `spec.md:119-123` and `design.md:183-187`. Closed, but see item 3.
- P3-2: static `focus-brief.md` plus `verify.md:118-123` marking browser parity unrun. Closed.
- P3-3: `plan-review.md:33-60` and pilot `tasks.md:60-67` updated; Task 7.1 correctly still open. Closes once this follow-up is recorded.
- Minor, routine (P3): `tasks.md:154-155` lists wrong audience/issuer, replay, CSRF, revocation, single-use expiry, but not the "wrong intended consumer" refusal that `design.md:176` and `spec.md:133` promise. Add it to Task 3.1's test list when implementing.

### 3. New concrete issue introduced by the corrections (not a blocker)

**`design.md:187` — "existing WBS `mcp-01` remains its stdio adapter" is false.** `apps/mcp-01/README.md:3` says "Streamable HTTP MCP server over be-01"; `apps/mcp-01/src/main.ts:22-32` starts `startHttpServer` and logs `http://127.0.0.1:<port>/mcp`; `http.ts:143` uses `WebStandardStreamableHTTPServerTransport`. No stdio transport exists in `apps/mcp-01` (the `main.ts:8` JSDoc and `LLM_README.md:7` are stale, which is where my original P3-1 note inherited the error — I was wrong there, and the disposition adopted it).

Failure scenario: a Task 5.1 implementer reads the design, believes there is no existing authenticated Streamable HTTP MCP in the repo, and builds a second auth-forwarding pattern beside `mcp-01`'s per-request bearer forwarding and `mcpOAuthFromEnv` verifier — or a reviewer checking the design's first transport claim finds it wrong and discounts the rest.

Minimal repair: rewrite `design.md:186-187` to "Twilight MCP uses authenticated Streamable HTTP, the transport `apps/mcp-01/src/http.ts` already serves; Task 5.1 reads its per-request bearer forwarding and OAuth verifier before deciding reuse." Fix `plan-review.md:75` to match, and `LLM_README.md:7` (already modified in this working tree) to "Streamable HTTP MCP over be-01, :3300". Severity P2: fix before handoff because it is cheap and violates the repo's "never claim without fresh output" rule, but it blocks nothing before Task 5.

### 4. Task 1.1 and the route to the full request

Task 1.1 is a credible next action: a minimal graph independent of the compiler, pinned Bun/LangGraph/checkpointer, SIGKILL-resume proof, the memory-saver negative, and a recorded go/no-go with a named fallback (`tasks.md:47,66-74,81-82`). It is the only experiment that can change the runtime language and it is now visible on its own.

Staged coverage of the user request: client Nx repo parity (Tasks 2, 8, 14; A24/A35; repository-planning spec); Backlog-backed WBS after refactors (Tasks 9–10 behind the closure checklist; A20/A26/A27/A31/A33); FE/BE/MCP detail (design operation table, Task 5.1–5.4); roles/hooks/approvals/capacity/safety (Tasks 3–4, 7, 11.1 now reachable from M1 alone); wiki/focus (Task 12; static brief; 5.4 browser obligations named unrun); cloud acceptance (Task 13 with A32's provisional Browserbase pick and an explicit compatibility gate); self-growth (Task 14, A21). Coverage table `tasks.md:566-575` is complete on paper; TS-24's date remains bound to external refactor closure, as the user directed.

### 5. Inspected / not run

**Inspected:** `LLM_README.md`, `AGENTS.md`, `openspec/config.yaml`, `openspec/changes/twilight-control-plane/{design,tasks}.md` + both delta specs, `openspec/changes/twilight-sdlc-pilot/{tasks,verify}.md` + `specs/twilight/sdlc/spec.md` (focus scenario), `openspec/schemas/twilight-v1/templates/tasks.md` (grep), `docs/twilight-structure/{assumptions,client-repositories,spec}.md`, `evidence/{plan-review,claude-review,focus-brief}.md`, `evidence/{review-doc-cap,claude-review-receipt}.json` (receipt first 80 lines), `docs/2026-09-02-refactoring-handoff.md`, `docs/2026-09-02-refactoring-plan.md` (grep only), `.github/workflows/ci.yml` and `apps/be-01/project.json` (grep), `libs/auth/src/{index,oidc-client,token-verifier,oidc-store}.ts` (partial), `apps/mcp-01/README.md:1-40`, `apps/mcp-01/src/main.ts`, `apps/mcp-01/src/http.ts:110-170`, `tools/tool-git-hooks/src/hooks/doc-caps.ts`, `apps/be-01/src` (filename grep for oidc/callback only).

**Not inspected:** research notes and upstream sources (Backlog.md, LangGraph, Browserbase docs — A32's Bun/Playwright warning is taken as recorded), `content-manifest.json`, `cli-probes.json`, `scoped-checks.json`, `final-checks.json`, ADRs, be-01 auth controller/test contents, any `.env` or credential.

**Not run:** no OpenSpec, Nx, Bun, git, or doc-cap commands; no re-execution of recorded probes; no line-count or hash verification beyond reading files. All "passed/failed" statements about CLI checks are the repository's recorded results, attributed to their receipts.

**Blocking corrections remaining: none.** Recommended pre-handoff edits: the `design.md:187` transport sentence (and its two echoes); optionally the "wrong consumer" test in Task 3.1. Everything else flagged is a routine implementation decision or a scheduled experiment.
