import { hashBytes, hashCanonical } from '../evidence/content-manifest';
import { readCandidateBlob } from '../inventory/read-blob';
import { type CandidateSnapshot, readCandidate } from '../inventory/read-candidate';
import { decodeScenarioJournal } from './scenario-command';
import { deriveScenarioIndex, type ScenarioJournal } from './scenarios';

const JournalPath = 'openspec/scenario-allocations.json';
const MainSpec = /^openspec\/specs\/([a-z][a-z0-9-]*)\/spec\.md$/;
const ChangeSpec = /^openspec\/changes\/([a-z][a-z0-9-]*)\/specs\/([a-z][a-z0-9-]*)\/spec\.md$/;
const Identified = /^\[([A-Z][A-Z0-9-]*-\d{3,})\] (.+)$/;
const FullSha = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

export interface SpecificationsAuthority {
  readonly baseRevision: string;
  readonly bootstrap?: {
    readonly baseRevision: string;
    readonly candidateJournalDigest: string;
    readonly reviewer: string;
    readonly reference: string;
  };
}

export interface SpecificationsReport {
  readonly selectorVersion: 1;
  readonly baseRevision: string;
  readonly baseJournalDigest: string | null;
  readonly candidateJournalDigest: string;
  readonly unidentified: readonly { path: string; title: string }[];
  readonly evidenceDigest: string;
}

function git(repository: string, args: readonly string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) {
    throw new Error(
      `cannot verify specifications base: ${invocation.stderr.toString('utf8').trim()}`,
    );
  }
  return invocation.stdout.toString('utf8').trim();
}

function isAncestor(repository: string, base: string, successor: string): boolean {
  const ancestry = Bun.spawnSync(
    ['git', '-C', repository, 'merge-base', '--is-ancestor', base, successor],
    { env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, stdout: 'pipe', stderr: 'pipe' },
  );
  // Git reserves exit 1 for a proven non-ancestor; any other error is unreadable trusted state.
  if (ancestry.exitCode !== 0 && ancestry.exitCode !== 1) {
    throw new Error(
      `cannot verify specifications ancestry: ${ancestry.stderr.toString('utf8').trim()}`,
    );
  }
  return ancestry.exitCode === 0;
}

function verifiedBase(
  repository: string,
  candidate: CandidateSnapshot,
  pinned: string,
): {
  revision: string;
  head?: string;
} {
  // Proof: the production missing-policy and malformed-SHA tests refuse before Git resolves an
  // ambiguous revision; accepting a symbolic ref would let caller policy move after review.
  if (!FullSha.test(pinned)) throw new Error('specifications baseRevision must be a full Git SHA');
  const resolved = git(repository, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${pinned}^{commit}`,
  ]);
  const selection = candidate.selection;
  if (selection.kind !== 'committed') {
    // Proof: the staged wrong-base production negative refuses external policy drift.
    if (selection.base !== pinned)
      throw new Error('specifications base differs from candidate selection');
    const head = git(repository, ['rev-parse', '--verify', 'HEAD^{commit}']);
    // Proof: the staged selection on an orphan checkout otherwise accepted a pin unrelated to HEAD.
    if (!isAncestor(repository, pinned, head)) {
      throw new Error('specifications base is not a checkout ancestor');
    }
    return { revision: resolved, head };
  } else {
    // Proof: the self-base production negative refuses a candidate-only journal comparison.
    if (selection.revision === pinned)
      throw new Error('specifications base must precede candidate');
    // Proof: the unrelated-base production negative refuses even when both revisions exist.
    if (!isAncestor(repository, pinned, selection.revision))
      throw new Error('specifications base is not a candidate ancestor');
  }
  return { revision: resolved };
}

function readJournal(
  repository: string,
  candidate: CandidateSnapshot,
  label: string,
): {
  journal: ScenarioJournal;
  digest: string;
} {
  const entry = candidate.entries.find((record) => record.path === JournalPath);
  // Proof: the production absent-candidate and absent-base journal negatives refuse rather than
  // treating the missing trusted journal as an empty event list.
  if (entry === undefined) throw new Error(`${label} scenario journal is absent`);
  // Proof: the production symlink-journal negative otherwise reaches JSON decoding and reports
  // malformed text instead of refusing a non-regular selected Git entry.
  if (entry.mode !== '100644' && entry.mode !== '100755') {
    throw new Error(`${label} scenario journal must be a regular blob`);
  }
  const bytes = readCandidateBlob(repository, entry.blob, JournalPath);
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (cause) {
    throw new Error(`${label} scenario journal is unreadable or malformed`, { cause });
  }
  try {
    return { journal: decodeScenarioJournal(input), digest: hashBytes(bytes) };
  } catch (cause) {
    throw new Error(`${label} scenario journal is malformed`, { cause });
  }
}

function canonicalSpecs(
  repository: string,
  candidate: CandidateSnapshot,
): readonly {
  path: string;
  capability: string;
  markdown: string;
  digest: string;
}[] {
  const grouped = new Map<string, { path: string; blob: string; mode: string }[]>();
  for (const entry of candidate.entries) {
    const main = MainSpec.exec(entry.path);
    const change = ChangeSpec.exec(entry.path);
    const capability = main?.[1] ?? change?.[2];
    if (capability === undefined) continue;
    grouped.set(capability, [
      ...(grouped.get(capability) ?? []),
      { path: entry.path, blob: entry.blob, mode: entry.mode },
    ]);
  }
  // Proof: the production empty-inventory negative refuses a candidate with no active specs.
  if (grouped.size === 0) throw new Error('active canonical specification inventory is absent');
  const selected: { path: string; capability: string; markdown: string; digest: string }[] = [];
  for (const [capability, copies] of grouped) {
    for (const copy of copies) {
      if (copy.mode !== '100644' && copy.mode !== '100755') {
        throw new Error(`canonical specification must be a regular blob: ${copy.path}`);
      }
    }
    const distinct = new Set(copies.map((copy) => copy.blob));
    // Identical active copies are one lineage. A different overlay needs a requirement-level
    // merger and cannot be chosen by pathname order.
    // Proof: the conflicting-active-copy production negative refuses instead of silently picking
    // the lexicographically first copy; the archive-copy negative remains allowed.
    if (distinct.size !== 1)
      throw new Error(`conflicting active specification copies: ${capability}`);
    const copy = copies.find((entry) => MainSpec.test(entry.path)) ?? copies[0];
    const bytes = readCandidateBlob(repository, copy.blob, copy.path);
    let markdown: string;
    try {
      markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (cause) {
      throw new Error(`canonical specification is not UTF-8: ${copy.path}`, { cause });
    }
    selected.push({ path: copy.path, capability, markdown, digest: hashBytes(bytes) });
  }
  return selected;
}

function scenarioHeadings(markdown: string): readonly string[] {
  const headings: string[] = [];
  let fence: '`' | '~' | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker !== undefined) {
      const kind = marker.startsWith('`') ? '`' : '~';
      if (fence === undefined) fence = kind;
      else if (fence === kind) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;
    const heading = /^#### Scenario: (.*)$/.exec(line);
    if (heading !== null) headings.push(heading[1]);
  }
  return headings;
}

/** Judges selected immutable journal and active spec blobs against one external reviewed base. */
export function evaluateSpecifications(
  repository: string,
  candidate: CandidateSnapshot,
  authority: SpecificationsAuthority,
  policyDigest: string,
  candidateDigest: string,
): SpecificationsReport {
  const selectedBase = verifiedBase(repository, candidate, authority.baseRevision);
  const baseRevision = selectedBase.revision;
  const base = readCandidate(repository, { kind: 'committed', revision: baseRevision });
  const candidateJournal = readJournal(repository, candidate, 'candidate');
  const baseEntry = base.entries.find((entry) => entry.path === JournalPath);
  let baseJournalDigest: string | null;
  if (baseEntry === undefined) {
    const bootstrap = authority.bootstrap;
    // Proof: the production missing-bootstrap and wrong-digest negatives refuse initial adoption.
    if (
      bootstrap?.baseRevision !== baseRevision ||
      bootstrap.candidateJournalDigest !== candidateJournal.digest
    ) {
      throw new Error(
        'absent base scenario journal requires reviewed bootstrap bound to candidate journal',
      );
    }
    baseJournalDigest = null;
  } else {
    // Proof: the production unexpected-bootstrap negative prevents a bootstrap from bypassing an
    // existing predecessor journal, while deletion/rewrite negatives check exact event prefix.
    if (authority.bootstrap !== undefined)
      throw new Error('bootstrap cannot replace an existing base journal');
    const baseJournal = readJournal(repository, base, 'base');
    baseJournalDigest = baseJournal.digest;
    for (const [position, event] of baseJournal.journal.events.entries()) {
      const successor = candidateJournal.journal.events[position];
      if (
        position >= candidateJournal.journal.events.length ||
        hashCanonical(successor) !== hashCanonical(event)
      ) {
        throw new Error(`scenario journal rewrote or removed base event ${String(position)}`);
      }
    }
  }
  const identities = deriveScenarioIndex(candidateJournal.journal);
  const active = new Map(
    [...identities.values()]
      .filter((identity) => identity.active)
      .map((identity) => [identity.id, identity]),
  );
  const seen = new Set<string>();
  const unidentified: { path: string; title: string }[] = [];
  const specs = canonicalSpecs(repository, candidate);
  for (const spec of specs) {
    const headings = scenarioHeadings(spec.markdown);
    if (headings.length === 0)
      throw new Error(`canonical specification has no scenario headings: ${spec.path}`);
    for (const text of headings) {
      const identified = Identified.exec(text);
      if (identified === null) {
        unidentified.push({ path: spec.path, title: text });
        continue;
      }
      const [id, title] = [identified[1], identified[2]];
      // Proof: production duplicate and unallocated-ID negatives refuse active inventory drift.
      if (seen.has(id)) throw new Error(`duplicate canonical scenario identifier: ${id}`);
      seen.add(id);
      const identity = active.get(id);
      const capability = identity?.source.split('/').at(-2);
      if (identity === undefined || capability !== spec.capability || identity.title !== title) {
        throw new Error(`scenario identifier lacks canonical allocator provenance: ${id}`);
      }
    }
  }
  // Proof: the production removed-heading negative refuses an active journal identity that
  // disappeared from canonical specs, instead of treating it as unrelated migration debt.
  for (const id of active.keys()) {
    if (!seen.has(id))
      throw new Error(`active allocated scenario missing from canonical specs: ${id}`);
  }
  const evidenceDigest = hashCanonical({
    schemaVersion: 1,
    selectorVersion: 1,
    policyDigest,
    candidateDigest,
    baseRevision,
    baseJournalDigest,
    candidateJournalDigest: candidateJournal.digest,
    bootstrap: authority.bootstrap ?? null,
    selected: specs.map(({ path, capability, digest }) => ({ path, capability, digest })),
    unidentified,
  });
  if (
    selectedBase.head !== undefined &&
    git(repository, ['rev-parse', '--verify', 'HEAD^{commit}']) !== selectedBase.head
  ) {
    throw new Error('checkout HEAD changed while judging specifications');
  }
  return {
    selectorVersion: 1,
    baseRevision,
    baseJournalDigest,
    candidateJournalDigest: candidateJournal.digest,
    unidentified,
    evidenceDigest,
  };
}
