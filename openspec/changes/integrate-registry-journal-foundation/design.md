## Context

Main7bc8947e supplies the existing schema1 foundation API/CLI. The accepted retained source plus security commit7e4ea483 supplies schema3/4 managed authority at the same paths. Initial versions, promoted-command grammar, completion fencing and CLI bootstrap differ intentionally. Both source contracts and their historical evidence remain authoritative.

## Goals / Non-Goals

**Goals:** retain both precise contracts, one durable coordinator, explicit managed source selection and preserved source history.

**Non-Goals:** activation, automatic migration, a second authority, installed changes, a generic plugin framework, provider/native/private qualification or completing original rollout tasks.

## Decisions

Keep `registry-journal.ts` and `registry-journal-cli.ts` as foundation surfaces. Add `registry-managed-journal.ts` and `registry-managed-journal-cli.ts`; retain the existing managed symbol names and publication facade meaning. Main's complete journal/CLI tests retain their filenames; the retained managed suite receives an explicit managed filename and imports, preserving every assertion.

One internal `registry-journal-core.ts` owns base schemas/transitions, ownership/lock, bounded canonical reads, all-orphan validation/cleanup, revision/instant checks and exclusive fsynced replacement. Fixed typed wrappers select a checked internal profile. Share identical mechanics and discriminate only actual schema/grammar/recovery/permit contracts; do not copy coordinators or widen managed consumers to schema1.

Validate commands before managed deferred bootstrap and bootstrap before lock/state effects. Validate stored version before orphan changes. Ordinary profile reads reject the other versions. Existing explicit managed upgrades alone accept1/2 or3-to4, preserve obligations and retain their fences. Foundation phases remain trusted assertions; managed4 requires physical/verified session evidence. Foundation completion retains strict low-water reopening; managed completion retains its stricter route.

Retarget concrete managed imports, facade re-exports, generated source imports and CLI/build/installer recipes. Preserve fixed installed paths/protocols, baseline ordinary delivery, accepted FIFO/chronology/Flux/endpoint fixes and safe fixture source encoding. Preserve main policy/tests unchanged and merge complementary glossary scopes. A maintenance record never means physical proof.

## Risks / Trade-offs

Type widening can hide missing managed fields; keep exact external responses and discriminated internal state. Shared persistence must not reclaim managed permit files through a foundation path. Whole-domain statfs is not a managed capacity fallback. A committed transaction can precede failed acknowledgement; existing readback/recovery rules remain. Original90 foundation fault observations are historical, not new integration passes.

## Migration Plan

Normal main-into-feature merge preserves both parents after artifact preparation. No installed state migrates. Source retargeting selects explicit future managed artifacts; runtime adoption remains separate and open. Validate meaningful cross-contract RED before coordinator edits, then finite focused suites/proofs and scoped local source acceptance before parent push. The exact published head must pass complete required hosted gate/pixels/infra/CodeQL before external merge.

## Open Questions

None block the accepted source boundary. Final hosted CI/CodeQL and native/provider/runtime acceptance remain unqualified until actually performed in their authorized phases.

## Current-main controller codec integration

Main81b's active Kubernetes writer/parser uses schema4 controller lifecycle evidence, required forward/rollback progress, sticky journal-required Lease ownership and observed Lease UID fencing. The dormant registry writer's schema3/4 means historical pre-controller progress plus explicit binding/history. Coincident version counters do not select authority. Fleet's existing shared core remains byte-identical.

Retain one common request/state/history and migration-capture parser whose state is the precise pre-controller progress (`Omit<ReleaseState, 'controllers'>`), carried verbatim. Move replay validation to both owning codecs rather than run it early in that helper. Active parsing preserves main's order: schema/legacy route, reserved-family refusal, common shape/capture, closed controller shape/lifecycles, controller progress, then replay progress. Its required controllers are never fabricated or defaulted. Dormant parsing refuses a controller-bearing state after common validation, then retains replay/binding/history validation and its precise historical type with controllers forbidden. Replay's parameter narrows only to its five read fields; its body and diagnostics remain.

Active reads reject any `registry`, `registryHistory` or registry-inheritance kind, including otherwise valid controller records. Dormant ordinary reads reject controller hybrids; its explicit inheritance reader remains unchanged. These mixed records were authored by neither previous writer and gain no authority. Preserve original unsupported-schema and all main controller/replay assertions. Add only real file/parser positive and hybrid-negative groups, observe actual admission when each new boundary is omitted, then restore.

Resolve all sixteen main81b overlap paths additively under the recorded manifest. Preserve main-only paths, D-only paths except named codec/ADR repairs, exact policy rows, aliases, dependencies/patch and all assertions. Source fixture prerequisites belong to the workspace phase selecting Fleet and the existing infra job, alongside main's separate required bubblewrap setup. Remote canonical discovery/leaves, CI base/status/timeouts and all active K8s planning/effects remain main's. Run actual frozen Bun1.4.4 install, verify unchanged union lock and patched resolved Ark0.56.2/S3 identities. Before registry ADR relocation, recheck the current allocation; preserve accepted main records and historical evidence identities. Runtime acceptance remains open.

The normal merge hook also requires explicit typed-project routing for the single historical `canonical-properties.ts` evidence script. Its exact-file ESLint project-service admission uses `tsconfig.base.json`; all typed and boundary rules remain enabled, sibling paths remain unconfigured and the evidence is never executed or edited. This is a compiler prerequisite for a known source, not a fallback for unknown files.
