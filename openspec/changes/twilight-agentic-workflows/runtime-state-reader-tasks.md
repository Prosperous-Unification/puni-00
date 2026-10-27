# Retained RuntimeState Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for this single-owner task. Root authorizes one implementer, owns metadata/review/commit/publication, and forbids nested agents.

**Goal:** Expose the existing retained full-state decode once while preserving every current target-observation caller.

**Architecture:** One focused `runs/runtime-state.ts` reader takes validated ArtifactRef and returns existing RuntimeState. `readTargetObservation` retains its boundary/target checks and immediately consumes the reader. No general validation facade or delivery types.

**Tech Stack:** Existing TypeScript, shared validation/contracts, ArtifactStore, Bun/Nx.

**Spec:** `specs/twilight/wbs-run-bridge/spec.md` in this change; independently reviewed prerequisite against c42956f335ae98dcfe1ce384b3b8f4a2d65984fb. Source workspace is /home/df/.codex/worktrees/bfde/puni-00, branch feat/agentic-runtime-state-reader. Frozen install and unchanged preparation baseline are recorded separately in verify.md.

## Global constraints

Local source verification and independent review are recorded in verify.md. Aggregate publication checks remain open. No RunStore/history/format/migration changes, new packet contracts, mapping, WBS/client transport, SDK/model/credential/network work. Preserve original checks/errors/order and exact target API. Existing F26–F29 remain moved inherited provenance, not newly certified checks. Structural equivalence plus fresh covering negatives assess extraction/delegation; only new reference detachment and exact import admission receive new fault samples. Do not replay the old mutation campaign. Independent mini-preflight approved this task; source implementation still requires covering tests, decisive P1/P2 evidence and independent code review before publication.

## Task 1: Extract full retained state with immediate target consumption

**Files, relative to repository root:**

1. Create `apps/twilight-structure/twilight-dash/cli/src/runs/runtime-state.ts`.
2. Create `apps/twilight-structure/twilight-dash/cli/src/runs/runtime-state.test.ts`.
3. Modify `apps/twilight-structure/twilight-dash/cli/src/runs/record-preparation.ts` only for extraction/delegation and imports; retain original two snapshot statements and all target checks.
4. Modify `apps/twilight-structure/twilight-dash/cli/src/runs/record-preparation.test.ts` only to cover immediate delegation/reference-target snapshots if existing coverage lacks that exact path; preserve all existing negatives.
5. Modify `apps/twilight-structure/twilight-dash/eslint.product.mjs` with exact reader @wbs/contracts admission and actual record-preparation alias usage after extraction.
6. Modify `tools/tool-devsync/src/eslint-boundaries.test.ts` to match those exact consumers and retain neighboring-file denial.

Read-only regression owners: `runs/build-claim-request.ts:94`, `runs/claim-history.ts:63,112`, `runs/testing/execution-contract.ts:55`, their existing tests; public schema `libs/wbs/domain/contracts/src/http/runtime-command-shapes.ts:216`; shared `RuntimeState` at runtime-command-values.ts:116; existing `runs/runtime-receipt.ts:14` is unchanged and not generalized.

**Interface:** `readRuntimeStateArtifact(artifacts: ArtifactStore, evidence: ArtifactRef): Promise<RuntimeState>`. Caller passes already validated ArtifactRef; the new reader does not add a second shape-validation facade. It snapshots that typed reference before await. External unknown/reference-shape validation stays at existing boundaries, including readTargetObservation's `parseOrThrow(ArtifactRefCodec, evidence)` and ArtifactStore retention. The new snapshot is a concrete public async-alias boundary, not a new interpretation of evidence.

- [x] Record existing exact non-comment bodies and errors for readTargetObservation lines43–87. Keep the original first statements at that caller:

```ts
const reference = structuredClone(parseOrThrow(ArtifactRefCodec, evidence));
const expected = structuredClone(target);
const state = await readRuntimeStateArtifact(artifacts, reference);
// Original scope/work/step/code predicates and TargetObservationCodec projection follow unchanged.
```

- [x] Write tests before extraction using existing `admitExecution`, `createMemoryStores`, `FixtureClock` and artifact fixtures, not new RunStore fixtures. Positive fixture returns `setup.state`, `setup.preparationInput.stateEvidence` and `setup.preparationInput` from `admitExecution(stores)`; it retains the existing wire observation. For a full-inventory positive retain a schema-valid state with exact ordinary/runtime claim entries using existing RuntimeState shape, then compare the entire value. Claim inventory is not a live lease proof.
- [x] Run the exact test leaf from the Dash cli directory: `bun test --preload ../../../../tools/test/scratch/preload.ts src/runs/runtime-state.test.ts`. Missing-export/import errors are setup only. Once the production reader is loadable with the unchanged moved checks, observe the new alias-boundary negative fail while it temporarily uses `const reference = evidence`; then add reference detachment to make the intended assertion pass. This temporary test-development state is not committed. Do not remove inherited media/schema/integrity guards to manufacture RED.

```ts
const evidence = { ...setup.preparationInput.stateEvidence };
let markRead: () => void = () => {
  throw new Error('read barrier absent');
};
let releaseRead: () => void = () => {
  throw new Error('release barrier absent');
};
const started = new Promise<void>((resolve) => {
  markRead = resolve;
});
const gate = new Promise<void>((resolve) => {
  releaseRead = resolve;
});
const artifacts: ArtifactStore = {
  ...stores.artifacts,
  async readArtifact(reference) {
    const bytes = await stores.artifacts.readArtifact(reference);
    markRead();
    await gate;
    return bytes;
  },
};
const pending = readRuntimeStateArtifact(artifacts, evidence);
await started;
evidence.digest = artifactDigest('f'.repeat(64));
releaseRead();
await doesNotReject(async () => {
  deepEqual(await pending, setup.state);
}, 'retained state reader must preserve its pre-IO reference');
```

The test must release its owned barrier in finally and close stores even if assertions fail. Held IO ends after actual original bytes were read, so removing only the new reference clone makes unchanged integrity validation reject the alias-mutated metadata. Record this as lost snapshot/availability behavior, not forbidden accepted bytes. `artifactDigest` is the existing typed test constructor; no production cast is added.

- [x] Extract the exact old decoding stage into the new focused file. Imports: public `readRuntimeState`, `validateSchema`, type RuntimeState; local verifyArtifactContent; type ArtifactStore/ArtifactRef. No aggregate record-codecs runtime import is needed. The implementation body is:

```ts
export async function readRuntimeStateArtifact(
  artifacts: ArtifactStore,
  evidence: ArtifactRef,
): Promise<RuntimeState> {
  const reference = structuredClone(evidence);
  if (reference.mediaType !== 'application/json')
    throw new Error('runtime state requires application/json');
  const content = new Uint8Array(await artifacts.readArtifact(reference));
  verifyArtifactContent(content, reference);
  const wire: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
  const checked = await validateSchema(readRuntimeState.responses[0].schema, wire);
  if (checked.issues !== undefined) throw new Error('runtime state schema differs');
  return checked.value;
}
```

Move original adjacent F26–F29 provenance with the same checks and identify their prior owner/path; no fresh credit is claimed. The new `structuredClone` reference line gets a new Proof only after its own actual watched fault/restoration. Content copying, media predicate, fatal decoder, schema call, error strings and order remain equivalent to the original stage; reference shape parse and target clone remain at the old caller. New helper calls can only use already validated retained references. Neither helper claims authenticated origin/freshness.

- [x] Cover all moved-check behaviors without deleting those guards: wrong media; a storage wrapper returns otherwise valid bytes inconsistent with digest/length; fatal invalid UTF8 embedded in an otherwise parseable JSON string; malformed JSON; public-schema version2 with valid otherwise target fields; missing retained reference; unreadable dependency with exact same Error identity. Assert the existing real recordPreparation path leaves run/history unchanged for invalid state/target. This is fresh regression coverage, not blanket recertification of moved guards.
- [x] Add current target snapshot regression: hold the same actual read, mutate caller's target scope/work/step/code and original reference after invocation, release, and assert the original exact TargetObservation or original expected rejection. Original first two snapshots stay installed and are not faulted for new credit. Existing target missing/duplicate/null-code/scope tests retain exact predicates/errors.
- [x] Run green leaves from Dash cli: `bun test --preload ../../../../tools/test/scratch/preload.ts src/runs/runtime-state.test.ts src/runs/record-preparation.test.ts src/runs/claim-history.test.ts src/runs/build-claim-request.test.ts`. Run the existing SQLite claim-request/preparation wrappers only if a new shared-path integration concern appears; no durability claim is made by memory tests.
- [x] New-boundary proof P1: from green remove only new reference clone, run `runtime-state.test.ts -t 'retained state reader snapshots its reference before IO'`, observe the intended assertion reject instead of return original state, restore exact bytes and rerun. All moved old checks remain installed.
- [x] New import-scope proof P2: from green broaden only the newly added runtime-state.ts WBS alias admission to a neighboring unapproved file, leaving existing rules/checks intact. Run the new exact consumer/neighbor case `runtime state reader has exact WBS contract admission` in tools/tool-devsync/src/eslint-boundaries.test.ts; its neighbor-denial assertion must fail against the actual calculated ESLint config. Restore the exact filename admission and rerun. If another retained policy independently masks the widened rule, record the mask and retain the fresh covering assertion without claiming new decisive denial proof. Do not delete inherited product boundaries to obtain credit.
- [x] Run the exact policy owner: from repository root `bun test tools/tool-devsync/src/eslint-boundaries.test.ts`; inspect installed prerequisites before invocation rather than fetching dependencies. Run `bunx nx run twilight-dash:typecheck` and `bunx nx run twilight-dash:lint` only in root-authorized workspace with dependency baseline. Keep absent tools as explicit blocks. Compare preserved non-comment old checks/target body with pinned source and record any necessary import-only differences.
- [x] Self-review six-path diff, alias/ref snapshot order, evidence claims and source hashes; report to root. Root owns commits, independent review, exact-SHA gate and CI. No source implementation or command in this checklist has been performed by this drafting task.

No task-pair concurrency exists: one source owner, one six-file task. The exact policy pair is shared with the complete extension and must be serialized. The full extension consumes this primitive only if this separate packet is accepted/implemented; it does not retroactively authorize any delivery contract.

## Approved preflight clarifications

Use deepEqual/doesNotReject from node:assert/strict for the named P1 observation above. Credit only the actual emitted alias-boundary failure with old checks intact. P2 uses real ESLint lintText with zero fatal errors and a genuinely unapproved peer controlled by the new exact allowance. A config-array comparison, parser failure or independently masked denial is not decisive P2 evidence; unresolved proof blocks completion. Preserve preparation Burokrat admission, remove its unused WBS admission, and update both existing expectation rows plus the new functional reader/neighbor case. Add the direct readTargetObservation target/reference snapshot test; the older recordPreparation outer snapshot test does not cover that boundary.

No RunStore/history/version/format4/mapping decision is part of this task. Root may review the separate full outcome-delivery proposal concurrently; it supplies no source authorization here. Do not mutate inherited persistent guards or shared dependency files for proofs.

## Publication

- [ ] Root records a normal checkpoint/push, integrates the reviewed unit with its parent runtime packet, completes the exact-candidate host gate and applicable CI, and verifies normal main merge plus actual-merge CI. Source acceptance alone does not satisfy this publication step.
