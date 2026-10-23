# Cache outcome boundary

The optimized schedule cache combines row decoding, reader outcomes and pure spawn policy with SQLite reads and guarded writes in 991 lines. Extract the cohesive outcome interpretation into adjacent `cached-outcome.ts` so each file fits the existing 800-line ceiling without deleting symbol knowledge.

This is a mechanical refactor under R4's exception. Keep the original module's public export surface through reexports. The dependency points from cache orchestration to outcome interpretation; the extracted module imports no cache facade. SQL, admission, generation/key predicates, transaction ownership, publication writes and eviction remain in the cache module.

Acceptance: original declarations retain identical non-comment tokens; malformed JSON/DTO/certificate and missing payload/reason remain corrupt, retained and excluded from automatic solving. Unknown stored enums still throw in `optimizer-rows.ts`. Only misses automatically spawn; failed/corrupt outcomes support explicit retry. Quantisation-floor/proven/incomplete labels, objective order, schedule identity, key/generation guards, slot ownership and atomic publication retain their behavior. Focused production-path tests and watched independent mutations characterize the moved guards.

No schema, contract, dependency, behavior, thresholds or authorization changes. This packet supplies source/refactor evidence only. WBS090 row `7ad9e8a6-0369-43f0-9711-8d9e687d92a6` remains `blocked_by_proxy`; a hosted evaluator and source-membership proof must assess this candidate independently. No F7 count is borrowed from an earlier run.
