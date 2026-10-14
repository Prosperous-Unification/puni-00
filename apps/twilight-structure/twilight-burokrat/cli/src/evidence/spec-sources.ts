import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { parseRequirements, type SpecInput } from '../rules/spec-parser';
import { readActiveSpecifications } from '../rules/spec-sources';
import { compareCanonicalText, hashCanonical } from './content-manifest';

/**
 * Inventories parsed active sources without selecting or classifying their requirement lineage.
 * Refuses invalid committed selection, unreadable blobs and malformed requirement fragments.
 * This diagnostic supplies no accepted-predecessor, coverage or source-mutation authority.
 */
export function inspectSpecSources(repository: string, revision: string) {
  // Proof: removing this guard let symbolic HEAD lose the full-SHA refusal in TEST-AXES-056.
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(revision))
    throw new Error('spec source selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  // Proof: substituting staged reads failed TEST-AXES-055's committed identity assertion.
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: removing this guard let the staged-reader fault lose its named TEST-AXES-056 refusal.
  if (selected.selection.kind !== 'committed')
    throw new Error('spec source selection is not committed');
  // Proof: disabling exact equality made a real annotated tag-object SHA pass the
  // production CLI negative and emit the peeled commit inventory with exit zero.
  if (selected.selection.revision !== revision)
    throw new Error('spec source selected revision differs from requested SHA');
  const inventory = inventorySpecSources(readActiveSpecifications(root, selected));
  const observation = {
    schemaVersion: 1 as const,
    // Proof: replacing revision or candidate with zeros failed TEST-AXES-055's exact identity checks.
    revision: selected.selection.revision,
    candidate: hashCanonical(selected),
    ...inventory,
    // Proof: promoting certifies to true failed TEST-AXES-055's noncertifying assertion.
    certifies: false as const,
  };
  // Proof: hashing only revision failed TEST-AXES-055's independently recomputed payload digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}

/** Parses a complete active input set in canonical source order, without resolving operations. */
export function inventorySpecSources(inputs: readonly SpecInput[]) {
  // Proof: removing this guard made the absent-inventory TEST-AXES-056 CLI call exit zero.
  if (inputs.length === 0) throw new Error('active canonical specification inventory is absent');
  // Proof: removing source sorting changed TEST-AXES-055's reversed-reader CLI observation.
  const sorted = [...inputs].sort((left, right) => compareCanonicalText(left.path, right.path));
  const parsed = sorted.map(parseRequirements);
  const requirements = parsed.flatMap((source) => source.requirements);
  const operations = parsed
    .flatMap((source) => source.operations)
    .map(({ kind, requirement, from, fragmentDigest }) => ({
      kind,
      ...requirement,
      ...(from === undefined ? {} : { from }),
      fragmentDigest,
    }));
  const compare = (
    left: { source: string; title: string; digest: string },
    right: { source: string; title: string; digest: string },
  ) =>
    compareCanonicalText(left.source, right.source) ||
    compareCanonicalText(left.title, right.title) ||
    compareCanonicalText(left.digest, right.digest);
  requirements.sort(compare);
  operations.sort(
    (left, right) =>
      compare(left, right) ||
      compareCanonicalText(left.kind, right.kind) ||
      compareCanonicalText(left.from ?? '', right.from ?? '') ||
      compareCanonicalText(left.fragmentDigest, right.fragmentDigest),
  );
  return {
    inputs: sorted.map(({ path, digest }) => ({ path, digest })),
    requirements,
    operations,
  };
}
