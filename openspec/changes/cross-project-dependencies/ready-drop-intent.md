# Ready initial-handoff result cleanup

Problem: a fully prepared initial-handoff result is retained only by weak identity maps. If its callback drops the result, owner return expires authority and unlocks while original evidence descriptors remain open. Existing live/expired drop cases fail before fixture fallback; explicit-release controls pass.

Outcome: enroll cleanup custody synchronously only after successful physical finalizers and readiness checks. Sweep remaining unconsumed ready results before owner expiration. Explicit release closes the same original once; consumption transfers this narrow obligation before its first await. Preserve the original callback outcome after known cleanup.

Constraints: a throwing close retains exact context, cleanup failure, callback outcome and original outer locks under a referenced nonsettling keeper. Revoke forward work during closing/UNKNOWN; never retry an uncertain close. Preserve existing tests and native bounds. UNKNOWN tests use inert finite source models; actual native-HOLD execution is excluded.

Non-goals: pre-acquisition custody, pending/consumed-operation tracking, restoration-purpose behavior, broad R2 coupling, full39 qualification, semantic activation or deployment execution.
