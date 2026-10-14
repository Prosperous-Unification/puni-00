import { decodePerformanceCases } from '@shared/test-evidence';
import { parseOrThrow, type } from '@shared/validation';

import { RelativePath } from '../contracts/records';
import { readSelectedBlob } from '../inventory/read-blob';
import {
  type CandidateSnapshot,
  readCandidate,
  resolveCandidateRoot,
} from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { compareCanonicalText, hashBytes, hashCanonical } from './content-manifest';

const Digest = type(/^[0-9a-f]{64}$/);
const Revision = type(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);
const Pin = type({ path: RelativePath, digest: Digest }).onUndeclaredKey('reject');
const Empty = type({ kind: "'reviewed-empty'" }).onUndeclaredKey('reject');
const Committed = type({ kind: "'committed'", path: RelativePath, digest: Digest }).onUndeclaredKey(
  'reject',
);
// Proof: accepting unknown external keys made [TEST-AXES-078]'s production CLI assertion fail
// with success JSON; only the declared version-1 authority shape is accepted.
const Authority = type({
  schemaVersion: '1',
  revision: Revision,
  candidate: Digest,
  scope: type({
    projectRoot: RelativePath,
    projectManifest: Pin,
    declaration: Pin,
    config: Pin,
    project: 'string>=1',
    fixtures: RelativePath.array(),
  }).onUndeclaredKey('reject'),
  // Proof: widening Manual to the committed variant made [TEST-AXES-078] accept an unsupported
  // procedure claim and fail its named production CLI refusal.
  manual: Empty,
  conformance: Empty.or(Committed),
  architecture: Empty.or(Committed),
}).onUndeclaredKey('reject');

const ConformanceTarget = type({
  executor: "'nx:run-commands'",
  'cache?': 'false',
  'inputs?': type(["'default'", "'^production'"]).or(
    type(["'default'", "'^production'", "'{workspaceRoot}/apps/wbs/be-01/drizzle'"]),
  ),
  options: type({ command: 'string', cwd: 'string', forwardAllArgs: 'false' }).onUndeclaredKey(
    'reject',
  ),
}).onUndeclaredKey('reject');

function decodeJson(bytes: Uint8Array, subject: string): unknown {
  let source: string;
  try {
    // Proof: [TEST-AXES-079] commits 0xff inside an otherwise valid JSON string with all pins
    // updated; removing fatal decoding made the production CLI emit success facts (exit zero).
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`${subject} is not UTF-8`, { cause });
  }
  try {
    // Proof: replacing parse with an empty record made [TEST-AXES-078]'s malformed external
    // authority test lose its named JSON refusal and fail on later schema errors.
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new Error(`${subject} JSON is malformed`, { cause });
  }
}

function sourceFromCandidate(repository: string, selected: CandidateSnapshot, path: string) {
  const entry = selected.entries.find((candidateEntry) => candidateEntry.path === path);
  // Proof: disabling this guard changed [TEST-AXES-079]'s missing/nonregular fixture refusal
  // to a later selected-blob error despite a working-tree replacement.
  if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
    throw new Error(`level facts source is not a selected regular blob: ${path}`);
  let bytes: Uint8Array;
  // Proof: deleting the selected blob in [TEST-AXES-079] while leaving a working replacement
  // makes the production CLI refuse instead of silently reading that replacement.
  try {
    bytes = readSelectedBlob(repository, selected.entries, entry.blob, path);
  } catch (cause) {
    throw new Error(`level facts cannot read selected blob: ${path}`, { cause });
  }
  return { path, mode: entry.mode, contentDigest: hashBytes(bytes), bytes };
}

/**
 * Inspect one externally reviewed Performance fixture scope and bounded Conformance selection.
 * Candidate source bytes come only from exact committed Git objects.
 * This facts-only observation is unauthenticated and never classifies a test or awards coverage.
 */
export function inspectLevelFacts(repository: string, revision: string, authorityPath: string) {
  // Proof: disabling this guard changed [TEST-AXES-080]'s symbolic-HEAD refusal to the later
  // selected-revision refusal in the production CLI test.
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision))
    throw new Error('level facts require a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  if (selected.selection.kind !== 'committed')
    throw new Error('level facts selection is not committed');
  // Proof: [TEST-AXES-080] uses a real annotated tag object; removing this comparison will
  // replace the named selected-revision refusal with a later authority mismatch.
  if (selected.selection.revision !== revision)
    throw new Error('level facts selected revision differs from requested SHA');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const artifact = readExternalArtifact(root, authorityPath, 'level facts authority');
  const authority = parseOrThrow(Authority, decodeJson(artifact.bytes, 'level facts authority'));
  // Proof: disabling this comparison made [TEST-AXES-078] accept an altered candidate pin.
  if (authority.revision !== revision || authority.candidate !== candidate)
    throw new Error('level facts authority candidate differs from selected candidate');
  const { scope } = authority;
  // Proof: disabling this check changed [TEST-AXES-078]'s named manifest-path refusal.
  if (scope.projectManifest.path !== `${scope.projectRoot}/project.json`)
    throw new Error('level facts project manifest differs from scope root');
  // Proof: disabling this check changed [TEST-AXES-078]'s duplicate/empty fixture refusal.
  if (scope.fixtures.length === 0 || new Set(scope.fixtures).size !== scope.fixtures.length)
    throw new Error('level facts scope requires unique nonempty fixtures');
  const within = (path: string) => path.startsWith(`${scope.projectRoot}/`);
  // Proof: disabling this check lost [TEST-AXES-078]'s outside-scope named refusal.
  if (![scope.declaration.path, scope.config.path, ...scope.fixtures].every(within))
    throw new Error('level facts source escapes declared project scope');
  const paths = [
    scope.projectManifest.path,
    scope.declaration.path,
    scope.config.path,
    ...scope.fixtures,
  ];
  // Proof: disabling this check changed [TEST-AXES-078]'s conflicting-source refusal.
  if (new Set(paths).size !== paths.length)
    throw new Error('level facts scope contains conflicting source paths');
  const sources = paths.map((path) => sourceFromCandidate(root, selected, path));
  const source = (path: string) => {
    const selectedSource = sources.find((entry) => entry.path === path);
    if (selectedSource === undefined)
      throw new Error(`level facts selected source is missing: ${path}`);
    return selectedSource;
  };
  for (const [label, pin] of [
    ['project manifest', scope.projectManifest],
    ['declaration', scope.declaration],
    ['config', scope.config],
  ] as const) {
    // Proof: disabling this comparison made [TEST-AXES-078] emit facts for an altered config
    // pin instead of naming the digest mismatch.
    if (source(pin.path).contentDigest !== pin.digest)
      throw new Error(`level facts ${label} digest differs from selected blob`);
  }
  const manifest = decodeJson(
    source(scope.projectManifest.path).bytes,
    'level facts project manifest',
  );
  // Proof: [TEST-AXES-079] commits missing and array-valued targets; without the array guard
  // the production CLI emitted success facts for the array manifest.
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest) ||
    !('targets' in manifest) ||
    typeof manifest.targets !== 'object' ||
    manifest.targets === null ||
    Array.isArray(manifest.targets)
  )
    throw new Error('level facts project manifest is malformed');
  // Proof: [TEST-AXES-078] commits a real Conformance target under a reviewed-empty assertion;
  // disabling this check made the production CLI issue successful facts for that contradiction.
  if (
    authority.conformance.kind === 'reviewed-empty' &&
    Object.hasOwn(manifest.targets, 'test:conformance')
  )
    throw new Error('level facts Conformance reviewed-empty contradicts committed target');
  const conformance = (() => {
    if (authority.conformance.kind === 'reviewed-empty') return authority.conformance;
    // Proof: removing either pin comparison made [TEST-AXES-082] emit facts for a foreign
    // path or digest; both production CLI assertions failed.
    if (
      authority.conformance.path !== scope.projectManifest.path ||
      authority.conformance.digest !== scope.projectManifest.digest
    )
      throw new Error('level facts Conformance pin differs from project manifest');
    const target =
      'test:conformance' in manifest.targets ? manifest.targets['test:conformance'] : undefined;
    // Proof: [TEST-AXES-082] failed when executor/cache/inputs/forwarding schemas were widened,
    // either closed-key rule or the required-shape check was removed, or cwd/root checks
    // were disabled. Invalid envelopes emitted facts or lost the named target refusal.
    if (
      !ConformanceTarget.allows(target) ||
      target.options.cwd !== scope.projectRoot ||
      (target.inputs?.length === 3 && scope.projectRoot !== 'libs/wbs/adapters/store-sqlite')
    )
      throw new Error('level facts Conformance target is unsupported');
    // Proof: restoring bare-filter parsing and literal binding let [TEST-AXES-083]'s
    // nested-decoy case emit incomplete facts. Removing prefix normalization failed
    // [TEST-AXES-081]'s successful literal-source inspection assertion.
    const pathPattern =
      '\\./(?:[A-Za-z0-9_][A-Za-z0-9._-]*/)*[A-Za-z0-9_][A-Za-z0-9._-]*\\.test\\.ts';
    const commandPattern = new RegExp(
      `^bun test (${pathPattern}(?: ${pathPattern})*) --timeout=[1-9][0-9]*(?![\\s\\S])`,
    );
    const command = commandPattern.exec(target.options.command);
    // Proof: disabling this guard lost [TEST-AXES-083]'s named command refusal; removing
    // the true end constraint let a trailing timeout suffix and a newline emit facts.
    if (command === null) throw new Error('level facts Conformance command is unsupported');
    const selectors = target.options.command.slice(
      'bun test '.length,
      target.options.command.lastIndexOf(' --timeout='),
    );
    // Proof: removing this sort reversed the two committed overlaps and failed [TEST-AXES-081].
    const files = selectors
      .split(' ')
      .map((path) => `${scope.projectRoot}/${path.slice(2)}`)
      .sort(compareCanonicalText);
    // Proof: removing this comparison let duplicate selectors emit facts in [TEST-AXES-083].
    if (new Set(files).size !== files.length)
      throw new Error('level facts Conformance command is unsupported');
    // Complete selection is validated before intersection; shared Performance sources appear once.
    // Proof: omitting selected-source reads made [TEST-AXES-083]'s outside-intersection
    // missing/symlink/unreadable refusal fail; removing deduplication duplicated the shared
    // source tuples and failed [TEST-AXES-081].
    for (const path of files) {
      if (!sources.some((entry) => entry.path === path))
        sources.push(sourceFromCandidate(root, selected, path));
    }
    return {
      ...authority.conformance,
      // Proof: returning all selected files failed [TEST-AXES-081]'s exact intersection.
      files: files.filter((path) => scope.fixtures.includes(path)),
    };
  })();
  const declaration = decodePerformanceCases(
    decodeJson(source(scope.declaration.path).bytes, 'level facts declaration'),
  );
  // Proof: disabling this comparison made [TEST-AXES-079] accept a declaration for webkit
  // under a chromium authority and fail its named CLI assertion.
  if (declaration.config !== scope.config.path || declaration.project !== scope.project)
    throw new Error('level facts Performance declaration differs from authority scope');
  const declaredFixtures = [
    ...new Set(declaration.cases.map((performanceCase) => performanceCase.fixture)),
  ].sort(compareCanonicalText);
  const reviewedFixtures = [...scope.fixtures].sort(compareCanonicalText);
  // Proof: disabling this guard let [TEST-AXES-078]'s omitted authority fixture pass.
  if (JSON.stringify(declaredFixtures) !== JSON.stringify(reviewedFixtures))
    throw new Error('level facts Performance fixtures differ from complete declaration');
  // Proof: disabling this guard made [TEST-AXES-078] accept unparsed committed Architecture.
  if (authority.architecture.kind !== 'reviewed-empty')
    throw new Error('level facts committed Architecture source is unsupported in this slice');
  const observation = {
    schemaVersion: 1 as const,
    revision,
    candidate,
    authorityDigest: hashBytes(artifact.bytes),
    scope: { ...scope, fixtures: reviewedFixtures },
    memberships: {
      manual: authority.manual,
      conformance,
      architecture: authority.architecture,
      performance: reviewedFixtures,
    },
    sources: sources
      .map(({ path, mode, contentDigest }) => ({ path, mode, contentDigest }))
      .sort((left, right) => compareCanonicalText(left.path, right.path)),
    // Proof: changing this marker to self-asserted failed [TEST-AXES-077]'s production CLI
    // assertion that no independent authentication exists.
    authentication: { kind: 'absent' as const },
    // Proof: changing this marker to true failed [TEST-AXES-077]'s noncertifying CLI assertion.
    certifies: false as const,
  };
  // Proof: replacing this payload with an empty object failed [TEST-AXES-077]'s independent
  // production CLI digest assertion.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
