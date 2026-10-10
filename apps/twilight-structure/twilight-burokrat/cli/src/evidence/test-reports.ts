import { readCandidateBlob } from '../inventory/read-blob';
import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { inspectBrowserBundle } from './browser';
import { compareCanonicalText, hashBytes, hashCanonical } from './content-manifest';

type BrowserMode = 'ordinary' | 'packaged' | 'portable';

interface ReportCase {
  caseId: string;
  config: string;
  project: string;
  file: string;
  titlePath: string[];
  status: 'passed' | 'failed' | 'skipped';
  source: { mode: '100644' | '100755'; contentDigest: string };
}

/**
 * Inspect a Browser publication as a source-bound diagnostic observation.
 * The digest identifies normalized claims; no runner authentication or coverage follows from it.
 */
export function inspectTestReports(
  repository: string,
  revision: string,
  policyPath: string,
  mode: BrowserMode,
) {
  // Proof: the production non-full-revision CLI negative loses its named refusal if this guard
  // is removed; a symbolic ref cannot stand in for an explicitly selected committed identity.
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(revision))
    throw new Error('test report selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: a test-only reader fault changed only the real committed reader's returned selection
  // to staged; removing this invariant changed its named production CLI refusal.
  if (selected.selection.kind !== 'committed')
    throw new Error('test report selection is not committed');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const browser = inspectBrowserBundle(root, selected.selection.revision, policyPath, mode);
  // Proof: the production mismatched-candidate dependency fault loses this refusal if comparison
  // is removed; the Browser inspector and selected source snapshot must describe one candidate.
  if (browser.candidate !== candidate)
    throw new Error('test report Browser candidate differs from selected source');
  const entries = new Map(selected.entries.map((entry) => [entry.path, entry]));
  const cases: ReportCase[] = browser.observedCases.map((browserCase) => {
    const entry = entries.get(browserCase.file);
    // Proof: missing committed case with a working-tree file, and a committed symlink, both
    // refused in the production CLI. Removing this check made the named source refusal fail.
    if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
      throw new Error(
        `test report case source is not a regular committed blob: ${browserCase.file}`,
      );
    const caseId = hashCanonical([
      browserCase.config,
      browserCase.project,
      browserCase.file,
      browserCase.titlePath,
    ]);
    const source = readCandidateBlob(root, entry.blob, browserCase.file);
    return {
      caseId,
      config: browserCase.config,
      project: browserCase.project,
      file: browserCase.file,
      titlePath: browserCase.titlePath,
      status: browserCase.status,
      source: { mode: entry.mode, contentDigest: hashBytes(source) },
    };
  });
  // Proof: removing this sort made the production reordered-publication digest assertion fail.
  cases.sort((left, right) =>
    compareCanonicalText(
      JSON.stringify([left.config, left.project, left.file, left.titlePath]),
      JSON.stringify([right.config, right.project, right.file, right.titlePath]),
    ),
  );
  const observation = {
    schemaVersion: 1 as const,
    revision: selected.selection.revision,
    candidate,
    policyDigest: browser.policyDigest,
    mode,
    invocationId: browser.invocationId,
    cases,
    // Proof: changing this absent marker to a claimed marker failed the production all-passing
    // noncertifying observation assertion.
    authentication: { kind: 'absent' as const },
    // Proof: changing this false value to true failed the same production assertion.
    certifies: false as const,
  };
  // Proof: omitting outcomes or selected source tuples from this payload digest separately
  // failed the production status-sensitivity and exact-payload assertions.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
