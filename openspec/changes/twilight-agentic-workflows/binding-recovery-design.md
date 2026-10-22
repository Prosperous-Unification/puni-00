# Retained workflow binding recovery design

Implements [intent](binding-recovery-intent.md) and the retained-recovery requirement
in [workflow binding](specs/twilight/workflow-binding/spec.md). Names are defined in
[CONTEXT](../../../CONTEXT.md); ordered implementation is in
[binding recovery tasks](binding-recovery-tasks.md).

## Owner boundaries

Burokrat retains ownership of binding shape, project coverage, prompt paths, original
byte acceptance and canonical acceptance identity. Add only this public entry point
to its existing workflow-binding contract:

```ts
export function decodeWorkflowAcceptance(input: unknown): AcceptanceSnapshot;
```

It checks plain acyclic JSON before cloning, strict schemaVersion1 envelope and
closed descriptor shapes, lowercase64-hex SHA256, nested binding through
decodeWorkflowBinding, and exactly sorted unique descriptor paths for every declared
class, including unused classes. It returns its detached deeply frozen snapshot.
Present unsupported schemaVersion uses unsupported_version; other envelope/hash
shape errors use invalid_binding; descriptor-set/order errors use
invalid_prompt_sources. Existing nested binding diagnostics remain unchanged.
projectSteps must be a string array here; full nonempty/unique/syntax/coverage
validation is the separate existing checkWorkflowBinding phase. Decoding alone
never establishes prompt byte acceptance. Reuse private checkJson/parseAt/freezeValue,
existing RelativePath and listBindingPromptPaths. No JSON helper export, module
extraction, checker move or dependency cycle is needed.

Dash owns this application association:

```ts
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

Read the manifest by digest, clone and decode it before the first artifact await,
require its digest equals the requested digest, decode canonicalBinding as unknown
acceptance, require bindingVersion equals its schemaVersion, and call
checkWorkflowBinding before reading any artifacts. Generic Manifest/retainManifest
contracts and fixtures remain unchanged.

## Byte reconstruction and multiplicity

For each manifest prompt reference, require its digest names at least one acceptance
descriptor, read it through the actual ArtifactStore contract, and snapshot returned
bytes immediately. Verify every listed reference even when its digest repeats: a
duplicate with wrong length/mediaType must not be skipped. Only the first reference
for a digest contributes sources; expand those bytes to every descriptor path with
that digest. Distinct prompt paths may legitimately have identical content.
No digest-uniqueness restriction or implicit path-to-array-order mapping is allowed.
An extra artifact with an undeclared digest refuses. Missing declared content is
rejected by existing acceptWorkflowBinding exact-source coverage, without redundant
parallel coverage guards.

Verify all toolPolicies through existing verifyArtifacts; this establishes bytes,
not policy authority. Use existing acceptWorkflowBinding on the checked binding and
reconstructed original byte sources. Compare canonicalJson(accepted.snapshot) with
manifest.canonicalBinding in full. The original BOM and newline bytes determine
hashes; never hash decoded text or substitute an acceptance digest for Manifest.digest.
Do not add another independent raw artifact validator: the ArtifactStore contract
already requires copied bytes with digest/length/metadata validation, and the real
providers own those checks. The final acceptance comparison independently detects
prompt bodies inconsistent with the retained descriptors.

Return a frozen association containing a deeply frozen own cloned manifest and
the existing deeply frozen accepted binding. Do not freeze caller-owned objects
or buffers. Clone manifest before artifact awaits; copy each observed prompt buffer
before a later await. All missing/unreadable/corrupt state throws with its cause
preserved; no cwd/filesystem fallback, default prompt, repair or swallowed failure.

## Scope, alternatives and proof

Composing the existing decode/check/accept phases is smaller than adding an async
artifact-resolver framework inside Burokrat. Exporting raw JSON/freezing helpers or
moving the checker would widen the public API and create unnecessary cycle risk.
Keep the decoder beside its owned schema; add a separate focused decoder test file
rather than growing the existing849-line binding suite.

Use one shared Dash conformance contract for real memory/SQLite providers, a SQLite
close/reopen case and one real filesystem edit case. Boundary fakes may test
snapshot-before-await or broken dependency behavior; they do not replace provider
conformance. Extend only exact helper/shared-contract Burokrat alias exceptions.
Keep the old two storage exceptions unchanged and test peer/relative/judge refusal
plus actual lint source consumption.

R5 covers genuinely new guards and newly consumed dependencies with observed
production-path negatives and exact restoration. Reused existing guards are not
blanket recertified. Retain every failed/masked/setup trial honestly. Focused final
tests and uncached relevant static checks suffice here; no repeat of the prior
512-test history suite, full Burokrat package, backend, browser or host gate without
a named new concern. This is a dependency of later durable execution, not a driver.
