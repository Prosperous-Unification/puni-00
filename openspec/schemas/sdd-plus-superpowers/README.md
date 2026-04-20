# sdd-plus-superpowers Schema

Fuses OpenSpec's artifact governance flow with Superpowers' execution skills into a single workflow.

## What This Schema Solves

OpenSpec governs "what to do" (proposal → specs → design → tasks); Superpowers governs "how to do it" (brainstorming, writing-plans, subagent-driven-development). Each is excellent on its own, but alternating between them in real development exposes three structural problems:

1. **Duplicated outputs** — brainstorming writes design docs into the Superpowers directory (`docs/superpowers/specs/`), while OpenSpec has you re-author a proposal/design in the change directory; the content overlaps heavily.
2. **Split tasks** — OpenSpec's `tasks.md` (coarse-grained checkboxes) and Superpowers' plan (micro-step TDD) describe the same work, but in different formats, in different locations, with separate progress tracking.
3. **Manual orchestration** — the user has to judge "which skill do I use now"; there is no automatic hand-off between the two systems.

### Why a Custom Schema Instead of Modifying Existing Skills

Two alternatives were considered:

- **Adding custom fields to config.yaml** (e.g., `skill_bindings`): the OpenSpec CLI doesn't recognize these fields — no validation, no discoverability, and multiple SKILL.md files would have to be modified to read them.
- **Modifying opsx skill files directly**: highly intrusive, affects every change, and is overwritten on SKILL.md upgrade.

A custom schema leverages OpenSpec's **native project-level schema mechanism**:

- The CLI validates the schema structure
- `openspec schemas` lists it automatically
- Each change can independently pick its schema (`--schema spec-driven` or `--schema sdd-plus-superpowers`)
- No existing SKILL.md or command file is touched

---

## Workflow Overview

```
brainstorm ──→ proposal ──→ specs ──→ tasks ──→ plan
                  │                     ↑
                  └──→ design ──────────┘
```

Differences from `spec-driven`:

|                | spec-driven                 | sdd-plus-superpowers                             |
| -------------- | --------------------------- | ------------------------------------------------ |
| Starting point | proposal (manually written) | **brainstorm** (invokes the brainstorming skill) |
| End point      | tasks (coarse-grained)      | **plan** (micro-step TDD)                        |
| apply requires | tasks                       | **plan**                                         |
| apply style    | standard task-by-task       | **worktree + subagent-driven-development**       |
| New artifacts  | —                           | brainstorm, plan                                 |

---

## Integrated Superpowers Skills

| Schema phase        | Superpowers skill invoked                    | Trigger mode             |
| ------------------- | -------------------------------------------- | ------------------------ |
| brainstorm artifact | `superpowers:brainstorming`                  | via artifact instruction |
| plan artifact       | `superpowers:writing-plans`                  | via artifact instruction |
| apply phase         | `superpowers:using-git-worktrees`            | via apply instruction    |
| apply phase         | `superpowers:subagent-driven-development`    | via apply instruction    |
| after apply         | `superpowers:finishing-a-development-branch` | via apply instruction    |

All integration happens through the `instruction` fields in `schema.yaml` — telling the AI to invoke the corresponding skill via the Skill tool at the right time. No Superpowers skill file itself is modified.

### Output Redirection

Superpowers skills have default output paths (e.g., brainstorming writes to `docs/superpowers/specs/`). In this schema, the artifact instructions include redirection notes telling the invoked skill to write its output into the change directory instead:

- brainstorming → `openspec/changes/<name>/brainstorm.md` (+ optional `design.md`)
- writing-plans → `openspec/changes/<name>/plan.md`

This is done through context injection (attaching an instruction when invoking the skill) rather than modifying skill code.

---

## Usage

### Fast-path flow (recommended)

```bash
/opsx:ff my-feature    # One shot: create dir + brainstorm + proposal + design + specs + tasks + plan
/opsx:apply            # worktree + subagent-driven-development
/opsx:archive          # archive
```

### Step-by-step flow

```bash
/opsx:new my-feature --schema sdd-plus-superpowers
/opsx:continue         # → brainstorm (interactive dialog)
/opsx:continue         # → proposal
/opsx:continue         # → design
/opsx:continue         # → specs
/opsx:continue         # → tasks
/opsx:continue         # → plan
/opsx:apply
/opsx:archive
```

### Switching back to spec-driven

```bash
# Use a different schema for a single change
/opsx:new my-simple-fix --schema spec-driven

# Or change the project default
# openspec/config.yaml: schema: spec-driven
```

---

## Design Decisions

### Why brainstorm is an artifact, not a hook

Brainstorming is an interactive multi-turn dialog that requires user participation. Making it the first artifact, instead of a schema-level hook, gives two benefits:

1. **Skippable** — if the user already knows what they want to build, they can hand-write `brainstorm.md` without invoking the skill
2. **Trackable** — `openspec status` can show whether brainstorm is complete, and downstream artifacts have explicit dependencies on it

### Why plan is separate from tasks

`tasks.md` is coarse-grained checkboxes ("add PdfServiceTest"); `plan.md` is micro-steps ("scaffold the test → write a downloadPdf test → run → commit"). Their granularity and purpose differ:

- `tasks.md` → tracks overall progress (apply phase's `tracks` field parses the checkboxes)
- `plan.md` → guides the subagent through step-by-step implementation (the executor's input)

The apply phase requires `plan` rather than `tasks` because the executor needs micro-steps to work effectively. But `tracks: tasks.md` keeps overall progress pinned to the coarse-grained checkboxes.

### Fallback strategy

If a Superpowers skill is unavailable (not installed, incompatible version, etc.), each instruction includes a fallback path:

- brainstorm → hand-write `brainstorm.md`
- plan → hand-write `plan.md`
- apply → standard task-by-task manual implementation
