# Verification Report — twilight-review-hardening

## Resource-control review — 2026-09-06

Current scope: the uncommitted amendments over `3b0c8c80` on
`work/twilight-structure-plan`, applying the six accepted review findings. Task 5
is complete. The earlier rounds below retain their historical scope and evidence;
their counts, base revisions and limitations are not this round's results.

| Finding                       | Contract correction                                                                                                             | Runtime proof owner, still unrun                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Budget scope and clocks       | One run account, attempt holds, strict/advisory hard bounds, money scope, explicit clocks and carry-forward                     | Control-plane Tasks 3–4: $40 cap − $10 settled − $1 held = $29; four parallel 30-minute agents consume 120 agent-minutes |
| Downward-only overrides       | Keyed replacements in either direction within authority; immutable epochs and epoch-bound approvals                             | Tasks 1/3/5/6: model replacement, old/new epoch effects, reapproval, no usage reset                                      |
| Biased quality comparisons    | Independent published evaluation, observation coverage/maturity, mixed epochs, failed-run costs and attributable defect reports | Tasks 7–8: skipped observer, immature window, mixed recovery and zero accepted denominator                               |
| Missing stage order           | Explicit `after` DAG separate from artifact readiness; manual release boundary                                                  | Task 1: missing edge, artifact-induced self-cycle and shared evidence                                                    |
| Conflicting optional controls | Total activity maps, agent/tool executors and resource vectors; explicit M1 profile matrix                                      | Tasks 1/4/7/8: duplicate controls, missing assignment, tool/agent pool contention, actual judge/browser dispatch         |
| Pricing ownership             | Explicit organization snapshot, per-admission rates and stable model/non-model charge contracts                                 | Tasks 1/4: missing snapshot/rates, cache categories, omitted charge and incomplete invoice allocation                    |

Observed [check record](evidence/resource-review-checks.json): 25 workflow tests
passed; lint/typecheck and all 40 generated-variant checks passed; 3 pinned CLI
integration tests passed; OpenSpec validated all 40 changes and the artifact schema;
repository-wide formatting and the documentation cap check passed. Nx's initial
isolated-plugin startup failed before tests; the documented in-process settings
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false` ran the checks successfully.

The [temporary documentation probe](evidence/resource-review-probe.json) retains
its source and observed output: 10 stages, 12 activities, 3 delivery profiles and
30 unchecked product tasks. All 12 in-memory configuration faults were detected,
including a removed stage edge, legacy trigger target, omitted browser pool and
unbound evaluator. This is **structural documentation evidence**, not a production
compiler, resource gate or quality evaluator. No new runtime safety check or
observed runtime `Proof:` comment is claimed; those negatives are specified in the
unchecked product tasks.

Independent review found four integration gaps—tool resource vectors, old-epoch
approval validity, evaluation publication and non-model charges—and confirmed their
corrections. The three command-output files that failed the branch whitespace check
had CRLF terminators normalized to LF only; the
[normalization record](evidence/resource-review-normalization.json) retains original
and normalized hashes. Original bytes remain in `3b0c8c80`; historical review
receipts and command content were not rewritten.

Not run this round: the full workspace test/lint/typecheck/build gate, application
browser tests, live ACP/LangGraph/resource/evaluation tests, deployment or migration.
Only proposed contracts and documentation changed. No commit, push, spec sync or
archive was performed. The product's 30 implementation tasks remain unchecked.

## Earlier workflow-hardening rounds

> Two rounds. Round 1 applied the branch review; round 2 (2026-09-06) applied a
> second review of round 1 and rewrote this file onto the sdd-lean verify
> sections, because several of its round-1 rows asserted counts and exit codes
> with no retained artifact behind them.

**Change**: `twilight-review-hardening`
**Verified at**: `2026-09-06`
**Verifier**: implementing agent on `work/twilight-structure-plan`, starting from
`3ef0da98`; other agents were editing `docs/twilight-structure/*` and
`openspec/changes/twilight-control-plane/*` in the same working tree throughout,
so every measurement below is of the tree at the moment it ran, not of a commit.
**Scope**: repository workflow tooling, the `twilight-v1` schema and its
templates, `openspec/config.yaml`, CI, and the Twilight documents' navigation. No
runtime implementation, migration, archive, merge or deployment was performed. The
work is **not committed**; the working tree is the artifact.

**Runtime**: Bun `1.4.0 (34cbb9a40)`. CI's Bun `1.3.14` was not executed here.
The pinned CLI is `@fission-ai/openspec@1.12.0`; the integration test asserts
`--version` before it probes anything.

---

## 1. Structural Validation

- [x] `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 40 items, 40
      passed, 0 failed, 0 main specs. Exit 0.
      [Retained output](evidence/openspec-validate-round-2.txt).
- [x] `bunx @fission-ai/openspec@1.12.0 schema validate twilight-v1` — valid,
      exit 0. [Retained output](evidence/tail-checks-round-2.txt).
- [x] `bun run tools/tool-git-hooks/src/hooks/doc-caps.ts` — exit 0, same file.
- [x] `git diff --check` — exit 0, same file.

| Item                        | Type   | Issues                                             |
| --------------------------- | ------ | -------------------------------------------------- |
| `twilight-review-hardening` | change | none                                               |
| `twilight-sdlc-pilot`       | change | none                                               |
| `twilight-control-plane`    | change | none                                               |
| eight archived changes      | change | pre-existing INFO findings, unchanged by this work |

---

## 2. Task Completion

Every `- [ ]` in `tasks.md` is `- [x]`. Tasks 1–3 are round 1; Task 4 is round 2.

| Task | Reason incomplete | Blocks archive? |
| ---- | ----------------- | --------------- |
| —    | —                 | —               |

The **product** plan in `openspec/changes/twilight-control-plane/tasks.md` stays
unexecuted: 30 checkboxes, 0 checked, measured in
[doc-links-and-caps.txt](evidence/doc-links-and-caps.txt). Round 1 recorded that
count as "20 product deliverables"; the file now holds 30 because Task 1 added
acceptance experiments to it. The earlier number was not retained anywhere, which
is the reason this file was restructured.

---

## 3. Delta Spec Sync

| Capability                      | Sync status | Note                                                           |
| ------------------------------- | ----------- | -------------------------------------------------------------- |
| `twilight/workflow-maintenance` | ✗ pending   | Delta only. Main specs were neither synchronized nor archived. |
| `twilight/sdlc`                 | ✗ pending   | Owned by `twilight-sdlc-pilot`; amended here, not synced.      |
| `twilight/knowledge`            | N/A         | Unchanged this round.                                          |
| `twilight/control-plane`        | ✗ pending   | Proposal-stage contract text; no runtime exists.               |

---

## 4. Failure Proofs

Every fault was injected on the production call path, observed, and restored. The
`Proof:` comments beside the checks were written from the output in these files,
not from what the fault was expected to do.

| Check (file)                                                            | Fault injected                                                                               | Test that observed the failure                                                                                          | Result                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `twilight-v1/schema.yaml`, `tasks.requires` includes `design`           | `requires: [intent, specs, design]` → `[intent, specs]`                                      | `cli.integration.test.ts` — "the pinned CLI blocks planning while design.md is absent"                                  | `Expected: "blocked" / Received: "ready"`. [Output](evidence/design-traversal-red.txt). Restored: 3 pass.                                                                                                                                                                                                |
| `twilight-v1/schema.yaml`, `apply.requires` excludes `verify`           | `apply.requires` gains `verify`                                                              | `cli.integration.test.ts` — "an applicability-only design.md unblocks planning, and apply needs no verify.md"           | `Expected: "ready" / Received: "blocked"`. [Output](evidence/apply-verify-red.txt). Restored: 3 pass.                                                                                                                                                                                                    |
| `generate.ts`, untracked file under a generated output root             | the scan replaced by `void ownedRoots;`                                                      | `workflows.test.ts` — "an added file under a generated output root is refused" (three paths)                            | `Expected: 1 / Received: 0` on all three. [Output](evidence/untracked-output-red.txt). Restored: 25 pass.                                                                                                                                                                                                |
| `generate.ts`, `markGenerated` names the owning source                  | `markGenerated` returns its input unchanged                                                  | `workflows.test.ts` — "a generated copy names the file a human should edit instead"                                     | `Expected to contain: "<!-- Generated by tool-workflows from …ff-change/SKILL.md…"`. [Output](evidence/generated-marker-red.txt).                                                                                                                                                                        |
| `generate.ts`, the marker is stripped on read so it cannot accumulate   | `.replace(markerLine, '')` removed from `readSource`                                         | the same test, at its re-check line                                                                                     | `Expected: 0 / Received: 1` — the second `--write` had stacked a second marker. Same output file.                                                                                                                                                                                                        |
| `generate.ts`, formatting comes from `.prettierrc.json`                 | options hardcoded to `{ singleQuote: true, printWidth: 100 }`                                | `workflows.test.ts` — "the repository prettier configuration decides the generated formatting" and the three read cases | `Expected: 1 / Received: 0`, then three × `Expected to contain: ".prettierrc.json"`. [Output](evidence/prettier-config-red.txt).                                                                                                                                                                         |
| `generate.ts`, the config must be a JSON object                         | the object/array guard deleted, config set to `[]`                                           | `workflows.test.ts` — "a malformed .prettierrc.json stops generation"                                                   | `Expected to contain: ".prettierrc.json" / Received: "Error: Workflow drift: .agents/…apply-change/SKILL.md"`. Same file.                                                                                                                                                                                |
| `generate.ts`, exactly one `## Command Template` heading                | the `parts.length !== 2` refusal deleted                                                     | `workflows.test.ts` — "a duplicated command template heading stops generation before writes"                            | `Expected: 1 / Received: 0`. [Output](evidence/command-template-duplicate-red.txt).                                                                                                                                                                                                                      |
| `generate.ts`, `mode` is `'--check' \| '--write'` at the argv boundary  | a literal `'--bogus'` passed to `generateWorkflows`                                          | `bunx tsc --build --force tools/tool-workflows/tsconfig.json`                                                           | `error TS2345: Argument of type '"--bogus"' is not assignable to parameter of type 'Mode'`. [Output](evidence/mode-union-red.txt).                                                                                                                                                                       |
| `workflows.test.ts`, `assertFaultCanBite()` before every chmod-000 case | `process.getuid` preloaded to return 0                                                       | the four "unreadable" cases                                                                                             | `error: Running as root: chmod 000 still reads, so this fault test cannot fail`. [Output](evidence/root-guard-red.txt). **Real uid 0 was not exercised**; the condition was simulated.                                                                                                                   |
| `generate.ts`, `--check` compares each computed output (round 1)        | the comparison removed, a provider command corrupted                                         | `workflows.test.ts` — divergent-command case                                                                            | `Expected: 1 / Received: 0`. [Output](evidence/workflow-drift-red.txt).                                                                                                                                                                                                                                  |
| `generate.ts`, unknown workflow source inventory (round 1)              | an unrecognized `openspec-*` source directory added                                          | `workflows.test.ts` — unrecognized-source case                                                                          | `Expected: 1 / Received: 0`. [Output](evidence/workflow-inventory-red.txt).                                                                                                                                                                                                                              |
| `generate.ts` / `readSource`, absent vs unreadable inputs (round 1)     | delete or chmod-000 a canonical source or an installed variant                               | the parametrised absent/unreadable cases                                                                                | exit 1 naming the path, `ENOENT` or `EACCES`. [Commands and output](evidence/filesystem-faults.json).                                                                                                                                                                                                    |
| Typecheck reaches source **and** spec files (round 1)                   | an incompatible typed assignment injected into the generator and into a spec file            | `bunx nx run tool-workflows:typecheck`                                                                                  | both exited 1 naming the target. [Records](evidence/typecheck-faults.json). That artifact is a JSON array of `{path, exit, stdout, stderr}` captured from the Nx runner; Nx reports only `Failed tasks: - tool-workflows:typecheck`, so the file holds no `TS….` diagnostic and none is claimed from it. |
| Archive failure handling (round 1)                                      | fresh agents applied old vs corrected instructions to malformed JSON and permission failures | scenario transcripts                                                                                                    | baseline silently continued; a contradictory bulk tail was found and corrected. [Record](evidence/skill-scenarios.md).                                                                                                                                                                                   |

- [x] Every check added or changed in this change has a row
- [x] Each negative test reaches the production call path (the real generator CLI
      on a disposable fixture; the real pinned OpenSpec CLI on a disposable
      repository; the real `tsc` target), not a copy of it
- [x] Both absence and unreadability are tested where the code distinguishes them
      (`.prettierrc.json`, canonical sources, installed variants)
- [x] No row rests on an exit code alone: each names the assertion that moved, and
      the `.prettierrc.json` rows include a case where the configuration is
      **changed** rather than removed, so "the file was read" is not inferred from
      "the run did not crash"

**Not a check, a probe.** `openspec/config.yaml`'s `rules.design` was rewritten
schema-neutrally after establishing that config rules are **global, not
schema-scoped**: a change declaring `schema: twilight-v1` in a disposable
repository received the `sdd-lean`-flavoured rule alongside twilight-v1's own
instruction, producing two contradictory sentences in one `instructions design
--json` response. [Both probes](evidence/config-rules-are-global.txt), before and
after. Nothing automated guards this; it is a documented observation.

---

## 5. Gate Output

- [x] `bunx nx run-many -t test lint typecheck --projects=tool-workflows --skip-nx-cache` — exit 0;
      25 unit tests pass, 40 variants checked (`check` is a dependency of `lint`),
      eslint clean, `tsc --build --force` clean.
      [Retained output](evidence/tool-gate-round-2.txt).
- [x] `bunx nx format:check --all` — exit 0.
      [Retained output](evidence/format-check-round-2.txt).
- [x] `bunx nx run tool-workflows:integration` with `OPENSPEC_CLI` set — 3 tests,
      0 failures, exit 0. Run through the exact body of the new CI step, which
      installs `@fission-ai/openspec@1.12.0` into a scratch directory first.
      [Retained output](evidence/ci-integration-step.txt).
- [x] `bunx nx run-many -t test lint typecheck build` (whole workspace) — run
      twice on pop-os, where the raw gate is permitted. The first run **failed one
      task**, `tool-devsync:test`: its workspace-targets check reported
      `tool-workflows:test does not declare openspec/schemas/twilight-v1` and
      `… does not declare openspec/schemas/twilight-v1/schema.yaml`
      ([retained output](evidence/whole-gate-round-3-red.txt)). `schema.test.ts`
      had read that file since the edge was added, and the target's inputs never
      named it, so every per-project run of `tool-workflows` was green while the
      workspace was not: `LLM_README.md`'s "a whole-workspace run is not the sum of
      per-project runs" landmine, again. `tools/tool-workflows/project.json` now
      declares `{workspaceRoot}/openspec/schemas/twilight-v1/**/*` and
      `{workspaceRoot}/.prettierrc.json` as test inputs; the rerun passed all 23
      projects, exit 0 ([retained output](evidence/whole-gate-round-3-green.txt)).
      `bin/h2puni-gate.sh` and the browser gate were not executed: this host is not
      h2puni and no application code changed.

Round 1's `bunx nx run-many …` run needed `NX_ISOLATE_PLUGINS=false NX_DAEMON=false`
in its sandbox and its output is kept at [tool-gate.txt](evidence/tool-gate.txt);
round 2's run above needed no such setting.

---

## 6. Implementation Signal

- [ ] No unstaged files in the worktree — **false, deliberately.** This change was
      not committed; the instruction for round 2 forbade it.
- [ ] Relevant commits pushed — not applicable for the same reason.

**Commit range**: none. Base `3ef0da98`. The scope is the working tree.

Regenerating the workflow variants rewrote 24 files outside this change's own
directories — the four `.agents` sources that receive an injected block, and all
twenty `.claude` outputs. They are machine outputs of `tool-workflows:generate`;
`bunx nx run tool-workflows:check` exits 0 against them.

---

## Round-1 finding dispositions

| Review finding                          | Correction and owner                                                                                                                                  | Evidence or remaining obligation                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Executable upgrade compatibility absent | Control-plane restore contract pins executable/checkpoint/hook closure.                                                                               | M1 tests refusal and retained-version recovery; supported migrations and state-preserving rollback belong to Task 14. Runtime unrun.           |
| Pinned policy conflicts with revocation | Authority intersects pinned scope with current grants, revocations and floors at admission/dispatch.                                                  | New normative scenarios and Tasks 3–4 oracles; runtime unrun. Relaxation cannot enlarge approval.                                              |
| Expired worker can request a new effect | Effect execution owns dispatch fencing and resource-specific settlement, including workspace isolation.                                               | Tasks 4/6 use a still-live stale worker, independent effect counter and remote resource state; runtime unrun.                                  |
| Required design omitted by fast-forward | Round 1 added the `design` edge; round 2 removed the contradiction behind it — `design.md` is now always present, applicability-only when trivial.    | [design-traversal-red.txt](evidence/design-traversal-red.txt) and the schema/template/spec wording. Content quality stays a caller obligation. |
| Archive lookup failures hidden          | Shared policy distinguishes valid optional absence, specifically identified incompatibility, and unexpected failure.                                  | [skill-scenarios.md](evidence/skill-scenarios.md); a contradictory bulk tail was found and corrected during testing.                           |
| Approval retry versus token replay      | Same authenticated command retrieves its historical receipt; a new command cannot reuse the token.                                                    | Backend test assigned to Task 3; FE/MCP journey to Task 5, avoiding a dependency cycle. Runtime unrun.                                         |
| Agentic development scalability         | Deep invariant-owning modules, change-keyed plan locks, input/output receipt lineage, explicit CAS conflicts and measurable proposed storage budgets. | The product plan carries the future tests and stop criteria. Budgets are proposed thresholds, not measurements.                                |
| Workflow copies drift                   | `tool-workflows` renders and checks all 40 installed variants from the 20 existing source forms.                                                      | Uncached `check` is a dependency of `lint` and is reached by CI's `run-many` gate. Round 2 added the untracked-file scan beside it.            |

## Round-2 finding dispositions

| Review finding                                                 | Correction                                                                                                                                                                    | Evidence                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Design "OPTIONAL" in prose, a hard prerequisite in the graph   | Edge kept; the instruction, description, template, this change's spec and the pilot's `sdlc` spec now all say `design.md` is always present, applicability-only when trivial. | [design-traversal-red](evidence/design-traversal-red.txt), integration tests |
| The pilot spec claimed four required artifact classes          | Five classes; `verify.md` is a handoff/archive obligation, not an apply prerequisite, and the instruction says so and says who will enforce it later.                         | [apply-verify-red](evidence/apply-verify-red.txt)                            |
| `config.yaml`'s global `rules.design` contradicted twilight-v1 | Probed: config rules are global. Rewritten schema-neutrally with the probe cited inline.                                                                                      | [config-rules-are-global](evidence/config-rules-are-global.txt)              |
| Focus profile hardcoded to one skill name                      | The intent instruction now points at the execution profile's `presentation` section and the documented default adaptation.                                                    | schema diff; nothing automated guards it                                     |
| Rules duplicated across schema and templates                   | Each rule kept once in its artifact instruction; templates point at the instruction. `templates/proposal.md`'s unowned "50-1000 characters" is deleted.                       | schema and template diffs                                                    |
| Unclear sentences                                              | Rewritten: the CONTEXT.md sentence, the "revision-checked round-trip contract" clause, this file's transport-output row, and the pilot's stage list (canonical ids).          | schema and spec diffs                                                        |
| Generator blind spots and duplicated configuration             | Untracked-output scan, source markers, `.prettierrc.json`, command-template count, `Mode` union, root guard — six checks, each with an observed negative.                     | five `*-red.txt` files under `evidence/`                                     |
| The pinned-CLI proof was not in the merge gate                 | New CI step `OpenSpec schema graph (pinned CLI)`; the schema's `Proof:` comment now names the test, the target and the observed output.                                       | [ci-integration-step](evidence/ci-integration-step.txt) — **local run only** |
| "Skill and command are at parity"                              | **Withdrawn.** That claim compared renamed invocations, not behaviour; the two are different documents and the divergence is now measured and documented.                     | [skill-command-divergence](evidence/skill-command-divergence.txt)            |
| Rows claiming counts with no artifact                          | This file restructured onto the sdd-lean verify sections; every count and exit above links a retained file.                                                                   | `evidence/*-round-2.txt`, `doc-links-and-caps.txt`                           |

**The parity claim, precisely.** Round 1 wrote that a reviewer "independently
compared all ten Claude skill renderings". What that comparison established is that
each `.claude` copy carries the `/opsx:*` invocations and each `.agents` source
carries `/openspec-*`. It did **not** establish that a skill and its command say the
same thing, and they do not: `.claude/commands/opsx/explore.md` is 231 lines to the
skill's 349 and lacks the skill's 108-line `## Handling Different Entry Points`
section, while `.claude/commands/opsx/archive.md` is 239 lines to the skill's 194
and carries three output-template headings the skill has not. This is upstream
OpenSpec's shape — commands render from `source-command-opsx-*`, skills from
`openspec-*` — and this change deliberately does not alter it. Recorded in
[the upgrade document](../../../docs/2026-09-06-openspec-upgrade.md#the-skill-and-the-command-are-different-documents).

---

## Not verified

- **The new CI step has never run on a GitHub runner.** Its body was executed
  locally and passed; whether `actions/checkout` + `oven-sh/setup-bun@v2` + `bun add`
  resolve the pin on `ubuntu-latest` is unobserved. This agent cannot observe CI.
- **Real `uid 0` was not exercised.** `assertFaultCanBite()` was proven by
  preloading `process.getuid = () => 0`, not by running the suite as root.
- The **whole-workspace** gate, `bin/h2puni-gate.sh`, the browser gate, ACP/LangGraph
  execution, resource races, deployment and planning-migration benchmarks were not
  run. This host is pop-os, not h2puni.
- Round 1's `typecheck-faults.json` is the Nx runner's `{path, exit, stdout, stderr}`
  for the two typecheck injections. Nx prints `Failed tasks: - tool-workflows:typecheck`
  and swallows tsc's own output, so that artifact carries no compiler diagnostic and
  none is claimed from it. (Round 2's `Mode` injection ran `tsc` directly and its
  `mode-union-red.txt` does carry the `TS2345` line.)
- The link, word-count and deliverable counts in
  [doc-links-and-caps.txt](evidence/doc-links-and-caps.txt) were taken while other
  agents were writing to `docs/twilight-structure/`. They describe that instant.
  One genuinely broken link was found and fixed by that run:
  `docs/2026-09-06-openspec-upgrade.md` pointed at `twilight-structure/sdd-proposal.md`,
  deleted this session.
- Main specs were neither synchronized nor archived. Every product task in
  `twilight-control-plane` remains future work.

---

## Decision

- [x] ⚠️ **PASS WITH WARNINGS** — every check this change adds has an observed
      failure behind it and the scoped gates are green, but the CI step that puts
      the pinned-CLI proof inside the merge gate has not been seen running, and the
      root guard's condition was simulated rather than met. Neither blocks the
      branch; both are stated above rather than assumed away.

**Next step**: a human reviews the diff, including the 24 regenerated workflow
files, and decides whether to commit. Production, archive and spec synchronization
each require their own explicit command.
