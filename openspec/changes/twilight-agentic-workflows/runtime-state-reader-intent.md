# Retained RuntimeState reader — independent prerequisite

Problem: the existing readTargetObservation embeds retained RuntimeState media, byte-integrity, fatal-UTF8 and public-schema decoding, then discards authority and claim inventory when projecting one target. No separate full retained-state reader exists in the inspected Dash source. The live RuntimeClient.readState and retained receipt verifier cover different boundaries.

Outcome: extract that exact decoding stage into readRuntimeStateArtifact, immediately consumed by readTargetObservation with its existing input signature, reference/target snapshots, predicate order and errors preserved. The returned value is the existing public RuntimeState type. This enables future callers to inspect the complete retained observation without duplicating the parser or inventing another validation facade.

Non-goals: outcome packets, final success/failure mapping, RunStore methods, history/envelope versions, SQLite format/migrations, receipt changes, current authority claims, WBS, CTT, business attempts, models, network or deployment. This does not implement outcome delivery or accept its pending/compatibility decisions.

Constraints: keep original F26–F29 check semantics and provenance; moved guards do not earn new proof credit. Preserve readTargetObservation's reference parse/snapshot and target snapshot before its first await, and unchanged target predicates. Only the new full-reader reference-detachment and exact import admission receive new finite fault samples; immediate delegation is checked by structural equivalence and affected regression tests. Implementation stays in an isolated workspace.
