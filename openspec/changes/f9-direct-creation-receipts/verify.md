## Scope and baseline

Implementation is isolated in `/tmp/f9-receipts-sol-oct16`, forked at the exact published PR #506 head `2c9ce1f4260e39c8414e9ccc548bba4868997da9`. Only direct network/registry receipts and read-only assessment are added. No push, merge, deploy, live Docker operation, deletion executor or automatic recovery was performed.

The initial production-caller negative failed with ENOENT reading `network.json` before implementation. After implementation, the fixture Docker network command requires a pending record and the registry command requires a created network record. Both slot captures use only the existing create command stdout.

## Commands and results

| Command                                                                                                                           | Fresh observed result                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `BUN_TMPDIR=/tmp bun install --frozen-lockfile`                                                                                   | Exit 0; checked 1573 installs across 1447 packages, no changes                                  |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:test --skip-nx-cache --output-style=stream`                      | Exit 0; 559 pass, 0 fail, 1980 assertions, 44 files; [summary](evidence/affected-tests.log)     |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p tool-fleet --skip-nx-cache --output-style=stream` | Exit 0; both targets successful; [output](evidence/lint-typecheck.log)                          |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all`                                                             | Exit 0; stdout/stderr empty; [record](evidence/format.log)                                      |
| `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                          | Exit 0; 221 passed, 0 failed (203 changes, 18 specs); [summary](evidence/openspec-summary.json) |
| `git diff --check`                                                                                                                | Exit 0                                                                                          |

The first install lacked a writable Bun temporary directory; setting BUN_TMPDIR fixed it. The first Nx invocation reported a sandbox socket fallback without running a target; it is not treated as verification. Final target runs disable the daemon and isolated plugins. Offline caller tests require temporary loopback ports and ran with sandbox escalation after the restricted run refused binding.

## Failure proofs

Every row below was observed failing with its production guard removed or persistence dependency broken, then restored. Mutation logs retain the actual failing test output; [mutation summary](evidence/mutations.log) lists the initial 25 detected mutations. Four additional mutation logs cover missing/unreadable reads, operation directories and completion locks. Production guards have adjacent Proof comments.

| Check                            | Injected fault and observed failing production negative                                                                        | Evidence                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Closed slot                      | Removed slot validation; invalid-slot negative failed                                                                          | [log](evidence/closed-slot.log)                                                              |
| Exclusive reservation            | Removed O_EXCL; retry of occupied registry reached creation                                                                    | [log](evidence/exclusive-reservation.log)                                                    |
| Missing and unreadable operation | Bypassed network receipt read with forged created evidence; separate absent/unreadable assessment negatives failed             | [absent](evidence/absent-read-bypass.log), [unreadable](evidence/unreadable-read-bypass.log) |
| Operation directory              | Bypassed owner-only directory validation; public and symlink directory negatives failed                                        | [log](evidence/operation-directory.log)                                                      |
| Symlink read                     | Removed O_NOFOLLOW; a symlink to valid same-binding evidence was accepted                                                      | [log](evidence/nofollow-read.log)                                                            |
| Nonblocking read                 | Removed O_NONBLOCK; real kernel FIFO test was killed at its 2s deadline                                                        | [log](evidence/nonblocking-read.log)                                                         |
| Regular-file descriptor          | Removed only isFile check; injected nonregular descriptor assessment failed its expected refusal                               | [log](evidence/regular-file.log)                                                             |
| File UID                         | Removed only UID comparison; injected foreign-UID descriptor assessment failed                                                 | [log](evidence/file-uid.log)                                                                 |
| File permissions                 | Removed exact mode check; public-file assessment failed                                                                        | [log](evidence/file-mode.log)                                                                |
| Strict schema                    | Removed schema-error refusal; extra-field assessment failed                                                                    | [log](evidence/strict-schema.log)                                                            |
| Lab binding                      | Removed only lab comparison; wrong-lab assessment failed                                                                       | [log](evidence/lab-binding.log)                                                              |
| Attempt binding                  | Removed only attempt comparison; wrong-attempt assessment failed                                                               | [log](evidence/attempt-binding.log)                                                          |
| Daemon binding                   | Removed only daemon comparison; wrong-daemon receipt assessment failed                                                         | [log](evidence/daemon-binding.log)                                                           |
| Slot binding                     | Removed only slot comparison; other-valid-slot assessment failed                                                               | [log](evidence/slot-binding.log)                                                             |
| Creating journal                 | Removed creating-state requirement; terminal-journal negative failed                                                           | [log](evidence/creating-journal.log)                                                         |
| Resolved network before registry | Removed network-created requirement; malformed-response next-creation negatives failed                                         | [log](evidence/network-unresolved.log)                                                       |
| Full returned Docker ID          | Removed returned-ID refusal; malformed/empty/multiple/truncated response negatives failed                                      | [log](evidence/full-docker-id.log)                                                           |
| Completion state                 | Removed pending-state requirement; a receipt changed during Docker execution was overwritten                                   | [log](evidence/completion-state.log)                                                         |
| Completion lock                  | Bypassed exclusive completion lock; occupied-lock negative observed pending evidence replaced                                  | [log](evidence/completion-lock.log)                                                          |
| Current daemon                   | Removed comparison; changed-daemon assessment failed                                                                           | [log](evidence/current-daemon.log)                                                           |
| Both receipts created            | Removed state check; older-complete/later-pending assessment failed                                                            | [log](evidence/pending-assessment.log)                                                       |
| Inspection schema                | Removed inspection-error refusal; malformed-inspection negative failed                                                         | [log](evidence/inspection-schema.log)                                                        |
| Exact inspected ID               | Removed only returned-ID comparison; ID-shaped lookup returning a foreign ID was accepted                                      | [log](evidence/inspected-id.log)                                                             |
| Inspected lab label              | Removed only label comparison; foreign-label assessment failed                                                                 | [log](evidence/inspected-label.log)                                                          |
| Foreign attachments              | Removed attachment check; foreign-endpoint negative failed                                                                     | [log](evidence/foreign-attachments.log)                                                      |
| Registry network                 | Removed required-network check; detached registry negative failed                                                              | [log](evidence/registry-network.log)                                                         |
| File durability                  | Removed descriptor sync; reservation and completion file-sync dependency injections were ignored and their negatives failed    | [log](evidence/file-sync.log)                                                                |
| Directory durability             | Removed ancestry sync; reservation and completion directory-sync dependency injections were ignored and their negatives failed | [log](evidence/directory-sync.log)                                                           |

Shared identity/directory helpers retain their existing phase-one guards and Proof comments; the affected suite reruns their consuming negatives. Actual operation UID/type injections modify only opened-descriptor stat results in isolated subprocesses; they are not claims about actual foreign-owned inodes. The FIFO test uses a real kernel FIFO. Missing and unreadable are distinct actual filesystem faults.

## Limits and deferred checks

Assessment is a read-only library entry whose inspector callback supplies normalized facts for a supplied full ID; there is no Docker inspection CLI or recovery activation. The callback contract requires exact-ID lookup, and the assessment compares returned IDs to catch Docker name fallback. Tests use controlled inspector responses and offline Docker/k3d executables, not live daemon evidence. Registry receipts confer no volume ownership; k3d-created endpoints remain outside the direct receipt scope and cause foreign-attachment refusal.

The host gate and raw full Nx gate were intentionally not run: release/gate ownership is delegated to the PM. `tool-fleet` has no build target; its applicable test, lint and typecheck targets were run. No live infrastructure acceptance or actual foreign-user inode test is claimed. Ordinary down, phase-one unconditional deletion refusal, k3d no-rollback and the disabled recovery path retain test coverage.

## Exact target review repair

Review of `8d24619ccbab641a25f2249cc83dcbd2f0f9e874` found the direct receipts and inspection boundary did not bind Docker kind/name. The repair extracts the existing `labNamesOf` function and type into `k3d-lab-names.ts`, re-exporting them from `k3d-lab.ts` for existing callers. Direct slots derive the same names, with network→network and registry→container kinds. Both pending and created records persist these attributes; strict readers and assessment compare each independently.

Operation schema is now **v2**. No claim is made that external v1 receipt files do not exist; earlier operation evidence refuses without migration or adoption. Phase-one attempt journals remain schema v1. The inspector supplies actual kind and normalized actual name, which must match the receipted target as well as ID/label. No cleanup or activation boundary changed.

The new production-path test first failed on missing pending kind/name. Real Docker fixtures now verify requested command names and reserved kind/name attributes. Four separate fixtures corrupt pending network/registry kind/name after the command starts; completion refuses, no following creation or cleanup executes. Consumer negatives separately cover both states, both slots and both fields; inspection negatives preserve matching IDs and labels while changing only kind or name.

### Additional watched proofs

All 15 repair mutations below were observed failing, then restored. [Summary](evidence/target-mutations.log).

| Check                        | Fault and production negative                                                                      | Evidence                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Recorded kind binding        | Bypass derived-kind comparison; both-slot pending/created assessments fail                         | [consumer](evidence/target-record-kind.log)         |
| Recorded name binding        | Bypass derived-name comparison; both-slot pending/created assessments fail                         | [consumer](evidence/target-record-name.log)         |
| Inspected actual kind        | Bypass only kind comparison; each slot's mismatch negative fails with ID/label preserved           | [log](evidence/target-inspected-kind.log)           |
| Inspected actual name        | Bypass only name comparison; each slot's mismatch negative fails with ID/label preserved           | [log](evidence/target-inspected-name.log)           |
| Earlier operation version    | Broaden v2 schema to accept v1; unbound-version negative fails                                     | [log](evidence/target-schema-v2.log)                |
| Required receipt kind        | Make schema kind optional; missing-kind negative misses its strict schema refusal                  | [log](evidence/target-record-required-kind.log)     |
| Required receipt name        | Make schema name optional; missing-name negative misses its strict schema refusal                  | [log](evidence/target-record-required-name.log)     |
| Required inspection kind     | Make schema kind optional; missing-kind inspection misses its strict schema refusal                | [log](evidence/target-inspection-required-kind.log) |
| Required inspection name     | Make schema name optional; missing-name inspection misses its strict schema refusal                | [log](evidence/target-inspection-required-name.log) |
| Real caller kind consumption | Bypass record kind comparison; both-slot post-command corruption callers fail to stop              | [log](evidence/target-caller-record-kind.log)       |
| Real caller name consumption | Bypass record name comparison; both-slot post-command corruption callers fail to stop              | [log](evidence/target-caller-record-name.log)       |
| Network slot kind            | Derive container kind for network; literal real-up fixture fails pending binding                   | [log](evidence/target-derived-network-kind.log)     |
| Registry slot kind           | Derive network kind for registry; literal real-up fixture fails pending binding                    | [log](evidence/target-derived-registry-kind.log)    |
| Shared network name          | Change shared derivation to foreign network name; real-up caller fails literal command-name check  | [log](evidence/target-shared-network-name.log)      |
| Shared registry name         | Change shared derivation to foreign registry name; real-up caller fails literal command-name check | [log](evidence/target-shared-registry-name.log)     |

### Repair validation

- Affected `tool-fleet:test`, cache skipped: exit 0; 581 pass, 0 fail, 2044 assertions across 44 files ([summary](evidence/target-affected-tests.log)).
- Affected `tool-fleet:lint` and `tool-fleet:typecheck`, daemon/plugins disabled and cache skipped: exit 0, both successful.
- Pinned OpenSpec `validate --all --json`: exit 0; 221 passed, 0 failed ([summary](evidence/target-openspec-summary.json)).
- Scoped Prettier check of all changed sources/docs and change artifacts: exit 0; all matched files use Prettier style ([output](evidence/target-format.log)).
- Removed trailing whitespace from the four reviewed historical evidence logs (`directory-sync`, `file-sync`, `file-uid`, `regular-file`). `git diff --check 2c9ce1f4260e39c8414e9ccc548bba4868997da9` on the repair working tree returned 0; `git diff --check HEAD^..HEAD` and `git diff --check 2c9ce1f4260e39c8414e9ccc548bba4868997da9..HEAD` each returned exit 0 with no output on the committed repair.

Host gate, push, merge and deployment remain delegated and were not run. No live Docker or actual foreign-user inode evidence is claimed. The repair uses scoped formatting; the earlier full format run is recorded above and the release host gate remains pending PM ownership.
