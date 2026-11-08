# Ordinary and admitted constructor test ownership

Ordinary CI currently imports the storage test's private constructor preparation
before registering any callback. Its literal host/epoch admission is unavailable
in CI, so unrelated ordinary coverage cannot complete.

Keep ordinary verification portable and complete by moving only the preparation
and its three result-consuming callbacks to an explicit acceptance entry. Preserve
all remaining callbacks and every original constructor assertion. Cover the new
entry with configured typechecking and linting and exclude its exact path from
canonical/rest discovery.

This reversible implementation is within the user's standing implementation and
Astra technical-decision delegation. The earlier assistant-imposed private-source
approval hold was too broad. No private execution grant, fresh epoch, release
bypass, source-pin refresh, architectural main adoption or deployment is included.
Constructor qualification remains mandatory for full-goal/release acceptance;
ordinary CI green is insufficient. Historical source-pinned packets may no longer
match the refactored entry and must not be relabeled or reused.
