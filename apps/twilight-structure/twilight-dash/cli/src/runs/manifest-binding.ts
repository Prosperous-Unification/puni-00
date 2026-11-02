import {
  acceptWorkflowBinding,
  canonicalJson,
  checkWorkflowBinding,
  decodeWorkflowAcceptance,
  type PromptSource,
  type ValidatedBinding,
} from '@twilight-burokrat/contracts';

import type { ArtifactStore } from './artifact-store';
import { decodeManifest } from './record-codecs';
import type { Manifest, ManifestDigest } from './records';
import type { RunStore } from './run-store';
import { verifyArtifacts } from './verify-artifacts';

/** Retained manifest identity associated with accepted original bytes; grants no execution authority. */
export interface ManifestBinding {
  readonly manifest: Manifest;
  readonly binding: ValidatedBinding;
}

function freezeManifestValue(value: unknown): void {
  if (typeof value === 'object' && value !== null) {
    // Proof: F31 removed traversal; `snapshots mutable manifest` could mutate nested returned references.
    for (const child of Object.values(value)) freezeManifestValue(child);
    // Proof: F46 removed each node freeze; `snapshots mutable manifest` could mutate the returned manifest.
    Object.freeze(value);
  }
}

/**
 * Recovers static binding acceptance exclusively from retained manifest and artifact owners.
 * Snapshots the manifest before artifact IO and each observed prompt before another await.
 * Returns a detached deeply frozen association, without freezing port-owned replies.
 * @throws For missing, unreadable or inconsistent retained state; owner failures retain their causes.
 */
export async function readManifestBinding(
  runs: Pick<RunStore, 'readManifest'>,
  artifacts: ArtifactStore,
  digest: ManifestDigest,
): Promise<ManifestBinding> {
  // Proof: F16 bypassed decoding and admitted corrupt returned identity; F17 removed cloning and
  // caller mutation broke `snapshots mutable manifest`. F33 broke read delegation and valid tool recovery failed.
  const manifest = decodeManifest(structuredClone(await runs.readManifest(digest)));
  // Proof: F18 removed request matching and admitted another manifest in `refuses a valid returned manifest for a different requested digest`.
  if (manifest.digest !== digest)
    throw new Error('returned manifest digest does not match request');
  const content: unknown = JSON.parse(manifest.canonicalBinding);
  // Proof: F43 bypassed decoding and accepted invalid nested settings with valid retained bytes.
  const snapshot = decodeWorkflowAcceptance(content);
  // Proof: F44 removed version matching and accepted the mismatch in `refuses bindingVersion mismatch with retained bytes`.
  if (manifest.bindingVersion !== snapshot.schemaVersion)
    throw new Error('manifest binding version does not match acceptance');
  // Proof: F45 bypassed static checking and accepted an empty step set with otherwise valid retained bytes.
  const checked = checkWorkflowBinding(snapshot.binding, snapshot.projectSteps);
  const sources: PromptSource[] = [];
  const expanded = new Set<string>();
  for (const reference of manifest.prompts) {
    // Proof: F40 ignored digest matching; `maps distinct prompt digests` failed on valid retained content.
    const descriptors = snapshot.prompts.filter((prompt) => prompt.sha256 === reference.digest);
    // Proof: F22 removed this guard and admitted extra retained content in `refuses an undeclared retained prompt digest`.
    if (descriptors.length === 0) throw new Error('undeclared prompt artifact in manifest');
    // Proof: F23 skipped the owner read and admitted missing bytes. F41 removed copying; both held-buffer
    // tests failed. F42 used subtype slice; the Buffer test failed after caller mutation during policy IO.
    const bytes = new Uint8Array(await artifacts.readArtifact(reference));
    // Proof: F24 skipped duplicate reads and admitted wrong metadata after a valid ref; F39 removed
    // source deduplication and valid repeated refs failed `verifies repeated references`.
    if (expanded.has(reference.digest)) continue;
    expanded.add(reference.digest);
    // Proof: F25 expanded only one shared-digest path; `recovers static selections` lost an unused path and failed.
    for (const descriptor of descriptors) sources.push({ path: descriptor.path, bytes });
  }
  // Proof: F27 bypassed policy reads and admitted missing policy bytes in `verifies tool policy bytes`.
  await verifyArtifacts(artifacts, manifest.toolPolicies);
  // Proof: F28 bypassed acceptance and admitted absent declared sources in `refuses absent declared sources`.
  const accepted = acceptWorkflowBinding(checked, sources);
  // Proof: F29 removed full comparison and admitted changed descriptor content; F34 broke canonical
  // delegation and valid tool-only recovery failed. No prompt-text rehash substitutes for these bytes.
  if (canonicalJson(accepted.snapshot) !== manifest.canonicalBinding)
    throw new Error('retained binding acceptance does not match manifest');
  // Proof: F30 skipped manifest freezing; `snapshots mutable manifest` could mutate its returned manifest.
  freezeManifestValue(manifest);
  // Proof: F32 removed association freezing; `snapshots mutable manifest` could replace the returned association.
  return Object.freeze({ manifest, binding: accepted });
}
