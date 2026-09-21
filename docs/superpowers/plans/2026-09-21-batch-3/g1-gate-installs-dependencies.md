# G1 The h2puni gate installs the locked dependencies before it runs

| Field      | Value                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| Work item  | "h2puni gate installs the locked dependencies before it runs", under 080                     |
| Size class | S, in four slices                                                                            |
| Slices     | A OpenSpec change, B harness and install, C six negative proofs, D documents                 |
| Estimate   | 0.25 / 0.5 / 1.5 days; 700,000 tokens                                                        |
| Implements | The finding of 2026-09-20 recorded in section 3 of this packet                               |
| Planned on | 2026-09-21, rehearsed end to end in a private worktree at `da8be091`; revised after review 1 |

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
| `bin/h2puni-gate-steps.sh`                                                | The file slice B edits. 31 lines; read all of it.                                                         |
| `bin/h2puni-gate.test.sh`                                                 | The harness slice B extends. Read `prepare_gate_steps_path`, `run_gate_steps_fixture` and cases 22 to 33. |
| `bin/h2puni-gate.sh`                                                      | How the steps script is invoked, and why the steps run inside the lock. Not edited.                       |
| `docs/findings/checks-that-cannot-fail-puni-00.md`                        | The catalogue slice D appends to, and its house style.                                                    |
| `docs/superpowers/plans/2026-09-20-batch-2/110-6-retire-upstream-sync.md` | Section 5 of this packet: 110.6 also edits that catalogue file.                                           |

## 3. Verified facts

Every line below was read in the repository at `da8be091` on 2026-09-21 and, where it is a
command result, observed in a private worktree of that commit.

| Fact                                                                                                                                                                                                                                                                                                                                                                                               | Evidence                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The gate steps never install. The script is 31 lines: argument checks, `cd`, OpenSpec validation, five Nx invocations at lines 25, 28, 29, 30 and 31.                                                                                                                                                                                                                                              | `bin/h2puni-gate-steps.sh:1-31`                                                                           |
| `cd "$repo"` is line 6, and `openspec_report=$(mktemp)` is line 8, with line 7 blank. The install goes between them.                                                                                                                                                                                                                                                                               | `bin/h2puni-gate-steps.sh:6-8`                                                                            |
| CI does install, in three jobs, as `bun install --frozen-lockfile`.                                                                                                                                                                                                                                                                                                                                | `.github/workflows/ci.yml:269`, `:792`, `:944`                                                            |
| The gate steps are the argument to `gate_with_pinned_head`, so they run inside the heavy lock and after the checkout.                                                                                                                                                                                                                                                                              | `bin/h2puni-gate.sh:110-113`                                                                              |
| The harness stubs the tools the steps call by building a `bin` directory and running the real steps script with `PATH` set to it alone. `bun` is not among the stubs today.                                                                                                                                                                                                                        | `bin/h2puni-gate.test.sh:81-123`                                                                          |
| `run_gate_steps_fixture` passes `"$repo_root" HEAD` and captures stdout and stderr to files in the fixture.                                                                                                                                                                                                                                                                                        | `bin/h2puni-gate.test.sh:114-123`                                                                         |
| Case 22 asserts the FIRST line of the call log is the validator invocation. An install logged to the same file moves it to the second line, so that one assertion must change with this work.                                                                                                                                                                                                      | `bin/h2puni-gate.test.sh:481-482`                                                                         |
| `bash bin/h2puni-gate.test.sh` on the unmodified tree: exit 0, `all cases passed`, **85** `  ok:` lines, 11.7 s wall.                                                                                                                                                                                                                                                                              | Observed 2026-09-21                                                                                       |
| The Nx-free entry point for the harness is the root script `gate-pinning:test`; CI runs it as `bash bin/h2puni-gate.test.sh`.                                                                                                                                                                                                                                                                      | `package.json:29`, `.github/workflows/ci.yml:600-601`                                                     |
| `tools/tool-devsync/src/toolchain-pins.test.ts` and `tools/tool-devsync/src/poller.test.ts` read the steps script, but only for the solver-image-smoke line and the moved solver paths.                                                                                                                                                                                                            | `toolchain-pins.test.ts:79`, `:90-91`; `poller.test.ts:1076-1088`                                         |
| `apps/wiki/cli/src/policy/gate-entrypoints.test.ts` reads the steps script and asserts only `--exclude=twilight-burokrat` and the Burokrat source-lint command.                                                                                                                                                                                                                                    | `gate-entrypoints.test.ts:1199`, `:1288-1289`                                                             |
| The devsync namespacing digest scans `bin/` files but counts only lines matching its legacy-root pattern. **Neither gate script contains a match**, so the digest and occurrence count do not move.                                                                                                                                                                                                | `repo-namespacing-handoff.test.ts:26-28`, `:317-333`, `:355`; grep observed empty                         |
| `tools/tool-fleet/src/check-tools.json` lists both gate scripts under `uncheckedExecutables`; it lists paths, not contents, so no edit is needed.                                                                                                                                                                                                                                                  | `check-tools.json:17-19`                                                                                  |
| `docs/findings/root-migration.v1.json` pins the INHERITED catalogue block-for-block. It does not name `checks-that-cannot-fail-puni-00.md` at all, so that file takes additions.                                                                                                                                                                                                                   | `grep -c puni-00 docs/findings/root-migration.v1.json` printed `0`                                        |
| `docs/findings/README.md`'s module index lists the catalogue file as a path membership, with no count and no per-entry pin.                                                                                                                                                                                                                                                                        | `docs/findings/README.md:3`                                                                               |
| No capability under `openspec/specs/` owns the host gate. Twelve capabilities exist; none is about it.                                                                                                                                                                                                                                                                                             | `ls openspec/specs`                                                                                       |
| Strict OpenSpec validation on the unmodified tree: `{"items":107,"passed":107,"failed":0}`.                                                                                                                                                                                                                                                                                                        | Observed 2026-09-21                                                                                       |
| `apps/wiki/cli/src/policy/gate-entrypoints.test.ts` passes **57 of 57** when it is given the runtime its own Nx target configures. Run without `TOOL_WIKI_TRUSTED_NODE_MODULES` it fails 2 of 57 at `trusted TypeScript runtime modules are not provisioned`; that is the command's fault, not a missing workstation activation.                                                                   | Observed 2026-09-21 on the unmodified tree and again with this change applied                             |
| `apps/wiki/cli/project.json`'s `test` target sets `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules`, `cwd` `apps/wiki/cli`, and `--preload ../../../tools/test/scratch/preload.ts`. A direct `bun test` of one of its files must supply all three or it is not running the repository's check.                                                                                           | `apps/wiki/cli/project.json`, `test` target                                                               |
| `tools/test/scratch/preload.ts` sets `setDefaultTimeout(30_000)`. `tools/tool-devsync/project.json`'s `test` command is `bun test --preload ../test/scratch/preload.ts`, so a direct `bun test` without it runs process-spawning tests under Bun's 5 s default. From the workspace root the flag needs the leading `./`: `--preload tools/test/scratch/preload.ts` fails with `preload not found`. | `tools/test/scratch/preload.ts:22`; `tools/tool-devsync/project.json`, `test` target; observed 2026-09-21 |
| `openspec new change <name>` refuses when the change directory already exists, so step A1 must run before any directory is created by hand.                                                                                                                                                                                                                                                        | Observed 2026-09-21                                                                                       |

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

| Packet                       | Contact                                                                                                             | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 110.6 retire upstream sync   | Its slice A edits `docs/findings/checks-that-cannot-fail-puni-00.md`, rewording two stale descriptors near the top. | **Prerequisite already satisfied.** 110.6's slice A landed in `7d4ba6ec`, an ancestor of `da8be091`: `docs/findings/checks-that-cannot-fail-puni-00.md:3-4` already reads "recorded here after the wbs-tool-v1 history was merged in" and "the inherited catalogue". Nothing is owed here. Slice D edits the opening total (twenty-nine to thirty) and appends at the end; any later 110.6 hunk is the planner's to rebase. |
| 110.1 test axes              | Adds an OpenSpec change, moving the validator's item total.                                                         | Section 8 records the total relative to a baseline this packet's slices take themselves. No absolute number appears anywhere.                                                                                                                                                                                                                                                                                               |
| 010.7 rules, 010.6 templates | Add source files under `apps/wiki/cli`, changing the Twilight Burokrat validator identity.                          | This packet adds no file there, so it does not move that identity. No test pins it as a literal.                                                                                                                                                                                                                                                                                                                            |
| 020.2, 020.7, 040.1, 040.4   | None. No file in section 5 is touched by them.                                                                      | Nothing to do.                                                                                                                                                                                                                                                                                                                                                                                                              |

## 6. Slices

Each slice records its own baseline first. Every count below was observed on 2026-09-21 in a
private worktree of `da8be091`; where your own baseline differs, use yours and report the
difference.

### Slice A. The OpenSpec change

- [ ] A0. Baseline. Run the batch README's **OpenSpec validation** block and record the printed
      totals. Observed on the unmodified tree: `items 107, passed 107, failed 0`. Call the passed
      number `N`.
- [ ] A1. Create the change with the batch README's **Creating an OpenSpec change** block, using
      the name `host-gate-locked-install`. Do not create the directory first: the command refuses
      when it already exists. Expected: `Created change 'host-gate-locked-install'` and the `grep`
      prints one `schema: sdd-lean` line. If it prints nothing, stop. Then
      `mkdir -p openspec/changes/host-gate-locked-install/specs/host-gate`.
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
  - [ ] Prove the six injected faults
  - [ ] Record the incident in the findings catalogue and correct the Gate routing text
  ```

- [ ] A5. Create `openspec/changes/host-gate-locked-install/verify.md` with a `# Verification`
      heading and one line naming the baseline from A0. Each later slice appends its own
      observations here, referring to evidence by basename only, never by absolute path.
- [ ] A6. Finish every edit to the five files first, then format them with
      `GSETTINGS_BACKEND=memory bunx prettier --write`, then run the repository-wide format check
      (section 8). Formatting before the last edit is how a handover leaves an unformatted file.
- [ ] A7. Re-run the OpenSpec validation block. Expected: `failed 0` and `passed` equal to
      **your own A0 number plus one**, because this slice adds exactly one change. Observed on the
      rehearsal tree: 107 then 108. No later slice adds a change, so no later slice expects a rise.
- [ ] A8. Stop and report. Ready to commit, message
      `docs(openspec): require the host gate to install the locked dependencies`, paths:
      the five files under `openspec/changes/host-gate-locked-install/`.

### Slice B. The harness, then the install

- [ ] B0. Baseline and pre-edit check. Run the prerequisite block below: expect it to print
      exactly `installs=0 proofs=3 proofs-before-install=3` and to exit **0**. Then run
      `bash bin/h2puni-gate.test.sh` and record its exit status and its number of `  ok:` lines —
      observed exit 0, `all cases passed`, **85** ok lines; call that number `B` and compare every
      later count in this slice with `B`, never with 85. Then run the focused devsync command in
      section 8 and record its pass count as `Bd` with no failures — observed 45 pass, 0 fail;
      later runs must be unchanged at `Bd`, not equal to 45. An `installs` above `0` means the
      install already exists: stop, this slice is done. A `proofs` count other than 3 means the
      file is not the one this packet read, since `bin/h2puni-gate-steps.sh` carries three
      `# Proof:` comments, at lines 10, 13 and 26: stop. A bare `grep -c` is not usable for this
      check, because `grep` exits **1** when it matches nothing, which is exactly this slice's
      expected state, and under `set -e` that aborts the shell before the baseline is taken; the
      block accepts exactly status 1 and lets any higher status propagate, the shape the batch
      README's mutation-patch block uses for `diff`.

  ```sh
  set -euo pipefail
  steps=bin/h2puni-gate-steps.sh
  installs=$(grep -c '^bun install' "$steps") || test $? -eq 1
  proofs=$(grep -c '^# Proof:' "$steps") || test $? -eq 1
  before=$(sed -n '1,/^bun install/p' "$steps" | grep -c '^# Proof:') || test $? -eq 1
  printf 'installs=%s proofs=%s proofs-before-install=%s\n' "$installs" "$proofs" "$before"
  ```

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
- [ ] B5. Run `bash bin/h2puni-gate.test.sh`. Expected RED: exit 1, `10 failing case(s)`, `B` ok
      lines (85 on the rehearsal tree). The total is unchanged rather than raised because the new
      cases contribute exactly one pass at this point — case 34's `expect_status 0`, which
      succeeds because the original steps still complete — while case 22 loses the one pass it had
      (B3 moved the validator to the second line and no install occupies the first). The ten
      failures
      are the list in section 7's fault F1, and they include
      `the gate invokes the pinned validator contract: want '@fission-ai/openspec@1.12.0 validate
--all --json', got ''`: that one is EXPECTED here, because B3 has moved the validator to the
      second line and B6 has not yet put an install on the first. A different number of failures,
      or a green run, is a stop.
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
      `B + 10` ok lines (95 on the rehearsal tree).
- [ ] B8. Run shellcheck over both scripts (section 8). Expected exit 0 and no output.
- [ ] B9. Append the B0, B5, B7 and B8 observations to the change's `verify.md`, referring to
      evidence by basename only. Then format that file with
      `GSETTINGS_BACKEND=memory bunx prettier --write` and run the repository-wide format check
      (section 8). Expected exit 0. Evidence edits come before formatting, never after.
- [ ] B10. Stop and report. Ready to commit, message
      `test(gate): prove the host gate installs the locked dependencies`, paths:
      `bin/h2puni-gate-steps.sh`, `bin/h2puni-gate.test.sh`,
      `openspec/changes/host-gate-locked-install/verify.md`.

### Slice C. Six negative proofs

Follow the batch README's **Negative proofs with a restore** and **Saving a mutation patch**
blocks. Copy `bin/h2puni-gate-steps.sh` to `$TMPDIR/steps.passing` once, before the first fault,
and restore from that copy with `cp` and verify with `cmp` after each one. Never restore from Git.

- [ ] C0. Baseline and pre-edit check. Run slice B0's **prerequisite block** unchanged.
      Expected, exactly: `installs=1 proofs=3 proofs-before-install=0`, exit 0. `installs=0` means
      slice B is not in your clone — stop. `proofs-before-install=1` means slice C's proof comment
      is already there — stop, this slice is done. Then run `bash bin/h2puni-gate.test.sh`:
      expected exit 0, `all cases passed`. Record the `  ok:` count and call it `C` (95 on the
      rehearsal tree). Every count below is against `C`. Record the focused devsync pass count as
      `Cd` as well (45 on the rehearsal tree).
- [ ] C1 to C6. Inject each of the six faults in section 7's table in turn, run the harness, save
      the failing output under `$TMPDIR/evidence/`, restore, `cmp`, and re-run green before the
      next one. Every fault replaces or wraps the single line matching `^bun install` in
      `bin/h2puni-gate-steps.sh`; `grep -c '^bun install' bin/h2puni-gate-steps.sh` prints `1`
      before each injection, so there is no second candidate line to patch by mistake.
- [ ] C7. Only after watching all six, add the `Proof:` comment immediately above the single
      `bun install --frozen-lockfile` line, below all five rationale comment lines added in B6,
      describing what you saw:

  ```sh
  # Proof: 2026-09-21. Deleting this line made h2puni-gate.test.sh fail ten cases, among them
  # `the gate does not install against the frozen lockfile` and `a refused frozen install refuses
  # the gate steps: want exit 1, got 0`. Dropping `--frozen-lockfile` failed only the first of
  # those; moving the line below the OpenSpec block failed `the install does not precede OpenSpec
  # validation (install line '2', validate line '1')`; appending `|| true` failed the second; and
  # guarding it with `command -v bun` failed `a missing installer refuses the gate steps: want
  # exit 127, got 0`; and validating before exiting 127 when bun is absent failed only
  # `the missing installer allowed OpenSpec validation`.
  ```

  Every quoted fragment above is what the rehearsal on 2026-09-21 printed. Replace each one with
  the text YOUR run printed and date the comment with the day you ran it. The comment states what
  you saw, never what this packet predicted.

- [ ] C8. Run `bash bin/h2puni-gate.test.sh` and shellcheck once more. Expected exit 0 both
      times, and `C` ok lines — the `Proof:` comment adds no case, so the count does not move.
      Re-run slice B0's prerequisite block: it must now print
      `installs=1 proofs=4 proofs-before-install=1`, which is what slice D checks for.
- [ ] C9. Append each fault, its named failing assertion and the literal line you saw to the
      change's `verify.md`, and tick the third task in `tasks.md`. Then format both files with
      `GSETTINGS_BACKEND=memory bunx prettier --write` and run the repository-wide format check.
      Expected exit 0.
- [ ] C10. Stop and report. Ready to commit, message
      `test(gate): record the watched faults for the gate install`, paths:
      `bin/h2puni-gate-steps.sh`, `openspec/changes/host-gate-locked-install/tasks.md`,
      `openspec/changes/host-gate-locked-install/verify.md`.

### Slice D. The routing text and the catalogue

- [ ] D0. Baseline and pre-edit check. Run slice B0's prerequisite block unchanged: expect
      exactly `installs=1 proofs=4 proofs-before-install=1` and exit 0. That signature is the only
      one that distinguishes slice C's tree from slice B's — `bin/h2puni-gate-steps.sh` already
      carries three `# Proof:` comments before this packet touches it, so a total count alone
      proves nothing — and `proofs-before-install=0` means slice C's watched faults and its proof
      comment are missing: stop, and do not write the documents for work that was not proved. Then
      run the OpenSpec validation block and `bash bin/h2puni-gate.test.sh`, recording both numbers
      as `D` (passed) and `Dh` (ok lines); expected `failed 0`, and exit 0 with `all cases passed`.
      This slice adds no OpenSpec change and no harness case, so **both numbers must be UNCHANGED
      at D5.**
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
  anything: it ran OpenSpec validation and five Nx steps against whatever `node_modules` an earlier
  gate had left in the shared tree. On 2026-09-20 that was 2026-09-18's install, without `di-bag`,
  `application-exception` or `caught-object-report-json`, so every host gate since batch 1 had
  reported green about a commit whose locked dependencies it had never read, and passed only
  because nothing that executed there imported the three new libraries. The first batch 2 group
  gate finally failed `apps/wbs/be-01/src/production-entrypoint.test.ts` on
  `Could not resolve: "di-bag"`, and the planner installed by hand. CI installs at the top of its
  gate job; the host gate did not, and no test asked whether it did. **A gate that reads a tree it
  never assembled is reporting about a different commit than the one it names.**
  ```

  Also change the opening paragraph's total. `docs/findings/checks-that-cannot-fail-puni-00.md:3-6`
  reads "With these, the count is **twenty-nine**", and "with these" means with this file's own
  entries — adding the thirtieth makes it thirty. There is exactly one occurrence of
  `count is **twenty-nine**.`; replace it with `count is **thirty**.`. No test pins either word,
  and neither matches the namespacing digest's pattern (section 3).

- [ ] D3. Run `bun run tools/tool-git-hooks/src/hooks/doc-caps.ts`. Expected exit 0, no output.
- [ ] D4. (Formatting happens in D6, after the last edit. Nothing to do here; this step is kept
      only so the step letters in a report match this packet.)
- [ ] D5. Run the OpenSpec validation block, `bash bin/h2puni-gate.test.sh`, and
      `bash bin/tool-wiki-lint.sh working . HEAD`. Expected: `failed 0` and `passed` EQUAL to `D`;
      exit 0 with `all cases passed` and `Dh` ok lines; and exit 0 printing one JSON line whose
      `status` is `inactive` with `"reason":"external activation root is not provisioned"` — that
      is the expected local result, not a failure. A `passed` total of `D + 1` here means a change
      was created that this slice does not own: stop.
- [ ] D6. Tick the remaining tasks in `tasks.md` and append D0 to D5 to `verify.md`. Then, with
      every edit of this slice finished, format the four Markdown files you changed:

  ```sh
  GSETTINGS_BACKEND=memory bunx prettier --write AGENTS.md \
    docs/findings/checks-that-cannot-fail-puni-00.md \
    openspec/changes/host-gate-locked-install/tasks.md \
    openspec/changes/host-gate-locked-install/verify.md
  ```

  `AGENTS.md` is a regular file — `CLAUDE.md` and `GEMINI.md` are the symlinks to it — so naming it
  here is safe and was observed exiting 0 after the D1 edit. Then run the repository-wide format
  check. Expected: exit 0.

- [ ] D7. Stop and report. Ready to commit, message
      `docs(gate): record the stale-dependency finding and correct the Gate routing`, paths:
      `AGENTS.md`, `docs/findings/checks-that-cannot-fail-puni-00.md`,
      `openspec/changes/host-gate-locked-install/tasks.md`,
      `openspec/changes/host-gate-locked-install/verify.md`.

## 7. Exact new harness text, and the six faults

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
if grep -q '^@fission-ai/openspec' "$missing_bun_fixture/calls" 2>/dev/null; then
  fail 'the missing installer allowed OpenSpec validation'
else
  pass 'the missing installer stops before OpenSpec validation'
fi
if [[ -e $missing_bun_fixture/later ]]; then
  fail 'the missing installer allowed later Nx work'
else
  pass 'the missing installer stops before later Nx work'
fi
```

The `2>/dev/null` on that `grep` matters: when the install is the first thing the steps do and it
is absent, the call log may not exist at all, and `grep` would otherwise print to stderr. Its
non-zero status is read as "no OpenSpec invocation", which is the fact being asserted.

The three cases add ten `ok:` lines: `a passing install and report admit the remaining gate steps
(exit 0)`, `the gate installs against the frozen lockfile`, `the install precedes OpenSpec
validation`, `a refused frozen install refuses the gate steps (exit 1)`, `the refused install keeps
the installer message in gate output`, `the refused install stops before OpenSpec validation`,
`the refused install stops before later Nx work`, `a missing installer refuses the gate steps (exit
127)`, `the missing installer stops before OpenSpec validation`, `the missing installer stops
before later Nx work`.

Case 36 needs all three of its assertions. Exit 127 and an absent Nx marker alone would be
satisfied by a steps script that validated OpenSpec first and then exited 127, which the delta
spec forbids; fault F6 is exactly that script, and it is refused only by the middle assertion.

### The faults, each rehearsed on 2026-09-21

Every fault is injected into `bin/h2puni-gate-steps.sh`, which contains exactly ONE line matching
`^bun install`; `grep -c '^bun install' bin/h2puni-gate-steps.sh` prints `1` before each injection,
so no fault has two candidate locations. The harness is `bash bin/h2puni-gate.test.sh`. The ok
counts below are against the rehearsed green of 95; express yours against your own `C`.

| Id  | Injected fault                                                                                                                                                        | Named assertion that must fail                          | Literal line observed                                                                            | Also failed                                                    | Result                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------ |
| F1  | Delete the `bun install --frozen-lockfile` line entirely                                                                                                              | `the gate does not install against the frozen lockfile` | `  FAIL: the gate does not install against the frozen lockfile`                                  | 9 more, case 22's validator-contract assertion among them      | exit 1, `C - 10` ok (85) |
| F2  | Replace it with `bun install` (drop `--frozen-lockfile`)                                                                                                              | `the gate does not install against the frozen lockfile` | `  FAIL: the gate does not install against the frozen lockfile`                                  | none — exactly one failing assertion                           | exit 1, `C - 1` ok (94)  |
| F3  | Move the line to just after `trap - EXIT`, below the jq block                                                                                                         | `the install does not precede OpenSpec validation`      | `  FAIL: the install does not precede OpenSpec validation (install line '2', validate line '1')` | case 22's validator contract, and the two before-OpenSpec ones | exit 1, `C - 4` ok (91)  |
| F4  | Append `\|\| true` to the line                                                                                                                                        | `a refused frozen install refuses the gate steps`       | `  FAIL: a refused frozen install refuses the gate steps: want exit 1, got 0`                    | 5 more, case 36's three among them                             | exit 1, `C - 6` ok (89)  |
| F5  | Replace it with `if command -v bun >/dev/null; then bun install --frozen-lockfile; fi`                                                                                | `a missing installer refuses the gate steps`            | `  FAIL: a missing installer refuses the gate steps: want exit 127, got 0`                       | case 36's other two assertions                                 | exit 1, `C - 3` ok (92)  |
| F6  | Insert, immediately above the install line, `if ! command -v bun >/dev/null; then` / `  bunx @fission-ai/openspec@1.12.0 validate --all --json` / `  exit 127` / `fi` | `the missing installer allowed OpenSpec validation`     | `  FAIL: the missing installer allowed OpenSpec validation`                                      | none — exactly one failing assertion                           | exit 1, `C - 1` ok (94)  |

F2 and F6 each fail exactly one assertion, F3's four failures are all about the one fact that the
install no longer precedes the validator, and F5 fails only case 36's three, so no single mutation
stands in for two unrelated checks: the frozen-lockfile contract, the ordering, the refusal on a
failing install and the refusal on an absent installer each have a fault that is refused by that
assertion alone or by that case alone. F1 is the whole-check removal R5 asks for. Per the executor
preamble's rules 16 and 20, the additional failures listed above are recorded, not a stop.

F6 is the fault the first review of this packet supplied. It was added after the review, together
with case 36's middle assertion, and rehearsed red (one named failure) and green on 2026-09-21.

## 8. Verification

Run every command from the repository root. `bash bin/h2puni-gate.test.sh` takes about 12 seconds
and needs no Nx, no daemon and no network; it is NOT the host gate and you may run it. Every count
is against the baseline the SAME slice recorded at its own step 0 — `B` and `C` are ok-line counts,
`D`/`Dh` are slice D's OpenSpec and ok-line numbers. Never compare with another slice's number and
never with the rehearsal's absolute figures.

| Command                                                                                                                                                                              | Expected                                                                                                                                                                                                                                                                                                                                             | Slice      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `bash bin/h2puni-gate.test.sh`                                                                                                                                                       | B: exit 1 with `10 failing case(s)` at B5, then exit 0 with `all cases passed` and `B + 10` ok lines at B7. C and D: exit 0, `C` / `Dh` ok lines unchanged.                                                                                                                                                                                          | B, C, D    |
| `shellcheck -x bin/h2puni-gate-steps.sh bin/h2puni-gate.test.sh`                                                                                                                     | Exit 0, no output. `shellcheck` is a required tool; if it is absent, say so and do not skip.                                                                                                                                                                                                                                                         | B, C       |
| The batch README's **OpenSpec validation** block                                                                                                                                     | A: `failed 0`, `passed` = `A0 + 1`. D: `failed 0`, `passed` = `D`, unchanged.                                                                                                                                                                                                                                                                        | A, D       |
| `GSETTINGS_BACKEND=memory bunx prettier --check <the files you own>`                                                                                                                 | Exit 0, `All matched files use Prettier code style!`. Run it only after the slice's last edit.                                                                                                                                                                                                                                                       | A, D       |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all`                                                                                                                | Exit 0. `--all` is required: the base-ref default is empty on main.                                                                                                                                                                                                                                                                                  | A, B, C, D |
| `bun run tools/tool-git-hooks/src/hooks/doc-caps.ts`                                                                                                                                 | Exit 0, no output.                                                                                                                                                                                                                                                                                                                                   | D          |
| `bash bin/tool-wiki-lint.sh working . HEAD`                                                                                                                                          | Exit 0, one JSON line with `"status":"inactive"`. Inactive is the expected result without an activation root.                                                                                                                                                                                                                                        | D          |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test tools/tool-devsync/src/toolchain-pins.test.ts tools/tool-devsync/src/poller.test.ts --preload ./tools/test/scratch/preload.ts` | Exit 0, `45 pass`, `0 fail`, `Ran 45 tests across 2 files`. Both files read the steps script. The preload is the devsync target's own and sets the 30 s default timeout; without it the process-spawning tests in `poller.test.ts` run under Bun's 5 s default. The leading `./` is required — `--preload tools/...` fails with `preload not found`. | B, C       |

**What these do not prove.** They do not prove that a real `bun install` succeeds on h2puni, that
the host has network, or that the gate's later Nx steps pass. The harness stubs the installer; the
real install is exercised only by a host gate run, which is the planner's.

## 9. Planner-only checks

None of these can run in the executor's sandbox, and each is listed with the value observed on the
rehearsal tree so a deviation is visible rather than argued.

| Check                                                                                                                                                                                                          | Why planner-only                                                                                        | Expected, and what was observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, run with the slice's paths STAGED                                                         | The namespacing test runs the wiki index checker, which writes Git objects and refuses untracked files. | `Successfully ran target test for project tool-devsync`, exit 0, and NO pin moves. Rehearsed on 2026-09-21 with all nine cumulative paths staged.                                                                                                                                                                                                                                                                                                                                                                                         |
| `TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/node_modules" env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test apps/wiki/cli/src/policy/gate-entrypoints.test.ts --preload ./tools/test/scratch/preload.ts` | It reads the steps script, and it needs the runtime and preload its Nx target configures.               | Run it on the frozen baseline BEFORE staging, record the pass count and `0 fail`, then run it again after staging and require the SAME pass count and still `0 fail`; a named test whose outcome differs is a finding, never environmental. Rehearsal observation only: **57 pass, 0 fail, exit 0** on the unmodified tree and again with this change applied, 2026-09-21. Dropping the runtime variable produces two spurious `trusted TypeScript runtime modules are not provisioned` failures — that is a wrong command, not a result. |
| The batch README's **Integration verification** matrix, steps 1 to 4                                                                                                                                           | Whole targets; slow, and some spawn `bun` from Node.                                                    | Unchanged by this packet, which touches no TypeScript. Its step 3 is `bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache --exclude=twilight-burokrat` and its step 4 the Burokrat's own `test typecheck build`, then `twilight-burokrat:lint:source --skip-nx-cache` — the split `bin/h2puni-gate-steps.sh:28-30` makes. These are WORKSTATION-only; AGENTS.md forbids raw full Nx gates on h2puni.                                                                                                               |
| `git commit` of the nine paths with hooks on (the planner commits; the executor cannot)                                                                                                                        | The executor's `.git` is read-only.                                                                     | Exit 0. Rehearsed for real on 2026-09-21 by committing the whole prescribed change in a private worktree: `tool-wiki` ok (inactive report), `plaintext-secrets` ok, `format` ok, `agent-authored-by` ok on both message hooks; `lint`, `migration-lint` and `doc-caps` all skipped as having no matching staged files. Reset afterwards. Nothing in this packet's prescribed text is refused by a hook, a lint rule or the formatter.                                                                                                     |
| `bin/h2puni-gate.sh <sha>` on h2puni, with the committed sha                                                                                                                                                   | The host gate itself; the executor must never run it, and this packet was planned without host access.  | The real proof. It must print `h2puni gate: running on <sha>` and, this time, an install before the validator output. This is the ONLY check that exercises a real `bun install`; report it as pending until it has run.                                                                                                                                                                                                                                                                                                                  |

## 10. Dispatch

No network. Nothing here binds a port, spawns a browser, needs Docker, or contacts a registry. The
harness runs a scratch Git repository under `$TMPDIR` (allowed by the execution contract), and its
cases 17 and 18 invoke `bin/h2puni-gate.sh` in a mode that refuses with exit 78 before the lock is
taken and before any Git state changes — that is existing behaviour, not something your slice adds.

## 11. Stop conditions

Each condition names the slice it belongs to, and each is FALSE at that slice's own step 0 on the
tree that slice starts from. A condition from another slice is not yours: slices B, C and D start
from different trees, because the planner commits between them.

**Slice B only.**

- `grep -c '^bun install' bin/h2puni-gate-steps.sh` prints anything but `0` at B0 — stop, the
  install already exists and this slice has nothing to do.
- B5 reports a number of failing cases other than ten, or reports `all cases passed` — stop;
  either the new cases were not added where section 6 says, or an install already exists.
- B7 is not green, or its ok count is not `B + 10` — stop.

**Slices C and D only.**

- `grep -c '^bun install' bin/h2puni-gate-steps.sh` prints `0` at step 0 — stop; your clone
  predates slice B and the work you are asked to prove does not exist yet.
- `bash bin/h2puni-gate.test.sh` is not green at step 0 — stop and report the failing assertions;
  do not edit around them.

**Every slice.**

- A fault in section 7 leaves its NAMED assertion passing — restore, confirm against the single
  `^bun install` line that the location was right, redo it once, and report both runs; only then
  stop.
- The OpenSpec validation block reports any `failed` count above zero — stop.
- Slice D's OpenSpec `passed` total differs from its own `D` — stop; a change was created or
  removed outside this slice's lane.
- The planner's `gate-entrypoints.test.ts` command, run with the runtime and preload section 9
  names, reports any failure — stop and investigate. Two failures from omitting
  `TOOL_WIKI_TRUSTED_NODE_MODULES` are a wrong command, not a result.
- Your slice needs a file outside section 5's file plan — stop.

Deliberately NOT a stop: at B5 the harness prints
`FAIL: the gate invokes the pinned validator contract: want '@fission-ai/openspec@1.12.0 validate
--all --json', got ''`. That is the prescribed red phase — B3 moved the validator to the second
line and B6 has not yet put the install on the first.

## 12. Ready to commit

The planner reviews and commits between slices, so each slice hands over its own working tree, not
a cumulative one. Run `git status --short --untracked-files=all` at the end of your slice and
expect exactly its rows.

**Slice A** — five untracked files, nothing modified:

```text
?? openspec/changes/host-gate-locked-install/.openspec.yaml
?? openspec/changes/host-gate-locked-install/proposal.md
?? openspec/changes/host-gate-locked-install/specs/host-gate/spec.md
?? openspec/changes/host-gate-locked-install/tasks.md
?? openspec/changes/host-gate-locked-install/verify.md
```

Message: `docs(openspec): require the host gate to install the locked dependencies`.

**Slice B** — slice A is committed, so its files are tracked:

```text
 M bin/h2puni-gate-steps.sh
 M bin/h2puni-gate.test.sh
 M openspec/changes/host-gate-locked-install/verify.md
```

Message: `test(gate): prove the host gate installs the locked dependencies`.

**Slice C** — only the `Proof:` comment and the evidence:

```text
 M bin/h2puni-gate-steps.sh
 M openspec/changes/host-gate-locked-install/tasks.md
 M openspec/changes/host-gate-locked-install/verify.md
```

Message: `test(gate): record the watched faults for the gate install`.

**Slice D** — the documents:

```text
 M AGENTS.md
 M docs/findings/checks-that-cannot-fail-puni-00.md
 M openspec/changes/host-gate-locked-install/tasks.md
 M openspec/changes/host-gate-locked-install/verify.md
```

Message: `docs(gate): record the stale-dependency finding and correct the Gate routing`.

**The cumulative change**, once all four are committed, is NINE paths. **This review is the
PLANNER's, not an executor step.** `git status` cannot show it, because every earlier slice is
already committed, and an executor clone has no local `batch-3/planning` to diff against: the
launcher clones with ordinary remote-tracking refs and creates only the attempt's own branch
(`/home/df/wd/puni/puni-plan/exec/run-executor.sh:39-40`), so in an existing batch-2 clone
`origin/batch-2/planning` resolves while `batch-2/planning^{commit}` fails. The planner reads it
against the base commit the ledger records for this packet's attempts, scoped to the nine owned
paths:

```sh
git diff --name-status <packet-base-sha> -- AGENTS.md \
  bin/h2puni-gate-steps.sh bin/h2puni-gate.test.sh \
  docs/findings/checks-that-cannot-fail-puni-00.md \
  openspec/changes/host-gate-locked-install
```

With `<packet-base-sha>` = `da8be091`, that printed exactly these on the rehearsal tree:

```text
M	AGENTS.md
M	bin/h2puni-gate-steps.sh
M	bin/h2puni-gate.test.sh
M	docs/findings/checks-that-cannot-fail-puni-00.md
A	openspec/changes/host-gate-locked-install/.openspec.yaml
A	openspec/changes/host-gate-locked-install/proposal.md
A	openspec/changes/host-gate-locked-install/specs/host-gate/spec.md
A	openspec/changes/host-gate-locked-install/tasks.md
A	openspec/changes/host-gate-locked-install/verify.md
```

`bin/h2puni-gate-steps.sh` appears in two slices: slice B's install line and slice C's required
`Proof:` comment. `CLAUDE.md` and `GEMINI.md` are symlinks to `AGENTS.md` and never appear.

## 13. Open questions, answered

| Question                                                 | Answer taken, not asked                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Should the gate refuse when `node_modules` is absent?    | No. The installer creates it; a separate refusal would be a check with nothing to check. Assumption 3.                                      |
| Should the install be cached or narrowed?                | No. It matches CI exactly, so a green gate and a green CI mean the same thing. Assumption 8.                                                |
| Which capability owns the gate?                          | None existed; `host-gate` is created here. Assumption 6.                                                                                    |
| Does the catalogue's count of twenty-nine change?        | Yes, to thirty. "With these, the count is twenty-nine" counts this file's own entries, so the thirtieth moves it. Step D2 makes both edits. |
| Does this move the Twilight Burokrat validator identity? | No file is added under `apps/wiki/cli`, so no. No test pins that identity as a literal in any case.                                         |

## 14. Disposition of review 1

Every finding was checked against the repository before acting, and every fix was settled by
rehearsal in a private worktree of `da8be091` on 2026-09-21, not by reasoning.

| Finding                                                       | Disposition                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical 1, stop conditions halt the packet's own sequence    | **FIXED.** Section 11 is rewritten per slice. The absent-install prerequisite is now slice B's alone (step B0); slices C and D require the line to be PRESENT at their step 0. The second-line validator failure at B5 is named as the expected red, not a stop.                                                                                                                                                         |
| Critical 2, slice D cannot produce an OpenSpec delta          | **FIXED.** Section 8 and steps D0 and D5 require slice D's `passed` total to equal its own `D`, unchanged; only slice A expects `A0 + 1`. Harness counts are `B`, `C` and `Dh`, each collected by the slice that uses it.                                                                                                                                                                                                |
| Important 1, the Burokrat check omits its configured runtime  | **FIXED, and the review was right about the cause.** With `TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/node_modules"`, `--preload ./tools/test/scratch/preload.ts` and the agent variables unset, `gate-entrypoints.test.ts` is **57 pass, 0 fail** — on the unmodified tree and with the change applied. The packet's old "55 pass, 2 fail is expected" claim is deleted from sections 3, 9 and 11; any failure is now a stop. |
| Important 2, case 36 does not test the full contract          | **FIXED.** Case 36 gains `the missing installer stops before OpenSpec validation`. The review's own mutation is fault F6: rehearsed, it fails that one assertion and nothing else (exit 1, 94 ok against 95). Green is now 95 ok; the red phase is ten failing cases; every count updated.                                                                                                                               |
| Important 3, the focused devsync command loses the timeout    | **FIXED.** `tools/tool-devsync/project.json`'s `test` command is `bun test --preload ../test/scratch/preload.ts`, and `tools/test/scratch/preload.ts:22` sets `setDefaultTimeout(30_000)`. Section 8 now carries the preload. From the root it needs the leading `./`: without it Bun prints `preload not found "tools/test/scratch/preload.ts"`. With it: 45 pass, 0 fail.                                              |
| Important 4, the broad planner command is not the split       | **FIXED.** Section 9 links the batch README's integration matrix and states its steps 3 and 4 explicitly, matching the split at `bin/h2puni-gate-steps.sh:28-30`, and says the matrix is workstation-only because AGENTS.md forbids raw full Nx gates on h2puni.                                                                                                                                                         |
| Important 5, the handoff status assumes nothing was committed | **FIXED**, then corrected in round 2: section 12 gives each slice its own `git status` rows, and the cumulative nine paths are now read by the PLANNER against the recorded base sha, because an executor clone has no local `batch-3/planning` (see review 2, Important 3). The "eight paths" claim in section 9 is gone.                                                                                               |
| Important 6, evidence edits escape formatting                 | **FIXED.** A6, B9, C8 and D6 finish every edit first, then format the owned files, then run the repository-wide check. D4 is emptied so the step letters still line up in a report.                                                                                                                                                                                                                                      |
| Minor 1, file length and command count                        | **FIXED.** `wc -l` prints 31, and `grep -n 'bunx nx'` prints lines 25, 28, 29, 30 and 31 — five. Sections 2, 3 and the proposed catalogue text say 31 and five.                                                                                                                                                                                                                                                          |
| Minor 2, CI line anchor                                       | **FIXED.** `.github/workflows/ci.yml:600` is the step name and `:601` the command; cited as `:600-601`.                                                                                                                                                                                                                                                                                                                  |
| Minor 3, "two comment lines" in C6                            | **FIXED.** C6 now says to insert the proof comment immediately above the single install line, below all five rationale lines.                                                                                                                                                                                                                                                                                            |
| Minor 4, the catalogue count                                  | **FIXED, the review was right.** `docs/findings/checks-that-cannot-fail-puni-00.md:5-6` reads "With these, the count is **twenty-nine**" — "with these" is this file's own entries. Step D2 now changes it to thirty, and section 13 agrees. The overlap with 110.6 is upgraded in section 5.                                                                                                                            |

Nothing was rejected. Re-rehearsed after the revision: harness 85 ok to **95** ok; red phase ten
failing cases; six faults with the counts in section 7; shellcheck exit 0; OpenSpec 107 to 108,
`failed 0`; `nx format:check --all` exit 0; doc-caps exit 0; `tool-wiki-lint.sh working . HEAD`
exit 0 and inactive; the whole `tool-devsync:test` target green with all nine paths staged; and
`gate-entrypoints.test.ts` 57 pass, 0 fail with its configured runtime.

## 15. Disposition of review 2

Every finding was checked against the repository before acting and settled by rehearsal on
2026-09-21. Nothing was rejected. Review 1's table above is kept as the record of that round;
where review 2 corrected it, this table is what holds.

| Finding                                                           | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Important 1, the prerequisite `grep -c` exits non-zero on success | **FIXED** in B0, and reused verbatim by C0 and D0. Reproduced: `grep -c '^bun install' bin/h2puni-gate-steps.sh` prints `0` and exits **1** on the unmodified tree. The prerequisite block now accepts exactly status 1 (`                                                                                                                                                                                                                                                                        |     | test $? -eq 1`, the batch README's `diff` shape) and lets any higher status propagate. Rehearsed in all three trees: exit 0 in each. |
| Important 2, D0 accepts a tree with no slice-C proof              | **FIXED**, and the review's count was right: `bin/h2puni-gate-steps.sh` already has **three** `# Proof:` comments, at lines 10, 13 and 26, so "at least three" was satisfied by slice B's tree. The block now also reports `proofs-before-install`, and the three trees have distinct signatures: `installs=0 proofs=3 proofs-before-install=3` (B start), `installs=1 proofs=3 proofs-before-install=0` (C start), `installs=1 proofs=4 proofs-before-install=1` (D start). All three rehearsed. |
| Important 3, the cumulative diff uses a ref executors do not have | **FIXED** in section 12: the cumulative review is marked PLANNER-only and reads `git diff --name-status <packet-base-sha> -- <the nine paths>`. Confirmed in the existing batch-2 clone `/home/df/wd/puni/batch-2/010-6-templates`: `origin/batch-2/planning` resolves, `batch-2/planning^{commit}` exits 1. The scoped command was rehearsed against `da8be091` and printed exactly the nine rows. Executors keep only their per-slice `git status`.                                             |
| Minor 1, focused-suite totals were absolute                       | **FIXED.** B0 and C0 record `Bd` / `Cd` for the devsync pair, and section 9 has the planner record the Burokrat suite's baseline before staging and require the same count after. 45 and 57 are labelled rehearsal observations.                                                                                                                                                                                                                                                                  |
| Minor 2, proof numbering contradicts itself                       | **FIXED.** Both headings say six; the injections are C1 to C6 and the comment step is now C7, with C8, C9 and C10 following; the single-assertion claim reads "F2 and F6", and F3's four failures are described as one fact.                                                                                                                                                                                                                                                                      |
| Minor 3, the red-count explanation was wrong                      | **FIXED** in B5, and the review's accounting is confirmed from the rehearsal log: during the red phase the only new `ok:` line present is `a passing install and report admit the remaining gate steps (exit 0)`, and `ok: the gate invokes the pinned validator contract` is absent. One gained, one lost, total unchanged at `B`.                                                                                                                                                               |
| Minor 4, the 110.6 prerequisite already landed                    | **FIXED** in section 5. `7d4ba6ec` ("docs: drop the upstream sync pointer now that WBS is detached") is an ancestor of `da8be091`, and `docs/findings/checks-that-cannot-fail-puni-00.md:3-4` already carries both replacements. The row now says the prerequisite is satisfied.                                                                                                                                                                                                                  |
| Minor 5, D6 named three files and hedged about `AGENTS.md`        | **FIXED.** D6 gives the four-file Prettier command with `AGENTS.md` first and drops the hedge; `AGENTS.md` is the regular file and `CLAUDE.md` and `GEMINI.md` are its symlinks.                                                                                                                                                                                                                                                                                                                  |

**Dispatchable now.** Slices A and B are ready to dispatch as written: both have a self-collected
baseline, a prerequisite block rehearsed on the tree they start from, and stop conditions that are
false there. C and D are ready too, but each is dispatched only from the tree its predecessor's
commit produces — their prerequisite signatures are what prove that.
