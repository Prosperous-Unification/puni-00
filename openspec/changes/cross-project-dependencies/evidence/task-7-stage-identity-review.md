# Connected stage identity — independent review

Date: 2026-10-22. Reviewed worktree `/tmp/puni-cross-stage-identity`, initially based on `9f4c968813da388aea6cc7356baa1b3ed57281a3`. Root subsequently reported committing the unchanged frozen files as `94baeab1e`; I rechecked all three content hashes afterward. No source or Git metadata was changed by this review.

## Verdict

**Bounded approval: no blocking finding in the frozen domain canonical-identity foundation.** The serializer preserves the reviewed placement-relevant facts of an authoritative, typed reduced capture, including exact finite local/foreign placement values and original scoped authored selectors. I found no collision between distinct valid typed stage inputs that should differ under the binding ruling.

This is not approval of complete tasks 7.1–7.4, production integration, request validation, baseline feasibility, runtime readiness, wire compatibility, durable certificates, Retry/restart behavior, or publication fencing. No production caller of the new canonicalizer exists in the reviewed tree. Its current input boundary remains an obligation of the forthcoming stage builder and capture pipeline.

## Prioritized findings

### P3 — Narrow the broad validation wording to the checked invariants

Location: `libs/wbs/domain/domain/src/canonical-connected-stage-input.ts:43`.

“Throws on absent, contradictory or nonfinite stage evidence” reads as an exhaustive runtime-validation contract. The implementation consumes a typed capture and checks selected invariants; it is not a complete parser. Independent probes demonstrated that a malformed `slice.personId = NaN` is accepted and JSON-encodes identically to the valid `null` person identity; a malformed `slice.demands = null` is accepted and encodes identically to omitted demands. A graph boundary node changed to an unsupported kind is also accepted, although its bytes differ. These probes deliberately violate the declared input types. I found no actual production entry point delivering such values and do not recommend adding a generic schema parser to this foundation on their account.

Suggested wording: “Consumes an authoritative typed capture. Checks exact reduced ownership, project/rank/anchor and placement evidence, finite numeric constraints, supplied graph nodes/endpoints, and the listed relationship vocabulary/ownership invariants. This is not full authored-capture validation; core validates baseline feasibility.” Preserve the existing warning that omitted authored edges cannot be inferred and original selectors may name removed rows. Upstream validation must establish identifier/type correctness before these bytes become a cache key.

This is a documentation/proof-scope finding, not an identified valid-input cache collision.

### P3 — Name the workflow negative as an absent endpoint, not a foreign endpoint

Locations: `libs/wbs/domain/domain/src/canonical-connected-stage-input.test.ts:689` and its adjacent production proof reference at `canonical-connected-stage-input.ts:91–93`.

The test sets `predecessor.leafId = 'absent'`. It proves refusal of a workflow endpoint outside the supplied graph. In this connected-project domain, “foreign workflow endpoints” can be read as “an endpoint in a different project.” The shared graph validator does not establish that broader property: changing the workflow successor to the existing B-project node is accepted by this canonicalizer, as independently probed.

Rename the case to “refuses absent workflow endpoints through the shared graph validator” and update the production Proof reference. Preserve the upstream authoritative-graph obligation instead of claiming that the canonicalizer proves workflow project locality.

## Contract assessment

- The new stage interface matches the frozen ruling and imports only domain values.
- All `ResolvedScheduleInput` dimensions are represented: row identity/tree/position/as-authored priority; slice effort, width, person, pools, demands and meaningful per-leaf order; resolved nodes/positions/edges/provenance/attribution; floors, deadlines, capacities and holder-bearing elsewhere bookings; complete reduced ownership and complete project ranks.
- Stage owner, mode, common origin, anchors, original authored scoped selector identities/types, and every local/foreign real start and finish are included. Both the local movement/comparison origin and foreign fixed boundary can change the bytes.
- Maps, rows, relationship sets and graph sets have deterministic ordering; pool IDs are deduplicated as semantic sets. Per-leaf slice order is retained. Demand vectors and booking intervals use existing boundaries that require their meaningful canonical order. Source arrays/maps are copied before sorting.
- Finite numeric coordinates are serialized without quantization or rounding. The fresh tests and independent probe distinguish adjacent representable placement values. JSON round-trips every tested placement unchanged.
- The ownership map is checked against every reduced row, including retained parents, and has exact cardinality. Project/rank evidence includes empty projects. Active slices require non-null anchors; empty projects can retain null anchors.
- Original selectors need not exist in the reduced rows. The code preserves them and checks available ownership without claiming to prove their existence in the full authored capture. Missing authored edges likewise remain upstream resolver/capture responsibility.
- Display labels, codes/audit additions and frozen numbers do not affect identity as directed by this ruling. The historical local canonicalizer is untouched.
- There is no domain SHA implementation, solver preparation, endpoint expansion, leveller, or feasibility search. Objective/runtime/budget/quantum/wire identity dimensions remain adapter/runtime work.

## Evidence

Frozen SHA-256 hashes independently matched before and after review:

| File under `libs/wbs/domain/domain/src/`  | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `connected-optimization-input.ts`         | `1e5d2ff3812ef530e30d43dedcd1ed661c656db9c305a0cf04da36b69ac25b56` |
| `canonical-connected-stage-input.ts`      | `44f8cfccccf680e5177ba19dfef2ca8b84f782a24ffc53fd309ad3d1d74ba716` |
| `canonical-connected-stage-input.test.ts` | `458f632dacc66c4f0c180b21899665f6d6c49678ee98f5b72ca39e621d3fd8d4` |

Fresh independent command, from the domain project directory:

```sh
bun test ./src/canonical-connected-stage-input.test.ts ./src/canonical-schedule-input.test.ts ./src/connected-step-node.test.ts ./src/schedule-connected.test.ts
```

Exit 0: **175 pass, 0 fail, 258 assertions, four files**. The new suite contains 96 passing tests.

Additional independent non-mutating probes: `/tmp/puni-stage-review-probes.ts`, output `/tmp/puni-stage-review-probes.log`, exit 0. These verified exact JSON placement round-trips, identity changes for the next representable local finish, original removed selectors and an empty project/null anchor; they also established the malformed-input and graph-validation limits described above.

Reviewed the binding integration-tree `architecture/connected-optimization.md`, related scheduler-optimization delta and D6 design, existing domain graph/slice/calendar validators, authored connected resolver, historical canonicalizer and SQLite hash adapter, and the new tests. Search confirmed the new function currently has only test callers.

The author report at `/tmp/puni-connected-stage-identity-report.md` is appropriately explicit about the invalid root-cwd test invocation, skipped optional performance certification, redundant guards, diagnostic-only failures, and unfinished integration. I inspected the mutation driver, matrix, representative failure output, and the recorded typecheck/lint/domain-test/format outputs. The matrix independently counts **125 rows: 108 nonzero test runs and 17 surviving mutations**, including 60 serialized-property omissions. These are not 108 distinct unsafe-acceptance proofs: some establish diagnostics, and several probes overlap. The report makes that distinction rather than presenting the survivor count as zero. No evidence was found that its surviving constant/redundant fields omit an independent required identity dimension.

I did **not** independently rerun the mutation sweep, full domain suite, lint, TypeScript compilation, formatting, host/repository gates, builds, deployed solver, runtime/wire, persistence/restart, or publication checks. Recorded author logs are historical evidence, not fresh runs by this reviewer. The supplied scope explicitly excluded full host gates and source changes. Required integration and host verification remain open.

## Retained evidence

Referenced logs, mutation matrix and drivers/probes are retained in [task-7-stage-proofs](task-7-stage-proofs/); driver/probe source is stored as text rather than discovered tests. Only trailing log whitespace was normalized. Failed initial invocations, redundant survivors and diagnostic-only observations remain explicitly distinguished.
