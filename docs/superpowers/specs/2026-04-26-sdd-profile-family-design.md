# SDD Profile Family — Design

**Status:** draft v2
**Date:** 2026-04-26
**Author:** Dany Fedorov (drafted with Claude)
**Scope:** Prototype across two repos. `wbs-tool` is the **source-of-truth** for schemas and vendored skills; `web-constructor` is the **manager-facing demo stage**. Distribution layer (real cross-repo plugin) deferred.

## 1. Goal

**Audience:** myself first, then my manager. **Action wanted:** convince myself the SDD loop earns its overhead on real work, then show the manager an artifact trail strong enough to justify continued investment.

Two real artifact trails, picked to make the **profile-family thesis** ("right-sized process per change shape") visible by contrast:

- **Checkpoint 1 — wbs-tool, lightweight profile (`sdd-module-add`).** Simpler subject, my own repo, lower stakes. Self-convince + tooling shakedown.
- **Checkpoint 2 — web-constructor, heavyweight profile (`sdd-architecture-change`).** Heavier subject, real production codebase, manager-facing.

The **side-by-side of the two trails is the persuasion artifact.** The full 6-profile family (§4) stays in this design as the _design intent_, but only those two profiles get implemented in this iteration. The rest are documented-but-deferred.

### Goals

- **Composable.** All wiring at the OpenSpec `instruction` layer (prompt-level). No edits to upstream Superpowers or Pocock skill files.
- **Right-sized process.** A known-shape feature doesn't pay for adversarial design review; an architecture change does. The two implemented profiles span the weight axis enough to make this concrete.
- **Auditable artifact trail.** Every change leaves an `openspec/changes/<name>/` directory that explains _what was decided, why, and how it was built_.
- **Cross-repo portable (minimally).** Schemas + vendored skills can be copy-pasted from wbs-tool into web-constructor without surgery. Real distribution layer deferred.

### Non-goals (this iteration)

- `frontend-ai-skills` distribution repo, GitHub Pages portal, multi-IDE manifests, marketplace.json, validation CI, cross-repo sync. **Deferred** (full plan in §11 "Future — Distribution layer"). Minimal copy-paste port from wbs-tool → web-constructor _is_ in scope; anything fancier is not.
- Implementing all 6 profiles. Only `sdd-module-add` and `sdd-architecture-change` are built; `sdd-quickfix`, `sdd-refactor`, `sdd-product-feature`, `sdd-full` remain designed-not-built.
- Components catalog / "Layer B" pedagogy. Becomes valuable once ≥2 profiles have run on real work; not before.
- Profile chooser skill. Two profiles don't need a chooser — a one-paragraph rule in `docs/sdd/PROFILES.md` is enough.
- Cross-team adoption / migration of `betterme-dev/web-constructor`'s existing skills.
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

| Term           | Meaning                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Module         | Anything with an interface and an implementation (function, class, package, slice)                                                             |
| Interface      | Everything a caller must know to use the module (types, invariants, error modes, ordering, config)                                             |
| Implementation | The code inside                                                                                                                                |
| Depth          | High leverage at the interface — much behavior behind a small surface                                                                          |
| Shallow        | Interface nearly as complex as the implementation                                                                                              |
| Seam           | Where an interface lives; a place behavior can be altered without editing in place                                                             |
| Adapter        | A concrete thing satisfying an interface at a seam                                                                                             |
| Leverage       | What callers get from depth                                                                                                                    |
| Locality       | What maintainers get from depth (change, bugs, knowledge concentrated in one place)                                                            |
| Deletion test  | Imagine deleting the module — if complexity vanishes, it was a pass-through; if complexity reappears across N callers, it was earning its keep |

Plus DDD vocabulary from `pocock:domain-model` / `pocock:ubiquitous-language` skills, written into `CONTEXT.md` lazily as it's used.

## 4. Profiles

Six profiles. Each is a separate `openspec/schemas/<name>/schema.yaml` with its own DAG and `instruction` fields. The DAG mechanism is unchanged — only the artifact set, requirements, and instruction prompts vary.

### 4.1 `sdd-quickfix`

**When:** bug fix, dep bump, lint tweak, doc update, build-tool tweak. No behavior change beyond restoring intended behavior.

**Pipeline:**

| #   | Step                 | Skill / tool                                                                               | Output                |
| --- | -------------------- | ------------------------------------------------------------------------------------------ | --------------------- |
| 1   | Reproduce + diagnose | `superpowers:systematic-debugging` (or `pocock:triage-issue` if filing GitHub issue first) | Notes; optional issue |
| 2   | Failing test         | `superpowers:tdd` (+ `pocock:tdd` for test-quality coaching)                               | Failing test commit   |
| 3   | Minimal fix          | (engineer)                                                                                 | Fix commit            |
| 4   | Per-change review    | `superpowers:requesting-code-review`                                                       | Review approval       |
| 5   | PR                   | `gh pr create`                                                                             | PR URL                |

**Schema:** _Not an OpenSpec schema._ This profile is a **documented direct-PR flow** with prescribed skill invocations, lives at `docs/sdd/PROFILES.md#sdd-quickfix`. The profile chooser (§6) routes to it via the decision tree; OpenSpec is bypassed by design — the artifact trail is the PR body + commits.
**Persuasion point:** "Even a quickfix gets TDD + review automatically without ceremony or governance overhead."

### 4.2 `sdd-module-add`

**When:** new feature with known shape (CRUD, well-precedented). No new pattern.

**Pipeline:**

| #   | Step               | Skill / tool                                                        | Output                |
| --- | ------------------ | ------------------------------------------------------------------- | --------------------- |
| 1   | Brainstorm (light) | `superpowers:brainstorming`                                         | `brainstorm.md`       |
| 2   | Proposal           | OpenSpec artifact                                                   | `proposal.md`         |
| 3   | Specs (delta)      | OpenSpec artifact                                                   | `specs/<cap>/spec.md` |
| 4   | Tasks              | OpenSpec artifact                                                   | `tasks.md`            |
| 5   | Plan               | `superpowers:writing-plans`                                         | `plan.md`             |
| 6   | Worktree           | `superpowers:using-git-worktrees`                                   | Isolated branch       |
| 7   | Scaffold           | Executor skills (auto-detect FE/BE/full-stack)                      | Generated files       |
| 8   | Implement          | `superpowers:subagent-driven-development` (→ TDD + review per task) | Commits per task      |
| 9   | Verify             | `openspec-verify-change`                                            | `verify.md`           |
| 10  | Finish             | `superpowers:finishing-a-development-branch`                        | PR or merge           |
| 11  | Archive            | `/opsx:archive`                                                     | Synced specs          |

**Schema:** New `openspec/schemas/sdd-module-add/schema.yaml`. Same DAG as `sdd-plus-superpowers` but adds **executor step** before subagent loop in apply phase.

**Executor binding (instruction-layer prompt, injected into apply):**

> Before dispatching the subagent loop, scan `tasks.md`. If a task mentions creating a new module, run `bm:create-module-boilerplate`. If a task mentions schema migration, run `bm:create-schema-migration`. If a task mentions e2e tests, run `bm:create-admin-e2e-tests` or `bm:create-public-client-e2e-tests`. Choose the variant by detecting the stack (FE-only / BE-only / full-stack) using the auto-detect pattern from `backend-ai-skills/adding-env-var`: scan repo for stack signals, branch on results, ask user only if 0 or multiple stacks detected.

**Persuasion point:** "Boilerplate is generated, not copy-pasted. The executor catalog is extensible per repo and stack-aware."

### 4.3 `sdd-architecture-change`

**When:** new pattern, breaking change, cross-cutting concern, risky decision.

**Pipeline:**

| #   | Step                        | Skill / tool                                                         | Output                                                                          |
| --- | --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Domain pre-check (optional) | `pocock:domain-model` (only if `CONTEXT.md` exists)                  | Updated `CONTEXT.md`, ADRs                                                      |
| 2   | Brainstorm                  | `superpowers:brainstorming`                                          | `brainstorm.md`                                                                 |
| 3   | **Critique #1: grill**      | `pocock:grill-me` (mandatory)                                        | `grill-log.md` (Q&A captured)                                                   |
| 4   | Proposal                    | OpenSpec artifact                                                    | `proposal.md`                                                                   |
| 5   | Specs (delta)               | OpenSpec artifact                                                    | `specs/<cap>/spec.md`                                                           |
| 6   | Design (mandatory)          | OpenSpec artifact + `pocock:design-an-interface` for new module APIs | `design.md` (with 3 alternatives compared)                                      |
| 7   | **Critique #2: deepening**  | `pocock:improve-codebase-architecture`                               | `deepening-review.md` (deepening opportunities surfaced; new ADRs if warranted) |
| 8   | Tasks                       | OpenSpec artifact                                                    | `tasks.md`                                                                      |
| 9   | Plan                        | `superpowers:writing-plans`                                          | `plan.md`                                                                       |
| 10  | Worktree                    | `superpowers:using-git-worktrees`                                    | Isolated branch                                                                 |
| 11  | Implement                   | `superpowers:subagent-driven-development` (→ TDD + review per task)  | Commits per task                                                                |
| 12  | Verify                      | `openspec-verify-change`                                             | `verify.md`                                                                     |
| 13  | Finish                      | `superpowers:finishing-a-development-branch`                         | PR or merge                                                                     |
| 14  | Archive                     | `/opsx:archive`                                                      | Synced specs + frozen ADRs                                                      |

**Schema:** New `openspec/schemas/sdd-architecture-change/schema.yaml`. Adds three artifacts beyond `sdd-plus-superpowers`: `domain-check.md` (optional), `grill-log.md`, `deepening-review.md`. `design.md` becomes mandatory (not optional).

**Sequential dispatch during design phase.** Run `grill-me` → `design-an-interface` → `improve-codebase-architecture` in order, each consuming the prior's output. `grill-me` is interactive (one question at a time, requires user) and cannot be parallelized; the others' artifacts read better when they can reference each other. Parallel dispatch was considered and rejected for the prototype as untested and unnecessary — flagged as a future optimization only.

**Persuasion point:** "Adversarial review is built in. The hardest changes get the heaviest scrutiny, automatically. The artifacts (`grill-log.md`, `deepening-review.md`) prove the scrutiny happened."

### 4.4 `sdd-refactor`

**When:** refactor that doesn't change behavior — restructure, deepen modules, untangle coupling.

**Pipeline:**

| #   | Step                   | Skill / tool                                                            | Output                                             |
| --- | ---------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | Refactor RFC           | `pocock:request-refactor-plan`                                          | `refactor-rfc.md` (with tiny-commits plan)         |
| 2   | Architecture review    | `pocock:improve-codebase-architecture`                                  | `deepening-review.md` (RFC alignment / divergence) |
| 3   | Proposal (lightweight) | OpenSpec artifact (references RFC)                                      | `proposal.md`                                      |
| 4   | Tasks                  | OpenSpec artifact (one task per tiny commit)                            | `tasks.md`                                         |
| 5   | Plan                   | `superpowers:writing-plans` (already tiny per Fowler)                   | `plan.md`                                          |
| 6   | Worktree               | `superpowers:using-git-worktrees`                                       | Isolated branch                                    |
| 7   | Implement              | `superpowers:subagent-driven-development` (tests must survive refactor) | Commits per task                                   |
| 8   | Verify                 | `openspec-verify-change` (must show **no behavior delta** in specs)     | `verify.md`                                        |
| 9   | Finish                 | `superpowers:finishing-a-development-branch`                            | PR or merge                                        |
| 10  | Archive                | `/opsx:archive`                                                         | Specs unchanged; ADR if applicable                 |

**Schema:** New `openspec/schemas/sdd-refactor/schema.yaml`. Skips brainstorm; replaces it with `refactor-rfc.md`. No `specs/<cap>/spec.md` _delta_ unless behavior actually changed (in which case escalate to `sdd-architecture-change`).

**Persuasion point:** "Refactors are governed too — proven via no-behavior-delta specs. No silent rewrites, no scope creep into feature work."

### 4.5 `sdd-product-feature`

**When:** stakeholder-driven feature where the _PRD_ is the persuasion artifact for non-engineering reviewers (PMs, design, leadership).

**Pipeline:**

| #   | Step             | Skill / tool                                                      | Output                                                                                                     |
| --- | ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Brainstorm       | `superpowers:brainstorming`                                       | `brainstorm.md`                                                                                            |
| 2   | PRD              | `pocock:to-prd` (Pocock template; **replaces** standard proposal) | `prd.md` (Problem / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope) |
| 3   | Specs (delta)    | OpenSpec artifact                                                 | `specs/<cap>/spec.md`                                                                                      |
| 4   | Issues breakdown | `pocock:to-issues`                                                | GitHub issues (HITL/AFK marked, blocked-by graph) + `issues.md`                                            |
| 5   | Tasks            | OpenSpec artifact (mirrors issue list)                            | `tasks.md`                                                                                                 |
| 6   | Plan             | `superpowers:writing-plans`                                       | `plan.md`                                                                                                  |
| 7   | Worktree         | `superpowers:using-git-worktrees`                                 | Isolated branch                                                                                            |
| 8   | Implement        | `superpowers:subagent-driven-development`                         | Commits per task                                                                                           |
| 9   | Verify           | `openspec-verify-change`                                          | `verify.md`                                                                                                |
| 10  | Finish           | `superpowers:finishing-a-development-branch`                      | PR or merge                                                                                                |
| 11  | Archive          | `/opsx:archive`                                                   | Synced specs                                                                                               |

**Schema:** New `openspec/schemas/sdd-product-feature/schema.yaml`. Replaces `proposal.md` with `prd.md`. Adds `issues.md` artifact (mirror of created GitHub issues).

**Persuasion point:** "PMs read the PRD. Engineers read the same artifact trail. Single source of truth across the organization."

### 4.6 `sdd-full`

**When:** unsure which profile fits. Default fallback. Equivalent to current `sdd-plus-superpowers`.

**Schema:** Existing `openspec/schemas/sdd-plus-superpowers/schema.yaml`. The `sdd-full` alias is **deferred** — not built this iteration. Existing schema kept untouched for backwards compatibility with in-flight changes.

**Persuasion point:** "When in doubt, the default still bundles brainstorm + spec + plan + TDD + review. No half-built starting point."

## 5. Standalone tools (not profile-bound)

Available anytime regardless of profile. Vendored under `.claude/skills/pocock/`.

| Skill                        | Use case                                 | When to invoke                                |
| ---------------------------- | ---------------------------------------- | --------------------------------------------- |
| `pocock:qa`                  | Conversational bug filing                | Anytime during dev when something is reported |
| `pocock:ubiquitous-language` | Build/refresh `UBIQUITOUS_LANGUAGE.md`   | Pre-arch-change; when domain terms get fuzzy  |
| `pocock:domain-model`        | Stress-test plan against domain glossary | Pre-arch-change; on-demand                    |
| `pocock:zoom-out`            | Get higher-level codebase map            | When stuck on unfamiliar code                 |
| `pocock:write-a-skill`       | Add a new skill to the catalog           | When extending the family                     |

## 6. Profile chooser (decision rule)

**This iteration: skip the chooser skill.** Two profiles don't need an automated chooser — pick by hand based on which subject is in front of you. One-paragraph rule in `docs/sdd/PROFILES.md`:

> If the change introduces a new pattern, breaking change, or cross-cutting concern → `sdd-architecture-change`. If it adds a known-shape module with no new pattern → `sdd-module-add`. Anything else: out of scope for this iteration; pick the closer of the two and accept some misfit.

The full 6-branch decision tree (quickfix / refactor / product-feature / architecture-change / module-add / full) and the `sdd-choose-profile` skill remain designed-not-built. They become worth implementing once ≥4 profiles exist.

## 7. Verify-every-claim discipline

Adopt from `backend-ai-skills/qa-notes`. Apply to all critique-skill output:

- Every claim about code traces to a specific `file:line` in the diff.
- Every claim about a decision traces to a specific artifact (proposal / specs / design / RFC).
- Forbidden hedge wording in critique output: "maybe", "probably", "seems like", "appears to".
- **When in doubt — leave it out.**

**Enforceability is best-effort but plausible.** Encoded as principle in `openspec/SDD-GLOSSARY.md` (always reachable). Also written into each schema's critique-step `instruction` field. Inspection of the existing `sdd-plus-superpowers/schema.yaml` confirms OpenSpec already uses `instruction` text to direct skill invocations (e.g. "Use the Skill tool to invoke superpowers:brainstorming") — so passthrough for _directives_ is established practice. The remaining uncertainty is whether _style rules_ (no-hedging language) get honored as faithfully as invocation directives. Verify in Checkpoint 1 by inspecting the actual `grill-log.md` for hedge wording; if it slips through, the rule moves to a post-step lint instead of an upstream prompt prefix.

## 8. New artifacts in this repo

**Built this iteration:**

```
openspec/
├── SDD-GLOSSARY.md                          (Pocock vocabulary, adopted)
└── schemas/
    ├── sdd-plus-superpowers/                (existing, untouched)
    ├── sdd-module-add/                      (BUILT — used in Checkpoint 1)
    └── sdd-architecture-change/             (BUILT — used in Checkpoint 2)

docs/sdd/
└── PROFILES.md                              (2-profile selection rule, §6)

.claude/skills/
└── pocock/                                  (vendored Pocock skills, see §12 Q1)
    ├── VERSIONS.md                          (pinned upstream SHA per skill)
    ├── grill-me/                            (used by sdd-architecture-change)
    ├── improve-codebase-architecture/       (used by sdd-architecture-change)
    └── design-an-interface/                 (used by sdd-architecture-change)
```

**Designed-not-built (deferred):**

- `openspec/schemas/sdd-refactor/`, `openspec/schemas/sdd-product-feature/` — schemas designed in §4 but not implemented this iteration.
- `sdd-quickfix` direct-PR flow doc — designed in §4.1 but not exercised.
- `.claude/skills/sdd-choose-profile/` — not needed at 2 profiles.
- `.claude/skills/pocock/` skills outside the three above (`domain-model`, `request-refactor-plan`, `to-prd`, `to-issues`, `triage-issue`, `ubiquitous-language`, `tdd`, `qa`, `write-a-skill`) — vendor lazily as later profiles get built.
- `docs/sdd/DEMO-PLAN.md` — replaced for this iteration by §9 inline + the two artifact trails themselves.

Each built schema directory contains: `schema.yaml`, `README.md`, `INTEGRATION.md`, `templates/<artifact>.md`.

## 9. Demo plan

Two real artifact trails, deliberately contrasting.

| #            | Repo                           | Profile                   | Subject (TBD at kickoff)                                                                                                                                               | Why                                                                                                                                                                 |
| ------------ | ------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkpoint 1 | `wbs-tool` (this repo)         | `sdd-module-add`          | A known-shape feature on the WBS-tool roadmap (e.g. `WorkPackage` CRUD or similar). Picked at kickoff.                                                                 | Self-convince + tooling shakedown. Lower stakes, full control. Lightweight profile shows OpenSpec + Superpowers + minimal critique.                                 |
| Checkpoint 2 | `betterme-dev/web-constructor` | `sdd-architecture-change` | A real decision on the web-constructor near-term roadmap with a non-trivial design choice (new pattern, breaking change, or cross-cutting concern). Picked at kickoff. | Manager-facing. Production codebase, real stakes. Heavyweight profile shows the full critique gate: grill-me + design-an-interface + improve-codebase-architecture. |

**The persuasion artifact is the side-by-side of the two trails**, not a slide deck. Specifically:

- Both `openspec/changes/<name>/` directories, intact, in their respective repos.
- A short comparison note (~1 page) in `docs/sdd/PROFILES.md` pointing at both trails and calling out which artifacts differ between profiles and which stay constant.
- Optional: a 5-minute live walkthrough if the manager wants synchronous time.

Subject selection happens at kickoff of each checkpoint; it is not pre-committed in this design.

## 10. Acceptance criteria for the prototype

- Both implemented schemas (`sdd-module-add`, `sdd-architecture-change`) validate via `openspec schemas` and `openspec validate --all --json`.
- Checkpoint 1 produces a complete artifact trail in `wbs-tool`'s `openspec/changes/archive/`.
- Checkpoint 2 produces a complete artifact trail in `web-constructor`'s `openspec/changes/archive/` (or equivalent location), with the relevant schema + vendored Pocock skills copy-pasted in from wbs-tool at a recorded SHA.
- `docs/sdd/PROFILES.md` exists with the 2-profile selection rule (§6) and a side-by-side comparison pointing at the two trails.
- `openspec/SDD-GLOSSARY.md` exists and is referenced by every critique-step's `instruction` field.
- Verify-every-claim instruction-passing is **tested in Checkpoint 1**: confirm the `instruction` text reaches the invoked skill's prompt. If not, §7 is downgraded and the manager pitch reflects that honestly.
- Vendored Pocock skills (`grill-me`, `improve-codebase-architecture`, `design-an-interface`) are pinned in `.claude/skills/pocock/VERSIONS.md` and invocable via the `Skill` tool from anywhere in each repo.
- A side-by-side reading of the two trails makes the right-sized-process thesis visible without external explanation.

## 11. Implementation roadmap

Two checkpoints, each producing a real artifact trail. Total ~6-8 days focused.

### Setup (~½ day, before Checkpoint 1)

- Write `openspec/SDD-GLOSSARY.md` in `wbs-tool` (10 terms from §3 + verify-every-claim principle).
- Vendor `grill-me`, `improve-codebase-architecture`, `design-an-interface` under `.claude/skills/pocock/`. Pin upstream SHAs in `.claude/skills/pocock/VERSIONS.md`.
- Build `openspec/schemas/sdd-module-add/` (schema.yaml, README, INTEGRATION, templates). Validate.
- Build `openspec/schemas/sdd-architecture-change/`. Validate.
- Confirm `Skill` tool can invoke the vendored Pocock skills from anywhere in `wbs-tool`.

### Checkpoint 1 — wbs-tool dry-run (~2-3 days)

**Profile:** `sdd-module-add`. **Repo:** `wbs-tool`. **Audience:** myself.

- Pick subject at kickoff (known-shape WBS feature; small enough to finish in 1-2 days of work behind the artifact loop).
- Run the full `sdd-module-add` pipeline (§4.2): brainstorm → proposal → delta specs → tasks → plan → worktree → executor → subagent-driven-development → verify → finish → archive.
- **Critical instrumentation check:** confirm OpenSpec passes `instruction`-field text into the invoked skill prompt (§7). Document the result. If passthrough doesn't work, downgrade §7 and update §10.
- Capture friction: any schema field that's wrong, any vendored skill that misbehaves, any unclear template. Fix in-flight; record in `docs/sdd/PROFILES.md`'s "lessons" section.

**Deliverable:** complete trail at `wbs-tool/openspec/changes/archive/<name>/`. Schemas refined based on real-run feedback. Verified-or-downgraded §7 claim.

### Manager pitch gate (~½ day)

After Checkpoint 1, before Checkpoint 2.

- Write a 1-page summary: what was built, what the trail shows, what's proposed next.
- Link the Checkpoint 1 trail.
- Propose a specific named web-constructor task as the Checkpoint 2 subject. Confirm with manager.
- (Greenlit by default per project context — this gate is for _alignment on the specific task_, not permission to proceed.)

### Checkpoint 2 — web-constructor demo (~3-4 days)

**Profile:** `sdd-architecture-change`. **Repo:** `betterme-dev/web-constructor`. **Audience:** manager.

- Copy-paste from `wbs-tool` to `web-constructor`: `openspec/SDD-GLOSSARY.md`, `openspec/schemas/sdd-architecture-change/`, `.claude/skills/pocock/{grill-me, improve-codebase-architecture, design-an-interface, VERSIONS.md}`. Record the source SHA in a single commit message.
- Run the full `sdd-architecture-change` pipeline (§4.3): brainstorm → grill → proposal → specs → design (with sequential dispatch of the three critique skills) → deepening review → tasks → plan → worktree → implement → verify → finish → archive.
- Capture friction; record in `wbs-tool/docs/sdd/PROFILES.md` (source-of-truth stays in wbs-tool).

**Deliverable:** complete trail at `web-constructor/openspec/changes/archive/<name>/`. Side-by-side comparison page in `wbs-tool/docs/sdd/PROFILES.md` linking both trails.

### Future — out of scope this iteration

- Implement remaining profiles (`sdd-refactor`, `sdd-product-feature`, `sdd-quickfix` direct-PR doc).
- `sdd-choose-profile` chooser skill (§6). Worth building once ≥4 profiles exist.
- Components catalog / pedagogy doc (the previous "Layer B"). Worth writing once multiple profiles have run on real work.
- Distribution layer: `frontend-ai-skills` repo, multi-IDE plugin manifests, auto-generated `marketplace.json` + validation CI, GitHub Pages portal, cross-repo sync workflow, `manifests/<repo>.yaml` for repo→teams mapping.

### Future — Distribution layer (deferred, out of scope this iteration)

- Mirror as `frontend-ai-skills` (or `full-stack-ai-skills`) distribution repo.
- Multi-IDE plugin manifests (Claude / Cursor / Codex / Copilot).
- Auto-generated `marketplace.json` + 5-job validation CI (per backend-ai-skills pattern).
- GitHub Pages portal.
- Cross-repo sync workflow.
- `manifests/<repo>.yaml` for repo→teams mapping.

## 12. Open questions

1. **[RESOLVED] Vendoring vs plugin install for Pocock skills.** Vendor into `.claude/skills/pocock/`, pinned via `VERSIONS.md`. Same vendored copy used in both `wbs-tool` and `web-constructor` to prevent upstream drift between the two demo runs.

2. **Pocock TDD vs Superpowers TDD precedence.** Both fire during apply. Superpowers TDD enforces mechanics (red→green→refactor); Pocock TDD educates about test quality (vertical slices, test behavior not implementation, deeper docs in `tests.md` / `mocking.md`). They don't conflict but they overlap. **Recommendation:** both run, accept duplication; Pocock content surfaces during planning, Superpowers enforces during apply.

3. **[RESOLVED] Executor skills source for `sdd-module-add`.** Checkpoint 1 runs in `wbs-tool` where Ilya's NestJS/TypeORM executors don't natively fit. For Checkpoint 1, either pick a BE-shaped subject (wbs-tool has a backend) or stub executors with a no-op placeholder — decide at subject-pick time. Checkpoint 2 runs in `web-constructor` which is NestJS-native; Ilya's executors apply directly there if needed (though `sdd-architecture-change` doesn't depend on them).

4. **[RESOLVED] Schema validation for multi-artifact profiles.** Confirmed by inspection of `sdd-plus-superpowers/schema.yaml`: `artifacts:` is a freeform array where the schema author defines `id`, `generates`, `requires`, and `instruction` per artifact. New artifacts (`grill-log.md`, `deepening-review.md`, etc.) just become additional array entries. No CLI changes needed; option (a) from the original Q4 applies directly.

5. **`sdd-product-feature` interaction with stakeholders.** PRD as an artifact in `openspec/changes/<name>/prd.md` is engineer-readable but stakeholders don't browse repos. Options:
   - (a) Auto-mirror `prd.md` to a Notion/Confluence page (out of scope this iteration).
   - (b) Generate a static HTML preview at PR time.
   - (c) Just link the PR; stakeholders read on GitHub.
     **Recommendation:** (c) for v1; (a) is a future-distribution-layer candidate.

## 13. Risks

| Risk                                                                                               | Severity | Mitigation                                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pocock skills upstream-evolve and break our integration                                            | Medium   | Vendor (Q1 recommendation); pin a known-good commit                                                                                                |
| Schema sprawl confuses users                                                                       | Medium   | Profile chooser + `docs/sdd/PROFILES.md` decision tree                                                                                             |
| Demo runs reveal profile boundaries are wrong                                                      | High     | Layer A explicitly captures friction; expect to refine cuts after first two runs                                                                   |
| `improve-codebase-architecture`'s glossary clashes with project DDD vocabulary                     | Low      | Glossary is architectural (Module/Seam/...), DDD is domain (Order/Customer/...) — orthogonal axes                                                  |
| Sequential critique chain in arch-change is slow on real work                                      | Low      | Accepted for prototype; parallel dispatch deferred as future optimization (§4.3)                                                                   |
| User picks wrong profile → wastes time on overhead                                                 | Low      | Only 2 profiles this iteration; manual choice via §6 rule. Brainstorm.md is reusable across schemas if mid-flight switch is needed                 |
| Style rules (no-hedging) in `instruction` text get ignored even though invocation directives don't | Medium   | Tested in Checkpoint 1 by inspecting `grill-log.md`. If hedge wording slips, demote §7 enforcement from upstream prompt prefix to a post-step lint |
| Copy-paste port wbs-tool → web-constructor drifts before Checkpoint 2 finishes                     | Low      | Single port commit recording source SHA; no further sync until Checkpoint 2 archives                                                               |

## 14. Success metrics

**Self-convince (Checkpoint 1):**

- I personally judge the trail to be _better than what I'd have produced without the loop_ on the same subject. Specifically: the brainstorm or grill artifact caught a wobble I hadn't caught on my own; the spec or plan made a downstream decision easier; the verify step prevented a regression.
- Schema bugs, vendoring issues, and `instruction`-passthrough behavior (§7) are all known after Checkpoint 1 — no surprises blocking Checkpoint 2.

**Manager-convince (Checkpoint 2):**

- Manager reads the side-by-side and gives a clear next-step signal: continue / scope down / try elsewhere. Any of those is success — silence or "looks fine, keep going if you want" is failure (means it didn't land).
- At least one of: (a) manager proposes the next subject themselves, (b) manager raises the loop in a team discussion, (c) manager greenlights time for the deferred distribution layer.

Aspirational (post-iteration, not gated by this design):

- Another team member adopts the loop on their own work without me prompting.
- The two trails are referenced in an internal eng doc or forum thread.

## 15. References

- [openspec/schemas/sdd-plus-superpowers/](../../../openspec/schemas/sdd-plus-superpowers/) — predecessor schema
- [obra/superpowers](https://github.com/obra/superpowers) — Superpowers skill source
- [mattpocock/skills](https://github.com/mattpocock/skills) — Pocock skill source
- [betterme-dev/backend-ai-skills](https://github.com/betterme-dev/backend-ai-skills) — distribution pattern reference
- [betterme-dev/web-constructor PR #122](https://github.com/betterme-dev/web-constructor/pull/122) — Ilya's executor skills (`create-module-boilerplate`, `create-schema-migration`, `create-*-e2e-tests`)
- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) — OpenSpec CLI source
