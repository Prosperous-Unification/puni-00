# Agent hosts verification

## Status

Plan only. No source outside this change, no manifest, host, cluster or provider resource
was changed. No task in tasks.md is done. This record holds only what was read or run while
writing the plan, on 2026-11-21 and 2026-11-22, in a worktree at `origin/main` `b17861f83`.

## Where this came from

Both hosts were added to the ninth draft of `separate-node-roles`, as its R43, R44, slice
1.6, A29 and A30. The ninth review (at `5c54a1707`) read them there and recommended a split;
that change's verify.md records the review. On 2026-11-22 the planning session moved this
part here. The split is its scoping, and the owner may overrule it. Text was moved, not
rewritten, except for the review's findings, the owner's later decision on the
workstation's size, and ids:

| In the ninth draft of `separate-node-roles`    | Here                                                           |
| ---------------------------------------------- | -------------------------------------------------------------- |
| R43, R44                                       | AH1, AH2                                                       |
| Slice 1.6                                      | AH-S1                                                          |
| A29, A30                                       | AH-A1, AH-A2                                                   |
| The host rows and bullets of decisions 1, 2, 9 | decisions 1, 2, 4                                              |
| Open questions 3 and 4                         | settled at a step (design, "Open questions"); none is open now |

## Ninth review: what became of its findings here

| Finding                                                     | What became of it                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-5 The workstation's key check could not be built         | Fixed. Read first: `base` installs exactly the operator keys it is given and sets nothing in `sshd` and no firewall; its key list and the gate role's are `$OPS` inputs; its kernel-settings template reads the node's capabilities. So the key check is an assert in the play; the play turns password login off, installs a default-deny inbound firewall and sets an empty capability list; an agents-host key has its own negative |
| S3 R43 dated 2026-11-21                                     | Fixed: both host decisions are dated 2026-11-22                                                                                                                                                                                                                                                                                                                                                                                        |
| S3 "The one thing" before h1claw's deletion                 | Stated in decision 3 and under "Open questions": OpenClaw's state has to be settled first if it is wanted                                                                                                                                                                                                                                                                                                                              |
| The workstation as controller, against "decrypt only there" | Stated in decision 1: the workstation is then the controller, so the rule is unchanged; it stays an option                                                                                                                                                                                                                                                                                                                             |

## What the split and later decisions changed in substance

- The workstation's size. The ninth draft assumed 16 vCPUs and 32 GiB. On 2026-11-22 the
  owner chose the small size, 4 vCPUs and 8 GiB; its size is no longer an open question and
  its region is.
- At that size the workstation cannot host the core change's rehearsal, which the ninth
  draft offered; it can still be the controller.
- The key check moved from the placement check into the play, for the reason above.

## Owner decisions

On 2026-11-22:

- "let's also add a host for openclaw to this mix" (AH1). Measured on h1claw on 2026-11-21,
  read-only: 4 vCPUs; 7.75 GiB of memory, 3.2 GiB available; the OpenClaw gateway at about
  2 GiB resident; a 75 GB disk at 91%, about 21 GiB of it OpenClaw's state; user-level
  systemd units outside any cluster; Tailscale for private access; agent sessions with
  credentials of their own; a provider region other than the cluster's.
- "and a sep host for logged in agent's accounts that i'll access through herdr" (AH2).
  Measured on the operator's laptop that day: 29 agent processes at 3.3 GiB resident; 21
  of 30 GiB of memory in use; a 460 GB disk full; 24 cores. `herdr` was read from its
  help output only, at version 0.9.5: an SSH remote mode and saved SSH machines.
- On the workstation's size he then named the provider's small server type, which is 4 vCPUs
  and 8 GiB; the type's name is not recorded in this public repository.

Overrules of AH1 and AH2 beyond these: none yet (task AH-0.1).

## Repository checks

Dependencies were not installed in the worktree. The binaries of the main checkout were used
through a temporary `node_modules` link, removed afterwards. Run on 2026-11-22 on this
revision.

| Command                                                                                                     | Result                                       |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `openspec validate add-agent-hosts --strict`                                                                | `Change 'add-agent-hosts' is valid`, exit 0  |
| `openspec validate --all --json`                                                                            | 350 items, 350 passed, 0 failed              |
| `prettier --check` on the five plan files                                                                   | `All matched files use Prettier code style!` |
| `env -u CLAUDECODE bun test` on `adr-index`, `repo-namespacing-handoff`, `current-documents` (tool-devsync) | 34 pass, 0 fail; changed files staged first  |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                                 | 37 pass, 0 fail                              |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                 | exit 0, empty stderr                         |
| `plaintext-secrets.ts` and `private-nesting.ts` on the five plan files (`tools/tool-git-hooks/src/hooks`)   | each exit 0                                  |
| Intent word count of proposal.md, "Why" to "Constraints"                                                    | 294                                          |

## Checks not run

- `bun install --frozen-lockfile` and every Nx target. CI runs them.
- `check-documents-target.test.ts`: each run leaves about 2.8 GB under `/tmp`.
- No playbook was run and no host was created.
- This revision has not been reviewed since the split.

## Tenth review: what became of its findings here

| Finding                                                             | What became of it                                                                                                                                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-5 Task 0.5's receipt was called recorded                         | Fixed: design decision 3 and AH-A3 say the copy of 2026-11-21 is not the read-back, and AH-A3 requires the read-back                                                                            |
| S2-6 Disks come with the type                                       | The shared host has a minimum root disk of 100 GiB, which AH-A1 stops on (core decision 2's table)                                                                                              |
| S3 The owner's country in public text                               | Removed here in three places                                                                                                                                                                    |
| S3 The workstation as controller, against the shared host           | Fixed: the controller may not run on the shared host; a workstation of its own may be the controller                                                                                            |
| S3 The decision record said "two more servers"; stale ids and dates | Fixed: the record describes one shared server first; the id map's last row no longer points at open questions; both host decisions are dated 2026-11-22 here and in the core change's verify.md |

Decided since the tenth draft: the shared host is 8 vCPUs and 16 GiB ("shared operator
16GiB", 2026-11-22). No open question is left in this change.

## Primary sources read

`infra/ansible/roles/base/tasks/main.yml` and its kernel-settings template;
`infra/ansible/playbooks/gate-host.yml`; the gate-host and enrollment runbooks on the `$OPS`
inputs; the lab profiles in `docs/infra/local.md`; and the core change's design, tasks and
spec in the same pull request.

## Minimal placement profile and h1claw (added 2026-11-22)

Unreviewed. The owner asked for the minimal setup that can grow (core R45) and, offered one
host for OpenClaw and his own sessions, answered "two hosts"; both hosts are therefore in
the minimal profile as they were, at the sizes already decided. He then said "i want all new
infra, all old nodes can be retired" (core R46): AH3 and AH-A3 are new and retire h1claw
here. His earlier words, that he may delete it at any time and accepts the backup windows,
stand. Nothing was renumbered.

Later on 2026-11-22 the owner replaced "two hosts" for the minimal profile: because of
power cuts where he works he needs a remote workstation, and "can have just one for
openclaw + workers".
AH4 is new: one shared server in the minimal profile, two in the full one; AH-A1 creates
the shared host and AH-A2 became the growth step. Its size was assumed, 8 vCPUs and 16 GiB,
and he then decided it: "shared operator 16GiB". What the shared host gives up, and the four limits
that the play and AH-A1's receipt check, are in design decision 1. Not read: how OpenClaw's
units are installed, so that it can run as a user without `sudo` is assumed and is the
follow-up's to confirm.
