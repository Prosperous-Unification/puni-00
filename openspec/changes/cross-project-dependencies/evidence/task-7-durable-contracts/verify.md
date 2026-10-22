# Durable connected optimizer contract foundation

Bounded task 7.3/7.4 packet, based on `61461cc54`. Neither task is complete. This packet changes no migration, SQL terminal repository, admission, coordinator lifecycle, chain snapshot, selected-stage runtime, public UI outcome or deployment capability.

## Contract boundary

`@wbs/contracts/solver/connected-durable` imports domain and existing solver contracts, never core. It supplies explicit-map stored-stage v1, connected-success v2 and boundary-certificate v1 codecs. The success version is distinct from local optimized-result v1. A packet has explicit connected scope and the full mathematical question tuple. Decoding reconstructs and replays the real composite, recomputes stage and question hashes through the mandatory UTF-8 SHA-256 adapter, and rebuilds the complete request from its stage and installed version/budget. Request equality includes all effective local constraints and fixed/occupancy provenance. Unknown fields, omitted required fields, duplicate map entries and altered request evidence refuse. Slice.demands alone retains its established optional domain meaning.

Success retains the original validated solver response, objective values, publication choice and all scoped comparison values. It reconstructs the candidate through the actual response validator/publication guard, never by trusting a cached full foreign schedule. The floor fixture retains candidate B=10/48 while choosing real B=0.2; baseline movement is abs(0.2-10/48), not zero. This resolves movement/comparison evidence at the durable contract seam. The current core selector and candidate-only runtime adapter still require integration to consume the retained evidence consistently.

A direct terminal exactly matches canonical contradictory-bound key/lower/upper/all contributors and retains the full request; a solver terminal requires validated boundary-infeasible initial-model status. Ordinary infeasible, unknown and feasible responses cannot certify this boundary. Full stored stage includes the valid real placement even in the 10/9 integer contradiction. A certificate is scoped to this fixed subproblem, not global plan infeasibility.

The SQLite helper extracts the existing SHA-256 identity algorithm from the captured reader. Golden real-stage and stepped-stage hashes pin byte compatibility. Runtime dimensions stay outside stage inputHash and all seven ordered full-question dimensions remain separate. Generation, attempt and cancellation are runtime fences, not question members. The injected digest is trusted infrastructure; the SQLite implementation uses node:crypto SHA-256 with explicit UTF-8.

## Watched proofs

The checked-in mutation report records independent production edits, semantic test failures and final restoration. The source runner is retained for reproduction. Omissions are made in the production canonical stage serializer before calling the real SQLite question helper; tuple omissions alter the actual full-question array. The golden compatibility checks additionally detect omission of redundant canonical fields, including rank represented both in project facts and the ranks map. Those byte-compatibility failures do not establish independent semantic sensitivity of duplicate rank fields.

Recursive omission tests enumerate nested stored-stage, request, response, scope, identity and direct contradiction fields. Unknown additions, coherent forged hash echoes, forged scope/publication/comparison, duplicate maps, direct standalone baseline replay, solver terminal discrimination and caller-object detachment receive separate negatives. Removing the nonfinite guard admits NaN in a null request deadline through JSON equality; the dedicated test was watched red before its fix and killed that guard separately afterward. Removing standalone stage detachment is tested without an enclosing cloned envelope.

The first construction run failed because the new codec module did not exist. Additional watched red tests caught decoded object aliasing and nonfinite-to-null JSON equality before their implementations. Green output and final mutation counts are recorded below after all edits.

## Remaining integration obligations

- Install strict codecs at actual coherent SQL pair reads and fenced outcome writes; preserve modeled corrupt outcomes.
- Add companion terminal table with paired migration, retention across generation deletion/pruning, contradiction detection and exact-question Retry/non-admission.
- Thread canonical movement reference and original publication evidence through core stage selection; do not feed the chosen baseline back as a new candidate and lose floor provenance.
- Supply installed runtime facts from the actual adapter and compare exact identities at each admission/exit path with generation inputHash/cancel/attempt/enabled fences.
- Keep captured reads non-admitting on the same live snapshot; expire callbacks on settlement.
- Integrate queued/restart/manual Retry, scoped events/public outcomes/saved evidence and activation barriers.
- Existing builder contributor strings are compared exactly together with the complete boundary request. This packet does not change expanded-pair contributor vocabulary or independently certify mathematical solver INFEASIBLE claims.

No runtime durability, restart, Retry suppression, production activation or full feature completion is claimed here.

## Final observed checks

- Focused codec/outcome/helper/captured-reader suites: `bun test libs/wbs/domain/contracts/solver/src/connected-durable.test.ts libs/wbs/domain/contracts/solver/src/connected-solver-outcome.test.ts libs/wbs/adapters/store-sqlite/src/connected-question-identity.test.ts libs/wbs/adapters/store-sqlite/src/connected-optimization-reader.test.ts` — **38 pass, 0 fail, 849 assertions**.
- Configured package target: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-contracts:test` — **554 pass, 0 fail, 2513 assertions**, uncached. Output in `package-tests.txt`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-contracts:lint` — target executed and passed. Focused SQLite ESLint with the generated Nx graph also passed. Initial direct ESLint before graph generation skipped module-boundary enforcement; that initial run is not counted. A later boundary error for a cross-project relative test-fixture import was corrected by using a SQLite-owned fixture.
- Production libs: `bunx tsc -p libs/wbs/domain/contracts/tsconfig.lib.json --noEmit` and `bunx tsc -p libs/wbs/adapters/store-sqlite/tsconfig.lib.json --noEmit` — passed.
- Full contracts package: `bunx tsc --build --force libs/wbs/domain/contracts/tsconfig.json` — exit 2 at existing `src/http/unavailable-consumer-shapes.test.ts:53,87` only. Identical command on untouched `61461cc54` in `/tmp/puni-durable-baseline` reproduces those two errors; exact baseline output is retained in `baseline-typecheck.txt`. No unrelated fixture edits are included.
- Prettier check on all changed production/test files and tsconfig — passed; `git diff --check` — passed.
- `./node_modules/.bin/openspec validate --all --json` — **268 passed, 0 failed** (250 changes, 18 specs).
- **99 / 99** independently injected faults produced named semantic test failures. `mutations.json` names them; `mutation-failures.txt` retains failure excerpts and command summaries. `watch-mutations.py` and `canonical-properties.ts` reproduce the mutations from the repository root. All production mutations were restored; the domain canonical serializer has no final diff.

The initial raw Nx invocation printed only denied daemon/plugin sockets and exited 0 without executing a target. That output is explicitly not proof of lint; configured checks above disable daemon/plugin isolation and show the target commands and success summaries.

No Python source changed, so the Python solver suite was not run. No migration was introduced, so migration lint/rollback were not run. Full host gate, secrets/build/CI gates, SQL persistence/restart/Retry/snapshot integration, browser/UI and deployment activation remain unrun and unclaimed in this bounded packet. Tasks 7.3 and 7.4 stay unchecked.
