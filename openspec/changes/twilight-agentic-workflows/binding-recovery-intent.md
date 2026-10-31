# Retained workflow binding recovery

A generic RunStore manifest binds canonical JSON and artifact references. It does
not establish that the JSON describes a complete Burokrat acceptance. A restarted
driver needs immutable accepted settings and original prompt bytes before durable
preparation, without casting generic JSON or rereading edited working files.

Add a Burokrat-owned unknown-input acceptance decoder and a Dash manifest-binding
reader. Reuse the existing decode/check/accept phases, actual ArtifactStore reads,
and complete canonical snapshot comparison. Preserve original-byte hashes, BOMs,
multiple paths sharing content and duplicate references. Keep the acceptance digest
distinct from the complete manifest digest.

The outcome is verified retained selection input, with real memory/SQLite and
restart-after-file-edit tests. Missing, malformed, unreadable or inconsistent state
throws. The association establishes static consistency and referenced-byte integrity,
without authorizing execution.

This internal slice changes no portable records, adapter format, SQL, generic
manifest retention, credential/provider construction, spending, revocation policy,
re-pinning, dispatch, executor session, claim, turn, outcome, coordinator or CTT
implementation. Later durable preparation and execution ordering remain required.
Parent6a.3 stays open for revocation and provenance-aware re-pinning. Final cohesive
source review, exact-SHA canonical gate and applicable CI remain required; this
helper has no independent release.
