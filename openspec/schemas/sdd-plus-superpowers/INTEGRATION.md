# OpenSpec × Superpowers Integration Overview

> This document describes how the `sdd-plus-superpowers` schema fuses OpenSpec's
> artifact governance flow with Superpowers' execution skills into a single
> workflow. Use it for onboarding new members, as a reference during change
> review, and as required reading before modifying the schema.
>
> Corresponding schema version: `sdd-plus-superpowers` v1

---

## 1. The Nature of the Integration: What Hangs Where

OpenSpec owns the **WHAT** — governance, validation, and archival of the markdown artifacts `proposal` / `specs` / `design` / `tasks`.
Superpowers owns the **HOW** — the **execution skills**: brainstorming conversations, TDD discipline, subagent dispatch, code review, and so on.

The two are joined through the custom schema [schema.yaml](./schema.yaml). The integration is not at the code level; instead, each OpenSpec artifact instruction says "at this step, use the Skill tool to invoke `superpowers:xxx`". **No superpowers skill file is modified**, nor is the OpenSpec CLI — the wiring is purely at the instruction layer.

---

## 2. The 7 Superpowers Touchpoints at a Glance

| # | Superpowers skill | Where it hangs | Trigger mode |
|---|---|---|---|
| 1 | `superpowers:brainstorming` | `brainstorm` artifact instruction | Direct |
| 2 | `superpowers:writing-plans` | `plan` artifact instruction | Direct |
| 3 | `superpowers:using-git-worktrees` | apply step 1 | Direct |
| 4 | `superpowers:subagent-driven-development` | apply step 2a | Direct |
| 5 | `superpowers:test-driven-development` | (auto-triggered inside #4) | **Transitive** (SKILL.md L205 / L274) |
| 6 | `superpowers:requesting-code-review` | (auto-triggered inside #4) | **Transitive** (SKILL.md L270) |
| 7 | `superpowers:finishing-a-development-branch` | apply step 4 | Direct |

There is also a **fallback**:

- `superpowers:executing-plans` (apply step 2b) — used only "when the current platform lacks subagent support". On Claude Code, always use 2a. Per the original text of `superpowers:executing-plans` SKILL.md L14: "If subagents are available, use `superpowers:subagent-driven-development` instead of this skill".

---

## 3. Artifact DAG (with superpowers injection points)

```
┌──────────────┐
│  brainstorm  │ ◄── superpowers:brainstorming
│  (root)      │     (2-3 approaches + Alternatives Considered)
└──────┬───────┘
       │
       ├──► ┌──────────┐
       │    │ proposal │    Why (50-1000 chars) / What Changes / Capabilities
       │    └────┬─────┘
       │         │
       │         ▼
       │    ┌──────────────────┐
       │    │ specs/**/*.md    │    ADDED / MODIFIED / REMOVED / RENAMED
       │    │ (delta specs)    │    Each requirement: SHALL/MUST + scenario
       │    └────┬─────────────┘
       │         │
       │         ▼
       │    ┌──────────┐
       │    │  tasks   │    Coarse-grained checkboxes (tracked during apply)
       │    └────┬─────┘
       │         │
       │         ▼
       │    ┌──────────┐
       │    │  plan    │ ◄── superpowers:writing-plans
       │    └────┬─────┘     (2-5 minute micro-steps)
       │         │
       │         │ ─────────┐
       │         │          │
       │         │     ┌────▼──────┐
       │         │     │  apply    │ ◄── superpowers:using-git-worktrees
       │         │     │  (phase)  │ ◄── superpowers:subagent-driven-development
       │         │     │           │         ├── superpowers:test-driven-development (transitive)
       │         │     │           │         └── superpowers:requesting-code-review (transitive)
       │         │     │           │ ◄── superpowers:finishing-a-development-branch
       │         │     └────┬──────┘
       │         │          │
       ▼         ▼          ▼
    ┌──────────┐    ┌──────────┐
    │  design  │    │  verify  │ ◄── openspec-verify-change (5 checks)
    │ (optional)│   └──────────┘
    └──────────┘
```

**A few things to note:**

- `design` is an **optional leaf**. Brainstorm still tries to pre-fill `design.md`, but `tasks` no longer hard-depends on it (`tasks.requires: [specs]`). Per OpenSpec conventions: `design.md` is only written when non-trivial technical decisions need explanation.
- `verify`'s `requires: [plan]` exists so the schema graph is complete; its instruction explicitly says "**MUST run on a completed implementation, NOT during planning**". This is an intentional mismatch between the OpenSpec DAG and actual timing, so that `openspec status` can surface verify progress.
- `apply` produces no artifact — it is a **phase** that changes source code + tasks.md checkboxes.

---

## 4. Full Development Workflow (one change's lifecycle)

### Step 0: Decide whether this needs the change flow

First ask yourself: is this a behavior change?

| Type | Change needed? | Which schema |
|---|---|---|
| New feature / new capability | ✅ Yes | `sdd-plus-superpowers` |
| Breaking change | ✅ Yes | `sdd-plus-superpowers` |
| Architecture change | ✅ Yes | `sdd-plus-superpowers` |
| Bug fix (restores prior behavior) | ❌ No | Direct PR |
| Test backfill / coverage | ❌ No | Direct PR |
| Build-tool tweaks (lint rules, coverage thresholds, etc.) | ❌ No | Direct PR |
| Non-breaking dependency bump | ❌ No | Direct PR |
| Docs update | ❌ No | Direct PR |

This decision logic lives in the "When not to create a Spec" section of [openspec/specs/README.md](../../specs/README.md).

---

### Step 1: Create the change + enter brainstorming

```bash
/opsx:new my-feature --schema sdd-plus-superpowers
# → Creates empty openspec/changes/my-feature/ + .openspec.yaml
# → Shows the brainstorm artifact's instructions
```

Then:

```bash
/opsx:continue
# → Triggers the brainstorm artifact
# → The instruction says "use the Skill tool to invoke superpowers:brainstorming"
# → Enters multi-turn interactive dialog: context exploration → clarifying questions → 2-3 approaches with trade-offs → design approval
# → After the dialog, writes brainstorm.md (with an Alternatives Considered section)
# → If a design doc is produced, also writes design.md (pre-filled)
```

**Key point**: this step is the alignment ritual for the whole flow. Later artifacts (`proposal`, `specs`) are extractions from `brainstorm.md`.

---

### Step 2: Serially produce proposal → specs → tasks → plan

You can step through with `/opsx:continue` (human review at each step) or use `/opsx:ff` to fast-forward and fill in all remaining artifacts at once.

| Step | Output | Key rule |
|---|---|---|
| 2a | `proposal.md` | Why section 50-1000 chars; Capabilities section lists new / modified capabilities |
| 2b | `specs/<capability>/spec.md` | 4 delta types (ADDED / MODIFIED / REMOVED / RENAMED); each requirement has SHALL/MUST + `#### Scenario:` |
| 2c (opt) | `design.md` | Only if technical decisions need explanation; brainstorm may have pre-filled it |
| 2d | `tasks.md` | Coarse-grained checkboxes (`- [ ] X.Y description`), apply tracks progress through these |
| 2e | `plan.md` | `/opsx:continue` triggers `superpowers:writing-plans`, decomposing tasks into 2-5 minute micro-steps |

When done, run:

```bash
openspec validate --all --json
# → A pre-commit git hook is installed locally and validates automatically on commit
```

---

### Step 3: Apply (implementation phase)

```bash
/opsx:apply
```

This fires the 4 steps in [schema.yaml](./schema.yaml) `apply.instruction`:

#### 3-1. Workspace — invoke `superpowers:using-git-worktrees`

- Create an isolated workspace at `.worktrees/<change-name>/`
- Switch to a new branch
- Run project setup and confirm the test baseline is clean

#### 3-2. Executor — invoke `superpowers:subagent-driven-development` (path 2a, default)

- The main agent reads `plan.md` and **dispatches a fresh subagent per micro-task**
- Inside each subagent, these kick in automatically:
  - **TDD enforcement** (`superpowers:test-driven-development`, transitive)
    - Write a failing test first
    - Watch it fail
    - Write the minimum code to make it pass
    - No test **before** production code? Delete and redo
  - **Per-task code review** (`superpowers:requesting-code-review`, transitive)
    - Spec-compliance review (does it match the plan?)
    - Code-quality review (are there smells?)
    - Critical issues block progress
- When a coarse task completes, the corresponding `tasks.md` checkbox is updated
- After all tasks run, a final code review over the whole implementation

> **2b fallback**: switch to `superpowers:executing-plans` only when the current platform has no subagent support. Claude Code has subagents, so always use 2a. If forced onto 2b, you have to maintain TDD discipline manually and invoke `superpowers:requesting-code-review` yourself.

#### 3-3. Verification — invoke `openspec-verify-change` (produces `verify.md`)

5 checks:

1. **Structural validation**: `openspec validate --all --json` all PASS
2. **Task completion**: every `- [ ]` in `tasks.md` becomes `- [x]`
3. **Delta spec sync state**: has `changes/<name>/specs/` been synced to `openspec/specs/`?
4. **Design / specs coherence**: spot-check that design decisions match spec requirements (non-blocking warning)
5. **Implementation signal**: no unstaged files in the worktree

If anything fails, go back to the relevant artifact, fix it, and re-run verify.

#### 3-4. Completion — invoke `superpowers:finishing-a-development-branch`

- Confirm tests are all green
- Present options: merge / PR / keep branch / discard
- Clean up the worktree

---

### Step 4: Archive

```bash
/opsx:archive my-feature
```

- Validate + check task completion (incomplete tasks trigger a warning, not a block)
- Sync delta specs back into `openspec/specs/<capability>/spec.md`
  - Order: RENAMED → REMOVED → MODIFIED → ADDED
  - If already synced manually, use `--skip-specs`
- Move the whole `changes/my-feature/` into `changes/archive/YYYY-MM-DD-my-feature/`
- History is frozen; the unix timeline is treated as the source of truth

---

## 5. Practical CLI Cheat Sheet

| Scenario | Command |
|---|---|
| **First-time clone of the project** | `bash scripts/install-git-hooks.sh` |
| New change (interactive, step by step) | `/opsx:new <name> --schema sdd-plus-superpowers` followed by several `/opsx:continue` |
| New change (fill all artifacts in one go) | `/opsx:ff <name>` |
| Resume an interrupted change | `/opsx:continue <name>` |
| Enter implementation | `/opsx:apply <name>` |
| Manual verify | `/opsx:verify <name>` |
| Archive | `/opsx:archive <name>` |
| Use the native OpenSpec schema (skip brainstorm) | `/opsx:new <name> --schema spec-driven` |
| List all project schemas | `openspec schemas` |
| Current change progress | `openspec status --change <name> --json` |
| List active changes | `openspec list` |
| Validate the whole project | `openspec validate --all --json` |

---

## 6. Subtleties of the Integration (5 designs worth remembering)

### 1. Output redirection

Superpowers' brainstorming writes to `docs/superpowers/specs/` by default, and writing-plans writes to `docs/superpowers/plans/`. Our artifact instruction **overrides this behavior** by injecting "write to the change directory" into the prompt context. No superpowers source edited, no OpenSpec CLI edits.

### 2. Schema-level vs prompt-level integration

The integration happens entirely in the `instruction` fields (pure prompt). If Superpowers upgrades the behavior of some skill, we **don't touch the schema**. Only if a skill is renamed or removed do we need to edit `schema.yaml`.

### 3. Transitive dependencies made explicit

TDD and code-review originally hide inside subagent-driven-development (you'd only find them in SKILL.md). In the schema's apply step 2a instruction, both transitive activations are **listed directly** so readers immediately see "what actually happens during apply".

### 4. The fallback path is labeled honestly

Path 2b (executing-plans) exists but is labeled as a fallback for "platforms without subagent support", citing the official superpowers SKILL.md L14 verbatim. We don't invent home-grown rules like "use 2b for small changes".

### 5. Verify is a leaf in the schema graph but actually runs after apply

`verify`'s `requires: [plan]` exists only so the schema graph is complete; its instruction explicitly states "**MUST run on a completed implementation, NOT during planning**". This is an intentional mismatch between the OpenSpec DAG and real timing, done so that `openspec status` can surface verify progress.

---

## 7. Projects adopting this schema should maintain a snapshot section

Each project using `sdd-plus-superpowers` is encouraged to keep a snapshot of the form below in its own repo docs, so new members can see "what this repo looks like right now" at a glance:

```markdown
## Project snapshot (YYYY-MM-DD)

- **OpenSpec CLI**: v<version>
- **Schema**: `sdd-plus-superpowers` v<n>
- **Specs (bounded-context granularity)**: <n> domains exist, <n> reserved for lazy backfill
  - Existing: `<capability-a>` / `<capability-b>` / ...
  - Reserved: `<capability-c>` / ...
- **Automation**: <what openspec commands pre-commit / CI runs>
- **Superpowers plugin**: `superpowers@<version>` installed at `<path>`, N skills used by this integration
```

> This snapshot section goes stale over time; for authoritative state, check live via `openspec list` + `openspec schemas`.

---

## 8. The Most Important Thing

The core value of this integration is not "chaining a bunch of skills together"; it's:

> **Connecting "requirements alignment" (OpenSpec) with "rigorous execution" (Superpowers), so that a change's entire path — from "what do we want" to "code has passed TDD + code review" — is traceable, re-runnable, and auditable.**

The breakpoints in a traditional flow are:

- Requirements live in Slack / conversation → the LLM works from memory during apply → misaligned with the spec
- Or: specs live in Confluence → code lives in the repo → the two drift apart

The two-layer discipline of sdd-plus-superpowers solves this:

1. **OpenSpec's delta spec governance** → ensures "what we want to do" doesn't drift
2. **Superpowers' subagent-driven + TDD + review** → ensures "what we've done" has quality discipline

Another way to put it: OpenSpec is about **rescuing requirements from conversation**, and Superpowers is about **rescuing discipline from human willpower**. The combination is what spec-driven development actually looks like.

---

## Related Documents

- [schema.yaml](./schema.yaml) — machine-readable definition of this schema
- [README.md](./README.md) — design motivation and high-level overview of the schema
- [templates/](./templates/) — markdown templates for each artifact
- [../../specs/README.md](../../specs/README.md) — capability domain classification guide
- [openspec-conventions spec](https://github.com/Fission-AI/OpenSpec/blob/main/openspec/specs/openspec-conventions/spec.md) — OpenSpec official conventions
- [obra/superpowers](https://github.com/obra/superpowers) — Superpowers skill source
