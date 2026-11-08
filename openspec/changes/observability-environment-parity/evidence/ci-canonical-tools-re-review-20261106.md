# Task120 canonical follow-up: fix-round re-review

Original P2 finding: **ADDRESSED**.

Final specification verdict: **PASS for the scoped Task120 conditional-fixture follow-up**. The sole proof gap from the original review is closed.

Final quality verdict: **PASS for the reviewed changes**. No new actionable finding in the exact fix-round diff.

At `tools/tool-fleet/src/lab-staging-native-control.test.ts:991`, the handler now permits only the three intended `(fault, errno)` pairs: post-symlink/ELOOP, nonregular/EISDIR, and post-type/EISDIR. A size-case OSError is rethrown; success for the ordinary size omission must reach the actual changed-byte capture assertion at line 993. The other canonical cases retain their distinct intended outcomes.

The added regression at line 1056 injects a real dependency fault into production verification's read path: it opens an owned directory and calls the original `os.read` on that actual descriptor. It closes the directory descriptor in `finally`, leaves unrelated reads untouched, and does not fabricate an errno or acceptance predicate. Its marker establishes that execution reached the injected syscall rather than failing during setup. The protected program must fail with IsADirectoryError and without either successful capture or the old directory-acceptance marker. Omitting only the exact new guard must change the program and produce the former zero-exit outcome, with the directory-acceptance marker and no capture marker. This directly exercises the reviewed defect and the new guard's ownership.

The recorded RED log shows the old handler returned zero, causing the new expected-nonzero assertion to fail after its fault marker assertion passed. The focused GREEN log records **8 pass, 56 filtered, 0 fail, 52 assertions, 826ms**, including all seven canonical cases plus the new two-invocation proof. Its protected child exits 1; its guard-omitted child exits 0. This is 15 actual component invocations in the scoped run. These are reviewed execution records, not tests rerun by this reviewer.

Fresh read-only source hashes match TS `1b1c664a4321fa86e31f4874177865ee98963437e68b270a594485ea3486d3a7` and unchanged cold provider `76db118afab6231e464a8d31df140399950053fa269cd7e01bd488e936e6abb0`. All seven fix-round artifacts match the updated index's byte counts and SHA256 values. The exact diff changes only the error-pair guard and adds its regression; it does not change the shared provider, ordinary fixture, production guards, roles, inputs, or previous 56-case branches.

Recorded bounds remain ordinary normal/faulted **57221/57344 bytes** within 57344 and cold **8025/8148** within 8192. The isolated canonical programs are **9019/9007** bytes; the new directory-read programs are **9469/9337** bytes. Both isolated components retain explicit 10000ms subprocess bounds. The TS artifact is separately **66489 bytes**. Format output records success; lint and final Fleet typecheck exit-zero statuses are parent-reported, not inferred from silent logs.

The original review's unaffected implementation assessment and evidence limits still apply. No full-cohort, Python 3.14, recovery, audit, full gate, hosted CI, native/admin/service, or retained-state check was rerun by this reviewer. This review does not establish hosted acceptance or native/whole-input qualification. The hosted `/usr/bin/true` physical type and target remain unknown. Publication and hosted acceptance remain parent-owned.

Review inputs: the canonical brief, final scoped fix-round report section, `/tmp/puni-task120-canonical-fix-review.diff`, corresponding current source, and indexed fix-round logs. No source/index/commit/push changes, network access, or subagent work were performed.
