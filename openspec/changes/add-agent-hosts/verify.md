# Agent hosts verification

## Status

Plan only. No source outside this change, no manifest, host, cluster or provider resource
was changed. No task in tasks.md is done. This record holds only what was read or run while
writing the plan, on 2026-11-21 and 2026-11-22, in a worktree at `origin/main` `b17861f83`.

## Where this came from

Both hosts were added to `separate-node-roles` on 2026-11-22 at the owner's request and
moved here the same day. The split is the planning session's scoping, and the owner may
overrule it. Its ids (AH1 to AH4, AH-S1, AH-A1 to AH-A3) are its own; reviews and their
findings are in the pull request's history.

## What the split and later decisions changed in substance

- The workstation's size. an earlier draft assumed 16 vCPUs and 32 GiB. On 2026-11-22 the
  owner chose the small size, 4 vCPUs and 8 GiB; its size is no longer an open question and
  its region is.
- At that size the workstation cannot host the core change's rehearsal, which the ninth
  draft offered; it can still be the controller.
- The key check moved from the placement check into the play, for the reason above.

## Owner decisions

| Date       | Decision                                                                                          | Carried by |
| ---------- | ------------------------------------------------------------------------------------------------- | ---------- |
| 2026-11-22 | A host for OpenClaw is added                                                                      | AH1        |
| 2026-11-22 | A separate host for the owner's logged-in agent sessions, reached with herdr                      | AH2        |
| 2026-11-22 | Every old server is retired, h1claw among them                                                    | AH3        |
| 2026-11-22 | In the minimal profile one host carries both; a remote workstation is needed and is not postponed | AH4        |
| 2026-11-22 | The shared host is 8 vCPUs and 16 GiB                                                             | AH4        |

Measured on h1claw on 2026-11-21, read-only: 4 vCPUs, 7.75 GiB of memory with 3.2 GiB
available, the gateway process at about 2 GiB resident, a 75 GB disk at 91 % with about 21
GiB of OpenClaw state. Measured on the operator's laptop on 2026-11-22: 29 agent processes
at 3.3 GiB resident, 21 of 30 GiB of memory in use and a 460 GB disk full.

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

## Primary sources read

`infra/ansible/roles/base/tasks/main.yml` and its kernel-settings template;
`infra/ansible/playbooks/gate-host.yml`; the gate-host and enrollment runbooks on the `$OPS`
inputs; the lab profiles in `docs/infra/local.md`; and the core change's design, tasks and
spec in the same pull request.

## Minimal placement profile and h1claw (added 2026-11-22)

AH3 and AH-A3 retire h1claw here. AH4 is the shared host of the minimal profile; AH-A1
creates it and AH-A2 is the growth step to two. What the shared host gives up, and the four
limits that the play and AH-A1's receipt check, are in design decision 1. Not read: how
OpenClaw's units are installed, so that it can run as a user without `sudo` is assumed and
is the follow-up's to confirm. On 2026-11-21 a copy of h1claw's secret files was taken off
the host with matching checksums; that is not the read-back of the core change's task 0.5,
which AH-A3 still requires.
