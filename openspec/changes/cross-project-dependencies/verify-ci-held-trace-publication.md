# Held trace publication: focused proof and unresolved caller deadline

The backend job in full CI run `41349143268` failed with
`JSON Parse error: Unexpected EOF` while reading a published fixture marker.
Direct writes to that path exposed a publication race; the deterministic proof
below reproduced premature visibility.
Both real fixture writers now publish through one helper: write complete JSON
to a sibling private file, then rename it onto the public marker. The reader
still parses strictly; malformed published JSON remains an error. This restores
the existing fixture invariant and changes no production runtime behavior.

## Actual negative and GREEN

The proof child performs real split writes and waits for four explicit stdin
release bytes. The parent observes both first publication and replacement of an
existing complete marker. It retains the original child, stdin operations and
both readers through their actual settlements before removing its owned root.

```sh
bun test ./apps/wbs/be-01/src/runtime-dispatch.boot.db.test.ts -t '^(publishes held traces only after complete private writes|rejects malformed published held trace JSON)$' --timeout=20000
```

Before the private-write/rename fix, this exact pair produced one pass and one
failure: `held trace became visible before complete private write` (actual true,
expected false). After the fix, the unchanged pair produced two passes and zero
failures. The malformed-publication control passed in both runs. The original
outer child and both readers joined; the proof child reported settled original
stdin/stream/exit ownership, and its owned root was absent after cleanup.

The pre-fix failure is a production-path negative for this fixture publication
check. It is not a negative proof for unrelated cleanup or production safety.
The final source differs from the tested GREEN source only by the adjacent
factual Proof comment and formatting.

Private actual evidence is retained in the following directories. Their
`final-evidence.json` identities are:

- `/tmp/puni-backend-trace-red-observation-20261102`:
  `4a959beb7f53910ce4c3905a8fe53427f400819367a54e381cf90f8dd3c05ea1`.
- `/tmp/puni-backend-trace-green-observation-20261102`:
  `a6a01c9a8b133f9462508ac10405945befadc8deb96cac3c173fa4aed50de40d`.

## Existing caller verification failed

The separate ordinary pair was executed once, with existing parent, child and
phase limits unchanged:

```sh
bun test ./apps/wbs/be-01/src/runtime-dispatch.boot.db.test.ts -t '^(contains delayed actual receiver readiness before database removal|retains delayed real integration disposal after more than eight seconds of preparation)$' --timeout=45000
```

Readiness passed in 13.52 seconds. Delayed integration failed in 22.07 seconds
with `contained receiver phase expired: disposal-held`; the pair reported one
pass, one failure and 15 filtered tests. No JSON parse failure was emitted.
The delayed test did not reach its post-marker retention assertions. This is a
distinct preparation failure whose cause remains unlocated; it is not proven
unrelated to the source change, and a retry has not established acceptance.

The 22-second preparation clock includes fresh contained imports, an intended
8.1-second delay, real database/authentication setup, boot, worker preparation
and workflow, worker exit/drains, and entry into receiver disposal. The later
8.5-second retention observation starts after the marker and was not reached.
Existing output contains no phase timing capable of locating the delay.

The outer original child and both readers joined, all 143 pinned source/history
files matched, and the dedicated scratch was independently empty. Inner
per-operation cleanup receipts are not emitted by these ordinary tests; no
per-PID or native-close observations are inferred from their absence.

Ordinary evidence:
`/tmp/puni-backend-trace-ordinary-observation-20261102/final-evidence.json`,
SHA256 `cb7cf2a1e6432077d89dba3236aa99608f0fc38e9d40034a73259fb30b800113`.

## Acceptance boundary

The deterministic atomic-publication correction is independently established.
The ordinary pair, full CI, exact-SHA canonical gate, feature delivery and
architectural adoption remain unaccepted at this checkpoint. No deadline was
increased, no failed invocation was retried, and no main merge or deployment
followed. Source4 and the separately held reader/native campaigns gain no
execution or acceptance authority from this proof.
