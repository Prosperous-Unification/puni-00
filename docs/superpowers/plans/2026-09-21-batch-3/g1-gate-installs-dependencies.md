# G1 The h2puni gate installs the locked dependencies before it runs

| Field      | Value                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| Work item  | "h2puni gate installs the locked dependencies before it runs", under 080 |
| Size class | S, in four slices                                                        |
| Slices     | A OpenSpec change, B harness and install, C negative proofs, D documents |
| Estimate   | 0.25 / 0.5 / 1.5 days; 700,000 tokens                                    |
| Implements | The finding of 2026-09-20 recorded in section 3 of this packet           |
| Planned on | 2026-09-21, rehearsed end to end in a private worktree at `da8be091`     |

**You execute one slice and stop.** The end of your instructions names which. Do not start the
next one. Section 8 gives every command with its expected exit status and decisive line; section 9
says which checks are the planner's.

## 1. Goal and non-goals

**Goal.** `bin/h2puni-gate-steps.sh` installs the gated commit's locked dependencies itself,
inside the heavy lock, after the pinned checkout and before OpenSpec validation, and
`bin/h2puni-gate.test.sh` proves that it does, that a refused install stops the gate before
OpenSpec validation and before any Nx work, and that an absent installer stops it too.

**Non-goals.** Nothing about the heavy lock, the pinned checkout, the OpenSpec contract, the Nx
steps, the solver image smoke step, CI, lefthook, `.github/workflows/ci.yml` or any Nx project
target changes. No new file is added under `bin/` or `apps/wiki/cli`. No Nx target is added or
renamed. The gate is not made to work offline, and no install cache is configured.

## 2. Read first

| File                                                                      | Why                                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                               | Rules R1 to R5, and the "Gate" section, whose text slice D edits.                                         |
| `LLM_README.md`                                                           | The index. Read only the entry your slice needs.                                                          |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                     | "Execution contract" and "Standard blocks every packet uses". This packet links to them by name.          |
| `bin/h2puni-gate-steps.sh`                                                | The file slice B edits. 32 lines; read all of it.                                                         |
| `bin/h2puni-gate.test.sh`                                                 | The harness slice B extends. Read `prepare_gate_steps_path`, `run_gate_steps_fixture` and cases 22 to 33. |
| `bin/h2puni-gate.sh`                                                      | How the steps script is invoked, and why the steps run inside the lock. Not edited.                       |
| `docs/findings/checks-that-cannot-fail-puni-00.md`                        | The catalogue slice D appends to, and its house style.                                                    |
| `docs/superpowers/plans/2026-09-20-batch-2/110-6-retire-upstream-sync.md` | Section 5 of this packet: 110.6 also edits that catalogue file.                                           |

## 3. Verified facts

Every line below was read in the repository at `da8be091` on 2026-09-21 and, where it is a
command result, observed in a private worktree of that commit.

| Fact                                                                                                                                                                                                                                | Evidence                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| The gate steps never install. The script is 32 lines: argument checks, `cd`, OpenSpec validation, four Nx invocations.                                                                                                              | `bin/h2puni-gate-steps.sh:1-32`                                                   |
| `cd "$repo"` is line 6, and `openspec_report=$(mktemp)` is line 8, with line 7 blank. The install goes between them.                                                                                                                | `bin/h2puni-gate-steps.sh:6-8`                                                    |
| CI does install, in three jobs, as `bun install --frozen-lockfile`.                                                                                                                                                                 | `.github/workflows/ci.yml:269`, `:792`, `:944`                                    |
| The gate steps are the argument to `gate_with_pinned_head`, so they run inside the heavy lock and after the checkout.                                                                                                               | `bin/h2puni-gate.sh:110-113`                                                      |
| The harness stubs the tools the steps call by building a `bin` directory and running the real steps script with `PATH` set to it alone. `bun` is not among the stubs today.                                                         | `bin/h2puni-gate.test.sh:81-123`                                                  |
| `run_gate_steps_fixture` passes `"$repo_root" HEAD` and captures stdout and stderr to files in the fixture.                                                                                                                         | `bin/h2puni-gate.test.sh:114-123`                                                 |
| Case 22 asserts the FIRST line of the call log is the validator invocation. An install logged to the same file moves it to the second line, so that one assertion must change with this work.                                       | `bin/h2puni-gate.test.sh:481-482`                                                 |
| `bash bin/h2puni-gate.test.sh` on the unmodified tree: exit 0, `all cases passed`, **85** `  ok:` lines, 11.7 s wall.                                                                                                               | Observed 2026-09-21                                                               |
| The Nx-free entry point for the harness is the root script `gate-pinning:test`; CI runs it as `bash bin/h2puni-gate.test.sh`.                                                                                                       | `package.json:29`, `.github/workflows/ci.yml:599-600`                             |
| `tools/tool-devsync/src/toolchain-pins.test.ts` and `tools/tool-devsync/src/poller.test.ts` read the steps script, but only for the solver-image-smoke line and the moved solver paths.                                             | `toolchain-pins.test.ts:79`, `:90-91`; `poller.test.ts:1076-1088`                 |
| `apps/wiki/cli/src/policy/gate-entrypoints.test.ts` reads the steps script and asserts only `--exclude=twilight-bureaucrat` and the Bureaucrat source-lint command.                                                                 | `gate-entrypoints.test.ts:1199`, `:1288-1289`                                     |
| The devsync namespacing digest scans `bin/` files but counts only lines matching its legacy-root pattern. **Neither gate script contains a match**, so the digest and occurrence count do not move.                                 | `repo-namespacing-handoff.test.ts:26-28`, `:317-333`, `:355`; grep observed empty |
| `tools/tool-fleet/src/check-tools.json` lists both gate scripts under `uncheckedExecutables`; it lists paths, not contents, so no edit is needed.                                                                                   | `check-tools.json:17-19`                                                          |
| `docs/findings/root-migration.v1.json` pins the INHERITED catalogue block-for-block. It does not name `checks-that-cannot-fail-puni-00.md` at all, so that file takes additions.                                                    | `grep -c puni-00 docs/findings/root-migration.v1.json` printed `0`                |
| `docs/findings/README.md`'s module index lists the catalogue file as a path membership, with no count and no per-entry pin.                                                                                                         | `docs/findings/README.md:3`                                                       |
| No capability under `openspec/specs/` owns the host gate. Twelve capabilities exist; none is about it.                                                                                                                              | `ls openspec/specs`                                                               |
| Strict OpenSpec validation on the unmodified tree: `{"items":107,"passed":107,"failed":0}`.                                                                                                                                         | Observed 2026-09-21                                                               |
| `apps/wiki/cli/src/policy/gate-entrypoints.test.ts` already fails 2 of 57 on a workstation with no provisioned Twilight Bureaucrat activation, on the unmodified tree, at `trusted TypeScript runtime modules are not provisioned`. | Observed 2026-09-21, before and after the change                                  |

### The incident this packet closes

On 2026-09-20 the gate tree on h2puni carried `node_modules` from 2026-09-18, without `di-bag`,
`application-exception` or `caught-object-report-json`. Every host gate since batch 1 had run on
those stale dependencies and passed only because nothing that executed there imported the three
libraries. The first batch 2 group gate failed
`apps/wbs/be-01/src/production-entrypoint.test.ts` on `Could not resolve: "di-bag"`, and the
planner installed by hand. A gate that reads a tree it never assembled reports about a different
commit than the one it names.

## 4. Assumptions recorded, not asked

The owner's standing instruction is to assume and record. These are the decisions this packet
took.

1. **The install goes inside the heavy lock, after the checkout, before OpenSpec validation.** It
   is the first thing the steps do after `cd "$repo"`. Inside the lock, because two lanes sharing
   one tree must not install into it concurrently; before the validator, because `bunx` and every
   later step read the tree the install assembles.
2. **`--frozen-lockfile`.** A lockfile that disagrees with `package.json` fails the gate loudly
   with the installer's own message. The gate is a verdict about a commit; resolving a
   disagreement on the host would make it a verdict about something else.
3. **An absent `node_modules` is simply installed.** No separate refusal: the installer creates it.
   This is why the packet adds no existence check; there is nothing to check.
4. **A failing install is a gate failure**, exit non-zero, never a skip and never a
   log-and-continue. The host has network; an install that cannot reach the registry is a real
   gate failure and must be read as one.
5. **An absent installer is a required-tool failure** (exit 127 under `set -euo pipefail`),
   matching AGENTS.md's "A missing required tool blocks the task".
6. **A new OpenSpec capability, `host-gate`, in a new change `host-gate-locked-install`.** No
   existing capability owns the host gate (section 3). `heavy-lock-queue` owns the lock, `ci-gate`
   owns CI annotation safety; neither is this.
7. **The finding is recorded in `docs/findings/checks-that-cannot-fail-puni-00.md`**, as the
   thirtieth entry. Its pins allow it (section 3), and section 5 settles the overlap with 110.6.
8. **No caching, no `--production`, no `--ignore-scripts`.** The gate installs exactly what CI
   installs, so a green gate and a green CI mean the same thing.
9. **AGENTS.md's Gate paragraph is corrected.** It enumerates what the gate does; leaving the
   install out would make the routing text wrong by omission.
10. **The harness keeps one call log.** Ordering is the fact being proved, and two logs cannot
    prove an order. That is why case 22's one assertion changes from the first line to the second.

## 5. File plan and neighbours

| File                                                                | Slice | Create or modify | Responsibility                                                                   |
| ------------------------------------------------------------------- | ----- | ---------------- | -------------------------------------------------------------------------------- |
| `openspec/changes/host-gate-locked-install/proposal.md`             | A     | create           | Intent: why, what changes, non-goals, constraints.                               |
| `openspec/changes/host-gate-locked-install/specs/host-gate/spec.md` | A     | create           | The two requirements with their scenarios.                                       |
| `openspec/changes/host-gate-locked-install/tasks.md`                | A     | create           | The ordered slices.                                                              |
| `openspec/changes/host-gate-locked-install/verify.md`               | A     | create           | The verification record; every later slice appends to it.                        |
| `openspec/changes/host-gate-locked-install/.openspec.yaml`          | A     | create (by CLI)  | Schema metadata. Written by `openspec new change`; never hand-written.           |
| `bin/h2puni-gate.test.sh`                                           | B     | modify           | The `bun` stub, the mode argument, three new cases, one changed line in case 22. |
| `bin/h2puni-gate-steps.sh`                                          | B, C  | modify           | The install line (B) and its `Proof:` comment (C).                               |
| `AGENTS.md`                                                         | D     | modify           | One sentence in the Gate section.                                                |
| `docs/findings/checks-that-cannot-fail-puni-00.md`                  | D     | modify           | The thirtieth catalogue entry.                                                   |

**Neighbours in batch 2, and what this packet does about them.**

| Packet                       | Contact                                                                                                             | Resolution                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 110.6 retire upstream sync   | Its slice A edits `docs/findings/checks-that-cannot-fail-puni-00.md`, rewording two stale descriptors near the top. | Different hunks: 110.6 edits the opening paragraphs, slice D appends at the end of the file. If both are in flight, land 110.6 first and rebase. |
| 110.1 test axes              | Adds an OpenSpec change, moving the validator's item total.                                                         | Section 8 records the total relative to a baseline this packet's slices take themselves. No absolute number appears anywhere.                    |
| 010.7 rules, 010.6 templates | Add source files under `apps/wiki/cli`, changing the Twilight Bureaucrat validator identity.                        | This packet adds no file there, so it does not move that identity. No test pins it as a literal.                                                 |
| 020.2, 020.7, 040.1, 040.4   | None. No file in section 5 is touched by them.                                                                      | Nothing to do.                                                                                                                                   |

## 6. Slices

Each slice records its own baseline first. Every count below was observed on 2026-09-21 in a
private worktree of `da8be091`; where your own baseline differs, use yours and report the
difference.

### Slice A. The OpenSpec change

- [ ] A0. Baseline. Run the batch README's **OpenSpec validation** block and record the printed
      totals. Observed on the unmodified tree: `items 107, passed 107, failed 0`. Call the passed
      number `N`.
- [ ] A1. Create the change with the batch README's **Creating an OpenSpec change** block, using
      the name `host-gate-locked-install`. Expected: the directory exists and the `grep` prints
      one `schema: sdd-lean` line. If it prints nothing, stop.
- [ ] A2. Write `openspec/changes/host-gate-locked-install/proposal.md` with exactly this text:

  ```md
  ## Why

  The h2puni gate tree is a long-lived shared checkout, and `bin/h2puni-gate-steps.sh` never
  installed dependencies. On 2026-09-20 its `node_modules` was 2026-09-18's install, without
  `di-bag`, `application-exception` or `caught-object-report-json`, so every host gate since batch
  1 reported a verdict about dependencies the gated commit does not describe. The first batch 2
  group gate failed `apps/wbs/be-01/src/production-entrypoint.test.ts` on
  `Could not resolve: "di-bag"` and the planner installed by hand. CI installs; the host gate did
  not.

  ## What Changes

  The gate steps install the locked dependencies themselves, inside the heavy lock, after the
  pinned checkout and before OpenSpec validation. The install is frozen, so a lockfile that
  disagrees with the manifests fails the gate loudly with the installer's own message rather than
  gating a tree assembled from something else. A refused or absent installer stops the gate before
  OpenSpec validation and before any Nx work.

  ## Non-Goals

  This change does not alter the heavy lock, the pinned checkout, the OpenSpec contract, the Nx
  steps, the solver image smoke step, CI, lefthook, or any Nx project target. It adds no network
  behaviour beyond the installer's own and no new script.

  ## Constraints

  The gate steps stay a plain sequence under `set -euo pipefail`. No step may be skipped,
  defaulted or made conditional on a tool being present.
  ```

- [ ] A3. Write `openspec/changes/host-gate-locked-install/specs/host-gate/spec.md` with exactly
      this text. Every `### Requirement:` heading is followed directly by a normative SHALL
      sentence; the validator refuses the file otherwise.

  ```md
  ## ADDED Requirements

  ### Requirement: The host gate installs the locked dependencies before it gates

  `bin/h2puni-gate-steps.sh` SHALL run `bun install --frozen-lockfile` in the gated checkout before
  it validates OpenSpec and before any Nx work, so the gate reports about the dependencies the
  gated commit locks rather than about whatever an earlier run left in the shared tree.

  #### Scenario: A gate runs in a tree with stale dependencies

  - **WHEN** the gate steps run in a checkout whose `node_modules` predates the gated commit's
    lockfile
  - **THEN** the locked dependencies are installed before the OpenSpec validator is invoked

  ### Requirement: A refused install fails the gate loudly

  The gate steps SHALL stop with a non-zero status carrying the installer's own message when the
  frozen install is refused, and SHALL stop when no installer is present, in both cases before
  OpenSpec validation and before any Nx work.

  #### Scenario: The lockfile disagrees with the manifests

  - **WHEN** the frozen install exits non-zero
  - **THEN** the gate steps exit non-zero, the installer's message stays in gate output, and
    neither the OpenSpec validator nor any Nx target is invoked

  #### Scenario: The installer is absent

  - **WHEN** no installer can be found on the gate's path
  - **THEN** the gate steps exit non-zero before the OpenSpec validator is invoked, rather than
    gating an uninstalled tree
  ```

- [ ] A4. Write `openspec/changes/host-gate-locked-install/tasks.md`:

  ```md
  ## Tasks

  - [ ] Teach the gate-step harness an installer stub and assert the order
  - [ ] Install the locked dependencies in the gate steps
  - [ ] Prove the five injected faults
  - [ ] Record the incident in the findings catalogue and correct the Gate routing text
  ```

- [ ] A5. Create `openspec/changes/host-gate-locked-install/verify.md` with a `# Verification`
      heading and one line naming the baseline from A0. Each later slice appends its own
      observations here, referring to evidence by basename only, never by absolute path.
- [ ] A6. Format the five files you own with `bunx prettier --write`, then run the repository-wide
      format check (section 8).
- [ ] A7. Re-run the OpenSpec validation block. Expected: `failed 0` and `passed` equal to `N + 1`.
      Observed on the rehearsal tree: 107 then 108.
- [ ] A8. Stop and report. Ready to commit, message
      `docs(openspec): require the host gate to install the locked dependencies`, paths:
      the five files under `openspec/changes/host-gate-locked-install/`.

### Slice B. The harness, then the install

- [ ] B0. Baseline. Run `bash bin/h2puni-gate.test.sh` and record the exit status and the number
      of `  ok:` lines. Observed: exit 0, `all cases passed`, **85** ok lines. Call it `B`.
- [ ] B1. In `bin/h2puni-gate.test.sh`, give `prepare_gate_steps_path` a fourth parameter and a
      `bun` stub. Replace its first line and append the stub block immediately after the existing
      `include_tee` block, before the comment that introduces the `bunx` fake:

  ```sh
  prepare_gate_steps_path() {
    local fixture_root=$1 include_jq=$2 include_tee=${3:-yes} include_bun=${4:-yes}
  ```

  ```sh
    if [[ $include_bun == yes ]]; then
      # shellcheck disable=SC2016 # These variables belong to the generated fake, not this process.
      printf '%s\n' \
        '#!/bin/bash' \
        'printf '\''bun %s\n'\'' "$*" >>"$GATE_CALL_LOG"' \
        'if [[ ${GATE_BUN_MODE:-ok} == fail ]]; then' \
        '  printf '\''error: lockfile had changes, but lockfile is frozen\n'\'' >&2' \
        '  exit 1' \
        'fi' \
        >"$fixture_root/bin/bun"
      chmod +x "$fixture_root/bin/bun"
    fi
  ```

- [ ] B2. Give `run_gate_steps_fixture` a third parameter and pass it through. Replace its `local`
      line and add one environment assignment after `GATE_OPEN_SPEC_MODE`:

  ```sh
    local fixture_root=$1 mode=$2 bun_mode=${3:-ok}
  ```

  ```sh
      GATE_BUN_MODE="$bun_mode" \
  ```

- [ ] B3. Case 22 reads the FIRST line of the call log for the validator invocation, which the
      install now occupies. There is exactly one `head -n 1 "$failed_spec_fixture/calls"` in the
      file; change that one occurrence only:

  ```sh
    "$(sed -n 2p "$failed_spec_fixture/calls" 2>/dev/null)" 'the gate invokes the pinned validator contract'
  ```

- [ ] B4. Append three cases at the end of the case list. They go after the single line that
      closes case 33 by removing the lock directory and the queue, and before the
      `if ((failures)); then` block. The text is in section 7; add it exactly.
- [ ] B5. Run `bash bin/h2puni-gate.test.sh`. Expected RED: exit 1, `9 failing case(s)`, `B` ok
      lines (85 on the rehearsal tree — the new cases contribute no passes yet). The nine failures
      are the list in section 7's fault F1. A different number of failures, or a green run, is a
      stop.
- [ ] B6. In `bin/h2puni-gate-steps.sh`, insert the install between `cd "$repo"` and
      `openspec_report=$(mktemp)`, leaving one blank line on each side. Add exactly the five
      comment lines shown; the `Proof:` comment is slice C's, after the faults have been watched.

  ```sh
  # The gate tree is a long-lived shared checkout, so its node_modules is whatever an earlier gate
  # left behind; on 2026-09-20 that was 2026-09-18's install and the first batch 2 group gate failed
  # apps/wbs/be-01/src/production-entrypoint.test.ts on `Could not resolve: "di-bag"`. Frozen,
  # because a lockfile that disagrees with the manifests is a gate failure, not something to
  # resolve on the host.
  bun install --frozen-lockfile
  ```

- [ ] B7. Run `bash bin/h2puni-gate.test.sh`. Expected GREEN: exit 0, `all cases passed`,
      `B + 9` ok lines (94 on the rehearsal tree).
- [ ] B8. Run shellcheck over both scripts (section 8). Expected exit 0 and no output.
- [ ] B9. Append the B0, B5, B7 and B8 observations to the change's `verify.md`.
- [ ] B10. Stop and report. Ready to commit, message
      `test(gate): prove the host gate installs the locked dependencies`, paths:
      `bin/h2puni-gate-steps.sh`, `bin/h2puni-gate.test.sh`,
      `openspec/changes/host-gate-locked-install/verify.md`.

### Slice C. Five negative proofs

Follow the batch README's **Negative proofs with a restore** and **Saving a mutation patch**
blocks. Copy `bin/h2puni-gate-steps.sh` to `$TMPDIR/steps.passing` once, before the first fault,
and restore from that copy with `cp` and verify with `cmp` after each one. Never restore from Git.

- [ ] C0. Baseline. `bash bin/h2puni-gate.test.sh`: exit 0, `all cases passed`, 94 ok lines on the
      rehearsal tree.
- [ ] C1 to C5. Inject each fault in section 7's table in turn, run the harness, save the failing
      output under `$TMPDIR/evidence/`, restore, `cmp`, and re-run green before the next one.
- [ ] C6. Only after watching all five, add the `Proof:` comment directly below the two comment
      lines added in B6 and above the `bun install` line, describing what you saw:

  ```sh
  # Proof: 2026-09-21. Deleting this line made h2puni-gate.test.sh fail nine cases, among them
  # `the gate does not install against the frozen lockfile` and `a refused frozen install refuses
  # the gate steps: want exit 1, got 0`. Dropping `--frozen-lockfile` failed only the first of
  # those; moving the line below the OpenSpec block failed `the install does not precede OpenSpec
  # validation (install line '2', validate line '1')`; appending `|| true` failed the second; and
  # guarding it with `command -v bun` failed `a missing installer refuses the gate steps: want
  # exit 127, got 0`.
  ```

  Every quoted fragment above is what the rehearsal on 2026-09-21 printed. Replace each one with
  the text YOUR run printed and date the comment with the day you ran it. The comment states what
  you saw, never what this packet predicted.

- [ ] C7. Run `bash bin/h2puni-gate.test.sh` and shellcheck once more. Expected exit 0 both times.
- [ ] C8. Append each fault, its named failing assertion and the literal line you saw to the
      change's `verify.md`, and tick the third task in `tasks.md`.
- [ ] C9. Stop and report. Ready to commit, message
      `test(gate): record the watched faults for the gate install`, paths:
      `bin/h2puni-gate-steps.sh`, `openspec/changes/host-gate-locked-install/tasks.md`,
      `openspec/changes/host-gate-locked-install/verify.md`.

### Slice D. The routing text and the catalogue

- [ ] D0. Baseline. Run the OpenSpec validation block and `bash bin/h2puni-gate.test.sh`; record
      both. Expected: `failed 0`, and exit 0 with `all cases passed`.
- [ ] D1. In `AGENTS.md`, replace the first bullet of the `## Gate` section. The old text is three
      lines beginning `- Before claiming done on h2puni`; the new text is four lines:

  ```md
  - Before claiming done on h2puni, run `bin/h2puni-gate.sh <sha>`. It takes the canonical
    host-wide heavy lock, checks out that SHA under the lock, installs the locked dependencies
    frozen, then runs CI format, test, lint, typecheck and build. Do not run raw full Nx gates
    there or check out the SHA first.
  ```

  `CLAUDE.md` and `GEMINI.md` are symlinks to `AGENTS.md`; do not edit them, do not pass them to
  Prettier (an explicit symlink argument makes Prettier exit 2), and expect them not to appear in
  `git status`.

- [ ] D2. Append the thirtieth entry to `docs/findings/checks-that-cannot-fail-puni-00.md`,
      preceded by one blank line, in the house style of the entries above it — a dated opening, the
      observed facts, and a bold closing sentence:

  ```md
  One more on 2026-09-20, found while planning batch 3, and it **shipped** — the thirtieth. The
  h2puni gate is the repository's completion gate, and `bin/h2puni-gate-steps.sh` never installed
  anything: it ran OpenSpec validation and four Nx steps against whatever `node_modules` an earlier
  gate had left in the shared tree. On 2026-09-20 that was 2026-09-18's install, without `di-bag`,
  `application-exception` or `caught-object-report-json`, so every host gate since batch 1 had
  reported green about a commit whose locked dependencies it had never read, and passed only
  because nothing that executed there imported the three new libraries. The first batch 2 group
  gate finally failed `apps/wbs/be-01/src/production-entrypoint.test.ts` on
  `Could not resolve: "di-bag"`, and the planner installed by hand. CI installs at the top of its
  gate job; the host gate did not, and no test asked whether it did. **A gate that reads a tree it
  never assembled is reporting about a different commit than the one it names.**
  ```

  Do not change the opening paragraph's count of twenty-nine: it describes the inherited
  catalogue's own total, and each entry below states its own ordinal.

- [ ] D3. Run `bun run tools/tool-git-hooks/src/hooks/doc-caps.ts`. Expected exit 0, no output.
- [ ] D4. Format `docs/findings/checks-that-cannot-fail-puni-00.md` with
      `bunx prettier --write`, then run the repository-wide format check. Expected exit 0.
      `AGENTS.md` is covered by the repository-wide check; on the rehearsal tree
      `bunx prettier --check AGENTS.md` also exited 0 after the D1 edit.
- [ ] D5. Run the OpenSpec validation block, `bash bin/h2puni-gate.test.sh`, and
      `bash bin/tool-wiki-lint.sh working . HEAD`. Expected: `failed 0`; exit 0 with
      `all cases passed`; and exit 0 printing one JSON line whose `status` is `inactive` with
      `"reason":"external activation root is not provisioned"` — that is the expected local result,
      not a failure.
- [ ] D6. Tick the remaining tasks in `tasks.md` and append D0 to D5 to `verify.md`.
- [ ] D7. Stop and report. Ready to commit, message
      `docs(gate): record the stale-dependency finding and correct the Gate routing`, paths:
      `AGENTS.md`, `docs/findings/checks-that-cannot-fail-puni-00.md`,
      `openspec/changes/host-gate-locked-install/tasks.md`,
      `openspec/changes/host-gate-locked-install/verify.md`.

## 7. Exact new harness text, and the five faults

Append this to `bin/h2puni-gate.test.sh` in step B4, exactly as written.

```sh
# 34. The gate tree is a long-lived shared checkout whose node_modules is whatever an earlier gate
# left there. On 2026-09-20 that was 2026-09-18's install, missing di-bag, application-exception and
# caught-object-report-json; the first batch 2 group gate failed
# apps/wbs/be-01/src/production-entrypoint.test.ts on `Could not resolve: "di-bag"`, and every host
# gate since batch 1 had reported a verdict about dependencies the commit does not describe. The
# steps install the locked dependencies themselves, first, before anything reads node_modules.
install_order_fixture="$scratch/install-order"
prepare_gate_steps_path "$install_order_fixture" yes
status=0
run_gate_steps_fixture "$install_order_fixture" passed || status=$?
expect_status 0 "$status" 'a passing install and report admit the remaining gate steps'
if grep -qx 'bun install --frozen-lockfile' "$install_order_fixture/calls"; then
  pass 'the gate installs against the frozen lockfile'
else
  fail 'the gate does not install against the frozen lockfile'
fi
install_line=$(grep -n '^bun install' "$install_order_fixture/calls" | head -1 | cut -d: -f1)
validate_line=$(grep -n '^@fission-ai/openspec@1\.12\.0 validate' "$install_order_fixture/calls" | head -1 | cut -d: -f1)
if [[ -n $install_line && -n $validate_line && $install_line -lt $validate_line ]]; then
  pass 'the install precedes OpenSpec validation'
else
  fail "the install does not precede OpenSpec validation (install line '$install_line', validate line '$validate_line')"
fi

# 35. A lockfile that disagrees with the manifests is a gate failure with the installer's own
# message, never a gate that carries on against whatever is already unpacked.
failed_install_fixture="$scratch/failed-install"
prepare_gate_steps_path "$failed_install_fixture" yes
status=0
run_gate_steps_fixture "$failed_install_fixture" passed fail || status=$?
expect_status 1 "$status" 'a refused frozen install refuses the gate steps'
if grep -q 'lockfile is frozen' "$failed_install_fixture/stderr"; then
  pass 'the refused install keeps the installer message in gate output'
else
  fail 'the refused install hid the installer message'
fi
if grep -q '^@fission-ai/openspec' "$failed_install_fixture/calls"; then
  fail 'the refused install allowed OpenSpec validation'
else
  pass 'the refused install stops before OpenSpec validation'
fi
if [[ -e $failed_install_fixture/later ]]; then
  fail 'the refused install allowed later Nx work'
else
  pass 'the refused install stops before later Nx work'
fi

# 36. An absent installer is a required-tool failure, not permission to gate an uninstalled tree.
missing_bun_fixture="$scratch/missing-bun"
prepare_gate_steps_path "$missing_bun_fixture" yes yes no
status=0
run_gate_steps_fixture "$missing_bun_fixture" passed || status=$?
expect_status 127 "$status" 'a missing installer refuses the gate steps'
if [[ -e $missing_bun_fixture/later ]]; then
  fail 'the missing installer allowed later Nx work'
else
  pass 'the missing installer stops before later Nx work'
fi
```

The three cases add nine `ok:` lines: `a passing install and report admit the remaining gate steps
(exit 0)`, `the gate installs against the frozen lockfile`, `the install precedes OpenSpec
validation`, `a refused frozen install refuses the gate steps (exit 1)`, `the refused install keeps
the installer message in gate output`, `the refused install stops before OpenSpec validation`,
`the refused install stops before later Nx work`, `a missing installer refuses the gate steps (exit
127)`, `the missing installer stops before later Nx work`.

### The faults, each rehearsed on 2026-09-21

Every fault is injected into `bin/h2puni-gate-steps.sh`, which contains exactly one line matching
`^bun install`. The harness is `bash bin/h2puni-gate.test.sh`; the ok counts are against the
rehearsed green of 94.

| Id  | Injected fault                                                                         | Named assertion that must fail                          | Literal line observed                                                                            | Also failed                                                    | Result        |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------- |
| F1  | Delete the `bun install --frozen-lockfile` line entirely                               | `the gate does not install against the frozen lockfile` | `  FAIL: the gate does not install against the frozen lockfile`                                  | 8 more, including case 22's validator-contract assertion       | exit 1, 85 ok |
| F2  | Replace it with `bun install` (drop `--frozen-lockfile`)                               | `the gate does not install against the frozen lockfile` | `  FAIL: the gate does not install against the frozen lockfile`                                  | none — exactly one failing assertion                           | exit 1, 93 ok |
| F3  | Move the line to just after `trap - EXIT`, below the jq block                          | `the install does not precede OpenSpec validation`      | `  FAIL: the install does not precede OpenSpec validation (install line '2', validate line '1')` | case 22's validator contract, and the refused-install ordering | exit 1, 91 ok |
| F4  | Append `\|\| true` to the line                                                         | `a refused frozen install refuses the gate steps`       | `  FAIL: a refused frozen install refuses the gate steps: want exit 1, got 0`                    | 4 more, case 36's two among them                               | exit 1, 89 ok |
| F5  | Replace it with `if command -v bun >/dev/null; then bun install --frozen-lockfile; fi` | `a missing installer refuses the gate steps`            | `  FAIL: a missing installer refuses the gate steps: want exit 127, got 0`                       | `the missing installer allowed later Nx work` only             | exit 1, 92 ok |

F2, F3 and F5 each fail their own assertion and not the others', so no single mutation stands in
for two checks. F1 is the whole-check removal R5 asks for. Per the executor preamble's rule 16 and
rule 20, the additional failures listed above are recorded, not a stop.

## 8. Verification

Run every command from the repository root. `bash bin/h2puni-gate.test.sh` takes about 12 seconds
and needs no Nx, no daemon and no network; it is NOT the host gate and you may run it.

| Command                                                                                                                                    | Expected                                                                                           | Slice   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------- |
| `bash bin/h2puni-gate.test.sh`                                                                                                             | Exit 0, last line `all cases passed`, `B + 9` `  ok:` lines (94 on the rehearsal tree).            | B, C, D |
| `shellcheck -x bin/h2puni-gate-steps.sh bin/h2puni-gate.test.sh`                                                                           | Exit 0, no output. `shellcheck` is a required tool; if it is absent, say so and do not skip.       | B, C    |
| The batch README's **OpenSpec validation** block                                                                                           | Exit 0, `failed 0`, `passed` equal to your own baseline plus 1.                                    | A, D    |
| `GSETTINGS_BACKEND=memory bunx prettier --check <the files you own>`                                                                       | Exit 0, `All matched files use Prettier code style!`.                                              | A, D    |
| `NX_DAEMON=false bunx nx format:check --all`                                                                                               | Exit 0. `--all` is required: the base-ref default is empty on main.                                | A, D    |
| `bun run tools/tool-git-hooks/src/hooks/doc-caps.ts`                                                                                       | Exit 0, no output.                                                                                 | D       |
| `bash bin/tool-wiki-lint.sh working . HEAD`                                                                                                | Exit 0, one JSON line with `"status":"inactive"`. Inactive is expected without an activation root. | D       |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test tools/tool-devsync/src/toolchain-pins.test.ts tools/tool-devsync/src/poller.test.ts` | Exit 0, `45 pass`, `0 fail` across 2 files. Both read the steps script.                            | B, C    |

**What these do not prove.** They do not prove that a real `bun install` succeeds on h2puni, that
the host has network, or that the gate's later Nx steps pass. The harness stubs the installer; the
real install is exercised only by a host gate run, which is the planner's.

## 9. Planner-only checks

None of these can run in the executor's sandbox, and each is listed with the delta to expect.

| Check                                                                                                    | Why planner-only                                                                                        | Expected delta                                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, files staged | The namespacing test runs the wiki index checker, which writes Git objects and refuses untracked files. | Exit 0, no count or digest moves. Rehearsed with all eight paths staged: `Successfully ran target test for project tool-devsync`.   |
| `env -u CLAUDECODE bun test apps/wiki/cli/src/policy/gate-entrypoints.test.ts`                           | Needs a provisioned Twilight Bureaucrat activation.                                                     | 55 pass, 2 fail — the SAME two failures the unmodified tree produces on an unprovisioned workstation. A third failure is a finding. |
| `bunx nx run-many -t test lint typecheck build` and the Bureaucrat targets                               | Whole targets; slow, and some spawn `bun` from Node.                                                    | Unchanged. This packet touches no TypeScript.                                                                                       |
| `bin/h2puni-gate.sh <sha>`                                                                               | The host gate itself; the executor must never run it.                                                   | This is the real proof: the first run after the merge must print `h2puni gate: running on <sha>` and install before validating.     |

## 10. Dispatch

No network. Nothing here binds a port, spawns a browser, needs Docker, or contacts a registry. The
harness runs a scratch Git repository under `$TMPDIR` (allowed by the execution contract), and its
cases 17 and 18 invoke `bin/h2puni-gate.sh` in a mode that refuses with exit 78 before the lock is
taken and before any Git state changes — that is existing behaviour, not something your slice adds.

## 11. Stop conditions

Each of these is FALSE on the real starting tree; a stop means the tree is not what this packet
verified.

- `bin/h2puni-gate-steps.sh` already contains a line matching `^bun install` — stop, the work is
  done or a neighbour did it.
- `bash bin/h2puni-gate.test.sh` is not green at your slice's step 0 — stop and report the
  failing assertions; do not edit around them.
- Step B5 reports a number of failing cases other than nine, or reports `all cases passed` — stop;
  either the new cases were not added where section 6 says, or the install already exists.
- A fault in section 7 leaves its NAMED assertion passing — restore, check the location once
  against the single `^bun install` line, redo it once, and report both runs; only then stop.
- `sed -n 2p` in step B3 does not find the validator invocation on the second line — stop; the
  call log's order is the fact this packet rests on.
- The OpenSpec validation block reports any `failed` count above zero, at any step — stop.
- `apps/wiki/cli/src/policy/gate-entrypoints.test.ts` starts failing a THIRD test — stop; two
  pre-existing failures on an unprovisioned workstation are expected.
- Your slice needs a file outside section 5's file plan — stop.

## 12. Ready to commit

After slice D the tree differs from `batch-3/planning` in exactly these paths.
`git status --short --untracked-files=all`:

```text
 M AGENTS.md
 M bin/h2puni-gate-steps.sh
 M bin/h2puni-gate.test.sh
 M docs/findings/checks-that-cannot-fail-puni-00.md
?? openspec/changes/host-gate-locked-install/.openspec.yaml
?? openspec/changes/host-gate-locked-install/proposal.md
?? openspec/changes/host-gate-locked-install/specs/host-gate/spec.md
?? openspec/changes/host-gate-locked-install/tasks.md
?? openspec/changes/host-gate-locked-install/verify.md
```

`bin/h2puni-gate-steps.sh` is in that list because of slice C's required `Proof:` comment as well
as slice B's install line. `CLAUDE.md` and `GEMINI.md` are symlinks and never appear.

## 13. Open questions, answered

| Question                                                   | Answer taken, not asked                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Should the gate refuse when `node_modules` is absent?      | No. The installer creates it; a separate refusal would be a check with nothing to check. Assumption 3. |
| Should the install be cached or narrowed?                  | No. It matches CI exactly, so a green gate and a green CI mean the same thing. Assumption 8.           |
| Which capability owns the gate?                            | None existed; `host-gate` is created here. Assumption 6.                                               |
| Does the catalogue's count of twenty-nine change?          | No. That sentence is about the inherited catalogue; each entry states its own ordinal. Step D2.        |
| Does this move the Twilight Bureaucrat validator identity? | No file is added under `apps/wiki/cli`, so no. No test pins that identity as a literal in any case.    |
