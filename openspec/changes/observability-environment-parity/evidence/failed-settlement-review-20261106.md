# Task113 conditional source checkpoint review

Review scope: unpublished Task113 production/test diff against `4c0a1aef699806e9a3b870dde7a5cda0ef7038ad` in `/home/df/.codex/worktrees/aa39/puni-00`, for draft PR760. Read repository rules/index, Task113 integration contract and delta requirements/tasks, writer report, frozen source manifest, exact production/caller/test changes, selected raw evidence and its indexed hashes. Task114 fixture edits were excluded. No source edits, native operation, retained raw/state access, commit/index change, network request or broad passing-test repeat was performed by this reviewer.

## Findings and disposition

The original frozen reader had a P2 strict-schema defect: `durableAck.consumed` was validated by Python dictionary equality against `True`, accepting canonical `1`/`1.0`. The author's narrow correction adds `is True` at the closed ACK boundary with an adjacent Proof. I inspected the real reader REDs and paired predicate-omission GREENs in `/tmp/puni-publication113-ack-type-{red,green}.log`: both representations were accepted before correction; both now refuse, while the preserving-evaluation omission reaches unsafe credit. This finding is resolved.

The same exact-type audit found duplicate composite comparisons at adoption identities, historical ready reservation/snapshot and terminal-capture raw identity, and certificate profile. Those comparisons now use canonical-byte equality against their already typed originals. I reviewed the complete narrow correction against the frozen source snapshots and the ten actual REDs plus final12/12 GREENs (including both ACK cases) in `/tmp/puni-publication113-duplicate-types-{red,green}.log`. The tests re-pin/re-hash descendants and preserve predicate evaluation; unprotected copies reach full acceptance or unsafe reader credit. These findings are resolved.

**Disposition: approve this conditional source checkpoint for draft PR760. No unresolved blocking source findings remain in the assigned scope.** This is not operational acceptance or a claim that Task113 publication/typing/full gates have completed.

## Confirmed boundaries

- `SettlementPrerequisites.qualify`, `consume` and `outside_bytes` unconditionally refuse. Coordinator admission invokes qualification before opening the channel or publishing R; consumption independently precedes the first possibly allocating create. The retained namespace reader also invokes qualification before accepting settlement credit. No request boolean/nonce/hash or O-only namespace bypasses these boundaries.
- The six-role closure and 131072/786432-byte caps remain fixed. All original production hashes matched frozen manifest38 before the authorized review correction. The unchanged allocation role and v1 preservation manifest retain their recorded byte identities. The final correction remains within caps: six roles407735B, largest role114265B. Root must retain the updated identities with its publication evidence.
- The conditional lifecycle uses the original Task107 shared lock and Task111 publisher, one read-only original-inode fsync, actual N/A then B/C returns, authenticated adoption/grant/drained/durable/consumed messages, owned client EOF/exit and matching post-stop terminal cleanup before certificate/receipt/execution. The final consumed ENOENT exception requires prior adoption and exact durable context; reuse/unreadability remain refusals.
- Complete namespace enumeration and canonical reads precede credit; success prefixes retain G, malformed/conflicting entries throw, and accepted execution removes only its selected reservation. Unselected old G remains. Fixed K remains33554432; legacy projection refuses to conceal it. Active repair/lineage admissions carry full accounting, while v1 raw/seed/guest closures refuse retained repair namespaces.
- Existing v1 successful release checker, worker/writer primitives, service/controller limits and physical floors are preserved. The narrow existing lineage test changes only its expected backing floor by K. The TS mock typing correction is fixture-only and preserves API assertions.

## Evidence and limits

Hash-checked original evidence includes43-frozen-new-suites.log (136pass/0fail/625assertions),21-race-native-green.log,27-last-correctness-green.log and38-source-manifest.log. These are inspected existing results, not new reviewer test execution. I also inspected the narrow API mock test result (1pass/0fail/14assertions) and final correction result (12pass/0fail/72assertions/8.00s), plus named formatting output. Root owns final Fleet typing/statics, updated manifests and public reconciliation. No broad passing suite was repeated for review.

Final independently read identities:

| File                                 | Bytes | SHA256                                                             |
| ------------------------------------ | ----: | ------------------------------------------------------------------ |
| lab-repair-worker.py                 | 88773 | `b9c617931b3d4f1b14e8fa78e3010075422b55898e7d47dd6d481179bfc4f049` |
| lab-failed-settlement.test.ts        | 55366 | `0744993b686340c0fde8000521e66dad30d98714dc1d8dab2fa2e221d3f658a0` |
| lab-failed-settlement-source.test.ts | 12183 | `a7410871898eff31051343f4fb246bb7fad315b71b0a1448acca17e27f9f0829` |

The remaining eight original-manifest owned file hashes were unchanged in the review comparison; correction ownership was only these three files. Python AST parsing of the final worker succeeded during the final identity read.

This is a conditional source checkpoint only. Actual outside/transient/first-access/native physical qualification and durable grant consumption remain unavailable; actual systemd/8GiB settlement/drain/debt credit, afterFailedRepair consumer, full rehearsal/runtime4/11/Task97 and hosted/heavy gates remain unverified/open. Task115 is a separate follow-up and is not required to publish a clearly conditional draft checkpoint. Actual oldG141754548224 remains fully pending.
