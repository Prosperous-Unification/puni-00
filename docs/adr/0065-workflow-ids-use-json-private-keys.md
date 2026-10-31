---
status: accepted
---

# Workflow IDs use JSON strings as private SQLite keys

Preserve the RunStore's accepted opaque IDs with `JSON.stringify` of each raw identity,
including the surrounding quotes, rather than narrowing public IDs or changing all key
columns to UTF-16 BLOBs. Digests and existing JSON tuple keys retain their own encodings.
New workflow-run construction generates a UUID once; persistence and recovery retain it.

The observed SQLite boundary replaced an admitted lone surrogate in a raw TEXT key while
the JSON record preserved it. Canonical JSON-key decoding retains exact code units and
rejects alternate spellings; physical key order is not a domain ordering. UTF-16 BLOBs
would also preserve identity but require broader declaration/reader changes. Restricting
IDs would change the existing port contract and leave old records unresolved.

Use explicit additive format5 with a parallel keyed family and fully validated atomic
copy, keeping0001–0004 and predecessor tables intact. Ordinary open never migrates.
New-format semantic use makes the retained predecessor stale, so downgrade refuses
after use rather than silently discarding writes. A later preserving reverse transition
would be needed to return to an old binary. Old semantic writers must be fenced.

Implementation and tests are authorized; operator-store migration, architectural main
merge and production activation remain separate holds.
