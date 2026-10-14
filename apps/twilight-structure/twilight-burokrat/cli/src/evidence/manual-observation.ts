import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { hashCanonical } from './content-manifest';
import { inspectManual } from './manual';

/** Wraps the complete Manual verdict with exact committed selection and observation identity. */
export function inspectManualObservation(
  repository: string,
  revision: string,
  policyPath: string,
  reportPath: string,
  evaluatedAt: Date,
) {
  // Proof: accepting symbolic HEAD made the production CLI symbolic-revision assertion fail.
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(revision))
    throw new Error('Manual observation requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: a faulted staged reader made the production CLI selection assertion fail without this guard.
  if (selected.selection.kind !== 'committed')
    throw new Error('Manual observation selection is not committed');
  // Proof: removing exact equality made an annotated tag-object SHA peel to its commit and
  // pass the production CLI tag-object refusal test with current JSON and exit zero.
  if (selected.selection.revision !== revision)
    throw new Error('Manual observation selected revision differs from requested SHA');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const manual = inspectManual(
    root,
    selected.selection.revision,
    policyPath,
    reportPath,
    evaluatedAt,
  );
  // Proof: a faulted inspector revision made the production CLI revision assertion fail without this guard.
  if (manual.revision !== selected.selection.revision)
    throw new Error('Manual observation revision differs from selected candidate');
  const observation = {
    schemaVersion: 1 as const,
    revision: selected.selection.revision,
    // Proof: the production CLI compares this to the selected snapshot; a candidate fault failed it.
    candidate,
    evaluatedAt: evaluatedAt.toISOString(),
    // Proof: dropping selectedProcedureDigest from this complete nested result failed the CLI assertion.
    manual,
    // Proof: changing absent to present failed the production CLI authentication assertion.
    authentication: { kind: 'absent' as const },
    // Proof: changing this to true failed the production CLI certification assertion.
    certifies: false as const,
  };
  // Proof: hashing a partial payload failed the production CLI complete-payload digest assertion.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
