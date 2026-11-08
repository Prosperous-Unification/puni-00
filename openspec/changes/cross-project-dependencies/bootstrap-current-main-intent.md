# Current-main dormant bootstrap

Problem: startup treats any migration newer than the dependency activation stamp as existing authority. Main acfdc02c has 103 valid migrations including later work, while the four dependency additions remain absent; guarded boot therefore refuses before additive migration.

Outcome: certify exactly that known applied name/hash set and its replayed complete schema before normal startup migration. Also recognize the separately pinned actual-dev history: the original add_dependencies migration from Git 24499e8afa6fb0f86430b31718c05633fc2c7d24 lacks two later CASCADE clauses; all other 102 identities and 434 other schema objects match current main. Replay those exact retained original SQL bytes only in scratch. Preserve source historical identities, existing project values and dormant DISABLED authority after migration.

Non-goals: semantic activation, deployment execution, unknown historical profiles, operator schema extensions, native ownership qualification, or migration/rollback redesign.

Constraints: no source writes before admission; unknown, missing, unreadable, mismatched or partial dependency history refuses. Existing contiguous historical prefixes and strict enabled-authority inspection remain unchanged. Freeze current-main identities independently; certify every name/hash and all schema objects by replay in a disposable store. Normal applied-ledger capture and exact additive rollback remain unchanged.
