# Verification Report

**Change**: `cold-restore-identities`
**Planning recorded**: 2026-10-17
**Recorder evidence recorded**: 2026-11-18
**Status**: local recorder source verified. Capture, v2 consumers and feature acceptance remain open.

The original pre-apply record is historical. The recorder section records observed runs in the isolated F10 worktree.

## 1. Structural Validation

Pinned CLI: `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js`.

`new change cold-restore-identities`, `status --change cold-restore-identities --json`, and `instructions intent|specs|design|tasks --change cold-restore-identities --json` exited 0. The checked-in `sdd-lean` schema/templates were read. `validate cold-restore-identities --json` exited 0: one change valid, no issues. `validate --all --json` exited 0; its exact summary was:

```json
{
  "totals": { "items": 257, "passed": 257, "failed": 0 },
  "byType": {
    "change": { "items": 239, "passed": 239, "failed": 0 },
    "spec": { "items": 18, "passed": 18, "failed": 0 }
  }
}
```

Full command output is retained locally at `/tmp/cold-restore-identities-openspec-validation.json`; every entry was valid and `invalid: []` was observed. Structural validation does not resolve the open mechanism decisions.

## 2. Task Completion

Every task remains unchecked. The isolated recorder increment covers only part of task 1.1.

## 3. Delta Spec Sync

| Capability              | Sync status | Note                                |
| ----------------------- | ----------- | ----------------------------------- |
| cold-restore-identities | Pending     | Capture and v2 consumers still open |

## 4. Failure Proofs

These rows track the outstanding full requirement proofs. The recorder section records the focused proofs already observed. Each remaining changed check needs its own observed production-path fault, exact test output and adjacent `Proof:` comment.

| Check                                      | Fault to inject                                                     | Production-path observation planned            | Result  |
| ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------- | ------- |
| v2 decoding and ID precision               | Allow legacy/unknown/numeric ID                                     | recorder/CLI round-trip negatives              | Not run |
| Snapshot membership binding                | Substitute snapshot/cluster/version; change capture membership      | actual capture and recorder negatives          | Not run |
| Mapping completeness/uniqueness            | Omit/duplicate/conflict mapping                                     | recorder/planner negatives                     | Not run |
| Machine fence coverage                     | Wrong machine/provider, missing/extra/duplicate/running/empty fence | planner/CLI negatives                          | Not run |
| Replacement disjointness                   | Relabel/reuse original                                              | planner and actual playbook negatives          | Not run |
| Direct plan execution validation           | Feed old/malformed/inconsistent plan directly                       | actual Ansible sentinel harness                | Not run |
| Actual target observation                  | Replay alias/variables; identity absent/unreadable/different        | actual Ansible sentinel harness                | Not run |
| Single target and datastore confirmation   | Multiple hosts; live datastore without exact confirmation           | actual Ansible sentinel harness                | Not run |
| Secrets/version/placed snapshot            | Wrong/missing/unreadable secret; version skew/corrupt bytes         | existing planner plus actual Ansible negatives | Not run |
| Node identity before deletion              | Replace original Node UID                                           | actual cleanup path against controlled API     | Not run |
| Node deletion UID precondition             | Recreate Node between read/delete                                   | actual cleanup path against controlled API     | Not run |
| Cleanup failure classification/convergence | Permission failure, malformed read, rejected/hanging deletion       | actual cleanup path against controlled API     | Not run |
| Separate volume fence boundary             | Supply cold document to volume CLI                                  | legacy volume cases plus cross-input negatives | Not run |

## 5. Gate Output

The planning pass ran documentation format and OpenSpec validation only. As of the recorder increment, the full Nx gate, h2puni gate, controller build, native capture and restore rehearsals remain unrun. No hosts were accessed in this change.

`bun /home/df/wd/puni/puni-00/node_modules/prettier/bin/prettier.cjs --write CONTEXT.md openspec/changes/cold-restore-identities` initially exited 1 because this worktree could not resolve `prettier-plugin-tailwindcss`. After linking its ignored `node_modules` to the existing workspace dependencies, the same command exited 0 and formatted only these documentation artifacts. No install or download was performed.

## 6. Implementation Signal

Planning base: `53dfef620fa8f065dbddb9a2d9184c3469829475`; worktree `/tmp/puni-cold-restore-identities`, branch `plan/cold-restore-identities`. No push requested or performed. Existing-host cold restore remains blocked pending the separately supported isolated rehearsal.

## Decision

The October packet was ready for Astra review. Implementation acceptance remained incomplete.

## Recorder preparation · 2026-11-19

Base `fe3fdac564060e3041fa9934c7ffd4b67150f5c5`. The existing planning package was ported from `707df18931e6f0534c6fb5b4078b594fe381e234` into an isolated detached worktree after a path collision check. Astra selected the leader-bound first-chunk cut witness and the provider/allocation-bound replacement peer. The recorder will use fixed controller authority and versioned HTTPS reads. Tests supply that authority through a separate read-only fixture mount and issue normal CLI arguments.

The first request is `bun test --preload ./tools/test/scratch/preload.ts --timeout=20000 ./tools/tool-fleet/src/recover.test.ts --test-name-pattern 'recover.ts record-manifest'` from that worktree after runtime handoff. Expected RED is the old dispatcher rejecting the new flags in all three cases, visible against the positive acceptance and two specific refusal assertions. A certificate, worktree package resolution, sandbox or mount error provides no RED credit. Record full output and observed test outcomes before changing recorder source.

The first request ran on 2026-11-18 at 12:56:41 UTC with pinned Bun 1.4.4 and `--no-install --no-env-file --no-macros`. The three selected actual CLI cases failed with `Unexpected recover flag: --object-version` from the legacy dispatcher. Result was 0 pass, 3 fail, 23 filtered, 7 assertions and exit 1. Linux systemd scope capped aggregate memory at 2 GiB, swap at zero and runtime at 120 seconds. Peak was 113,238,016 bytes, with zero OOM events. The scratch directory was empty after the normal preload cleanup. Full stdout, stderr, scope data and API terminal are in the coordinator's `f10-recorder-red1-20261118` evidence directory.

After that RED, source preparation added the authority-bound recorder and v2 output. The first GREEN attempt at 13:09:19 UTC used the same three test bodies and fixture bytes. The run ended with 0 pass, 3 fail, 23 filtered and exit 1. Each case attempted the first protected publication GET and stopped with `Cold restore object read failed`. The scope peaked at 139,460,608 bytes, recorded zero OOM events and left its scratch directory empty. Full streams, setup and API outcomes are in the coordinator's `f10-recorder-green1-20261118` directory.

One private instrumented execution at 13:13:31 UTC stopped before the custom SDK HTTP handler. The SDK emitted `Error` with code `ENOENT` at `index.js:168:41`, and the loopback fixture counted zero requests. Installed-source inspection matches that location to Smithy's `homedir()` fallback. The explicitly configured client omits its app ID, which makes the SDK read shared configuration before dispatch. A fixed application ID is the proposed repair. The owner source and fixtures retain the first GREEN attempt's pins, and no repair or retry ran. Private pins and raw observations are in the coordinator's `f10-recorder-publication-diagnostic1-20261118` directory.

The reviewed application-ID-only repair still failed the owning positive at 13:18 UTC. The conditional two negatives did not run. A second private diagnostic captured the exact `ENOENT` package stack. The SigV4 signer awaited its unset clock-skew option, whose default loader reaches Smithy's `homedir()` before the HTTP handler. The fixture again saw zero HTTP requests and no manifest. The scope recorded zero OOM events and cleared scratch. A fixed `disableClockSkewCorrection: false` would preserve the SDK default and remove the ambient configuration lookup. No signer repair has run. See the coordinator's `f10-recorder-appid-positive1-20261118` and `f10-recorder-publication-diagnostic2-20261118` receipts.

With the app ID and the reviewed explicit SDK default `disableClockSkewCorrection: false`, the unchanged positive passed at 13:33:52 UTC with 4 assertions. The two frozen refusal cases ran once after that at 13:34:20 UTC and passed with 7 assertions. Both bounded scopes returned exit 0, retained complete output, recorded zero OOM events and cleared scratch. The owning capture source was `285efe498040c126ac0b455fbc7dcc36612ba8c5c5663b70c94649e5f4d8b42c`. See the coordinator's `f10-recorder-signer-positive1-20261118` and `f10-recorder-signer-negatives1-20261118` receipts.

The opaque stored-byte case reached `snapshot-v1` at 13:49 UTC and failed with `Stored snapshot bytes differ from capture evidence`. The one-line Bun `decompress: false` change passed the same case at 13:53 UTC with 4 assertions. Removing only that option retained the version read and produced the same mismatch, with exit 1 and 2 assertions. The exact restored source passed again with exit 0 and 4 assertions at 13:54 UTC. Peaks were 140,816,384, 137,670,656 and 140,566,528 bytes for the three scoped runs. They had zero OOM events and empty scratch. Raw evidence is in the coordinator's `f10-recorder-opaque-red2-20261118`, `f10-recorder-opaque-green1-20261118`, `f10-recorder-opaque-fault1-20261118` and `f10-recorder-opaque-restore1-20261118` directories.

The provider RED reached each authenticated sidecar and admitted three invalid labels into nonempty manifests, while the exact QEMU UUIDv4 and Hetzner decimal passed. The canonical field passed all five cases at 14:13 UTC, with 27 assertions. Replacing only that field's validation with its old bounded string definition again admitted the re-anchored SSH label, wrong QEMU UUID version and leading-zero Hetzner decimal, producing manifests of 1,004, 1,009 and 992 bytes. The three omission cases failed with 9 assertions and exit 1. After exact source restoration, the three refused with 15 assertions and exit 0. Peaks were 141,627,392, 138,280,960 and 138,170,368 bytes. The scopes had zero OOM events and empty scratch. The recorder preserves canonical strings and refuses invalid labels before snapshot read. These fixture cases do not establish independent provider attestation. See the coordinator's `f10-recorder-provider-red3-20261118`, `f10-recorder-provider-green1-20261118`, `f10-recorder-provider-fault1-20261118` and `f10-recorder-provider-restore1-20261118` receipts.

The publication cases first reached their final diagnostic assertion with one generic refusal. Typed routing then passed all three cases with 30 assertions at 14:53 UTC. Omitting only the routing at the SDK catch returned the fixed generic request refusal for each case. The three failed solely at their final assertion after the status, no-output, no-follow-on-read and redaction checks. The exact restored source then passed all three again. The target exits were 0, 1 and 0, with 30 assertions each. Scope peaks were 143,892,480, 139,718,656 and 140,922,880 bytes. There were zero OOM events and scratch was empty for all phases. See the coordinator's `f10-recorder-categories-red2-20261118`, `f10-recorder-categories-green1-20261118`, `f10-recorder-categories-fault1-20261118` and `f10-recorder-categories-restore1-20261118` receipts. Other response statuses, cancellation failure and subsequent-object failure classification remain unproven. The focused pre-handler cause proof follows below. A 403 does not establish object existence.

The combined recorder regression passed at 15:03 UTC on capture source `5593bca6bd95b6ee8168a5161e6d77afd9a37ebc288005b481f434bbc9fc0d16`. All 12 expected cases and 72 assertions passed, with 23 filtered and an exact ordered census match. The target and scope exited 0, peaked at 144,203,776 bytes, recorded zero OOM events and cleared scratch. See the coordinator's `f10-recorder-final-regression1-20261118` receipt.

The capture file's final Prettier check reported a style issue. The exact one-file formatter write reflowed one predicate and preserved all non-whitespace bytes and Proof comment blocks. The read-only recheck passed on `a4d5b284cbedf7736ba4b34ed2ae66ca4a89c60678eaebd1048ebe3d678fc095`. The two scopes peaked at 139,440,128 and 140,902,400 bytes with zero OOM events and verified empty scratch. The regression was not repeated for this format-only delta. See the coordinator's `f10-recorder-final-format-write1-20261118` and `f10-recorder-final-format-check2-20261118` receipts.

The capture-only graph used installed Nx 23.2.1 and produced a fresh, error-free `tool-fleet` graph with one file-map entry for the selected capture file. The graph-backed one-file lint used exact manifest `abdf16f8df21878fc2ea14c02ebad808a86da97acc6882a8ce7f827bd3e870ef` and emitted no module-boundary skip. It failed with one `preserve-caught-error` error at capture line 281. The source and all four graph products retained their hashes. The lint scope peaked at 1,118,900,224 bytes, recorded zero OOM events and cleared scratch. See the coordinator's `f10-recorder-final-nx-boundaries2-20261118` graph and lint receipts.

### Recorder cause, CLI redaction and source quality

The two-case RED reached one publication middleware hit and zero HTTP reads per case. The direct caller received the fixed classification and lost exact SDK error identity. The actual CLI exited 1 with empty stdout and Bun's code frame and stack instead of a single fixed stderr line. Both intended assertions failed with 14 assertions. The typed read error then preserved the exact caught cause while the CLI projected only the fixed message. GREEN and exact restoration each passed both cases and 15 assertions. Omitting only the cause failed the direct identity assertion. Bypassing only the CLI projection exposed the nested synthetic body, credential and signature markers in the actual renderer output. Both inverse patches restored every pinned input. This proof covers the synthetic pre-handler error. The transport path retains its sanitized marker. See the coordinator's `f10-recorder-cause-red1-20261118` and `f10-recorder-cause-green1-20261118/outcome.md`.

An earlier six-file lint found two test middleware style errors and one real Nx module-boundary violation. The reviewed test-only repair switched to the public scratch alias, preserved the original SDK method receiver and awaited the receipt write before throwing the same sentinel. The previous failed lint and all earlier proof generations are retained. The repaired fixture and preload hashes begin `021d12e7` and `28a1e24d`; the production capture and recover hashes begin `b3d49521` and `9cd228b0`.

| Check                   | Observed on the repaired fixture generation                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Bun recorder regression | 14 named passes, 87 assertions, 23 filtered, zero failures and API/child exit 0                     |
| Prettier                | Exact six touched TypeScript files, API/child exit 0                                                |
| Nx 23.2.1 graph         | Fresh tool-fleet graph, all six exact filemap entries and four verified graph products              |
| Uncached ESLint         | Exact six touched files, API/child exit 0, module-boundary rule active and graph products unchanged |
| TypeScript 7.0.2        | Owning lib and spec projects with no emit and no incremental state, both API/child exit 0           |

The final scopes recorded zero OOM events and empty scratch. The evidence and exact commands are retained at `f10-recorder-cause-regression2-20261118` and `f10-recorder-cause-quality3-20261118/final-quality.md`. The consumed graph manifest SHA-256 is `b84ff43d96df0b5c4c242ea65f2162989bb8c7984d0a4584c7089af54cde2fbb`.

### Remaining acceptance

Task 1.1 stays open. The version/index fixture cases reached the recorder's refusal, and their selective check-omission proofs and the remaining input and mapping negatives are still outstanding. The dependency-locked collector, disposable authenticated etcd/Kubernetes cut and changed-index proof, ordinary-write boundedness, K3s restore-byte compatibility and independent provider observation are still required. The source increment stays isolated while the v2 planner and actual playbook consumers are open. Fresh OpenSpec validation after these edits, consolidated build/gate evidence and the later isolated restore rehearsal remain outstanding.
