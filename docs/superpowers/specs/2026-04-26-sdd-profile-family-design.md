# SDD Profile Family — Design

**Status:** draft v1
**Date:** 2026-04-26
**Author:** Dany Fedorov (drafted with Claude)
**Scope:** This `wbs-tool` repo. Distribution layer (cross-repo plugin) deferred.

## 1. Goal

Demonstrate **how to compose your own SDD loop from OpenSpec + skills**, built up in three layers — each de-risking the next:

- **Layer C — One working loop.** Wire all five components (governance / discipline / critique / executors / vocabulary) into a single end-to-end run on one small real change. Proves the wiring composes at all. Detailed in §11.
- **Layer A — Variation by change shape.** Generalize the C loop into a family of profiles tuned to risk. Proves the loop is tunable. The profile family (§4) is delivered here.
- **Layer B — Components catalog.** With multiple working profiles in hand, extract the pedagogy — what stays the same across loops, what varies, and how to wire your own. Proves the design is teachable.

Each layer is independently useful: C alone proves feasibility; C+A proves right-sizing; C+A+B proves the recipe is portable. The final deliverable is the artifact trails of all C and A runs plus the Layer B explainer.

### Goals

- **Composable.** All wiring at the OpenSpec `instruction` layer (prompt-level). No edits to upstream Superpowers or Pocock skill files.
- **Right-sized process.** A bug fix doesn't pay for adversarial design review; an architecture change does. Profiles match overhead to risk. (Earned in Layer A.)
- **Auditable artifact trail.** Every change leaves an `openspec/changes/<name>/` directory that explains *what was decided, why, and how it was built*.
- **Teachable.** A reader of the Layer B explainer can wire their own SDD loop in their own repo.

### Non-goals (this iteration)

- `frontend-ai-skills` distribution repo, GitHub Pages portal, multi-IDE manifests, marketplace.json, validation CI, cross-repo sync. **Deferred** (full plan in §11 "Future — Distribution layer").
- Cross-team adoption / migration of `betterme-dev/web-constructor`'s existing skills.
- Productionizing executor skills (NestJS/TypeORM templates are BE-shaped; this repo is FE-leaning).
- Reconciling Pocock TDD vs Superpowers TDD at the rule level — both run; transient duplication is accepted.

## 2. Architecture (5 layers)

```
SDD Process Family
│
├── 1. GOVERNANCE — OpenSpec (the WHAT)
│   ├── Artifacts:  brainstorm → proposal → specs → design? → tasks → plan
│   ├── Schema mechanism: each change picks a profile (--schema X)
│   ├── Validation: openspec validate --all --json (CI-gateable)
│   └── Archive: delta specs sync to openspec/specs/, history frozen
│
├── 2. PROCESS DISCIPLINE — Superpowers (the HOW)
│   ├── brainstorming           (multi-turn dialog, alternatives explored)
│   ├── writing-plans           (2-5 min TDD micro-steps)
│   ├── using-git-worktrees     (isolated workspace per change)
│   ├── subagent-driven-development (fresh context per task)
│   │     ↳ test-driven-development      (transitive, mandatory)
│   │     ↳ requesting-code-review       (transitive, per-task + final)
│   ├── systematic-debugging    (bug paths)
│   ├── verification-before-completion  (evidence > assertion)
│   └── finishing-a-development-branch  (merge / PR / cleanup)
│
├── 3. CRITIQUE GATES — Pocock (the SO-WHAT)
│   ├── grill-me                       (adversarial Q&A, one at a time)
│   ├── domain-model                   (grill against CONTEXT.md + ADRs)
│   ├── design-an-interface            (3+ parallel sub-agents, "design it twice")
│   └── improve-codebase-architecture  (deepening opportunities, glossary-aware)
│
├── 4. DOMAIN EXECUTORS — Ilya-style (the BOILERPLATE)
│   ├── bm:create-module-boilerplate   (NestJS/TypeORM templates)
│   ├── bm:create-schema-migration     (TypeORM-aware shell)
│   ├── bm:create-admin-e2e-tests      (RBAC checklist + scaffold)
│   └── bm:create-public-client-e2e-tests
│       (FE-shaped equivalents: deferred to roadmap §11 phase 2 stub)
│
└── 5. SHARED VOCABULARY  (the LANGUAGE)
    ├── Pocock architectural glossary  (Module/Interface/Depth/Seam/Adapter/...)
    ├── Project DDD glossary           (CONTEXT.md, ADRs, UBIQUITOUS_LANGUAGE.md)
    └── Verify-every-claim discipline  (from backend-ai-skills/qa-notes)
```

## 3. Vocabulary

Adopt Pocock's `improve-codebase-architecture` glossary as the architectural language used across all profiles. Lives at `openspec/SDD-GLOSSARY.md`.

| Term | Meaning |
|---|---|
| Module | Anything with an interface and an implementation (function, class, package, slice) |
| Interface | Everything a caller must know to use the module (types, invariants, error modes, ordering, config) |
| Implementation | The code inside |
| Depth | High leverage at the interface — much behavior behind a small surface |
| Shallow | Interface nearly as complex as the implementation |
| Seam | Where an interface lives; a place behavior can be altered without editing in place |
| Adapter | A concrete thing satisfying an interface at a seam |
| Leverage | What callers get from depth |
| Locality | What maintainers get from depth (change, bugs, knowledge concentrated in one place) |
| Deletion test | Imagine deleting the module — if complexity vanishes, it was a pass-through; if complexity reappears across N callers, it was earning its keep |

Plus DDD vocabulary from `pocock:domain-model` / `pocock:ubiquitous-language` skills, written into `CONTEXT.md` lazily as it's used.

## 4. Profiles

Six profiles. Each is a separate `openspec/schemas/<name>/schema.yaml` with its own DAG and `instruction` fields. The DAG mechanism is unchanged — only the artifact set, requirements, and instruction prompts vary.

### 4.1 `sdd-quickfix`

**When:** bug fix, dep bump, lint tweak, doc update, build-tool tweak. No behavior change beyond restoring intended behavior.

**Pipeline:**

| # | Step | Skill / tool | Output |
|---|---|---|---|
| 1 | Reproduce + diagnose | `superpowers:systematic-debugging` (or `pocock:triage-issue` if filing GitHub issue first) | Notes; optional issue |
| 2 | Failing test | `superpowers:tdd` (+ `pocock:tdd` for test-quality coaching) | Failing test commit |
| 3 | Minimal fix | (engineer) | Fix commit |
| 4 | Per-change review | `superpowers:requesting-code-review` | Review approval |
| 5 | PR | `gh pr create` | PR URL |

**Schema:** *Not an OpenSpec schema.* This profile is a **documented direct-PR flow** with prescribed skill invocations, lives at `docs/sdd/PROFILES.md#sdd-quickfix`. The profile chooser (§6) routes to it via the decision tree; OpenSpec is bypassed by design — the artifact trail is the PR body + commits.
**Persuasion point:** "Even a quickfix gets TDD + review automatically without ceremony or governance overhead."

### 4.2 `sdd-module-add`

**When:** new feature with known shape (CRUD, well-precedented). No new pattern.

**Pipeline:**

| # | Step | Skill / tool | Output |
|---|---|---|---|
| 1 | Brainstorm (light) | `superpowers:brainstorming` | `brainstorm.md` |
| 2 | Proposal | OpenSpec artifact | `proposal.md` |
| 3 | Specs (delta) | OpenSpec artifact | `specs/<cap>/spec.md` |
| 4 | Tasks | OpenSpec artifact | `tasks.md` |
| 5 | Plan | `superpowers:writing-plans` | `plan.md` |
| 6 | Worktree | `superpowers:using-git-worktrees` | Isolated branch |
| 7 | Scaffold | Executor skills (auto-detect FE/BE/full-stack) | Generated files |
| 8 | Implement | `superpowers:subagent-driven-development` (→ TDD + review per task) | Commits per task |
| 9 | Verify | `openspec-verify-change` | `verify.md` |
| 10 | Finish | `superpowers:finishing-a-development-branch` | PR or merge |
| 11 | Archive | `/opsx:archive` | Synced specs |

**Schema:** New `openspec/schemas/sdd-module-add/schema.yaml`. Same DAG as `sdd-plus-superpowers` but adds **executor step** before subagent loop in apply phase.

**Executor binding (instruction-layer prompt, injected into apply):**

> Before dispatching the subagent loop, scan `tasks.md`. If a task mentions creating a new module, run `bm:create-module-boilerplate`. If a task mentions schema migration, run `bm:create-schema-migration`. If a task mentions e2e tests, run `bm:create-admin-e2e-tests` or `bm:create-public-client-e2e-tests`. Choose the variant by detecting the stack (FE-only / BE-only / full-stack) using the auto-detect pattern from `backend-ai-skills/adding-env-var`: scan repo for stack signals, branch on results, ask user only if 0 or multiple stacks detected.

**Persuasion point:** "Boilerplate is generated, not copy-pasted. The executor catalog is extensible per repo and stack-aware."

### 4.3 `sdd-architecture-change`

**When:** new pattern, breaking change, cross-cutting concern, risky decision.

**Pipeline:**

| # | Step | Skill / tool | Output |
|---|---|---|---|
| 1 | Domain pre-check (optional) | `pocock:domain-model` (only if `CONTEXT.md` exists) | Updated `CONTEXT.md`, ADRs |
| 2 | Brainstorm | `superpowers:brainstorming` | `brainstorm.md` |
| 3 | **Critique #1: grill** | `pocock:grill-me` (mandatory) | `grill-log.md` (Q&A captured) |
| 4 | Proposal | OpenSpec artifact | `proposal.md` |
| 5 | Specs (delta) | OpenSpec artifact | `specs/<cap>/spec.md` |
| 6 | Design (mandatory) | OpenSpec artifact + `pocock:design-an-interface` for new module APIs | `design.md` (with 3 alternatives compared) |
| 7 | **Critique #2: deepening** | `pocock:improve-codebase-architecture` | `deepening-review.md` (deepening opportunities surfaced; new ADRs if warranted) |
| 8 | Tasks | OpenSpec artifact | `tasks.md` |
| 9 | Plan | `superpowers:writing-plans` | `plan.md` |
| 10 | Worktree | `superpowers:using-git-worktrees` | Isolated branch |
| 11 | Implement | `superpowers:subagent-driven-development` (→ TDD + review per task) | Commits per task |
| 12 | Verify | `openspec-verify-change` | `verify.md` |
| 13 | Finish | `superpowers:finishing-a-development-branch` | PR or merge |
| 14 | Archive | `/opsx:archive` | Synced specs + frozen ADRs |

**Schema:** New `openspec/schemas/sdd-architecture-change/schema.yaml`. Adds three artifacts beyond `sdd-plus-superpowers`: `domain-check.md` (optional), `grill-log.md`, `deepening-review.md`. `design.md` becomes mandatory (not optional).

**Parallel-dispatch optimization (instruction-layer):** During design phase, dispatch `grill-me` + `design-an-interface` + `improve-codebase-architecture` as **parallel subagents** (Mode A pattern from `ci-cd-approver-reviewer`), then synthesize into `design.md`. Gives a 2-3× wall-clock improvement on the heaviest profile.

**Persuasion point:** "Adversarial review is built in. The hardest changes get the heaviest scrutiny, automatically. The artifacts (`grill-log.md`, `deepening-review.md`) prove the scrutiny happened."

### 4.4 `sdd-refactor`

**When:** refactor that doesn't change behavior — restructure, deepen modules, untangle coupling.

**Pipeline:**

| # | Step | Skill / tool | Output |
|---|---|---|---|
| 1 | Refactor RFC | `pocock:request-refactor-plan` | `refactor-rfc.md` (with tiny-commits plan) |
| 2 | Architecture review | `pocock:improve-codebase-architecture` | `deepening-review.md` (RFC alignment / divergence) |
| 3 | Proposal (lightweight) | OpenSpec artifact (references RFC) | `proposal.md` |
| 4 | Tasks | OpenSpec artifact (one task per tiny commit) | `tasks.md` |
| 5 | Plan | `superpowers:writing-plans` (already tiny per Fowler) | `plan.md` |
| 6 | Worktree | `superpowers:using-git-worktrees` | Isolated branch |
| 7 | Implement | `superpowers:subagent-driven-development` (tests must survive refactor) | Commits per task |
| 8 | Verify | `openspec-verify-change` (must show **no behavior delta** in specs) | `verify.md` |
| 9 | Finish | `superpowers:finishing-a-development-branch` | PR or merge |
| 10 | Archive | `/opsx:archive` | Specs unchanged; ADR if applicable |

**Schema:** New `openspec/schemas/sdd-refactor/schema.yaml`. Skips brainstorm; replaces it with `refactor-rfc.md`. No `specs/<cap>/spec.md` *delta* unless behavior actually changed (in which case escalate to `sdd-architecture-change`).

**Persuasion point:** "Refactors are governed too — proven via no-behavior-delta specs. No silent rewrites, no scope creep into feature work."

### 4.5 `sdd-product-feature`

**When:** stakeholder-driven feature where the *PRD* is the persuasion artifact for non-engineering reviewers (PMs, design, leadership).

**Pipeline:**

| # | Step | Skill / tool | Output |
|---|---|---|---|
| 1 | Brainstorm | `superpowers:brainstorming` | `brainstorm.md` |
| 2 | PRD | `pocock:to-prd` (Pocock template; **replaces** standard proposal) | `prd.md` (Problem / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope) |
| 3 | Specs (delta) | OpenSpec artifact | `specs/<cap>/spec.md` |
| 4 | Issues breakdown | `pocock:to-issues` | GitHub issues (HITL/AFK marked, blocked-by graph) + `issues.md` |
| 5 | Tasks | OpenSpec artifact (mirrors issue list) | `tasks.md` |
| 6 | Plan | `superpowers:writing-plans` | `plan.md` |
| 7 | Worktree | `superpowers:using-git-worktrees` | Isolated branch |
| 8 | Implement | `superpowers:subagent-driven-development` | Commits per task |
| 9 | Verify | `openspec-verify-change` | `verify.md` |
| 10 | Finish | `superpowers:finishing-a-development-branch` | PR or merge |
| 11 | Archive | `/opsx:archive` | Synced specs |

**Schema:** New `openspec/schemas/sdd-product-feature/schema.yaml`. Replaces `proposal.md` with `prd.md`. Adds `issues.md` artifact (mirror of created GitHub issues).

**Persuasion point:** "PMs read the PRD. Engineers read the same artifact trail. Single source of truth across the organization."

### 4.6 `sdd-full`

**When:** unsure which profile fits. Default fallback. Equivalent to current `sdd-plus-superpowers`.

**Schema:** Existing `openspec/schemas/sdd-plus-superpowers/schema.yaml`. Add an alias entry `sdd-full` so `--schema sdd-full` works. Keep existing schema as-is for backwards compatibility with in-flight changes.

**Persuasion point:** "When in doubt, the default still bundles brainstorm + spec + plan + TDD + review. No half-built starting point."

## 5. Standalone tools (not profile-bound)

Available anytime regardless of profile. Vendored under `.claude/skills/pocock/`.

| Skill | Use case | When to invoke |
|---|---|---|
| `pocock:qa` | Conversational bug filing | Anytime during dev when something is reported |
| `pocock:ubiquitous-language` | Build/refresh `UBIQUITOUS_LANGUAGE.md` | Pre-arch-change; when domain terms get fuzzy |
| `pocock:domain-model` | Stress-test plan against domain glossary | Pre-arch-change; on-demand |
| `pocock:zoom-out` | Get higher-level codebase map | When stuck on unfamiliar code |
| `pocock:write-a-skill` | Add a new skill to the catalog | When extending the family |

## 6. Profile chooser (decision rule)

Auto-detect-style heuristic at change creation time:

```
If diff would only fix a known bug, no behavior shift     → sdd-quickfix
Else if change is structural-only (no behavior delta)     → sdd-refactor
Else if user provides PRD framing or stakeholder context  → sdd-product-feature
Else if change introduces new pattern, breaking, or       → sdd-architecture-change
       cross-cutting concern
Else if change adds a known-shape module                  → sdd-module-add
Else                                                      → sdd-full
```

Implement as a slash command: `/opsx:new <name>` prompts user with this decision tree if `--schema` not specified. Encoded as a chooser skill at `.claude/skills/sdd-choose-profile/SKILL.md`.

## 7. Verify-every-claim discipline

Adopt from `backend-ai-skills/qa-notes`. Apply to all critique-skill output:

- Every claim about code traces to a specific `file:line` in the diff.
- Every claim about a decision traces to a specific artifact (proposal / specs / design / RFC).
- Forbidden hedge wording in critique output: "maybe", "probably", "seems like", "appears to".
- **When in doubt — leave it out.**

Encoded as a per-skill instruction layer in each `schema.yaml`'s critique-step `instruction` field, plus as a global principle in `openspec/SDD-GLOSSARY.md`.

## 8. New artifacts in this repo

```
openspec/
├── SDD-GLOSSARY.md                          (Pocock vocabulary, adopted)
└── schemas/
    ├── sdd-plus-superpowers/                (existing; alias to sdd-full)
    ├── sdd-module-add/                      (new schema)
    ├── sdd-architecture-change/             (new schema)
    ├── sdd-refactor/                        (new schema)
    └── sdd-product-feature/                 (new schema)
    (note: sdd-quickfix is not a schema — it's a documented direct-PR flow, see §4.1)

docs/sdd/
├── PROFILES.md                              (human-facing profile selection guide)
└── DEMO-PLAN.md                             (persuasion script + change-of-each-type)

.claude/skills/
├── pocock/                                  (vendored Pocock skills, see §12 Q1)
│   ├── grill-me/
│   ├── improve-codebase-architecture/
│   ├── design-an-interface/
│   ├── domain-model/
│   ├── request-refactor-plan/
│   ├── to-prd/
│   ├── to-issues/
│   ├── triage-issue/
│   ├── ubiquitous-language/
│   ├── tdd/
│   ├── qa/
│   └── write-a-skill/
└── sdd-choose-profile/                      (chooser skill for /opsx:new)
```

Each new schema directory contains: `schema.yaml`, `README.md`, `INTEGRATION.md`, `templates/<artifact>.md`.

## 9. Demo plan

Pick one *real* change of each type and run end-to-end during Layer A. Capture the resulting `openspec/changes/<name>/` (or PR for `sdd-quickfix`) as the artifact trail. The Layer C run produces an additional trail using the `sdd-demo` schema; once Layer A is underway, it can be retroactively classified into the closest matching profile if useful, or kept separate as the "wiring proof" trail.

| Profile | Demo candidate | Why |
|---|---|---|
| `sdd-quickfix` | Existing fe-01 test isolation fix (per recent commit `fb0e058`) | Tiny, real, demonstrates "no ceremony" path |
| `sdd-module-add` | Add a known-shape entity to the WBS schema (e.g. `WorkPackage` CRUD) | Demonstrates Ilya executors + auto-detect |
| `sdd-architecture-change` | The WebSocket-based real-time collaborative architecture decision (per project memory: server mode is WS real-time) | Big enough to warrant grill-me + design-an-interface + deepening review |
| `sdd-refactor` | Pick a deepening candidate from `pocock:improve-codebase-architecture`'s first run on this repo (the skill's job is to surface candidates) | Demonstrates no-behavior-delta governance; lets the critique skill pick the demo |
| `sdd-product-feature` | A PRD-shaped feature (e.g. share-link with permissions) | Demonstrates PM-readable artifact trail |
| `sdd-full` | (covered by existing `sdd-plus-superpowers` usage) | Fallback baseline; no new demo needed |

Persuasion deck = the 5 artifact trails + a side-by-side comparison page (`docs/sdd/DEMO-PLAN.md`) + a 5-minute walkthrough (live or screencast).

## 10. Acceptance criteria for the prototype

- All 4 new schemas validate via `openspec schemas` (sdd-module-add, sdd-architecture-change, sdd-refactor, sdd-product-feature).
- `sdd-full` alias is registered.
- Each profile has a complete demo artifact trail in `openspec/changes/archive/` (or a merged PR for `sdd-quickfix`).
- `docs/sdd/DEMO-PLAN.md` exists and links to all 5 artifact trails.
- `openspec/SDD-GLOSSARY.md` is referenced by all critique-skill instruction fields.
- Verify-every-claim discipline is encoded in every critique step's `instruction`.
- A user unfamiliar with the project can read `docs/sdd/PROFILES.md` and pick the right profile for a hypothetical change.
- Pocock skills are vendored or installed and invocable via `Skill` tool from anywhere in the repo.

## 11. Implementation roadmap

### Layer C — One working loop (~2-3 days)

The minimum trail that touches every layer once. Proves the wiring composes.

**Setup (~half day):**

- Write `openspec/SDD-GLOSSARY.md` (10 terms from §3 + verify-every-claim discipline).
- Vendor a *minimal* Pocock subset under `.claude/skills/pocock/`: `grill-me` + `improve-codebase-architecture` only. Full catalog comes in Layer A.
- Copy `openspec/schemas/sdd-plus-superpowers/` → `openspec/schemas/sdd-demo/`. Inject **one** Pocock critique invocation into a step's `instruction` field. DAG unchanged. Proves instruction-layer injection without committing to the full schema design.

**Subject:** a net-new small change, picked at kickoff. Selection criteria — small enough to finish in ~1 day, real (not throwaway), exercises enough surface that `grill-me` has something substantive to grill on.

**Loop (one demo run):**

| # | Step | Layer | Artifact |
|---|---|---|---|
| 1 | `superpowers:brainstorming` | Discipline | `brainstorm.md` |
| 2 | `pocock:grill-me` against brainstorm | **Critique** | `grill-log.md` |
| 3 | OpenSpec proposal + delta specs + tasks | **Governance** | `proposal.md`, `specs/<cap>/spec.md`, `tasks.md` |
| 4 | `superpowers:writing-plans` | Discipline | `plan.md` |
| 5 | `superpowers:using-git-worktrees` | Discipline | branch |
| 6 | Executor stub (`bm:demo-executor` no-op) | **Executors** (placeholder) | log line in trail |
| 7 | `superpowers:subagent-driven-development` (TDD + review transitively) | Discipline | per-task commits |
| 8 | `openspec-verify-change` | Governance | `verify.md` |
| 9 | `superpowers:finishing-a-development-branch` + `/opsx:archive` | Governance | PR + synced specs |

**Deliverable:** `openspec/changes/<name>/` complete trail + `docs/sdd/C-WALKTHROUGH.md` annotating "artifact ← skill ← layer" for each step. The walkthrough is the wiring diagram in prose.

**Acceptance:**

- Trail shows all 5 layers touched (governance, discipline, critique, executors-as-stub, vocabulary).
- `grill-log.md` references `SDD-GLOSSARY.md` terms (vocabulary is load-bearing, not decorative).
- Executor stub runs and logs — the seam exists for Layer A to fill.
- `C-WALKTHROUGH.md` is readable in <10 minutes by someone new to the project.

### Layer A — Variation by change shape (~5-7 days)

With the C loop working, generalize into the profile family from §4.

- Vendor remaining Pocock skills under `.claude/skills/pocock/`.
- Create the four new schema directories under `openspec/schemas/` (module-add, architecture-change, refactor, product-feature). Document `sdd-quickfix` as a non-schema flow in `docs/sdd/PROFILES.md`. Alias `sdd-full` → `sdd-plus-superpowers`.
- Each schema: `schema.yaml`, `README.md`, `INTEGRATION.md`, `templates/`. Inject Pocock invocations as `instruction` text (no edits to skill files). Inject verify-every-claim discipline into every critique-step instruction.
- Validate via `openspec schemas` and `openspec validate --all --json`.
- Write `sdd-choose-profile` skill (decision tree from §6). Wire into `/opsx:new`.
- Run each profile against its demo candidate from §9, end-to-end. Capture artifact trails. Refine schemas based on real-run feedback.

**Deliverable:** all 5 schemas validating; one demo trail per profile in `openspec/changes/archive/` (or merged PR for `sdd-quickfix`); `docs/sdd/PROFILES.md` complete.

### Layer B — Components catalog (~1-2 days)

With Layer A's artifact trails in hand, extract the pedagogy.

- Write `docs/sdd/COMPONENTS.md`: the five layers, what they're for, which skills/tools live in each, and the seams where you wire them together. Reference real artifacts from C and A as evidence.
- Diff the schemas in prose: what stays the same across all profiles vs. what each profile changes. Surfaces the design axes a reader needs to wire their own loop.
- Update `docs/sdd/PROFILES.md` to point at `COMPONENTS.md` as the prerequisite read.
- Optional: 5-minute screencast or live-walkthrough script using one C-trail and one A-trail.

**Deliverable:** `docs/sdd/COMPONENTS.md` + updated `PROFILES.md`. A reader unfamiliar with this repo can read both and outline how they would wire an SDD loop in their own project.

**Total Layers C–B: ~8-12 days of focused work.**

### Future — Distribution layer (deferred, out of scope this iteration)

- Mirror as `frontend-ai-skills` (or `full-stack-ai-skills`) distribution repo.
- Multi-IDE plugin manifests (Claude / Cursor / Codex / Copilot).
- Auto-generated `marketplace.json` + 5-job validation CI (per backend-ai-skills pattern).
- GitHub Pages portal.
- Cross-repo sync workflow.
- `manifests/<repo>.yaml` for repo→teams mapping.

## 12. Open questions

1. **Vendoring vs plugin install for Pocock skills.** Pocock's repo (`mattpocock/skills`) is a peer of `obra/superpowers`. Vendor into `.claude/skills/pocock/` (offline-friendly, pin-able, fork-able for our customizations) **or** install as a Claude Code plugin (auto-updating, simpler, but upstream surprises during demo)? **Recommendation:** vendor for the prototype.

2. **Pocock TDD vs Superpowers TDD precedence.** Both fire during apply. Superpowers TDD enforces mechanics (red→green→refactor); Pocock TDD educates about test quality (vertical slices, test behavior not implementation, deeper docs in `tests.md` / `mocking.md`). They don't conflict but they overlap. **Recommendation:** both run, accept duplication; Pocock content surfaces during planning, Superpowers enforces during apply.

3. **Executor skills source for `sdd-module-add` demo.** Ilya's web-constructor skills are NestJS/TypeORM-specific. This repo is FE-leaning. Three options:
   - (a) Build minimal FE executors in Layer A (e.g. `bm:create-react-feature-module` with React + Vite scaffolding).
   - (b) Skip executors in `sdd-module-add` demo and stub them with a placeholder.
   - (c) Demo `sdd-module-add` with a BE-shaped change (the wbs server side has a backend).
   **Recommendation:** (c) for the demo (showcase Ilya's actual work), with a noted gap for future FE executor authoring.

4. **Schema validation for multi-artifact profiles.** Profiles with new artifacts (`grill-log.md`, `deepening-review.md`, `prd.md`, `refactor-rfc.md`, `issues.md`) need OpenSpec to recognize them. Options:
   - (a) Define them as first-class artifacts in each schema YAML.
   - (b) Treat them as supplementary docs alongside the standard artifacts.
   **Recommendation:** (a) — they're load-bearing, deserve schema-level tracking via `tracks:` field.

5. **`sdd-product-feature` interaction with stakeholders.** PRD as an artifact in `openspec/changes/<name>/prd.md` is engineer-readable but stakeholders don't browse repos. Options:
   - (a) Auto-mirror `prd.md` to a Notion/Confluence page (out of scope this iteration).
   - (b) Generate a static HTML preview at PR time.
   - (c) Just link the PR; stakeholders read on GitHub.
   **Recommendation:** (c) for v1; (a) is a future-distribution-layer candidate.

## 13. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Pocock skills upstream-evolve and break our integration | Medium | Vendor (Q1 recommendation); pin a known-good commit |
| Schema sprawl confuses users | Medium | Profile chooser + `docs/sdd/PROFILES.md` decision tree |
| Demo runs reveal profile boundaries are wrong | High | Layer A explicitly captures friction; expect to refine cuts after first two runs |
| `improve-codebase-architecture`'s glossary clashes with project DDD vocabulary | Low | Glossary is architectural (Module/Seam/...), DDD is domain (Order/Customer/...) — orthogonal axes |
| Subagent-driven dispatch in arch-change is too slow | Medium | Parallel dispatch (§4.3 optimization); fall back to sequential if needed |
| User picks wrong profile → wastes time on overhead | Low | Profile chooser; can switch profile mid-flight by reusing brainstorm.md across schemas |

## 14. Success metrics for the persuasion campaign

- One internal team agrees to try the SDD process on their next non-trivial feature.
- The artifact trail of one demo change is referenced in a company-wide eng forum / doc.
- A discussion is initiated about the distribution layer (deferred future) — meaning the prototype proved the value enough to scale.

## 15. References

- [openspec/schemas/sdd-plus-superpowers/](../../../openspec/schemas/sdd-plus-superpowers/) — predecessor schema
- [obra/superpowers](https://github.com/obra/superpowers) — Superpowers skill source
- [mattpocock/skills](https://github.com/mattpocock/skills) — Pocock skill source
- [betterme-dev/backend-ai-skills](https://github.com/betterme-dev/backend-ai-skills) — distribution pattern reference
- [betterme-dev/web-constructor PR #122](https://github.com/betterme-dev/web-constructor/pull/122) — Ilya's executor skills (`create-module-boilerplate`, `create-schema-migration`, `create-*-e2e-tests`)
- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) — OpenSpec CLI source
