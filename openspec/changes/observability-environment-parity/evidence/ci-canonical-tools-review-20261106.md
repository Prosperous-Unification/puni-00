# Task120 canonical fixed-tool follow-up review

Specification verdict: **Request changes — one narrow proof gap.** The canonical mapping implementation matches the brief; the size-omission regression does not enforce its specified capture-only outcome.

Quality verdict: **Request changes — P2 below.** No additional actionable implementation findings in the reviewed two-file diff.

## Finding

**P2 — Restrict directory-error acceptance to the directory fault cases.**

Path: `tools/tool-fleet/src/lab-staging-native-control.test.ts:989` (OSError branch through line 991).

The handler permits `EISDIR` whenever `fault != 'post-symlink'`. This includes `fault == 'size'`. Consequently, an unexpected directory-open/read failure in the size omission is reported as `EXERCISE` and exits zero before line 992 can require the actual changed-byte capture. The outer Bun assertion accepts any `EXERCISE`, so it cannot distinguish this false proof. The brief and report explicitly require the size omission to return the changed bytes; only `nonregular` and `post-type` may establish the directory-read boundary instead.

Constrain this handler to `post-symlink`, `nonregular`, and `post-type` (with their respective errno), letting an OSError in the size case fail. Alternatively require the exact expected outcome per fault in the outer assertions. This is a test-proof defect, not evidence that the recorded run actually encountered EISDIR for size. No fault injection or rerun was performed during this read-only review.

## Reviewed implementation and evidence

- Read the Task120 canonical brief first, the follow-up report, repository orientation/rules, the complete supplied diff, and the actual production `verify_file` boundary. Compared the two source paths with baseline `b4b574edf8373c4d26c4b9c1a06616d206d51027`.
- The provider defines the original seven roles once, retains the Python physical alias, and strictly resolves the other six before installing wrappers. Selection is stored once; it is not recomputed on each call. Ordinary request pins reuse the shared list. No production guard, fixed role, argv interface, floor, timeout, or helper file changed. Removed imports are already supplied by the shared prefix.
- Physical type/size/dev/inode/timestamps and reads remain physical under the existing conditional owner/link/mode model. Exact aliases leave ordinary owned paths unmapped. The new positive case captures all seven roles through actual production verification, checks physical metadata for the six copied targets, checks logical-alias retarget stability, and checks an owned path's owner remains physical.
- Missing/dangling strict-resolution omissions reach actual missing-file open. Nonregular and post-selection directory/symlink cases reach actual verification and real EISDIR/ELOOP on owning identity omission. These are defense-in-depth observations, not unsafe acceptance. The size fault updates only its test hash to isolate identity/size, and its success path correctly checks changed-byte capture; the finding concerns the alternative exception path.
- The diff preserves the prior 56 cases and existing omission assertions. The frozen cohort log records 63 pass, 0 fail, 216 assertions, 56.99s. The separate physical Python 3.14 compatibility log records 3 pass, 60 filtered, 0 fail, 16 assertions, 3.49s. No test was rerun for this review.
- Fresh read-only SHA checks match TS `5f41494ba37e93a777f77b127e96465e94cfdda8f783c69dca0d83ffaafb663e` and cold `76db118afab6231e464a8d31df140399950053fa269cd7e01bd488e936e6abb0`. Fresh read-only byte/hash comparison also matched all 14 entries in `log-index.json` and all 14 entries in `preserved-source-pins.json`.
- Reviewed the metrics extraction source and its frozen output: ordinary normal/faulted 57221/57344 within 57344; cold 8025/8148 within 8192. The TS artifact is separately 63936 bytes. Canonical component programs are separately 8879/8867 bytes with an explicit 10000ms timeout, not cold-worker payloads. No cap increase or hidden helper execution appears in the diff.
- Format and Python AST logs record success. Lint and parent typecheck logs are empty; their exit-zero statuses are supplied by the parent/report and are not independently inferable from empty files. I did not rerun either command.

## Limits

Hosted notes establish expected/observed `/usr/bin/true` sizes 35288/7, not its physical type or target. The owned real-symlink RED and omission logs reproduce the pin-identity mismatch and actual O_NOFOLLOW ELOOP; they do not establish the hosted target identity.

No new canonical test executes a fixed-tool binary. No hosted CI acceptance, native qualification, full gate, audit/libaudit/netlink/kernel/admin route, service/VM, retained store/raw ISO, drain/credit, or nonce replay was exercised by this review. Whole-input qualification, runtime 4/11, Task97, historical G+K/floors, and retained observability state remain unchanged. Source/OpenSpec publication and hosted acceptance remain the parent's work. This review made no source/index/commit/push changes, spawned no agents, and used no network.
