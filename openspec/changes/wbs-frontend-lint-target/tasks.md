# Ordered TDD slices

> The ordered slices below record completed local work. The verification record gives the executed checks, source checkpoints, and remaining integration gates.

## 1. Freeze the source and prove the old target's contract

- [x] Create the approved managed worktree and apply the frozen composition from the pinned Shared Occupancy 5.1/5.2, 6.1 and 7.1/7.2 overlays in that order. Verify all 90 working afterimages and the clean index. Keep a separate manifest for this target change.
- [x] Capture original target operands from the frozen FE project config. Keep the root TypeScript test in both old and new target forms. Add failure witnesses for an omitted root operand and the whole-owner input contract.
- [x] Write a verification-only old-CLI finder hook and make it demonstrate the original effective file roster from all 24 operands without linting those files. It must refuse a missing hook, wrong ESLint package/version, unmatched operand and load error. Prove an independently removed path is named by a coverage mismatch.
- [x] Record old diagnostic and exit behavior on focused original-CLI fixtures for explicit ignored files, fully ignored directories, missing operands, config error, warning only, typed error and fatal parser failure. Capture actual parser-open order, relevant prefixes, selected Program and rule settings before writing the new engine.

## 2. Derive exact groups and keep compatibility explicit

- [x] Write focused engine tests first. Cover disjoint grouping, new ordinary and configured module directories, direct module source, nested lookalike paths, JS/MTS paths selected by applicable ESLint config, explicit ignores, missing operand and empty group or selected roster. Verify actual private adapter failure on changed version and missing finder export. Use exact output/error evidence.
- [x] Implement installed ESLint discovery adapter and partition, with small path functions and fail-closed private API assertions. Keep the existing FE root config and TypeScript configs fixed. Add the witnessed adjacent `Proof:` comments.
- [x] Prove both invocation modes. Default command uses serial mode. A forwarded real CLI flag and scoped test suppression manifest each activate visible whole-CLI mode with exact unchanged operands/flags. Resource failure, config failure or a malformed report must never enter whole-CLI mode. Verify an unreadable suppression file follows the original failure behavior.

- [x] Use Nx's pinned input-array spread in the FE full target and resolve the actual graph. Check the prior complete inherited input set is intact and the new root file applies only to FE full lint. Observe actual task hashes for absent, present, changed and removed suppressions, without running full owner lint for each state. Prove removing the hash input admits stale reuse or an unchanged task hash across a mode transition. Keep `lint:fast` unchanged.

## 3. Settle complete worker groups

- [x] Write RED cases for clean exit plus missing/malformed/truncated report, dropped file, duplicate report, out-of-group path, early exit event before output close, nonzero first and later group, spawn error and signal. Observe cancellation with an actual bounded child that exits after TERM. Test no later launch and final reaping. Unit fakes may control ordering but at least the signal, omitted reported file and suppression-of-exit faults must traverse the actual launcher.
- [x] Implement serial worker dispatch, the formatter's private path report, typed status 1/2 aggregation and signal forwarding. Stream normal stderr/stdout. Prove the actual Nx graph-skip warning fails the launcher even after a zero child and a complete report. Show report actual roster equality, visible complete diagnostics and exit status. Prove a configured empty group cannot invoke ESLint's empty-args fallback.
- [x] Wire the existing `project.json` full owner command, keep all operand tokens and preserve `lint:fast`. Register the smallest affected tests in existing Node tier. Verify direct shell and normal Nx entry points from the existing workspace CWD.

## 4. Exercise actual policy and publish local evidence

- [x] Compare the original full effective roster with the actual redesigned reports, including future files and ignored controls. Compare effective settings and the actual selected TypeScript language-service Program, ambient and alias fingerprints for app, spec, real module projects, browser and overlapping root files. Record observed open order and relevant prefixes in each probe. Confirm Nx-tagged graph policy in actual rules.
- [x] Introduce one real typed floating promise and one real forbidden browser-adapter relation in separate groups. Demonstrate both findings using the normal target. Check omission and early termination on the production launcher. Independently alter copies of actual coverage, completion and Program evidence to verify the acceptance reader. Retain exact reversions and adjacent proof comments for the production guards.
- [x] Run the normal FE Node suites relevant to the target contract, standalone root-config lint for any new runner/helper, required format and read-only OpenSpec checks. Read the actual owner inputs and run complete redesigned owner linter once under the qualified profile. The latter run must prove serial mode and the real complete denominator.
- [x] Review the exact patch and source/capture custody. If the equivalent full target still hits local limits, preserve the local block. Host gate, public CI, publication and product integration remain separate checks.
