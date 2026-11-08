# Bounded shared connected fanout review

Reviewed commit `3e163bb183c24dd832aa5d7f9b44620f8124cdca` against base `9bfcffb61` in `/tmp/puni-connected-fanout` on 2026-10-22. Read-only repository review; no repository edits.

## Verdict

Bounded approval. No P1/P2 findings in this packet. This is approval of the shared connected capture/partition and mounted progress/label witnesses, not completion of task 5.2 or release approval.

## Reviewed boundaries

Read AGENTS.md and LLM_README.md, OpenSpec task 5.2, connected capture design and live-plan-snapshot delta, `/tmp/puni-connected-fanout-architecture.md`, the packet README and all seven retained fault logs, and actual capture, comparison, recording, mounted writer and delivery paths and their focused tests.

- Shared discovery alternates external and person connections using the established connected-reader helper. Each discovered component is visited once; external components are excluded from ordinary rank-chain input capture. Shared-person connections are reconstructed from scoped captured assignments and carry deterministic keys.
- Before and after graphs remain separate during traversal. Full owned-project inventory preserves recipients after final-edge removal; deleted recipients are excluded. Transition into ordinary shared capture supplies local facts and projection comparison without trying to schedule the previous connected component through the historical format.
- Explicit connected causes are accepted through the complete inventory, excluded from the ordinary comparator when absent there, and invalid causes still throw. Durable recipient/cause pairs are deduplicated and sorted once.
- Connected full inputs are captured once per observation, and the new promise memo prevents duplicate ordinary input reads. The memo is local to each observation, so staged after-state is recaptured.
- Scoped external selection and scoped project/input reads retain organization isolation. Discovery itself is not organization-filtered, but foreign discovered inputs encounter scoped ownership/reference refusals. The existing removed-filter proof establishes a residual-guard 500, not disclosure; the packet describes that limit correctly.
- Connected fanout uses raw facts without invoking connected scheduling or optimizer admission. Ordinary components retain captured selected-cache scheduling. The existing throwing live-admission witness remains green.
- Actual mounted setProgress succeeds in both modes, persists progress, invalidates successor and tail, and a successor-only HTTP refetch changes readiness. Mounted project PATCH crosses a shared-person bridge and an external edge. These are successful mounted writes, while graph setup remains raw fixture SQL and external authoring remains dormant.
- Recording remains inside the owning transaction. Delivery remains after UoW settlement and uses pushRecorded, preserving existing sequence identity. The mounted observer verifies visible committed state and ability to enter another writer; rejected-batch and adapter rollback witnesses remain green.

## Nonblocking evidence correction

`libs/wbs/adapters/store-sqlite/src/fanout-capture.ts:458` and `openspec/changes/cross-project-dependencies/evidence/shared-connected-fanout/README.md:62` describe the forced-isolated-discovery mutation as a historical-capture rejection. The retained `shared-discovery.log` actually shows an assertion failure: ordinary project IDs are `[a1, a4]` when `[]` is expected. The fault does have a failing witness, but these descriptions should name the observed partition assertion. No production behavior change is needed for this correction.

## Fresh verification

Ran:

```sh
bun test libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts libs/wbs/application/core/src/service/committed-fanout.test.ts libs/wbs/application/core/src/service/shared-people-fanout.test.ts apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts apps/wbs/be-01/src/controller/fanout-selected-rank.controller.db.test.ts
git diff --check
git status --short
```

Observed **64 pass, 0 fail, 297 assertions**, Bun exit 0; diff check exit 0; clean repository status. Verified HEAD equals the requested packet commit.

Read the retained R5 mutation failures; did not reinject mutations. The retained logs substantiate the listed faults subject to the description correction above. The candidate-filter-only nonfailure is explicitly disclosed and is not treated as a proof.

## Limits

Task 5.2 remains unchecked, correctly. Semantic rank invalidation, installed optimizer lifecycle causes, all distinct mounted estimate/date/capacity/engine/structural paths, comprehensive topology writer atomicity, actual socket/replay/browser refresh, connected selected optimizer runtime, durable activation and deployment remain unproven by this packet. A successor-only HTTP refetch is not a socket-driven browser refresh witness. The post-commit delivery witness is inherited and uses the isolated case; this review does not claim a new shared-specific delivery fault injection.

No fresh full host gate, lint/typecheck/build, OpenSpec validation, CI, browser/socket suite, activation or deployment was run during this review. Combined-branch checks and the required exact-SHA gate remain integration responsibilities.
