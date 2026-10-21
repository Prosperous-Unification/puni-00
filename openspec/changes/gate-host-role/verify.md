# Verify

## Repository checks, 2026-10-21

```text
env -u CLAUDECODE bun test ./tools/tool-fleet/src/                          585 pass, 0 fail
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

## Live h4claw: not run

Not run:

- The privileged apply waits for Dany's authorization.
- h2puni's `~/.puni/fleet/2026-enroll` holds only `id_admin` and `id_admin.pub`: no `vars.json`,
  no `known_hosts` and no controller image.
- The recorded path is the laptop controller as root through h2puni (the 2026-09-27
  enrollment).

No preflight, backup, apply or gate has run on h4claw. Read-only facts from 2026-10-21, as
`claw`:

- Ubuntu 26.04 and Python 3.14.4.
- `/tmp` is a 7.6 GB tmpfs.
- No `unzip`, `shellcheck`, `python3-venv` or `node`.
- `puni-fleet` (uid 1002) exists.
- There is no `puni1` account.

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
