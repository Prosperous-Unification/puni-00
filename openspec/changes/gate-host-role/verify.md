# Verify

## Repository checks, 2026-10-21

```text
env -u CLAUDECODE bun test ./tools/tool-fleet/src/                          587 pass, 0 fail (2026-10-21 16:15 UTC)
env -u CLAUDECODE bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts   15 pass, 0 fail
bunx nx run-many -t lint typecheck -p tool-fleet --skip-nx-cache            Successfully ran targets lint, typecheck
bunx nx format:check --all                                                   exit 0
bunx @fission-ai/openspec@1.12.0 validate --all --json                       {"items":263,"passed":263,"failed":0}
```

The handoff test fails while the new files are untracked ("index checks cannot resolve
untracked diagnostic paths"). It passes once they are staged.

R5, contract test (`configures a gate host whose lock and toolchain match the gate scripts`):

- Setting `puni_gate_home: /home/puni-gate` failed it. Expected
  `/home/puni-gate/.cache/wbs-heavy-work.lock`, received the library's
  `/home/puni1/.cache/wbs-heavy-work.lock`.
- Moving the template's `export PATH=` line below the interactivity guard failed
  `Expected: < 309, Received: 351`.

## Docker lab, 2026-10-21

The target was a fresh `ubuntu:26.04` container with `sshd`, `python3`, `docker-cli` and the
laptop's Docker socket (group `docker`, gid 985). The controller was the locked
`fleet-controller:0.1.0@sha256:372f6f43…62de`, reaching it as root over SSH, with
`playbooks/gate-host.yml` unchanged.

Convergence on the fresh target:

```text
run 1 (140 s)  gate-lab : ok=28 changed=16 unreachable=0 failed=0 skipped=0 rescued=0 ignored=0
run 2 (10 s)   gate-lab : ok=27 changed=0  unreachable=0 failed=0 skipped=1 rescued=0 ignored=0
final code     gate-lab : ok=27 changed=0  unreachable=0 failed=0 skipped=1 rescued=0 ignored=0
```

On the second run, the one skip is the Bun unpack, whose `creates:` file already exists. The
first lab attempt failed `ansible.builtin.pip` with `No module named 'packaging'`, so the role now
installs `python3-packaging`.

R5 for the probes. Each run below used `--tags validate` with one injected fault:

| Fault                                        | Observed                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `~/.bashrc` PATH names `~/.bun-9.9.9/bin`    | `bun: command not found`, rc 1, `failed=1`                                            |
| a fake `bun` printing `1.3.14` first on PATH | `The gate PATH resolves ['/home/puni1/fakebun/bun', '1.3.14', …], not the pinned Bun` |
| one untracked file in the tree               | `The gate tree reports [<url>, 'false', 'promisor=', 'dirty=1']`                      |
| `puni1` removed from `docker`                | `docker ps`: `permission denied while trying to connect to the docker API`            |
| `~/.cache` owned by root                     | the lock probe's `test -w` rc 1                                                       |
| none                                         | `ok=11 changed=0 failed=0`                                                            |

After each fault, a full run restored the host with `changed=1`: the template, or the
directory owner. The probes then passed again.

The lab gate ran as `puni1` through its `~/.bashrc`, as
`bin/h2puni-gate.sh f0cc432d71e545b0dec1b42ef43781152597c082`:

- It printed `heavy lock: waited 1s behind 0 tickets`, then
  `h2puni gate: running on f0cc432d71e545b0dec1b42ef43781152597c082`.
- The frozen install and the OpenSpec validation passed.
- It finished 162 Nx tasks with none failed; `wbs-be-01:build` was the last line.
- Claude Code stopped it during the first `run-many` because the 30 GB laptop ran short of
  memory.

So there is **no GATE_EXIT or wall time**. This partial run does not exercise
`solver-image-smoke`. The laptop's Docker daemon could not have run it faithfully anyway: the
daemon cannot see paths inside the lab container.

## Live h4claw (2026-10-21, Dany's go)

Controller: the pinned `fleet-controller` image on the laptop, `ansible_user: root` with
`id_admin` through the h2puni jump, inputs in `~/.puni/fleet/2026-enroll` plus `gate.json`
holding the laptop's h4claw public key. Logs under the session scratchpad `h4-apply/`.

1. `playbooks/preflight.yml --limit h4claw -e puni_preflight_stage=after-enrollment`:
   `ok=26 changed=0 unreachable=0 failed=0 skipped=4`.
2. Backups on the host: `/root/pre-gate-host-etc.tgz` (passwd, group, shadow, gshadow,
   sudoers.d, apt) and `/root/pre-gate-host-dpkg-selections.txt`, both rc 0.
3. `playbooks/gate-host.yml` run 1: `ok=28 changed=16 failed=0`; run 2:
   `ok=27 changed=0 failed=0 skipped=1` (the Bun unpack's `creates:`). Same recaps as the lab.
4. First real gate as `puni1` on main `69a8b38f4f63ef4242ca1ed12926909fa2b5b127`: printed
   `h2puni gate: running on 69a8b38f…`, the frozen install reported no changes, then
   `env: 'node': No such file or directory`, `GATE_EXIT=127` after 2 s. Nx's bin is
   `#!/usr/bin/env node`; h2puni has Node 24.18.1 on its PATH (Volta) and CI the runner's, the
   role had none. Fix: `binaries.gateNode` pin (24.18.1, sha256-checked tar.xz from nodejs.org),
   tasks that install the interpreter at `~/.node-24.18.1/bin/node`, the PATH segment in
   `bashrc.j2`, a validate probe, and the contract test expectations. The lab convergence
   claim above predates this; the live re-apply below is its proof.
5. Re-apply with the Node tasks: run 3 `ok=34 changed=6 failed=0 skipped=1` (exactly the five
   Node tasks and the re-rendered `~/.bashrc`), run 4 `ok=33 changed=0 failed=0 skipped=2`.
6. Second real gate as `puni1` on main `69a8b38f…`, detached on the host (`nohup setsid`), log
   `~/gate-69a8b38f.log`: printed the running-on line, OpenSpec validated, Nx ran
   `test, lint, typecheck, build` for 49 projects in 39 m 9 s; 179 tasks green, one failed,
   `tool-devsync:test`, `GATE_EXIT=1`. The failing cases are the Performance-level tests that
   hard-code `E2E_PORT_SHIFT=6000`: be-01's shifted port 9100 is node_exporter on h4claw
   (`*:9100`, a k3s telemetry host), so the production preflight correctly refused
   `Performance shifted port 9100 is occupied` and the tests that expected other refusals saw
   that one. h2puni has 9100 free, CI's runner too. The host is right; the test's fixed shift is
   the defect, fixed on `fix/devsync-performance-shift-probe` (the test probes a free shift at
   load). The gate of record for 2.2 is the next run on that fix.
7. Third real gate as `puni1` on that fix, `51ca24c6f26c999367ee573994a6752eb829db5b`, log
   `~/gate-51ca24c6-run3-nogh.log`: `tool-devsync:test` green, and every other project too,
   except `twilight-dash:test`: 60 cases in `activation/review-authentication.test.ts` read
   `ENOENT: no such file or directory, open '/usr/bin/gh'`, `GATE_EXIT=1` after 50 m 5 s. Those
   tests hash `/usr/bin/gh` and run it as the real offline attestation verifier; h2puni has gh
   2.97.0 from GitHub's apt repository, CI the runner's, the role installed none. The host is
   wrong, not the test: that path is the activation fixture's contract. Fix: `binaries.gateGh`
   pin (2.102.1, the release `.deb` by sha256; GitHub's apt repository serves only the newest
   release, so an apt pin cannot name h2puni's version), a fetch-by-checksum task, an
   `apt: deb:` install, a validate probe on `/usr/bin/gh --version`, schema + contract tests
   (negatives: `gateGh` made optional resolved the missing-lock test; the dropped checksum line
   failed the Ansible contract test), docs and the spec. The laptop watcher of the third gate
   also missed `GATE_EXIT=` for two hours: `grep` without `-a` answers "binary file matches" on
   the ANSI-coloured log; the watcher now greps with `-a`.
8. Re-apply with the gh tasks: run 5 `ok=37 changed=2 failed=0 skipped=2` (exactly `Fetch the
pinned gh package` and `Install the pinned gh`; the new probe passed), run 6
   `ok=37 changed=0 failed=0 skipped=2`. Fourth real gate on `51ca24c6f…`, detached, log
   `~/gate-51ca24c6.log`: printed `h2puni gate: running on 51ca24c6f26c999367ee573994a6752eb829db5b`,
   OpenSpec validated, Nx ran `test, lint, typecheck, build` for 49 projects in 45 m 21 s, then
   `test, typecheck, build` for twilight-burokrat and twilight-dash in 49 m 55 s, their lints and
   `wbs-be-01:solver-image-smoke` (4 m 31 s); `GATE_EXIT=0` at 16:06 UTC, 104 min after launch.
   That is the gate of record for 2.2: h4claw is a working second gate host.
9. Internal Fable review of the whole branch at 5b651964a (read-only; no S1). Fixed on the branch:
   the gh probe's `| head -n 1` swallowed a missing binary (the pipeline's status was head's; on
   h4claw as `puni1` the piped form exited 0, the unpiped form 127, so the probe now runs
   `/usr/bin/gh --version` bare and asserts its first line); a new escalation probe
   (`id -nG; sudo -n true; sudo_rc=`) with an assert that fails on a `sudo` group or `sudo_rc=0`
   (negatives fed through the controller image with `set_fact`; live h4claw printed `puni1 docker`,
   sudo's refusal, `sudo_rc=1`); `puni_gate_authorized_keys` must be a list, not a string (live
   `--tags validate -e 'puni_gate_authorized_keys=ssh-ed25519 AAAA'` failed at the input assert,
   `failed=1`, before any task; a string would have been written one character per line);
   the contract test now refuses `groups:` naming `sudo` in either spelling (both injected,
   both failed); proof wording in `ansible.test.ts` and `validate.yml` says what was observed;
   proposal.md names the Node, gh and toolchain changes; the stale "not run" section is gone.
   Read-only validate pass after the fixes: `ok=17 changed=0 failed=0`. Not fixed, recorded:
   `pip -r` never removes packages dropped from the lock (the probe proves only the OR-Tools
   version); no dpkg hold on gh (nothing else on the host installs gh; a GitHub apt source would
   change that); the venv assert has no negative; the `tbf` suffix mirrors h2puni's tree name.
10. Gate of record for this change, on h4claw as `puni1`, head
    `a370595b6d4fe271958c22ea9485fb511b40c799` (the branch with the review fixes and main
    534ba44b2 merged in; the previous head 1d2f13f8b lacked PR #612 and failed
    `tool-devsync:test` on the 9100 refusal, which is the branch's own gap, not the host's):
    printed the running-on line, Nx ran `test, lint, typecheck, build` for 49 projects in
    45 m 31 s and the two Twilight projects in 50 m 29 s, lints and `solver-image-smoke`
    (3 m 38 s) green, `GATE_EXIT=0` at 18:45 UTC. CI on the same head: all checks green.

## Sandbox prerequisite repair, 2026-10-25

Intent: restore the existing gate-host tool contract after the D9 h4 canonical gate stopped
with missing `bwrap` (exit127) before tests. Install the standard Ubuntu apt `bubblewrap` and
`busybox` packages and check availability as the gate account. No host apply, account grants,
AppArmor, sysctl, namespace policy, canonical gate, dependency pin or feature architecture changes.
The candidate is based on main `93b6f3555ede68c08d3d83b571f1fcd15a44f37b`.

Commands ran in `/tmp/puni-gate-host-sandbox-tools-20261025` with official Bun1.4.4 and
`TMPDIR=BUN_TMPDIR=/tmp/puni-gate-host-tools-bun-tmp` for tests:

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/ansible.test.ts --timeout=30000
bun x eslint tools/tool-fleet/src/ansible.test.ts
bun x tsc --noEmit -p tools/tool-fleet/tsconfig.spec.json
bun x openspec validate --all --json
```

- Initial parsed real apt-task consumer RED:0pass/1fail, missing `bubblewrap` from the package
  array. Before probe tasks existed, the new command/declaration consumers also failed.
- Focused restored package/probe consumers:9pass/44assertions. Complete file:33pass,
  0fail,221assertions,1.92s. The first sandboxed full-file attempt had one unrelated existing
  fake-provider stdout `EPERM`; the exact escalated local replay passed. No actual provider
  or host operation ran.
- ESLint and tool-fleet spec TypeScript passed. The configured OpenSpec `--all --json` passed.
  An extra strict change-only invocation reported the existing >500-character requirement
  warnings; strict warnings are not the configured gate. The original requirement paragraphs
  remain unchanged, and the new tool requirement is separate.
- Six watched source omissions each made the intended consumer RED: remove either apt package;
  replace the bwrap-version `&&` with `;`; skip BusyBox execution; remove either literal
  BusyBox command argv. Faults were restored before the full33-test replay.
- The exact parsed PATH probe ran with controlled HOME/bashrc/PATH executables: healthy passes;
  each tool missing, nonexecutable or exiting74 refuses. For bwrap failures the later BusyBox
  resolution is absent. Removing failure propagation let a later success mask exit74.
  These are shell-command propagation proofs, not whole-role/system identity or namespace proofs.
- The system-resolution assert and both literal BusyBox paths have parsed declaration
  contracts. Initial host Python lacked `ansible`; the later pinned-controller evaluation
  below supplies the real assertion proof. Local manual positives:
  `/usr/bin/bwrap --version` reported `bubblewrap 0.11.0`; `/bin/busybox true` and
  `/usr/bin/busybox true` exited0. Absolute-system-binary execution faults were not injected.

Private detailed receipts: `/tmp/puni-gate-host-tools-omission-proofs.json`,
`/tmp/puni-gate-host-tools-full-test-replay.log`, `/tmp/puni-gate-host-tools-types.log`,
`/tmp/puni-gate-host-tools-eslint.log`, `/tmp/puni-gate-host-tools-openspec-all.log`.
Package and Bun lock remain unchanged. Independent source review, fresh hosted CI, real
operator-controller twice-apply convergence (second changed=0) and exact-SHA canonical gate
remain outstanding. Binary availability does not establish namespace capability.

### Recorded-output assertion evaluated by the pinned controller

The existing local controller image exactly matches the reviewed lock:
`sha256:372f6f433050a5844bc9c4cd657facf993eb505fec96b50838d253787e2462de`.
It ran offline, with the role YAML mounted read-only, a private output directory,
and no credentials or host SSH. The actual `Require system sandbox tools` assertion
was extracted unchanged and executed by Ansible against recorded probe outputs.

- Healthy system paths and version passed with exit0.
- Wrong bwrap path, malformed version, wrong BusyBox path, absent output and
  truncated output each failed with exit2.
- Removing only each corresponding path/version condition from that extracted
  assertion admitted its bad output with exit0. Other conditions remained present.

The first evaluator attempt used an unsupported config filename and exited5 before
the assertion; it supplies no passing evidence. A private valid `.cfg` file corrected
the harness before every reported case. Actual case logs and receipt are retained at
`/tmp/puni-gate-host-real-assert-20261025/receipt.json`. This proves the assertion's
evaluation and breakability, not an absolute binary execution fault or namespace
capability. The literal-path fault coverage limit above remains explicit.

Independent source review approved the bounded seven-file package/probe scope and
replayed9 focused cases/44 assertions. The subsequent comment/receipt update records
this new evaluator evidence; host apply and canonical gate remain unverified.
