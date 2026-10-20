# Finite Twilight allowance assertion

CI 39340424241 on source d7f212959 passed 2,346 Burokrat tests and failed the one
assertion still expecting 50 minutes after the production workflow had selected 75.
The workspace gate passed; the packed suite did not run after this failure.

The focused production-workflow test was reproduced before editing (child 1,
expected 50 / received 75), then passed with the corrected 75 expectation. Temporarily
restoring the actual workflow to 50 produced the intended child 1 assertion
(expected 75 / received 50); restoring 75 passed. Each invocation selected exactly one
test, with 57 filtered out, and every 2 GiB / 360-second guard recorded stopReason:null.
The final source change is the expectation and adjacent observed Proof comment;
the production workflow remains unchanged at 75.

[Raw evidence](raw-evidence.json.txt) retains fourteen original UTF-8 files as
lossless JSON strings, with original paths, byte lengths and SHA256 digests.
Each string encoded as UTF-8 was independently compared with its retained source
bytes after writing the carrier. It includes all four command receipts/stdout/
stderr, the unchanged guard, and the actual failed CI log.

The queued canonical d7 gate was deliberately cancelled before checkout after
this known failure: gate 726080 received SIGTERM, wrapper wrote 143, both processes
and its queue ticket disappeared. No test verdict is claimed for that cancelled
run. A repaired exact-source gate and full CI remain required.
