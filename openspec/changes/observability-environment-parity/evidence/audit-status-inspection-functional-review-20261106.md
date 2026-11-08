# Task119 independent scoped review

Spec verdict: PASS for the authorized fake-native verification and restoration scope. Quality verdict: APPROVE WITH ONE NONBLOCKING DOCUMENTATION NIT. No correctness, native-isolation, captured-buffer integrity, or scope blocker found. This review does not authorize administrator execution or qualify native/whole-host operation.

Reviewed the task brief before the implementation report, AGENTS.md and LLM_README.md orientation, all four files in `/tmp/puni-task119-review-package.diff`, the current complete diagnostic/test/proposal, the prior static review, and recorded evidence under `/tmp/puni-task119-evidence`. Baseline supplied: `5c5fecd58bc1a5a4bcc15b4a9be452a70ba44083`.

## Finding

- P3, `openspec/changes/observability-environment-parity/evidence/audit-status-inspection.py:134`: the Proof comment says omission “accepts a late fake status.” In the final `late-ready-omit-timeout.log`, the remaining post-reply deadline check still refuses the status; the test fails because an extra `audit_get_reply` call occurs. Clarify the comment to distinguish the late-readiness omission permitting a reply read from the post-reply omission permitting an observed late status. This is evidence wording only; both guards have meaningful negative proofs and the runtime behavior is correct. Any eventual source-comment edit must refresh its byte/hash pin before publication.

## Contract and quality assessment

- The runtime change is limited to rejecting selector readiness and reply returns at or beyond the existing deadline. The request is still issued once, the deadline starts after that request, and the loop remains bounded to four frames. The model clock tests include exact-deadline rejection, just-before-deadline acceptance, and cumulative ACK/status delay. This is an acceptance window, not a claim of preempting native calls.
- The only bound native APIs remain `audit_open`, `audit_request_status`, `audit_get_reply`, and `audit_close`; reply flags are nonblocking=1 and peek=0. Successful opens have a finally-owned close, including exceptions, and failed opens do not close. Negative-errno attribution, raw uint32 status values, bounded status copy, ignored pointer union, explicit unavailable/exit2, and serialized-output cap remain intact.
- Native isolation is installed before diagnostic execution in both harnesses and all listed mutants. CDLL accepts only the fixed library and four API names; unknown lookups raise a BaseException-derived boundary violation. PyDLL is denied. Fake descriptors enter fake selectors and fake audit_close only. The parser still receives actual bounded ctypes memory. No fallback loads libaudit.
- Bootstrap tests extract the actual proposed command body, preserve its pinned expected hash, substitute the disposable path through AST, and execute its captured buffer under the same native fakes. Real owned files exercise metadata/hash/short-read/path replacement/symlink/absence/unreadability. Separate modeled descriptor/path identities isolate guards. Close-before-exec, synthetic filename, and no mutable-path reopen have direct assertions and watched omissions; a hash omission reaches the forbidden-execution sentinel.
- Exactly two external Nx test inputs were added. The supplied diff contains no routing/workflow/runtime integration change. Recorded affected-query outputs show tool-fleet absent before the source input and present afterward for both source and proposal.

## Evidence and limits

Fresh read-only hashing confirmed the diagnostic is 9442 bytes with SHA256 `20ebfae763bdd9fcc2ffee03b64b72be5f00b17fb7e8b9a5a825ade73333ca16`. The exact current shell block, excluding Markdown fences, hashes to `6857adbdfd486a773765758041f3ce3a1723c8d20cc05229be807a31c12bb4ab`. Diagnostic, test, and project hashes agree with the recorded manifest; subsequent proposal prose does not alter the tested command block.

Read evidence records the initial three genuine timing failures and final 96 pass/0 fail/262 assertions/3.02 seconds, including 27 diagnostic and eight bootstrap guard omissions. Named formatting and Python3.12 AST/3.14 fake-success outputs were inspected. ESLint and parent typecheck logs are silent; their successful exit status is supplied by the implementer/parent, not independently established by those empty files.

No tests, campaigns, native diagnostic, administrator command, library/socket, service, network, or retained-state operation were executed during this review. Only repository/evidence reads, static hashing, and this requested `/tmp` report were performed. The initial login-shell read emitted unrelated dconf sandbox warnings; subsequent reads used `login=false`.

The external five-second timeout prefix was inspected, not behaviorally rerun; the optional real timeout experiment remains unperformed. Native installed ABI/kernel behavior, native close under termination, interpreter/native output streams, output-write failure, whole-host input completeness, consumer allocation, and settlement remain unqualified. The 16384-byte accepted source cap and 65536-byte serialized JSON cap are preserved. Full Fleet/app/browser/host gates and previous campaigns were intentionally not rerun. Actual administrator execution remains separately unauthorized.
