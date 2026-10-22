# Retained workflow binding recovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. One coherent task, task review and bounded whole-phase review. Root owns Git and tracked planning metadata.

**Goal:** Reconstruct immutable Burokrat acceptance from a retained RunStore manifest and original artifact bytes.

**Architecture:** Add one Burokrat unknown-input decoder, then compose existing decode/check/accept and ArtifactStore owners in a Dash read boundary. Both actual persistence providers share semantic tests; no portable format changes.

**Tech Stack:** Bun, Nx, TypeScript, ArkType and existing memory/SQLite RunStore/ArtifactStore.

**Spec:** [binding recovery design](binding-recovery-design.md), [intent](binding-recovery-intent.md), [workflow binding](specs/twilight/workflow-binding/spec.md).

Local checkbox acceptance records implemented behavior and scoped verification.
Historical Python noncompliance remains rejected and disclosed in verify; closure
does not certify process compliance or parent/cohesive operational readiness.

## Global Constraints

- Work only in native de55/feat/agentic-durable-execution, starting from0aec439bdc22d46618ffc442408f9063a62ec4d5 plus root planning commit. Bun/Nx only, login:false. One implementation writer. No main/user checkout, CTT or other owner's tenant/auth/credential/limits/provider/activation work.
- Root owns all Git/index/HEAD, tracked proposal/spec/design/tasks/verify/CONTEXT, review packages, commits, publication and gates. Worker edits only listed source/tests/policy and its own ignored task evidence; no staging, commit, branch mutation or subagents. Report exact path/cause before widening scope.
- Keep records.ts, record-codecs.ts, all SQL/down files, schema version2 and generic manifest retention unchanged. No new adapter, format, CLI, executor launch, claim, turn, outcome, driver, credential/provider/spend/revocation/re-pinning implementation.
- Implement exactly decodeWorkflowAcceptance and ManifestBinding/readManifestBinding signatures from the design. Decode is shape/descriptor validation; checkWorkflowBinding is static coverage; acceptWorkflowBinding establishes original-byte acceptance. No casts from generic manifest JSON, public raw JSON/freezing helper or async Burokrat artifact resolver.
- Descriptor paths are sorted unique complete all-class paths. Multiple paths may share SHA256. Every duplicate manifest artifact reference is read/verified; only first digest expands sources. Missing declared sources use existing acceptance refusal. Extra undeclared digest refuses. Binding and manifest digests remain distinct.
- Snapshot manifest before artifact awaits and each prompt byte array before later awaits. Return detached deeply frozen association; never freeze caller input. Full canonical acceptance snapshot equality is required. Tool-policy reads verify bytes only. No filesystem fallback or execution-authority inference.
- Every genuinely new/changed safety guard and newly consumed dependency needs an observed production-path negative, exact restoration and truthful adjacent Proof. Preserve failed/masked/setup trials and limitations. Do not recertify every unchanged owner guard.
- Retain raw stdout/stderr, exit/duration/command metadata and original/mutant/restored identities for every new invocation/fault in own task-1-evidence. Before the final focused run request root source/index/HEAD hold; capture all tracked source/mode hashes, complete staged mode/blob/path identity, full status and HEAD before/after, with raw index hash separately. Include untracked new source paths explicitly. No unreported capture gap.
- Focus final new/neighbor files, four devsync policy suites, uncached Burokrat lint:source/typecheck, Dash lint/typecheck, tool-devsync lint/typecheck and changed-file format/diff. No full package/backend/RunStore/browser/host/CI repeat unless a named concrete concern justifies it. No independent helper release; final cohesive review/exact-SHA canonical gate/applicable CI remain open.

**Authorized exact fixture correction:** `tools/tool-devsync/src/workspace-targets.test.ts`,
only the Dash case's WBS-contracts dependency expectation false-to-true and an
adjacent observed-failure comment. That edge predates binding recovery. Preserve
Burokrat's separate negative, Navigator and WBS-validation assertions. Keep the
failed four-suite result and first freeze, then run the complete corrected file
and relevant uncached devsync pair under a second freeze; do not repeat unchanged
source/policy/static suites.

### Task 1: Recover retained manifest bindings through their owners

**Create production:** `apps/twilight-structure/twilight-dash/cli/src/runs/manifest-binding.ts`.

**Modify production:** `apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.ts` (one decoder using existing private owners), `apps/twilight-structure/twilight-dash/eslint.product.mjs` (separate exact helper/shared-contract alias override).

**Create tests:**

- `apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-acceptance.test.ts`: focused unknown-input decoder.
- `apps/twilight-structure/twilight-dash/cli/src/runs/testing/manifest-binding-contract.ts`: shared real-provider semantics and small acceptance/manifest fixture.
- `apps/twilight-structure/twilight-dash/cli/src/runs/manifest-binding.test.ts`: memory and asynchronous boundary cases.
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/manifest-binding.db.test.ts`: actual SQLite and close/reopen/file-edit recovery.

**Modify tests:** `tools/tool-devsync/src/eslint-boundaries.test.ts`: effective exact alias/peer/relative/judge refusal and actual source consumption. Existing Dash/Burokrat graph edge already allowed; no project graph edits. Existing module-index directory prefix includes the new Burokrat test. Never import fixtures from another .test.ts.

**Interfaces:**

```ts
export function decodeWorkflowAcceptance(input: unknown): AcceptanceSnapshot;
export interface ManifestBinding {
  readonly manifest: Manifest;
  readonly binding: ValidatedBinding;
}
export function readManifestBinding(
  runs: Pick<RunStore, 'readManifest'>,
  artifacts: ArtifactStore,
  digest: ManifestDigest,
): Promise<ManifestBinding>;
```

The decoder returns shape-checked descriptor content, not a ValidatedBinding.
Reuse checkJson before cloning, strict ArkType schemas, decodeWorkflowBinding and
listBindingPromptPaths. Validate full mapping before artifact reads in Dash.
Use the exact diagnostics and output immutability in design. Own private recursive
freeze of the cloned manifest is acceptable; exporting a generic helper is not.

The semantic fixture and reconstruction assertions use the existing owners:

```ts
const binding = decodeWorkflowBinding({
  version: 1,
  types: { default: { plan: { class: 'plan' } } },
  classes: { plan: { executor: 'human', prompt: 'prompts/plan.md' } },
});
const checked = checkWorkflowBinding(binding, ['plan']);
const accepted = acceptWorkflowBinding(checked, [
  { path: 'prompts/plan.md', bytes: new Uint8Array([239, 187, 191, 112, 10]) },
]);
expect(decodeWorkflowAcceptance(JSON.parse(canonicalJson(accepted.snapshot)))).toEqual(
  accepted.snapshot,
);
```

In the artifact loop, snapshot originals before a later await; after collecting the
complete per-path sources, compare the owner's full acceptance:

```ts
const bytes = new Uint8Array(await artifacts.readArtifact(reference));
const accepted = acceptWorkflowBinding(checked, sources);
if (canonicalJson(accepted.snapshot) !== manifest.canonicalBinding)
  throw new Error('retained binding acceptance does not match manifest');
```

- [x] 1.1 Read actual owners/callers/tests and capture semantic RED before implementation.
      Decoder tests include a complete small tool/human binding, nested unused-class
      paths, unsupported/absent version, closed envelope/descriptor, invalid SHA/path,
      duplicate/unsorted/missing/extra descriptors, non-JSON/accessor/sparse/decorated
      input and caller detachment/deep freeze. Keep full project-step checks in their
      owner; prove invalid step set/reference coverage refuses before artifact IO.
- [x] 1.2 Implement the minimal decoder and manifest reader. Shared real-provider tests
      cover valid static selection, tool-only no-prompt acceptance, all unused paths,
      distinct paths sharing bytes, repeated identical artifact refs, wrong-metadata
      duplicate after a valid ref, extra undeclared prompt ref, missing/corrupt retained
      bytes, unreadability modeled by failing port with preserved cause, bindingVersion
      mismatch, requested/returned manifest digest mismatch and valid-shape changed
      acceptance content. Do not weaken generic createManifest fixtures/admission.
      Add real SQLite close/reopen recovery after editing original binding/prompt files;
      assert selection remains tied to retained original bytes/digest, including BOM.
      Do not call the file loader from readManifestBinding.
- [x] 1.3 Prove asynchronous snapshot and immutable return behavior with a held real
      artifact read and mutable port replies/buffers. Mutating caller manifest nested
      refs/settings while awaiting must not change selected content. Mutating a prior
      returned prompt buffer during a later await must not change acceptance. Caller
      inputs remain mutable; returned association, manifest nested refs/version map/
      credential refs and accepted settings/prompts are deeply frozen and detached.
      Add exact product override and effective-policy tests, preserving old two-path
      storage allowlist. Use the actual source lint consumer, not policy-array-only tests.
- [x] 1.4 From restored green, inject isolated faults into genuinely new guards and new
      decode/check/accept/read/verify/canonical/snapshot/freeze/policy consumption edges.
      Use otherwise-valid inputs to expose guard removal rather than duplicate backstops;
      diagnostic-code changes may prove classification only. Retain masked trials
      without a proof claim, exact file restoration in finally and restored green.
      Add adjacent Proof comments naming injected fault and observed test. Reused
      unchanged validators need no blanket guard sweep.
- [x] 1.5 Format and run final focused new/neighbor source tests once under source hold,
      with complete before/after source/index/HEAD/status evidence. Neighbor coverage is
      existing Burokrat workflow-binding.test.ts, Dash artifact-store.test.ts and
      sqlite/artifact-store.db.test.ts. Run all four actual devsync suites:
      eslint-boundaries.test.ts, product-constraints.test.ts, workspace-projects.test.ts,
      workspace-targets.test.ts. Use explicit ./source paths and source cwd to avoid
      generated dist discovery. Run the six uncached static targets, scoped OpenSpec
      validation, changed-file format and git diff --check; preserve warnings. Report
      command/raw exit/counts, whole-source evidence and limits in task-1-report.md,
      self-review and explicitly release source hold. Root records results in verify,
      commits with normal hooks, then independently reviews before closing local boxes.
