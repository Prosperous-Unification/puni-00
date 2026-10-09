import { isDeepStrictEqual } from 'node:util';

/** A scenario's append-only provenance event. The first event reserves its ID forever. */
export type ScenarioEvent =
  | {
      readonly kind: 'import' | 'allocate';
      readonly id: string;
      readonly source: string;
      readonly title: string;
    }
  | {
      readonly kind: 'split';
      readonly id: string;
      readonly source: string;
      readonly title: string;
      readonly predecessor: string;
    }
  | {
      readonly kind: 'rename';
      readonly id: string;
      readonly priorTitle: string;
      readonly title: string;
      readonly priorRevision: string;
    }
  | { readonly kind: 'retire'; readonly id: string };

export interface ScenarioJournal {
  readonly schemaVersion: 1;
  readonly events: readonly ScenarioEvent[];
}

export interface ScenarioIdentity {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly predecessor?: string;
  readonly active: boolean;
}

export interface ScenarioProposal {
  readonly specMarkdown: string;
  readonly events: readonly ScenarioEvent[];
  readonly journal: ScenarioJournal;
}

/**
 * Refuses a candidate journal that removes or rewrites any event in a trusted earlier journal.
 * The caller supplies the earlier Git revision; this check cannot establish that revision's trust.
 */
export function assertScenarioJournalExtends(
  candidate: ScenarioJournal,
  prior: ScenarioJournal,
): void {
  deriveScenarioIndex(prior);
  deriveScenarioIndex(candidate);
  // Proof: deleting this branch lets the test remove a retirement tombstone and reuse its ID.
  if (candidate.events.length < prior.events.length)
    throw new Error('scenario journal removed trusted prior events');
  for (let position = 0; position < prior.events.length; position += 1) {
    // Proof: dropping this comparison lets the test rewrite EXAMPLE-001's prior title.
    if (!isDeepStrictEqual(candidate.events[position], prior.events[position])) {
      throw new Error(`scenario journal rewrote trusted prior event ${String(position)}`);
    }
  }
}

const heading = /^#### Scenario: (.*)$/gm;
const identifiedTitle = /^\[([A-Z][A-Z0-9-]*-\d{3})\] (.+)$/;

function capabilityOf(source: string): string {
  const parts = source.split('/');
  // Proof: the invalid-source test removes `spec.md`; without this guard a root-level string
  // derives the wrong namespace and allocates an ID unrelated to its capability.
  if (parts.at(-1) !== 'spec.md' || parts.length < 3 || !source.startsWith('openspec/')) {
    throw new Error(`scenario source must be an OpenSpec spec.md path: ${source}`);
  }
  const capability = parts.at(-2);
  if (capability === undefined || !/^[a-z][a-z0-9-]*$/.test(capability)) {
    throw new Error(`scenario source has no capability: ${source}`);
  }
  return capability;
}

function prefixOf(source: string): string {
  return capabilityOf(source).toUpperCase();
}

function headingsOf(specMarkdown: string): readonly { title: string; id?: string }[] {
  const titles = [...specMarkdown.matchAll(heading)].map((match) => match[1]);
  if (titles.length === 0) throw new Error('specification has no scenario headings');
  return titles.map((title) => {
    const match = identifiedTitle.exec(title);
    return match === null ? { title } : { id: match[1], title: match[2] };
  });
}

/** Derives the sole mutable view from the append-only journal; retired IDs remain present. */
export function deriveScenarioIndex(
  journal: ScenarioJournal,
): ReadonlyMap<string, ScenarioIdentity> {
  const index = new Map<string, ScenarioIdentity>();
  for (const event of journal.events) {
    if (event.kind === 'import' || event.kind === 'allocate' || event.kind === 'split') {
      // Proof: deleting this guard lets the retired-ID test reissue EXAMPLE-001.
      if (index.has(event.id))
        throw new Error(`scenario identifier was already reserved: ${event.id}`);
      const expectedPrefix = `${prefixOf(event.source)}-`;
      if (
        !event.id.startsWith(expectedPrefix) ||
        !identifiedTitle.test(`[${event.id}] ${event.title}`)
      ) {
        throw new Error(`scenario identifier does not match ${event.source}: ${event.id}`);
      }
      if (event.kind === 'split') {
        const predecessor = index.get(event.predecessor);
        // Proof: deleting this guard lets the unknown-predecessor test allocate a split from
        // EXAMPLE-999, which was never issued.
        if (
          predecessor === undefined ||
          !predecessor.active ||
          predecessor.source !== event.source
        ) {
          throw new Error(`unknown or inactive scenario predecessor: ${event.predecessor}`);
        }
      }
      index.set(event.id, {
        id: event.id,
        source: event.source,
        title: event.title,
        ...(event.kind === 'split' ? { predecessor: event.predecessor } : {}),
        active: true,
      });
      continue;
    }
    const current = index.get(event.id);
    if (!current?.active) throw new Error(`unknown or inactive scenario: ${event.id}`);
    if (event.kind === 'rename') {
      if (
        event.priorRevision.length === 0 ||
        event.title.length === 0 ||
        event.priorTitle !== current.title
      ) {
        throw new Error(`scenario rename requires exact prior title and revision: ${event.id}`);
      }
      index.set(event.id, { ...current, title: event.title });
    } else {
      index.set(event.id, { ...current, active: false });
    }
  }
  return index;
}

/** Imports hand-written IDs unchanged before provenance enforcement. */
export function importScenarioIdentifiers(
  journal: ScenarioJournal,
  source: string,
  specMarkdown: string,
): ScenarioJournal {
  const index = deriveScenarioIndex(journal);
  const events: ScenarioEvent[] = [];
  for (const scenario of headingsOf(specMarkdown)) {
    if (scenario.id === undefined) continue;
    if (index.has(scenario.id)) {
      const current = index.get(scenario.id);
      if (current?.source !== source || current.title !== scenario.title || !current.active) {
        throw new Error(`scenario identifier already reserved elsewhere: ${scenario.id}`);
      }
      continue;
    }
    events.push({ kind: 'import', id: scenario.id, source, title: scenario.title });
  }
  const imported = { schemaVersion: 1, events: [...journal.events, ...events] } as const;
  deriveScenarioIndex(imported);
  return imported;
}

/** Fails when an identified heading has no current allocation record. Legacy unlabelled headings remain visible migration debt. */
export function validateScenarioProvenance(
  journal: ScenarioJournal,
  source: string,
  specMarkdown: string,
): readonly string[] {
  const index = deriveScenarioIndex(journal);
  const unidentified: string[] = [];
  for (const scenario of headingsOf(specMarkdown)) {
    if (scenario.id === undefined) {
      unidentified.push(scenario.title);
      continue;
    }
    const current = index.get(scenario.id);
    // Proof: replacing this refusal with `continue` made the production CLI negative exit 0
    // instead of 1 for EXAMPLE-001 without allocator provenance (2026-10-09).
    if (
      current === undefined ||
      !current.active ||
      current.source !== source ||
      current.title !== scenario.title
    ) {
      throw new Error(`scenario identifier lacks current allocator provenance: ${scenario.id}`);
    }
  }
  return unidentified;
}

/** Proposes deterministic identifiers and an updated journal without writing either artifact. */
export function proposeScenarioAllocation(
  journal: ScenarioJournal,
  source: string,
  specMarkdown: string,
  predecessors: Readonly<Partial<Record<string, string>>> = {},
): ScenarioProposal {
  const index = deriveScenarioIndex(journal);
  const prefix = prefixOf(source);
  const numbered = [...index.keys()]
    .filter((id) => id.startsWith(`${prefix}-`))
    .map((id) => Number(id.slice(prefix.length + 1)));
  let ordinal = Math.max(0, ...numbered);
  const events: ScenarioEvent[] = [];
  const lines = specMarkdown.split('\n').map((line) => {
    if (!line.startsWith('#### Scenario: ')) return line;
    const title = line.slice('#### Scenario: '.length);
    if (identifiedTitle.test(title)) return line;
    ordinal += 1;
    const id = `${prefix}-${String(ordinal).padStart(3, '0')}`;
    const predecessor = predecessors[title];
    const event: ScenarioEvent =
      predecessor === undefined
        ? { kind: 'allocate', id, source, title }
        : { kind: 'split', id, source, title, predecessor };
    events.push(event);
    return `#### Scenario: [${id}] ${title}`;
  });
  if (events.length === 0) throw new Error(`no unidentified scenarios in ${source}`);
  const proposal = { schemaVersion: 1, events: [...journal.events, ...events] } as const;
  deriveScenarioIndex(proposal);
  const updated = lines.join('\n');
  validateScenarioProvenance(proposal, source, updated);
  return { specMarkdown: updated, events, journal: proposal };
}
