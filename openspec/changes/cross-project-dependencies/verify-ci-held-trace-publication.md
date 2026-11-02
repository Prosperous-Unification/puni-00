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

## CI banner repair and later caller evidence (2026-11-02)

CI run `41368740639`, backend job `125034520449`, supplied a separate
production-path RED: the proof child's inherited 48-byte ANSI Bun banner caused
`trace publication receipt out of order` before any protocol receipt. Complete
raw artifact `/tmp/puni-ci-41368740639-backend-complete-20261102.log` has SHA256
`35acaf6747f075f6d1a4a5a74ad7bbabad5f2d95d9dcfc579dc9f340be363eca`.
That job reported 4960 pass, 3 skip, 1 fail across 4964 tests; the publication
proof was its sole failure. Malformed published JSON rejection still passed.

Both ordinary caller cases passed in that same raw CI artifact: readiness
`contains delayed actual receiver readiness before database removal` in
2617.44 ms, and delayed disposal
`retains delayed real integration disposal after more than eight seconds of preparation`
in 23068.92 ms. The latter total includes its later 8500 ms held observation;
it does not mean its preparation exceeded 22000 ms. These later passes do not
erase the earlier local 22000 ms preparation failure or locate its cause.
The proposed timing diagnostic passed four statics but was restored without
fixture execution; restoration receipt SHA256 is
`804c78462d8ecf657ccdad83754f3a1f5301288fa1d81be6a1817133eb629511`.
Its observer packets remain deferred and confer no runtime authority.

The repair creates a typed private child-environment copy, removes inherited
forced color and requests no color there. It retains TMPDIR/private config,
never mutates the parent environment, and preserves the strict raw protocol,
all 17 parent bodies and existing ownership/deadlines. Four configured statics
passed once. Installed-Bun metadata observation SHA256
`430ea793c6eafd8f99f83df03f1d191bec44976c3dc81ca53a4a81383e229dda`
separately measured forced 48-byte versus unforced 28-byte banners.

The unchanged two-case command above then passed once with outer
`FORCE_COLOR=1 NO_COLOR=1 CI=true GITHUB_ACTIONS=true`: publication 4447.76 ms,
malformed JSON 0.69 ms; 2 pass, 15 filtered out, 0 fail, Ran 2 tests. Original
outer Bun PID 1619654 and both original readers joined in 8.813893257 seconds;
external tool session 15840 is a session identifier, not a process PID.
Raw outer stdout retained the actual forced 48-byte banner. No raw private
child-banner capture is claimed: its unchanged strict parser passed, and its
actual receipt reported four protocol receipts and all nine ordered original
stdin operations fulfilled, plus original stdout/stderr acquired, EOF and
pump/closed fulfilled without cancellation. Original child/group 1619904 had
exit/groupJoin fulfilled, custodyKnown/rootRemoved true. The unique owned root
was independently absent and dedicated scratch empty; all 150 pins matched.
Outer observers sent no signals; the subject's actual group-signal sequence
was not printed. Independent acceptance report SHA256 is
`fd45e0bb68c7b91854ab9b3800b75a940a781f9381be7b68117b02fb2bdfd28c`;
raw evidence is under
`/tmp/puni-backend-trace-ci-banner-green-observer-preparation-20261102/observation`.

This narrowly establishes the private banner repair alongside the distinct
atomic-publication proof. Full candidate CI, exact-SHA gate and task 28 remain
unaccepted; fresh CI after the normal-hook commit is still required. No overall
feature completion, architectural adoption, merge or deployment is established.
