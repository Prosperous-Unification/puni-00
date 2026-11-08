# Ready and capsule owner integration

This integration joins frozen ready unit
`1577d762082ac3a4f3d06d123f60242b9424ff24` with the later aggregate after mechanical
merge `2c5c6590d847c5c33d58153b8994f43bd5cca183` and historical-input repair
`9c3ae680ed3065e2dbcb00784324ad3cba26c42d`. The complete-exclusion file remains
byte-for-byte the ready unit: SHA-256
`d805c888045aa36947a38cfa5d8dc2b3eda73606b80ef7b717fe84ddb52aad64`.

The single owner keeps its existing active/closing/unknown `state`, capsule set,
composition settlement and retained runtime originals/observers. Ready cleanup
adds its own set to that owner and uses the same `keeperFor` lifetime. A tagged
callback outcome remains attached to the owner; unknown diagnostic failure retains
its exact identity. Owner return revokes forward work, attempts every known ready
original, requests capsule cleanup and joins runtime/composition originals before
one final custody decision. Unknown state, any remaining ready entry or any
unclosed capsule retains both sets and outer locks. Only complete known cleanup
can clear the keeper and delete the owner. Initial-ready enrollment and
consume-transfer-before-first-await remain the frozen complete unit.

## Observed behavior and proofs

A naive union of the incoming early ready HOLD and existing capsule loop failed
one new owning assertion: ready UNKNOWN prevented the distinct known capsule
original from being attempted (`0` instead of `1`). The other mixed direction
passed. Moving the terminal HOLD after both cleanup populations restored both
cases. The final inert controls observe each distinct original once, actual
closed/unknown original states, the exact composition Promise, callback and
cleanup causes (including callback rejection of `undefined`), one keeper retaining
both sets, original lock retention and refusal before further publication reads.
No successful capsule phase is fabricated when common owner state is unknown.

All tests execute the actual current owner/consume source cut with fixture-owned
inert lock, timer and IO ports. They acquire no native original and establish no
native HOLD or image qualification.

Seventeen merged-source omission/restoration pairs each reached an owning
assertion failure and then passed with exact source restoration:

- Owner deletion before drain; successful ready discharge; consume transfer.
- Combined unknown HOLD; callback outcome capture; diagnostic failure capture.
- Unknown-entry retry exclusion; before-read and after-read forward guards.
- Ready entry owner association, enrollment state, transfer state and close-once.
- Keeper enrollment and shared keeper reuse.
- Ready sweep and capsule sweep, independently omitted in both mixed controls.

There was no timeout, syntax or setup-error credit. The final exact mutation
needles, scopes, source hashes, selectors, exits and raw logs are in
`/tmp/puni-session-later-merge-report-20261108/merged-final-proofs/merged-owner-proof-pairs.json`.
The predecessor unit's proof claims are not silently inherited: keeper enrollment
now uses the known-close control because the shared terminal helper can lazily arm
an unknown owner, and deletion's independent necessity remains unproved because
closing also revokes authority. First historical planner pin-guard omission proves
first-refusal classification only; the downstream materializer still refuses.

Raw current owner and complete-exclusion bytes now independently differ from old
historical pins. Both refuse the unchanged old planner without appended drift.
Historical positives still consume only the authenticated seventeen-file archive;
no source/image/native/packet authority was repinned.

## Final finite verification

- Combined archive reader, ready/mixed controls and selected historical
  planner/import-free VM ledger/receipt consumers: **63 passed, zero failed,
  1,215 assertions**. Raw stream: `ready-combined-verified.log` in the directory
  above. This includes nine archive cases, thirteen ready/mixed cases and forty-one
  historical/current-source cases; 156 other owner cases were explicitly filtered.
- Owning remote-script typecheck: exit zero, no cache hit
  (`ready-typecheck-verified.log`). The initial mixed-test optional outcome typing
  error was corrected with an explicit required-state narrowing.
- Focused production/source-consumer ESLint: exit zero
  (`ready-lint-verified.log`). Optional collection reads use `.at(0)` so absent
  trusted state remains an explicit throw.

Frozen SHA-256 identities:

- Owner: `87b132355984a7562887faf3f82e24bb878c8acab7f2b04110dadd2245536bd0`.
- Ready model: `c299d9be9c98f2080acaf455e0738e0ef13c1cb5387a4ef4a70c34ced31c49af`.
- Owner tests: `013ea58c69eeb6e6b34544be7b15c37bb7038963c784435140a7ac8f7dffce4d`.

Astra independently reviewed the combined source, mixed models, raw-current
refusals and all seventeen raw proof pairs; final source/hash receipt is retained
with the integration handoff. The ready unit's four genuine healthy controls are
historical evidence for commit 1577, not silently rerun or promoted to native
qualification of this aggregate. No full storage suite, generated native helper,
R2 source overlay, host gate, installation, deployment or live activation ran in
this task. Legacy adoption, final composition CI and host gate remain separate.
