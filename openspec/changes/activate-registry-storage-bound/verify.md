# Verification record

**Change:** `activate-registry-storage-bound`
**Status:** plan only. No implementation, no host step, no gate.

## 1. Planning checks run on 2026-11-17

Base: `origin/main` at `1b94e080b`. Commands ran in a fresh worktree after
`bun install --frozen-lockfile`.

- `./node_modules/.bin/openspec validate activate-registry-storage-bound --strict`:
  `Change 'activate-registry-storage-bound' is valid`.
- `./node_modules/.bin/openspec validate --all --json`, exit 0, summary
  `{"totals":{"items":343,"passed":343,"failed":0},"byType":{"change":{"items":323,"passed":323,"failed":0},"spec":{"items":20,"passed":20,"failed":0}}}`;
  this change's item `"valid":true,"issues":[]`. The CI `jq -e` assertion printed
  `true`.
- `bunx prettier --check openspec/changes/activate-registry-storage-bound docs/infra/registry.md`:
  `All matched files use Prettier code style!`, exit 0.
- `env -u CLAUDECODE bun test` on `tools/tool-devsync/src/adr-index.test.ts`,
  `current-documents.test.ts`, `check-documents-target.test.ts` and
  `repo-namespacing-handoff.test.ts`: `40 pass, 0 fail, 149 expect() calls`. A first
  run before `git add` failed one test, `the production index checker resolves
current Markdown links and anchors`, because the new files were untracked; it
  passed once they were staged.
- `env -u CLAUDECODE bun test tools/tool-rename-work-package`: `37 pass, 0 fail`.
- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`:
  exit 0, empty stderr.

## 2. Source facts re-checked for the design

| Fact                                                        | Command                                                                                   | Result                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Installed runner hash equals the `6e37b3fc7` source         | `git show 6e37b3fc7:tools/tool-fleet/src/backup-registry.ts \| sha256sum`                 | `ee41d36b1f52f65152bcdf6c061a1c4d02a2ef86b91c53c345bcd5aa806bc9bb` |
| Runner lock file unchanged since `6e37b3fc7`                | `git diff --stat 6e37b3fc7 origin/main -- tools/tool-fleet/src/backup-registry.lock.json` | empty                                                              |
| Private fleet staged guard differs from public `startup.sh` | `diff` of the fleet repository's staged copy against the public file                      | exit 1                                                             |
| Private fleet root patch has no DELETE setting              | `grep -c REGISTRY_STORAGE_DELETE_ENABLED` on the staged root patch                        | `0`                                                                |

The host was not read. Installed state on h4claw is still an open question (design
open questions 2–4).

## 3. Implementation checks (to record during apply)

| Task | Command                                                                                                   | Result  |
| ---- | --------------------------------------------------------------------------------------------------------- | ------- |
| 1.1  | `bun test infra/ansible/tests/registry-bound-guard.test.ts` with `REGISTRY_TEST_KUBECTL`                  | Not run |
| 1.2  | `bunx nx run tool-fleet:test:registry-bound` with fixture SSH variables                                   | Not run |
| 1.3  | `bunx nx run tool-fleet:test:registry-hosts` with pinned Ansible and kubectl                              | Not run |
| 1.4  | `PUNI_TEST_RESTIC_BINARY=<locked restic> bun test tools/tool-fleet/src/backup-bounded-registry.test.ts`   | Not run |
| 1.5  | `bun test infra/ansible/tests/registry-bound-fleet.test.ts` with the private companion                    | Not run |
| 1.7  | `bunx nx format:check --all`; `bunx nx run-many -t test lint typecheck build` via the canonical host gate | Not run |

## 4. Failure proofs (to record during apply)

| Check                                   | Fault injected                             | Observing test                                                        | Result  |
| --------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- | ------- |
| `verify_mount` drift                    | One byte changed in the bound-only copy    | `verify_mount matches the lifecycle guard ...`                        | Not run |
| DELETE disabled in the bound patch      | DELETE env removed                         | `rendered Deployment uses registry-bounded ...`, `delete returns 405` | Not run |
| Wrong mount                             | `verify_mount registry` call removed       | `wrong mount refuses start`                                           | Not run |
| Block fence                             | Block comparison removed                   | `push at fence gets 405 and pull is served`                           | Not run |
| Inode fence                             | Inode comparison removed                   | `inode fence refuses push despite free bytes`                         | Not run |
| Latch                                   | Latch check removed                        | `fence stays latched across restart`                                  | Not run |
| Unknown measurement                     | Failed measurement treated as writable     | `unreadable measurement runs read-only`                               | Not run |
| k3s dependency value                    | Assert removed                             | `unknown k3s dependency refuses before host writes`                   | Not run |
| Runner claim / PV source / path / mount | Each predicate removed in turn             | the four `refuses ... before any mutation` tests                      | Not run |
| Fleet equality                          | One byte changed in an isolated fleet copy | `registry-bound-fleet.test.ts`                                        | Not run |

## 5. Attended receipts (to record during activation)

| Receipt                              | Task | Result  |
| ------------------------------------ | ---- | ------- |
| A. Bounded filesystem                | 3.3  | Not run |
| B. Start-up refusal on a wrong mount | 3.5  | Not run |
| C. The 90% write fence               | 3.8  | Not run |
| D. DELETE returns 405, uploads 202   | 3.7  | Not run |
| Migration digest equality            | 3.6  | Not run |
| Bounded backup and isolated restore  | 3.9  | Not run |

## 6. Not run in this planning delivery

- Any test, lint, typecheck or build of code: there is no code.
- `bunx nx format:check --all` and the canonical host gate.
- Any read or change on h4claw, h3mon or the cluster.
- The private fleet repository's own checks.
