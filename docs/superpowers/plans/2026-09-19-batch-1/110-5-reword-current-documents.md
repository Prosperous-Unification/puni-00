# 110.5 Reword current documents and proposed changes to the new names

| Field                                      | Value                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Work item                                  | 110.5 in "PUNI platform plan"                                                               |
| Size class                                 | DOC, four checkpoints                                                                       |
| top-model-high-effort-planning-tokens      | 4000000                                                                                     |
| mid-level-mid-effort-implementation-tokens | 3000000                                                                                     |
| top-model-high-effort-review-tokens        | 3000000                                                                                     |
| Implements                                 | Tasks 2, 3 and 4 of the [rename plan](../2026-09-19-twilight-rename.md)                     |
| Packet format and contract                 | [Execution batch 1](README.md), its "Execution contract"                                    |
| Assumptions applied                        | The Naming rows of [ASSUMPTIONS.md](ASSUMPTIONS.md)                                         |
| Network                                    | None. The launcher warms the OpenSpec command into `$TMPDIR`; a download attempt is a stop. |

## 1. Goal and non-goals

**Goal.** Every file on the ownership list of section 5 uses each name in its 2026-09-19 meaning, every reference to the removed verifier tool has an explicit new home, and the Twilight README no longer tells a reader to translate.

**Non-goals.** No blanket search and replace. No edit to any file outside the ownership list, and in particular none to evidence, research notes, dated audits, archived changes or any `verify.md`. No rename of a change identifier, the workflow schema identifier, a directory, a stored evidence identity or a legacy environment variable. No new Nx project, no code, no package manifest change. No Git state change of any kind.

## 2. Read first

| File                                                       | Why                                                                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `docs/twilight-structure/names.md`                         | The naming tree, the one-line test for which tool owns a question, and the landing table. Keep it open the whole time. |
| `docs/twilight-structure/CONTEXT.md`                       | The glossary terms and their avoid lists.                                                                              |
| `docs/superpowers/plans/2026-09-19-twilight-rename.md`     | Tasks 2 to 4, the keep list, and the planned unit names table.                                                         |
| `docs/twilight-structure/README.md`                        | The reading note replaced in checkpoint D, and the rule that evidence is historical.                                   |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`      | The execution contract, the standard blocks, and the file-ownership table.                                             |
| `docs/superpowers/plans/2026-09-19-batch-1/ASSUMPTIONS.md` | The three Naming rows this packet applies without asking.                                                              |
| `bin/h2puni-gate-steps.sh`                                 | The only accepted OpenSpec success contract, with the three malformed reports a loose check admits.                    |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`  | What the document test discovers, so the coverage limit in section 10 is not overstated.                               |

## 3. Verified facts

Checked in the repository on 2026-09-19 and 2026-09-20 at commit `1eeacb0b`, before the batch's planning documents were committed.

### 3.1 The counting expressions

**The pattern**, used for the work list:

```text
Twilight Structure|\bTwilight\b|tool-twilight|twilight-(be|fe|mcp|worker|contracts|domain|runtime|assistant)\b
```

**The identifier pattern**, used for the audit guard, which is the pattern's second half:

```text
tool-twilight|twilight-(be|fe|mcp|worker|contracts|domain|runtime|assistant)\b
```

Matched lines per owned file on that date. **These are reference points, not expected values.** The executor records its own numbers in step 0; the batch's own documents and earlier packets in the execution order change the tree between planning and execution.

| File                                                                                     | Pattern | Identifier pattern |
| ---------------------------------------------------------------------------------------- | ------- | ------------------ |
| `docs/twilight-structure/spec.md`                                                        | 3       | 0                  |
| `docs/twilight-structure/sdlc-stages.md`                                                 | 2       | 1                  |
| `docs/twilight-structure/product-experience.md`                                          | 2       | 0                  |
| `docs/twilight-structure/client-repositories.md`                                         | 3       | 0                  |
| `docs/twilight-structure/knowledge.md`                                                   | 5       | 1                  |
| `docs/twilight-structure/assumptions.md`                                                 | 14      | 1                  |
| `docs/twilight-structure/README.md`                                                      | 6       | 0                  |
| `docs/wiki/README.md`                                                                    | 1       | 0                  |
| `docs/infra/README.md`                                                                   | 0       | 0                  |
| `docs/adr/0027-planning-commits-are-the-transaction-boundary.md`                         | 0       | 0                  |
| `docs/adr/0028-k3s-schedules-the-expandable-worker-pool.md`                              | 6       | 0                  |
| `docs/superpowers/specs/2026-09-17-twilight-burokrat-and-fleet-design.md`                | 4       | 0                  |
| `docs/superpowers/plans/2026-09-17-twilight-burokrat-and-fleet.md`                       | 1       | 0                  |
| `docs/superpowers/plans/2026-09-17-k3s-fleet.md`                                         | 2       | 0                  |
| `docs/superpowers/plans/2026-09-19-twilight-rename.md`                                   | 55      | 9                  |
| `openspec/changes/twilight-control-plane/proposal.md`                                    | 4       | 0                  |
| `openspec/changes/twilight-control-plane/design.md`                                      | 24      | 10                 |
| `openspec/changes/twilight-control-plane/tasks.md`                                       | 87      | 73                 |
| `openspec/changes/twilight-control-plane/specs/twilight/assistant-interaction/spec.md`   | 10      | 0                  |
| `openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md`           | 5       | 0                  |
| `openspec/changes/twilight-control-plane/specs/twilight/delivery-environments/spec.md`   | 3       | 0                  |
| `openspec/changes/twilight-control-plane/specs/twilight/repository-planning/spec.md`     | 1       | 0                  |
| `openspec/changes/twilight-review-hardening/proposal.md`                                 | 3       | 0                  |
| `openspec/changes/twilight-review-hardening/design.md`                                   | 2       | 0                  |
| `openspec/changes/twilight-review-hardening/tasks.md`                                    | 2       | 0                  |
| `openspec/changes/twilight-review-hardening/specs/twilight/workflow-maintenance/spec.md` | 3       | 0                  |
| `openspec/changes/twilight-sdlc-pilot/proposal.md`                                       | 4       | 0                  |
| `openspec/changes/twilight-sdlc-pilot/design.md`                                         | 4       | 1                  |
| `openspec/changes/twilight-sdlc-pilot/tasks.md`                                          | 3       | 0                  |
| `openspec/changes/twilight-sdlc-pilot/specs/twilight/knowledge/spec.md`                  | 3       | 0                  |
| `openspec/changes/twilight-sdlc-pilot/specs/twilight/sdlc/spec.md`                       | 2       | 1                  |

Total over the 31 files: 249 pattern lines, 97 identifier lines. The 31 files hold 7,472 lines and 73,317 words, which is why this packet has four checkpoints.

- **The rename plan is the one file that keeps identifier hits.** Its preserved unit table at lines 67 to 75 is the very mapping this packet applies, so those nine lines must survive verbatim. It is therefore on the ownership list and **off** the audit list. The other 30 files must reach zero.
- The 87 matches in `openspec/changes/twilight-control-plane/tasks.md` are 87 **search matches**, not 87 sentences about the runtime: 14 lines contain a capitalized `Twilight` in prose and 73 contain a planned identifier or path only. The two sets are disjoint and exhaust the 87.
- `docs/adr/0028-k3s-schedules-the-expandable-worker-pool.md:3` reads `**Status:** accepted, 2026-09-06.` Its six matched lines are inside the accepted decision and the considered options. They are **not** reworded, and none of them matches the identifier pattern, so preserving them costs the audit nothing.
- `docs/adr/0027-planning-commits-are-the-transaction-boundary.md` reads `**Status:** proposed, 2026-09-06.` It and `docs/infra/README.md` match the pattern zero times and receive only an ownership line.

### 3.2 Scope decisions verified in the repository

- `openspec/changes/twilight-burokrat-package` matches the pattern only in its `verify.md`. `openspec/changes/twilight-burokrat-consumer` matches three times outside `verify.md`, at `proposal.md:9`, `specs/consumer/spec.md:10` and `tasks.md:10`, and all three already read "Twilight Burokrat". Neither Burokrat package change needs a prose edit; both are off the ownership list with that evidence.
- `openspec/changes/twilight-review-hardening/evidence/doc-links-and-caps.txt:1` is a dated 2026-09-06 observation containing the old wording. It sits inside a change directory, so a naive "changes are editable" reading would touch it. It is protected by the ownership list and by the history guard.
- `openspec/changes/twilight-sdlc-pilot/tasks.md` rows are ticked `[x]` and the change is not archived. Per the Naming assumption, it is edited only where it states current or future intent.
- `deploy/` contains `compose`, `dev-src`, `k8s` and `solver-supervisor`. `deploy/twilight/k3s/` and `docs/runbook-twilight-worker-pool.md` do not exist; they are proposed paths inside the control-plane tasks, renamed as text only.
- Existing Nx project names follow `<product>-<leaf>`: `apps/wbs/be-01` is `wbs-be-01`, `libs/wbs/domain/contracts` is `wbs-contracts`, `libs/wbs/adapters/runtime-portable` is `wbs-runtime-portable`. `apps/wiki/cli` is `twilight-burokrat`, named for its package.

### 3.3 What the document test covers, and what it does not

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` holds thirteen tests. Its candidate set, read at line 25 and lines 100 to 210, is: tracked and untracked Markdown under `docs/`, Markdown at the repository root, Markdown under the single constant `ACTIVE_OPENSPEC_PACKET = 'openspec/changes/automatic-dev-solver-binding/'`, every `README.md` directly under `apps/`, `libs/` or `tools/`, and the explicit destinations parsed out of `LLM_README.md`. `LLM_README.md` routes no file under `openspec/changes/twilight-control-plane`, `twilight-review-hardening` or `twilight-sdlc-pilot`.

**So the document test checks none of the 16 owned OpenSpec files.** Section 10 supplies the tested procedure that does.

Two of its tests read the tree only through `git ls-files` and the file system, so the executor can run them by name. **The file contains no `describe` block**: `grep -c 'describe('` over it returned 0 on 2026-09-20, and all thirteen tests are declared at the top level with `test('…'`. Bun's `-t` filter matches the describe names and the title joined, so for this file the bare title _is_ the full joined name and an anchored pattern is safe. Observed on 2026-09-20 with the batch's documents present and untracked:

| Named test                                                           | Observed                              |
| -------------------------------------------------------------------- | ------------------------------------- |
| `every routed current document resolves its local links and anchors` | `1 pass`, `0 fail`, `12 filtered out` |
| `current Nx commands select existing qualified projects`             | `1 pass`, `0 fail`, `12 filtered out` |

A third, `the production index checker resolves current Markdown links and anchors`, spawns `apps/wiki/cli/src/cli.ts check-indexes working`, which reaches `apps/wiki/cli/src/inventory/read-candidate.ts` and runs `git write-tree` and `git add --update` against this clone's object database. The executor's Git directory is read-only, so the whole `tool-devsync:test` target is planner-only, exactly as the executor preamble's rule 4a requires.

The `nx-selector` check (`staleSelectorFailures`, line 164) fails any covered document that writes `nx run <name>:` or `nx test|lint|build|typecheck <name>` for a project absent from the workspace. **No owned file under `docs/` may gain such a command for a proposed project.** The proposed commands are written in full only inside the OpenSpec change files, which that check does not read.

### 3.4 Links and anchors, measured

Using the checker of section 10, run against the tree on 2026-09-20:

- All 31 owned files resolve every inline local link and every heading anchor: **189 links, zero failures**. That is the baseline the executor must preserve.
- The repository contains **91 inline links carrying a fragment whose destination is an owned file**, covering **55 distinct (file, slug) pairs**. Every one of those 55 resolves today except `openspec/changes/twilight-control-plane/tasks.md#milestones-and-ordering`, linked from `.scratch/twilight-structure/issues/01-personal-delivery-acceptance.md`; the real heading is `## Technical milestones and ordering`. That single failure is **pre-existing and out of lane**: record it, do not fix it.
- Those 55 pairs are the headings this packet must not re-slug. Sources include evidence and research files, which this packet may not edit, so a heading whose slug would change is a stop condition rather than a two-sided fix.
- None of the owned OpenSpec files uses reference-style links: `grep -n -E "^\[[^]]+\]:"` over them printed nothing.

### 3.5 The validator

`bunx @fission-ai/openspec@1.12.0 validate --all --json` returned `items: 95, passed: 95, failed: 0` on 2026-09-19. **That number is not an expected result.** 110.5 is sixth in the batch's execution order, after 010.3, 010.4 and 010.5, which add four changes between them. This packet adds no OpenSpec change, so its own expectation is "the totals recorded in step 0, unchanged".

## 4. Unknowns

| #   | Unknown                                                                             | How it is handled                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Some sentences describe all three tools at once, or the customer-facing product.    | The one-line test in the names page decides most. Section 11 makes the rest a stop condition.                                                                                      |
| 2   | Whether a given SDLC pilot line states current intent or records what was done.     | Section 6.7 gives the classification rule. An unclassifiable line is a stop condition.                                                                                             |
| 3   | The whole `tool-devsync:test` target, which no executor in this batch can run.      | Not resolvable here. The executor runs the two filesystem-only checks by name and reports the target as pending planner verification.                                              |
| 4   | Whether the launcher's warmed OpenSpec command resolves in this attempt's `TMPDIR`. | The attempt has no network. If the command cannot be resolved offline, or tries to download, the executor stops and reports the block as not run. A fetch failure is never a pass. |

## 5. File plan

### 5.1 The ownership list: 31 files, nothing created

| File                                                                                     | What changes                                                                     | Checkpoint |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| `openspec/changes/twilight-control-plane/proposal.md`                                    | Prose                                                                            | A          |
| `openspec/changes/twilight-control-plane/design.md`                                      | Unit cells, boundary diagram, prose, one new open design item                    | A          |
| `openspec/changes/twilight-control-plane/tasks.md`                                       | Prose and planned identifiers; task IDs, checkboxes and evidence links stay      | A          |
| `openspec/changes/twilight-control-plane/specs/twilight/assistant-interaction/spec.md`   | Purpose gains the owning tool; prose                                             | A          |
| `openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md`           | Purpose gains the owning tool; prose                                             | A          |
| `openspec/changes/twilight-control-plane/specs/twilight/delivery-environments/spec.md`   | Purpose gains the owning tool; prose                                             | A          |
| `openspec/changes/twilight-control-plane/specs/twilight/repository-planning/spec.md`     | Purpose gains the owning tool; prose                                             | A          |
| `docs/twilight-structure/spec.md`                                                        | Intent prose plus one new dated paragraph; the requirement table is untouched    | B          |
| `docs/twilight-structure/sdlc-stages.md`                                                 | Prose; the closing tool section is replaced by the split; stage ownership added  | B          |
| `docs/twilight-structure/product-experience.md`                                          | Prose                                                                            | B          |
| `docs/twilight-structure/client-repositories.md`                                         | Prose                                                                            | B          |
| `docs/twilight-structure/knowledge.md`                                                   | Prose, including the `tool-twilight` increment sentence at line 114              | B          |
| `docs/twilight-structure/assumptions.md`                                                 | Prose, including the planned library name in row A38                             | B          |
| `docs/wiki/README.md`                                                                    | Prose                                                                            | B          |
| `openspec/changes/twilight-review-hardening/proposal.md`                                 | Prose                                                                            | C          |
| `openspec/changes/twilight-review-hardening/design.md`                                   | Prose                                                                            | C          |
| `openspec/changes/twilight-review-hardening/tasks.md`                                    | Prose; task IDs and evidence links stay                                          | C          |
| `openspec/changes/twilight-review-hardening/specs/twilight/workflow-maintenance/spec.md` | Prose naming the workflow's owner; requirement wording unchanged in meaning      | C          |
| `openspec/changes/twilight-sdlc-pilot/proposal.md`                                       | Prose stating current intent only                                                | C          |
| `openspec/changes/twilight-sdlc-pilot/design.md`                                         | The future verifier tool at line 19 only; lines 57 and 58 are a past observation | C          |
| `openspec/changes/twilight-sdlc-pilot/tasks.md`                                          | Only a line stating future intent; ticked execution rows stay verbatim           | C          |
| `openspec/changes/twilight-sdlc-pilot/specs/twilight/knowledge/spec.md`                  | Prose                                                                            | C          |
| `openspec/changes/twilight-sdlc-pilot/specs/twilight/sdlc/spec.md`                       | The verifier reference at line 36; prose                                         | C          |
| `docs/adr/0027-planning-commits-are-the-transaction-boundary.md`                         | One dated ownership line under the status. Nothing else.                         | D          |
| `docs/adr/0028-k3s-schedules-the-expandable-worker-pool.md`                              | One dated ownership line under the status. Nothing else.                         | D          |
| `docs/superpowers/specs/2026-09-17-twilight-burokrat-and-fleet-design.md`                | Prose                                                                            | D          |
| `docs/superpowers/plans/2026-09-17-twilight-burokrat-and-fleet.md`                       | Prose                                                                            | D          |
| `docs/superpowers/plans/2026-09-17-k3s-fleet.md`                                         | Prose                                                                            | D          |
| `docs/infra/README.md`                                                                   | One ownership sentence near the top                                              | D          |
| `docs/twilight-structure/README.md`                                                      | The reading note is replaced with the exact text of checkpoint D                 | D          |
| `docs/superpowers/plans/2026-09-19-twilight-rename.md`                                   | The Task 2, 3 and 4 checkboxes only. Nothing else in the file may change.        | D          |

### 5.2 The rename plan carries no foreign hunks

`docs/superpowers/plans/2026-09-19-twilight-rename.md` is committed in the baseline the executor receives: the planner's bootstrap commit includes it. There is therefore nothing to separate and no partial staging to do. The executor changes only the Task 2, 3 and 4 checkbox characters and the dates beside them, and checkpoint D proves that by comparing the file against the byte copy taken in step 0. Everything else in that file, including the preserved unit table at lines 67 to 75, must be byte-identical.

### 5.3 The audit list: 30 files

The audit list is the ownership list minus `docs/superpowers/plans/2026-09-19-twilight-rename.md`. Step 0 writes it, and the guard reads it from that file, so the executor never improvises a filter. Its per-checkpoint slices are `audit-a.txt`, `audit-b.txt`, `audit-c.txt` and `audit-d.txt`.

### 5.4 Explicitly not owned

`openspec/changes/twilight-burokrat-package/**` and `openspec/changes/twilight-burokrat-consumer/**` need no prose edit (section 3.2). `openspec/schemas/**` is a shipped artifact (section 6.5). `docs/twilight-structure/names.md` and `docs/twilight-structure/CONTEXT.md` are the specification (section 12).

## 6. Interfaces

### 6.1 The vocabulary, fixed by the names page

| The sentence is about                                                         | Write                  |
| ----------------------------------------------------------------------------- | ---------------------- |
| Running, building, testing, deploying, environments, workers, the coordinator | Twilight Dash          |
| Discovery, grilling, assumptions, specification or planning with a person     | Twilight Navigator     |
| Rules, templates, validity of evidence, coverage judgments, the wiki ledger   | Twilight Burokrat      |
| What a customer buys or is billed for                                         | Vesper Shipyards       |
| All the tools together                                                        | Twilight Structure     |
| The company                                                                   | Prosperous Unification |

### 6.2 The splitting rule for the removed verifier tool

The separately planned verifier tool is removed. Two rules decide where each of its references goes, and nothing else does.

- **Rule D.** A command that compiles, scales, runs or executes belongs to the planned Twilight Dash command-line project.
- **Rule B.** A command that verifies, checks scenarios or checks knowledge belongs to Twilight Burokrat, the existing Nx project `twilight-burokrat` at `apps/wiki/cli`.

**Proposal, recorded as an assumption:** the Twilight Dash command-line project is `apps/twilight-dash/cli`, Nx project `twilight-dash-cli`, product tag `product:twilight-dash`. This follows the rename plan's unit table, where the product directory carries the full name, and the repository's `<product>-<leaf>` project naming. No such project is created by this packet; only proposed design text names it.

### 6.3 Planned unit names, from the rename plan's table

| Old text                   | New text                                     | Decided by                   |
| -------------------------- | -------------------------------------------- | ---------------------------- |
| `libs/twilight-contracts`  | `libs/twilight/domain/contracts`             | Rename plan unit table       |
| `libs/twilight-domain`     | `libs/twilight-dash/domain/domain`           | Rename plan unit table       |
| `libs/twilight-runtime`    | `libs/twilight-dash/adapters/runtime`        | Rename plan unit table       |
| `libs/twilight-assistant`  | `libs/twilight-navigator/adapters/assistant` | Rename plan unit table       |
| `apps/twilight-be`         | `apps/twilight-dash/be`                      | Rename plan unit table       |
| `apps/twilight-fe`         | `apps/twilight-dash/fe`                      | Rename plan unit table       |
| `apps/twilight-mcp`        | `apps/twilight-dash/mcp`                     | Rename plan unit table       |
| `apps/twilight-worker`     | `apps/twilight-dash/worker`                  | Rename plan unit table       |
| `nx test twilight-runtime` | `nx test twilight-dash-runtime`              | `<product>-<leaf>` Nx naming |

The Nx project name of `libs/twilight/domain/contracts` is `twilight-contracts` under the same rule, so that selector's spelling does not change even though the path does. Every sub-path moves with its unit: `libs/twilight-runtime/src/workflow/compile.ts` becomes `libs/twilight-dash/adapters/runtime/src/workflow/compile.ts`.

### 6.4 Every reference to the removed verifier tool

Enumerated with `git grep -n "tool-twilight"` over the ownership list. Every row must be applied; no row may be left as an old name.

| Old text                                                                                                  | New text                                                                                                                                      | Rule |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `tools/tool-twilight/project.json` (tasks.md:84)                                                          | `apps/twilight-dash/cli/project.json` for the Dash half; the Burokrat half needs none, `apps/wiki/cli/project.json` exists                    | D+B  |
| `tools/tool-twilight/src/compile.ts` (tasks.md:84)                                                        | `apps/twilight-dash/cli/src/compile.ts`                                                                                                       | D    |
| `tools/tool-twilight/src/validate-scenarios.ts` (tasks.md:85)                                             | `apps/wiki/cli/src/scenarios/validate-scenarios.ts`                                                                                           | B    |
| `tools/tool-twilight/src/validate-scenarios.test.ts` (tasks.md:86)                                        | `apps/wiki/cli/src/scenarios/validate-scenarios.test.ts`                                                                                      | B    |
| `tool-twilight:scenario-check` Nx target (tasks.md:87, 197, 198)                                          | `twilight-burokrat:scenario-check`                                                                                                            | B    |
| `tools/tool-twilight/src/testing/fixture-registry.ts` (tasks.md:90)                                       | `libs/twilight/domain/contracts/testing/fixture-registry.ts`                                                                                  | 6.5  |
| `bunx nx run tool-twilight:compile` (tasks.md:195)                                                        | `bunx nx run twilight-dash-cli:compile`                                                                                                       | D    |
| `bunx nx test twilight-runtime` (tasks.md:198)                                                            | `bunx nx test twilight-dash-runtime`                                                                                                          | 6.3  |
| `tools/tool-twilight/src/repository.test.ts` (tasks.md:221)                                               | `apps/twilight-dash/cli/src/repository.test.ts`                                                                                               | D    |
| `tools/tool-twilight/fixtures/client-minimal/` (tasks.md:222, 995)                                        | `apps/twilight-dash/cli/fixtures/client-minimal/`                                                                                             | D    |
| `tools/tool-twilight/src/k3s-preflight.ts`, `k3s-preflight.test.ts` (tasks.md:705)                        | `apps/twilight-dash/cli/src/k3s-preflight.ts`, `k3s-preflight.test.ts`                                                                        | D    |
| `tools/tool-twilight/src/template.ts` (tasks.md:994)                                                      | `apps/twilight-dash/cli/src/template.ts`                                                                                                      | D    |
| `tools/tool-twilight/src/scaling.ts`, `scaling.test.ts`, `fixtures/scaling/` (tasks.md:1071)              | `apps/twilight-dash/cli/src/scaling.ts`, `scaling.test.ts`, `fixtures/scaling/`                                                               | D    |
| `tool-twilight:scaling` Nx target (tasks.md:1073)                                                         | `twilight-dash-cli:scaling`                                                                                                                   | D    |
| `tool-twilight:verify-knowledge` (tasks.md:1326)                                                          | `twilight-burokrat:verify-knowledge`                                                                                                          | B    |
| `deploy/twilight/k3s/` (tasks.md:706)                                                                     | `deploy/twilight-dash/k3s/`                                                                                                                   | 6.5  |
| `docs/runbook-twilight-worker-pool.md` (tasks.md:707)                                                     | `docs/runbook-twilight-dash-worker-pool.md`                                                                                                   | 6.5  |
| `` `tools/tool-twilight` `` unit-table row (design.md:67)                                                 | Replaced by the exact row of section 6.6                                                                                                      | D+B  |
| "The first `tool-twilight` increment should check local links, required source …" (knowledge.md:114)      | "The first `twilight-burokrat` increment should check …"                                                                                      | B    |
| "The custom `tool-twilight` compiler/verifier fills identified gaps …" (sdlc-stages.md:128)               | Two sentences: compilation and inspection are Twilight Dash's command line, and content, coverage and citation checks are Twilight Burokrat's | D+B  |
| "a future `tool-twilight` compiler and BE transition operation will …" (twilight-sdlc-pilot/design.md:19) | "a future Twilight Dash compiler and BE transition operation will …"                                                                          | D    |
| "`tool-twilight` verifier enforces it" (twilight-sdlc-pilot/specs/twilight/sdlc/spec.md:36)               | "Twilight Burokrat enforces it"                                                                                                               | B    |

The two `bunx nx` rows above are **text inside `openspec/changes/twilight-control-plane/tasks.md`**, not commands the executor runs. They carry no `NX_DAEMON=false` because they describe a future target in a proposed change, and adding an environment prefix would change what that document proposes. Every command this packet asks the executor to run carries the prefix.

`k3s-preflight` is rule D: `openspec/changes/twilight-control-plane/tasks.md:738` says it validates a live cluster, which takes time and needs credentials. `template.ts` is rule D because the names page states that Twilight Dash instantiates a template and Twilight Burokrat verifies the output.

### 6.5 The four references the rules did not decide, settled by assumption

Dany asked on 2026-09-19 that open points be settled by a recorded assumption rather than a question. These four are settled here and in [ASSUMPTIONS.md](ASSUMPTIONS.md). **None is a stop condition.**

| Reference                                                                              | Decision                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/tool-twilight/src/testing/fixture-registry.ts` (tasks.md:90)                    | Becomes `libs/twilight/domain/contracts/testing/fixture-registry.ts`. Both tools import the shared contracts library, so shared test fixtures live with it. |
| `openspec/schemas/twilight-v1/schema.yaml:116`, "until tool-twilight enforces handoff" | Left untouched. It is a shipped schema artifact outside this packet's ownership list. Report it as a follow-up for the task that next edits the schema.     |
| `deploy/twilight/k3s/` (tasks.md:706)                                                  | Becomes `deploy/twilight-dash/k3s/`. Deployment of the worker pool is execution, which is Twilight Dash's.                                                  |
| `docs/runbook-twilight-worker-pool.md` (tasks.md:707)                                  | Becomes `docs/runbook-twilight-dash-worker-pool.md`, for the same reason.                                                                                   |

### 6.6 The exact replacement for the control-plane unit table

The table at `openspec/changes/twilight-control-plane/design.md` lines 57 to 67 is a Unit and Responsibility table. **Rename only the Unit cells, using section 6.3, and preserve each responsibility text byte for byte.** Delete the verifier tool's row at line 67 and put this row in its place:

```md
| `apps/twilight-dash/cli` | Twilight Dash's Nx-driven compile, inspect and scaling operations; verification is `twilight-burokrat`'s |
```

The column widths are reflowed by Prettier in checkpoint A's format step, so the executor need not align them by hand. The prose at line 77, "boundaries in `twilight-runtime`, not services", takes section 6.3's new unit name.

### 6.7 Classifying a line in the SDLC pilot

A line states **current or future intent** when it says what will or should happen, or names a future unit: `design.md:19` and `specs/twilight/sdlc/spec.md:36` are the two clear cases. A line is an **execution record** when it is a ticked `[x]` task row, or reports something observed during the pilot: `design.md:57` and `design.md:58` describe the checkout as it was. Records are left verbatim. A line that is neither is a stop condition.

### 6.8 Identities that keep their spelling

Preserved historical or stored identities, not unimplemented planned paths. They match the pattern and must survive every audit unchanged. None of them matches the identifier pattern, so the audit guard needs no exemption for them.

- The change identifiers `twilight-control-plane`, `twilight-review-hardening`, `twilight-sdlc-pilot`, `twilight-burokrat-package`, `twilight-burokrat-consumer`, and every path and link containing them.
- The workflow schema identifier `twilight-v1` and the directory `openspec/schemas/twilight-v1/`.
- The documentation directory `docs/twilight-structure/`.
- The Nx project `twilight-burokrat`, the package name `twilight-burokrat` and the tag `product:twilight-burokrat`.
- The delta-spec capability directories `specs/twilight/<capability>/`.
- The CI gate identities `registered:repository-gate`, `registered:browser-gate` and `registered:scenario-coverage`.

## 7. Interfaces other tasks rely on

None. This packet produces no symbol, target, command or file that another packet imports. Its only outward effect is section 6's mapping, which packet 110.8 needs when the Twilight Dash facade is designed.

## 8. Steps

The executor does exactly the slice it is given, then stops. Step 0 runs once, at the start of the first slice. Checkpoints A to D each end with a hand-over.

### Step 0 — The run directory and the baseline

Everything this packet writes outside the clone lives under `$TMPDIR`, which the launcher sets uniquely per attempt. No fixed path anywhere else.

- [ ] Create the run directory and its subdirectories.

```sh
set -euo pipefail
run="$TMPDIR/110-5"
mkdir -p "$run/baseline" "$run/evidence" "$run/bin"
echo "$run"
```

Expected: exit 0, and the path printed starts with the attempt's `TMPDIR`.

- [ ] Write the ownership list. It is the 31 paths of section 5.1, one per line, in checkpoint order.

```sh
set -euo pipefail
run="$TMPDIR/110-5"
cat > "$run/baseline/owned-a.txt" <<'PATHS'
openspec/changes/twilight-control-plane/proposal.md
openspec/changes/twilight-control-plane/design.md
openspec/changes/twilight-control-plane/tasks.md
openspec/changes/twilight-control-plane/specs/twilight/assistant-interaction/spec.md
openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md
openspec/changes/twilight-control-plane/specs/twilight/delivery-environments/spec.md
openspec/changes/twilight-control-plane/specs/twilight/repository-planning/spec.md
PATHS
cat > "$run/baseline/owned-b.txt" <<'PATHS'
docs/twilight-structure/spec.md
docs/twilight-structure/sdlc-stages.md
docs/twilight-structure/product-experience.md
docs/twilight-structure/client-repositories.md
docs/twilight-structure/knowledge.md
docs/twilight-structure/assumptions.md
docs/wiki/README.md
PATHS
cat > "$run/baseline/owned-c.txt" <<'PATHS'
openspec/changes/twilight-review-hardening/proposal.md
openspec/changes/twilight-review-hardening/design.md
openspec/changes/twilight-review-hardening/tasks.md
openspec/changes/twilight-review-hardening/specs/twilight/workflow-maintenance/spec.md
openspec/changes/twilight-sdlc-pilot/proposal.md
openspec/changes/twilight-sdlc-pilot/design.md
openspec/changes/twilight-sdlc-pilot/tasks.md
openspec/changes/twilight-sdlc-pilot/specs/twilight/knowledge/spec.md
openspec/changes/twilight-sdlc-pilot/specs/twilight/sdlc/spec.md
PATHS
cat > "$run/baseline/owned-d.txt" <<'PATHS'
docs/adr/0027-planning-commits-are-the-transaction-boundary.md
docs/adr/0028-k3s-schedules-the-expandable-worker-pool.md
docs/superpowers/specs/2026-09-17-twilight-burokrat-and-fleet-design.md
docs/superpowers/plans/2026-09-17-twilight-burokrat-and-fleet.md
docs/superpowers/plans/2026-09-17-k3s-fleet.md
docs/infra/README.md
docs/twilight-structure/README.md
docs/superpowers/plans/2026-09-19-twilight-rename.md
PATHS
cat "$run/baseline/owned-"{a,b,c,d}.txt > "$run/baseline/owned.txt"
for slice in a b c d; do
  grep -v '^docs/superpowers/plans/2026-09-19-twilight-rename.md$' \
    "$run/baseline/owned-$slice.txt" > "$run/baseline/audit-$slice.txt" || test $? -eq 1
done
cat "$run/baseline/audit-"{a,b,c,d}.txt > "$run/baseline/audit.txt"
test "$(wc -l < "$run/baseline/owned.txt")" -eq 31
test "$(wc -l < "$run/baseline/audit.txt")" -eq 30
while IFS= read -r path; do test -f "$path" || { echo "missing: $path"; exit 1; }; done < "$run/baseline/owned.txt"
```

Expected: exit 0 and no output. Any missing path means the ownership list no longer matches the repository: stop and report.

- [ ] Write the two guard scripts. They take the work tree as a parameter, so the negative proofs of section 9 exercise the same code the checkpoints run.

```sh
set -euo pipefail
run="$TMPDIR/110-5"
cat > "$run/bin/history-guard.sh" <<'GUARD'
#!/usr/bin/env bash
# One sha256 line per protected historical file, sorted. $1 is a work tree, $2 a pathspec file.
set -euo pipefail
root=${1:?work tree required}
specs=${2:?pathspec file required}
cd "$root"
mapfile -t pathspecs < "$specs"
git ls-files --cached --others --exclude-standard -z -- "${pathspecs[@]}" |
  sort -z -u | xargs -0 -r sha256sum | sort
GUARD
cat > "$run/bin/audit.sh" <<'AUD'
#!/usr/bin/env bash
# Fails when a planned identifier of the removed verifier tool survives in an audited file.
set -euo pipefail
root=${1:?work tree required}
list=${2:?audit-path file required}
cd "$root"
mapfile -t files < "$list"
leftovers=$(git grep -n -E "tool-twilight|twilight-(be|fe|mcp|worker|contracts|domain|runtime|assistant)\b" -- "${files[@]}") || {
  status=$?
  test "$status" -eq 1 || { echo "git grep failed with $status" >&2; exit "$status"; }
  echo "audit clean: 0 planned identifiers in ${#files[@]} files"
  exit 0
}
echo "unmapped planned identifiers remain:" >&2
printf '%s\n' "$leftovers" >&2
exit 1
AUD
printf '%s\n' \
  docs/twilight-structure/evidence \
  docs/twilight-structure/research \
  openspec/changes/archive \
  openspec/changes/twilight-review-hardening/evidence \
  openspec/changes/measured-rendering/evidence \
  '*verify.md' > "$run/baseline/protected-pathspecs.txt"
chmod +x "$run/bin/history-guard.sh" "$run/bin/audit.sh"
```

Expected: exit 0, no output. The `sort -z -u` matters: an archived change's `verify.md` is matched by two pathspecs and would otherwise be hashed twice.

- [ ] Record the baseline. **This runs before the first edit and is never regenerated afterwards**, because a manifest taken from an edited tree would launder an edit.

```sh
set -euo pipefail
run="$TMPDIR/110-5"
bash "$run/bin/history-guard.sh" "$PWD" "$run/baseline/protected-pathspecs.txt" > "$run/baseline/history.sha256"
wc -l < "$run/baseline/history.sha256" | tee "$run/baseline/history-count.txt"
awk '/^\| ID  /{f=1} f{print} f&&/^$/{exit}' docs/twilight-structure/spec.md |
  tee "$run/baseline/requirement-table.md" | sha256sum | tee "$run/baseline/requirement-table.sha256"
wc -l < "$run/baseline/requirement-table.md"
cp docs/superpowers/plans/2026-09-19-twilight-rename.md "$run/baseline/twilight-rename.md"
git status --porcelain > "$run/baseline/worktree-status.txt"
wc -l < "$run/baseline/worktree-status.txt"
audit_status=0
bash "$run/bin/audit.sh" "$PWD" "$run/baseline/audit.txt" > "$run/baseline/audit-before.txt" 2>&1 || audit_status=$?
test "$audit_status" -eq 1
wc -l < "$run/baseline/audit-before.txt"
```

Expected: exit 0. Record every number printed. Reference points from 2026-09-19 at `1eeacb0b`: the protected manifest held **922** files after deduplication, the requirement table was **40** lines with digest `206cd3cec5be2a93b6c9a25ad2944372e8a5d28e1d7f10daa70756876ce46e0b`, and the audit failed with **97** offending lines. The counts will differ once earlier packets in the execution order have merged; that is expected, and the executor's own numbers are the ones that matter. `test "$audit_status" -eq 1` is the required failure of the audit before any edit: the guard is watched failing on the production read path here, before any fault is invented, and if it already passes the work is already done and that is a stop condition. The `|| audit_status=$?` captures the status explicitly; it is not `|| true` and it masks nothing.

- [ ] Record the work list and the validator totals.

```sh
set -euo pipefail
run="$TMPDIR/110-5"
mapfile -t owned < "$run/baseline/owned.txt"
git grep -n -E "Twilight Structure|\bTwilight\b|tool-twilight|twilight-(be|fe|mcp|worker|contracts|domain|runtime|assistant)\b" \
  -- "${owned[@]}" > "$run/baseline/hits.txt" || test $? -eq 1
wc -l < "$run/baseline/hits.txt"
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json > "$run/baseline/openspec.json"
jq '.summary.totals' "$run/baseline/openspec.json" | tee "$run/baseline/openspec-totals.json"
```

Expected: exit 0. Reference point from 2026-09-19: **249** hit lines and totals `{ "items": 95, "passed": 95, "failed": 0 }`. The executor records its own.

`OPENSPEC_TELEMETRY=0` is mandatory on every OpenSpec invocation: 1.12.0 otherwise posts telemetry and checks the registry for updates, and this attempt has no network. The launcher warms the command into this attempt's temporary root before dispatch, and `bunx` keys its install directory by `TMPDIR`, so the command resolves offline. **If the command tries to download anything, stop and report**; never install it by hand and never treat a fetch failure as a pass.

### Reloading the run directory in a later slice

A later slice starts in a fresh shell, and the launcher creates a new `$TMPDIR` on every invocation, including `--resume`, so `$TMPDIR/110-5` does not exist yet at the start of B, C or D. Before dispatching B, C or D, the planner supplies the absolute path to the preserved checkpoint-A `110-5` run directory — the launcher currently archives only `$TMPDIR/evidence`, so the planner must preserve the complete run directory after A. Copy that directory into this attempt's `$TMPDIR/110-5` before editing, and verify that its baseline files and guard scripts exist. **Never regenerate the original baseline**: a manifest taken from a tree that has already been edited would launder the very edit it should have caught.

```sh
set -euo pipefail
preserved=${PRESERVED_RUN_DIR:?planner-supplied path to the preserved checkpoint-A 110-5 run directory required}
test -d "$preserved"
cp -a "$preserved" "$TMPDIR/110-5"
run="$TMPDIR/110-5"
test -f "$run/baseline/history.sha256"
test -f "$run/baseline/owned.txt"
test -f "$run/baseline/requirement-table.sha256"
test -x "$run/bin/history-guard.sh"
test -x "$run/bin/audit.sh"
```

Expected: exit 0, every test passing. If `$PRESERVED_RUN_DIR` is unset, the preserved directory is unavailable, or any of these files is missing, stop: report it and ask the planner for the preserved run directory rather than reconstructing the baseline from the current tree.

### Checkpoint A — The control-plane change

- [ ] **A1.** In `openspec/changes/twilight-control-plane/design.md`, apply section 6.6 to the unit table: rename only the Unit cells from section 6.3, preserve every responsibility text, delete the verifier row and insert the given replacement row. Apply section 6.3 to the prose at line 77.
- [ ] **A2.** In the same file, name the runtime Twilight Dash in the boundary diagram and prose, the planning port's owner Twilight Navigator, and the knowledge and verification operations Twilight Burokrat, using section 6.1.
- [ ] **A3.** In the same file, add one paragraph recording the lease migration as an open design item: admission verdicts stay with Twilight Burokrat; lease acquisition, heartbeat and fencing move to Twilight Dash.
- [ ] **A4.** In `openspec/changes/twilight-control-plane/tasks.md`, apply section 6.3 and section 6.4 to the identifier lines and section 6.1 to the prose lines. Leave task identifiers, checkbox states and evidence links exactly as they are.
- [ ] **A5.** In `openspec/changes/twilight-control-plane/proposal.md` and the four delta specs, apply section 6.1, and add the owning tool to each delta spec's purpose or first paragraph: assistant interaction and repository planning are Twilight Navigator's; control plane and delivery environments are Twilight Dash's.
- [ ] **A6.** Run checkpoint A's completion checklist below.

**Checkpoint A completion checklist**

- [ ] `bash "$TMPDIR/110-5/bin/audit.sh" "$PWD" "$TMPDIR/110-5/baseline/audit-a.txt"` → expect exit 0 and `audit clean: 0 planned identifiers in 7 files`.
- [ ] The history comparison of section 10.2 → expect exit 0 and no `diff` output.
- [ ] The link and anchor checks of section 10.3 over the seven files → expect every file to report resolved links, with no failure line.
- [ ] `bunx prettier --write` over the seven files, then `NX_DAEMON=false bunx nx format:check --all` → expect exit 0.
- [ ] The OpenSpec block of section 10.4 → expect exit 0 and totals equal to step 0's.
- [ ] Hand over as section 10.6 says, with the subject `docs(twilight): name the owning tool in the control-plane change`. Then stop.

### Checkpoint B — The current Twilight documents

- [ ] **B1.** In `docs/twilight-structure/spec.md`, apply section 6.1 to the Intent prose and add one dated paragraph under Intent mapping the catalogue to the new names. **Keep every requirement row byte-identical**; the digest recorded in step 0 proves it.
- [ ] **B2.** In `docs/twilight-structure/sdlc-stages.md`, replace the closing section's separate compiler and verifier tool with the two sentences of section 6.4, and add the stage ownership sentence: request through planning are Twilight Navigator's, implementation through release are Twilight Dash's, and every stage gate is Twilight Burokrat's.
- [ ] **B3.** In `docs/twilight-structure/knowledge.md`, apply the line 114 row of section 6.4 and section 6.1 to the rest.
- [ ] **B4.** In `docs/twilight-structure/assumptions.md` row A38, `libs/twilight-contracts` becomes `libs/twilight/domain/contracts`; apply section 6.1 to the rest.
- [ ] **B5.** Apply section 6.1 to `docs/twilight-structure/product-experience.md`, `docs/twilight-structure/client-repositories.md` and `docs/wiki/README.md`.
- [ ] **B6.** Run checkpoint B's completion checklist.

**Checkpoint B completion checklist**

- [ ] `bash "$TMPDIR/110-5/bin/audit.sh" "$PWD" "$TMPDIR/110-5/baseline/audit-b.txt"` → expect exit 0 and `audit clean: 0 planned identifiers in 7 files`.
- [ ] The requirement-table digest of section 10.2 → expect the digest recorded in step 0.
- [ ] The history comparison of section 10.2 → expect exit 0 and no output.
- [ ] The link and anchor checks of section 10.3 over the seven files.
- [ ] **The two named devsync tests of section 10.1**, which cover these seven files → expect `1 pass`, `0 fail` each. A failure naming a file this checkpoint edited is a stop condition.
- [ ] Prettier over the seven files, then `NX_DAEMON=false bunx nx format:check --all` → expect exit 0.
- [ ] Hand over with the subject `docs(twilight): reword the current Twilight documents to the 2026-09-19 names`. Then stop.

### Checkpoint C — Review hardening and the SDLC pilot

- [ ] **C1.** Apply section 6.1 to `openspec/changes/twilight-review-hardening/proposal.md`, `design.md`, `tasks.md` and `specs/twilight/workflow-maintenance/spec.md`. Its `verify.md` and its `evidence/` directory are protected and must not be opened for writing.
- [ ] **C2.** Apply `design.md:19` and `specs/twilight/sdlc/spec.md:36` of section 6.4 to the SDLC pilot, and section 6.1 to `proposal.md` and `specs/twilight/knowledge/spec.md`.
- [ ] **C3.** In the SDLC pilot, classify every remaining line with section 6.7. Leave `design.md:57`, `design.md:58` and every ticked `[x]` row verbatim.
- [ ] **C4.** Run checkpoint C's completion checklist.

**Checkpoint C completion checklist**

- [ ] `bash "$TMPDIR/110-5/bin/audit.sh" "$PWD" "$TMPDIR/110-5/baseline/audit-c.txt"` → expect exit 0 and `audit clean: 0 planned identifiers in 9 files`.
- [ ] The history comparison of section 10.2 → expect exit 0 and no output. This is the checkpoint that could touch `twilight-review-hardening/evidence/`, so record the result explicitly.
- [ ] The link and anchor checks of section 10.3 over the nine files.
- [ ] Prettier over the nine files, then `NX_DAEMON=false bunx nx format:check --all` → expect exit 0.
- [ ] The OpenSpec block of section 10.4 → expect totals equal to step 0's.
- [ ] Hand over with the subject `docs(twilight): reword the review-hardening and SDLC pilot changes`. Then stop.

### Checkpoint D — Decisions, fleet documents, the README and the plan

Run this only after A, B and C have been reviewed and committed.

- [ ] **D1.** ADR 0027 and ADR 0028 keep every existing line. Add exactly one dated line under each status: for ADR 0027, that the planning contract it records is Twilight Navigator's, dated 2026-09-19; for ADR 0028, that the worker pool it records is Twilight Dash's, dated 2026-09-19. **Do not reword either ADR's prose.**
- [ ] **D2.** In `docs/superpowers/specs/2026-09-17-twilight-burokrat-and-fleet-design.md`, `docs/superpowers/plans/2026-09-17-twilight-burokrat-and-fleet.md`, `docs/superpowers/plans/2026-09-17-k3s-fleet.md` and `docs/infra/README.md`, state once near the top that the fleet and its delivery tooling are Twilight Dash's. Leave task identifiers, evidence links and every `## F<n> — …` heading unchanged: thirteen of those headings are anchor targets from the three k3s changes.
- [ ] **D3.** Replace the whole reading note at the top of `docs/twilight-structure/README.md` with exactly this text. The link is `names.md`, relative to that file's own directory.

```md
**Naming changed on 2026-09-19.** Twilight Structure now names the tool suite: Twilight
Navigator plans, Twilight Dash executes and Twilight Burokrat holds the rules. The
customer-facing product has the code name Vesper Shipyards. Read
[names and boundaries](names.md) first. The documents indexed below use these names in
that meaning. Historical evidence, research notes and verification records keep their
original wording, in which a bare "Twilight" means Twilight Dash.
```

- [ ] **D4.** In `docs/superpowers/plans/2026-09-19-twilight-rename.md`, for Task 2, 3 and 4: tick the task's own checkbox and append the date 2026-09-20 to that same checkbox line. Date only a checkbox line the executor is actually ticking — never a separate non-checkbox Deliverable line, since checkpoint D5's guard requires every changed line to carry a checkbox. Leave any verification checkbox for a check still pending unchecked. Change nothing else in that file.
- [ ] **D5.** Run the negative proofs of section 9, then checkpoint D's completion checklist.

**Checkpoint D completion checklist**

- [ ] `bash "$TMPDIR/110-5/bin/audit.sh" "$PWD" "$TMPDIR/110-5/baseline/audit.txt"` → expect exit 0 and `audit clean: 0 planned identifiers in 30 files`. This is the whole audit list, so it also re-proves A, B and C.
- [ ] Prove the rename plan changed only its checkboxes:

```sh
set -euo pipefail
run="$TMPDIR/110-5"
set +e
diff -u "$run/baseline/twilight-rename.md" docs/superpowers/plans/2026-09-19-twilight-rename.md \
  > "$run/evidence/rename-plan.diff"
status=$?
set -e
test "$status" -le 1
grep -c -E '^[+-]' "$run/evidence/rename-plan.diff"
grep -E '^[+-]' "$run/evidence/rename-plan.diff" | grep -v -E '^(\+\+\+|---)' | grep -v -E '^[+-].*\[[ x]\]' || test $? -eq 1
```

Expected: the last command prints nothing and the pipeline exits 0. Every changed line must contain a checkbox; a changed line without one means something else in the file moved, which is a stop condition. Deliverable dates are added on the same line as their task's last checkbox, or the executor adds them as a checkbox-bearing line.

- [ ] The history comparison and the requirement-table digest of section 10.2.
- [ ] The link and anchor checks of section 10.3 over the eight files, **plus** the protected-slug check of section 10.3, which is the whole point of this checkpoint: the README's rewritten note sits above headings that 55 inbound links target.
- [ ] The two named devsync tests of section 10.1 → expect `1 pass`, `0 fail` each.
- [ ] Prettier over the eight files, then `NX_DAEMON=false bunx nx format:check --all` → expect exit 0.
- [ ] The OpenSpec block of section 10.4 → expect totals equal to step 0's.
- [ ] The completion-gate statement of section 10.5.
- [ ] Hand over with the subject `docs(twilight): record tool ownership in the decisions, fleet documents and plans`. Then stop.

## 9. Negative proofs

Two guards protect this packet's work. Each is proved by injecting a fault into the exact input the guard reads, so a passing guard means something. Both run in checkpoint D, after the audit is clean, so the "before" and "after" states are both green.

**Restore discipline for both.** Save the passing bytes under `$TMPDIR/evidence/110-5`, write the mutation as a patch there, and save the failing output beside it. **Immediately after capturing the failure statuses**, restore by copying the passing bytes back and prove the restore with `cmp`, **before** asserting either captured status or inspecting the diagnostic output. Never restore from Git. Run the expected failure in a subshell with the status captured, so `set -e` cannot skip the restore. Scripts and baseline inputs stay under `$TMPDIR/110-5`; only the proof evidence — passing copies, patches, manifests and failing output — goes under `$TMPDIR/evidence/110-5`.

### Proof 1 — the audit guard fails on a surviving identifier

The fault goes into a real, owned, tracked file that the guard reads. `openspec/changes/twilight-control-plane/design.md` is on `audit-a.txt` and is this packet's own lane, so mutating it breaks nobody else's work.

```sh
set -euo pipefail
run="$TMPDIR/110-5"
evidence="$TMPDIR/evidence/110-5"
mkdir -p "$evidence"
target=openspec/changes/twilight-control-plane/design.md
cp "$target" "$evidence/proof1.passing"
printf '\nThe runtime library is `libs/twilight-runtime`.\n' >> "$target"
set +e
diff -u "$evidence/proof1.passing" "$target" > "$evidence/proof1.patch"; d=$?
bash "$run/bin/audit.sh" "$PWD" "$run/baseline/audit-a.txt" > "$evidence/proof1.failing-output" 2>&1; s=$?
set -e
cp "$evidence/proof1.passing" "$target"
cmp "$evidence/proof1.passing" "$target"
test "$d" -eq 1
test "$s" -eq 1
grep -n 'libs/twilight-runtime' "$evidence/proof1.failing-output"
bash "$run/bin/audit.sh" "$PWD" "$run/baseline/audit-a.txt"
```

Expected, in order: the patch is written and the guard's failing output is captured; the restore, performed immediately afterward, compares equal; only then does the block assert that `diff` reported a difference and the guard exited **1**, and that its saved output contains a line ending `design.md:<n>:The runtime library is \`libs/twilight-runtime\`.`; the guard then prints `audit clean: 0 planned identifiers in 7 files` and exits 0 on the restored tree. Record the exact failing line.

Corroboration, already collected: `$run/baseline/audit-before.txt` is the same guard failing on the unedited tree, with 97 lines on 2026-09-19. Step 0 asserts that failure, so the guard is known to fail on the production read path before any fault is invented.

### Proof 2 — the history guard fails on a changed protected file

The protected files are outside every lane in this packet, so the fault goes into a disposable Git fixture under `$TMPDIR` instead. The fixture runs **the same script** with a different work tree and pathspec file, which is why the proof transfers. Git inside a fixture repository under the attempt's temporary root is allowed by the batch's execution contract.

```sh
set -euo pipefail
run="$TMPDIR/110-5"
evidence="$TMPDIR/evidence/110-5"
mkdir -p "$evidence"
fixture="$run/history-fixture"
rm -rf "$fixture"
mkdir -p "$fixture/docs/twilight-structure/evidence" "$fixture/openspec/changes/x"
( cd "$fixture" && git init -q && git config user.email executor@example.invalid && git config user.name executor )
printf 'observed 2026-09-06\n' > "$fixture/docs/twilight-structure/evidence/note.md"
printf '# verify\n' > "$fixture/openspec/changes/x/verify.md"
printf '%s\n' docs/twilight-structure/evidence '*verify.md' > "$evidence/fixture-pathspecs.txt"
bash "$run/bin/history-guard.sh" "$fixture" "$evidence/fixture-pathspecs.txt" > "$evidence/proof2.before"
test "$(wc -l < "$evidence/proof2.before")" -eq 2
cp "$fixture/docs/twilight-structure/evidence/note.md" "$evidence/proof2.passing"
printf 'edited\n' >> "$fixture/docs/twilight-structure/evidence/note.md"
set +e
diff -u "$evidence/proof2.passing" "$fixture/docs/twilight-structure/evidence/note.md" > "$evidence/proof2.patch"; d=$?
bash "$run/bin/history-guard.sh" "$fixture" "$evidence/fixture-pathspecs.txt" > "$evidence/proof2.after"
diff -u "$evidence/proof2.before" "$evidence/proof2.after" > "$evidence/proof2.failing-output"; s=$?
set -e
cp "$evidence/proof2.passing" "$fixture/docs/twilight-structure/evidence/note.md"
cmp "$evidence/proof2.passing" "$fixture/docs/twilight-structure/evidence/note.md"
test "$d" -eq 1
test "$s" -eq 1
grep -n 'evidence/note.md' "$evidence/proof2.failing-output"
bash "$run/bin/history-guard.sh" "$fixture" "$evidence/fixture-pathspecs.txt" > "$evidence/proof2.restored"
diff -u "$evidence/proof2.before" "$evidence/proof2.restored"
```

Expected, in order: the fixture manifest has **2** lines; the comparison after the mutation is captured; the restore, performed immediately afterward, compares equal; only then does the block assert that the captured comparison exited **1** and named `docs/twilight-structure/evidence/note.md` on both a `-` and a `+` line; the final comparison against the restored tree exits 0 with no output. The planner was able to run this exact sequence on 2026-09-20 and saw those results.

No `Proof:` comment is added anywhere, because this packet changes no source file. The evidence is `$TMPDIR/evidence/110-5`, which the planner copies out of the temporary root.

## 10. Verification

Executor and planner run different things. Every planner-only check is named here and reported as **pending planner verification**.

### 10.1 The document test, split

- [ ] The executor runs the two filesystem-only checks by name. Both read the tree through `git ls-files` only.

```sh
set -euo pipefail
for name in \
  'current Nx commands select existing qualified projects' \
  'every routed current document resolves its local links and anchors'
do
  echo "--- $name"
  bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "^${name}\$"
done
```

Expected: **each invocation prints exactly `1 pass`, `0 fail` and `12 filtered out`**, and exits 0. Both passed on 2026-09-20 before this packet ran.

**A run that matched zero tests is a failure, not a pass.** Bun reports success when its `-t` filter selects nothing, so read the counts, not the exit status: `0 pass` with `13 filtered out` means the title no longer matches and the check did not run. Stop and report that; do not treat it as green. The anchored form is correct only because this file has no `describe` (section 3.3); if a `describe` is ever added, the pattern must anchor the joined name instead.

A failure naming a file this packet edited is a stop condition; a failure naming only another packet's document is pre-existing, recorded verbatim, and not this packet's to fix.

- [ ] The executor does **not** run `NX_DAEMON=false bunx nx run tool-devsync:test`. Its `the production index checker resolves current Markdown links and anchors` case runs `check-indexes working`, which reaches `apps/wiki/cli/src/inventory/read-candidate.ts` and writes Git objects into this clone. Report the whole target as **pending planner verification**; the planner stages the owned paths and runs it. Do not edit, skip or work around that test.

### 10.2 History and the requirement table

```sh
set -euo pipefail
run="$TMPDIR/110-5"
bash "$run/bin/history-guard.sh" "$PWD" "$run/baseline/protected-pathspecs.txt" > "$run/evidence/history-now.sha256"
diff -u "$run/baseline/history.sha256" "$run/evidence/history-now.sha256"
awk '/^\| ID  /{f=1} f{print} f&&/^$/{exit}' docs/twilight-structure/spec.md | sha256sum
mapfile -t owned < "$run/baseline/owned.txt"
git status --porcelain -- "${owned[@]}" > "$run/evidence/owned-status.txt"
wc -l < "$run/evidence/owned-status.txt"
git status --porcelain > "$run/evidence/worktree-now.txt"
set +e
diff -u "$run/baseline/worktree-status.txt" "$run/evidence/worktree-now.txt" > "$run/evidence/worktree.diff"; s=$?
set -e
test "$s" -le 1
grep -E '^[+-][ MARCU?]{2}' "$run/evidence/worktree.diff" || test $? -eq 1
```

Expected: `diff -u` on the history manifest **exits 0 and prints nothing**, which is its defined contract for identical inputs, so no empty-output guess is needed. The requirement-table digest equals step 0's. The owned-status count is at most the number of files this checkpoint touched. The last command lists every working-tree entry that appeared or disappeared since step 0; every one must be an owned path, and `test $? -eq 1` accepts grep's no-match status while a status above 1 still fails the block. There is no `|| true` anywhere: a required check is never masked.

A difference in the history manifest is a stop condition. Report it and restore nothing: another lane may own the file.

### 10.3 Links and anchors, the part the document test does not cover

Write the checker once, in step 0's run directory:

```sh
set -euo pipefail
run="$TMPDIR/110-5"
cat > "$run/bin/link-check.sh" <<'LINK'
#!/usr/bin/env bash
# Resolves every inline local link of one Markdown file: destination existence and heading anchor.
set -euo pipefail
root=${1:?work tree required}
file=${2:?file required}
cd "$root"
dir=$(dirname "$file")
slugs() {
  sed -n 's/^#\{1,6\}[[:space:]]\+//p' "$1" |
    tr '[:upper:]' '[:lower:]' |
    sed -E 's/`//g; s/\[([^]]*)\]\([^)]*\)/\1/g; s/[^a-z0-9 _-]//g; s/ /-/g'
}
targets=$(grep -o -E '\]\([^)[:space:]]+\)' "$file" | sed -E 's/^\]\(//; s/\)$//') || {
  status=$?
  test "$status" -eq 1 || { echo "grep failed with $status on $file" >&2; exit "$status"; }
  echo "$file: 0 links"
  exit 0
}
checked=0
while IFS= read -r target; do
  case "$target" in http://*|https://*|mailto:*|'') continue ;; esac
  path=${target%%#*}
  case "$target" in *#*) frag=${target#*#} ;; *) frag='' ;; esac
  decoded=$(printf '%b' "${path//%/\\x}")
  if [ -z "$decoded" ]; then dest=$file; else dest=$(realpath -m --relative-to=. "$dir/$decoded"); fi
  test -e "$dest" || { echo "$file -> $target: missing destination $dest" >&2; exit 1; }
  if [ -n "$frag" ]; then
    case "$dest" in *.md) ;; *) echo "$file -> $target: fragment on a non-Markdown destination" >&2; exit 1 ;; esac
    want=$(printf '%b' "${frag//%/\\x}" | tr '[:upper:]' '[:lower:]')
    hits=$(slugs "$dest" | grep -c -x -F -- "$want") ||
      { echo "$file -> $target: no heading slug $want in $dest" >&2; exit 1; }
    test "$hits" -eq 1 ||
      { echo "$file -> $target: slug $want appears $hits times in $dest" >&2; exit 1; }
  fi
  checked=$((checked + 1))
done <<< "$targets"
echo "$file: $checked links resolved"
LINK
chmod +x "$run/bin/link-check.sh"
```

It handles every form found in these files: a bare relative path, a path with a fragment, a fragment alone resolved against the source document, percent-encoding, and a file with no links at all — `grep` exiting 1 means zero links and is reported as such, while any higher status fails. A duplicate heading slug fails rather than passing on the first match. No owned OpenSpec file uses reference-style links, so the checker does not parse them; if one appears, it is a stop condition.

- [ ] Run it over the checkpoint's files:

```sh
set -euo pipefail
run="$TMPDIR/110-5"
while IFS= read -r f; do bash "$run/bin/link-check.sh" "$PWD" "$f"; done < "$run/baseline/owned-<slice>.txt"
```

Expected: one line per file, either `<file>: 0 links` or `<file>: <n> links resolved`, and exit 0. Over all 31 files the planner measured **189 links, zero failures** on 2026-09-20; the counts may only go up as prose is reworded, never down through a broken link.

- [ ] **The protected-slug check**, run in checkpoint D. It proves that no heading this packet reworded was the target of an inbound anchor, including from evidence and research files this packet may not edit:

```sh
set -euo pipefail
run="$TMPDIR/110-5"
cat > "$run/bin/inbound-anchors.sh" <<'IN'
#!/usr/bin/env bash
# Every inline link in the repository whose destination is an owned file and carries a fragment.
set -euo pipefail
root=${1:?work tree required}
owned=${2:?owned-path file required}
cd "$root"
while IFS= read -r source; do
  dir=$(dirname "$source")
  targets=$(grep -o -E '\]\([^)[:space:]]*#[^)[:space:]]*\)' "$source" | sed -E 's/^\]\(//; s/\)$//') || {
    status=$?
    test "$status" -eq 1 || { echo "grep failed with $status on $source" >&2; exit "$status"; }
    continue
  }
  while IFS= read -r target; do
    case "$target" in http://*|https://*|mailto:*|'') continue ;; esac
    path=${target%%#*}; frag=${target#*#}
    if [ -z "$path" ]; then dest=$source; else dest=$(realpath -m --relative-to=. "$dir/$path"); fi
    if grep -q -x -F -- "$dest" "$owned"; then printf '%s|%s\n' "$dest" "$frag"; fi
  done <<< "$targets"
done < <(git ls-files '*.md')
IN
chmod +x "$run/bin/inbound-anchors.sh"
bash "$run/bin/inbound-anchors.sh" "$PWD" "$run/baseline/owned.txt" | sort -u > "$run/evidence/protected-slugs.txt"
wc -l < "$run/evidence/protected-slugs.txt"
failures=0
while IFS='|' read -r dest frag; do
  n=$(sed -n 's/^#\{1,6\}[[:space:]]\+//p' "$dest" | tr '[:upper:]' '[:lower:]' |
      sed -E 's/`//g; s/\[([^]]*)\]\([^)]*\)/\1/g; s/[^a-z0-9 _-]//g; s/ /-/g' |
      grep -c -x -F -- "$frag") || n=0
  test "$n" -eq 1 || { echo "UNRESOLVED $dest#$frag -> $n"; failures=$((failures + 1)); }
done < "$run/evidence/protected-slugs.txt"
echo "unresolved inbound anchors: $failures"
```

Expected: **55** pairs and exactly **one** unresolved, `openspec/changes/twilight-control-plane/tasks.md#milestones-and-ordering`, which was already broken on 2026-09-20 — its source is `.scratch/twilight-structure/issues/01-personal-delivery-acceptance.md` and the real heading is `## Technical milestones and ordering`. Record it and do not fix it: that source is out of lane. Any **other** unresolved pair means this packet re-slugged a heading somebody links to, which is a stop condition.

### 10.4 OpenSpec validation

The batch's standard block, which is the gate's exact contract from `bin/h2puni-gate-steps.sh`. A loose predicate is not acceptable: the gate's proof comment records it admitting `passed: "0"`, `passed: 1.5` and a failed report followed by a passing one.

```sh
set -euo pipefail
report=$(mktemp)
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
jq '.summary.totals' "$report"
rm -f -- "$report"
```

Expected: one JSON report, exit 0, and totals **equal to the ones step 0 recorded in `$TMPDIR/110-5/baseline/openspec-totals.json`**. This packet adds and removes no OpenSpec item, so any change in `items` means something outside this lane moved: record it and report. Do not expect a fixed 95; earlier packets in the execution order add four changes between them.

The block runs offline: `OPENSPEC_TELEMETRY=0` stops 1.12.0's telemetry post and its registry update check, and the launcher has already warmed the command into this attempt's `TMPDIR`. A download attempt, or any failure to resolve the command, is a stop condition, reported as "not run" rather than as a pass.

### 10.5 Completion gate, not run here

- [ ] Do **not** run `bin/h2puni-gate.sh`. The host gate cannot run in the executor's environment.
- [ ] Say in the report that the host gate was not run, and why. An unavailable required check is reported, never treated as passed. Do not tick any host-gate verification checkbox in the rename plan or anywhere else.

### 10.6 Hand over, do not commit

The executor's Git directory is read-only. There is nothing to stage and nothing to commit.

- [ ] `git status --short --untracked-files=all` → expect exactly this checkpoint's owned paths as modified, plus whatever other lanes already had in the tree, untouched. Record the list.
- [ ] Report under "Ready to commit" the checkpoint's file list and its subject line from section 8, with a body carrying step 0's recorded numbers, this checkpoint's guard results, and any negative proof observed.
- [ ] Do not run `git add`, `git commit`, `git checkout -b`, `git stash` or `git restore`. They fail here, and the planner commits after reviewing the diff.

### 10.7 What none of this proves

No command proves that each sentence names the right tool. That is a reading check by a reviewer with the names page open, and it is this packet's acceptance criterion. The guards only prove that no planned identifier survived, that nothing historical moved, and that no link or anchor broke.

## 11. Stop conditions

- A sentence could honestly name two tools and the names page does not decide it. Collect these and report them; do not guess.
- A reword would change what a requirement demands. That is a specification change and needs Dany.
- A reference needing a replacement is absent from sections 6.3, 6.4 and 6.5.
- A line in `openspec/changes/twilight-sdlc-pilot` cannot be classified by section 6.7.
- A heading this packet would reword is one of the 55 protected slugs of section 10.3, or the protected-slug check reports an unresolved pair other than the known `.scratch` one.
- An owned OpenSpec file turns out to use reference-style links.
- The history comparison of section 10.2 shows any difference, or the requirement-table digest changes.
- The audit guard already passes in step 0, which would mean the work is already done.
- Any diff line in the rename plan does not carry a checkbox.
- The OpenSpec `items` total differs from step 0's.
- You are about to edit a file that is not on the ownership list.
- Any command's result differs from the expected result and this packet does not say what to do.

Report as a follow-up, without acting on it: `docs/twilight-structure/names.md` still tells the reader that documents written before 2026-09-19 use the older meaning and that the rename plan brings them into line. Once this packet lands, that sentence describes only historical evidence. `names.md` is the specification and is out of lane; its owner decides whether to narrow it.

## 12. Out of lane

`docs/twilight-structure/names.md` and `docs/twilight-structure/CONTEXT.md` are the specification and are not edited. `openspec/specs/` and `openspec/schemas/` are not edited. `openspec/changes/twilight-burokrat-package/` and `openspec/changes/twilight-burokrat-consumer/` are not edited; section 3.2 records why they need no prose change. Packet 010.3 owns the decisions directory's new file and the two new change directories. Packet 010.4 owns `apps/wiki/cli/README.md`; this packet proposes paths under `apps/wiki/cli/src/` in text only and creates none of them. `.scratch/` is not edited, including its one pre-existing broken anchor.

## Review disposition

The second Codex review of 2026-09-19 and the high-effort grill of the same date were re-verified against the repository. Every finding was reproduced and fixed. Two entries are recorded rather than acted on.

- **Second review, "Recommended cut points", split into four packets.** Confirmed as a size problem: the ownership list is 7,472 lines and 73,317 words. It is answered with the four checkpoints of section 8, cut on the review's own boundaries, because an executor is dispatched one reviewed slice at a time and a separate packet file is not this task's to create. If the planner still wants four files, the checkpoints are the cut lines.
- **First review, Critical 3, the rename plan's own weak validation block.** The rename plan's Task 3 still carries the loose `.summary.totals.failed == 0 and .summary.totals.passed > 0` predicate that `bin/h2puni-gate-steps.sh` documents as admitting three malformed reports. This packet uses the gate contract and does not propagate the weaker block, but it does not rewrite that block either: section 5.2 confines this packet to the rename plan's checkboxes, and changing its verification text is outside Tasks 2 to 4. Recorded for the plan's owner.

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH, checkpoint A only

Checkpoint A has no blocking problem and may proceed now. The reload procedure for later slices
could not actually recover the preserved scripts and baseline, because the launcher issues a fresh
`$TMPDIR` on every invocation including `--resume`; the planner rewrote it by hand into a copy-and
verify step against a planner-supplied preserved directory, with a stop if that directory is
unavailable. Checkpoint D's two negative-proof blocks wrote evidence to `$run/110-5/evidence`,
which the launcher never archives, and asserted unexpected results before restoring the mutated
file; the planner rewrote both blocks by hand to write under `$TMPDIR/evidence/110-5` and to
restore with `cp` and verify with `cmp` immediately after capturing the failure statuses, before
any status assertion or diagnostic grep. The non-blocking D4 conflict, between dating a
non-checkbox Deliverable line and the checkbox-only diff guard, was also resolved by hand: D4 now
dates only the checkbox lines it ticks and leaves pending verification boxes unchecked. All of
these findings land in checkpoints B through D, which are not dispatched yet, so they were fixed
before those checkpoints' own dispatch rather than after.
