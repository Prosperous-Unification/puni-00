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
