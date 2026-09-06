# Twilight SDLC pilot tasks

One tracked checkbox per deliverable. This plan is for the documentation/schema
trial. [Product delivery](../twilight-control-plane/tasks.md) is separate and
remains unimplemented. Each slice includes its own review and verification.

## Task 1: Frame the request and resolve vocabulary

- [x] 1.1 Capture intent, scoped requirements, provisional answers, and owning glossary.

Evidence: `proposal.md`, `specs/twilight/`, the linked assumption ledger and glossary.
Check: intent under 400 words; no assumption masquerades as a user's approval.

## Task 2: Research concrete reference implementations

- [x] 2.1 Identify the named sources, inspect primary contracts, and record borrow/build/defer decisions.

Inputs: user brief and prior research. Independent scopes: runtime patterns and
knowledge/focus patterns. Writer ownership is one source note per researcher;
neither changes workflow authority. Two research slots; no provider benchmark or
measured token/currency claim. Check: cited claims and explicit unverified areas.

## Task 3: Build and exercise the opt-in schema

- [x] 3.1 Write `twilight-v1`, inspect its instructions, and run CLI controls plus adversarial mutations.

Files: `openspec/schemas/twilight-v1/schema.yaml` and its five templates; this
change's metadata. Depends on Task 1. Tests: actual CLI missing prerequisites,
mutation of direct prerequisites, invalid scenario/cycle/template, nested archive,
and file-progress counterexamples in a disposable repository. Record observations
in `verify.md` and durable evidence; only then add an adjacent `Proof:` comment.

## Task 4: Refactor a representative wiki area

- [x] 4.1 Add navigation and knowledge-maintenance rules, reconcile Twilight docs, and check links.

Files: `docs/wiki/README.md`, Twilight README/stage/knowledge pages, source index,
existing discovery/spec/process docs, `LLM_README.md`. Depends on Tasks 1–2.
Tests: local link resolution, broken-link mutation in a copy, existing doc cap,
and a navigation review starting with only the index. Preserve old paths.

## Task 5: Specify and plan the first product increment

- [x] 5.1 Produce FE/BE/MCP contracts, architecture, testable slices, resource estimates, and an expansion order.

Files: `openspec/changes/twilight-control-plane/` and linked product/workflow
knowledge. Depends on Tasks 2–3. Check: every new user requirement maps to a
first-slice task or a named expansion milestone with entry/exit criteria; no
future runtime task is checked. Review stale approvals, effect replay, concurrent
admission, unsupported provider controls, and knowledge poisoning explicitly.

## Task 6: Review, reconcile, and hand off the trial

- [x] 6.1 Resolve review findings, run final scoped checks, and record trial findings and next action.

Depends on Tasks 3–5. Check: schema/spec validation, named-file formatting, doc cap,
link checks, and diff review. `verify.md` records observations and every unrun gate.
Development/browser/release: inapplicable to this docs trial; no fake evidence.

## Task 7: Obtain the explicitly requested Claude review

- [x] 7.1 Review the plan with Claude Fable 5.1 and resolve any blocking findings.

The original sandbox call failed DNS; its escalation was rejected. The user then
explicitly authorized Claude CLI repository review. Claude Fable 5.1 completed
that review and returned actionable with corrections. Findings are dispositioned
in the review record. Its completed follow-up found the amended plan actionable
with no remaining blocking correction; final small factual/test-list repairs were
checked locally and closure evidence is recorded in verify.md.
