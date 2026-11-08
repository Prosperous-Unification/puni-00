# Task 120 independent scoped review

Specification verdict: **PASS for the authorized fixture implementation scope.** Hosted acceptance remains open.

Quality verdict: **PASS; no actionable findings identified.**

Reviewed against baseline `2e3931fb800356e23cfa45664e729c35e6ebd6d5` in `/home/df/.codex/worktrees/aa39/puni-00`. Read the task brief, including the final capacity ruling, before the report and full three-file review diff. Read AGENTS/LLM orientation, relevant production verification callers, fixture consumers, and named evidence. This was a read-only source review; only this report was written. No test, compatibility campaign, native operation, network operation, service operation, commit, index mutation, or push was performed.

## Findings

No actionable findings requiring severity/path/line entries.

## Specification assessment

- **Metadata boundary:** `tools/tool-fleet/src/lab-staging-native-cold-fixture.py:28` shares the stat transformation and limits it to the existing modeled `/usr/` and `/etc/python3.12/` namespace after runtime alias mapping. It changes only owner, link count, and writable mode bits. File bytes, device/inode, size, timestamps, and actual I/O remain physical. Disposable source/request/state paths remain outside that namespace. The mapped copied platform file is intentionally a selected runtime alias in the cold mutation case.
- **Deduplication:** removing the second ordinary/cold stat wrappers preserves the intended selected observations through the common provider. Replacing the unconditional special-case samefile result with the standard samefile comparison retains physical device/inode comparison through mapped `os.stat`. Existing cold platform substitution is represented by the exact alias inserted at line 72, allowing matching path and descriptor observations without broadening foreign runtime acceptance.
- **Refusals and owning proofs:** `tools/tool-fleet/src/lab-staging-native-control.test.ts:500` checks version, executable, hash, owner, links, mode, and kernel faults against actual production refusal categories. Each omission proceeds through actual verification and source capture; the seven outer stdout assertions prevent silent branch omission. Existing foreign-runtime and cold changed/unexpected-runtime refusals remain. The controlled packaging RED logs identify simulated `/usr/bin/git` metadata and reach the same production `pin-identity` predicate; they do not identify the actual hosted offending pin.
- **Diagnostics:** the failure-only wrapper at `lab-staging-native-cold-fixture.py:55` adds a path truncated to 256 characters and fixed-size expected/observed metadata fields, then rethrows. It does not convert a refusal into acceptance. The actual admission implementation remains unchanged.
- **Recovery ownership:** `tools/tool-fleet/src/lab-raw-repair-recovery.test.ts:337` uses the existing owned-state writer, verifies a production-reader round trip, and emits budget JSON to stdout. All three relevant consumers parse the JSON as unknown and assert budget values. The previous shared `/tmp/puni-task118-evidence` write is removed. The new clean-scratch test redirects external text writes to an absent parent within its own disposable root; it neither creates nor deletes shared prior evidence.
- **Setup proof:** the final amendment asserts the interception marker. The recorded omission leaves the actual coordinator/worker component successful and then fails precisely the missing-marker assertion. The final clean-scratch GREEN is recorded separately from the earlier complete affected cohort.
- **Capacity ruling:** recorded executed ordinary scripts are 57,221 bytes normally and 57,344 with injected metadata; cold scripts are 7,771 and 7,894 bytes. They meet the 57,344/8,192 limits, including injections. The 58,055-byte TS artifact is explicitly separate under the binding ruling. No native cap, floor, timeout, or production admission source is changed. The extraction cap/count proof harness removes the real guard and observes the explicit extraction marker; this is an extraction-boundary proof, not a native execution claim.

## Evidence assessed

Fresh read-only hashing matched all three frozen source identities from the report, including recovery SHA256 `4ba0c82c0499b4f49f3cc138950eb4718df23b31d170708cb5fa5794db54bff4`. All 16 entries in `/tmp/puni-task120-evidence/log-index.json` matched their recorded byte counts and SHA256 values.

Read recorded results: 56 staging passes/175 assertions/56.20s; three affected recovery passes/45 assertions/1.55s; three physical Python 3.14 compatibility passes/28 assertions/3.73s; six cap/count protection/omission invocations; scoped formatting and physical 3.12 AST output. Read the causal RED logs, setup-omission RED, and final clean-scratch GREEN (one pass/16 assertions/501ms). Read the compatibility harness transformation: it substitutes physical interpreter commands and relocates source references while preserving fixture behavior. The final parent typecheck log is empty; the exit-0 status is parent-reported, not independently established by that empty file.

The baseline diff names exactly the three source files plus parent-owned `tasks.md`; no other tracked production/control/diagnostic source differs from the baseline. The parent's explicit 13-identity verification is accepted as parent evidence, not represented as a separately repeated hash audit here.

## Limits and open acceptance

No tests, lint, format, AST checks, typechecks, host gates, full Fleet/app/browser campaigns, or hosted jobs were rerun by this reviewer. Existing logs establish the stated recorded runs, not a fresh final-source whole-suite run. Staging and the unaffected recovery branches were frozen before the test-setup-only amendment; only the amended clean-scratch case was rerun afterward. Empty lint/typecheck logs alone do not prove command exit status; their successful statuses are supplied by the worker/parent report.

The physical hosted offending pin remains **UNKNOWN**. The metadata fix is supported by controlled causal fixture evidence, not captured hosted metadata. Physical 3.12/3.14 execution with a modeled 3.12/kernel provider is conditional component evidence, not native admission or host qualification. Hosted success, normal commit/fresh push, and required host gates remain parent-owned acceptance work. Whole-input qualification remains false; runtime 4/11 and Task 97 remain open. Historical G+K and floors are unchanged.
