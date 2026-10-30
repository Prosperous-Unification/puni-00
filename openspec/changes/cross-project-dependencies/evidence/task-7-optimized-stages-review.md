# Optimized stages v2 review

**Verdict: APPROVE bounded packet.** No blocking finding remains in the reviewed pure stage-construction/selection slice. This approval does not complete task 7.3, task 7.4, or authorize production activation.

Reviewed clean `/tmp/puni-optimized-stages` at `c73cc181c09e98a91ebc96ff8943396c3a9b2e58`, containing `87551bc3daf311a979e8d0bcd0db1feaab693531` plus the correction, against feature head `f0a1b99b6` and the change's connected-optimization ruling/tasks. The feature changes since this packet's base `833ceff80` do not modify its three code/test files or its canonical-stage/publication dependencies. Integration has no identified source conflict; no cherry-pick was performed.

The former empty-local bypass is corrected. Both public entry points reject stale surplus slice/work-item placement, invalid membership/ranks, and missing/unknown active ownership before idle or capability handling. An idle member of a nonempty component validates canonical evidence and replays actual foreign placement using an active owner, without returning an optimization question. Entirely empty components use the real resolved scheduler to validate their graph and require neither an invented origin nor an optimizer.

Selection remains a bounded rank/bytewise-ID pass. Each detached stage captures the current composite; both objectives share that boundary/reference; only the enabled optimized member's configured objective can replace placement. Candidate acceptance delegates to the existing whole-component real publication guard, preserving foreign pins and scoped comparison. Earlier stages retain their original boundary evidence. The existing production `deriveConnectedPlan` optimized-capability refusal is unchanged.

Fresh reviewer checks:

- Three focused Bun suites (`connected-optimization`, `connected-plan`, `connected-publication`): **108 pass, 0 fail, 284 assertions**.
- Original `/tmp/puni-optimized-stages-empty-probe.ts`: expected exit 1 at `connected optimization placement keys`; stale evidence no longer returns idle/selected.
- Named-file ESLint with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`: exit 0.
- Named-file Prettier: all three files conform.
- `git diff --check 833ceff80 c73cc181c`: exit 0. Worktree remains clean.

R5: inspected the six correction mutation logs and the earlier packet's mutation outputs. They show actual assertions failing on injected placement-key, idle-foreign replay, membership and empty-graph faults. Ownership/origin diagnostic-only failures and the combined ownership fault are explicitly distinguished from independent safety proofs in adjacent comments and the evidence record. I did not mutate source or rerun that mutation sweep; fresh restored tests and the original regression probe were rerun.

Required integration remains outside this approval: expose prepared connected facts, invoke selection inside the owning snapshot, supply validated captured adapter/hash/certificate provenance, preserve borrowed lifetime and non-admission, restore/project the final composite, and implement publication fencing, terminal persistence/Retry/restart and real reader/exit negatives. Typed adapter identity equality alone does not prove solver certification or hash construction. Keep 7.3/7.4 open and external authoring behind activation.

Not rerun here: TypeScript build, full Nx/host gate, OpenSpec validation, Python/runtime, DB/capture/coordinator/browser tests. The implementation's recorded typecheck is historical evidence, not a fresh reviewer check. This is bounded integration approval only.
